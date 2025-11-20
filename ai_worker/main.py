from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import uvicorn, cv2, numpy as np
from typing import Optional, List, Tuple
from pathlib import Path
import json, time, os
try:
    from shapely.geometry import Polygon, LineString
    from shapely.ops import split as shapely_split
    SHAPELY_AVAILABLE = True
except Exception:
    SHAPELY_AVAILABLE = False
from PIL import Image
import piexif, io, math
from typing import Optional, List

app = FastAPI()
AI_DATA_DIR = Path(os.environ.get("AI_DATA_DIR", "ai_data"))
AI_DATA_DIR.mkdir(parents=True, exist_ok=True)
WEIGHTS_PATH = Path(os.environ.get("AI_WEIGHTS", "ai_worker/weights/roofplanes.pt"))

# Optional Ultralytics model (lazy-load)
_YOLO = None
_MODEL = None
def _maybe_load_model():
    global _YOLO, _MODEL
    if _MODEL is not None:
        return _MODEL
    if not WEIGHTS_PATH.exists():
        return None
    try:
        from ultralytics import YOLO as _U
        _YOLO = _U
        _MODEL = _U(str(WEIGHTS_PATH))
        return _MODEL
    except Exception:
        return None

@app.get("/health")
def health():
    return {"ok": True}

SENSOR_WIDTHS_MM = {
    "DJI Phantom 4 Pro": 13.2,
    "DJI PHANTOM 4 PRO": 13.2,
    "PHANTOM 4 PRO": 13.2,
    "DJI Phantom 4": 6.17,
    "PHANTOM 4": 6.17,
}

def exif_from_bytes(b: bytes):
    try:
        im = Image.open(io.BytesIO(b))
        exif = im.info.get("exif")
        if not exif:
            return {}
        data = piexif.load(exif)
        out = {}
        fl = data["Exif"].get(piexif.ExifIFD.FocalLength)
        if isinstance(fl, tuple) and fl[1] != 0:
            out["focal_length_mm"] = float(fl[0]) / float(fl[1])
        dt = data["Exif"].get(piexif.ExifIFD.DateTimeOriginal)
        if dt:
            out["datetime"] = dt.decode("utf-8", "ignore")
        xdim = data["Exif"].get(piexif.ExifIFD.PixelXDimension) or im.width
        ydim = data["Exif"].get(piexif.ExifIFD.PixelYDimension) or im.height
        out["w_px"], out["h_px"] = int(xdim), int(ydim)
        model = data["0th"].get(piexif.ImageIFD.Model)
        if model:
            out["model"] = model.decode("utf-8", "ignore")
        gps = data.get("GPS", {})
        alt = gps.get(piexif.GPSIFD.GPSAltitude)
        alt_ref = gps.get(piexif.GPSIFD.GPSAltitudeRef, 0)
        if isinstance(alt, tuple) and alt[1] != 0:
            out["gps_altitude_m"] = (float(alt[0])/float(alt[1])) * (-1 if alt_ref == 1 else 1)
        return out
    except Exception:
        return {}

def compute_gsd(exif: dict, assume_alt_agl_m: Optional[float] = None):
    f_mm = exif.get("focal_length_mm", 8.8)
    w_px = exif.get("w_px", 5472)
    model = (exif.get("model") or "").strip()
    sensor_w_mm = SENSOR_WIDTHS_MM.get(model, 6.17)
    alt_m = assume_alt_agl_m if assume_alt_agl_m else exif.get("gps_altitude_m", 30.0)
    fov_w_m = 2 * alt_m * math.tan(math.atan((sensor_w_mm / (2.0 * f_mm))))
    gsd_m_per_px = fov_w_m / float(w_px)
    return gsd_m_per_px

def _fit_rectangle(c: np.ndarray):
    # Return 4-point rectangle from minAreaRect
    rect = cv2.minAreaRect(c)
    box = cv2.boxPoints(rect)
    box = np.int0(box)
    return box

