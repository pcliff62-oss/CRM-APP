# AI Worker: Roof Plane Training

This worker can train an instance segmentation model from your editing feedback and use it at inference time.

Quick start:

- Use the editor to fix polygons and click Save; feedback is forwarded to the worker and saved under `ai_worker/ai_data/feedback_*.json` with `sourceImagePath`.
- Ensure LOCAL_PUBLIC_DIR points to your `public` folder so training can read images.

Environment:

- Create and activate a venv, then install requirements.
- Export LOCAL_PUBLIC_DIR before training.

Training:

- Run `python ai_worker/train.py --epochs 40`.
- Weights are saved to `ai_worker/weights/roofplanes.pt` automatically.

Inference:

- When weights exist, the worker uses Ultralytics YOLO-seg to propose multiple roof polygons.
- If no weights, it falls back to heuristic segmentation and splitting.

Notes:

- GPU optional; CPU works for small models but is slower.
- Dataset is built from polygons in feedback JSON entries of type `added`.
