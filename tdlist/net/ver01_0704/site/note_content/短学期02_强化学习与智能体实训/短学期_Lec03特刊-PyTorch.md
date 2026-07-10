---
title: 短学期 Lec03 特刊-PyTorch
date: 2026-07-09
tags: [PyTorch, 深度学习, 强化学习, 短学期, 特刊]
description: 深度学习 PyTorch 全栈实操手册——张量、Autograd、数据、模型、训练、评估、正则化、CNN/LSTM 与 RL 模板
---

理论背景见 [短学期 Lec03](pages/notes/短学期02_强化学习与智能体实训/短学期_Lec03.html)。本文档按**实际写代码的顺序**组织，覆盖深度学习课程中几乎会用到的全部 PyTorch 操作。

#rat1#
## 1. 张量基础

### 创建、dtype 与形状

```python
import torch

x = torch.tensor([1.0, 2.0, 3.0, 4.0], dtype=torch.float32)
X = torch.randn(32, 4)                    # 标准正态
zeros = torch.zeros(3, 4)
ones = torch.ones(2, 3)
eye = torch.eye(4)                          # 单位阵
arange = torch.arange(0, 10, 2)             # [0,2,4,6,8]

X.shape          # torch.Size([32, 4])
X.dtype          # torch.float32
X.device         # cpu 或 cuda:0
X.numel()        # 元素总数 128
```

| 操作 | 代码 | 说明 |
|------|------|------|
| reshape | `X.view(8, 16)` 或 `X.reshape(8, 16)` | 改变形状，元素总数不变 |
| 升/降维 | `x.unsqueeze(0)` / `x.squeeze(0)` | `(4,)` ↔ `(1,4)` |
| 转置 | `X.T` 或 `X.transpose(0, 1)` | 矩阵转置 |
| 拼接 | `torch.cat([a,b], dim=0)` | 沿 dim 拼接 |
| 堆叠 | `torch.stack([a,b], dim=0)` | 新建维度 |
| 逐元素 | `a * b`, `a + b`, `torch.exp(a)` | 广播机制 |
| 矩阵乘 | `A @ B`, `torch.matmul(A,B)` | Linear 层核心 |
| 索引 | `X[0]`, `X[:, 1]`, `X[mask]` | 与 numpy 类似 |

### numpy 互转

```python
import numpy as np

arr = np.array([1., 2., 3., 4.], dtype=np.float32)
t = torch.from_numpy(arr)           # 共享内存，改一个另一个也变
arr2 = t.detach().cpu().numpy()     # 推理/保存时用 detach
```

### 设备（CPU / GPU）

```python
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
x = x.to(device)
model = model.to(device)

# 多 GPU（了解即可）
# model = nn.DataParallel(model)
```

### 随机种子（可复现）

```python
import random
random.seed(42)
np.random.seed(42)
torch.manual_seed(42)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(42)
```

## 2. 自动微分（Autograd）

PyTorch 用**计算图**自动求梯度，对应 Lec03 反向传播。

```python
x = torch.tensor(2.0, requires_grad=True)
w = torch.tensor(0.5, requires_grad=True)
b = torch.tensor(-0.2, requires_grad=True)

y = w * x + b
loss = 0.5 * (y - 1.0) ** 2
loss.backward()

print(w.grad, b.grad)   # ∂loss/∂w, ∂loss/∂b
```

| 概念 | PyTorch | 说明 |
|------|---------|------|
| 叶子张量 | `requires_grad=True` | 通常是参数或输入 |
| 梯度 | `.grad` | `backward()` 后可用 |
| 清梯度 | `optimizer.zero_grad()` 或 `p.grad.zero_()` | 每步训练前必须 |
| 禁止梯度 | `with torch.no_grad():` | 验证 / 推理 |
| 分离 | `x.detach()` | 截断计算图，不参与反传 |
| 关闭梯度 | `@torch.inference_mode()` | 比 no_grad 更快 |

