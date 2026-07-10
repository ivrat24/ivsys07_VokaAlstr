import { getSiteBasePath } from "./layout.js";
import { isPublishedSite } from "./runtime.js";
import {
  clearUserLive2DModel,
  getUserLive2DModelName,
  hasUserLive2DModel,
  initLive2DPet,
  isLive2DPetReady,
  loadUserLive2DModel,
  refreshLive2DPetLayout,
  setLive2DPetScale,
  setLive2DPetVisible,
  tryRestoreUserLive2DModel,
} from "./live2d-pet.js";

const VISIBLE_KEY = "voka-live2d-visible";
const SCALE_KEY = "voka-live2d-scale";
const PANEL_KEY = "voka-live2d-panel-open";

const DEFAULT_VISIBLE = true;
const DEFAULT_SCALE = 1;

let panelOpen = false;
let settingsReady = false;
let settingsBasePath = "";

const SETTINGS_MARKUP = `
  <button
    class="live2d-settings-toggle btn-icon"
    id="live2d-settings-toggle"
    type="button"
    aria-expanded="false"
    aria-controls="live2d-settings-panel"
    title="Live2D 宠物设置"
  >☘</button>
  <div class="live2d-settings-panel" id="live2d-settings-panel" hidden>
    <p class="live2d-settings-title">Live2D 宠物</p>
    <div class="live2d-settings-reader" id="live2d-reader-model-section" hidden>
      <p class="live2d-settings-hint muted" id="live2d-model-status">尚未添加模型，请选择本地 Live2D 模型文件夹。</p>
      <input type="file" id="live2d-model-input" hidden webkitdirectory multiple>
      <div class="live2d-settings-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="live2d-model-add-btn">添加模型</button>
        <button type="button" class="btn btn-ghost btn-sm" id="live2d-model-clear-btn" hidden>移除模型</button>
      </div>
    </div>
    <div class="live2d-settings-display" id="live2d-display-section">
      <label class="live2d-settings-row">
        <input type="checkbox" id="live2d-visible-toggle" checked>
        <span>显示宠物</span>
      </label>
      <label class="live2d-settings-row live2d-settings-row--scale" for="live2d-scale-slider">
        <span class="live2d-settings-label">大小</span>
        <input type="range" id="live2d-scale-slider" min="50" max="150" step="5" value="100">
        <output id="live2d-scale-value" for="live2d-scale-slider">100%</output>
      </label>
    </div>
  </div>
`;

function readVisible() {
  const saved = localStorage.getItem(VISIBLE_KEY);
  if (saved === null) return DEFAULT_VISIBLE;
  return saved === "true";
}

function readScale() {
  const saved = localStorage.getItem(SCALE_KEY);
  if (saved === null) return DEFAULT_SCALE;
  const parsed = Number.parseFloat(saved);
  if (!Number.isFinite(parsed)) return DEFAULT_SCALE;
  return Math.min(1.5, Math.max(0.5, parsed));
}

function persistVisible(visible) {
  localStorage.setItem(VISIBLE_KEY, visible ? "true" : "false");
}

function persistScale(scale) {
  localStorage.setItem(SCALE_KEY, String(scale));
}

function persistPanelOpen(open) {
  localStorage.setItem(PANEL_KEY, open ? "true" : "false");
}

function readPanelOpen() {
  return localStorage.getItem(PANEL_KEY) === "true";
}

