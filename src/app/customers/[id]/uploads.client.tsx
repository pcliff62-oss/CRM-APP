"use client";
import { useCallback, useRef, useState } from "react";

export function FileList({ items }: { items: Array<{ id: string; name: string; path: string }> }) {
  const [list, setList] = useState(items);

  async function del(id: string) {
    if (!confirm("Delete this file?")) return;
    const res = await fetch(`/api/uploads?id=${id}`, { method: "DELETE" });
    if (res.ok) setList((l) => l.filter((x) => x.id !== id));
  }

  async function move(id: string, folder: string) {
    const res = await fetch(`/api/uploads`, { method: "PATCH", body: JSON.stringify({ id, folder }) });
    if (res.ok) {
      // optimistic: removed from this group in parent render
    }
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
          <select onChange={(e) => move(f.id, e.target.value)} className="text-xs border rounded px-1 h-7">
            <option>Move to…</option>
            <option>Measurements</option>
            <option>Proposals</option>
            <option>Signed contract</option>
            <option>Docs</option>
          </select>
          <button onClick={() => del(f.id)} className="text-xs text-red-600">Delete</button>
        </li>
      ))}
    </ul>
  );
}

export function DropZone({ contactId, leadId, category, folder, onDone }: { contactId: string; leadId?: string | null; category: string; folder: string; onDone?: () => void }) {
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
    // Use fetch; show coarse progress by file count
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
      className={`p-4 border-2 border-dashed rounded ${drag ? "border-emerald-500 bg-emerald-50" : "border-slate-300"}`}
    >
      <div className="text-sm text-slate-600">Drag & drop files here, or</div>
      <div className="mt-2">
        <button type="button" className="px-3 py-2 rounded-md bg-slate-100" onClick={() => inputRef.current?.click()}>Choose files</button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      {progress !== null && <div className="mt-2 text-xs">Uploading…</div>}
    </div>
  );
}
