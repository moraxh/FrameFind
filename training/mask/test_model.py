"""Quick Python test script for mask model (PyTorch or ONNX).

Modes:
1) Single image:
   python -m training.mask.test_model --image /path/img.jpg --bbox 10,20,200,220

2) Dataset eval (VOC):
   python -m training.mask.test_model --dataset-root training/mask/dataset/PWMFD_Val

3) Webcam:
   python -m training.mask.test_model --camera
"""
from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from pathlib import Path

import cv2
import numpy as np
import torch

from training.mask.model import MaskNet
from training.mask.preprocess import crop_bbox, normalize

CLASS_NAMES = ["with_mask", "without_mask", "incorrect_mask"]
LABEL_MAP = {name: i for i, name in enumerate(CLASS_NAMES)}
LABEL_MAP.update({
    "face_mask": 0,
    "face": 1,
    "nose": 2,
})


def softmax(x: np.ndarray) -> np.ndarray:
    z = x - np.max(x, axis=1, keepdims=True)
    exp = np.exp(z)
    return exp / np.sum(exp, axis=1, keepdims=True)


def predict_onnx(net: cv2.dnn.Net, image_bgr: np.ndarray, bbox: tuple[int, int, int, int]):
    roi = crop_bbox(image_bgr, bbox)  # RGB uint8
    x = normalize(roi)[None, ...]  # (1,3,112,112)
    net.setInput(x)
    logits = net.forward()
    probs = softmax(logits)
    pred = int(np.argmax(probs[0]))
    return pred, probs[0], logits[0]


@torch.no_grad()
def predict_torch(model: torch.nn.Module, device: torch.device, image_bgr: np.ndarray, bbox: tuple[int, int, int, int]):
    roi = crop_bbox(image_bgr, bbox)  # RGB uint8
    x = torch.from_numpy(normalize(roi)).unsqueeze(0).to(device)
    logits = model(x)
    probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
    pred = int(np.argmax(probs))
    return pred, probs, logits[0].cpu().numpy()


def parse_bbox(s: str) -> tuple[int, int, int, int]:
    vals = [int(v.strip()) for v in s.split(",")]
    if len(vals) != 4:
        raise ValueError("--bbox must be xmin,ymin,xmax,ymax")
    return vals[0], vals[1], vals[2], vals[3]


def iter_voc_objects(root: Path):
    ann_dir = root / "Annotations"
    img_dir = root / "Pictures"
    if not ann_dir.is_dir() or not img_dir.is_dir():
        raise FileNotFoundError(f"Expected {ann_dir} and {img_dir}")

    for xml_path in sorted(ann_dir.glob("*.xml")):
        try:
            tree = ET.parse(xml_path)
        except ET.ParseError:
            continue
        xroot = tree.getroot()
        filename = xroot.findtext("filename")
        if not filename:
            continue
        img_path = img_dir / filename
        if not img_path.exists():
            continue
        for obj in xroot.findall("object"):
            name = obj.findtext("name", "").strip()
            if name not in LABEL_MAP:
                continue
            bb = obj.find("bndbox")
            if bb is None:
                continue
            try:
                xmin = int(float(bb.findtext("xmin", "0")))
                ymin = int(float(bb.findtext("ymin", "0")))
                xmax = int(float(bb.findtext("xmax", "0")))
                ymax = int(float(bb.findtext("ymax", "0")))
            except ValueError:
                continue
            if xmax <= xmin or ymax <= ymin:
                continue
            yield img_path, (xmin, ymin, xmax, ymax), LABEL_MAP[name]


def run_dataset_eval(predict_fn, dataset_root: Path, limit: int):
    conf = np.zeros((3, 3), dtype=np.int64)
    seen = 0
    for img_path, bbox, y_true in iter_voc_objects(dataset_root):
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        y_pred, _, _ = predict_fn(img, bbox)
        conf[y_true, y_pred] += 1
        seen += 1
        if limit > 0 and seen >= limit:
            break

    total = int(conf.sum())
    acc = float(np.trace(conf) / total) if total else 0.0
    print(f"samples={total} acc={acc:.4f}")
    print("confusion_matrix:")
    for row in conf:
        print(f"  {row.tolist()}")
    print("per_class_acc:")
    for i, name in enumerate(CLASS_NAMES):
        denom = conf[i].sum()
        cls_acc = float(conf[i, i] / denom) if denom else 0.0
        print(f"  {name}: {cls_acc:.4f} ({int(denom)} samples)")


def _open_camera(cam_id: int, width: int = 1280, height: int = 720):
    attempts = []
    backend_candidates = [None]
    if hasattr(cv2, "CAP_DSHOW"):
        backend_candidates.append(cv2.CAP_DSHOW)
    if hasattr(cv2, "CAP_MSMF"):
        backend_candidates.append(cv2.CAP_MSMF)
    if hasattr(cv2, "CAP_V4L2"):
        backend_candidates.append(cv2.CAP_V4L2)
    if hasattr(cv2, "CAP_AVFOUNDATION"):
        backend_candidates.append(cv2.CAP_AVFOUNDATION)

    cam_candidates = [cam_id] + [i for i in range(0, 5) if i != cam_id]
    for cid in cam_candidates:
        for backend in backend_candidates:
            cap = cv2.VideoCapture(cid) if backend is None else cv2.VideoCapture(cid, backend)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                ok, _ = cap.read()
                if ok:
                    backend_name = "default" if backend is None else str(int(backend))
                    return cap, cid, backend_name
                cap.release()
            attempts.append((cid, backend))
    return None, attempts, None


