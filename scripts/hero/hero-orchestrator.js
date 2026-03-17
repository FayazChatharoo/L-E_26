import { initHeroVideo } from "./hero-video.js";
import { initHeroDissolve } from "./hero-dissolve.js";
import { initHeroTunnel } from "./hero-tunnel.js";
import { initHeroThreeRoot } from "./hero-three-root.js";
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
    canvasInStart: 0.57,
    canvasInEnd: 0.64,
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

  const threeRoot = initHeroThreeRoot({
    mountEl: dissolveCanvasEl,
  });

  const videoScene = initHeroVideo({
    stageEl: videoStageEl,
    videoEl,
  });
  const dissolveScene = initHeroDissolve({
    threeRoot,
    cueScopeEl: dissolveStageEl,
  });
  const tunnelScene = initHeroTunnel({
    threeRoot,
    cueScopeEl: tunnelStageEl,
  });

  const stageState = {
    currentStage: "video",
    localProgress: {
      video: 0,
      dissolve: 0,
      tunnel: 0,
    },
  };

  function getCurrentStage(progress) {
    if (progress < config.ranges.video[1]) {
      return "video";
    }
    if (progress < config.ranges.dissolve[1]) {
      return "dissolve";
    }
    return "tunnel";
  }

  function updateCanvasVisibility(progress) {
    if (!videoEl || !dissolveCanvasEl) {
      return;
    }

    const canvasOpacity = clamp(
      mapRange(
        progress,
        config.transitions.canvasInStart,
        config.transitions.canvasInEnd,
        0,
        1
      ),
      0,
      1
    );
    const videoOpacity = 1 - canvasOpacity;

    videoEl.style.opacity = String(videoOpacity);
    videoEl.style.zIndex = "1";
    dissolveCanvasEl.style.opacity = String(canvasOpacity);
    dissolveCanvasEl.style.zIndex = "2";
    dissolveCanvasEl.style.pointerEvents = "none";
  }

  function switchStage(nextStage) {
    if (nextStage === stageState.currentStage) {
      return;
    }

    stageState.currentStage = nextStage;

    if (nextStage === "video") {
      dissolveScene.hide?.();
      tunnelScene.hide?.();
      threeRoot.setActiveScene(null);
      return;
    }

    if (nextStage === "dissolve") {
      dissolveScene.init?.();
      dissolveScene.show?.();
      tunnelScene.hide?.();
      threeRoot.setActiveScene(dissolveScene);
      return;
    }

    tunnelScene.init?.();
    tunnelScene.show?.();
    dissolveScene.hide?.();
    threeRoot.setActiveScene(tunnelScene);
  }

  function renderAtProgress(progress) {
    const p = clamp(progress, 0, 1);
    const videoProgress = getStageProgress(p, config.ranges.video);
    const dissolveProgress = getStageProgress(p, config.ranges.dissolve);
    const tunnelProgress = getStageProgress(p, config.ranges.tunnel);
    const nextStage = getCurrentStage(p);

    if (p >= config.transitions.dissolveWarmStart && !dissolveScene.initialized) {
      dissolveScene.init();
    }
    if (p >= config.transitions.tunnelWarmStart && !tunnelScene.initialized) {
      tunnelScene.init();
    }

    switchStage(nextStage);

    // Keep video fully bidirectional when returning from dissolve to video.
    if (p <= config.ranges.video[1]) {
      videoScene.update(videoProgress);
    }

    if (nextStage === "dissolve") {
      dissolveScene.update(dissolveProgress);
    }

    if (nextStage === "tunnel") {
      tunnelScene.update(tunnelProgress);
    }

    stageState.localProgress.video = videoProgress;
    stageState.localProgress.dissolve = dissolveProgress;
    stageState.localProgress.tunnel = tunnelProgress;
    updateCanvasVisibility(p);

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
    threeRoot.resize(width, height, dpr);
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
      threeRoot.destroy();

      if (overlayEl) {
        overlayEl.style.opacity = "";
        overlayEl.style.pointerEvents = "";
      }
      if (videoEl) {
        videoEl.style.opacity = "";
        videoEl.style.zIndex = "";
      }
      if (dissolveCanvasEl) {
        dissolveCanvasEl.style.opacity = "";
        dissolveCanvasEl.style.zIndex = "";
        dissolveCanvasEl.style.pointerEvents = "";
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
    getState() {
      return {
        currentStage: stageState.currentStage,
        localProgress: { ...stageState.localProgress },
      };
    },
  };

  activeInstance = instance;
  return instance;
}
