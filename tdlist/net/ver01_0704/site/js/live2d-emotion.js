/**
 * Live2D 面部表情与情感演化 — 仅驱动面部相关参数，不影响身体/物理。
 */

/** 始终开启（去水印） */
export const UTILITY_FASE = "fase105";

/** 模型内置面部表情层（fase 开关，同一时刻仅激活一个） */
export const FASE_EXPRESSIONS = {
  calm: "fase51",
  soft: "fase60",
  smile: "fase68",
  happy: "fase72",
  shy: "fase78",
  curious: "fase84",
  surprised: "fase90",
  sleepy: "fase95",
  pout: "fase100",
};

/** 所有参与轮换的 fase（不含 utility） */
const ROTATING_FASES = Object.values(FASE_EXPRESSIONS);

/** 参与插值的面部参数（不含头部追踪 ParamAngle* / ParamBody* / ParamEyeBall*） */
export const FACIAL_PARAM_IDS = [
  "ParamMouthForm",
  "ParamMouthForm2",
  "ParamMouthForm3",
  "ParamMouthForm4",
  "ParamMouthOpenY",
  "ParamEyeLSmile",
  "ParamEyeRSmile",
  "ParamBrowLAngle3",
  "ParamBrowLAngle5",
  "ParamBrowRAngle3",
  "ParamBrowRAngle7",
  "ParamBrowRY",
  "ParamBrowRY2",
  "ParamBrowRY3",
  "ParamEyeLOpen",
  "ParamEyeROpen",
];

/**
 * 语义表情：fase 层 + 微调参数 + 情感向量 + 停留时间
 * mood: valence(-1~1) arousal(0~1) affinity(0~1)
 */
export const EXPRESSION_PRESETS = {
  neutral: {
    fase: FASE_EXPRESSIONS.calm,
    params: {},
    mood: { valence: 0.05, arousal: 0.15, affinity: 0.5 },
    dwell: [7, 14],
  },
  soft_smile: {
    fase: FASE_EXPRESSIONS.soft,
    params: { ParamMouthForm2: 0.35, ParamEyeLSmile: 0.25, ParamEyeRSmile: 0.25 },
    mood: { valence: 0.45, arousal: 0.25, affinity: 0.65 },
    dwell: [6, 12],
  },
  smile: {
    fase: FASE_EXPRESSIONS.smile,
    params: { ParamMouthForm2: 0.65, ParamEyeLSmile: 0.45, ParamEyeRSmile: 0.45, ParamMouthOpenY: 0.08 },
    mood: { valence: 0.65, arousal: 0.35, affinity: 0.7 },
    dwell: [5, 10],
  },
  happy: {
    fase: FASE_EXPRESSIONS.happy,
    params: { ParamMouthForm2: 0.85, ParamMouthOpenY: 0.18, ParamEyeLSmile: 0.7, ParamEyeRSmile: 0.7 },
    mood: { valence: 0.82, arousal: 0.55, affinity: 0.75 },
    dwell: [4, 9],
  },
  shy: {
    fase: FASE_EXPRESSIONS.shy,
    params: { ParamMouthForm3: 0.35, ParamBrowRY2: 0.25, ParamEyeLSmile: 0.15, ParamEyeRSmile: 0.1 },
    mood: { valence: 0.25, arousal: 0.3, affinity: 0.25 },
    dwell: [5, 11],
  },
  curious: {
    fase: FASE_EXPRESSIONS.curious,
    params: { ParamBrowLAngle3: 0.35, ParamBrowRAngle3: 0.2, ParamMouthForm2: 0.15 },
    mood: { valence: 0.35, arousal: 0.62, affinity: 0.6 },
    dwell: [4, 8],
  },
  surprised: {
    fase: FASE_EXPRESSIONS.surprised,
    params: { ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamMouthOpenY: 0.42, ParamBrowLAngle3: 0.45, ParamBrowRAngle3: 0.45 },
    mood: { valence: 0.15, arousal: 0.88, affinity: 0.55 },
    dwell: [2, 5],
  },
  sleepy: {
    fase: FASE_EXPRESSIONS.sleepy,
    params: { ParamEyeLOpen: 0.22, ParamEyeROpen: 0.22, ParamMouthOpenY: 0.12, ParamBrowRY2: -0.15 },
    mood: { valence: 0.1, arousal: 0.06, affinity: 0.55 },
    dwell: [8, 16],
  },
  pout: {
    fase: FASE_EXPRESSIONS.pout,
    params: { ParamMouthForm4: 0.55, ParamBrowRY2: 0.35, ParamMouthForm3: -0.2 },
    mood: { valence: -0.15, arousal: 0.38, affinity: 0.35 },
    dwell: [4, 9],
  },
};

