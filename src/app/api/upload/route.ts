import { NextRequest, NextResponse } from "next/server";
import path from 'path';
import fs from 'fs';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simple local upload handler (demo only):
 * - Accepts multipart/form-data
 * - Field name: file
 * - Optional folder field (defaults to 'misc') under public/uploads/<folder>
 * - Returns { ok, item: { path, name, size, mime } }
 */
export async function POST(req: NextRequest) {
	try {
		const form = await req.formData();
		const file = form.get('file');
		const folderRaw = String(form.get('folder') || 'misc').replace(/[^a-zA-Z0-9_-]/g,'');
		if (!(file instanceof File)) {
			return NextResponse.json({ ok:false, error:'No file provided' }, { status:400 });
		}
		const bytes = Buffer.from(await file.arrayBuffer());
		const uploadRoot = path.join(process.cwd(), 'public', 'uploads');
		const targetDir = path.join(uploadRoot, folderRaw || 'misc');
		await fs.promises.mkdir(targetDir, { recursive: true });
		const safeName = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
		const fullPath = path.join(targetDir, safeName);
		await fs.promises.writeFile(fullPath, new Uint8Array(bytes));
		const publicPath = `/uploads/${folderRaw}/${safeName}`;
		return NextResponse.json({ ok:true, item: { path: publicPath, name: file.name, size: bytes.length, mime: file.type } });
	} catch (e:any) {
		console.error('Upload error', e);
		return NextResponse.json({ ok:false, error: e?.message||String(e) }, { status:500 });
	}
}

