"""Eye-region ROI crop via MediaPipe FaceLandmarker (Tasks API).

Returns a square RGB crop covering both eyes + brows + nose bridge.
Falls back to center crop if no face detected.
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROI_SIZE = 112

EYE_REGION_IDX = [
    33, 133, 159, 145, 158, 153, 144, 163, 7, 246,
    362, 263, 386, 374, 385, 380, 373, 390, 249, 466,
    70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
    168, 6, 197, 195,
]

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parent / "models" / "face_landmarker.task"


def _ensure_model() -> Path:
    if not MODEL_PATH.exists():
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading face_landmarker.task -> {MODEL_PATH}")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


class EyeROIExtractor:
    def __init__(self, roi_size: int = ROI_SIZE, pad: float = 0.25):
        self.roi_size = roi_size
        self.pad = pad
        model_path = _ensure_model()
        opts = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.3,
            min_face_presence_confidence=0.3,
        )
        self.landmarker = mp_vision.FaceLandmarker.create_from_options(opts)

    def close(self):
        self.landmarker.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def extract(self, image_bgr: np.ndarray) -> np.ndarray:
        h, w = image_bgr.shape[:2]
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = self.landmarker.detect(mp_img)

        if not res.face_landmarks:
            return self._center_crop(rgb)

        lms = res.face_landmarks[0]
        pts = np.array(
            [(lms[i].x * w, lms[i].y * h) for i in EYE_REGION_IDX],
            dtype=np.float32,
        )
        x0, y0 = pts.min(axis=0)
        x1, y1 = pts.max(axis=0)
        bw, bh = x1 - x0, y1 - y0
        side = max(bw, bh) * (1 + self.pad)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        x0 = int(max(0, cx - side / 2))
        y0 = int(max(0, cy - side / 2))
        x1 = int(min(w, cx + side / 2))
        y1 = int(min(h, cy + side / 2))
        if x1 <= x0 or y1 <= y0:
            return self._center_crop(rgb)
        crop = rgb[y0:y1, x0:x1]
        return cv2.resize(crop, (self.roi_size, self.roi_size), interpolation=cv2.INTER_AREA)

    def _center_crop(self, rgb: np.ndarray) -> np.ndarray:
        h, w = rgb.shape[:2]
        s = min(h, w)
        y0 = (h - s) // 2
        x0 = (w - s) // 2
        crop = rgb[y0:y0 + s, x0:x0 + s]
        return cv2.resize(crop, (self.roi_size, self.roi_size), interpolation=cv2.INTER_AREA)


def normalize(roi_uint8: np.ndarray) -> np.ndarray:
    """HWC uint8 -> CHW float32, ImageNet stats."""
    x = roi_uint8.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = (x - mean) / std
    return x.transpose(2, 0, 1)
