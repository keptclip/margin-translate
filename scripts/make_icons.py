#!/usr/bin/env python3
"""生成 Margin Translate 扩展图标（纯标准库，无需 Pillow）。

用法：python3 scripts/make_icons.py
输出：icons/icon-{16,32,48,128}.png
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
SS = 4  # 超采样倍数，用于抗锯齿


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rounded_alpha(x, y, size, radius):
    """返回像素在圆角矩形内部的覆盖率（0~1，做简单边缘插值）。"""
    if x < 0 or y < 0 or x >= size or y >= size:
        return 0.0
    cx = min(max(x, radius), size - 1 - radius)
    cy = min(max(y, radius), size - 1 - radius)
    dx = x - cx
    dy = y - cy
    d = (dx * dx + dy * dy) ** 0.5
    return 1.0 if d <= radius - 0.5 else max(0.0, min(1.0, radius + 0.5 - d))


def glyph_coverage(x, y, size):
    """白色「文/ T」形笔画的覆盖率（0 或 1，配合超采样得到平滑边缘）。"""
    cx, cy = size / 2, size / 2
    bar_w, bar_h = size * 0.52, size * 0.13
    stem_w, stem_h = size * 0.14, size * 0.46
    # 顶部横条
    if abs(y - (cy - size * 0.13)) <= bar_h / 2 and abs(x - cx) <= bar_w / 2:
        return 1.0
    # 中间竖笔
    if abs(x - cx) <= stem_w / 2 and (cy - size * 0.13) <= y <= (cy - size * 0.13 + stem_h):
        return 1.0
    # 右上小方块：示意「另一语种」
    sx, sy = cx + size * 0.26, cy - size * 0.24
    s = size * 0.13
    if abs(x - sx) <= s / 2 and abs(y - sy) <= s / 2:
        return 1.0
    return 0.0


def render(size):
    c1 = (79, 91, 213)      # #4f5bd5
    c2 = (137, 155, 255)    # #899bff
    bg = [[lerp(c1, c2, (x + y) / (2 * size)) for x in range(size)] for y in range(size)]
    radius = size * 0.24

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # 超采样求平均颜色与透明度
            r = g = b = 0
            a = 0.0
            cov_g = 0.0
            n = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = x + (sx + 0.5) / SS
                    fy = y + (sy + 0.5) / SS
                    n += 1
                    cover = rounded_alpha(fx, fy, size, radius)
                    a += cover
                    cov_g += glyph_coverage(fx, fy, size) * cover
                    base = bg[min(size - 1, int(fy))][min(size - 1, int(fx))]
                    r += base[0]
                    g += base[1]
                    b += base[2]
            alpha = a / n
            gc = cov_g / n
            if alpha <= 0.002:
                row += bytes((0, 0, 0, 0))
                continue
            # 底色合成到不透明度上（over-black 预乘不需要，直接写入 RGB + alpha）
            base_r, base_g, base_b = r / n, g / n, b / n
            out_r = base_r * (1 - gc) + 255 * gc
            out_g = base_g * (1 - gc) + 255 * gc
            out_b = base_b * (1 - gc) + 255 * gc
            row += bytes((int(out_r), int(out_g), int(out_b), int(round(alpha * 255))))
        rows.append(bytes(row))
    return b"".join(rows)


def png_bytes(width, height, raw):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 32, 48, 128):
        raw = render(size)
        path = os.path.join(OUT, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(png_bytes(size, size, raw))
        print("生成", path, len(png_bytes(size, size, raw)), "bytes")


if __name__ == "__main__":
    main()