**注意**：对非标量 `loss` 调用 `backward()` 需传 `gradient` 参数；训练时 loss 通常是标量（`.mean()` / `.sum()`）。

## 3. 数据管道

### TensorDataset + DataLoader

```python
from torch.utils.data import TensorDataset, DataLoader, random_split

X = torch.randn(1000, 4)
y = torch.randint(0, 2, (1000,))

dataset = TensorDataset(X, y)
train_set, val_set = random_split(dataset, [800, 200])

train_loader = DataLoader(train_set, batch_size=32, shuffle=True, drop_last=False)
val_loader = DataLoader(val_set, batch_size=64, shuffle=False)

for x_batch, y_batch in train_loader:
    # x_batch: (32, 4), y_batch: (32,)
    pass
```

| DataLoader 参数 | 含义 |
|-----------------|------|
| `batch_size` | 每批样本数 |
| `shuffle=True` | 训练集每 epoch 打乱 |
| `drop_last=True` | 丢弃最后不足一批的数据 |
| `num_workers=4` | 多进程加载（Windows 有时设 0） |
| `pin_memory=True` | GPU 训练时加速 host→device 拷贝 |

### 自定义 Dataset

```python
from torch.utils.data import Dataset

class ReplayBufferDataset(Dataset):
    def __init__(self, states, actions, rewards, next_states, dones):
        self.states = torch.FloatTensor(states)
        self.actions = torch.LongTensor(actions)
        self.rewards = torch.FloatTensor(rewards)
        self.next_states = torch.FloatTensor(next_states)
        self.dones = torch.FloatTensor(dones)

    def __len__(self):
        return len(self.states)

    def __getitem__(self, idx):
        return (self.states[idx], self.actions[idx],
                self.rewards[idx], self.next_states[idx], self.dones[idx])
```

### 图像 transforms（torchvision）

```python
from torchvision import transforms
from torchvision.datasets import CIFAR10

transform = transforms.Compose([
    transforms.ToTensor(),                          # HWC uint8 → CHW float [0,1]
    transforms.Normalize(mean=(0.5,)*3, std=(0.5,)*3),
    transforms.RandomHorizontalFlip(p=0.5),         # 数据增强
])

train_ds = CIFAR10(root="./data", train=True, download=True, transform=transform)
train_loader = DataLoader(train_ds, batch_size=128, shuffle=True, num_workers=2)
```

#rat2#
## 4. 模型构建（nn.Module）

### 常用层一览

```python
import torch.nn as nn
import torch.nn.functional as F

nn.Linear(4, 64)              # 全连接
nn.ReLU()                     # 激活
nn.Sigmoid() / nn.Tanh()
nn.GELU()                     # Transformer 常用
nn.Dropout(0.5)               # 训练时随机置零
nn.BatchNorm1d(64)           # 1D BN（MLP）
nn.BatchNorm2d(32)            # 2D BN（CNN）
nn.LayerNorm(64)              # Transformer 常用
nn.Conv2d(3, 32, 3, padding=1)
nn.MaxPool2d(2, 2)
nn.AdaptiveAvgPool2d(1)       # 全局平均池化 → (B,C,1,1)
nn.Flatten()
nn.Embedding(vocab_size, dim) # NLP
nn.LSTM(4, 64, batch_first=True)
nn.GRU(4, 64, batch_first=True)
nn.MultiheadAttention(64, 8)  # embed_dim, num_heads
```

| 层 | 输入形状示例 | 输出形状示例 |
|----|-------------|-------------|
| `Linear(4,64)` | `(B, 4)` | `(B, 64)` |
| `Conv2d(3,32,3,p=1)` | `(B, 3, H, W)` | `(B, 32, H, W)` |
| `MaxPool2d(2)` | `(B, 32, H, W)` | `(B, 32, H/2, W/2)` |
| `LSTM(4,64,batch_first)` | `(B, T, 4)` | `(B, T, 64)` |
| `BatchNorm1d(64)` | `(B, 64)` 或 `(B,*,64)` | 同输入 |

