#!/usr/bin/env python3
"""把 LexFlow 主图烘焙成 macOS 应用图标母版。

背景：原来的 assets/lexflow-master.png 是满幅方块（1254x1254、RGB、无 Alpha、
四角不透明）。macOS 26 会给满幅图标自动套系统圆角，但 macOS 26 以前的系统不会，
于是同一个图标在旧系统上显示为一个纯方块。

修法是把"圆角"和"留白"烘焙进素材本身：图案放进白色圆角底板，底板四周留透明边、
四角完全透明。这样图标在任何 macOS 版本上都显示为圆角，不依赖系统遮罩。

输出固定为 1024x1024 RGBA，并被 scripts/generate-icon.sh 用于生成 .icns。
"""
import sys

from PIL import Image, ImageDraw

SIZE = 1024
PAD = 72                      # 四边透明留白；与官方 DSH 图标的 72px 一致
PLATE = SIZE - PAD * 2        # 白色圆角底板边长 880
RADIUS = int(PLATE * 0.2237)  # Apple squircle 的近似圆角半径
ART_RATIO = 0.92              # 图案占底板比例，对齐官方图标的画面占比
WHITE_CUTOFF = 250            # 亮度 >= 该值视为纯白背景
SOLID_CUTOFF = 200            # 亮度 <= 该值视为完全不透明


def bake(source_path: str, output_path: str) -> None:
    source = Image.open(source_path).convert("RGB")
    width, height = source.size
    pixels = source.load()

    # 以亮度把纯白背景转为透明，保留图案本体与其抗锯齿边缘。
    artwork = Image.new("RGBA", (width, height))
    target = artwork.load()
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            brightest = max(red, green, blue)
            if brightest >= WHITE_CUTOFF:
                alpha = 0
            elif brightest <= SOLID_CUTOFF:
                alpha = 255
            else:
                alpha = int((WHITE_CUTOFF - brightest) / (WHITE_CUTOFF - SOLID_CUTOFF) * 255)
            target[x, y] = (red, green, blue, alpha)

    box = artwork.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("主图中找不到任何非白内容，无法生成图标。")
    art_size = int(PLATE * ART_RATIO)
    artwork = artwork.crop(box).resize((art_size, art_size), Image.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rounded_rectangle(
        [PAD, PAD, PAD + PLATE, PAD + PLATE], radius=RADIUS, fill=(255, 255, 255, 255)
    )
    offset = PAD + (PLATE - art_size) // 2
    canvas.alpha_composite(artwork, (offset, offset))

    # 母版必须自证正确：尺寸、四角透明、底板外无溢出内容。
    alpha = canvas.getchannel("A")
    if canvas.size != (SIZE, SIZE):
        raise SystemExit(f"母版尺寸错误：{canvas.size}")
    corners = [(0, 0), (SIZE - 1, 0), (0, SIZE - 1), (SIZE - 1, SIZE - 1)]
    for point in corners:
        if alpha.getpixel(point) != 0:
            raise SystemExit(f"母版四角不透明：{point} = {alpha.getpixel(point)}")
    bounds = alpha.getbbox()
    # 底板覆盖 (PAD, PAD)-(PAD+PLATE-1, PAD+PLATE-1)；圆角抗锯齿会让 bbox 多出
    # 一两个像素，因此只断言"不透明区没有越出留白带"，不断言精确边界。
    margin = PAD + PLATE + 2
    if bounds is None or bounds[0] < PAD - 2 or bounds[1] < PAD - 2 or bounds[2] > margin or bounds[3] > margin:
        raise SystemExit(f"母版不透明区越出留白带：{bounds}")

    canvas.save(output_path)
    print(f"已生成图标母版：{output_path} {canvas.size} 不透明区 {bounds}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("用法：bake-icon-master.py <主图> <输出母版>")
    bake(sys.argv[1], sys.argv[2])
