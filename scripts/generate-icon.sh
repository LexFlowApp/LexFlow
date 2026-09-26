#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_png="$root/assets/lexflow-master.png"
output="$root/assets/lexflow.icns"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/lexflow-icon.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT

if [ ! -f "$source_png" ]; then
  echo "未找到 LexFlow 主图：$source_png" >&2
  exit 1
fi
normalized_png="$temporary/lexflow.png"
sips -s format png "$source_png" --out "$normalized_png" >/dev/null
sips -z 1024 1024 "$normalized_png" >/dev/null
iconset="$temporary/lexflow.iconset"
mkdir "$iconset"

for entry in \
  '16 icon_16x16.png' '32 icon_16x16@2x.png' \
  '32 icon_32x32.png' '64 icon_32x32@2x.png' \
  '128 icon_128x128.png' '256 icon_128x128@2x.png' \
  '256 icon_256x256.png' '512 icon_256x256@2x.png' \
  '512 icon_512x512.png' '1024 icon_512x512@2x.png'; do
  read -r size name <<< "$entry"
  sips -z "$size" "$size" "$normalized_png" --out "$iconset/$name" >/dev/null
done

iconutil -c icns "$iconset" -o "$output"
