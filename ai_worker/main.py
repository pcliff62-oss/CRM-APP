from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import uvicorn, cv2, numpy as np
from PIL import Image
import piexif, io, math
from typing import Optional, List

app = FastAPI()

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
async def measure(file: UploadFile = File(...), assume_alt_agl_m: Optional[float] = None, default_pitch_in12: float = 6.0):
    img_b = await file.read()
    exif = exif_from_bytes(img_b)
    gsd_m_per_px = compute_gsd(exif, assume_alt_agl_m)

    img_arr = np.frombuffer(img_b, np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse({"error": "Invalid image"}, status_code=400)
    h, w = img.shape[:2]

    # Improved roof segmentation
    mask = segment_roof(img)
    mask_planes = split_mask_into_planes(mask, img)
    polys = polygonize(mask_planes)

    mpp = gsd_m_per_px
    to_ft = 3.28084
    planes = []
    total_plan_area_ft2 = 0.0
    total_perimeter_ft = 0.0

    overlay = img.copy()
    for i, poly in enumerate(polys):
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
    return JSONResponse(result)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8089)
