const STORAGE_KEY = "voka-timer-countdown-sec";
const MODE_KEY = "voka-timer-mode";
const STOPWATCH_MAX_MS = 100 * 3600 * 1000;
const DANMAKU_TEXT = "羌羌，时间到了~";

const state = {
  collapsed: true,
  mode: localStorage.getItem(MODE_KEY) === "countdown" ? "countdown" : "stopwatch",
  running: false,
  elapsedMs: 0,
  stopwatchStartedAt: 0,
  countdownTotalMs: readStoredCountdownMs(),
  countdownRemainingMs: readStoredCountdownMs(),
  countdownEndAt: 0,
};

let rootEl = null;
let displayEl = null;
let alertDialog = null;
let danmakuLayer = null;
let tickRaf = 0;

function readStoredCountdownMs() {
  const sec = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  return 25 * 60 * 1000;
}

function persistCountdownTotal() {
  localStorage.setItem(STORAGE_KEY, String(Math.max(1, Math.round(state.countdownTotalMs / 1000))));
}

function persistMode() {
  localStorage.setItem(MODE_KEY, state.mode);
}

function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatMs(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function formatStopwatchMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function splitMsToHms(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  return {
    h: Math.floor(totalSec / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  };
}

function hmsToMs(h, m, s) {
  const total = h * 3600 + m * 60 + s;
  return Math.max(1000, total * 1000);
}

function currentStopwatchMs() {
  if (state.running && state.mode === "stopwatch") {
    return state.elapsedMs + (Date.now() - state.stopwatchStartedAt);
  }
  return state.elapsedMs;
}

function currentCountdownMs() {
  if (state.running && state.mode === "countdown") {
    return Math.max(0, state.countdownEndAt - Date.now());
  }
  return state.countdownRemainingMs;
}

function updateDisplay() {
  if (!displayEl) return;
  const ms = state.mode === "stopwatch" ? currentStopwatchMs() : currentCountdownMs();
  displayEl.textContent = state.mode === "stopwatch" ? formatStopwatchMs(ms) : formatMs(ms);
  displayEl.classList.toggle("is-low", state.mode === "countdown" && ms > 0 && ms <= 10_000);
}

function resetStopwatchElapsed() {
  state.elapsedMs = 0;
  if (state.running && state.mode === "stopwatch") {
    state.stopwatchStartedAt = Date.now();
  }
}

function checkStopwatchLimit() {
  if (state.mode !== "stopwatch") return false;
  if (currentStopwatchMs() >= STOPWATCH_MAX_MS) {
    resetStopwatchElapsed();
    updateDisplay();
    return true;
  }
  return false;
}

function stopTickLoop() {
  if (tickRaf) {
    cancelAnimationFrame(tickRaf);
    tickRaf = 0;
  }
}

function startTickLoop() {
  stopTickLoop();
  const loop = () => {
    if (!state.running) return;
    if (state.mode === "countdown") {
      const remaining = state.countdownEndAt - Date.now();
      if (remaining <= 0) {
        updateDisplay();
        onCountdownComplete();
        return;
      }
    } else if (checkStopwatchLimit()) {
      tickRaf = requestAnimationFrame(loop);
      return;
    }
    updateDisplay();
    tickRaf = requestAnimationFrame(loop);
  };
  tickRaf = requestAnimationFrame(loop);
}

function setCollapsed(collapsed) {
  state.collapsed = collapsed;
  if (!rootEl) return;
  rootEl.classList.toggle("is-collapsed", collapsed);
  rootEl.classList.toggle("is-expanded", !collapsed);
}

function setMode(mode) {
  if (state.mode === mode) return;
  pauseTimer();
  state.mode = mode;
  persistMode();
  syncModeUI();
  updateDisplay();
}

function syncModeUI() {
  if (!rootEl) return;
  rootEl.querySelectorAll("[data-timer-mode]").forEach((btn) => {
    const active = btn.getAttribute("data-timer-mode") === state.mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const setPanel = rootEl.querySelector(".site-timer-set");
  if (setPanel) setPanel.hidden = state.mode !== "countdown";
  const modeLabel = rootEl.querySelector("#site-timer-mode-label");
  if (modeLabel) {
    modeLabel.textContent = state.mode === "stopwatch" ? "正计时" : "倒计时";
  }
  syncControlsUI();
}

function syncControlsUI() {
  if (!rootEl) return;
  const startBtn = rootEl.querySelector("#site-timer-start");
  const setInputs = rootEl.querySelectorAll(".site-timer-set input");
  if (startBtn) {
    startBtn.textContent = state.running ? "暂停" : "开始";
    startBtn.setAttribute("aria-label", state.running ? "暂停计时" : "开始计时");
  }
  const disableSet = state.running || state.mode !== "countdown";
  setInputs.forEach((input) => {
    input.disabled = disableSet;
  });
}

function readSetInputs() {
  const h = Number(rootEl?.querySelector("#site-timer-h")?.value) || 0;
  const m = Number(rootEl?.querySelector("#site-timer-m")?.value) || 0;
  const s = Number(rootEl?.querySelector("#site-timer-s")?.value) || 0;
  return hmsToMs(h, m, s);
}

function writeSetInputs(ms) {
  const { h, m, s } = splitMsToHms(ms);
  const hEl = rootEl?.querySelector("#site-timer-h");
  const mEl = rootEl?.querySelector("#site-timer-m");
  const sEl = rootEl?.querySelector("#site-timer-s");
  if (hEl) hEl.value = String(h);
  if (mEl) mEl.value = String(m);
  if (sEl) sEl.value = String(s);
}

function applyCountdownSetting() {
  if (state.running) return;
  state.countdownTotalMs = readSetInputs();
  state.countdownRemainingMs = state.countdownTotalMs;
  persistCountdownTotal();
  updateDisplay();
}

function startTimer() {
  if (state.mode === "countdown") {
    if (!state.running) {
      if (state.countdownRemainingMs <= 0) {
        state.countdownRemainingMs = state.countdownTotalMs;
      }
      state.countdownEndAt = Date.now() + state.countdownRemainingMs;
    }
  } else if (!state.running) {
    state.stopwatchStartedAt = Date.now();
  }

  state.running = true;
  syncControlsUI();
  startTickLoop();
}

function pauseTimer() {
  if (!state.running) return;

  if (state.mode === "stopwatch") {
    state.elapsedMs += Date.now() - state.stopwatchStartedAt;
    checkStopwatchLimit();
  } else {
    state.countdownRemainingMs = Math.max(0, state.countdownEndAt - Date.now());
  }

  state.running = false;
  stopTickLoop();
  syncControlsUI();
  updateDisplay();
}

function toggleTimer() {
  if (state.running) pauseTimer();
  else startTimer();
}

function resetTimer() {
  pauseTimer();
  if (state.mode === "stopwatch") {
    state.elapsedMs = 0;
  } else {
    applyCountdownSetting();
    state.countdownRemainingMs = state.countdownTotalMs;
  }
  updateDisplay();
}

function onCountdownComplete() {
  pauseTimer();
  state.countdownRemainingMs = state.countdownTotalMs;
  updateDisplay();
  syncControlsUI();
  showCountdownDanmaku(DANMAKU_TEXT);
  if (alertDialog && !alertDialog.open) {
    alertDialog.showModal();
  }
}

function ensureDanmakuLayer() {
  if (danmakuLayer) return danmakuLayer;
  danmakuLayer = document.createElement("div");
  danmakuLayer.className = "site-timer-danmaku-layer";
  danmakuLayer.setAttribute("aria-hidden", "true");
  document.body.appendChild(danmakuLayer);
  return danmakuLayer;
}

function spawnDanmaku(text) {
  const layer = ensureDanmakuLayer();
  const item = document.createElement("div");
  item.className = "site-timer-danmaku-item";
  item.textContent = text;
  item.style.top = `${8 + Math.random() * 72}vh`;
  item.style.animationDuration = `${5.5 + Math.random() * 3.5}s`;
  item.style.animationDelay = `${Math.random() * 0.4}s`;
  layer.appendChild(item);
  item.addEventListener("animationend", () => item.remove(), { once: true });
}

function showCountdownDanmaku(text) {
  const count = 10;
  for (let i = 0; i < count; i += 1) {
    window.setTimeout(() => spawnDanmaku(text), i * 280);
  }
}

function bindEvents() {
  rootEl.querySelector(".site-timer-fab")?.addEventListener("click", () => setCollapsed(false));
  rootEl.querySelector(".site-timer-close")?.addEventListener("click", () => setCollapsed(true));

  rootEl.querySelectorAll("[data-timer-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.getAttribute("data-timer-mode")));
  });

  rootEl.querySelector("#site-timer-start")?.addEventListener("click", toggleTimer);
  rootEl.querySelector("#site-timer-reset")?.addEventListener("click", resetTimer);

  rootEl.querySelectorAll(".site-timer-set input").forEach((input) => {
    input.addEventListener("change", applyCountdownSetting);
    input.addEventListener("blur", applyCountdownSetting);
  });

  alertDialog?.querySelector(".site-timer-alert-ok")?.addEventListener("click", () => {
    alertDialog.close();
  });

  alertDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    alertDialog.close();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.running) {
      if (state.mode === "stopwatch") {
        checkStopwatchLimit();
      } else if (state.countdownEndAt - Date.now() <= 0) {
        onCountdownComplete();
        return;
      }
      updateDisplay();
    }
  });
}

