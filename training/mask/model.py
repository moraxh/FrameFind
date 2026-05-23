"""MobileNetV3-small adapted for 3-class mask classification."""
from __future__ import annotations

import torch
import torch.nn as nn
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights


def build_model(num_classes: int = 3, pretrained: bool = True) -> nn.Module:
    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1 if pretrained else None
    net = mobilenet_v3_small(weights=weights)
    in_feat = net.classifier[-1].in_features
    net.classifier[-1] = nn.Linear(in_feat, num_classes)
    return net


class MaskNet(nn.Module):
    def __init__(self, num_classes: int = 3, pretrained: bool = True):
        super().__init__()
        self.backbone = build_model(num_classes, pretrained)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)
