"""MeGlass dataset with cached eye-ROI crops."""
from __future__ import annotations

import os
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset
from tqdm import tqdm

from training.glasses.preprocess import EyeROIExtractor, normalize, ROI_SIZE


def _augment(roi: np.ndarray) -> np.ndarray:
    h, w = roi.shape[:2]

    # horizontal flip
    if np.random.rand() < 0.5:
        roi = roi[:, ::-1, :].copy()

    # rotation ±20°
    if np.random.rand() < 0.7:
        angle = (np.random.rand() - 0.5) * 40.0
        M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        roi = cv2.warpAffine(roi, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    # scale / zoom  0.75x – 1.3x
    if np.random.rand() < 0.7:
        scale = 0.75 + np.random.rand() * 0.55
        M = cv2.getRotationMatrix2D((w / 2, h / 2), 0.0, scale)
        roi = cv2.warpAffine(roi, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    # perspective warp (simulate head tilt / angle)
    if np.random.rand() < 0.4:
        margin = 0.12
        pts_src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        def jitter():
            return (np.random.rand() - 0.5) * 2 * margin * w
        pts_dst = pts_src + np.float32([[jitter(), jitter()] for _ in range(4)])
        M = cv2.getPerspectiveTransform(pts_src, pts_dst)
        roi = cv2.warpPerspective(roi, M, (w, h), borderMode=cv2.BORDER_REFLECT)

    # brightness / contrast
    if np.random.rand() < 0.5:
        a = 1.0 + (np.random.rand() - 0.5) * 0.4
        b = (np.random.rand() - 0.5) * 30
        roi = np.clip(a * roi.astype(np.float32) + b, 0, 255).astype(np.uint8)

    # blur (simula desenfoque por distancia)
    if np.random.rand() < 0.3:
        k = np.random.choice([3, 5])
        roi = cv2.GaussianBlur(roi, (k, k), 0)

    return roi


def build_index(root: Path) -> List[Tuple[Path, int]]:
    items: List[Tuple[Path, int]] = []
    for label, sub in [(1, "glasses"), (0, "no_glasses")]:
        d = root / sub
        if not d.is_dir():
            raise FileNotFoundError(f"Missing {d}")
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                items.append((p, label))
    return items


def precompute_cache(root: Path, cache_path: Path) -> None:
    """Run FaceMesh once over the dataset; store ROIs + labels in a single .npz."""
    if cache_path.exists():
        return
    items = build_index(root)
    n = len(items)
    rois = np.zeros((n, ROI_SIZE, ROI_SIZE, 3), dtype=np.uint8)
    labels = np.zeros((n,), dtype=np.int64)
    with EyeROIExtractor() as ex:
        for i, (p, y) in enumerate(tqdm(items, desc="preprocess")):
            img = cv2.imread(str(p))
            if img is None:
                continue
            rois[i] = ex.extract(img)
            labels[i] = y
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache_path, rois=rois, labels=labels)


class GlassesROIDataset(Dataset):
    def __init__(self, cache_path: Path, indices: np.ndarray, augment: bool = False):
        data = np.load(cache_path)
        self.rois = data["rois"][indices]
        self.labels = data["labels"][indices]
        self.augment = augment

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int):
        roi = self.rois[idx]
        if self.augment:
            roi = _augment(roi)
        x = normalize(roi)
        return torch.from_numpy(x), torch.tensor(self.labels[idx], dtype=torch.float32)


def stratified_split(labels: np.ndarray, val_frac: float = 0.1, seed: int = 42):
    rng = np.random.default_rng(seed)
    train, val = [], []
    for c in np.unique(labels):
        idx = np.where(labels == c)[0]
        rng.shuffle(idx)
        cut = int(len(idx) * val_frac)
        val.extend(idx[:cut])
        train.extend(idx[cut:])
    return np.array(train), np.array(val)
