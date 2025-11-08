import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { jwtVerify, getSignSecret } from "@/lib/jwt";
import path from "path";
import { promises as fs } from "fs";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  let payload: any;
  try { 
    payload = jwtVerify(token, getSignSecret()); 
  } catch (e: any) { 
    return NextResponse.json({ error: e?.message || "Invalid token" }, { status: 400 }); 
  }

  const proposal = await prisma.proposal.findUnique({ 
    where: { id: String(payload.id || "") },
    include: {
      lead: {
        include: {
          contact: true
        }
      }
    }
  });
  
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const body = await req.json();
  const { htmlContent } = body || {};
  
  if (!htmlContent) {
    return NextResponse.json({ error: "Missing HTML content" }, { status: 400 });
  }

  try {
    const tenantId = proposal.tenantId;
    const leadId = proposal.leadId || undefined;
    const contactId = proposal.lead?.contactId || undefined;
    const customerName = (proposal.lead?.contact?.name || '').trim() || 'Customer';
    
    // Sanitize filename
    const sanitize = (s: string) => s.replace(/[^\w\-\s\.]/g, '').replace(/\s+/g, ' ').trim();
    const baseTitle = `${sanitize(customerName)} - Signed Proposal`;
    const baseNameNoExt = sanitize(baseTitle);
    
    // Ensure unique filename
    let attemptName = `${baseNameNoExt}.html`;
    let n = 2;
    while (true) {
      const existing = await prisma.file.findFirst({ 
        where: { 
          tenantId, 
          contactId: contactId || undefined, 
          folder: 'Proposals', 
          name: attemptName 
        } 
      });
      if (!existing) break;
      attemptName = `${baseNameNoExt} ${n}.html`;
      n += 1;
      if (n > 200) break; // safety guard
    }

    // Save HTML file to local storage
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', tenantId);
    await fs.mkdir(uploadDir, { recursive: true });
    const destPath = path.join(uploadDir, attemptName);
    
    // Create a complete HTML document
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitize(customerName)} - Signed Proposal</title>
  <style>
    body { 
      font-family: 'Times New Roman', serif; 
      max-width: 8.5in; 
      margin: 0 auto; 
      padding: 0.5in; 
    }
    @media print {
      @page { size: 8.5in 11in; margin: 0.5in; }
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
    
    await fs.writeFile(destPath, fullHtml);
    const url = `/uploads/${tenantId}/${attemptName}`;

    // Create file record in database
    const fileRec = await prisma.file.create({
      data: {
        tenantId,
        contactId: contactId || undefined,
        leadId: leadId || undefined,
        category: 'documents',
        folder: 'Proposals',
        name: attemptName,
        path: url,
        mime: 'text/html',
        size: Buffer.byteLength(fullHtml, 'utf8'),
      }
    });

    // Parse approved price from the saved HTML and persist on the lead
    try {
      // Look for <span id="final-total-investment" ...>25,805.00</span>
      const m = String(htmlContent).match(/id=["']final-total-investment["'][^>]*>([^<]+)/i);
      const text = (m && m[1] ? m[1] : '').trim();
      const parsed = Number(text.replace(/[^\d.\-]/g, ''));
      if (leadId && isFinite(parsed) && parsed > 0) {
        const existing = await prisma.lead.findUnique({ where: { id: leadId } });
        await prisma.lead.update({ 
          where: { id: leadId }, 
          data: { 
            contractPrice: parsed,
            stage: existing?.stage === 'APPROVED' ? undefined as any : 'APPROVED'
          } as any
        });
        // Revalidate pipeline and customer pages so totals and banner update
        try {
          revalidatePath('/leads');
          revalidatePath('/customers');
          if (contactId) revalidatePath(`/customers/${contactId}`);
        } catch {}
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      fileId: fileRec.id,
      url,
      name: attemptName
    });
    
  } catch (error: any) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ 
      error: error?.message || "Failed to save proposal" 
    }, { status: 500 });
  }
}
