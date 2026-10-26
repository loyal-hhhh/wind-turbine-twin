# AI 代理模型训练：输入 14 维（13 应变比 + 基频比）→ 输出 (a, d)
import json, numpy as np
from sklearn.neural_network import MLPRegressor
from sklearn.model_selection import train_test_split

data = json.load(open('train.json'))
X = np.array(data['X'], dtype=float)
Y = np.array(data['Y'], dtype=float)

# 归一化
x_mean, x_std = X.mean(0), X.std(0) + 1e-8
Xn = (X - x_mean) / x_std
A_SCALE, D_SCALE = 133.5, 0.9
Yn = np.stack([Y[:,0]/A_SCALE, Y[:,1]/D_SCALE], axis=1)

Xtr, Xte, Ytr, Yte = train_test_split(Xn, Yn, test_size=0.2, random_state=42)
mlp = MLPRegressor(hidden_layer_sizes=(96,96), activation='relu',
                   solver='adam', alpha=1e-4, max_iter=800,
                   learning_rate_init=1e-3, early_stopping=True,
                   n_iter_no_change=40, random_state=0)
mlp.fit(Xtr, Ytr)

# 评估（还原原单位）
p = mlp.predict(Xte)
a_pred, d_pred = p[:,0]*A_SCALE, p[:,1]*D_SCALE
a_true, d_true = Yte[:,0]*A_SCALE, Yte[:,1]*D_SCALE
mae_a = np.abs(a_pred-a_true).mean(); mae_d = np.abs(d_pred-d_true).mean()
print(f'测试集: n={len(a_true)}  a MAE={mae_a:.2f}m  d MAE={mae_d:.3f}')
# 健康机判定性能
health = d_true < 0.08
if health.sum() > 0:
    hit = np.abs(d_pred[health]) < 0.08
    print(f'健康机判对率: {hit.mean()*100:.1f}% ({health.sum()}例)')

# 导出权重
layers = []
for W, b in zip(mlp.coefs_, mlp.intercepts_):
    layers.append({'W': W.T.tolist(), 'b': b.tolist()})  # 前端按行主序 W[i][j]=W[j][i]
out = {'layers': layers, 'x_mean': x_mean.tolist(), 'x_std': x_std.tolist(),
       'a_scale': A_SCALE, 'd_scale': D_SCALE, 'mae_a': round(mae_a,3), 'mae_d': round(mae_d,3)}
json.dump(out, open('weights.json','w'))
print('权重已导出 weights.json，层:', [len(l['W']) for l in layers], '×', [len(l['W'][0]) for l in layers])
