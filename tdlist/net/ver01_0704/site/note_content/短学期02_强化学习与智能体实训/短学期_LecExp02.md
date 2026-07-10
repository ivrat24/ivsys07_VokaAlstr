---
title: 短学期 LecExp02
date: 2026-07-09
tags: [强化学习, Q-learning, SARSA, CliffWalking, 短学期, 实验]
description: CliffWalking 上 Q-learning 与 SARSA 的核心代码、训练循环与结果对比速查
---

#rat1#
## CliffWalking：环境交互

`CliffWalking-v1` 为 **4×12 = 48 格**网格世界。状态 `Discrete(48)`，动作 `Discrete(4)`：`0=↑`、`1=→`、`2=↓`、`3=←`。

```
 0   1   2   3   4   5   6   7   8   9  10  11
12  13  14  15  16  17  18  19  20  21  22  23
24  25  26  27  28  29  30  31  32  33  34  35
36  37  38  39  40  41  42  43  44  45  46  47
S   └────────── 悬崖 (37~46) ──────────┘   G
```

| 要素 | 说明 |
|------|------|
| 起点 S | 状态 36（左下） |
| 终点 G | 状态 47（右下） |
| 每步奖励 | **-1**（鼓励尽快到达） |
| 掉崖 (37–46) | **-100**，送回起点 |
| 终止 | 到达 G → `terminated=True` |

### 创建与单步

```python
import gymnasium as gym

ENV_ID = "CliffWalking-v1"
SEED = 2026

env = gym.make(ENV_ID, render_mode=None)
obs, info = env.reset(seed=SEED)   # obs: 0~47
action = env.action_space.sample() # 0~3
obs, reward, terminated, truncated, info = env.step(action)
done = terminated or truncated
env.close()
```

| 返回值 | 含义 |
|--------|------|
| `obs` | 当前格子编号 \(s\) |
| `reward` | -1（普通步）或 -100（掉崖） |
| `terminated` | 到达终点 G |
| `truncated` | 达最大步数 |

#rat2#
## 核心算法

### ε-greedy 探索

\[
\varepsilon_t = \max(\varepsilon_{\text{end}},\ \varepsilon_{\text{start}} \cdot \text{decay}^t)
\]

以概率 \(\varepsilon\) 随机探索，否则贪心 \(\arg\max_a Q(s,a)\)。

```python
def epsilon_by_episode(episode, epsilon_start=1.0, epsilon_end=0.05, epsilon_decay=0.995):
    return max(epsilon_end, epsilon_start * (epsilon_decay ** episode))

def epsilon_greedy(q_table, state, epsilon, env, rng):
    if rng.random() < epsilon:
        return env.action_space.sample()
    return int(np.argmax(q_table[state]))
```

### Q-learning（off-policy）

TD target 用下一状态的**最优**动作价值：

\[
y_t = r_{t+1} + \gamma (1 - \mathbb{1}_{\text{terminal}}) \max_{a'} Q(s_{t+1}, a')
\]

\[
Q(s_t, a_t) \leftarrow Q(s_t, a_t) + \alpha \left[y_t - Q(s_t, a_t)\right]
\]

```python
def q_learning_update(q_table, state, action, reward, next_state, terminated, alpha, gamma):
    best_next_q = np.max(q_table[next_state])
    target = reward + gamma * best_next_q * (1 - int(terminated))
    td_error = target - q_table[state, action]
    q_table[state, action] += alpha * td_error
    return td_error
```

### SARSA（on-policy）

TD target 用**实际执行的**下一动作 \(a_{t+1}\)：

\[
y_t = r_{t+1} + \gamma (1 - \mathbb{1}_{\text{terminal}}) Q(s_{t+1}, a_{t+1})
\]

```python
def sarsa_update(q_table, state, action, reward, next_state, next_action, terminated, alpha, gamma):
    next_q = q_table[next_state, next_action]
    target = reward + gamma * next_q * (1 - int(terminated))
    td_error = target - q_table[state, action]
    q_table[state, action] += alpha * td_error
    return td_error
```

