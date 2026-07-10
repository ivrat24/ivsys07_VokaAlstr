"""Patch exp2 notebook: fill TODOs, summary, and optionally execute."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "site/note_content/短学期02_强化学习与智能体实训/materials/exp2_q_learning_sarsa.ipynb"

ALGO_CELL = '''def epsilon_by_episode(episode, epsilon_start=1.0, epsilon_end=0.05, epsilon_decay=0.995):
    return max(epsilon_end, epsilon_start * (epsilon_decay ** episode))


def epsilon_greedy(q_table, state, epsilon, env, rng):
    if rng.random() < epsilon:
        return env.action_space.sample()
    return int(np.argmax(q_table[state]))


def q_learning_update(q_table, state, action, reward, next_state, terminated, alpha, gamma):
    best_next_q = np.max(q_table[next_state])
    target = reward + gamma * best_next_q * (1 - int(terminated))
    td_error = target - q_table[state, action]
    q_table[state, action] += alpha * td_error
    return td_error


def sarsa_update(q_table, state, action, reward, next_state, next_action, terminated, alpha, gamma):
    next_q = q_table[next_state, next_action]
    target = reward + gamma * next_q * (1 - int(terminated))
    td_error = target - q_table[state, action]
    q_table[state, action] += alpha * td_error
    return td_error
'''

SUMMARY_CELL = """## 实验小结

- **Q-learning 的 TD target**：\\(y_t = r_{t+1} + \\gamma (1 - \\mathbb{1}_{\\text{terminal}}) \\max_{a'} Q(s_{t+1}, a')\\)。用下一状态的**最优动作价值**做 bootstrap，属于 **off-policy** 更新。
- **SARSA 的 TD target**：\\(y_t = r_{t+1} + \\gamma (1 - \\mathbb{1}_{\\text{terminal}}) Q(s_{t+1}, a_{t+1})\\)。用**实际执行的下一动作** \\(a_{t+1}\\) 的 Q 值做 bootstrap，属于 **on-policy** 更新。
- **两者表现差异**：
  - **回报曲线**：二者都能从约 \\(-2500\\) 逐步收敛到接近 0；SARSA 前期略稳，Q-learning 后期更贴近最优短路径回报。
  - **回合长度**：Q-learning 收敛后稳定在约 **13–20 步**（贴悬崖边缘的最短路径）；SARSA 更长且训练期波动更大，因为策略更保守、会绕开悬崖。
  - **TD error**：填完更新公式后，|TD error| 在训练初期较大，随 Q 表收敛逐渐下降；未填空时恒为 0，说明 Q 表没有真正更新。
- **在 CliffWalking 中产生差异的原因**：悬崖格（37–46）惩罚 \\(-100\\)。Q-learning 按 \\(\\max_{a'} Q(s',a')\\) 更新，会**乐观地**学到“贴边最短路径”；SARSA 按实际 \\(\\varepsilon\\)-greedy 选到的 \\(a_{t+1}\\) 更新，探索时容易“看到”掉崖风险，因此学到**更远离悬崖的安全路径**。这正是 off-policy 最优策略 vs on-policy 实际策略的经典对比。
"""


def patch_notebook() -> None:
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    for cell in nb["cells"]:
        src = "".join(cell.get("source", []))
        if "def epsilon_greedy" in src and "TODO 1" in src:
            cell["source"] = [line + "\n" for line in ALGO_CELL.split("\n")]
            if cell["source"]:
                cell["source"][-1] = cell["source"][-1].rstrip("\n")
        if src.strip().startswith("## 实验小结"):
            cell["source"] = [line + "\n" for line in SUMMARY_CELL.split("\n")]
            if cell["source"]:
                cell["source"][-1] = cell["source"][-1].rstrip("\n")
    NOTEBOOK.write_text(json.dumps(nb, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Patched {NOTEBOOK}")


def execute_notebook() -> None:
    try:
        import nbformat
        from nbconvert.preprocessors import ExecutePreprocessor
    except ImportError as exc:
        raise SystemExit("Need nbformat/nbconvert in venv") from exc

    nb = nbformat.read(NOTEBOOK, as_version=4)
    ep = ExecutePreprocessor(timeout=600, kernel_name="python3")
    ep.preprocess(nb, {"metadata": {"path": str(NOTEBOOK.parent)}})
    nbformat.write(nb, NOTEBOOK)
    print(f"Executed {NOTEBOOK}")


if __name__ == "__main__":
    patch_notebook()
    if "--execute" in sys.argv:
        execute_notebook()
