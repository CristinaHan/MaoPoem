# -*- coding: utf-8 -*-
"""把手迹图主文字行切成 9 个候选字块（星星之火，可以燎原），红底抠成透明，
输出 web/brand-crops/ 下带编号的 PNG 与各块白像素占比，用于定位「星」「火」。"""
from PIL import Image
import os

SRC = "data/素材库/星星之火_字迹.jpg"
OUT = "web/brand-crops"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
w, h = im.size
# 主文字行区域（分析得到）
x0, x1, y0, y1 = 318, 1090, 72, 545
line = im.crop((x0, y0, x1, y1))
lw, lh = line.size
N = 9  # 星星之火，可以燎原 = 9 字
seg = lw / N

def crop_to_png(box, name):
    """box: (x0,y0,x1,y1) 相对原图；红底→透明，白字保留，边缘柔化"""
    c = im.crop(box)
    px = c.load()
    cw, ch = c.size
    for yy in range(ch):
        for xx in range(cw):
            r, g, b, a = px[xx, yy]
            # 白度：越接近白色越不透明
            whiteness = min(r, g, b)
            if whiteness > 180:
                alpha = 255
            elif whiteness > 120:
                alpha = int((whiteness - 120) / 60 * 255)
            else:
                alpha = 0
            # 红色像素直接透明（防红色偏白）
            if r > 150 and g < 110 and b < 110:
                alpha = 0
            px[xx, yy] = (r, g, b, alpha)
    # 裁剪到内容边界（去透明边）
    bbox = c.getbbox()
    if bbox:
        c = c.crop(bbox)
    c.save(os.path.join(OUT, name))
    return bbox

print("各字块白像素占比（判断切分质量）:")
for i in range(N):
    bx0 = x0 + int(i * seg)
    bx1 = x0 + int((i + 1) * seg)
    c = im.crop((bx0, y0, bx1, y1))
    px = c.load()
    cw, ch = c.size
    white = 0
    for yy in range(ch):
        for xx in range(cw):
            r, g, b = px[xx, yy][:3]
            if r > 190 and g > 190 and b > 190:
                white += 1
    ratio = white / (cw * ch)
    name = f"crop{i}.png"
    bbox = crop_to_png((bx0, y0, bx1, y1), name)
    print(f"  [{i}] x:{bx0}-{bx1} 白占比:{ratio:.1%} bbox:{bbox} -> {name}")
