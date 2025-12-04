import { WebProposal, money } from "@/lib/webProposal/data";

// Build simple {{double-curly}} replacements for the classic template
export function buildReplacements(view: WebProposal, snap: any): Record<string, string> {
  const company = snap?.company || {};
  const customer = snap?.customer || {};
  const linesHtml = (view?.lines || []).map((l: string) => `<p>${escapeHtml(l)}</p>`).join("");
  const companyContact = [company.phone, company.email].filter(Boolean).join(" • ");
  const hicCsl = [company.hic ? `HIC #${company.hic}` : "", company.csl ? `CSL #${company.csl}` : ""].filter(Boolean).join(" • ");
  const custCityStateZip = [customer.city, customer.state].filter(Boolean).join(", ") + (customer.zip ? ` ${customer.zip}` : "");
  const custContact = [customer.email, customer.tel, customer.cell].filter(Boolean).join(" • ");
  const proposalId = snap?.proposalId || snap?.publicId || snap?._publicId || snap?.proposal?.id || "";
  const jobAddress = [
    customer.street,
    [customer.city, customer.state].filter(Boolean).join(", "),
    customer.zip,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+,/g, ",");
  const primaryTotals = (snap?.computed?.primaryTotals || {}) as any;
  const asphaltBase = Number(primaryTotals.asphalt ?? 0) || 0;
  const taxRate = Number(snap?.taxRate ?? company?.taxRate ?? 0) || 0;

  return {
    company_name: company.name || "",
    company_address: company.address || "",
    company_contact_line: companyContact,
    hic_csl_line: hicCsl,

    customer_name: customer.name || "",
    customer_street: customer.street || "",
    customer_city_state_zip: custCityStateZip.trim(),
    customer_contact_line: custContact,

    grand_total: money(view?.grandTotal || 0),
    scope_lines: linesHtml,

    // Dotted replacements for window.PROPOSAL injection
    "proposal.id": String(proposalId),
    "customer.name": customer.name || "",
    "customer.email": customer.email || "",
    "job.address": jobAddress || customer.street || "",
    "prices.asphalt": String(asphaltBase),
    "prices.asphalt_roof": String(asphaltBase),
    "prices.copper_valleys": String(Number(snap?.pricing?.davinciCopperValleyFeet ? 0 : 0)),
    taxRate: String(taxRate),
  };
}

// Lightweight DOCX-like renderer: supports {token}, {#section}...{/section}
// and {%image} inside loops

type AnyDict = Record<string, any>;

function moneyStr(n: any) {
  const num = Number(typeof n === "string" ? n.replace(/[^\d.-]/g, "") : n);
  return isFinite(num) ? money(num) : money(0);
}

