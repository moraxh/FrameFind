"""Export trained mask checkpoint to ONNX for browser/Node inference."""
from __future__ import annotations

import argparse
from pathlib import Path

import onnx
import torch

from training.mask.model import MaskNet
from training.mask.preprocess import ROI_SIZE

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default=str(HERE / "checkpoints" / "best.pt"))
    ap.add_argument(
        "--out",
        default=str(HERE.parent.parent / "apps" / "playground" / "mask" / "model" / "mask.onnx"),
    )
    ap.add_argument("--opset", type=int, default=12)
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    model = MaskNet(num_classes=3, pretrained=False)
    state = torch.load(args.ckpt, map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    dummy = torch.randn(1, 3, ROI_SIZE, ROI_SIZE)
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "N"}, "logits": {0: "N"}},
        opset_version=args.opset,
    )

    m = onnx.load(str(out_path))
    onnx.save(m, str(out_path), save_as_external_data=False)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
