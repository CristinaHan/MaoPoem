# -*- coding: utf-8 -*-
"""把手迹「星」「火」单字图（白底黑字）合成为透明底红字品牌图 web/brand.png。
- 抠白底：亮度 → alpha（黑=255 不透明，白=0 透明）
- 染红：颜色固定为品牌红 #8b1e1e（与 var(--red) 一致），alpha 保留笔迹浓淡
- 合成：星高 108 / 火高 92（星略大、火缩小，拉开大小差距），垂直居中并排，字距 24px"""
from PIL import Image

RED = (139, 30, 30)  # #8b1e1e

def load_char(path, target_h):
    """读单字图 → 透明底红字，裁剪到内容，等比缩放到高 target_h"""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px_in = im.load()
    px_out = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px_in[x, y]
            lum = (r + g + b) / 3
            if lum < 235:  # 纯白(≈250+)透明；浅灰抗锯齿像素按亮度留少量 alpha
                alpha = int((235 - lum) / 235 * 255)
                px_out[x, y] = (RED[0], RED[1], RED[2], alpha)
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    ratio = target_h / out.height
    return out.resize((max(1, int(out.width * ratio)), target_h), Image.LANCZOS)

star = load_char("web/brand-crops/星.jpg", 108)  # 星笔画多、视觉偏小，略放大平衡
fire = load_char("web/brand-crops/火.jpg", 92)   # 火缩小，拉开与星的大小差距
GAP = 24  # 星火字距：加大间距，更宽松
W = star.width + GAP + fire.width
H = max(star.height, fire.height)  # 画布取最高字高，避免放大后的星被裁
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
canvas.paste(star, (0, (H - star.height) // 2), star)        # 垂直居中
canvas.paste(fire, (star.width + GAP, (H - fire.height) // 2), fire)
canvas.save("web/brand.png")
print(f"生成 web/brand.png：{canvas.size}，星宽 {star.width} 高 {star.height}，火宽 {fire.width} 高 {fire.height}")

# 校验：透明占比与红字占比
px = canvas.load()
transparent = red_px = 0
for y in range(H):
    for x in range(W):
        a = px[x, y][3]
        if a == 0:
            transparent += 1
        elif a > 128:
            red_px += 1
tot = W * H
print(f"透明 {transparent/tot:.1%}，红字不透明区 {red_px/tot:.1%}")
