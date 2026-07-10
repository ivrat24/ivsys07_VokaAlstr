---
title: 短学期 LecExp01
date: 2026-07-08
tags: [强化学习, Gymnasium, MuJoCo, 短学期, 实验]
description: Gymnasium 与 MuJoCo Warp 两个平台的 CartPole 核心操作代码速查
---

#rat1#
## Gymnasium：环境交互

CartPole 观测 4 维 `[x, x_dot, theta, theta_dot]`，动作 `Discrete(2)`：`0=左推`，`1=右推`。

### 创建与单步

```python
import gymnasium as gym

ENV_ID = "CartPole-v1"
env = gym.make(ENV_ID, render_mode=None)   # 或 "rgb_array" / "human"
obs, info = env.reset(seed=42)

action = env.action_space.sample()
obs, reward, terminated, truncated, info = env.step(action)
done = terminated or truncated

env.close()
```

| 返回值 | 含义 |
|--------|------|
| `obs` | 下一步状态 \(s_{t+1}\) |
| `reward` | 即时奖励（CartPole 每步 +1） |
| `terminated` | 自然终止（杆倒/出界） |
| `truncated` | 截断（达最大步数） |

### 回合循环

```python
def run_episode(policy_fn, seed=0, max_steps=500):
    env = gym.make(ENV_ID)
    obs, info = env.reset(seed=seed)
    total_reward = 0
    for _ in range(max_steps):
        action = int(policy_fn(obs, env))
        obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        if terminated or truncated:
            break
    env.close()
    return total_reward
```

### 策略与评估

```python
def random_policy(obs, env):
    return env.action_space.sample()

def student_policy(obs, env):
    x, x_dot, theta, theta_dot = obs
    return 1 if theta > 0 else 0   # 杆向右倾 → 向右推

returns = [run_episode(student_policy, seed=i) for i in range(30)]
```

#rat2#
## MuJoCo（CPU）：建模与仿真

### 加载模型

```python
import mujoco

CARTPOLE_XML = """
<mujoco model="cartpole">
  <option gravity="0 0 -9.81" timestep="0.01"/>
  <worldbody>
    <geom name="floor" type="plane" size="3 0.5 0.1"/>
    <body name="cart" pos="0 0 0.1">
      <joint name="slider" type="slide" axis="1 0 0" range="-2.4 2.4"/>
      <geom type="box" size="0.2 0.15 0.1" mass="1"/>
      <body name="pole" pos="0 0 0.1">
        <joint name="hinge" type="hinge" axis="0 1 0"/>
        <geom type="capsule" fromto="0 0 0 0 0 0.6" size="0.04" mass="0.1"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <motor name="push" joint="slider" ctrlrange="-10 10"/>
  </actuator>
</mujoco>
"""

mjm = mujoco.MjModel.from_xml_string(CARTPOLE_XML)   # 静态模型
mjd = mujoco.MjData(mjm)                             # 动态状态
# mjd.qpos → [小车位置, 杆角度]    mjd.qvel → [小车速度, 杆角速度]
# mjd.ctrl → 电机推力
```

### 重置、控制、推进一步

```python
mujoco.mj_resetData(mjm, mjd)   # ≈ env.reset()
mjd.qpos[1] = 0.15              # 设初始杆角
mjd.ctrl[0] = 0.0               # 控制输入
mujoco.mj_step(mjm, mjd)        # ≈ env.step 的物理部分
```

### 渲染帧

```python
renderer = mujoco.Renderer(mjm, height=240, width=320)
renderer.update_scene(mjd)
frame = renderer.render()         # RGB numpy 数组
renderer.close()
```

#rat1#
## MuJoCo Warp（GPU）：并行仿真

```python
import numpy as np
import warp as wp
import mujoco_warp as mjwarp

wp.init()
m = mjwarp.put_model(mjm)
d = mjwarp.put_data(mjm, mjd, nworld=1024)   # 1024 个并行环境
```

### 设初始状态与控制（Warp array 写法）

```python
qpos_np = d.qpos.numpy()
qpos_np[:, 1] = np.random.uniform(-0.2, 0.2, size=1024)   # 各环境随机杆角
d.qpos = wp.array(qpos_np, dtype=wp.float32)

ctrl_np = np.random.uniform(-5, 5, size=(1024, mjm.nu)).astype(np.float32)
d.ctrl = wp.array(ctrl_np, dtype=wp.float32)
```

### 推进与读回

```python
for _ in range(1000):
    mjwarp.step(m, d)
wp.synchronize()                         # 必须：等 GPU 算完

final_qpos = d.qpos.numpy()              # shape: (nworld, nq)
```

### 测吞吐量

```python
import time

for _ in range(5):                       # warmup，JIT 编译
    mjwarp.step(m, d)
wp.synchronize()

t0 = time.time()
for _ in range(1000):
    mjwarp.step(m, d)
wp.synchronize()
dt = time.time() - t0
print(f"{nworld * 1000 / dt:,.0f} steps/sec")
```

### 记录多轨迹

```python
traj = np.zeros((n_step, n_show), dtype=np.float32)
for t in range(n_step):
    mjwarp.step(m, d)
    traj[t] = d.qpos.numpy()[:, 1]        # 每步记录杆角度
wp.synchronize()
```

#rat2#
## 两套 API 对照

| 操作 | Gymnasium | MuJoCo CPU | MuJoCo Warp GPU |
|------|-----------|------------|-----------------|
| 创建 | `gym.make(id)` | `MjModel.from_xml_string(xml)` | `put_model` + `put_data(nworld=N)` |
| 重置 | `env.reset(seed=...)` | `mj_resetData(mjm, mjd)` | 改 `d.qpos` / `d.ctrl` |
| 推进一步 | `env.step(action)` | `mj_step(mjm, mjd)` | `mjwarp.step(m, d)` |
| 读状态 | `obs` (4,) | `mjd.qpos`, `mjd.qvel` | `d.qpos.numpy()` → `(nworld, nq)` |
| 施加控制 | `action` 0/1 | `mjd.ctrl[0] = force` | `d.ctrl = wp.array(...)` |
| 同步 | — | — | `wp.synchronize()` |

**操作注意：**

- Gymnasium `step` 返回 5 个值，结束条件写 `terminated or truncated`
- Warp array 不能直接 `d.qpos[i,j]=...`，需 `.numpy()` 改完再 `wp.array(...)` 赋回
- GPU 测速前后都要 `wp.synchronize()`
