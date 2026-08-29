# -*- coding: utf-8 -*-
"""把 9 个候选字块拼成带编号的预览图（白底），供用户目视确认「星」「火」位置。"""
from PIL import Image, ImageDraw
import os

OUT = "web/brand-crops"
imgs = []
for i in range(9):
    p = os.path.join(OUT, f"crop{i}.png")
    im = Image.open(p).convert("RGBA")
    # 白底合成（预览用）
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    imgs.append(bg.convert("RGB"))

# 3x3 网格，每个格子 140x160（字高约 470，缩放到 120 高），编号写在格子顶部
cell_w, cell_h = 150, 200
pad = 20
grid = Image.new("RGB", (cell_w * 3 + pad * 4, cell_h * 3 + pad * 4), (245, 245, 245))
d = ImageDraw.Draw(grid)
for i, im in enumerate(imgs):
    # 等比例缩放到高 150
    ratio = 150 / im.height
    nw = max(1, int(im.width * ratio))
    im = im.resize((nw, 150))
    cx = pad + (i % 3) * cell_w
    cy = pad + (i // 3) * cell_h
    grid.paste(im, (cx + (cell_w - nw) // 2, cy + 30))
    d.text((cx + 6, cy + 6), str(i), fill=(180, 40, 40))
grid.save(os.path.join(OUT, "preview.png"))
print("已生成 web/brand-crops/preview.png（3x3，编号 0-8）")
