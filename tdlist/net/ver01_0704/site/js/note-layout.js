import { markdownToHtml } from "./markdown.js";

export function normalizeRatMarkers(md) {
  return md
    .replace(/[ \t]*#rat1#[ \t]*/gi, "\n#rat1#\n")
    .replace(/[ \t]*#rat2#[ \t]*/gi, "\n#rat2#\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Normalize Markdown spacing/structure before render. */
export function optimizeNoteMarkdown(md) {
  if (!md) return "";
  md = normalizeRatMarkers(md);
  const lines = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out = [];
  let prevBlank = true;
  let prevWasHeading = false;
  let prevWasBold = false;
  let inFence = false;
  let inMath = false;

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].replace(/[ \t]+$/, "");
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      if (!prevBlank && out.length > 0) {
        out.push("");
        prevBlank = true;
      }
      out.push(line);
      prevBlank = false;
      prevWasHeading = false;
      prevWasBold = false;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    if (inMath) {
      out.push(line);
      if (trimmed.endsWith("$$")) inMath = false;
      continue;
    }

    if (trimmed.startsWith("$$")) {
      if (trimmed !== "$$" && trimmed.endsWith("$$")) {
        out.push(line);
        prevBlank = false;
        prevWasHeading = false;
        prevWasBold = false;
        continue;
      }
      if (!prevBlank && out.length > 0) {
        out.push("");
        prevBlank = true;
      }
      inMath = true;
      out.push(line);
      prevBlank = false;
      prevWasHeading = false;
      prevWasBold = false;
      continue;
    }

    const isHeading = /^#{1,6}\s/.test(trimmed);
    const isHr = trimmed === "---" || trimmed === "***" || trimmed === "___";
    const isRat = /^#rat[12]#$/i.test(trimmed);
    const isList = /^([-*+]|\d+\.)\s/.test(trimmed);
    const isBlank = !trimmed;
    const isBoldLine = /^\*\*.+\*\*\s*$/.test(trimmed);

    if (isHeading && !prevBlank && out.length > 0) {
      out.push("");
      prevBlank = true;
    }
    if ((isList || isHr || isRat) && !prevBlank && out.length > 0) {
      out.push("");
      prevBlank = true;
    }
    if (isList && prevWasBold) {
      out.push("");
      prevBlank = true;
    }

    if (isBlank) {
      while (i + 1 < lines.length && !lines[i + 1].trim()) i += 1;
      if (!prevBlank) out.push("");
      prevBlank = true;
      prevWasHeading = false;
      prevWasBold = false;
      continue;
    }

    out.push(line);
    prevBlank = false;
    prevWasHeading = isHeading;
    prevWasBold = isBoldLine;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildTocHtml(headings) {
  if (!headings.length) return "";
  const items = headings
    .map((h) => `<li class="note-toc-item note-toc-item--h${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
    .join("");
  return `<p class="note-toc-title">目录</p><ol class="note-toc-list">${items}</ol>`;
}

export function annotateNoteBodyHtml(html) {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(`<div id="note-root">${html}</div>`, "text/html");
  const root = doc.getElementById("note-root");
  if (!root) return html;

  const slugCounts = new Map();
  const tocHeadings = [];

  root.querySelectorAll("h2, h3, h4, h5, h6").forEach((el) => {
    el.classList.add("note-heading");
    const level = Number(el.tagName.slice(1)) || 2;
    el.classList.add(`note-heading--h${level}`);
    const raw = el.textContent || "";
    const base = raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u4e00-\u9fff-]/g, "")
      .slice(0, 48) || "section";
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    if (!el.id) el.id = count ? `${base}-${count + 1}` : base;

    if (level >= 2 && level <= 4) {
      tocHeadings.push({ id: el.id, text: raw.trim(), level });
    }
  });

  root.querySelectorAll("p").forEach((el) => el.classList.add("note-paragraph"));
  root.querySelectorAll("ul, ol").forEach((el) => el.classList.add("note-list"));
  root.querySelectorAll("blockquote").forEach((el) => el.classList.add("note-quote"));
  root.querySelectorAll("pre").forEach((el) => {
    if (!el.classList.contains("note-math-block")) el.classList.add("note-code-block");
  });
  root.querySelectorAll(".note-math-block").forEach((el) => el.classList.add("note-math-figure"));

  root.dataset.tocHeadings = JSON.stringify(tocHeadings);
  return root.innerHTML;
}

export function wrapNotePageLayout(bodyHtml, options = {}) {
  if (!bodyHtml) return "";
  if (typeof DOMParser === "undefined") return bodyHtml;

  const doc = new DOMParser().parseFromString(`<div id="note-root">${bodyHtml}</div>`, "text/html");
  const root = doc.getElementById("note-root");
  if (!root) return bodyHtml;

  let tocHeadings = [];
  try {
    tocHeadings = JSON.parse(root.dataset.tocHeadings || "[]");
  } catch {
    tocHeadings = [];
  }
  delete root.dataset.tocHeadings;

  const minHeadings = options.minHeadings ?? 2;
  if (tocHeadings.length < minHeadings) {
    return root.innerHTML;
  }

  const tocHtml = buildTocHtml(tocHeadings);
  const wrapper = doc.createElement("div");
  wrapper.className = "note-layout-with-toc";
  wrapper.innerHTML = `<div class="note-layout-main">${root.innerHTML}</div><aside class="note-toc note-toc--side" aria-label="目录">${tocHtml}</aside>`;
  return wrapper.outerHTML;
}

export function renderOptimizedNoteHtml(md, options = {}) {
  const optimized = optimizeNoteMarkdown(md);
  const html = markdownToHtml(optimized);
  const annotated = annotateNoteBodyHtml(html);
  return wrapNotePageLayout(annotated, options);
}

export function extractNoteDescription(body, maxLen = 160) {
  const text = optimizeNoteMarkdown(body)
    .replace(/^#{1,6}\s+.+$/gm, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/#rat[12]#/gi, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}
