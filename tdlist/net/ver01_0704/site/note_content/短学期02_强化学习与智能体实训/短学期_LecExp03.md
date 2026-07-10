---
title: 短学期 LecExp03
date: 2026-07-09
tags: [深度学习, 回归, PyTorch, California Housing, 短学期, 实验]
description: 加州房价 MLP 回归——数据探索、标准化、MSE 训练与 RMSE/MAE/R² 评估速查
---

#rat1#
## California Housing：数据加载

**加州房价数据集**（1990 年美国人口普查）：**20640 个街区**，**8 个特征**，预测街区房价中位数（单位：**10 万美元**）。

| 特征 | 含义 |
|------|------|
| MedInc | 街区收入中位数 |
| HouseAge | 房屋年龄中位数 |
| AveRooms | 平均房间数 |
| AveBedrms | 平均卧室数 |
| Population | 街区人口 |
| AveOccup | 平均入住率 |
| Latitude | 纬度 |
| Longitude | 经度 |

### 加载与预处理

```python
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split

data = fetch_california_housing()
X, y = data.data, data.target          # X: (20640, 8), y: (20640,)

# 剔除房价被截断在上限 5.0 的街区（真实 >=50 万均记为 5.0）
mask = y < 5.0
X, y = X[mask], y[mask]                # 剔除 992 个 → 19648 样本
```

| 统计量 | 值（预处理后） |
|--------|----------------|
| 样本数 | 19648 |
| 特征数 | 8 |
| 房价范围 | 0.15 ~ 4.99（10 万美元） |
| 均值 / 中位数 | 1.92 / 1.74 |
| 最正相关特征 | **MedInc**（\(r \approx 0.647\)） |

**回归 vs 分类**：目标 \(y\) 是**连续值**，不是离散类别。

## 划分数据集与特征标准化

### 8:2 训练 / 测试划分

```python
SEED = 2026
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=SEED
)
# 训练集 15718，测试集 3930
```

测试集**全程只在最后评估**时使用。

### 标准化（防数据泄漏）

\[
x' = \frac{x - \mu}{\sigma}
\]

**\(\mu, \sigma\) 只能用训练集统计**，再用同一组变换测试集。

```python
mu = X_train.mean(axis=0)
sigma = X_train.std(axis=0)

X_train = (X_train - mu) / sigma
X_test = (X_test - mu) / sigma
# 标准化后训练集各特征均值≈0，标准差≈1
```

| 要点 | 说明 |
|------|------|
| 为何标准化 | `Population` 上千、`AveBedrms` 约 1，量纲差异大 → 大特征主导梯度 |
| 数据泄漏 | 若用**全体数据**算 \(\mu,\sigma\)，测试集信息泄露 → R² 虚高 |
| 不做标准化 | MSE 往往更大、收敛更慢 |

### 转张量与 DataLoader

```python
import torch
from torch.utils.data import DataLoader, TensorDataset

X_train_t = torch.tensor(X_train, dtype=torch.float32)
y_train_t = torch.tensor(y_train, dtype=torch.float32).reshape(-1, 1)  # 列向量 (N,1)
X_test_t = torch.tensor(X_test, dtype=torch.float32)
y_test_t = torch.tensor(y_test, dtype=torch.float32).reshape(-1, 1)

train_loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=64, shuffle=True)
test_loader = DataLoader(TensorDataset(X_test_t, y_test_t), batch_size=64, shuffle=False)
# 一个 batch: feature (64, 8), target (64, 1)
```

#rat2#
## MLP 回归网络

若干层 `Linear + ReLU`，输出层**单个连续值、无激活**。

| 层 | 操作 | 输入 → 输出 |
|----|------|-------------|
| fc1 | Linear(8→64) + ReLU | 8 → 64 |
| fc2 | Linear(64→32) + ReLU | 64 → 32 |
| fc3 | Linear(32→1) | 32 → **1**（房价预测） |

```python
import torch.nn as nn

class MLPRegressor(nn.Module):
    def __init__(self, in_features=8):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, 64), nn.ReLU(),
            nn.Linear(64, 32), nn.ReLU(),
            nn.Linear(32, 1),              # 回归：1 个值，无激活
        )

    def forward(self, x):
        return self.net(x)                 # (batch, 1)

model = MLPRegressor(in_features=8)
# 总参数量: 2,689
```

| 对比 | 分类 | 回归 |
|------|------|------|
| 输出层 | K 个 logits | **1 个值** |
| 输出激活 | 无（CE 内含 Softmax） | **无** |
| 损失 | CrossEntropyLoss | **MSELoss** |

## 损失、优化与训练循环

### MSE 损失

\[
\mathcal{L}_{\text{MSE}} = \frac{1}{N}\sum_{i=1}^{N}(\hat{y}_i - y_i)^2
\]

```python
criterion = nn.MSELoss()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
```

### 训练五步

```text
1. 前向传播：  preds = model(features)
2. 计算损失：  loss  = criterion(preds, targets)
3. 梯度清零：  optimizer.zero_grad()
4. 反向传播：  loss.backward()
5. 更新权重：  optimizer.step()
```

