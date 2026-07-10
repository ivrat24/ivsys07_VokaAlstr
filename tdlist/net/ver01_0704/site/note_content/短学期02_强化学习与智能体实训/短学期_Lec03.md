---
title: 短学期 Lec03
date: 2026-07-09
tags: [深度学习, 强化学习, 函数逼近, 短学期]
description: 深度学习及训练、模型评价与深度学习神经网络——为 DQN 等值函数逼近做铺垫
---

#rat2#
## 深度学习及训练

用多层可微变换 \(f(\mathbf{x};\mathbf{w})\) 从数据中学习表示与映射。在 RL 中，网络输入常为状态 \(s\)（或状态片段），输出为价值或策略 logits。

#### 回顾

Lec02 的 **表格型 TD / Q-Learning** 直接存储 \(Q(s,a)\)，在状态空间有限时有效。当状态空间巨大或连续（如 Atari 像素、机器人关节角）时，表格无法存储 → 需要 **函数逼近（Function Approximation）**：

\[
Q(s,a) \approx Q(s,a;\mathbf{w}),\quad V(s) \approx V(s;\mathbf{w})
\]

**函数逼近的核心**：参数 \(\mathbf{w}\) 在**所有** \((s,a)\) 之间共享，相似状态得到相似 Q 值 → **泛化**到训练时未见过的状态。

深度学习提供了最常用的逼近器——**多层神经网络** \(f(\mathbf{x};\mathbf{w})\)，通过反向传播自动学习特征表示与参数。

#### 补档

神经网络由**层（Layer）**堆叠而成，每层对输入做线性变换后再经非线性激活。一个典型的 **MLP（多层感知机）** 结构：

```
输入 x → [Linear → ReLU] → [Linear → ReLU] → Linear → 输出 ŷ
         隐层 1              隐层 2           输出层
```

#### 线性层

**全连接层（Linear / Dense）**：
\[
\mathbf{z} = \mathbf{W}\mathbf{x} + \mathbf{b}
\]

| 符号 | 形状 | 含义 |
|------|------|------|
| \(\mathbf{x}\) | \((d_{\text{in}},)\) 或 \((B, d_{\text{in}})\) | 单样本或 batch 输入 |
| \(\mathbf{W}\) | \((d_{\text{out}}, d_{\text{in}})\) | 权重矩阵 |
| \(\mathbf{b}\) | \((d_{\text{out}},)\) | 偏置向量 |
| \(\mathbf{z}\) | \((d_{\text{out}},)\) | 预激活输出 |

**数值示例**（\(d_{\text{in}}=2, d_{\text{out}}=1\)）：
\[
\mathbf{x}=\begin{bmatrix}1\\2\end{bmatrix},\ 
\mathbf{W}=\begin{bmatrix}0.5 & -1.0\end{bmatrix},\ b=0.3
\]
\[
z = 0.5\times 1 + (-1.0)\times 2 + 0.3 = -0.7
\]

**参数量**：\(d_{\text{in}} \times d_{\text{out}} + d_{\text{out}}\)。例如 CartPole 状态 4 维 → 隐层 64：\(4\times 64 + 64 = 320\) 个参数。

**PyTorch**：
```python
import torch.nn as nn
layer = nn.Linear(in_features=4, out_features=64)
out = layer(obs_tensor)  # obs_tensor: (batch, 4) → (batch, 64)
```

**要点**：
- 多层线性层**无激活时等价于单层**（线性变换的复合仍是线性）
- RL 常见：`Linear(state_dim, 128) → ReLU → Linear(128, n_actions)` 输出各动作 Q 值

#### 激活层

\[
\mathbf{h} = \sigma(\mathbf{z})
\]

**为什么需要非线性**：仅用线性层，无论堆多深都只能表示线性映射；非线性 + 多层 → **通用函数逼近器**。