def _is_rectangle_like(c: np.ndarray, approx: np.ndarray) -> bool:
    if len(approx) != 4:
        return False
    # Check near-right angles
    pts = approx.reshape(-1, 2)
    def angle(a, b, c):
        ab = a - b; cb = c - b
        cosang = np.dot(ab, cb) / (np.linalg.norm(ab) * np.linalg.norm(cb) + 1e-6)
        return np.degrees(np.arccos(np.clip(cosang, -1.0, 1.0)))
    angs = []
    for i in range(4):
        angs.append(angle(pts[(i-1)%4], pts[i], pts[(i+1)%4]))
    return all(abs(a - 90) < 20 for a in angs)

def _is_triangle_like(approx: np.ndarray) -> bool:
    return len(approx) == 3

def polygonize(binary_mask: np.ndarray):
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 2500:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if _is_rectangle_like(c, approx):
            box = _fit_rectangle(c)
            pts = box.reshape(-1, 2).tolist()
        elif _is_triangle_like(approx):
            pts = approx.squeeze(1).tolist()
        else:
            # Try to simplify but keep convex hull to avoid self-intersections
            hull = cv2.convexHull(c)
            simp = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True)
            # If still too many points, take min area rect
            if len(simp) > 6:
                box = _fit_rectangle(c)
                pts = box.reshape(-1, 2).tolist()
            else:
                pts = simp.squeeze(1).tolist()
        polys.append(pts)
    return polys

def _detect_interior_lines(img: np.ndarray, mask: Optional[np.ndarray], max_lines: int, aggressive: bool) -> List[Tuple[Tuple[float,float], Tuple[float,float]]]:
    """Detect strong interior ridge/valley lines using FastLineDetector (ximgproc) then return segments.
    The mask, if provided, restricts detection to the roof region.
    """
    try:
        fld = cv2.ximgproc.createFastLineDetector(_length_threshold := 10 if aggressive else 20,
                                                  _distance_threshold := 1.414,
                                                  _canny_th1 := 50 if aggressive else 80,
                                                  _canny_th2 := 150 if aggressive else 200,
                                                  _canny_aperture_size := 3,
                                                  _do_merge := True)
    except Exception:
        fld = None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if mask is not None:
        gray = cv2.bitwise_and(gray, gray, mask=mask)

    segs: List[Tuple[Tuple[float,float], Tuple[float,float]]] = []
    if fld is not None:
        lines = fld.detect(gray)
        if lines is not None:
            for l in lines[:max_lines]:
                x1, y1, x2, y2 = map(float, l[0])
                segs.append(((x1, y1), (x2, y2)))
    else:
        # Fallback to HoughLinesP
        edges = cv2.Canny(gray, 50 if aggressive else 70, 150 if aggressive else 200)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180,
                                threshold=60 if aggressive else 80,
                                minLineLength=20 if aggressive else 40,
                                maxLineGap=10 if aggressive else 12)
        if lines is not None:
            for ln in lines[:max_lines]:
                x1, y1, x2, y2 = ln[0]
                segs.append(((float(x1), float(y1)), (float(x2), float(y2))))
    return segs

def _extend_to_bounds(p1: Tuple[float,float], p2: Tuple[float,float], bounds: Tuple[float,float,float,float]):
    (x1,y1),(x2,y2) = p1, p2
    dx, dy = x2-x1, y2-y1
    if dx == 0 and dy == 0:
        return LineString([p1, p2])
    L = 1e5
    a = (x1 - L*dx, y1 - L*dy)
    b = (x2 + L*dx, y2 + L*dy)
    try:
        from shapely.geometry import box
    except Exception:
        return LineString([a, b])
    big = box(bounds[0]-10, bounds[1]-10, bounds[2]+10, bounds[3]+10)
    ln = LineString([a, b])
    inter = ln.intersection(big)
    return inter if not inter.is_empty else ln

