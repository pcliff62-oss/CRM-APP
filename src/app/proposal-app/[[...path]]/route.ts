import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Serves the built proposal app assets from packages/hytech-proposal-app-launched/dist
// Example:
//   GET /proposal-app           -> dist/index.html
//   GET /proposal-app/assets/*  -> dist/assets/*
//   GET /proposal-app/sw.js     -> dist/sw.js

const DIST_ROOT = path.join(process.cwd(), "packages", "proposal-app-launched", "dist");

function contentTypeFor(p: string) {
	const ext = p.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "html": return "text/html; charset=utf-8";
		case "js": return "text/javascript; charset=utf-8";
		case "css": return "text/css; charset=utf-8";
		case "map": return "application/json; charset=utf-8";
		case "json": return "application/json; charset=utf-8";
		case "png": return "image/png";
		case "jpg":
		case "jpeg": return "image/jpeg";
		case "gif": return "image/gif";
		case "svg": return "image/svg+xml";
		case "ico": return "image/x-icon";
		case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		case "zip": return "application/zip";
		case "txt": return "text/plain; charset=utf-8";
		default: return "application/octet-stream";
	}
}

async function readFileSafe(p: string) {
	try {
		return await fs.readFile(p);
	} catch {
		return null;
	}
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
	const parts = params.path || [];
	// Default to index.html
	let rel = parts.length === 0 ? "index.html" : parts.join("/");

	// Prevent path traversal
	if (rel.includes("..")) {
		return new NextResponse("Not found", { status: 404 });
	}

	const abs = path.join(DIST_ROOT, rel);
	let data = await readFileSafe(abs);

	// Fallback to index.html for client-side routes
	if (!data && !rel.includes(".")) {
		const idx = path.join(DIST_ROOT, "index.html");
		data = await readFileSafe(idx);
		if (data) {
			let html = data.toString("utf8");
			// Safety: if the app was built without base, prefix asset URLs so they load under /proposal-app
			html = html
				.replace(/src="\/assets\//g, 'src="/proposal-app/assets/')
				.replace(/href="\/assets\//g, 'href="/proposal-app/assets/')
				.replace(/href="\/manifest\.json"/g, 'href="/proposal-app/manifest.json"')
				.replace(/href="\/hytech-logo\.svg"/g, 'href="/proposal-app/hytech-logo.svg"')
				.replace(/href="\/sw\.js"/g, 'href="/proposal-app/sw.js"');
			return new NextResponse(html, { status: 200, headers: { "Content-Type": contentTypeFor("index.html"), "Cache-Control": "no-store" } });
		}
	}

	if (!data) return new NextResponse("Not found", { status: 404 });

	// If serving index.html directly, apply the same asset URL rewrite
	if (rel === "index.html") {
		let html = data.toString("utf8");
		html = html
			.replace(/src="\/assets\//g, 'src="/proposal-app/assets/')
			.replace(/href="\/assets\//g, 'href="/proposal-app/assets/')
			.replace(/href="\/manifest\.json"/g, 'href="/proposal-app/manifest.json"')
			.replace(/href="\/hytech-logo\.svg"/g, 'href="/proposal-app/hytech-logo.svg"')
			.replace(/href="\/sw\.js"/g, 'href="/proposal-app/sw.js"');
		return new NextResponse(html, { status: 200, headers: { "Content-Type": contentTypeFor("index.html"), "Cache-Control": "no-store" } });
	}

	return new NextResponse(new Uint8Array(data), { status: 200, headers: { "Content-Type": contentTypeFor(rel), "Cache-Control": rel.endsWith(".html") ? "no-store" : "public, max-age=31536000, immutable" } });
}

export const dynamic = "force-dynamic";

