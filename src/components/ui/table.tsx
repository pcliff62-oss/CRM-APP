import * as React from "react";
export function Table({ children }: { children: React.ReactNode }) {
  return <table className="min-w-full text-sm">{children}</table>;
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-slate-50 text-slate-700">{children}</thead>;
}
export function TRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b last:border-none">{children}</tr>;
}
export function TH({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2">{children}</th>;
}
export function TD({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}