function buildDocxLikeData(snap: AnyDict, view: WebProposal): AnyDict {
  const company = snap?.company || {};
  const customer = snap?.customer || {};
  const scope = snap?.scope || {};
  const pricing = snap?.pricing || {};
  const measure = snap?.measure || {};
  const workDomain = snap?.workDomain || {};
  const selectedWork = snap?.selectedWork || {};
  const computed = snap?.computed || {};
  const photos = snap?.photos || {};

  const show = (cond: any) => (cond ? [{}] : []);
  const showBool = (cond: any) => (cond ? [{}] : []);
  const bool = (v: any) => !!v;
  const colorLabel = (v: string) => {
    const m: Record<string, string> = { white: "White", mill: "Mill Finish", brown: "Brown", black: "Black" };
    const k = String(v || "").toLowerCase();
    return m[k] || (v || "");
  };
  // Normalized drip-edge label helper used across roofing sections
  const dripLabelFmt = (type?: string, color?: string): string => {
    const t = String(type || "");
    if (!t) return "";
    if (t === "hicks_vent") return "Hicks Vent";
    if (t === "aluminum_8") return `8" Aluminum (${colorLabel(color || "White")})`;
    if (t === "copper_5") return `5" Copper`;
    return "";
  };
  const num = (v: any) => {
    const n = Number(typeof v === "string" ? v.replace(/[^\d.-]/g, "") : v);
    return isFinite(n) ? n : 0;
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // --- Siding product option + label helpers (mirror proposal app logic) ---
  const sidingProductOptions = (category: string) => {
    const map: Record<string, [string, string][]> = {
      cedarShake: [
        ["whiteCedar", "White Cedar"],
        ["maibec1", "Maibec Single Coated Cedar"],
        ["maibec2", "Maibec Double Coated Cedar"],
        ["redCedar", "Red Cedar"],
      ],
      synthetic: [
        ["hardiPlankCedarMill", "HardiePlank CedarMill"],
        ["hardiStraightEdgeShingle", "Hardie Straight Edge Shingle"],
        ["hardiPanelSierra9", "HardiePanel Sierra 9"],
      ],
      vinyl: [
        ["monogram", "CertainTeed Monogram"],
        ["mainStreet", "CertainTeed MainStreet"],
        ["cedarImpressions", "CertainTeed Cedar Impressions"],
        ["everlast", "Everlast"],
      ],
      clapBoard: [
        ["primedRedCedar", "Primed Red Cedar Clapboard"],
        ["clearRedCedar", "Clear Red Cedar Clapboard"],
      ],
    };
    return (map[category] || []).map(([value, label]) => ({ value, label }));
  };
  const productLabelFor = (category: string, value?: string) => {
    if (!value) return "";
    const opts = sidingProductOptions(category) || [];
    const found = opts.find((o) => o.value === value);
    return found ? found.label : value;
  };

  const data: AnyDict = {
    company_name: company.name || "HyTech Roofing Solutions",
    company_address: company.address || "714A Route 6-A Yarmouth Port, MA 02675",
    company_phone: String(company.phone || ""),
    company_email: company.email || "",
    hic: company.hic || "",
    csl: company.csl || "",

    provided_on: ((): string => {
      // Format strictly as mm/dd/yyyy with leading zeros
      const raw = (customer as AnyDict)?.providedOn as any;
      const d = raw ? new Date(raw) : new Date();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    })(),
    customer_name: customer.name || "",
    customer_tel: String(customer.tel || ""),
    customer_cell: String(customer.cell || ""),
    customer_email: customer.email || "",
    customer_street: customer.street || "",
    customer_city: customer.city || "",
    customer_state: customer.state || "",
    customer_zip: customer.zip || "",

    asphalt_areas: scope?.asphalt?.areas || "",
    davinci_areas: scope?.davinci?.areas || "",
    cedar_areas: scope?.cedar?.areas || "",
    rubber_areas: scope?.rubber?.areas || "",
    siding_areas: (pricing?.siding?.areas || "").trim(),
    notes: (scope?.notes || "") + "",

    show_asphalt: show(workDomain?.roofing && selectedWork?.asphalt),
    show_davinci: show(workDomain?.roofing && selectedWork?.davinci),
    show_cedar: show(workDomain?.roofing && selectedWork?.cedar),
    show_rubber: show(workDomain?.roofing && selectedWork?.rubber),
    show_siding_synthetic: show(
      workDomain?.siding && (selectedWork?.sidingCategory === "synthetic" || (selectedWork?.sidingCategories || []).includes("synthetic"))
    ),
    show_siding_cedarShake: show(
      workDomain?.siding && (selectedWork?.sidingCategory === "cedarShake" || (selectedWork?.sidingCategories || []).includes("cedarShake"))
    ),
    show_siding_vinyl: show(
      workDomain?.siding && (selectedWork?.sidingCategory === "vinyl" || (selectedWork?.sidingCategories || []).includes("vinyl"))
    ),
    show_siding_clapBoard: show(
      workDomain?.siding && (selectedWork?.sidingCategory === "clapBoard" || (selectedWork?.sidingCategories || []).includes("clapBoard"))
    ),
    show_decking: show(!!workDomain?.decking),

    grand_total: moneyStr((view && (view as any).grandTotal != null) ? (view as any).grandTotal : (computed?.grandTotal || 0)),
  };

  // ---- Selected work title for header ----
  try {
    const roofingSelected = !!(workDomain?.roofing && (selectedWork?.asphalt || selectedWork?.davinci || selectedWork?.cedar || selectedWork?.rubber));
    const sidingSelected = !!(workDomain?.siding && (
      (selectedWork?.sidingCategory && String(selectedWork?.sidingCategory).length > 0) ||
      (Array.isArray(selectedWork?.sidingCategories) && (selectedWork?.sidingCategories || []).length > 0)
    ));
    const deckingSelected = !!workDomain?.decking;
    const wndSelected = !!(pricing?.windowsAndDoors && (pricing as AnyDict)?.windowsAndDoors?.selected);

    const buckets: string[] = [];
    if (roofingSelected) buckets.push("Roofing");
    if (sidingSelected) buckets.push("Siding");
    if (deckingSelected) buckets.push("Decking");
    if (wndSelected) buckets.push("Windows & Doors");

    const joinWork = (items: string[]): string => {
      const arr = items.filter(Boolean);
      if (arr.length === 0) return "Proposal";
      if (arr.length === 1) return `${arr[0]} Proposal`;
      if (arr.length === 2) return `${arr[0]} & ${arr[1]} Proposal`;
      return `${arr.slice(0, -1).join(", ")} & ${arr[arr.length - 1]} Proposal`;
    };
    data.selected_work_title = joinWork(buckets);
  } catch {}

  // ---- Asphalt flags/labels used by template ----
  try {
    const a = scope?.asphalt || {};
    const iw = a?.iceAreas || {};
  Object.assign(data, {
      asphalt_plywood_sentence: ({
        inspectRenail: "Inspect and Re-Nail Any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
        replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
        newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
      } as AnyDict)[a?.plywoodCondition || ""] || "",
      asphalt_syntheticUnderlayment: showBool(a?.syntheticUnderlayment),
      asphalt_starterStrips:         showBool(a?.starterStrips),
      asphalt_ridgeVent:             showBool(a?.ridgeVent),
      asphalt_hipRidgeCaps:          showBool(a?.hipRidgeCaps),
      asphalt_pipeFlashings:         showBool(a?.pipeFlashings),
      asphalt_cleanup:               showBool(a?.cleanup),
      asphalt_color:                 showBool((a?.color || "").trim().length > 0),

      asphalt_dripEdge_hicks:        showBool(a?.dripEdgeType === "hicks_vent"),
      asphalt_dripEdge_aluminum8:    showBool(a?.dripEdgeType === "aluminum_8"),
      asphalt_dripEdge_copper5:      showBool(a?.dripEdgeType === "copper_5"),
      asphalt_rakeDrip_aluminum8:    showBool(a?.rakeDripEdgeType === "aluminum_8"),
      asphalt_rakeDrip_copper5:      showBool(a?.rakeDripEdgeType === "copper_5"),
      asphalt_copperDrip_any:        showBool(a?.dripEdgeType === "copper_5" || a?.rakeDripEdgeType === "copper_5"),
      asphalt_copper_drip_edge_feet: Number(pricing?.asphaltCopperDripEdgeFeet || 0),

  // Drip-edge labels and color placeholders for Asphalt
  asphalt_drip_eave_label: dripLabelFmt(a?.dripEdgeType, a?.dripEdgeColor),
  asphalt_drip_rake_label: dripLabelFmt(a?.rakeDripEdgeType, a?.rakeDripEdgeColor),
  asphalt_dripEdge_color_label: colorLabel(a?.dripEdgeColor || ""),
  asphalt_rakeDrip_color_label: colorLabel(a?.rakeDripEdgeColor || ""),
  row_asphalt_drip_eave: showBool(!!a?.dripEdgeType),
  row_asphalt_drip_rake: showBool(!!a?.rakeDripEdgeType),

      asphalt_iw_eaves3:     showBool(iw?.eaves3),
      asphalt_iw_valleys:    showBool(iw?.valleys),
      asphalt_iw_pipesVents: showBool(iw?.pipesVents),
      asphalt_iw_stepFlash:  showBool(iw?.stepFlash),
      asphalt_iw_chimney:    showBool(iw?.chimney),
      asphalt_iw_skylights:  showBool(iw?.skylights),
      asphalt_iw_lowPitch:   showBool(iw?.lowPitch),
      asphalt_iw_solarAreas: showBool(iw?.solarAreas),
      asphalt_iw_fullCoverage: showBool(iw?.fullCoverage),
    });
  } catch {}

  // ---- Davinci flags/labels used by template ----
  try {
    const d = scope?.davinci || {};
    Object.assign(data, {
      davinci_product_label: (d?.productType === "shake" || !d?.productType) ? "Multi-width Shake" : (d?.productType === "slate" ? "Multi-width Slate" : ""),
      davinci_plywood_sentence: ({
        inspectRenail: "Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
        replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
        newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
      } as AnyDict)[d?.plywoodCondition || ""] || "",
  davinci_drip_eave_label: dripLabelFmt(d?.dripEdgeType, d?.dripEdgeColor),
  davinci_drip_rake_label: dripLabelFmt(d?.rakeDripEdgeType, d?.rakeDripEdgeColor),
      davinci_dripEdge_hicks:     showBool(d?.dripEdgeType === "hicks_vent"),
      davinci_dripEdge_aluminum8: showBool(d?.dripEdgeType === "aluminum_8"),
      davinci_dripEdge_copper5:   showBool(d?.dripEdgeType === "copper_5"),
      davinci_rakeDrip_hicks:     showBool(d?.rakeDripEdgeType === "hicks_vent"),
      davinci_rakeDrip_aluminum8: showBool(d?.rakeDripEdgeType === "aluminum_8"),
      davinci_rakeDrip_copper5:   showBool(d?.rakeDripEdgeType === "copper_5"),
      davinci_dripEdge_color_label: colorLabel(d?.dripEdgeColor || ""),
      davinci_rakeDrip_color_label: colorLabel(d?.rakeDripEdgeColor || ""),
      davinci_iw_full: showBool(!!d?.iceWaterFull),

  // Row flags expected by template
  row_davinci_ice_full:       showBool(!!d?.iceWaterFull),
  row_davinci_starter:        showBool(!!d?.davinciStarter),
  row_davinci_copper_valleys: showBool(!!d?.includeCopperValleys && num(pricing?.davinciCopperValleyFeet || 0) > 0),
  row_davinci_ridgeVent:      showBool(!!d?.ridgeVent),
  row_davinci_hipRidgeCaps:   showBool(!!d?.hipRidgeCaps),
  row_davinci_pipeFlashings:  showBool(!!d?.pipeFlashings),
  row_davinci_pipeFlange:     showBool(!!(d?.pipeFlange?.aluminum || d?.pipeFlange?.copper)),
  row_davinci_roofFanVents:   showBool(!!(d?.roofFanVents?.blackAluminum || d?.roofFanVents?.copper)),
  row_davinci_cleanup:        showBool(!!d?.cleanup),
  row_davinci_drip_eave:      showBool(!!d?.dripEdgeType),
  row_davinci_drip_rake:      showBool(!!d?.rakeDripEdgeType),
  row_davinci_copper_drip_edge: showBool(num(pricing?.davinciCopperDripEdgeFeet || 0) > 0),
  davinci_copper_valleys_feet: num(pricing?.davinciCopperValleyFeet || 0),
  davinci_copper_drip_edge_feet: num(pricing?.davinciCopperDripEdgeFeet || 0),
  davinci_pipe_flange_label:  d?.pipeFlange?.copper ? "Copper" : (d?.pipeFlange?.aluminum ? "Aluminum" : ""),
  davinci_roof_fan_vents_label: d?.roofFanVents?.copper ? "Copper" : (d?.roofFanVents?.blackAluminum ? "Black Aluminum" : ""),
    });
  } catch {}

  // ---- Cedar flags/labels (subset commonly used) ----
  try {
    const c = scope?.cedar || {};
    // Helper booleans for Ice & Water sub-areas
    const iw_eaves3      = !!c?.iceAreas?.eaves3;
    const iw_valleys     = !!c?.iceAreas?.valleys;
    const iw_pipesVents  = !!c?.iceAreas?.pipesVents;
    const iw_stepFlash   = !!c?.iceAreas?.stepFlash;
    const iw_chimney     = !!c?.iceAreas?.chimney;
    const iw_skylights   = !!c?.iceAreas?.skylights;
    const iw_lowPitch    = !!c?.iceAreas?.lowPitch;
    const iw_solarAreas  = !!c?.iceAreas?.solarAreas;
    const iw_fullCoverage= !!c?.iceAreas?.fullCoverage;
    const iw_any = (
      iw_eaves3 || iw_valleys || iw_pipesVents || iw_stepFlash ||
      iw_chimney || iw_skylights || iw_lowPitch || iw_solarAreas || iw_fullCoverage
    );

    // Woven caps feet derived from pricing or scope if available
    const wovenFeet = Number((pricing as AnyDict)?.cedarWovenCapsFeet || (c as AnyDict)?.wovenCapsFeet || 0) || 0;
    const hasWovenCaps = !!(c as AnyDict)?.wovenCaps || wovenFeet > 0;

    // Pipe flange present
    const hasPipeFlange = !!(c as AnyDict)?.pipeFlange && (!!(c as AnyDict)?.pipeFlange?.aluminum || !!(c as AnyDict)?.pipeFlange?.copper);

    // Roof fan vents present
    const hasRoofFanVents = !!(c as AnyDict)?.roofFanVents && (!!(c as AnyDict)?.roofFanVents?.blackAluminum || !!(c as AnyDict)?.roofFanVents?.copper);

    // Drip edge rows
    const hasDripEave = !!c?.dripEdgeType;
    const hasDripRake = !!c?.rakeDripEdgeType;

    // Copper valleys present
    const hasCopperValleys = !!(c as AnyDict)?.copperValleys || Number((pricing as AnyDict)?.cedarCopperValleyFeet || 0) > 0;

    // Deck Armor present
    const hasDeckArmor = !!(c as AnyDict)?.deckArmor || !!(c as AnyDict)?.deckArmour || !!(pricing as AnyDict)?.deckArmor;

    // Ridge boards present
    const hasCedarRidgeBoards = !!(c as AnyDict)?.cedarRidgeBoards;

    // Cedar type label (upper-cased)
    const cedarTypeLabel = ((): string => {
      const raw = String(
        (c as AnyDict)?.typeLabel || (c as AnyDict)?.type || (pricing as AnyDict)?.cedarType || "CEDAR SHAKE"
      ).trim();
      return raw.toUpperCase();
    })();
  Object.assign(data, {
      cedar_plywood_sentence: ({
        inspectRenail: "Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
        replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
        newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
      } as AnyDict)[c?.plywoodCondition || ""] || "",
    // Row toggles and labels expected by the Word template
    row_cedar_ice_full:       showBool(!!c?.iceWaterFull),
    row_cedar_iw_any:         showBool(iw_any),
    row_cedar_deckArmor:      showBool(hasDeckArmor),
    row_cedar_cedarBreather:  showBool(!!c?.cedarBreather),
    row_cedar_ridgeVent:      showBool(!!c?.ridgeVent),
    row_cedar_ridgeBoards:    showBool(hasCedarRidgeBoards),        // internal alias
    row_cedar_cedarRidgeBoards: showBool(hasCedarRidgeBoards),      // template expects this key
    row_cedar_pipeFlashings:  showBool(!!c?.pipeFlashings),         // keep legacy
    row_cedar_pipeFlange:     showBool(hasPipeFlange),              // template expects this key
    row_cedar_roofFanVents:   showBool(hasRoofFanVents),
    row_cedar_copperValleys:  showBool(hasCopperValleys),
    row_cedar_woven_caps:     showBool(hasWovenCaps),
    row_cedar_cleanup:        showBool(!!c?.cleanup),
      cedar_drip_eave_label:    ((): string => {
        const t = c?.dripEdgeType; const clr = c?.dripEdgeColor; if (!t) return "";
        return t === "hicks_vent" ? "Hicks Vent" : t === "aluminum_8" ? `8" Aluminum (${colorLabel(clr || "White")})` : t === "copper_5" ? `5" Copper` : "";
      })(),
      cedar_drip_rake_label:    ((): string => {
        const t = c?.rakeDripEdgeType; const clr = c?.rakeDripEdgeColor; if (!t) return "";
        return t === "hicks_vent" ? "Hicks Vent" : t === "aluminum_8" ? `8" Aluminum (${colorLabel(clr || "White")})` : t === "copper_5" ? `5" Copper` : "";
      })(),
  cedar_dripEdge_color_label: colorLabel(c?.dripEdgeColor || ""),
  cedar_rakeDrip_color_label: colorLabel(c?.rakeDripEdgeColor || ""),
    cedar_pipe_flange_label:  c?.pipeFlange?.copper ? "Copper" : (c?.pipeFlange?.aluminum ? "Aluminum" : ""),
    cedar_roof_fan_vents_label: c?.roofFanVents?.copper ? "Copper" : (c?.roofFanVents?.blackAluminum ? "Black Aluminum" : ""),
    cedar_woven_caps_feet: wovenFeet > 0 ? wovenFeet : "",
    cedar_iw_eaves3:      showBool(iw_eaves3),
    cedar_iw_valleys:     showBool(iw_valleys),
    cedar_iw_pipesVents:  showBool(iw_pipesVents),
    cedar_iw_stepFlash:   showBool(iw_stepFlash),
    cedar_iw_chimney:     showBool(iw_chimney),
    cedar_iw_skylights:   showBool(iw_skylights),
    cedar_iw_lowPitch:    showBool(iw_lowPitch),
    cedar_iw_solarAreas:  showBool(iw_solarAreas),
    cedar_iw_fullCoverage:showBool(iw_fullCoverage),

  // Missing cedar row flags for drip edges
  row_cedar_drip_eave: showBool(hasDripEave),
  row_cedar_drip_rake: showBool(hasDripRake),

    // Cedar type label used in template
    cedar_type_label: cedarTypeLabel,
    });
  } catch {}

  // ---- Rubber flags/labels (subset) ----
  try {
    const r = scope?.rubber || {};
    Object.assign(data, {
      rubber_plywood_sentence: ({
        inspectRenail: "Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
        replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
        newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
      } as AnyDict)[r?.plywoodCondition || ""] || "",
      row_rubber_fiberboard:      showBool(!!r?.fiberboard),
      row_rubber_aluminumDripEdge:showBool(!!r?.aluminumDripEdge),
  rubber_drip_edge_color_label: colorLabel(r?.dripEdgeColor || (pricing as any)?.rubberDripEdgeColor || ""),
      row_rubber_seamSplice:      showBool(!!r?.seamSplice),
      row_rubber_seamCoverTape:   showBool(!!r?.seamCoverTape),
      row_rubber_pipeBoots:       showBool(!!r?.pipeBoots),
      row_rubber_curbSkylights:   showBool(!!r?.curbSkylights),
      row_rubber_cornerFlashings: showBool(!!r?.cornerFlashings),
      rubber_epdm_type_label: (
        (pricing?.rubberEpdmType || ".060_black") === ".060_black" ? ".060 Black EPDM" :
        (pricing?.rubberEpdmType || ".060_black") === ".090_black" ? ".090 Black EPDM" :
        (pricing?.rubberEpdmType || ".060_black") === ".060_white" ? ".060 White EPDM" :
        (pricing?.rubberEpdmType || ".060_black") === ".090_white" ? ".090 White EPDM" :
        (r?.epdm060 ? "0.060 EPDM" : "EPDM")
      ),
      rubber_epdm_type: (
        (pricing?.rubberEpdmType || ".060_black") === ".060_black" ? ".060 Black EPDM" :
        (pricing?.rubberEpdmType || ".060_black") === ".090_black" ? ".090 Black EPDM" :
        (pricing?.rubberEpdmType || ".060_black") === ".060_white" ? ".060 White EPDM" :
        (pricing?.rubberEpdmType || ".060_black") === ".090_white" ? ".090 White EPDM" :
        ""
      ),
      row_rubber_flashing12: showBool(!!r?.flashing12),
    });
  } catch {}

  // ---- Siding flags/fields (synthetic + per-category product labels + shared row toggles) ----
  try {
    const catPicked = (c: string) => {
      const cats = (selectedWork?.sidingCategories || []) as string[];
      return cats.includes(c) || selectedWork?.sidingCategory === c;
    };
  const syn = (pricing?.siding?.byCategory?.synthetic || pricing?.siding?.synthetic || pricing?.siding || {}) as AnyDict;
  const cedar = (pricing?.siding?.byCategory?.cedarShake || pricing?.siding?.cedarShake || {}) as AnyDict;
  const vinyl = (pricing?.siding?.byCategory?.vinyl || pricing?.siding?.vinyl || {}) as AnyDict;
  const clap = (pricing?.siding?.byCategory?.clapBoard || pricing?.siding?.clapBoard || {}) as AnyDict;
    const sidingTotals = (computed?.sidingTotals || {}) as AnyDict;
    const rates = ((pricing?.siding?.rates || {}) as AnyDict) || {};
    const lookupUnit = (catKey: string, src: AnyDict) => {
      const direct = num(src?.unit);
      if (direct) return direct;
      const catRates = (rates?.[catKey] || {}) as AnyDict;
      const product = src?.product || Object.keys(catRates || {}).find((k) => catRates[k] != null) || "";
      const rate = product && catRates ? catRates[product] : undefined;
      if (rate != null) return num(rate);
      return num(pricing?.siding?.unit || 0);
    };
    const readSubtotal = (catKey: string, src: AnyDict) => {
      const direct = num(sidingTotals?.[catKey]);
      if (direct) return round2(direct);
      const stored = num(src?.subtotal);
      if (stored) return round2(stored);
      const calcMode = String(src?.calcMode || pricing?.siding?.calcMode || "bySquare");
      let subtotal = 0;
      if (calcMode === "manual") {
        subtotal = num(src?.manualTotal ?? pricing?.siding?.manualTotal ?? 0);
      } else {
        const unit = lookupUnit(catKey, src || {});
        const squares = num(
          src?.squares ?? pricing?.siding?.squares ?? pricing?.siding?.wallSquares ?? pricing?.siding?.squareFootage ?? 0
        );
        subtotal = round2(unit * squares);
      }
      const woven = (src?.wovenCorners || {}) as AnyDict;
      if (woven?.include) subtotal = round2(subtotal + 45 * num(woven?.feet || 0));
      return round2(subtotal);
    };
  // Compute per-category subtotals regardless of selection gating so legacy selectedWork shapes don't hide the value
  const syntheticSubtotal = readSubtotal("synthetic", syn);
  const cedarSubtotal = readSubtotal("cedarShake", cedar);
  const vinylSubtotal = readSubtotal("vinyl", vinyl);
  const clapSubtotal = readSubtotal("clapBoard", clap);
  const syntheticOn = ((workDomain?.siding ? catPicked("synthetic") : false) || syntheticSubtotal > 0);
  const cedarOn = ((workDomain?.siding ? catPicked("cedarShake") : false) || cedarSubtotal > 0);
  const vinylOn = ((workDomain?.siding ? catPicked("vinyl") : false) || vinylSubtotal > 0);
  const clapOn = ((workDomain?.siding ? catPicked("clapBoard") : false) || clapSubtotal > 0);
    Object.assign(data, {
      // Scope generic {siding_total}/{siding_subtotal} within this section by providing overrides in the array item
      show_siding_synthetic: syntheticOn ? [{
        siding_total:    moneyStr(syntheticSubtotal),
        siding_subtotal: moneyStr(syntheticSubtotal),
        siding_subTotal: moneyStr(syntheticSubtotal),
      }] : [],
      row_siding_synthetic:  syntheticOn ? [{
        siding_total:    moneyStr(syntheticSubtotal),
        siding_subtotal: moneyStr(syntheticSubtotal),
        siding_subTotal: moneyStr(syntheticSubtotal),
      }] : [],
      siding_areas: String((pricing?.siding?.areas || syn.areas || "")).trim(),
      // Synthetic product label uses explicit map (match UI select label exactly)
      siding_synthetic_product_label: productLabelFor("synthetic", String(syn.productLabel || syn.product || "")) || String(syn.productLabel || syn.product || ""),
      siding_synthetic_exposure: String(syn.exposure || pricing?.siding?.exposure || "").trim(),
      siding_synthetic_color: String(syn.color || scope?.siding?.color || "").trim(),
  // Ensure synthetic siding total placeholder can populate
  // Template uses a {siding_synthetic_subtotal} token; expose it and gate row flags by selection
  siding_synthetic_subtotal: moneyStr(syntheticSubtotal),
  siding_synthetic_subTotal: moneyStr(syntheticSubtotal), // alias variant (capital T) from older templates
  row_siding_synthetic_subtotal: syntheticOn ? [{}] : [],
  row_siding_synthetic_subTotal: syntheticOn ? [{}] : [],
  row_siding_synthetic_total:    syntheticOn ? [{}] : [],
      // Cedar Shake product label & basics
      show_siding_cedarShake: cedarOn ? [{
        siding_total:    moneyStr(cedarSubtotal),
        siding_subtotal: moneyStr(cedarSubtotal),
        siding_subTotal: moneyStr(cedarSubtotal),
      }] : [],
      row_siding_cedarShake:  cedarOn ? [{
        siding_total:    moneyStr(cedarSubtotal),
        siding_subtotal: moneyStr(cedarSubtotal),
        siding_subTotal: moneyStr(cedarSubtotal),
      }] : [],
      siding_cedar_product_label: productLabelFor("cedarShake", String(cedar.productLabel || cedar.product || "")) || String(cedar.productLabel || cedar.product || ""),
      siding_cedar_exposure: String(cedar.exposure || pricing?.siding?.exposure || "").trim(),
      siding_cedar_color: String(cedar.color || scope?.siding?.color || "").trim(),
      siding_cedar_areas: String(cedar.areas || pricing?.siding?.areas || "").trim(),
  // Cedar siding subtotal/total tokens (strictly siding-only; no roofing coupling)
  // Previously these incorrectly fell back to the roofing cedar total when siding wasn't selected.
  // Now they only populate when Cedar Shake Siding is part of the selected work.
  siding_cedar_subtotal: cedarOn ? moneyStr(cedarSubtotal) : "",
  siding_cedar_subTotal: cedarOn ? moneyStr(cedarSubtotal) : "", // alias
  siding_cedar_total:    cedarOn ? moneyStr(cedarSubtotal) : "",
  // Vinyl product label & basics
      show_siding_vinyl: vinylOn ? [{
        siding_total:    moneyStr(vinylSubtotal),
        siding_subtotal: moneyStr(vinylSubtotal),
        siding_subTotal: moneyStr(vinylSubtotal),
      }] : [],
      row_siding_vinyl:  vinylOn ? [{
        siding_total:    moneyStr(vinylSubtotal),
        siding_subtotal: moneyStr(vinylSubtotal),
        siding_subTotal: moneyStr(vinylSubtotal),
      }] : [],
      siding_vinyl_product_label: productLabelFor("vinyl", String(vinyl.productLabel || vinyl.product || "")) || String(vinyl.productLabel || vinyl.product || ""),
      siding_vinyl_exposure: String(vinyl.exposure || pricing?.siding?.exposure || "").trim(),
      siding_vinyl_color: String(vinyl.color || scope?.siding?.color || "").trim(),
      siding_vinyl_areas: String(vinyl.areas || pricing?.siding?.areas || "").trim(),
  siding_vinyl_subtotal: vinylOn ? moneyStr(vinylSubtotal) : "",
  siding_vinyl_subTotal: vinylOn ? moneyStr(vinylSubtotal) : "", // alias
  siding_vinyl_total:    vinylOn ? moneyStr(vinylSubtotal) : "",
      // Clap Board product label & basics
      show_siding_clapBoard: clapOn ? [{
        siding_total:    moneyStr(clapSubtotal),
        siding_subtotal: moneyStr(clapSubtotal),
        siding_subTotal: moneyStr(clapSubtotal),
      }] : [],
      row_siding_clapBoard:  clapOn ? [{
        siding_total:    moneyStr(clapSubtotal),
        siding_subtotal: moneyStr(clapSubtotal),
        siding_subTotal: moneyStr(clapSubtotal),
      }] : [],
      siding_clap_product_label: productLabelFor("clapBoard", String(clap.productLabel || clap.product || "")) || String(clap.productLabel || clap.product || ""),
      siding_clap_exposure: String(clap.exposure || pricing?.siding?.exposure || "").trim(),
      siding_clap_areas: String(clap.areas || pricing?.siding?.areas || "").trim(),
  siding_clap_subtotal: clapOn ? moneyStr(clapSubtotal) : "",
  siding_clap_subTotal: clapOn ? moneyStr(clapSubtotal) : "", // alias
  siding_clap_total:    clapOn ? moneyStr(clapSubtotal) : "",
      row_siding_typar:            showBool(!!scope?.siding?.typar),
      row_siding_vycorTape:        showBool(!!scope?.siding?.vycorTape),
      row_siding_stainlessStaples: showBool(!!scope?.siding?.stainlessStaples),
      row_siding_dripCaps:         showBool(!!scope?.siding?.dripCaps),
      row_siding_azekBlocks:       showBool(!!scope?.siding?.azekBlocks),
      row_siding_wireHangers:      showBool(!!scope?.siding?.wireHangers),
      row_siding_cleanup:          showBool(!!scope?.siding?.cleanup),
    });
  } catch {}

  // ---- Totals: asphalt tiers + per-section totals ----
  try {
    // Effective squares
    const effectiveSquares = round2(num(measure?.roofSquares) * (1 + num(measure?.wastePct || 0) / 100));
    const iw = scope?.asphalt?.iceAreas || {};
    const asphaltCalcMode = (pricing?.asphaltCalcMode || "bySquare") as string;
    const unitPrice = (pricing?.unitPrice || {}) as AnyDict;
    const manualPrice = (pricing?.manualPrice || {}) as AnyDict;
    const asphaltBaseFor = (tier: "landmark" | "pro" | "northgate") => {
      if (!tier) return 0;
      if (asphaltCalcMode === "bySquare") {
        let base = round2(effectiveSquares * num(unitPrice[tier]));
        if (iw?.solarAreas) base = round2(base + num(scope?.asphalt?.iceAreas?.solarSquares || 0) * 100);
        if (iw?.fullCoverage) base = round2(base + effectiveSquares * 100);
        return base;
      }
      return num(manualPrice[tier]);
    };
    // Plywood surcharge for asphalt (prefers dedicated squares if provided)
    const aSquares = num((pricing as AnyDict)?.asphaltPlywoodSquares ?? pricing?.plywood?.squares ?? 0);
    let aPly = 0;
    if (scope?.asphalt?.plywoodCondition === "replace") aPly = 360 * aSquares;
    if (scope?.asphalt?.plywoodCondition === "newOverBoards") aPly = 330 * aSquares;
    const asphaltGood = asphaltBaseFor("landmark") + aPly;
    const asphaltBetter = asphaltBaseFor("pro") + aPly;
    const asphaltBest = asphaltBaseFor("northgate") + aPly;
    Object.assign(data, {
      asphalt_good_total:   moneyStr(asphaltGood),
      asphalt_better_total: moneyStr(asphaltBetter),
      asphalt_best_total:   moneyStr(asphaltBest),
    });

    // Per-section totals: prefer computed.primaryTotals, else compute light fallbacks
    const prim = (computed?.primaryTotals || {}) as AnyDict;
    // Davinci
    let davinciBase = num(prim?.davinci);
    if (!davinciBase) {
      const mode = (pricing?.davinciMode || "manual") as string;
      if (mode === "bySquare") {
        let base = round2(effectiveSquares * num(pricing?.davinciUnit || 0));
        const squares = num(pricing?.plywood?.squares || 0);
        if (scope?.davinci?.plywoodCondition === "replace") base += 360 * squares;
        if (scope?.davinci?.plywoodCondition === "newOverBoards") base += 330 * squares;
        davinciBase = base;
      } else {
        davinciBase = num(pricing?.davinciManual || 0);
      }
    }
    // Cedar
    let cedarBase = num(prim?.cedar);
    if (!cedarBase) {
      const mode = (pricing?.cedarMode || "bySquare") as string;
      if (mode === "bySquare") {
        let base = round2(effectiveSquares * num(pricing?.cedarUnit || 0));
        if (pricing?.cedarIncludeWovenCaps) base += 45 * num(pricing?.cedarWovenCapsFeet || 0);
  const squares = num(((pricing as AnyDict)?.cedarPlywoodSquares ?? pricing?.plywood?.squares) || 0);
        if (scope?.cedar?.plywoodCondition === "replace") base += 360 * squares;
        if (scope?.cedar?.plywoodCondition === "newOverBoards") base += 330 * squares;
        cedarBase = base;
      } else {
        let base = num(pricing?.cedarManual || 0);
        if (pricing?.cedarIncludeWovenCaps) base += 45 * num(pricing?.cedarWovenCapsFeet || 0);
        cedarBase = base;
      }
    }
    // Rubber
    let rubberBase = num(prim?.rubber);
    if (!rubberBase) {
      const mode = (pricing?.rubberMode || "bySquare") as string;
      if (mode === "bySquare") {
        let base = round2(num(measure?.flatRoofSquares || 0) * num(pricing?.rubberUnit || 0));
        const squares = num(pricing?.plywood?.squares || 0);
        if (scope?.rubber?.plywoodCondition === "replace") base += 360 * squares;
        if (scope?.rubber?.plywoodCondition === "newOverBoards") base += 330 * squares;
        const curbCt = num(pricing?.rubberCurbSkylights || 0);
        if (scope?.rubber?.curbSkylights) base += 500 * curbCt;
        rubberBase = base;
      } else {
        let base = num(pricing?.rubberManual || 0);
        const squares = num(pricing?.plywood?.squares || 0);
        if (scope?.rubber?.plywoodCondition === "replace") base += 360 * squares;
        if (scope?.rubber?.plywoodCondition === "newOverBoards") base += 330 * squares;
        const curbCt = num(pricing?.rubberCurbSkylights || 0);
        if (scope?.rubber?.curbSkylights) base += 500 * curbCt;
        rubberBase = base;
      }
    }
    // Siding
    let sidingBase = num(prim?.siding || 0);
    if (!sidingBase) {
      const totals = (computed?.sidingTotals || {}) as AnyDict;
      const sum = Object.values(totals || {}).reduce((acc: number, value: any) => acc + num(value), 0);
      if (sum) sidingBase = round2(sum);
    }
  // Siding per-category totals for independent tokens (synthetic/cedarShake/vinyl/clapBoard)
  const sidingTotalsByCat = (computed?.sidingTotals || {}) as AnyDict;
  const sidingSyntheticTotal = round2(num(sidingTotalsByCat?.synthetic || 0));
  const sidingCedarTotal     = round2(num(sidingTotalsByCat?.cedarShake || 0));
  const sidingVinylTotal     = round2(num(sidingTotalsByCat?.vinyl || 0));
  const sidingClapTotal      = round2(num(sidingTotalsByCat?.clapBoard || 0));
    // Windows & Doors (compute friendly fallbacks and expose row flags)
    const w = (pricing?.windowsAndDoors || {}) as AnyDict;
    const wndComputed = (() => {
      let t = 0;
      if (w?.selected) {
        t += num(w?.windowsCount || 0) * 500;
        t += num(w?.doorsCount || 0) * 900;
        t += num(w?.slider6Count || 0) * 1000;
        t += num(w?.slider8Count || 0) * 1200;
        if (w?.custom) t += num(w?.customPrice || 0);
        if (w?.includeInsideCasing) t += num(w?.insideCasingFeet || 0) * 17;
        if (w?.includeOutsideTrim) t += num(w?.outsideTrimFeet || 0) * 19;
      }
      return t;
    })();
    const wndTotal = num(w?.total || w?.price || wndComputed || 0);

  Object.assign(data, {
      davinci_total:  moneyStr(davinciBase),
      cedar_total:    moneyStr(cedarBase),
      rubber_total:   moneyStr(rubberBase),
  // Asphalt totals: expose aggregate and aliases so Word templates can reference a single asphalt total
  asphalt_total:  moneyStr(asphaltGood + asphaltBetter + asphaltBest),
  asphalt_gbb_total: moneyStr(asphaltGood + asphaltBetter + asphaltBest), // alias for aggregate
  asphalt_landmark_total: moneyStr(asphaltGood),   // Good
  asphalt_pro_total:      moneyStr(asphaltBetter), // Better
  asphalt_northgate_total:moneyStr(asphaltBest),   // Best
  // Do not expose a global {siding_total}; it risks being referenced in roofing sections by mistake.
  // Siding subtotals/totals are injected only inside their section wrappers above.
  siding_total:   "",
  // Per-category siding totals for templates that want explicit amounts by option
  siding_synthetic_total: moneyStr(sidingSyntheticTotal),
  siding_cedarShake_total: moneyStr(sidingCedarTotal),
  siding_vinyl_total:     moneyStr(sidingVinylTotal),
  siding_clapBoard_total: moneyStr(sidingClapTotal),
  // Section total
  windows_and_doors_total: moneyStr(wndTotal),
  // Section visibility and line rows
  row_windows_and_doors: !!w?.selected ? [{}] : [],
  row_windows: !!w?.windows ? [{}] : [],
  row_doors:   !!w?.doors   ? [{}] : [],
  row_slider6: (w?.slider6 || num(w?.slider6Count || 0) > 0) ? [{}] : [],
  row_slider8: (w?.slider8 || num(w?.slider8Count || 0) > 0) ? [{}] : [],
  row_windows_custom: (w?.custom && num(w?.customPrice || 0) > 0) ? [{}] : [],
  // Counts and descriptions
  windows_count: Number(w?.windowsCount || 0),
  windows_desc:  String(w?.windowsDesc || ""),
  doors_count:   Number(w?.doorsCount || 0),
  doors_desc:    String(w?.doorsDesc || ""),
  slider6_count: Number(w?.slider6Count || 0),
  slider6_desc:  String(w?.slider6Desc || ""),
  slider8_count: Number(w?.slider8Count || 0),
  slider8_desc:  String(w?.slider8Desc || ""),
  windows_custom_desc: String(w?.customDesc || w?.customLabel || ""),
  // Aliases used by template: {custom_desc}
  custom_desc: String(w?.customDesc || w?.customLabel || w?.custom || ""),
  windows_and_doors_custom_desc: String(w?.customDesc || w?.customLabel || w?.custom || ""),
  windows_custom_label: String(w?.customLabel || w?.customDesc || w?.custom || ""),
  });
  } catch {}

  // ---- Windows & Doors small fields handled above ----

  // ---- Notes ----
  data.notes = (String(scope?.notes || ""));

  // ---- Decking section (rows, labels, numbers, photos) ----
  try {
    const d = (pricing?.decking || {});
    const dScope = (scope?.decking || {});
    const framing   = d?.framing || {};
    const replacing = d?.replacing || {};
    const concrete  = d?.concrete || {};
    const skirt     = d?.skirtTrim || {};
    const materials = d?.materials || {};
    const railing   = d?.railing || {};

    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
    const matOrder = ["azek", "wolf", "trex", "mahogany", "pt"];
    const railOrder = ["intex", "azek", "pt", "cable"];
    const decking_material_label = matOrder
      .filter((k) => !!(materials as AnyDict)[k])
      .map((k) => (k === "pt" ? "PT" : cap(k)))
      .join(" / ") || "Selected";
    const decking_railing_label = railOrder
      .filter((k) => !!(railing as AnyDict)[k])
      .map((k) => (k === "pt" ? "PT" : cap(k)))
      .join(" / ");

    // Totals (best-effort mirror of client app math; falls back to zeros if fields missing)
    const materialRate = (
      materials?.pt ? 25 :
      materials?.mahogany ? 43 :
      materials?.trex ? 47 :
      (materials?.azek || materials?.wolf) ? 55 : 0
    );
    const materialPrice = Number((d as AnyDict).materialSqft || 0) * Number(materialRate || 0);
    const railingRate = (
      railing?.pt ? 85 :
      railing?.azek ? 120 :
      railing?.intex ? 150 :
      railing?.cable ? 275 : 0
    );
    const railingPrice = Number((d as AnyDict).railingLinearFt || 0) * Number(railingRate || 0);
    const groundLevelFramingPrice = Number(framing?.groundLevelSqft || 0) * 25;
    const secondStoryFramingPrice = Number(framing?.secondStorySqft || 0) * 35;
    const sonoTubesPrice = Number(concrete?.sonoTubesCount || 0) * 500;
    const landingPrice = Number(concrete?.landingSqft || 0) * 100;
    const azekSkirtTrimPrice = Number(skirt?.linearFt || 0) * 19;
    const decking_total_calc = materialPrice + railingPrice + groundLevelFramingPrice + secondStoryFramingPrice + sonoTubesPrice + landingPrice + azekSkirtTrimPrice;

    Object.assign(data, {
      decking_areas: String(dScope?.areas || d?.areas || ""),

      row_decking_framing_ground: showBool(!!framing?.groundLevel && Number(framing?.groundLevelSqft || 0) > 0),
      decking_framing_ground_sqft: Number(framing?.groundLevelSqft || 0),

      row_decking_framing_second: showBool(!!framing?.secondStory && Number(framing?.secondStorySqft || 0) > 0),
      decking_framing_second_sqft: Number(framing?.secondStorySqft || 0),

      row_decking_replacing_decking: showBool(!!replacing?.decking),
      decking_material_label,

      row_decking_replacing_railings: showBool(!!replacing?.railings),
      decking_railing_label,

      row_decking_sonotubes: showBool(!!concrete?.sonoTubes && Number(concrete?.sonoTubesCount || 0) > 0),
      decking_sonotubes_count: Number(concrete?.sonoTubesCount || 0),

      row_decking_landing: showBool(!!concrete?.landing && Number(concrete?.landingSqft || 0) > 0),
      decking_landing_sqft: Number(concrete?.landingSqft || 0),

      row_decking_skirttrim_azek: showBool(!!skirt?.azek && Number((skirt as AnyDict)?.linearFt ?? 0) > 0),
      decking_skirttrim_linearft: Number((skirt as AnyDict)?.linearFt || 0),

      decking_total: moneyStr(decking_total_calc),

      // Decking photos
      photos_decking: ((photos?.decking || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_decking: ((photos?.decking || []).length ? [{}] : []),
    });
  } catch {}

  // ---- Extras (Plywood, Chimney, Skylights, Trim, Gutters, Detached, Custom)
  // Display only when the option is explicitly selected. ----
  try {
    const ply = pricing?.plywood || {};
    const ch  = pricing?.chimney || {};
    const sk  = pricing?.skylights || {};
    const tr  = pricing?.trim || {};
    const gu  = pricing?.gutters || {};
    const de  = pricing?.detached || {};
    const cu  = pricing?.customAdd || {};
    const anyExtraSelected = Boolean(
      ply?.selected || ch?.selected || sk?.selected || tr?.selected || gu?.selected || de?.selected || cu?.selected
    );
    Object.assign(data, { show_extra_options: showBool(anyExtraSelected) });

    // Plywood
    const plyModeLabel = ({
      replace: "replacing the existing plywood",
      overlay: "installing over the existing roof boards",
      new:     "installing new over the existing boards",
    } as AnyDict)[ply?.mode || ""] || (ply?.mode || "");
    // Fallback plywood total if not provided: squares * rateByMode[mode]
    const rateByMode = (ply as AnyDict)?.rateByMode || {};
    const plySquares = num((ply as AnyDict)?.squares || 0);
    const plyRate = num((rateByMode as AnyDict)[ply?.mode] || (ply as AnyDict)?.rate || 0);
    const plyComputed = round2(plySquares * plyRate);
    const plyTotal = num((ply as AnyDict)?.total || (ply as AnyDict)?.price || plyComputed || 0);
    Object.assign(data, {
      row_plywood: showBool(!!ply?.selected),
      plywood_mode_label: String(plyModeLabel || ""),
      plywood_areas: String(ply?.areas || ""),
      plywood_total: moneyStr(plyTotal),
      plywood_priority: String(ply?.priority === "maybe" ? "Might be Required" : (ply?.priority || "").toString().toUpperCase()),
      photos_extra_plywood: ((photos?.extra_plywood || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_plywood: ((photos?.extra_plywood || []).length ? [{}] : []),
    });

    // Chimney
    // Chimney: total = base price + cricket price (if selected)
    const chBase = num((ch as AnyDict)?.total || (ch as AnyDict)?.price || (ch as AnyDict)?.prices?.[ch?.size] || 0);
    const chCricket = ch?.cricket ? num((ch as AnyDict)?.cricketPrice || 0) : 0;
    const chSum = round2(chBase + chCricket);
    Object.assign(data, {
      row_chimney: showBool(!!ch?.selected),
      chimney_areas: String(ch?.areas || ""),
      chimney_cricket_on: showBool(!!ch?.cricket),
      chimney_total: moneyStr(chSum),
      photos_extra_chimney: ((photos?.extra_chimney || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_chimney: ((photos?.extra_chimney || []).length ? [{}] : []),
    });

    // Skylights
    const skInstall = (sk?.complexity === "framing_new" || sk?.complexity === "framing_new_complex") ? "Framing in new" : "Replacing existing";
    // Fallback compute if explicit prices not provided
    const adders = (sk?.adders || {}) as AnyDict;
    const add = num(adders[sk?.complexity] || 0);
    const base = (sk?.base || {}) as AnyDict;
    const fixedVal  = (sk as AnyDict)?.fixedPrice  ?? (num(base.fixed)  + add);
    const manualVal = (sk as AnyDict)?.manualPrice ?? (num(base.manual) + add);
    const solarVal  = (sk as AnyDict)?.solarPrice  ?? (num(base.solar)  + add);
    Object.assign(data, {
      row_skylights: showBool(!!sk?.selected),
      skylights_installMode_label: skInstall,
      skylights_areas: String(sk?.areas || ""),
      skylights_fixed: moneyStr(sk?.selected ? fixedVal : 0),
      skylights_manual: moneyStr(sk?.selected ? manualVal : 0),
      skylights_solar: moneyStr(sk?.selected ? solarVal : 0),
  // Placeholder subtotal fields for template compatibility (client recalculates based on qty)
  // Numeric-only so the template's preceding '$' remains single; client will update live
  skylights_total: ((): string => String(moneyStr(0)).replace(/^\s*\$\s*/, ""))(),
  row_skylights_total: showBool(!!sk?.selected),
      photos_extra_skylights: ((photos?.extra_skylights || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_skylights: ((photos?.extra_skylights || []).length ? [{}] : []),
    });

    // Trim
    const tf = (tr?.feet || {}) as AnyDict;
    // Compute trim total if not provided: rate (by material, adjusted for installMode) * total feet
    const trFeetSum = [
      tr?.feet?.soffit,
      tr?.feet?.fascias,
      tr?.feet?.frieze,
      tr?.feet?.molding,
      tr?.feet?.cornerBoards,
      tr?.feet?.windowDoor,
      tr?.feet?.rakeBoards,
      tr?.feet?.waterTable,
    ].reduce((a, b) => a + num(b || 0), 0);
    const trRates = (tr?.rates || {}) as AnyDict;
    const baseRate = num(tr?.material === 'cedar' ? trRates.cedar : trRates.azek);
    const adjRate = baseRate - (tr?.installMode === 'new' ? 2 : 0);
    const trComputed = round2(trFeetSum * adjRate);
    const trTotal = num((tr as AnyDict)?.total || trComputed || 0);
    Object.assign(data, {
      row_trim: showBool(!!tr?.selected),
      trim_material_label: (tr?.material === "cedar"
        ? "Clear Western Red Cedar trim boards installed using counter-sunken stainless steel trim screws."
        : "AZEK maintenenance free PVC trim installed using the CORTEX screw and plug invisible fastening system."),
      trim_install_mode_label: (tr?.installMode === "new" ? "Install new" : "Replace existing"),
      trim_areas: String(tr?.areas || ""),

      trim_feet_soffit:       Number(tf?.soffit || 0),
      trim_feet_fascias:      Number(tf?.fascias || 0),
      trim_feet_frieze:       Number(tf?.frieze || 0),
      trim_feet_molding:      Number(tf?.molding || 0),
      trim_feet_cornerBoards: Number(tf?.cornerBoards || 0),
      trim_feet_windowDoor:   Number(tf?.windowDoor || 0),
      trim_feet_rakeBoards:   Number(tf?.rakeBoards || 0),
      trim_feet_waterTable:   Number(tf?.waterTable || 0),

      row_trim_soffit:       showBool(Number(tf?.soffit || 0) > 0),
      row_trim_fascias:      showBool(Number(tf?.fascias || 0) > 0),
      row_trim_frieze:       showBool(Number(tf?.frieze || 0) > 0),
      row_trim_molding:      showBool(Number(tf?.molding || 0) > 0),
      row_trim_cornerBoards: showBool(Number(tf?.cornerBoards || 0) > 0),
      row_trim_windowDoor:   showBool(Number(tf?.windowDoor || 0) > 0),
      row_trim_rakeBoards:   showBool(Number(tf?.rakeBoards || 0) > 0),
  row_trim_waterTable:   showBool(Number(tf?.waterTable || 0) > 0),
  trim_total: moneyStr(trTotal),

  photos_extra_trim: ((photos?.extra_trim || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_trim: ((photos?.extra_trim || []).length ? [{}] : []),
    });

    // Gutters
    const down = (gu?.downspouts || {}) as AnyDict;
    const gutterTypeCode = String((gu as AnyDict)?.type || '').trim();
    const gutterTypeMap: AnyDict = {
      'aluminum5':  '5" Seamless Aluminum Gutters',
      'aluminum6':  '6" Seamless Aluminum Gutters',
      'copper5':    '5" Seamless Copper Gutters',
      'copper6':    '6" Seamless Copper Gutters',
      'copper_k5':  '5" K-style Copper Gutters',
      'copper_h6':  '6" Half-round Copper Gutters',
      'box':        'Box Gutters',
      'halfround5': '5" Half-round Gutters',
      'halfround6': '6" Half-round Gutters',
    };
    const gutterTypeRaw = gutterTypeMap[gutterTypeCode] || (gu as AnyDict)?.typeLabel || gutterTypeCode;
    const gutterTypeHuman = ((): string => {
      let label = String(gutterTypeRaw || '').trim();
      // If pricing provides a free-form label without the noun, append 'Gutters'
      if (label && !/\bgutters?\b/i.test(label)) label = `${label} Gutters`;
      return label;
    })();
    const downTypeLabel = (
      down?.type === 'down5' ? '5" Downspouts' :
      down?.type === 'down6' ? '6" Downspouts' :
      down?.type === 'copper_round' ? 'Copper Round Downspouts' :
      down?.type === 'aluminum_round' ? 'Aluminum Round Downspouts' : (down?.type || '')
    );
  // Gutters totals: compute from length/feet when totals missing
  const gFeet = num((gu as AnyDict)?.feet || (gu as AnyDict)?.linearFeet || 0);
  // Determine gutter $/ft: prefer explicit rate/unit; else use rates[type]; then apply installMode adjustments
  const rawGRate = (
    ((): number => {
      const explicit = num((gu as AnyDict)?.rate || (gu as AnyDict)?.unit || 0);
      if (explicit > 0) return explicit;
      const byType = num(((gu as AnyDict)?.rates || {})[(gu as AnyDict)?.type] || 0);
      return byType;
    })()
  );
  let gRate = rawGRate;
  const installMode = String((gu as AnyDict)?.installMode || "");
  if (gRate > 0) {
    if (installMode === "new") gRate -= 2; // new construction discount
    if (installMode === "angled_fascia") gRate += 4; // angled fascia upcharge
  }
  const guttersComputed = round2(gFeet * gRate);

  // Downspouts: prefer explicit rate/unit; else look up rates[type]
  const dsFeet = num((gu as AnyDict)?.downspouts?.feet || (gu as AnyDict)?.downspouts?.linearFeet || 0);
  const rawDsRate = (
    ((): number => {
      const explicit = num((gu as AnyDict)?.downspouts?.rate || (gu as AnyDict)?.downspouts?.unit || 0);
      if (explicit > 0) return explicit;
      const table = ((gu as AnyDict)?.downspouts?.rates || {}) as AnyDict;
      const byType = num(table[(gu as AnyDict)?.downspouts?.type] || 0);
      return byType;
    })()
  );
  const dsRate = rawDsRate;
  const downspoutsComputed = round2(dsFeet * dsRate);

  // Use provided totals if present, else fall back to computed
  const guttersBase = num((gu as AnyDict)?.total || (gu as AnyDict)?.price || guttersComputed || 0);
  const downspoutsBase = num((gu as AnyDict)?.downspouts?.total || (gu as AnyDict)?.downspouts?.price || downspoutsComputed || 0);
  const guttersTotal = round2(guttersBase + downspoutsBase);

  // Leaf guards are a separate line item; default $11/ft when only feet provided
  const lgFeet = num((gu as AnyDict)?.leafGuards?.feet || 0);
  const lgRate = num((gu as AnyDict)?.leafGuards?.rate || 11);
  const lgTotal = num((gu as AnyDict)?.leafGuards?.total || round2(lgFeet * lgRate) || 0);
  Object.assign(data, {
  row_gutters: showBool(!!gu?.selected),
  gutters_type_label: String(gutterTypeHuman || ""),
  gutters_areas: String(((gu as AnyDict)?.areas || "")).trim(),
    gutters_downspouts_type: downTypeLabel,
    gutters_total: moneyStr(guttersTotal),
  row_gutters_leafguards: showBool(!!gu?.leafGuards?.selected),
    gutters_leafguards_total: moneyStr(lgTotal),

      photos_extra_gutters: ((photos?.extra_gutters || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_gutters: ((photos?.extra_gutters || []).length ? [{}] : []),
    });

    // Detached structures
    const dsq = Number(de?.squares || 0);
    Object.assign(data, {
  row_detached: showBool(!!de?.selected),
      detached_type: String(de?.type === 'other' ? '' : (de?.type || '')),
      detached_type_label: (
        de?.type === 'garage' ? 'Garage' :
        de?.type === 'shed'   ? 'Shed'   :
        de?.type === 'barn'   ? 'Barn'   :
        de?.type === 'other'  ? (de?.otherLabel || 'Other') : (de?.type || '')
      ),
      detached_other_label: String(de?.otherLabel || ""),
      detached_squares: dsq,
      detached_landmark_total: moneyStr(dsq * Number(pricing?.unitPrice?.landmark || 0)),
      detached_pro_total:      moneyStr(dsq * Number(pricing?.unitPrice?.pro || 0)),
      detached_best_total:     moneyStr(dsq * Number(pricing?.unitPrice?.northgate || 0)),

      photos_extra_detached: ((photos?.extra_detached || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_detached: ((photos?.extra_detached || []).length ? [{}] : []),
    });

    // Custom extra
    const customPrice = num((cu as AnyDict)?.price || 0);
    Object.assign(data, {
  row_custom: showBool(!!cu?.selected && !!(cu?.label || '').trim() && customPrice > 0),
      custom_label: String((cu?.label || "").trim()),
      custom_price_formatted: moneyStr(customPrice),
      custom_price: moneyStr(customPrice),
      custom_price_raw: Number(customPrice),
      custom_price_num: Number(customPrice),

      photos_extra_custom: ((photos?.extra_custom || []) as any[]).map((p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" })),
      row_photos_extra_custom: ((photos?.extra_custom || []).length ? [{}] : []),
    });
  } catch {}

  // ---- Photos for roofing/siding buckets (best effort; safe if absent) ----
  try {
    const listOne = (id: string) => ((photos?.[id] || []) as any[]);
    const norm = (p: AnyDict) => ({ image: p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "" });
    const list = (id: string) => listOne(id).map(norm);
    // Merge multiple possible keys (aliases) for robustness; de-dup by src
    const listAliases = (...ids: string[]) => {
      const merged = ([] as AnyDict[]).concat(...ids.map(listOne));
      const seen = new Set<string>();
      const out: AnyDict[] = [];
      for (const p of merged) {
        const src = String(p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "");
        if (!src || seen.has(src)) continue;
        seen.add(src);
        out.push(norm(p));
      }
      return out;
    };
    const flag = (id: string, ...aliases: string[]) => {
      const any = ((photos?.[id] || []) as any[]).length || aliases.some(a => ((photos?.[a] || []) as any[]).length);
      return any ? [{}] : [];
    };
    Object.assign(data, {
      photos_roofing_asphalt: listAliases('roofing_asphalt', 'asphalt'),
      row_photos_roofing_asphalt: flag('roofing_asphalt', 'asphalt'),
      photos_roofing_davinci: listAliases('roofing_davinci', 'davinci'),
      row_photos_roofing_davinci: flag('roofing_davinci', 'davinci'),
      photos_roofing_cedar: listAliases('roofing_cedar', 'cedar'),
      row_photos_roofing_cedar: flag('roofing_cedar', 'cedar'),
      photos_roofing_rubber: listAliases('roofing_rubber', 'rubber'),
      row_photos_roofing_rubber: flag('roofing_rubber', 'rubber'),

      photos_siding_cedarShake: list('siding_cedarShake'),
      row_photos_siding_cedarShake: flag('siding_cedarShake'),
      photos_siding_synthetic: listAliases('siding_synthetic', 'siding'),
      row_photos_siding_synthetic: flag('siding_synthetic', 'siding'),
      photos_siding_vinyl: list('siding_vinyl'),
      row_photos_siding_vinyl: flag('siding_vinyl'),
      photos_siding_clapBoard: list('siding_clapBoard'),
      row_photos_siding_clapBoard: flag('siding_clapBoard'),

      // Windows & Doors photos (support legacy alias keys)
      photos_extra_windows_and_doors: listAliases('extra_windows_and_doors', 'windows_doors', 'windows_and_doors'),
      row_photos_extra_windows_and_doors: flag('extra_windows_and_doors', 'windows_doors', 'windows_and_doors'),

      // Extras aliases (accept non-prefixed keys)
      photos_extra_plywood: listAliases('extra_plywood', 'plywood'),
      row_photos_extra_plywood: flag('extra_plywood', 'plywood'),
      photos_extra_chimney: listAliases('extra_chimney', 'chimney'),
      row_photos_extra_chimney: flag('extra_chimney', 'chimney'),
      photos_extra_skylights: listAliases('extra_skylights', 'skylights'),
      row_photos_extra_skylights: flag('extra_skylights', 'skylights'),
      photos_extra_trim: listAliases('extra_trim', 'trim'),
      row_photos_extra_trim: flag('extra_trim', 'trim'),
      photos_extra_gutters: listAliases('extra_gutters', 'gutters'),
      row_photos_extra_gutters: flag('extra_gutters', 'gutters'),
      photos_extra_detached: listAliases('extra_detached', 'detached'),
      row_photos_extra_detached: flag('extra_detached', 'detached'),
      photos_extra_custom: listAliases('extra_custom', 'custom'),
      row_photos_extra_custom: flag('extra_custom', 'custom'),
    });
  } catch {}

  return data;
}

function renderDocxLikeTemplate(html: string, data: AnyDict) {
  let out = String(html || "");
  const sectionRe = /\{#([a-zA-Z0-9_\.]+)\}([\s\S]*?)\{\/\1\}/g;
  let pass = 0;
  while (sectionRe.test(out) && pass < 50) {
    pass++;
    out = out.replace(sectionRe, (_m: string, key: string, inner: string) => {
      const val = getVal(data, key);
      if (Array.isArray(val)) return val.map((item) => renderDocxLikeInner(inner, { ...data, ...item }, item)).join("");
      if (val) return renderDocxLikeInner(inner, data, null);
      return "";
    });
  }
  out = out.replace(/\{([a-zA-Z0-9_\.]+)\}/g, (_m: string, key: string) => escapeHtml(String(getVal(data, key) ?? "")));
  return out;
}

function renderDocxLikeInner(tpl: string, data: AnyDict, item: AnyDict | null) {
  let s = String(tpl || "");
  s = s.replace(/\{%image\}/g, () => {
    const src = String((item && item.image) || getVal(data, "image") || "");
    if (!src) return "";
    const safe = escapeHtmlAttr(src);
  return `<img class="proposal-photo" src="${safe}" alt="Photo" style="max-width:100%;height:auto;" />`;
  });
  s = s.replace(/\{([a-zA-Z0-9_\.]+)\}/g, (_m: string, key: string) => escapeHtml(String(getVal(item ? { ...data, ...item } : data, key) ?? "")));
  return s;
}

function getVal(obj: AnyDict, path: string) {
  if (!obj) return undefined;
  if (!path || typeof path !== "string") return undefined;
  if (path.includes(".")) return path.split(".").reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), obj);
  return obj[path];
}

function escapeHtmlAttr(s: any) {
  const str = String(s ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderProposalTemplate(html: string, view: WebProposal, snap: any) {
  let out = String(html || "");

  // Do not strip siding show/hide wrappers; we now fully honor template gating

  // Mask {{double-curly}} so the single-brace renderer doesn't partially match them
  const OPEN = "__DBL_OPEN__";
  const CLOSE = "__DBL_CLOSE__";
  const masked = out.replace(/\{\{/g, OPEN).replace(/\}\}/g, CLOSE);

  // Word HTML sometimes inserts spans/tags inside our {tokens}; normalize those
  let normalized = normalizeWordTokens(masked);
  // Case-normalize row_ and siding_synthetic tokens (Word sometimes changes case)
  normalized = normalized
    .replace(/\{([#\/]?row_siding_synthetic_[a-zA-Z0-9_.]+)\}/g, (_m, g1) => `{${String(g1).toLowerCase()}}`)
    .replace(/\{(siding_synthetic_[a-zA-Z0-9_.]+)\}/g, (_m, g1) => `{${String(g1).toLowerCase()}}`);

  // Build data once for subsequent passes
  const docxData = buildDocxLikeData(snap || {}, view);

  // Pre-expand any one-line photo loops of the form {#photos_x}{%image} that lack an explicit closing tag
  // Some Word exports strip the {/photos_x} close; expand these inline using available data.
  // Handle both one-line and multi-line sequences where Word split tokens across paragraphs
  const photoSeqRe = /\{#(photos_[a-zA-Z0-9_]+)\}([\s\S]{0,600}?)\{%image\}/g;
  const preExpanded = normalized.replace(photoSeqRe, (_m: string, key: string) => {
    const arr = (getVal(docxData as any, key) as any[]) || [];
    if (!Array.isArray(arr) || arr.length === 0) return "";
    return arr.map((item) => renderDocxLikeInner("{%image}", { ...(docxData as any), ...(item || {}) }, item || null)).join("");
  });

  // Run DOCX-like pass (safe now; won't touch masked {{...}})
  if (/[{]#|\{[a-zA-Z0-9_]+\}/.test(preExpanded)) {
    out = renderDocxLikeTemplate(preExpanded, docxData)
      .replace(new RegExp(OPEN, "g"), "{{")
      .replace(new RegExp(CLOSE, "g"), "}}");
  } else {
    out = preExpanded.replace(new RegExp(OPEN, "g"), "{{").replace(new RegExp(CLOSE, "g"), "}}");
  }

  // Fallback: replace any remaining synthetic subtotal/total tokens directly (post-render)
  const synAmt = String(
    docxData.siding_synthetic_subtotal ||
    docxData.siding_synthetic_subTotal ||
    docxData.siding_synthetic_total || ""
  );
  if (synAmt) {
    out = out
      .replace(/\{siding_synthetic_sub[Tt]otal\}/g, escapeHtml(synAmt))
      .replace(/\{siding_synthetic_total\}/g, escapeHtml(synAmt));
  }
  // Map generic siding totals to section-specific amounts so each section only shows its own total
  const secAmt = {
    cedar: String(docxData.siding_cedar_subtotal || docxData.siding_cedar_subTotal || docxData.siding_cedar_total || ""),
    vinyl: String(docxData.siding_vinyl_subtotal || docxData.siding_vinyl_subTotal || docxData.siding_vinyl_total || ""),
    clap:  String(docxData.siding_clap_subtotal  || docxData.siding_clap_subTotal  || docxData.siding_clap_total  || ""),
  } as Record<string, string>;
  // Helper: within a section's inner HTML, enforce a TOTAL INVESTMENT amount even if Word split tokens across tags
  function enforceTotalLine(innerHtml: string, amount: string): string {
    if (!amount) return innerHtml;
    let s = innerHtml;
    // Normalize any Word-split {siding_total}/{siding_subtotal} tokens to a plain placeholder to replace
    const braceToken = /\{\s*(?:<[^>]+>\s*)*(siding_(?:sub)?total)(?:\s*<[^>]+>)*\s*\}/gi;
    s = s.replace(braceToken, (_m, _key: string) => escapeHtml(amount));
    // If TOTAL INVESTMENT is present but has no amount, inject the amount after the label
    const totalLineRe = /(TOTAL\s+INVESTMENT\s*[:\-–—]?)([\s\S]{0,200}?)(?=<\/|$)/i;
    s = s.replace(totalLineRe, (full: string, label: string, tail: string) => {
      // If there's already a $number somewhere in the tail, leave as-is
      if (/\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?/.test(tail)) return full;
      // Remove stray placeholder underscores or orphan '$'
      const cleanTail = tail.replace(/[_\s\u00A0]+/g, " ").replace(/\$\s*(?![0-9])/g, "");
      const injected = `${label} ${escapeHtml(amount)}`;
      // Preserve the original trailing content if it's not just junk
      const keep = /\S/.test(cleanTail) ? ` ${cleanTail}` : "";
      return injected + keep;
    });
    return s;
  }

  // Asphalt-only guard: strip the incorrect centered TD label row that says "TOTAL INVESTMENT:" inside the Asphalt section.
  // This ignores only the TD-based label and leaves the correct pill paragraph intact. No enforcement/cleanup runs for Asphalt.
  out = out.replace(/\{#show_asphalt\}([\s\S]*?)\{\/show_asphalt\}/gi, (m: string, inner: string) => {
    let replaced = inner;
    // Remove a <tr><td colspan=4> ... TOTAL INVESTMENT ... </td></tr> row variant
    replaced = replaced.replace(
      /<tr[^>]*>\s*<td[^>]*colspan=["']?4["']?[^>]*>\s*<b>\s*<u>\s*<span[^>]*>\s*TOTAL\s+INVESTMENT\s*:?\s*<\/span>\s*<\/u>\s*<\/b>\s*<\/td>\s*<\/tr>/gi,
      ""
    );
    // Also catch a standalone TD cell when the row isn’t wrapped in <tr> (Word quirks)
    replaced = replaced.replace(
      /<td[^>]*colspan=["']?4["']?[^>]*>\s*<b>\s*<u>\s*<span[^>]*>\s*TOTAL\s+INVESTMENT\s*:?\s*<\/span>\s*<\/u>\s*<\/b>\s*<\/td>/gi,
      ""
    );
    return replaced;
  });
  // Scoped cleanup: remove stray TOTAL INVESTMENT rows without a $amount ONLY within siding sections
  const stripTotalRows = (html: string): string => {
    return String(html || "").replace(
      /<tr[^>]*>\s*<td[^>]*>\s*(?:<[^>]+>\s*)*TOTAL\s+INVESTMENT\s*[:\-–—]?\s*(?:<[^>]+>\s*)*<\/td>\s*<\/tr>/gi,
      (row: string) => (/\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?/.test(row) ? row : "")
    );
  };
  // Synthetic section wrappers
  out = out.replace(/\{#show_siding_synthetic\}([\s\S]*?)\{\/show_siding_synthetic\}/gi, (m: string, inner: string) => {
    const amt = String(
      docxData.siding_synthetic_subtotal || docxData.siding_synthetic_subTotal || docxData.siding_synthetic_total || ""
    );
    let replaced = inner
      .replace(/\{siding_sub[Tt]otal\}/g, amt ? escapeHtml(amt) : "")
      .replace(/\{siding_total\}/g, amt ? escapeHtml(amt) : "");
    // Robust: also enforce TOTAL line in case tokens were split or the row didn't render
  replaced = enforceTotalLine(replaced, amt);
  // Siding-only cleanup to drop orphan TOTAL INVESTMENT rows without an amount
  replaced = stripTotalRows(replaced);
    return replaced;
  });
  // Cedar section wrappers
  out = out.replace(/\{#show_siding_cedarShake\}([\s\S]*?)\{\/show_siding_cedarShake\}/gi, (m: string, inner: string) => {
    const amt = secAmt.cedar || "";
    let replaced = inner
      .replace(/\{siding_sub[Tt]otal\}/g, amt ? escapeHtml(amt) : "")
      .replace(/\{siding_total\}/g, amt ? escapeHtml(amt) : "");
  replaced = enforceTotalLine(replaced, amt);
  replaced = stripTotalRows(replaced);
    return replaced;
  });
  // Vinyl section wrappers
  out = out.replace(/\{#show_siding_vinyl\}([\s\S]*?)\{\/show_siding_vinyl\}/gi, (m: string, inner: string) => {
    const amt = secAmt.vinyl || "";
    let replaced = inner
      .replace(/\{siding_sub[Tt]otal\}/g, amt ? escapeHtml(amt) : "")
      .replace(/\{siding_total\}/g, amt ? escapeHtml(amt) : "");
  replaced = enforceTotalLine(replaced, amt);
  replaced = stripTotalRows(replaced);
    return replaced;
  });
  // Clap Board section wrappers
  out = out.replace(/\{#show_siding_clapBoard\}([\s\S]*?)\{\/show_siding_clapBoard\}/gi, (m: string, inner: string) => {
    const amt = secAmt.clap || "";
    let replaced = inner
      .replace(/\{siding_sub[Tt]otal\}/g, amt ? escapeHtml(amt) : "")
      .replace(/\{siding_total\}/g, amt ? escapeHtml(amt) : "");
  replaced = enforceTotalLine(replaced, amt);
  replaced = stripTotalRows(replaced);
    return replaced;
  });
  // If a stray closing show_siding_synthetic remains, inject a total pill there
  if (/\{\/show_siding_synthetic\}/i.test(out)) {
    const amt = synAmt || "";
    let pill = "";
    if (amt) {
      // Match standard siding total styling: plain centered, inherit base font size
  pill = `<p style="text-align:center;margin:8px 0 6px 0"><strong style="font-size:1.2em;">TOTAL INVESTMENT:</strong> <span class="synthetic-total-amount">${escapeHtml(amt)}</span></p>`;
    }
    out = out.replace(/\{\/show_siding_synthetic\}/gi, pill);
    out = out.replace(/<span[^>]*display:inline-flex[^>]*>([\s\S]*?TOTAL INVESTMENT:[\s\S]*?)<\/span>/gi, '$1');
  }
  // Mirror pill fallback for Cedar Shake
  if (/\{\/show_siding_cedarShake\}/i.test(out)) {
    const amt = String(docxData.siding_cedar_subtotal || docxData.siding_cedar_subTotal || docxData.siding_cedar_total || "");
    let pill = "";
    if (amt) {
      pill = `<p style="text-align:center;margin:8px 0 6px 0"><strong style="font-size:1.2em;">TOTAL INVESTMENT:</strong> <span class="cedar-total-amount">${escapeHtml(amt)}</span></p>`;
    }
    out = out.replace(/\{\/show_siding_cedarShake\}/gi, pill);
  }
  // Mirror pill fallback for Vinyl
  if (/\{\/show_siding_vinyl\}/i.test(out)) {
    const amt = String(docxData.siding_vinyl_subtotal || docxData.siding_vinyl_subTotal || docxData.siding_vinyl_total || "");
    let pill = "";
    if (amt) {
      pill = `<p style="text-align:center;margin:8px 0 6px 0"><strong style="font-size:1.2em;">TOTAL INVESTMENT:</strong> <span class="vinyl-total-amount">${escapeHtml(amt)}</span></p>`;
    }
    out = out.replace(/\{\/show_siding_vinyl\}/gi, pill);
  }
  // Mirror pill fallback for Clap Board
  if (/\{\/show_siding_clapBoard\}/i.test(out)) {
    const amt = String(docxData.siding_clap_subtotal || docxData.siding_clap_subTotal || docxData.siding_clap_total || "");
    let pill = "";
    if (amt) {
      pill = `<p style="text-align:center;margin:8px 0 6px 0"><strong style="font-size:1.2em;">TOTAL INVESTMENT:</strong> <span class="clap-total-amount">${escapeHtml(amt)}</span></p>`;
    }
    out = out.replace(/\{\/show_siding_clapBoard\}/gi, pill);
  }
  // Final cleanup of any remaining synthetic tokens (render raw amount or drop)
  out = out.replace(/\{siding_synthetic_[a-zA-Z0-9_.]+\}/g, (m) => {
    if (/sub[Tt]otal|total/.test(m)) return escapeHtml(synAmt);
    return ""; // drop other orphan synthetic tokens if still present
  });

  // Back-compat: also replace any {{double-curly}} placeholders
  const rep = buildReplacements(view, snap);
  for (const [key, val] of Object.entries(rep)) {
    const re = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}}`, "g");
    out = out.replace(re, String(val));
  }

  // Rewrite relative asset URLs so they load under our public path when HTML is injected
  out = rewriteAssetUrls(out, "/templates/hytech");
  // Collapse empty paragraphs and table rows to keep spacing uniform
  out = collapseEmptyBlocks(out);
  // Ensure consistent spacing between non-empty line-item paragraphs without removing spacer paragraphs
  out = enforceParagraphSpacing(out);
  // Normalize line-item rows: remove trailing empty paragraphs/brs inside content cells to avoid inconsistent gaps
  out = enforceLineItemRowSpacing(out);
  // Normalize table structure: remove border-spacing gaps and collapse borders
  out = normalizeTables(out);
  // Expand the yellow COLOR blank only in the Synthetic Siding section
  out = expandSyntheticSidingColorBlank(out);

  // Global cleanup removed: avoid deleting legitimate roofing GBB rows

  return out;
}

function escapeRegExp(s: string) {
  // Escape special regex characters in a string so it can be safely used inside a RegExp
  // NOTE: The correct, balanced character class is: /[.*+?^${}()|[\]\\]/
  // Common reference implementation from MDN: /[.*+?^${}()|[\]\\]/g
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: any) {
  const str = String(s ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Convert src/href/url() paths to an absolute under basePath, including Word .fld folders
function rewriteAssetUrls(html: string, basePath: string) {
  let out = String(html || "");
  function needsRewrite(u: string) {
    const v = (u || "").trim();
    if (!v) return false;
    const lower = v.toLowerCase();
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) return false;
    if (v.startsWith(basePath + "/")) return false; // already absolute to base
    if (v.startsWith("/")) return false; // site-absolute
    return true; // relative like "image001.png", "./folder/file"
  }
  function normalize(u: string) {
    const clean = u.replace(/^\.\//, "");
    const idx = clean.indexOf(".fld/");
    if (idx !== -1) return `assets/${clean.substring(idx + 5)}`;
    return clean;
  }
  // src="..." and src='...'
  out = out.replace(/src=("|')([^"']+)(\1)/g, (_m: string, q: string, val: string, q2: string) => {
    if (!needsRewrite(val)) return `src=${q}${val}${q2}`;
    return `src=${q}${basePath}/${normalize(val)}${q2}`;
  });
  // href="..." and href='...'
  out = out.replace(/href=("|')([^"']+)(\1)/g, (_m: string, q: string, val: string, q2: string) => {
    if (!needsRewrite(val)) return `href=${q}${val}${q2}`;
    return `href=${q}${basePath}/${normalize(val)}${q2}`;
  });
  // url(...) in inline styles
  out = out.replace(/url\(\s*("|')?([^"')]+)(\1)?\s*\)/g, (_m: string, q: string | undefined, val: string) => {
    const v = (val || "").trim();
    if (!needsRewrite(v)) return `url(${q || ""}${v}${q || ""})`;
    return `url(${q || ""}${basePath}/${normalize(v)}${q || ""})`;
  });
  return out;
}

// Remove empty <p> and table rows where the content cell is empty (e.g., "Supply and Install" rows with no description)
function collapseEmptyBlocks(html: string) {
  let out = String(html || "");
  const stripText = (s: string) => s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // IMPORTANT: Do not drop empty paragraphs globally.
  // Word-exported templates often use blank <p> elements for layout/column spacing.
  // Removing them can cause sections to visually collide (e.g., Rubber Roofing total overlapping Siding header).
  // We intentionally keep empty <p> tags here and only perform conservative table-row cleanup below.

  // Remove table rows where non-label cells are empty
  out = out.replace(/<tr(\s[^>]*)?>[\s\S]*?<\/tr>/gi, (row: string) => {
    // Collect tds
    const tds = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (tds.length < 2) return row;
    // Normalize each cell's text
    const texts = tds.map((td) => stripText(td));
    const imgs  = tds.map((td) => /<img\b/i.test(td));
    // A common pattern is two columns: left is a static label (e.g., "Supply and Install"), right is the content.
    const left = (texts[0] || '').toLowerCase();
    const restEmpty = texts.slice(1).every((t, i) => t.length === 0 && !imgs[i + 1]);
    const isLabel = ["supply and install", "clean and remove", "area:", "notes:"].some((k) => left === k || left.startsWith(k));
    if (restEmpty && isLabel) return "";
    // If all cells are empty, remove row
    const allEmpty = texts.every((t, i) => t.length === 0 && !imgs[i]);
    if (/<img\b/i.test(row)) return row; // never drop rows that contain images
    if (allEmpty) return "";
    return row;
  });

  // Collapse multiple consecutive completely empty paragraphs only if we created them
  // during earlier row removals. Keep at least one to preserve intended spacing.
  out = out.replace(/(\s*<p(\s[^>]*)?>\s*<\/p>\s*){3,}/gi, (m: string) => {
    // Replace runs of 3+ empties with a single empty paragraph block
    return m.replace(/(\s*<p(\s[^>]*)?>\s*<\/p>\s*)+/gi, '<p></p>');
  });
  return out;
}

// Clean up Word-exported HTML that breaks tokens with inline spans/tags.
// Only rewrites braces that look like our tokens after removing tags.
function normalizeWordTokens(html: string) {
  let out = String(html || "");
  // Normalize generic tokens with optional tags inserted by Word/Office
  out = out.replace(/\{(?:[^{}<]|<[^>]*>)*\}/g, (m: string) => {
    const inner = m.slice(1, -1);
    const stripped = inner.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    const compact = stripped.replace(/\s+/g, "");
    // Accept tokens like: token, a.b, a_b, #section, /section
    if (/^[#\/]?[a-zA-Z0-9_.]+$/.test(compact)) return `{${compact}}`;
    // Also accept {%image} and other percent-prefixed simple tokens
    if (/^%[a-zA-Z0-9_]+$/.test(compact)) return `{${compact}}`;
    return m;
  });
  // Hard-normalize any Word-broken variants of {%image} with spaces/tags inside
  out = out.replace(/\{(?:[^{}<]|<[^>]*>)*%\s*image(?:[^{}<]|<[^>]*>)*\}/gi, "{%image}");
  return out;
}

// Apply a consistent margin to paragraphs that contain real text content.
// Empty paragraphs are intentionally left as-is (they act as layout spacers in Word HTML).
function enforceParagraphSpacing(html: string) {
  const strip = (s: string) => s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return String(html || "").replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (m: string, attrs: string | undefined, inner: string) => {
    const text = strip(inner);
    if (!text) return m; // keep empty paragraphs untouched
    const hasStyle = attrs && /\sstyle\s*=\s*("|')[^"']*(\1)/i.test(attrs);
    if (hasStyle) {
      // Append margin rule to existing style attribute (handles single or double quotes)
      return m.replace(/style=("|')(.*?)(\1)/i, (_mm: string, q: string, val: string, q2: string) => {
        const next = /;\s*$/.test(val) ? `${val} margin:0 0 6px 0;` : `${val}; margin:0 0 6px 0;`;
        return `style=${q}${next}${q2}`;
      });
    }
    const a = attrs || ""; // includes leading space if present
    return `<p${a} style=\"margin:0 0 6px 0;\">${inner}</p>`;
  });
}

// For table rows that look like label/content line items, strip trailing empty paragraphs and <br/>s
// from the content cells so spacing is consistent across rows even when placeholders leave blanks.
function enforceLineItemRowSpacing(html: string) {
  const stripText = (s: string) => s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isLabelLeft = (left: string) => {
    const l = left.toLowerCase();
    return ["supply and install", "clean and remove", "area:", "notes:"].some((k) => l === k || l.startsWith(k));
  };
  return String(html || "").replace(/<tr(\s[^>]*)?>[\s\S]*?<\/tr>/gi, (row: string) => {
    const tds = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (tds.length < 2) return row;
    // Clean each non-label cell to ensure consistent inner spacing
    const newTds = tds.map((td, i) => {
      let cleaned = td;
      // Normalize padding/line-height on ALL cells
      cleaned = cleaned.replace(/<td([^>]*)>/i, (_m: string, attrs: string) => {
        const hasStyle = /\sstyle\s*=\s*("|')[^"']*(\1)/i.test(attrs);
        if (hasStyle) {
          return `<td${attrs.replace(/style=("|')(.*?)(\1)/i, (_mm: string, q: string, val: string, q2: string) => {
            let v = val
              .replace(/padding-top\s*:[^;]*;?/gi, '')
              .replace(/padding-bottom\s*:[^;]*;?/gi, '')
              .replace(/line-height\s*:[^;]*;?/gi, '')
              .trim();
            if (v && !/;\s*$/.test(v)) v = v + ';';
            v += ' padding-top:0; padding-bottom:8px; line-height:1.25;';
            return `style=${q}${v}${q2}`;
          })}>`;
        }
        const a = attrs || '';
        return `<td${a} style="padding-top:0; padding-bottom:8px; line-height:1.25;">`;
      });

      if (i === 0) return cleaned; // Left cell only gets normalization

      // Right/content cell gets deeper cleanup below
  // Remove ANY empty paragraphs inside this td (leading, middle, trailing)
  cleaned = cleaned.replace(/<p(\s[^>]*)?>\s*(?:&nbsp;|\s|<br\s*\/?\s*>)*<\/p>/gi, "");
  // Compress multiple <br> into a single <br>
  cleaned = cleaned.replace(/(?:<br\s*\/?\s*>\s*){2,}/gi, '<br/>');
  // Remove trailing <br> and whitespace before </td>
  cleaned = cleaned.replace(/(?:(?:<br\s*\/?\s*>|&nbsp;|\s)+)(?=<\/td>)/gi, "");

  // Remove punctuation-only filler paragraphs (common Word artifacts like a single dash)
  cleaned = cleaned.replace(/<p(\s[^>]*)?>[\s\u00A0]*(?:[-–—•])[\s\u00A0]*<\/p>/gi, "");

      // Enforce consistent top/bottom padding on the content cell
      cleaned = cleaned.replace(/<td([^>]*)>/i, (_m: string, attrs: string) => {
        const hasStyle = /\sstyle\s*=\s*("|')[^"']*(\1)/i.test(attrs);
        if (hasStyle) {
          return `<td${attrs.replace(/style=("|')(.*?)(\1)/i, (_mm: string, q: string, val: string, q2: string) => {
            // Remove any existing padding-top/bottom to avoid conflicts then append ours
            let v = val
              .replace(/padding-top\s*:[^;]*;?/gi, '')
              .replace(/padding-bottom\s*:[^;]*;?/gi, '')
              .replace(/line-height\s*:[^;]*;?/gi, '')
              .trim();
            if (v && !/;\s*$/.test(v)) v = v + ';';
            v += ' padding-top:0; padding-bottom:8px; line-height:1.25;';
            return `style=${q}${v}${q2}`;
          })}>`;
        }
        const a = attrs || '';
        return `<td${a} style="padding-top:0; padding-bottom:8px; line-height:1.25;">`;
      });

      // Remove any leading <br> or whitespace immediately after the <td> open tag
      cleaned = cleaned.replace(/(<td[^>]*>)(?:\s|&nbsp;|<br\s*\/?\s*>)+/i, '$1');

      // Normalize paragraphs: keep image-only paragraphs, drop truly empty ones, and force zero margins
      cleaned = cleaned.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (m: string, a: string | undefined, inner: string) => {
        const hasImg = /<img\b/i.test(inner);
        const vis = stripText(inner);
        // If there's no text and no image (or only punctuation), drop the paragraph entirely
        if (!hasImg && (!vis || /^[\-–—•_,.;:()\[\]\s\u00A0]+$/.test(vis))) return "";
        // Otherwise, preserve the content and normalize paragraph margins to zero
        if (a && /\sstyle\s*=\s*("|')[^"']*(\1)/i.test(a)) {
          return `<p${a.replace(/style=("|')(.*?)(\1)/i, (_s: string, q: string, val: string, q2: string) => {
            let v = val
              .replace(/margin-top\s*:[^;]*;?/gi, '')
              .replace(/margin-bottom\s*:[^;]*;?/gi, '')
              .trim();
            if (v && !/;\s*$/.test(v)) v = v + ';';
            v += ' margin-top:0; margin-bottom:0;';
            return `style=${q}${v}${q2}`;
          })}>${inner}</p>`;
        }
        const attrs = a || '';
        return `<p${attrs} style="margin-top:0; margin-bottom:0;">${inner}</p>`;
      });

      // Make the last non-empty paragraph inside this td have zero bottom margin (already zero) — nothing else to do,
      // but keep the structure below to handle index recalculation if needed for future edits
      const pMatches = Array.from(cleaned.matchAll(/<p(\s[^>]*)?>[\s\S]*?<\/p>/gi));
      const nonEmptyIndexes: number[] = [];
      for (let idx = 0; idx < pMatches.length; idx++) {
        if (stripText(pMatches[idx][0]).length > 0) nonEmptyIndexes.push(idx);
      }
      const lastIdx = nonEmptyIndexes.length ? nonEmptyIndexes[nonEmptyIndexes.length - 1] : -1;
      const firstIdx = nonEmptyIndexes.length ? nonEmptyIndexes[0] : -1;
      if (nonEmptyIndexes.length) {
        // Adjust every paragraph: remove margin-top/bottom then set normalized values
        for (let k = 0; k < pMatches.length; k++) {
          const m = pMatches[k];
          const pStr = m[0];
          const isEmpty = stripText(pStr).length === 0;
          const start = m.index as number;
          const end = start + pStr.length;
          let updated = pStr;
          if (!isEmpty) {
            updated = pStr.replace(/<p([^>]*)>/i, (_pm: string, a: string) => {
              if (/\sstyle\s*=\s*("|')[^"']*(\1)/i.test(a)) {
                return `<p${a.replace(/style=("|')(.*?)(\1)/i, (_s: string, q: string, val: string, q2: string) => {
                  let v = val
                    .replace(/margin-top\s*:[^;]*;?/gi, '')
                    .replace(/margin-bottom\s*:[^;]*;?/gi, '')
                    .trim();
                  if (v && !/;\s*$/.test(v)) v = v + ';';
                  // Enforce zero margins; row spacing handled by td padding
                  v += ' margin-top:0; margin-bottom:0;';
                  return `style=${q}${v}${q2}`;
                })}>`;
              }
              return `<p${a} style="margin-top:0; margin-bottom:0;">`;
            });
          }
          cleaned = cleaned.slice(0, start) + updated + cleaned.slice(end);
          // Recompute matches indices after mutation by adjusting offsets would be complex;
          // instead, re-run matching if more paragraphs remain.
          if (k < pMatches.length - 1) {
            const head = cleaned.slice(0, start) + updated;
            const tail = cleaned.slice(start + pStr.length);
            const rem = Array.from(tail.matchAll(/<p(\s[^>]*)?>[\s\S]*?<\/p>/gi));
            for (let r = 0; r < rem.length; r++) {
              const adj = rem[r];
              // Shift indexes relative to full string
              (adj as any).index = (adj.index as number) + head.length;
            }
            // Replace remaining matches in our local array for correct indexing
            pMatches.splice(k + 1, pMatches.length - (k + 1), ...rem);
          }
        }
      }
      return cleaned;
    });
    // Rebuild this row by replacing each original td once
    let rebuilt = row;
    for (let i = 0; i < tds.length; i++) {
      rebuilt = rebuilt.replace(tds[i], newTds[i]);
    }
    return rebuilt;
  });
}

// Normalize table-level spacing so Word's border-spacing doesn't create phantom vertical gaps
function normalizeTables(html: string) {
  return String(html || "").replace(/<table([^>]*)>/gi, (_m: string, attrs: string) => {
    const hasStyle = /\sstyle\s*=\s*("|')[^"']*(\1)/i.test(attrs);
    if (hasStyle) {
      return `<table${attrs.replace(/style=("|')(.*?)(\1)/i, (_mm: string, q: string, val: string, q2: string) => {
        let v = val
          .replace(/border-collapse\s*:[^;]*;?/gi, '')
          .replace(/border-spacing\s*:[^;]*;?/gi, '')
          .trim();
        if (v && !/;\s*$/.test(v)) v = v + ';';
        v += ' border-collapse:collapse; border-spacing:0;';
        return `style=${q}${v}${q2}`;
      })}>`;
    }
    const a = attrs || '';
    return `<table${a} style="border-collapse:collapse; border-spacing:0;">`;
  });
}

// Expand spans that use a yellow highlight as a "fill-in-the-blank" to a standard width and draw an underline,
// so sections like Synthetic Siding have the same visual as Asphalt/Davinci.
function expandSyntheticSidingColorBlank(html: string) {
  let out = String(html || "");
  // Only operate on Synthetic Siding pattern: literal "COLOR_" followed by a yellow-highlight span.
  // Do NOT touch Asphalt/Davinci: they use "COLOR:" and a long underscore string inside the span.
  const yellowRe = /(COLOR_[\s\S]{0,240}?)(<span([^>]*)style=(["'])([^"']*)(\4)([^>]*)>)([\s\S]*?)(<\/span>)/i;
  const yellowStyleRe = /(?:background(?:-color)?|mso-highlight)\s*:\s*(?:#?ffff00|yellow)/i;
  out = out.replace(yellowRe, (
    _m: string,
    pfx: string,
    spanOpen: string,
    _a3: string,
    q: string,
    styleVal: string,
    _q2: string,
    _restAttrs: string,
    inner: string,
    spanClose: string
  ) => {
    // Ensure it's a yellow highlight span and not the Asphalt long-underscore variant
    if (!(yellowStyleRe.test(styleVal) || yellowStyleRe.test(spanOpen))) return _m;
    const innerText = inner.replace(/<[^>]*>/g, '').trim();
    if (/_{3,}/.test(innerText)) return _m; // skip spans that already have long underscores (Asphalt/Davinci)

    // Normalize styles and enforce a wide highlighted blank that stays even when empty
    let newStyle = styleVal
      .replace(/display\s*:[^;]*;?/gi, '')
      .replace(/min-width\s*:[^;]*;?/gi, '')
      .replace(/border-bottom\s*:[^;]*;?/gi, '')
      .replace(/height\s*:[^;]*;?/gi, '')
      .replace(/line-height\s*:[^;]*;?/gi, '')
      .trim();
    if (newStyle && !/;\s*$/.test(newStyle)) newStyle += ';';
    newStyle += ' display:inline-block; min-width:320px; border-bottom:2px solid #0a0a0a; height:1.1em; line-height:1.1; background-color:#ffff00;';

    // If there's no real value, put a nbsp so the block doesn't fully collapse visually
    const hasValue = innerText && !/^_+$/.test(innerText);
    const newInner = hasValue ? innerText : '&nbsp;';
    const rebuiltOpen = spanOpen.replace(/style=("|')(.*?)(\1)/i, (_s: string, _qAll: string) => `style=${q}${newStyle}${q}`);
    return pfx + rebuiltOpen + newInner + spanClose;
  });

  return out;
}