function mountSettingsIntoNav() {
  const navActions = document.querySelector(".nav-actions");
  if (!navActions) return;

  let root = document.getElementById("live2d-settings");
  if (!root) {
    root = document.createElement("div");
    root.id = "live2d-settings";
    root.className = "live2d-settings";
    root.innerHTML = SETTINGS_MARKUP;
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (!navActions.contains(root)) {
    if (themeToggle) {
      navActions.insertBefore(root, themeToggle);
    } else {
      navActions.appendChild(root);
    }
  }
}

function getControls() {
  return {
    toggle: document.getElementById("live2d-settings-toggle"),
    panel: document.getElementById("live2d-settings-panel"),
    readerSection: document.getElementById("live2d-reader-model-section"),
    displaySection: document.getElementById("live2d-display-section"),
    modelStatus: document.getElementById("live2d-model-status"),
    modelInput: document.getElementById("live2d-model-input"),
    modelAddBtn: document.getElementById("live2d-model-add-btn"),
    modelClearBtn: document.getElementById("live2d-model-clear-btn"),
    visible: document.getElementById("live2d-visible-toggle"),
    scale: document.getElementById("live2d-scale-slider"),
    scaleValue: document.getElementById("live2d-scale-value"),
  };
}

function updateReaderModelUI() {
  const {
    readerSection,
    displaySection,
    modelStatus,
    modelAddBtn,
    modelClearBtn,
  } = getControls();

  const published = isPublishedSite();
  if (readerSection) {
    readerSection.hidden = !published;
  }

  if (!published) {
    displaySection?.removeAttribute("hidden");
    return;
  }

  const hasModel = hasUserLive2DModel();
  const modelName = getUserLive2DModelName();

  if (modelStatus) {
    modelStatus.textContent = hasModel && modelName
      ? `当前模型：${modelName}`
      : "尚未添加模型，请选择本地 Live2D 模型文件夹。";
  }

  if (modelAddBtn) {
    modelAddBtn.textContent = hasModel ? "更换模型" : "添加模型";
  }

  if (modelClearBtn) {
    modelClearBtn.hidden = !hasModel;
  }

  if (displaySection) {
    displaySection.hidden = !hasModel;
  }
}

function applyPanelState() {
  const { toggle, panel } = getControls();
  if (!toggle || !panel) return;

  panel.hidden = !panelOpen;
  toggle.classList.toggle("is-active", panelOpen);
  toggle.setAttribute("aria-expanded", panelOpen ? "true" : "false");
}

function syncControls(visible, scale) {
  const { visible: visibleInput, scale: scaleInput, scaleValue } = getControls();
  if (visibleInput) visibleInput.checked = visible;
  if (scaleInput) {
    scaleInput.value = String(Math.round(scale * 100));
  }
  if (scaleValue) {
    scaleValue.textContent = `${Math.round(scale * 100)}%`;
  }
}

async function applySettings(basePath, { visible, scale }) {
  syncControls(visible, scale);
  updateReaderModelUI();

  if (isPublishedSite() && !hasUserLive2DModel()) {
    setLive2DPetVisible(false);
    return;
  }

  setLive2DPetScale(scale);

  if (!visible) {
    setLive2DPetVisible(false);
    return;
  }

  await initLive2DPet(basePath, { visible: true, sizeScale: scale });
  setLive2DPetVisible(true);
  setLive2DPetScale(scale);
  if (isLive2DPetReady()) {
    refreshLive2DPetLayout();
  }
  updateReaderModelUI();
}

async function handleUserModelSelection(basePath, fileList) {
  const visible = readVisible();
  const scale = readScale();
  const { modelStatus } = getControls();

  if (modelStatus) {
    modelStatus.textContent = "正在加载模型…";
  }

  try {
    await loadUserLive2DModel(basePath, fileList, { visible, sizeScale: scale, persist: true });
    await applySettings(basePath, { visible, scale });
  } catch (error) {
    console.warn("[Live2D] 读者模型加载失败:", error);
    if (modelStatus) {
      modelStatus.textContent = error?.message || "模型加载失败，请确认文件夹内包含 .model3.json。";
    }
  }
}

function bindSettingsEvents(basePath) {
  if (settingsReady) return;
  settingsReady = true;
  settingsBasePath = basePath;

  document.addEventListener("click", (event) => {
    const root = document.getElementById("live2d-settings");
    if (!root) return;

    if (event.target.closest("#live2d-settings-toggle")) {
      panelOpen = !panelOpen;
      persistPanelOpen(panelOpen);
      applyPanelState();
      return;
    }

    if (event.target.closest("#live2d-model-add-btn")) {
      getControls().modelInput?.click();
      return;
    }

    if (event.target.closest("#live2d-model-clear-btn")) {
      void (async () => {
        await clearUserLive2DModel();
        setLive2DPetVisible(false);
        updateReaderModelUI();
      })();
      return;
    }

    if (!event.target.closest("#live2d-settings")) {
      if (panelOpen) {
        panelOpen = false;
        persistPanelOpen(false);
        applyPanelState();
      }
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target.id === "live2d-visible-toggle") {
      const visible = event.target.checked;
      persistVisible(visible);
      await applySettings(settingsBasePath, { visible, scale: readScale() });
      return;
    }

    if (event.target.id === "live2d-model-input" && event.target.files?.length) {
      await handleUserModelSelection(settingsBasePath, event.target.files);
      event.target.value = "";
    }
  });

  document.addEventListener("input", async (event) => {
    if (event.target.id !== "live2d-scale-slider") return;

    const scale = Math.min(1.5, Math.max(0.5, Number(event.target.value) / 100));
    const { scaleValue } = getControls();
    if (scaleValue) {
      scaleValue.textContent = `${Math.round(scale * 100)}%`;
    }

    persistScale(scale);
    if (readVisible()) {
      await applySettings(settingsBasePath, { visible: true, scale });
    }
  });
}

export function mountLive2DNav() {
  settingsBasePath = getSiteBasePath();
  mountSettingsIntoNav();
  bindSettingsEvents(settingsBasePath);
  panelOpen = readPanelOpen();
  applyPanelState();
  syncControls(readVisible(), readScale());
  updateReaderModelUI();
}

export async function loadLive2DPet(basePath = getSiteBasePath()) {
  settingsBasePath = basePath;
  mountLive2DNav();
  if (localStorage.getItem(SCALE_KEY) === null) {
    persistScale(DEFAULT_SCALE);
  }

  const visible = readVisible();
  const scale = readScale();

  if (isPublishedSite()) {
    const restored = await tryRestoreUserLive2DModel(basePath, { visible, sizeScale: scale });
    updateReaderModelUI();
    if (restored) {
      await applySettings(basePath, { visible, scale });
    } else {
      setLive2DPetVisible(false);
    }
    return;
  }

  if (visible) {
    await applySettings(basePath, { visible, scale });
  } else {
    setLive2DPetVisible(false);
  }
}

export async function initLive2DSettings(basePath = getSiteBasePath()) {
  await loadLive2DPet(basePath);
}

export async function refreshLive2DSettings() {
  mountLive2DNav();
  const visible = readVisible();
  const scale = readScale();
  updateReaderModelUI();

  if (isPublishedSite() && !hasUserLive2DModel()) {
    setLive2DPetVisible(false);
    return;
  }

  if (visible) {
    await applySettings(settingsBasePath, { visible, scale });
    if (isLive2DPetReady()) {
      refreshLive2DPetLayout();
    }
  } else {
    setLive2DPetVisible(false);
  }
}
