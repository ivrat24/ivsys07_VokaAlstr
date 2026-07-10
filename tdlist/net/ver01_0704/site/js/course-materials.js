import { escapeHtml } from "./layout.js";
import { canEditNotes, fetchJson, isFileProtocol } from "./runtime.js";
import {
  connectNotesDirectory,
  deleteCourseMaterial,
  detectNotesStorage,
  fetchDevManifestJson,
  getNotesStorageMode,
  listCourseMaterials,
  materialKindIcon,
  materialFormatLabel,
  materialUploadAccept,
  isAllowedMaterialFilename,
  MATERIAL_ALLOWED_EXTENSIONS,
  renameCourseMaterial,
  resolveMaterialOpenHref,
  resolveMaterialUrl,
  syncFsMaterialsManifest,
  uploadCourseMaterial,
} from "./notes-api.js";

const MATERIALS_COLLAPSE_KEY = "voka-course-materials-collapsed";

function setMaterialsExpanded(expanded) {
  const details = document.getElementById("course-materials-details");
  const toggle = document.getElementById("course-materials-toggle");
  if (!details) return;
  details.open = expanded;
  toggle?.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function bindMaterialsCollapse() {
  const details = document.getElementById("course-materials-details");
  const collapseBtn = document.getElementById("course-materials-collapse-btn");
  if (!details || details.dataset.bound === "1") return;
  details.dataset.bound = "1";

  setMaterialsExpanded(sessionStorage.getItem(MATERIALS_COLLAPSE_KEY) === "1");

  details.addEventListener("toggle", () => {
    setMaterialsExpanded(details.open);
    sessionStorage.setItem(MATERIALS_COLLAPSE_KEY, details.open ? "1" : "0");
  });

  collapseBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    details.open = false;
  });
}

function updateMaterialsSummary(count) {
  const summary = document.getElementById("course-materials-summary");
  if (summary) {
    summary.textContent = count ? `共 ${count} 个文件 · 点击展开` : "暂无文件 · 点击展开上传";
  }
}

