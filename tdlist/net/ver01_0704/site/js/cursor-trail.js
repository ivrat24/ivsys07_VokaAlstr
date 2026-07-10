const TRAIL_KEY = "voka-cursor-trail";

const PLUM_COLORS = [
  { core: "#7a2848", edge: "#a8425c" },
  { core: "#923956", edge: "#b85870" },
  { core: "#c95678", edge: "#e07090" },
  { core: "#d96684", edge: "#f0a0b8" },
  { core: "#e87898", edge: "#ffd6e3" },
  { core: "#702840", edge: "#8b3a52" },
];

const WHITE_PETAL_COLORS = [
  { core: "#ffffff", edge: "#fff9fb", fade: "rgba(255, 255, 255, 0)" },
  { core: "#fffafd", edge: "#fff0f5", fade: "rgba(255, 245, 250, 0)" },
  { core: "#f8f6ff", edge: "#ffffff", fade: "rgba(248, 246, 255, 0)" },
  { core: "#fff5f8", edge: "#ffffff", fade: "rgba(255, 245, 248, 0)" },
];

const MAX_PARTICLES = 72;
const SPAWN_INTERVAL = 42;

let canvas = null;
let ctx = null;
let particles = [];
let enabled = true;
let mouseInside = false;
let lastSpawn = 0;
let lastX = 0;
let lastY = 0;
let rafId = null;

export function initCursorTrail() {
  if (document.querySelector(".cursor-trail-canvas")) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    enabled = false;
  } else {
    const saved = localStorage.getItem(TRAIL_KEY);
    enabled = saved !== "false";
  }

  createCanvas();
  bindToggle();
  bindPointer();
  applyEnabledState();

  if (enabled) {
    startLoop();
  }
}

export function refreshCursorTrailToggle() {
  applyEnabledState();
}

function createCanvas() {
  canvas = document.createElement("canvas");
  canvas.className = "cursor-trail-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });
}

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let toggleBound = false;

function bindToggle() {
  if (toggleBound) return;
  toggleBound = true;

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#cursor-trail-toggle")) return;
    enabled = !enabled;
    localStorage.setItem(TRAIL_KEY, enabled ? "true" : "false");
    applyEnabledState();
    if (enabled) {
      startLoop();
    } else {
      stopLoop();
      clearCanvas();
    }
  });
}

function applyEnabledState() {
  const toggle = document.getElementById("cursor-trail-toggle");
  if (!toggle) return;

  toggle.classList.toggle("is-active", enabled);
  toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  toggle.setAttribute("aria-label", enabled ? "关闭红叶李拖尾效果" : "开启红叶李拖尾效果");
  toggle.title = enabled ? "红叶李拖尾：开" : "红叶李拖尾：关";

  if (canvas) {
    canvas.classList.toggle("is-hidden", !enabled);
  }
}

function bindPointer() {
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!enabled || e.pointerType === "touch") return;
      mouseInside = true;
      spawnTrail(e.clientX, e.clientY);
    },
    { passive: true },
  );

  document.addEventListener(
    "pointerleave",
    () => {
      mouseInside = false;
    },
    { passive: true },
  );

  document.addEventListener(
    "pointerenter",
    () => {
      mouseInside = true;
    },
    { passive: true },
  );
}

function spawnTrail(x, y) {
  if (!mouseInside) return;

  const now = performance.now();
  const dist = Math.hypot(x - lastX, y - lastY);
  if (now - lastSpawn < SPAWN_INTERVAL && dist < 8) return;

  lastSpawn = now;
  lastX = x;
  lastY = y;

  const count = dist > 24 ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(createParticle(x, y));
  }
}

function createParticle(x, y) {
  const roll = Math.random();
  let palette;
  let isLeaf = false;
  let isWhitePetal = false;

  if (roll < 0.24) {
    isWhitePetal = true;
    palette = WHITE_PETAL_COLORS[Math.floor(Math.random() * WHITE_PETAL_COLORS.length)];
  } else {
    isLeaf = Math.random() < 0.35;
    palette = PLUM_COLORS[Math.floor(Math.random() * PLUM_COLORS.length)];
  }

  const size = isLeaf
    ? 3.5 + Math.random() * 4
    : isWhitePetal
      ? 4.5 + Math.random() * 5
      : 4 + Math.random() * 5.5;

  return {
    x: x + (Math.random() - 0.5) * 10,
    y: y + (Math.random() - 0.5) * 10,
    vx: (Math.random() - 0.5) * 0.55,
    vy: 0.25 + Math.random() * 0.75,
    size,
    aspect: isLeaf ? 0.38 + Math.random() * 0.12 : 0.5 + Math.random() * 0.18,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.06,
    life: 1,
    decay: 0.012 + Math.random() * 0.014,
    core: palette.core,
    edge: palette.edge,
    fade: palette.fade ?? "rgba(122, 40, 72, 0)",
    isLeaf,
    isWhitePetal,
  };
}

function startLoop() {
  if (rafId) return;
  const tick = () => {
    if (!enabled) {
      rafId = null;
      return;
    }
    updateParticles();
    drawParticles();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  particles = [];
}

function clearCanvas() {
  if (!ctx) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function updateParticles() {
  particles = particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.012;
    p.vx *= 0.985;
    p.rotation += p.rotationSpeed;
    p.life -= p.decay;
    return p.life > 0;
  });
}

function drawParticles() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (const p of particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.life * (p.isWhitePetal ? 0.92 : 0.85);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
    gradient.addColorStop(0, p.edge);
    gradient.addColorStop(0.55, p.core);
    gradient.addColorStop(1, p.fade);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * p.aspect, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.isWhitePetal && p.life > 0.45) {
      ctx.globalAlpha = p.life * 0.35;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.ellipse(-p.size * 0.12, -p.size * 0.08, p.size * 0.32, p.size * 0.18, -0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (!p.isLeaf && !p.isWhitePetal && p.life > 0.55) {
      ctx.globalAlpha = p.life * 0.25;
      ctx.fillStyle = "rgba(255, 240, 246, 0.6)";
      ctx.beginPath();
      ctx.ellipse(-p.size * 0.15, -p.size * 0.1, p.size * 0.28, p.size * 0.16, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