def _split_polygon_by_lines(ring: list, img: np.ndarray, mask: Optional[np.ndarray] = None, aggressive: bool = False) -> List[list]:
    """Split a polygon by detected interior lines. Works even for moderate-size polygons.
    If no lines found or split fails, returns [ring].
    """
    if not SHAPELY_AVAILABLE:
        return [ring]
    poly = Polygon(ring)
    if not poly.is_valid or poly.area < 50:
        return [ring]
    h, w = img.shape[:2]
    # Detect lines restricted to polygon area
    local_mask = None
    if mask is not None:
        local_mask = mask
    else:
        local_mask = np.zeros((h, w), np.uint8)
        cnt = np.array(ring, dtype=np.int32).reshape(-1,1,2)
        cv2.fillPoly(local_mask, [cnt], 255)
    segs = _detect_interior_lines(img, local_mask, max_lines=200 if aggressive else 120, aggressive=aggressive)
    if not segs:
        return [ring]
    # Keep segments mostly inside polygon and extend to bounds before splitting
    bounds = poly.bounds
    cut_lines = []
    for (a, b) in segs:
        seg = LineString([a, b])
        if poly.buffer(-2).length == 0:  # defensive
            continue
        inside_ratio = seg.intersection(poly).length / (seg.length + 1e-6)
        if inside_ratio < 0.6:
            continue
        cut_lines.append(_extend_to_bounds(a, b, bounds))
    if not cut_lines:
        return [ring]
    # Iteratively split
    result_polys = [poly]
    for ln in cut_lines:
        try:
            new_res = []
            for p in result_polys:
                sp = shapely_split(p, ln)
                if len(sp) > 1:
                    new_res.extend(sp)
                else:
                    new_res.append(p)
            result_polys = new_res
        except Exception:
            continue
    # Filter small slivers and extreme aspect ratios
    out = []
    min_area = max(150.0, poly.area * (0.01 if aggressive else 0.02))
    for p in result_polys:
        if p.area < min_area:
            continue
        minx, miny, maxx, maxy = p.bounds
        ar = (maxx - minx) / max(1e-3, (maxy - miny))
        if ar > 25 or ar < 1/25:
            continue
        coords = list(p.exterior.coords)[:-1]
        out.append([[int(x), int(y)] for x, y in coords])
    return out if out else [ring]

# --- New helpers to improve roof isolation & connectivity ---
def _cluster_filter(polys: List[List[List[int]]], img_shape: Tuple[int,int], focus: Optional[Tuple[int,int]] = None) -> List[List[List[int]]]:
    """Keep polygons near the primary cluster (center/focus). Polys are lists of [x,y].
    Strategy:
      1. Score each polygon by distance of centroid to focus (or image center) and inverse area.
      2. Select primary (lowest score) polygon; build dilated bbox around it.
      3. Keep polys whose bbox intersects dilated bbox OR whose centroid lies within focus radius.
    """
    if not polys:
        return []
    h, w = img_shape
    fx = w/2 if not focus else focus[0]
    fy = h/2 if not focus else focus[1]
    scored = []
    for ring in polys:
        arr = np.array(ring, dtype=np.float32)
        cx, cy = arr[:,0].mean(), arr[:,1].mean()
        area = cv2.contourArea(arr)
        d = math.hypot(cx - fx, cy - fy)
        scored.append((d, -area, ring, (arr[:,0].min(), arr[:,1].min(), arr[:,0].max(), arr[:,1].max())))
    scored.sort(key=lambda x: (x[0], x[1]))
    main_bbox = scored[0][3]
    mx1,my1,mx2,my2 = main_bbox
    pad = 0.04 * max(h, w)
    mx1 -= pad; my1 -= pad; mx2 += pad; my2 += pad
    kept = []
    focus_rad = 0.35 * min(h, w)
    for d, negA, ring, (x1,y1,x2,y2) in scored:
        # bbox intersection test
        intersects = not (x2 < mx1 or x1 > mx2 or y2 < my1 or y1 > my2)
        if intersects:
            kept.append(ring)
            continue
        # focus radius (centroid) inclusion
        arr = np.array(ring, dtype=np.float32)
        cx, cy = arr[:,0].mean(), arr[:,1].mean()
        if math.hypot(cx - fx, cy - fy) <= focus_rad:
            kept.append(ring)
    return kept if kept else [scored[0][2]]