async function loadMaterialsForCourse(courseSlug, basePath, manifest) {
  const live = await listCourseMaterials(courseSlug);
  if (live.length) return live;
  return filterMaterialsForCourse(manifest?.materials, courseSlug);
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function filterMaterialsForCourse(materials, courseSlug) {
  return (materials || []).filter((item) => item.course === courseSlug);
}

function renderMaterialsList(container, materials, basePath) {
  if (!materials.length) {
    container.innerHTML = `<p class="course-materials-empty muted">暂无资料文件。</p>`;
    return;
  }

  container.innerHTML = materials
    .map((item) => {
      const url = resolveMaterialUrl(item.path, basePath);
      const openHref = resolveMaterialOpenHref(item, item.course, basePath);
      const openInSameTab = /\.ipynb$/i.test(item.filename);
      const canEdit = canEditNotes();
      const icon = materialKindIcon(item.filename);
      const formatLabel = materialFormatLabel(item.filename);
      return `
        <article class="course-material-item" data-filename="${escapeHtml(item.filename)}">
          <div class="course-material-item__main">
            <span class="course-material-item__icon" aria-hidden="true">${icon}</span>
            <div>
              <a class="course-material-item__name" href="${escapeHtml(openHref)}"${openInSameTab ? "" : ' target="_blank" rel="noopener"'}>${escapeHtml(item.filename)}</a>
              <p class="course-material-item__meta muted">${formatFileSize(item.size)}${formatLabel ? ` · ${formatLabel}` : ""}</p>
            </div>
          </div>
          <div class="course-material-item__actions">
            <a class="btn btn-ghost btn-sm" href="${escapeHtml(openHref)}"${openInSameTab ? "" : ' target="_blank" rel="noopener"'}>打开</a>
            <a class="btn btn-ghost btn-sm" href="${escapeHtml(url)}" download="${escapeHtml(item.filename)}">下载</a>
            ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" data-material-rename="${escapeHtml(item.filename)}">重命名</button>` : ""}
            ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm diary-btn-danger" data-material-delete="${escapeHtml(item.filename)}">删除</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

async function reloadManifest(basePath) {
  const dev = await fetchDevManifestJson();
  if (dev) return dev;
  try {
    const local = await fetchJson(`${basePath}note_content/manifest.json`, isFileProtocol() ? "noteManifest" : null);
    if (local) return local;
  } catch {
    /* fall through */
  }
  return fetchJson(`${basePath}note_content/manifest.json`, "noteManifest");
}

async function refreshMaterials(courseSlug, basePath, manifest) {
  const list = document.getElementById("course-materials-list");
  const status = document.getElementById("course-materials-status");
  if (!list) return;

  try {
    const materials = await loadMaterialsForCourse(courseSlug, basePath, manifest);
    renderMaterialsList(list, materials, basePath);
    updateMaterialsSummary(materials.length);
    if (status) status.textContent = "";
  } catch (error) {
    list.innerHTML = `<p class="course-materials-empty muted">暂无资料文件。</p>`;
    updateMaterialsSummary(0);
    if (status) {
      status.textContent = error.message?.includes("连接") || error.message?.includes("note_content")
        ? error.message
        : "加载资料失败，请连接 note_content 或运行 python sync/server.py";
    }
  }
}

async function updateMaterialsStorageHint() {
  const hint = document.getElementById("course-materials-storage-hint");
  const connectBtn = document.getElementById("course-materials-connect-btn");
  if (!hint && !connectBtn) return;

  const mode = await detectNotesStorage();
  if (hint) {
    hint.textContent = isFileProtocol()
      ? mode === "filesystem"
        ? "已连接 note_content 文件夹，可直接上传资料。"
        : "双击打开站点：请先点击「连接 note_content」选择 site/note_content 文件夹。"
      : mode === "server"
        ? "已连接本地服务，上传后自动保存。"
        : mode === "filesystem"
          ? "已连接 note_content 文件夹，上传后写入本地。"
          : "上传前请运行 python sync/server.py，或连接 note_content 文件夹。";
  }
  if (connectBtn) {
    connectBtn.hidden = mode !== "embedded" || !window.showDirectoryPicker;
  }
}

function bindMaterialEvents(courseSlug, basePath) {
  const root = document.getElementById("course-materials-section");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  root.addEventListener("click", async (event) => {
    const renameBtn = event.target.closest("[data-material-rename]");
    const deleteBtn = event.target.closest("[data-material-delete]");
    const status = document.getElementById("course-materials-status");

    if (renameBtn) {
      const oldName = renameBtn.dataset.materialRename;
      const newName = window.prompt("重命名为：", oldName);
      if (!newName || newName === oldName) return;
      try {
        await renameCourseMaterial(courseSlug, oldName, newName);
        if (status) status.textContent = "已重命名。";
        const manifest = await reloadManifest(basePath);
        await refreshMaterials(courseSlug, basePath, manifest);
      } catch (error) {
        if (status) status.textContent = error.message || "重命名失败";
      }
      return;
    }

    if (deleteBtn) {
      const filename = deleteBtn.dataset.materialDelete;
      if (!window.confirm(`确定删除资料「${filename}」？`)) return;
      try {
        await deleteCourseMaterial(courseSlug, filename);
        if (status) status.textContent = "已删除。";
        const manifest = await reloadManifest(basePath);
        await refreshMaterials(courseSlug, basePath, manifest);
      } catch (error) {
        if (status) status.textContent = error.message || "删除失败";
      }
    }
  });

  document.getElementById("course-materials-upload-btn")?.addEventListener("click", () => {
    document.getElementById("course-materials-file-input")?.click();
  });

  document.getElementById("course-materials-connect-btn")?.addEventListener("click", async () => {
    const status = document.getElementById("course-materials-status");
    try {
      const name = await connectNotesDirectory();
      if (status) status.textContent = `已连接文件夹：${name}`;
      await updateMaterialsStorageHint();
    } catch (error) {
      if (status) status.textContent = error.message || "连接失败";
    }
  });

  document.getElementById("course-materials-file-input")?.addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    const status = document.getElementById("course-materials-status");
    if (!file) return;

    if (status) status.textContent = `正在上传「${file.name}」…`;

    try {
      const material = await uploadCourseMaterial(courseSlug, file);
      if (status) status.textContent = `已上传「${file.name}」。`;
      const manifest = await reloadManifest(basePath);
      await refreshMaterials(courseSlug, basePath, {
        ...(manifest || {}),
        materials: [
          ...(Array.isArray(manifest?.materials)
            ? manifest.materials.filter(
                (item) => !(item.course === material.course && item.filename === material.filename)
              )
            : []),
          material,
        ],
      });
      await updateMaterialsStorageHint();
    } catch (error) {
      if (status) status.textContent = error.message || "上传失败";
    } finally {
      input.value = "";
    }
  });
}

export async function initCourseMaterials(courseSlug, basePath = "", manifest = null) {
  const section = document.getElementById("course-materials-section");
  if (!section || !courseSlug) return;

  bindMaterialEvents(courseSlug, basePath);
  bindMaterialsCollapse();

  await detectNotesStorage();
  let resolvedManifest = manifest;
  if (getNotesStorageMode() === "filesystem") {
    resolvedManifest = (await syncFsMaterialsManifest()) || resolvedManifest;
  }

  await updateMaterialsStorageHint();
  await refreshMaterials(courseSlug, basePath, resolvedManifest);

  const uploadBtn = document.getElementById("course-materials-upload-btn");
  if (uploadBtn && !canEditNotes()) {
    uploadBtn.setAttribute("disabled", "disabled");
  }

  const fileInput = document.getElementById("course-materials-file-input");
  if (fileInput) {
    fileInput.accept = materialUploadAccept();
  }
}