| 对比 | Q-learning | SARSA |
|------|------------|-------|
| TD target | \(\max_{a'} Q(s',a')\) | \(Q(s', a')\)，\(a'\) 为实际执行 |
| 策略类型 | **off-policy** | **on-policy** |
| 每步需知 | 只需 \(s'\) | 还需先选 \(a_{t+1}\) 再更新 |

## 训练循环

Q 表形状 `(48, 4)`，默认 `alpha=0.5, gamma=0.99, n_episodes=500`。

```python
def train_q_learning(n_episodes=500, max_steps=300, alpha=0.5, gamma=0.99, seed=SEED):
    env = gym.make(ENV_ID)
    rng = random.Random(seed)
    q_table = np.zeros((48, 4), dtype=np.float32)

    for episode in range(n_episodes):
        state, _ = env.reset(seed=seed + episode)
        state = int(state)
        epsilon = epsilon_by_episode(episode)

        for step in range(max_steps):
            action = epsilon_greedy(q_table, state, epsilon, env, rng)
            next_state, reward, terminated, truncated, _ = env.step(action)
            next_state = int(next_state)
            q_learning_update(q_table, state, action, reward, next_state, terminated, alpha, gamma)
            state = next_state
            if terminated or truncated:
                break
    env.close()
    return q_table
```

**SARSA 与 Q-learning 的关键区别**：SARSA 在 episode 开头先选 `action`，每步更新前先选 `next_action`，再 `(state, action) ← (next_state, next_action)`。

## 评估与可视化

### 贪心评估（不用 ε-greedy）

```python
def evaluate_greedy(q_table, n_episodes=50, max_steps=300, seed=0):
    env = gym.make(ENV_ID)
    returns = []
    for episode in range(n_episodes):
        state, _ = env.reset(seed=seed + episode)
        episode_return = 0.0
        for step in range(max_steps):
            action = int(np.argmax(q_table[int(state)]))
            state, reward, terminated, truncated, _ = env.step(action)
            episode_return += float(reward)
            if terminated or truncated:
                break
        returns.append(episode_return)
    env.close()
    return np.asarray(returns)
```

### 策略与价值热力图

`plot_policy_and_value(q_table)`：用 `max_a Q(s,a)` 着色，格内箭头 `↑→↓←` 表示贪心策略。

### 训练对比图

`plot_training_comparison(histories)` 同时绘制 return、length、epsilon、mean |TD error| 四条曲线（Q-learning vs SARSA）。

#rat1#
## 实验结果与要点

500 episode 训练 + 50 episode 贪心评估（`seed=2026`）：

| 算法 | mean_return | mean_length | 策略特点 |
|------|-------------|-------------|----------|
| **Q-learning** | **-13.00** | **13.0** | 贴悬崖边缘的最短路径 |
| **SARSA** | **-17.00** | **17.0** | 远离悬崖、更保守 |

**为何 CliffWalking 上差异明显？**

- 悬崖格 (37–46) 惩罚 **-100**
- Q-learning 按 \(\max_{a'} Q(s',a')\) 更新 → **乐观**地学到贴边最短路径
- SARSA 按实际 \(\varepsilon\)-greedy 选到的 \(a_{t+1}\) 更新 → 探索时“看到”掉崖风险 → **安全但更长**的路径

**训练过程观察：**

- 回报曲线：二者均从约 **-2500** 逐步收敛；Q-learning 后期更贴近最优短路径
- 回合长度：Q-learning 稳定在约 13 步；SARSA 更长、波动更大
- |TD error|：初期较大，随 Q 表收敛逐渐下降

#rat2#
## Q-learning vs SARSA 对照

| 操作 | Q-learning | SARSA |
|------|------------|-------|
| 初始化 Q 表 | `np.zeros((48, 4))` | 同左 |
| episode 开始 | 只需 `state` | 先 `epsilon_greedy` 得 `action` |
| 每步更新前 | 执行 `action` → 得 `next_state` | 执行 `action` → 选 `next_action` |
| TD target | `r + γ max Q(s',·)` | `r + γ Q(s', a')` |
| 状态转移 | `state = next_state` | `state, action = next_state, next_action` |
| 评估策略 | `argmax Q(s,·)` 纯贪心 | 同左 |
| CliffWalking 结果 | 更短、更冒险 | 更长、更安全 |

**操作注意：**

- `state`、`next_state` 需 `int()` 才能索引 Q 表
- 终止步 `(1 - terminated)` 乘子防止 bootstrap 越界
- 评估时**不要**用训练时的 ε-greedy，应纯贪心看真实性能
- 完整 notebook：`materials/exp2_q_learning_sarsa.ipynb`
