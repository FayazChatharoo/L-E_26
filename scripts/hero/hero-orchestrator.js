import { initHeroVideo } from "./hero-video.js";
import { initHeroDissolve } from "./hero-dissolve.js";
import { initHeroTunnel } from "./hero-tunnel.js";
import { clamp, mapRange, normalizeRange, rafThrottle } from "../utils.js";

const DEFAULT_CONFIG = {
  triggerSelector: "[data-hero-sequence]",
  stageSelector: "[data-hero-stage]",
  videoSelector: "[data-hero-video]",
  overlaySelector: '[data-hero-overlay="black"]',
  dissolveCanvasSelector: '[data-hero-canvas="dissolve"]',
  tunnelCanvasSelector: '[data-hero-canvas="tunnel"]',
  scrollDistance: 9000,
  ranges: {
    video: [0.0, 0.6],
    dissolve: [0.6, 0.8],
    tunnel: [0.8, 1.0],
  },
  transitions: {
    fadeInStart: 0.56,
    fadePeak: 0.6,
    fadeOutEnd: 0.62,
    dissolveWarmStart: 0.54,
    tunnelWarmStart: 0.76,
  },
};

let activeInstance = null;

function getGsapAndScrollTrigger() {
  const gsap = window.gsap;
  if (!gsap) {
    return null;
  }

  const ScrollTrigger =
    window.ScrollTrigger ||
    (typeof gsap.core !== "undefined" && gsap.core.globals
      ? gsap.core.globals().ScrollTrigger
      : null);

  if (!ScrollTrigger) {
    return null;
  }

  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}

function getStageProgress(progress, range) {
  return normalizeRange(progress, range[0], range[1]);
}

function getOverlayOpacity(progress, transitions) {
  if (progress <= transitions.fadeInStart) {
    return 0;
  }
  if (progress <= transitions.fadePeak) {
    return clamp(
      mapRange(progress, transitions.fadeInStart, transitions.fadePeak, 0, 1),
      0,
      1
    );
  }
  if (progress <= transitions.fadeOutEnd) {
    return clamp(
      mapRange(progress, transitions.fadePeak, transitions.fadeOutEnd, 1, 0),
      0,
      1
    );
  }
  return 0;
}

function updateStageClasses(rootEl, stageEls, progress, ranges) {
  const currentStage =
    progress < ranges.video[1]
      ? "video"
      : progress < ranges.dissolve[1]
      ? "dissolve"
      : "tunnel";

  rootEl.setAttribute("data-hero-current-stage", currentStage);

  stageEls.forEach((stageEl) => {
    const stageName = stageEl.dataset.heroStage;
    const range = ranges[stageName];
    if (!range) {
      return;
    }

    const isActive = progress >= range[0] && progress <= range[1];
    const isPast = progress > range[1];

    stageEl.classList.toggle("is-active", isActive);
    stageEl.classList.toggle("is-past", isPast);
    stageEl.classList.toggle("is-future", !isActive && !isPast);
  });
}

export function initHeroOrchestrator(userConfig = {}) {
  if (activeInstance) {
    activeInstance.destroy();
    activeInstance = null;
  }

  const globals = getGsapAndScrollTrigger();
  if (!globals) {
    console.warn("[hero-orchestrator] GSAP/ScrollTrigger unavailable.");
    return null;
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    ranges: {
      ...DEFAULT_CONFIG.ranges,
      ...(userConfig.ranges || {}),
    },
    transitions: {
      ...DEFAULT_CONFIG.transitions,
      ...(userConfig.transitions || {}),
    },
  };

  const rootEl = document.querySelector(config.triggerSelector);
  if (!rootEl) {
    return null;
  }

  const stageEls = Array.from(rootEl.querySelectorAll(config.stageSelector));
  const videoStageEl = rootEl.querySelector('[data-hero-stage="video"]');
  const dissolveStageEl = rootEl.querySelector('[data-hero-stage="dissolve"]');
  const tunnelStageEl = rootEl.querySelector('[data-hero-stage="tunnel"]');

  const videoEl = rootEl.querySelector(config.videoSelector);
  const overlayEl = rootEl.querySelector(config.overlaySelector);
  const dissolveCanvasEl = rootEl.querySelector(config.dissolveCanvasSelector);
  const tunnelCanvasEl = rootEl.querySelector(config.tunnelCanvasSelector);

  const videoScene = initHeroVideo({
    stageEl: videoStageEl,
    videoEl,
  });
  const dissolveScene = initHeroDissolve({
    canvasContainer: dissolveCanvasEl,
    cueScopeEl: dissolveStageEl,
  });
  const tunnelScene = initHeroTunnel({
    canvasContainer: tunnelCanvasEl,
    cueScopeEl: tunnelStageEl,
  });

  function renderAtProgress(progress) {
    const p = clamp(progress, 0, 1);
    const videoProgress = getStageProgress(p, config.ranges.video);
    const dissolveProgress = getStageProgress(p, config.ranges.dissolve);
    const tunnelProgress = getStageProgress(p, config.ranges.tunnel);

    if (p >= config.transitions.dissolveWarmStart && !dissolveScene.initialized) {
      dissolveScene.init();
    }
    if (p >= config.transitions.tunnelWarmStart && !tunnelScene.initialized) {
      tunnelScene.init();
    }

    // Keep video fully bidirectional when returning from dissolve to video.
    if (p <= config.ranges.video[1]) {
      videoScene.update(videoProgress);
    }

    if (p >= config.ranges.dissolve[0] && p <= config.ranges.dissolve[1]) {
      dissolveScene.update(dissolveProgress);
    }

    if (p >= config.ranges.tunnel[0]) {
      tunnelScene.update(tunnelProgress);
    }

    if (overlayEl) {
      const opacity = getOverlayOpacity(p, config.transitions);
      overlayEl.style.opacity = String(opacity);
      overlayEl.style.pointerEvents = "none";
    }

    updateStageClasses(rootEl, stageEls, p, config.ranges);
  }

  function resizeAll() {
    const width = rootEl.clientWidth || window.innerWidth;
    const height = rootEl.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    videoScene.resize(width, height, dpr);
    dissolveScene.resize(width, height, dpr);
    tunnelScene.resize(width, height, dpr);
  }

  const onResize = rafThrottle(() => {
    resizeAll();
    globals.ScrollTrigger.refresh();
  });
  window.addEventListener("resize", onResize);

  const trigger = globals.ScrollTrigger.create({
    trigger: rootEl,
    start: "top top",
    end: `+=${config.scrollDistance}`,
    pin: true,
    scrub: 2,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => renderAtProgress(self.progress),
    onRefresh: () => resizeAll(),
  });

  renderAtProgress(0);
  resizeAll();

  const instance = {
    destroy() {
      window.removeEventListener("resize", onResize);
      trigger.kill();
      videoScene.destroy();
      dissolveScene.destroy();
      tunnelScene.destroy();

      if (overlayEl) {
        overlayEl.style.opacity = "";
        overlayEl.style.pointerEvents = "";
      }

      stageEls.forEach((stageEl) => {
        stageEl.classList.remove("is-active", "is-past", "is-future");
      });
      rootEl.removeAttribute("data-hero-current-stage");

      if (activeInstance === instance) {
        activeInstance = null;
      }
    },
    refresh() {
      trigger.refresh();
    },
  };

  activeInstance = instance;
  return instance;
}
