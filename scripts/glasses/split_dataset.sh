#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGET_DIR="$SCRIPT_DIR/../../training/dataset"
META_FILE="$TARGET_DIR/meta.txt"
SRC_DIR="$TARGET_DIR/MeGlass_ori"
GLASSES_DIR="$TARGET_DIR/glasses"
NO_GLASSES_DIR="$TARGET_DIR/no_glasses"

if [ ! -d "$SRC_DIR" ]; then
  echo "Source dir $SRC_DIR not found. Run download_dataset.sh first."
  exit 1
fi

curl -L -o "$META_FILE" \
  https://raw.githubusercontent.com/cleardusk/MeGlass/refs/heads/master/meta.txt

mkdir -p "$GLASSES_DIR" "$NO_GLASSES_DIR"

while read -r filename label; do
  [ -z "$filename" ] && continue
  src="$SRC_DIR/$filename"
  [ ! -f "$src" ] && continue
  if [ "$label" = "1" ]; then
    mv "$src" "$GLASSES_DIR/"
  else
    mv "$src" "$NO_GLASSES_DIR/"
  fi
done < "$META_FILE"

rm -rf "$SRC_DIR"
rm -f "$META_FILE"
