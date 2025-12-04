import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentTenantId } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// Max upload size (5 MB) and allowed mime prefixes/extensions
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_PREFIX = ['image/', 'application/pdf'];
const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sanitizeDocType(t: string): string {
  const allowed = ['workers_comp','liability','w9','other'];
  const norm = t.toLowerCase().replace(/[^a-z0-9_\-]/g,'');
  return allowed.includes(norm) ? norm : 'other';
}

// Upload new document (multipart) optionally with 'expires' (YYYY-MM-DD)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const tenantId = await getCurrentTenantId(req);
  if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized', code:'UNAUTHORIZED' }, { status:401 });
  const id = params.id;
  const user = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!user) return NextResponse.json({ ok:false, error:'User not found', code:'NOT_FOUND' }, { status:404 });

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ ok:false, error:'Expected multipart/form-data', code:'VALIDATION' }, { status:400 });
  }
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const typeRaw = String(formData.get('type')||'other');
  const expiresRaw = formData.get('expires');
  let expires: string | null = null;
  if (typeof expiresRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)) {
    expires = expiresRaw;
  }
  if (!file) return NextResponse.json({ ok:false, error:'File required', code:'VALIDATION' }, { status:400 });
  const docType = sanitizeDocType(typeRaw);
  // Basic validations
  const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
  const mime = (file as any).type || '';
  if (!ALLOWED_EXT.includes(fileExt) && !ALLOWED_MIME_PREFIX.some(p=> mime.startsWith(p))) {
    return NextResponse.json({ ok:false, error:'Unsupported file type', code:'VALIDATION' }, { status:400 });
  }
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ ok:false, error:`File too large (max 5MB)`, code:'VALIDATION' }, { status:400 });
  }
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'users', id);
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  const buf = Buffer.from(arrayBuffer);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const targetPath = path.join(uploadsDir, safeName);
  await fs.promises.writeFile(targetPath, buf as any);
  const relPath = `/uploads/users/${id}/${safeName}`;
  let docs: any[] = [];
  try { docs = user.docsJson ? JSON.parse(user.docsJson) : []; } catch { docs = []; }
  // Build map to ensure one per type while keeping existing other types
  const byType: Record<string, any> = {};
  for (const d of docs) {
    if (!byType[d.type]) byType[d.type] = d;
  }
  byType[docType] = { type: docType, path: relPath, name: safeName, expires };
  // Reconstruct list in stable category order
  const order = ['workers_comp','liability','w9','other'];
  docs = order.filter(t => byType[t]).map(t => byType[t]);
  let updateError: string | undefined;
  try {
    await prisma.user.update({ where:{ id }, data: { docsJson: JSON.stringify(docs) } });
    console.log('[docs.POST] updated docsJson', { userId: id, types: docs.map(d=>d.type) });
  } catch (err:any) {
    updateError = err?.message || String(err);
    console.warn('Prisma update docsJson failed, attempting raw fallback', updateError);
    try {
      await prisma.$executeRawUnsafe('UPDATE "User" SET docsJson = ? WHERE id = ?', JSON.stringify(docs), id);
    } catch (rawErr:any) {
      console.error('Raw fallback failed', rawErr?.message);
      return NextResponse.json({ ok:false, error: rawErr?.message || 'Persist failed', code:'SERVER_ERROR', updateError }, { status:500 });
    }
  }
  // Re-read persisted state to confirm; retry once if empty
  let persisted: any[] = [];
  let debug: any = { attempts: [] };
  async function readPersisted(tag:string){
    try {
      const refreshed = await prisma.user.findUnique({ where:{ id } });
      let arr: any[] = [];
      if (refreshed && 'docsJson' in refreshed) {
        try { arr = refreshed.docsJson ? JSON.parse((refreshed as any).docsJson) : []; } catch {}
      } else {
        // Prisma client may be outdated; use raw select
        try {
          const rows: any = await prisma.$queryRawUnsafe('SELECT docsJson FROM "User" WHERE id = ?', id);
          if (Array.isArray(rows) && rows[0] && rows[0].docsJson) {
            try { arr = JSON.parse(rows[0].docsJson); } catch {}
          }
        } catch (e:any) {
          debug.rawSelectError = e?.message;
        }
      }
      debug.attempts.push({ tag, count: arr.length, types: arr.map((d:any)=>d.type) });
      return arr;
    } catch (e:any) {
      debug.attempts.push({ tag, error: e?.message });
      return [];
    }
  }
  persisted = await readPersisted('initial');
  if (persisted.length === 0 && docs.length) {
    // Retry update using updateMany (id + optimistic tenantId match) then raw if still empty
    try {
      await prisma.user.updateMany({ where:{ id }, data:{ docsJson: JSON.stringify(docs) } });
      debug.retryUpdateMany = true;
    } catch(e:any) { debug.retryUpdateManyError = e?.message; }
    persisted = await readPersisted('afterUpdateMany');
    if (persisted.length === 0 && docs.length) {
      try {
        await prisma.$executeRawUnsafe('UPDATE "User" SET docsJson = ? WHERE id = ?', JSON.stringify(docs), id);
        debug.retryRaw = true;
      } catch(e:any){ debug.retryRawError = e?.message; }
      persisted = await readPersisted('afterRaw');
    }
  }
  return NextResponse.json({ ok:true, item: { type: docType, path: relPath, name: safeName, expires }, items: docs, persistedCount: persisted.length, persistedTypes: persisted.map(d=>d.type), updateError, debug });
  } catch (e:any) {
    console.error('Upload doc failed', e);
    return NextResponse.json({ ok:false, error: e?.message||'Upload failed', code:'SERVER_ERROR' }, { status:500 });
  }
}

