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
} = {}) {
  if (!scopeEl || !gsap) {
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
    intro: parseCueFloat(el.dataset.cueIntro, 0.25),
    outro: parseCueFloat(el.dataset.cueOutro, 0.75),
    yFrom: Number.parseFloat(el.dataset.cueY) || 28,
    ease: gsap.parseEase(el.dataset.cueEase || "power2.out"),
    maxProgress: 0,
  }));

  cues.forEach((cue) => {
    gsap.set(cue.el, {
      autoAlpha: 0,
      y: cue.yFrom,
      willChange: "opacity, transform",
    });
  });

  function cueMix(cue, progress) {
    const p = clamp(progress, 0, 1);
    const fadeInEnd = Math.max(0.001, cue.intro);
    const fadeOutStart = Math.min(0.999, Math.max(cue.intro, cue.outro));

    if (p <= fadeInEnd) {
      return cue.ease(normalizeRange(p, 0, fadeInEnd));
    }
    if (p >= fadeOutStart) {
      return cue.ease(1 - normalizeRange(p, fadeOutStart, 1));
    }
    return 1;
  }

  function update(progress) {
    const p = clamp(progress, 0, 1);
    cues.forEach((cue) => {
      const localProgress = normalizeRange(p, cue.start, cue.end);
      cue.maxProgress = Math.max(cue.maxProgress, localProgress);

      let animatedProgress = localProgress;
      if (cue.once && cue.maxProgress >= 1) {
        animatedProgress = 1;
      }

      const mix = cueMix(cue, animatedProgress);
      gsap.set(cue.el, {
        autoAlpha: mix,
        y: (1 - mix) * cue.yFrom,
      });

      cue.el.style.pointerEvents = mix > 0.98 ? "" : "none";
    });
  }

  function destroy() {
    cues.forEach((cue) => {
      gsap.set(cue.el, {
        clearProps: "autoAlpha,opacity,visibility,transform,willChange,pointerEvents",
      });
    });
  }

  return {
    update,
    destroy,
    count: cues.length,
  };
}
