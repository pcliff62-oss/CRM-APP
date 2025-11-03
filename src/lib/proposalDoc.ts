export type SnapshotLike = any;

const num = (v: any) => {
  const n = typeof v === "number" ? v : parseFloat(String(v || "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};

export function buildDocLines(snapshot: SnapshotLike): string[] {
  const s = snapshot || {};
  const pricing = s.pricing || {};
  const scope = s.scope || {};
  const workDomain = s.workDomain || {};
  const selectedWork = s.selectedWork || {};
  const measure = s.measure || {};

  const lines: string[] = [];

  // Asphalt roofing
  if (workDomain.roofing && selectedWork.asphalt) {
    const brand = (pricing.asphaltSelectedLabel || pricing.asphaltSelected || "asphalt shingles").toString();
    const areas = scope.asphalt?.areas ? ` on ${scope.asphalt.areas}` : "";
    lines.push(`Supply and install ${brand} roofing system${areas}.`);
    if (scope.asphalt?.syntheticUnderlayment) lines.push("Include synthetic underlayment.");
    if (scope.asphalt?.starterStrips) lines.push("Include starter strips at all eaves and rakes.");
    if (scope.asphalt?.ridgeVent) lines.push("Include continuous ridge ventilation where applicable.");
    if (scope.asphalt?.hipRidgeCaps) lines.push("Include hip and ridge caps as required.");
    if (scope.asphalt?.pipeFlashings) lines.push("Flash all soil pipes and fan vents.");
    if (scope.asphalt?.plywoodCondition === "inspectRenail") {
      lines.push("Inspect and re-nail any loose or popped plywood or boards on the entire roof deck area of the house.");
    } else if (scope.asphalt?.plywoodCondition === "replace") {
      lines.push("Replace the existing plywood on the entire roof deck area of the house.");
    } else if (scope.asphalt?.plywoodCondition === "newOverBoards") {
      lines.push("Install new plywood over the existing roof boards on the entire roof deck area of the house.");
    }
    lines.push("Clean and remove all job-related debris.");
  }

  // DaVinci
  if (workDomain.roofing && selectedWork.davinci) {
    const areas = scope.davinci?.areas ? ` on ${scope.davinci.areas}` : "";
    lines.push(`Supply and install DaVinci Roofscapes roofing system${areas}.`);
  }

  // Cedar
  if (workDomain.roofing && selectedWork.cedar) {
    const areas = scope.cedar?.areas ? ` on ${scope.cedar.areas}` : "";
    lines.push(`Supply and install Cedar Shake roofing system${areas}.`);
  }

  // Rubber
  if (workDomain.roofing && selectedWork.rubber) {
    const areas = scope.rubber?.areas ? ` on ${scope.rubber.areas}` : "";
    lines.push(`Supply and install Rubber (EPDM) roofing system${areas}.`);
  }

  // Siding
  if (workDomain.siding) {
    const areas = pricing?.siding?.areas ? ` on ${pricing.siding.areas}` : "";
    lines.push(`Supply and install new siding${areas}.`);
  }

  // Extras - Gutters
  if (pricing?.gutters?.selected) {
    const type = pricing.gutters.type || "gutters";
    const feet = num(pricing.gutters.feet) || 0;
    const dsType = pricing.gutters.downspouts?.type ? ` and ${pricing.gutters.downspouts.type} downspouts` : " and downspouts";
    const dsFeet = num(pricing.gutters.downspouts?.feet) || 0;
    const leaf = pricing.gutters.leafGuards?.selected ? " with leaf guards" : "";
    lines.push(`Supply and install new ${type}${leaf}, approximately ${feet} LF, with matching corners and end caps.`);
    if (dsFeet > 0) lines.push(`Supply and install approximately ${dsFeet} LF of${dsType}.`);
  }

  // Extras - Trim
  if (pricing?.trim?.selected) {
    const material = pricing.trim.material === "cedar" ? "Cedar" : "Azek";
    lines.push(`Supply and install ${material} exterior trim as specified.`);
  }

  // Extras - Chimney
  if (pricing?.chimney?.selected) {
    const size = pricing.chimney.size ? ` (${pricing.chimney.size})` : "";
    const cricket = pricing.chimney.cricket ? " and cricket" : "";
    lines.push(`Supply and install new chimney flashing${size}${cricket}.`);
  }

  // Extras - Skylights
  if (pricing?.skylights?.selected) {
    const count = num(pricing.skylights.count) || 1;
    const style = pricing.skylights.type || "skylight(s)";
    lines.push(`Supply and install ${count} ${style} including all necessary flashing.`);
  }

  // Custom add-on
  if (pricing?.customAdd?.selected && pricing?.customAdd?.label) {
    lines.push(`Supply and install ${pricing.customAdd.label}.`);
  }

  // Notes
  if (s.notes || scope.notes) {
    lines.push((s.notes || scope.notes) as string);
  }

  return lines;
}
