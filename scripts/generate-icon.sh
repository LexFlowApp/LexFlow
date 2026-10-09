#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_png="$root/assets/lexflow-master.png"
master_png="$root/assets/lexflow-icon-1024.png"
checkpoint="$root/assets/lexflow-icon-ready.json"
output="$root/assets/lexflow.icns"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/lexflow-icon.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT

# 第一步：把圆角与留白烘焙进母版。原主图是满幅方块，直接出图标会在 macOS 26
# 以前的系统上显示成纯方块；母版自带透明圆角边，因此与系统版本无关。
#
# 母版有两种来源，必须区分，否则会毁图（2026-10-07 实测）：
#   · 满幅主图 lexflow-master.png —— 白底方块，需要 bake 抠白、套圆角底板；
#   · 成品母版 —— 美术直接交付的图标文件（自带米白石板与透明圆角，见
#     《图标替换说明》）。对它再 bake 一次，石板会被亮度阈值判成"接近白"而
#     抠掉约四分之一的不透明像素（995707 → 744872），图标随即损坏。
# 因此以 assets/lexflow-icon-ready.json 作为"母版已是成品"的标记：存在即直接
# 派生，不存在才走 bake。替换成品母版后需同时写入该标记（见替换说明）。
if [ -f "$checkpoint" ]; then
  echo "母版为成品图标，跳过烘焙：$master_png"
  if [ ! -f "$master_png" ]; then
    echo "标记存在但成品母版缺失：$master_png" >&2
    exit 1
  fi
else
  if [ ! -f "$source_png" ]; then
    echo "未找到 LexFlow 主图：$source_png" >&2
    exit 1
  fi
  python3 "$root/scripts/bake-icon-master.py" "$source_png" "$master_png"
fi

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
