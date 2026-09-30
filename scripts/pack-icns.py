#!/usr/bin/env python3
"""把图标集打包成与官方一致的现代 .icns。

背景：macOS 自带的 iconutil 会额外写入三条旧式条目——ic04、ic05（老式 ARGB 位图）
和 info（浅色/深色变体表）。官方 DeepSeek Harness 的 icns 只含 PNG 条目
（icp4/icp5/icp6 与 ic07–ic14），没有任何旧式条目。为了让 LexFlow 的图标在
macOS 26 以前的系统上也稳定显示，这里按官方同一套类型码自行封装，不再走 iconutil。

尺寸与类型码的对应（取自官方 icns 实测）：
  icp4=16  icp5=32  icp6=64  ic07=128  ic08=256  ic09=512  ic10=1024
  ic11=32  ic12=64  ic13=512  ic14=1024（后四个是 @2x 槽位）
"""
import struct
import sys

SLOTS = {
    "icp4": "icon_16x16.png",
    "icp5": "icon_16x16@2x.png",
    "icp6": "icon_32x32@2x.png",
    "ic07": "icon_128x128.png",
    "ic08": "icon_256x256.png",
    "ic09": "icon_512x512.png",
    "ic10": "icon_512x512@2x.png",
    "ic11": "icon_16x16@2x.png",
    "ic12": "icon_32x32@2x.png",
    "ic13": "icon_256x256@2x.png",
    "ic14": "icon_512x512@2x.png",
}


def build(iconset_dir: str, output_path: str) -> None:
    import os

    chunks = []
    for kind, filename in SLOTS.items():
        path = os.path.join(iconset_dir, filename)
        if not os.path.isfile(path):
            raise SystemExit(f"图标集缺少 {filename}")
        with open(path, "rb") as handle:
            body = handle.read()
        if body[:4] != b"\x89PNG":
            raise SystemExit(f"{filename} 不是 PNG")
        chunks.append(kind.encode("ascii") + struct.pack(">I", len(body) + 8) + body)

    payload = b"".join(chunks)
    total = len(payload) + 8
    with open(output_path, "wb") as handle:
        handle.write(b"icns" + struct.pack(">I", total) + payload)

    # 自证：只含 PNG 条目，且必需的槽位都在。
    with open(output_path, "rb") as handle:
        data = handle.read()
    if data[:4] != b"icns" or struct.unpack(">I", data[4:8])[0] != len(data):
        raise SystemExit("生成的 icns 头部或长度不正确。")
    offset = 8
    kinds = []
    while offset < len(data):
        kind = data[offset:offset + 4].decode("latin1")
        length = struct.unpack(">I", data[offset + 4:offset + 8])[0]
        if data[offset + 8:offset + 12] != b"\x89PNG":
            raise SystemExit(f"条目 {kind} 不是 PNG")
        kinds.append(kind)
        offset += length
    legacy = [k for k in kinds if k in ("ic04", "ic05", "info")]
    if legacy:
        raise SystemExit(f"生成结果仍含旧式条目：{legacy}")
    print(f"已生成 {output_path}，条目 {kinds}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("用法：pack-icns.py <图标集目录> <输出 icns>")
    build(sys.argv[1], sys.argv[2])
