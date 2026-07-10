import { getSiteBaseUrl, getSiteBasePath } from "./layout.js";
import { fetchJson, isFileProtocol } from "./runtime.js";

const PLAYER_BRAND = "鼠的特制音乐播放器";
const PLAY_MODE_KEY = "voka-play-mode";
const PLAY_MODES = ["sequential", "shuffle", "single", "loop"];

const MODE_META = {
  sequential: { label: "顺序播放", icon: "→" },
  shuffle: { label: "随机播放", icon: "🔀" },
  single: { label: "单曲播放", icon: "1" },
  loop: { label: "循环播放", icon: "↻" },
};

const PLAYER_STATE = {
  playing: false,
  collapsed: true,
  currentIndex: 0,
  volume: 0.7,
  progress: 0,
  playlistConnected: false,
  playMode: localStorage.getItem(PLAY_MODE_KEY) || "sequential",
};

const FALLBACK_TRACKS = [
  { title: "暂无曲目", artist: "请将音频放入 static/music", src: "" },
];

const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a|aac|opus)$/i;

let tracks = [...FALLBACK_TRACKS];
let playlistDir = "";
let audioEl = null;
let hintEl = null;
let visualizerCanvas = null;
let visualizerCtx = null;
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let visualizerRaf = null;
let coverResizeObserver = null;
/** @type {null | Record<string, string>} */
let inlineMusicUrls = null;

function mimeForAudioFile(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map = {
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    opus: "audio/opus",
  };
  return map[ext] || "audio/mpeg";
}

function base64ToBlobUrl(base64, fileName) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeForAudioFile(fileName) }));
}

async function ensureInlineMusic() {
  if (!isFileProtocol()) return inlineMusicUrls ?? {};
  if (inlineMusicUrls) return inlineMusicUrls;

  inlineMusicUrls = {};
  try {
    const mod = await import("./music-inline.js");
    const files = mod.getMusicInlineFiles?.() ?? mod.MUSIC_INLINE?.files ?? {};
    for (const [fileName, data] of Object.entries(files)) {
      if (typeof data === "string" && data.length > 0) {
        inlineMusicUrls[fileName] = base64ToBlobUrl(data, fileName);
      }
    }
  } catch (error) {
    console.warn("[Music] 离线音频未找到，请运行 python sync/build-all.py", error);
  }
  return inlineMusicUrls;
}

function resolveTrackSrc(file) {
  if (isFileProtocol() && inlineMusicUrls?.[file]) {
    return inlineMusicUrls[file];
  }
  return `${getSiteBaseUrl()}static/music/${encodeURIComponent(file)}`;
}

export function refreshHeroNowPlaying() {
  updateHeroNowPlaying();
}

