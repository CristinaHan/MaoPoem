# -*- coding: utf-8 -*-
"""分析「星星之火，可以燎原」手迹图：定位白色文字的行与字块。
仅用于定位，不修改任何文件。"""
from PIL import Image

SRC = "data/素材库/星星之火_字迹.jpg"
im = Image.open(SRC)
print("尺寸:", im.size, "模式:", im.mode)
rgb = im.convert("RGB")
w, h = rgb.size

# 颜色分布采样（红底为暗红 #b00000，r≈176，阈值须 <176）
red_px = white_px = other = 0
for y in range(0, h, 8):
    for x in range(0, w, 8):
        r, g, b = rgb.getpixel((x, y))
        if r > 120 and g < 110 and b < 110:  # 暗红底：r 明显高、g/b 低
            red_px += 1
        elif r > 200 and g > 200 and b > 200:
            white_px += 1
        else:
            other += 1
tot = red_px + white_px + other
print(f"红:{red_px/tot:.1%} 白:{white_px/tot:.1%} 其他:{other/tot:.1%}")

# 白色文字的水平投影（每行命中数，步进2像素）
row_hits = []
for y in range(h):
    n = 0
    for x in range(0, w, 2):
        r, g, b = rgb.getpixel((x, y))
        if r > 200 and g > 200 and b > 200:
            n += 1
    row_hits.append(n)

# 找文字行区间
lines = []
in_line = False
for y, n in enumerate(row_hits):
    if n >= 3 and not in_line:
        in_line = True
        start = y
    elif n < 3 and in_line:
        if y - start > 10:
            lines.append((start, y))
        in_line = False
if in_line:
    lines.append((start, h - 1))
print("文字行(y0,y1):", lines)

# 每行内做垂直投影找字块
for li, (y0, y1) in enumerate(lines):
    col_hits = []
    for x in range(w):
        n = 0
        for y in range(y0, y1, 2):
            r, g, b = rgb.getpixel((x, y))
            if r > 200 and g > 200 and b > 200:
                n += 1
        col_hits.append(n)
    blocks = []
    in_b = False
    for x, n in enumerate(col_hits):
        if n >= 2 and not in_b:
            in_b = True
            sx = x
        elif n < 2 and in_b:
            if x - sx > 8:
                blocks.append((sx, x))
            in_b = False
    if in_b:
        blocks.append((sx, w - 1))
    print(f"行{li} 字块(x0,x1):", blocks)
