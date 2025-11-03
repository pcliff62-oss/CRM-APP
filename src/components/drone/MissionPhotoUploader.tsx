"use client";
import React, { useState } from 'react';

export function MissionPhotoUploader({ missionId, onDone }: { missionId: string; onDone?: () => void }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSelect: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setFiles(e.target.files);
  };

  const upload = async () => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);
    setProgress(0);
    try {
      let uploaded = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fd = new FormData();
        fd.append('file', f);
        fd.append('sequence', String(i));
        const res = await fetch(`/api/drone-missions/${missionId}/photos`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        uploaded++;
        setProgress(Math.round((uploaded / files.length) * 100));
      }
      setMessage(`Uploaded ${files.length} file(s).`);
      setFiles(null);
      onDone?.();
    } catch (e: any) {
      setMessage(e.message || 'Upload error');
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(null), 1500);
    }
  };

  return (
    <div className="border rounded p-3 flex flex-col gap-2">
      <div className="text-sm font-medium">Upload Photos</div>
      <input type="file" accept="image/*" multiple onChange={onSelect} />
      <div className="flex items-center gap-2">
        <button disabled={!files || uploading} onClick={upload} className="px-3 py-1 text-sm rounded bg-black text-white disabled:opacity-50">{uploading ? 'Uploading…' : 'Upload'}</button>
        {progress != null && <span className="text-xs text-muted-foreground">{progress}%</span>}
        {message && <span className="text-xs">{message}</span>}
      </div>
    </div>
  );
}

export default MissionPhotoUploader;