def _ensure_connectivity(polys: List[List[List[int]]], snap_gap: float = 14.0, bridge_gap: float = 60.0) -> List[List[List[int]]]:
    """Ensure polygons form one connected component by snapping isolated ones or adding thin bridge strips.
    polys: list of rings [[x,y],...]. Returns updated list including bridges as additional 4-point rings.
    """
    if len(polys) <= 1:
        return polys
    def edges(ring):
        return [ (tuple(ring[i]), tuple(ring[(i+1)%len(ring)])) for i in range(len(ring)) ]
    def edge_mid(e):
        return ((e[0][0]+e[1][0])/2.0, (e[0][1]+e[1][1])/2.0)
    def edge_distance(e1,e2):
        m1 = edge_mid(e1); m2 = edge_mid(e2)
        return math.hypot(m1[0]-m2[0], m1[1]-m2[1])
    connected = [polys[0]]
    remaining = polys[1:]
    bridges: List[List[List[int]]] = []
    def snap_ring(src, tgt):
        se = min(edges(src), key=lambda e: min(edge_distance(e, te) for te in edges(tgt)))
        te = min(edges(tgt), key=lambda e: edge_distance(e, se))
        sm = edge_mid(se); tm = edge_mid(te)
        dx, dy = tm[0]-sm[0], tm[1]-sm[1]
        return [[int(p[0]+dx), int(p[1]+dy)] for p in src]
    while remaining:
        progressed = False
        for idx, ring in enumerate(remaining):
            best = min(min(edge_distance(se, te) for se in edges(ring) for te in edges(c)) for c in connected)
            if best <= snap_gap:
                # snap to nearest connected polygon
                nearest = min(connected, key=lambda c: min(edge_distance(se, te) for se in edges(ring) for te in edges(c)))
                snapped = snap_ring(ring, nearest)
                connected.append(snapped)
                remaining.pop(idx)
                progressed = True
                break
        if not progressed:
            # bridge for closest polygon
            ring = remaining.pop(0)
            nearest = min(connected, key=lambda c: min(edge_distance(se, te) for se in edges(ring) for te in edges(c)))
            se = min(edges(ring), key=lambda e: min(edge_distance(e, te) for te in edges(nearest)))
            te = min(edges(nearest), key=lambda e: edge_distance(e, se))
            d = edge_distance(se, te)
            if d <= bridge_gap:
                sm = edge_mid(se); tm = edge_mid(te)
                vx, vy = tm[0]-sm[0], tm[1]-sm[1]
                norm = math.hypot(vx, vy) or 1.0
                ux, uy = vx/norm, vy/norm
                px, py = -uy, ux
                thick = min(12.0, d*0.28)
                b = [
                    [int(sm[0]+px*thick), int(sm[1]+py*thick)],
                    [int(sm[0]-px*thick), int(sm[1]-py*thick)],
                    [int(tm[0]-px*thick), int(tm[1]-py*thick)],
                    [int(tm[0]+px*thick), int(tm[1]+py*thick)],
                ]
                bridges.append(b)
                connected.append(ring)
            else:
                # too far: discard this ring (neighbor roof)
                pass
    return connected + bridges