// Update expiration date for a specific document type (JSON body { type, expires })
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized', code:'UNAUTHORIZED' }, { status:401 });
    const id = params.id;
    const user = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) return NextResponse.json({ ok:false, error:'User not found', code:'NOT_FOUND' }, { status:404 });
    const body = await req.json().catch(()=>({})) as any;
    const typeRaw = String(body.type||'').trim().toLowerCase();
    const docType = sanitizeDocType(typeRaw);
    let expiresRaw = String(body.expires||'').trim();
    // Allow clearing expiration if empty
    if (expiresRaw === '') {
    let docsArr: any[] = []; try { docsArr = user.docsJson ? JSON.parse(user.docsJson) : []; } catch {}
    console.log('[docs.PATCH clear] before', { userId: id, requested: docType, existing: docsArr.map(d=>d.type) });
      let updatedClear = false;
      docsArr = docsArr.map(d => d.type === docType ? ({ ...d, expires: null }) : d);
      updatedClear = docsArr.some(d => d.type===docType);
      if (!updatedClear) return NextResponse.json({ ok:false, error:'Document type not found', code:'NOT_FOUND' }, { status:404 });
      try { await prisma.user.update({ where:{ id }, data: { docsJson: JSON.stringify(docsArr) } }); }
      catch (err:any) {
        try { await prisma.$executeRawUnsafe('UPDATE "User" SET docsJson = ? WHERE id = ?', JSON.stringify(docsArr), id); }
        catch (rawErr:any) { return NextResponse.json({ ok:false, error: rawErr?.message||'Persist failed', code:'SERVER_ERROR' }, { status:500 }); }
      }
      return NextResponse.json({ ok:true, items: docsArr });
    }
    // Normalize if full ISO provided
    if (/^\d{4}-\d{2}-\d{2}T/.test(expiresRaw)) expiresRaw = expiresRaw.slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)) return NextResponse.json({ ok:false, error:'Invalid expires format (YYYY-MM-DD)', code:'VALIDATION' }, { status:400 });
  let docs: any[] = []; try { docs = user.docsJson ? JSON.parse(user.docsJson) : []; } catch {}
  console.log('[docs.PATCH set] before', { userId: id, requested: docType, existing: docs.map(d=>d.type) });
  // Normalize types in existing docs to ensure matching
  docs = docs.map(d => ({ ...d, type: String(d.type||'').toLowerCase().trim() }));
  let updated = false;
  docs = docs.map(d => d.type === docType ? ({ ...d, expires: expiresRaw }) : d);
  updated = docs.some(d => d.type === docType);
    if (!updated) {
      const foundTypes = docs.map(d=>d.type).filter(Boolean);
      console.warn('PATCH expiration doc type not found', { requested: docType, foundTypes });
      return NextResponse.json({ ok:false, error:'Document type not found', code:'NOT_FOUND', foundTypes }, { status:404 });
    }
    try { await prisma.user.update({ where:{ id }, data: { docsJson: JSON.stringify(docs) } }); }
    catch (err:any) {
      console.warn('PATCH docs fallback raw', err?.message);
      try { await prisma.$executeRawUnsafe('UPDATE "User" SET docsJson = ? WHERE id = ?', JSON.stringify(docs), id); }
      catch (rawErr:any) { return NextResponse.json({ ok:false, error: rawErr?.message||'Persist failed', code:'SERVER_ERROR' }, { status:500 }); }
    }
    return NextResponse.json({ ok:true, items: docs });
  } catch (e:any) {
    console.error('Update doc expiration failed', e);
    return NextResponse.json({ ok:false, error: e?.message||'Server error', code:'SERVER_ERROR' }, { status:500 });
  }
}

// Fetch current documents (persisted) for a user
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ ok:false, error:'Unauthorized', code:'UNAUTHORIZED' }, { status:401 });
    const id = params.id;
    const user = await prisma.user.findFirst({ where:{ id, tenantId } });
    if (!user) return NextResponse.json({ ok:false, error:'User not found', code:'NOT_FOUND' }, { status:404 });
    let docs: any[] = []; try { docs = user.docsJson ? JSON.parse(user.docsJson) : []; } catch {}
    return NextResponse.json({ ok:true, items: docs });
  } catch (e:any) {
    console.error('[docs.GET] failed', e);
    return NextResponse.json({ ok:false, error:e?.message||'Server error', code:'SERVER_ERROR' }, { status:500 });
  }
}
