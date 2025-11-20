import { buildDocLines } from "@/lib/proposalDoc";
import { num } from "@/lib/webProposal/data";

// Build a rich "view" object with friendly alias keys so template tokens resolve
export function mapSnapshotToWeb(snapshot: any) {
  const computed = snapshot?.computed || {};
  const primary = computed.primaryTotals || {};
  const grandTotal =
    Number(computed.grandTotal ?? 0) ||
    Object.values(primary).reduce((a: number, b: any) => a + num(b), 0) +
      num(computed.extrasTotal || 0);

  const view: Record<string, any> = {
    // existing values used by the template engine
    lines: buildDocLines(snapshot),
    grandTotal: Math.round(grandTotal * 100) / 100,
  };

  // ---- Helper utilities for mapping cedar tokens ----
  const getFrom = (obj: any, path: string) =>
    path.split('.').reduce((a: any, k: string) => (a && a[k] !== undefined ? a[k] : undefined), obj);
  const pick = (...paths: string[]) => {
    for (const p of paths) {
      const v = getFrom(snapshot, p);
      if (v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '')) return v;
    }
    return undefined;
  };
  const isOn = (...paths: string[]) => {
    for (const p of paths) {
      const v = getFrom(snapshot, p);
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v > 0;
      if (v && typeof v === 'object' && 'selected' in v) return !!(v as any).selected;
      if (typeof v === 'string' && v.trim() !== '') return true;
    }
    return false;
  };
  const toStr = (v: any, d = '') => (typeof v === 'string' && v.trim() ? v.trim() : d);
  const toUpper = (s: string) => s.toUpperCase();
  const putIfUndef = (k: string, v: any) => {
    if (v === undefined) return;
    if (view[k] === undefined) view[k] = v;
  };

  // --- sources (with fallbacks) ---
  const pricing = (snapshot?.pricing || {}) as any;
  const cedar = (pricing.cedarShake || pricing.cedar || {}) as any;
  const roofing = (pricing.roofing || {}) as any;

  // Cedar plywood sentence
  putIfUndef(
    'cedar_plywood_sentence',
    toStr(
      pick('pricing.cedarShake.plywoodSentence', 'pricing.roofing.plywoodSentence'),
      'Inspect and Re-Nail any loose or popped plywood or boards on the Entire Roof Deck Area of the House.'
    )
  );

  // Cedar type label (e.g., RED CEDAR / WHITE CEDAR / CEDAR SHAKE)
  const cedarType = toStr(
    pick('pricing.cedarShake.typeLabel', 'pricing.cedarShake.type', 'pricing.cedar.type', 'pricing.roofing.cedarType'),
    'CEDAR SHAKE'
  );
  putIfUndef('cedar_type_label', toUpper(cedarType));

  // Drip edge labels & rows
  const dripEaveSize = toStr(
    pick('pricing.cedarShake.dripEdge.eaveSize', 'pricing.roofing.dripEdge.eaveSize', 'pricing.roofing.dripEdgeEaveSize'),
    '5"'
  );
  const dripEaveMat = toStr(
    pick('pricing.cedarShake.dripEdge.material', 'pricing.roofing.dripEdge.material', 'pricing.roofing.dripEdgeMaterial'),
    'Copper'
  );
  const dripRakeSize = toStr(
    pick('pricing.cedarShake.dripEdge.rakeSize', 'pricing.roofing.dripEdge.rakeSize', 'pricing.roofing.dripEdgeRakeSize'),
    '5"'
  );
  const dripRakeMat = toStr(
    pick('pricing.cedarShake.dripEdge.material', 'pricing.roofing.dripEdge.material', 'pricing.roofing.dripEdgeMaterial'),
    'Copper'
  );
  putIfUndef('cedar_drip_eave_label', `${dripEaveSize} ${dripEaveMat}`);
  putIfUndef('cedar_drip_rake_label', `${dripRakeSize} ${dripRakeMat}`);
  putIfUndef(
    'row_cedar_drip_eave',
    isOn(
      'pricing.cedarShake.dripEdge.eave.selected',
      'pricing.cedarShake.dripEdgeEave.selected',
      'pricing.roofing.dripEdge.eaveSelected',
      'pricing.roofing.dripEdgeEaveSelected',
      'pricing.cedarShake.dripEdge.eave',
      'pricing.roofing.dripEdge.eave'
    )
  );
  putIfUndef(
    'row_cedar_drip_rake',
    isOn(
      'pricing.cedarShake.dripEdge.rake.selected',
      'pricing.cedarShake.dripEdgeRake.selected',
      'pricing.roofing.dripEdge.rakeSelected',
      'pricing.roofing.dripEdgeRakeSelected',
      'pricing.cedarShake.dripEdge.rake',
      'pricing.roofing.dripEdge.rake'
    )
  );

  // Ice & Water Shield toggles
  const iw_eaves3 = isOn('pricing.cedarShake.iw.eaves3', 'pricing.roofing.iw.eaves3', 'pricing.roofing.iwEaves3');
  const iw_valleys = isOn('pricing.cedarShake.iw.valleys', 'pricing.roofing.iw.valleys', 'pricing.roofing.iwValleys');
  const iw_pipesVents = isOn('pricing.cedarShake.iw.pipesVents', 'pricing.roofing.iw.pipesVents', 'pricing.roofing.iwPipesVents');
  const iw_stepFlash = isOn('pricing.cedarShake.iw.stepFlash', 'pricing.roofing.iw.stepFlash', 'pricing.roofing.iwStepFlash');
  const iw_chimney = isOn('pricing.cedarShake.iw.chimney', 'pricing.roofing.iw.chimney', 'pricing.roofing.iwChimney');
  const iw_skylights = isOn('pricing.cedarShake.iw.skylights', 'pricing.roofing.iw.skylights', 'pricing.roofing.iwSkylights');
  const iw_lowPitch = isOn('pricing.cedarShake.iw.lowPitch', 'pricing.roofing.iw.lowPitch', 'pricing.roofing.iwLowPitch');
  const iw_solar = isOn('pricing.cedarShake.iw.solarAreas', 'pricing.roofing.iw.solarAreas', 'pricing.roofing.iwSolarAreas');
  const iw_full = isOn('pricing.cedarShake.iw.fullCoverage', 'pricing.roofing.iw.fullCoverage', 'pricing.roofing.iwFullCoverage');
  const iw_any = iw_eaves3 || iw_valleys || iw_pipesVents || iw_stepFlash || iw_chimney || iw_skylights || iw_lowPitch || iw_solar || iw_full;
  putIfUndef('row_cedar_iw_any', iw_any);
  putIfUndef('cedar_iw_eaves3', iw_eaves3);
  putIfUndef('cedar_iw_valleys', iw_valleys);
  putIfUndef('cedar_iw_pipesVents', iw_pipesVents);
  putIfUndef('cedar_iw_stepFlash', iw_stepFlash);
  putIfUndef('cedar_iw_chimney', iw_chimney);
  putIfUndef('cedar_iw_skylights', iw_skylights);
  putIfUndef('cedar_iw_lowPitch', iw_lowPitch);
  putIfUndef('cedar_iw_solarAreas', iw_solar);
  putIfUndef('cedar_iw_fullCoverage', iw_full);

  // Underlayments and ventilation
  putIfUndef(
    'row_cedar_deckArmor',
    isOn('pricing.cedarShake.deckArmor', 'pricing.cedarShake.deckArmour', 'pricing.roofing.deckArmor', 'pricing.roofing.underlayment.deckArmor')
  );
  putIfUndef('row_cedar_cedarBreather', isOn('pricing.cedarShake.cedarBreather', 'pricing.roofing.cedarBreather'));

  // Copper valleys
  const valleysMat = toStr(pick('pricing.cedarShake.valleys.material', 'pricing.roofing.valleys.material'), '').toLowerCase();
  putIfUndef('row_cedar_copperValleys', isOn('pricing.cedarShake.copperValleys', 'pricing.roofing.copperValleys') || valleysMat.includes('copper'));

  // Ridge vent
  putIfUndef('row_cedar_ridgeVent', isOn('pricing.cedarShake.ridgeVent', 'pricing.roofing.ridgeVent'));

  // Cedar ridge boards
  putIfUndef('row_cedar_cedarRidgeBoards', isOn('pricing.cedarShake.cedarRidgeBoards', 'pricing.roofing.cedarRidgeBoards'));

  // Woven caps feet and row
  const wovenFeet = num(pick('pricing.cedarShake.wovenCapsFeet', 'pricing.roofing.wovenCapsFeet', 'pricing.cedar.wovenCapsFeet'));
  putIfUndef('cedar_woven_caps_feet', wovenFeet > 0 ? wovenFeet : '');
  putIfUndef('row_cedar_woven_caps', wovenFeet > 0 || isOn('pricing.cedarShake.wovenCaps', 'pricing.roofing.wovenCaps'));

  // Pipe flange label and row
  const pipeLabel = toStr(
    pick('pricing.cedarShake.pipeFlange.label', 'pricing.roofing.pipeFlange.label', 'pricing.roofing.pipeFlangeMaterial'),
    'LEAD'
  );
  putIfUndef('cedar_pipe_flange_label', toUpper(pipeLabel));
  putIfUndef('row_cedar_pipeFlange', isOn('pricing.cedarShake.pipeFlange', 'pricing.roofing.pipeFlange', 'pricing.cedar.pipeFlange'));

  // Roof fan vents count/label and row
  const fanCnt = num(pick('pricing.cedarShake.roofFanVents.count', 'pricing.roofing.roofFanVents.count', 'pricing.roofing.roofFanVentsCount'));
  putIfUndef('cedar_roof_fan_vents_label', fanCnt > 0 ? String(fanCnt) : '');
  putIfUndef('row_cedar_roofFanVents', fanCnt > 0 || isOn('pricing.cedarShake.roofFanVents', 'pricing.roofing.roofFanVents'));

  // Cleanup line always present
  putIfUndef('row_cedar_cleanup', true);

  // Helper to add snake_case and underscore-preserving aliases, and a *_usd variant for numbers
  const put = (key: string, value: any) => {
    if (key && view[key] === undefined) view[key] = value;
    if (typeof value === "number" && isFinite(value)) {
      const usd = (() => {
        try {
          return value.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          });
        } catch {
          return `$${(Math.round(value * 100) / 100).toFixed(2)}`;
        }
      })();
      if (key && view[`${key}_usd`] === undefined) view[`${key}_usd`] = usd;
    }
  };

  const addAliases = (obj: any, prefix = "") => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const base = prefix ? `${prefix}_${k}` : k;
      if (v && typeof v === "object") {
        addAliases(v, base);
      } else {
        const snake = base
          .replace(/[.\s]/g, "_")
          .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
          .toLowerCase();
        const under = base.replace(/[.\s]/g, "_");
        if (view[snake] === undefined) put(snake, v);
        if (view[under] === undefined) put(under, v);
      }
    }
  };

  // Flatten commonly-used sources so template tokens can bind without code changes
  addAliases(primary, "primaryTotals");
  addAliases(computed?.sidingTotals || {}, "sidingTotals");
  addAliases(snapshot?.pricing?.cedarShake, "cedarShake");
  addAliases(snapshot?.pricing?.cedar, "cedar");
  addAliases(snapshot?.pricing?.roofing, "roofing");
  addAliases(snapshot?.pricing, "pricing");
  addAliases(snapshot?.computed, "computed");

  // Provide direct, unprefixed roofing aliases expected by legacy templates
  const amtOf = (...keys: string[]) => {
    for (const k of keys) {
      const v = Number(
        (primary as any)[k] ??
          (primary as any)[k.replace(/_/g, "")] ??
          (primary as any)[k.replace(/([A-Z])/g, "_$1").toLowerCase()]
      );
      if (isFinite(v) && v > 0) return v;
    }
    return 0;
  };
  const expose = (base: string, value: number, extraAliases: string[] = []) => {
    if (!(value > 0)) return;
    const names = new Set<string>([
      base,
      `${base}_total`,
      base.replace(/_/g, ""),
      ...extraAliases,
    ]);
    for (const n of names) put(n, value);
  };
  // Cedar Shake roofing
  expose(
    "cedar_shake",
    amtOf("cedarShakeRoof", "cedarShake", "cedar_roof", "cedar"),
    ["cedar", "cedar_roof", "cedarshake", "cedarshake_total"]
  );
  // DaVinci synthetic roofing
  expose(
    "davinci",
    amtOf("davinciRoof", "davinci_roof", "davinci", "daVinci"),
    ["davinci_roof", "davinciroof", "davinci_total"]
  );

  return view;
}
