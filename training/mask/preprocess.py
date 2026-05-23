"""Face bbox crop and normalization for mask detection.

Dataset: PWMFD (Properly-Wearing-Masked-Detect-Dataset)
Download (OneDrive, no wget):
  Train: https://1drv.ms/u/s!AokJXAN2wZUUhBHSixl5jgdFU_MU?e=vKL5RU
  Val:   https://1drv.ms/u/s!AokJXAN2wZUUhBAuWj6UigfwcUtE?e=2YNTp0
"""
from __future__ import annotations

import numpy as np
import cv2

ROI_SIZE = 112
MEAN: tuple[float, float, float] = (0.485, 0.456, 0.406)
STD: tuple[float, float, float] = (0.229, 0.224, 0.225)


def crop_bbox(
    image_bgr: np.ndarray,
    bbox: tuple[int, int, int, int],
    pad: float = 0.20,
) -> np.ndarray:
    """Crop + pad bbox from image, resize to ROI_SIZE×ROI_SIZE, return RGB uint8."""
    h, w = image_bgr.shape[:2]
    xmin, ymin, xmax, ymax = bbox
    bw = xmax - xmin
    bh = ymax - ymin
    pad_x = int(bw * pad)

    # Asymmetric vertical padding: keep extra mouth/chin context for mask cues.
    pad_top = int(bh * pad * 0.65)
    pad_bottom = int(bh * pad * 1.70)

    x0 = max(0, xmin - pad_x)
    y0 = max(0, ymin - pad_top)
    x1 = min(w, xmax + pad_x)
    y1 = min(h, ymax + pad_bottom)
    if x1 <= x0 or y1 <= y0:
        crop = image_bgr
    else:
        crop = image_bgr[y0:y1, x0:x1]
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    return cv2.resize(rgb, (ROI_SIZE, ROI_SIZE), interpolation=cv2.INTER_AREA)


def normalize(roi_uint8: np.ndarray) -> np.ndarray:
    """HWC uint8 RGB -> CHW float32, ImageNet stats."""
    x = roi_uint8.astype(np.float32) / 255.0
    mean = np.array(MEAN, dtype=np.float32)
    std = np.array(STD, dtype=np.float32)
    x = (x - mean) / std
    return x.transpose(2, 0, 1)
