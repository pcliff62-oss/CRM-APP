import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentTenantId } from "@/lib/auth";
import { jwtSign, getSignSecret } from "@/lib/jwt";

// Dev helper: create a proposal for contact named exactly "fattty Clifford" with all options pre-selected
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId(req);
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 401 });

    // Find contact by name, create if missing
    let contact = await prisma.contact.findFirst({ where: { tenantId, name: "fattty Clifford" } });
    if (!contact) {
      contact = await prisma.contact.create({ data: { tenantId, name: "fattty Clifford", email: "fattty@example.com", phone: "555-0100" } });
    }

    // Ensure a property exists (minimal) for nicer prefill; optional
    let property = await prisma.property.findFirst({ where: { tenantId, contactId: contact.id } });
    if (!property) {
      property = await prisma.property.create({
        data: {
          tenantId,
          contactId: contact.id,
          address1: "1 Test Lane",
          city: "Yarmouth Port",
          state: "MA",
          postal: "02675",
        },
      });
    }

    // Ensure or create a lead for this contact
    let lead = await prisma.lead.findFirst({ where: { tenantId, contactId: contact.id }, orderBy: { createdAt: "desc" } });
    if (!lead) {
      lead = await prisma.lead.create({ data: { tenantId, contactId: contact.id, propertyId: property?.id ?? null, title: contact.name, stage: "LEAD" } });
    }

    // Build a snapshot with all options selected across domains
    const todayISO = new Date().toISOString().slice(0, 10);
    const snapshot: any = {
      proposalId: undefined,
      company: {
        name: "HyTech Roofing Solutions",
        address: "714A Route 6-A Yarmouth Port, MA 02675",
        phone: "(508) 362-4333",
        email: "office@hytechroofing.com",
        hic: "123456",
        csl: "654321",
        taxRate: 0,
      },
      customer: {
        name: contact.name,
        tel: contact.phone || "",
        cell: contact.phone || "",
        email: contact.email || "",
        street: property?.address1 || "",
        city: property?.city || "",
        state: property?.state || "",
        zip: property?.postal || "",
        providedOn: todayISO,
      },
      measure: {
        roofSquares: 30,
        flatRoofSquares: 5,
        wastePct: 10,
        feetRakes: 180,
        feetEaves: 180,
        feetRidge: 80,
        feetHips: 60,
        feetValleys: 40,
        feetFlashing: 50,
        pipeFlangesSmall: 3,
        pipeFlangesLarge: 1,
        vents636: 2,
        vents634: 1,
      },
      workDomain: { roofing: true, siding: true, decking: true, windowsAndDoors: true },
      selectedWork: {
        asphalt: true,
        davinci: true,
        cedar: true,
        rubber: true,
        sidingCategory: "synthetic",
        sidingCategories: ["synthetic", "vinyl", "clapBoard", "cedarShake"],
      },
      scope: {
        notes: "All options selected for testing purposes.",
        asphalt: {
          areas: "Main house and attached garage",
          plywoodCondition: "inspectRenail",
          syntheticUnderlayment: true,
          starterStrips: true,
          ridgeVent: true,
          hipRidgeCaps: true,
          pipeFlashings: true,
          dripEdgeType: "aluminum_8",
          dripEdgeColor: "white",
          rakeDripEdgeType: "aluminum_8",
          rakeDripEdgeColor: "white",
          iceAreas: { eaves3: true, valleys: true, pipesVents: true, stepFlash: true, chimney: true, skylights: true, lowPitch: true, solarAreas: true, fullCoverage: false },
          cleanup: true,
        },
        davinci: {
          areas: "All steep-slope sections",
          productType: "shake",
          plywoodCondition: "inspectRenail",
          ridgeVent: true,
          hipRidgeCaps: true,
          pipeFlashings: true,
          dripEdgeType: "aluminum_8",
          dripEdgeColor: "white",
          rakeDripEdgeType: "aluminum_8",
          rakeDripEdgeColor: "white",
          pipeFlange: { aluminum: true },
          roofFanVents: { blackAluminum: true },
          cleanup: true,
          iceWaterFull: true,
        },
        cedar: {
          areas: "All steep-slope sections",
          plywoodCondition: "inspectRenail",
          cedarBreather: true,
          ridgeVent: true,
          cedarRidgeBoards: true,
          pipeFlashings: true,
          dripEdgeType: "aluminum_8",
          dripEdgeColor: "white",
          rakeDripEdgeType: "aluminum_8",
          rakeDripEdgeColor: "white",
          cleanup: true,
          iceAreas: { eaves3: true, valleys: true, pipesVents: true, stepFlash: true, chimney: true, skylights: true, lowPitch: true, solarAreas: true, fullCoverage: false },
        },
        rubber: {
          areas: "Rear low-slope section",
          plywoodCondition: "inspectRenail",
          fiberboard: true,
          aluminumDripEdge: true,
          seamSplice: true,
          seamCoverTape: true,
          pipeBoots: true,
          curbSkylights: true,
          cornerFlashings: true,
          flashing12: true,
          cleanup: true,
        },
        siding: {
          typar: true,
          vycorTape: true,
          stainlessStaples: true,
          dripCaps: true,
          azekBlocks: true,
          wireHangers: true,
          cleanup: true,
          color: "Cobblestone",
        },
        decking: {
          areas: "Rear deck and stairs",
        },
      },
      pricing: {
        unitPrice: { landmark: 550, pro: 650, northgate: 750 },
        asphaltCalcMode: "bySquare",
        asphaltPlywoodSquares: 12,

        davinciMode: "bySquare",
        davinciUnit: 1200,
        davinciCopperValleyFeet: 40,
        davinciCopperDripEdgeFeet: 50,

        cedarMode: "bySquare",
        cedarUnit: 1100,
        cedarIncludeWovenCaps: true,
        cedarWovenCapsFeet: 100,
        cedarPlywoodSquares: 8,

        rubberMode: "bySquare",
        rubberUnit: 900,
        rubberCurbSkylights: 2,
        rubberEpdmType: ".060_black",

        siding: {
          areas: "Front and both gables",
          exposure: "7\"",
          byCategory: {
            synthetic: { productLabel: "CertainTeed Cedar Impressions", exposure: "7\"", color: "Cobblestone" },
            vinyl: { productLabel: "CertainTeed Monogram", exposure: "4\"", color: "Granite" },
            clapBoard: { productLabel: "Fiber Cement Clapboard", exposure: "6\"", color: "Gray" },
            cedarShake: { productLabel: "Cedar Shake", exposure: "7\"", color: "Natural" },
          },
        },

        // Extras
        plywood: { selected: true, mode: "replace", areas: "Entire roof deck", squares: 12, total: 4320 },
        chimney: { selected: true, areas: "Main chimney", size: "32x12", cricket: true, total: 1200 },
        skylights: { selected: true, complexity: "replacing_existing", areas: "Rear roof", fixedPrice: 900, manualPrice: 500, solarPrice: 0 },
        trim: { selected: true, material: "azek", installMode: "new", areas: "Front elevation", feet: { soffit: 40, fascias: 60, frieze: 30, molding: 15, cornerBoards: 24, windowDoor: 60, rakeBoards: 36, waterTable: 20 }, total: 4500 },
        gutters: { selected: true, type: "5\" K-Style Aluminum", feet: 180, downspouts: { type: "down3x4", feet: 90 }, leafGuards: { selected: true, feet: 160 } },
        detached: { selected: true, type: "garage", squares: 12 },
        customAdd: { selected: true, label: "Custom carpentry allowance", price: 800 },

        // Decking
        decking: {
          materialSqft: 320,
          railingLinearFt: 60,
          framing: { groundLevel: true, groundLevelSqft: 200, secondStory: true, secondStorySqft: 120 },
          replacing: { decking: true, railings: true },
          concrete: { sonoTubes: true, sonoTubesCount: 8, landing: true, landingSqft: 40 },
          skirtTrim: { azek: true, linearFt: 50 },
          materials: { azek: true },
          railing: { azek: true },
        },
        windowsAndDoors: { total: 0 },
      },
      computed: {
        primaryTotals: {
          asphalt: 550 * 30 * 1.1, // rough by-square with waste
          davinci: 1200 * 30 * 1.1,
          cedar: 1100 * 30 * 1.1,
          rubber: 900 * 5,
          siding: 18000,
        },
        grandTotal: (550 * 30 * 1.1) + (1200 * 30 * 1.1) + (1100 * 30 * 1.1) + (900 * 5) + 18000 + 4320 + 1200 + 900 + 4500 + (180*12) + (160*11) + 800 + (12 * 550) + // rough extras + detached (good tier)
          // decking rough calc mirrored in render.ts
          (320 * 55) + (60 * 120) + (200 * 25) + (120 * 35) + (8 * 500) + (40 * 100) + (50 * 19),
      },
      photos: {},
    };

    // Create the proposal row using existing /api/proposals/create semantics
    const created = await prisma.proposal.create({
      data: {
        tenantId,
        leadId: lead.id,
        templateName: "HyTechProposalTemplate.docx",
        templateBody: JSON.stringify(snapshot),
        status: "Draft",
        mergedHtml: String(snapshot?.computed?.grandTotal || ""),
      },
    });

    // Create a stateless token for viewing/signing
    const tokenPayload = { id: created.id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14 };
    const token = jwtSign(tokenPayload, getSignSecret());
    const signUrl = `${req.nextUrl.origin}/p/${encodeURIComponent(token)}/view`;

    return NextResponse.json({ ok: true, id: created.id, token, signUrl }, { status: 201 });
  } catch (e: any) {
    console.error("create-fattty-proposal error", e);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