```python
def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    running_loss, total = 0.0, 0
    for features, targets in loader:
        features, targets = features.to(device), targets.to(device)
        preds = model(features)
        loss = criterion(preds, targets)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        running_loss += loss.item() * features.size(0)
        total += features.size(0)
    return running_loss / total

@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    running_loss, total = 0.0, 0
    for features, targets in loader:
        features, targets = features.to(device), targets.to(device)
        loss = criterion(model(features), targets)
        running_loss += loss.item() * features.size(0)
        total += features.size(0)
    return running_loss / total
```

```python
EPOCHS = 30
for epoch in range(1, EPOCHS + 1):
    train_mse = train_one_epoch(model, train_loader, criterion, optimizer, device)
    test_mse = evaluate(model, test_loader, criterion, device)
```

## 评估与可视化

### 训练曲线

记录 `train_mse` / `test_mse` 随 epoch 变化；二者均应下降。

### 回归指标（测试集，30 epoch 后）

```python
model.eval()
preds_all, targets_all = [], []
with torch.no_grad():
    for features, targets in test_loader:
        preds_all.append(model(features.to(device)).cpu())
        targets_all.append(targets)
preds_all = torch.cat(preds_all).squeeze().numpy()
targets_all = torch.cat(targets_all).squeeze().numpy()

mse = np.mean((preds_all - targets_all) ** 2)
rmse = np.sqrt(mse)
mae = np.mean(np.abs(preds_all - targets_all))
r2 = 1 - np.sum((targets_all - preds_all)**2) / np.sum((targets_all - targets_all.mean())**2)
```

| 指标 | 公式 | 实验结果 |
|------|------|----------|
| **RMSE** | \(\sqrt{\text{MSE}}\) | **0.4908** |
| **MAE** | \(\frac{1}{N}\sum\|\hat{y}-y\|\) | **0.3343** |
| **R²** | \(1 - \frac{SS_{\text{res}}}{SS_{\text{tot}}}\) | **0.7393** |

| Epoch | train MSE (RMSE) | test MSE (RMSE) |
|-------|------------------|-----------------|
| 1 | 0.9416 (0.9703) | 0.4041 (0.6357) |
| 30 | 0.2286 (0.4781) | **0.2409 (0.4908)** |

### 预测散点图

`plt.scatter(真实, 预测)` + 对角线 \(y=x\)（完美预测）。R²≈0.74 表示模型解释了约 74% 的房价方差。

#rat1#
## 实验要点

**训练过程观察：**

- MSE 从 epoch 1 的 ~0.94 降至 epoch 30 的 ~0.23（train）/ ~0.24（test）
- test MSE 始终接近 train MSE → **无明显过拟合**
- 与 Lec03 回归任务一致：输出层 Linear 无激活，MSE 损失

**为何剔除 y=5.0 的样本？**

数据集把所有真实房价 ≥50 万美元的街区统一记为 5.0 → 高价区标签有**截断偏差**，模型会系统性低估。

#rat2#
## 回归 vs 分类对照

| | 分类（如 MNIST） | 回归（本实验） |
|---|------------------|----------------|
| 目标 | 离散类别 0~9 | 连续房价 |
| 模型 | CNN | **MLP** |
| 输出层 | K 个 logits | **1 个值，无激活** |
| 损失 | 交叉熵 | **MSE** |
| 评估 | Accuracy、混淆矩阵 | **RMSE、MAE、R²、散点图** |
| 训练五步 | 相同 | 相同 |

## 操作对照（本实验流程）

| 步骤 | 操作 | 代码要点 |
|------|------|----------|
| 加载 | `fetch_california_housing()` | 剔除 `y >= 5.0` |
| 划分 | `train_test_split(..., 0.2)` | 先划分再标准化 |
| 标准化 | `(X - mu) / sigma` | mu/sigma **仅来自 train** |
| 张量 | `FloatTensor`, `y.reshape(-1,1)` | 目标列向量 |
| 模型 | `MLPRegressor` | 最后 Linear(32→1) 无激活 |
| 训练 | Adam + MSE，30 epoch | `model.train()` |
| 评估 | RMSE / MAE / R² | `model.eval()` + `no_grad` |

**操作注意：**

- `y` 必须 reshape 为 `(N, 1)` 才能与网络输出对齐
- 验证 / 测试前调用 `model.eval()`，推理用 `torch.no_grad()`
- 输出层**不要**接 ReLU（会把负预测截为 0，房价可为任意正数）
- 完整 notebook：`materials/exp3_regressive_intro.ipynb`

**思考题（可自行验证）：**

1. 去掉标准化 → MSE 变大、收敛变慢
2. 用全体数据算 mu/sigma → R² 虚高（数据泄漏）
3. 加深/加宽 MLP → 可能提升 R²，也可能过拟合
4. 输出层错误接 ReLU → 无法预测低值区域
5. 高价区间预测偏差大 → 与原始数据 5.0 截断有关
