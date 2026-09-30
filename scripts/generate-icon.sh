#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_png="$root/assets/lexflow-master.png"
master_png="$root/assets/lexflow-icon-1024.png"
output="$root/assets/lexflow.icns"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/lexflow-icon.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT

if [ ! -f "$source_png" ]; then
  echo "未找到 LexFlow 主图：$source_png" >&2
  exit 1
fi

# 第一步：把圆角与留白烘焙进母版。原主图是满幅方块，直接出图标会在 macOS 26
# 以前的系统上显示成纯方块；母版自带透明圆角边，因此与系统版本无关。
python3 "$root/scripts/bake-icon-master.py" "$source_png" "$master_png"

# 第二步：从母版派生全部尺寸。512x512@2x 直接复用 1024 母版，避免二次取样。
iconset="$temporary/lexflow.iconset"
mkdir "$iconset"

for entry in \
  '16 icon_16x16.png' '32 icon_16x16@2x.png' \
  '32 icon_32x32.png' '64 icon_32x32@2x.png' \
  '128 icon_128x128.png' '256 icon_128x128@2x.png' \
  '256 icon_256x256.png' '512 icon_256x256@2x.png' \
  '512 icon_512x512.png'; do
  read -r size name <<< "$entry"
  sips -z "$size" "$size" "$master_png" --out "$iconset/$name" >/dev/null
done
cp "$master_png" "$iconset/icon_512x512@2x.png"

# 第三步：按官方同一套类型码封装 icns。不用 iconutil——它会写入 ic04/ic05/info
# 三条旧式条目，而官方 icns 只有 PNG 条目。
python3 "$root/scripts/pack-icns.py" "$iconset" "$output"
