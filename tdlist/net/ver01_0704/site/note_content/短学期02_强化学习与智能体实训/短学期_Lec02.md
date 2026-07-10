---
title: 短学期 Lec02
date: 2026-07-08
tags: [强化学习, 蒙特卡洛, 时序差分, 短学期]
description: 蒙特卡洛估计、表格型 TD、Q-Learning、资格迹 TD(λ) 与 MC/TD/DP 方法对比
---

#rat2#
## 回顾

Lec01 已建立 **MDP = (S, A, P, R, γ)** 与价值函数框架，本讲在此基础上学习**无模型（Model-Free）**的估计与控制方法。

#### MDP 与策略
- **策略** π(a|s)：在状态 s 下选择动作 a 的概率（或确定性映射 \(a=\pi(s)\)）
- **回报** \(G_t = R_{t+1} + \gamma R_{t+2} + \gamma^2 R_{t+3} + \cdots\)
- **状态价值** \(V^\pi(s) = \mathbb{E}_\pi[G_t \mid S_t=s]\)
- **动作价值** \(Q^\pi(s,a) = \mathbb{E}_\pi[G_t \mid S_t=s, A_t=a]\)

#### Bellman 期望方程（复习）
\[
V^\pi(s) = \sum_a \pi(a|s) \sum_{s',r} p(s',r|s,a)\big[r + \gamma V^\pi(s')\big]
\]
\[
Q^\pi(s,a) = \sum_{s',r} p(s',r|s,a)\big[r + \gamma \sum_{a'} \pi(a'|s') Q^\pi(s',a')\big]
\]

#### 动态规划的局限
**价值迭代 / 策略迭代**需要已知 \(p(s',r|s,a)\)。真实环境中转移模型往往未知，因此需要：
- **蒙特卡洛（MC）**：用完整回合的**实际回报**估计价值
- **时序差分（TD）**：用**一步或多步自举（bootstrap）**在线更新，无需等回合结束

#rat2#
## 蒙特卡洛方法（MC method）

**核心思想**：依赖**重复采样**（多次完整 episode）来估计期望——用经验平均逼近真实价值。

#### 适用条件
- **回合制（Episodic）**任务：有明确终止状态（如 CartPole 倒下、游戏结束）
- **模型无关**：不需要知道 \(P(s'|s,a)\)，只需与环境交互得到 \((s,a,r,s')\) 轨迹

#### 值函数与回报
- **累计奖励（回报）**：从某时刻 t 到回合结束的折扣和 \(G_t\)
- **值函数**：回报的期望 \(V^\pi(s) \approx \mathbb{E}[G_t \mid S_t=s]\)
- **MC 估计**：对同一状态 s 收集多次访问的 \(G_t\)，取平均

#### 首次访问 vs 每次访问
| 变体 | 做法 |
|------|------|
| **First-Visit MC** | 每个 episode 中，状态 s 只在**第一次**被访问时用 \(G_t\) 更新 |
| **Every-Visit MC** | 同一 episode 内 s 每出现一次，都用对应的 \(G_t\) 更新 |

两者在样本足够时均收敛到 \(V^\pi(s)\)；First-Visit 更常用、分析更简洁。

#### 增量式更新公式
不必存储全部回报再求均值，可在线更新：
\[
V(S_t) \leftarrow V(S_t) + \alpha \big(G_t - V(S_t)\big)
\]
- \(\alpha = 1/N(S_t)\)：**样本平均**，等权对待每次访问
- \(\alpha \in (0,1]\) 为常数：**指数加权平均**，更重视近期样本

等价地，第 k 次访问状态 s 时：
\[
V_k(s) = V_{k-1}(s) + \frac{1}{k}\big(G_k - V_{k-1}(s)\big)
\]

#### MC 策略评估（实现细节）

**输入**：固定策略 π、环境 env、学习率 schedule \(\alpha_t(s)\)、折扣 γ  
**输出**：各状态估计 \(V^\pi(s)\)

**伪代码**：
```
初始化 V(s) ← 0, 对所有 s
重复 many episodes:
    根据 π 生成轨迹 (S_0, A_0, R_1, S_1, …, S_T)
    对每个首次访问的状态 S_t（First-Visit）:
        计算 G_t = R_{t+1} + γR_{t+2} + … + γ^{T-t-1} R_T
        V(S_t) ← V(S_t) + α · (G_t - V(S_t))
```

**实现要点**：
1. **回报计算**：从 t 到终止 \(T\) 反向累加，终止态 \(V(S_T)=0\)
2. **First-Visit**：同一 episode 内同一 s 只更新一次（用 visited 集合记录）
3. **样本平均**：\(N(s)\) 计数，\(\alpha = 1/N(s)\)；非平稳环境用常数 α
4. **无模型**：只需 `env.step(a)` 返回 \((s', r, done)\)，不需知道 \(P\)

**Grid World 示例**：从起点按 π 走 1000 条路径，统计每个格子作为起点的平均回报 → 收敛到 \(V^\pi\)。

#### MC 控制（求最优策略，实现细节）

**Generalized Policy Iteration（GPI）**：评估 ↔ 改进 交替进行。

**伪代码（MC Control + ε-soft）**：
```
初始化 Q(s,a) ← 0, π 为 ε-soft 随机策略
重复 until π 稳定:
    // 评估：用 MC 估计 Q^π
    生成 episode（ε-soft 探索）
    对 episode 中每个 (S_t, A_t)（First-Visit）:
        计算 G_t
        Q(S_t, A_t) ← Q(S_t, A_t) + α(G_t - Q(S_t, A_t))
    // 改进：贪心 + 探索
    对每个 s: π(s) ← ε-greedy(Q(s,·))
```

**实现要点**：
1. 必须持续探索：ε-soft 或 Exploring Starts，否则某些 (s,a) 永不更新
2. 评估对象改为 **Q(s,a)** 而非 V(s)，便于直接贪心改进
3. 改进步：\(\pi(s)=\arg\max_a Q(s,a)\)（带 ε 随机扰动）
4. 收敛条件：策略不再变化，或 \(\max_{s,a}|Q_{k+1}-Q_k|<\epsilon\)

#### 非平稳（动态）环境处理
当环境或策略缓慢变化时，旧样本不再代表当前分布：
- **常数步长** \(\alpha\)：自动遗忘旧数据，跟踪最新价值
- **滑动窗口**：只保留最近 W 条 episode 的回报求平均
- **指数衰减权重**：近期样本权重更大

#### 总结
- 从**完整经验回合**中学习，更新发生在 episode **结束之后**
- **无 bootstrap**：\(G_t\) 是真实观测到的回报，偏差小、方差大
- **模型无关**，实现简单；但不适用于**连续型**（无终止）任务

#rat2#
## 时序差分方法

**核心思想**：每步交互后立即更新，用**当前估计**作为下一步的「目标」——**自举（bootstrap）**。

#### TD(0) 预测（实现细节）

对给定策略 π，单步更新公式：
\[
V(S_t) \leftarrow V(S_t) + \alpha \big[R_{t+1} + \gamma V(S_{t+1}) - V(S_t)\big], \quad
\delta_t = R_{t+1} + \gamma V(S_{t+1}) - V(S_t)
\]

**输入**：策略 π、初始 V、α、γ  
**每步更新**（在线，无需等 episode 结束）：

```
观测 (S_t, R_{t+1}, S_{t+1})
δ_t ← R_{t+1} + γ·V(S_{t+1}) - V(S_t)     // TD 误差
V(S_t) ← V(S_t) + α·δ_t
S_t ← S_{t+1}
```

**实现要点**：
1. 终止态处理：若 `done`，令 \(V(S_{t+1})=0\)（或不 bootstrap）
2. **Continuing 任务**：可一直运行；Episodic 任务 episode 结束后重置 env
3. α 可设为 \(1/N(s)\) 或常数；常数 α 适合非平稳
4. 与 MC 对比：MC 用真实 \(G_t\)，TD 用 \(R_{t+1}+\gamma V(S_{t+1})\) 估计

**批量 vs 在线**：TD(0) 天然在线；也可收集 batch 后更新，但通常逐步交互即时更新。

#### n 步回报
在 MC（完整 \(G_t\)）与 TD(0)（一步）之间插值：
\[
G_t^{(n)} = R_{t+1} + \gamma R_{t+2} + \cdots + \gamma^{n-1} R_{t+n} + \gamma^n V(S_{t+n})
\]
\(n=1\) 即 TD(0)，\(n\to\infty\) 即 MC。

#### 表格型时序差分方法

当状态空间 S、动作空间 A **有限且规模较小**时，可用**表格（Tabular）**直接存储价值函数——这是 TD 方法最经典、最易实现的形态。

| 存储对象 | 表格内容 | 典型更新 |
|----------|----------|----------|
| 状态价值 | \(V(s)\)，每个状态一格 | TD(0) 预测 |
| 动作价值 | \(Q(s,a)\)，每个 (s,a) 一格 | SARSA / Q-Learning |

**操作过程（表格型 TD 控制通用流程）**：

1. **初始化**：表格 \(Q(s,a) \leftarrow 0\)（或小随机数），设定学习率 α、折扣 γ
2. **每步交互**：
   - 在 \(S_t\) 按行为策略（如 ε-greedy）选择 \(A_t\)
   - 执行动作，观测 \(R_{t+1}, S_{t+1}\)
   - 计算 TD 误差 \(\delta_t\)（依具体算法，见 SARSA / Q-Learning）
   - **只更新当前格**：\(Q(S_t, A_t) \leftarrow Q(S_t, A_t) + \alpha \delta_t\)
3. **重复**直至策略收敛或达到训练步数

**与动态规划表格法的区别**：
- DP 遍历**所有** (s,a) 做 Bellman 备份，需要模型 \(p(s',r \mid s,a)\)
- 表格型 TD **只更新实际访问到的** (s,a)，模型无关，数据来自采样轨迹

**适用与局限**：
- 适用：Grid World、小型博弈、离散 CartPole 状态离散化等
- 局限：状态/action 数量爆炸时表格无法存储 → 需**函数逼近**（DQN 等）

#### SARSA（On-Policy 控制，实现细节）

**核心更新**：
\[
Q(S_t, A_t) \leftarrow Q(S_t, A_t) + \alpha \big[R_{t+1} + \gamma Q(S_{t+1}, A_{t+1}) - Q(S_t, A_t)\big]
\]
其中 \(A_{t+1}\) 由**当前 ε-greedy 策略**实际采样——TD 目标含「下一步真实会做的动作」。

**完整伪代码**：
```
初始化 Q(s,a) ← 0, 超参 α, γ, ε
对每个 episode:
    S ← env.reset()
    A ← ε-greedy(Q, S, ε)
    while not done:
        S', R, done ← env.step(A)
        if done:
            Q(S,A) ← Q(S,A) + α(R - Q(S,A))    // 无 bootstrap
        else:
            A' ← ε-greedy(Q, S', ε)
            Q(S,A) ← Q(S,A) + α(R + γ·Q(S',A') - Q(S,A))
        S, A ← S', A'
```

**实现要点**：
1. **On-Policy**：行为 = 评估，\(A_{t+1}\) 必须来自同一 ε-greedy
2. **悬崖行走**：SARSA 学会绕远路（保守），因 TD 目标含「可能失足探索」
3. 表格存储：`Q[state][action]` 字典或二维数组
4. ε 可衰减：训练初期 1.0 → 后期 0.05，平衡探索与利用

#### Q-Learning（Off-Policy 控制）

**Q-Learning** 是最常用的**表格型 Off-Policy TD 控制**算法，直接学习最优动作价值 \(Q^*\)，而不必显式维护当前策略。

**核心更新公式**：
\[
Q(S_t, A_t) \leftarrow Q(S_t, A_t) + \alpha \big[R_{t+1} + \gamma \max_a Q(S_{t+1}, a) - Q(S_t, A_t)\big]
\]

TD 目标中的 \(\max_a Q(S_{t+1}, a)\) 假定下一步会采取**最优动作**，与行为策略（探索用 ε-greedy）分离——因此是**异策略**学习。

**操作过程（表格型 Q-Learning，完整伪代码）**：

```
初始化 Q(s,a) ← 0, 超参 α, γ, ε
对每个 episode:
    S ← env.reset()
    while not done:
        A ← ε-greedy(Q, S, ε)              // 行为策略：探索
        S', R, done ← env.step(A)
        if done:
            target ← R
        else:
            target ← R + γ · max_a Q(S', a)  // 目标策略：贪心
        Q(S,A) ← Q(S,A) + α · (target - Q(S,A))
        S ← S'
导出策略: π(s) = argmax_a Q(s,a)
```

**实现要点**：
1. **行为策略**（产生数据）：ε-greedy，保证持续探索
2. **目标策略**（TD 目标）：贪心 \(\max_a Q(s',a)\)，直接朝 \(Q^*\) 学习
3. **终止态**：`done=True` 时 target = R，不再 bootstrap
4. **收敛**：有限 MDP + 每个 (s,a) 无限次访问 + α 适当衰减 → \(Q \to Q^*\)
5. **过估计**：max 使 Q 偏高 → Double DQN（Lec01）
6. **与 SARSA 差异**：Q-Learning 的 target **不含**实际执行的 \(A'\)，更激进

**Python 表格实现骨架**：
```python
Q = defaultdict(lambda: np.zeros(n_actions))
for ep in range(num_episodes):
    s, _ = env.reset()
    done = False
    while not done:
        a = eps_greedy(Q[s], eps)
        s2, r, term, trunc, _ = env.step(a)
        done = term or trunc
        best_next = 0.0 if done else Q[s2].max()
        Q[s][a] += alpha * (r + gamma * best_next - Q[s][a])
        s = s2
```

#### SARSA vs Q-Learning
| | SARSA | Q-Learning |
|---|--------|------------|
| 策略类型 | On-Policy | Off-Policy |
| TD 目标 | \(R + \gamma Q(s', a')\)，\(a'\) 为实际执行 | \(R + \gamma \max_{a'} Q(s', a')\) |
| 行为 | 更保守，考虑探索带来的风险 | 更激进，朝最优动作学习 |
| 典型场景 | 悬崖行走（cliff walk）等需安全探索 | 离线数据、经验回放（如 DQN 基础） |

#### 实现要点
1. 初始化 \(Q(s,a)\)（或 \(V(s)\)）为 0 或小随机数
2. 每步：选动作 → 环境 step → 计算 TD 目标 → 更新 Q/V
3. 探索：ε-greedy（以 ε 随机，以 \(1-\varepsilon\) 选 \(\arg\max Q\)）
4. 学习率 α 可随时间衰减；折扣 γ 反映长期偏好

#rat2#
## 资格迹方法（Eligibility Traces）

**核心思想**：用资格迹 \(e(s)\) 或 \(e(s,a)\) 记录「近期被访问的程度」，把当前步的 TD 误差**反向传播**给轨迹上的多个状态，在 MC（整条轨迹）与 TD(0)（仅当前态）之间通过 λ **平滑插值**。

#### 动机
- **TD(0)**：只更新 \(S_t\)，信用分配范围太窄
- **MC**：更新 episode 内所有访问状态，无偏但**方差大**
- **资格迹**：近期访问的状态获得更大更新权重，兼顾样本效率与稳定性

#### TD(λ)：MC 与 TD 的桥梁
\[
G_t^{(\lambda)} = (1-\lambda) \sum_{n=1}^{\infty} \lambda^{n-1} G_t^{(n)}
\]
- \(\lambda=0\) → **TD(0)**（一步 bootstrap）
- \(\lambda \to 1\) → 接近 **MC**（完整回报）
- \(0<\lambda<1\) → 多步回报的指数加权平均

#### 操作过程（反向视角 TD(λ)，实现细节）

以**状态价值评估**为例，**累积资格迹（Accumulating Trace）**：

**数据结构**：
- `V[s]`：状态价值表
- `E[s]`：资格迹表（与 V 同维度，初始全 0）

**每步循环**（在 \(S_t\) 执行 \(A_t\)，观测 \(R_{t+1}, S_{t+1}\)）：

```
// 1. 计算 TD 误差
if done:
    δ ← R_{t+1} - V(S_t)
else:
    δ ← R_{t+1} + γ·V(S_{t+1}) - V(S_t)

// 2. 衰减所有迹 + 标记当前状态
for s in all_states:
    E[s] ← γ·λ·E[s]
E[S_t] ← E[S_t] + 1

// 3. 用 δ 批量更新所有有迹的状态
for s in all_states:
    V[s] ← V[s] + α·δ·E[s]

// 4. episode 结束
if done:
    可选: 重置 E[s] ← 0（下一条 episode）
    终止态 V(S_T) ← 0
```

**实现要点**：
1. **反向视角**：一次 \(\delta_t\) 更新多个状态，比 n-step 前向视角更高效
2. **λ 含义**：\(\lambda=0\) 仅更新 \(S_t\)；\(\lambda \to 1\) 接近 MC 整条轨迹
3. **替换迹**：`E[S_t] ← 1` 替代累加，防止同状态迹过大
4. **表格型**：`|S|` 较小时可遍历全部 s；大状态空间用稀疏迹或函数逼近
5. **SARSA(λ) / Watkins Q(λ)**：将 V/E 换为 Q/E(s,a)，δ 公式见下节

#### 替换迹 vs 累积迹
| 变体 | 当前步更新规则 | 特点 |
|------|----------------|------|
| **累积迹** | \(e(S_t) \leftarrow e(S_t) + 1\) | 同状态多次访问时迹可累加，更新更强 |
| **替换迹** | \(e(S_t) \leftarrow 1\) | 同状态迹不超过 1，更稳定，实践中常用 |

#### 与 SARSA / Q-Learning 结合
动作价值版本将 \(V\) 换为 \(Q(s,a)\)，迹 \(e(s,a)\) 加在当前访问的 \((S_t, A_t)\) 上：

- **SARSA(λ)**（On-Policy）：
  \[
  \delta_t = R_{t+1} + \gamma Q(S_{t+1}, A_{t+1}) - Q(S_t, A_t)
  \]
  用实际采样的 \(A_{t+1}\) 做 bootstrap。

- **Watkins Q(λ)**（Off-Policy）：
  \[
  \delta_t = R_{t+1} + \gamma \max_a Q(S_{t+1}, a) - Q(S_t, A_t)
  \]
  若下一步动作**违背**贪心策略，则将该步之后的迹清零（避免异策略污染）。

#### 实现要点
- 超参 \(\lambda \in [0,1]\) 控制「看多远的回报」：λ 大更接近 MC，λ 小更接近 TD(0)
- 每步需遍历**全部状态**更新 \(e(s)\) 与 \(V(s)\)——表格型小状态空间可行；大空间需稀疏迹或函数逼近
- 与 n 步 TD 的**前向视角**等价，反向视角实现更高效（一次 \(\delta_t\) 更新多个状态）

#rat2#
## MC、TD 与动态规划对比

| 维度 | 动态规划（DP） | 蒙特卡洛（MC） | 时序差分（TD） |
|------|----------------|----------------|----------------|
| 环境模型 | **需要**转移模型 \(p(s',r \mid s,a)\) | 不需要 | 不需要 |
| 更新依据 | Bellman 方程全量备份 | 完整 episode 的真实回报 \(G_t\) | 一步/多步 TD 目标（含 bootstrap） |
| 更新时机 | 遍历所有状态 | **回合结束后** | **每步交互后** |
| Bootstrap | 是（用模型） | **否** | **是**（用当前估计） |
| 偏差-方差 | 无采样误差（模型准确时） | 无偏、**高方差** | 有偏（bootstrap）、**低方差** |
| 任务类型 | 表格型 MDP | 回合制 episodic | Episodic + Continuing |
| 典型算法 | 价值迭代、策略迭代 | MC 策略评估/控制 | TD(0)、表格型 SARSA/Q-Learning、TD(λ) |

#### 统一视角
- **DP**：「全知」地利用模型做 Bellman 备份
- **MC**：「眼见为实」，用采样轨迹的回报平均
- **TD**：「走一步看一步」，用 \(R_{t+1} + \gamma V(S_{t+1})\) 把 MC 的「等回合结束」变成「每步更新」

#### 本讲脉络
Lec01 建立 MDP 与 Bellman 框架 → **Lec02** 学习无模型估计（MC / TD / TD(λ) 资格迹）→ 后续 Deep RL（DQN 等）即用函数逼近 + TD 误差训练神经网络。