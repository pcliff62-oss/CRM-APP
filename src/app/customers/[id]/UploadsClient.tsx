"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";

export function FileList({ items }: { items: Array<{ id: string; name: string; path: string }> }) {
  const [list, setList] = useState(items);

  async function del(id: string) {
    if (!confirm("Delete this file?")) return;
    const res = await fetch(`/api/uploads?id=${id}`, { method: "DELETE" });
    if (res.ok) setList((l) => l.filter((x) => x.id !== id));
  }

  return (
    <ul className="text-sm text-slate-600 space-y-1">
      {list.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-2">
          <a href={`/api/files/${f.id}`} target="_blank" className="hover:underline truncate flex-1">{f.name}</a>
          <a
            href={`/api/files/${f.id}?download=1`}
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50"
            title="Download"
          >Download</a>
          <button onClick={() => del(f.id)} className="text-xs text-red-600">Delete</button>
        </li>
      ))}
    </ul>
  );
}

export function DocumentGrid({ items }: { items: Array<{ id: string; name: string; path?: string }> }) {
  const [list, setList] = useState(items);

  async function del(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this file?")) return;
    const res = await fetch(`/api/uploads?id=${id}`, { method: "DELETE" });
    if (res.ok) setList((l) => l.filter((x) => x.id !== id));
  }

  if (list.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {list.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}`} target="_blank" className="group relative block rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow">
          <button
            type="button"
            aria-label="Delete document"
            title="Delete"
            onClick={(e) => del(e, f.id)}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow hover:bg-red-600"
          >
            ×
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" className="h-5 w-5">
                <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                <path d="M14 3v6h6" />
              </svg>
            </div>
            <div className="min-w-0">
              <div
                className="text-xs font-medium text-slate-900 leading-snug break-words"
                title={f.name}
                style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {f.name}
              </div>
              <div className="text-[10px] text-slate-500 group-hover:text-slate-600">Tap to open</div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

export function PhotoGrid({ items }: { items: Array<{ id: string; name: string; path?: string }> }) {
  const [list, setList] = useState(items);

  async function del(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/uploads?id=${id}`, { method: "DELETE" });
    if (res.ok) setList((l) => l.filter((x) => x.id !== id));
  }

  if (list.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {list.map((f) => (
          <a key={f.id} href={`/api/files/${f.id}`} target="_blank" className="group relative block rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow">
          <button
            type="button"
            aria-label="Delete photo"
            title="Delete"
            onClick={(e) => del(e, f.id)}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] shadow hover:bg-red-600"
          >
            ×
          </button>
          <div className="w-full aspect-[4/3] overflow-hidden bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${f.id}`} alt={f.name} className="h-full w-full object-cover" />
          </div>
          <div className="px-2 py-1 text-xs truncate">{f.name}</div>
        </a>
      ))}
    </div>
  );
}

export function DropZone({ contactId, leadId, category, folder, onDone, children }: { contactId: string; leadId?: string | null; category: string; folder: string; onDone?: () => void; children?: ReactNode }) {
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const data = new FormData();
    data.append("contactId", contactId);
    if (leadId) data.append("leadId", leadId);
    data.append("category", category);
    data.append("folder", folder);
    Array.from(files).forEach((f) => data.append("file", f));
    setProgress(0);
    const res = await fetch("/api/uploads", { method: "POST", body: data });
    setProgress(null);
  if (res.ok) onDone?.();
  }, [contactId, leadId, category, folder, onDone]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      className={`p-4 rounded-2xl bg-white shadow-sm border transition-all ${drag ? "border-emerald-300 ring-2 ring-emerald-300 bg-emerald-50 shadow" : "border-slate-200"}`}
    >
      <div className="text-sm text-slate-600">Drag & drop files here, or</div>
      <div className="mt-2">
        <button type="button" className="px-3 py-2 rounded-md bg-white border border-slate-300 shadow-sm hover:bg-slate-50" onClick={() => inputRef.current?.click()}>Choose files</button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      {progress !== null && <div className="mt-2 text-xs">Uploading…</div>}
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}
