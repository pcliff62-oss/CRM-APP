"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { mapSnapshotToWeb } from "@/templates/hytech/field-map";
// Color dropdowns removed: reverting to original behavior without MATERIAL_COLOR_OPTIONS
import { renderProposalTemplate } from "@/lib/webProposal/render";

export default function ProposalView({ params }: { params: { id: string } }) {
  const id = params.id;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [proposal, setProposal] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasTypedSig, setHasTypedSig] = useState(false);
  const [origGuttersTotal, setOrigGuttersTotal] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Treat id as token for public fetch
        const res = await fetch(`/api/proposals/public/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setProposal(data);
        const snap = data?.snapshot || {};
        setSnapshot(snap);
      } catch (e: any) {
        if (!mounted) return; setErr(e?.message || "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const view = useMemo(() => mapSnapshotToWeb(snapshot), [snapshot]);
  const [tpl, setTpl] = useState<string>("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/proposals/template", { cache: "no-store" });
        const t = await r.text();
        if (mounted) setTpl(t);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);
  const html = useMemo(() => {
    if (!tpl) return "";
    // DEV: warn about missing cedar tokens so we can map them
    try {
      const tokenRe = /\{([a-zA-Z0-9_]+)\}/g;
      const cedarTokens = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = tokenRe.exec(tpl))) {
        const tok = m[1];
        if (/^cedar/i.test(tok) || /^row_cedar/i.test(tok)) cedarTokens.add(tok);
      }
      if (cedarTokens.size) {
        const missing = Array.from(cedarTokens).filter((t) => (view as any)[t] === undefined);
        if (missing.length) console.warn('Missing Cedar tokens in view:', missing);
      }
    } catch {}
  return renderProposalTemplate(tpl, view as any, snapshot as any);
  }, [tpl, view, snapshot]);

  // Revert shim for previous "price-cells-only borders" enhancement that hid some siding pills
  useEffect(() => {
    const root = containerRef.current?.querySelector('.proposal-html') as HTMLElement | null;
    if (!root) return;
    (function undoPriceCellBordersEnhancement(){
      try {
        const styles = Array.from(document.querySelectorAll('style')) as HTMLStyleElement[];
        for (const s of styles) {
          const txt = (s.textContent || '').toLowerCase();
          if (txt.includes('.has-price-cell') || txt.includes('.gbb-table') || txt.includes('.price-cells-lined-table')) {
            s.parentElement?.removeChild(s);
          }
        }
        root.querySelectorAll('.gbb-table, .price-cells-lined-table').forEach(el => el.classList.remove('gbb-table','price-cells-lined-table'));
        root.querySelectorAll('.has-price-cell').forEach(el => el.classList.remove('has-price-cell'));
        const restore = document.createElement('style');
        restore.textContent = `
          .proposal-html .price-choice { display: inline-flex !important; visibility: visible !important; }
        `;
        root.prepend(restore);
      } catch {}
    })();
  }, [html]);

  // No DOM manipulation; render template as-is
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedHtmlRef = useRef<string>("");

  // Inject the HTML once per change without letting React overwrite enhanced DOM
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const next = String(html || "");
    if (renderedHtmlRef.current === next) return; // no change
    el.innerHTML = next;
    renderedHtmlRef.current = next;

    // NEW: strip literal photo placeholders if the renderer left them
    (function stripLiteralPhotoTags(container: HTMLElement) {
      try {
        const removeTokensInText = (re: RegExp) => {
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          const edits: Text[] = [];
          while (walker.nextNode()) {
            const tn = walker.currentNode as Text;
            if (re.test(tn.textContent || '')) edits.push(tn);
          }
          for (const tn of edits) {
            tn.textContent = (tn.textContent || '')
              .replace(re, '')
              .replace(/\s{2,}/g, ' ')
              .trim();
            const parent = tn.parentElement as HTMLElement | null;
            if (parent && !(parent.textContent || '').trim()) parent.remove();
          }
        };
        // Remove section open/close tags and image tokens
        removeTokensInText(/\{#photos_[^}]+}|\{\/photos_[^}]+}|\{\%\s*image[^}]*}/gi);

        // Clean empty wrappers left behind (p/span/div with no visible text)
        const empties = Array.from(container.querySelectorAll('p,span,div')) as HTMLElement[];
        for (const el2 of empties) {
          const t = (el2.textContent || '').replace(/\s+/g, ' ').trim();
          if (!t && !el2.querySelector('*')) el2.remove();
        }
      } catch {}
    })(el);
  }, [html]);
  const totalRef = useRef<number>(0);

  // Enhance rendered template with interactive checkboxes and a final total placeholder.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !html) return;
  // Hot-reload friendly: run enhancement every time; ensure idempotence and cleanup listeners/styles on unmount
    let cleanupFns: Array<() => void> | null = [];

    // Inject minimal styles for checkboxes and totals
  const style = document.createElement("style");
  style.textContent = `
  /* Inline signature UI helpers (ensure present even if template CSS omitted) */
  @media print { #signature-controls, #signature-editor { display: none !important; } }
  .e-signature { display:inline-block; font-size: 22pt; line-height: 1; color: #111; }

  /* Signature editor and controls */
  #signature-controls{ position: fixed; right: 16px; bottom: 16px; z-index: 1000; }
  #signature-controls button{ background:#0f172a; color:#fff; border:0; border-radius:8px; padding:8px 12px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.15); cursor:pointer; }
  #signature-editor{ position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 1001; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border-radius: 12px; padding: 16px; width: min(640px, calc(100vw - 40px)); display:none; }
  #signature-editor h3{ margin: 0 0 8px; font-size: 16px; color:#0f172a; }
  #signature-editor label{ display:block; font-size: 12px; color:#334155; margin-bottom:4px; }
  #signature-editor input[type="text"]{ width: 100%; border:1px solid #cbd5e1; border-radius:6px; padding:8px; font-size:14px; }
  #signature-editor .samples{ display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; margin-top:10px; }
  #signature-editor .sample{ border:1px dashed #cbd5e1; border-radius:8px; padding:10px; text-align:center; cursor:pointer; background:#f8fafc; user-select:none; }
  #signature-editor .sample.selected{ outline:2px solid #2563eb; background:#eff6ff; }
  #signature-editor .actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
  #signature-editor button{ background:#0f172a; color:#fff; border:0; border-radius:8px; padding:8px 12px; font-weight:600; cursor:pointer; }
  #signature-editor .cancel{ background:#e2e8f0; color:#0f172a; }

  /* Absolute signature overlay image inside the signature cell */
  .signature-area{ position: relative; }
  .signature-overlay{ position:absolute; left:50%; top:45%; transform: translate(-50%, -100%); max-width:65%; height:auto; pointer-events:none; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.05)); }

  .price-choice{ display:inline-flex !important; visibility:visible !important; align-items:center; gap:6px; margin-left:8px; margin-right:6px; padding:2px 8px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; vertical-align:baseline; }
      .price-choice input[type="checkbox"]{ display:inline-block !important; width:18px; height:18px; accent-color:#334155; }
      .price-choice span{ font-weight:600; color:#0f172a; }
  /* Prevent any inherited underline from showing under price pills */
  .price-choice, .price-choice * { text-decoration: none !important; border-bottom: 0 !important; }
  /* Good/Better/Best: stack vertically, checkbox centered under number */
  .price-choice.gbb{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; margin:6px auto 0 auto; }
      .total-investment-final{ font-weight:800; padding-left:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:2px 8px; margin-left:6px; }
  .skylight-qty{ width:64px; padding:2px 4px; border:1px solid #cbd5e1; border-radius:4px; }
  .skylight-total-amount{ font-weight:700; text-decoration:none !important; border-bottom:0 !important; }

  /* Photos grid injected under sections */
  .photos-grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 8px 0 12px; }
  .photos-grid .photo-item{ break-inside: avoid; page-break-inside: avoid; }
  .photos-grid img{ width:100%; height:auto; border:1px solid #e2e8f0; border-radius:6px; background:#fff; }
  .photos-grid .photo-caption{ font-size:10px; color:#64748b; margin-top:2px; text-align:center; }

  /* Color dropdown removed */

  /* Unified page width and print size (Letter 8.5x11) */
  .proposal-doc .max-w-2xl{ max-width: none; width: 8.5in; margin-left:auto; margin-right:auto; }
  .proposal-html{ width: 8.5in; max-width: 100%; margin-left:auto; margin-right:auto; }
  .proposal-html table{ width: 100%; float: none !important; }
  .proposal-html img{ max-width: 100%; height: auto; }

  /* Windows & Doors table: avoid thick collapsed borders when many cells are empty */
  .windows-doors-table{ border-collapse: separate !important; border-spacing: 0; }
  .windows-doors-table td, .windows-doors-table th{ border-width:1px !important; }
  .windows-doors-table td.empty-cell, .windows-doors-table th.empty-cell{ border: none !important; }

  /* Rich blue section divider: thick, tapered ends, subtle texture */
  .section-divider{
    display:block;
    height:8px;
    margin:16px 0;
    border-radius:999px;
    background:
      /* fine texture */
      repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 2px, rgba(255,255,255,0) 2px 6px),
      /* core blue gradient with soft fade at ends */
      linear-gradient(90deg, rgba(29,78,216,0) 0%, rgba(29,78,216,0.5) 10%, rgba(29,78,216,0.9) 50%, rgba(29,78,216,0.5) 90%, rgba(29,78,216,0) 100%);
    filter: saturate(1.1);
    box-shadow: 0 0 6px rgba(29,78,216,0.25);
    /* tapered ends */
    -webkit-mask-image: linear-gradient(to right, transparent, black 14%, black 86%, transparent);
    mask-image: linear-gradient(to right, transparent, black 14%, black 86%, transparent);
  }

  @media print{
    @page{ size: 8.5in 11in; margin: 0.5in; }
    html, body{ width: 8.5in; }
    .proposal-doc{ background: transparent; padding: 0; }
    .proposal-doc .max-w-2xl{ width: 8.5in; }
    .proposal-html{ width: 8.5in; }
  }
    `;
    root.prepend(style);

    // Resolve leftover {placeholders} for roofing totals (e.g., {cedar_shake_total}, {davinci_total})
    function replaceKnownPlaceholders(container: HTMLElement) {
      try {
        const prim = (((snapshot as any)?.computed?.primaryTotals) || {}) as Record<string, any>;
        const fmtUsd = (n: number) => {
          const v = Number(n || 0);
          if (!isFinite(v) || v <= 0) return '';
          try { return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); }
          catch { return `$${(Math.round(v * 100) / 100).toFixed(2)}`; }
        };

        // Build alias map for common roofing tokens
        const getAmt = (...keys: string[]) => {
          for (const k of keys) {
            const v = Number(
              prim[k] ??
              prim[k.replace(/_/g, '')] ??
              prim[k.replace(/([A-Z])/g, '_$1').toLowerCase()]
            );
            if (isFinite(v) && v > 0) return v;
          }
          return 0;
        };

        const cedarAmt = getAmt('cedarShakeRoof', 'cedarShake', 'cedar_roof', 'cedar_roofing', 'cedar', 'shakeRoof', 'shake');
        const davinciAmt = getAmt('davinciRoof', 'davinci_roof', 'davinci', 'daVinci');
        const vinylAmt = getAmt('vinylRoof', 'vinyl_roof', 'vinyl');
        const clapAmt = getAmt('clapboardRoof', 'clapboard', 'clap_board');
        const cedarSidingAmt = getAmt('sidingCedar', 'cedarSiding');

        const dict = new Map<string, string>();
        const add = (key: string, val: number) => {
          if (!(val > 0)) return;
          const v = fmtUsd(val);
          const k = key.toLowerCase();
          [k, `${k}_total`, `${k}total`].forEach(alias => {
            dict.set(`{${alias}}`, v);
            dict.set(`{${alias.toUpperCase()}}`, v);
          });
        };
        // Common tokens seen in templates
        add('cedar', cedarAmt);
        add('cedar_shake', cedarAmt);
        add('cedar_shake_roof', cedarAmt);
        add('cedar_shake_roofing', cedarAmt);
        add('davinci', davinciAmt);
        add('vinyl', vinylAmt);
        add('clapboard', clapAmt);
        add('cedar_siding', cedarSidingAmt);

        if (dict.size === 0) return;

        // Replace in text nodes only; don’t touch attributes/HTML
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const edits: Array<{ node: Text; text: string }> = [];
        while (walker.nextNode()) {
          const tn = walker.currentNode as Text;
          const txt = tn.textContent || '';
          if (txt.indexOf('{') === -1 || txt.indexOf('}') === -1) continue;
          let out = txt;
          for (const [token, val] of dict) {
            if (!val) continue;
            if (out.toLowerCase().includes(token.toLowerCase())) {
              // Replace case-insensitive
              const rx = new RegExp(token.replace(/[{}]/g, s => '\\' + s), 'ig');
              out = out.replace(rx, val);
            }
          }
          if (out !== txt) edits.push({ node: tn, text: out.replace(/\s+\b0\b(?![\d])/g, '') }); // also drop trailing placeholder " 0"
        }
        for (const e of edits) e.node.textContent = e.text;
      } catch {}
    }

    // Run the placeholder resolver early so that amounts exist for pill injection
    replaceKnownPlaceholders(root);

    // Utility: parse money amount from string like "$ 3,600.00"
    function parseMoney(text: string): number {
      const m = (text || '').match(/\$\s*([-+]?[0-9][0-9,]*(?:\.[0-9]{2})?)/);
      if (!m) return 0;
      const n = Number(m[1].replace(/,/g, ''));
      return isFinite(n) ? n : 0;
    }

    // Utility: determine if element is within a Windows & Doors table or a TOTAL row
    function isInWndOrTotal(el: HTMLElement | null): boolean {
      if (!el) return false;
      const table = el.closest('table') as HTMLElement | null;
      if (table && (table.classList?.contains('windows-doors-table') || /WINDOWS\s*&\s*DOORS/i.test(table.textContent || ''))) return true;
      // Skip rows that are explicit totals
      const row = el.closest('tr') as HTMLElement | null;
      const t = (row?.textContent || '').toUpperCase();
      if (t.includes('TOTAL') && t.includes('INVESTMENT')) return true;
      return false;
    }
    // Utility: determine if an element is inside the Ice & Water descriptive area
    function isIceWaterContext(el: HTMLElement | null): boolean {
      if (!el) return false;
      const table = el.closest('table') as HTMLElement | null;
      const txt = (table ? table.textContent : el.textContent) || '';
      const T = txt.toUpperCase();
      // Heuristic: contain both ICE and WATER and not a TOTAL row
  if (/(ICE\b[\s\S]*WATER|WATER\b[\s\S]*ICE)/i.test(T) && !/TOTAL\s+INVESTMENT/i.test(T)) {
        return true;
      }
      return false;
    }

    // Utility: determine if an element is inside the "(Possible) Extra Carpentry" section.
    // Scope strictly to the closest table to avoid false positives from distant headings.
    function isInCarpentry(el: HTMLElement | null): boolean {
      if (!el) return false;
      const table = el.closest('table') as HTMLElement | null;
      if (!table) return false;
      const re = /(POSSIBLE\s+)?EXTRA\s+CARPENTRY/i;
      return re.test(table.textContent || '');
    }

    // Move a price pill out of any underlined ancestor (e.g., <u> or inline style) to avoid underline bleed
    function breakUnderlineForPill(pill: HTMLElement) {
      try {
        if (!pill || !pill.parentElement) return;
        // If pill itself is inside <u> or an element with underline style, move it just after that element
        let host: HTMLElement | null = pill.closest('u') as HTMLElement | null;
        if (!host) {
          let p = pill.parentElement as HTMLElement | null;
          while (p && p !== root) {
            const st = (p.getAttribute('style') || '').toLowerCase();
            if (/text-decoration\s*:\s*underline/.test(st)) { host = p; break; }
            p = p.parentElement as HTMLElement | null;
          }
        }
        if (!host || !host.parentElement) return;
        const parent = host.parentElement;
        // Ensure a single space separation
        if (!host.nextSibling || (host.nextSibling.nodeType === Node.TEXT_NODE && !/\S/.test((host.nextSibling as Text).textContent || ''))) {
          parent.insertBefore(document.createTextNode(' '), host.nextSibling);
        }
        // Move pill after the underlined host
        parent.insertBefore(pill, host.nextSibling);
      } catch {}
    }

    // Remove placeholder runs (____, nbsp, dashes, stray zeros) around a pill to kill tiny line artifacts
    function removePlaceholderJunkAround(pill: HTMLElement) {
      const isOnlyJunk = (s: string) => {
        const t = (s || '').replace(/\s+/g, ' ');
        // underscores, nbsp, hyphens/en-dash/em-dash, brackets, and stray 0/0.00 fragments
        return /^[\s\u00A0_\-–—\[\]\(\)0.,]+$/.test(t);
      };
      // Trim leading/trailing underscores on neighbor text nodes instead of always removing them
      const trimEdge = (textNode: Text, which: 'start'|'end') => {
        let s = textNode.textContent || '';
        const orig = s;
        if (which === 'start') s = s.replace(/^[_\u00A0\s\-–—.0]+/, ' ');
        else s = s.replace(/[_\u00A0\s\-–—.0]+$/, ' ');
        if (s !== orig) textNode.textContent = s;
        if (!/\S/.test(textNode.textContent || '')) textNode.parentNode?.removeChild(textNode);
      };
      const purgeForward = (n0: Node | null) => {
        let n = n0, steps = 0;
        while (n && steps < 8) {
          const next = (n as any).nextSibling as Node | null;
          if (n.nodeType === Node.TEXT_NODE) {
            const t = n as Text;
            if (isOnlyJunk(t.textContent || '')) { t.parentNode?.removeChild(t); n = next; steps++; continue; }
            trimEdge(t, 'start'); break;
          } else if (n instanceof HTMLElement) {
            const plain = (n.textContent || '').trim();
            if (isOnlyJunk(plain)) { n.remove(); n = next; steps++; continue; }
            // If it's just an underline wrapper with only junk inside, remove it
            const st = (n.getAttribute('style') || '').toLowerCase();
            if ((n.tagName.toLowerCase() === 'u' || /text-decoration\s*:\s*underline/.test(st)) && isOnlyJunk(n.textContent || '')) {
              const rm = n; n = next; rm.remove(); steps++; continue;
            }
            break;
          } else {
            break;
          }
        }
      };
      const purgeBackward = (n0: Node | null) => {
        let n = n0, steps = 0;
        while (n && steps < 8) {
          const prev = (n as any).previousSibling as Node | null;
          if (n.nodeType === Node.TEXT_NODE) {
            const t = n as Text;
            if (isOnlyJunk(t.textContent || '')) { t.parentNode?.removeChild(t); n = prev; steps++; continue; }
            trimEdge(t, 'end'); break;
          } else if (n instanceof HTMLElement) {
            const plain = (n.textContent || '').trim();
            if (isOnlyJunk(plain)) { n.remove(); n = prev; steps++; continue; }
            const st = (n.getAttribute('style') || '').toLowerCase();
            if ((n.tagName.toLowerCase() === 'u' || /text-decoration\s*:\s*underline/.test(st)) && isOnlyJunk(n.textContent || '')) {
              const rm = n; n = prev; rm.remove(); steps++; continue;
            }
            break;
          } else {
            break;
          }
        }
      };
      try {
        purgeForward(pill);
        purgeBackward(pill);
        // Also scrub immediate siblings of the pill's parent if they only contain junk
        const parent = pill.parentElement;
        if (parent) {
          purgeForward(parent.nextSibling as Node | null);
          purgeBackward(parent.previousSibling as Node | null);
        }
      } catch {}
    }

    // Global pass: wrap generic $ amounts with a checkbox pill, skipping TOTAL rows and Windows & Doors
  function applyGlobalPriceWrappers(container: HTMLElement) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const toReplace: { node: Text; idx: number }[] = [];
      while (walker.nextNode()) {
        const tn = walker.currentNode as Text;
        const txt = tn.textContent || '';
        // Quick skip if no dollar sign
        if (txt.indexOf('$') === -1) continue;
        const host = tn.parentElement as HTMLElement | null;
        if (!host) continue;
  // Skip if already wrapped
        if (host.closest('.price-choice')) continue;
        if (isInWndOrTotal(host)) continue;
    if (isIceWaterContext(host)) continue;
  // Skip any price within the Carpentry clause
  if (isInCarpentry(host)) continue;
        // Capture first $ occurrence in this text node
        const idx = txt.indexOf('$');
        if (idx >= 0) toReplace.push({ node: tn, idx });
      }
      for (const { node, idx } of toReplace) {
        const host = node.parentElement as HTMLElement | null; if (!host) continue;
        const txt = node.textContent || '';
        const before = txt.slice(0, idx);
        const afterRaw = txt.slice(idx);
        // Extract amount substring beginning with $
    const m = afterRaw.match(/^\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?/);
        if (!m) continue;
        const moneyStr = m[0];
  // Guard: if the very next non-space char after the number is a letter (e.g., "mil"), skip
    const tail = afterRaw.slice(moneyStr.length);
    const nextToken = (tail.replace(/<[^>]*>/g, '').match(/^(?:\s|\u00A0)*([^\s\u00A0])/ )||[])[1] || '';
    if (/^[A-Za-z]/.test(nextToken)) continue;
    const amt = parseMoney(moneyStr);
        if (!(amt > 0)) continue;
        // Build pill
        const wrap = document.createElement('label'); wrap.className = 'price-choice';
        const span = document.createElement('span'); span.textContent = ((): string => {
          try { return amt.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); } catch { return `$${(Math.round(amt*100)/100).toFixed(2)}`; }
        })();
        const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'proposal-price-checkbox'; input.setAttribute('data-amount', String(amt));
        wrap.appendChild(span); wrap.appendChild(input);
        // Replace the text node into: before + wrap + restAfter
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(wrap);
        const rest = afterRaw.slice(moneyStr.length).replace(/^[_\s\u00A0]+/, ' ');
        if (rest) frag.appendChild(document.createTextNode(rest));
        host.replaceChild(frag, node);
      }
    }

    // Cross-tag pass: within typical cells/tags, replace sequences like "$<tag>3,600</tag>.00" with a pill
    function applyCrossTagPriceWrappers(container: HTMLElement) {
      const candidates = Array.from(container.querySelectorAll('td,th,p,span,b,strong')) as HTMLElement[];
      for (const el of candidates) {
        if (el.closest('.price-choice')) continue;
  if (isInWndOrTotal(el)) continue;
  if (isIceWaterContext(el)) continue;
  if (isInCarpentry(el)) continue;
        const html0 = el.innerHTML;
        // Skip if already has any checkbox
        if (/class=("|')[^"']*proposal-price-checkbox/.test(html0)) continue;
  // Find $ followed by up to ~400 chars (including tags/nbsp/space) then a number
  const re = /\$([\s\S]{0,400}?)([0-9][0-9,]*(?:\.[0-9]{2})?)/;
        const m = html0.match(re);
        if (!m) continue;
        const amt = Number((m[2] || '').replace(/,/g, ''));
        if (!(amt > 0)) continue;
        // Guard: ensure the following plain-text after the number doesn't immediately start with a letter (e.g., "mil")
        const afterSegment = html0.slice(html0.indexOf(m[2]) + m[2].length);
        const afterPlain = afterSegment.replace(/<[^>]*>/g, '');
        const next = (afterPlain.match(/^(?:\s|\u00A0)*([^\s\u00A0])/ )||[])[1] || '';
        if (/^[A-Za-z]/.test(next)) continue;
        const fmtUsd = (() => { try { return amt.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); } catch { return `$${(Math.round(amt*100)/100).toFixed(2)}`; } })();
        const pill = `<label class=\"price-choice\"><span>${fmtUsd}</span><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
        // Replace the matched $...number with our pill, trimming placeholder underscores after
  const html1 = html0.replace(re, (_full, mid: string, numStr: string) => {
          return pill;
        }).replace(/^[\s\S]*?/, (s) => s); // no-op; keep structure intact otherwise
        if (html1 !== html0) el.innerHTML = html1;
      }
    }

    // Extras tables gating (heading-based, safe): hide extras sections when not selected, never hide legal/acceptance tables
    function hideUnusedExtras(container: HTMLElement) {
      try {
        const pricing: any = (snapshot as any)?.pricing || {};
        const flags = {
          plywood: !!pricing?.plywood?.selected,
          chimney: !!pricing?.chimney?.selected,
          skylights: !!pricing?.skylights?.selected,
          trim: !!pricing?.trim?.selected,
          gutters: !!pricing?.gutters?.selected,
          detached: !!pricing?.detached?.selected,
          custom: !!pricing?.customAdd?.selected,
        } as const;

        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        const getShortTexts = (el: HTMLElement) => {
          const nodes = Array.from(el.querySelectorAll('th, b, strong, h1, h2, h3, h4, h5, h6, p, span')) as HTMLElement[];
          const out: string[] = [];
          for (const n of nodes) {
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t) continue;
            if (t.length <= 40) out.push(t.toUpperCase());
          }
          return out;
        };
        const hasHeading = (tbl: HTMLElement, re: RegExp) => {
          const texts = getShortTexts(tbl);
          return texts.some((txt) => re.test(txt));
        };
        const isProtectedLegalTable = (tbl: HTMLElement) => {
          const txt = (tbl.textContent || '').toUpperCase();
          return /(RIGHT\s+TO\s+CANCEL|PAYMENT\s+SCHEDULE|NON[-\s]?PAYMENT|INFLATION|NON[-\s]?COMPLIANT|DATE\s+OF\s+ACCEPTANCE|ACCEPTED\s+BY|SUBMITTED\s+BY)/.test(txt);
        };
        // NEW: if a table already contains photos, keep it visible even if the extra isn't selected
        const hasPhotos = (tbl: HTMLElement) => {
          // Prefer explicit photo containers injected by renderer or our fallback
          if (tbl.querySelector('.photos-grid, [data-photo-section]')) return true;
          // As a last resort, if the table has a TRIM heading and any <img>, treat as photos
          const txt = (tbl.textContent || '').toUpperCase();
          if (/^(TRIM|TRIM\s+WORK)$/.test(txt.replace(/\s+/g, ' ').trim()) && tbl.querySelector('img')) return true;
          return false;
        };
        const hideIfHeading = (on: boolean, re: RegExp) => {
          if (on) return; // keep if selected
          for (const t of tables) {
            if (isProtectedLegalTable(t)) continue;
            if (hasHeading(t, re)) {
              if (hasPhotos(t)) continue;
              (t as HTMLElement).style.display = 'none';
            }
          }
        };
        hideIfHeading(flags.plywood, /^(PLYWOOD|PLYWOOD\s+RATES?)$/);
        hideIfHeading(flags.chimney, /^CHIMNEY(\s+WORK)?$/);
        hideIfHeading(flags.skylights, /^SKYLIGHTS?$/);
        hideIfHeading(flags.trim, /^(TRIM|TRIM\s+WORK)$/);
        hideIfHeading(flags.gutters, /^GUTTERS?$/);
  hideIfHeading(flags.detached, /^(DETACHED|DETATCHED)(\s+STRUCTURES?)?$/);
        hideIfHeading(flags.custom, /^CUSTOM(\s+ADD(ITION)?S?)?$/);
      } catch {}
    }

  // Insert blue section dividers between sections (skip legal/signature) and add top address divider
    function ensureSectionDividers(container: HTMLElement) {
      try {
        // Remove existing dividers on re-run
        Array.from(container.querySelectorAll('.section-divider')).forEach(el => el.remove());
        // Top-of-document divider directly under the company address line
        (function addTopAddressDivider(){
          try {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            const re = /714A\s+Route\s+6-A\s+Yarmouth\s+Port,\s*MA\s*02675/i;
            let host: HTMLElement | null = null;
            while (walker.nextNode()){
              const tn = walker.currentNode as Text;
              if (re.test(tn.textContent || '')) { host = tn.parentElement as HTMLElement | null; break; }
            }
            if (!host) return;
            const div = document.createElement('div');
            div.className = 'section-divider';
            div.setAttribute('data-top-divider', '1');
            const cell = host.closest('td,th') as HTMLElement | null;
            if (cell) cell.appendChild(div);
            else host.parentNode?.insertBefore(div, host.nextSibling);
          } catch {}
        })();
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        const isProtectedLegalTable = (tbl: HTMLElement) => {
          const txt = (tbl.textContent || '').toUpperCase();
          return /(RIGHT\s+TO\s+CANCEL|PAYMENT\s+SCHEDULE|NON[-\s]?PAYMENT|INFLATION|NON[-\s]?COMPLIANT|DATE\s+OF\s+ACCEPTANCE|ACCEPTED\s+BY|SUBMITTED\s+BY)/.test(txt);
        };
        const isSignatureAreaTable = (tbl: HTMLElement) => {
          const txt = (tbl.textContent || '').toUpperCase();
          return /(SIGNATURE|SIGNED\s+BY|OWNER\s+SIGNATURE|CUSTOMER\s+SIGNATURE|DATE\s+OF\s+ACCEPTANCE|ACCEPTED\s+BY|PRINT\s+NAME)/.test(txt);
        };
        const firstTable = tables[0] || null;
        const visibleSections = tables.filter(t => {
          if ((t as HTMLElement).style.display === 'none') return false;
          if (t === firstTable) return false;
          if (isProtectedLegalTable(t)) return false;
          if (isSignatureAreaTable(t)) return false;
          return true;
        });
        for (let i = 0; i < visibleSections.length - 1; i++) {
          const a = visibleSections[i];
          const div = document.createElement('div');
          div.className = 'section-divider';
          if (a.nextSibling) a.parentNode?.insertBefore(div, a.nextSibling);
          else a.parentNode?.appendChild(div);
        }
      } catch {}
    }

    // Restore NorthGate GBB pills if they reverted to plain text in TOTAL INVESTMENT row
    function ensureNorthGateGBBPill(container: HTMLElement) {
      try {
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        for (const t of tables) {
          const txt = (t.textContent || '').toUpperCase();
          if (!/NORTHGATE|CLIMATEFLEX/.test(txt)) continue;
          if (!/(GOOD|BETTER|BEST)/.test(txt)) continue;
          // Find TOTAL INVESTMENT row
          const rows = Array.from(t.querySelectorAll('tr')) as HTMLTableRowElement[];
          const totalRow = rows.find(r => /TOTAL\s+INVESTMENT\s*:/i.test(r.textContent || '')) || null;
          if (!totalRow) continue;
          // In the totalRow, ensure ALL G/B/B cells contain price pills
          const cells = Array.from(totalRow.querySelectorAll('td,th')) as HTMLElement[];
          for (const cell of cells) {
            if (cell.querySelector('label.price-choice')) continue;
            const html0 = cell.innerHTML;
            const crossRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/;
            const contRe = /(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)(?!\s*[A-Za-z])/;
            let changed = false;
            if (contRe.test(html0)) {
              cell.innerHTML = html0.replace(contRe, (m) => {
                const amt = Number(m.replace(/[^0-9.\-]/g, ''));
                changed = true;
                return `<label class=\"price-choice gbb\"><span>${m}</span><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
              });
            }
            if (!cell.querySelector('label.price-choice') && crossRe.test(html0)) {
              cell.innerHTML = html0.replace(crossRe, (seg) => {
                const plain = seg.replace(/<[^>]*>/g, '');
                const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
                // Guard: avoid unit-following like "mil"
                if (m) {
                  const after = plain.slice(plain.indexOf(m[1]) + m[1].length);
                  const next = (after.match(/^(?:\s|\u00A0)*([^\s\u00A0])/)||[])[1] || '';
                  if (/^[A-Za-z]/.test(next)) return seg;
                }
                const amt = m ? Number((m[1] || '').replace(/[^0-9.\-]/g, '')) : 0;
                return `<label class=\"price-choice gbb\">${seg}<input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
              });
              changed = true;
            }
            if (changed) {
              try { recalc(); } catch {}
            }
          }
        }
      } catch {}
    }

  // Color dropdowns removed; no-op

    // Ensure Trim photos are injected if the template loop didn't render them
    function ensureTrimPhotosFallback(container: HTMLElement) {
      try {
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        const isTrimTable = (t: HTMLElement) => {
          const txt = (t.textContent || '').toUpperCase();
          // Avoid legal/acceptance tables
          if (/(RIGHT\s+TO\s+CANCEL|PAYMENT\s+SCHEDULE|DATE\s+OF\s+ACCEPTANCE|ACCEPTED\s+BY|SUBMITTED\s+BY)/.test(txt)) return false;
          return /(\bTRIM\b|\bTRIM\s+WORK\b)/.test(txt);
        };
        const table = tables.find(isTrimTable) || null;
        if (!table) return;
        // If photos already present, do nothing
        if (table.querySelector('.photos-grid[data-trim-fallback="1"], [data-photo-section="trim"], .photos-grid img, img[data-photo-section]')) return;

        // Collect Trim photos from snapshot
        const pics: { src: string; caption?: string }[] = [];
        const seen = new Set<string>();
        const addList = (arr: any) => {
          if (!Array.isArray(arr)) return;
          for (const it of arr) {
            const src = it?.url || it?.src || it?.dataUrl || it?.dataURI || it?.uri || '';
            if (!src || seen.has(src)) continue;
            seen.add(src);
            pics.push({ src, caption: it?.caption || it?.label || it?.name || '' });
          }
        };
        const s: any = snapshot || {};
        addList(s?.photos?.trim);
        addList(s?.photos?.TRIM);
        addList(s?.media?.trim);
        addList(s?.media?.TRIM);
        addList(s?.attachments?.trim);
        addList(s?.attachments?.TRIM);
        addList(s?.pricing?.trim?.photos);
        if (s?.photos && typeof s.photos === 'object') {
          for (const [k, v] of Object.entries(s.photos)) {
            if (/trim/i.test(String(k)) && Array.isArray(v)) addList(v);
          }
        }
        if (!pics.length) return;

        // Build a grid and append as a full-width row at the end of the Trim table
        const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        const colCount = Math.max(1, ...rows.map(r => Array.from(r.querySelectorAll('td,th')).length), 2);
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = colCount;
        const grid = document.createElement('div');
        grid.className = 'photos-grid';
        grid.setAttribute('data-trim-fallback', '1');
        for (const p of pics) {
          const item = document.createElement('div');
          item.className = 'photo-item';
          const img = document.createElement('img');
          img.src = p.src;
          img.alt = p.caption || 'Trim photo';
          img.setAttribute('data-photo-section', 'trim');
          item.appendChild(img);
          if (p.caption) {
            const cap = document.createElement('div');
            cap.className = 'photo-caption';
            cap.textContent = p.caption;
            item.appendChild(cap);
          }
          grid.appendChild(item);
        }
        td.appendChild(grid);
        tr.appendChild(td);
        const htmlTable = table as unknown as HTMLTableElement;
        if (htmlTable.tBodies && htmlTable.tBodies.length) htmlTable.tBodies[0].appendChild(tr);
        else table.appendChild(tr);
      } catch {}
    }

    // Inline typed-signature UX: button opens editor, choose style, replace customer name with cursive text, double-click to edit
    (function setupInlineSignature(){
      // If the template already ships its own inline signature editor + script, skip to avoid duplicates.
      const preboundEditor = root.querySelector('#signature-editor') as HTMLElement | null;
      if (preboundEditor) return;

      // Ensure UI controls exist (button + editor modal)
      const ensureControls = () => {
        let btnWrap = root.querySelector('#signature-controls') as HTMLElement | null;
        if (!btnWrap) {
          btnWrap = document.createElement('div');
          btnWrap.id = 'signature-controls';
          const btn = document.createElement('button');
          btn.id = 'add-signature-btn';
          btn.textContent = 'Add Signature';
          btnWrap.appendChild(btn);
          document.body.appendChild(btnWrap);
        }
        let editor = root.querySelector('#signature-editor') as HTMLElement | null;
        if (!editor) {
          editor = document.createElement('div'); editor.id = 'signature-editor';
          editor.innerHTML = `
            <h3>Add your signature</h3>
            <label for="signature-input">legal home owners name:</label>
            <input id="signature-input" type="text" placeholder="Type your full name" />
            <div class="samples">
              <div class="sample" data-font="'Snell Roundhand', 'Brush Script MT', cursive">Sample</div>
              <div class="sample" data-font="'Lucida Handwriting', 'Segoe Script', cursive">Sample</div>
              <div class="sample" data-font="'Segoe Script', 'Brush Script MT', cursive">Sample</div>
              <div class="sample" data-font="'Brush Script MT', 'Snell Roundhand', cursive">Sample</div>
            </div>
            <div class="actions">
              <button class="cancel" id="signature-cancel">Cancel</button>
              <button id="signature-apply">Use this signature</button>
            </div>
          `;
          document.body.appendChild(editor);
        }
        return { btnWrap, editor };
      };

      // Locate or create the drop area above the signature line
      const ensureDisplayArea = (): HTMLElement | null => {
        let display = root.querySelector('#customer-signature-display') as HTMLElement | null;
        if (display) return display;
        // Find a likely signature table/cell
        const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
        const isSignatureAreaTable = (tbl: HTMLElement) => /\b(SIGNATURE|SIGNED\s+BY|OWNER\s+SIGNATURE|CUSTOMER\s+SIGNATURE)\b/i.test(tbl.textContent || '');
        const tbl = tables.find(isSignatureAreaTable) || null;
        if (!tbl) return null;
        // Prefer the cell that contains the word SIGNATURE
        const candidate = Array.from(tbl.querySelectorAll('td,th')).find(c => /\b(SIGNATURE|SIGNED\s+BY|OWNER\s+SIGNATURE|CUSTOMER\s+SIGNATURE)\b/i.test(c.textContent || '')) as HTMLElement | undefined;
        const host = (candidate as HTMLElement | undefined) || (tbl.querySelector('td,th') as HTMLElement | null);
        if (!host) return null;
        host.classList.add('signature-area');
        display = document.createElement('div');
        display.id = 'customer-signature-display';
        display.style.position = 'absolute';
        display.style.left = '0'; display.style.top = '0'; display.style.right = '0'; display.style.bottom = '0';
        display.style.pointerEvents = 'none';
        host.appendChild(display);
        return display;
      };

      // Name span (printed under line) if the template has one
      const nameSpan = root.querySelector('#customer-signature-name') as HTMLElement | null;

      const { btnWrap, editor } = ensureControls();
      const btn = btnWrap?.querySelector('#add-signature-btn') as HTMLButtonElement | null;
      const input = editor?.querySelector('#signature-input') as HTMLInputElement | null;
      const applyBtn = editor?.querySelector('#signature-apply') as HTMLButtonElement | null;
      const cancelBtn = editor?.querySelector('#signature-cancel') as HTMLButtonElement | null;
      const samples = Array.from(editor?.querySelectorAll('.sample') || []) as HTMLElement[];

      let selectedFont: string | null = null;
      const updateSamples = (name: string) => {
        samples.forEach(s => {
          s.textContent = name || 'Sample';
          const f = s.getAttribute('data-font') || 'cursive';
          try { s.style.setProperty('font-family', f, 'important'); } catch { s.style.fontFamily = f; }
          s.style.fontSize = '26px';
        });
      };
      const selectSample = (el: HTMLElement | null) => {
        samples.forEach(s => s.classList.remove('selected'));
        if (!el) return; el.classList.add('selected'); selectedFont = el.getAttribute('data-font');
      };
      const onSample = (ev: Event) => { const t = ev.currentTarget as HTMLElement; selectSample(t); };
      samples.forEach(s => s.addEventListener('click', onSample));

      const openEditor = (prefill?: string) => {
        if (!editor) return;
        editor.style.display = 'block';
        const def = (prefill || nameSpan?.textContent || '').trim();
        if (input) { input.value = def; updateSamples(def || 'Sample'); }
        if (!selectedFont && samples[0]) selectSample(samples[0]);
        setTimeout(() => { input?.focus(); input?.select(); }, 0);
        if (input) input.oninput = () => updateSamples(input.value || '');
      };
      const closeEditor = () => { if (editor) editor.style.display = 'none'; };

      // Render a canvas signature and return a data URL image
      const renderSignature = (name: string, font: string): string => {
        const scale = Math.min(3, Math.max(1.5, (window.devicePixelRatio || 1)));
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d'); if (!ctx) return '';
        const fontSize = 56; // looks like a pen stroke when scaled down
        const padX = 40, padY = 30;
        ctx.font = `${fontSize * scale}px ${font}`;
        const metrics = ctx.measureText(name);
        const w = Math.max(600, Math.ceil(metrics.width + padX * 2 * scale));
        const h = Math.ceil(fontSize * 2.2 * scale + padY * 2 * scale);
        canvas.width = w; canvas.height = h;
        ctx.clearRect(0,0,w,h);
        ctx.fillStyle = '#000';
        ctx.font = `${fontSize * scale}px ${font}`;
        ctx.textBaseline = 'alphabetic';
        ctx.shadowColor = 'rgba(0,0,0,0.06)';
        ctx.shadowBlur = 2 * scale; ctx.shadowOffsetY = 1 * scale;
        ctx.fillText(name, padX * scale, (h - padY * scale));
        return canvas.toDataURL('image/png');
      };

      // Insert/update the signature image overlay and update printed name if present
      const insertSignature = (text: string, font?: string | null) => {
        const display = ensureDisplayArea();
        if (!display) { closeEditor(); return; }
        const img = (display.querySelector('img.signature-overlay') as HTMLImageElement | null) || document.createElement('img');
        img.className = 'signature-overlay';
        const chosenFont = font || "'Snell Roundhand', 'Brush Script MT', cursive";
        img.src = renderSignature(text, chosenFont);
        if (!img.parentElement) display.appendChild(img);
        if (nameSpan) nameSpan.textContent = text;
        // allow user to double-click the signature area to reopen editor
        const host = display.parentElement as HTMLElement | null;
        if (host) {
          host.style.position = 'relative';
          host.addEventListener('dblclick', () => openEditor(text), { once: true });
        }
      };

      const onOpen = () => openEditor(nameSpan?.textContent || '');
      const onApply = () => {
        const txt = (input?.value || '').trim();
        if (!txt) { input?.focus(); return; }
        insertSignature(txt, selectedFont);
        closeEditor();
        // hide the floating button after signing
        const btnWrap = document.getElementById('signature-controls');
        if (btnWrap) btnWrap.style.display = 'none';
      };
      const onCancel = () => closeEditor();

      if (btn) btn.addEventListener('click', onOpen);
      if (applyBtn) applyBtn.addEventListener('click', onApply);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);

      // Cleanup on unmount/HMR
      return () => {
        try {
          if (btn) btn.removeEventListener('click', onOpen);
          if (applyBtn) applyBtn.removeEventListener('click', onApply);
          if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
          samples.forEach(s => s.removeEventListener('click', onSample));
        } catch {}
      };
    })();

    // Ensure the top customer info table does not float with text wrapping to the right
    (function fixTopCustomerTableFloat(){
      const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
      const has = (el: HTMLElement, s: string) => new RegExp(s, 'i').test(el.textContent || '');
      const cust = tables.find(t => has(t, '\\bNAME\\s*:\\b') && has(t, '\\bSTREET\\s*:\\b') && has(t, '\\bCITY\\s*:\\b')) || tables[0];
      if (!cust) return;
      cust.style.float = 'none';
      cust.style.clear = 'both';
      cust.style.display = 'table';
      cust.style.width = '100%';
      const nextEl = cust.nextElementSibling as HTMLElement | null;
      if (nextEl) nextEl.style.clear = 'both';
    })();

    // Windows & Doors: add per-line checkboxes and normalize borders
    (function setupWindowsAndDoors(){
      const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
      const isWndTable = (t: HTMLElement) => /WINDOWS\s*&\s*DOORS/i.test(t.textContent || '');
      const table = tables.find(isWndTable) || null;
  if (!table) return;
      table.classList.add('windows-doors-table');
      // We'll mark this table so later generic passes skip it entirely
      // (global money replacers can otherwise wrap totals with checkboxes)
      // Mark visually empty cells so borders are removed to prevent a thick stacked line look
      const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const cells = Array.from(table.querySelectorAll('td,th')) as HTMLElement[];
      for (const c of cells) {
        const txt = strip(c.innerHTML);
        if (!txt || /^_+$/.test(txt)) c.classList.add('empty-cell');
      }

      // Snapshot values for pricing math
      const w = ((snapshot as any)?.pricing?.windowsAndDoors || {}) as any;
      const rates = { window: 500, door: 900, slider6: 1000, slider8: 1200 };
      const items: {key: string; labelRe: RegExp; amount: number}[] = [
        { key: 'windows', labelRe: /\bWindows\b\s*:/i, amount: (Number(w?.windowsCount||0) * rates.window) },
        { key: 'doors',   labelRe: /\bDoors\b\s*:/i,   amount: (Number(w?.doorsCount||0)   * rates.door) },
        { key: 'slider6', labelRe: /6[’']\s*Slider\s*Doors\s*:/i, amount: (Number(w?.slider6Count||0) * rates.slider6) },
        { key: 'slider8', labelRe: /8[’']\s*Slider\s*Doors\s*:/i, amount: (Number(w?.slider8Count||0) * rates.slider8) },
        { key: 'custom',  labelRe: /\bCustom\b\s*:/i,  amount: (w?.custom ? Number(w?.customPrice||0) : 0) },
      ];

      // Hide static TOTAL row(s) inside W&D and only manage ADDITIONAL INVESTMENT display
      // Hide any row that contains TOTAL + INVESTMENT but not ADDITIONAL (to remove duplicate static total)
      {
        const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        for (const r of rows) {
          const t = (r.textContent || '').toUpperCase();
          if (t.includes('TOTAL') && t.includes('INVESTMENT') && !t.includes('ADDITIONAL')) {
            // Keep the row structure but hide it to avoid layout shifts
            (r as HTMLElement).style.display = 'none';
          }
        }
      }

      // Ensure total placeholder spans on ADDITIONAL INVESTMENT lines only
      const ensureTotalDisplays = () => {
        const cells = (Array.from(table.querySelectorAll('td,th')) as HTMLElement[])
          .filter(el => /ADDITIONAL\s+INVESTMENT\s*:/i.test(el.textContent || ''));
        const spans: HTMLElement[] = [];
        for (const cell of cells) {
          let span = cell.querySelector('.windows-doors-total-amount') as HTMLElement | null;
          if (!span) {
            // Insert after the first '$' if present, else append
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            let target: Text | null = null; let dollarIdx = -1;
            while (walker.nextNode()){
              const tn = walker.currentNode as Text; const t = tn.textContent || '';
              const i = t.indexOf('$'); if (i >= 0){ target = tn; dollarIdx = i; break; }
            }
            span = document.createElement('span');
            span.className = 'windows-doors-total-amount';
            // numeric-only (no $) because we insert right after an existing dollar sign
            span.textContent = fmt(0).replace(/^\s*\$\s*/, '');
            if (target && dollarIdx >= 0){
              const text = target.textContent || '';
              const before = text.slice(0, dollarIdx + 1);
              // Remove any leading numeric token after the $
              let after = text.slice(dollarIdx + 1).replace(/^\s*[0-9][0-9,]*(?:\.[0-9]{2})?\s*/, '');
              const parent = target.parentNode as Node; if (parent){
                parent.insertBefore(document.createTextNode(before), target);
                parent.insertBefore(span, target);
                const afterNode = document.createTextNode(after.replace(/^[ _\u00A0]+/, ' '));
                parent.insertBefore(afterNode, target);
                parent.removeChild(target);
                // Clean up immediate numeric/placeholder runs that may follow to avoid duplicates
                let sib: Node | null = span.nextSibling;
                let steps = 0;
                const isOnlyPlaceholders = (s: string) => /^[_\s\u00A0]+$/.test(s);
                const isOnlyNumberish = (s: string) => /^\s*[0-9][0-9,]*(?:\.[0-9]{2})?\s*$/.test(s);
                while (sib && steps < 8) {
                  if (sib.nodeType === Node.TEXT_NODE) {
                    let s = (sib as Text).textContent || '';
                    // Strip leading number and placeholders
                    s = s.replace(/^\s*[0-9][0-9,]*(?:\.[0-9]{2})?\s*/, '');
                    s = s.replace(/^[_\s\u00A0]+/, ' ');
                    if (s === '' || /^\s+$/.test(s)) { const rm = sib; sib = sib.nextSibling; (rm.parentNode as Node | null)?.removeChild(rm); steps++; continue; }
                    (sib as Text).textContent = s;
                    break;
                  } else if (sib instanceof HTMLElement) {
                    const s = sib.textContent || '';
                    if (isOnlyPlaceholders(s) || isOnlyNumberish(s)) { const rmEl = sib; sib = sib.nextSibling; rmEl.remove(); steps++; continue; }
                    break;
                  }
                  sib = sib.nextSibling; steps++;
                }
              }
            } else {
              cell.appendChild(span);
            }
          }
          if (span) spans.push(span);
        }
        return spans;
      };
      const totalSpans = ensureTotalDisplays();

      // Remove duplicate numeric fragments in the Additional Investment row (keep only the first value after $)
      for (const span of totalSpans) {
        const row = span.closest('tr') as HTMLTableRowElement | null;
        if (!row) continue;
        const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
        for (const cell of cells) {
          if (cell.contains(span)) continue;
          const html0 = cell.innerHTML;
          let html1 = html0;
          // Remove contiguous $ + amount tokens
          html1 = html1.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/g, '');
          // Remove amounts that are split across tags following a '$'
          html1 = html1.replace(/\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g, (seg) => {
            const idx = seg.indexOf('$');
            return idx >= 0 ? seg.slice(0, idx) : '';
          });
          // Remove standalone numeric amounts (e.g., duplicated 3,600.00 without a $)
          html1 = html1.replace(/(^|>)\s*[0-9][0-9,]*(?:\.[0-9]{2})?(?=\s*(<|$))/g, '$1');
          // Collapse placeholder underscores/nbsp runs
          html1 = html1.replace(/[_\s\u00A0]{2,}_*/g, ' ');
          if (html1 !== html0) cell.innerHTML = html1;
        }
      }

      // Attach a checkbox to each present line label with a positive amount
      const attachCheckbox = (re: RegExp, amount: number) => {
        // find the closest element containing the label
        const labelEl = (Array.from(table.querySelectorAll('p,span,b,strong,td,th')) as HTMLElement[]).find(el => re.test(el.textContent || '')) || null;
        if (!labelEl) return null;
        // Determine destination: the cell to the right of the label's cell (or the last cell as fallback)
        const labelCell = labelEl.closest('td,th') as HTMLElement | null;
        const row = labelEl.closest('tr') as HTMLTableRowElement | null;
        let destCell: HTMLElement | null = null;
        if (row && labelCell) {
          const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
          const idx = cells.findIndex(c => c === labelCell);
          if (idx >= 0) destCell = cells[idx + 1] || cells[cells.length - 1] || null;
        }
        destCell = destCell || (labelEl.closest('td,th') as HTMLElement | null) || (labelEl as HTMLElement);
        // Avoid duplicates in destination cell
        const existing = destCell.querySelector('input.proposal-price-checkbox') as HTMLInputElement | null;
        if (existing) return existing;
        // Build pill with price then checkbox and insert into destination cell
        const wrap = document.createElement('label');
        wrap.className = 'price-choice';
        const span = document.createElement('span'); span.textContent = fmt(amount || 0);
        const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'proposal-price-checkbox'; input.setAttribute('data-amount', String(amount));
        wrap.appendChild(span); wrap.appendChild(input);
        destCell.appendChild(wrap);
        return input;
      };

      const added: HTMLInputElement[] = [];
      for (const it of items){
        const cb = attachCheckbox(it.labelRe, it.amount); if (cb) added.push(cb);
      }

      const recalcWnd = () => {
        let subtotal = 0;
        const inputs = Array.from(table.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
        for (const cb of inputs){ if (cb.checked) subtotal += Number(cb.getAttribute('data-amount') || '0'); }
        // Display numeric-only subtotal in ADDITIONAL INVESTMENT cells
        totalSpans.forEach(span => { span.textContent = fmt(subtotal).replace(/^\s*\$\s*/, ''); });
        // Keep section visible; template gating handles unused blocks
        recalc();
      };
  table.addEventListener('change', (e) => {
        const t = e.target as HTMLElement | null; if (!t) return; if (t.closest('input.proposal-price-checkbox')) recalcWnd();
      });
      // Initial compute
      recalcWnd();
    })();

    // After specific sections are prepared, run global wrappers and extras gating last
    (function finalizeGlobalSetup(){
      // Snapshot COLOR: lines to restore later if any enhancer disturbed them
      const protectColorLines = (container: HTMLElement) => {
        const targets = Array.from(container.querySelectorAll('td,th,p,span,div')) as HTMLElement[];
        const leafs = targets.filter(el => {
          const t = (el.textContent || '').toUpperCase();
          if (!/\bCOLOR\s*:/.test(t)) return false;
          return !Array.from(el.querySelectorAll('*')).some(ch => /\bCOLOR\s*:/.test((ch.textContent || '').toUpperCase()));
        });
        const originals = new Map<HTMLElement, string>();
        for (const el of leafs) originals.set(el, el.innerHTML);
        return () => {
          for (const [el, html0] of originals) {
            if (!el.isConnected) continue;
            const t = (el.textContent || '').toUpperCase();
            if (t.trim() === '' || !/\bCOLOR\s*:/.test(t)) el.innerHTML = html0;
          }
        };
      };
      const restoreColorGuards = protectColorLines(root);
      // Ensure Trim photos are present (if any) before any gating that might hide the section
  ensureTrimPhotosFallback(root);
  ensureNorthGateGBBPill(root);
  // Color dropdowns removed
  applyGlobalPriceWrappers(root);
      applyCrossTagPriceWrappers(root);
  hideUnusedExtras(root);
  ensureSectionDividers(root);
  try { restoreColorGuards?.(); } catch {}
      // Remove any pills accidentally injected into the Carpentry clause
      stripCarpCheckboxes(root);
    // Extras border/divider visuals removed per rollback
  // Stabilization retries to survive late DOM swaps during initial render
  const again = () => { ensureTrimPhotosFallback(root); ensureNorthGateGBBPill(root); applyGlobalPriceWrappers(root); applyCrossTagPriceWrappers(root); hideUnusedExtras(root); ensureSectionDividers(root); try { restoreColorGuards?.(); } catch {}; stripCarpCheckboxes(root); };
  setTimeout(again, 0);
  setTimeout(again, 150);
  setTimeout(again, 400);
      // Periodic re-enforcer for first few seconds: if all checkboxes vanish, re-apply
      let ticks = 0;
      const iv = setInterval(() => {
        try {
          const any = root.querySelector('.proposal-price-checkbox');
          if (!any) again();
          if (++ticks >= 24) { clearInterval(iv); }
        } catch { clearInterval(iv); }
      }, 250);
      (cleanupFns || (cleanupFns = [])).push(() => clearInterval(iv));
    })();

    // Guard against late DOM mutations wiping our enhancements: re-apply on subtree changes (throttled)
    (function guardEnhancements(){
      let scheduled = false;
    const run = () => {
        try {
          ensureTrimPhotosFallback(root);
          ensureNorthGateGBBPill(root);
          // Color dropdowns removed
      applyGlobalPriceWrappers(root);
          applyCrossTagPriceWrappers(root);
  hideUnusedExtras(root);
  ensureSectionDividers(root);
    try { /* re-apply COLOR: lines if altered */ } catch {}
    stripCarpCheckboxes(root);
        } finally { scheduled = false; }
      };
      const mo = new MutationObserver(() => {
        if (scheduled) return; scheduled = true;
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => { run(); });
        } else if (typeof queueMicrotask === 'function') {
          queueMicrotask(run);
        } else {
          setTimeout(run, 0);
        }
      });
      mo.observe(root, { childList: true, subtree: true, characterData: true });
      // Clean up on unmount
      (cleanupFns || (cleanupFns = [])).push(() => mo.disconnect());
    })();

  // Helper: format money (use function declaration so it's hoisted)
    function fmt(n: number): string {
      try { return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); } catch { return `$${(Math.round(n*100)/100).toFixed(2)}`; }
    }

  // Removed: Extras divider/border and GBB price-cell-only border helpers per rollback

    // Hoisted helpers used throughout this effect (defined early to avoid TDZ/runtime issues)
    function isGBBContext(el: HTMLElement | null): boolean {
      let node: HTMLElement | null = el;
      let steps = 0;
      while (node && steps < 6) {
        const txt = (node.textContent || '').toUpperCase();
        if (/\bGOOD\b/.test(txt) || /\bBETTER\b/.test(txt) || /\bBEST\b/.test(txt)) return true;
        node = node.parentElement as HTMLElement | null;
        steps++;
      }
      return false;
    }
    function isAsphaltContext(el: HTMLElement | null): boolean {
      let node: HTMLElement | null = el;
      let steps = 0;
      while (node && steps < 8) {
        const txt = (node.textContent || '').toUpperCase();
        if (/ASPHALT|ROOFING|SHINGLE|LANDMARK\b|LANDMARK-?PRO\b|NORTHGATE\b/.test(txt)) return true;
        node = node.parentElement as HTMLElement | null;
        steps++;
      }
      return false;
    }
    function isAsphaltGBBContext(el: HTMLElement | null): boolean {
      return isGBBContext(el) && isAsphaltContext(el);
    }
    function getCellIndex(td: HTMLElement | null): number {
      if (!td) return -1;
      const row = td.closest('tr');
      if (!row) return -1;
      let idx = -1;
      let seen = -1;
      for (const child of Array.from(row.children)) {
        const tag = (child as HTMLElement).tagName;
        if (tag === 'TD' || tag === 'TH') {
          seen++;
          if (child === td) { idx = seen; break; }
        }
      }
      return idx;
    }
    function findGBBHeaderRow(table: HTMLElement | null): HTMLElement | null {
      if (!table) return null;
      const rows = Array.from(table.querySelectorAll('tr')) as HTMLElement[];
      let bestRow: HTMLElement | null = null;
      let bestScore = 0;
      for (const r of rows.slice(0, 6)) {
        const txt = (r.textContent || '').toUpperCase();
        const score = ((/(^|\W)GOOD(\W|$)/.test(txt) ? 1 : 0) + (/(^|\W)BETTER(\W|$)/.test(txt) ? 1 : 0) + (/(^|\W)BEST(\W|$)/.test(txt) ? 1 : 0));
        if (score > bestScore) { bestScore = score; bestRow = r; }
      }
      return bestScore > 0 ? bestRow : null;
    }
    function isGBBPriceCell(el: HTMLElement | null): boolean {
      const td = el ? (el.closest('td') as HTMLElement | null) : null;
      if (!td) return false;
      const table = td.closest('table') as HTMLElement | null;
      const headerRow = findGBBHeaderRow(table);
      if (!headerRow) return false;
      const colIndex = getCellIndex(td);
      if (colIndex < 0) return false;
      const headerCells = Array.from(headerRow.children).filter(c => {
        const t = (c as HTMLElement).tagName; return t === 'TD' || t === 'TH';
      }) as HTMLElement[];
      const hdr = headerCells[colIndex];
      if (!hdr) return false;
      const htxt = (hdr.textContent || '').toUpperCase();
      return /(\bGOOD\b|\bBETTER\b|\bBEST\b)/.test(htxt);
    }
    function isAsphaltGBBPrice(el: HTMLElement | null): boolean {
      if (!isAsphaltContext(el) || !isGBBPriceCell(el)) return false;
      const row = el ? (el.closest('tr') as HTMLElement | null) : null;
      const rtxt = (row?.textContent || '').toUpperCase();
      return /TOTAL/.test(rtxt) && /INVESTMENT/.test(rtxt);
    }
    function uncheckOtherGBB(current: HTMLInputElement) {
      if (!current.checked) return;
      const row = current.closest('tr') as HTMLElement | null;
      if (!row) return;
      const rtxt = (row.textContent || '').toUpperCase();
      if (!(rtxt.includes('TOTAL') && rtxt.includes('INVESTMENT'))) return;
      const inputs = Array.from(row.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
      if (inputs.length < 2) return;
      for (const el of inputs) {
        if (el === current) continue;
        el.checked = false;
      }
    }
    function isDetachedTable(table: HTMLElement | null): boolean {
      if (!table) return false;
      const txt = (table.textContent || '').toUpperCase();
      if (!/DETACHED/.test(txt)) return false;
      if (!/(STRUCTURE|STRUCTURES|GARAGE|BUILDING|SHED|BARN)/.test(txt)) return false;
      return true;
    }
    function uncheckOtherDetached(current: HTMLInputElement) {
      if (!current.checked) return;
      const table = current.closest('table') as HTMLElement | null;
      if (!table || !isDetachedTable(table)) return;
      const all = Array.from(table.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
      const optionCbs = all.filter(cb => {
        const row = cb.closest('tr') as HTMLElement | null;
        const t = (row?.textContent || '').toUpperCase();
        return !(t.includes('TOTAL') && t.includes('INVESTMENT'));
      });
      if (optionCbs.length < 2) return;
      for (const el of optionCbs) {
        if (el === current) continue;
        el.checked = false;
      }
    }

    // Synthetic Siding: handled by setupSectionTotals() with inline-after-label placement; no-op here to avoid double injection
    (function setupSidingTotal(){
      return;
    })();

  // Find all elements containing section total labels and keep only the leaf-most elements
    const allEls = Array.from(root.querySelectorAll('*')) as HTMLElement[];
    const isSkylight = (el: HTMLElement) => /SKYLIGHT/i.test(el.textContent || '');
    // Include Siding total labels as section totals as well
    const totalAnyRe = /TOTAL\s+(?:INVESTMENT|GUTTER\s+INVESTMENT|SIDING\s+INVESTMENT)\s*:/i; // include Gutters & Siding, exclude Skylights
    const rawTotalEls = allEls.filter(el => totalAnyRe.test(el.textContent || '') && !isSkylight(el));
    const totalEls = rawTotalEls.filter(el => {
      // Exclude if any descendant also contains the phrase (keeps the smallest element, e.g., the label td/p)
      const descendants = Array.from(el.querySelectorAll('*')) as HTMLElement[];
      return !descendants.some(ch => totalAnyRe.test(ch.textContent || ''));
    });
    // The final/overall total is the last plain "TOTAL INVESTMENT:" occurrence (not Gutters/Skylights/Siding)
    let finalTotalEl: HTMLElement | null = null;
    const finalCandidates = totalEls.filter(el => /TOTAL\s+INVESTMENT\s*:/i.test(el.textContent || ''));
    if (finalCandidates.length) finalTotalEl = finalCandidates[finalCandidates.length - 1];
    if (finalTotalEl && !finalTotalEl.querySelector('#final-total-investment')) {
      // Replace the underline after the $ with a numeric-only span inline
      const walker = document.createTreeWalker(finalTotalEl, NodeFilter.SHOW_TEXT);
      let target: Text | null = null; let dollarIdx = -1;
      while (walker.nextNode()) {
        const tn = walker.currentNode as Text; const t = tn.textContent || '';
        const i = t.indexOf('$'); if (i >= 0) { target = tn; dollarIdx = i; break; }
      }
      const span = document.createElement('span');
      span.id = 'final-total-investment';
      span.className = 'total-investment-final';
      span.textContent = fmt(0).replace(/^\s*\$\s*/, '');
      if (target && dollarIdx >= 0) {
        const text = target.textContent || '';
        const before = text.slice(0, dollarIdx + 1);
        let after = text.slice(dollarIdx + 1);
        // strip placeholder underscores and any immediate numeric token
        after = after.replace(/^\s*[0-9][0-9,]*(?:\.[0-9]{2})?\s*/, '');
        after = after.replace(/^[_\s\u00A0]+/, ' ');
        const parent = target.parentNode as Node;
        parent.insertBefore(document.createTextNode(before), target);
        parent.insertBefore(span, target);
        parent.insertBefore(document.createTextNode(after), target);
        parent.removeChild(target);
      } else {
        // Fallback: append
        finalTotalEl.appendChild(span);
      }
    }

  // For every section-level total (all but the final overall), add a checkbox next to its price so it can be included in the running total.
    const nonFinalTotals = totalEls.filter(el => el !== finalTotalEl);
    const moneyRe = /(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/;
    let injected: HTMLInputElement[] = [];
  for (const sec of nonFinalTotals) {
      // Skip if already has a checkbox injected
      if (sec.querySelector('input.proposal-price-checkbox')) continue;
      // Skip Trim section total: we'll manage it via `.trim-total-amount` and not a checkbox
      const secTable = sec.closest('table') as HTMLElement | null;
  if (secTable && (secTable as HTMLElement).classList?.contains('trim-work-table')) continue;
      // Prefer replacing text nodes in the same table row (to cover Good/Better/Best columns)
      const rowScope = (sec.closest('tr') as HTMLElement | null) || sec;
      const tw = document.createTreeWalker(rowScope, NodeFilter.SHOW_TEXT, {
        acceptNode(node: Node) {
          const t = node.textContent || '';
          return moneyRe.test(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      } as any);
      while (tw.nextNode()) {
        const tn = tw.currentNode as Text;
    if (tn.parentElement && tn.parentElement.closest('label.price-choice')) continue; // avoid double wrap
        const m = (tn.textContent || '').match(moneyRe);
        if (!m) continue;
        const priceStr = m[1];
        const amount = Number(priceStr.replace(/[^0-9.\-]/g, ''));
        if (!isFinite(amount)) continue;
        // Avoid double-injection if this text node is already inside a choice label
        if ((tn.parentElement && tn.parentElement.closest('label.price-choice'))) continue;
        const idx = (tn.textContent || '').indexOf(priceStr);
        if (idx < 0) continue;
        const before = tn.textContent!.slice(0, idx);
        const after = tn.textContent!.slice(idx + priceStr.length);
  const label = document.createElement('label');
  const gbb = isAsphaltGBBPrice(tn.parentElement as HTMLElement | null);
  label.className = 'price-choice' + (gbb ? ' gbb' : '');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'proposal-price-checkbox';
        input.setAttribute('data-amount', String(amount));
        const priceSpan = document.createElement('span');
        priceSpan.textContent = priceStr;
  // number first, then checkbox (GBB CSS stacks them vertically)
  label.appendChild(priceSpan);
  label.appendChild(input);
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(label);
        if (after) frag.appendChild(document.createTextNode(after));
        tn.parentNode?.replaceChild(frag, tn);
        injected.push(input);
      }
      {
        // Ensure each TOTAL INVESTMENT cell (Good/Better/Best) has its own checkbox.
        const cells = Array.from(rowScope.querySelectorAll('td,th')) as HTMLElement[];
        for (const cell of cells) {
          if ((cell as HTMLElement).closest && (cell as HTMLElement).closest('label.price-choice')) continue;
          if (cell.querySelector('input.proposal-price-checkbox')) continue;
          const gbb2 = isAsphaltGBBPrice(cell);
          const origHtml = cell.innerHTML;
          let changed = false;
          // Try contiguous money pattern first
          if (/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/.test(origHtml)) {
            cell.innerHTML = origHtml.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/g, (m) => {
              const amt = Number(m.replace(/[^0-9.\-]/g, ''));
              const safe = m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              return `<label class=\"price-choice${gbb2 ? ' gbb' : ''}\"><span>${safe}</span><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
            });
            changed = true;
          }
          // If still missing, handle values split across tags (e.g., <b>$</b><span>18,416.00</span>)
          if (!cell.querySelector('input.proposal-price-checkbox')) {
            const htmlSrc = cell.innerHTML;
            const crossTagRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;
            const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');
            const newHtml = htmlSrc.replace(crossTagRe, (seg) => {
              const plain = stripTags(seg);
              const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
              if (!m) return seg;
              const amt = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
              if (!isFinite(amt) || amt <= 0) return seg;
              return `<label class=\"price-choice${gbb2 ? ' gbb' : ''}\">${seg}<input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
            });
            if (newHtml !== htmlSrc) {
              cell.innerHTML = newHtml;
              changed = true;
            }
          }
          if (changed) {
            injected.push(...Array.from(cell.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[]);
          }
        }
      }
    }

  // Build a fast lookup to avoid adding checkboxes within any TOTAL INVESTMENT container during general pass
  const totalContainers = new Set(totalEls);
    // Also add each non-final TOTAL row itself so supplemental passes don’t inject again in that row
    for (const sec of nonFinalTotals) {
      const tr = sec.closest('tr') as HTMLElement | null;
      if (tr) totalContainers.add(tr);
    }

  // Also skip the Carpentry rates section entirely (no checkboxes on those rates)
  // Match both legacy "POSSIBLE EXTRA CARPENTRY" and current "EXTRA CARPENTRY" headings,
  // but restrict the skipped area strictly to the containing table to avoid swallowing other sections.
  const carpEntries = allEls.filter(el => /(POSSIBLE\s+)?EXTRA\s+CARPENTRY/i.test(el.textContent || '')) as HTMLElement[];
  const carpContainers = new Set<HTMLElement>();
  for (const el of carpEntries) {
    const table = el.closest('table') as HTMLElement | null;
    if (table) carpContainers.add(table);
  }
  // Identify the SKYLIGHTS section container (table) for special handling
    const skylightsHeader = allEls.find(el => /\bSKYLIGHTS\b/i.test(el.textContent || '')) as HTMLElement | undefined;
    const skylightsTable = skylightsHeader ? (skylightsHeader.closest('table') as HTMLElement | null) : null;
    const skylightsContainers = new Set<HTMLElement>();
  if (skylightsTable) skylightsContainers.add(skylightsTable);

    const isInAny = (node: Node, set: Set<HTMLElement>) => { 
      let p: Node | null = node.parentNode;
      while (p && p !== root) {
        if (p instanceof HTMLElement && set.has(p)) return true;
        p = p.parentNode;
      }
      return false;
    };
    const elemInAny = (el: Element | null, set: Set<HTMLElement>) => {
      if (!el) return false;
      if (set.has(el as HTMLElement)) return true;
      return isInAny(el, set);
    };

  // Note: We intentionally skip the text-node walker to avoid duplicate injections across nested Word tags;
  // the supplemental per-element passes below handle both contiguous and cross-tag prices safely.

  // Supplemental pass 1: per-element contiguous money replacement for any remaining prices without checkboxes
  {
      const candidates = Array.from(root.querySelectorAll('*')) as HTMLElement[];
      for (const el of candidates) {
    // Skip Windows & Doors table entirely
  if ((el.closest && el.closest('table.windows-doors-table')) || el.matches?.('table.windows-doors-table')) continue;
        // Skip if this element is within an already-injected price label
        if ((el as HTMLElement).closest && (el as HTMLElement).closest('label.price-choice')) continue;
        // Skip if this element or its descendants already contain an injected checkbox
        if (el.querySelector && el.querySelector('input.proposal-price-checkbox')) continue;
  const txt = el.textContent || '';
        if (!moneyRe.test(txt)) continue;
        // Skip TOTAL INVESTMENT containers entirely
  if (/TOTAL\s+INVESTMENT\s*:/i.test(txt)) continue;
  // Skip carpentry clause containers entirely
  if (/(POSSIBLE\s+)?EXTRA\s+CARPENTRY/i.test(txt)) continue;
  if (isIceWaterContext(el)) continue;
        if (elemInAny(el, carpContainers)) continue;
  if (isInCarpentry(el)) continue;
        // Replace money tokens within this element's HTML (price first, then checkbox)
        const gbb4 = isAsphaltGBBPrice(el as HTMLElement | null);
        const orig = el.innerHTML;
  const updated = orig.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)(?!\s*[A-Za-z])/g, (m) => {
          const amt = Number(m.replace(/[^0-9.\-]/g, ''));
          if (!isFinite(amt)) return m;
          const safe = m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<label class="price-choice${gbb4 ? ' gbb' : ''}"><span>${safe}</span><input type="checkbox" class="proposal-price-checkbox" data-amount="${amt}"></label>`;
        });
        if (updated !== orig) el.innerHTML = updated;
      }
      injected = Array.from(root.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
    }

  // Supplemental pass 2: cross-tag matcher for $ split across tags (Word markup)
  {
      const candidates = Array.from(root.querySelectorAll('*')) as HTMLElement[];
  const crossTagRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;
      const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');
      for (const el of candidates) {
    // Skip Windows & Doors table entirely
        if ((el.closest && el.closest('table.windows-doors-table')) || el.matches?.('table.windows-doors-table')) continue;
        // Skip if this element is within an already-injected price label
        if ((el as HTMLElement).closest && (el as HTMLElement).closest('label.price-choice')) continue;
        // Skip if already has a checkbox within
        if (el.querySelector && el.querySelector('input.proposal-price-checkbox')) continue;
  const txt = el.textContent || '';
        if (!/\$/.test(txt) || !/[0-9]/.test(txt)) continue;
  if (/TOTAL\s+INVESTMENT\s*:/i.test(txt)) continue;
  if (/(POSSIBLE\s+)?EXTRA\s+CARPENTRY/i.test(txt)) continue;
        if (isIceWaterContext(el)) continue;
        if (elemInAny(el, carpContainers)) continue; // strictly skip carpentry
  if (isInCarpentry(el)) continue;
        const htmlSrc = el.innerHTML;
        if (!crossTagRe.test(htmlSrc)) continue;
        const gbb5 = isAsphaltGBBPrice(el);
        const newHtml = htmlSrc.replace(crossTagRe, (seg) => {
          const plain = stripTags(seg);
          const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
          if (!m) return seg;
          // Guard: avoid letter-immediately-after-number cases (e.g., "$______ 57 mil")
          const after = plain.slice(plain.indexOf(m[1]) + m[1].length);
          const next = (after.match(/^(?:\s|\u00A0)*([^\s\u00A0])/ )||[])[1] || '';
          if (/^[A-Za-z]/.test(next)) return seg;
          const amt = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
          if (!isFinite(amt)) return seg;
          return `<label class="price-choice${gbb5 ? ' gbb' : ''}">${seg}<input type="checkbox" class="proposal-price-checkbox" data-amount="${amt}"></label>`;
        });
        if (newHtml !== htmlSrc) el.innerHTML = newHtml;
      }
      injected = Array.from(root.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
    }

  let skylightSubtotal = 0;
  // Hoist recalc to avoid TDZ when Windows/Doors runs before this point
    function recalc() {
      let sum = 0;
      // Always read live checkboxes so late-added ones (e.g., Skylights rows) are included
      const inputs = Array.from(root!.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
      // In case of duplicate DOM (shouldn’t happen with guards), de-dupe by identity
      const seen = new Set<HTMLInputElement>();
      for (const el of inputs) {
        if (seen.has(el)) continue; seen.add(el);
        if (el.checked) sum += Number(el.getAttribute('data-amount') || 0);
      }

      // Keep Trim subtotal line synced to checked Trim items
      try {
        const trimTables = Array.from(root!.querySelectorAll('table.trim-work-table')) as HTMLElement[];
        for (const tbl of trimTables) {
          const rows = Array.from(tbl.querySelectorAll('tr')) as HTMLTableRowElement[];
          const totalRow = rows.find(r => /TOTAL\s+INVESTMENT\s*:/i.test(r.textContent || '')) || null;
          const totalCell = totalRow ? (Array.from(totalRow.querySelectorAll('td,th')).slice(-1)[0] as HTMLElement) : null;
          let subtotal = 0;
          const cbs = Array.from(tbl.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
          for (const cb of cbs) {
            if (totalRow && totalRow.contains(cb)) continue;
            if (cb.checked) subtotal += Number(cb.getAttribute('data-amount') || '0');
          }
          if (totalCell) {
            // Ensure display-only span and remove any pill/checkbox in the total row
            Array.from(totalCell.querySelectorAll('label.price-choice, input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());
            let span = totalCell.querySelector('.trim-total-amount') as HTMLElement | null;
            if (!span) {
              span = document.createElement('span');
              span.className = 'trim-total-amount';
              totalCell.appendChild(span);
            }
            span.textContent = fmt(subtotal);
          }
        }
      } catch {}

      // Skylight subtotal is reflected via per-line checkboxes; no extra add here
      const outEl = root!.querySelector('#final-total-investment');
      if (outEl) outEl.textContent = fmt(sum).replace(/^\s*\$\s*/, '');
      totalRef.current = sum;
  // Keep section dividers in sync with visibility/toggles
  try { ensureSectionDividers(root!); } catch {}
    }

      const onToggle = (ev: Event) => {
      const targetEl = ev.target as Element | null;
      const input = targetEl?.closest ? (targetEl.closest('input.proposal-price-checkbox') as HTMLInputElement | null) : null;
      if (!input) return;
  uncheckOtherGBB(input);
  uncheckOtherDetached(input);
      recalc();
    };
  root.addEventListener('change', onToggle);
  root.addEventListener('input', onToggle);
  root.addEventListener('click', onToggle);

      // Mark two-column section tables to normalize the left column width
      (function markTwoColumnSections(){
        const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
        for (const t of tables) {
          const txt = (t.textContent || '').toUpperCase();
          const hasGBB = /(\bGOOD\b|\bBETTER\b|\bBEST\b)/.test(txt);
          if (hasGBB) continue;
          let hasSupplyRow = false;
          const rows = Array.from(t.querySelectorAll('tr')) as HTMLTableRowElement[];
          for (const r of rows) {
            const first = r.querySelector('td,th');
            if (first && /SUPPLY\s+AND\s+INSTALL/i.test(first.textContent || '')) { hasSupplyRow = true; break; }
          }
          if (hasSupplyRow || /\bCHIMNEY\b|\bSKYLIGHTS\b|\bTRIM\b|\bDETACHED\b|\bGUTTERS?\b/.test(txt)) {
            t.classList.add('two-col-section');
          }
        }
      })();

  // Removed: Extras table tagging and border-only-on-checkbox-row behavior per rollback

      // Skylight Qty inputs and subtotal computation
  function setupSkylightQty() {
        const rootEl = root as HTMLElement; // non-null alias for nested closures
        // 1) Ensure the Skylight total amount is shown inline directly after the
        //    label text "TOTAL SKYLIGHT INVESTMENT:" anywhere in the template
        //    (paragraphs, cells, etc.), not just inside a table cell.
        const ensureInlineSkylightTotalSpan = (): HTMLElement | null => {
          const all = Array.from(rootEl.querySelectorAll('*')) as HTMLElement[];
          // Choose the smallest element containing the label (no descendant should also contain it)
          const labelRe = /TOTAL\s+SKYLIGHT\s+INVESTMENT\s*:/i;
          const candidates = all.filter(el => labelRe.test(el.textContent || ''));
          const leafCandidates = candidates.filter(el => !Array.from(el.querySelectorAll('*')).some(ch => labelRe.test(ch.textContent || '')));
          const container = leafCandidates[0] || null;
          if (!container) return null;

          // If a span already exists here, do nothing
          if (container.querySelector('.skylight-total-amount')) return container.querySelector('.skylight-total-amount') as HTMLElement;

          // Insert span directly after the label's trailing colon, with no '$' and no underlining
          const span = document.createElement('span');
          span.className = 'skylight-total-amount';
          // numeric-only
          span.textContent = fmt(0).replace(/^\s*\$\s*/, '');

          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const tn = walker.currentNode as Text;
            const t = tn.textContent || '';
            const m = t.match(labelRe);
            if (!m) continue;
            const idx = t.search(labelRe) + m[0].length; // position after ':'
            const before = t.slice(0, idx);
            const after = t.slice(idx);
            const parent = tn.parentNode as Node;
            const frag = document.createDocumentFragment();
            // Ensure a single space between ':' and value
            const spacer = before.endsWith(' ') ? '' : ' ';
            frag.appendChild(document.createTextNode(before + spacer));
            frag.appendChild(span);
            if (after) frag.appendChild(document.createTextNode(after));
            parent?.replaceChild(frag, tn);

            // Clean up immediate siblings that are only $, [, ], underscores, or nbsp placeholders
            const isOnlyJunk = (s: string) => /^(?:[\s\u00A0_\[\]\$-]+)$/.test(s);
            let sib: Node | null = (span.nextSibling as Node | null);
            let steps = 0;
            while (sib && steps < 8) {
              const next = sib.nextSibling;
              if (sib.nodeType === Node.TEXT_NODE) {
                const txt = (sib as Text).textContent || '';
                // Strip common junk leading chars after label
                const stripped = txt.replace(/^[\s\u00A0]+/, '').replace(/^[\$\[\]_\-–—]+/, '').replace(/^[\s\u00A0]+/, '');
                if (stripped === '') {
                  sib.parentNode?.removeChild(sib);
                  sib = next; steps++; continue;
                }
                (sib as Text).textContent = stripped;
                break;
              }
              if (sib instanceof HTMLElement) {
                const txt = (sib.textContent || '').trim();
                if (isOnlyJunk(txt)) { sib.remove(); sib = next; steps++; continue; }
                // If it is a <u> or has underline style and contains only junk, remove
                const tag = sib.tagName.toLowerCase();
                const style = (sib.getAttribute('style') || '').toLowerCase();
                const under = tag === 'u' || /text-decoration\s*:\s*underline/.test(style);
                if (under && isOnlyJunk(txt)) { sib.remove(); sib = next; steps++; continue; }
                break;
              }
              sib = next; steps++;
            }
            return span;
          }
          // If we couldn't find a text node match (rare), append after label container content
          container.appendChild(document.createTextNode(' '));
          container.appendChild(span);
          return span;
        };
        // Ensure inline location first (if present in the template)
        const inlineAmtSpan = ensureInlineSkylightTotalSpan();
        // If inline exists, guarantee a single '$ ' immediately before it and remove any pill next to the label
        if (inlineAmtSpan) {
          const host = inlineAmtSpan.parentElement as HTMLElement | null;
          const ensureDollarBefore = () => {
            const prev = inlineAmtSpan.previousSibling;
            const prevTxt = prev && prev.nodeType === Node.TEXT_NODE ? (prev as Text).textContent || '' : '';
            if (!/\$\s*$/.test(prevTxt || '')) {
              inlineAmtSpan.parentNode?.insertBefore(document.createTextNode('$ '), inlineAmtSpan);
            }
          };
          ensureDollarBefore();
          // Remove any price pill accidentally placed in the same label container
          const container = inlineAmtSpan.closest('p,td,th,div');
          if (container) {
            const pills = Array.from(container.querySelectorAll('label.price-choice')) as HTMLElement[];
            for (const p of pills) p.remove();
          }
        }
        // Prefer the table that contains the unique total line text
        let table = (Array.from(rootEl.querySelectorAll('table')) as HTMLElement[]).find(t => /TOTAL\s+SKYLIGHT\s+INVESTMENT/i.test(t.textContent || '')) || null;
  if (!table) {
          // Fallback: locate by the SKYLIGHTS header then climb to table
          const skyHeader = Array.from(rootEl.querySelectorAll('*')).find(el => /\bSKYLIGHTS\b/i.test(el.textContent || '')) as HTMLElement | undefined;
          if (!skyHeader) return;
          table = skyHeader.closest('table') as HTMLElement | null;
        }
        if (!table) return;
  // If template lacks a total row AND no inline label location was found,
  // create one at the end with a proper label to ensure visibility.
        let totalRow = (Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[]).find(r => /TOTAL\s+SKYLIGHT\s+INVESTMENT|TOTAL\s+INVESTMENT/i.test(r.textContent || '')) || null;
        const hasInline = !!rootEl.querySelector('.skylight-total-amount');
        if (!totalRow && !hasInline) {
          const tr = document.createElement('tr');
          const tdL = document.createElement('td');
          const tdR = document.createElement('td');
          tdL.innerHTML = '<b><span style="font-size:14pt; font-family: \"Times New Roman\", serif;">TOTAL SKYLIGHT INVESTMENT:</span></b>';
          tdR.innerHTML = '<span class="skylight-total-amount" style="font-weight:700; text-decoration:none;">0.00</span>';
          tr.appendChild(tdL);
          tr.appendChild(tdR);
          // Append into the first tbody when available; else append to table element
          const tbl = table as unknown as HTMLTableElement;
          if (tbl && Array.isArray(tbl.tBodies as any) ? (tbl.tBodies as any).length > 0 : tbl.tBodies && tbl.tBodies.length > 0) {
            (tbl.tBodies[0] as HTMLTableSectionElement).appendChild(tr);
          } else {
            (table as HTMLElement).appendChild(tr);
          }
          totalRow = tr;
        }
        // Helper to parse a price number from a cell that includes a label wrapper we injected earlier
        const parsePrice = (cell: HTMLElement | null): number => {
          if (!cell) return 0;
          // Prefer our label span content
          const label = cell.querySelector('label.price-choice span');
          const txt = (label?.textContent || cell.textContent || '').trim();
          const m = txt.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
          if (!m) return 0;
          const n = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
          return isFinite(n) ? n : 0;
        };
        const ensureQtyInput = (row: HTMLTableRowElement) => {
          const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
          if (cells.length < 2) return null as HTMLInputElement | null;
          const priceCell = cells[1];
          // Look for the "Qty:" segment and replace the underscores with an input
          const qtyMatch = Array.from(priceCell.querySelectorAll('p,span,b,i,u')).find(n => /Qty\s*:/i.test(n.textContent || '')) as HTMLElement | undefined;
          const host = qtyMatch ? ((qtyMatch.closest('p,span,div') as HTMLElement) || (qtyMatch.parentElement as HTMLElement) || priceCell) : priceCell;
          if (host.querySelector('input.skylight-qty')) return host.querySelector('input.skylight-qty') as HTMLInputElement;
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.min = '0';
          inp.step = '1';
          inp.value = '0';
          inp.className = 'skylight-qty';
          inp.style.marginLeft = '8px';
          inp.style.width = '64px';
          // Replace the first run of underscores after Qty: with the input, or just append
          const html0 = host.innerHTML;
          const replaced = html0.replace(/(Qty\s*:\s*)[_\u00A0\s]{2,}/i, (_m, p1) => `${p1}`);
          if (replaced !== html0) {
            host.innerHTML = replaced;
            // Insert the input right after the Qty label node
            const marker = Array.from(host.childNodes).find(n => /Qty\s*:/i.test((n.textContent || ''))) as ChildNode | undefined;
            if (marker && marker.parentNode) marker.parentNode.insertBefore(inp, marker.nextSibling);
            else host.appendChild(inp);
          } else {
            host.appendChild(inp);
          }
          // Cleanup: remove underline/placeholder runs (____, nbsp) immediately after Qty: across tags
          const isPlaceholderNode = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const s = (node as Text).textContent || '';
              return /^[ _\u00A0_]+$/.test(s);
            } else if (node instanceof HTMLElement) {
              const t = (node.textContent || '').replace(/\s+/g, '');
              return /^_+$/.test(t);
            }
            return false;
          };
          // Find the Qty label again to trim immediately following placeholders
          const qtyNode = Array.from(host.childNodes).find(n => /Qty\s*:/i.test(n.textContent || '')) || null;
          let sib = qtyNode ? qtyNode.nextSibling : inp.nextSibling;
          let steps = 0;
          while (sib && steps < 8) {
            const next = sib.nextSibling;
            if (isPlaceholderNode(sib)) {
              sib.parentNode?.removeChild(sib);
              sib = next; steps++; continue;
            }
            // If element contains only placeholders deeper inside, clear them
            if (sib instanceof HTMLElement) {
              const texts = sib.querySelectorAll('*');
              if (!texts.length && /^_+$/.test((sib.textContent || '').replace(/\s+/g, ''))) { sib.remove(); sib = next; steps++; continue; }
            }
            break;
          }
          // (Reverted) Avoid innerHTML sanitization that was too aggressive
          // Store the unit price on the input for math
          const unit = parsePrice(priceCell);
          inp.setAttribute('data-unit', String(unit));
          return inp;
        };
        // Rows are: Fixed (irow:2), Manual (irow:3), Solar (irow:4) in template
        const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        const fixedRow = rows.find(r => /Fixed/i.test(r.textContent || '')) || null;
        const manualRow = rows.find(r => /Manual/i.test(r.textContent || '')) || null;
        const solarRow  = rows.find(r => /Solar/i.test(r.textContent || '')) || null;
        const fixedQty = fixedRow ? ensureQtyInput(fixedRow) : null;
        const manualQty = manualRow ? ensureQtyInput(manualRow) : null;
        const solarQty  = solarRow  ? ensureQtyInput(solarRow)  : null;

  const totalCell = totalRow ? (Array.from(totalRow.querySelectorAll('td,th')).slice(-1)[0] as HTMLElement) : undefined;
  // If we do have a table row, ensure a span there too (the inline span may also exist elsewhere)
        if (totalCell) {

        // Ensure a price placeholder (no checkbox) on the total row, replacing the "$_______" inline
        const ensureTotalDisplay = () => {
          let span = totalCell.querySelector('.skylight-total-amount') as HTMLElement | null;
          if (span) return span;
          const labelRe = /TOTAL\s+SKYLIGHT\s+INVESTMENT/i;
          // Walk text nodes to find the label first, then the first '$' after it
          const walker = document.createTreeWalker(totalCell, NodeFilter.SHOW_TEXT);
          let foundLabel = false;
          let targetText: Text | null = null;
          let dollarIdx = -1;
          while (walker.nextNode()) {
            const tn = walker.currentNode as Text;
            const t = tn.textContent || '';
            if (!foundLabel) {
              if (labelRe.test(t)) {
                foundLabel = true;
                const m = t.indexOf('$', t.search(labelRe));
                if (m >= 0) { targetText = tn; dollarIdx = m; break; }
              }
            } else {
              const m = t.indexOf('$');
              if (m >= 0) { targetText = tn; dollarIdx = m; break; }
            }
          }
          if (targetText && dollarIdx >= 0) {
            // Split the text node at the dollar and insert span immediately after it
            const text = targetText.textContent || '';
            const before = text.slice(0, dollarIdx + 1);
            const after = text.slice(dollarIdx + 1);
            const parent = targetText.parentNode as Node;
            if (parent) {
              const beforeNode = document.createTextNode(before);
              const afterNode = document.createTextNode(after.replace(/^[ _\u00A0]+/, ' '));
              span = document.createElement('span');
              span.className = 'skylight-total-amount';
              // numeric-only (no $) because the '$' is kept in the preceding text node
              span.textContent = fmt(0).replace(/^\s*\$\s*/, '');
              parent.insertBefore(beforeNode, targetText);
              parent.insertBefore(span, targetText);
              parent.insertBefore(afterNode, targetText);
              parent.removeChild(targetText);
              // Clean up immediate underscore runs that may follow due to Word markup
              let sib: Node | null = span.nextSibling;
              let steps = 0;
              while (sib && steps < 6) {
                if (sib.nodeType === Node.TEXT_NODE) {
                  const s = (sib as Text).textContent || '';
                  if (/^[_\s\u00A0]+$/.test(s)) { const rm = sib; sib = sib.nextSibling; rm.parentNode?.removeChild(rm); continue; }
                  (sib as Text).textContent = s.replace(/^[_\s\u00A0]+/, ' ');
                  break;
                } else if (sib instanceof HTMLElement) {
                  const s = sib.textContent || '';
                  if (/^[_\s\u00A0]+$/.test(s)) { const rmEl = sib; sib = sib.nextSibling; rmEl.remove(); continue; }
                  break;
                }
                sib = sib.nextSibling; steps++;
              }
              return span;
            }
          }
          // Fallback: attempt an innerHTML replacement across tags after the '$'
          const html0 = totalCell.innerHTML;
          const html1 = html0.replace(/(TOTAL\s+SKYLIGHT\s+INVESTMENT[\s\S]{0,120}?\$)[\s\S]{0,120}?[_]+/i, (_m, p1) => `${p1}<span class="skylight-total-amount">${fmt(0).replace(/^\s*\$\s*/, '')}</span>`);
          if (html1 !== html0) {
            totalCell.innerHTML = html1;
            span = totalCell.querySelector('.skylight-total-amount') as HTMLElement | null;
            if (span) return span;
          }
          // Last resort: append near the beginning of the totalCell content
          span = document.createElement('span');
          span.className = 'skylight-total-amount';
          span.textContent = fmt(0).replace(/^\s*\$\s*/, '');
          // Prefer inserting after the first '$' we can find anywhere in the cell
          const anyDollar = totalCell.querySelector('*');
          totalCell.appendChild(span);
          return span;
        };
  ensureTotalDisplay();
  // Also remove any pills from the TOTAL row cell to avoid duplicate price badges
  const pills = Array.from(totalCell.querySelectorAll('label.price-choice')) as HTMLElement[];
  for (const p of pills) p.remove();
  }

        // Ensure each skylight line has a checkbox around its price; supports cross-tag markup
        const ensureLineCheckbox = (row: HTMLTableRowElement | null) => {
          if (!row) return null as HTMLInputElement | null;
          const existing = row.querySelector('input.proposal-price-checkbox') as HTMLInputElement | null;
          if (existing) return existing;
          const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
          const priceCell = cells[1];
          if (!priceCell) return null;
          // Try contiguous price replacement first
          const html0 = priceCell.innerHTML;
          let changed = false;
          let html1 = html0.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/, (m) => {
            const amt = Number(m.replace(/[^0-9.\-]/g, ''));
            return `<label class=\"price-choice\"><span>${m}</span><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
          });
          if (html1 !== html0) { priceCell.innerHTML = html1; changed = true; }
          // If still no checkbox, handle $ across tags
          if (!priceCell.querySelector('input.proposal-price-checkbox')) {
            const crossTagRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/;
            const html2 = priceCell.innerHTML;
            if (crossTagRe.test(html2)) {
              const newHtml = html2.replace(crossTagRe, (seg) => {
                // Keep original markup for the price, just append a checkbox
                const plain = seg.replace(/<[^>]*>/g, '');
                const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
                const amt = m ? Number((m[1] || '').replace(/[^0-9.\-]/g, '')) : 0;
                return `<label class=\"price-choice\">${seg}<input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
              });
              if (newHtml !== html2) { priceCell.innerHTML = newHtml; changed = true; }
            }
          }
          return priceCell.querySelector('input.proposal-price-checkbox') as HTMLInputElement | null;
        };

        const recalcSkylights = () => {
          const lineRows = [fixedRow, manualRow, solarRow] as (HTMLTableRowElement | null)[];
          let subtotal = 0;
          for (const row of lineRows) {
            if (!row) continue;
            const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
            const priceCell = cells[1];
            const qtyEl = row.querySelector('input.skylight-qty') as HTMLInputElement | null;
            const unit = qtyEl ? Number(qtyEl.getAttribute('data-unit') || '0') : 0;
            const qty = qtyEl ? Number(qtyEl.value || '0') : 0;
            const lineTotal = unit * qty;
            const cb = row.querySelector('input.proposal-price-checkbox') as HTMLInputElement | null;
            if (cb) cb.setAttribute('data-amount', String(lineTotal));
            if (cb && cb.checked) subtotal += lineTotal;
          }
          // Update all skylight total spans (inline label and any table total cell)
          const amtSpans = Array.from(rootEl.querySelectorAll('.skylight-total-amount')) as HTMLElement[];
          for (const s of amtSpans) s.textContent = fmt(subtotal).replace(/^\s*\$\s*/, '');
          skylightSubtotal = subtotal;
          // Keep Skylights table visible; template gating and placeholder cleanup handle empty state
          recalc();
        };

  // Ensure Fixed, Manual and Solar also have price checkboxes
  if (fixedRow) ensureLineCheckbox(fixedRow);
  if (manualRow) ensureLineCheckbox(manualRow);
  if (solarRow) ensureLineCheckbox(solarRow);
        [fixedQty, manualQty, solarQty].forEach(inp => {
          if (!inp) return;
          inp.addEventListener('input', recalcSkylights);
          inp.addEventListener('change', recalcSkylights);
        });
        // Also recalc when a skylight line checkbox is toggled
        table.addEventListener('change', (e) => {
          const t = e.target as HTMLElement;
          if (t && t.closest('tr') && (t as HTMLInputElement).type === 'checkbox') recalcSkylights();
        });
        recalcSkylights();
      }
      setupSkylightQty();

      // Trim section: per-line checkboxes based on feet × effective rate; hide inactive rows; update section total
      function setupTrimSection() {
        const rootEl = root as HTMLElement;
        // Heuristic: choose the table with multiple rows like (Soffits|Fascias|Frieze|Molding|Rake) + "Feet" and a TOTAL row
        const allTables = Array.from(rootEl.querySelectorAll('table')) as HTMLElement[];
        const tdText = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
        const tableScore = (t: HTMLElement) => {
          const rows = Array.from(t.querySelectorAll('tr')) as HTMLTableRowElement[];
          let lineRowsCount = 0;
          let hasTotal = false;
          for (const r of rows) {
            const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
            if (/(TOTAL\s+INVESTMENT\s*:)/i.test(tdText(r))) hasTotal = true;
            if (cells.length < 2) continue;
            const left = tdText(cells[0]).toUpperCase();
            const right = tdText(cells[1]).toUpperCase();
            // Count likely Trim lines even if the right cell no longer shows "Feet"
            if (/(SOFFIT|SOFFITS|FASCIA|FASCIAS|FRIEZE|MOLDING|RAKE)/.test(left)) lineRowsCount++;
            else if (/FEET/.test(right)) lineRowsCount++;
          }
          return lineRowsCount + (hasTotal ? 1 : 0);
        };
        let table: HTMLElement | null = null;
        let bestScore = 0;
        for (const t of allTables) {
          const s = tableScore(t);
          if (s > bestScore) { bestScore = s; table = t; }
        }
        if (!table || bestScore < 2) {
          // Fallback to header proximity if available
          const hdr = Array.from(rootEl.querySelectorAll('*')).find(el => /\bTRIM\s+WORK\b/i.test(el.textContent || '')) as HTMLElement | undefined;
          table = hdr ? (hdr.closest('table') as HTMLElement | null) : null;
        }
        if (!table) return;

  // Mark this specific table so other passes can target Trim safely
  (table as HTMLElement).classList.add('trim-work-table');

        // Identify Trim rows: any row whose right cell mentions Feet
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        const isFeetRow = (r: HTMLTableRowElement) => {
          const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
          if (cells.length < 2) return false;
          const left = tdText(cells[0]);
          const right = tdText(cells[1]);
          // Treat as a trim line if left matches known parts or right mentions Feet
          return /(SOFFIT|SOFFITS|FASCIA|FASCIAS|FRIEZE|MOLDING|RAKE)/i.test(left) || /\bFeet\b/i.test(right);
        };
        const numFeet = (r: HTMLTableRowElement) => {
          const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
          if (cells.length < 2) return 0;
          const right = tdText(cells[1]);
          const m = right.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*Feet/i);
          if (!m) return 0;
          const n = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
          return isFinite(n) ? n : 0;
        };

        // Locate the TOTAL INVESTMENT cell for Trim
        const totalRow = rows.find(r => /TOTAL\s+INVESTMENT\s*:/i.test(r.textContent || '')) || null;
        const totalCell = totalRow ? (Array.from(totalRow.querySelectorAll('td,th')).slice(-1)[0] as HTMLElement) : null; // take last cell to be safe
        if (!totalCell) return;

        // Remove any injected checkbox on the Trim TOTAL row (within the row, anywhere) to avoid double-counting
        if (totalRow) {
          const labels = Array.from(totalRow.querySelectorAll('label.price-choice')) as HTMLElement[];
          for (const lab of labels) {
            const parent = lab.parentElement as HTMLElement | null;
            const span = lab.querySelector('span');
            if (parent) {
              if (span) parent.insertBefore(span, lab);
              lab.remove();
            } else {
              lab.remove();
            }
          }
          // Also remove any stray inputs that may exist without a label
          Array.from(totalRow.querySelectorAll('input.proposal-price-checkbox')).forEach(el => el.remove());
        }

        // Ensure the Trim total amount shows inline directly after the label text
        const ensureTrimInlineTotalSpan = () => {
          const nodes = Array.from(totalRow!.querySelectorAll('*')) as HTMLElement[];
          const labelRe = /TOTAL\s+INVESTMENT\s*:/i;
          const labelHost =
            nodes.find(el => labelRe.test(el.textContent || '') && !Array.from(el.querySelectorAll('*')).some(ch => labelRe.test(ch.textContent || ''))) ||
            totalRow!;
          // Remove any pill/checkbox in the total row (display-only)
          Array.from(totalRow!.querySelectorAll('label.price-choice,input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());

          let span = totalRow!.querySelector('.trim-total-amount') as HTMLElement | null;
          if (!span) {
            // Insert a numeric-only span immediately after ':' and place a single '$ ' right before it
            const walker = document.createTreeWalker(labelHost, NodeFilter.SHOW_TEXT);
            let target: Text | null = null;
            let insertIdx = -1;
            while (walker.nextNode()) {
              const tn = walker.currentNode as Text;
              const t = tn.textContent || '';
              const m = t.match(labelRe);
              if (m) {
                insertIdx = t.search(labelRe) + m[0].length;
                target = tn; break;
              }
            }
            span = document.createElement('span');
            span.className = 'trim-total-amount';
            span.textContent = fmt(0).replace(/^\s*\$\s*/, '');

            if (target && insertIdx >= 0) {
              const txt = target.textContent || '';
              const before = txt.slice(0, insertIdx);
              const after = txt.slice(insertIdx).replace(/^\s*\$?\s*[_0-9,\.\u00A0-]*/, ' ');
              const parent = target.parentNode as Node;
              const frag = document.createDocumentFragment();
              frag.appendChild(document.createTextNode(before + (before.endsWith(' ') ? '' : ' ') + '$ '));
              frag.appendChild(span);
              if (after) frag.appendChild(document.createTextNode(after));
              parent.replaceChild(frag, target);
            } else {
              // Fallback: append into the first cell
              const host = (Array.from(totalRow!.querySelectorAll('td,th'))[0] as HTMLElement) || labelHost;
              host.appendChild(document.createTextNode(' $ '));
              host.appendChild(span);
            }
          }
          return span!;
        };
        const totalSpan = ensureTrimInlineTotalSpan();

        // Hide placeholder/inactive rows (no numeric feet, zero, or underscores-only)
        const lineRows = rows.filter(r => {
          // Exclude header and total rows
          if (r === totalRow) return false;
          return isFeetRow(r) || /[_]{3,}/.test(tdText(Array.from(r.querySelectorAll('td,th'))[1]));
        });
        let feetSum = 0;
        for (const r of lineRows) {
          const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
          const rightStr = tdText(cells[1] || null);
          const feet = numFeet(r);
          if (!feet || feet <= 0 || /^[_\s\u00A0]+$/.test(rightStr)) {
            r.remove();
          } else {
            feetSum += feet;
          }
        }

        // Additional sweep: remove spacer rows that contain only placeholders in all cells
        const isPlaceholderOnly = (s: string) => /^[_\s\u00A0\-–—]+$/.test(s);
        const allRowsNow = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
        for (const r of allRowsNow) {
          if (r === totalRow) continue;
          if (isFeetRow(r)) continue;
          const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
          if (cells.length === 0) continue;
          const texts = cells.map(c => tdText(c));
          if (texts.every(t => t === '' || isPlaceholderOnly(t))) {
            r.remove();
          }
        }

        // If nothing left, nothing to do
        const activeRows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  const activeFeetRows = activeRows.filter(r => isFeetRow(r));
  // Continue even if none; we'll decide visibility in recalc

        // Determine effective $/ft: prefer live snapshot (material/rates/installMode); fallback to dividing original total
        let effectiveRate = 0;
        try {
          const trim = (snapshot as any)?.pricing?.trim || {};
          const trRates = (trim?.rates || {}) as any;
          const material = trim?.material === 'cedar' ? 'cedar' : 'azek';
          let baseRate = Number(trRates?.[material]) || 0;
          // Fallback default for AZEK when rates are not provided: $19/ft (replace existing)
          if (!(baseRate > 0) && material === 'azek') baseRate = 19;
          const adj = baseRate - (trim?.installMode === 'new' ? 2 : 0);
          if (adj > 0) effectiveRate = adj;
        } catch {}
        if (!(effectiveRate > 0)) {
          const rawTxt = (totalCell.textContent || '').trim();
          const mTot = rawTxt.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
          const origTotal = mTot ? Number((mTot[1] || '').replace(/[^0-9.\-]/g, '')) : 0;
          if (origTotal > 0 && feetSum > 0) effectiveRate = origTotal / feetSum;
        }
        if (!isFinite(effectiveRate) || effectiveRate <= 0) effectiveRate = 0;

        // For each active feet row, append a checkbox that represents feet × effectiveRate
        const ensureRowCheckbox = (r: HTMLTableRowElement) => {
          const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
          if (cells.length < 2) return null as HTMLInputElement | null;
          const right = cells[1];
          if (right.querySelector('input.proposal-price-checkbox')) return right.querySelector('input.proposal-price-checkbox') as HTMLInputElement;
          // Prefer to wrap an existing $ amount (even if split across tags) so the visible number becomes the pill
          const html0 = right.innerHTML;
          const crossTagRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/;
          const plain = (s: string) => s.replace(/<[^>]*>/g, '');
          // Compute per-foot amount if possible; else fall back to parsing the visible amount
          const feetVal = numFeet(r);
          const computed = (feetVal > 0 && effectiveRate > 0) ? (effectiveRate * feetVal) : NaN;
          if (crossTagRe.test(html0)) {
            const newHtml = html0.replace(crossTagRe, (seg) => {
              const m = plain(seg).match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
              const parsed = m ? Number((m[1] || '').replace(/[^0-9.\-]/g, '')) : 0;
              const amt = isFinite(computed) ? computed : parsed;
              return `<label class=\"price-choice\">${seg}<input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
            });
            if (newHtml !== html0) {
              right.innerHTML = newHtml;
              return right.querySelector('input.proposal-price-checkbox') as HTMLInputElement | null;
            }
          }
          // If no visible money to wrap but we can compute, append a pill
          if (isFinite(computed) && computed > 0) {
            const label = document.createElement('label');
            label.className = 'price-choice';
            const span = document.createElement('span'); span.textContent = fmt(computed);
            const input = document.createElement('input');
            input.type = 'checkbox'; input.className = 'proposal-price-checkbox'; input.setAttribute('data-amount', String(computed));
            label.appendChild(span); label.appendChild(input);
            right.appendChild(label);
            return input;
          }
          return null;
        };

        const ensureAll = () => {
          const rowsNow = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
          for (const r of rowsNow) {
            if (r === totalRow) continue;
            ensureRowCheckbox(r);
          }
          // Safety sweep: wrap first visible $ amount in each non-total right cell with a pill if still missing
          for (const r of rowsNow) {
            if (r === totalRow) continue;
            const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
            const right = cells[1];
            if (!right) continue;
            if (right.querySelector('input.proposal-price-checkbox')) continue;
            const html0 = right.innerHTML;
            // Skip if the cell has no money
            if (!/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/.test(html0) && !/\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/.test(html0)) continue;
            // Prefer contiguous first: compute amount, then replace whole cell with a pill if amt > 0
            const m = html0.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
            let amt = m ? Number((m[1] || '').replace(/[^0-9.\-]/g, '')) : NaN;
            if (!isFinite(amt)) {
              // Cross-tag fallback: strip tags and find amount
              const plain = html0.replace(/<[^>]*>/g, '');
              const m2 = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
              amt = m2 ? Number((m2[1] || '').replace(/[^0-9.\-]/g, '')) : NaN;
            }
            if (isFinite(amt) && amt > 0) {
              const wrap = document.createElement('label');
              wrap.className = 'price-choice';
              const span = document.createElement('span'); span.textContent = fmt(amt);
              const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'proposal-price-checkbox'; input.setAttribute('data-amount', String(amt));
              wrap.appendChild(span); wrap.appendChild(input);
              right.innerHTML = '';
              right.appendChild(wrap);
              // Derive visible feet text if possible
              let feetTxt = '';
              const mFeet = html0.replace(/<[^>]*>/g, '').match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*Feet/i);
              if (mFeet) feetTxt = mFeet[0];
              else if (effectiveRate > 0) {
                const f = Math.round(amt / effectiveRate);
                if (isFinite(f) && f > 0) feetTxt = `${f} Feet`;
              }
              if (feetTxt) {
                const feetNote = document.createElement('span');
                feetNote.className = 'trim-feet-note';
                feetNote.textContent = ` ${feetTxt}`;
                right.appendChild(feetNote);
              }
            }
          }
          // Ensure no pill exists in the TOTAL row after the sweep
          if (totalRow) Array.from(totalRow.querySelectorAll('label.price-choice, input.proposal-price-checkbox')).forEach(el => el.remove());

          // Preserve original feet text content in right cells; do not strip to pill-only
          // (intentionally leave existing paragraphs/spans that include "Feet" above the checkbox pills)
        };
        ensureAll();

  const recalcTrim = () => {
          let subtotal = 0;
          const inputs = Array.from(table.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
          for (const cb of inputs) {
            if (cb.checked) subtotal += Number(cb.getAttribute('data-amount') || '0');
          }
          if (totalSpan) totalSpan.textContent = fmt(subtotal).replace(/^\s*\$\s*/, '');
          // Recalc overall grand total too
          // Keep Trim table visible; template gating and placeholder cleanup handle empty state
          recalc();
        };
        table.addEventListener('change', (e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (t.closest('input.proposal-price-checkbox')) recalcTrim();
        });
        // Initial compute
        recalcTrim();
      }
      setupTrimSection();

      // Re-enable TOTAL price pills for specific sections (Siding variants, Decking)
      (function setupSectionTotals(){
        type SectionSpec = {
          sectionRe: RegExp;
          totalLabelRe?: RegExp;
          preferSnapshotAmount?: () => number;
          insertInlineAfterLabel?: boolean; // when true, place pill right after the label text in same cell
        };
        function injectTotalPillForSection(spec: SectionSpec){
          const { sectionRe, totalLabelRe = /TOTAL\s+(?:[A-Z\s]+)?INVESTMENT\s*:/i, preferSnapshotAmount, insertInlineAfterLabel } = spec;
          const tables = Array.from(root!.querySelectorAll('table')) as HTMLElement[];
          const table = tables.find(t => sectionRe.test(t.textContent || '')) || null;
          if (!table) return;
          // Prefer the row that matches the provided label; if missing, fall back to generic "TOTAL INVESTMENT:"
          const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
          const row = (rows.find(r => totalLabelRe.test((r.textContent || ''))) || rows.find(r => /TOTAL\s+INVESTMENT\s*:/i.test((r.textContent || '')))) as HTMLTableRowElement | undefined;
          if (!row) return;
          const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
          const valueCell = cells[cells.length - 1] || cells[1] || cells[0];
          if (!valueCell) return;
          if (row.querySelector('input.proposal-price-checkbox')) return;

          let amt = 0;
          try { if (preferSnapshotAmount) { const n = preferSnapshotAmount(); if (n > 0) amt = n; } } catch {}
          if (!(amt > 0)) {
            const plain = (valueCell.textContent || '').trim();
            const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
            if (m) amt = Number((m[1] || '').replace(/[^0-9.\-]/g, '')) || 0;
          }

          const pill = document.createElement('label'); pill.className = 'price-choice';
          const span = document.createElement('span'); span.textContent = fmt(amt);
          const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'proposal-price-checkbox'; input.setAttribute('data-amount', String(amt));
          pill.appendChild(span); pill.appendChild(input);

          if (insertInlineAfterLabel) {
            // Find the smallest container in the row that holds the label text
            const labelContainers = Array.from(row.querySelectorAll('td,th,p,span,b,strong')) as HTMLElement[];
            const genericRe = /TOTAL\s+INVESTMENT\s*:/i;
            const leaf = labelContainers.find(el => (totalLabelRe.test(el.textContent || '') || genericRe.test(el.textContent || '')) && !Array.from(el.querySelectorAll('*')).some(ch => (totalLabelRe.test(ch.textContent || '') || genericRe.test(ch.textContent || ''))));
            const container = leaf || (cells[0] || row as unknown as HTMLElement);
            // Remove any existing pills in the row to avoid duplicates
            Array.from(row.querySelectorAll('label.price-choice')).forEach(l => l.remove());
            // Insert right after the label's trailing ':'
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            let placed = false;
            while (walker.nextNode()) {
              const tn = walker.currentNode as Text;
              const t = tn.textContent || '';
              const m = (t.match(totalLabelRe) || t.match(genericRe));
              if (!m) continue;
              const idx = t.search(m[0]) + m[0].length;
              const before = t.slice(0, idx);
              const after = t.slice(idx).replace(/^\s*\$?[_0-9,\.\u00A0-]*/, ' ');
              const parent = tn.parentNode as Node;
              const frag = document.createDocumentFragment();
              frag.appendChild(document.createTextNode(before + (before.endsWith(' ') ? '' : ' ')));
              frag.appendChild(pill);
              if (after) frag.appendChild(document.createTextNode(after));
              parent.replaceChild(frag, tn);
              placed = true;
              break;
            }
            if (!placed) {
              // Fallback: append into the label container
              container.appendChild(document.createTextNode(' '));
              container.appendChild(pill);
            }
            // Ensure pill isn't underlined by surrounding markup
            breakUnderlineForPill(pill);
            // NEW: strip placeholder runs left around the pill
            removePlaceholderJunkAround(pill);
            // Clean any stray price in the value cell to avoid double display
            if (valueCell && valueCell !== container) {
              const html0 = valueCell.innerHTML;
              const crossTagRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;
              const html1 = html0.replace(crossTagRe, '').replace(/(\$\s*)?[0-9][0-9,]*(?:\.[0-9]{2})?/g, '').replace(/\s*\$\s*/g, ' ');
              if (html1 !== html0) valueCell.innerHTML = html1;
            }
          } else {
            const html0 = valueCell.innerHTML;
            const crossTagRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/;
            valueCell.innerHTML = crossTagRe.test(html0) ? html0.replace(crossTagRe, '') : '';
            valueCell.innerHTML = valueCell.innerHTML.replace(/\s*\$\s*/g, ' ');
            valueCell.appendChild(pill);
            // If value cell is underlined, move pill out to avoid underline
            breakUnderlineForPill(pill);
            // NEW: strip placeholder runs left around the pill
            removePlaceholderJunkAround(pill);
          }
        }

        const prim = ((snapshot as any)?.computed?.primaryTotals || {}) as any;
        const getNum = (v: any) => { const n = Number(v || 0); return isFinite(n) ? n : 0; };
    const sections: SectionSpec[] = [
          {
      sectionRe: /\bSYNTHETIC\b[\s\S]*\bSIDING\b/i,
      // Broaden to match either "TOTAL SYNTHETIC SIDING INVESTMENT:" or just "TOTAL INVESTMENT:"
      totalLabelRe: /TOTAL\s+(?:SYNTHETIC\s+SIDING\s+)?INVESTMENT\s*:/i,
            preferSnapshotAmount: () => getNum(prim.siding),
            insertInlineAfterLabel: true,
          },
          {
            sectionRe: /\bCEDAR\b[\s\S]*\bSHAKE\b[\s\S]*\bSIDING\b/i,
            totalLabelRe: /TOTAL\s+(?:CEDAR\s+SHAKE\s+)?SIDING\s+INVESTMENT\s*:/i,
            preferSnapshotAmount: () => getNum(prim.sidingCedar || prim.cedarSiding),
          },
          {
            sectionRe: /\bCLAP(?:\s*BOARD|BOARD)?\b[\s\S]*\bSIDING\b/i,
            totalLabelRe: /TOTAL\s+(?:CLAP\s*BOARD\s+)?SIDING\s+INVESTMENT\s*:/i,
            preferSnapshotAmount: () => getNum(prim.sidingClap || prim.clapboardSiding),
          },
          {
            sectionRe: /\bVINYL\b[\s\S]*\bSIDING\b/i,
            totalLabelRe: /TOTAL\s+(?:VINYL\s+)?SIDING\s+INVESTMENT\s*:/i,
            preferSnapshotAmount: () => getNum(prim.sidingVinyl || prim.vinylSiding),
          },
          {
            sectionRe: /\bDECKING\b/i,
            totalLabelRe: /TOTAL\s+(?:DECKING\s+)?INVESTMENT\s*:/i,
            preferSnapshotAmount: () => getNum(prim.decking || prim.deck),
          },
        ];
        sections.forEach(injectTotalPillForSection);

        // Final sweep – for any TOTAL INVESTMENT row, remove placeholder junk around pills
        try {
          const pills = Array.from(root.querySelectorAll('label.price-choice')) as HTMLElement[];
          for (const lab of pills) {
            const row = lab.closest('tr') as HTMLElement | null;
            const scopeTxt = ((row || lab.parentElement)?.textContent || '').toUpperCase();
            if (scopeTxt.includes('TOTAL') && scopeTxt.includes('INVESTMENT')) {
              removePlaceholderJunkAround(lab);
            }
          }
        } catch {}
      })();

    // Photos are rendered by template loops ({#photos_*}{%image}{/...}) using renderer data; no client injection.

  // Last-resort global injection: wrap any visible $amount with a checkbox pill, skipping TOTAL lines
    // and already-processed regions. This guarantees checkboxes show up across sections.
    (function ensureGlobalMoneyCheckboxes(){
      try {
  const elements = Array.from(root.querySelectorAll('td,th,p,div,span')) as HTMLElement[];
  const moneyCrossTag = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;
        const isTotalLabel = (s: string) => /TOTAL\s+(?:INVESTMENT|GUTTER\s+INVESTMENT|SIDING\s+INVESTMENT|SKYLIGHT\s+INVESTMENT)\s*:/i.test(s);
        for (const el of elements) {
          // Skip if inside a price-choice already or inside Windows & Doors (handled earlier)
          if (el.closest('label.price-choice')) continue;
          if (el.closest('table.windows-doors-table')) continue;
          if (el.querySelector('input.proposal-price-checkbox')) continue;
          const txt = el.textContent || '';
          if (!(/\$/.test(txt) && /[0-9]/.test(txt))) continue;
          if (isTotalLabel(txt)) continue;
      if (isInCarpentry(el)) continue;
      if (isIceWaterContext(el)) continue;
          const html0 = el.innerHTML;
          let changed = false;
          // First, contiguous $123 pattern
          let html1 = html0.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)(?!\s*[A-Za-z])/g, (m) => {
            const amt = Number(m.replace(/[^0-9.\-]/g, ''));
            if (!isFinite(amt)) return m;
            const safe = m.replace(/&/g, '&amp;').replace(/</g, '&gt;').replace(/>/g, '&lt;');
            changed = true;
            return `<label class=\"price-choice\"><span>${safe}</span><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
          });
          // If still nothing, attempt cross-tag replacement preserving original markup for the price
          if (html1 === html0 && moneyCrossTag.test(html0)) {
            html1 = html0.replace(moneyCrossTag, (seg) => {
              const plain = seg.replace(/<[^>]*>/g, '');
              const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
              if (m) {
                const after = plain.slice(plain.indexOf(m[1]) + m[1].length);
                const next = (after.match(/^(?:\s|\u00A0)*([^\s\u00A0])/)||[])[1] || '';
                if (/^[A-Za-z]/.test(next)) return seg; // unit text follows, not a price
              }
              if (!m) return seg;
              const amt = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
              if (!isFinite(amt)) return seg;
              changed = true;
              return `<label class=\"price-choice\">${seg}<input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
            });
          }
          if (changed && html1 !== html0) el.innerHTML = html1;
        }
      } catch {}
    })();

    // Cleanup pass: strip any price pills inside the Carpentry clause entirely (leave plain prices, no checkboxes)
    function stripCarpCheckboxes(container: HTMLElement) {
      try {
        const targets = Array.from(container.querySelectorAll('label.price-choice')) as HTMLElement[];
        for (const lab of targets) {
          const host = lab.closest('span,td,th,p,div') as HTMLElement | null;
          if (!host) continue;
          if (!isInCarpentry(host)) continue;
          // Build a replacement span that preserves original price markup but removes inputs
          const repl = document.createElement('span');
          repl.innerHTML = lab.innerHTML;
          const inputs = Array.from(repl.querySelectorAll('input'));
          inputs.forEach(i => i.remove());
          // If nothing left (unlikely), fallback to text content
          if (!repl.innerHTML.trim()) repl.textContent = (lab.textContent || '').replace(/\s*\b\s*$/, '');
          lab.replaceWith(repl);
        }
      } catch {}
    }

    // Initial calc after all injections
    recalc();

    // Safety: ensure Trim TOTAL row has no checkbox and shows only the running subtotal span
    (function cleanupTrimTotalCheckbox(){
      try {
        const tables = Array.from(root.querySelectorAll('table.trim-work-table')) as HTMLElement[];
        for (const t of tables) {
          const rows = Array.from(t.querySelectorAll('tr')) as HTMLTableRowElement[];
          const totalRow = rows.find(r => /TOTAL\s+INVESTMENT\s*:/i.test(r.textContent || '')) || null;
          if (!totalRow) continue;
          // Remove any price-choice wrappers/inputs in the total row
          Array.from(totalRow.querySelectorAll('label.price-choice')).forEach((lab: Element) => {
            const parent = (lab as HTMLElement).parentElement;
            const span = (lab as HTMLElement).querySelector('span');
            if (parent) {
              if (span) parent.insertBefore(span, lab);
              (lab as HTMLElement).remove();
            }
          });
          Array.from(totalRow.querySelectorAll('input.proposal-price-checkbox')).forEach((inp: Element) => (inp as HTMLElement).remove());
        }
      } catch {}
    })();

    // Fallback: if no checkboxes were injected at all (unexpected), perform a simple pass that wraps
    // any $number token across the document once, so users still see choices.
    (function ensureCheckboxesFallback(){
      try {
        const hasAny = !!root.querySelector('input.proposal-price-checkbox');
        if (hasAny) return;
        const moneyRe = /(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/g;
        const candidates = Array.from(root.querySelectorAll('*')) as HTMLElement[];
        for (const el of candidates) {
          if (el.closest('label.price-choice')) continue;
          if (/(TOTAL\s+INVESTMENT\s*:)/i.test(el.textContent || '')) continue;
          const html0 = el.innerHTML;
          const html1 = html0.replace(moneyRe, (m) => {
            const amt = Number(m.replace(/[^0-9.\-]/g, ''));
            if (!isFinite(amt)) return m;
            const safe = m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<label class="price-choice"><span>${safe}</span><input type="checkbox" class="proposal-price-checkbox" data-amount="${amt}"></label>`;
          });
          if (html1 !== html0) el.innerHTML = html1;
        }
      } catch {}
    })();

    // Hide Extras tables that are not selected in the snapshot (prevents unused blocks from showing)
    (function hideUnselectedExtras(){
      try {
        const pricing: any = (snapshot as any)?.pricing || {};
        const flags = {
          plywood: !!pricing?.plywood?.selected,
          chimney: !!pricing?.chimney?.selected,
          skylights: !!pricing?.skylights?.selected,
          trim: !!pricing?.trim?.selected,
          gutters: !!pricing?.gutters?.selected,
          detached: !!pricing?.detached?.selected,
          custom: !!pricing?.customAdd?.selected,
        } as const;
        const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
        const getShortTexts = (el: HTMLElement) => {
          const nodes = Array.from(el.querySelectorAll('th, b, strong, h1, h2, h3, h4, h5, h6, p, span')) as HTMLElement[];
          const out: string[] = [];
          for (const n of nodes) {
            const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (!t) continue;
            if (t.length <= 40) out.push(t.toUpperCase());
          }
          return out;
        };
        const hasHeading = (tbl: HTMLElement, re: RegExp) => {
          const texts = getShortTexts(tbl);
          return texts.some(t => re.test(t));
        };
        const hideIfHeading = (key: keyof typeof flags, re: RegExp) => {
          if (flags[key]) return; // keep if selected
          for (const t of tables) {
            if (hasHeading(t, re)) {
              (t as HTMLElement).style.display = 'none';
            }
          }
        };
        hideIfHeading('plywood', /^(PLYWOOD|PLYWOOD\s+RATES?)$/);
        hideIfHeading('chimney', /^CHIMNEY(\s+WORK)?$/);
        hideIfHeading('skylights', /^SKYLIGHTS?$/);
        hideIfHeading('trim', /^(TRIM|TRIM\s+WORK)$/);
        hideIfHeading('gutters', /^GUTTERS?$/);
        hideIfHeading('detached', /^DETACHED(\s+STRUCTURES?)?$/);
        hideIfHeading('custom', /^CUSTOM(\s+ADD(ITION)?S?)?$/);
      } catch {}
    })();

    // Final cleanup: remove tables that are entirely placeholders and headings
  (function removeEmptyPlaceholderTables(){
      const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
      const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const onlyPlaceholders = (s: string) => s === '' || /^[_\s\u00A0\-–—]+$/.test(s);
      const isProtectedLegalTable = (tbl: HTMLElement) => {
        const txt = (tbl.textContent || '').toUpperCase();
        return /(RIGHT\s+TO\s+CANCEL|PAYMENT\s+SCHEDULE|NON[-\s]?PAYMENT|INFLATION|NON[-\s]?COMPLIANT|DATE\s+OF\s+ACCEPTANCE|ACCEPTED\s+BY|SUBMITTED\s+BY)/.test(txt);
      };
      for (const t of tables) {
        // If any interactive element exists, keep the table
        if (t.querySelector('input.proposal-price-checkbox, input.skylight-qty')) continue;
        // Never remove legal/acceptance tables even if they look empty
        if (isProtectedLegalTable(t)) continue;
    // NEW: Never remove a table that contains a COLOR: label (asphalt description protection)
    if (/\bCOLOR\s*:/i.test(t.textContent || '')) continue;
        const rows = Array.from(t.querySelectorAll('tr')) as HTMLTableRowElement[];
        if (rows.length === 0) continue;
        let hasMeaningfulHeading = false;
        let allPlaceholderBody = true;
        for (const r of rows) {
          const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
          if (cells.length === 0) continue;
          const joined = cells.map(c => text(c)).join(' ').trim();
          const isHeading = cells.some(c => c.tagName === 'TH') || /^(WINDOWS\s*&\s*DOORS|SKYLIGHTS|TRIM|DETACHED|GUTTERS?)/i.test(joined);
          if (isHeading && !onlyPlaceholders(joined)) hasMeaningfulHeading = true;
          if (!onlyPlaceholders(joined)) allPlaceholderBody = false;
        }
        if (!hasMeaningfulHeading && allPlaceholderBody) t.remove();
      }
    })();

    // Remove black placeholder boxes (Word artifacts) with no meaningful text
    (function removeBlackBoxes(){
      const els = Array.from(root.querySelectorAll('*')) as HTMLElement[];
      const isPlaceTxt = (s: string) => s === '' || /^[_\s\u00A0]+$/.test(s);
      for (const el of els) {
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!isPlaceTxt(txt)) continue;
        const style = (el.getAttribute('style') || '').toLowerCase();
        if (!style) continue;
        const hasBlackBg = /background(-color)?:\s*(black|#000|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/.test(style);
        const hasBlackBorder = /border[^:]*:\s*[^;]*\bblack\b/.test(style);
        const tinyHeight = /height:\s*(0(\.\d+)?(pt|px)|1(\.0)?pt|1px)/.test(style);
        if (hasBlackBg || (hasBlackBorder && tinyHeight)) {
          el.remove();
        }
      }
      // Remove empty paragraphs left behind
      const paras = Array.from(root.querySelectorAll('p')) as HTMLElement[];
      for (const p of paras) {
        const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^[_\s\u00A0]*$/.test(t) && !p.querySelector('*')) p.remove();
      }
    })();

    // Cleanup for HMR / unmount
  return () => {
      try {
        root.removeEventListener('change', onToggle);
        root.removeEventListener('input', onToggle);
        root.removeEventListener('click', onToggle);
        // Remove the style tag we injected at the top if still present
        if (style && style.parentNode) style.parentNode.removeChild(style);
    // Run any registered cleanup fns
    if (cleanupFns) { for (const fn of cleanupFns) { try { fn(); } catch {} } }
      } catch {}
    };
  }, [html, snapshot]);

  // Auto-populate name/email from snapshot and keep the "under the line" homeowner name in sync
  useEffect(() => {
    try {
      const cust = (snapshot as any)?.customer || {};
      // On first load, if fields are empty, seed them
      setName((prev) => (prev ? prev : (cust.name || "")));
      setEmail((prev) => (prev ? prev : (cust.email || "")));
    } catch {}
  }, [snapshot]);

  // Reflect the bottom input name into the template's homeowner name under the signature line
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const span = root.querySelector('#customer-signature-name') as HTMLElement | null;
    if (span) span.textContent = name || (span.textContent || "");
  }, [name]);

  // Observe typed signature presence in the template to enable submission
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const host = root.querySelector('#customer-signature-display') as HTMLElement | null;
    if (!host) return;
    const check = () => {
      const el = host.querySelector('.e-signature') as HTMLElement | null;
      const ok = !!(el && (el.textContent || '').trim().length > 0);
      setHasTypedSig(ok);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(host, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [html]);

  // Capture the typed signature text as a simple PNG for persistence
  function captureTypedSignatureDataUrl(): string | null {
    const root = containerRef.current;
    if (!root) return null;
    const sigEl = root.querySelector('#customer-signature-display .e-signature') as HTMLElement | null;
    if (!sigEl) return null;
    const text = (sigEl.textContent || '').trim();
    if (!text) return null;
    // Get computed font to approximate the preview
    const cs = window.getComputedStyle(sigEl);
    const fontFamily = cs.fontFamily || 'Apple Chancery, Snell Roundhand, Bradley Hand, Zapfino, cursive';
    // Render on an offscreen canvas
    const paddingX = 24; const paddingY = 16;
    const baseSize = 46; // pt-ish size approximation
    const scale = 2; // retina-ish scale for crispness
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.font = `${baseSize}px ${fontFamily}`;
    // Measure text to size canvas
    const metrics = ctx.measureText(text);
    const width = Math.ceil(metrics.width + paddingX * 2);
    const height = Math.ceil(baseSize + paddingY * 2);
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return null;
    ctx2.scale(scale, scale);
    // white background for compatibility
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, width, height);
    ctx2.fillStyle = '#111111';
    ctx2.font = `${baseSize}px ${fontFamily}`;
    ctx2.textBaseline = 'top';
    ctx2.fillText(text, paddingX, paddingY);
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  // Minimal helpers preserved for recompute if needed by downstream logic
  function num(v: any) {
    const n = Number(typeof v === "string" ? v.replace(/[^\d.-]/g, "") : v);
    return isFinite(n) ? n : 0;
  }
  function round2(n: number) { return Math.round(n * 100) / 100; }
  function computePlywoodTotal(squares: any, rate: any) { return round2(num(squares) * num(rate)); }
  function recomputeTotals(next: any) {
    try {
      const prim = Object.values((next.computed && next.computed.primaryTotals) || {}).reduce((a: number, b: any) => a + num(b), 0);
      const extras = 0;
      next.computed = next.computed || {};
      next.computed.extrasTotal = extras;
      next.computed.grandTotal = round2(prim + extras);
    } catch {}
  }
  function updateSnapshot(mut: (draft: any) => void) {
    setSnapshot((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      mut(next);
      recomputeTotals(next);
      return next;
    });
  }

  const submit = async () => {
    if (!name) return alert('Please enter your legal name');
    const dataUrl = captureTypedSignatureDataUrl();
    if (!dataUrl) return alert('Please click "Add Signature", type your name, and Apply');
    try {
      const res = await fetch(`/api/proposals/public/${encodeURIComponent(id)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, signatureDataUrl: dataUrl, snapshot }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Signed");
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Failed to sign");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  if (err) return <div className="min-h-screen flex items-center justify-center text-rose-600">{err}</div>;

  return (
    <div className="proposal-doc min-h-screen bg-white">
  {/* Using the template's own styles; no overrides injected here */}
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow p-4">
          {html ? <div ref={containerRef} className="proposal-html" /> : <div className="text-sm text-slate-500">Loading template…</div>}

          {proposal?.signedAt ? (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              Already signed by {proposal.signerName || "(name not provided)"} on {new Date(proposal.signedAt).toLocaleString()}.
            </div>
          ) : (
            <div className="mt-4">
              <div className="text-sm text-slate-700 mb-2">
                Type your name below. Then click &quot;Add Signature&quot; above your name line in the document, choose a cursive style, and Apply.
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  className="border rounded px-2 py-1 text-sm flex-1"
                  placeholder="Legal Homeowners name"
                  value={name}
                  onChange={(e)=>setName(e.target.value)}
                />
                <input
                  className="border rounded px-2 py-1 text-sm flex-1"
                  placeholder="Email (optional)"
                  value={email}
                  onChange={(e)=>setEmail(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button className="px-3 py-1 rounded bg-slate-900 text-white" onClick={submit} disabled={!name || !hasTypedSig}>I Agree & Sign</button>
              </div>
              <div className="text-xs text-slate-500 mt-2">By clicking &quot;I Agree &amp; Sign&quot;, you agree to the proposal terms and authorize HyTech to proceed.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