### Sequential 与自定义 Module

```python
class MLPClassifier(nn.Module):
    def __init__(self, in_dim=4, hidden=128, n_classes=2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, n_classes),
        )

    def forward(self, x):
        return self.net(x)

model = MLPClassifier()
logits = model(torch.randn(16, 4))   # (16, 2)
```

**`forward` vs `F`**：`nn.ReLU()` 是层模块；`F.relu(x)` 是函数式调用，无参数，常用于残差连接 `x + F.relu(x)`。

### 参数初始化

```python
def init_weights(m):
    if isinstance(m, nn.Linear):
        nn.init.xavier_uniform_(m.weight)
        nn.init.zeros_(m.bias)

model.apply(init_weights)
```

| 初始化 | API | 适用 |
|--------|-----|------|
| Xavier | `nn.init.xavier_uniform_` | Sigmoid/Tanh |
| Kaiming | `nn.init.kaiming_uniform_` | ReLU |
| 零偏置 | `nn.init.zeros_(bias)` | 常用默认 |

### 查看模型

```python
print(model)
sum(p.numel() for p in model.parameters())           # 总参数量
sum(p.numel() for p in model.parameters() if p.requires_grad)  # 可训练
list(model.named_parameters())[:2]
```

## 5. 损失函数

```python
criterion_mse = nn.MSELoss()                    # 回归 / Q 值
criterion_l1 = nn.L1Loss()                      # MAE
criterion_huber = nn.SmoothL1Loss()             # Huber，DQN 常用
criterion_ce = nn.CrossEntropyLoss()            # 多分类，输入 logits
criterion_bce = nn.BCEWithLogitsLoss()          # 二分类
criterion_bce_multi = nn.BCELoss()              # 多标签，输入概率
criterion_kld = nn.KLDivLoss(reduction="batchmean")
```

