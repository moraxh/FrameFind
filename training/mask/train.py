"""Train 3-class mask classifier on PWMFD face-bbox crops."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from training.mask.dataset import CLASS_NAMES, MaskROIDataset, precompute_cache
from training.mask.model import MaskNet

HERE = Path(__file__).resolve().parent
DATA_ROOT = HERE / "dataset"
TRAIN_ROOT = DATA_ROOT / "PWMFD_Train" / "Train"
VAL_ROOT = DATA_ROOT / "PWMFD_Val"
CACHE_DIR = HERE / "cache"
TRAIN_CACHE = CACHE_DIR / "train.npz"
VAL_CACHE = CACHE_DIR / "val.npz"
CKPT_DIR = HERE / "checkpoints"


def evaluate(model, loader, criterion, device):
    model.eval()
    loss_sum = 0.0
    correct = 0
    total = 0
    conf = np.zeros((3, 3), dtype=np.int64)
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            loss = criterion(logits, y)
            loss_sum += loss.item() * y.size(0)
            preds = torch.argmax(logits, dim=1)
            correct += (preds == y).sum().item()
            total += y.size(0)

            y_np = y.cpu().numpy()
            p_np = preds.cpu().numpy()
            for t, p in zip(y_np, p_np):
                conf[t, p] += 1

    per_class_acc = {}
    per_class_recall = {}
    for i, name in enumerate(CLASS_NAMES):
        denom = conf[i].sum()
        rec = float(conf[i, i] / denom) if denom > 0 else 0.0
        per_class_acc[name] = rec
        per_class_recall[name] = rec
    return loss_sum / max(total, 1), correct / max(total, 1), per_class_acc, per_class_recall, conf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--oversample-incorrect", type=int, default=6)
    ap.add_argument("--no-pretrained", action="store_true")
    ap.add_argument("--rebuild-cache", action="store_true")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    print("preparing ROI caches...")
    precompute_cache(TRAIN_ROOT, TRAIN_CACHE, force=args.rebuild_cache)
    precompute_cache(VAL_ROOT, VAL_CACHE, force=args.rebuild_cache)

    train_labels = np.load(TRAIN_CACHE)["labels"]
    val_labels = np.load(VAL_CACHE)["labels"]
    if len(val_labels) == 0:
        raise RuntimeError(
            f"Validation cache is empty: {VAL_CACHE}. "
            "Check dataset labels/paths in PWMFD_Val."
        )
    train_idx = np.arange(len(train_labels))
    val_idx = np.arange(len(val_labels))
    print(f"train: {len(train_idx)}  val: {len(val_idx)}")

    class_freq = np.bincount(train_labels, minlength=3).astype(np.float32)
    val_freq = np.bincount(val_labels, minlength=3).astype(np.float32)
    total = float(class_freq.sum())
    class_weights = total / (3.0 * np.maximum(class_freq, 1.0))
    print("class_freq:", class_freq.tolist())
    print("val_class_freq:", val_freq.tolist())
    print("class_weights:", class_weights.tolist())
    if (val_freq == 0).any():
        missing = [CLASS_NAMES[i] for i, n in enumerate(val_freq) if n == 0]
        raise RuntimeError(
            "Validation split is missing classes: "
            f"{missing}. Rebuild cache and verify PWMFD_Val annotations."
        )

    train_ds = MaskROIDataset(
        TRAIN_CACHE,
        train_idx,
        augment=True,
        oversample_incorrect=max(1, args.oversample_incorrect),
    )
    val_ds = MaskROIDataset(VAL_CACHE, val_idx, augment=False)
    train_dl = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=True,
    )
    val_dl = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=True,
    )

    model = MaskNet(num_classes=3, pretrained=not args.no_pretrained).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(class_weights, dtype=torch.float32, device=device))

    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    best_score = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        seen = 0
        pbar = tqdm(train_dl, desc=f"epoch {epoch}/{args.epochs}")
        for x, y in pbar:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            opt.step()
            running += loss.item() * y.size(0)
            seen += y.size(0)
            pbar.set_postfix(loss=running / max(seen, 1))
        sched.step()

        val_loss, val_acc, per_class_acc, per_class_recall, conf = evaluate(model, val_dl, criterion, device)
        incorrect_recall = per_class_recall["incorrect_mask"]
        score = 0.6 * val_acc + 0.4 * incorrect_recall
        print(f"  val_loss={val_loss:.4f}  val_acc={val_acc:.4f}")
        print(
            "  per_class_acc:",
            ", ".join(f"{k}={v:.4f}" for k, v in per_class_acc.items()),
        )
        print(f"  incorrect_mask_recall={incorrect_recall:.4f}  selection_score={score:.4f}")
        print("  confusion_matrix:")
        for row in conf:
            print(f"    {row.tolist()}")

        if score > best_score:
            best_score = score
            torch.save(model.state_dict(), CKPT_DIR / "best.pt")
            print(f"  saved best (score={best_score:.4f})")

    torch.save(model.state_dict(), CKPT_DIR / "last.pt")
    print(f"done. best selection_score={best_score:.4f}")


if __name__ == "__main__":
    main()
