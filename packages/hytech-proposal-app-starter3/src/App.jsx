import React, { useEffect, useMemo, useRef, useState } from "react";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import { saveAs } from "file-saver";

/**
 * HyTech Proposal App — single-file React prototype
 * Updated: 2025-08-18
 * - Skylights "Edit prices" toggle hides Base/Adder fields unless checked.
 * - "Specify areas being replaced" lines added across roofing, siding, decking, chimney, skylights, trim, gutters.
 * - Install type "Install new" vs "Replace existing" added to chimney, skylights, trim, gutters.
 *   (−$2/ft automatically applied to TRIM and GUTTERS when "Install new".)
 * - Trim shows a computed total line.
 * - Detached structures: Garage / Shed / Barn / Other (with "Specify structure").
 * - Decking: new top tab + customer-tab material checkboxes; full Decking section with
 *   "building new"/"resurfacing" sqft, railing options (Custom → specify).
 * - Print view surfaces the "areas being replaced" details for roofing/decking/extras.
 */

// ---------- Small helpers
 
const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v || "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(num(n) * 100) / 100;
const fmtMoney = (n) =>
  isNaN(n)
    ? "$0.00"
    : n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const fmtMaybe = (hide, n) => (hide ? "TBD" : fmtMoney(n));

// ---------- Local storage hook
function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ---------- Mini backup helpers (no-op safe in canvas)
async function readBackup() {
  try {
    const raw = localStorage.getItem("hytech_backup_json");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function writeBackup(obj) {
  try {
    localStorage.setItem("hytech_backup_json", JSON.stringify(obj || {}));
  } catch {}
}
function runDevTests() {
  /* placeholder */
}

// ---------- App shell
export default function HyTechProposalApp() {
  runDevTests();
  return <App />;
}

function App() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const exportProposalDocx = async () => {
    // Small helpers
    const show = (cond) => (cond ? [{}] : []);
    const money = (n) => fmtMoney(num(n));

    // Visibility for whole sections (tables/blocks) in the .docx
    const show_asphalt = show(workDomain.roofing && selectedWork.asphalt);
    const show_davinci = show(workDomain.roofing && selectedWork.davinci);
    const show_cedar   = show(workDomain.roofing && selectedWork.cedar);
    const show_rubber  = show(workDomain.roofing && selectedWork.rubber);
    const show_decking = show(workDomain.decking);


    // Optionally, visibility for Extras blocks/rows
    const row_plywood   = show(pricing.plywood.selected);
    const row_chimney   = show(pricing.chimney.selected);
    const row_trim      = show(pricing.trim.selected);
  const row_gutters   = show(pricing.gutters.selected);
  const row_gutters_leafguards = show(pricing.gutters.leafGuards.selected);
    const row_skylights = show(pricing.skylights.selected);
    const row_detached  = show(pricing.detached.selected);
    const row_custom    = show(pricing.customAdd.selected && pricing.customAdd.label && num(pricing.customAdd.price));

    // Sentence swap for asphalt plywood condition
    const asphalt_plywood_sentence = ({
      inspectRenail: "Inspect and Re-Nail Any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
      replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
      newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
    })[scope.asphalt.plywoodCondition] || "";

    // Detached structure per-tier totals (if you want to show them)
    const dsq = num(pricing.detached.squares || 0);
    const detached_landmark_total = money(dsq * num(pricing.unitPrice.landmark));
    const detached_pro_total      = money(dsq * num(pricing.unitPrice.pro));
    const detached_best_total     = money(dsq * num(pricing.unitPrice.northgate));

    // Map internal values → nice labels for the DOCX
    const colorLabel = (v) => {
      const m = { white: "White", mill: "Mill Finish", brown: "Brown", black: "Black" };
      return m[(v || "").toLowerCase()] || "";
    };

    // Eave & rake labels (asphalt)
    const asphalt_dripEdge_color_label = colorLabel(scope.asphalt?.dripEdgeColor);
    const asphalt_rakeDripEdge_color_label = colorLabel(scope.asphalt?.rakeDripEdgeColor);

    // ---- DaVinci helpers for the docx ----
    const davinci_plywood_sentence = ({
      inspectRenail: "Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
      replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
      newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
    })[scope.davinci.plywoodCondition] || "";

    const davinci_product_label =
      (scope.davinci.productType === "shake" || !scope.davinci.productType) ? "Multi-width Shake" :
      scope.davinci.productType === "slate" ? "Multi-width Slate" : "";

    const dripLabel = (type, color) => (
      type === "hicks_vent" ? "Hicks Vent" :
      type === "aluminum_8" ? `8" Aluminum (${(color || "White").replace(/\b\w/g, c => c.toUpperCase())})` :
      type === "copper_5" ? `5" Copper` : ""
    );

    const davinci_drip_eave_label = dripLabel(scope.davinci.dripEdgeType, scope.davinci.dripEdgeColor);
    const davinci_drip_rake_label = dripLabel(scope.davinci.rakeDripEdgeType, scope.davinci.rakeDripEdgeColor);

    const davinci_pipe_flange_label =
      scope.davinci?.pipeFlange?.copper ? "Copper" :
      scope.davinci?.pipeFlange?.aluminum ? "Aluminum" : "";

    const davinci_roof_fan_vents_label =
      scope.davinci?.roofFanVents?.copper ? "Copper" :
      scope.davinci?.roofFanVents?.blackAluminum ? "Black Aluminum" : "";

    const davinci_copper_valleys_feet = Number(pricing.davinciCopperValleyFeet || 0);
    const davinci_copper_drip_edge_feet = Number(pricing.davinciCopperDripEdgeFeet || 0);

    // Row show/hide flags (arrays)
    const row_davinci_ice_full          = show(!!scope.davinci.iceWaterFull);
    const row_davinci_starter           = show(!!scope.davinci.davinciStarter);
    const row_davinci_copper_valleys    = show(!!scope.davinci.includeCopperValleys && davinci_copper_valleys_feet);
    const row_davinci_ridgeVent         = show(!!scope.davinci.ridgeVent);
    const row_davinci_hipRidgeCaps      = show(!!scope.davinci.hipRidgeCaps);
    const row_davinci_pipeFlashings     = show(!!scope.davinci.pipeFlashings);
    const row_davinci_pipeFlange        = show(!!(scope.davinci?.pipeFlange?.aluminum || scope.davinci?.pipeFlange?.copper));
    const row_davinci_roofFanVents      = show(!!(scope.davinci?.roofFanVents?.blackAluminum || scope.davinci?.roofFanVents?.copper));
    const row_davinci_cleanup           = show(!!scope.davinci.cleanup);
    const row_davinci_drip_eave         = show(!!scope.davinci.dripEdgeType);
    const row_davinci_drip_rake         = show(!!scope.davinci.rakeDripEdgeType);
    const row_davinci_copper_drip_edge  = show(davinci_copper_drip_edge_feet);

  // DaVinci — drip edge show flags & color labels
  const davinci_dripEdge_hicks     = show(scope.davinci.dripEdgeType === "hicks_vent");
  const davinci_dripEdge_aluminum8 = show(scope.davinci.dripEdgeType === "aluminum_8");
  const davinci_dripEdge_copper5   = show(scope.davinci.dripEdgeType === "copper_5");

  // Rake options (Hicks on rake optional)
  const davinci_rakeDrip_hicks     = show(scope.davinci.rakeDripEdgeType === "hicks_vent");
  const davinci_rakeDrip_aluminum8 = show(scope.davinci.rakeDripEdgeType === "aluminum_8");
  const davinci_rakeDrip_copper5   = show(scope.davinci.rakeDripEdgeType === "copper_5");

  const davinci_dripEdge_color_label = colorLabel(scope.davinci?.dripEdgeColor);
  const davinci_rakeDrip_color_label = colorLabel(scope.davinci?.rakeDripEdgeColor);

  // Ice & Water full coverage for Davinci
  const davinci_iw_full = show(!!scope.davinci.iceWaterFull);

    // helpers
    const anyExtraSelected = Boolean(
      pricing?.plywood?.selected ||
      pricing?.chimney?.selected ||
      pricing?.trim?.selected ||
      pricing?.gutters?.selected ||
      pricing?.skylights?.selected ||
      pricing?.detached?.selected ||
      (pricing?.customAdd?.selected && (pricing?.customAdd?.label || Number(pricing?.customAdd?.price)))
    );
    const show_extra_options = show(anyExtraSelected);

    // Cedar — plywood sentence (optional, mirrors your other sections)
    const cedar_plywood_sentence = ({
      inspectRenail: "Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
      replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
      newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
    })[scope.cedar?.plywoodCondition] || "";

    // Reuse your existing dripLabel helper
    const cedar_drip_eave_label = (typeof dripLabel === 'function')
      ? dripLabel(scope.cedar?.dripEdgeType, scope.cedar?.dripEdgeColor)
      : "";
    const cedar_drip_rake_label = (typeof dripLabel === 'function')
      ? dripLabel(scope.cedar?.rakeDripEdgeType, scope.cedar?.rakeDripEdgeColor)
      : "";

    // Labels for cedar pipe flanges & roof fan vents (same pattern as DaVinci)
    const cedar_pipe_flange_label =
      scope.cedar?.pipeFlange?.copper ? "Copper" :
      scope.cedar?.pipeFlange?.aluminum ? "Aluminum" : "";

    const cedar_roof_fan_vents_label =
      scope.cedar?.roofFanVents?.copper ? "Copper" :
      scope.cedar?.roofFanVents?.blackAluminum ? "Black Aluminum" : "";

    // Row toggles for cedar table lines (use to show/hide rows)
    const row_cedar_ice_full       = show(!!scope.cedar?.iceWaterFull);
    const row_cedar_cedarBreather  = show(!!scope.cedar?.cedarBreather);
    const row_cedar_ridgeVent      = show(!!scope.cedar?.ridgeVent);
    const row_cedar_ridgeBoards    = show(!!scope.cedar?.cedarRidgeBoards);
    const row_cedar_pipeFlashings  = show(!!scope.cedar?.pipeFlashings);
    const row_cedar_cleanup        = show(!!scope.cedar?.cleanup);
    const row_cedar_drip_eave      = show(!!scope.cedar?.dripEdgeType);
    const row_cedar_drip_rake      = show(!!scope.cedar?.rakeDripEdgeType);

    // Optional per-choice wrappers (if you want Hicks/Alum/Copper conditionals)
    const cedar_dripEdge_hicks     = show(scope.cedar?.dripEdgeType === "hicks_vent");
    const cedar_dripEdge_aluminum8 = show(scope.cedar?.dripEdgeType === "aluminum_8");
    const cedar_dripEdge_copper5   = show(scope.cedar?.dripEdgeType === "copper_5");
    const cedar_rakeDrip_hicks     = show(scope.cedar?.rakeDripEdgeType === "hicks_vent");
    const cedar_rakeDrip_aluminum8 = show(scope.cedar?.rakeDripEdgeType === "aluminum_8");
    const cedar_rakeDrip_copper5   = show(scope.cedar?.rakeDripEdgeType === "copper_5");

    // Build payload for the template
    const data = {
      // Company
      company_name: company.name,
      company_address: company.address,
      company_phone: company.phone,
      company_email: company.email,
      hic: company.hic,
      csl: company.csl,
      company_notes: company.notes,

      // Customer
      provided_on: customer.providedOn,
      customer_name: customer.name,
      customer_tel: customer.tel,
      customer_cell: customer.cell,
      customer_email: customer.email,
      customer_street: customer.street,
      customer_city: customer.city,
      customer_state: customer.state,
      customer_zip: customer.zip,

      // Areas / scope snippets the template can drop into sentences
      asphalt_areas: scope.asphalt.areas || "",
      davinci_areas: scope.davinci.areas || "",
      cedar_areas:   scope.cedar.areas || "",
      rubber_areas:  scope.rubber.areas || "",
      siding_areas:  pricing.siding.areas || "",
      notes: scope.notes || "",
  // Standard inclusions (visibility arrays expected by the template)
  asphalt_syntheticUnderlayment: show(scope.asphalt.syntheticUnderlayment),
  asphalt_starterStrips:         show(scope.asphalt.starterStrips),
  asphalt_ridgeVent:             show(scope.asphalt.ridgeVent),
  asphalt_hipRidgeCaps:          show(scope.asphalt.hipRidgeCaps),
  asphalt_pipeFlashings:         show(scope.asphalt.pipeFlashings),
  asphalt_cleanup:               show(scope.asphalt.cleanup),
  asphalt_color:                 show((scope.asphalt.color || "").trim().length > 0),

  // Drip edge – eaves
  asphalt_dripEdge_hicks:        show(scope.asphalt.dripEdgeType === "hicks_vent"),
  asphalt_dripEdge_aluminum8:    show(scope.asphalt.dripEdgeType === "aluminum_8"),
  asphalt_dripEdge_copper5:      show(scope.asphalt.dripEdgeType === "copper_5"),
  // Drip edge – rakes
  asphalt_rakeDrip_aluminum8:    show(scope.asphalt.rakeDripEdgeType === "aluminum_8"),
  asphalt_rakeDrip_copper5:      show(scope.asphalt.rakeDripEdgeType === "copper_5"),
  // copper lf callout if either edge is copper
  asphalt_copperDrip_any:        show(scope.asphalt.dripEdgeType === "copper_5" || scope.asphalt.rakeDripEdgeType === "copper_5"),
  asphalt_copper_drip_edge_feet: pricing.asphaltCopperDripEdgeFeet || 0,
  // Inline loop flags for ice & water / roof areas (docxtemplater expects arrays for loops)
  asphalt_iw_eaves3: show(scope.asphalt?.iceAreas?.eaves3),
  asphalt_iw_valleys: show(scope.asphalt?.iceAreas?.valleys),
  asphalt_iw_pipesVents: show(scope.asphalt?.iceAreas?.pipesVents),
  asphalt_iw_stepFlash: show(scope.asphalt?.iceAreas?.stepFlash),
  asphalt_iw_chimney: show(scope.asphalt?.iceAreas?.chimney),
  asphalt_iw_skylights: show(scope.asphalt?.iceAreas?.skylights),
  asphalt_iw_lowPitch: show(scope.asphalt?.iceAreas?.lowPitch),
  asphalt_iw_solarAreas: show(scope.asphalt?.iceAreas?.solarAreas),
  asphalt_iw_fullCoverage: show(scope.asphalt?.iceAreas?.fullCoverage),

      // Asphalt tier totals
  asphalt_good_total:   money(asphaltBases.landmark + ((scope.asphalt.plywoodCondition === "replace") ? 360 * (pricing.plywood.squares || 0) : (scope.asphalt.plywoodCondition === "newOverBoards") ? 330 * (pricing.plywood.squares || 0) : 0)),
  asphalt_better_total: money(asphaltBases.pro + ((scope.asphalt.plywoodCondition === "replace") ? 360 * (pricing.plywood.squares || 0) : (scope.asphalt.plywoodCondition === "newOverBoards") ? 330 * (pricing.plywood.squares || 0) : 0)),
  asphalt_best_total:   money(asphaltBases.northgate + ((scope.asphalt.plywoodCondition === "replace") ? 360 * (pricing.plywood.squares || 0) : (scope.asphalt.plywoodCondition === "newOverBoards") ? 330 * (pricing.plywood.squares || 0) : 0)),
      asphalt_selected_total: money(asphaltBaseSelected),

      // Other primary bases
      davinci_total: money(davinciBase),
      cedar_total:   money(cedarBase),
      rubber_total:  money(rubberBase),
      siding_total:  money(sidingBase),

  // DaVinci — labels & sentences
  davinci_product_label,
  davinci_plywood_sentence,
  davinci_drip_eave_label,
  davinci_drip_rake_label,
  davinci_pipe_flange_label,
  davinci_roof_fan_vents_label,
  davinci_copper_valleys_feet,
  davinci_copper_drip_edge_feet,

  // Cedar — labels & sentence
  cedar_plywood_sentence,
  cedar_drip_eave_label,
  cedar_drip_rake_label,
  cedar_pipe_flange_label,
  cedar_roof_fan_vents_label,

  // DaVinci — row visibility flags
  row_davinci_ice_full,
  row_davinci_starter,
  row_davinci_copper_valleys,
  row_davinci_ridgeVent,
  row_davinci_hipRidgeCaps,
  row_davinci_pipeFlashings,
  row_davinci_pipeFlange,
  row_davinci_roofFanVents,
  row_davinci_cleanup,
  row_davinci_drip_eave,
  row_davinci_drip_rake,
  row_davinci_copper_drip_edge,

  // Cedar — row visibility flags
  row_cedar_ice_full,
  row_cedar_cedarBreather,
  row_cedar_ridgeVent,
  row_cedar_ridgeBoards,
  row_cedar_pipeFlashings,
  row_cedar_cleanup,
  row_cedar_drip_eave,
  row_cedar_drip_rake,

      // Extras
      plywood_total:  money((pricing.plywood.selected ? computePlywoodTotal(pricing.plywood.squares, pricing.plywood.rateByMode[pricing.plywood.mode] || 0) : 0)),
  plywood_priority: (pricing.plywood.priority === "maybe" ? "Might be Required" : (pricing.plywood.priority || "").toUpperCase()),
      chimney_total:  money(chimneyTotal),
      trim_total:     money(trimTotal),
      gutters_total:  money(guttersTotal),

      // Skylight reference prices (your UI shows 3)
      skylights_fixed:  money((pricing.skylights.selected && (computeSkylightPrices(pricing.skylights.base, pricing.skylights.complexity, pricing.skylights.adders).fixed)) || 0),
      skylights_manual: money((pricing.skylights.selected && (computeSkylightPrices(pricing.skylights.base, pricing.skylights.complexity, pricing.skylights.adders).manual)) || 0),
      skylights_solar:  money((pricing.skylights.selected && (computeSkylightPrices(pricing.skylights.base, pricing.skylights.complexity, pricing.skylights.adders).solar)) || 0),

  // Detached structure lines
  // Export no text for {detached_type} when the user selected 'other'
  detached_type: pricing.detached.type === 'other' ? '' : pricing.detached.type,
  // Human-friendly label for detached type (use the exact UI text; fall back to otherLabel when 'other')
  detached_type_label: (pricing.detached.type === 'garage' ? 'Garage' :
            pricing.detached.type === 'shed' ? 'Shed' :
            pricing.detached.type === 'barn' ? 'Barn' :
            pricing.detached.type === 'other' ? (pricing.detached.otherLabel || 'Other') :
            (pricing.detached.type || '')),
  detached_other_label: pricing.detached.otherLabel || "",
      detached_squares: dsq,
      detached_landmark_total,
      detached_pro_total,
      detached_best_total,

    // Rollups
    extras_total: money(extrasTotal),
    grand_total:  money(grandTotal),

    // Dynamic sentence
    asphalt_plywood_sentence,
  // Hidden text to include in exported DOCX when plywood condition is 'inspectRenail'
  asphalt_plywood_hidden: scope.asphalt?.plywoodCondition === 'inspectRenail' ? "Inspect and Re-nail Any loose or popped plywood or boards" : "",

    // Chimney cricket DOCX row visibility
    chimney_cricket_on: show(!!pricing.chimney?.cricket),

  // Chimney areas text (safe default to avoid 'undefined' in templates)
  chimney_areas: (pricing.chimney?.areas || ""),

    // Gutters: areas being replaced (safe default)
    gutters_areas: (pricing.gutters?.areas || "").trim(),

    // Section/table/row visibility flags (arrays)
    show_asphalt,
    show_davinci,
    show_cedar,
    show_rubber,
    show_decking,
    row_plywood,
    row_chimney,
    row_trim,
    row_gutters,
    row_gutters_leafguards,
      row_skylights,
      row_detached,
      row_custom,
  // Extra options present?
  show_extra_options,
  // DaVinci — drip edge flags & labels
  davinci_dripEdge_hicks,
  davinci_dripEdge_aluminum8,
  davinci_dripEdge_copper5,
  davinci_rakeDrip_hicks,
  davinci_rakeDrip_aluminum8,
  davinci_rakeDrip_copper5,
  davinci_dripEdge_color_label,
  davinci_rakeDrip_color_label,
  davinci_iw_full,
  // Cedar — optional per-choice wrappers
  cedar_dripEdge_hicks,
  cedar_dripEdge_aluminum8,
  cedar_dripEdge_copper5,
  cedar_rakeDrip_hicks,
  cedar_rakeDrip_aluminum8,
  cedar_rakeDrip_copper5,

      // Convenience fields if you want checkmarks in the template
      asphalt_check_good:   pricing.asphaltSelected === "landmark" ? "☒" : "☐",
      asphalt_check_better: pricing.asphaltSelected === "pro" ? "☒" : "☐",
      asphalt_check_best:   pricing.asphaltSelected === "northgate" ? "☒" : "☐",
      // Provide nested scope object for templates that reference scope.asphalt.* (avoid 'undefined')
      scope: {
        asphalt: {
          dripEdgeColor: (({ white: 'White', mill: 'Mill Finish', brown: 'Brown', black: 'Black' })[scope.asphalt?.dripEdgeColor] || scope.asphalt?.dripEdgeColor || ''),
          rakeDripEdgeColor: (({ white: 'White', mill: 'Mill Finish', brown: 'Brown', black: 'Black' })[scope.asphalt?.rakeDripEdgeColor] || scope.asphalt?.rakeDripEdgeColor || ''),
        },
      },
  // Friendly color labels for drip edge (computed via colorLabel)
  asphalt_dripEdge_color_label,
  // Backwards-compatible key used earlier in templates
  asphalt_rakeDrip_color_label: asphalt_rakeDripEdge_color_label,
  // New explicit name requested
  asphalt_rakeDripEdge_color_label,
    };

    // Load and render the template
    let content;
    try {
      const relativeUrl = "/HyTechProposalTemplate.docx";
      let res;
      try {
        // First attempt: normal fetch
        res = await fetch(relativeUrl);
      } catch (netErr) {
        console.warn("Initial fetch failed, will retry with origin + no-cache", netErr);
        // Retry with explicit origin and no-cache (helps when service worker or dev server caching interferes)
        try {
          res = await fetch(window.location.origin + relativeUrl, { cache: "no-store" });
        } catch (netErr2) {
          console.error("Retry fetch failed", netErr2);
          throw netErr2;
        }
      }

      console.log("Template fetch result:", {
        ok: !!res && res.ok,
        status: res && res.status,
        url: res && res.url,
      });

      if (!res || !res.ok) throw new Error(`Template not found (HTTP ${res ? res.status : "no-response"})`);
      content = await res.arrayBuffer();

      // Try to patch the fetched .docx (zip) in-memory: replace nested scope placeholders
      try {
        const tmpZip = new PizZip(content);
        const docFile = tmpZip.file("word/document.xml");
        if (docFile) {
          let xml = docFile.asText();
          // Replace nested scope references with the top-level label variables we now provide
          xml = xml.replace(/\{scope\.asphalt\.dripEdgeColor\}/g, "{asphalt_dripEdge_color_label}");
          xml = xml.replace(/\{scope\.asphalt\.rakeDripEdgeColor\}/g, "{asphalt_rakeDripEdge_color_label}");
          // legacy key (some templates used a slightly different name)
          xml = xml.replace(/\{scope\.asphalt\.rakeDripEdgeColor\}/g, "{asphalt_rakeDrip_color_label}");
          // Auto-fix: coalesce template tokens split across Word runs
          try {
            // Merge any XML tags occurring between an opening brace in one <w:t> and a closing brace in a later <w:t>
            // Example: <w:t>{#photos_</w:t><w:r>...<w:t>roofing_asphalt}</w:t></w:r>
            xml = xml.replace(/(<w:t[^>]*>[^<]*\{)[\s\S]*?(\}[^<]*<\/w:t>)/g, function (m, start, end) {
              try {
                const middle = m.slice(start.length, m.length - end.length);
                const cleaned = middle.replace(/<[^>]+>/g, '');
                return start + cleaned + end;
              } catch (e) {
                return m;
              }
            });
          } catch (coalesceErr) {
            console.warn('Auto-coalesce of split runs failed', coalesceErr);
          }
          tmpZip.file("word/document.xml", xml);
          content = tmpZip.generate({ type: "arraybuffer" });
          console.log("Patched template document.xml in-memory to use color label variables.");
        }
      } catch (patchErr) {
        console.warn("Auto-patch of template failed; proceeding without modification", patchErr);
      }
    } catch (e) {
      console.error("Failed to load template:", e);
      alert(
        "Couldn't load Word template: " + (e.message || String(e)) +
          "\nCheck DevTools → Network for /HyTechProposalTemplate.docx (HTTP status). If you have a service worker registered, try unregistering it and reload the page."
      );
      return;
    }

    // Create a PizZip instance and Docxtemplater document before rendering
    let doc;
    try {
      const zip = new PizZip(content);

      // Strong, explicit module hookup per user's request
      const imageModule = new ImageModule({
        getImage(val) {
          const s = String(val || "");
          const b64 = s.includes("base64,") ? s.split("base64,")[1] : s;
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          return u8.buffer; // ArrayBuffer
        },
        getSize() { return [520, 360]; }
      });

      // Create doc with module pre-attached and nullGetter to avoid 'undefined'
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: [imageModule],
        nullGetter() { return ""; },
      });
    } catch (e) {
      // Provide more detailed diagnostics for template initialization failures
      console.error('Failed to create docxtemplater instance', e);
      const extra = e?.properties?.errors ? '\nDetails:\n' + e.properties.errors.map(err => err.properties?.explanation || err.message).join('\n') : '';
      alert("Couldn't initialize template engine: " + (e.message || String(e)) + extra + '\n(see console for full error object)');
      return;
    }

    try {
      // Debug: log payload so we can inspect what the template receives
      try {
        console.log("DOCX export data:", JSON.parse(JSON.stringify(data)));
      } catch (logErr) {
        console.log("DOCX export data (could not stringify):", data);
      }

      // Safety: ensure nested scope fields expected by some templates exist and fall back to friendly labels
      if (!data.scope) data.scope = {};
      if (!data.scope.asphalt) data.scope.asphalt = {};
      data.scope.asphalt.dripEdgeColor = data.scope.asphalt.dripEdgeColor || data.asphalt_dripEdge_color_label || "";
      data.scope.asphalt.rakeDripEdgeColor = data.scope.asphalt.rakeDripEdgeColor || data.asphalt_rakeDrip_color_label || "";

      // ---- TRIM → template mappers (safe defaults + row toggles)
      {
        const tf = (pricing.trim && pricing.trim.feet) || {};
        const show = (cond) => (cond ? [{}] : []); // already declared above, here for clarity

        Object.assign(data, {
          // labels & notes
          trim_material_label: (
            pricing.trim.material === "cedar"
              ? "Clear Western Red Cedar trim boards installed using counter-sunken stainless steel trim screws."
              : "AZEK maintenenance free PVC trim installed using the CORTEX screw and plug invisible fastening system."
          ),
          trim_install_mode_label: (pricing.trim.installMode === "new" ? "Install new" : "Replace existing"),
          trim_areas: pricing.trim.areas || "",

          // numeric feet (never undefined)
          trim_feet_soffit:       Number(tf.soffit || 0),
          trim_feet_fascias:      Number(tf.fascias || 0),
          trim_feet_frieze:       Number(tf.frieze || 0),
          trim_feet_molding:      Number(tf.molding || 0),
          trim_feet_cornerBoards: Number(tf.cornerBoards || 0),
          trim_feet_windowDoor:   Number(tf.windowDoor || 0),
          trim_feet_rakeBoards:   Number(tf.rakeBoards || 0),
          trim_feet_waterTable:   Number(tf.waterTable || 0),

          // per-row visibility (wrap each table row with these)
          row_trim_soffit:       show(Number(tf.soffit)       > 0),
          row_trim_fascias:      show(Number(tf.fascias)      > 0),
          row_trim_frieze:       show(Number(tf.frieze)       > 0),
          row_trim_molding:      show(Number(tf.molding)      > 0),
          row_trim_cornerBoards: show(Number(tf.cornerBoards) > 0),
          row_trim_windowDoor:   show(Number(tf.windowDoor)   > 0),
          row_trim_rakeBoards:   show(Number(tf.rakeBoards)   > 0),
          row_trim_waterTable:   show(Number(tf.waterTable)   > 0),
          // Cedar woven caps export fields
          cedar_woven_caps_feet: Number(pricing.cedarWovenCapsFeet || 0),
          cedar_woven_caps_cost: Number(45 * (pricing.cedarWovenCapsFeet || 0)),
          row_cedar_woven_caps:  show(Number(pricing.cedarWovenCapsFeet || 0) > 0),
          cedar_woven_caps_hips:  show(!!pricing.cedarWovenCapsHips),
          cedar_woven_caps_ridges: show(!!pricing.cedarWovenCapsRidges),
          cedar_woven_caps_hips_feet: Number(pricing.cedarWovenCapsHips ? num(measure.feetHips || 0) : 0),
          cedar_woven_caps_ridges_feet: Number(pricing.cedarWovenCapsRidges ? num(measure.feetRidge || 0) : 0),
        });
      }

      // ---- CEDAR: Copper W-valleys → DOCX
      {
        const feet = Number(pricing.cedarCopperValleyFeet || 0); // from the Cedar card
        const cost = Number(25 * feet);
        Object.assign(data, {
          // show row when the option is on (print 0 LF if feet is zero)
          // include feet & cost in the loop item so tags inside the {#row...}{/row...} block resolve
          row_cedar_copperValleys: (!!scope.cedar?.includeCopperValleys) ? [{ cedar_copper_valley_feet: feet, cedar_copper_valley_cost: cost }] : [],
          cedar_copper_valley_feet: feet,
          cedar_copper_valley_cost: cost,
        });
      }

      // ---- Cedar Ice & Water → DOCX tags
      Object.assign(data, {
        cedar_iw_eaves3:      show(!!scope.cedar?.iceAreas?.eaves3),
        cedar_iw_valleys:     show(!!scope.cedar?.iceAreas?.valleys),
        cedar_iw_pipesVents:  show(!!scope.cedar?.iceAreas?.pipesVents),
        cedar_iw_stepFlash:   show(!!scope.cedar?.iceAreas?.stepFlash),
        cedar_iw_chimney:     show(!!scope.cedar?.iceAreas?.chimney),
        cedar_iw_skylights:   show(!!scope.cedar?.iceAreas?.skylights),
        cedar_iw_lowPitch:    show(!!scope.cedar?.iceAreas?.lowPitch),
        cedar_iw_solarAreas:  show(!!scope.cedar?.iceAreas?.solarAreas),
        cedar_iw_fullCoverage:show(!!scope.cedar?.iceAreas?.fullCoverage),
        cedar_iw_solarSquares: Number(scope.cedar?.iceAreas?.solarSquares || 0),
      });

      // (optional) hide the whole I&W sentence/row if nothing checked
      Object.assign(data, {
        row_cedar_iw_any: show(Object.values(scope.cedar?.iceAreas || {}).some(Boolean)),
      });

      // ---- CEDAR: row toggles + labels (→ DOCX keys)
      {
        const bool = (v) => !!v;
        const show = (cond) => (cond ? [{}] : []);

        // Row visibility (ScopeGrid items + rows you asked for)
        const row_cedar_ice_full        = show(bool(scope.cedar?.iceWaterFull));
        const row_cedar_cedarBreather   = show(bool(scope.cedar?.cedarBreather));
        const row_cedar_copperValleys   = show(bool(scope.cedar?.copperValleys));
        const row_cedar_ridgeVent       = show(bool(scope.cedar?.ridgeVent));
        const row_cedar_cedarRidgeBoards= show(bool(scope.cedar?.cedarRidgeBoards));
        const row_cedar_pipeFlashings   = show(bool(scope.cedar?.pipeFlashings));
        const row_cedar_cleanup         = show(bool(scope.cedar?.cleanup));

        // Choose-one groups
        const row_cedar_roofFanVents = show(
          bool(scope.cedar?.roofFanVents?.blackAluminum) || bool(scope.cedar?.roofFanVents?.copper)
        );
        const row_cedar_pipeFlange = show(
          bool(scope.cedar?.pipeFlange?.aluminum) || bool(scope.cedar?.pipeFlange?.copper)
        );

        // Human labels for those choose-one groups
        const cedar_pipe_flange_label =
          scope.cedar?.pipeFlange?.copper ? "Copper" :
          scope.cedar?.pipeFlange?.aluminum ? "Aluminum" : "";

        const cedar_roof_fan_vents_label =
          scope.cedar?.roofFanVents?.copper ? "Copper" :
          scope.cedar?.roofFanVents?.blackAluminum ? "Black Aluminum" : "";

        // (If you’re also using the Cedar Ice&Water sentence, make sure these exist too)
        const cedar_iw_eaves3       = show(!!scope.cedar?.iceAreas?.eaves3);
        const cedar_iw_valleys      = show(!!scope.cedar?.iceAreas?.valleys);
        const cedar_iw_pipesVents   = show(!!scope.cedar?.iceAreas?.pipesVents);
        const cedar_iw_stepFlash    = show(!!scope.cedar?.iceAreas?.stepFlash);
        const cedar_iw_chimney      = show(!!scope.cedar?.iceAreas?.chimney);
        const cedar_iw_skylights    = show(!!scope.cedar?.iceAreas?.skylights);
        const cedar_iw_lowPitch     = show(!!scope.cedar?.iceAreas?.lowPitch);
        const cedar_iw_solarAreas   = show(!!scope.cedar?.iceAreas?.solarAreas);
        const cedar_iw_fullCoverage = show(!!scope.cedar?.iceAreas?.fullCoverage);
        const cedar_iw_solarSquares = Number(scope.cedar?.iceAreas?.solarSquares || 0);

        Object.assign(data, {
          // row toggles
          row_cedar_ice_full,
          row_cedar_cedarBreather,
          row_cedar_copperValleys,
          row_cedar_ridgeVent,
          row_cedar_cedarRidgeBoards,
          row_cedar_pipeFlashings,
          row_cedar_cleanup,
          row_cedar_roofFanVents,
          row_cedar_pipeFlange,

          // labels
          cedar_pipe_flange_label,
          cedar_roof_fan_vents_label,

          // ice & water flags (if you’re using the inline sentence/rows)
          cedar_iw_eaves3,
          cedar_iw_valleys,
          cedar_iw_pipesVents,
          cedar_iw_stepFlash,
          cedar_iw_chimney,
          cedar_iw_skylights,
          cedar_iw_lowPitch,
          cedar_iw_solarAreas,
          cedar_iw_fullCoverage,
          cedar_iw_solarSquares,
        });
      }

      // Mirror `scope.cedar` into `data.scope.cedar` so templates referencing either
      // `scope.cedar.includeCopperValleys` or `scope.cedar.copperValleys` work.
      if (!data.scope) data.scope = {};
      data.scope.cedar = data.scope.cedar || {};
      Object.assign(data.scope.cedar, {
        includeCopperValleys: !!scope.cedar?.includeCopperValleys,
        copperValleys: !!scope.cedar?.includeCopperValleys || !!scope.cedar?.copperValleys,
        cedarBreather: !!scope.cedar?.cedarBreather,
        ridgeVent: !!scope.cedar?.ridgeVent,
        cedarRidgeBoards: !!scope.cedar?.cedarRidgeBoards,
        pipeFlashings: !!scope.cedar?.pipeFlashings,
        cleanup: !!scope.cedar?.cleanup,
        iceWaterFull: !!scope.cedar?.iceWaterFull,
        dripEdgeType: scope.cedar?.dripEdgeType || "",
        rakeDripEdgeType: scope.cedar?.rakeDripEdgeType || "",
        pipeFlange: {
          copper: !!scope.cedar?.pipeFlange?.copper,
          aluminum: !!scope.cedar?.pipeFlange?.aluminum,
        },
        roofFanVents: {
          copper: !!scope.cedar?.roofFanVents?.copper,
          blackAluminum: !!scope.cedar?.roofFanVents?.blackAluminum,
        },
        iceAreas: Object.assign({}, scope.cedar?.iceAreas || {}),
      });

      // Ensure top-level row flag is set (template commonly checks this top-level key)
      Object.assign(data, {
        row_cedar_copperValleys: scope.cedar?.includeCopperValleys ? [{}] : [],
      });

  // Cedar type label for template — default to Red Cedar so export shows a value
  const cedar_type_label = ({ red: "Red Cedar", yellow: "Yellow Cedar", ptred: "P.T Red Cedar" })[scope.cedar?.cedarType || 'red'] || "Red Cedar";
  Object.assign(data, { cedar_type_label });

      // Show the pipe flange row if either Aluminum or Copper is selected
      const row_cedar_pipeFlange =
        (scope.cedar?.pipeFlange?.aluminum || scope.cedar?.pipeFlange?.copper) ? [{}] : [];

      // Optional: print which one was chosen
      const cedar_pipe_flange_label =
        scope.cedar?.pipeFlange?.copper ? "Copper" :
        (scope.cedar?.pipeFlange?.aluminum ? "Aluminum" : "");

      Object.assign(data, { row_cedar_pipeFlange, cedar_pipe_flange_label });

      // Ensure DaVinci plywood sentence and areas are available to the template
      Object.assign(data, {
        davinci_plywood_sentence,
        davinci_areas: scope.davinci?.areas || "",
      });

      // Siding — synthetic product export mapping
      {
        const show = (c) => (c ? [{}] : []);
        const money = (n) => fmtMoney(num(n));

        // synthetic selected?
        const isSynthetic =
          !!workDomain.siding &&
          selectedWork.sidingCategory === "synthetic" &&
          pricing.siding?.category === "synthetic";

        // labels
        const productLabelMap = {
          hardiPlankCedarMill: "HardiePlank CedarMill",
          hardiStraightEdgeShingle: "Hardie Straight Edge Shingle",
          hardiPanelSierra9: "HardiePanel Sierra 8/9",
        };
        const siding_synthetic_product_label =
          productLabelMap[pricing.siding?.product] || (pricing.siding?.product || "");

        // pricing math (matches your app logic)
        const calc = pricing.siding?.calcMode || "bySquare";               // "bySquare" | "manual"
        const unit = num((pricing.siding && unitRateFor(pricing.siding)) || 0);
        const squares = num(measure.wallSquares || 0);
        const manual = num(pricing.siding?.manualTotal || 0);
        const subtotal = calc === "manual" ? manual : round2(unit * squares);

        Object.assign(data, {
          // section wrapper
          row_siding_synthetic: show(isSynthetic),

          // basics
          siding_areas: (pricing.siding?.areas || "").trim(),

          // product line
          siding_synthetic_product_label,
          row_siding_synth_product: show(isSynthetic && !!pricing.siding?.product),

          // EXPOSURE (this is the one you asked for)
          siding_synthetic_exposure: (pricing.siding?.exposure || "").trim(),
          row_siding_synthetic_exposure: show(isSynthetic && !!(pricing.siding?.exposure || "").trim()),

          // color (from Siding scope)
          siding_synthetic_color: (scope.siding?.color || "").trim(),

          // pricing rows
          siding_synthetic_calc_mode_label: calc === "manual" ? "Manual Total" : "By Square",
          siding_synthetic_unit_rate: unit,
          siding_synthetic_squares: squares,
          siding_synthetic_subtotal: money(subtotal),
          siding_synthetic_total: money(subtotal),

          row_siding_synthetic_unit:    show(isSynthetic && calc === "bySquare"),
          row_siding_synthetic_squares: show(isSynthetic && calc === "bySquare"),
          row_siding_synthetic_subtotal: show(isSynthetic && subtotal > 0),

          // scope checkboxes (row show/hide)
          row_siding_typar:            show(!!scope.siding?.typar),
          row_siding_vycorTape:        show(!!scope.siding?.vycorTape),
          row_siding_stainlessStaples: show(!!scope.siding?.stainlessStaples),
          row_siding_dripCaps:         show(!!scope.siding?.dripCaps),
          row_siding_azekBlocks:       show(!!scope.siding?.azekBlocks),
          row_siding_wireHangers:      show(!!scope.siding?.wireHangers),
          row_siding_cleanup:          show(!!scope.siding?.cleanup),
        });
      }

      // Rubber – per-row show/hide flags and values
      Object.assign(data, {
        // Rubber – per-row show/hide flags
        row_rubber_epdm060:        show(!!scope.rubber?.epdm060),
        row_rubber_fiberboard:     show(!!scope.rubber?.fiberboard),
        row_rubber_aluminumDripEdge: show(!!scope.rubber?.aluminumDripEdge),
        row_rubber_seamSplice:     show(!!scope.rubber?.seamSplice),
        row_rubber_seamCoverTape:  show(!!scope.rubber?.seamCoverTape),
        row_rubber_pipeBoots:      show(!!scope.rubber?.pipeBoots),
        row_rubber_curbSkylights:  show(!!scope.rubber?.curbSkylights),
  row_rubber_cornerFlashings: show(!!scope.rubber?.cornerFlashings),

        // Rubber – counts/labels used in rows
        rubber_curb_skylights_count: Number(pricing.rubberCurbSkylights || 0),

        // Rubber – plywood sentence (mirrors asphalt/DaVinci/cedar style)
        rubber_plywood_sentence: ({
          inspectRenail: "Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.",
          replace:       "Replace the existing plywood on the Entire Roof Deck Area of the House.",
          newOverBoards: "Install new plywood over the existing roof boards on the Entire Roof Deck Area of the House.",
        })[scope.rubber?.plywoodCondition] || "",
      });

      // show the row only when GAF Deck-Armor (iceWaterFull) is selected in the Cedar scope
      Object.assign(data, {
        row_cedar_deckArmor: scope.cedar?.iceWaterFull ? [{}] : [],
      });

      // --- Synthetic Siding: robust mapper (works with new/old shapes) ---
      {
        const show = (c) => (c ? [{}] : []);
        const money = (n) => fmtMoney(num(n));

        // “is Synthetic selected?” — supports single or multi-select UIs
        const catPicked = (c) => {
          const cats = selectedWork?.sidingCategories || [];
          return cats.includes(c) || selectedWork?.sidingCategory === c;
        };
        const syntheticOn = !!workDomain?.siding && catPicked("synthetic");

        // Prefer per-category object, fall back to legacy top-level
        const syn =
          pricing?.siding?.byCategory?.synthetic
          || pricing?.siding?.synthetic
          || pricing?.siding
          || {};

        // Basic fields
        const areas    = (pricing?.siding?.areas || syn.areas || "").trim();
  const product  = syn.productLabel || syn.product || "";
  const productLabel = productLabelFor('synthetic', product) || product;
        const exposure = (syn.exposure || pricing?.siding?.exposure || "").trim();
        const color    = (syn.color || scope?.siding?.color || "").trim();

        // Calc mode + numbers (support manual/bySquare)
        const calcMode = syn.calcMode || pricing?.siding?.calcMode || "bySquare";
        const unit     = num(syn.unit || syn.unitRate || 0);
        const squares  = num(syn.squares || measure?.wallSquares || 0);
        const manual   = num(syn.manualTotal || 0);
        const subtotal = calcMode === "manual" ? manual : round2(unit * squares);

        Object.assign(data, {
          // Section wrappers (export both so either DOCX tag works)
          show_siding_synthetic: show(syntheticOn),
          row_siding_synthetic:  show(syntheticOn),

          // Lines/fields you’ll print
          siding_areas: areas,
          siding_synthetic_product_label: productLabel,
          siding_synthetic_exposure: exposure,
          siding_synthetic_color: color,

          siding_synthetic_calc_mode_label: calcMode === "manual" ? "Manual Total" : "By Square",
          siding_synthetic_unit_rate: unit,
          siding_synthetic_squares:   squares,
          siding_synthetic_subtotal:  money(subtotal),
          siding_synthetic_total:     money(subtotal),

          // Row show/hide toggles used in your DOCX
          row_siding_synth_product:       show(syntheticOn && !!product),
          row_siding_synthetic_exposure:  show(syntheticOn && !!exposure),
          row_siding_synthetic_unit:      show(syntheticOn && calcMode === "bySquare"),
          row_siding_synthetic_squares:   show(syntheticOn && calcMode === "bySquare"),
          row_siding_synthetic_subtotal:  show(syntheticOn && subtotal > 0),

          // Scope checkboxes under Siding → Scope
          row_siding_typar:            show(!!scope?.siding?.typar),
          row_siding_vycorTape:        show(!!scope?.siding?.vycorTape),
          row_siding_stainlessStaples: show(!!scope?.siding?.stainlessStaples),
          row_siding_dripCaps:         show(!!scope?.siding?.dripCaps),
          row_siding_azekBlocks:       show(!!scope?.siding?.azekBlocks),
          row_siding_wireHangers:      show(!!scope?.siding?.wireHangers),
          row_siding_cleanup:          show(!!scope?.siding?.cleanup),
        });
      }

    // --- Synthetic Siding → subtotal + rows (robust) ---
    {
      const show  = (c) => (c ? [{}] : []);
      const money = (n) => fmtMoney(num(n));

      // Is Synthetic selected? (supports single and multi-select UI)
      const catPicked = (c) => {
        const cats = selectedWork?.sidingCategories || [];
        return cats.includes(c) || selectedWork?.sidingCategory === c;
      };
      const syntheticOn = !!workDomain?.siding && catPicked("synthetic");

      // Prefer per-category data; fall back gracefully
      const syn =
        pricing?.siding?.byCategory?.synthetic ??
        pricing?.siding?.synthetic ??
        {};

  const productLabel = productLabelFor('synthetic', syn.product) || (syn.product || "");

      const calcMode = syn.calcMode || pricing?.siding?.calcMode || "bySquare"; // "bySquare" | "manual"

      // Unit rate: use explicit unit if set; otherwise derive from your rates helper
      const unit = num(
        (syn.unit != null ? syn.unit : 0) ||
        unitRateFor({ category: "synthetic", product: syn.product, rates: pricing?.siding?.rates })
      );

      const squares = num(
        (syn.squares != null ? syn.squares : 0)
      );

      const manual = num(syn.manualTotal || 0);

      const subtotalNum = calcMode === "manual"
        ? manual
        : round2(unit * squares);

      Object.assign(data, {
        // values
  siding_synthetic_product_label: productLabel,
        siding_synthetic_subtotal: money(subtotalNum),
        siding_synthetic_subTotal: money(subtotalNum), // alias (capital T) to cover template typos

        // row show/hide (show it if section is on; tighten to `subtotalNum > 0` if you want)
        row_siding_synthetic_subtotal: show(syntheticOn),
        row_siding_synthetic_subTotal: show(syntheticOn),
      });

      // Optional debug once:
      console.log("SYN subtotal", { calcMode, unit, squares, manual, subtotalNum });
    }

      // --- Cedar Shake Siding → DOCX mappers ---
      {
        const show  = (c) => (c ? [{}] : []);
        const money = (n) => fmtMoney(num(n));

        // Is Cedar Shake selected? Works for single- or multi-select siding UI
        const catPicked = (c) => {
          const cats = selectedWork?.sidingCategories || [];
          return cats.includes(c) || selectedWork?.sidingCategory === c;
        };
        const cedarOn = !!workDomain?.siding && catPicked("cedarShake");

        // Prefer per-category object
        const cp = (pricing?.siding?.byCategory?.cedarShake) || {};

        // Basics
        const areas    = (cp.areas || pricing?.siding?.areas || "").trim();
        const exposure = (cp.exposure || pricing?.siding?.exposure || "").trim();   // per-category exposure
        const color    = (cp.color || scope?.siding?.color || "").trim();

  // Product label (use Select option label so punctuation/capitalization matches the UI)
  const siding_cedar_product_label = productLabelFor('cedarShake', cp.product) || (cp.product || "");

        // Price mode & numbers
        const calcMode = cp.calcMode || pricing?.siding?.calcMode || "bySquare";    // "bySquare" | "manual"
        const unit     = num(cp.unit || 0);
        const squares  = num(cp.squares || 0);
        const manual   = num(cp.manualTotal || 0);
        const baseSubtotal = calcMode === "manual" ? manual : round2(unit * squares);

        // Cedar-only adder: woven corners ($45/ft when included)
        const wcInclude = !!cp?.wovenCorners?.include;
        const wcFeet    = num(cp?.wovenCorners?.feet || 0);
        const wcCostNum = wcInclude ? round2(45 * wcFeet) : 0;

        // Grand total for this section
        const cedarTotal = baseSubtotal + wcCostNum;

        Object.assign(data, {
          // section wrappers (export both names so either DOCX wrapper works)
          row_siding_cedarShake: show(cedarOn),
          show_siding_cedarShake: show(cedarOn),

          // printed fields
          siding_cedar_product_label,
          siding_cedar_exposure: exposure,
          siding_cedar_color: color,
          siding_cedar_areas: areas,

          siding_cedar_calc_mode_label: calcMode === "manual" ? "Manual Total" : "By Square",
          siding_cedar_unit_rate: unit,
          siding_cedar_squares: squares,
          siding_cedar_subtotal: money(baseSubtotal),

          siding_cedar_wovenCorners_feet: wcFeet,
          siding_cedar_wovenCorners_cost: money(wcCostNum),
          siding_cedar_total: money(cedarTotal),

          // row flags
          row_siding_cedar_product:   show(cedarOn && !!siding_cedar_product_label),
          row_siding_cedar_exposure:  show(cedarOn && !!exposure),
          row_siding_cedar_unit:      show(cedarOn && calcMode === "bySquare"),
          row_siding_cedar_squares:   show(cedarOn && calcMode === "bySquare"),
          row_siding_cedar_subtotal:  show(cedarOn && baseSubtotal >= 0),  // use >0 to hide zero
          row_siding_cedar_wovenCorners: show(cedarOn && wcInclude && wcFeet > 0),

          // scope checkboxes (shared across all siding categories)
          row_siding_typar:            show(!!scope?.siding?.typar),
          row_siding_vycorTape:        show(!!scope?.siding?.vycorTape),
          row_siding_stainlessStaples: show(!!scope?.siding?.stainlessStaples),
          row_siding_dripCaps:         show(!!scope?.siding?.dripCaps),
          row_siding_azekBlocks:       show(!!scope?.siding?.azekBlocks),
          row_siding_wireHangers:      show(!!scope?.siding?.wireHangers),
          row_siding_cleanup:          show(!!scope?.siding?.cleanup),
        });
      }

      // --- Cedar Shake Siding → subtotal & total (robust) ---
      {
        const toNum   = (v) => (typeof num === "function" ? num(v) : Number(v || 0));
        const toMoney = (n) => (typeof fmtMoney === "function" ? fmtMoney(n) : `$${(n || 0).toFixed(2)}`);
        const show    = (c) => (c ? [{}] : []);

        // Is Cedar Shake selected? (works for single or multi-category UIs)
        const catPicked = (c) => {
          const cats = selectedWork?.sidingCategories || [];
          return cats.includes(c) || selectedWork?.sidingCategory === c;
        };
        const cedarOn = !!workDomain?.siding && catPicked("cedarShake");

        // Prefer per-category object; fall back to legacy/top-level if needed
        const cp =
          pricing?.siding?.byCategory?.cedarShake ??
          pricing?.siding?.cedarShake ??
          {};

        // Derive unit rate if explicit unit missing (looks into your rates table)
        const resolveUnitRate = () => {
          if (cp.unit != null) return toNum(cp.unit);
          const rates = pricing?.siding?.rates?.cedarShake || pricing?.siding?.rates || {};
          const productKey = cp.product;                  // whatever key your UI stores
          const rate = rates?.cedarShake?.[productKey] ?? rates?.[productKey] ?? 0;
          return toNum(rate);
        };

        const calcMode = cp.calcMode || pricing?.siding?.calcMode || "bySquare"; // "bySquare" | "manual"
        const unit     = resolveUnitRate();               // $/square
        const squares  = toNum(cp.squares ?? measure?.wallSquares ?? 0);
        const manual   = toNum(cp.manualTotal ?? 0);

        const baseSubtotalNum = (calcMode === "manual") ? manual : (Math.round(unit * squares * 100) / 100);

        // Cedar-only adder: Woven Corners @ $45/ft when included
        const wcInclude = !!cp?.wovenCorners?.include;
        const wcFeet    = toNum(cp?.wovenCorners?.feet ?? 0);
        const wcCostNum = wcInclude ? Math.round(45 * wcFeet * 100) / 100 : 0;

        const cedarTotalNum = baseSubtotalNum + wcCostNum;

        // Export values (plus an alias just in case the DOCX used a different name)
        Object.assign(data, {
          siding_cedar_subtotal: toMoney(baseSubtotalNum),
          siding_cedar_total:    toMoney(cedarTotalNum),

          // product label exported to match the UI exactly
          siding_cedar_product_label: productLabelFor('cedarShake', cp.product) || (cp.product || ""),

          // optional aliases if your DOCX accidentally used other spellings
          siding_cedarShake_total: toMoney(cedarTotalNum),

          // flags if you want to show/hide lines
          row_siding_cedar_subtotal: show(cedarOn),   // change to baseSubtotalNum > 0 if you want to hide $0
          row_siding_cedar_total:    show(cedarOn),
        });

        // One-time debug (check console after export)
        console.log("CEDAR SIDING total debug:", {
          calcMode, unit, squares, manual, baseSubtotalNum, wcInclude, wcFeet, wcCostNum, cedarTotalNum
        });
      }

// ---- Missing keys wiring (patch) ----

// Handy helpers already in scope:
const byCat = (pricing?.siding?.byCategory || {});
const catPicked = (c) => {
  const cats = selectedWork?.sidingCategories || [];
  return cats.includes(c) || selectedWork?.sidingCategory === c;
};

// 1) RUBBER: label + optional rows present in the DOCX
Object.assign(data, {
  // EPDM type label: prefer the UI dropdown value (pricing.rubberEpdmType) so DOCX matches the UI selection
  // Use the UI dropdown selection if present, otherwise default to the UI's default value
  rubber_epdm_type_label: (
    (pricing?.rubberEpdmType || ".060_black") === ".060_black" ? ".060 Black EPDM" :
    (pricing?.rubberEpdmType || ".060_black") === ".090_black" ? ".090 Black EPDM" :
    (pricing?.rubberEpdmType || ".060_black") === ".060_white" ? ".060 White EPDM" :
    (pricing?.rubberEpdmType || ".060_black") === ".090_white" ? ".090 White EPDM" :
    (scope.rubber?.epdm060 ? "0.060 EPDM" : "EPDM")
  ),
  // Exact EPDM type label matching the UI dropdown (used by {rubber_epdm_type})
  rubber_epdm_type: (
    (pricing?.rubberEpdmType || ".060_black") === ".060_black" ? ".060 Black EPDM" :
    (pricing?.rubberEpdmType || ".060_black") === ".090_black" ? ".090 Black EPDM" :
    (pricing?.rubberEpdmType || ".060_black") === ".060_white" ? ".060 White EPDM" :
    (pricing?.rubberEpdmType || ".060_black") === ".090_white" ? ".090 White EPDM" :
    ""
  ),
  row_rubber_flashing12:      show(!!scope.rubber?.flashing12),       // shows the "12\" uncured flashing" row
});

// 2) SKYLIGHTS: install-mode label and areas
Object.assign(data, {
  skylights_installMode_label:
    pricing?.skylights?.complexity === "framing_new" || pricing?.skylights?.complexity === "framing_new_complex"
      ? "Framing in new"
      : "Replacing existing",
  skylights_areas: (pricing?.skylights?.areas || "").trim(),
});

// 3) PLYWOOD (extras): mode label + areas
Object.assign(data, {
  plywood_mode_label: ({
    replace: "replacing the existing plywood",
    overlay: "installing over the existing roof boards",
    new:     "installing new over the existing boards",
  }[pricing?.plywood?.mode]) || (pricing?.plywood?.mode || ""),
  plywood_areas: (pricing?.plywood?.areas || "").trim(),
});

// 4) CUSTOM (extras): label + price used in template
Object.assign(data, {
  custom_label: (pricing?.customAdd?.label || "").trim(),
  custom_price: fmtMoney(num(pricing?.customAdd?.price || 0)),
});

// 5) GUTTERS (extras): leaf guards line total used by template
Object.assign(data, {
  leafguards_total: fmtMoney(
    (pricing?.gutters?.leafGuards?.selected ? num(pricing?.gutters?.leafGuards?.price || 0) : 0)
  ),
});

// 5b) GUTTERS — full set of template fields for gutters
Object.assign(data, {
  gutters_feet: Number(pricing?.gutters?.feet || 0),
  gutters_type_label: (typeof guttersLabel === 'function' ? guttersLabel(pricing?.gutters?.type) : (pricing?.gutters?.type || "")),
  gutters_install_mode_label: (
    pricing?.gutters?.installMode === 'new' ? 'Install new' :
    pricing?.gutters?.installMode === 'angled_fascia' ? 'Angled Fascia' : 'Replace existing'
  ),
  gutters_rate_per_ft: fmtMoney(num(pricing?.gutters?.rates?.[pricing?.gutters?.type] || 0)),

  // Downspouts
  gutters_downspouts_type: (
    pricing?.gutters?.downspouts?.type === 'down5' ? '5" Downspouts' :
    pricing?.gutters?.downspouts?.type === 'down6' ? '6" Downspouts' :
    pricing?.gutters?.downspouts?.type === 'copper_round' ? 'Copper Round Downspouts' :
    pricing?.gutters?.downspouts?.type === 'aluminum_round' ? 'Aluminum Round Downspouts' :
    (pricing?.gutters?.downspouts?.type || '')
  ),
  gutters_downspouts_type_label: (
    pricing?.gutters?.downspouts?.type === 'down5' ? '5" Downspouts' :
    pricing?.gutters?.downspouts?.type === 'down6' ? '6" Downspouts' :
    pricing?.gutters?.downspouts?.type === 'copper_round' ? 'Copper Round Downspouts' :
    pricing?.gutters?.downspouts?.type === 'aluminum_round' ? 'Aluminum Round Downspouts' :
    (pricing?.gutters?.downspouts?.type || '')
  ),
  gutters_downspouts_feet: Number(pricing?.gutters?.downspouts?.feet || 0),
  gutters_downspouts_rate_per_ft: fmtMoney(num(pricing?.gutters?.downspouts?.rates?.[pricing?.gutters?.downspouts?.type] || 0)),
  gutters_downspouts_total: fmtMoney(num(pricing?.gutters?.downspouts?.feet || 0) * num(pricing?.gutters?.downspouts?.rates?.[pricing?.gutters?.downspouts?.type] || 0)),

  // Leaf guards
  gutters_leafguards_on: !!pricing?.gutters?.leafGuards?.selected,
  gutters_leafguards_feet: Number(pricing?.gutters?.leafGuards?.feet || 0),
  gutters_leafguards_total: fmtMoney(11 * Number(pricing?.gutters?.leafGuards?.feet || 0)),

  // Overall gutters total (already provided as gutters_total) kept for clarity
  gutters_total: fmtMoney(guttersTotal),
});

// ---- WINDOWS & DOORS → DOCX keys
{
  const w = pricing.windowsAndDoors || {};
  // compute a simple subtotal for the section (mirror extras logic)
  const windows_and_doors_total_calc = (() => {
    if (!w.selected) return 0;
    let t = 0;
    t += (w.windowsCount || 0) * 500;
    t += (w.doorsCount || 0) * 900;
    t += (w.slider6Count || 0) * 1000;
    t += (w.slider8Count || 0) * 1200;
    if (w.custom) t += num(w.customPrice || 0);
    if (w.includeInsideCasing) t += (w.insideCasingFeet || 0) * 17;
    if (w.includeOutsideTrim) t += (w.outsideTrimFeet || 0) * 19;
    return round2(t);
  })();

  const show = (cond) => (cond ? [{}] : []);

  Object.assign(data, {
    // row arrays for docxtemplater
    row_windows_and_doors: show(!!w.selected),
    row_windows: show(!!w.windows),
    row_doors: show(!!w.doors),
    row_windows_count: show((w.windowsCount || 0) > 0),
    row_doors_count: show((w.doorsCount || 0) > 0),
    row_slider6: show(!!w.slider6),
    row_slider6_count: show((w.slider6Count || 0) > 0),
    row_slider8: show(!!w.slider8),
    row_slider8_count: show((w.slider8Count || 0) > 0),
    row_windows_custom: show(!!w.custom),
    row_include_outside_trim: show(!!w.includeOutsideTrim),
    row_include_inside_casing: show(!!w.includeInsideCasing),

    // simple keys
    windows_count: Number(w.windowsCount || 0),
    doors_count: Number(w.doorsCount || 0),
    slider6_count: Number(w.slider6Count || 0),
    slider8_count: Number(w.slider8Count || 0),
    windows_desc: (w.windowsDesc || ""),
    doors_desc: (w.doorsDesc || ""),
    slider6_desc: (w.slider6Desc || ""),
    slider8_desc: (w.slider8Desc || ""),
    custom_desc: (w.customDesc || ""),
    custom_price: fmtMoney(num(w.customPrice || 0)),

    include_outside_trim: !!w.includeOutsideTrim,
    outside_trim_feet: Number(w.outsideTrimFeet || 0),
    include_inside_casing: !!w.includeInsideCasing,
    inside_casing_feet: Number(w.insideCasingFeet || 0),

    windows_and_doors_total: fmtMoney(windows_and_doors_total_calc),
  });
}

// 6) NOTES wrapper (shows/hides the Additional Notes block)
Object.assign(data, {
  row_notes: show(!!(scope?.notes && String(scope.notes).trim())),
});

// 7) DECKING section keys + rows/labels used by the DOCX
{
  const d = pricing?.decking || {};
  const framing    = d.framing || {};
  const replacing  = d.replacing || {};
  const concrete   = d.concrete || {};
  const skirt      = d.skirtTrim || {};
  const materials  = d.materials || {};
  const railing    = d.railing || {};

  // Build labels from checked materials/railings
  const matOrder = ["azek", "wolf", "trex", "mahogany", "pt"];
  const railOrder = ["intex", "azek", "pt", "cable"];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const decking_material_label = matOrder
    .filter((k) => !!materials[k])
    .map((k) => (k === "pt" ? "PT" : cap(k)))
    .join(" / ") || "Selected";

  const decking_railing_label = railOrder
    .filter((k) => !!railing[k])
    .map(cap)
    .join(" / ");
  // Compute decking total (mirror the UI calculation) so DOCX export is accurate
  const decking_total_calc = (() => {
    let materialRate = 0;
    if (materials.pt) materialRate = 25;
    if (materials.mahogany) materialRate = 43;
    if (materials.trex) materialRate = 47;
    if (materials.azek) materialRate = 55;
    if (materials.wolf) materialRate = 55;
    const materialPrice = num(d.materialSqft || 0) * materialRate;

    let railingRate = 0;
    if (railing.pt) railingRate = 85;
    if (railing.azek) railingRate = 120;
    if (railing.intex) railingRate = 150;
    if (railing.cable) railingRate = 275;
    const railingPrice = num(d.railingLinearFt || 0) * railingRate;

    const groundLevelFramingPrice = num(framing.groundLevelSqft || 0) * 25;
    const secondStoryFramingPrice = num(framing.secondStorySqft || 0) * 35;
    const sonoTubesPrice = num(concrete.sonoTubesCount || 0) * 500;
    const landingPrice = num(concrete.landingSqft || 0) * 100;
    const azekSkirtTrimPrice = num(skirt.linearFt || 0) * 19;

    return materialPrice + railingPrice + groundLevelFramingPrice + secondStoryFramingPrice + sonoTubesPrice + landingPrice + azekSkirtTrimPrice;
  })();

  Object.assign(data, {
    decking_areas: (d.areas || "").trim(),

    row_decking_framing_ground: show(!!framing.groundLevel && num(framing.groundLevelSqft) > 0),
    decking_framing_ground_sqft: num(framing.groundLevelSqft || 0),

    row_decking_framing_second: show(!!framing.secondStory && num(framing.secondStorySqft) > 0),
    decking_framing_second_sqft: num(framing.secondStorySqft || 0),

    row_decking_replacing_decking: show(!!replacing.decking),
    decking_material_label,

    row_decking_replacing_railings: show(!!replacing.railings),
    decking_railing_label,

    row_decking_sonotubes: show(!!concrete.sonoTubes && num(concrete.sonoTubesCount || 0) > 0),

  // Sonotubes: expose count and line total for templates
  decking_sonotubes_count: Number(concrete.sonoTubesCount || 0),
  decking_sonotubes_total: fmtMoney(num(concrete.sonoTubesCount || 0) * 500),

    row_decking_landing: show(!!concrete.landing && num(concrete.landingSqft || 0) > 0),
    decking_landing_sqft: num(concrete.landingSqft || 0),

  row_decking_skirttrim_azek: show(!!skirt.azek && num(skirt?.linearFt ?? skirt.linearFt ?? 0) > 0),
    decking_skirttrim_linearft: num(skirt.linearFt || 0),

    // Decking total computed from inputs (mirrors UI)
    decking_total: fmtMoney(decking_total_calc),
  });
}

// 8) SIDING — VINYL section wrapper + fields used in template
{
  const v = byCat.vinyl || {};
  const vinylOn = !!workDomain?.siding && catPicked("vinyl");

  Object.assign(data, {
    show_siding_vinyl: show(vinylOn),
    siding_vinyl_areas: (v.areas || pricing?.siding?.areas || "").trim(),
    siding_vinyl_product_label: (typeof productLabelFor === "function"
      ? productLabelFor("vinyl", v.product)
      : v.product) || (v.product || ""),
    siding_vinyl_exposure: (v.exposure || pricing?.siding?.exposure || "").trim(),
    siding_vinyl_color: (v.color || scope?.siding?.color || "").trim(),
  });
}

// 9) SIDING — CLAP BOARD section wrapper + fields used in template
{
  const c = byCat.clapBoard || {};
  const clapOn = !!workDomain?.siding && catPicked("clapBoard");

  Object.assign(data, {
    show_siding_clapBoard: show(clapOn),
    siding_clap_areas: (c.areas || pricing?.siding?.areas || "").trim(),
    siding_clap_product_label: (typeof productLabelFor === "function"
      ? productLabelFor("clapBoard", c.product)
      : c.product) || (c.product || ""),
    siding_clap_exposure: (c.exposure || pricing?.siding?.exposure || "").trim(),
  });
}

      // Normalize every photo item to have `image` for {%image} and provide row flags
      const photosList = (id) =>
        (photos?.[id] || []).map((p, i) => ({
          i: i + 1,
          name: p?.name || `Photo ${i + 1}`,
          image:
            p?.image || p?.dataUrl || p?.dataURL || p?.data || p?.url || p?.base64 || "",
        }));
      const rowFlag = (id) => ((photos?.[id] || []).length ? [{}] : []);

      // Roofing
      Object.assign(data, {
        photos_roofing_asphalt: photosList('roofing_asphalt'),
        row_photos_roofing_asphalt: rowFlag('roofing_asphalt'),
        photos_roofing_davinci: photosList('roofing_davinci'),
        row_photos_roofing_davinci: rowFlag('roofing_davinci'),
        photos_roofing_cedar: photosList('roofing_cedar'),
        row_photos_roofing_cedar: rowFlag('roofing_cedar'),
        photos_roofing_rubber: photosList('roofing_rubber'),
        row_photos_roofing_rubber: rowFlag('roofing_rubber'),
      });

      // Siding
      Object.assign(data, {
        photos_siding_cedarShake: photosList('siding_cedarShake'),
        row_photos_siding_cedarShake: rowFlag('siding_cedarShake'),
        photos_siding_synthetic: photosList('siding_synthetic'),
        row_photos_siding_synthetic: rowFlag('siding_synthetic'),
        photos_siding_vinyl: photosList('siding_vinyl'),
        row_photos_siding_vinyl: rowFlag('siding_vinyl'),
        photos_siding_clapBoard: photosList('siding_clapBoard'),
        row_photos_siding_clapBoard: rowFlag('siding_clapBoard'),
      });

      // Decking
      Object.assign(data, {
        photos_decking: photosList('decking'),
        row_photos_decking: rowFlag('decking'),
      });

      // Extras
      Object.assign(data, {
        photos_extra_plywood: photosList('extra_plywood'),
        row_photos_extra_plywood: rowFlag('extra_plywood'),
        photos_extra_chimney: photosList('extra_chimney'),
        row_photos_extra_chimney: rowFlag('extra_chimney'),
        photos_extra_skylights: photosList('extra_skylights'),
        row_photos_extra_skylights: rowFlag('extra_skylights'),
        photos_extra_trim: photosList('extra_trim'),
        row_photos_extra_trim: rowFlag('extra_trim'),
        photos_extra_gutters: photosList('extra_gutters'),
        row_photos_extra_gutters: rowFlag('extra_gutters'),
        photos_extra_detached: photosList('extra_detached'),
        row_photos_extra_detached: rowFlag('extra_detached'),
        photos_extra_windows_and_doors: photosList('extra_windows_and_doors'),
        row_photos_extra_windows_and_doors: rowFlag('extra_windows_and_doors'),
        photos_extra_custom: photosList('extra_custom'),
        row_photos_extra_custom: rowFlag('extra_custom'),
      });

  // Expose the final payload for easy inspection in DevTools (helps debug missing photos)
  try { window.__lastDocxData = data; } catch (e) {}
  try { console.log('photos_roofing_asphalt:', JSON.stringify(data.photos_roofing_asphalt || [], null, 2)); } catch (e) {}
  // TEMP DEBUG — prove the app is exporting the exact arrays the DOCX loops expect
  try {
    console.log("asphalt loop exists? ", Array.isArray(data.photos_roofing_asphalt), "len:", data.photos_roofing_asphalt?.length);
    console.log("davinci loop exists? ", Array.isArray(data.photos_roofing_davinci), "len:", data.photos_roofing_davinci?.length);
    console.log("asphalt first item:", data.photos_roofing_asphalt?.[0]);
    console.log("davinci first item:", data.photos_roofing_davinci?.[0]);
  } catch (e) { console.warn('Debug print failed', e); }
  // Add a tiny test image (1x1 PNG) so the image module has something to try
  try { data.testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2n6hcAAAAASUVORK5CYII="; } catch (e) {}
  doc.setData(data);
      doc.render();
    } catch (e) {
      console.error(e);
      alert("Template render error: " + (e.properties?.errors?.[0]?.properties?.explanation || e.message));
      return;
    }

    const out = doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const filename = `${customer.name || "Proposal"} Roof Proposal.docx`;
    // Use a safe anchor download (avoids File System Access API prompts)
    try {
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      // Fallback to file-saver if available
      try { saveAs(out, filename); } catch (e) { console.error('Download failed', e); alert('Download failed: ' + e.message); }
    }
  };

  const [company, setCompany] = useLocalStorage("hytech_company", {
    name: "HyTech Roofing Solutions",
    address: "714A Route 6-A, Yarmouth Port, MA 02675",
    phone: "",
    email: "",
    hic: "184383",
    csl: "105951",
    notes:
      "Carries Workman's Comp and Liability; handles permitting; files mfr warranties after final payment.",
  });

  const [customer, setCustomer] = useState({
  name: "",
  tel: "",
  cell: "",
  email: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  providedOn: todayISO,
  });

  const [measure, setMeasure] = useState({
  roofSquares: 0,
    wastePct: 10,
    flatRoofSquares: 5,
  feetRakes: 0,
  feetEaves: 0,
  feetRidge: 0,
  feetHips: 0,
  feetValleys: 0,
  feetFlashing: 0,
  pipeFlangesSmall: 0,
  pipeFlangesLarge: 0,
  vents636: 0,
  vents634: 0,
  });

  // -------- Pricing & options
  const [pricing, setPricing] = useState({
    asphaltSelected: "", // '' | 'landmark' | 'pro' | 'northgate'
    asphaltCalcMode: "bySquare", // bySquare | manual
    unitPrice: { landmark: 700, pro: 720, northgate: 800 },
    manualPrice: { landmark: 0, pro: 0, northgate: 0 },

  davinciMode: "bySquare",
  davinciUnit: 2750,
    davinciManual: 27500,

    cedarMode: "bySquare",
    cedarUnit: 3050,
    cedarManual: 30500,
  cedarIncludeWovenCaps: false,
  cedarWovenCapsFeet: 0,

    rubberMode: "bySquare",
    rubberUnit: 1150,
    rubberManual: 6750,
  rubberCurbSkylights: 0,

    siding: {
      category: "none", // none|cedarShake|synthetic|vinyl|clapBoard
      product: "",
      exposure: '5"',
      areas: "",
  squares: 0,
      calcMode: "bySquare",
      manualTotal: 0,
      rates: {
        cedarShake: {
          whiteCedar: 1650,
          maibec1: 1750,
          maibec2: 1850,
          redCedar: 2600,
        },
        synthetic: {
          hardiPlankCedarMill: 1800,
          hardiStraightEdgeShingle: 1950,
          hardiPanelSierra9: 950,
        },
        vinyl: {
          monogram: 1100,
          mainStreet: 900,
          cedarImpressions: 2950,
          everlast: 1850,
        },
        clapBoard: {
          primedRedCedar: 1150,
          clearRedCedar: 2250,
        },
      },
      // default per-category config: ensure Synthetic has a default product selected
      byCategory: {
        synthetic: {
          product: '',
          unit: 1800,
          squares: 0,
          calcMode: 'bySquare',
          manualTotal: 0,
          areas: '',
        },
      },
    },

    plywood: {
      selected: false,
      areas: "",
      entireRoof: false,
      squares: 0,
      mode: "replace", // replace | overlay | new
  rateByMode: { replace: 360, overlay: 330, new: 300 },
      priority: "optional",
    },

    chimney: {
      selected: false,
      size: "", // repair|small|medium|large|xl
      prices: { repair: 400, small: 800, medium: 1200, large: 1600, xl: 2000 },
      cricket: false,
      cricketPrice: 450,
      areas: "",
      installMode: "replace", // replace | new
    },

    skylights: {
      selected: false,
      complexity: "replacing", // replacing | replacing_complex | framing_new | framing_new_complex
      base: { fixed: 1550, manual: 2150, solar: 2900 },
      adders: {
        replacing: 0,
        replacing_complex: 650,
        framing_new: 1000,
        framing_new_complex: 2000,
      },
      editPrices: false,
      areas: "",
      installMode: "replace",
    },

    trim: {
      selected: false,
      material: "azek", // azek | cedar
      rates: { azek: 19, cedar: 28 },
      installMode: "replace", // replace | new (−$2/ft)
      areas: "",
      feet: {
        soffit: 0,
        fascias: 0,
        frieze: 0,
        molding: 0,
        cornerBoards: 0,
        windowDoor: 0,
        rakeBoards: 0,
        waterTable: 0,
      },
    },

    gutters: {
      selected: false,
      type: "aluminum5", // aluminum5 | aluminum6 | copper_k5 | copper_h6
      feet: 0,
      rates: { aluminum5: 19, aluminum6: 22, copper_k5: 45, copper_h6: 52 },
      installMode: "replace", // replace | new | angled_fascia
      areas: "",
      leafGuards: { selected: false, price: 0 },
  downspouts: { type: "down5", feet: 0, rates: { down5: 19, down6: 22, copper_round: 45, aluminum_round: 36 } },
    },

    detached: {
      selected: false,
      squares: 0,
      type: "garage", // garage | shed | barn | other
      otherLabel: "",
    },

    decking: {
      skirtTrim: {
        azek: false,
        linearFt: 0,
      },
      materials: { azek: false, wolf: false, pt: false, mahogany: false, trex: false },
      areas: "",
      workModes: {
        buildNew: { selected: false, sqft: 0 },
        resurfacing: { selected: false, sqft: 0 },
      },
      railing: { intex: false, azek: false, pt: false, cable: false },
      replacing: {
        decking: false,
        framing: false,
        railings: false,
      },
      framing: {
        groundLevel: false,
        groundLevelSqft: 0,
        secondStory: false,
        secondStorySqft: 0,
      },
      concrete: {
        sonoTubes: false,
        sonoTubesCount: 0,
        landing: false,
        landingSqft: 0,
      },
      // (duplicate skirtTrim removed)
    },

    windowsAndDoors: {
  selected: false,
  windows: false,
  doors: false,
  slider6: false,
  slider8: false,
  custom: false,
  windowsDesc: "",
  windowsCount: 0,
  doorsDesc: "",
  doorsCount: 0,
  slider6Desc: "",
  slider6Count: 0,
  slider8Desc: "",
  slider8Count: 0,
  customDesc: "",
  customPrice: 0,
  includeOutsideTrim: false,
  outsideTrimFeet: 0,
  includeInsideCasing: false,
  insideCasingFeet: 0,
    },

    customAdd: { selected: false, label: "", price: 0 },

    hideTotalsInPrint: true,
  });

  // If the measured feet of valleys is > 0, auto-check copper valley options and carry the measurement
  // Track whether valley feet were auto-set (so we can keep syncing unless user manually edits)
  const _valleysAutoSet = useRef({ cedar: false, davinci: false });
  // Track whether woven caps total was auto-populated from measurements
  const _wovenCapsAutoSet = useRef(false);
  useEffect(() => {
    // debounce so we don't pick up partial digits while typing
    const timeout = setTimeout(() => {
      const fv = num(measure.feetValleys || 0);
      if (fv <= 0) return;

      setScope(s => ({
        ...s,
        cedar: { ...s.cedar, includeCopperValleys: true },
        davinci: { ...s.davinci, includeCopperValleys: true },
      }));

      // Only overwrite pricing values if they were auto-set previously or are empty/zero.
      setPricing(prev => {
        const next = { ...prev };
        let changed = false;
        if ((num(prev.cedarCopperValleyFeet || 0) === 0) || _valleysAutoSet.current.cedar) {
          next.cedarCopperValleyFeet = fv;
          _valleysAutoSet.current.cedar = true;
          changed = true;
        }
        if ((num(prev.davinciCopperValleyFeet || 0) === 0) || _valleysAutoSet.current.davinci) {
          next.davinciCopperValleyFeet = fv;
          _valleysAutoSet.current.davinci = true;
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 350);
    return () => clearTimeout(timeout);
  }, [measure.feetValleys]);
  // Default trim feet from Measurements: soffit/fascias/frieze/molding -> feetEaves ; rakeBoards -> feetRakes
  // Track which trim feet keys were auto-populated from Measurements. If the user manually edits a
  // trim field we clear its auto-flag so further measurement changes won't overwrite it.
  const _autoTrimKeys = useRef(new Set());

  useEffect(() => {
    // debounce user typing so we don't copy partial digits while typing (e.g., typing '22' -> '2')
    const timeout = setTimeout(() => {
      const eaves = num(measure.feetEaves || 0);
      const rakes = num(measure.feetRakes || 0);
  if ((eaves <= 0 && rakes <= 0)) return;
      // debug: show values when attempting to copy measurements into trim
      try { console.debug('trim defaults: eaves=', eaves, 'rakes=', rakes); } catch {}

      setPricing(prev => {
        const next = { ...prev };
        const tf = { ...((prev.trim && prev.trim.feet) || {}) };
        let changed = false;
        // map keys
        const eaveKeys = ["soffit", "fascias", "frieze", "molding"];
        eaveKeys.forEach((k) => {
          // Copy when the target was empty/zero or when it was previously auto-populated.
          if (((num(tf[k] || 0) === 0) || _autoTrimKeys.current.has(k)) && eaves > 0) {
            // copy raw numeric feet (preserve large integers up to 5+ digits)
            tf[k] = num(eaves);
            _autoTrimKeys.current.add(k);
            changed = true;
          }
        });
        if (((num(tf.rakeBoards || 0) === 0) || _autoTrimKeys.current.has('rakeBoards')) && rakes > 0) {
          // Rake boards typically run both sides — default to twice the measured rakes
          tf.rakeBoards = num(rakes * 2);
          _autoTrimKeys.current.add('rakeBoards');
          changed = true;
        }
        if (changed) {
          next.trim = { ...prev.trim, feet: tf };
          try {
            // Log exact assigned values and types for debugging truncation issues
            console.debug('trim defaults applied:', JSON.stringify(tf), {
              types: Object.fromEntries(Object.keys(tf).map(k => [k, typeof tf[k]])),
            });
          } catch {}
          return next;
        }
        return prev;
      });
    }, 350);
    return () => clearTimeout(timeout);
  }, [measure.feetEaves, measure.feetRakes]);

  // Auto-populate woven caps feet when the option is enabled and hips/ridges selections are made.
  // Rules:
  // - If Hips selected -> use measure.feetHips
  // - If Ridges selected -> use measure.feetRidge
  // - If both selected -> sum of both
  // Only auto-write the total when the target is 0 or was previously auto-set. Manual edits clear the auto-flag.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!pricing.cedarIncludeWovenCaps) return;
      const hipsSelected = !!pricing.cedarWovenCapsHips;
      const ridgesSelected = !!pricing.cedarWovenCapsRidges;
      if (!hipsSelected && !ridgesSelected) return;

      const hips = num(measure.feetHips || 0);
      const ridges = num(measure.feetRidge || 0);
      const total = (hipsSelected ? hips : 0) + (ridgesSelected ? ridges : 0);
      if (total <= 0) return;

      setPricing(prev => {
        const next = { ...prev };
        const current = num(prev.cedarWovenCapsFeet || 0);
        if (current === 0 || _wovenCapsAutoSet.current) {
          next.cedarWovenCapsFeet = total;
          _wovenCapsAutoSet.current = true;
          return next;
        }
        return prev;
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [pricing.cedarIncludeWovenCaps, pricing.cedarWovenCapsHips, pricing.cedarWovenCapsRidges, measure.feetHips, measure.feetRidge]);

  // If user selects Woven Caps -> Ridges, clear the '8" Red Cedar ridge boards' included scope option
  // Remember previous ridge boards selection so we can restore it when ridges is unchecked
  const _prevCedarRidgeBoards = useRef(null);
  useEffect(() => {
    if (pricing.cedarWovenCapsRidges) {
      // Save previous state and clear
      setScope(s => {
        try { _prevCedarRidgeBoards.current = Boolean(s.cedar?.cedarRidgeBoards); } catch {}
        return { ...s, cedar: { ...s.cedar, cedarRidgeBoards: false } };
      });
    } else {
      // If we have a previously saved value, restore it
      if (_prevCedarRidgeBoards.current !== null) {
        setScope(s => ({ ...s, cedar: { ...s.cedar, cedarRidgeBoards: _prevCedarRidgeBoards.current } }));
        _prevCedarRidgeBoards.current = null;
      }
    }
  }, [pricing.cedarWovenCapsRidges]);

  const [scope, setScope] = useState({
    asphalt: {
      plywoodCondition: "inspectRenail",
      syntheticUnderlayment: true,
      starterStrips: true,
      ridgeVent: true,
      hipRidgeCaps: true,
      pipeFlashings: true,
      cleanup: true,
      color: "",
      dripEdgeType: "hicks_vent",
      dripEdgeColor: "white",
      iceAreas: {
  eaves3: true,
  valleys: false,
  pipesVents: false,
  stepFlash: false,
  chimney: false,
  skylights: false,
  lowPitch: false,
  solarAreas: false,
  fullCoverage: false,
  solarSquares: 0,
      },
  pipeFlange: { aluminum: true, copper: false },
  roofFanVents: { blackAluminum: false, copper: false },
      areas: "",
    },
    davinci: {
      plywoodCondition: "inspectRenail",
      copperDripEaves: true,
      copperDripRakes: true,
      iceWaterFull: true,
      davinciStarter: true,
      copperValleys: true,
      ridgeVent: true,
      hipRidgeCaps: true,
      pipeFlashings: true,
      cleanup: true,
      color: "",
      dripEdgeType: "copper_5",
      areas: "",
    },
    cedar: {
      plywoodCondition: "inspectRenail",
      copperDripEaves: true,
      copperDripRakes: true,
      iceWaterFull: true,
      cedarBreather: true,
      ridgeVent: true,
      cedarRidgeBoards: true,
      pipeFlashings: true,
      cleanup: true,
      dripEdgeType: "copper_5",
      areas: "",
    },
    rubber: {
  plywoodCondition: "inspectRenail",
      epdm060: true,
      fiberboard: true,
      aluminumDripEdge: true,
      seamSplice: true,
      seamCoverTape: true,
      pipeBoots: true,
  curbSkylights: false,
      areas: "",
    },
    siding: {
      typar: true,
      vycorTape: true,
      stainlessStaples: true,
      dripCaps: true,
      azekBlocks: true,
      wireHangers: true,
      cleanup: true,
      color: "",
    },
  notes: "",
  });

  // Ensure default color is set immediately when aluminum 8" is selected
  useEffect(() => {
    // If user switches to aluminum eave and no color set, default to 'white'
    if (scope?.asphalt?.dripEdgeType === 'aluminum_8' && !scope.asphalt.dripEdgeColor) {
      setScope(s => ({ ...s, asphalt: { ...s.asphalt, dripEdgeColor: 'white' } }));
    }
    // If user switches to aluminum rake and no color set, default to 'white'
    if (scope?.asphalt?.rakeDripEdgeType === 'aluminum_8' && !scope.asphalt.rakeDripEdgeColor) {
      setScope(s => ({ ...s, asphalt: { ...s.asphalt, rakeDripEdgeColor: 'white' } }));
    }
  }, [scope?.asphalt?.dripEdgeType, scope?.asphalt?.rakeDripEdgeType]);

  // Davinci: same immediate default behavior for aluminum options
  useEffect(() => {
    if (scope?.davinci?.dripEdgeType === 'aluminum_8' && !scope.davinci.dripEdgeColor) {
      setScope(s => ({ ...s, davinci: { ...s.davinci, dripEdgeColor: 'white' } }));
    }
    if (scope?.davinci?.rakeDripEdgeType === 'aluminum_8' && !scope.davinci.rakeDripEdgeColor) {
      setScope(s => ({ ...s, davinci: { ...s.davinci, rakeDripEdgeColor: 'white' } }));
    }
  }, [scope?.davinci?.dripEdgeType, scope?.davinci?.rakeDripEdgeType]);

  const [workDomain, setWorkDomain] = useState({ roofing: false, siding: false, decking: false });
  const [selectedWork, setSelectedWork] = useState({ asphalt: false, davinci: false, cedar: false, rubber: false, sidingCategories: [] });
  const [photos, setPhotos] = useState({});

  // Derived
  const effectiveSquares = useMemo(
    () => round2(measure.roofSquares * (1 + num(measure.wastePct) / 100)),
    [measure.roofSquares, measure.wastePct]
  );

  const asphaltBaseFor = (tier) => {
    if (!tier) return 0;
    if (pricing.asphaltCalcMode === "bySquare") {
      let base = round2(effectiveSquares * num(pricing.unitPrice[tier]));
      // solar areas surcharge
      const solarSquares = scope.asphalt?.iceAreas?.solarAreas ? num(scope.asphalt.iceAreas.solarSquares || 0) : 0;
      if (solarSquares > 0) base = round2(base + solarSquares * 100);
      // full roof coverage surcharge: +$100 per effective square
      if (scope.asphalt?.iceAreas?.fullCoverage) base = round2(base + effectiveSquares * 100);
      return base;
    }
    return num(pricing.manualPrice[tier]);
  };
  const asphaltBases = {
    landmark: asphaltBaseFor("landmark"),
    pro: asphaltBaseFor("pro"),
    northgate: asphaltBaseFor("northgate"),
  };
  const asphaltBaseSelected = useMemo(
    () =>
      asphaltBaseFor(pricing.asphaltSelected),
    [
      pricing.asphaltSelected,
      pricing.asphaltCalcMode,
      pricing.unitPrice,
      pricing.manualPrice,
  effectiveSquares,
  scope.asphalt?.iceAreas?.fullCoverage,
  scope.asphalt?.iceAreas?.solarSquares,
    ]
  );

  const davinciBase = useMemo(
    () =>
      !workDomain.roofing || !selectedWork.davinci
        ? 0
        : pricing.davinciMode === "bySquare"
  ? (() => {
            const base = round2(effectiveSquares * num(pricing.davinciUnit));
            // plywood cost (uses shared pricing.plywood.squares and pricing rules)
            let plywoodCost = 0;
            if (pricing.plywood?.selected && scope.davinci?.plywoodCondition && scope.davinci.plywoodCondition !== "inspectRenail") {
              const squares = num(pricing.plywood.squares || 0);
              if (scope.davinci.plywoodCondition === "replace") plywoodCost = 360 * squares;
              if (scope.davinci.plywoodCondition === "newOverBoards") plywoodCost = 330 * squares;
            }
            // Copper drip edge and valley costs (only if copper selected)
            const copperDripEdgeCost =
              (scope.davinci.dripEdgeType === "copper_5" || scope.davinci.rakeDripEdgeType === "copper_5")
                ? num(pricing.davinciCopperDripEdgeFeet || 0) * 10
                : 0;
            const copperValleyCost = scope.davinci.includeCopperValleys
                ? num(pricing.davinciCopperValleyFeet || 0) * 25
                : 0;
            return round2(base + plywoodCost + copperDripEdgeCost + copperValleyCost);
          })()
        : num(pricing.davinciManual),
    [
      workDomain.roofing,
      selectedWork.davinci,
      pricing.davinciMode,
      pricing.davinciUnit,
      pricing.davinciManual,
      effectiveSquares,
      pricing.plywood && pricing.plywood.squares,
      pricing.plywood && pricing.plywood.selected,
      scope.davinci && scope.davinci.plywoodCondition,
      scope.davinci && scope.davinci.dripEdgeType,
      scope.davinci && scope.davinci.rakeDripEdgeType,
      scope.davinci && scope.davinci.includeCopperValleys,
      pricing.davinciCopperDripEdgeFeet,
      pricing.davinciCopperValleyFeet,
    ]
  );

  const cedarBase = useMemo(
    () =>
      !workDomain.roofing || !selectedWork.cedar
        ? 0
        : pricing.cedarMode === "bySquare"
  ? (() => {
            const base = round2(effectiveSquares * num(pricing.cedarUnit)) + (pricing.cedarIncludeWovenCaps ? (45 * num(pricing.cedarWovenCapsFeet || 0)) : 0);
            const squares = num(pricing.cedarPlywoodSquares || 0);
            let plywoodCost = 0;
            if (scope.cedar?.plywoodCondition === "replace") plywoodCost = 360 * squares;
            if (scope.cedar?.plywoodCondition === "newOverBoards") plywoodCost = 330 * squares;
            // Copper drip edge and valley costs (only if copper selected)
            const copperDripEdgeCost =
              (scope.cedar.dripEdgeType === "copper_5" || scope.cedar.rakeDripEdgeType === "copper_5")
                ? num(pricing.cedarCopperDripEdgeFeet || 0) * 10
                : 0;
            const copperValleyCost = scope.cedar.includeCopperValleys
                ? num(pricing.cedarCopperValleyFeet || 0) * 25
                : 0;
            return base + plywoodCost + copperDripEdgeCost + copperValleyCost;
          })()
  : (() => {
            const base = num(pricing.cedarManual) + (pricing.cedarIncludeWovenCaps ? (45 * num(pricing.cedarWovenCapsFeet || 0)) : 0);
            const squares = num(pricing.cedarPlywoodSquares || 0);
            let plywoodCost = 0;
            if (scope.cedar?.plywoodCondition === "replace") plywoodCost = 360 * squares;
            if (scope.cedar?.plywoodCondition === "newOverBoards") plywoodCost = 330 * squares;
            return base + plywoodCost;
          })(),
    [
      workDomain.roofing,
      selectedWork.cedar,
      pricing.cedarMode,
      pricing.cedarUnit,
      pricing.cedarManual,
      pricing.cedarIncludeWovenCaps,
      pricing.cedarWovenCapsFeet,
      pricing.cedarPlywoodSquares,
      scope.cedar && scope.cedar.plywoodCondition,
      scope.cedar && scope.cedar.dripEdgeType,
      scope.cedar && scope.cedar.rakeDripEdgeType,
      scope.cedar && scope.cedar.includeCopperValleys,
      pricing.cedarCopperDripEdgeFeet,
      pricing.cedarCopperValleyFeet,
      effectiveSquares,
    ]
  );

  const rubberBase = useMemo(
    () =>
      !workDomain.roofing || !selectedWork.rubber
        ? 0
        : pricing.rubberMode === "bySquare"
        ? (() => {
            const base = round2(num(measure.flatRoofSquares) * num(pricing.rubberUnit));
            const squares = num(pricing.plywood.squares || 0);
            let plywoodCost = 0;
            if (scope.rubber?.plywoodCondition === "replace") plywoodCost = 360 * squares;
            if (scope.rubber?.plywoodCondition === "newOverBoards") plywoodCost = 330 * squares;
    const skylightCount = num(pricing.rubberCurbSkylights || 0);
    const skylightCost = scope.rubber?.curbSkylights ? 500 * skylightCount : 0;
            return base + plywoodCost + skylightCost;
          })()
        : (() => {
            const base = num(pricing.rubberManual);
            const squares = num(pricing.plywood.squares || 0);
            let plywoodCost = 0;
            if (scope.rubber?.plywoodCondition === "replace") plywoodCost = 360 * squares;
            if (scope.rubber?.plywoodCondition === "newOverBoards") plywoodCost = 330 * squares;
    const skylightCount = num(pricing.rubberCurbSkylights || 0);
    const skylightCost = scope.rubber?.curbSkylights ? 500 * skylightCount : 0;
            return base + plywoodCost + skylightCost;
          })(),
    [
      workDomain.roofing,
      selectedWork.rubber,
      pricing.rubberMode,
      pricing.rubberUnit,
      pricing.rubberManual,
      pricing.plywood && pricing.plywood.squares,
  scope.rubber && scope.rubber.plywoodCondition,
  pricing.rubberCurbSkylights,
  scope.rubber && scope.rubber.curbSkylights,
      measure.flatRoofSquares,
    ]
  );

  const sidingBase = useMemo(() => {
    if (!workDomain.siding || !selectedWork.sidingCategories || selectedWork.sidingCategories.length === 0) return 0;
    const byCat = pricing.siding.byCategory || {};
    let total = 0;
    selectedWork.sidingCategories.forEach((cat) => {
      const cp = byCat[cat] || { calcMode: pricing.siding.calcMode, squares: pricing.siding.squares, manualTotal: pricing.siding.manualTotal, unit: pricing.siding.unit, wovenCorners: { include: false, feet: 0 } };
      if (cp.calcMode === "bySquare") {
        const unit = cp.unit || unitRateFor({ category: cat, product: cp.product, rates: pricing.siding.rates });
        total += round2(num(cp.squares || 0) * num(unit));
      } else {
        total += num(cp.manualTotal || 0);
      }
      // Add woven corners cost per-category (45/ft) if present
      if (cp.wovenCorners && cp.wovenCorners.include) {
        total += round2(45 * num(cp.wovenCorners.feet || 0));
      }
    });
    return round2(total);
  }, [workDomain.siding, selectedWork.sidingCategories, pricing.siding]);

  const plywoodRate = pricing.plywood.rateByMode[pricing.plywood.mode] || 0;
  const plywoodTotal = useMemo(() => computePlywoodTotal(pricing.plywood.squares, plywoodRate), [pricing.plywood.squares, plywoodRate]);

  const chimneyTotal = useMemo(() => {
    if (!pricing.chimney.selected) return 0;
    const base = num(pricing.chimney.prices[pricing.chimney.size]);
    const cricket = pricing.chimney.cricket ? num(pricing.chimney.cricketPrice) : 0;
    return round2(base + cricket);
  }, [pricing.chimney]);

  const trimTotal = useMemo(() => {
    if (!pricing.trim.selected) return 0;
    const raw = pricing.trim.material === "cedar" ? pricing.trim.rates.cedar : pricing.trim.rates.azek;
    const rate = num(raw) - (pricing.trim.installMode === "new" ? 2 : 0);
    const feet = Object.values(pricing.trim.feet).reduce((a, b) => a + num(b), 0);
    return round2(num(rate) * feet);
  }, [pricing.trim]);

  const guttersTotal = useMemo(() => {
    if (!pricing.gutters.selected) return 0;
    let effRate = num(pricing.gutters.rates[pricing.gutters.type]);
    if (pricing.gutters.installMode === "new") effRate -= 2;
    if (pricing.gutters.installMode === "angled_fascia") effRate += 4;
    const base = round2(effRate * num(pricing.gutters.feet));
  const dsRate = num(pricing.gutters.downspouts.rates[pricing.gutters.downspouts.type] || 0);
  const dsBase = round2(dsRate * num(pricing.gutters.downspouts.feet || 0));
    const leafs = pricing.gutters.leafGuards.selected ? num(pricing.gutters.leafGuards.price) : 0;
  return round2(base + dsBase + leafs);
  }, [pricing.gutters]);

  const skylightDisplayed = useMemo(
    () => computeSkylightPrices(pricing.skylights.base, pricing.skylights.complexity, pricing.skylights.adders),
    [pricing.skylights]
  );

  const extrasTotal = useMemo(() => {
    let t = 0;
    if (pricing.plywood.selected) t += plywoodTotal;
    if (pricing.chimney.selected) t += chimneyTotal;
    if (pricing.trim.selected) t += trimTotal;
    if (pricing.gutters.selected) t += guttersTotal;
    // Windows and Doors
    if (pricing.windowsAndDoors && pricing.windowsAndDoors.selected) {
      t += (pricing.windowsAndDoors.windowsCount || 0) * 500;
      t += (pricing.windowsAndDoors.doorsCount || 0) * 900;
      t += (pricing.windowsAndDoors.slider6Count || 0) * 1000;
      t += (pricing.windowsAndDoors.slider8Count || 0) * 1200;
      if (pricing.windowsAndDoors.custom) {
        t += num(pricing.windowsAndDoors.customPrice || 0);
      }
  // Inside casing & outside trim
  if (pricing.windowsAndDoors.includeInsideCasing) t += (pricing.windowsAndDoors.insideCasingFeet || 0) * 17;
  if (pricing.windowsAndDoors.includeOutsideTrim) t += (pricing.windowsAndDoors.outsideTrimFeet || 0) * 19;
    }
    if (pricing.customAdd.selected && pricing.customAdd.label && num(pricing.customAdd.price))
      t += num(pricing.customAdd.price);
    return round2(t);
  }, [pricing, plywoodTotal, chimneyTotal, trimTotal, guttersTotal]);

  const primaryTotals = useMemo(
    () => ({
      asphalt: workDomain.roofing && selectedWork.asphalt ? asphaltBaseSelected : 0,
      davinci: davinciBase,
      cedar: cedarBase,
      rubber: rubberBase,
      siding: sidingBase,
    }),
    [workDomain, selectedWork, asphaltBaseSelected, davinciBase, cedarBase, rubberBase, sidingBase]
  );
  const grandTotal = useMemo(
    () => round2(Object.values(primaryTotals).reduce((a, b) => a + b, 0) + extrasTotal),
    [primaryTotals, extrasTotal]
  );

  // Persist helpers
  const [savedName, setSavedName] = useState("");
  const [savedMap, setSavedLocalStorage] = useLocalStorage("hytech_saved_proposals", {});
  useEffect(() => {
    (async () => {
      try {
        if (savedMap && Object.keys(savedMap).length === 0) {
          const b = await readBackup();
          if (b) setSavedLocalStorage(b);
        }
      } catch {}
    })();
  }, []);
  useEffect(() => {
    writeBackup(savedMap);
  }, [savedMap]);

  // Service worker (safe no-op in canvas)
  useEffect(() => {
  // Service worker registration disabled to avoid interception of download requests
  // which can trigger additional OS/browser permission prompts when saving files.
  // if ("serviceWorker" in navigator) {
  //   navigator.serviceWorker.register("/sw.js").catch(() => {});
  // }
  }, []);

  // Auto-bind plywood 'entire roof'
  useEffect(() => {
    if (pricing.plywood.entireRoof) {
      setPricing((p) => ({
        ...p,
        plywood: { ...p.plywood, squares: effectiveSquares, selected: true },
      }));
    }
  }, [pricing.plywood.entireRoof, effectiveSquares]);

  // UI state: print
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    if (selectedWork.cedar && scope.cedar && scope.cedar.cedarType) {
      const cedarRates = {
        red: 3050,
        yellow: 3600,
        ptred: 3300
      };
      const type = scope.cedar.cedarType;
      if (pricing.cedarUnit !== cedarRates[type]) {
        setPricing(p => ({ ...p, cedarUnit: cedarRates[type] }));
      }
    }
  }, [selectedWork.cedar, scope.cedar?.cedarType]);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <div className="p-4 flex justify-end">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
          onClick={exportProposalDocx}
        >
          Export to Word
        </button>
      </div>

      <Header company={company} grandTotal={grandTotal} onPrint={() => setShowPrint(true)} />

      <div className="max-w-5xl mx-auto p-4 pb-24">
        <MobileTabs
          tabs={[
            { id: "customer", label: "Customer" },
            { id: "measure", label: "Measurements" },
            ...(workDomain.roofing ? [{ id: "roofing", label: "Roofing" }] : []),
            ...(workDomain.siding ? [{ id: "siding", label: "Siding" }] : []),
            ...(workDomain.decking ? [{ id: "decking", label: "Decking" }] : []),
            { id: "extras", label: "Extras" },
            { id: "summary", label: "Summary" },
            { id: "settings", label: "Settings" },
            { id: "save", label: "Save/Load" },
          ]}
        >
          {/* Customer */}
          <Section id="customer">
            <Card title="Customer Info">
              <TwoCol>
                <TextInput label="Customer Name" value={customer.name} onChange={(v) => setCustomer({ ...customer, name: v })} />
                <TextInput label="Provided On" value={customer.providedOn} onChange={(v) => setCustomer({ ...customer, providedOn: v })} type="date" />
                <TextInput label="Phone" value={customer.tel} onChange={(v) => setCustomer({ ...customer, tel: v })} />
                <TextInput label="Mobile" value={customer.cell} onChange={(v) => setCustomer({ ...customer, cell: v })} />
                <TextInput label="Email" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} />
                <TextInput label="Street" value={customer.street} onChange={(v) => setCustomer({ ...customer, street: v })} />
                <TextInput label="City" value={customer.city} onChange={(v) => setCustomer({ ...customer, city: v })} />
                <TextInput label="State" value={customer.state} onChange={(v) => setCustomer({ ...customer, state: v })} />
                <TextInput label="ZIP" value={customer.zip} onChange={(v) => setCustomer({ ...customer, zip: v })} />
              </TwoCol>
            </Card>

            <Card title="Work Selected">
              <div className="flex flex-wrap gap-4 mb-3">
                <Toggle label="Roofing" checked={workDomain.roofing} onChange={(v) => setWorkDomain({ ...workDomain, roofing: v })} />
                <Toggle label="Siding" checked={workDomain.siding} onChange={(v) => setWorkDomain({ ...workDomain, siding: v })} />
                <Toggle label="Decking" checked={workDomain.decking} onChange={(v) => setWorkDomain({ ...workDomain, decking: v })} />
              </div>

              {workDomain.roofing && (
                <div className="rounded-xl border p-3 bg-white mb-3">
                  <div className="text-xs font-medium mb-2">Roof Systems</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Toggle label="Asphalt Roofing" checked={selectedWork.asphalt} onChange={(v) => setSelectedWork({ ...selectedWork, asphalt: v })} />
                    <Toggle label="DaVinci Roofing" checked={selectedWork.davinci} onChange={(v) => setSelectedWork({ ...selectedWork, davinci: v })} />
                    <Toggle label="Cedar Shake Roofing" checked={selectedWork.cedar} onChange={(v) => setSelectedWork({ ...selectedWork, cedar: v })} />
                    <Toggle label="Rubber Roofing" checked={selectedWork.rubber} onChange={(v) => setSelectedWork({ ...selectedWork, rubber: v })} />
                  </div>
                </div>
              )}

              {workDomain.siding && (
                <div className="rounded-xl border p-3 bg-white">
                  <div className="text-xs font-medium mb-2">Siding Types (select any)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      ["cedarShake", "Cedar Shake"],
                      ["synthetic", "Synthetic"],
                      ["vinyl", "Vinyl"],
                      ["clapBoard", "Clap Board"],
                    ].map(([val, lbl]) => {
                      const checked = (selectedWork.sidingCategories || []).includes(val);
                      return (
                        <label key={val} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() => {
                              const current = new Set(selectedWork.sidingCategories || []);
                              if (current.has(val)) current.delete(val);
                              else current.add(val);
                              const nextArr = Array.from(current);
                              setSelectedWork({ ...selectedWork, sidingCategories: nextArr });
                              // initialize per-category pricing if added
                              if (nextArr.includes(val)) {
                                setPricing({
                                  ...pricing,
                                  siding: {
                                    ...pricing.siding,
                                    byCategory: {
                                      ...(pricing.siding.byCategory || {}),
                                      [val]: {
                                        calcMode: pricing.siding.calcMode,
                                        squares: pricing.siding.squares || 0,
                                        manualTotal: pricing.siding.manualTotal || 0,
                                        product: "",
                                        unit: pricing.siding.unit || 0,
                                      },
                                    },
                                  },
                                });
                              }
                            }}
                          />
                          <span className="text-sm">{lbl}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </Section>

          {/* Measurements */}
          <Section id="measure">
            <Card title="Measurements & Units">
              <TwoCol>
                <NumberInput label="Roof Area (squares)" value={measure.roofSquares} onChange={(v) => setMeasure({ ...measure, roofSquares: num(v) })} min={0} step="0.1" />
                <NumberInput label="Waste (%)" value={measure.wastePct} onChange={(v) => setMeasure({ ...measure, wastePct: num(v) })} min={0} step="1" />
                <NumberInput label="Flat Roof Area (squares)" value={measure.flatRoofSquares} onChange={(v) => setMeasure({ ...measure, flatRoofSquares: num(v) })} min={0} step="0.1" />
                <ReadOnly label="Effective Shingle Squares" value={`${effectiveSquares}`} />
                <NumberInput label="Feet of Rakes" value={measure.feetRakes} onChange={(v) => setMeasure({ ...measure, feetRakes: num(v) })} min={0} step="0.1" />
                <NumberInput label="Feet of Eaves" value={measure.feetEaves} onChange={(v) => setMeasure({ ...measure, feetEaves: num(v) })} min={0} step="0.1" />
                <NumberInput label="Feet of Ridge" value={measure.feetRidge} onChange={(v) => setMeasure({ ...measure, feetRidge: num(v) })} min={0} step="0.1" />
                <NumberInput label="Feet of Hips" value={measure.feetHips} onChange={(v) => setMeasure({ ...measure, feetHips: num(v) })} min={0} step="0.1" />
                <NumberInput label="Feet of Valleys" value={measure.feetValleys} onChange={(v) => setMeasure({ ...measure, feetValleys: num(v) })} min={0} step="0.1" />
                <NumberInput label="Feet of Flashing" value={measure.feetFlashing} onChange={(v) => setMeasure({ ...measure, feetFlashing: num(v) })} min={0} step="0.1" />
                <NumberInput label={'Pipe flanges (1.5" - 3")'} value={measure.pipeFlangesSmall} onChange={(v) => setMeasure({ ...measure, pipeFlangesSmall: num(v) })} min={0} step="1" />
                <NumberInput label={'Pipe flanges (4")'} value={measure.pipeFlangesLarge} onChange={(v) => setMeasure({ ...measure, pipeFlangesLarge: num(v) })} min={0} step="1" />
                <NumberInput label="# 636 vents" value={measure.vents636} onChange={(v) => setMeasure({ ...measure, vents636: num(v) })} min={0} step="1" />
                <NumberInput label="# 634 vents" value={measure.vents634} onChange={(v) => setMeasure({ ...measure, vents634: num(v) })} min={0} step="1" />
              </TwoCol>
            </Card>
          </Section>

          {/* Roofing */}
          <Section id="roofing">
            {workDomain.roofing && selectedWork.asphalt && (
              <Card title="Asphalt Roofing — Good / Better / Best">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Select label="Price Mode" value={pricing.asphaltCalcMode} onChange={(v) => setPricing({ ...pricing, asphaltCalcMode: v })} options={[{ value: "bySquare", label: "By Square" }, { value: "manual", label: "Manual Total" }]} />
                  <ReadOnly label="Squares" value={effectiveSquares} />
                  <TextInput label="Color" value={scope.asphalt.color} onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, color: v } })} placeholder="e.g., Max Def Weathered Wood" />
                </div>

                <TwoCol>
                  <TextInput label="Specify areas being replaced (roofing)" value={scope.asphalt.areas} onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, areas: v } })} />
                </TwoCol>

                <div className="mt-3">
                  <PlywoodConditionGroup
                    label="How is the plywood?"
                    value={scope.asphalt.plywoodCondition}
                    onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, plywoodCondition: v } })}
                    squaresLabel="If Replace / Install over boards: enter plywood squares"
                    squaresValue={pricing.plywood.squares}
                    onSquaresChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, squares: num(v), selected: true } })}
                  />
                  {/* Show plywood cost only if not 'inspect & renail' */}
                  {scope.asphalt.plywoodCondition !== "inspectRenail" && (() => {
                    let plywoodCost = 0;
                    if (scope.asphalt.plywoodCondition === "replace") plywoodCost = 360 * (pricing.plywood.squares || 0);
                    if (scope.asphalt.plywoodCondition === "newOverBoards") plywoodCost = 330 * (pricing.plywood.squares || 0);
                    return <ReadOnly label="Plywood Cost" value={fmtMoney(plywoodCost)} />;
                  })()}
                </div>

                <div className="mt-3 space-y-2">
                  <AsphaltLine
                    label="Good — Landmark"
                    tier="landmark"
                    selected={pricing.asphaltSelected === "landmark"}
                    onSelect={() => setPricing({ ...pricing, asphaltSelected: pricing.asphaltSelected === "landmark" ? "" : "landmark" })}
                    mode={pricing.asphaltCalcMode}
                    unitValue={pricing.unitPrice.landmark}
                    onUnitChange={(v) => setPricing({ ...pricing, unitPrice: { ...pricing.unitPrice, landmark: num(v) } })}
                    manualValue={pricing.manualPrice.landmark}
                    onManualChange={(v) => setPricing({ ...pricing, manualPrice: { ...pricing.manualPrice, landmark: num(v) } })}
                    base={asphaltBases.landmark}
                    solarSurcharge={scope.asphalt?.iceAreas?.solarAreas ? (num(scope.asphalt.iceAreas.solarSquares || 0) * 100) : 0}
                    fullCoverageSurcharge={scope.asphalt?.iceAreas?.fullCoverage ? (effectiveSquares * 100) : 0}
                    hideTotals={pricing.hideTotalsInPrint}
                    plywoodCondition={scope.asphalt.plywoodCondition}
                    plywoodSquares={pricing.plywood.squares}
                  />
                  <AsphaltLine
                    label="Better — Landmark PRO"
                    tier="pro"
                    selected={pricing.asphaltSelected === "pro"}
                    onSelect={() => setPricing({ ...pricing, asphaltSelected: pricing.asphaltSelected === "pro" ? "" : "pro" })}
                    mode={pricing.asphaltCalcMode}
                    unitValue={pricing.unitPrice.pro}
                    onUnitChange={(v) => setPricing({ ...pricing, unitPrice: { ...pricing.unitPrice, pro: num(v) } })}
                    manualValue={pricing.manualPrice.pro}
                    onManualChange={(v) => setPricing({ ...pricing, manualPrice: { ...pricing.manualPrice, pro: num(v) } })}
                    base={asphaltBases.pro}
                    solarSurcharge={scope.asphalt?.iceAreas?.solarAreas ? (num(scope.asphalt.iceAreas.solarSquares || 0) * 100) : 0}
                    fullCoverageSurcharge={scope.asphalt?.iceAreas?.fullCoverage ? (effectiveSquares * 100) : 0}
                    hideTotals={pricing.hideTotalsInPrint}
                    plywoodCondition={scope.asphalt.plywoodCondition}
                    plywoodSquares={pricing.plywood.squares}
                  />
                  <AsphaltLine
                    label="Best — Landmark NorthGate"
                    tier="northgate"
                    selected={pricing.asphaltSelected === "northgate"}
                    onSelect={() => setPricing({ ...pricing, asphaltSelected: pricing.asphaltSelected === "northgate" ? "" : "northgate" })}
                    mode={pricing.asphaltCalcMode}
                    unitValue={pricing.unitPrice.northgate}
                    onUnitChange={(v) => setPricing({ ...pricing, unitPrice: { ...pricing.unitPrice, northgate: num(v) } })}
                    manualValue={pricing.manualPrice.northgate}
                    onManualChange={(v) => setPricing({ ...pricing, manualPrice: { ...pricing.manualPrice, northgate: num(v) } })}
                    base={asphaltBases.northgate}
                    solarSurcharge={scope.asphalt?.iceAreas?.solarAreas ? (num(scope.asphalt.iceAreas.solarSquares || 0) * 100) : 0}
                    fullCoverageSurcharge={scope.asphalt?.iceAreas?.fullCoverage ? (effectiveSquares * 100) : 0}
                    hideTotals={pricing.hideTotalsInPrint}
                    plywoodCondition={scope.asphalt.plywoodCondition}
                    plywoodSquares={pricing.plywood.squares}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                  <Select label="Eave Drip Edge" value={scope.asphalt.dripEdgeType} onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, dripEdgeType: v } })} options={[{ value: "", label: "None" }, { value: "hicks_vent", label: "Hicks Vent" }, { value: "aluminum_8", label: '8" Aluminum' }, { value: "copper_5", label: '5" Copper' }]} />
                  {scope.asphalt.dripEdgeType === "aluminum_8" && (
                    <Select label={'8" Aluminum Color'} value={scope.asphalt.dripEdgeColor} onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, dripEdgeColor: v } })} options={[{ value: "white", label: "White" }, { value: "mill", label: "Mill Finish" }, { value: "brown", label: "Brown" }, { value: "black", label: "Black" }]} />
                  )}
                  <Select label="Rake Drip Edge" value={scope.asphalt.rakeDripEdgeType || ""} onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, rakeDripEdgeType: v } })} options={[{ value: "", label: "None" }, { value: "aluminum_8", label: '8" Aluminum' }, { value: "copper_5", label: '5" Copper' }]} />
                  {scope.asphalt.rakeDripEdgeType === "aluminum_8" && (
                    <Select label={'8" Aluminum Color'} value={scope.asphalt.rakeDripEdgeColor || ""} onChange={(v) => setScope({ ...scope, asphalt: { ...scope.asphalt, rakeDripEdgeColor: v } })} options={[{ value: "white", label: "White" }, { value: "mill", label: "Mill Finish" }, { value: "brown", label: "Brown" }, { value: "black", label: "Black" }]} />
                  )}
                </div>

                {/* Copper drip edge prompt */}
                {(scope.asphalt.dripEdgeType === "copper_5" || scope.asphalt.rakeDripEdgeType === "copper_5") && (
                  <div className="mt-2 max-w-xs">
                    <NumberInput
                      label="Total feet of copper drip edge"
                      value={pricing.asphaltCopperDripEdgeFeet || 0}
                      onChange={v => setPricing({ ...pricing, asphaltCopperDripEdgeFeet: num(v) })}
                      min={0}
                      step="1"
                    />
                    <ReadOnly label="Copper Drip Edge Cost ($10/ft)" value={fmtMoney(10 * (pricing.asphaltCopperDripEdgeFeet || 0))} />
                  </div>
                )}

                {/* cedar copper valleys moved into Cedar Shake Roofing card */}

                <div className="mt-3">
                  <div className="text-sm font-medium mb-2">Ice & Water Shield — Areas</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      ["eaves3", "3' in eaves"],
                      ["valleys", "Valleys"],
                      ["pipesVents", "Pipes / Vents"],
                      ["stepFlash", "Step flashings"],
                      ["chimney", "Chimney"],
                      ["skylights", "Skylights"],
                      ["lowPitch", "Entire low pitched roof areas"],
                      ["solarAreas", "Areas where solar panels are installed"],
                      ["fullCoverage", "100% coverage on entire roof area"],
                    ].map(([k, label]) => (
                      <CheckboxRow
                        key={k}
                        label={label}
                        checked={!!scope.asphalt.iceAreas[k]}
                        disabled={!!scope.asphalt.iceAreas.fullCoverage && k !== 'fullCoverage'}
                        onChange={(v) => {
                          if (k === 'fullCoverage') {
                            if (v) {
                              setScope({
                                ...scope,
                                asphalt: {
                                  ...scope.asphalt,
                                  iceAreas: {
                                    eaves3: false,
                                    valleys: false,
                                    pipesVents: false,
                                    stepFlash: false,
                                    chimney: false,
                                    skylights: false,
                                    lowPitch: false,
                                    solarAreas: false,
                                    solarSquares: 0,
                                    fullCoverage: true,
                                  },
                                },
                              });
                            } else {
                              setScope({ ...scope, asphalt: { ...scope.asphalt, iceAreas: { ...scope.asphalt.iceAreas, fullCoverage: false } } });
                            }
                          } else {
                            if (scope.asphalt.iceAreas.fullCoverage) return; // don't allow toggling others while fullCoverage
                            setScope({ ...scope, asphalt: { ...scope.asphalt, iceAreas: { ...scope.asphalt.iceAreas, [k]: v } } });
                          }
                        }}
                      />
                    ))}
                  </div>
                  {scope.asphalt.iceAreas.solarAreas && (
                    <div className="mt-2 max-w-xs">
                      <NumberInput
                        label="Solar panel sections — squares"
                        value={scope.asphalt.iceAreas.solarSquares}
                        onChange={(v) =>
                          setScope({
                            ...scope,
                            asphalt: {
                              ...scope.asphalt,
                              iceAreas: {
                                ...scope.asphalt.iceAreas,
                                solarSquares: num(v),
                              },
                            },
                          })
                        }
                        min={0}
                        step="0.1"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Pipe flanges (choose one)</div>
                    <CheckboxRow label="Aluminum" checked={scope.asphalt.pipeFlange.aluminum} onChange={() => setScope({ ...scope, asphalt: { ...scope.asphalt, pipeFlange: { ...scope.asphalt.pipeFlange, aluminum: !scope.asphalt.pipeFlange?.aluminum } } })} />
                    <CheckboxRow label="Copper" checked={scope.asphalt.pipeFlange.copper} onChange={() => setScope({ ...scope, asphalt: { ...scope.asphalt, pipeFlange: { ...scope.asphalt.pipeFlange, copper: !scope.asphalt.pipeFlange?.copper } } })} />
                  </div>
                  <div className="rounded-xl border p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Roof fan vents (choose one)</div>
                    <CheckboxRow label="Black Aluminum" checked={scope.asphalt.roofFanVents.blackAluminum} onChange={() => setScope({ ...scope, asphalt: { ...scope.asphalt, roofFanVents: { ...scope.asphalt.roofFanVents, blackAluminum: !scope.asphalt.roofFanVents?.blackAluminum } } })} />
                    <CheckboxRow label="Copper" checked={scope.asphalt.roofFanVents.copper} onChange={() => setScope({ ...scope, asphalt: { ...scope.asphalt, roofFanVents: { ...scope.asphalt.roofFanVents, copper: !scope.asphalt.roofFanVents?.copper } } })} />
                  </div>
                </div>

                <ScopeGrid
                  scope={scope.asphalt}
                  onChange={(next) => setScope({ ...scope, asphalt: next })}
                  items={[["ridgeVent", "Ridge vent"],["hipRidgeCaps", "Hip & Ridge caps"],["starterStrips", "Starter strips (eaves & rakes)"],["syntheticUnderlayment", "Synthetic underlayment"],["pipeFlashings", "Include soil pipe/fan vent flashings"],["cleanup", "Clean & remove debris"]]}
                />

                <PhotoAttach bucketId="roofing_asphalt" photos={photos} setPhotos={setPhotos} />
              </Card>
            )}

            {workDomain.roofing && selectedWork.davinci && (
              <Card title="DaVinci Roofscapes">
                <TwoCol>
                  <TextInput label="Specify areas being replaced (roofing)" value={scope.davinci.areas} onChange={(v) => setScope({ ...scope, davinci: { ...scope.davinci, areas: v } })} />
                </TwoCol>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Select
                    label="DaVinci Product Type"
                    value={scope.davinci.productType || ""}
                    onChange={v => {
                      setScope({ ...scope, davinci: { ...scope.davinci, productType: v } });
                      if (v === "shake") setPricing(p => ({ ...p, davinciUnit: 2750 }));
                      if (v === "slate") setPricing(p => ({ ...p, davinciUnit: 2950 }));
                    }}
                    options={[
                      { value: "shake", label: "Multi-width Shake" },
                      { value: "slate", label: "Multi-width Slate" }
                    ]}
                  />
                  <Select label="Price Mode" value={pricing.davinciMode} onChange={(v) => setPricing({ ...pricing, davinciMode: v })} options={[{ value: "bySquare", label: "By Square" }, { value: "manual", label: "Manual Total" }]} />
                  {pricing.davinciMode === "bySquare" ? (
                    <NumberInput label="$/Square (DaVinci)" value={pricing.davinciUnit} onChange={(v) => setPricing({ ...pricing, davinciUnit: num(v) })} />
                  ) : (
                    <NumberInput label="Manual Total" value={pricing.davinciManual} onChange={(v) => setPricing({ ...pricing, davinciManual: num(v) })} />
                  )}
                  <ReadOnly label="DaVinci Base" value={fmtMoney(davinciBase)} />
                </div>

                <div className="mt-3">
                  <PlywoodConditionGroup
                    label="How is the plywood?"
                    value={scope.davinci.plywoodCondition}
                    onChange={(v) => setScope({ ...scope, davinci: { ...scope.davinci, plywoodCondition: v } })}
                    squaresLabel="If Replace / Install over boards: enter plywood squares"
                    squaresValue={pricing.plywood.squares}
                    onSquaresChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, squares: num(v), selected: true } })}
                  />
                  {/* Show plywood cost only if not 'inspect & renail' */}
                  {scope.davinci.plywoodCondition !== "inspectRenail" && (() => {
                    let plywoodCost = 0;
                    if (scope.davinci.plywoodCondition === "replace") plywoodCost = 360 * (pricing.plywood.squares || 0);
                    if (scope.davinci.plywoodCondition === "newOverBoards") plywoodCost = 330 * (pricing.plywood.squares || 0);
                    return <ReadOnly label="Plywood Cost" value={fmtMoney(plywoodCost)} />;
                  })()}
                </div>

                

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Select label="Eave Drip Edge" value={scope.davinci.dripEdgeType || ""} onChange={v => setScope({ ...scope, davinci: { ...scope.davinci, dripEdgeType: v } })} options={[{ value: "", label: "None" }, { value: "hicks_vent", label: "Hicks Vent" }, { value: "aluminum_8", label: '8" Aluminum' }, { value: "copper_5", label: '5" Copper' }]} />
                  {scope.davinci.dripEdgeType === "aluminum_8" && (
                    <Select label={'8" Aluminum Color'} value={scope.davinci.dripEdgeColor || ""} onChange={v => setScope({ ...scope, davinci: { ...scope.davinci, dripEdgeColor: v } })} options={[{ value: "white", label: "White" }, { value: "mill", label: "Mill Finish" }, { value: "brown", label: "Brown" }, { value: "black", label: "Black" }]} />
                  )}
                  <Select label="Rake Drip Edge" value={scope.davinci.rakeDripEdgeType || ""} onChange={v => setScope({ ...scope, davinci: { ...scope.davinci, rakeDripEdgeType: v } })} options={[{ value: "", label: "None" }, { value: "aluminum_8", label: '8" Aluminum' }, { value: "copper_5", label: '5" Copper' }]} />
                  {scope.davinci.rakeDripEdgeType === "aluminum_8" && (
                    <Select label={'8" Aluminum Color'} value={scope.davinci.rakeDripEdgeColor || ""} onChange={v => setScope({ ...scope, davinci: { ...scope.davinci, rakeDripEdgeColor: v } })} options={[{ value: "white", label: "White" }, { value: "mill", label: "Mill Finish" }, { value: "brown", label: "Brown" }, { value: "black", label: "Black" }]} />
                  )}
                </div>
                  {/* Copper drip edge prompt for DaVinci */}
                  {(scope.davinci.dripEdgeType === "copper_5" || scope.davinci.rakeDripEdgeType === "copper_5") && (
                    <div className="mt-2 max-w-xs">
                      <NumberInput
                        label="Total feet of copper drip edge"
                        value={pricing.davinciCopperDripEdgeFeet || 0}
                        onChange={v => setPricing({ ...pricing, davinciCopperDripEdgeFeet: num(v) })}
                        min={0}
                        step="1"
                      />
                      <ReadOnly label="Copper Drip Edge Cost ($10/ft)" value={fmtMoney(10 * (pricing.davinciCopperDripEdgeFeet || 0))} />
                    </div>
                  )}
                  {/* Copper W-valleys option */}
                  <div className="mb-3">
                    <CheckboxRow
                      label="Include Copper W-valleys with soldered peaks"
                      checked={!!scope.davinci.includeCopperValleys}
                      onChange={v => setScope({ ...scope, davinci: { ...scope.davinci, includeCopperValleys: v } })}
                    />
                    {scope.davinci.includeCopperValleys && (
                      <div className="mt-2 max-w-xs">
                        <NumberInput
                          label="Total feet of copper"
                          value={pricing.davinciCopperValleyFeet || 0}
                          onChange={v => {
                            try { _valleysAutoSet.current.davinci = false; } catch {}
                            setPricing({ ...pricing, davinciCopperValleyFeet: num(v) });
                          }}
                          min={0}
                          step="1"
                        />
                        <ReadOnly label="Copper Valley Cost ($25/ft)" value={fmtMoney(25 * (pricing.davinciCopperValleyFeet || 0))} />
                      </div>
                    )}
                  </div>
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Pipe flanges (choose one)</div>
                    <CheckboxRow label="Aluminum" checked={!!scope.davinci.pipeFlange?.aluminum} onChange={() => setScope({ ...scope, davinci: { ...scope.davinci, pipeFlange: { ...scope.davinci.pipeFlange, aluminum: !scope.davinci.pipeFlange?.aluminum } } })} />
                    <CheckboxRow label="Copper" checked={!!scope.davinci.pipeFlange?.copper} onChange={() => setScope({ ...scope, davinci: { ...scope.davinci, pipeFlange: { ...scope.davinci.pipeFlange, copper: !scope.davinci.pipeFlange?.copper } } })} />
                  </div>
                  <div className="rounded-xl border p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Roof fan vents (choose one)</div>
                    <CheckboxRow label="Black Aluminum" checked={!!scope.davinci.roofFanVents?.blackAluminum} onChange={() => setScope({ ...scope, davinci: { ...scope.davinci, roofFanVents: { ...scope.davinci.roofFanVents, blackAluminum: !scope.davinci.roofFanVents?.blackAluminum } } })} />
                    <CheckboxRow label="Copper" checked={!!scope.davinci.roofFanVents?.copper} onChange={() => setScope({ ...scope, davinci: { ...scope.davinci, roofFanVents: { ...scope.davinci.roofFanVents, copper: !scope.davinci.roofFanVents?.copper } } })} />
                  </div>
                </div>

                <ScopeGrid scope={scope.davinci} onChange={(next) => setScope({ ...scope, davinci: next })} items={[["iceWaterFull", "WinterGuard ice & water — 100% coverage"],["davinciStarter", "DaVinci 12″ starter w/ 3/4″ overhang"],["ridgeVent", "Cobra-Vent low profile ridge vent"],["hipRidgeCaps", "DaVinci 18″ hip & ridge"],["pipeFlashings", "Aluminum & neoprene soil pipe flashings"],["cleanup", "Clean & remove debris"]]} />
                <PhotoAttach bucketId="roofing_davinci" photos={photos} setPhotos={setPhotos} />
              </Card>
            )}

            {workDomain.roofing && selectedWork.cedar && (
              <Card title="Cedar Shake Roofing">
                <TwoCol>
                  <TextInput label="Specify areas being replaced (roofing)" value={scope.cedar.areas} onChange={(v) => setScope({ ...scope, cedar: { ...scope.cedar, areas: v } })} />
                </TwoCol>
                <div className="mt-3">
                  <PlywoodConditionGroup
                    label="How is the plywood?"
                    value={scope.cedar.plywoodCondition}
                    onChange={(v) => setScope({ ...scope, cedar: { ...scope.cedar, plywoodCondition: v } })}
                    squaresLabel="How many squares?"
                    squaresValue={pricing.cedarPlywoodSquares}
                    onSquaresChange={(v) => setPricing({ ...pricing, cedarPlywoodSquares: num(v) })}
                  />
                  {/* Show plywood cost only if not 'inspect & renail' */}
                  {scope.cedar.plywoodCondition !== "inspectRenail" && (() => {
                    let plywoodCost = 0;
                    const squares = pricing.cedarPlywoodSquares || 0;
                    if (scope.cedar.plywoodCondition === "replace") plywoodCost = 360 * squares;
                    if (scope.cedar.plywoodCondition === "newOverBoards") plywoodCost = 330 * squares;
                    return <ReadOnly label="Plywood Cost" value={fmtMoney(plywoodCost)} />;
                  })()}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Select
                    label="Type of Cedar"
                    value={scope.cedar.cedarType || ""}
                    onChange={v => setScope({ ...scope, cedar: { ...scope.cedar, cedarType: v } })}
                    options={[
                      { value: "red", label: "Red Cedar" },
                      { value: "yellow", label: "Yellow Cedar" },
                      { value: "ptred", label: "P.T Red Cedar" }
                    ]}
                  />
                  <Select label="Price Mode" value={pricing.cedarMode} onChange={(v) => setPricing({ ...pricing, cedarMode: v })} options={[{ value: "bySquare", label: "By Square" }, { value: "manual", label: "Manual Total" }]} />
                  {pricing.cedarMode === "bySquare" ? (
                    <ReadOnly
                      label="$/Square (Cedar)"
                      value={fmtMoney((scope.cedar.cedarType === "yellow") ? 3600 : (scope.cedar.cedarType === "ptred") ? 3300 : 3050)}
                    />
                  ) : (
                    <NumberInput label="Manual Total" value={pricing.cedarManual} onChange={(v) => setPricing({ ...pricing, cedarManual: num(v) })} />
                  )}
                  <ReadOnly label="Cedar Base" value={fmtMoney(cedarBase)} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                  <Select label="Eave Drip Edge" value={scope.cedar.dripEdgeType || ""} onChange={v => setScope({ ...scope, cedar: { ...scope.cedar, dripEdgeType: v } })} options={[{ value: "", label: "None" }, { value: "hicks_vent", label: "Hicks Vent" }, { value: "aluminum_8", label: '8" Aluminum' }, { value: "copper_5", label: '5" Copper' }]} />
                  {scope.cedar.dripEdgeType === "aluminum_8" && (
                    <Select label={'8" Aluminum Color'} value={scope.cedar.dripEdgeColor || ""} onChange={v => setScope({ ...scope, cedar: { ...scope.cedar, dripEdgeColor: v } })} options={[{ value: "white", label: "White" }, { value: "mill", label: "Mill Finish" }, { value: "brown", label: "Brown" }, { value: "black", label: "Black" }]} />
                  )}
                  <Select label="Rake Drip Edge" value={scope.cedar.rakeDripEdgeType || ""} onChange={v => setScope({ ...scope, cedar: { ...scope.cedar, rakeDripEdgeType: v } })} options={[{ value: "", label: "None" }, { value: "aluminum_8", label: '8" Aluminum' }, { value: "copper_5", label: '5" Copper' }]} />
                  {scope.cedar.rakeDripEdgeType === "aluminum_8" && (
                    <Select label={'8" Aluminum Color'} value={scope.cedar.rakeDripEdgeColor || ""} onChange={v => setScope({ ...scope, cedar: { ...scope.cedar, rakeDripEdgeColor: v } })} options={[{ value: "white", label: "White" }, { value: "mill", label: "Mill Finish" }, { value: "brown", label: "Brown" }, { value: "black", label: "Black" }]} />
                  )}
                </div>

                {/* Copper drip edge prompt */}
                {(scope.cedar.dripEdgeType === "copper_5" || scope.cedar.rakeDripEdgeType === "copper_5") && (
                  <div className="mt-2 max-w-xs">
                    <NumberInput
                      label="Total feet of copper drip edge"
                      value={pricing.cedarCopperDripEdgeFeet || 0}
                      onChange={v => setPricing({ ...pricing, cedarCopperDripEdgeFeet: num(v) })}
                      min={0}
                      step="1"
                    />
                    <ReadOnly label="Copper Drip Edge Cost ($10/ft)" value={fmtMoney(10 * (pricing.cedarCopperDripEdgeFeet || 0))} />
                  </div>
                )}

                {/* Copper W-valleys option for Cedar */}
                <div className="mb-3">
                  <CheckboxRow
                    label="Include Copper W-valleys with soldered peaks"
                    checked={!!scope.cedar.includeCopperValleys}
                    onChange={v => setScope({ ...scope, cedar: { ...scope.cedar, includeCopperValleys: v } })}
                  />
                  {scope.cedar.includeCopperValleys && (
                    <div className="mt-2 max-w-xs">
                      <NumberInput
                        label="Total feet of copper"
                        value={pricing.cedarCopperValleyFeet || 0}
                        onChange={v => {
                          try { _valleysAutoSet.current.cedar = false; } catch {}
                          setPricing({ ...pricing, cedarCopperValleyFeet: num(v) });
                        }}
                        min={0}
                        step="1"
                      />
                      <ReadOnly label="Copper Valley Cost ($25/ft)" value={fmtMoney(25 * (pricing.cedarCopperValleyFeet || 0))} />
                    </div>
                  )}
                </div>

                {/* Woven caps option for Cedar */}
                <div className="mb-3">
                  <CheckboxRow
                    label="Include Woven Caps"
                    checked={!!pricing.cedarIncludeWovenCaps}
                    onChange={v => setPricing({ ...pricing, cedarIncludeWovenCaps: v })}
                  />
                  {pricing.cedarIncludeWovenCaps && (
                    <div className="mt-2 max-w-xs">
                      <div className="mb-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.cedarWovenCapsHips} onChange={(e) => setPricing({ ...pricing, cedarWovenCapsHips: e.target.checked })} />
                          <span className="text-sm">Hips (use Feet of Hips)</span>
                        </label>
                        <label className="flex items-center gap-2 mt-1">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.cedarWovenCapsRidges} onChange={(e) => setPricing({ ...pricing, cedarWovenCapsRidges: e.target.checked })} />
                          <span className="text-sm">Ridges (use Feet of Ridge)</span>
                        </label>
                      </div>
                      <NumberInput
                        label="Total feet of caps"
                        value={pricing.cedarWovenCapsFeet || 0}
                        onChange={v => {
                          try { _wovenCapsAutoSet.current = false; } catch {}
                          setPricing({ ...pricing, cedarWovenCapsFeet: num(v) })
                        }}
                        min={0}
                        step="1"
                      />
                      <ReadOnly label="Woven Caps Cost ($45/ft)" value={fmtMoney(45 * (pricing.cedarWovenCapsFeet || 0))} />
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-sm font-medium mb-2">Ice & Water Shield — Areas</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      ["eaves3", "3' in eaves"],
                      ["valleys", "Valleys"],
                      ["pipesVents", "Pipes / Vents"],
                      ["stepFlash", "Step flashings"],
                      ["chimney", "Chimney"],
                      ["skylights", "Skylights"],
                      ["lowPitch", "Entire low pitched roof areas"],
                      ["solarAreas", "Areas where solar panels are installed"],
                      ["fullCoverage", "100% coverage on entire roof area"],
                    ].map(([k, label]) => (
                      <CheckboxRow
                        key={k}
                        label={label}
                        checked={!!scope.cedar.iceAreas?.[k]}
                        onChange={v => setScope({
                          ...scope,
                          cedar: {
                            ...scope.cedar,
                            iceAreas: { ...scope.cedar.iceAreas, [k]: v },
                          },
                        })}
                      />
                    ))}
                  </div>
                  {scope.cedar.iceAreas?.solarAreas && (
                    <div className="mt-2 max-w-xs">
                      <NumberInput
                        label="Solar panel sections — squares"
                        value={scope.cedar.iceAreas.solarSquares || 0}
                        onChange={v => setScope({
                          ...scope,
                          cedar: {
                            ...scope.cedar,
                            iceAreas: {
                              ...scope.cedar.iceAreas,
                              solarSquares: num(v),
                            },
                          },
                        })}
                        min={0}
                        step="0.1"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Pipe flanges (choose one)</div>
                    <CheckboxRow label="Aluminum" checked={!!scope.cedar.pipeFlange?.aluminum} onChange={() => setScope({ ...scope, cedar: { ...scope.cedar, pipeFlange: { ...scope.cedar.pipeFlange, aluminum: !scope.cedar.pipeFlange?.aluminum } } })} />
                    <CheckboxRow label="Copper" checked={!!scope.cedar.pipeFlange?.copper} onChange={() => setScope({ ...scope, cedar: { ...scope.cedar, pipeFlange: { ...scope.cedar.pipeFlange, copper: !scope.cedar.pipeFlange?.copper } } })} />
                  </div>
                  <div className="rounded-xl border p-3 bg-white">
                    <div className="text-sm font-medium mb-2">Roof fan vents (choose one)</div>
                    <CheckboxRow label="Black Aluminum" checked={!!scope.cedar.roofFanVents?.blackAluminum} onChange={() => setScope({ ...scope, cedar: { ...scope.cedar, roofFanVents: { ...scope.cedar.roofFanVents, blackAluminum: !scope.cedar.roofFanVents?.blackAluminum } } })} />
                    <CheckboxRow label="Copper" checked={!!scope.cedar.roofFanVents?.copper} onChange={() => setScope({ ...scope, cedar: { ...scope.cedar, roofFanVents: { ...scope.cedar.roofFanVents, copper: !scope.cedar.roofFanVents?.copper } } })} />
                  </div>
                </div>

                <ScopeGrid scope={scope.cedar} onChange={(next) => setScope({ ...scope, cedar: next })} items={[["iceWaterFull", "GAF Deck-Armor Underlayment"],["cedarBreather", "Cedar Breather ventilation underlayment"],["ridgeVent", "Cobra-Vent low profile ridge vent"],["cedarRidgeBoards", "8″ Red Cedar ridge boards"],["cleanup", "Clean & remove debris"]]} />
                <PhotoAttach bucketId="roofing_cedar" photos={photos} setPhotos={setPhotos} />
              </Card>
            )}

            {workDomain.roofing && selectedWork.rubber && (
              <Card title="Rubber Roofing (EPDM)">
                {/* EPDM type dropdown */}
                <div className="mb-3 max-w-xs">
                  <Select
                    label="EPDM Type"
                    value={pricing.rubberEpdmType || ".060_black"}
                    onChange={v => {
                      let price = 1150;
                      if (v === ".060_black") price = 1150;
                      else if (v === ".090_black") price = 1650;
                      else if (v === ".060_white") price = 2000;
                      else if (v === ".090_white") price = 2500;
                      setPricing({ ...pricing, rubberEpdmType: v, rubberUnit: price });
                    }}
                    options={[{ value: ".060_black", label: ".060 Black EPDM" }, { value: ".090_black", label: ".090 Black EPDM" }, { value: ".060_white", label: ".060 White EPDM" }, { value: ".090_white", label: ".090 White EPDM" }]}
                  />
                </div>
                <div className="mb-3 max-w-lg">
                  <TextInput
                    label="Specify areas being replaced"
                    value={scope.rubber.areas || ""}
                    onChange={v => setScope({ ...scope, rubber: { ...scope.rubber, areas: v } })}
                  />
                </div>
                  <div className="mt-3">
                    <PlywoodConditionGroup
                      label="How is the plywood?"
                      value={scope.rubber.plywoodCondition}
                      onChange={(v) => setScope({ ...scope, rubber: { ...scope.rubber, plywoodCondition: v } })}
                      squaresLabel="If Replace / Install over boards: enter plywood squares"
                      squaresValue={pricing.plywood.squares}
                      onSquaresChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, squares: num(v), selected: true } })}
                    />
                    {scope.rubber.plywoodCondition !== "inspectRenail" && (() => {
                      let plywoodCost = 0;
                      if (scope.rubber.plywoodCondition === "replace") plywoodCost = 360 * (pricing.plywood.squares || 0);
                      if (scope.rubber.plywoodCondition === "newOverBoards") plywoodCost = 330 * (pricing.plywood.squares || 0);
                      return <ReadOnly label="Plywood Cost" value={fmtMoney(plywoodCost)} />;
                    })()}
                  </div>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <Select label="Price Mode" value={pricing.rubberMode} onChange={(v) => setPricing({ ...pricing, rubberMode: v })} options={[{ value: "bySquare", label: "By Square" }, { value: "manual", label: "Manual Total" }]} />
                  {pricing.rubberMode === "bySquare" ? (
                    <NumberInput label="$/Square (EPDM)" value={pricing.rubberUnit} onChange={(v) => setPricing({ ...pricing, rubberUnit: num(v) })} />
                  ) : (
                    <NumberInput label="Manual Total" value={pricing.rubberManual} onChange={(v) => setPricing({ ...pricing, rubberManual: num(v) })} />
                  )}
                  <NumberInput label="Flat Roof Area (squares)" value={measure.flatRoofSquares} onChange={(v) => setMeasure({ ...measure, flatRoofSquares: num(v) })} min={0} step="0.1" />
                  <ReadOnly label="Rubber Base" value={fmtMoney(rubberBase)} />
                </div>
                <div className="mt-3">
                  <CheckboxRow
                    label="Curb skylights"
                    checked={!!scope.rubber.curbSkylights}
                    onChange={(v) => setScope({ ...scope, rubber: { ...scope.rubber, curbSkylights: v } })}
                  />
                  {scope.rubber.curbSkylights && (
                    <div className="mt-2 max-w-xs">
                      <NumberInput
                        label="Number of skylights"
                        value={pricing.rubberCurbSkylights || 0}
                        onChange={(v) => setPricing({ ...pricing, rubberCurbSkylights: num(v) })}
                        min={0}
                        step="1"
                      />
                      <ReadOnly label="Curb Skylights Cost ($500/ea)" value={fmtMoney(500 * (pricing.rubberCurbSkylights || 0))} />
                    </div>
                  )}
                </div>
                <ScopeGrid scope={scope.rubber} onChange={(next) => setScope({ ...scope, rubber: next })} items={[["fiberboard", "1/2″ fiberboard insulation"],["aluminumDripEdge", "C-6 white aluminum drip edge"],["seamSplice", "3″ EPDM seam splice tape"],["seamCoverTape", "7″ seam cover tape"],["pipeBoots", "EPDM ‘Witches Hat’ pipe boots"],["flashing12", "12\" flashing"],["cornerFlashings", "Corner Flashings"]]} />
                <PhotoAttach bucketId="roofing_rubber" photos={photos} setPhotos={setPhotos} />
              </Card>
            )}
          </Section>

          {/* Siding */}
          <Section id="siding">
            <Card title="Siding">
              {(!workDomain.siding || (selectedWork.sidingCategories && selectedWork.sidingCategories.length === 0)) && (
                <div className="text-sm text-slate-600">
                  Use <strong>Customer → Work Selected</strong> to choose a Siding category (Cedar
                  Shake, Synthetic, Vinyl, or Clap Board).
                </div>
              )}
              {workDomain.siding && selectedWork.sidingCategories && selectedWork.sidingCategories.length > 0 && (
                <>
                  {/* top-level exposure/areas removed; per-category controls are used below */}

                  <div className="space-y-4 mt-3">
                    {(selectedWork.sidingCategories || []).map((cat) => {
                      const byCat = pricing.siding.byCategory || {};
                      const cp = byCat[cat] || { calcMode: pricing.siding.calcMode, squares: pricing.siding.squares, manualTotal: pricing.siding.manualTotal, product: "", unit: pricing.siding.unit };
                      return (
                        <div key={cat} className="rounded-lg border p-3 bg-white">
                          <div className="font-medium mb-2">{sidingLabel(cat, cp.product)}</div>
                          <TwoCol>
                            <TextInput
                              label="Specify areas where siding is being replaced"
                              value={((pricing.siding.byCategory || {})[cat] || {}).areas || pricing.siding.areas || ""}
                              onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], areas: v } } } })}
                            />
                            <Select
                              label="Exposure"
                              value={((pricing.siding.byCategory || {})[cat] || {}).exposure || pricing.siding.exposure || ""}
                              onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], exposure: v } } } })}
                              options={[
                                { value: '3"', label: '3"' },
                                { value: '4"', label: '4"' },
                                { value: '5"', label: '5"' },
                                { value: '6"', label: '6"' },
                                { value: '7"', label: '7"' },
                                { value: '8"', label: '8"' },
                              ]}
                            />
                          </TwoCol>

                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                            <Select
                              label="Product"
                              value={cp.product || ""}
                              onChange={(v) => {
                                setPricing({
                                  ...pricing,
                                  siding: {
                                    ...pricing.siding,
                                    byCategory: {
                                      ...(pricing.siding.byCategory || {}),
                                      [cat]: { ...(pricing.siding.byCategory || {})[cat], product: v },
                                    },
                                  },
                                });
                              }}
                              options={[{ value: '', label: 'Select Product' }, ...sidingProductOptions(cat)]}
                            />
                            <Select
                              label="Price Mode"
                              value={cp.calcMode || pricing.siding.calcMode}
                              onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], calcMode: v } } } })}
                              options={[
                                { value: "bySquare", label: "By Square" },
                                { value: "manual", label: "Manual Total" },
                              ]}
                            />
                            {((cp.calcMode || pricing.siding.calcMode) === "bySquare") ? (
                              <>
                                <NumberInput
                                  label="$/Square"
                                  value={cp.unit || unitRateFor({ category: cat, product: cp.product, rates: pricing.siding.rates })}
                                  onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], unit: num(v) } } } })}
                                />
                                <NumberInput
                                  label="Total squares"
                                  value={cp.squares || 0}
                                  onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], squares: num(v) } } } })}
                                  min={0}
                                  step="0.1"
                                />
                                <ReadOnly
                                  label="Subtotal"
                                  value={fmtMoney(
                                    ((cp.squares || 0) * (cp.unit || unitRateFor({ category: cat, product: cp.product, rates: pricing.siding.rates }))) +
                                      (cp.wovenCorners && cp.wovenCorners.include ? (45 * num(cp.wovenCorners.feet || 0)) : 0)
                                  )}
                                />
                              </>
                            ) : (
                              <NumberInput
                                label="Manual Total"
                                value={cp.manualTotal || 0}
                                onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], manualTotal: num(v) } } } })}
                              />
                            )}
                          </div>
                          <div className="mt-3">
                            <TextInput label="Siding Color" value={(pricing.siding.byCategory || {})[cat]?.color || scope.siding.color || ""} onChange={(v) => setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], color: v } } } })} />
                          </div>

                          {/* Woven corners option (only for Cedar Shake) */}
                          {cat === 'cedarShake' && (
                            <div className="mt-3">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={!!((pricing.siding.byCategory || {})[cat]?.wovenCorners?.include)}
                                  onChange={(e) => {
                                    const current = (pricing.siding.byCategory || {})[cat] || {};
                                    const wc = { ...(current.wovenCorners || { include: false, feet: 0 }), include: e.target.checked };
                                    setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], wovenCorners: wc } } } });
                                  }}
                                />
                                <span className="text-sm">Include Woven Corners</span>
                              </label>
                              {((pricing.siding.byCategory || {})[cat]?.wovenCorners?.include) && (
                                <div className="mt-2 max-w-xs">
                                  <NumberInput
                                    label="Total feet"
                                    value={((pricing.siding.byCategory || {})[cat]?.wovenCorners?.feet) || 0}
                                    onChange={(v) => {
                                      const current = (pricing.siding.byCategory || {})[cat] || {};
                                      const wc = { ...(current.wovenCorners || { include: true, feet: 0 }), feet: num(v), include: true };
                                      setPricing({ ...pricing, siding: { ...pricing.siding, byCategory: { ...(pricing.siding.byCategory || {}), [cat]: { ...(pricing.siding.byCategory || {})[cat], wovenCorners: wc } } } });
                                    }}
                                    min={0}
                                    step="1"
                                  />
                                  <ReadOnly label="Woven Corners Cost ($45/ft)" value={fmtMoney(45 * (((pricing.siding.byCategory || {})[cat]?.wovenCorners?.feet) || 0))} />
                                </div>
                              )}
                            </div>
                          )}

                          <ScopeGrid
                            scope={scope.siding}
                            onChange={(next) => setScope({ ...scope, siding: next })}
                            items={[
                              ["typar", "Ty-Par synthetic sidewall underlayment"],
                              ["vycorTape", "7\" Vycor bitumen tape @ windows/doors/flashings"],
                              ["stainlessStaples", "Non-corrosive stainless staples"],
                              ["dripCaps", "White aluminum drip caps @ heads"],
                              ["azekBlocks", "AZEK 1x8\" light/outlet blocks (Cortex fastening)"],
                              ["wireHangers", "New wire hangers to reattach fixtures"],
                              ["cleanup", "Clean & remove debris"],
                            ]}
                          />

                          <div className="mt-3">
                            <PhotoAttach bucketId={`siding_${cat}`} photos={photos} setPhotos={setPhotos} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>
          </Section>

          {/* Decking */}
          <Section id="decking">
            {workDomain.decking && (
              <Card title="Decking">
                <TwoCol>
                  <div className="rounded-lg border p-2 mb-3">
                    <div className="text-xs font-medium mb-1">Replacing (select any)</div>
                    <div className="flex gap-4">
                      <label>
                        <input
                          type="checkbox"
                          checked={pricing.decking.replacing.decking}
                          onChange={e => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              replacing: {
                                ...pricing.decking.replacing,
                                decking: e.target.checked
                              }
                            }
                          })}
                        /> Decking
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={pricing.decking.replacing.framing}
                          onChange={e => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              replacing: {
                                ...pricing.decking.replacing,
                                framing: e.target.checked
                              }
                            }
                          })}
                        /> Framing
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={pricing.decking.replacing.railings}
                          onChange={e => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              replacing: {
                                ...pricing.decking.replacing,
                                railings: e.target.checked
                              }
                            }
                          })}
                        /> Railings
                      </label>
                    </div>
                  </div>
                  <TextInput
                    label="Specify areas being replaced (decking)"
                    value={pricing.decking.areas}
                    onChange={(v) =>
                      setPricing({ ...pricing, decking: { ...pricing.decking, areas: v } })
                    }
                  />
                </TwoCol>
                <div className="rounded-lg border p-2">
                  <div className="text-xs font-medium mb-1">Work type (select any)</div>
                  {Object.entries(pricing.decking.workModes).map(([k, obj]) => (
                    <div key={k} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end mb-2">
                      <CheckboxRow
                        label={k === "buildNew" ? "New construction" : "Replacement"}
                        checked={obj.selected}
                        onChange={(v) =>
                          setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              workModes: {
                                ...pricing.decking.workModes,
                                [k]: { ...obj, selected: v },
                              },
                            },
                          })
                        }
                      />
                      {/* Remove Area (sq ft) input for these options */}
                    </div>
                  ))}
                </div>
                {/* Only show Decking Materials if Replacing > Decking is checked */}
                {pricing.decking.replacing.decking && (
                  <div className="rounded-lg border p-2 mt-3">
                    <div className="text-xs font-medium mb-1">Decking materials</div>
                    {[
                      ["azek", "AZEK"],
                      ["wolf", "WOLF"],
                      ["pt", "PT"],
                      ["mahogany", "Mahogany"],
                      ["trex", "Trex Composite"],
                    ].map(([k, label]) => (
                      <label key={k} className="mr-4 inline-flex items-center gap-2 text-sm">
                        <input
                         
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!pricing.decking.materials[k]}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPricing({
                                ...pricing,
                                decking: {
                                  ...pricing.decking,
                                  materials: {
                                    azek: false,
                                    wolf: false,
                                    pt: false,
                                    mahogany: false,
                                    trex: false,
                                    [k]: true,
                                  },
                                },
                              });
                            } else {
                              setPricing({
                                ...pricing,
                                decking: {
                                  ...pricing.decking,
                                  materials: {
                                    ...pricing.decking.materials,
                                    [k]: false,
                                  },
                                },
                              });
                            }
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    {/* Show Total Sq ft and calculated price if any material is selected */}
                    {Object.values(pricing.decking.materials).some(Boolean) && (
                      <div className="mt-4">
                        <NumberInput
                          label="Total Sq ft"
                          value={pricing.decking.materialSqft || 0}
                          onChange={v => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              materialSqft: num(v),
                            },
                          })}
                          min={0}
                          step="1"
                        />
                        {/* Calculate price based on selected material */}
                        <ReadOnly
                          label="Material Price"
                          value={(() => {
                            const sqft = num(pricing.decking.materialSqft);
                            let rate = 0;
                            if (pricing.decking.materials.pt) rate = 25;
                            if (pricing.decking.materials.mahogany) rate = 43;
                            if (pricing.decking.materials.trex) rate = 47;
                            if (pricing.decking.materials.azek) rate = 55;
                            if (pricing.decking.materials.wolf) rate = 55;
                            return fmtMoney(sqft * rate);
                          })()}
                        />
                      </div>
                    )}
                  </div>
                )}
                {pricing.decking.replacing.railings && (
                <div className="rounded-lg border p-2 mt-3">
                  <div className="text-xs font-medium mb-1">Rail Options (select one)</div>
                  {[
                    ["intex", "Intex rail"],
                    ["azek", "AZEK rail"],
                    ["pt", "PT rail"],
                    ["cable", "Cable Railing"],
                  ].map(([k, label]) => (
                    <label key={k} className="mr-4 inline-flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="decking-railing"
                        className="h-4 w-4"
                        checked={!!pricing.decking.railing[k]}
                        onClick={() => {
                          if (pricing.decking.railing[k]) {
                            setPricing({
                              ...pricing,
                              decking: {
                                ...pricing.decking,
                                railing: {
                                  intex: false,
                                  azek: false,
                                  pt: false,
                                  cable: false,
                                },
                              },
                            });
                          } else {
                            setPricing({
                              ...pricing,
                              decking: {
                                ...pricing.decking,
                                railing: {
                                  intex: false,
                                  azek: false,
                                  pt: false,
                                  cable: false,
                                  [k]: true,
                                },
                              },
                            });
                          }
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {/* Show Total linear ft and calculated price if any railing is selected */}
                  {Object.values(pricing.decking.railing).some(Boolean) && (
                    <div className="mt-4">
                      <NumberInput
                        label="Total linear ft"
                        value={pricing.decking.railingLinearFt || 0}
                        onChange={v => setPricing({
                          ...pricing,
                          decking: {
                            ...pricing.decking,
                            railingLinearFt: num(v),
                          },
                        })}
                        min={0}
                        step="1"
                      />
                      {/* Calculate price based on selected railing */}
                      <ReadOnly
                        label="Railing Price"
                        value={(() => {
                          const ft = num(pricing.decking.railingLinearFt);
                          let rate = 0;
                          if (pricing.decking.railing.pt) rate = 85;
                          if (pricing.decking.railing.azek) rate = 120;
                          if (pricing.decking.railing.intex) rate = 150;
                          if (pricing.decking.railing.cable) rate = 275;
                          return fmtMoney(ft * rate);
                        })()}
                      />
                    </div>
                  )}
                </div>
                )}
                {/* Framing Section: Only show if Replacing > Framing is checked */}
                {pricing.decking.replacing.framing && (
                  <div className="rounded-lg border p-2 mt-3">
                    <div className="text-xs font-medium mb-1">Framing</div>
                    <div className="flex gap-6 mb-2">
                      <label>
                        <input
                          type="checkbox"
                          checked={!!pricing.decking.framing.groundLevel}
                          onChange={e => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              framing: {
                                ...pricing.decking.framing,
                                groundLevel: e.target.checked,
                              },
                            },
                          })}
                        /> Ground level
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!pricing.decking.framing.secondStory}
                          onChange={e => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              framing: {
                                ...pricing.decking.framing,
                                secondStory: e.target.checked,
                              },
                            },
                          })}
                        /> Second story
                      </label>
                    </div>
                    {pricing.decking.framing.groundLevel && (
                      <div className="mb-2">
                        <NumberInput
                          label="Total square feet (ground level)"
                          value={pricing.decking.framing.groundLevelSqft || 0}
                          onChange={v => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              framing: {
                                ...pricing.decking.framing,
                                groundLevelSqft: num(v),
                              },
                            },
                          })}
                          min={0}
                          step="1"
                        />
                        <ReadOnly
                          label="Ground level framing price"
                          value={fmtMoney(num(pricing.decking.framing.groundLevelSqft) * 25)}
                        />
                      </div>
                    )}
                    {pricing.decking.framing.secondStory && (
                      <div>
                        <NumberInput
                          label="Total square feet (second story)"
                          value={pricing.decking.framing.secondStorySqft || 0}
                          onChange={v => setPricing({
                            ...pricing,
                            decking: {
                              ...pricing.decking,
                              framing: {
                                ...pricing.decking.framing,
                                secondStorySqft: num(v),
                              },
                            },
                          })}
                          min={0}
                          step="1"
                        />
                        <ReadOnly
                          label="Second story framing price"
                          value={fmtMoney(num(pricing.decking.framing.secondStorySqft) * 35)}
                        />
                      </div>
                    )}
                  </div>
                )}
                {/* Concrete Work Section */}
                <div className="rounded-lg border p-2 mt-3">
                  <div className="text-xs font-medium mb-1">Concrete Work</div>
                  <div className="flex gap-6 mb-2">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!pricing.decking.concrete.sonoTubes}
                        onChange={e => setPricing({
                          ...pricing,
                          decking: {
                            ...pricing.decking,
                            concrete: {
                              ...pricing.decking.concrete,
                              sonoTubes: e.target.checked,
                            },
                          },
                        })}
                      /> New sono-tubes
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!pricing.decking.concrete.landing}
                        onChange={e => setPricing({
                          ...pricing,
                          decking: {
                            ...pricing.decking,
                            concrete: {
                              ...pricing.decking.concrete,
                              landing: e.target.checked,
                            },
                          },
                        })}
                      /> New Landing
                    </label>
                  </div>
                  {pricing.decking.concrete.sonoTubes && (
                    <div className="mb-2">
                      <NumberInput
                        label="Total number of sono-tubes"
                        value={pricing.decking.concrete.sonoTubesCount || 0}
                        onChange={v => setPricing({
                          ...pricing,
                          decking: {
                            ...pricing.decking,
                            concrete: {
                              ...pricing.decking.concrete,
                              sonoTubesCount: num(v),
                            },
                          },
                        })}
                        min={0}
                        step="1"
                      />
                      <ReadOnly
                        label="Sono-tubes price"
                        value={fmtMoney(num(pricing.decking.concrete.sonoTubesCount) * 500)}
                      />
                    </div>
                  )}
                  {pricing.decking.concrete.landing && (
                    <div>
                      <NumberInput
                        label="Sq ft. of Landing"
                        value={pricing.decking.concrete.landingSqft || 0}
                        onChange={v => setPricing({
                          ...pricing,
                          decking: {
                            ...pricing.decking,
                            concrete: {
                              ...pricing.decking.concrete,
                              landingSqft: num(v),
                            },
                          },
                        })}
                        min={0}
                        step="1"
                      />
                      <ReadOnly
                        label="Landing price"
                        value={fmtMoney(num(pricing.decking.concrete.landingSqft) * 100)}
                      />
                    </div>
                  )}
                </div>
                {/* Skirt Trim Section */}
                <div className="rounded-lg border p-2 mt-3">
                  <div className="text-xs font-medium mb-1">Skirt Trim</div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pricing.decking.skirtTrim.azek}
                      onChange={e => setPricing({
                        ...pricing,
                        decking: {
                          ...pricing.decking,
                          skirtTrim: {
                            ...pricing.decking.skirtTrim,
                            azek: e.target.checked,
                          },
                        },
                      })}
                    /> AZEK
                  </label>
                  {pricing.decking.skirtTrim.azek && (
                    <div className="mt-3">
                      <NumberInput
                        label="Total feet"
                        value={pricing.decking.skirtTrim.linearFt || 0}
                        onChange={v => setPricing({
                          ...pricing,
                          decking: {
                            ...pricing.decking,
                            skirtTrim: {
                              ...pricing.decking.skirtTrim,
                              linearFt: v,
                            },
                          },
                        })}
                        min={0}
                        step="1"
                      />
                      <ReadOnly
                        label="AZEK Skirt Trim Price"
                        value={(() => {
                          const ft = Number(pricing.decking.skirtTrim.linearFt) || 0;
                          return fmtMoney(ft * 19);
                        })()}
                      />
                    </div>
                  )}
                </div>
                <PhotoAttach bucketId="decking" photos={photos} setPhotos={setPhotos} />
                {/* Total Decking Price Calculation */}
                <div className="rounded-lg border p-2 mt-3">
                  <div className="text-xs font-medium mb-1">Total Decking Price</div>
                  <ReadOnly
                    label="Total Decking Price"
                    value={(() => {
                      // Material Price
                      let materialRate = 0;
                      if (pricing.decking.materials.pt) materialRate = 25;
                      if (pricing.decking.materials.mahogany) materialRate = 43;
                      if (pricing.decking.materials.trex) materialRate = 47;
                      if (pricing.decking.materials.azek) materialRate = 55;
                      if (pricing.decking.materials.wolf) materialRate = 55;
                      const materialPrice = (pricing.decking.materialSqft || 0) * materialRate;

                      // Railing Price
                      let railingRate = 0;
                      if (pricing.decking.railing.pt) railingRate = 85;
                      if (pricing.decking.railing.azek) railingRate = 120;
                      if (pricing.decking.railing.intex) railingRate = 150;
                      if (pricing.decking.railing.cable) railingRate = 275;
                      const railingPrice = (pricing.decking.railingLinearFt || 0) * railingRate;

                      // Ground Level Framing Price
                      const groundLevelFramingPrice = (pricing.decking.framing.groundLevelSqft || 0) * 25;

                      // Second Story Framing Price
                      const secondStoryFramingPrice = (pricing.decking.framing.secondStorySqft || 0) * 35;

                      // Sono-tubes Price
                      const sonoTubesPrice = (pricing.decking.concrete.sonoTubesCount || 0) * 500;

                      // Landing Price
                      const landingPrice = (pricing.decking.concrete.landingSqft || 0) * 100;

                      // AZEK Skirt Trim Price
                      const azekSkirtTrimPrice = (pricing.decking.skirtTrim.linearFt || 0) * 19;

                      // Total
                      const total = materialPrice + railingPrice + groundLevelFramingPrice + secondStoryFramingPrice + sonoTubesPrice + landingPrice + azekSkirtTrimPrice;
                      return fmtMoney(total);
                    })()}
                  />
                </div>
              </Card>
            )}
          </Section>

          {/* Extras */}
          <Section id="extras">
            <Card title="Extras & Options">
              {console.log("Extras section rendering - windowsAndDoors:", pricing.windowsAndDoors)}
              <div className="space-y-4">
                {/* Plywood */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Plywood" checked={pricing.plywood.selected} onChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, selected: v } })} />
                    <ReadOnly label="Subtotal" value={fmtMaybe(pricing.hideTotalsInPrint, plywoodTotal)} />
                  </div>
                  {pricing.plywood.selected && (
                    <div className="mt-2 space-y-3">
                      <TwoCol>
                        <TextInput label="Specify areas where plywood is being replaced" value={pricing.plywood.areas} onChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, areas: v } })} />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4" checked={pricing.plywood.entireRoof} onChange={(e) => setPricing({ ...pricing, plywood: { ...pricing.plywood, entireRoof: e.target.checked, squares: e.target.checked ? effectiveSquares : pricing.plywood.squares } })} />
                          Entire roof
                        </label>
                      </TwoCol>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <Select label="Mode" value={pricing.plywood.mode} onChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, mode: v } })} options={[{ value: "replace", label: "Replace existing" }, { value: "overlay", label: "Overlay" }, { value: "new", label: "New construction" }]} />
                        <NumberInput label="Total squares" value={pricing.plywood.squares} onChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, squares: num(v) } })} min={0} step="0.1" />
                        <NumberInput label="Rate per square ($)" value={pricing.plywood.rateByMode[pricing.plywood.mode] || 0} onChange={(v) => setPricing({ ...pricing, plywood: { ...pricing.plywood, rateByMode: { ...pricing.plywood.rateByMode, [pricing.plywood.mode]: num(v) } } })} min={0} step="1" />
                        <ReadOnly label="Plywood Price" value={fmtMoney(num(pricing.plywood.squares) * num(pricing.plywood.rateByMode[pricing.plywood.mode] || 0))} />
                      </div>

                      <div className="rounded-lg border p-2">
                        <div className="text-xs font-medium mb-1">Priority (choose one)</div>
                        {["required", "maybe", "optional"].map((k) => (
                          <label key={k} className="mr-4 inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" className="h-4 w-4" checked={pricing.plywood.priority === k} onChange={() => setPricing({ ...pricing, plywood: { ...pricing.plywood, priority: k } })} />
                            <span className="capitalize">{k}</span>
                          </label>
                        ))}
                      </div>

                      <PhotoAttach bucketId="extra_plywood" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                {/* Chimney */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Chimney (lead flashing)" checked={pricing.chimney.selected} onChange={(v) => setPricing({ ...pricing, chimney: { ...pricing.chimney, selected: v } })} />
                    <ReadOnly label="Subtotal" value={fmtMaybe(pricing.hideTotalsInPrint, chimneyTotal)} />
                  </div>
                  {pricing.chimney.selected && (
                    <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <TwoCol>
                        <TextInput label="Specify areas being replaced" value={pricing.chimney.areas} onChange={(v) => setPricing({ ...pricing, chimney: { ...pricing.chimney, areas: v } })} />
                      </TwoCol>
                      <div className="rounded-lg border p-2">
                        <div className="text-xs font-medium mb-1">Cricket</div>
                        <CheckboxRow label="Include cricket" checked={pricing.chimney.cricket} onChange={(v) => setPricing({ ...pricing, chimney: { ...pricing.chimney, cricket: v } })} />
                        {pricing.chimney.cricket && (
                          <NumberInput label="Cricket price" value={pricing.chimney.cricketPrice} onChange={(v) => setPricing({ ...pricing, chimney: { ...pricing.chimney, cricketPrice: num(v) } })} />
                        )}
                      </div>
                      <div className="rounded-lg border p-2">
                        <div className="text-xs font-medium mb-1">Size (choose one)</div>
                        {["repair", "small", "medium", "large", "xl"].map((k) => (
                          <div key={k} className="flex items-center gap-2 mb-1">
                            <input type="checkbox" className="h-4 w-4" checked={pricing.chimney.size === k} onChange={() => setPricing({ ...pricing, chimney: { ...pricing.chimney, size: pricing.chimney.size === k ? "" : k } })} />
                            <span className="text-sm w-20 capitalize">{k}</span>
                            <input type="number" className="w-28 rounded border px-2 py-1 text-sm" value={pricing.chimney.prices[k]} onChange={(e) => setPricing({ ...pricing, chimney: { ...pricing.chimney, prices: { ...pricing.chimney.prices, [k]: num(e.target.value) } } })} />
                          </div>
                        ))}
                      </div>
                      <PhotoAttach bucketId="extra_chimney" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                {/* Skylights */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Skylights" checked={pricing.skylights.selected} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, selected: v } })} />
                    <ReadOnly label="Subtotal" value={pricing.hideTotalsInPrint ? "TBD" : "See print"} />
                  </div>
                  {pricing.skylights.selected && (
                    <div className="mt-2 space-y-3">
                      <TwoCol>
                        <TextInput label="Specify areas being replaced" value={pricing.skylights.areas} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, areas: v } })} />
                      </TwoCol>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Select label="Complexity" value={pricing.skylights.complexity} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, complexity: v } })} options={[{ value: "replacing", label: "Replacing existing" }, { value: "replacing_complex", label: "Replacing existing — complex" }, { value: "framing_new", label: "Framing in new" }, { value: "framing_new_complex", label: "Framing in new — complex" }]} />
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={pricing.skylights.editPrices} onChange={(e) => setPricing({ ...pricing, skylights: { ...pricing.skylights, editPrices: e.target.checked } })} />
                          <span className="text-sm">Edit prices</span>
                        </label>
                      </div>
                      {pricing.skylights.editPrices && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <NumberInput label="Base — Fixed" value={pricing.skylights.base.fixed} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, base: { ...pricing.skylights.base, fixed: num(v) } } })} />
                          <NumberInput label="Base — Manual" value={pricing.skylights.base.manual} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, base: { ...pricing.skylights.base, manual: num(v) } } })} />
                          <NumberInput label="Base — Solar" value={pricing.skylights.base.solar} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, base: { ...pricing.skylights.base, solar: num(v) } } })} />
                          <NumberInput label="Adder — Complex Replace" value={pricing.skylights.adders.replacing_complex} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, adders: { ...pricing.skylights.adders, replacing_complex: num(v) } } })} />
                          <NumberInput label="Adder — Framing New" value={pricing.skylights.adders.framing_new} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, adders: { ...pricing.skylights.adders, framing_new: num(v) } } })} />
                          <NumberInput label="Adder — Framing New Complex" value={pricing.skylights.adders.framing_new_complex} onChange={(v) => setPricing({ ...pricing, skylights: { ...pricing.skylights, adders: { ...pricing.skylights.adders, framing_new_complex: num(v) } } })} />
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <ReadOnly label="Computed — Fixed" value={fmtMoney(skylightDisplayed.fixed)} />
                        <ReadOnly label="Computed — Manual" value={fmtMoney(skylightDisplayed.manual)} />
                        <ReadOnly label="Computed — Solar" value={fmtMoney(skylightDisplayed.solar)} />
                      </div>
                      <PhotoAttach bucketId="extra_skylights" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                {/* Trim */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Trim" checked={pricing.trim.selected} onChange={(v) => setPricing({ ...pricing, trim: { ...pricing.trim, selected: v } })} />
                    <ReadOnly label="Subtotal" value={fmtMaybe(pricing.hideTotalsInPrint, trimTotal)} />
                  </div>
                  {pricing.trim.selected && (
                    <div className="mt-2 space-y-3">
                      <TwoCol>
                        <TextInput label="Specify areas being replaced" value={pricing.trim.areas} onChange={(v) => setPricing({ ...pricing, trim: { ...pricing.trim, areas: v } })} />
                        <Select label="Install type" value={pricing.trim.installMode} onChange={(v) => setPricing({ ...pricing, trim: { ...pricing.trim, installMode: v } })} options={[{ value: "replace", label: "Replace existing" }, { value: "new", label: "Install new (−$2/ft)" }]} />
                      </TwoCol>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select label="Material" value={pricing.trim.material} onChange={(v) => setPricing({ ...pricing, trim: { ...pricing.trim, material: v } })} options={[{ value: "azek", label: "AZEK" }, { value: "cedar", label: "Red Cedar" }]} />
                        {pricing.trim.material === "azek" && (
                          <NumberInput label="AZEK $/ft" value={pricing.trim.rates.azek} onChange={(v) => setPricing({ ...pricing, trim: { ...pricing.trim, rates: { ...pricing.trim.rates, azek: num(v) } } })} />
                        )}
                        {pricing.trim.material === "cedar" && (
                          <NumberInput label="Red Cedar $/ft" value={pricing.trim.rates.cedar} onChange={(v) => setPricing({ ...pricing, trim: { ...pricing.trim, rates: { ...pricing.trim.rates, cedar: num(v) } } })} />
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <ReadOnly label="Effective $/ft" value={fmtMoney(((pricing.trim.material === "cedar" ? pricing.trim.rates.cedar : pricing.trim.rates.azek) || 0) - (pricing.trim.installMode === "new" ? 2 : 0))} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Object.entries(pricing.trim.feet).map(([k, v]) => (
                          <NumberInput
                            key={k}
                            label={trimFeetLabel(k)}
                            value={v}
                            onChange={(nv) => {
                              // Mark this key as manually edited so auto-sync stops overwriting it
                              try { _autoTrimKeys.current.delete(k); } catch {}
                              setPricing({ ...pricing, trim: { ...pricing.trim, feet: { ...pricing.trim.feet, [k]: num(nv) } } });
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-end">
                        <div className="text-sm">
                          Trim Total: <span className="font-semibold">{fmtMoney(trimTotal)}</span>
                        </div>
                      </div>
                      <PhotoAttach bucketId="extra_trim" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                {/* Gutters */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Gutters" checked={pricing.gutters.selected} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, selected: v } })} />
                    <ReadOnly label="Subtotal" value={fmtMaybe(pricing.hideTotalsInPrint, guttersTotal)} />
                  </div>
                  {pricing.gutters.selected && (
                    <div className="mt-2 space-y-3">
                      <TwoCol>
                        <TextInput label="Specify areas being replaced" value={pricing.gutters.areas} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, areas: v } })} />
                        <Select label="Install type" value={pricing.gutters.installMode} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, installMode: v } })} options={[{ value: "replace", label: "Standard" }, { value: "new", label: "Install new (−$2/ft)" }, { value: "angled_fascia", label: "Angled Fascia (+$4/ft)" }]} />
                      </TwoCol>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <Select label="Gutter type" value={pricing.gutters.type} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, type: v } })} options={[{ value: "aluminum5", label: '5" Seamless Aluminum' }, { value: "aluminum6", label: '6" Seamless Aluminum (Commercial)' }, { value: "copper_k5", label: '5" K-Style Copper' }, { value: "copper_h6", label: '6" half round copper' }]} />
                        <NumberInput label="Linear feet" value={pricing.gutters.feet} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, feet: num(v) } })} />
                        <Select label="Downspouts" value={pricing.gutters.downspouts.type} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, downspouts: { ...pricing.gutters.downspouts, type: v } } })} options={[{ value: "down5", label: '5" Downspouts' }, { value: "down6", label: '6" Downspouts' }, { value: "copper_round", label: 'Copper Round Downspouts' }, { value: "aluminum_round", label: 'Aluminum Round Downspouts' }]} />
                        <NumberInput label="Downspouts linear feet" value={pricing.gutters.downspouts.feet} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, downspouts: { ...pricing.gutters.downspouts, feet: num(v) } } })} />
                        <ReadOnly label="Effective rate ($/ft)" value={fmtMoney((() => {
                          let r = num(pricing.gutters.rates[pricing.gutters.type] || 0);
                          if (pricing.gutters.installMode === "new") r -= 2;
                          if (pricing.gutters.installMode === "angled_fascia") r += 4;
                          return r;
                        })())} />
                        <ReadOnly label="Gutter Price" value={fmtMoney((() => {
                          let r = num(pricing.gutters.rates[pricing.gutters.type] || 0);
                          if (pricing.gutters.installMode === "new") r -= 2;
                          if (pricing.gutters.installMode === "angled_fascia") r += 4;
                          return num(pricing.gutters.feet) * r;
                        })())} />
                        <ReadOnly label="Downspouts rate ($/ft)" value={fmtMoney(pricing.gutters.downspouts.rates[pricing.gutters.downspouts.type] || 0)} />
                        <ReadOnly label="Downspouts Price" value={fmtMoney((() => {
                          const dr = num(pricing.gutters.downspouts.rates[pricing.gutters.downspouts.type] || 0);
                          return num(pricing.gutters.downspouts.feet) * dr;
                        })())} />
                      </div>
                      <div className="rounded-lg border p-2">
                        <div className="text-xs font-medium mb-1">Leaf Guards (optional)</div>
                        <CheckboxRow label="Include Leaf Guards" checked={pricing.gutters.leafGuards.selected} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, leafGuards: { ...pricing.gutters.leafGuards, selected: v } } })} />
                        {pricing.gutters.leafGuards.selected && (
                          <>
                            <NumberInput label="How many feet?" value={pricing.gutters.leafGuards.feet || 0} onChange={(v) => setPricing({ ...pricing, gutters: { ...pricing.gutters, leafGuards: { ...pricing.gutters.leafGuards, feet: num(v) } } })} />
                            <ReadOnly label="Leaf Guards Price ($11/ft)" value={fmtMoney(11 * (pricing.gutters.leafGuards.feet || 0))} />
                          </>
                        )}
                      </div>
                      <PhotoAttach bucketId="extra_gutters" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                {/* Detached structure */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Detached structure" checked={pricing.detached.selected} onChange={(v) => setPricing({ ...pricing, detached: { ...pricing.detached, selected: v } })} />
                    <ReadOnly label="Subtotal" value={pricing.hideTotalsInPrint ? "TBD" : "See print"} />
                  </div>
                  {pricing.detached.selected && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-4 rounded-lg border p-2">
                        <div className="text-xs font-medium mb-1">Structure type (choose one)</div>
                        {["garage", "shed", "barn", "other"].map((k) => (
                          <label key={k} className="mr-4 inline-flex items-center gap-2 text-sm">
                            <input type="checkbox" className="h-4 w-4" checked={pricing.detached.type === k} onChange={() => setPricing({ ...pricing, detached: { ...pricing.detached, type: pricing.detached.type === k ? "garage" : k } })} />
                            <span className="capitalize">{k}</span>
                          </label>
                        ))}
                        {pricing.detached.type === "other" && (
                          <div className="max-w-xs mt-2">
                            <TextInput label="Specify structure" value={pricing.detached.otherLabel} onChange={(v) => setPricing({ ...pricing, detached: { ...pricing.detached, otherLabel: v } })} />
                          </div>
                        )}
                      </div>
                      <NumberInput label="Squares" value={pricing.detached.squares} onChange={(v) => setPricing({ ...pricing, detached: { ...pricing.detached, squares: num(v) } })} />
                      <ReadOnly label="Good — Landmark" value={fmtMoney(round2(num(pricing.unitPrice.landmark) * num(pricing.detached.squares)))} />
                      <ReadOnly label="Better — PRO" value={fmtMoney(round2(num(pricing.unitPrice.pro) * num(pricing.detached.squares)))} />
                      <ReadOnly label="Best — NorthGate" value={fmtMoney(round2(num(pricing.unitPrice.northgate) * num(pricing.detached.squares)))} />
                      <PhotoAttach bucketId="extra_detached" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                {/* Custom add */}
                {/* Windows & Doors */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Windows & Doors" checked={!!pricing.windowsAndDoors?.selected} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, selected: v } })} />
                    <ReadOnly label="Subtotal" value={fmtMaybe(pricing.hideTotalsInPrint, (
                      pricing.windowsAndDoors?.selected ? (
                        (pricing.windowsAndDoors?.windowsCount || 0) * 500 +
                        (pricing.windowsAndDoors?.doorsCount || 0) * 900 +
                        (pricing.windowsAndDoors?.slider6Count || 0) * 1000 +
                        (pricing.windowsAndDoors?.slider8Count || 0) * 1200 +
                        (pricing.windowsAndDoors?.custom ? num(pricing.windowsAndDoors?.customPrice || 0) : 0)
                      ) : 0
                    ))} />
                  </div>
                  {pricing.windowsAndDoors?.selected && (
                    <div className="mt-2 space-y-3">
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.windows} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, windows: e.target.checked } })} />
                          <span className="text-sm">Windows</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.doors} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, doors: e.target.checked } })} />
                          <span className="text-sm">Doors</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.slider6} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, slider6: e.target.checked } })} />
                          <span className="text-sm">6' Slider</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.slider8} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, slider8: e.target.checked } })} />
                          <span className="text-sm">8' Slider</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.custom} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, custom: e.target.checked } })} />
                          <span className="text-sm">Custom</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {pricing.windowsAndDoors?.windows && (
                          <>
                            <TextInput label="Which windows" value={pricing.windowsAndDoors.windowsDesc || ""} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, windowsDesc: v } })} />
                            <NumberInput label="Number of windows" value={pricing.windowsAndDoors.windowsCount || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, windowsCount: num(v) } })} min={0} step="1" />
                            <ReadOnly label="Windows Price" value={fmtMoney((pricing.windowsAndDoors.windowsCount || 0) * 500)} />
                          </>
                        )}

                        {pricing.windowsAndDoors?.doors && (
                          <>
                            <TextInput label="Which doors" value={pricing.windowsAndDoors.doorsDesc || ""} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, doorsDesc: v } })} />
                            <NumberInput label="Number of doors" value={pricing.windowsAndDoors.doorsCount || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, doorsCount: num(v) } })} min={0} step="1" />
                            <ReadOnly label="Doors Price" value={fmtMoney((pricing.windowsAndDoors.doorsCount || 0) * 900)} />
                          </>
                        )}

                        {pricing.windowsAndDoors?.slider6 && (
                          <>
                            <TextInput label="6' Slider - Which" value={pricing.windowsAndDoors.slider6Desc || ""} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, slider6Desc: v } })} />
                            <NumberInput label="Number of 6' sliders" value={pricing.windowsAndDoors.slider6Count || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, slider6Count: num(v) } })} min={0} step="1" />
                            <ReadOnly label="6' Slider Price" value={fmtMoney((pricing.windowsAndDoors.slider6Count || 0) * 1000)} />
                          </>
                        )}

                        {pricing.windowsAndDoors?.slider8 && (
                          <>
                            <TextInput label="8' Slider - Which" value={pricing.windowsAndDoors.slider8Desc || ""} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, slider8Desc: v } })} />
                            <NumberInput label="Number of 8' sliders" value={pricing.windowsAndDoors.slider8Count || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, slider8Count: num(v) } })} min={0} step="1" />
                            <ReadOnly label="8' Slider Price" value={fmtMoney((pricing.windowsAndDoors.slider8Count || 0) * 1200)} />
                          </>
                        )}

                        {pricing.windowsAndDoors?.custom && (
                          <>
                            <TextInput label="Custom description" value={pricing.windowsAndDoors.customDesc || ""} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, customDesc: v } })} />
                            <NumberInput label="Custom price ($)" value={pricing.windowsAndDoors.customPrice || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, customPrice: num(v) } })} min={0} step="1" />
                            <ReadOnly label="Custom Total" value={fmtMoney(num(pricing.windowsAndDoors.customPrice || 0))} />
                          </>
                        )}
                        {/* Inside casing & Outside trim options */}
                        <div className="col-span-1 sm:col-span-3">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.includeInsideCasing} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, includeInsideCasing: e.target.checked } })} />
                            <span className="text-sm">Include inside casing</span>
                          </label>
                          {pricing.windowsAndDoors?.includeInsideCasing && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                              <NumberInput label="Total feet (inside casing)" value={pricing.windowsAndDoors.insideCasingFeet || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, insideCasingFeet: num(v) } })} min={0} step="1" />
                              <ReadOnly label="Inside casing Price" value={fmtMoney((pricing.windowsAndDoors.insideCasingFeet || 0) * 17)} />
                            </div>
                          )}

                          <label className="flex items-center gap-2 mt-3">
                            <input type="checkbox" className="h-4 w-4" checked={!!pricing.windowsAndDoors?.includeOutsideTrim} onChange={(e) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, includeOutsideTrim: e.target.checked } })} />
                            <span className="text-sm">Include outside trim</span>
                          </label>
                          {pricing.windowsAndDoors?.includeOutsideTrim && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                              <NumberInput label="Total feet (outside trim)" value={pricing.windowsAndDoors.outsideTrimFeet || 0} onChange={(v) => setPricing({ ...pricing, windowsAndDoors: { ...pricing.windowsAndDoors, outsideTrimFeet: num(v) } })} min={0} step="1" />
                              <ReadOnly label="Outside trim Price" value={fmtMoney((pricing.windowsAndDoors.outsideTrimFeet || 0) * 19)} />
                            </div>
                          )}
                        </div>
                      </div>
                      <PhotoAttach bucketId="extra_windows_and_doors" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <CheckboxRow label="Custom Add-On" checked={pricing.customAdd.selected} onChange={(v) => setPricing({ ...pricing, customAdd: { ...pricing.customAdd, selected: v } })} />
                    <ReadOnly label="Subtotal" value={fmtMaybe(pricing.hideTotalsInPrint, pricing.customAdd.selected ? pricing.customAdd.price : 0)} />
                  </div>
                  {pricing.customAdd.selected && (
                                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                      <TextInput label="Label" value={pricing.customAdd.label} onChange={(v) => setPricing({ ...pricing, customAdd: { ...pricing.customAdd, label: v } })} />
                      <NumberInput label="Price" value={pricing.customAdd.price} onChange={(v) => setPricing({ ...pricing, customAdd: { ...pricing.customAdd, price: num(v) } })} />
                      <PhotoAttach bucketId="extra_custom" photos={photos} setPhotos={setPhotos} />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">Extras Total</div>
                  <div className="text-lg font-semibold">{fmtMaybe(pricing.hideTotalsInPrint, extrasTotal)}</div>
                </div>
              </div>
            </Card>
          </Section>

          {/* Summary */}
          <Section id="summary">
            <Card title="Totals & Acceptance">
              <div className="mt-6 flex items-center gap-3">
  <button
    className="px-4 py-2 rounded bg-slate-800 text-white"
    onClick={() => setPricing({ ...pricing, hideTotalsInPrint: !pricing.hideTotalsInPrint })}
  >
    {pricing.hideTotalsInPrint ? "Show Totals in Print" : "Hide Totals in Print"}
  </button>

  <button
    className="px-4 py-2 rounded bg-emerald-700 text-white"
    onClick={() => setShowPrint(true)}
  >
    Open Print Preview
  </button>

  {/* NEW */}
  <button
    className="px-4 py-2 rounded bg-indigo-700 text-white"
    onClick={exportProposalDocx}
  >
    Export Word Proposal
  </button>
</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SummaryTable
                  label="Primary Work"
                  rows={[
                    [workDomain.roofing && selectedWork.asphalt && "Asphalt Roofing — Selected Option", pricing.hideTotalsInPrint ? "TBD" : asphaltBaseSelected],
                    [workDomain.roofing && selectedWork.davinci && "DaVinci Roofscapes", pricing.hideTotalsInPrint ? "TBD" : davinciBase],
                    [workDomain.roofing && selectedWork.cedar && "Cedar Shake Roofing", pricing.hideTotalsInPrint ? "TBD" : cedarBase],
                    [workDomain.roofing && selectedWork.rubber && "Rubber Roofing (EPDM)", pricing.hideTotalsInPrint ? "TBD" : rubberBase],
                    [workDomain.siding && selectedWork.sidingCategories && selectedWork.sidingCategories.length > 0 && `Siding (${(selectedWork.sidingCategories || []).map(s => s.replace(/([A-Z])/g, ' $1')).join(', ')})`, pricing.hideTotalsInPrint ? "TBD" : sidingBase],
                  ].filter((r) => r[0])}
                  tbd={pricing.hideTotalsInPrint}
                />
                <SummaryTable
                  label="Extras"
                  rows={[
                    [pricing.plywood.selected && "Plywood", pricing.hideTotalsInPrint ? "TBD" : plywoodTotal],
                    [pricing.chimney.selected && "Chimney (lead flashing)", pricing.hideTotalsInPrint ? "TBD" : chimneyTotal],
                    [pricing.skylights.selected && "Skylights (see print)", "TBD"],
                    [pricing.trim.selected && `Trim (${pricing.trim.material === "cedar" ? "Red Cedar" : "AZEK"})`, pricing.hideTotalsInPrint ? "TBD" : trimTotal],
                    [pricing.gutters.selected && guttersLabel(pricing.gutters.type), pricing.hideTotalsInPrint ? "TBD" : guttersTotal],
                    [pricing.detached.selected && "Detached Structure (see print)", "TBD"],
                    [pricing.customAdd.selected && pricing.customAdd.label, pricing.hideTotalsInPrint ? "TBD" : pricing.customAdd.price],
                  ].filter((r) => r[0])}
                  tbd={pricing.hideTotalsInPrint}
                />
              </div>

              {pricing.hideTotalsInPrint ? (
                <div className="mt-4 text-sm text-slate-700">
                  Final pricing is <strong>TBD</strong> and will be determined by customer selections in the final proposal
                  document.
                </div>
              ) : (
                <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-2xl font-semibold">
                    TOTAL INVESTMENT: <span className="text-emerald-700">{fmtMoney(grandTotal)}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    Prices honored for 30 days from date of proposal, subject to material availability.
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <textarea
                  className="w-full rounded-xl border border-slate-300 p-3"
                  rows={4}
                  value={scope.notes}
                  onChange={(e) => setScope({ ...scope, notes: e.target.value })}
                  placeholder="Additional notes or scheduling constraints..."
                />
                <div className="rounded-xl border border-slate-200 p-3 bg-white">
                  <h4 className="font-semibold mb-2">Payment & Terms</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>50% deposit to schedule; balance due upon substantial completion.</li>
                    <li>Includes standard cleanup and disposal unless otherwise noted.</li>
                    <li>Change orders billed at time & materials or agreed fixed price.</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button className="px-4 py-2 rounded bg-slate-800 text-white" onClick={() => setPricing({ ...pricing, hideTotalsInPrint: !pricing.hideTotalsInPrint })}>
                  {pricing.hideTotalsInPrint ? "Show Totals in Print" : "Hide Totals in Print"}
                </button>
                <button className="px-4 py-2 rounded bg-emerald-700 text-white" onClick={() => setShowPrint(true)}>Open Print Preview</button>
              </div>
            </Card>
          </Section>

          {/* Settings */}
          <Section id="settings">
            <Card title="Company">
              <TwoCol>
                <TextInput label="Company Name" value={company.name} onChange={(v) => setCompany({ ...company, name: v })} />
                <TextInput label="Address" value={company.address} onChange={(v) => setCompany({ ...company, address: v })} />
                <TextInput label="Phone" value={company.phone} onChange={(v) => setCompany({ ...company, phone: v })} />
                <TextInput label="Email" value={company.email} onChange={(v) => setCompany({ ...company, email: v })} />
                <TextInput label="HIC#" value={company.hic} onChange={(v) => setCompany({ ...company, hic: v })} />
                <TextInput label="CSL#" value={company.csl} onChange={(v) => setCompany({ ...company, csl: v })} />
              </TwoCol>
              <TextInput label="Boilerplate / Notes" value={company.notes} onChange={(v) => setCompany({ ...company, notes: v })} />
            </Card>
          </Section>

          {/* Save/Load */}
          <Section id="save">
            <Card title="Save / Load Proposal">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextInput label="Save as" value={savedName} onChange={setSavedName} placeholder="e.g., Smith_2025-08-18" />
                <button className="px-4 py-2 rounded bg-slate-800 text-white self-end h-10" onClick={() => {
                  const key = savedName || `proposal_${new Date().toISOString()}`;
                  const payload = { company, customer, measure, pricing, scope, workDomain, selectedWork, photos, computed: { primaryTotals, extrasTotal, grandTotal }, version: 9 };
                  setSavedMap({ ...savedMap, [key]: payload });
                  alert(`Saved as: ${key}`);
                }}>Save</button>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Saved proposals</div>
                <div className="rounded border bg-white">
                  {Object.keys(savedMap).length === 0 && <div className="p-3 text-sm text-slate-500">No saved proposals yet.</div>}
                  {Object.entries(savedMap).map(([k]) => (
                    <div key={k} className="flex items-center justify-between p-2 border-t first:border-t-0">
                      <div className="text-sm">{k}</div>
                      <div className="flex items-center gap-2">
                        <button className="px-3 py-1 rounded bg-slate-200 text-slate-800" onClick={() => {
                          const p = savedMap[k];
                          setCompany(p.company ?? company);
                          setCustomer(p.customer ?? customer);
                          setMeasure({ ...measure, ...(p.measure || {}) });
                          setPricing({ ...pricing, ...(p.pricing || {}) });
                          setScope({ ...scope, ...(p.scope || {}) });
                          if (p.workDomain) setWorkDomain(p.workDomain);
                          setSelectedWork({ ...selectedWork, ...(p.selectedWork || {}) });
                          if (p.photos) setPhotos(p.photos);
                        }}>Load</button>
                        <button className="px-3 py-1 rounded bg-rose-600 text-white" onClick={() => {
                          const cp = { ...savedMap }; delete cp[k]; setSavedMap(cp);
                        }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </Section>
        </MobileTabs>
      </div>

      {showPrint && (
        <PrintOverlay onClose={() => setShowPrint(false)}>
          <PrintView
            company={company}
            customer={customer}
            pricing={pricing}
            scope={scope}
            selectedWork={selectedWork}
            measure={measure}
            workDomain={workDomain}
            totals={{ primaryTotals, extrasTotal, grandTotal }}
          />
        </PrintOverlay>
      )}
    </div>
  );

  // --- Exclusivity helpers
  function toggleExclusive(group, key) {
    setScope((prev) => ({
      ...prev,
      asphalt: {
        ...prev.asphalt,
        [group]: Object.fromEntries(
          Object.keys(prev.asphalt[group]).map((k) => [k, k === key ? !prev.asphalt[group][k] : false])
        ),
      },
    }));
  }
}

// ---------- UI primitives
function Header({ company, grandTotal, onPrint }) {
  return (
    <header className="bg-white border-b">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{company.name}</div>
          <div className="text-xs text-slate-500">{company.address}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            Est. Total: <span className="font-semibold">{fmtMoney(grandTotal)}</span>
          </div>
          <button className="px-3 py-1.5 rounded bg-emerald-700 text-white" onClick={onPrint}>
            Print
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileTabs({ tabs, children }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const scroller = useRef(null);

  useEffect(() => {
    const el = document.getElementById(active);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active]);

  return (
    <div ref={scroller}>
      <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-1 py-2 overflow-x-auto whitespace-nowrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`px-3 py-1.5 text-sm rounded ${
                active === t.id ? "bg-slate-900 text-white" : "hover:bg-slate-200"
              }`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {/* Only render the Section whose id matches the active tab */}
      {React.Children.toArray(children).find(
        (child) => child?.props?.id === active
      )}
    </div>
  );
}

function Section({ id, children }) {
  return (
    <section id={id} className="scroll-mt-14 mt-6">
      {children}
    </section>
  );
}
function Card({ title, children }) {
  return (
    <div className="rounded-xl border bg-white p-4 mb-4">
      {title && <div className="font-semibold text-slate-800 mb-3">{title}</div>}
      {children}
    </div>
  );
}

function TwoCol({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function CheckboxRow({ label, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={!!checked}
        disabled={!!disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-slate-600">{label}</div>
      <select
        className="w-full rounded border px-2 py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function NumberInput({ label, value, onChange, min, step }) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-slate-600">{label}</div>
      <input
        type="number"
        className="w-full rounded border px-2 py-1.5"
      value={value === undefined || value === null ? "" : String(value)}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function TextInput({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="text-sm block">
      <div className="mb-1 text-slate-600">{label}</div>
      <input
        type={type}
        className="w-full rounded border px-2 py-1.5"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function ReadOnly({ label, value }) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-slate-600">{label}</div>
      <div className="w-full rounded border px-2 py-1.5 bg-slate-50">{value}</div>
    </label>
  );
}

// ---------- Feature components
function PlywoodConditionGroup({ label, value, onChange, squaresLabel, squaresValue, onSquaresChange }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-xs font-medium mb-1">{label}</div>
      <div className="flex flex-wrap items-center gap-4">
        {[
          ["inspectRenail", "Inspect & renail"],
          ["replace", "Replace existing plywood"],
          ["newOverBoards", "New plywood over existing boards"],
        ].map(([val, lbl]) => (
          <label key={val} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={value === val}
              onChange={() => onChange(value === val ? "inspectRenail" : val)}
            />
            <span>{lbl}</span>
          </label>
        ))}
      </div>
      {value !== "inspectRenail" && (
        <div className="mt-2 max-w-xs">
          <NumberInput
            label={squaresLabel}
            value={squaresValue}
            onChange={onSquaresChange}
            min={0}
            step="0.1"
          />
        </div>
      )}
    </div>
  );
}

function ScopeGrid({ scope, onChange, items }) {
  return (
    <div className="rounded-xl border p-3 bg-white mt-3">
      <div className="text-sm font-medium mb-2">Included Scope</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map(([k, lbl]) => (
          <CheckboxRow key={k} label={lbl} checked={!!scope[k]} onChange={(v) => onChange({ ...scope, [k]: v })} />
        ))}
      </div>
    </div>
  );
}

function AsphaltLine({ label, selected, onSelect, mode, unitValue, onUnitChange, manualValue, onManualChange, base, hideTotals, color, plywoodCondition, plywoodSquares, solarSurcharge = 0, fullCoverageSurcharge = 0 }) {
  // Calculate plywood cost
  let plywoodCost = 0;
  if (plywoodCondition === "replace") plywoodCost = 360 * (plywoodSquares || 0);
  if (plywoodCondition === "newOverBoards") plywoodCost = 330 * (plywoodSquares || 0);
  const totalWithPlywood = num(base) + num(plywoodCost);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{label}</span>
        <div className="text-sm">
          <div>Base: <span className="font-semibold">{fmtMoney(totalWithPlywood)}</span></div>
          {solarSurcharge > 0 && <div className="text-xs text-slate-600">Includes solar surcharge: {fmtMoney(solarSurcharge)}</div>}
          {fullCoverageSurcharge > 0 && <div className="text-xs text-slate-600">Includes full-coverage surcharge: {fmtMoney(fullCoverageSurcharge)}</div>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        {mode === "bySquare" ? (
          <NumberInput label="$/Square" value={unitValue} onChange={onUnitChange} />
        ) : (
          <NumberInput label="Manual Total" value={manualValue} onChange={onManualChange} />
        )}
      </div>
    </div>
  );
}

function PhotoAttach({ bucketId, photos, setPhotos }) {
  const list = photos[bucketId] || [];
  const add = (files) => {
    const arr = Array.from(files || []);
    arr.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const id = `${bucketId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const entry = { id, dataURL: e.target.result, name: file.name };
        setPhotos((p) => ({ ...p, [bucketId]: [...(p[bucketId] || []), entry] }));
      };
      reader.readAsDataURL(file);
    });
  };
  const remove = (id) => setPhotos((p) => ({ ...p, [bucketId]: (p[bucketId] || []).filter((x) => x.id !== id) }));
  return (
    <div className="mt-3">
      <div className="text-xs font-medium mb-1">Photos</div>
      <input type="file" multiple onChange={(e) => add(e.target.files)} />
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {list.map((ph) => (
          <div key={ph.id} className="relative border rounded overflow-hidden">
            <img src={ph.dataURL} alt={ph.name} className="w-full h-28 object-cover" />
            <button className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1 rounded" onClick={() => remove(ph.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTable({ label, rows, tbd }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="font-medium mb-2">{label}</div>
      <div className="divide-y">
        {rows.map(([name, val], i) => (
          <div key={i} className="flex items-center justify-between py-1 text-sm">
            <div className="mr-3">{name}</div>
            <div className="min-w-[120px] text-right tabular-nums">
              {tbd && typeof val === "number" ? "TBD" : typeof val === "number" ? fmtMoney(val) : val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Print
function PrintOverlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white max-w-4xl w-[95%] h-[90%] rounded-xl shadow-xl overflow-hidden flex flex-col">
        <div className="p-2 border-b flex items-center justify-between">
          <div className="font-semibold">Print Preview</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded bg-slate-200" onClick={() => window.print()}>
              Print
            </button>
            <button className="px-3 py-1 rounded bg-rose-600 text-white" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function PrintView({ company, customer, pricing, scope, selectedWork, measure, workDomain, totals }) {
  const { primaryTotals, extrasTotal, grandTotal } = totals;

  return (
    <div className="text-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-semibold">{company.name}</div>
          <div className="text-sm">{company.address}</div>
          <div className="text-sm">HIC #{company.hic} • CSL #{company.csl}</div>
          <div className="text-sm">{company.phone} • {company.email}</div>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">Proposal</div>
          <div>Date: {customer.providedOn}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded border p-2">
          <div className="font-medium">Customer</div>
          <div>{customer.name}</div>
          <div>{customer.street}</div>
          <div>
            {customer.city}, {customer.state} {customer.zip}
          </div>
          <div>{customer.email} • {customer.tel}</div>
        </div>
          <div className="rounded border p-2">
          <div className="font-medium">Scope Summary</div>
          <div>Roof squares (eff.): {measure.roofSquares}  {measure.wastePct}% waste = {measure.roofSquares * (1 + num(measure.wastePct)/100)} squares</div>
          <div>Flat roof squares: {measure.flatRoofSquares}</div>
        </div>
      </div>

      {/* Primary work */}
      <div className="mt-4">
        <div className="text-lg font-semibold mb-2">Primary Work</div>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {workDomain.roofing && selectedWork.asphalt && (
            <li>
              Asphalt Roofing — Selected option {pricing.asphaltSelected || "(none)"} — {fmtMoney(primaryTotals.asphalt)}
              {scope.asphalt.areas && <div className="text-slate-600">Areas: {scope.asphalt.areas}</div>}
            </li>
          )}
          {workDomain.roofing && selectedWork.davinci && (
            <li>
              DaVinci Roofscapes — {fmtMoney(primaryTotals.davinci)}
              {scope.davinci.areas && <div className="text-slate-600">Areas: {scope.davinci.areas}</div>}
            </li>
          )}
          {workDomain.roofing && selectedWork.cedar && (
            <li>
              Cedar Shake Roofing — {fmtMoney(primaryTotals.cedar)}
              {scope.cedar.areas && <div className="text-slate-600">Areas: {scope.cedar.areas}</div>}
            </li>
          )}
          {workDomain.roofing && selectedWork.rubber && (
            <li>
              Rubber Roofing (EPDM) — {fmtMoney(primaryTotals.rubber)}
              {scope.rubber.areas && <div className="text-slate-600">Areas: {scope.rubber.areas}</div>}
            </li>
          )}
          {workDomain.siding && selectedWork.sidingCategories && selectedWork.sidingCategories.length > 0 && (
            <>
              {(selectedWork.sidingCategories || []).map((cat) => (
                <li key={cat}>
                  {sidingLabel(cat, (pricing.siding.byCategory || {})[cat]?.product)} — {fmtMoney(((pricing.siding.byCategory || {})[cat]?.calcMode === 'bySquare') ? round2(num((pricing.siding.byCategory || {})[cat]?.squares || 0) * num(((pricing.siding.byCategory || {})[cat]?.unit) || unitRateFor({ category: cat, product: (pricing.siding.byCategory || {})[cat]?.product, rates: pricing.siding.rates }))) : num((pricing.siding.byCategory || {})[cat]?.manualTotal || 0))}
                  {((pricing.siding.byCategory || {})[cat]?.areas || pricing.siding.areas) && <div className="text-slate-600">Areas: {((pricing.siding.byCategory || {})[cat]?.areas || pricing.siding.areas)}</div>}
                </li>
              ))}
            </>
          )}
          {workDomain.decking && (
            <li>
              Decking — (materials: {deckingMaterialsList(pricing.decking.materials).join(", ") || "—"})
              {pricing.decking.areas && <div className="text-slate-600">Areas: {pricing.decking.areas}</div>}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-6 text-right text-lg font-semibold">
        GRAND TOTAL: {fmtMoney(grandTotal)}
      </div>

      <div className="mt-4 text-xs text-slate-500">
        {company.notes}
      </div>
    </div>
  );
}

// ---------- Helpers
function unitRateFor(s) {
  const cat = s?.category;
  let prod = s?.product;
  if (!cat) return 0;
  // if no product explicitly selected, fall back to the category's first product
  if (!prod) {
    const opts = sidingProductOptions(cat);
    prod = opts[0]?.value;
  }
  return (s.rates?.[cat]?.[prod]) ?? 0;
}
function sidingProductOptions(category) {
  const map = {
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
}
// Return the display label for a product value using the Select options for the category
function productLabelFor(category, value) {
  if (!value) return "";
  const opts = sidingProductOptions(category) || [];
  const found = opts.find((o) => o.value === value);
  return found ? found.label : value;
}
function guttersLabel(type) {
  return type === "aluminum5"
    ? '5" Seamless Aluminum Gutters'
    : type === "aluminum6"
    ? '6" Seamless Aluminum Gutters (Commercial)'
    : type === "copper_k5"
    ? '5" K-Style Copper'
    : type === "copper_h6"
    ? '6" half round copper'
    : "Copper Gutters";
}
function sidingLabel(cat, prod) {
  const catName =
    cat === "cedarShake"
      ? "Cedar Shake Siding"
      : cat === "synthetic"
      ? "Fiber Cement / Synthetic Siding"
      : cat === "vinyl"
      ? "Vinyl Siding"
      : cat === "clapBoard"
      ? "Clap Board Siding"
      : "Siding";
  return prod ? `${catName} — ${prod}` : catName;
}
function deckingMaterialsList(m) {
  return [m.azek && "AZEK", m.wolf && "WOLF", m.pt && "PT", m.mahogany && "Mahogany", m.trex && "Trex"].filter(Boolean);
}
function trimFeetLabel(k) {
  const map = {
    soffit: "Soffit (ft)",
    fascias: "Fascias (ft)",
    frieze: "Frieze (ft)",
    molding: "Molding (ft)",
    cornerBoards: "Corner Boards (ft)",
    windowDoor: "Window/Door trim (ft)",
    rakeBoards: "Rake Boards (ft)",
    waterTable: "Water Table (ft)",
  };
  return map[k] || k;
}
function computePlywoodTotal(squares, rate) {
  return round2(num(squares) * num(rate));
}
function computeSkylightPrices(base, complexity, adders) {
  const add = adders[complexity] || 0;
  return {
    fixed: round2(num(base.fixed) + num(add)),
    manual: round2(num(base.manual) + num(add)),
    solar: round2(num(base.solar) + num(add)),
  };
}