def remove_border_connected(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape[:2]
    ff_mask = np.zeros((h+2, w+2), np.uint8)
    mask_ff = mask.copy()
    # Flood fill from the four corners to find background connected to border
    for pt in [(0,0), (w-1,0), (0,h-1), (w-1,h-1)]:
        cv2.floodFill(mask_ff, ff_mask, pt, 128)
    # Everything marked 128 is background; restore roof candidates (255)
    mask_ff[mask_ff == 128] = 0
    return mask_ff

def segment_roof(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    # 1) Initial GrabCut with center rectangle to bias toward central structure
    rect = (int(0.15*w), int(0.15*h), int(0.70*w), int(0.70*h))
    mask = np.zeros((h, w), np.uint8)
    bgModel = np.zeros((1, 65), np.float64)
    fgModel = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(img, mask, rect, bgModel, fgModel, 5, cv2.GC_INIT_WITH_RECT)
        grab = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
    except Exception:
        # Fallback to edges if GrabCut fails
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 60, 160)
        grab = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5,5), np.uint8), iterations=2)

    # 2) Remove green vegetation (HSV) to avoid lawns/trees
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Broad green range
    green1 = np.array([35, 30, 30], dtype=np.uint8)
    green2 = np.array([90, 255, 255], dtype=np.uint8)
    green_mask = cv2.inRange(hsv, green1, green2)
    non_green = cv2.bitwise_not(green_mask)
    mask_ng = cv2.bitwise_and(grab, non_green)

    # 3) Morphological cleanup
    kernel = np.ones((5,5), np.uint8)
    closed = cv2.morphologyEx(mask_ng, cv2.MORPH_CLOSE, kernel, iterations=2)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, np.ones((3,3), np.uint8), iterations=1)

    # 4) Remove components connected to the image border (likely background)
    interior = remove_border_connected(opened)

    # 5) Keep regions intersecting a center box to avoid far-away blobs
    center_box = (int(0.2*w), int(0.2*h), int(0.6*w), int(0.6*h))
    x0, y0, ww, hh = center_box
    center_roi = np.zeros_like(interior)
    center_roi[y0:y0+hh, x0:x0+ww] = 255
    keep = cv2.bitwise_and(interior, center_roi)
    # If too small, fall back to interior
    if cv2.countNonZero(keep) < 1500:
        keep = interior

    # Final smooth and binarize
    keep = cv2.medianBlur(keep, 5)
    _, binary = cv2.threshold(keep, 127, 255, cv2.THRESH_BINARY)
    return binary

def split_mask_into_planes(mask: np.ndarray, img: np.ndarray) -> np.ndarray:
    # Detect strong lines inside the mask and use them to split regions
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5,5), 0)
    edges = cv2.Canny(blur, 50, 150)
    edges = cv2.bitwise_and(edges, edges, mask=mask)

    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=60, minLineLength=int(0.12*min(h,w)), maxLineGap=12)
    cuts = np.zeros_like(mask)
    if lines is not None:
        for l in lines:
            x1,y1,x2,y2 = l[0]
            cv2.line(cuts, (x1,y1), (x2,y2), 255, thickness=3)
    # Dilate cuts to ensure separation
    if np.count_nonzero(cuts) > 0:
        cuts = cv2.dilate(cuts, np.ones((3,3), np.uint8), iterations=1)
        split = cv2.bitwise_and(mask, cv2.bitwise_not(cuts))
        # A bit of opening to remove thin leftovers
        split = cv2.morphologyEx(split, cv2.MORPH_OPEN, np.ones((3,3), np.uint8), iterations=1)
        return split
    return mask

