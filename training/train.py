"""Train glasses/no-glasses classifier on MeGlass eye-ROI crops."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import GlassesROIDataset, precompute_cache, stratified_split
from model import GlassesNet

HERE = Path(__file__).resolve().parent
DATA_ROOT = HERE / "dataset"
CACHE = HERE / "cache" / "rois.npz"
CKPT_DIR = HERE / "checkpoints"


def evaluate(model, loader, device) -> tuple[float, float]:
    model.eval()
    correct = total = 0
    loss_sum = 0.0
    bce = nn.BCEWithLogitsLoss(reduction="sum")
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            loss_sum += bce(logits, y).item()
            pred = (torch.sigmoid(logits) > 0.5).float()
            correct += (pred == y).sum().item()
            total += y.numel()
    return loss_sum / total, correct / total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--no-pretrained", action="store_true")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    print("preparing ROI cache...")
    precompute_cache(DATA_ROOT, CACHE)

    labels = np.load(CACHE)["labels"]
    train_idx, val_idx = stratified_split(labels, val_frac=0.1)
    print(f"train: {len(train_idx)}  val: {len(val_idx)}")

    train_ds = GlassesROIDataset(CACHE, train_idx, augment=True)
    val_ds = GlassesROIDataset(CACHE, val_idx, augment=False)
    train_dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                          num_workers=args.workers, pin_memory=True)
    val_dl = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                        num_workers=args.workers, pin_memory=True)

    pos = (labels[train_idx] == 1).sum()
    neg = (labels[train_idx] == 0).sum()
    pos_weight = torch.tensor([neg / max(pos, 1)], device=device)
    print(f"pos_weight: {pos_weight.item():.3f}")

    model = GlassesNet(pretrained=not args.no_pretrained).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    bce = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    best_acc = 0.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        n = 0
        pbar = tqdm(train_dl, desc=f"epoch {epoch}/{args.epochs}")
        for x, y in pbar:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            logits = model(x)
            loss = bce(logits, y)
            loss.backward()
            opt.step()
            running += loss.item() * y.size(0)
            n += y.size(0)
            pbar.set_postfix(loss=running / n)
        sched.step()

        val_loss, val_acc = evaluate(model, val_dl, device)
        print(f"  val_loss={val_loss:.4f}  val_acc={val_acc:.4f}")

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), CKPT_DIR / "best.pt")
            print(f"  saved best ({best_acc:.4f})")

    torch.save(model.state_dict(), CKPT_DIR / "last.pt")
    print(f"done. best val_acc={best_acc:.4f}")


if __name__ == "__main__":
    main()
