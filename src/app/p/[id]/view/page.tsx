"use client";
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { mapSnapshotToWeb } from "@/templates/hytech/field-map";
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
  // Signature modal state
  const [sigOpen, setSigOpen] = useState(false);
  const [sigName, setSigName] = useState("");
  const [sigFont, setSigFont] = useState<string>("'Snell Roundhand', 'Brush Script MT', cursive");

  // Fetch public proposal by token id
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/proposals/public/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setProposal(data);
        setSnapshot(data?.snapshot || {});
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load");
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

  // No DOM manipulation; render template as-is; container for enhancements
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedHtmlRef = useRef<string>("");
  const totalRef = useRef<number>(0);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  // Helper: ensure a display overlay div exists in the signature cell
  const ensureSignatureDisplay = (): { host: HTMLElement | null; display: HTMLElement | null } => {
    const root = containerRef.current as HTMLElement | null;
    if (!root) return { host: null, display: null };
    let display = root.querySelector('#customer-signature-display') as HTMLElement | null;
    let host: HTMLElement | null = display ? (display.parentElement as HTMLElement | null) : null;
    if (!display) {
      // Find a likely signature table/cell
      const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
      const isSigTable = (tbl: HTMLElement) => /\b(SIGNATURE|SIGNED\s+BY|OWNER\s+SIGNATURE|CUSTOMER\s+SIGNATURE)\b/i.test(tbl.textContent || '');
      const tbl = tables.find(isSigTable) || null;
      const candidate = tbl ? (Array.from(tbl.querySelectorAll('td,th')).find(c => /\b(SIGNATURE|SIGNED\s+BY|OWNER\s+SIGNATURE|CUSTOMER\s+SIGNATURE)\b/i.test(c.textContent || '')) as HTMLElement | undefined) : undefined;
      host = (candidate as HTMLElement | undefined) || (tbl?.querySelector('td,th') as HTMLElement | null) || null;
      if (host) {
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        display = document.createElement('div');
        display.id = 'customer-signature-display';
        display.style.position = 'absolute';
        display.style.left = '0'; display.style.top = '0'; display.style.right = '0'; display.style.bottom = '0';
        display.style.pointerEvents = 'none';
        host.appendChild(display);
      }
    }
    return { host, display };
  };

  // Helper: find the "Accepted by" area and ensure a non-intrusive overlay container
  const ensureAcceptedSigOverlay = (): { host: HTMLElement | null; overlay: HTMLElement | null; leftPx: number } => {
    const root = containerRef.current as HTMLElement | null;
    if (!root) return { host: null, overlay: null, leftPx: 0 };
    // Find the smallest element containing "Accepted by"
    const all = Array.from(root.querySelectorAll('td,th,p,span,div,b,strong,u,i,em')) as HTMLElement[];
    const re = /\bACCEPTED\s+BY\b/i;
    const cands = all.filter(el => re.test(el.textContent || ''));
    const leafs = cands.filter(el => !Array.from(el.querySelectorAll('*')).some(ch => re.test((ch as HTMLElement).textContent || '')));
    const target = leafs[0] || cands[0] || null;
    if (!target) return { host: null, overlay: null, leftPx: 0 };
    const host = (target.closest('td,th') as HTMLElement | null) || target;
    if (getComputedStyle(host).position === 'static') { host.style.position = 'relative'; }
    let overlay = host.querySelector('#accepted-signature-overlay') as HTMLElement | null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'accepted-signature-overlay';
      overlay.style.position = 'absolute';
      overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
      overlay.style.pointerEvents = 'none';
      host.appendChild(overlay);
    }
    // Estimate the width of the "Accepted by" label to place signature just after it
    let leftPx = 140; // sensible fallback
    try {
      const text = (target.textContent || '').toString();
      const m = text.match(/ACCEPTED\s+BY/i);
      const label = m ? m[0] : 'Accepted by';
      const cs = getComputedStyle(target);
      const size = parseFloat(cs.fontSize || '16');
      const fam = cs.fontFamily || 'serif';
      const weight = cs.fontWeight && /\d+/.test(cs.fontWeight) ? cs.fontWeight : '400';
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${weight} ${size}px ${fam}`;
        const w = Math.ceil(ctx.measureText(label).width);
        leftPx = Math.max(80, Math.min(w + 16, Math.max(80, (host.clientWidth || 600) - 260)));
      }
    } catch {}
    return { host, overlay, leftPx };
  };

  // React signature renderer (canvas to PNG)
  const renderSignaturePng = (text: string, font: string): string => {
    const scale = Math.min(3, Math.max(1.5, (window.devicePixelRatio || 1)));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d'); if (!ctx) return '';
  const fontSize = 84;
    const padX = 40, padY = 30;
    ctx.font = `${fontSize * scale}px ${font}`;
    const metrics = ctx.measureText(text);
    const w = Math.max(600, Math.ceil(metrics.width + padX * 2 * scale));
    const h = Math.ceil(fontSize * 2.2 * scale + padY * 2 * scale);
    canvas.width = w; canvas.height = h;
    const ctx2 = canvas.getContext('2d'); if (!ctx2) return '';
    ctx2.fillStyle = '#000';
    ctx2.font = `${fontSize * scale}px ${font}`;
    ctx2.textBaseline = 'alphabetic';
    ctx2.shadowColor = 'rgba(0,0,0,0.06)'; ctx2.shadowBlur = 2 * scale; ctx2.shadowOffsetY = 1 * scale;
    ctx2.fillText(text, padX * scale, (h - padY * scale));
    try { return canvas.toDataURL('image/png'); } catch { return ''; }
  };

  // Insert or update the acceptance date immediately after the "DATE OF ACCEPTANCE:" label
  function stampAcceptanceDate() {
    try {
      const root = containerRef.current as HTMLElement | null;
      if (!root) return false;
      const format = (d: Date) => {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      };
      const today = format(new Date());
      const re = /DATE\s+OF\s+ACCEPTANCE\s*:/i;
      const nodes = Array.from(root.querySelectorAll('span,td,th,p,div,b,strong,u,i,em')) as HTMLElement[];
      const cands = nodes.filter(el => re.test(el.textContent || ''));
      if (!cands.length) return false;
      // Choose the leaf-most container: contains label but none of its descendants contain it
      const leafs = cands.filter(el => !Array.from(el.querySelectorAll('*')).some(ch => re.test((ch as HTMLElement).textContent || '')));
      const target = leafs[0] || cands[0];
      if (!target) return false;
      // Reuse existing span if present
      let span = target.querySelector('.acceptance-date') as HTMLElement | null;
      if (!span) {
        span = document.createElement('span');
        span.className = 'acceptance-date';
        // Large italic text as requested
        span.style.fontStyle = 'italic';
        span.style.fontSize = '18pt';
      }
      span.textContent = today;
      // Insert right after the label text node (after the colon)
      let inserted = false;
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const tn = walker.currentNode as Text;
        const txt = tn.textContent || '';
        const m = txt.match(re);
        if (!m) continue;
        const idx = txt.search(re) + m[0].length; // after the label
        const before = txt.slice(0, idx);
        const after = txt.slice(idx).replace(/^\s+/, ' ');
        const parent = tn.parentNode as Node;
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode(before));
        frag.appendChild(document.createTextNode(' '));
        frag.appendChild(span);
        if (after) frag.appendChild(document.createTextNode(after));
        parent.replaceChild(frag, tn);
        inserted = true;
        break;
      }
      if (!inserted) {
        // Fallback: append after target content
        if (target.lastChild && target.lastChild.nodeType === Node.TEXT_NODE) {
          (target.lastChild as Text).textContent = ((target.lastChild as Text).textContent || '') + ' ';
        } else {
          target.appendChild(document.createTextNode(' '));
        }
        target.appendChild(span);
        inserted = true;
      }
      return inserted;
    } catch { return false; }
  }

  // Insert or update the signature overlay image and printed name
  const insertSignatureReact = (text: string, font: string) => {
    // Prefer placing near the "Accepted by" label using an overlay so layout doesn't change
    const acc = ensureAcceptedSigOverlay();
    let container: HTMLElement | null = acc.overlay;
    let left = acc.leftPx;
    if (!container) {
      // Fallback to generic signature display host
      const { display } = ensureSignatureDisplay();
      container = display;
      left = 12;
    }
    if (!container) return false;
    const img = (container.querySelector('img.signature-overlay') as HTMLImageElement | null) || document.createElement('img');
    img.className = 'signature-overlay';
    img.src = renderSignaturePng(text, font);
    img.style.position = 'absolute';
    img.style.left = `${left}px`;
    img.style.bottom = '24px';
  img.style.height = '72px';
    img.style.width = 'auto';
    img.style.pointerEvents = 'none';
    if (!img.parentElement) container.appendChild(img);
    // Update printed name under the line if present (does not change layout either)
    const root = containerRef.current as HTMLElement | null;
    const nameSpan = root?.querySelector('#customer-signature-name') as HTMLElement | null;
    if (nameSpan) nameSpan.textContent = text;
  // Immediately stamp the acceptance date after the label
  try { stampAcceptanceDate(); } catch {}
    return true;
  };

  // Revert shim for previous "price-cells-only borders" enhancement that hid some siding pills
  useEffect(() => {
    // Use the container itself as the root and inject the rendered HTML
    const root = containerRef.current as HTMLElement | null;
    if (!root) return;
    // Populate the proposal HTML content before running any DOM enhancements
    try {
      root.innerHTML = html || "";
    } catch {}
  (function undoPriceCellBordersEnhancement(){
      try {
    // Do NOT remove global style tags or classes anymore; those are used by the base
    // template to render Good/Better/Best layouts and pill visuals.
    // Any legacy style overrides will be superseded by our restore stylesheet below.
  // Inject a small corrective stylesheet (idempotent)
  let oldRestore = document.getElementById('undo-price-borders-restore');
  if (oldRestore && oldRestore.parentNode) oldRestore.parentNode.removeChild(oldRestore);
  const restore = document.createElement('style');
  restore.id = 'undo-price-borders-restore';
  restore.textContent = `
  .photos-grid img{ width:100%; height:auto; border:1px solid #e2e8f0; border-radius:6px; background:#fff; }
  .photos-grid .photo-caption{ font-size:10px; color:#64748b; margin-top:2px; text-align:center; }

  /* Color dropdown removed */

  /* Unified page width and print size (Letter 8.5x11) */
  .proposal-doc .max-w-2xl{ max-width: none; width: 8.5in; margin-left:auto; margin-right:auto; }
  .proposal-html{ width: 8.5in; max-width: 100%; margin-left:auto; margin-right:auto; }
  .proposal-html table{ width: 100%; float: none !important; position: relative; z-index: 1; }
  .proposal-html img{ max-width: 100%; height: auto; }

  /* Force price pills visible in View regardless of template CSS */
  .proposal-html label.price-choice { display: inline-flex !important; align-items: center; gap: 6px; visibility: visible !important; }
  .proposal-html label.price-choice > span { font-weight: 600; }
  .proposal-html label.price-choice input.proposal-price-checkbox,
  .proposal-html input.proposal-price-checkbox {
    -webkit-appearance: checkbox !important;
    appearance: checkbox !important;
    display: inline-block !important;
    width: 18px !important;
    height: 18px !important;
    margin-left: 6px !important;
    opacity: 1 !important;
    visibility: visible !important;
    position: static !important;
    pointer-events: auto !important;
  }

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
    position: relative;
    z-index: 0;
    clear: both;
  pointer-events: none;
    /* tapered ends */
    -webkit-mask-image: linear-gradient(to right, transparent, black 14%, black 86%, transparent);
    mask-image: linear-gradient(to right, transparent, black 14%, black 86%, transparent);
  }

  /* Side-by-side signature layout with 20px gap */
  .signature-section-left {
    width: calc(50% - 10px) !important;
    float: left !important;
    clear: none !important;
    display: block !important;
    margin-right: 20px !important;
    box-sizing: border-box !important;
  }
  
  .signature-section-right {
    width: calc(50% - 10px) !important;
    float: right !important;
    clear: none !important;
    display: block !important;
    box-sizing: border-box !important;
  }

  .signature-container {
    width: 100% !important;
    overflow: hidden !important;
  }

  .signature-container::after {
    content: "";
    display: table;
    clear: both;
  }

  @media print{
    @page{ size: 8.5in 11in; margin: 0.5in; }
    html, body{ width: 8.5in; }
    .proposal-doc{ background: transparent; padding: 0; }
    .proposal-doc .max-w-2xl{ width: 8.5in; }
    .proposal-html{ width: 8.5in; }
  }
        `;
        root.prepend(restore);
      } catch {}
    })();

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

    function stripPhotoPlaceholders(container: HTMLElement) {
      try {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const removals: Text[] = [];
        const edits: Array<{ node: Text; text: string }> = [];
        const tokenRe = /\{[#/]*photos_[^}]*\}/ig;
        while (walker.nextNode()) {
          const tn = walker.currentNode as Text;
          const txt = tn.textContent || '';
          if (!tokenRe.test(txt)) continue;
          tokenRe.lastIndex = 0;
          const cleaned = txt.replace(tokenRe, '').replace(/\{[#/]*gallery_[^}]*\}/ig, '');
          if (cleaned.trim()) {
            edits.push({ node: tn, text: cleaned });
          } else {
            removals.push(tn);
          }
        }
        for (const { node, text } of edits) node.textContent = text;
        for (const tn of removals) {
          const parent = tn.parentNode;
          parent?.removeChild(tn);
          if (parent instanceof HTMLElement) {
            const text = (parent.textContent || '').trim();
            if (!text && !parent.querySelector('img,table,video')) parent.remove();
          }
        }
      } catch {}
    }

    function pruneEmptyPlaceholderBlocks(container: HTMLElement) {
      try {
        const junk = /^[\s\u00A0_\-–—]*$/;
        const nodes = Array.from(container.querySelectorAll('p,div,span')) as HTMLElement[];
        for (const el of nodes) {
          if (el.querySelector('img,table,video,input,label')) continue;
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text || junk.test(text)) {
            el.remove();
          }
        }
      } catch {}
    }

    // Skylights: restore original layout by unwrapping any injected price-choice labels
    function restoreSkylightLayout(container: HTMLElement) {
      try {
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        const isSkylights = (t: HTMLElement) => /\bSKYLIGHTS?\b/i.test(t.textContent || '');
        for (const tbl of tables) {
          if (!isSkylights(tbl)) continue;
          // Ensure Skylights tables paint above decorative dividers
          try { if (getComputedStyle(tbl).position === 'static') (tbl as HTMLElement).style.position = 'relative'; (tbl as HTMLElement).style.zIndex = '2'; } catch {}
          // Unwrap any pills that may have been injected in earlier passes
          const pills = Array.from(tbl.querySelectorAll('label.price-choice')) as HTMLElement[];
          for (const pill of pills) {
            // Preserve pill wrappers that contain actual price checkboxes per user requirement
            const hasCb = !!pill.querySelector('input.proposal-price-checkbox');
            if (hasCb) continue;
            const parent = pill.parentNode as Node | null;
            if (!parent) continue;
            const frag = document.createDocumentFragment();
            // Move children out (checkbox + span text) to preserve content without flex styling
            while (pill.firstChild) frag.appendChild(pill.firstChild);
            parent.insertBefore(frag, pill);
            parent.removeChild(pill);
          }
          // Remove any pill-specific classes on table cells that could affect spacing
          const cells = Array.from(tbl.querySelectorAll('td,th')) as HTMLElement[];
          for (const c of cells) c.classList?.remove('empty-cell');
        }
      } catch {}
    }

    // Skylights: ensure info rows span the full table width (merge cells)
    function ensureSkylightInfoRowsFullWidth(container: HTMLElement) {
      try {
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        const isSkylights = (t: HTMLElement) => /\bSKYLIGHTS?\b/i.test(t.textContent || '');
        for (const tbl of tables) {
          if (!isSkylights(tbl)) continue;
          const rows = Array.from(tbl.querySelectorAll('tr')) as HTMLTableRowElement[];
          if (!rows.length) continue;
          // Estimate total columns as max colSpan sum across first 10 rows
          let totalCols = 0;
          for (const r of rows.slice(0, 10)) {
            const cells = Array.from(r.querySelectorAll('td,th')) as HTMLTableCellElement[];
            const sum = cells.reduce<number>((s: number, c: HTMLTableCellElement) => s + (Number(c.colSpan) || 1), 0);
            if (sum > totalCols) totalCols = sum;
          }
          if (!totalCols) totalCols = 2;
          const isInfoRow = (t: string) => {
            const T = t.toUpperCase();
            return /\bTOTAL\s+SKYLIGHT\s+INVESTMENT\b/.test(T)
              || /^\s*\*\*\*/.test(t)
              || /FEDERAL\s+TAX\s+CREDIT/i.test(t)
              || /ONLY\s+VALID\s+FOR\s+PRIMARY\s+RESIDENCES/i.test(t);
          };
          for (const r of rows) {
            const rText = (r.textContent || '').replace(/\s+/g, ' ').trim();
            if (!isInfoRow(rText)) continue;
            const cells = Array.from(r.querySelectorAll('td,th')) as HTMLTableCellElement[];
            if (!cells.length) continue;
            const first: HTMLTableCellElement = cells[0];
            const combined = cells.map(c => c.innerHTML).join(' ');
            first.innerHTML = combined;
            try { first.colSpan = totalCols; } catch {}
            for (let i = 1; i < cells.length; i++) cells[i].remove();
          }
        }
      } catch {}
    }

    // Skylights: if two skylight tables are side-by-side, consolidate info lines into a single full-width row below them
    function ensureSkylightInfoAcrossTables(container: HTMLElement) {
      try {
        const allRows = Array.from(container.querySelectorAll('tr')) as HTMLTableRowElement[];
        const pairRows: HTMLTableRowElement[] = [];
        for (const row of allRows) {
          const cells = Array.from(row.children).filter(n => n instanceof HTMLElement && (n.tagName === 'TD' || n.tagName === 'TH')) as HTMLElement[];
          if (!cells.length) continue;
          const tablesInCells = cells.map(td => td.querySelector('table')).filter(Boolean) as HTMLElement[];
          const skylightTables = tablesInCells.filter(t => /\bSKYLIGHTS?\b/i.test(t.textContent || ''));
          if (skylightTables.length >= 2) pairRows.push(row);
        }
        for (const row of pairRows) {
          const wrapperTable = row.closest('table') as HTMLTableElement | null;
          if (!wrapperTable) continue;
          // Determine total columns for the wrapper row
          const cells = Array.from(row.querySelectorAll('td,th')) as HTMLTableCellElement[];
          let totalCols = cells.reduce((s, c) => s + (Number(c.colSpan) || 1), 0);
          if (!totalCols) totalCols = cells.length || 2;

          // Look for matching content anywhere within the wrapper table
          const patterns: RegExp[] = [
            /\*\*\*\s*All\s+skylights.*removed\s+if\s+desired\*\*\*/i,
            /\bTOTAL\s+SKYLIGHT\s+INVESTMENT\b/i,
            /\*\*\*replacing\s+skylights.*(ONLY\s+valid|Only\s+valid).*Primary\s+residences\)?/i,
            /30%\s+federal\s+tax\s+credit/i
          ];

          const taken = new Set<HTMLElement>();
          function findAndHide(table: HTMLTableElement, re: RegExp): HTMLElement | null {
            const elements = Array.from(table.querySelectorAll('*')) as HTMLElement[];
            for (const el of elements) {
              const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
              if (!text) continue;
              if (!re.test(text)) continue;
              // Prefer promoting entire row if applicable
              const tr = el.closest('tr');
              const choice = (tr as HTMLElement) || el;
              if ((choice as HTMLElement).dataset?.gbbMoved === 'true') continue;
              if (taken.has(choice)) continue;
              (choice as HTMLElement).dataset.gbbMoved = 'true';
              (choice as HTMLElement).style.display = 'none';
              const clone = (choice as HTMLElement).cloneNode(true) as HTMLElement;
              return clone;
            }
            return null;
          }

          const pieces: HTMLElement[] = [];
          if (!wrapperTable) continue;
          for (const re of patterns) {
            const node = findAndHide(wrapperTable, re);
            if (node) pieces.push(node);
          }
          if (!pieces.length) continue;

          // Insert or replace the full-width info row just after the pair row
          let next = row.nextElementSibling as HTMLTableRowElement | null;
          let targetRow: HTMLTableRowElement;
          if (next && next.classList.contains('skylight-info-fullwidth-row')) {
            targetRow = next;
            // clear existing content
            const td = targetRow.querySelector('td,th') as HTMLTableCellElement | null;
            if (td) td.innerHTML = '';
          } else {
            targetRow = document.createElement('tr');
            targetRow.classList.add('skylight-info-fullwidth-row');
            const td = document.createElement('td');
            td.colSpan = totalCols;
            targetRow.appendChild(td);
            row.parentElement?.insertBefore(targetRow, row.nextElementSibling);
          }
          const cell = targetRow.querySelector('td,th') as HTMLTableCellElement | null;
          if (!cell) continue;
          for (const p of pieces) {
            const wrap = document.createElement('div');
            wrap.style.margin = '4px 0';
            // If we promoted a whole row, use its cell content only
            const inner = p.matches('tr') ? Array.from(p.querySelectorAll('td,th')).map(x => x.innerHTML).join(' ') : p.innerHTML;
            wrap.innerHTML = inner;
            cell.appendChild(wrap);
          }
        }
      } catch {}
    }

    // Run placeholder cleanup early so that amounts exist for pill injection
  replaceKnownPlaceholders(root);
  stripPhotoPlaceholders(root);
  pruneEmptyPlaceholderBlocks(root);
  restoreSkylightLayout(root);
  ensureSkylightInfoRowsFullWidth(root);
  ensureSkylightInfoAcrossTables(root);

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
    // Utility: determine if an element is inside the Skylights section table
    function isSkylightContext(el: HTMLElement | null): boolean {
      if (!el) return false;
      const table = el.closest('table') as HTMLElement | null;
      const txt = (table ? table.textContent : el.textContent) || '';
      return /SKYLIGHTS?/i.test(txt);
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

    // Ensure pills are not hidden by inline styles or attributes
    function ensurePillVisibility(container: HTMLElement) {
      try {
        const nodes = Array.from(container.querySelectorAll('label.price-choice, input.proposal-price-checkbox')) as (HTMLElement | HTMLInputElement)[];
        for (const el of nodes) {
          const h1 = (el as HTMLElement).getAttribute?.('hidden');
          if (h1 != null) (el as HTMLElement).removeAttribute?.('hidden');
          const style = (el as HTMLElement).getAttribute?.('style') || '';
          if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style) || /opacity\s*:\s*0(\D|$)/i.test(style)) {
            (el as HTMLElement).style.removeProperty?.('display');
            (el as HTMLElement).style.removeProperty?.('visibility');
            (el as HTMLElement).style.removeProperty?.('opacity');
          }
          // Apply minimal inline styles to force visibility without clobbering bubble CSS
          if ((el as HTMLElement).matches?.('label.price-choice')) {
            const lab = el as HTMLElement;
            lab.style.removeProperty?.('visibility');
            if (getComputedStyle(lab).display === 'none') lab.style.display = 'inline-flex';
          } else if ((el as HTMLElement).matches?.('input.proposal-price-checkbox')) {
            const inp = el as HTMLInputElement;
            inp.style.removeProperty?.('visibility');
            if (getComputedStyle(inp).display === 'none') inp.style.display = 'inline-block';
          }
        }
      } catch {}
    }

    // Ensure any loose checkbox inputs are wrapped in a visible pill label with a formatted amount
    function ensureLooseCheckboxPills(container: HTMLElement) {
      try {
        const inputs = Array.from(container.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
        for (const input of inputs) {
          if (!input.isConnected) continue;
          let label = input.closest('label.price-choice') as HTMLElement | null;
          // Derive amount from data-amount or try to parse from nearby text
          const getAmt = (): number => {
            const a = Number(input.getAttribute('data-amount') || '0');
            if (isFinite(a) && a > 0) return a;
            const hostTxt = (input.parentElement?.textContent || '').toString();
            const m = hostTxt.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
            if (m) {
              const n = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
              return isFinite(n) ? n : 0;
            }
            return 0;
          };
          if (!label) {
            // Only build a pill when we have a positive amount to avoid $0.00 artifacts
            const amt = getAmt();
            if (!(amt > 0)) continue;
            const pill = document.createElement('label');
            const asph = isAsphaltGBBPrice(input as any);
            pill.className = 'price-choice' + (asph ? ' gbb' : '');
            const span = document.createElement('span');
            span.textContent = fmt(amt);
            const parent = input.parentNode as Node | null;
            if (!parent) continue;
            parent.insertBefore(pill, input);
            // input first, then price text for CSS selectors like input + span
            pill.appendChild(input);
            pill.appendChild(span);
            // Tidy up surrounding placeholders/underlines
            try { breakUnderlineForPill(pill); } catch {}
            try { removePlaceholderJunkAround(pill); } catch {}
          } else {
            // Normalize existing pill: ensure input first then span shows a formatted $ amount
            const inputEl = label.querySelector('input.proposal-price-checkbox') as HTMLInputElement | null;
            if (inputEl && label.firstElementChild !== inputEl) {
              label.insertBefore(inputEl, label.firstElementChild || null);
            }
            let span = label.querySelector('span') as HTMLSpanElement | null;
            if (!span) {
              span = document.createElement('span');
              label.appendChild(span);
            }
            const amt = getAmt();
            if ((!/\$/.test(span.textContent || '') || /^\s*$/.test(span.textContent || '')) && amt > 0) {
              span.textContent = fmt(amt);
            }
            // Ensure input remains inside the label
            if (!label.contains(input)) label.appendChild(input);
          }
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
  if (isSkylightContext(host)) continue;
  // Skip any price within the Carpentry clause
  if (isInCarpentry(host)) continue;
        // Capture first $ occurrence in this text node
        const idx = txt.indexOf('$');
        if (idx >= 0) toReplace.push({ node: tn, idx });
      }
      for (const { node, idx } of toReplace) {
        const host = node.parentElement as HTMLElement | null; if (!host) return;
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
  // input first, then span
  wrap.appendChild(input); wrap.appendChild(span);
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
  if (isSkylightContext(el)) continue;
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

  // Provide auto section ids for diagnostics/styling hooks
  let sectionAutoId = 0;

  // Unified selection gating for Roofing, Siding, Decking, and all Extras
  function applySelectionGating(container: HTMLElement) {
      try {
        const s: any = snapshot || {};
        const pricing: any = s.pricing || {};
        const roofMat = String(
          pricing?.roof?.material ||
          pricing?.roofMaterial ||
          s?.workSelected?.roofing?.material ||
          ''
        ).toLowerCase();
        const sidingMat = String(
          pricing?.siding?.material ||
          pricing?.sidingMaterial ||
          s?.workSelected?.siding?.material ||
          ''
        ).toLowerCase();
        // Preserve tri-state semantics: true | false | null (unknown)
        const tri = (a: any, b?: any) => {
          const v = (a !== undefined ? a : (b !== undefined ? b : null));
          if (v === true) return true;
          if (v === false) return false;
          return null;
        };
        const workSel: { roofing: boolean | null; siding: boolean | null; decking: boolean | null } = {
          roofing: tri(s?.workSelected?.roofing?.selected, pricing?.roof?.selected),
          siding:  tri(s?.workSelected?.siding?.selected,  pricing?.siding?.selected),
          decking: tri(s?.workSelected?.decking?.selected, pricing?.decking?.selected),
        };
        const roofingSel: Record<string, boolean | null> = {
          asphalt:  roofMat ? /(asphalt|shingle|landmark|northgate|climateflex)/.test(roofMat) : (pricing?.asphalt?.selected ?? null),
          davinci:  roofMat ? /davinci/.test(roofMat) : (pricing?.davinci?.selected ?? null),
          cedar:    roofMat ? /cedar/.test(roofMat)   : (pricing?.cedar?.selected ?? null),
          rubber:   roofMat ? /rubber/.test(roofMat)  : (pricing?.rubber?.selected ?? null),
        };
        const sidingSel: Record<string, boolean | null> = {
          cedar:     sidingMat ? /cedar/.test(sidingMat)     : (pricing?.sidingCedar?.selected ?? pricing?.cedarSiding?.selected ?? null),
          synthetic: sidingMat ? /synthetic/.test(sidingMat) : (pricing?.sidingSynthetic?.selected ?? null),
          vinyl:     sidingMat ? /vinyl/.test(sidingMat)     : (pricing?.sidingVinyl?.selected ?? null),
          clapboard: sidingMat ? /(clap\s*board|clapboard)/.test(sidingMat) : (pricing?.sidingClapboard?.selected ?? null),
        };
        const extrasSel: Record<string, boolean | null> = {
          plywood:   pricing?.plywood?.selected ?? null,
          chimney:   pricing?.chimney?.selected ?? null,
          skylights: pricing?.skylights?.selected ?? null,
          trim:      pricing?.trim?.selected ?? (pricing?.trim ? true : null),
          gutters:   pricing?.gutters?.selected ?? null,
          detached:  pricing?.detached?.selected ?? null,
          windows:   pricing?.windowsAndDoors?.selected ?? null,
          custom:    pricing?.customAdd?.selected ?? null,
        };
        const T = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
        const firstCellText = (tbl: HTMLElement) => {
          const first = tbl.querySelector('tr td, tr th') as HTMLElement | null;
          return T(first);
        };
        const isLegalOrSignature = (tbl: HTMLElement) => {
          const text = T(tbl);
          return /(RIGHT\s+TO\s+CANCEL|PAYMENT\s+SCHEDULE|NON[-\s]?PAYMENT|INFLATION|NON[-\s]?COMPLIANT|DATE\s+OF\s+ACCEPTANCE|ACCEPTED\s+BY|SUBMITTED\s+BY|SIGNATURE|SIGNED\s+BY|PRINT\s+NAME)/.test(text);
        };
        type Key =
          | 'roofing:asphalt' | 'roofing:davinci' | 'roofing:cedar' | 'roofing:rubber'
          | 'siding:cedar' | 'siding:synthetic' | 'siding:vinyl' | 'siding:clapboard'
          | 'decking'
          | 'extras:windows' | 'extras:skylights' | 'extras:trim' | 'extras:plywood'
          | 'extras:chimney' | 'extras:gutters' | 'extras:detached' | 'extras:custom';
        const detectKey = (tbl: HTMLElement): Key | null => {
          const text = T(tbl);
          const first = firstCellText(tbl);
          // Roofing
          if (/(CEDAR\s+SHAKE\s+ROOFING)/.test(text) || /^CEDAR(\s+SHAKE)?(\s+ROOF(ING)?)?$/.test(first)) return 'roofing:cedar';
          if (/(DAVINCI)/.test(text) || /^DAVINCI(\s+ROOF(ING)?)?$/.test(first)) return 'roofing:davinci';
          if (/(RUBBER\s+ROOF(ING)?)/.test(text) || /^RUBBER(\s+ROOF(ING)?)?$/.test(first)) return 'roofing:rubber';
          if (/(ASPHALT|SHINGLE|LANDMARK|NORTHGATE|CLIMATEFLEX)/.test(text)) return 'roofing:asphalt';
          // Siding
          if (/CEDAR\s+SHAKE(\s+SIDING)?/.test(text) || /^CEDAR(\s+SHAKE)?$/i.test(first)) return 'siding:cedar';
          if (/SYNTHETIC(\s+SIDING)?/.test(text)) return 'siding:synthetic';
          if (/VINYL(\s+SIDING)?/.test(text)) return 'siding:vinyl';
          if (/(CLAP\s*BOARD|CLAPBOARD)(\s+SIDING)?/.test(text)) return 'siding:clapboard';
          // Decking
          if (/^DECKING$/.test(first) || /\bDECKING\b/.test(text)) return 'decking';
          // Extras
          if (/WINDOWS\s*&\s*DOORS/.test(text)) return 'extras:windows';
          if (/SKYLIGHTS?/.test(text)) return 'extras:skylights';
          if (/^(TRIM|TRIM\s+WORK)$/.test(first) || /\bTRIM\s+WORK\b/.test(text)) return 'extras:trim';
          if (/^(PLYWOOD|PLYWOOD\s+RATES?)$/.test(first)) return 'extras:plywood';
          if (/^CHIMNEY(\s+WORK)?$/.test(first) || /\bLEAD\s+FLASHING\b/.test(text)) return 'extras:chimney';
          if (/^GUTTERS?$/.test(first)) return 'extras:gutters';
          if (/^(DETACHED|DETATCHED)(\s+STRUCTURES?)?$/.test(first)) return 'extras:detached';
          if (/^CUSTOM(\s+ADD(ITION)?S?)?$/.test(first) || /\bCUSTOM\s+ADD[-\s]?ON\b/i.test(text)) return 'extras:custom';
          return null;
        };
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        for (const tbl of tables) {
          if (isLegalOrSignature(tbl)) continue;
          const key = detectKey(tbl);
          if (!key) continue;
          // Mark section root so enhancements are scoped per-section
          try { (tbl as HTMLElement).setAttribute('data-section', key); } catch {}
          try { (tbl as HTMLElement).setAttribute('data-section-type', key); } catch {}
          try {
            const dataset = (tbl as HTMLElement).dataset || ({} as DOMStringMap);
            if (!dataset.sectionId) {
              sectionAutoId += 1;
              (tbl as HTMLElement).setAttribute('data-section-id', `${key || 'section'}-${sectionAutoId}`);
            }
          } catch {}
          let show: boolean | null = null;
          if (key.startsWith('roofing:')) {
            if (workSel.roofing === false) show = false;
            else if (workSel.roofing === true) {
              const sub = key.split(':')[1];
              const subSel = roofingSel[sub];
              if (subSel === true) show = true; else if (subSel === false) show = false; else show = null;
            }
          } else if (key.startsWith('siding:')) {
            if (workSel.siding === false) show = false;
            else if (workSel.siding === true) {
              const sub = key.split(':')[1];
              const subSel = sidingSel[sub];
              if (subSel === true) show = true; else if (subSel === false) show = false; else show = null;
            }
          } else if (key === 'decking') {
            show = workSel.decking ? true : (workSel.decking === false ? false : null);
          } else if (key.startsWith('extras:')) {
            const sub = key.split(':')[1];
            if (sub === 'trim') {
              // Keep Trim visible so individual line items remain selectable even when other extras toggle
              (tbl as HTMLElement).style.removeProperty?.('display');
              continue;
            }
            const flag = extrasSel[sub as keyof typeof extrasSel];
            // Strict per-section gating for all extras (no special cases)
            show = (flag === true) ? true : (flag === false ? false : null);
          }
          if (show === true || show === false) {
            (tbl as HTMLElement).style.display = show ? '' : 'none';
          } else {
            (tbl as HTMLElement).style.removeProperty?.('display');
          }
        }
      } catch {}
    }
    // Back-compat shim: route old extras hider to unified gating
    function hideUnusedExtras(container: HTMLElement) { try { applySelectionGating(container); } catch {} }

    // Section-scoped enhancement manager to avoid cross-section interference
    function applyScopedMoneyWrappers(sectionRoot: HTMLElement) {
      // Skip sections that own their own logic
      const txt = (sectionRoot.textContent || '').toUpperCase();
      if (/\bTRIM\b/.test(txt) || /\bWINDOWS\s*&\s*DOORS\b/.test(txt) || /\bSKYLIGHTS\b/.test(txt)) return;

      const els = Array.from(sectionRoot.querySelectorAll('td,th,p,div,span')) as HTMLElement[];
      const moneyRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;

      for (const el of els) {
        if (el.closest('label.price-choice')) continue;
        if (el.querySelector('input.proposal-price-checkbox')) continue;
        if (el.closest('[data-trim-total="1"]')) continue;
        if (el.closest('[data-skylight-total-host="1"]')) continue;
        const t = el.textContent || '';
        if (!(t.includes('$') && /[0-9]/.test(t))) continue;
        if (/TOTAL\s+INVESTMENT\s*:/i.test(t)) continue;
        if (isInCarpentry(el)) continue;
        if (isIceWaterContext(el)) continue;

        const html0 = el.innerHTML;
        // contiguous first
        let html1 = html0.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)(?!\s*[A-Za-z])/g, (m) => {
          const amt = Number(m.replace(/[^0-9.\-]/g, ''));
          if (!isFinite(amt) || amt <= 0) return m;
          return `<label class="price-choice"><span>${m}</span><input type="checkbox" class="proposal-price-checkbox" data-amount="${amt}"></label>`;
        });
        // cross-tag
        if (html1 === html0 && moneyRe.test(html0)) {
          html1 = html0.replace(moneyRe, (seg) => {
            const plain = seg.replace(/<[^>]*>/g, '');
            const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
            if (!m) return seg;
            const after = plain.slice(plain.indexOf(m[1]) + m[1].length);
            const next = (after.match(/^(?:\s|\u00A0)*([^\s\u00A0])/)||[])[1] || '';
            if (/^[A-Za-z]/.test(next)) return seg; // e.g., “mil”
            const amt = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
            if (!isFinite(amt) || amt <= 0) return seg;
            return `<label class="price-choice">${seg}<input type="checkbox" class="proposal-price-checkbox" data-amount="${amt}"></label>`;
          });
        }
        if (html1 !== html0) el.innerHTML = html1;
      }
    }

    function enhanceAllSections(container: HTMLElement) {
      const sections = Array.from(container.querySelectorAll('table[data-section]')) as HTMLElement[];
      for (const tbl of sections) {
        const key = String(tbl.getAttribute('data-section') || '');
        // Section-specific enhancers already run elsewhere
        if (key === 'extras:trim' || key === 'extras:windows' || key === 'extras:skylights') continue;
        applyScopedMoneyWrappers(tbl);
      }
      // Normalize after local injections
      ensureLooseCheckboxPills(container);
      ensurePillVisibility(container);
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
      // Respect Asphalt TOTAL authority if set by public/elink-overrides.js
      if (totalRow && (totalRow as HTMLElement).getAttribute('data-gbb-authority') === 'asphalt') continue;
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
                if (!isFinite(amt) || amt <= 0) return m; // don't inject $0 pills
                changed = true;
        return `<label class=\"price-choice gbb\"><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"><span>${m}</span></label>`;
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
    // If no valid money was found, do not inject a pill to avoid $0 artifacts
    if (!m) return seg;
                const amt = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
                if (!isFinite(amt) || amt <= 0) return seg; // don't inject $0 pills
  return `<label class=\"price-choice gbb\"><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\">${seg}</label>`;
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

    // Ensure Trim photos are injected if the template loop didn't render them (strict table detection)
    function ensureTrimPhotosFallback(container: HTMLElement) {
      try {
        const tables = Array.from(container.querySelectorAll('table')) as HTMLElement[];
        const isTrimTable = (t: HTMLElement) => {
          // Require an explicit visible header that says exactly "TRIM WORK"
          const hdr = (Array.from(t.querySelectorAll('th,td,b,strong,span,p')) as HTMLElement[])
            .find(el => /^\s*TRIM\s+WORK\s*$/i.test((el.textContent || '').replace(/\s+/g, ' ').trim()));
          return !!hdr;
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

  // Trim section: detect table by explicit header or by presence of common Trim line labels
  function setupTrimSection() {
      const rootEl = root as HTMLElement;

  // Always prepare Trim section even if not explicitly selected; visibility is handled elsewhere

      // Prefer an explicit header "TRIM WORK"; else find a table with multiple trim labels
  const headerNode = (Array.from(rootEl.querySelectorAll('th,td,b,strong,span,p,u,i,em,li')) as HTMLElement[])
        .find(el => /\bTRIM\b(\s+WORK)?\b/i.test((el.textContent || '').replace(/\s+/g, ' ').trim())) || null;

      let table = headerNode ? (headerNode.closest('table') as HTMLElement | null) : null;
      let sectionHost: HTMLElement | null = table;
      if (!table) {
        const trimLabelRes: RegExp[] = [
          /\bSoffit\b/i,
          /\bFascias?\b/i,
          /\bFrieze\b/i,
          /\bMo[u]?lding(?:s|\(s\))?\b/i,
          /\bCorner\s+Boards\b/i,
          /(Window\s*[\/&]?\s*Door|Windows?\s*&\s*Doors?)/i,
          /\bRake\s+Boards\b/i,
          /\bWater\s+Table\b/i,
        ];
        const candidates = Array.from(rootEl.querySelectorAll('table')) as HTMLElement[];
        table = candidates.find(t => {
          const txt = (t.textContent || '');
          // Avoid Extra Carpentry or other extras
          if (/(POSSIBLE\s+)?EXTRA\s+CARPENTRY/i.test(txt)) return false;
          let hits = 0;
          for (const re of trimLabelRes) { if (re.test(txt)) hits++; }
          return hits >= 2; // require at least two trim item labels to reduce false positives
        }) || null;
        sectionHost = table;
        if (!sectionHost) {
          // Fallback: find at least two label elements and use their nearest common ancestor
          const labelEls = (Array.from(rootEl.querySelectorAll('p,span,td,th,b,strong,u,i')) as HTMLElement[])
            .filter(el => trimLabelRes.some(re => re.test(el.textContent || '')));
          if (labelEls.length >= 2) {
            const path = (el: HTMLElement) => { const a: HTMLElement[] = []; let x: HTMLElement | null = el; while (x) { a.push(x); x = x.parentElement; } return a; };
            const a0 = path(labelEls[0]);
            let lca: HTMLElement | null = null;
            for (const n of a0) {
              if (labelEls.every(el => path(el).includes(n))) { lca = n; break; }
            }
            sectionHost = lca || rootEl;
          } else if (labelEls.length === 1) {
            // New: if only a single Trim label exists (e.g., just "Molding"), still attach within its visible container
            const single = labelEls[0];
            sectionHost = (single.closest('table') as HTMLElement | null)
              || (single.closest('td,th,p,div') as HTMLElement | null)
              || (single.parentElement as HTMLElement | null)
              || rootEl;
          }
        }
      }
      if (!sectionHost) return;

  // Idempotent: mark init but do not early-return so we can heal pills on later mutations
  const mark = sectionHost as any;
  const wasInit = !!(mark.dataset && mark.dataset.trimInit === '1');
  try { mark.dataset.trimInit = '1'; } catch {}
      sectionHost.classList.add('trim-work-table');

  // Ensure the Trim TOTAL row shows a display-only numeric span (no checkboxes)
  let totalRow: HTMLElement | null = null;
      if (sectionHost.tagName === 'TABLE') {
        const rows = Array.from(sectionHost.querySelectorAll('tr')) as HTMLTableRowElement[];
        totalRow = rows.find(r => /TOTAL\s+INVESTMENT\s*:/i.test(r.textContent || '')) || null;
      } else {
        totalRow = (Array.from(sectionHost.querySelectorAll('*')) as HTMLElement[])
          .find(el => /TOTAL\s+INVESTMENT\s*:/i.test(el.textContent || '') && !Array.from(el.querySelectorAll('*')).some(ch => /TOTAL\s+INVESTMENT\s*:/i.test(ch.textContent || ''))) || null;
      }
  // If no explicit TOTAL line is present, we still attach checkboxes and let the grand total reflect selections.

      // Remove any pills/inputs in that row (if a TOTAL row exists)
      if (totalRow) {
        Array.from(totalRow.querySelectorAll('label.price-choice,input.proposal-price-checkbox'))
          .forEach(el => (el as HTMLElement).remove());
      }

      // Insert or reuse a numeric-only span after the first '$' (if a total row exists)
      let totalSpan: HTMLElement | null = null;
      if (totalRow) {
        const ensureSpan = (): HTMLElement => {
          let span = totalRow!.querySelector('.trim-total-amount') as HTMLElement | null;
          if (span) return span;

          const cells = Array.from(totalRow!.querySelectorAll('td,th')) as HTMLElement[];
          const cell = cells.length ? (cells[cells.length - 1] || cells[0]) : (totalRow! as HTMLElement);
          // Mark this cell as the Trim total container so global wrappers skip it
          try { (cell as HTMLElement).setAttribute('data-trim-total', '1'); } catch {}
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          let tgt: Text | null = null; let idx = -1;
          while (walker.nextNode()) {
            const tn = walker.currentNode as Text;
            const t = tn.textContent || '';
            const i = t.indexOf('$');
            if (i >= 0) { tgt = tn; idx = i; break; }
          }
          span = document.createElement('span');
          span.className = 'trim-total-amount';
          span.textContent = fmt(0).replace(/^\s*\$\s*/, '');
          if (tgt && idx >= 0) {
            const text = tgt.textContent || '';
            const before = text.slice(0, idx + 1);
            const after = text.slice(idx + 1).replace(/^[ _\u00A0]+/, ' ');
            const parent = tgt.parentNode as Node;
            parent.insertBefore(document.createTextNode(before), tgt);
            parent.insertBefore(span, tgt);
            parent.insertBefore(document.createTextNode(after), tgt);
            parent.removeChild(tgt);
          } else {
            cell.appendChild(span);
          }
          // After inserting the numeric-only span, remove any duplicate money tokens or placeholder runs that may follow
          try {
            // Only operate within the total container cell
            const host = span.closest('[data-trim-total="1"]') as HTMLElement | null;
            if (host) {
              // Normalize to exactly one '$ ' immediately before the span
              try {
                // Helper: find the last non-space/underscore char before the span across sibling elements
                const lastNonSpaceCharBefore = (node: Node | null): string | null => {
                  const isWhitespace = (ch: string) => /[\s\u00A0_]/.test(ch);
                  let cur: Node | null = node ? node.previousSibling : null;
                  let steps = 0;
                  while (cur && steps++ < 24) {
                    if (cur.nodeType === Node.TEXT_NODE) {
                      const t = (cur as Text).textContent || '';
                      for (let i = t.length - 1; i >= 0; i--) {
                        const ch = t[i];
                        if (!isWhitespace(ch)) return ch;
                      }
                    } else if (cur.nodeType === Node.ELEMENT_NODE) {
                      const el = cur as HTMLElement;
                      // Dive into its last texty descendant
                      let d: Node | null = el.lastChild;
                      let innerSteps = 0;
                      while (d && innerSteps++ < 24) {
                        if (d.nodeType === Node.TEXT_NODE) {
                          const t = (d as Text).textContent || '';
                          for (let i = t.length - 1; i >= 0; i--) {
                            const ch = t[i];
                            if (!isWhitespace(ch)) return ch;
                          }
                          break;
                        }
                        d = (d as any).lastChild || null;
                      }
                    }
                    cur = cur.previousSibling;
                  }
                  return null;
                };
                const lastCh = lastNonSpaceCharBefore(span);
                const hasDollarBefore = lastCh === '$';
                if (hasDollarBefore) {
                  // If there's already a $ before, remove a redundant "$ " text node immediately before span
                  const prev = span.previousSibling;
                  if (prev && prev.nodeType === Node.TEXT_NODE) {
                    const s = ((prev as Text).textContent || '');
                    if (/^\s*\$\s*$/.test(s)) {
                      const rm = prev; span.parentNode?.removeChild(rm);
                    } else {
                      // Ensure exactly one space between the existing $ and the span
                      // Trim trailing whitespace and add a single space
                      const trimmed = s.replace(/[\s\u00A0_]+$/g, '');
                      (prev as Text).textContent = trimmed + ' ';
                    }
                  } else {
                    // No text node directly before: insert a single space for readability
                    span.parentNode?.insertBefore(document.createTextNode(' '), span);
                  }
                } else {
                  // No $ found before span: insert one
                  span.parentNode?.insertBefore(document.createTextNode('$ '), span);
                }
              } catch {}
              // Walk siblings after the span and strip any "$123" or standalone numeric tokens and placeholder underscores/nbsp
              let sib: Node | null = span.nextSibling;
              let steps = 0;
              const moneyRe = /\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?/;
              const numberOnlyRe = /(^|>)\s*[0-9][0-9,]*(?:\.[0-9]{2})?(?=\s*(<|$))/;
              while (sib && steps++ < 24) {
                if (sib.nodeType === Node.TEXT_NODE) {
                  let s = (sib as Text).textContent || '';
                  const s0 = s;
                  // Remove any $money immediately
                  s = s.replace(new RegExp(moneyRe, 'g'), '');
                  // Remove any leading numeric token
                  s = s.replace(/^[\s\u00A0]*[0-9][0-9,]*(?:\.[0-9]{2})?/, '');
                  // Collapse placeholders
                  s = s.replace(/[ _\u00A0]{2,}/g, ' ');
                  if (s.trim() === '') { const rm = sib; sib = sib.nextSibling; (rm.parentNode as Node | null)?.removeChild(rm); continue; }
                  if (s !== s0) (sib as Text).textContent = s;
                } else if (sib.nodeType === Node.ELEMENT_NODE) {
                  const el = sib as HTMLElement;
                  const html0 = el.innerHTML;
                  let html1 = html0;
                  html1 = html1.replace(new RegExp(moneyRe.source, 'g'), '');
                  html1 = html1.replace(numberOnlyRe, '$1');
                  html1 = html1.replace(/[ _\u00A0]{2,}_*/g, ' ');
                  if (html1 !== html0) el.innerHTML = html1;
                  // Remove if empty/placeholder-only after cleanup
                  const plain = (el.textContent || '').replace(/[_\s\u00A0]+/g, ' ').trim();
                  if (!plain) { const rm = el; sib = el.nextSibling; rm.remove(); continue; }
                }
                sib = sib.nextSibling;
              }
            }
          } catch {}
          return span;
        };
        totalSpan = ensureSpan();
  // Remove any pills/inputs in that row
  Array.from(totalRow.querySelectorAll('label.price-choice,input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());
      }
      // If there wasn't a formal table total row, but a non-table Trim host exists, try to mark a reasonable container
      if (!totalRow && sectionHost && !(sectionHost as HTMLElement).querySelector('[data-trim-total]')) {
        // If we previously injected a span somewhere under the section, mark its closest cell/host
        const anySpan = (sectionHost as HTMLElement).querySelector('.trim-total-amount') as HTMLElement | null;
        if (anySpan) {
          const cell = (anySpan.closest('td,th') as HTMLElement | null) || (anySpan.parentElement as HTMLElement | null) || (sectionHost as HTMLElement);
          try { cell?.setAttribute('data-trim-total', '1'); } catch {}
        }
      }

      // Inject per-line checkboxes for Trim items with computed amounts and show calculation (Effective $/ft × ft = total)
  (function attachTrimLineCheckboxes(){
        try {
          const tr = ((snapshot as any)?.pricing?.trim || {}) as any;
          const feet = ((tr?.feet || {}) as any);
          const rates = ((tr?.rates || {}) as any);
          // Determine base $/ft and adjust by install mode (new = discount)
          const baseRate = Number(tr?.material === 'cedar' ? (rates?.cedar ?? rates?.perFt ?? rates?.perLF) : (rates?.azek ?? rates?.perFt ?? rates?.perLF)) || 0;
          const adjRate = baseRate - (tr?.installMode === 'new' ? 2 : 0);
          let effectivePerFt = adjRate;
          // Fallback: detect visible per-foot rate in the Trim section (e.g., "$12.50 /ft" or "$12.50 per LF")
          if (!(effectivePerFt > 0)) {
            const scanText = (sectionHost as HTMLElement).textContent || '';
            const pf = scanText.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)\s*(?:\/\s*(?:ft|lf)|per\s*(?:linear\s*)?(?:ft|lf)\b)/i);
            if (pf) {
              const v = Number(pf[1]);
              if (isFinite(v) && v > 0) effectivePerFt = v;
            }
          }
          // Secondary fallback: derive $/ft from any existing row that already shows a $ amount and a Feet value
          if (!(effectivePerFt > 0) && (sectionHost as HTMLElement).matches?.('table')) {
            const rows = Array.from((sectionHost as HTMLElement).querySelectorAll('tr')) as HTMLTableRowElement[];
            const perFt: number[] = [];
            const feetRx = /([0-9]+(?:\.[0-9]+)?)\s*(?:Feet|Ft\.?|LF|Linear\s+Feet)\b/i;
            for (const r of rows) {
              const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
              if (!cells.length) continue;
              let ft = 0;
              let amt = 0;
              for (const c of cells) {
                if (!ft) {
                  const m = (c.textContent || '').match(feetRx);
                  if (m) { const v = Number(m[1]); if (isFinite(v) && v > 0) ft = v; }
                }
                if (!amt) {
                  const a = parseMoney(c.textContent || '');
                  if (a > 0) amt = a;
                }
              }
              if (ft > 0 && amt > 0) {
                const rate = amt / ft;
                if (isFinite(rate) && rate > 0) perFt.push(rate);
              }
            }
            if (perFt.length) {
              perFt.sort((a,b)=>a-b);
              const mid = Math.floor(perFt.length/2);
              effectivePerFt = perFt.length % 2 ? perFt[mid] : (perFt[mid-1] + perFt[mid]) / 2;
            }
          }
          type TrimItem = { key: string; labelRe: RegExp; feet: number };
          const items: TrimItem[] = [
            { key: 'soffit',       labelRe: /\bSoffits?\b/i,             feet: Number(feet?.soffit || feet?.soffits || 0) },
            { key: 'fascias',      labelRe: /\bFascias?|Fascia\s+Boards?\b/i, feet: Number(feet?.fascias || feet?.fascia || 0) },
            { key: 'frieze',       labelRe: /\bFrieze(\s+Boards?)?\b/i, feet: Number(feet?.frieze || feet?.friezeBoards || 0) },
            { key: 'molding',      labelRe: /\bMo[u]?lding(?:s|\(s\))?\b/i,  feet: Number(feet?.molding || feet?.moulding || feet?.moldings || 0) },
            { key: 'cornerBoards', labelRe: /\bCorner\s+Boards\b/i,      feet: Number(feet?.cornerBoards || 0) },
            { key: 'windowDoor',   labelRe: /(Window\s*[\/&]?\s*Door|Windows?\s*&\s*Doors?)/i, feet: Number(feet?.windowDoor || 0) },
            { key: 'rakeBoards',   labelRe: /\bRake\s+Boards?\b/i,       feet: Number(feet?.rakeBoards || 0) },
            { key: 'waterTable',   labelRe: /\bWater\s+Table\b/i,        feet: Number(feet?.waterTable || 0) },
          ];
          const attach = (re: RegExp, amount: number, ftVal: number) => {
            const searchScope = sectionHost as HTMLElement;
            let labelEl = (Array.from(searchScope.querySelectorAll('p,span,b,strong,td,th,u,i,em,li')) as HTMLElement[]).find(el => re.test(el.textContent || '')) || null;
            // Row-based fallback: if we didn't find the label element, try matching the first cell in rows
            let rowForLabel: HTMLTableRowElement | null = null;
            if (!labelEl) {
              const rows = Array.from(searchScope.querySelectorAll('tr')) as HTMLTableRowElement[];
              for (const r of rows) {
                const cells = Array.from(r.querySelectorAll('td,th')) as HTMLElement[];
                if (!cells.length) continue;
                const firstTxt = (cells[0].textContent || '').trim();
                if (re.test(firstTxt)) { rowForLabel = r; labelEl = cells[0]; break; }
              }
              if (!labelEl && !(searchScope as HTMLElement).matches('table')) {
                // Non-table host: no row concept; bail if not found
                return null;
              }
            }
            if (!labelEl) return null;
            // If amount is zero but we can infer Feet from nearby DOM, compute from visible feet
            const inferFeetFromDom = (): number => {
              // Prefer: same row second cell (table) or following siblings of the label container
              const row = labelEl.closest('tr') as HTMLTableRowElement | null;
              const labelCell = labelEl.closest('td,th') as HTMLElement | null;
              const scanNodes: HTMLElement[] = [];
              if (row && labelCell) {
                const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
                const idx = cells.findIndex(c => c === labelCell);
                if (idx >= 0 && cells[idx + 1]) scanNodes.push(cells[idx + 1]);
              }
              // Also scan the label cell and its parent container for inline "Feet" text
              if (labelCell) scanNodes.push(labelCell);
              const parent = (labelCell?.parentElement as HTMLElement | null) || (labelEl.parentElement as HTMLElement | null);
              if (parent) scanNodes.push(parent);
              const rx = /([0-9]+(?:\.[0-9]+)?)\s*(?:Feet|Ft\.?|LF|Linear\s+Feet)\b/i;
              for (const n of scanNodes) {
                const txt = n.textContent || '';
                const m = txt.match(rx);
                if (m) {
                  const v = Number(m[1]);
                  if (isFinite(v) && v > 0) return v;
                }
              }
              return 0;
            };
            if (!(amount > 0) && effectivePerFt > 0) {
              const domFt = inferFeetFromDom();
              if (domFt > 0) amount = Math.round(domFt * effectivePerFt * 100) / 100;
            }
            // Prefer: the cell to the right when within a table; otherwise append inline after the label element
            let destCell: HTMLElement | null = null;
            const labelCell = labelEl.closest('td,th') as HTMLElement | null;
            const row = rowForLabel || (labelEl.closest('tr') as HTMLTableRowElement | null);
            if (row && labelCell) {
              const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
              const idx = cells.findIndex(c => c === labelCell);
              if (idx >= 0) destCell = cells[idx + 1] || cells[cells.length - 1] || null;
            } else if (row && !labelCell) {
              // From row fallback: place in second cell when available
              const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
              if (cells.length >= 2) destCell = cells[1];
            }
            if (!destCell) destCell = labelEl as HTMLElement;
            // Recompute amount one more time from the destination cell if it contains Feet-only text
            if (!(amount > 0) && destCell) {
              const rx = /([0-9]+(?:\.[0-9]+)?)\s*(?:Feet|Ft\.?|LF|Linear\s+Feet)\b/i;
              const m = (destCell.textContent || '').match(rx);
              const v = m ? Number(m[1]) : 0;
              if (isFinite(v) && v > 0 && effectivePerFt > 0) amount = Math.round(v * effectivePerFt * 100) / 100;
            }
            // Avoid duplicates
            if (destCell.querySelector('input.proposal-price-checkbox')) return destCell.querySelector('input.proposal-price-checkbox') as HTMLInputElement;
            // Don’t inject empty $0 pills
            if (!(amount > 0)) return null;
            const wrap = document.createElement('label');
            wrap.className = 'price-choice';
            const span = document.createElement('span');
            // Display only the price result for the Trim option pill
            span.textContent = fmt(amount);
            const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'proposal-price-checkbox'; input.setAttribute('data-amount', String(amount));
            // Price first then checkbox (consistent with earlier non-GBB sections)
            wrap.appendChild(span); wrap.appendChild(input);
            // If appending inline to a label paragraph, insert a separator space
            if (destCell === labelEl && labelEl.parentNode) {
              // Insert directly after the label element (or its underline wrapper) to keep pill visible
              const parent = labelEl.parentNode;
              // If label is wrapped in <u> or <i>, place after that wrapper instead
              const underlineHost = labelEl.closest('u,i') as HTMLElement | null;
              const anchor = (underlineHost && underlineHost.parentNode === parent) ? underlineHost : labelEl;
              parent.insertBefore(document.createTextNode(' '), anchor.nextSibling);
              parent.insertBefore(wrap, anchor.nextSibling);
            } else {
              destCell.appendChild(wrap);
            }
            // Default unchecked
            input.checked = false;
            return input;
          };
          for (const it of items) {
            const amt = Math.max(0, Math.round((Number(it.feet || 0) * adjRate) * 100) / 100);
            attach(it.labelRe, amt, it.feet);
          }
        } catch {}
      })();

      const pruneTrimPlaceholders = () => {
        try {
          const scope = sectionHost as HTMLElement;
          const placeholderRe = /\{[#/]*trim[^}]*\}/ig;
          const nodes = Array.from(scope.querySelectorAll('td,th,p,span,li')) as HTMLElement[];
          for (const el of nodes) {
            if (el.closest('[data-trim-total="1"]')) continue;
            if (el.querySelector('label.price-choice,input.proposal-price-checkbox')) continue;
            let text = el.textContent || '';
            const cleaned = text.replace(placeholderRe, '').replace(/[\_\u00A0]{2,}/g, ' ').trim();
            if (!cleaned) {
              el.remove();
              continue;
            }
            if (cleaned !== text.trim()) {
              el.textContent = cleaned;
            }
          }
          const rows = Array.from(scope.querySelectorAll('tr')) as HTMLTableRowElement[];
          for (const row of rows) {
            if (row.querySelector('[data-trim-total="1"]')) continue;
            const cells = Array.from(row.querySelectorAll('td,th')) as HTMLElement[];
            if (!cells.length) continue;
            const hasContent = cells.some(c => {
              const t = (c.textContent || '').replace(/\s+/g, ' ').trim();
              return !!t;
            });
            if (!hasContent) row.remove();
          }
        } catch {}
      };
      pruneTrimPlaceholders();

      // Subtotal from any Trim checkboxes (if present)
      const recalcTrim = () => {
        const scope = sectionHost as HTMLElement;
        const cbs = Array.from(scope.querySelectorAll('input.proposal-price-checkbox')) as HTMLInputElement[];
        const subtotal = cbs.reduce((a, cb) => a + (cb.checked ? Number(cb.getAttribute('data-amount') || '0') : 0), 0);
        if (totalSpan) totalSpan.textContent = fmt(subtotal).replace(/^\s*\$\s*/, '');
        // Safety: ensure no pills exist inside the Trim total container, even if other passes re-injected
        const totalContainer = (scope.querySelector('[data-trim-total="1"]') as HTMLElement | null) || (totalSpan?.closest('td,th') as HTMLElement | null) || null;
        if (totalContainer) {
          Array.from(totalContainer.querySelectorAll('label.price-choice,input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());
        }
        recalc();
      };
      // Bind once; allow setupTrimSection to re-run and heal pills on later mutations
      if (!mark.dataset?.trimBound) {
        sectionHost.addEventListener('change', (e) => {
          const t = e.target as HTMLElement | null;
          if (t && t.closest('input.proposal-price-checkbox')) recalcTrim();
        });
        try { mark.dataset.trimBound = '1'; } catch {}
      }
      recalcTrim();
    }

    // Ensure Asphalt COLOR: blank is always visible (idempotent; prevents duplicate lines)
  function ensureAsphaltColorBlank(container: HTMLElement) {
      try {
        const blocks = Array.from(container.querySelectorAll('table, p, div, span, td, th')) as HTMLElement[];
        const hasAsphalt = (el: HTMLElement) => /ASPHALT|SHINGLE|LANDMARK|NORTHGATE|CLIMATEFLEX/i.test(el.textContent || '');
        const colorLeafs = blocks.filter(el => {
          const t = (el.textContent || '').toUpperCase();
          if (!/\bCOLOR\s*:/.test(t)) return false;
          // Keep leaf-most elements that contain COLOR:
          return !Array.from(el.querySelectorAll('*')).some(ch => /\bCOLOR\s*:/.test((ch.textContent || '').toUpperCase()));
        });
        for (const leaf of colorLeafs) {
          // Scope to Asphalt context only
          if (!hasAsphalt((leaf.closest('table') as HTMLElement) || leaf)) continue;
          const host = (leaf.closest('td,th,p,div,span') as HTMLElement) || leaf;

          // If a blank already exists anywhere in this host, keep only the first and skip
          const existingBlanks = Array.from(host.querySelectorAll('.asphalt-color-blank')) as HTMLElement[];
          if (existingBlanks.length > 0) {
            existingBlanks.forEach((blank, idx) => {
              // Normalize appearance and keep only the first
              (blank as HTMLElement).style.display = 'inline-block';
              if (!(blank as HTMLElement).style.minWidth) (blank as HTMLElement).style.minWidth = '220px';
              (blank as HTMLElement).style.borderBottom = '2px solid #facc15';
              (blank as HTMLElement).style.background = '#fef08a';
              (blank as HTMLElement).style.padding = (blank as HTMLElement).style.padding || '0 6px';
              (blank as HTMLElement).style.height = (blank as HTMLElement).style.height || '1.1em';
              (blank as HTMLElement).style.lineHeight = (blank as HTMLElement).style.lineHeight || '1.1';
              (blank as HTMLElement).style.marginLeft = (blank as HTMLElement).style.marginLeft || '6px';
              if (idx > 0) blank.remove();
            });
            continue;
          }

          // Scan a few siblings forward from the COLOR: leaf for an existing underline/min-width/underscores
          let n: Node | null = leaf.nextSibling;
          let steps = 0;
          let foundExisting = false;
          while (n && steps++ < 12) {
            if (n.nodeType === Node.ELEMENT_NODE) {
              const el = n as HTMLElement;
              if (el.classList?.contains('asphalt-color-blank')) { foundExisting = true; break; }
              const st = (el.getAttribute('style') || '').toLowerCase();
              const txt = (el.textContent || '').replace(/\s+/g, '');
              if (/border-bottom\s*:/.test(st) || /min-width\s*:/.test(st) || /^_+$/.test(txt)) { foundExisting = true; break; }
              // Stop if we encounter a non-junk element
              if (/\S/.test((el.textContent || '').replace(/[_\u00A0]/g, ''))) break;
            } else if (n.nodeType === Node.TEXT_NODE) {
              const s = (n as Text).textContent || '';
              if (/^[_\s\u00A0]+$/.test(s)) {
                // skip placeholders
              } else if (/\S/.test(s)) {
                // non-whitespace text => stop the scan
                break;
              }
            }
            n = (n as any).nextSibling || null;
          }
          if (foundExisting) continue;
          // Choose an anchor to clean after: prefer the COLOR: leaf itself
          const anchor: Node = leaf;
          // Final small sweep: remove up to 3 more siblings if they are only '$' or whitespace placeholders
          let extra = 0; let node: Node | null = anchor.nextSibling;
          const isOnlyDollarOrSpace = (n: Node | null) => {
            if (!n) return false;
            const s = (n instanceof HTMLElement ? (n.textContent || '') : (n.nodeType === Node.TEXT_NODE ? (n as Text).textContent || '' : '') ) || '';
            return /^\s*\$?\s*$/.test(s);
          };
          while (node && extra < 3) {
            if (isOnlyDollarOrSpace(node)) {
              const rm: Node | null = node; node = node.nextSibling;
              if (rm && rm.parentNode) { rm.parentNode.removeChild(rm); extra++; continue; }
            }
            break;
          }
          // Robust trailing dollar cleanup: remove any '$' chars in the subtree after the anchor when no digits are present
          try {
            let cur: Node | null = anchor.nextSibling;
            let guard = 0;
            while (cur && guard < 200) {
              const next = cur.nextSibling;
              if (cur.nodeType === Node.TEXT_NODE) {
                const s0 = (cur as Text).textContent || '';
                if (s0.includes('$') && !/[0-9]/.test(s0)) {
                  const s1 = s0.replace(/\$/g, '').trimStart();
                  if (s1.trim() === '') { cur.parentNode?.removeChild(cur); }
                  else { (cur as Text).textContent = s1; }
                }
              } else if (cur instanceof HTMLElement) {
                const t0 = (cur.textContent || '');
                if (t0.includes('$') && !/[0-9]/.test(t0)) { cur.remove(); cur = next; guard++; continue; }
              }
              cur = next; guard++;
            }
          } catch {}

          // Insert a durable underline blank immediately after the COLOR: leaf within its parent
          const blank = document.createElement('span');
          blank.className = 'asphalt-color-blank';
          blank.setAttribute('data-injected', '1');
          blank.innerHTML = '&nbsp;';
          blank.style.display = 'inline-block';
          blank.style.minWidth = '280px';
          blank.style.borderBottom = '2px solid #facc15';
          blank.style.background = '#fef08a';
          blank.style.padding = '0 6px';
          blank.style.height = '1.1em';
          blank.style.lineHeight = '1.1';
          blank.style.marginLeft = '6px';
          const parent = leaf.parentElement || host;
          try {
            parent.insertBefore(blank, leaf.nextSibling);
          } catch {
            host.appendChild(blank);
          }
          // Trim a few immediately following empty siblings left from placeholders
          let cleanup: Node | null = blank.nextSibling;
          let trims = 0;
          while (cleanup && trims < 3) {
            const next = cleanup.nextSibling;
            if (cleanup.nodeType === Node.TEXT_NODE && /^\s*$/.test(((cleanup as Text).textContent || ''))) {
              cleanup.parentNode?.removeChild(cleanup);
              cleanup = next; trims++; continue;
            }
            if (cleanup instanceof HTMLElement) {
              const text = (cleanup.textContent || '').replace(/[_\s\u00A0]+/g, '');
              if (!text && !cleanup.querySelector('img,table,video')) { cleanup.remove(); cleanup = next; trims++; continue; }
            }
            break;
          }
        }
      } catch {}
    }

    // Inline typed-signature UX: button opens editor, choose style, replace customer name with cursive text, double-click to edit
  (function setupInlineSignature(){
      // If the template already ships its own inline signature editor + script, skip to avoid duplicates.
      const preboundEditor = root.querySelector('#signature-editor') as HTMLElement | null;
      if (preboundEditor) return;

      // Ensure editor modal exists (do NOT inject extra Add Signature buttons; bottom panel button remains)
      const ensureControls = () => {
        // Only create the editor modal; skip creating any floating/anchored Add Signature buttons
        let editor = root.querySelector('#signature-editor') as HTMLElement | null;
        if (!editor) {
          editor = document.createElement('div'); editor.id = 'signature-editor';
          // lightweight modal overlay
          editor.setAttribute('style', [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.4)',
            'display:none',
            'z-index:9999',
          ].join(';'));
          const panel = document.createElement('div');
          panel.setAttribute('style', [
            'position:absolute',
            'left:50%',
            'top:50%',
            'transform:translate(-50%,-50%)',
            'background:#fff',
            'padding:16px',
            'border-radius:10px',
            'min-width:280px',
            'max-width:90vw',
            'box-shadow:0 10px 30px rgba(0,0,0,0.25)',
            'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif',
          ].join(';'));
          panel.innerHTML = `
            <h3 style="font-size:16px; font-weight:600; margin:0 0 8px;">Add your signature</h3>
            <label for="signature-input" style="display:block; font-size:12px; color:#334155; margin-bottom:4px;">Enter legal homeowner's name</label>
            <input id="signature-input" type="text" placeholder="Type full legal name" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:8px; font-size:14px;" />
            <div class="samples" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;">
              <div class="sample" data-font="'Snell Roundhand', 'Brush Script MT', cursive" style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; cursor:pointer; text-align:center;">Sample</div>
              <div class="sample" data-font="'Lucida Handwriting', 'Segoe Script', cursive" style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; cursor:pointer; text-align:center;">Sample</div>
              <div class="sample" data-font="'Segoe Script', 'Brush Script MT', cursive" style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; cursor:pointer; text-align:center;">Sample</div>
              <div class="sample" data-font="'Brush Script MT', 'Snell Roundhand', cursive" style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; cursor:pointer; text-align:center;">Sample</div>
            </div>
            <div class="actions" style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
              <button class="cancel" id="signature-cancel" style="background:#e2e8f0; color:#0f172a; border:none; border-radius:6px; padding:8px 10px; cursor:pointer;">Cancel</button>
              <button id="signature-apply" style="background:#0f172a; color:#fff; border:none; border-radius:6px; padding:8px 10px; cursor:pointer;">Use this signature</button>
            </div>
          `;
          editor.appendChild(panel);
          document.body.appendChild(editor);
        }
        // No button wrapper returned; keep API consistent with undefined btnWrap
        return { btnWrap: null as unknown as HTMLElement | null, editor };
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
        // Ensure the host can position absolute children
        if (getComputedStyle(host).position === 'static') { (host as HTMLElement).style.position = 'relative'; }
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
  const btn = btnWrap?.querySelector?.('#add-signature-btn') as HTMLButtonElement | null;
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
  // Expose global opener for React UI fallback button
  try { (window as any).hytechOpenSignatureEditor = () => openEditor(nameSpan?.textContent || ''); } catch {}
  // Also listen for a custom event so React UI can safely trigger without function refs
  const onOpenEvt = () => openEditor(nameSpan?.textContent || '');
  try { window.addEventListener('hytech:open-signature', onOpenEvt as any); } catch {}
  // Global helper so React UI can reliably trigger the signature modal
  try { (window as any).hytechOpenSignatureEditor = () => openEditor(nameSpan?.textContent || ''); } catch {}

      // Render a canvas signature and return a data URL image
  const renderSignature = (name: string, font: string): string => {
        const scale = Math.min(3, Math.max(1.5, (window.devicePixelRatio || 1)));
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d'); if (!ctx) return '';
  const fontSize = 84; // larger visual size for signature
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
        // position the signature image just above the printed name line, near bottom-left of the cell
        img.style.position = 'absolute';
        img.style.left = '12px';
        img.style.bottom = '28px';
  img.style.height = '72px';
        img.style.width = 'auto';
        img.style.pointerEvents = 'none';
        if (!img.parentElement) display.appendChild(img);
        // Also store a hidden text marker so detectors and fallbacks can read it
        let marker = display.querySelector('.e-signature') as HTMLElement | null;
        if (!marker) {
          marker = document.createElement('span');
          marker.className = 'e-signature';
          // Visually hidden but present in DOM
          marker.style.display = 'none';
          display.appendChild(marker);
        }
        marker.textContent = text;
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
        try { setName(txt as any); } catch {}
        closeEditor();
        // hide the floating button after signing
        const btnWrap = document.getElementById('signature-controls');
        if (btnWrap) btnWrap.style.display = 'none';
      };
      const onCancel = () => closeEditor();

  // Only the bottom-panel Add Signature button will open the editor; no extra buttons injected here
  if (btn) btn.addEventListener('click', onOpen);
  // Do not auto-open the inline editor by clicking the document; React modal handles opening
      if (applyBtn) applyBtn.addEventListener('click', onApply);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);

      // Cleanup on unmount/HMR
      return () => {
        try {
          if (btn) btn.removeEventListener('click', onOpen);
          if (applyBtn) applyBtn.removeEventListener('click', onApply);
          if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
          samples.forEach(s => s.removeEventListener('click', onSample));
          try { window.removeEventListener('hytech:open-signature', onOpenEvt as any); } catch {}
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

  // (Trim setup is defined earlier with strict detection)
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

      // Inject checkboxes for each Windows & Doors line and default them unchecked
      for (const it of items) {
        if (!(it.amount > 0)) continue;
        const cb = attachCheckbox(it.labelRe, it.amount);
        if (cb) cb.checked = false;
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
  // Initial compute after injection
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
  setupTrimSection();
  ensureTrimPhotosFallback(root);
  ensureNorthGateGBBPill(root);
  ensureAsphaltColorBlank(root);
  // Color dropdowns removed
  // First, apply selection gating so sections are tagged with data-section
  try { applySelectionGating(root); } catch {}
  // Then enhance sections in a sandboxed manner to avoid cross-section interference
  try { enhanceAllSections(root); } catch {}
  // Recover any orphaned checkboxes by wrapping them back into pills
  ensureLooseCheckboxPills(root);
  ensurePillVisibility(root);
  // Run gating again to ensure visibility after injections
  hideUnusedExtras(root);
  ensureSectionDividers(root);
  try { restoreColorGuards?.(); } catch {}
      // Remove any pills accidentally injected into the Carpentry clause
      stripCarpCheckboxes(root);
      // Run user customizer hook if present
      try {
        // @ts-ignore
        if (typeof window.elinkCustomize === 'function') {
          // @ts-ignore
          window.elinkCustomize(root, { snapshot, proposal });
        }
      } catch {}
      // Ensure pills remain visible even after user customizer runs
      ensurePillVisibility(root);
    // Extras border/divider visuals removed per rollback
  // Stabilization retries to survive late DOM swaps during initial render
  const reapply = () => { 
        setupTrimSection(); 
        ensureTrimPhotosFallback(root); 
        ensureNorthGateGBBPill(root); 
        ensureAsphaltColorBlank(root); 
        // Tag sections and apply scoped money wrappers instead of global
        try { applySelectionGating(root); } catch {}
        try { enhanceAllSections(root); } catch {}
        ensureLooseCheckboxPills(root); 
        ensurePillVisibility(root); 
        ensureSectionDividers(root); 
        try { restoreColorGuards?.(); } catch {}; 
        stripCarpCheckboxes(root); 
      };
  setTimeout(reapply, 0);
  setTimeout(reapply, 150);
  setTimeout(reapply, 400);
      // Periodic re-enforcer for first few seconds: if all checkboxes vanish, re-apply
      let ticks = 0;
      const iv = setInterval(() => {
        try {
          const any = root.querySelector('.proposal-price-checkbox');
          if (!any) reapply();
          if (++ticks >= 24) { clearInterval(iv); }
        } catch { clearInterval(iv); }
      }, 250);
  cleanupFnsRef.current.push(() => clearInterval(iv));
    })();

    // Guard against late DOM mutations wiping our enhancements: re-apply on subtree changes (throttled)
    (function guardEnhancements(){
      let scheduled = false;
  const run = () => {
        try {
          setupTrimSection();
          ensureTrimPhotosFallback(root);
          ensureNorthGateGBBPill(root);
          ensureAsphaltColorBlank(root);
          // Color dropdowns removed
      // Tag and enhance sections locally to avoid cross-section clobbering
      try { applySelectionGating(root); } catch {}
      try { enhanceAllSections(root); } catch {}
  ensureLooseCheckboxPills(root);
  applySelectionGating(root);
  ensureSectionDividers(root);
    try { /* re-apply COLOR: lines if altered */ } catch {}
    stripCarpCheckboxes(root);
          // User customizer hook on subsequent mutations
          try {
            // @ts-ignore
            window.elinkCustomize?.(root, { snapshot, proposal });
          } catch {}
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
  cleanupFnsRef.current.push(() => mo.disconnect());
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

    // Synthetic siding and other siding sections: ensure TOTAL row renders a pill+checkbox
    (function setupSidingTotal(){
      try {
        const tables = Array.from(root.querySelectorAll('table[data-section^="siding:"]')) as HTMLElement[];
        if (!tables.length) return;
        const totalRe = /TOTAL\s+(?:SIDING\s+)?INVESTMENT\s*:/i;
        for (const tbl of tables) {
          const rows = Array.from(tbl.querySelectorAll('tr')) as HTMLTableRowElement[];
          if (!rows.length) continue;
          const totalRow = rows.find(r => totalRe.test(r.textContent || '')) || null;
          if (!totalRow) continue;
          const cells = Array.from(totalRow.querySelectorAll('td,th')) as HTMLElement[];
          if (!cells.length) continue;
          let amountCell: HTMLElement | null = null;
          for (const cell of cells.slice().reverse()) {
            if (/\$\s*[0-9]/.test(cell.textContent || '')) { amountCell = cell; break; }
          }
          if (!amountCell) {
            amountCell = cells[cells.length - 1];
          }
          if (!amountCell) continue;
          const amt = parseMoney(amountCell.textContent || '');
          if (!(amt > 0)) continue;
          try { amountCell.setAttribute('data-siding-total', '1'); } catch {}
          Array.from(amountCell.querySelectorAll('label.price-choice,input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());
          const label = document.createElement('label');
          label.className = 'price-choice';
          const span = document.createElement('span');
          span.textContent = fmt(amt);
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.className = 'proposal-price-checkbox';
          input.setAttribute('data-amount', String(amt));
          label.appendChild(span);
          label.appendChild(input);
          amountCell.innerHTML = '';
          amountCell.appendChild(label);
        }
      } catch {}
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
    // Prefer a final total that is NOT inside a G/B/B table, so Asphalt G/B/B rows never get excluded
    const inGBBTable = (el: HTMLElement | null) => {
      const tbl = el ? (el.closest('table') as HTMLElement | null) : null;
      return !!findGBBHeaderRow(tbl);
    };

    let finalTotalEl: HTMLElement | null = null;
    const finalCandidates = totalEls.filter(el => /TOTAL\s+INVESTMENT\s*:/i.test(el.textContent || ''));
    if (finalCandidates.length) {
      // choose the last candidate that is not in a GBB table; fallback to the last one
      for (let i = finalCandidates.length - 1; i >= 0; i--) {
        if (!inGBBTable(finalCandidates[i])) { finalTotalEl = finalCandidates[i]; break; }
      }
      if (!finalTotalEl) finalTotalEl = finalCandidates[finalCandidates.length - 1];
    }
    if (finalTotalEl && !finalTotalEl.querySelector('#final-total-investment')) {
      // Insert a numeric-only span after the first '$' within the final TOTAL INVESTMENT label
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
        after = after.replace(/^[ _\u00A0]+/, ' ');
        const parent = target.parentNode as Node;
        parent.insertBefore(document.createTextNode(before), target);
        parent.insertBefore(span, target);
        parent.insertBefore(document.createTextNode(after), target);
        parent.removeChild(target);
      } else {
        // Fallback: append to the container
        finalTotalEl.appendChild(span);
      }
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

    // For every section-level total (all but the final overall), add a checkbox next to its price so it can be included in the running total.
    const nonFinalTotals = totalEls.filter(el => el !== finalTotalEl);
    const moneyRe = /(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)/;
    let injected: HTMLInputElement[] = [];
  for (const sec of nonFinalTotals) {
      // Skip rows that are controlled by public/elink-overrides.js (Asphalt TOTAL authority)
      const owningRow = (sec.closest('tr') as HTMLElement | null);
      if (owningRow && owningRow.getAttribute('data-gbb-authority') === 'asphalt') continue;
      // Skip if already has a checkbox injected
      if (sec.querySelector('input.proposal-price-checkbox')) continue;
      // HARD SKIPS to protect Trim
      // 1) If this total label is inside the Trim total container (or under it), skip
      if (sec.closest('[data-trim-total="1"]')) continue;
      // 2) If this total label is in the Trim table, skip (we manage Trim via `.trim-total-amount`)
      const secTable = sec.closest('table') as HTMLElement | null;
      if (secTable && (secTable as HTMLElement).classList?.contains('trim-work-table')) continue;
      // 3) If this total row contains a Trim table (colspan/nested), skip
      const rowHost = (sec.closest('tr') as HTMLElement | null);
      if (rowHost && rowHost.querySelector('table.trim-work-table')) continue;
      // 4) If an adjacent row/cell near this label contains the Trim table, skip as well
      const nearTrim = !!(
        (rowHost?.previousElementSibling && (rowHost.previousElementSibling as HTMLElement).querySelector?.('table.trim-work-table')) ||
        (rowHost?.nextElementSibling && (rowHost.nextElementSibling as HTMLElement).querySelector?.('table.trim-work-table')) ||
        (sec.previousElementSibling && (sec.previousElementSibling as HTMLElement).closest?.('table.trim-work-table')) ||
        (sec.nextElementSibling && (sec.nextElementSibling as HTMLElement).closest?.('table.trim-work-table'))
      );
      if (nearTrim) continue;
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
          // Never rewrite a cell that contains or nests the Trim table (colspan/nested Word markup)
          if (cell.querySelector('table.trim-work-table')) continue;
          // Skip cells already wrapped or containing a checkbox
          if ((cell as HTMLElement).closest && (cell as HTMLElement).closest('label.price-choice')) continue;
          if (cell.querySelector('input.proposal-price-checkbox')) continue;
          // Respect Asphalt TOTAL authority for the entire row
          const rowHost = (rowScope.closest ? (rowScope.closest('tr') as HTMLElement | null) : null) || (sec.closest('tr') as HTMLElement | null);
          if (rowHost && rowHost.getAttribute('data-gbb-authority') === 'asphalt') continue;
          const gbb2 = isAsphaltGBBPrice(cell);
          const html0 = cell.innerHTML;
          let changed = false;
          // Try contiguous money pattern first
          if (/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)(?!\s*[A-Za-z])/.test(html0)) {
            cell.innerHTML = html0.replace(/(\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?)(?!\s*[A-Za-z])/g, (m) => {
              const amt = Number(m.replace(/[^0-9.\-]/g, ''));
              changed = true;
              return `<label class=\"price-choice${gbb2 ? ' gbb' : ''}\"><span>${m}</span><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
            });
            changed = true;
          }
          // If still missing, handle values split across tags (e.g., <$>$</$><$>18,416.00</$>)
          if (!cell.querySelector('input.proposal-price-checkbox')) {
            const crossRe = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;
            const newHtml = html0.replace(crossRe, (seg) => {
              const plain = seg.replace(/<[^>]*>/g, '');
              const m = plain.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
              if (!m) return seg;
              const amt = m ? Number((m[1] || '').replace(/[^0-9.\-]/g, '')) : 0;
              if (!isFinite(amt) || amt <= 0) return seg;
              // Guard: don't wrap if immediate letter follows the number (units like "mil")
              const after = plain.slice(plain.indexOf(m[1]) + m[1].length);
              const next = (after.match(/^(?:\s|\u00A0)*([^\s\u00A0])/ )||[])[1] || '';
              if (/^[A-Za-z]/.test(next)) return seg;
              return `<label class=\"price-choice${gbb2 ? ' gbb' : ''}\">${seg}<input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"></label>`;
            });
            if (newHtml !== html0) { cell.innerHTML = newHtml; changed = true; }
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

  // Also add the Trim total container if marked, so generic wrappers skip it entirely
  try {
    const trimTotals = Array.from(root.querySelectorAll('[data-trim-total="1"]')) as HTMLElement[];
    for (const el of trimTotals) totalContainers.add(el);
  } catch {}

  // Note: We intentionally skip the text-node walker to avoid duplicate injections across nested Word tags;
  // the supplemental per-element passes below handle both contiguous and cross-tag prices safely.

  // Supplemental pass 1: per-element contiguous money replacement for any remaining prices without checkboxes
  {
      const candidates = Array.from(root.querySelectorAll('*')) as HTMLElement[];
      for (const el of candidates) {
    // Skip Windows & Doors table entirely
  if ((el.closest && el.closest('table.windows-doors-table')) || el.matches?.('table.windows-doors-table')) continue;
  // Skip anything inside the Skylights section/table to avoid interfering with specialized logic
  if (elemInAny(el, skylightsContainers)) continue;
        // Skip if within any known TOTAL container (overall, gutters, siding, trim)
        if (elemInAny(el, totalContainers)) continue;
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
          return `<label class=\"price-choice\"><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\"><span>${safe}</span></label>`;
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
  // Skip anything inside the Skylights section/table to avoid interfering with specialized logic
  if (elemInAny(el, skylightsContainers)) continue;
        // Skip if within any known TOTAL container (overall, gutters, siding, trim)
        if (elemInAny(el, totalContainers)) continue;
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
          return `<label class=\"price-choice${gbb5 ? ' gbb' : ''}\"><input type=\"checkbox\" class=\"proposal-price-checkbox\" data-amount=\"${amt}\">${seg}</label>`;
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
        // Helper: prune any trailing numeric tokens or $ signs AFTER the skylight total span
        const pruneSkylightHost = (host: HTMLElement | null) => {
          if (!host) return;
          const anchor = host.querySelector('.skylight-total-amount') as HTMLElement | null;
          if (!anchor) return;
          
          // DO NOT clean before the span - we want to keep "$ " before the amount
          // Clean AFTER the span: remove numeric duplicates and stray $ signs
          let sib: Node | null = anchor.nextSibling;
          let steps = 0;
          const isNumericToken = (s: string) => /^(?:\$\s*)?[0-9][0-9,]*(?:\.[0-9]{2})?$/.test(s.trim());
          while (sib && steps < 20) {
            const next = sib.nextSibling;
            if (sib.nodeType === Node.TEXT_NODE) {
              const s = (sib as Text).textContent || '';
              // remove placeholder underscores/nbsp
              if (/^[_\s\u00A0]+$/.test(s)) { sib.parentNode?.removeChild(sib); sib = next; steps++; continue; }
              // remove a solitary trailing dollar sign
              if (/^\s*\$\s*$/.test(s)) { sib.parentNode?.removeChild(sib); sib = next; steps++; continue; }
              // remove pure numeric token (with optional leading $)
              if (isNumericToken(s)) { sib.parentNode?.removeChild(sib); sib = next; steps++; continue; }
              // Also strip trailing $ from text nodes that have other content
              if (s.includes('$')) {
                const cleaned = s.replace(/\s*\$\s*$/, '');
                if (cleaned !== s) {
                  if (cleaned.trim()) {
                    (sib as Text).textContent = cleaned;
                  } else {
                    sib.parentNode?.removeChild(sib); sib = next; steps++; continue;
                  }
                }
              }
            } else if (sib instanceof HTMLElement) {
              // Remove any leftover pills or checkbox inputs
              Array.from(sib.querySelectorAll('label.price-choice, input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());
              const t2 = (sib.textContent || '').replace(/\s+/g, ' ').trim();
              if (!t2) { sib.remove(); sib = next; steps++; continue; }
              if (t2 === '$') { sib.remove(); sib = next; steps++; continue; }
              if (isNumericToken(t2)) { sib.remove(); sib = next; steps++; continue; }
            }
            // stop when we hit non-placeholder non-numeric content
            break;
          }
          // If multiple skylight-total-amount spans exist, keep only the first
          const spans = Array.from(host.querySelectorAll('.skylight-total-amount')) as HTMLElement[];
          spans.slice(1).forEach(sp => sp.remove());
          
          // FINAL PASS: scan text nodes ONLY after the span and remove $ and numeric duplicates
          const allNodes: Node[] = [];
          const collectNodes = (node: Node) => {
            allNodes.push(node);
            for (let i = 0; i < node.childNodes.length; i++) {
              collectNodes(node.childNodes[i]);
            }
          };
          collectNodes(host);
          
          // Find the span's position
          const spanIdx = allNodes.indexOf(anchor);
          if (spanIdx >= 0) {
            // Clean nodes that come AFTER the span: remove $ symbols and duplicate numbers
            for (let i = spanIdx + 1; i < allNodes.length; i++) {
              const node = allNodes[i];
              if (node.nodeType === Node.TEXT_NODE) {
                const tn = node as Text;
                const txt = tn.textContent || '';
                // Remove pure numeric tokens like "0.00" or "5800.00"
                if (/^\s*[0-9][0-9,]*(?:\.[0-9]{2})?\s*$/.test(txt)) {
                  tn.parentNode?.removeChild(tn);
                }
                // Also strip any $ symbols from text nodes after the span
                else if (txt.includes('$')) {
                  const cleaned = txt.replace(/\$/g, '');
                  if (cleaned.trim()) {
                    tn.textContent = cleaned;
                  } else {
                    tn.parentNode?.removeChild(tn);
                  }
                }
              }
            }
          }
        };
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
            const idx = t.search(m[0]) + m[0].length; // position after ':'
            const before = t.slice(0, idx);
            let after = t.slice(idx);
            const parent = tn.parentNode as Node;
            const frag = document.createDocumentFragment();
            // Extract and move any $ to before the number
            // Template might have: "INVESTMENT: 0.00 $" or "INVESTMENT: $ 0.00"
            let dollarPart = ' $';  // Always add dollar before number
            // Remove all placeholder content including any $ that was in the template
            after = after.replace(/^[\s_\[\]0-9,.\u00A0$]+/, '');
            // Build: "INVESTMENT:" + " $" + span + remaining text
            frag.appendChild(document.createTextNode(before + dollarPart + ' '));
            frag.appendChild(span);
            if (after.trim()) frag.appendChild(document.createTextNode(after));
            parent?.replaceChild(frag, tn);

            // Clean up immediate siblings that are only $, [, ], underscores, or nbsp placeholders
            const isOnlyJunk = (n: Node) => {
              try {
                let s = '';
                if (n.nodeType === Node.TEXT_NODE) s = (n as Text).textContent || '';
                else if (n instanceof HTMLElement) s = n.textContent || '';
                else return false;
                s = s.replace(/\s+/g, ' ').trim();
                return s === '' || /^[\$_\[\]\s\u00A0\-–—]+$/.test(s);
              } catch { return false; }
            };
            const removeLeadingNumberFromNode = (n: Node) => {
              try {
                if (n.nodeType === Node.TEXT_NODE) {
                  const s0 = (n as Text).textContent || '';
                  const m2 = s0.match(/^\s*[0-9][0-9,]*(?:\.[0-9]{2})?/);
                  if (m2) {
                    const rest = s0.slice(m2[0].length);
                    if (!rest.trim()) { n.parentNode?.removeChild(n); return true; }
                    (n as Text).textContent = rest;
                    return true;
                  }
                } else if (n instanceof HTMLElement) {
                  const t2 = (n.textContent || '').replace(/\s+/g, ' ').trim();
                  if (/^(?:\$\s*)?[0-9][0-9,]*(?:\.[0-9]{2})?$/.test(t2)) { n.remove(); return true; }
                }
              } catch {}
              return false;
            };
            let sib: Node | null = (span.nextSibling as Node | null);
            let steps = 0;
            while (sib && steps < 8) {
              const next = sib.nextSibling;
              if (isOnlyJunk(sib)) {
                sib.parentNode?.removeChild(sib);
                sib = next; steps++; continue;
              }
              // If element contains only placeholders deeper inside, clear them
              if (sib instanceof HTMLElement) {
                const texts = sib.querySelectorAll('*');
                if (!texts.length && /^_+$/.test((sib.textContent || '').replace(/\s+/g, ''))) { sib.remove(); sib = next; steps++; continue; }
              }
              // Remove a single immediate numeric token following the inserted span to avoid duplicate "0.00"
              if (removeLeadingNumberFromNode(sib)) { sib = next; steps++; continue; }
              break;
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
        // If inline exists, DON'T add a dollar sign (the span shows numeric-only, template has its own $)
  if (inlineAmtSpan) {
          // Choose the smallest reasonable container for the inline label (avoid wide table cells)
          let labelHost = inlineAmtSpan.closest('span,p,div') as HTMLElement | null;
          if (!labelHost) labelHost = inlineAmtSpan.parentElement as HTMLElement | null;
          // Mark only this small host so generic wrappers skip it
          try { labelHost?.setAttribute('data-skylight-total-host', '1'); } catch {}
          // Remove any price pill accidentally placed right in this label host, but never from inside tables
          if (labelHost) {
            const pills = Array.from(labelHost.querySelectorAll('label.price-choice')) as HTMLElement[];
            for (const p of pills) { if (p.closest('table')) continue; p.remove(); }
          }
          // Prune any stray $ or numeric duplicates around the span
          pruneSkylightHost(labelHost || inlineAmtSpan.parentElement as HTMLElement | null);
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
        // Mark the host cell as a skylight total host for wrapper skips
        try { (totalCell as HTMLElement)?.setAttribute('data-skylight-total-host', '1'); } catch {}
              // Clean up immediate underscore runs that may follow due to Word markup
              let sib: Node | null = span.nextSibling;
              let steps = 0;
              while (sib && steps < 6) {
                if (sib.nodeType === Node.TEXT_NODE) {
                  const s = (sib as Text).textContent || '';
                  if (/^[_\s\u00A0]+$/.test(s)) { const rm = sib; sib = sib.nextSibling; rm.parentNode?.removeChild(rm); continue; }
                  // Remove an immediate solitary trailing '$'
                  if (/^\s*\$\s*$/.test(s)) { const rm = sib; sib = sib.nextSibling; rm.parentNode?.removeChild(rm); continue; }
                  // Also strip an immediate standalone numeric token like "0.00" to avoid duplicates
                  const m2 = s.match(/^\s*[0-9][0-9,]*(?:\.[0-9]{2})?/);
                  if (m2) {
                    const rest = s.slice(m2[0].length);
                    if (!rest.trim()) { const rm = sib; sib = sib.nextSibling; rm.parentNode?.removeChild(rm); continue; }
                    (sib as Text).textContent = rest.replace(/^\s+/, ' ');
                    break;
                  }
                  (sib as Text).textContent = s.replace(/^[_\s\u00A0]+/, ' ');
                  break;
                } else if (sib instanceof HTMLElement) {
                  const s = sib.textContent || '';
                  if (/^[_\s\u00A0]+$/.test(s)) { const rmEl = sib; sib = sib.nextSibling; rmEl.remove(); continue; }
                  if (s.trim() === '$') { const rmEl = sib; sib = sib.nextSibling; rmEl.remove(); continue; }
                  // If the next element is just a numeric token, remove it
                  const t2 = (sib.textContent || '').replace(/\s+/g, ' ').trim();
                  if (/^(?:\$\s*)?[0-9][0-9,]*(?:\.[0-9]{2})?$/.test(t2)) { const rm = sib; sib = sib.nextSibling; rm.remove(); continue; }
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
            if (span) { try { (totalCell as HTMLElement).setAttribute('data-skylight-total-host', '1'); } catch {} return span; }
          }
          // Last resort: append near the beginning of the totalCell content
          span = document.createElement('span');
          span.className = 'skylight-total-amount';
          span.textContent = fmt(0).replace(/^\s*\$\s*/, '');
          // Prefer inserting after the first '$' we can find anywhere in the cell
          const anyDollar = totalCell.querySelector('*');
          totalCell.appendChild(span);
          try { (totalCell as HTMLElement).setAttribute('data-skylight-total-host', '1'); } catch {}
          return span;
        };
  ensureTotalDisplay();
  pruneSkylightHost(totalCell as HTMLElement);
  // If a table-cell skylight total exists, remove any other skylight total spans elsewhere (prefer single source of truth)
  try {
    const tableSpan = totalCell.querySelector('.skylight-total-amount') as HTMLElement | null;
    if (tableSpan) {
      const all = Array.from(rootEl.querySelectorAll('.skylight-total-amount')) as HTMLElement[];
      for (const s of all) {
        if (s === tableSpan) continue;
        // Only remove spans that are not inside this same total cell
        if (!totalCell.contains(s)) {
          // Also clean up any immediate leftover numeric or placeholder nodes around the removed span's position
          const parent = s.parentNode as Node | null;
          const prev = s.previousSibling;
          const next = s.nextSibling;
          s.remove();
          const isPlace = (n: Node | null) => {
            if (!n) return false;
            if (n.nodeType === Node.TEXT_NODE) return /^[_\s\u00A0]*$/.test(((n as Text).textContent || ''));
            return false;
          };
          if (prev && isPlace(prev) && prev.parentNode) prev.parentNode.removeChild(prev);
          if (next && isPlace(next) && next.parentNode) next.parentNode.removeChild(next);
        }
      }
    }
  } catch {}
  // Explicitly strip any pills/checkboxes from the Skylights total cell to ensure it's display-only
  try {
    // Unwrap any label.price-choice by keeping its inner span/text and removing the input
    const labs = Array.from(totalCell.querySelectorAll('label.price-choice')) as HTMLElement[];
    for (const lab of labs) {
      const parent = lab.parentElement as HTMLElement | null;
      if (!parent) continue;
      // Prefer the price text span inside the label, if present
      const priceSpan = lab.querySelector('span');
      // Remove any checkbox inside the label
      Array.from(lab.querySelectorAll('input.proposal-price-checkbox')).forEach(inp => (inp as HTMLElement).remove());
      if (priceSpan) {
        parent.insertBefore(priceSpan, lab);
        lab.remove();
      } else {
        // Fallback: replace with plain text preserving existing text content
        const txt = (lab.textContent || '').trim();
        const node = document.createTextNode(txt);
        parent.insertBefore(node, lab);
        lab.remove();
      }
    }
    // Also remove any stray checkbox inputs that might be outside labels
    Array.from(totalCell.querySelectorAll('input.proposal-price-checkbox')).forEach(el => (el as HTMLElement).remove());
  } catch {}
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

  // Trim section handled earlier via strict detection; legacy heuristic block removed
      setupTrimSection();

      // Section totals enhancer disabled on View (handled by template/print)

    // Photos are rendered by template loops ({#photos_*}{%image}{/...}) using renderer data; no client injection.

  // Last-resort global injection: wrap any visible $amount with a checkbox pill, skipping TOTAL lines
    // and already-processed regions. This guarantees checkboxes show up across sections.
  (function ensureGlobalMoneyCheckboxes(){
      try {
        // Prefer scoped enhancement; this is only a last resort for stray amounts
        try { applySelectionGating(root); } catch {}
        try { enhanceAllSections(root); } catch {}
  const elements = Array.from(root.querySelectorAll('td,th,p,div,span')) as HTMLElement[];
  const moneyCrossTag = /\$[\s\S]{0,400}?[0-9][0-9,]*(?:\.[0-9]{2})?/g;
        const isTotalLabel = (s: string) => /TOTAL\s+(?:INVESTMENT|GUTTER\s+INVESTMENT|SIDING\s+INVESTMENT|SKYLIGHT\s+INVESTMENT)\s*:/i.test(s);
        for (const el of elements) {
          // Skip if inside a price-choice already or inside Windows & Doors (handled earlier)
          if (el.closest('label.price-choice')) continue;
          if (el.closest('table.windows-doors-table')) continue;
          if (el.querySelector('input.proposal-price-checkbox')) continue;
      // Skip inside Trim total container or Trim table host to avoid disrupting placed pills
      if (el.closest('[data-trim-total="1"], table.trim-work-table')) continue;
      // Skip skylight total hosts and the skylights table itself
      if (el.closest('[data-skylight-total-host="1"]')) continue;
      const inSkylights = (() => { const tbl = el.closest('table'); return tbl && /SKYLIGHTS/i.test(tbl.textContent || ''); })();
      if (inSkylights) continue;
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
          // Do not strip if this label is within the Trim section (avoid overreach when styles are similar)
          if (lab.closest('table.trim-work-table')) continue;
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

    // Apply side-by-side signature layout - only for ACCEPTED BY and SUBMITTED BY at the bottom
    (function applySignatureLayout(){
      try {
        const tables = Array.from(root.querySelectorAll('table')) as HTMLElement[];
        
        // Find specifically the ACCEPTED BY and SUBMITTED BY tables (not DATE OF ACCEPTANCE)
        let acceptedByTable: HTMLElement | null = null;
        let submittedByTable: HTMLElement | null = null;
        
        for (const t of tables) {
          const txt = t.textContent || '';
          // Only match tables that have ACCEPTED BY (not DATE OF ACCEPTANCE)
          if (/^\s*ACCEPTED\s+BY\s*:/i.test(txt.trim()) || (/ACCEPTED\s+BY\s*:/i.test(txt) && !/DATE\s+OF\s+ACCEPTANCE/i.test(txt))) {
            acceptedByTable = t;
          }
          // Only match tables that have SUBMITTED BY
          if (/^\s*SUBMITTED\s+BY\s*:/i.test(txt.trim()) || (/SUBMITTED\s+BY\s*:/i.test(txt) && !/DATE\s+OF\s+ACCEPTANCE/i.test(txt))) {
            submittedByTable = t;
          }
        }
        
        // Only apply layout if we found both tables
        if (acceptedByTable && submittedByTable) {
          acceptedByTable.classList.add('signature-section-left');
          submittedByTable.classList.add('signature-section-right');
          
          // Wrap them in a container if they share the same parent
          const parent = acceptedByTable.parentElement;
          if (parent && parent === submittedByTable.parentElement) {
            const container = document.createElement('div');
            container.classList.add('signature-container');
            parent.insertBefore(container, acceptedByTable);
            container.appendChild(acceptedByTable);
            container.appendChild(submittedByTable);
          }
        }
      } catch {}
    })();

    // Remove stray trim-total-amount span showing $0.00
    (function removeStrayTrimTotal(){
      try {
        const trimTotalSpans = root.querySelectorAll('span.trim-total-amount');
        trimTotalSpans.forEach(span => {
          const text = (span.textContent || '').trim();
          // Remove if it's showing $0.00 or similar
          if (/^\$\s*\$?\s*0\.00$/.test(text) || text === '$ $0.00' || text === '$0.00') {
            span.remove();
          }
        });
      } catch {}
    })();

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

  // Unified selection gating across all sections
  (function hideUnselectedExtras(){ try { applySelectionGating(root); } catch {} })();

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
        // Never remove the Trim table, even if a late mutation temporarily drops its inputs
        if ((t as HTMLElement).classList?.contains('trim-work-table')) continue;
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

    // Snapshot cleanup functions to avoid reading ref at cleanup time
    const cleanupFnsSnapshot: Array<() => void> = Array.from(cleanupFnsRef.current || []);

    // Cleanup for HMR / unmount
  return () => {
      try {
        root.removeEventListener('change', onToggle);
        root.removeEventListener('input', onToggle);
        root.removeEventListener('click', onToggle);
  // Remove the local style tag we injected at the top if still present
  const localRestore = document.getElementById('undo-price-borders-restore');
  if (localRestore && localRestore.parentNode) localRestore.parentNode.removeChild(localRestore);
  // Run any registered cleanup fns captured at effect end (avoid reading ref here)
  try {
    for (const fn of cleanupFnsSnapshot) { try { fn(); } catch {} }
  } catch {}
      } catch {}
    };
  }, [html, snapshot, proposal]);

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
      // Consider either a hidden text marker (.e-signature) or an overlay image as a valid signature
      const textEl = host.querySelector('.e-signature') as HTMLElement | null;
      const hasText = !!(textEl && (textEl.textContent || '').trim().length > 0);
      const img = host.querySelector('img.signature-overlay') as HTMLImageElement | null;
      const hasImg = !!(img && (img.getAttribute('src') || '').trim().length > 0);
      const ok = hasText || hasImg;
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
    // Prefer the already-rendered overlay image if present
    const img = root.querySelector('#customer-signature-display img.signature-overlay') as HTMLImageElement | null;
    const src = img ? (img.getAttribute('src') || '') : '';
    if (src) return src;
    // Fallback: render from hidden text marker
    const sigEl = root.querySelector('#customer-signature-display .e-signature') as HTMLElement | null;
    if (!sigEl) return null;
    const text = (sigEl.textContent || '').trim();
    if (!text) return null;
    // Get computed font to approximate the preview
    const cs = window.getComputedStyle(sigEl);
    const fontFamily = cs.fontFamily || 'Apple Chancery, Snell Roundhand, Bradley Hand, Zapfino, cursive';
    // Render on an offscreen canvas
    const paddingX = 24; const paddingY = 16;
  const baseSize = 69; // enlarged to match bigger signature render
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
    
    // Try to capture signature, but generate one if not present
    let dataUrl = captureTypedSignatureDataUrl();
    if (!dataUrl && name) {
      // Generate signature from name if not already rendered
      dataUrl = renderSignaturePng(name, sigFont || "'Snell Roundhand', 'Brush Script MT', cursive");
      if (dataUrl) {
        // Insert it into the document so it's visible
        insertSignatureReact(name, sigFont || "'Snell Roundhand', 'Brush Script MT', cursive");
      }
    }
    if (!dataUrl) return alert('Please enter your name to continue');
    
    try {
      // First, sign the proposal
      const res = await fetch(`/api/proposals/public/${encodeURIComponent(id)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, signatureDataUrl: dataUrl, snapshot }),
      });
      if (!res.ok) throw new Error(await res.text());
      
      // Then, save the signed proposal as HTML to customer files
      try {
        const root = containerRef.current;
        if (root) {
          const htmlContent = root.innerHTML;
          const pdfRes = await fetch(`/api/proposals/public/${encodeURIComponent(id)}/pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ htmlContent }),
          });
          if (!pdfRes.ok) {
            console.warn('HTML save failed:', await pdfRes.text());
          }
        }
      } catch (pdfError) {
        console.warn('HTML generation error:', pdfError);
      }
      
      alert("Proposal accepted and submitted successfully!");
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
                <button
                  type="button"
                  className="px-3 py-1 rounded border border-slate-300 text-slate-700"
                  onClick={() => {
                    // Prefer React modal (reliable), fallback to DOM opener if available
                    setSigName(name || "");
                    setSigFont((prev)=> prev || "'Snell Roundhand', 'Brush Script MT', cursive");
                    setSigOpen(true);
                    // Ensure any inline template editor is hidden to avoid double modals
                    try {
                      const inlineEditor = document.getElementById('signature-editor');
                      if (inlineEditor) inlineEditor.style.display = 'none';
                    } catch {}
                  }}
                >
                  Add Signature
                </button>
                <button className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed" onClick={submit} disabled={!name}>Accept and Submit</button>
              </div>
              <div className="text-xs text-slate-500 mt-2">By clicking &quot;Accept and Submit&quot;, you agree to the proposal terms and authorize HyTech to proceed. Your signature will be automatically generated from your name if you haven&#39;t added one manually.</div>

              {/* Signature Modal (React-controlled) */}
              {sigOpen && (
                <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center">
                  <div className="bg-white rounded-xl shadow-xl p-4 w-[min(640px,92vw)]">
                    <div className="text-base font-semibold mb-2">Add your signature</div>
                    <label className="block text-xs text-slate-600 mb-1">Enter legal homeowner&#39;s name</label>
                    <input
                      className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                      value={sigName}
                      placeholder="Type full legal name"
                      onChange={(e)=> setSigName(e.target.value)}
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {[
                        "'Snell Roundhand', 'Brush Script MT', cursive",
                        "'Lucida Handwriting', 'Segoe Script', cursive",
                        "'Segoe Script', 'Brush Script MT', cursive",
                        "'Brush Script MT', 'Snell Roundhand', cursive",
                      ].map((f, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSigFont(f)}
                          className={`border rounded px-2 py-3 text-lg ${sigFont===f ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                          style={{ fontFamily: f as any }}
                        >
                          {sigName || 'Sample'}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <button type="button" className="px-3 py-1 rounded bg-slate-200 text-slate-800" onClick={()=> setSigOpen(false)}>Cancel</button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-slate-900 text-white"
                        onClick={() => {
                          const text = (sigName || name || '').trim();
                          if (!text) return;
                          const chosen = sigFont || "'Snell Roundhand', 'Brush Script MT', cursive";
                          const ok = insertSignatureReact(text, chosen);
                          if (ok) {
                            setName(text);
                            setHasTypedSig(true);
                            setSigOpen(false);
                            // mark signature as present by triggering observer via DOM change
                          }
                        }}
                      >Use this signature</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  {/* Floating fallback trigger removed – single Add Signature button kept by the I Agree & Sign controls */}
    </div>
  );
}