| 任务 | 损失 | 预测 | 标签 |
|------|------|------|------|
| 回归 | `MSELoss` | `(B,)` 或 `(B,d)` float | 同形状 float |
| 多分类 | `CrossEntropyLoss` | `(B, K)` logits | `(B,)` long，值 0..K-1 |
| 二分类 | `BCEWithLogitsLoss` | `(B, 1)` logits | `(B, 1)` float 0/1 |
| 多标签 | `BCEWithLogitsLoss` | `(B, K)` logits | `(B, K)` float 0/1 |
| Q-learning TD | `SmoothL1Loss` / `MSELoss` | `Q(s,a)` | \(r + \gamma \max Q(s')\) |

```python
# 多分类示例
logits = model(x)                    # (B, K)
loss = criterion_ce(logits, y.long())

# 带类别权重（不平衡数据）
weights = torch.tensor([1.0, 3.0])
criterion_ce = nn.CrossEntropyLoss(weight=weights.to(device))

# label smoothing（了解）
criterion_ce = nn.CrossEntropyLoss(label_smoothing=0.1)
```

## 6. 优化器

```python
import torch.optim as optim

optimizer = optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
# optimizer = optim.SGD(model.parameters(), lr=0.01, momentum=0.9)
# optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-2)
# optimizer = optim.RMSprop(model.parameters(), lr=1e-3)
```

| 优化器 | 创建 | 特点 |
|--------|------|------|
| SGD | `SGD(..., momentum=0.9)` | 大 batch / 微调 |
| SGD+Nesterov | `SGD(..., momentum=0.9, nesterov=True)` | 加速收敛 |
| Adam | `Adam(..., lr=1e-3)` | **默认首选** |
| AdamW | `AdamW(..., weight_decay=1e-2)` | 解耦 weight decay |
| RMSprop | `RMSprop(...)` | RNN / DQN 有时用 |

### 学习率调度器

```python
scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=30, gamma=0.1)
# 每个 epoch 末尾:
scheduler.step()

# 按验证 loss 自适应降低
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=5)
scheduler.step(val_loss)

# 余弦退火
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100)
```

### 梯度裁剪（RNN / RL 常用）

```python
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
optimizer.step()
```

### 只优化部分参数

```python
optimizer = optim.Adam([
    {"params": model.backbone.parameters(), "lr": 1e-4},
    {"params": model.head.parameters(), "lr": 1e-3},
])
```

#rat1#
## 7. 完整训练循环（监督学习模板）

```python
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = MLPClassifier().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=3)

best_val_loss = float("inf")
patience, bad_epochs = 10, 0

for epoch in range(1, num_epochs + 1):
    # ---- 训练 ----
    model.train()
    train_loss, train_correct, train_total = 0.0, 0, 0
    for x, y in train_loader:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad()
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        train_loss += loss.item() * x.size(0)
        train_correct += (logits.argmax(1) == y).sum().item()
        train_total += x.size(0)

    train_loss /= train_total
    train_acc = train_correct / train_total

    # ---- 验证 ----
    model.eval()
    val_loss, val_correct, val_total = 0.0, 0, 0
    with torch.no_grad():
        for x, y in val_loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            loss = criterion(logits, y)
            val_loss += loss.item() * x.size(0)
            val_correct += (logits.argmax(1) == y).sum().item()
            val_total += x.size(0)

    val_loss /= val_total
    val_acc = val_correct / val_total
    scheduler.step(val_loss)

    print(f"Epoch {epoch}: train_loss={train_loss:.4f} acc={train_acc:.3f} | "
          f"val_loss={val_loss:.4f} acc={val_acc:.3f}")

    # ---- 早停 + 保存最佳 ----
    if val_loss < best_val_loss:
        best_val_loss = val_loss
        bad_epochs = 0
        torch.save(model.state_dict(), "best_model.pt")
    else:
        bad_epochs += 1
        if bad_epochs >= patience:
            print("Early stopping.")
            break

model.load_state_dict(torch.load("best_model.pt", map_location=device))
```

### train / eval 模式差异

| 调用 | Dropout | BatchNorm |
|------|---------|-----------|
| `model.train()` | 生效 | 用当前 batch 统计 |
| `model.eval()` | 关闭 | 用 running mean/var |

**RL 注意**：DQN 训练时 target network 应 `target_net.eval()` 且 `torch.no_grad()` 算 TD target。

## 8. 评估与指标

### 分类

```python
model.eval()
all_preds, all_labels = [], []
with torch.no_grad():
    for x, y in test_loader:
        x = x.to(device)
        preds = model(x).argmax(dim=1).cpu()
        all_preds.append(preds)
        all_labels.append(y)

preds = torch.cat(all_preds)
labels = torch.cat(all_labels)
accuracy = (preds == labels).float().mean().item()
```

| 指标 | PyTorch / sklearn | 说明 |
|------|-------------------|------|
| Accuracy | `(pred==y).mean()` | 整体正确率 |
| Precision/Recall/F1 | `sklearn.metrics` | 分类详细指标 |
| Top-k | `logits.topk(k, dim=1)` | 多分类 |

### 回归

```python
mse = nn.MSELoss()(pred, target).item()
mae = nn.L1Loss()(pred, target).item()
rmse = mse ** 0.5
# R² 可用 sklearn.metrics.r2_score
```

### 混淆矩阵（sklearn）

```python
from sklearn.metrics import confusion_matrix, classification_report
print(confusion_matrix(labels, preds))
print(classification_report(labels, preds))
```

## 9. 正则化与防过拟合

| 方法 | PyTorch 实现 | 说明 |
|------|--------------|------|
| L2 正则 | `optim.Adam(..., weight_decay=1e-4)` | 权重衰减 |
| Dropout | `nn.Dropout(0.5)` + `model.eval()` | 测试时关闭 |
| BatchNorm | `nn.BatchNorm1d/2d` | 稳定训练 |
| 早停 | 监控 `val_loss` | 见 §7 模板 |
| 数据增强 | `transforms.Random*` | 图像任务 |
| 更小模型 | 减少 `hidden` / 层数 | 结构正则 |

```python
# Dropout 正确用法
model.train()   # 训练：Dropout 生效
model.eval()    # 测试：Dropout 关闭

# 手动 L2：loss = ce_loss + 1e-4 * sum(p.pow(2).sum() for p in model.parameters())
```

## 10. 保存与加载

```python
# 只存权重（推荐）
torch.save(model.state_dict(), "model.pt")
model.load_state_dict(torch.load("model.pt", map_location=device))

# 存整个模型（含结构，不推荐长期用）
torch.save(model, "model_full.pt")

# 存 checkpoint（断点续训）
torch.save({
    "epoch": epoch,
    "model_state_dict": model.state_dict(),
    "optimizer_state_dict": optimizer.state_dict(),
    "best_val_loss": best_val_loss,
}, "checkpoint.pt")

ckpt = torch.load("checkpoint.pt", map_location=device)
model.load_state_dict(ckpt["model_state_dict"])
optimizer.load_state_dict(ckpt["optimizer_state_dict"])
```

#rat2#
## 11. CNN 模板

```python
class SimpleCNN(nn.Module):
    def __init__(self, n_classes=10):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 8 * 8, 256), nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, n_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))

# 输入 x: (B, 3, 32, 32) → logits (B, n_classes)
```

### Atari DQN 风格

```python
class AtariQNet(nn.Module):
    def __init__(self, n_actions=4):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(4, 32, 8, stride=4), nn.ReLU(),
            nn.Conv2d(32, 64, 4, stride=2), nn.ReLU(),
            nn.Conv2d(64, 64, 3, stride=1), nn.ReLU(),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 512), nn.ReLU(),
            nn.Linear(512, n_actions),
        )

    def forward(self, x):
        return self.head(self.conv(x))   # x: (B, 4, 84, 84)
```

## 12. RNN / LSTM / GRU

```python
lstm = nn.LSTM(input_size=4, hidden_size=64, num_layers=2,
               batch_first=True, dropout=0.2)   # num_layers>1 时 dropout 生效
gru = nn.GRU(4, 64, batch_first=True)

x = torch.randn(32, 10, 4)           # (B, seq_len, d_in)
out, (h_n, c_n) = lstm(x)
# out: (B, T, 64) 每步输出
# h_n, c_n: (num_layers, B, 64) 最后层最终状态

q_values = nn.Linear(64, 2)(h_n[-1]) # 用最后时刻 → Q(s,·)
```

| 变体 | API | 说明 |
|------|-----|------|
| LSTM | `nn.LSTM` | 长期记忆 \(\mathbf{c}_t\) + 三门 |
| GRU | `nn.GRU` | 参数更少，效果常接近 |
| 双向 | `bidirectional=True` | `out` 维度 ×2 |

**pack 变长序列**（NLP 进阶）：

```python
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence
# lengths: 每条序列真实长度
packed = pack_padded_sequence(x, lengths, batch_first=True, enforce_sorted=False)
out_packed, (h, c) = lstm(packed)
```

## 13. 混合精度与性能（了解）

```python
# AMP：GPU 上加速训练
scaler = torch.cuda.amp.GradScaler()
with torch.cuda.amp.autocast():
    logits = model(x)
    loss = criterion(logits, y)
scaler.scale(loss).backward()
scaler.step(optimizer)
scaler.update()
optimizer.zero_grad()
```

| 技巧 | 代码 |
|------|------|
| 固定内存 | `DataLoader(..., pin_memory=True)` |
| 非阻塞拷贝 | `x.to(device, non_blocking=True)` |
| 推理加速 | `@torch.inference_mode()` |
| 算子 benchmark | `torch.backends.cudnn.benchmark = True` |

## 14. RL 专用模板

### Q 网络

```python
class QNet(nn.Module):
    def __init__(self, state_dim=4, n_actions=2, hidden=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, n_actions),   # 无输出激活
        )
    def forward(self, x):
        return self.net(x)
```

### DQN 单步更新

```python
def dqn_update(online_net, target_net, optimizer, batch, gamma=0.99, device="cpu"):
    s, a, r, s2, done = batch
    s, a, r, s2, done = [t.to(device) for t in (s, a, r, s2, done)]

    q_sa = online_net(s).gather(1, a.unsqueeze(1)).squeeze(1)
    with torch.no_grad():
        q_next = target_net(s2).max(dim=1).values
        target = r + gamma * q_next * (1 - done)

    loss = nn.SmoothL1Loss()(q_sa, target)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    return loss.item()
```

### 贪心评估

```python
def evaluate_q(q_net, env, n_episodes=50, seed=0, device="cpu"):
    q_net.eval()
    returns = []
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=seed + ep)
        total_r = 0.0
        while True:
            s = torch.FloatTensor(obs).unsqueeze(0).to(device)
            with torch.no_grad():
                a = int(q_net(s).argmax(dim=1).item())
            obs, r, term, trunc, _ = env.step(a)
            total_r += r
            if term or trunc:
                break
        returns.append(total_r)
    return float(np.mean(returns)), float(np.std(returns))
```

### 策略网络（Softmax 输出）

```python
class PolicyNet(nn.Module):
    def __init__(self, state_dim=4, n_actions=2, hidden=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, n_actions),
        )
    def forward(self, x):
        return F.softmax(self.net(x), dim=-1)

probs = policy(obs)
dist = torch.distributions.Categorical(probs)
action = dist.sample()
log_prob = dist.log_prob(action)   # 策略梯度用
```

## 15. 常见问题速查

| 现象 | 原因 | 解决 |
|------|------|------|
| loss 不变 | 忘 `zero_grad` / lr 太小 | 检查优化器步骤 |
| loss NaN | lr 太大 / 梯度爆炸 | 降 lr、`clip_grad_norm_` |
| 验证比训练好 | Dropout/BN 模式错 | 验证前 `model.eval()` |
| CE 报错 | 标签 float / 形状错 | `y.long()`，形状 `(B,)` |
| CUDA OOM | batch 太大 | 减小 batch / 梯度累积 |
| 加载权重报错 | 结构不一致 | 确保同一 `nn.Module` 定义 |

### 梯度累积（大 batch 模拟）

```python
accum_steps = 4
for i, (x, y) in enumerate(train_loader):
    loss = criterion(model(x.to(device)), y.to(device)) / accum_steps
    loss.backward()
    if (i + 1) % accum_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

### 冻结 / 解冻层

```python
for p in model.backbone.parameters():
    p.requires_grad = False    # 冻结特征提取器
# 只训练 head
optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3)
```

## 16. 与 Lec03 概念对照

| Lec03 概念 | PyTorch 对应 |
|------------|--------------|
| 线性层 | `nn.Linear` |
| 激活函数 | `nn.ReLU`, `F.softmax` |
| 前向传播 | `logits = model(x)` |
| 反向传播 | `loss.backward()` |
| SGD / Momentum / Adam | `optim.SGD`, `optim.Adam` |
| MSE / CE | `MSELoss`, `CrossEntropyLoss` |
| L2 正则 | `weight_decay` |
| Dropout | `nn.Dropout` + `model.eval()` |
| 早停 | 监控 val_loss |
| BatchNorm | `nn.BatchNorm1d/2d` |
| 学习曲线 | 记录 train/val loss |
| 过拟合 | val_loss 上升 → 早停/正则 |
| CNN / LSTM | `nn.Conv2d`, `nn.LSTM` |
| DQN Q 网络 | `QNet` + TD target + target net |
| RL 评估 | 纯贪心 `argmax`，不用 ε-greedy |
