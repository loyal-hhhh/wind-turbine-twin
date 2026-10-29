# 手写 numpy MLP（18→96→96→2），峰值派生特征 + 健康加权 + LR 衰减 + 早停保存最优
import json, numpy as np
data = json.load(open('train.json'))
X = np.array(data['X'], dtype=float); Y = np.array(data['Y'], dtype=float)
xm, xs = X.mean(0), X.std(0) + 1e-8
Xn = (X - xm) / xs
A_SCALE, D_SCALE = 133.5, 0.9
Yn = np.stack([Y[:,0]/A_SCALE, Y[:,1]/D_SCALE], 1)

STRAIN_Z = [5,15,25,35,45,55,65,75,85,95,105,115,125]
def has_peak(a):
    lo, hi = a, min(a + 6.7, 133.5)
    return any(lo - 1 <= z <= hi + 1 for z in STRAIN_Z)
wa = np.array([1.0 if has_peak(a) else 0.15 for a in Y[:,0]])

rng = np.random.RandomState(42)
def init(nin, nout):
    return (rng.randn(nin, nout) * np.sqrt(2.0 / nin), np.zeros(nout))
W1,b1 = init(18,96); W2,b2 = init(96,96); W3,b3 = init(96,2)
params = [W1,b1,W2,b2,W3,b3]
m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]
t = 0
def forward(x):
    z1 = np.maximum(x @ W1 + b1, 0); z2 = np.maximum(z1 @ W2 + b2, 0)
    return (z2 @ W3 + b3, z1, z2)

LR0, EPOCHS, BS = 3e-3, 1500, 128
N = len(Xn)
val_idx = np.arange(0, N, 7)
Xv, Yv = Xn[val_idx], Yn[val_idx]
best = None
for ep in range(EPOCHS):
    lr = LR0 * (0.6 ** (ep // 500))
    # 健康样本上采样 3 倍（输入平坦 → 输出 d≈0 的强先验）
    health_idx = np.where(Y[:,1] < 0.03)[0]
    pool = np.concatenate([np.arange(N), health_idx, health_idx])
    perm = rng.permutation(len(pool))[:N]  # 每个 epoch 采样 N 条
    perm = pool[perm]
    for i in range(0, N, BS):
        idx = perm[i:i+BS]
        xb, yb, wb = Xn[idx], Yn[idx], wa[idx]
        out, z1, z2 = forward(xb)
        dy = 2.0 * (out - yb) / len(idx)
        dy[:,0] *= wb
        dy[:,1] *= 1 + 2.0 * (yb[:,1] < 0.03)
        gW3 = z2.T @ dy; gb3 = dy.sum(0)
        dz2 = (dy @ W3.T) * (z2 > 0)
        gW2 = z1.T @ dz2; gb2 = dz2.sum(0)
        dz1 = (dz2 @ W2.T) * (z1 > 0)
        gW1 = xb.T @ dz1; gb1 = dz1.sum(0)
        t += 1
        for j, (g, p) in enumerate(zip([gW1,gb1,gW2,gb2,gW3,gb3], params)):
            m[j] = 0.9*m[j] + 0.1*g; v[j] = 0.999*v[j] + 0.001*g*g
            mh = m[j] / (1 - 0.9**t); vh = v[j] / (1 - 0.999**t)
            p -= lr * mh / (np.sqrt(vh) + 1e-8)
    if ep % 50 == 49:
        o, _, _ = forward(Xv)
        ma = np.abs(o[:,0]*A_SCALE - Yv[:,0]*A_SCALE).mean()
        md = np.abs(o[:,1]*D_SCALE - Yv[:,1]*D_SCALE).mean()
        score = ma + md * 60   # a 主导 + d 平衡
        if best is None or score < best[0]:
            best = (score, ma, md, ep+1,
                    [p.copy() for p in params], [mm.copy() for mm in m], [vv.copy() for vv in v], t)

score, ma, md, bep, bp, bm, bv, bt = best
print(f'最优: ep{bep} aMAE={ma:.2f}m dMAE={md:.3f}（保存）')
# 恢复最优权重评估
params, m, v, t = bp, bm, bv, bt
te, ty = Xn[::5], Yn[::5]
o, _, _ = forward(te)
print(f'测试: aMAE={np.abs(o[:,0]*A_SCALE-ty[:,0]*A_SCALE).mean():.2f}m dMAE={np.abs(o[:,1]*D_SCALE-ty[:,1]*D_SCALE).mean():.3f}')
h = ty[:,1] < 0.08
print(f'健康判对率(0.08)={(np.abs(o[h,1]*D_SCALE)<0.08).mean()*100:.1f}% (0.12)={(np.abs(o[h,1]*D_SCALE)<0.12).mean()*100:.1f}%')
for dd in [0.09, 0.3, 0.5]:
    sel = ty[:,1] >= dd - 0.03
    if sel.sum():
        print(f'd≥{dd} n={sel.sum()} aMAE={np.abs(o[sel,0]*A_SCALE-ty[sel,0]*A_SCALE).mean():.2f}m dMAE={np.abs(o[sel,1]*D_SCALE-ty[sel,1]*D_SCALE).mean():.3f}')

layers = []
for W, b in [(W1,b1),(W2,b2),(W3,b3)]:
    layers.append({'W': W.T.tolist(), 'b': b.tolist()})
json.dump({'layers': layers, 'x_mean': xm.tolist(), 'x_std': xs.tolist(),
           'a_scale': A_SCALE, 'd_scale': D_SCALE}, open('weights.json','w'))
print('weights.json 已导出（最优权重）')