@app.post("/stitch")
async def stitch(files: List[UploadFile] = File(default=[]), file: List[UploadFile] = File(default=[])):
    # Read all images from 'files' or 'file'
    inputs = files + file
    # Read all images
    bufs: List[bytes] = []
    for f in inputs:
        try:
            b = await f.read()
            if b:
                bufs.append(b)
        except Exception:
            pass
    if len(bufs) < 2:
        return JSONResponse({"error": "Need at least 2 images"}, status_code=400)

    imgs = []
    for b in bufs:
        arr = np.frombuffer(b, np.uint8)
        im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if im is None:
            continue
        # Optional downscale for speed if very large
        h, w = im.shape[:2]
        scale = 1200.0 / max(h, w)
        if scale < 1.0:
            im = cv2.resize(im, (int(w*scale), int(h*scale)))
        imgs.append(im)
    if len(imgs) < 2:
        return JSONResponse({"error": "Failed to decode images"}, status_code=400)

    # Try SCANS mode for near-planar nadir images; fallback to PANORAMA
    try:
        stitcher = cv2.Stitcher_create(cv2.Stitcher_SCANS)
    except Exception:
        stitcher = cv2.Stitcher_create()
    status, pano = stitcher.stitch(imgs)
    if status != cv2.Stitcher_OK:
        # fallback try with PANORAMA
        try:
            stitcher2 = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
            status2, pano2 = stitcher2.stitch(imgs)
            if status2 == cv2.Stitcher_OK:
                pano = pano2
            else:
                return JSONResponse({"error": f"Stitch failed: {status}"}, status_code=500)
        except Exception:
            return JSONResponse({"error": f"Stitch failed: {status}"}, status_code=500)

    ok, jpg = cv2.imencode(".jpg", pano, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return JSONResponse({"error": "Encode failed"}, status_code=500)
    import base64
    b64 = base64.b64encode(jpg.tobytes()).decode("ascii")
    h, w = pano.shape[:2]
    return JSONResponse({"image": "data:image/jpeg;base64," + b64, "width": int(w), "height": int(h)})

@app.post("/measure")
async def measure(file: UploadFile = File(...), assume_alt_agl_m: Optional[float] = None, default_pitch_in12: float = 6.0, focus_x: Optional[int] = None, focus_y: Optional[int] = None, split: Optional[str] = None):
    img_b = await file.read()
    exif = exif_from_bytes(img_b)
    gsd_m_per_px = compute_gsd(exif, assume_alt_agl_m)

    img_arr = np.frombuffer(img_b, np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse({"error": "Invalid image"}, status_code=400)
    h, w = img.shape[:2]

    # If YOLO weights available, run instance segmentation; else use heuristics
    polys = []
    yolo = _maybe_load_model()
    if yolo is not None:
        try:
            preds = yolo.predict(source=img, imgsz=1024, conf=0.25, verbose=False)[0]
            ms = preds.masks.data.cpu().numpy() if getattr(preds, 'masks', None) is not None else []
            if len(ms):
                # Convert masks to polygons
                for m in ms:
                    m = (m > 0.5).astype(np.uint8) * 255
                    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    for c in cnts:
                        if len(c) < 3: continue
                        if cv2.contourArea(c) < 200: continue
                        c = cv2.approxPolyDP(c, 0.005 * cv2.arcLength(c, True), True)
                        ring = c.squeeze(1).astype(int).tolist()
                        if len(ring) >= 3:
                            polys.append(ring)
        except Exception:
            polys = []
    if not polys:
        # Heuristic fallback
        mask = segment_roof(img)
        mask_planes = split_mask_into_planes(mask, img)
        polys = polygonize(mask_planes)
    # Split any polygon using detected interior lines (aggressive if requested)
    aggressive = (isinstance(split, str) and split.lower() in ("aggr", "aggressive", "max"))
    improved_polys: List[list] = []
    for poly_ring in polys:
        improved_polys.extend(_split_polygon_by_lines(poly_ring, img, mask=None, aggressive=aggressive))

    # Filter away neighboring roofs (cluster filtering)
    focus = None
    if isinstance(focus_x, int) and isinstance(focus_y, int):
        if 0 <= focus_x < w and 0 <= focus_y < h:
            focus = (focus_x, focus_y)
    improved_polys = _cluster_filter(improved_polys, (h, w), focus)
    # Enforce connectivity (snap + bridge)
    improved_polys = _ensure_connectivity(improved_polys)

    mpp = gsd_m_per_px
    to_ft = 3.28084
    planes = []
    total_plan_area_ft2 = 0.0
    total_perimeter_ft = 0.0

    overlay = img.copy()
    # Optional: estimate rotation to align dominant ridge with X-axis
    angleDeg_out: Optional[float] = None
    try:
        # Use detected interior lines (aggressive to emphasize ridges)
        mask0 = None
        if improved_polys:
            mask0 = np.zeros((h, w), np.uint8)
            for poly in improved_polys:
                cv2.fillPoly(mask0, [np.array(poly, dtype=np.int32)], 255)
        segs_est = _detect_interior_lines(img, mask0, max_lines=200, aggressive=True)
        if segs_est:
            angles = []
            for (a,b) in segs_est:
                dx, dy = (b[0]-a[0]), (b[1]-a[1])
                ang = (np.degrees(np.arctan2(dy, dx)) + 180.0) % 180.0
                # Map to [0,90] symmetry (ridge direction, axis-agnostic)
                if ang > 90.0:
                    ang = 180.0 - ang
                angles.append(ang)
            if angles:
                # Pick mode-ish angle by binning
                hist, bins = np.histogram(angles, bins=18, range=(0, 90))
                k = int(np.argmax(hist))
                center = 0.5 * (bins[k] + bins[k+1])
                # Rotate canvas by -center to make this direction parallel to X
                angleDeg_out = -float(center)
    except Exception:
        angleDeg_out = None
    for i, poly in enumerate(improved_polys):
        p = np.array(poly, dtype=np.float32)
        area_px = cv2.contourArea(p)
        perim_px = cv2.arcLength(p, True)
        plan_m2 = area_px * (mpp ** 2)
        plan_ft2 = plan_m2 * 10.7639
        total_plan_area_ft2 += plan_ft2
        total_perimeter_ft += (perim_px * mpp * to_ft)

        import math as pymath
        pitch = default_pitch_in12
        theta = pymath.atan(pitch/12.0)
        surface_ft2 = plan_ft2 / pymath.cos(theta)

        # Default edge labels placeholder (one per side, starting at vertex i to i+1)
        edges = []
        n = len(poly)
        for ei in range(n):
            edges.append({"i": ei, "type": "unknown"})

        planes.append({
            "id": f"P{i+1}",
            "pitch": pitch,
            "planAreaFt2": plan_ft2,
            "surfaceAreaFt2": surface_ft2,
            "polygon": poly,
            "edges": edges,
        })

        cv2.polylines(overlay, [p.astype(np.int32)], True, (0, 255, 0), 2)
        M = p.mean(axis=0).astype(int)
        cv2.putText(overlay, f"P{i+1}", tuple(M), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

    total_surface_ft2 = sum(p["surfaceAreaFt2"] for p in planes)
    totals = {
        "planAreaFt2": total_plan_area_ft2,
        "surfaceAreaFt2": total_surface_ft2,
        "squares": total_surface_ft2 / 100.0,
        "perimeterFt": total_perimeter_ft
    }

    ok, png = cv2.imencode(".png", overlay)
    overlay_b64 = None
    if ok:
        import base64
        overlay_b64 = "data:image/png;base64," + base64.b64encode(png.tobytes()).decode("ascii")

    result = { "exif": exif, "gsd_m_per_px": gsd_m_per_px, "planes": planes, "edges": {}, "totals": totals, "overlay": overlay_b64 }
    if angleDeg_out is not None:
        result["angleDeg"] = angleDeg_out
    return JSONResponse(result)

@app.post("/feedback")
async def feedback(data: dict):
    try:
        ts = int(time.time())
        out = AI_DATA_DIR / f"feedback_{data.get('measurementId','unknown')}_{ts}.json"
        with out.open('w') as f:
            json.dump(data, f)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8089)
