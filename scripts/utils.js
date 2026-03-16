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
} = {}) {
  if (!scopeEl) {
    return {
      update() {},
      destroy() {},
      count: 0,
    };
  }

  const nodes = Array.from(scopeEl.querySelectorAll(selector)).filter((el) => {
    const cueStage = el.dataset.cueStage;
    return !cueStage || cueStage === stageName;
  });

  const cues = nodes.map((el) => ({
    el,
    id: el.dataset.cueId || "",
    start: parseCueFloat(el.dataset.cueStart, 0),
    end: parseCueFloat(el.dataset.cueEnd, 1),
    once: el.dataset.cueOnce === "true",
    hasActivated: false,
  }));

  function update(progress) {
    const p = clamp(progress, 0, 1);
    cues.forEach((cue) => {
      const isActive = p >= cue.start && p <= cue.end;
      const isPast = p > cue.end;

      if (cue.once && cue.hasActivated) {
        cue.el.classList.remove("is-active");
        cue.el.classList.add("is-past");
        cue.el.setAttribute("data-cue-state", "past");
        return;
      }

      cue.el.classList.toggle("is-active", isActive);
      cue.el.classList.toggle("is-past", isPast);
      cue.el.classList.toggle("is-future", !isActive && !isPast);

      if (isActive) {
        cue.hasActivated = true;
        cue.el.setAttribute("data-cue-state", "active");
      } else if (isPast) {
        cue.el.setAttribute("data-cue-state", "past");
      } else {
        cue.el.setAttribute("data-cue-state", "future");
      }
    });
  }

  function destroy() {
    cues.forEach((cue) => {
      cue.el.classList.remove("is-active", "is-past", "is-future");
      cue.el.removeAttribute("data-cue-state");
    });
  }

  return {
    update,
    destroy,
    count: cues.length,
  };
}
