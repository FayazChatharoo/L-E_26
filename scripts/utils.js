import {
  createCueAnimationState,
  destroyCueAnimation,
  hideCueAnimation,
  playCue4Animation,
  playDefaultCueAnimation,
  playSpecialCueAnimation,
} from "./cue-animations.js";

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) {
    return outMin;
  }
  const t = (value - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

export function normalizeRange(value, start, end) {
  return clamp(mapRange(value, start, end, 0, 1), 0, 1);
}

export function rafThrottle(callback) {
  let ticking = false;
  let lastArgs = null;

  return (...args) => {
    lastArgs = args;
    if (ticking) {
      return;
    }

    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      callback(...lastArgs);
    });
  };
}

function parseCueFloat(raw, fallback) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value, 0, 1);
}

export function createCueController({
  scopeEl,
  selector = "[data-hero-cue]",
  stageName = "",
  gsap = window.gsap,
  getDebugTime = null,
} = {}) {
  if (!scopeEl || !gsap) {
    return {
      update() {},
      destroy() {},
      count: 0,
    };
  }

  const SplitText =
    window.SplitText ||
    (typeof gsap.core !== "undefined" && gsap.core.globals
      ? gsap.core.globals().SplitText
      : null);

  const nodes = Array.from(scopeEl.querySelectorAll(selector)).filter((el) => {
    const cueStage = el.dataset.cueStage;
    return !cueStage || cueStage === stageName;
  });

  function getCueType(el, cueId) {
    if (el.dataset.cueType) {
      return el.dataset.cueType;
    }
    if (cueId === "cue-4" || el.dataset.cueNumber === "4") {
      return "cue4";
    }
    return "default";
  }

  const cues = nodes.map((el) => {
    const cueId = el.dataset.cueId || "";
    const cueType = getCueType(el, cueId);
    const animationState = createCueAnimationState({
      cueEl: el,
      cueType,
      gsap,
      SplitText,
    });

    return {
      el,
      id: cueId,
      type: cueType,
      start: parseCueFloat(el.dataset.cueStart, 0),
      end: parseCueFloat(el.dataset.cueEnd, 1),
      lastProgress: 0,
      wasActive: false,
      animationState,
    };
  });

  function playCueAnimation(cue) {
    if (cue.type === "special") {
      playSpecialCueAnimation(cue.animationState);
      return;
    }
    if (cue.type === "cue4") {
      playCue4Animation(cue.animationState);
      return;
    }
    playDefaultCueAnimation(cue.animationState);
  }

  function update(progress) {
    const p = clamp(progress, 0, 1);
    cues.forEach((cue) => {
      const isActive = p >= cue.start && p <= cue.end;
      cue.lastProgress = normalizeRange(p, cue.start, cue.end);

      if (isActive && !cue.wasActive) {
        const debugTime = typeof getDebugTime === "function" ? getDebugTime() : NaN;
        const timeLabel = Number.isFinite(debugTime)
          ? `${debugTime.toFixed(2)}s`
          : "n/a";
        console.log(
          `[Hero Cue] id: ${cue.id || cue.type || "unnamed"} | progress: ${p.toFixed(
            2
          )} | time: ${timeLabel}`
        );
        playCueAnimation(cue);
      }

      if (!isActive && cue.wasActive) {
        hideCueAnimation(cue.animationState);
      }

      cue.wasActive = isActive;
      cue.el.style.pointerEvents = isActive ? "" : "none";
    });
  }

  function destroy() {
    cues.forEach((cue) => {
      destroyCueAnimation(cue.animationState, gsap);
      cue.el.style.pointerEvents = "";
    });
  }

  return {
    update,
    destroy,
    count: cues.length,
  };
}