/** 情感状态 → 更易切换到的表情 */
const MOOD_AFFINITY = {
  neutral: ["soft_smile", "curious", "sleepy", "smile"],
  soft_smile: ["smile", "neutral", "shy", "happy"],
  smile: ["happy", "soft_smile", "curious", "shy"],
  happy: ["smile", "curious", "soft_smile", "surprised"],
  shy: ["soft_smile", "neutral", "smile", "pout"],
  curious: ["surprised", "smile", "happy", "neutral"],
  surprised: ["curious", "happy", "neutral", "shy"],
  sleepy: ["neutral", "soft_smile", "shy"],
  pout: ["shy", "neutral", "soft_smile", "sleepy"],
};

const PRESET_KEYS = Object.keys(EXPRESSION_PRESETS);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function moodDistance(a, b) {
  const dv = (a.valence ?? 0) - (b.valence ?? 0);
  const da = (a.arousal ?? 0) - (b.arousal ?? 0);
  const df = (a.affinity ?? 0) - (b.affinity ?? 0);
  return Math.sqrt(dv * dv + da * da + df * df);
}

function lerpMood(from, to, t) {
  return {
    valence: (from.valence ?? 0) + ((to.valence ?? 0) - (from.valence ?? 0)) * t,
    arousal: (from.arousal ?? 0) + ((to.arousal ?? 0) - (from.arousal ?? 0)) * t,
    affinity: (from.affinity ?? 0) + ((to.affinity ?? 0) - (from.affinity ?? 0)) * t,
  };
}

function buildZeroParams() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const id of FACIAL_PARAM_IDS) out[id] = 0;
  for (const fase of ROTATING_FASES) out[fase] = 0;
  out[UTILITY_FASE] = 1;
  return out;
}

function presetToSnapshot(presetId) {
  const preset = EXPRESSION_PRESETS[presetId];
  const snap = buildZeroParams();
  if (preset.fase) snap[preset.fase] = 1;
  Object.assign(snap, preset.params);
  return snap;
}

function pickNextExpression(currentId, mood) {
  const candidates = new Set(MOOD_AFFINITY[currentId] ?? PRESET_KEYS);
  candidates.delete(currentId);

  /** @type {{ id: string, weight: number }[]} */
  const weighted = [];

  for (const id of candidates) {
    const preset = EXPRESSION_PRESETS[id];
    if (!preset) continue;

    let weight = 1;

    // 情感惯性：当前 mood 越接近目标表情 mood，越容易被选中
    const dist = moodDistance(mood, preset.mood);
    weight += Math.max(0, 2.2 - dist * 2.5);

    // 低唤醒时更易进入 sleepy / neutral
    if (mood.arousal < 0.25) {
      if (id === "sleepy" || id === "neutral") weight += 1.4;
      if (id === "surprised" || id === "happy") weight *= 0.45;
    }

    // 高唤醒时更易 curious / surprised / happy
    if (mood.arousal > 0.55) {
      if (id === "curious" || id === "surprised" || id === "happy") weight += 0.9;
    }

    // 正效价偏 smile 系，负效价偏 pout / shy
    if (mood.valence > 0.35 && (id === "smile" || id === "happy" || id === "soft_smile")) weight += 0.7;
    if (mood.valence < 0 && (id === "pout" || id === "shy")) weight += 0.8;

    // 避免连续两次高能量表情
    if (currentId === "surprised" && id === "surprised") weight *= 0.1;

    weighted.push({ id, weight: Math.max(0.05, weight) });
  }

  if (!weighted.length) return "neutral";

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return weighted.at(-1).id;
}

function scheduleNextSwitch(controller) {
  if (controller.switchTimer) {
    clearTimeout(controller.switchTimer);
    controller.switchTimer = null;
  }

  const preset = EXPRESSION_PRESETS[controller.currentId];
  const [minD, maxD] = preset?.dwell ?? [6, 12];
  let delay = randBetween(minD, maxD) * 1000;

  // 低唤醒延长停留
  if (controller.mood.arousal < 0.2) delay *= 1.25;

  controller.switchTimer = setTimeout(() => {
    if (!controller.active) return;
    const nextId = pickNextExpression(controller.currentId, controller.mood);
    controller.transitionTo(nextId);
    scheduleNextSwitch(controller);
  }, delay);
}

