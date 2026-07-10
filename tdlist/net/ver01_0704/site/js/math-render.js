import katexModule from "./vendor/katex.mjs";

const katex = katexModule?.default ?? katexModule;

const KATEX_OPTS = { throwOnError: false, strict: "ignore" };

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMathBlockHtml(latex) {
  const trimmed = String(latex || "").trim();
  if (!trimmed) return "";
  if (!katex?.renderToString) {
    return `<div class="note-math-block note-math-fallback"><pre>${escapeHtml(trimmed)}</pre></div>`;
  }
  try {
    const html = katex.renderToString(trimmed, { ...KATEX_OPTS, displayMode: true });
    return `<div class="note-math-block">${html}</div>`;
  } catch {
    return `<div class="note-math-block note-math-fallback"><pre>${escapeHtml(trimmed)}</pre></div>`;
  }
}

export function renderMathInlineHtml(latex) {
  const trimmed = String(latex || "").trim();
  if (!trimmed) return "";
  if (!katex?.renderToString) {
    return `<span class="note-math-inline note-math-fallback">${escapeHtml(trimmed)}</span>`;
  }
  try {
    return katex.renderToString(trimmed, { ...KATEX_OPTS, displayMode: false });
  } catch {
    return `<span class="note-math-inline note-math-fallback">${escapeHtml(trimmed)}</span>`;
  }
}

export function mathBlockPlaceholder(latex) {
  const trimmed = String(latex || "").trim();
  if (!trimmed) return "";
  return `<div class="note-math-block" data-math-display="${escapeHtml(trimmed)}"></div>`;
}

export function mathInlinePlaceholder(latex) {
  const trimmed = String(latex || "").trim();
  if (!trimmed) return "";
  return `<span class="note-math-inline" data-math-inline="${escapeHtml(trimmed)}"></span>`;
}

export function typesetMathIn(root) {
  if (!root) return;

  root.querySelectorAll("[data-math-display]:not([data-math-rendered])").forEach((el) => {
    const latex = el.getAttribute("data-math-display") || "";
    if (!latex.trim()) return;
    try {
      el.innerHTML = katex.renderToString(latex, { ...KATEX_OPTS, displayMode: true });
      el.dataset.mathRendered = "1";
    } catch {
      el.textContent = latex;
      el.classList.add("note-math-fallback");
    }
  });

  root.querySelectorAll("[data-math-inline]:not([data-math-rendered])").forEach((el) => {
    const latex = el.getAttribute("data-math-inline") || "";
    if (!latex.trim()) return;
    try {
      el.innerHTML = katex.renderToString(latex, { ...KATEX_OPTS, displayMode: false });
      el.dataset.mathRendered = "1";
    } catch {
      el.textContent = latex;
      el.classList.add("note-math-fallback");
    }
  });
}
