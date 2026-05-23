"""PWMFD dataset with cached face-bbox crops for mask detection."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset
from tqdm import tqdm

from training.mask.preprocess import crop_bbox, normalize, ROI_SIZE

LABEL_MAP: dict[str, int] = {
    "with_mask": 0,
    "without_mask": 1,
    "incorrect_mask": 2,
    # PWMFD val aliases
    "face_mask": 0,
    "face": 1,
    "nose": 2,
}

CLASS_NAMES = ["with_mask", "without_mask", "incorrect_mask"]


def build_index(root: Path) -> List[Tuple[Path, Tuple[int, int, int, int], int]]:
    """Parse Pascal VOC XMLs, return (image_path, bbox, label) per object."""
    ann_dir = root / "Annotations"
    img_dir = root / "Pictures"
    if not ann_dir.is_dir():
        raise FileNotFoundError(f"Missing {ann_dir}")
    if not img_dir.is_dir():
        raise FileNotFoundError(f"Missing {img_dir}")

    items: List[Tuple[Path, Tuple[int, int, int, int], int]] = []
    for xml_path in sorted(ann_dir.glob("*.xml")):
        try:
            tree = ET.parse(xml_path)
        except ET.ParseError:
            continue
        root = tree.getroot()
        filename = root.findtext("filename")
        if not filename:
            continue
        img_path = img_dir / filename
        if not img_path.exists():
            # PWMFD val has many XMLs whose <filename> does not match actual file.
            # Fallback to XML stem to recover those samples.
            alt = img_dir / f"{xml_path.stem}.jpg"
            if alt.exists():
                img_path = alt
            else:
                continue
        for obj in root.findall("object"):
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
            items.append((img_path, (xmin, ymin, xmax, ymax), LABEL_MAP[name]))
    return items


def precompute_cache(root: Path, cache_path: Path, force: bool = False) -> None:
    """Crop all bboxes and store in a single .npz."""
    if cache_path.exists() and not force:
        try:
            cached = np.load(cache_path)
            if "labels" in cached and len(cached["labels"]) > 0:
                return
            print(f"rebuilding empty/invalid cache: {cache_path}")
        except Exception:
            print(f"rebuilding unreadable cache: {cache_path}")
    items = build_index(root)
    n = len(items)
    rois = np.zeros((n, ROI_SIZE, ROI_SIZE, 3), dtype=np.uint8)
    labels = np.zeros((n,), dtype=np.int64)
    for i, (img_path, bbox, label) in enumerate(tqdm(items, desc=f"cache {cache_path.name}")):
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        rois[i] = crop_bbox(img, bbox)
        labels[i] = label
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache_path, rois=rois, labels=labels)
    print(f"saved {cache_path} ({n} samples)")


def _augment(roi: np.ndarray) -> np.ndarray:
    h, w = roi.shape[:2]

    if np.random.rand() < 0.5:
        roi = roi[:, ::-1, :].copy()

    if np.random.rand() < 0.7:
        angle = (np.random.rand() - 0.5) * 40.0
        M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        roi = cv2.warpAffine(roi, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    if np.random.rand() < 0.7:
        scale = 0.75 + np.random.rand() * 0.55
        M = cv2.getRotationMatrix2D((w / 2, h / 2), 0.0, scale)
        roi = cv2.warpAffine(roi, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    if np.random.rand() < 0.5:
        a = 1.0 + (np.random.rand() - 0.5) * 0.4
        b = (np.random.rand() - 0.5) * 30
        roi = np.clip(a * roi.astype(np.float32) + b, 0, 255).astype(np.uint8)

    # HSV color jitter — helps with mask texture/color variation
    if np.random.rand() < 0.5:
        hsv = cv2.cvtColor(roi, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 0] = (hsv[:, :, 0] + (np.random.rand() - 0.5) * 30) % 180
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (0.7 + np.random.rand() * 0.6), 0, 255)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * (0.7 + np.random.rand() * 0.6), 0, 255)
        roi = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

    if np.random.rand() < 0.3:
        k = np.random.choice([3, 5])
        roi = cv2.GaussianBlur(roi, (k, k), 0)

    return roi


def _augment_incorrect_mask(roi: np.ndarray) -> np.ndarray:
    """Extra perturbations focused on partially-covered faces."""
    h, w = roi.shape[:2]

    # Randomly darken/brighten lower half to emulate mask placement variance.
    if np.random.rand() < 0.7:
        y0 = int(h * (0.45 + np.random.rand() * 0.2))
        alpha = 0.6 + np.random.rand() * 0.8
        beta = (np.random.rand() - 0.5) * 30
        patch = roi[y0:, :, :].astype(np.float32)
        roi[y0:, :, :] = np.clip(alpha * patch + beta, 0, 255).astype(np.uint8)

    # Horizontal strip occlusion around nose/mouth boundary.
    if np.random.rand() < 0.5:
        y = int(h * (0.42 + np.random.rand() * 0.18))
        thickness = max(4, int(h * (0.04 + np.random.rand() * 0.06)))
        color = tuple(int(c) for c in roi.mean(axis=(0, 1)))
        cv2.rectangle(roi, (0, y), (w - 1, min(h - 1, y + thickness)), color, -1)

    return roi


class MaskROIDataset(Dataset):
    def __init__(
        self,
        cache_path: Path,
        indices: np.ndarray | list[int],
        augment: bool = False,
        oversample_incorrect: int = 4,
    ):
        data = np.load(cache_path)
        all_rois = data["rois"]
        all_labels = data["labels"]
        base_indices = np.asarray(indices, dtype=np.int64)
        if augment and oversample_incorrect > 1:
            incorrect_idx = base_indices[all_labels[base_indices] == 2]
            if len(incorrect_idx) > 0:
                extra = np.tile(incorrect_idx, oversample_incorrect - 1)
                base_indices = np.concatenate([base_indices, extra])
        self.rois = all_rois[base_indices]
        self.labels = all_labels[base_indices]
        self.augment = augment

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int):
        roi = self.rois[idx].copy()
        label = int(self.labels[idx])
        if self.augment:
            roi = _augment(roi)
            if label == 2:
                roi = _augment_incorrect_mask(roi)
        x = normalize(roi)
        return torch.from_numpy(x), torch.tensor(label, dtype=torch.long)


if __name__ == "__main__":
    from collections import Counter

    DATASET_ROOT = Path(__file__).resolve().parent / "dataset"
    train_root = DATASET_ROOT / "PWMFD_Train" / "Train"
    val_root = DATASET_ROOT / "PWMFD_Val"

    print("Train index:")
    train_items = build_index(train_root)
    train_counts = Counter(label for _, _, label in train_items)
    for k, v in sorted(train_counts.items()):
        print(f"  class {k} ({CLASS_NAMES[k]}): {v}")

    print("Val index:")
    val_items = build_index(val_root)
    val_counts = Counter(label for _, _, label in val_items)
    for k, v in sorted(val_counts.items()):
        print(f"  class {k} ({CLASS_NAMES[k]}): {v}")