export function initTimerWidget() {
  if (document.getElementById("site-timer")) return;

  rootEl = document.createElement("div");
  rootEl.id = "site-timer";
  rootEl.className = "site-timer is-collapsed";
  rootEl.innerHTML = `
    <button class="site-timer-fab" type="button" aria-label="展开计时器" title="计时器">
      <span class="site-timer-fab-icon" aria-hidden="true">⏱</span>
    </button>
    <section class="site-timer-panel" aria-label="站点计时器">
      <header class="site-timer-header">
        <div class="site-timer-brand">
          <span class="site-timer-brand-icon" aria-hidden="true">⏱</span>
          <span class="site-timer-brand-name">计时器</span>
        </div>
        <button class="site-timer-close btn-icon" type="button" aria-label="收起计时器">×</button>
      </header>
      <div class="site-timer-mode" role="tablist" aria-label="计时模式">
        <button type="button" class="site-timer-mode-btn" data-timer-mode="stopwatch" role="tab">正计时</button>
        <button type="button" class="site-timer-mode-btn" data-timer-mode="countdown" role="tab">倒计时</button>
      </div>
      <div class="site-timer-display-wrap">
        <div class="site-timer-display" id="site-timer-display">00:00</div>
        <p class="site-timer-mode-label" id="site-timer-mode-label">正计时</p>
      </div>
      <div class="site-timer-set">
        <p class="site-timer-set-label">倒计时长度</p>
        <div class="site-timer-set-fields">
          <label class="site-timer-set-field">
            <input type="number" id="site-timer-h" min="0" max="99" inputmode="numeric" aria-label="小时">
            <span>时</span>
          </label>
          <label class="site-timer-set-field">
            <input type="number" id="site-timer-m" min="0" max="59" inputmode="numeric" aria-label="分钟">
            <span>分</span>
          </label>
          <label class="site-timer-set-field">
            <input type="number" id="site-timer-s" min="0" max="59" inputmode="numeric" aria-label="秒">
            <span>秒</span>
          </label>
        </div>
      </div>
      <div class="site-timer-controls">
        <button type="button" class="btn btn-primary btn-sm" id="site-timer-start">开始</button>
        <button type="button" class="btn btn-ghost btn-sm" id="site-timer-reset">重置</button>
      </div>
    </section>
  `;

  alertDialog = document.createElement("dialog");
  alertDialog.id = "site-timer-alert";
  alertDialog.className = "site-timer-alert";
  alertDialog.innerHTML = `
    <div class="site-timer-alert-card">
      <header class="site-timer-alert-head">
        <span class="site-timer-alert-icon" aria-hidden="true">⏰</span>
        <h2>倒计时结束</h2>
      </header>
      <p class="site-timer-alert-body">${DANMAKU_TEXT} 计时器已复位，可重新开始。</p>
      <footer class="site-timer-alert-foot">
        <button type="button" class="btn btn-primary site-timer-alert-ok">知道了</button>
      </footer>
    </div>
  `;

  document.body.appendChild(rootEl);
  document.body.appendChild(alertDialog);

  displayEl = rootEl.querySelector("#site-timer-display");
  writeSetInputs(state.countdownTotalMs);
  bindEvents();
  syncModeUI();
  updateDisplay();
}