export async function initMusicPlayer() {
  if (document.getElementById("music-player")) {
    refreshHeroNowPlaying();
    return;
  }

  if (!PLAY_MODES.includes(PLAYER_STATE.playMode)) {
    PLAYER_STATE.playMode = "sequential";
  }

  const siteBase = getSiteBaseUrl();
  playlistDir = new URL("static/music/", siteBase).href;
  const coverImage = new URL("static/image/image02.jpg", siteBase).href;
  const initialMode = MODE_META[PLAYER_STATE.playMode];

  const root = document.createElement("div");
  root.id = "music-player";
  root.className = "music-player is-collapsed";
  root.innerHTML = `
    <button class="music-player-fab" type="button" aria-label="展开${PLAYER_BRAND}" title="${PLAYER_BRAND}">
      <span class="music-player-fab-icon" aria-hidden="true">♪</span>
    </button>
    <section class="music-player-panel" aria-label="${PLAYER_BRAND}">
      <header class="music-player-header">
        <div class="music-player-brand">
          <span class="music-player-brand-icon" aria-hidden="true">♫</span>
          <span class="music-player-brand-name">${PLAYER_BRAND}</span>
        </div>
        <button class="music-player-close btn-icon" type="button" aria-label="收起播放器">×</button>
      </header>
      <div class="music-player-cover" aria-hidden="true">
        <img class="music-player-cover-bg" src="${coverImage}" alt="">
        <div class="music-player-cover-shade"></div>
        <canvas class="music-player-visualizer" id="music-player-visualizer"></canvas>
      </div>
      <div class="music-player-meta">
        <p class="music-player-title" id="music-player-title">${FALLBACK_TRACKS[0].title}</p>
      </div>
      <div class="music-player-progress">
        <div class="music-player-progress-bar" id="music-player-progress-bar">
          <div class="music-player-progress-fill" id="music-player-progress-fill"></div>
        </div>
        <div class="music-player-time">
          <span id="music-player-current">0:00</span>
          <span id="music-player-duration">0:00</span>
        </div>
      </div>
      <div class="music-player-controls">
        <button class="music-player-btn music-player-btn--mode" type="button" id="music-player-mode" aria-label="${initialMode.label}" title="${initialMode.label}">${initialMode.icon}</button>
        <button class="music-player-btn" type="button" id="music-player-prev" aria-label="上一首">⏮</button>
        <button class="music-player-btn music-player-btn--main" type="button" id="music-player-play" aria-label="播放">▶</button>
        <button class="music-player-btn" type="button" id="music-player-next" aria-label="下一首">⏭</button>
      </div>
      <div class="music-player-volume">
        <span aria-hidden="true">🔊</span>
        <input type="range" id="music-player-volume" min="0" max="100" value="70" aria-label="音量">
      </div>
      <p class="music-player-hint" id="music-player-hint">正在连接 static/music …</p>
    </section>
  `;

  document.body.appendChild(root);
  hintEl = root.querySelector("#music-player-hint");
  visualizerCanvas = root.querySelector("#music-player-visualizer");
  visualizerCtx = visualizerCanvas?.getContext("2d") ?? null;

  audioEl = new Audio();
  audioEl.preload = "metadata";
  if (!isFileProtocol()) {
    audioEl.crossOrigin = "anonymous";
  }
  audioEl.volume = PLAYER_STATE.volume;

  bindEvents(root);
  setupVisualizer();
  updateModeButton();
  await loadPlaylist();
  loadCurrentTrack(false);
  updateTrackUI();
  updatePlayButton();
  updateProgressUI();
  updateHeroNowPlaying();
}

async function loadPlaylist() {
  const basePath = getSiteBasePath();
  if (isFileProtocol()) {
    await ensureInlineMusic();
  }
  try {
    const data = await fetchJson(`${basePath}static/music/playlist.json`, "playlist");
    const entries = Array.isArray(data?.tracks) ? data.tracks : [];
    const loaded = entries
      .filter((track) => track?.file && AUDIO_EXT.test(track.file))
      .map((track) => {
        const src = resolveTrackSrc(track.file);
        const hasSrc = isFileProtocol()
          ? Boolean(inlineMusicUrls?.[track.file])
          : true;
        if (!hasSrc) return null;
        return {
          title: track.title || titleFromFilename(track.file),
          artist: track.artist || "",
          src,
          file: track.file,
        };
      })
      .filter(Boolean);

    if (loaded.length > 0) {
      tracks = loaded;
      PLAYER_STATE.playlistConnected = true;
      PLAYER_STATE.currentIndex = Math.min(PLAYER_STATE.currentIndex, tracks.length - 1);
      setHint(`已连接 static/music · ${loaded.length} 首 · ${MODE_META[PLAYER_STATE.playMode].label}`);
      return;
    }
  } catch {
    /* fall through */
  }

  tracks = [...FALLBACK_TRACKS];
  PLAYER_STATE.playlistConnected = false;
  PLAYER_STATE.currentIndex = 0;
  if (isFileProtocol()) {
    setHint("离线模式暂无内嵌音频，请将 mp3 放入 static/music 后运行 sync/build-all.py");
  } else {
    setHint("static/music 暂无音频，请放入文件后运行 sync/build-playlist.py");
  }
}

