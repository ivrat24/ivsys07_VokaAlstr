/** Lightweight Markdown → HTML (matches sync/build-notes.py subset). */

import { renderMathBlockHtml, renderMathInlineHtml } from "./math-render.js";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INLINE_PATTERN = /(\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInlineNonMath(text) {
  const parts = text.split(INLINE_PATTERN);
  return parts
    .map((part) => {
      if (!part) return "";
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
        return renderMathInlineHtml(part.slice(1, -1));
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        return `<a href="${escapeHtml(link[2])}">${escapeHtml(link[1])}</a>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

function renderInline(text) {
  const parts = text.split(/(\\\([\s\S]*?\\\))/g);
  return parts
    .map((part) => {
      if (!part) return "";
      if (part.startsWith("\\(") && part.endsWith("\\)")) {
        return renderMathInlineHtml(part.slice(2, -2));
      }
      return renderInlineNonMath(part);
    })
    .join("");
}

export function extractMathBlocks(md) {
  const blocks = [];
  const register = (inner) => {
    const index = blocks.length;
    blocks.push(inner.trim());
    return `\n@@MATH${index}@@\n`;
  };

  let text = md.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => register(inner));
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => register(inner));
  return { text, blocks };
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function isTableSeparator(line) {
  if (!isTableRow(line)) return false;
  return parseTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function parseTableRow(line) {
  const cells = [];
  let current = "";
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  let inParenMath = false;
  let inDollarMath = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const next = trimmed[i + 1] ?? "";
    const prev = trimmed[i - 1] ?? "";

    if (!inDollarMath && char === "\\" && next === "(") {
      inParenMath = true;
      current += char + next;
      i += 1;
      continue;
    }
    if (inParenMath && char === "\\" && next === ")") {
      inParenMath = false;
      current += char + next;
      i += 1;
      continue;
    }
    if (!inParenMath && char === "$" && prev !== "\\") {
      inDollarMath = !inDollarMath;
    }
    if (char === "|" && prev !== "\\" && !inParenMath && !inDollarMath) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function renderTableHtml(tableLines, sourceLine = null) {
  if (tableLines.length < 2) return "";
  const lineAttr = sourceLine != null ? ` data-source-line="${sourceLine}"` : "";
  const header = parseTableRow(tableLines[0]);
  const bodyRows = tableLines.slice(2).map(parseTableRow);
  const headHtml = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="note-table-wrap"${lineAttr}><table class="note-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function isRatLine(trimmed) {
  return /^#rat1#$/i.test(trimmed) || /^#rat2#$/i.test(trimmed);
}

function ratVariant(trimmed) {
  return /^#rat2#$/i.test(trimmed) ? "thick" : "thin";
}

export function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) {
    return { meta: {}, body: text };
  }
  const parts = text.split("---");
  if (parts.length < 3) {
    return { meta: {}, body: text };
  }
  const fmBlock = parts[1];
  const body = parts.slice(2).join("---").replace(/^\n/, "");
  const meta = {};
  for (const line of fmBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) continue;
    const idx = trimmed.indexOf(":");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      meta[key] = inner
        ? inner.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        : [];
    } else {
      meta[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
  return { meta, body };
}

export function buildFrontmatter(meta, body) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "");
  return `${lines.join("\n")}${body.replace(/^\n+/, "")}`;
}

export function markdownToHtml(md) {
  const { text, blocks } = extractMathBlocks(md);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let listType = null;
  /** @type {string[]} */
  let listStack = [];
  let inMathBlock = false;
  let mathBlockLines = [];
  let mathBlockStartLine = -1;
  let codeStartLine = -1;
  let moduleOpen = false;
  let olOpen = false;

  const nextNonBlankTrimmed = (fromIndex) => {
    for (let j = fromIndex + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (candidate) return candidate;
    }
    return "";
  };

  const openModule = () => {
    if (!moduleOpen) {
      out.push('<section class="note-module">');
      moduleOpen = true;
    }
  };

  const closeModule = () => {
    if (moduleOpen) {
      out.push("</section>");
      moduleOpen = false;
    }
  };

  const emitRatDivider = (variant) => {
    closeModule();
    out.push(`<div class="note-rat-divider note-rat--${variant}" role="separator" aria-hidden="true"></div>`);
  };

  const closeMathBlock = () => {
    if (!inMathBlock) return;
    openModule();
    const lineAttr = mathBlockStartLine >= 0 ? ` data-source-line="${mathBlockStartLine}"` : "";
    out.push(renderMathBlockHtml(mathBlockLines.join("\n")).replace(
      /^<div class="note-math-block"/,
      `<div class="note-math-block"${lineAttr}`,
    ));
    inMathBlock = false;
    mathBlockLines = [];
    mathBlockStartLine = -1;
  };

  const closeListsToDepth = (depth) => {
    while (listStack.length > depth + 1) {
      out.push("</ul>");
      listStack.pop();
    }
    listType = listStack.length ? "ul" : null;
  };

  const closeUlLists = () => {
    closeListsToDepth(-1);
    if (listType === "ul") listType = null;
  };

  const closeOlList = () => {
    if (olOpen) {
      out.push("</ol>");
      olOpen = false;
    }
    if (listType === "ol") listType = null;
  };

  const closeAllLists = () => {
    closeUlLists();
    closeOlList();
  };

  const listDepthFromIndent = (spaces) => Math.floor(spaces.length / 2);

  const closeCode = () => {
    if (!inCode) return;
    openModule();
    const isMath = codeLang === "math" || codeLang === "latex";
    const lineAttr = codeStartLine >= 0 ? ` data-source-line="${codeStartLine}"` : "";
    if (isMath) {
      out.push(renderMathBlockHtml(codeLines.join("\n")).replace(
        /^<div class="note-math-block"/,
        `<div class="note-math-block"${lineAttr}`,
      ));
    } else {
      const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : "";
      out.push(`<pre${lineAttr}><code${langClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }
    inCode = false;
    codeLines = [];
    codeLang = "";
    codeStartLine = -1;
  };

  const pushContent = (html) => {
    openModule();
    out.push(html);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const mathToken = trimmed.match(/^@@MATH(\d+)@@$/);
    if (mathToken) {
      closeAllLists();
      pushContent(renderMathBlockHtml(blocks[Number(mathToken[1])] || ""));
      continue;
    }

    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeAllLists();
      const tableLines = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        tableLines.push(lines[j]);
        j += 1;
      }
      pushContent(renderTableHtml(tableLines, i));
      i = j - 1;
      continue;
    }

    if (inMathBlock) {
      if (trimmed.endsWith("$$")) {
        const beforeClose = trimmed.slice(0, -2);
        if (beforeClose) mathBlockLines.push(beforeClose);
        closeAllLists();
        closeMathBlock();
      } else {
        mathBlockLines.push(line);
      }
      continue;
    }

    const singleMath = line.match(/^\s*\$\$(.+)\$\$\s*$/);
    if (singleMath) {
      closeAllLists();
      pushContent(renderMathBlockHtml(singleMath[1]).replace(
        /^<div class="note-math-block"/,
        `<div class="note-math-block" data-source-line="${i}"`,
      ));
      continue;
    }

    const openMath = line.match(/^\s*\$\$(.+)$/);
    if (openMath && !trimmed.endsWith("$$")) {
      closeAllLists();
      inMathBlock = true;
      mathBlockStartLine = i;
      mathBlockLines = [openMath[1]];
      continue;
    }

    if (trimmed === "$$") {
      closeAllLists();
      inMathBlock = true;
      mathBlockStartLine = i;
      mathBlockLines = [];
      continue;
    }

    if (trimmed.startsWith("```")) {
      if (inCode) closeCode();
      else {
        closeAllLists();
        inCode = true;
        codeStartLine = i;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!trimmed) {
      const next = nextNonBlankTrimmed(i);
      const continuesOl = olOpen && /^\d+\.\s/.test(next);
      const continuesUl = listType === "ul" && /^[-*+]\s/.test(next);
      if (!continuesOl && !continuesUl) closeAllLists();
      continue;
    }
    if (isRatLine(trimmed)) {
      closeAllLists();
      emitRatDivider(ratVariant(trimmed));
      continue;
    }
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      closeAllLists();
      pushContent(`<hr data-source-line="${i}">`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeAllLists();
      const level = heading[1].length;
      pushContent(`<h${level} data-source-line="${i}">${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeAllLists();
      pushContent(`<blockquote data-source-line="${i}"><p>${renderInline(quote[1])}</p></blockquote>`);
      continue;
    }
    const ul = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ul) {
      openModule();
      const depth = listDepthFromIndent(ul[1]);
      closeListsToDepth(depth);
      while (listStack.length <= depth) {
        out.push('<ul class="note-list">');
        listStack.push("ul");
      }
      listType = "ul";
      out.push(`<li data-source-line="${i}">${renderInline(ul[2])}</li>`);
      continue;
    }
    const ol = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (ol) {
      openModule();
      closeUlLists();
      if (!olOpen) {
        out.push('<ol class="note-list">');
        olOpen = true;
      }
      listType = "ol";
      out.push(`<li data-source-line="${i}">${renderInline(ol[2])}</li>`);
      continue;
    }
    closeAllLists();
    pushContent(`<p data-source-line="${i}">${renderInline(line)}</p>`);
  }
  closeAllLists();
  closeCode();
  closeMathBlock();
  closeModule();
  return out.join("\n");
}

export function slugFromPath(path) {
  return path.replace(/\.md$/i, "").replace(/\\/g, "/");
}

export function titleFromSlug(slug) {
  const name = slug.split("/").pop() || slug;
  return name.replace(/[_-]+/g, " ").trim() || slug;
}

export function defaultNoteContent(title, folder = "") {
  const today = new Date().toISOString().slice(0, 10);
  const body = `#rat2#\n\n## ${title}\n\n在此撰写课程笔记…\n`;
  return buildFrontmatter(
    {
      title,
      date: today,
      tags: folder ? [folder.split("/")[0]] : ["course"],
      description: "",
    },
    body,
  );
}
