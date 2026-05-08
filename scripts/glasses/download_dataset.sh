#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGET_DIR="$SCRIPT_DIR/../../training/dataset"
ZIP_FILE="$TARGET_DIR/meglass.zip"
SRC_DIR="$TARGET_DIR/MeGlass_ori"

mkdir -p "$TARGET_DIR"

if [ ! -d "$SRC_DIR" ]; then
  curl -L -o "$ZIP_FILE" \
    https://www.kaggle.com/api/v1/datasets/download/mantasu/meglass
  unzip -o "$ZIP_FILE" -d "$TARGET_DIR"
  rm -f "$ZIP_FILE"
fi