function titleFromFilename(file) {
  return file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || file;
}

function setHint(text) {
  if (hintEl) hintEl.textContent = text;
}

function getCurrentTrack() {
  return tracks[PLAYER_STATE.currentIndex] ?? tracks[0];
}

function loadCurrentTrack(autoPlay = false) {
  const track = getCurrentTrack();
  if (!audioEl || !track?.src) {
    if (audioEl) audioEl.removeAttribute("src");
    return;
  }

  const nextSrc = new URL(track.src, window.location.href).href;
  if (audioEl.src !== nextSrc) {
    const keepTime = PLAYER_STATE.playing || PLAYER_STATE.progress > 0;
    audioEl.src = track.src;
    audioEl.load();
    if (!keepTime) {
      PLAYER_STATE.progress = 0;
    }
  }

  if (autoPlay) {
    playAudio();
  }
}

function playAudio() {
  if (!audioEl?.src) return;
  resumeAudioContext();
  audioEl.play().then(() => {
    PLAYER_STATE.playing = true;
    updatePlayButton();
  }).catch(() => {
    PLAYER_STATE.playing = false;
    updatePlayButton();
  });
}

function bindEvents(root) {
  const fab = root.querySelector(".music-player-fab");
  const closeBtn = root.querySelector(".music-player-close");
  const playBtn = root.querySelector("#music-player-play");
  const prevBtn = root.querySelector("#music-player-prev");
  const nextBtn = root.querySelector("#music-player-next");
  const modeBtn = root.querySelector("#music-player-mode");
  const volumeInput = root.querySelector("#music-player-volume");
  const progressBar = root.querySelector("#music-player-progress-bar");

  fab?.addEventListener("click", () => setCollapsed(false));
  closeBtn?.addEventListener("click", () => setCollapsed(true));

  playBtn?.addEventListener("click", togglePlay);
  prevBtn?.addEventListener("click", () => changeTrack(-1));
  nextBtn?.addEventListener("click", () => changeTrack(1));
  modeBtn?.addEventListener("click", cyclePlayMode);

  volumeInput?.addEventListener("input", (e) => {
    PLAYER_STATE.volume = Number(e.target.value) / 100;
    if (audioEl) audioEl.volume = PLAYER_STATE.volume;
  });

  progressBar?.addEventListener("click", (e) => {
    if (!PLAYER_STATE.playlistConnected || !audioEl?.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audioEl.currentTime = ratio * audioEl.duration;
    PLAYER_STATE.progress = ratio;
    updateProgressUI(true);
  });

  audioEl?.addEventListener("timeupdate", () => {
    if (!audioEl.duration) return;
    PLAYER_STATE.progress = audioEl.currentTime / audioEl.duration;
    updateProgressUI(true);
  });

  audioEl?.addEventListener("loadedmetadata", () => {
    updateProgressUI(true);
    updateHeroNowPlaying();
  });

  audioEl?.addEventListener("ended", handleTrackEnded);

  audioEl?.addEventListener("error", () => {
    PLAYER_STATE.playing = false;
    updatePlayButton();
    if (isFileProtocol()) {
      setHint("当前曲目无法播放，请确认已运行 sync/build-all.py 且 static/music 中有对应音频");
    } else {
      setHint("当前曲目无法播放，请检查 static/music 中的文件格式");
    }
  });
}

function cyclePlayMode() {
  const currentIndex = PLAY_MODES.indexOf(PLAYER_STATE.playMode);
  PLAYER_STATE.playMode = PLAY_MODES[(currentIndex + 1) % PLAY_MODES.length];
  localStorage.setItem(PLAY_MODE_KEY, PLAYER_STATE.playMode);
  updateModeButton();
  if (PLAYER_STATE.playlistConnected) {
    setHint(`已连接 static/music · ${tracks.length} 首 · ${MODE_META[PLAYER_STATE.playMode].label}`);
  }
}

function updateModeButton() {
  const btn = document.getElementById("music-player-mode");
  const meta = MODE_META[PLAYER_STATE.playMode];
  if (!btn || !meta) return;
  btn.textContent = meta.icon;
  btn.title = meta.label;
  btn.setAttribute("aria-label", meta.label);
  btn.dataset.mode = PLAYER_STATE.playMode;
}

function handleTrackEnded() {
  if (!PLAYER_STATE.playlistConnected || tracks.length === 0) {
    PLAYER_STATE.playing = false;
    updatePlayButton();
    return;
  }

  switch (PLAYER_STATE.playMode) {
    case "single":
      PLAYER_STATE.playing = false;
      updatePlayButton();
      break;
    case "sequential":
      if (PLAYER_STATE.currentIndex < tracks.length - 1) {
        changeTrack(1, true);
      } else {
        PLAYER_STATE.playing = false;
        updatePlayButton();
      }
      break;
    case "shuffle":
      playRandomTrack(true);
      break;
    case "loop":
      if (tracks.length === 1) {
        audioEl.currentTime = 0;
        playAudio();
      } else if (PLAYER_STATE.currentIndex < tracks.length - 1) {
        changeTrack(1, true);
      } else {
        PLAYER_STATE.currentIndex = 0;
        loadCurrentTrack(true);
        updateTrackUI();
        updateProgressUI(true);
      }
      break;
    default:
      break;
  }
}

function playRandomTrack(autoPlay = false) {
  if (tracks.length <= 1) {
    if (autoPlay) {
      audioEl.currentTime = 0;
      playAudio();
    }
    return;
  }

  let nextIndex = PLAYER_STATE.currentIndex;
  while (nextIndex === PLAYER_STATE.currentIndex) {
    nextIndex = Math.floor(Math.random() * tracks.length);
  }
  PLAYER_STATE.currentIndex = nextIndex;
  loadCurrentTrack(autoPlay);
  if (!autoPlay) {
    PLAYER_STATE.progress = 0;
  }
  updateTrackUI();
  updatePlayButton();
  updateProgressUI(true);
}

function changeTrack(delta, autoPlay = false) {
  if (!PLAYER_STATE.playlistConnected || tracks.length === 0) return;

  if (PLAYER_STATE.playMode === "shuffle" && !autoPlay) {
    playRandomTrack(autoPlay);
    return;
  }

  let nextIndex = PLAYER_STATE.currentIndex + delta;

  if (PLAYER_STATE.playMode === "loop") {
    nextIndex = (nextIndex + tracks.length) % tracks.length;
  } else if (PLAYER_STATE.playMode === "sequential") {
    if (nextIndex >= tracks.length || nextIndex < 0) return;
  } else {
    nextIndex = (nextIndex + tracks.length) % tracks.length;
  }

  PLAYER_STATE.currentIndex = nextIndex;

  if (!autoPlay) {
    PLAYER_STATE.playing = false;
    audioEl.pause();
    PLAYER_STATE.progress = 0;
  }

  loadCurrentTrack(autoPlay);
  updateTrackUI();
  updatePlayButton();
  updateProgressUI(true);
}

function setCollapsed(collapsed) {
  const root = document.getElementById("music-player");
  if (!root) return;
  PLAYER_STATE.collapsed = collapsed;
  root.classList.toggle("is-collapsed", collapsed);
  root.classList.toggle("is-expanded", !collapsed);
  resizeVisualizerCanvas();
}

function togglePlay() {
  if (!PLAYER_STATE.playlistConnected || !getCurrentTrack()?.src) return;

  if (PLAYER_STATE.playing) {
    audioEl.pause();
    PLAYER_STATE.playing = false;
  } else {
    if (!audioEl.src) loadCurrentTrack(false);
    playAudio();
    return;
  }
  updatePlayButton();
}

function setupVisualizer() {
  if (!visualizerCanvas || !visualizerCtx || !audioEl) return;

  const cover = visualizerCanvas.closest(".music-player-cover");
  if (cover && "ResizeObserver" in window) {
    coverResizeObserver = new ResizeObserver(() => resizeVisualizerCanvas());
    coverResizeObserver.observe(cover);
  }

  resizeVisualizerCanvas();

  try {
    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  } catch {
    analyser = null;
  }

  startVisualizerLoop();
}

function resumeAudioContext() {
  if (audioCtx?.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function resizeVisualizerCanvas() {
  if (!visualizerCanvas) return;
  const cover = visualizerCanvas.closest(".music-player-cover");
  if (!cover) return;
  const width = cover.clientWidth;
  const height = cover.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  visualizerCanvas.width = Math.floor(width * dpr);
  visualizerCanvas.height = Math.floor(height * dpr);
  visualizerCanvas.style.width = `${width}px`;
  visualizerCanvas.style.height = `${height}px`;
  if (visualizerCtx) {
    visualizerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function startVisualizerLoop() {
  if (!visualizerCtx || !visualizerCanvas) return;

  const bufferLength = analyser?.frequencyBinCount ?? 32;
  const dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    visualizerRaf = requestAnimationFrame(draw);
    const width = visualizerCanvas.clientWidth;
    const height = visualizerCanvas.clientHeight;
    if (!width || !height) return;

    visualizerCtx.clearRect(0, 0, width, height);

    if (analyser && PLAYER_STATE.playing) {
      analyser.getByteFrequencyData(dataArray);
      drawBars(dataArray, width, height);
      drawWave(dataArray, width, height);
    } else {
      drawIdleVisualizer(width, height);
    }
  };

  draw();
}

function drawBars(dataArray, width, height) {
  const barCount = 16;
  const gap = 4;
  const groupWidth = width * 0.68;
  const offsetX = (width - groupWidth) / 2;
  const barWidth = (groupWidth - gap * (barCount - 1)) / barCount;
  const usable = dataArray.length;
  const startBin = Math.floor(usable * 0.12);
  const endBin = Math.floor(usable * 0.72);

  for (let i = 0; i < barCount; i += 1) {
    const binIndex = startBin + Math.floor(((i + 0.5) / barCount) * (endBin - startBin));
    const sample = dataArray[Math.min(endBin, Math.max(startBin, binIndex))] / 255;
    const barHeight = Math.max(4, sample * height * 0.42);
    const x = offsetX + i * (barWidth + gap);
    const y = height - barHeight;

    const gradient = visualizerCtx.createLinearGradient(0, y, 0, height);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    gradient.addColorStop(1, "rgba(180, 195, 255, 0.06)");

    visualizerCtx.fillStyle = gradient;
    visualizerCtx.beginPath();
    if (typeof visualizerCtx.roundRect === "function") {
      visualizerCtx.roundRect(x, y, barWidth, barHeight, 2);
    } else {
      visualizerCtx.rect(x, y, barWidth, barHeight);
    }
    visualizerCtx.fill();
  }
}

function drawWave(dataArray, width, height) {
  const usable = dataArray.length;
  const startBin = Math.floor(usable * 0.1);
  const endBin = Math.floor(usable * 0.75);
  const sampleCount = 28;
  const waveWidth = width * 0.68;
  const offsetX = (width - waveWidth) / 2;

  visualizerCtx.beginPath();
  visualizerCtx.moveTo(offsetX, height * 0.64);

  for (let i = 0; i < sampleCount; i += 1) {
    const binIndex = startBin + Math.floor(((i + 0.5) / sampleCount) * (endBin - startBin));
    const value = dataArray[binIndex] / 255;
    const x = offsetX + (i / (sampleCount - 1)) * waveWidth;
    const y = height * 0.64 - value * height * 0.14;
    visualizerCtx.lineTo(x, y);
  }

  visualizerCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  visualizerCtx.lineWidth = 1;
  visualizerCtx.stroke();
}

function drawIdleVisualizer(width, height) {
  const time = performance.now() * 0.002;
  const barCount = 16;
  const gap = 4;
  const groupWidth = width * 0.68;
  const offsetX = (width - groupWidth) / 2;
  const barWidth = (groupWidth - gap * (barCount - 1)) / barCount;

  for (let i = 0; i < barCount; i += 1) {
    const wave = (Math.sin(time + i * 0.45) + 1) * 0.5;
    const barHeight = 4 + wave * height * 0.07;
    const x = offsetX + i * (barWidth + gap);
    const y = height - barHeight;

    visualizerCtx.fillStyle = "rgba(255, 255, 255, 0.06)";
    visualizerCtx.beginPath();
    if (typeof visualizerCtx.roundRect === "function") {
      visualizerCtx.roundRect(x, y, barWidth, barHeight, 3);
    } else {
      visualizerCtx.rect(x, y, barWidth, barHeight);
    }
    visualizerCtx.fill();
  }
}

function updateTrackUI() {
  const track = getCurrentTrack();
  const titleEl = document.getElementById("music-player-title");
  if (titleEl) titleEl.textContent = track.title;
  updateHeroNowPlaying();
}

function updatePlayButton() {
  const btn = document.getElementById("music-player-play");
  if (!btn) return;
  btn.textContent = PLAYER_STATE.playing ? "⏸" : "▶";
  btn.setAttribute("aria-label", PLAYER_STATE.playing ? "暂停" : "播放");
  updateHeroNowPlaying();
}

function formatTime(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function updateProgressUI(fromAudio = false) {
  const fill = document.getElementById("music-player-progress-fill");
  const current = document.getElementById("music-player-current");
  const duration = document.getElementById("music-player-duration");

  const hasDuration = fromAudio && audioEl?.duration && Number.isFinite(audioEl.duration);
  const total = hasDuration ? audioEl.duration : 0;
  const currentSec = hasDuration ? audioEl.currentTime : 0;

  if (fill) fill.style.width = `${(hasDuration ? PLAYER_STATE.progress : 0) * 100}%`;
  if (current) current.textContent = formatTime(currentSec);
  if (duration) duration.textContent = formatTime(total);
  updateHeroNowPlaying();
}

function updateHeroNowPlaying() {
  const statusEl = document.getElementById("hero-now-status");
  const trackEl = document.getElementById("hero-now-track");
  const timeEl = document.getElementById("hero-now-time");
  const fillEl = document.getElementById("hero-now-progress-fill");
  if (!statusEl && !trackEl && !timeEl && !fillEl) return;

  const track = getCurrentTrack();
  const hasDuration = audioEl?.duration && Number.isFinite(audioEl.duration);
  const total = hasDuration ? audioEl.duration : 0;
  const currentSec = hasDuration ? audioEl.currentTime : 0;

  if (statusEl) {
    let statusText = PLAYER_STATE.playlistConnected ? "待机 · 未播放" : "未连接歌单";
    if (PLAYER_STATE.playing) statusText = "播放中";
    else if (hasDuration && audioEl.currentTime > 0) statusText = "已暂停";
    statusEl.textContent = statusText;
    statusEl.classList.toggle("is-playing", PLAYER_STATE.playing);
  }

  if (trackEl) {
    if (!PLAYER_STATE.playlistConnected) {
      trackEl.textContent = "未连接歌单";
    } else if (track.artist) {
      trackEl.textContent = `${track.title} — ${track.artist}`;
    } else {
      trackEl.textContent = track.title;
    }
  }

  if (timeEl) {
    timeEl.textContent = `${formatTime(currentSec)} / ${formatTime(total)}`;
  }

  if (fillEl) {
    const progress = hasDuration ? PLAYER_STATE.progress : 0;
    fillEl.style.width = `${progress * 100}%`;
  }
}
