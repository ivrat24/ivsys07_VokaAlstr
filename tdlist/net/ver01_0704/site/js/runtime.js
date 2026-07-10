let siteDataCache = null;

export function isFileProtocol() {
  return window.location.protocol === "file:";
}

export function isLocalDevHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || isFileProtocol();
}

/** 已发布到公网（GitHub Pages 等）— 访客只读 */
export function isPublishedSite() {
  return !isLocalDevHost();
}

/** 仅本地开发环境可编辑笔记（localhost / file://） */
export function canEditNotes() {
  return isLocalDevHost();
}

export function applySiteAccessMode() {
  document.documentElement.setAttribute("data-site-mode", canEditNotes() ? "local" : "published");
}

export function shouldUseEmbeddedData() {
  return isFileProtocol();
}

export async function getSiteDataBundle() {
  if (siteDataCache) return siteDataCache;
  try {
    const mod = await import("./site-data.js");
    siteDataCache = mod.SITE_DATA ?? {};
    return siteDataCache;
  } catch {
    siteDataCache = {};
    return siteDataCache;
  }
}

export async function loadEmbeddedJson(key) {
  const bundle = await getSiteDataBundle();
  const value = bundle[key];
  return value ?? null;
}

export async function fetchJson(url, embeddedKey) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return res.json();
  } catch {
    /* fall through to embedded */
  }

  if (embeddedKey) {
    const embedded = await loadEmbeddedJson(embeddedKey);
    if (embedded) return embedded;
  }

  throw new Error(`无法加载 ${url}`);
}