/**
 * @param {object} core - Cubism coreModel
 * @param {string} id
 * @param {number} value
 */
export function setCoreParamSafe(core, id, value) {
  if (!core?.setParameterValueById) return;
  try {
    if (typeof core.getParameterIndex === "function" && core.getParameterIndex(id) < 0) return;
    core.setParameterValueById(id, value);
  } catch {
    /* param may not exist */
  }
}

/**
 * @param {object} model - Live2DModel
 * @param {Record<string, number>} snapshot
 */
export function applyExpressionSnapshot(model, snapshot) {
  const core = model?.internalModel?.coreModel;
  if (!core) return;

  for (const [id, value] of Object.entries(snapshot)) {
    setCoreParamSafe(core, id, value);
  }
}

function blendSnapshots(from, to, t) {
  const out = buildZeroParams();
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of keys) {
    const a = from[key] ?? 0;
    const b = to[key] ?? 0;
    out[key] = a + (b - a) * t;
  }
  out[UTILITY_FASE] = 1;
  return out;
}

/**
 * @param {object} model
 * @returns {object | null}
 */
export function createEmotionController(model) {
  if (!model) return null;

  const currentId = "neutral";
  /** @type {object} */
  const controller = {
    model,
    active: true,
    currentId,
    fromSnap: presetToSnapshot(currentId),
    toSnap: presetToSnapshot(currentId),
    blendT: 1,
    blendDuration: 0.85,
    mood: { ...EXPRESSION_PRESETS.neutral.mood },
    switchTimer: null,
    pointerEnergy: 0,
    transitionTo(id) {
      if (!EXPRESSION_PRESETS[id] || id === this.currentId) return;
      this.fromSnap = blendSnapshots(this.fromSnap, this.toSnap, this.blendT);
      this.currentId = id;
      this.toSnap = presetToSnapshot(id);
      this.blendT = 0;
      this.blendDuration = id === "surprised" ? 0.35 : id === "sleepy" ? 1.2 : 0.85;
    },
    tick(delta) {
      if (!this.active) return;

      // mood 向当前表情缓慢演化
      const targetMood = EXPRESSION_PRESETS[this.currentId]?.mood ?? this.mood;
      const moodLerp = clamp(delta * 0.35, 0, 1);
      this.mood = lerpMood(this.mood, targetMood, moodLerp);

      // 指针活动增加唤醒与亲和（便于切到 curious / smile）
      if (this.pointerEnergy > 0.01) {
        this.mood.arousal = clamp(this.mood.arousal + this.pointerEnergy * delta * 0.8, 0, 1);
        this.mood.affinity = clamp(this.mood.affinity + this.pointerEnergy * delta * 0.5, 0, 1);
        this.mood.valence = clamp(this.mood.valence + this.pointerEnergy * delta * 0.25, -1, 1);
        this.pointerEnergy *= Math.pow(0.05, delta);
      }

      if (this.blendT < 1) {
        this.blendT = clamp(this.blendT + delta / this.blendDuration, 0, 1);
      }

      const eased = this.blendT * this.blendT * (3 - 2 * this.blendT);
      const snap = blendSnapshots(this.fromSnap, this.toSnap, eased);
      applyExpressionSnapshot(this.model, snap);
    },
    notePointerActivity(intensity = 0.15) {
      this.pointerEnergy = clamp(this.pointerEnergy + intensity, 0, 1);
      if (this.pointerEnergy > 0.35 && this.mood.arousal > 0.4 && Math.random() < 0.08) {
        const boost = pickNextExpression(this.currentId, {
          ...this.mood,
          arousal: clamp(this.mood.arousal + 0.2, 0, 1),
        });
        if (boost === "curious" || boost === "smile" || boost === "happy") {
          this.transitionTo(boost);
        }
      }
    },
    setActive(active) {
      this.active = active;
      if (active) {
        scheduleNextSwitch(this);
      } else if (this.switchTimer) {
        clearTimeout(this.switchTimer);
        this.switchTimer = null;
      }
    },
    destroy() {
      this.setActive(false);
    },
  };

  applyExpressionSnapshot(model, controller.toSnap);
  scheduleNextSwitch(controller);
  return controller;
}

export function getExpressionLabel(id) {
  const labels = {
    neutral: "平静",
    soft_smile: "浅笑",
    smile: "微笑",
    happy: "开心",
    shy: "害羞",
    curious: "好奇",
    surprised: "惊讶",
    sleepy: "困倦",
    pout: "委屈",
  };
  return labels[id] ?? id;
}
