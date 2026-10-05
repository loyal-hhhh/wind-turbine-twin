#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成丘陵草原风电场地形（v2 加陡版）：
heightmap.png（几何起伏，丘陵更陡更高 + 山脊脉）+ terrain.jpg（同一高度图渲染 + 坡向光照）
画面无村庄/建筑/农田；RISE=120 时谷底~山脊高差约 96m。
"""
import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(20261005)
S = 1024   # heightmap 分辨率
T = 2048   # 贴图分辨率

# ---------- 1. 高度图：多高斯丘陵（更陡更高）+ 主山脊脉 + 细节噪声 ----------
h = np.zeros((S, S), dtype=np.float64)
y, x = np.mgrid[0:S, 0:S]
n_hills = 8
for _ in range(n_hills):
    cx = rng.uniform(0.12, 0.88) * S
    cy = rng.uniform(0.12, 0.88) * S
    sigma = rng.uniform(45, 130)      # 丘陵更紧凑 → 更陡
    amp = rng.uniform(0.85, 1.25)     # 更高
    h += amp * np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma ** 2))
# 一条西北-东南走向的主山脊脉（更聚焦、更高）
ridge = np.exp(-((x - 0.35 * S) * 0.6 + (y - 0.75 * S) * 0.8) ** 2 / (2 * (260.0) ** 2))
h += ridge * 1.3
h = (h - h.min()) / (h.max() - h.min())
h = h * 0.78 + 0.08                    # 谷底更深
noise = rng.normal(0, 1, (S, S)).astype(np.float32)
noise = Image.fromarray(((noise - noise.min()) / (noise.max() - noise.min()) * 255).astype(np.uint8))
noise = noise.filter(ImageFilter.GaussianBlur(3.0))
noise = np.asarray(noise).astype(np.float64) / 255.0
h = np.clip(h * 0.93 + noise * 0.07, 0.02, 1.0)

img8 = (h * 255).astype(np.uint8)
Image.fromarray(img8).save('assets/heightmap.png')

# ---------- 2. 贴图渲染：同一高度图 → 丘陵草原色 + 坡向光照 ----------
hT = np.asarray(Image.fromarray(img8).resize((T, T), Image.BILINEAR)).astype(np.float64) / 255.0

# 坡向光照（hillshade）：西北光源
dy, dx = np.gradient(hT)
scale = 140.0
nx, ny, nz = -dx * scale, -dy * scale, np.ones_like(dx)
norm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
nx /= norm; ny /= norm; nz /= norm
Lx, Ly, Lz = -0.55, -0.45, 0.71
l = np.clip(nx * Lx + ny * Ly + nz * Lz, 0, 1)
shade = 0.70 + 0.55 * l

# 颜色分层（谷地草甸 → 草坡 → 高草坡 → 山脊草黄）
stops = [(0.02, (44, 84, 52)), (0.28, (66, 104, 60)), (0.52, (92, 118, 66)),
         (0.76, (124, 126, 78)), (0.92, (144, 134, 94)), (1.00, (152, 140, 100))]
def ramp(hh):
    out = np.zeros((*hh.shape, 3))
    for k in range(len(stops) - 1):
        h0, c0 = stops[k]; h1, c1 = stops[k + 1]
        m = (hh >= h0) & (hh < h1)
        t = np.clip((hh[m] - h0) / (h1 - h0), 0, 1)[:, None]
        out[m] = np.array(c0)[None, :] + (np.array(c1)[None, :] - np.array(c0)[None, :]) * t
    out[hh >= stops[-1][0]] = stops[-1][1]
    return out
rgb = ramp(hT)

# 山顶裸土斑块
soilMask = (hT > 0.86) & (rng.random((T, T)) > 0.45)
rgb[soilMask] = np.array([150, 132, 88])

# 草地明暗斑块
patch = rng.normal(0, 1, (T, T)).astype(np.float32)
patch = Image.fromarray(((patch - patch.min()) / (patch.max() - patch.min()) * 255).astype(np.uint8))
patch = patch.filter(ImageFilter.GaussianBlur(26))
patch = np.asarray(patch).astype(np.float64) / 255.0
rgb[patch > 0.58] = np.clip(rgb[patch > 0.58] * 1.08, 0, 255)
rgb[patch < 0.32] = np.clip(rgb[patch < 0.32] * 0.90, 0, 255)

# 谷地小河 + 河岸
river = hT < 0.115
river = Image.fromarray((river.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(5))
river = np.asarray(river).astype(np.float64) / 255.0
riverMask = river > 0.4
rgb[riverMask] = np.array([44, 92, 104]) * (1 - river[riverMask])[:, None] + \
                 np.array([64, 106, 68]) * river[riverMask][:, None]
bank = (hT >= 0.115) & (hT < 0.17)
rgb[bank] = np.clip(rgb[bank] * 0.93, 0, 255)

# 应用坡向光照
rgb = np.clip(rgb * shade[:, :, None], 0, 255)

# 高频草地纹理（破坏等高线波纹）
grass = rng.normal(0, 1, (T, T)).astype(np.float32)
grass = Image.fromarray(((grass - grass.min()) / (grass.max() - grass.min()) * 255).astype(np.uint8))
grass = grass.filter(ImageFilter.GaussianBlur(1.6))
grass = np.asarray(grass).astype(np.float64) / 255.0
rgb = rgb * (0.94 + 0.12 * grass[:, :, None])

# 全局微噪声（dither 消除色带）
fine = rng.normal(0, 9, (T, T, 3))
rgb = np.clip(rgb + fine, 0, 255).astype(np.uint8)

Image.fromarray(rgb).save('assets/terrain.jpg', quality=90)
print('✅ 新地形 v2 生成完成')
print('   heightmap.png: 1024x1024 · 高程范围 %.2f~%.2f' % (h.min(), h.max()))
print('   terrain.jpg  : 2048x2048 · 丘陵更陡更高，无村庄/建筑/农田')

import json
json.dump({"min": 18.0, "max": 36.0, "range_m": 18.0}, open('assets/dem_meta.json', 'w'))
print('   dem_meta.json 已更新')
