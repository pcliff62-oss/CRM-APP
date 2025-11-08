import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import prisma from "@/lib/db";

// Optional mailer via SMTP. If env not set, log and succeed.
async function sendMail(toList: string[], subject: string, text: string, html?: string) {
	const host = process.env.SMTP_HOST;
	const user = process.env.SMTP_USER;
	const pass = process.env.SMTP_PASS;
	const from = process.env.SMTP_FROM || user || "no-reply@hytech.local";
	if (!host || !user || !pass) {
		console.log("[send-to-customer] SMTP not configured; would send:", { toList, subject, text });
		return { ok: true, id: "noop" } as const;
	}
	const nodemailer = await import("nodemailer");
	const transporter = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: false, auth: { user, pass } });
	const info = await transporter.sendMail({ from, to: toList.join(","), subject, text, html });
	return { ok: true, id: info.messageId } as const;
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { emails, signUrl, leadId } = body || {};
		if (!signUrl) return NextResponse.json({ error: "Missing signUrl" }, { status: 400 });
		const toList: string[] = String(emails || "")
			.split(/[,;\s]+/)
			.map((s: string) => s.trim())
			.filter(Boolean);
		if (toList.length === 0) return NextResponse.json({ error: "Missing emails" }, { status: 400 });

		const subject = "Your HyTech Proposal";
		const text = `Hello,\n\nYour proposal is ready to review and accept here:\n${signUrl}\n\nThank you,\nHyTech Roofing`;
		await sendMail(toList, subject, text, `<p>Hello,</p><p>Your proposal is ready to review and accept here:</p><p><a href=\"${signUrl}\">${signUrl}</a></p><p>Thank you,<br/>HyTech Roofing</p>`);

		if (leadId) {
			try { await prisma.lead.update({ where: { id: String(leadId) }, data: { stage: "PROSPECT" } }); } catch {}
		}

		return NextResponse.json({ ok: true });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
	}
}