FACE_LANDMARKER_PATH = Path(__file__).resolve().parents[1] / "models" / "face_landmarker.task"


def _build_face_detector(min_confidence: float = 0.3):
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision

    if not FACE_LANDMARKER_PATH.exists():
        raise FileNotFoundError(f"face_landmarker.task not found: {FACE_LANDMARKER_PATH}")
    base = mp_python.BaseOptions(model_asset_path=str(FACE_LANDMARKER_PATH))
    opts = mp_vision.FaceLandmarkerOptions(
        base_options=base,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=2,
        min_face_detection_confidence=min_confidence,
        min_face_presence_confidence=min_confidence,
        min_tracking_confidence=min_confidence,
    )
    return mp_vision.FaceLandmarker.create_from_options(opts)


def _detect_faces_mp(detector, frame_bgr: np.ndarray, ts_ms: int):
    import mediapipe as mp
    h, w = frame_bgr.shape[:2]
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    res = detector.detect_for_video(mp_image, ts_ms)
    if not res.face_landmarks:
        return []
    out = []
    for lms in res.face_landmarks:
        xs = [lm.x for lm in lms]
        ys = [lm.y for lm in lms]
        x0 = max(0, int(min(xs) * w))
        y0 = max(0, int(min(ys) * h))
        x1 = min(w, int(max(xs) * w))
        y1 = min(h, int(max(ys) * h))
        bw = max(1, x1 - x0)
        bh = max(1, y1 - y0)
        out.append((x0, y0, bw, bh))
    return out


def run_camera(predict_fn, cam_id: int = 0, detect_every: int = 1):
    detector = _build_face_detector()

    cap, chosen_cam_id, backend_name = _open_camera(cam_id)
    if cap is None:
        raise RuntimeError(
            "Could not open camera. Tried ids 0..4 with multiple backends. "
            "Use --cam-id <n> or close apps using the webcam."
        )
    print(f"camera opened: id={chosen_cam_id} backend={backend_name}")

    frame_idx = 0
    tracked_faces: list[tuple[int, int, int, int]] = []
    import time
    t0 = time.monotonic()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame_idx += 1
            if frame_idx % max(1, detect_every) == 0 or not tracked_faces:
                ts_ms = int((time.monotonic() - t0) * 1000)
                tracked_faces = _detect_faces_mp(detector, frame, ts_ms)
            faces = tracked_faces

            for (x, y, w, h) in faces:
                bbox = (int(x), int(y), int(x + w), int(y + h))
                pred, probs, _ = predict_fn(frame, bbox)
                label = CLASS_NAMES[pred]
                conf = float(probs[pred])

                color = (0, 200, 0) if pred == 0 else (0, 165, 255) if pred == 2 else (0, 0, 255)
                cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
                cv2.putText(
                    frame,
                    f"{label} {conf:.2f}",
                    (x, max(20, y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    color,
                    2,
                    cv2.LINE_AA,
                )

            cv2.imshow("Mask Test (ESC to quit)", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == 27:
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["torch", "onnx"], default="torch")
    ap.add_argument("--ckpt", default=str(here / "checkpoints" / "best.pt"))
    ap.add_argument(
        "--model",
        default=str(here.parent.parent / "apps" / "playground" / "mask" / "model" / "mask.onnx"),
    )
    ap.add_argument("--image", help="Single image path")
    ap.add_argument("--bbox", help="xmin,ymin,xmax,ymax for --image mode")
    ap.add_argument(
        "--dataset-root",
        help="VOC root with Annotations/ and Pictures/ (e.g. training/mask/dataset/PWMFD_Val)",
    )
    ap.add_argument("--limit", type=int, default=0, help="Limit samples in dataset eval (0 = all)")
    ap.add_argument("--camera", action="store_true", help="Run real-time webcam test")
    ap.add_argument("--cam-id", type=int, default=0, help="Camera device id (default: 0)")
    ap.add_argument("--detect-every", type=int, default=4, help="Run face detection every N frames")
    args = ap.parse_args()

    if args.backend == "onnx":
        model_path = Path(args.model)
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        net = cv2.dnn.readNetFromONNX(str(model_path))
        predict_fn = lambda image_bgr, bbox: predict_onnx(net, image_bgr, bbox)
    else:
        ckpt_path = Path(args.ckpt)
        if not ckpt_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}")
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = MaskNet(num_classes=3, pretrained=False).to(device)
        state = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(state)
        model.eval()
        print(f"backend=torch device={device} ckpt={ckpt_path}")
        predict_fn = lambda image_bgr, bbox: predict_torch(model, device, image_bgr, bbox)

    if args.dataset_root:
        run_dataset_eval(predict_fn, Path(args.dataset_root), args.limit)
        return

    if args.camera:
        run_camera(predict_fn, cam_id=args.cam_id, detect_every=args.detect_every)
        return

    if args.image and args.bbox:
        image_path = Path(args.image)
        img = cv2.imread(str(image_path))
        if img is None:
            raise FileNotFoundError(f"Could not read image: {image_path}")
        bbox = parse_bbox(args.bbox)
        pred, probs, logits = predict_fn(img, bbox)
        print(f"pred={pred} ({CLASS_NAMES[pred]})")
        print(f"logits={logits.tolist()}")
        print(f"probs={probs.tolist()}")
        return

    raise SystemExit("Provide either --dataset-root OR (--image + --bbox).")


if __name__ == "__main__":
    main()
