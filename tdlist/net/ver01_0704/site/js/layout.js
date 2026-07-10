import { fetchJson, isFileProtocol } from "./runtime.js";

const THEME_KEY = "voka-theme";

const MODULE_FILES = {
  home: "index.html",
  course: "pages/course.html",
  "course-detail": "pages/course-detail.html",
  "notebook-view": "pages/notebook-view.html",
  "agent-lab": "pages/agent-lab.html",
  "virtual-arrange": "pages/virtual-arrange.html",
  "mouse-diary": "pages/mouse-diary.html",
};

export async function loadSiteConfig(basePath = "") {
  try {
    return await fetchJson(`${basePath}config/site.json`, "siteConfig");
  } catch {
    return null;
  }
}

export function resolveNavHref(file, inPagesFolder) {
  if (!inPagesFolder) return file;
  if (file === "index.html") return "../index.html";
  return file.replace(/^pages\//, "");
}

export function renderNav(config, { currentId, inPagesFolder = false } = {}) {
  const nav = document.getElementById("nav-links");
  if (!nav) return;

  const defaultNav = [
    { id: "home", label: "首页" },
    { id: "course", label: "课程" },
    { id: "agent-lab", label: "智能体试验" },
    { id: "virtual-arrange", label: "虚拟编曲" },
    { id: "mouse-diary", label: "鼠の事件簿" },
  ];

  const items = (config?.navigation ?? defaultNav).filter((item) => item.id !== "sync");

  nav.innerHTML = items
    .map((item) => {
      const file = MODULE_FILES[item.id];
      if (!file) return "";
      const href = resolveNavHref(file, inPagesFolder);
      const active = item.id === currentId ? ' class="is-active"' : "";
      return `<li><a href="${href}"${active}>${item.label}</a></li>`;
    })
    .join("");
}

export function applyBackground(config, basePath = "") {
  const imagePath = config?.background?.image ?? "static/image/image01.jpg";
  const position = config?.background?.position ?? "center";

  const bgImg = document.querySelector(".page-bg-image");
  if (bgImg) {
    bgImg.src = `${basePath}${imagePath}`;
    bgImg.style.objectPosition = position;
  }

  const version = config?.meta?.version;
  if (version) {
    document.querySelectorAll(".nav-version, .hero-badge").forEach((el) => {
      if (el.classList.contains("hero-badge")) {
        el.textContent = `v${version} · 持续建设中`;
      } else {
        el.textContent = `v${version}`;
      }
    });
  }
}

let themeToggleBound = false;

export function initTheme(config) {
  applyTheme(config);
  bindThemeToggle();
}

function applyTheme(config) {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const defaultTheme = config?.theme?.default ?? "dark";
  const theme = saved ?? (prefersDark ? "dark" : defaultTheme);
  document.documentElement.setAttribute("data-theme", theme);
}

function bindThemeToggle() {
  if (themeToggleBound) return;
  themeToggleBound = true;

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#theme-toggle")) return;
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  });
}

export function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getModuleFile(moduleId) {
  return MODULE_FILES[moduleId] ?? "index.html";
}

export function getNotePageDepth(fromUrl = window.location.href) {
  const path = decodeURIComponent(new URL(fromUrl, window.location.href).pathname.replace(/\\/g, "/"));
  const marker = "/pages/notes/";
  const idx = path.toLowerCase().indexOf(marker);
  if (idx === -1) return 0;
  const rest = path.slice(idx + marker.length);
  return rest.split("/").filter(Boolean).length;
}

export function notePathPrefixesFromSlug(slug) {
  const depth = String(slug || "").replace(/\\/g, "/").split("/").filter(Boolean).length;
  const safeDepth = Math.max(depth, 1);
  return {
    site: "../".repeat(safeDepth + 1),
    pages: "../".repeat(safeDepth),
  };
}

function readOfflineSiteBase() {
  if (typeof window !== "undefined") {
    if (window.__VOKA_SITE_BASE__) return window.__VOKA_SITE_BASE__;
    try {
      const stored = sessionStorage.getItem("voka-site-base");
      if (stored != null) return stored;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function getSiteBaseUrl(fromUrl = window.location.href) {
  const url = new URL(fromUrl, window.location.href);
  if (isFileProtocol()) {
    const offlineRoot =
      (typeof window !== "undefined" && window.__VOKA_SITE_ROOT__) ||
      (() => {
        try {
          return sessionStorage.getItem("voka-offline-root");
        } catch {
          return null;
        }
      })();
    if (offlineRoot) return offlineRoot;
  }
  const noteDepth = getNotePageDepth(fromUrl);
  if (noteDepth > 0) {
    return new URL("../".repeat(noteDepth + 1), url).href;
  }
  if (url.pathname.includes("/pages/")) {
    return new URL("../", url).href;
  }
  return new URL("./", url).href;
}

export function getSiteBasePath(fromUrl = window.location.href) {
  if (isFileProtocol()) {
    const offlineBase = readOfflineSiteBase();
    if (offlineBase != null) return offlineBase;
  }
  const noteDepth = getNotePageDepth(fromUrl);
  if (noteDepth > 0) return "../".repeat(noteDepth + 1);
  const path = new URL(fromUrl, window.location.href).pathname;
  if (path.includes("/pages/")) return "../";
  return "";
}

export function getPageIdFromUrl(url = window.location.href) {
  const path = new URL(url, window.location.href).pathname;
  if (path.includes("/pages/notes/")) return "course-note";
  if (path.includes("notebook-view.html")) return "notebook-view";
  if (path.includes("course-detail.html")) return "course-detail";
  if (path.includes("course.html")) return "course";
  if (path.includes("agent-lab.html")) return "agent-lab";
  if (path.includes("virtual-arrange.html")) return "virtual-arrange";
  if (path.includes("mouse-diary.html")) return "mouse-diary";
  return "home";
}

export function updateNavActive(pageId) {
  const activeId =
    pageId === "course-note" || pageId === "course-detail" || pageId === "notebook-view"
      ? "course"
      : pageId;
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const linkPageId = getPageIdFromUrl(link.href);
    const linkActiveId =
      linkPageId === "course-note" || linkPageId === "course-detail" || linkPageId === "notebook-view"
        ? "course"
        : linkPageId;
    link.classList.toggle("is-active", linkActiveId === activeId);
  });
}

let siteHeaderOffsetObserver = null;

export function syncSiteHeaderOffset() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  document.documentElement.style.setProperty("--site-header-height", `${header.offsetHeight}px`);
}

export function refreshSiteHeaderOffset() {
  const header = document.querySelector(".site-header");
  syncSiteHeaderOffset();
  if (!header) return;

  if (typeof ResizeObserver === "undefined") return;

  if (siteHeaderOffsetObserver) {
    siteHeaderOffsetObserver.disconnect();
  }

  siteHeaderOffsetObserver = new ResizeObserver(() => syncSiteHeaderOffset());
  siteHeaderOffsetObserver.observe(header);
}

export function initSiteHeaderOffset() {
  refreshSiteHeaderOffset();
  window.addEventListener("resize", syncSiteHeaderOffset);
}
