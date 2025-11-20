import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const type = String(form.get('type') || 'other').replace(/[^a-zA-Z0-9_-]/g,'');
    if (!(file instanceof File)) return NextResponse.json({ ok:false, error:'No file' }, { status:400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dir = path.join(process.cwd(), 'public', 'uploads', 'sales', params.id);
    await fs.promises.mkdir(dir, { recursive: true });
    const name = `${type}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const full = path.join(dir, name);
    await fs.promises.writeFile(full, bytes);
    const publicPath = `/uploads/sales/${params.id}/${name}`;
    return NextResponse.json({ ok:true, item: { path: publicPath, type, name: file.name } });
  } catch (e:any) {
    console.error('POST /api/sales/[id]/docs error', e);
    return NextResponse.json({ ok:false, error: e?.message||String(e) }, { status: 500 });
  }
}
