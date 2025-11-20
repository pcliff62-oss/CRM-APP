"""
End-to-end trainer for roof-plane instance segmentation using Ultralytics YOLO (seg).

It converts ai_worker/ai_data/feedback_*.json into a YOLO segmentation dataset, then trains
and saves weights to ai_worker/weights/roofplanes.pt.

Feedback JSON is expected to contain an array `feedback` with entries of form:
  { type: 'added', newFeature: Feature }
We'll treat every added Polygon as a positive instance. The corresponding image must be
discoverable via one of:
  - measurement.sourceImagePath stored as a public URL (e.g., /uploads/<tenant>/<file>)
  - feedback.imagePath or feedback.image (absolute path) if present
If only a public URL is available, provide the local file path via env LOCAL_PUBLIC_DIR,
which points to the directory that serves "/" (usually <repo>/public). The trainer will
join LOCAL_PUBLIC_DIR with the URL path to read the image.
"""

import argparse, base64, json, os, random
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

DATA_DIR = Path(os.environ.get("AI_DATA_DIR", "ai_data"))
OUT_DIR = DATA_DIR / "dataset_roofplanes"
WEIGHTS_DIR = Path("ai_worker/weights")
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)


def _resolve_image_path(entry: dict) -> Path | None:
    # Priority: explicit file path -> local public path from URL -> embedded base64
    p = entry.get("imagePath") or entry.get("image") or entry.get("image_file")
    if isinstance(p, str) and os.path.isfile(p):
        return Path(p)
    # Try measurement.sourceImagePath nested
    src = entry.get("sourceImagePath") or entry.get("imageUrl")
    if isinstance(src, str) and src.startswith("/"):
        root = os.environ.get("LOCAL_PUBLIC_DIR")
        if root and os.path.isdir(root):
            fs = Path(root) / src.lstrip("/")
            if fs.exists():
                return fs
    return None


def _entry_to_instances(entry: dict) -> List[List[Tuple[float, float]]]:
    polys: List[List[Tuple[float, float]]] = []
    items = entry.get("feedback") or []
    for it in items:
        nf = it.get("newFeature") if isinstance(it, dict) else None
        if not nf or nf.get("type") != "Feature":
            continue
        geom = (nf.get("geometry") or {})
        if geom.get("type") != "Polygon":
            continue
        coords = (geom.get("coordinates") or [])
        if not coords:
            continue
        ring = coords[0]
        if len(ring) < 3:
            continue
        if ring[0] == ring[-1]:
            ring = ring[:-1]
        polys.append([(float(x), float(y)) for x, y in ring])
    return polys


def _write_yolo_seg(label_path: Path, polys: List[List[Tuple[float, float]]], w: int, h: int):
    with label_path.open("w") as f:
        for ring in polys:
            if len(ring) < 3:
                continue
            norm = []
            for (x, y) in ring:
                nx = max(0.0, min(1.0, x / max(1, w)))
                ny = max(0.0, min(1.0, y / max(1, h)))
                norm.extend([nx, ny])
            # Single class 0: roof_plane
            f.write("0 " + " ".join(f"{v:.6f}" for v in norm) + "\n")


def build_dataset(verbose: bool = True) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for split in ("train", "val"):
        (OUT_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (OUT_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    fb_files = sorted(DATA_DIR.glob("feedback_*.json"))
    samples = []
    for fp in fb_files:
        try:
            data = json.loads(fp.read_text())
        except Exception:
            continue
        img_path = _resolve_image_path(data)
        if img_path is None:
            # try to look for sibling *_source.jpg/png with same measurementId
            # skip if not found
            continue
        img = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
        if img is None:
            continue
        polys = _entry_to_instances(data)
        if not polys:
            continue
        samples.append((fp.stem, img, polys))

    if not samples:
        raise RuntimeError("No training samples built. Ensure LOCAL_PUBLIC_DIR is set and feedback JSON includes sourceImagePath or imagePath.")

    random.shuffle(samples)
    n = len(samples)
    n_val = max(1, int(0.15 * n))
    val_idx = set(range(n_val))

    yaml_path = OUT_DIR / "data.yaml"
    yaml_path.write_text(
        f"path: {OUT_DIR.as_posix()}\ntrain: images/train\nval: images/val\nnames:\n  0: roof_plane\n"
    )

    for i, (name, img, polys) in enumerate(samples):
        split = "val" if i in val_idx else "train"
        ip = OUT_DIR / "images" / split / f"{name}.jpg"
        lp = OUT_DIR / "labels" / split / f"{name}.txt"
        h, w = img.shape[:2]
        cv2.imwrite(str(ip), img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        _write_yolo_seg(lp, polys, w, h)

    if verbose:
        print(f"Prepared {n} samples -> {OUT_DIR}")
    return yaml_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--imgsz", type=int, default=1024)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--lr0", type=float, default=1e-3)
    ap.add_argument("--model", type=str, default="yolov8n-seg.pt")
    ap.add_argument("--device", type=str, default="cpu", help="Training device: cpu, mps, or CUDA index like 0")
    ap.add_argument("--resume", action="store_true", help="Continue training from existing roofplanes.pt weights")
    ap.add_argument("--export-metrics", action="store_true", help="Export metrics JSON to ai_worker/metrics/")
    args = ap.parse_args()

    yaml_path = build_dataset()
    weights_path = WEIGHTS_DIR / "roofplanes.pt"

    # Resume logic: if --resume and weights exist, load them directly
    if args.resume and weights_path.exists():
        print(f"[train] Resuming from existing weights: {weights_path}")
        model = YOLO(str(weights_path))
        pretrained_flag = False  # already have weights
    else:
        model = YOLO(args.model)
        pretrained_flag = True

    results = model.train(
        data=str(yaml_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        lr0=args.lr0,
        project="runs/roofplanes",
        name="exp",
        pretrained=pretrained_flag,
        verbose=True,
        device=args.device,
    )
    best = Path(results.save_dir) / "weights" / "best.pt"
    if best.exists():
        dst = weights_path
        dst.write_bytes(best.read_bytes())
        print(f"Saved weights -> {dst}")
    else:
        print("Warning: best.pt not found; check training logs")

    # Metrics export
    if args.export_metrics:
        metrics_dir = Path("ai_worker/metrics")
        metrics_dir.mkdir(parents=True, exist_ok=True)
        metrics_obj = getattr(results, "metrics", None) or getattr(results, "results_dict", None)
        if metrics_obj:
            run_path = metrics_dir / f"metrics_{results.save_dir.name}.json"
            latest_path = metrics_dir / "latest.json"
            try:
                import json as _json
                _json.dump(metrics_obj, run_path.open("w"), indent=2)
                _json.dump(metrics_obj, latest_path.open("w"), indent=2)
                print(f"Exported metrics -> {run_path} & {latest_path}")
            except Exception as e:
                print(f"Metric export failed: {e}")
        else:
            print("No metrics object found to export")


if __name__ == "__main__":
    main()
