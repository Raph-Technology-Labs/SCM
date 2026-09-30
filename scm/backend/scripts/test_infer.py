"""
Standalone sanity check for a YOLO model against a folder of images —
independent of the FastAPI pipeline, to isolate whether "no detections" is
a model/image problem or a pipeline-config problem.

Runs inference at a very low confidence (default 0.001) so it surfaces
*everything* the model sees, draws every box + its confidence on the image,
and writes both annotated images and a results.txt summary to the output
dir. If results.txt shows zero detections per image even at conf=0.001,
the model genuinely isn't firing on these images (wrong model/weights,
wrong preprocessing, or the images don't resemble training data) — that's
a different problem than a threshold being set too high.

Usage:
    python scripts/test_infer.py \
        --model models/exp-2.pt \
        --images /home/dhanashree/Documents/bajaj_dataset \
        --output /home/dhanashree/SCM/scm/backend/scripts/test_infer_output \
        --conf 0.001
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2

SUPPORTED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="models/exp-2.pt", help="Path to the .pt weights file")
    parser.add_argument(
        "--images",
        default="/home/dhanashree/Documents/bajaj_dataset",
        help="Directory of images to run inference on",
    )
    parser.add_argument(
        "--output",
        default="scripts/test_infer_output",
        help="Directory to write annotated images + results.txt into",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.001,
        help="Inference confidence floor (kept low so nothing is hidden)",
    )
    parser.add_argument("--imgsz", type=int, default=1280, help="Inference image size")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    from ultralytics import YOLO

    model_path = Path(args.model)
    images_dir = Path(args.images)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    if not images_dir.exists():
        raise FileNotFoundError(f"Images dir not found: {images_dir}")

    model = YOLO(str(model_path))
    print(f"Loaded {model_path} — classes: {model.names}")

    image_paths = sorted(
        p for p in images_dir.glob("*") if p.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not image_paths:
        raise RuntimeError(f"No images found in: {images_dir}")
    print(f"Found {len(image_paths)} images in {images_dir}")

    results_lines: list[str] = []
    total_detections = 0
    images_with_detections = 0

    for path in image_paths:
        frame = cv2.imread(str(path))
        if frame is None:
            results_lines.append(f"{path.name}: COULD NOT READ IMAGE")
            continue

        [result] = model(frame, conf=args.conf, imgsz=args.imgsz, verbose=False)
        boxes = result.boxes

        if len(boxes) == 0:
            results_lines.append(f"{path.name}: 0 detections")
        else:
            images_with_detections += 1
            total_detections += len(boxes)
            per_box = []
            for box in boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = [round(v, 1) for v in box.xyxy[0].tolist()]
                class_name = model.names[cls_id]
                per_box.append(f"{class_name}={conf:.4f}@({x1},{y1},{x2},{y2})")

                label = f"{class_name} {conf:.2f}"
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)
                cv2.putText(
                    frame, label, (int(x1), max(0, int(y1) - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2,
                )
            results_lines.append(f"{path.name}: {len(boxes)} detections -> " + ", ".join(per_box))

        out_path = output_dir / path.name
        cv2.imwrite(str(out_path), frame)

    summary = (
        f"\n--- SUMMARY ---\n"
        f"Model: {model_path}\n"
        f"Classes: {model.names}\n"
        f"Confidence floor used: {args.conf}\n"
        f"Images scanned: {len(image_paths)}\n"
        f"Images with >=1 detection: {images_with_detections}\n"
        f"Total detections: {total_detections}\n"
    )
    results_lines.append(summary)

    results_path = output_dir / "results.txt"
    results_path.write_text("\n".join(results_lines), encoding="utf-8")

    print(summary)
    print(f"Annotated images + results.txt written to: {output_dir}")


if __name__ == "__main__":
    main()
