export type WebProposal = {
  lines: string[];
  grandTotal: number;
};

export const num = (v: any) => {
  const n = typeof v === "number" ? v : parseFloat(String(v || "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};
export const money = (n: number) => (isNaN(n) ? "$0.00" : n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }));
