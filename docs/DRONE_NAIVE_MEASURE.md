# Single-photo roof measurement (free)

This flow estimates roof polygons, plan area, perimeter, and squares from a single nadir photo using OpenCV + EXIF.

- Worker: Python FastAPI (ai_worker)
- CRM: Next.js endpoint `/api/drone/naive-measure`

Run the worker locally:

```bash
# From repo root
docker build -t hytech-ai-worker ./ai_worker
docker run --rm -p 8089:8089 hytech-ai-worker
```

Configure the CRM to point to it:

```bash
# .env.local
AI_WORKER_URL=http://localhost:8089/measure
```

Use it:

- On a mission Photos page, use "Auto-detect from Photo" to upload a JPEG.
- The endpoint forwards to the worker, stores a Measurement, and saves an overlay PNG for QA.

Notes:

- Accuracy depends on nadir capture and EXIF altitude approximating AGL.
- You can provide a default pitch; users can adjust later.
- If you want better segmentation, swap the classical CV with a small ONNX model.
