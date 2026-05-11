"""Export trained checkpoint to ONNX for browser inference."""
from __future__ import annotations

import argparse
from pathlib import Path

import torch

from training.glasses.model import GlassesNet
from training.glasses.preprocess import ROI_SIZE

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default=str(HERE / "checkpoints" / "best.pt"))
    ap.add_argument("--out", default=str(HERE.parent / ".."/ "apps" / "playground" / "model" / "glasses.onnx"))
    ap.add_argument("--opset", type=int, default=12)
    args = ap.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    model = GlassesNet(pretrained=False)
    state = torch.load(args.ckpt, map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    dummy = torch.randn(1, 3, ROI_SIZE, ROI_SIZE)
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=["logit"],
        dynamic_axes={"input": {0: "N"}, "logit": {0: "N"}},
        opset_version=args.opset,
        # keep all weights in a single .onnx file — ORT-Web WASM cannot load
        # external data files (.onnx.data) over HTTP
    )
    # strip external data split if torch wrote one anyway
    import onnx
    m = onnx.load(str(out_path))
    onnx.save(m, str(out_path), save_as_external_data=False)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