**反向传播需要的导数**（\(\sigma'\)）：

| 激活 | \(\sigma(z)\) | \(\sigma'(z)\) |
|------|---------------|----------------|
| ReLU | \(\max(0,z)\) | \(1\) if \(z>0\), else \(0\) |
| Sigmoid | \(1/(1+e^{-z})\) | \(\sigma(z)(1-\sigma(z))\) |
| Tanh | \(\tanh(z)\) | \(1-\tanh^2(z)\) |

**放置位置**：
- 隐层：ReLU / GELU
- 输出层：回归无激活；分类 Softmax/Sigmoid；**Q 网络输出层无激活**（Q 可为任意实数）

#### 深度学习 vs 传统学习

| 维度 | 传统机器学习 | 深度学习 |
|------|--------------|----------|
| 特征 | 人工设计（SIFT、统计量） | **表示学习**，网络自动提取 |
| 模型 | 线性、SVM、浅层树 | CNN、RNN、Transformer |
| 数据 | 中小规模常够用 | 通常需**更多数据** |
| 计算 | CPU | **GPU** 加速矩阵运算 |
| 泛化 | 依赖特征质量 | 依赖数据量 + 正则化 |
| RL | 表格 Q 无参数 | DQN / PPO / SAC 用网络逼近 |

#### 激活函数

| 函数 | 公式 | 值域 | 导数 | 特点 |
|------|------|------|------|------|
| Sigmoid | \(\frac{1}{1+e^{-x}}\) | (0,1) | \(\sigma(1-\sigma)\) | 易饱和、梯度消失 |
| Tanh | \(\tanh(x)\) | (-1,1) | \(1-\tanh^2\) | 零中心 |
| ReLU | \(\max(0,x)\) | [0,∞) | 0 或 1 | **隐层首选** |
| Leaky ReLU | \(\max(\alpha x,x)\) | (-∞,∞) | \(\alpha\) 或 1 | 避免死神经元 |
| Softmax | \(e^{z_i}/\sum_j e^{z_j}\) | 概率 | 复杂 | **多分类输出** |

**注意**：Q 网络输出层不用 Softmax；策略网络 \(\pi(a|s)\) 才用 Softmax。

#### 回归任务（对于连续数据）

**目标**：预测 \(\hat{y} \in \mathbb{R}\) 或 \(\mathbb{R}^d\)。

| 场景 | 输出层 | 损失 |
|------|--------|------|
| 标量回归 | Linear，无激活 | MSE |
| 向量回归 | Linear，\(d\) 维 | MSE 平均 |

**数值示例**（单样本 MSE）：
\[
y=3.0,\ \hat{y}=2.2 \Rightarrow \mathcal{L}=\frac{1}{2}(2.2-3.0)^2 = 0.32
\]

**与 RL**：\(Q(s,a;\mathbf{w})\) 视为回归，TD target 为标签 \(y\)。

#### 分类任务（对于离散数据）

**目标**：\(x \mapsto\) 类别 \(k \in \{1,\ldots,K\}\)。

**Softmax + 决策**：
\[
P(y=k|x)=\text{Softmax}(z)_k,\quad \hat{y}=\arg\max_k P(y=k|x)
\]

**数值示例**（3 类，logits \(\mathbf{z}=[2,1,0]\)）：
\[
e^{\mathbf{z}}=[7.39, 2.72, 1.00],\ \sum=11.11
\]
\[
P = [0.665,\ 0.244,\ 0.090] \Rightarrow \text{预测类别 1}
\]

**与 RL**：\(\pi(a|s)=\text{Softmax}(f_\mathbf{w}(s))_a\)，动作选择 \(\arg\max\) 或采样。

#### 损失函数

###### 均方误差（MSE）

\[
\mathcal{L}_{\text{MSE}} = \frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2
\]

**梯度**（单样本）：\(\partial \mathcal{L}/\partial \hat{y} = \hat{y} - y\)

**RL**：DQN 的 \(\mathcal{L} = (r + \gamma \max_{a'} Q(s',a';\mathbf{w}^-) - Q(s,a;\mathbf{w}))^2\)

###### 交叉熵（Cross-Entropy）

单样本 one-hot 标签，真实类 \(c\)：
\[
\mathcal{L}_{\text{CE}} = -\log \hat{p}_c
\]

**数值示例**：真实类 2，\(\hat{p}=[0.1, 0.2, 0.7]\)：
\[
\mathcal{L}_{\text{CE}} = -\log 0.7 \approx 0.357
\]

**二分类 BCE**：\(\mathcal{L} = -y\log\hat{p} - (1-y)\log(1-\hat{p})\)

**PyTorch**：`nn.CrossEntropyLoss()`（输入 logits，内部 Softmax+CE）

###### Softmax

\[
\text{Softmax}(z_i) = \frac{e^{z_i - \max_j z_j}}{\sum_k e^{z_k - \max_j z_j}}
\]
减最大值保证数值稳定，不改变输出。

#### 神经网络训练

训练目标：\(\min_{\mathbf{w}} \mathcal{L}(\mathbf{w})\)。循环：**前向 → 损失 → 反向 → 优化器更新**。

#### 前向传播与反向传播

**单隐层标量网络**（MSE 损失）：
\[
z_1 = w_1 x + b_1,\ h = \text{ReLU}(z_1),\ \hat{y} = w_2 h + b_2,\ \mathcal{L}=\frac{1}{2}(\hat{y}-y)^2
\]

**给定**：\(x=2.0,\ y=1.0,\ w_1=0.5,\ b_1=-0.2,\ w_2=-1.0,\ b_2=0.3\)

**① 前向传播**：

| 步骤 | 公式 | 计算 | 结果 |
|------|------|------|------|
| 1 | \(z_1 = w_1 x + b_1\) | \(0.5\times 2 - 0.2\) | 0.8 |
| 2 | \(h = \max(0, z_1)\) | \(\max(0, 0.8)\) | 0.8 |
| 3 | \(\hat{y} = w_2 h + b_2\) | \(-1.0\times 0.8 + 0.3\) | -0.5 |
| 4 | \(\mathcal{L} = \frac{1}{2}(\hat{y}-y)^2\) | \(\frac{1}{2}(-1.5)^2\) | 1.125 |

**② 反向传播（链式法则）**：

\[
\frac{\partial \mathcal{L}}{\partial \hat{y}} = \hat{y}-y = -1.5
\]
\[
\frac{\partial \mathcal{L}}{\partial w_2} = -1.5\times 0.8 = -1.2,\quad
\frac{\partial \mathcal{L}}{\partial b_2} = -1.5
\]
\[
\frac{\partial h}{\partial z_1} = 1 \ (\text{ReLU, } z_1>0)
\]
\[
\frac{\partial \mathcal{L}}{\partial z_1} = (-1.5)\times(-1.0)\times 1 = 1.5
\]
\[
\frac{\partial \mathcal{L}}{\partial w_1} = 1.5\times 2.0 = 3.0,\quad
\frac{\partial \mathcal{L}}{\partial b_1} = 1.5
\]

**③ 多层通用公式**：

前向：\(\mathbf{h}^{(\ell)} = \sigma^{(\ell)}(\mathbf{W}^{(\ell)}\mathbf{h}^{(\ell-1)}+\mathbf{b}^{(\ell)})\)

反向：
\[
\boldsymbol{\delta}^{(\ell)} = \big((\mathbf{W}^{(\ell+1)})^\top \boldsymbol{\delta}^{(\ell+1)}\big) \odot \sigma'(\mathbf{z}^{(\ell)}),\quad
\frac{\partial \mathcal{L}}{\partial \mathbf{W}^{(\ell)}} = \boldsymbol{\delta}^{(\ell)} (\mathbf{h}^{(\ell-1)})^\top
\]

**PyTorch 训练循环**：
```python
for x, y in dataloader:
    optimizer.zero_grad()
    loss = criterion(model(x), y)
    loss.backward()      # 自动求所有 ∂L/∂w
    optimizer.step()
```

#### 优化器

记 \(\mathbf{g}_t = \nabla_{\mathbf{w}}\mathcal{L}(\mathbf{w}_t)\)。

###### 随机梯度下降（SGD）

**BGD**（全数据）：\(\mathbf{w}_{t+1} = \mathbf{w}_t - \eta \nabla \mathcal{L}_{\text{full}}\)

**SGD / Mini-batch**（小批量）：
\[
\mathbf{w}_{t+1} = \mathbf{w}_t - \eta \mathbf{g}_t
\]

**数值更新**（\(\eta=0.1\)，用上节梯度）：
\[
w_2: -1.0 - 0.1\times(-1.2) = -0.88,\quad
w_1: 0.5 - 0.1\times 3.0 = 0.2
\]
再前向：\(\hat{y}=0.406,\ \mathcal{L}=0.176 < 1.125\) ✓

###### 动量法（Momentum）

\[
\mathbf{v}_{t+1} = \beta \mathbf{v}_t + \mathbf{g}_t,\quad
\mathbf{w}_{t+1} = \mathbf{w}_t - \eta \mathbf{v}_{t+1}
\]
\(\beta=0.9\) 常见。连续两步 \(g=-1.2,-1.0\)：\(v_2=-2.08\)，更新步更大 → 减震荡、加速。

###### Adam

\[
\mathbf{m}_t = \beta_1 \mathbf{m}_{t-1} + (1-\beta_1)\mathbf{g}_t,\quad
\mathbf{v}_t = \beta_2 \mathbf{v}_{t-1} + (1-\beta_2)\mathbf{g}_t^2
\]
\[
\hat{\mathbf{m}}_t = \frac{\mathbf{m}_t}{1-\beta_1^t},\quad
\hat{\mathbf{v}}_t = \frac{\mathbf{v}_t}{1-\beta_2^t},\quad
\mathbf{w}_{t+1} = \mathbf{w}_t - \eta \frac{\hat{\mathbf{m}}_t}{\sqrt{\hat{\mathbf{v}}_t}+\epsilon}
\]

**标量示例**（\(g=-1.2, t=1, \eta=0.1\)）：\(m_1=-0.12, v_1=0.00144, \hat{m}_1=-1.2, \hat{v}_1=1.44\)，更新量 \(-0.1\)，\(w_2: -1.0\to -0.9\)

| 优化器 | 核心 | RL 场景 |
|--------|------|---------|
| SGD | \(\mathbf{w}-\eta\mathbf{g}\) | 微调 |
| Momentum | 累积速度 | 传统 CNN |
| Adam | 自适应学习率 | **DQN、PPO 常用** |

#### 模型评价

训练模型不仅要**拟合数据**，还要在**未见数据**上表现良好。模型评价研究：如何判断学得好不好、何时停止、如何防止过拟合。

#### 数据集划分

| 集合 | 用途 | 比例（参考） |
|------|------|--------------|
| **训练集 Train** | 更新参数 \(\mathbf{w}\) | 60%–80% |
| **验证集 Validation** | 调超参、早停、选模型 | 10%–20% |
| **测试集 Test** | 最终评估，**只用一次** | 10%–20% |

**原则**：测试集不参与任何训练或调参决策，否则评估会**乐观偏高**。

**RL 对应**：
- 训练：与环境交互收集经验、更新 Q 网络
- 验证/测试：固定随机种子、**贪心策略**跑 N 个 episode 看平均回报

#### 偏差-方差权衡（Bias-Variance Tradeoff）

模型误差可分解为：
\[
\mathbb{E}[(y - \hat{f})^2] = \underbrace{(\mathbb{E}[\hat{f}] - f)^2}_{\text{偏差 Bias}^2} + \underbrace{\mathbb{E}[(\hat{f}-\mathbb{E}[\hat{f}])^2]}_{\text{方差 Variance}} + \underbrace{\sigma^2}_{\text{不可约噪声}}
\]

| 概念 | 含义 | 模型表现 |
|------|------|----------|
| **高偏差** | 模型太简单，系统性预测偏差 | **欠拟合** |
| **高方差** | 模型对训练数据过于敏感 | **过拟合** |
| **理想** | 偏差与方差均低 | 泛化好 |

#### 欠拟合（Underfitting）

**定义**：模型**过于简单**，无法捕捉数据中的规律；在训练集和验证集上**损失都高**。

**典型表现**：
- 训练 loss 高，验证 loss 也高，二者接近
- 学习曲线：训练/验证误差均高且下降缓慢
- 例：用线性模型拟合 XOR；隐层只有 2 个神经元拟合复杂图像

**原因**：
- 模型容量不足（层数少、神经元少）
- 训练不充分（epoch 太少、学习率不当）
- 特征不足

**解决方法**：
- 增加模型容量（更多层/神经元）
- 训练更久、调整学习率
- 更好的特征或更深网络
- 减小正则化强度

**数值示例**：
| Epoch | Train MSE | Val MSE |
|-------|-----------|---------|
| 10 | 2.50 | 2.48 |
| 50 | 2.35 | 2.40 |
| 100 | 2.30 | 2.38 |

两者都高 → **欠拟合**，需增大模型或继续训练。

#### 过拟合（Overfitting）

**定义**：模型**过于复杂**，记住了训练数据的噪声和细节，在验证/测试集上表现变差。

**典型表现**：
- 训练 loss **持续下降**，验证 loss **先降后升**
- 训练准确率很高（如 99%），验证准确率明显低（如 75%）
- 学习曲线：训练与验证曲线**分叉**

**原因**：
- 模型容量过大（参数远多于样本）
- 训练数据太少
- 训练时间过长
- 无正则化

**数值示例**：
| Epoch | Train MSE | Val MSE |
|-------|-----------|---------|
| 10 | 1.20 | 1.15 |
| 50 | 0.30 | 0.45 |
| 100 | 0.05 | 0.82 |
| 200 | 0.01 | 1.20 |

Train 持续下降，Val 在 epoch 50 后上升 → **过拟合**，应在 ~50 epoch **早停**。

**解决方法**：
- **更多数据**（数据增强 augmentation）
- **正则化**（见下）
- **早停 Early Stopping**
- **简化模型**（减少参数）
- **Dropout**

#### 学习曲线（Learning Curve）

以**训练样本数**或 **epoch** 为横轴，**损失/准确率**为纵轴，分别绘制训练集与验证集曲线。

```
损失
 ↑
 |    欠拟合：两线都高
 |    ═══════════  Train
 |    ═══════════  Val
 |
 |    理想：两线都低且接近
 |    ───────────  Train
 |    ───────────  Val
 |
 |    过拟合：Train↓ Val 先↓后↑
 |    \           Val ↗
 |     \________ Train
 +──────────────────→ Epoch
```

**诊断流程**：
1. Train 高 + Val 高 → 欠拟合
2. Train 低 + Val 高 → 过拟合
3. Train ≈ Val 且都低 → 合适

#### 评价指标

###### 回归指标

| 指标 | 公式 | 含义 |
|------|------|------|
| **MSE** | \(\frac{1}{n}\sum(y_i-\hat{y}_i)^2\) | 均方误差，对大误差敏感 |
| **MAE** | \(\frac{1}{n}\sum|y_i-\hat{y}_i|\) | 平均绝对误差，更鲁棒 |
| **RMSE** | \(\sqrt{\text{MSE}}\) | 与 \(y\) 同量纲 |
| **R²** | \(1 - \frac{\sum(y_i-\hat{y}_i)^2}{\sum(y_i-\bar{y})^2}\) | 解释方差比例，1 为完美 |

**R² 数值示例**：\(y=[3,5,7],\ \bar{y}=5,\ \hat{y}=[2.8,5.1,6.9]\)
\[
\text{SS}_{\text{res}} = 0.04+0.01+0.01=0.06,\ 
\text{SS}_{\text{tot}} = 4+0+4=8
\]
\[
R^2 = 1 - 0.06/8 = 0.9925
\]

###### 分类指标

对二分类，定义：**Positive**（正类）、**Negative**（负类）。

| | 预测正 | 预测负 |
|---|--------|--------|
| **实际正** | TP | FN |
| **实际负** | FP | TN |

| 指标 | 公式 | 含义 |
|------|------|------|
| **Accuracy** | \((TP+TN)/(TP+TN+FP+FN)\) | 整体正确率 |
| **Precision** | \(TP/(TP+FP)\) | 预测为正中真正比例 |
| **Recall** | \(TP/(TP+FN)\) | 实际正中被找出比例 |
| **F1** | \(2PR/(P+R)\) | 精确率与召回率调和平均 |

**数值示例**：TP=80, FP=20, FN=10, TN=90
\[
\text{Acc}=\frac{170}{200}=0.85,\ 
P=\frac{80}{100}=0.80,\ 
R=\frac{80}{90}\approx 0.889,\ 
F1=\frac{2\times 0.8\times 0.889}{0.8+0.889}\approx 0.842
\]

**类别不平衡时**：Accuracy 可能误导（99% 负样本时全猜负也有 99% 准确率），应看 Precision / Recall / F1。

#### 正则化与防过拟合

###### L2 正则（Weight Decay）

在损失中加入权重惩罚：
\[
\mathcal{L}_{\text{total}} = \mathcal{L}_{\text{data}} + \frac{\lambda}{2}\|\mathbf{w}\|_2^2
\]
\(\lambda\) 越大，权重越小 → 模型更平滑、不易过拟合。PyTorch：`optim.Adam(..., weight_decay=1e-4)`

###### L1 正则

\[
\mathcal{L}_{\text{total}} = \mathcal{L}_{\text{data}} + \lambda\|\mathbf{w}\|_1
\]
倾向于产生**稀疏**权重（部分 \(w_i=0\)），可用于特征选择。

###### Dropout

训练时以概率 \(p\)（如 0.5）**随机置零**隐层神经元，迫使网络不依赖单个神经元：
\[
h_i' = \begin{cases} 0 & \text{以概率 } p \\ \frac{h_i}{1-p} & \text{否则} \end{cases}
\]
测试时关闭 Dropout，使用全部神经元。PyTorch：`nn.Dropout(0.5)`

###### 早停（Early Stopping）

监控**验证集 loss**，若连续 \(k\) 个 epoch 无改善则停止，并**回滚**到验证 loss 最低时的参数。

```
best_val = ∞, patience = 10, counter = 0
for epoch in range(max_epochs):
    train_one_epoch()
    val_loss = evaluate(val_set)
    if val_loss < best_val:
        best_val = val_loss
        save_checkpoint()
        counter = 0
    else:
        counter += 1
        if counter >= patience:
            break  # 早停
load_best_checkpoint()
```

###### 数据增强（Data Augmentation）

对图像：随机裁剪、翻转、旋转、颜色抖动 → 等价于**扩大训练集**，减轻过拟合。

#### 交叉验证（Cross-Validation）

数据较少时，单次划分可能不稳定。**K 折交叉验证**：

1. 将数据分为 K 份（如 K=5）
2. 每次用 1 份作验证、K-1 份作训练，轮换 K 次
3. 报告 K 次验证指标的**均值 ± 标准差**

\[
\text{Score} = \frac{1}{K}\sum_{k=1}^{K} \text{Metric}_k
\]

更可靠地估计泛化性能，但计算量为 K 倍。

#### RL 中的模型评价

| 监督学习 | 强化学习 |
|----------|----------|
| 验证集 loss | 固定种子评估 episode 平均回报 |
| 过拟合训练集 | Q 网络**过拟合 replay buffer** 中旧经验 |
| 早停 | 验证回报不再提升时停止训练 |
| 测试集 | **从未见过的环境配置/种子** 上评估 |
| 正则化 | Target Network、小学习率、经验回放多样性 |

**DQN 评估示例**：
```python
def evaluate(q_net, env, n_episodes=50, seed=0):
    returns = []
    for ep in range(n_episodes):
        s, _ = env.reset(seed=seed + ep)
        total_r = 0
        while True:
            a = int(q_net(s).argmax())
            s, r, term, trunc, _ = env.step(a)
            total_r += r
            if term or trunc: break
        returns.append(total_r)
    return np.mean(returns), np.std(returns)
```

**注意**：不要用训练时的 ε-greedy 探索评估，应使用**纯贪心**策略看真实性能。

#### 小结与衔接

| 概念 | 监督学习 | 强化学习（后续） |
|------|----------|------------------|
| 输入 | 特征 \(x\) | 状态 \(s\) |
| 输出 | \(\hat{y}\) 或概率 | \(Q(s,a)\)、\(\pi(a \mid s)\) |
| 训练 | 前向→反向→Adam | TD 误差反向 + 目标网络 |
| 评价 | Train/Val/Test、F1/R² | 贪心 episode 回报 |
| 过拟合 | Val loss 上升 | Q 过拟合 replay buffer |
| 正则 | L2、Dropout、早停 | Target Net、经验回放 |

**下一讲预告**：将 \(Q(s,a)\) 替换为 \(Q(s,a;\mathbf{w})\)，用经验回放 + 目标网络稳定训练 → **Deep Q-Network (DQN)**。

#rat2#
## 深度学习神经网络

不同任务需要不同的网络结构。**架构**决定如何组织层与连接方式，从而提取输入中的有效信息。本节为框架性概览，后续课程将逐类展开。

#### MLP（多层感知机）

**结构**：全连接层堆叠，隐层 + 非线性激活。

```
输入向量 x → [Linear → ReLU]×L → Linear → 输出
```

| 特点 | 说明 |
|------|------|
| 输入 | 固定长度向量（如 CartPole 4 维状态） |
| 优点 | 实现简单、通用函数逼近 |
| 局限 | 无法利用空间/时间局部结构 |
| RL 应用 | 低维状态 Q 网络、策略网络 |

#### CNN（卷积神经网络）

**结构**：卷积层 + 池化层 + 全连接头，利用**局部感受野**与**参数共享**。

| 特点 | 说明 |
|------|------|
| 输入 | 图像、网格（如 Atari 84×84 帧） |
| 核心操作 | 卷积 \(\mathbf{W} * \mathbf{x}\)、池化降采样 |
| 优点 | 平移不变性、参数量少于全连接 |
| RL 应用 | **DQN（Atari）**、视觉导航 |

#### 长短期记忆网络（RNN / LSTM / GRU）

**适用场景**：输入是**时间序列**——文本 token、传感器读数、RL 中的**观测轨迹** \(o_1,o_2,\ldots,o_t\)。当环境**部分可观测（POMDP）**时，单帧状态不足以决策，需要网络**记住历史**。

##### 普通 RNN（仅短期隐状态）

每步用当前输入 \(\mathbf{x}_t\) 与上一步隐状态 \(\mathbf{h}_{t-1}\) 更新：

\[
\mathbf{h}_t = \tanh(\mathbf{W}_{xh}\mathbf{x}_t + \mathbf{W}_{hh}\mathbf{h}_{t-1} + \mathbf{b}_h)
\]

| 符号 | 形状 | 含义 |
|------|------|------|
| \(\mathbf{x}_t\) | \((d_{\text{in}},)\) | 第 \(t\) 步输入 |
| \(\mathbf{h}_t\) | \((d_h,)\) | 第 \(t\) 步隐状态（**短期**） |
| \(\mathbf{W}_{xh}\) | \((d_h, d_{\text{in}})\) | 输入→隐状态 |
| \(\mathbf{W}_{hh}\) | \((d_h, d_h)\) | 隐状态→隐状态（**循环连接**） |

**局限**：反向传播时 \(\frac{\partial \mathcal{L}}{\partial \mathbf{h}_{t-k}}\) 需连乘 \(\mathbf{W}_{hh}\) 与 \(\tanh'\) → **梯度消失 / 爆炸**，难以保留**长期**依赖（如 100 步前的关键事件）。

##### LSTM：细胞状态 + 三门读写

LSTM 增加**细胞状态** \(\mathbf{c}_t\)（**长期记忆通道**），并用三个 sigmoid 门（输出 0–1）控制「忘什么、记什么、输出什么」。记 \([\mathbf{h}_{t-1}, \mathbf{x}_t]\) 为二者拼接向量。

**1. 遗忘门** — 决定从 \(\mathbf{c}_{t-1}\) 中**丢弃**多少旧信息：

\[
\mathbf{f}_t = \sigma(\mathbf{W}_f [\mathbf{h}_{t-1}, \mathbf{x}_t] + \mathbf{b}_f)
\]

**2. 输入门 + 候选记忆** — 决定**写入**多少新内容 \(\tilde{\mathbf{c}}_t\)：

\[
\mathbf{i}_t = \sigma(\mathbf{W}_i [\mathbf{h}_{t-1}, \mathbf{x}_t] + \mathbf{b}_i),\quad
\tilde{\mathbf{c}}_t = \tanh(\mathbf{W}_c [\mathbf{h}_{t-1}, \mathbf{x}_t] + \mathbf{b}_c)
\]

**3. 更新细胞状态**（逐元素乘 \(\odot\) 后相加）：

\[
\mathbf{c}_t = \mathbf{f}_t \odot \mathbf{c}_{t-1} + \mathbf{i}_t \odot \tilde{\mathbf{c}}_t
\]

**4. 输出门 + 隐状态** — 从 \(\mathbf{c}_t\) **读出**对外可见的短期表示：

\[
\mathbf{o}_t = \sigma(\mathbf{W}_o [\mathbf{h}_{t-1}, \mathbf{x}_t] + \mathbf{b}_o),\quad
\mathbf{h}_t = \mathbf{o}_t \odot \tanh(\mathbf{c}_t)
\]

| 组件 | 具体操作 | 作用 |
|------|----------|------|
| 遗忘门 \(\mathbf{f}_t\) | \(\mathbf{f}_t \odot \mathbf{c}_{t-1}\) | 0 → 全忘，1 → 全留 |
| 输入门 \(\mathbf{i}_t\) | \(\mathbf{i}_t \odot \tilde{\mathbf{c}}_t\) | 控制新信息写入量 |
| 细胞状态 \(\mathbf{c}_t\) | 加法融合旧/新记忆 | **长期**信息高速公路 |
| 输出门 \(\mathbf{o}_t\) | \(\mathbf{o}_t \odot \tanh(\mathbf{c}_t)\) | 决定当前步对外输出 |

**数值示例**（\(d_h=2\)，单步标量简化）：设 \(\mathbf{f}_t=[0.1,\,0.9]^\top\)、\(\mathbf{c}_{t-1}=[5,\,-2]^\top\)、\(\mathbf{i}_t=[0.8,\,0.3]^\top\)、\(\tilde{\mathbf{c}}_t=[1,\,4]^\top\)，则

\[
\mathbf{c}_t = [0.1\times 5 + 0.8\times 1,\; 0.9\times(-2) + 0.3\times 4] = [1.3,\,-0.6]^\top
\]

第一步几乎忘掉旧值 5，第二步则主要保留 \(-2\) 并少量写入 4。

##### GRU（简化门控）

将 LSTM 的遗忘门与输入门合并为**更新门** \(\mathbf{z}_t\)，另设**重置门** \(\mathbf{r}_t\) 控制 \(\mathbf{h}_{t-1}\) 是否参与候选计算：

\[
\mathbf{z}_t = \sigma(\mathbf{W}_z[\mathbf{h}_{t-1},\mathbf{x}_t]),\quad
\mathbf{r}_t = \sigma(\mathbf{W}_r[\mathbf{h}_{t-1},\mathbf{x}_t])
\]
\[
\tilde{\mathbf{h}}_t = \tanh(\mathbf{W}[\mathbf{r}_t \odot \mathbf{h}_{t-1}, \mathbf{x}_t]),\quad
\mathbf{h}_t = (1-\mathbf{z}_t)\odot \mathbf{h}_{t-1} + \mathbf{z}_t \odot \tilde{\mathbf{h}}_t
\]

参数量少于 LSTM，训练更快，许多序列任务效果接近。

##### PyTorch 调用（序列 → 向量）

```python
import torch.nn as nn

# 输入: (batch, seq_len, d_in)；输出 h_n 可用于 Q 头或策略头
lstm = nn.LSTM(input_size=4, hidden_size=64, num_layers=1, batch_first=True)
x = torch.randn(32, 10, 4)          # 32 条轨迹，每条 10 步，每步 4 维观测
out, (h_n, c_n) = lstm(x)           # out: (32,10,64); h_n,c_n: (1,32,64)
q_values = nn.Linear(64, 2)(h_n[-1]) # 用最后时刻隐状态做 Q(s,·)
```

| 变体 | 长期记忆机制 | 参数量 | 典型用途 |
|------|--------------|--------|----------|
| Vanilla RNN | 仅 \(\mathbf{h}_t\) | 少 | 短序列基线 |
| **LSTM** | \(\mathbf{c}_t\) + 三门 | 多 | 长序列、POMDP |
| **GRU** | 更新/重置门 | 中 | 速度与效果折中 |

**RL 应用**：**DRQN** 用 LSTM 处理帧堆叠序列；**元 RL** 用 RNN 编码历史轨迹以快速适应新任务；部分可观测环境中 \(\mathbf{h}_t\) 充当**信念状态**的近似。

#### Transformer

**结构**：自注意力（Self-Attention）替代循环，并行处理序列。

\[
\text{Attention}(Q,K,V) = \text{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
\]

| 特点 | 说明 |
|------|------|
| 输入 | 序列 / 多模态 token |
| 优点 | 长程依赖、可并行训练 |
| RL 应用 | Decision Transformer、离线 RL 大模型 |

#### 架构选型（RL 速查）

| 状态类型 | 推荐架构 | 示例 |
|----------|----------|------|
| 低维向量 | MLP | CartPole、MountainCar |
| 像素图像 | CNN | Atari DQN |
| 序列 / 部分可观测 | LSTM / GRU | DRQN、记忆任务 |
| 长序列决策 | Transformer | Decision Transformer |
