import { initHeroVideo } from "./hero-video.js";
import { initHeroTunnel } from "./hero-tunnel.js";
import { initHeroThreeRoot } from "./hero-three-root.js";
import { clamp, mapRange, normalizeRange, rafThrottle } from "../utils.js";

const DEBUG_HERO = true;
const STAGE_SWITCH_HYSTERESIS = 0.004;

const DEFAULT_CONFIG = {
  triggerSelector: "[data-hero-sequence]",
  stageSelector: "[data-hero-stage]",
  videoSelector: "[data-hero-video]",
  overlaySelector: '[data-hero-overlay="black"]',
  canvasRootSelector: "[data-hero-canvas-root]",
  scrollDistance: 5000,
  holdMultiplier: 1.15,
  ranges: {
    video: [0.0, 0.6],
    tunnel: [0.6, 1.0],
  },
  transitions: {
    fadeInStart: 0.56,
    fadePeak: 0.6,
    fadeOutEnd: 0.64,
    canvasInStart: 0.58,
    canvasInEnd: 0.68,
    tunnelWarmStart: 0.52,
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
  const currentStage = progress < ranges.video[1] ? "video" : "tunnel";

  rootEl.setAttribute("data-hero-current-stage", currentStage);

  stageEls.forEach((stageEl) => {
    const stageName = stageEl.dataset.heroStage;
    const range = ranges[stageName];
    if (!range) {
      stageEl.classList.remove("is-active");
      stageEl.classList.remove("is-past");
      stageEl.classList.add("is-future");
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
    if (DEBUG_HERO) {
      console.warn("[hero-orchestrator] GSAP/ScrollTrigger unavailable.");
    }
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
  if (DEBUG_HERO) {
    console.groupCollapsed("[Hero] Init");
    console.log("[Hero][DOM] root:", rootEl ? "found" : "missing");
  }
  if (!rootEl) {
    if (DEBUG_HERO) {
      console.groupEnd();
    }
    return null;
  }

  const stageEls = Array.from(rootEl.querySelectorAll(config.stageSelector));
  const videoStageEl = rootEl.querySelector('[data-hero-stage="video"]');
  const tunnelStageEl = rootEl.querySelector('[data-hero-stage="tunnel"]');
  const videoEl = rootEl.querySelector(config.videoSelector);
  const overlayEl = rootEl.querySelector(config.overlaySelector);
  let backgroundLayerEl = rootEl.querySelector('[data-hero-bg="gradient"]');

  let sharedCanvasRootEl = rootEl.querySelector(config.canvasRootSelector);
  let createdSharedCanvasRootEl = false;
  if (!sharedCanvasRootEl) {
    sharedCanvasRootEl = document.createElement("div");
    sharedCanvasRootEl.setAttribute("data-hero-canvas-root", "true");
    sharedCanvasRootEl.style.position = "absolute";
    sharedCanvasRootEl.style.inset = "0";
    sharedCanvasRootEl.style.zIndex = "2";
    sharedCanvasRootEl.style.pointerEvents = "none";
    rootEl.appendChild(sharedCanvasRootEl);
    createdSharedCanvasRootEl = true;
  }
  let createdBackgroundLayerEl = false;
  if (!backgroundLayerEl) {
    backgroundLayerEl = document.createElement("div");
    backgroundLayerEl.setAttribute("data-hero-bg", "gradient");
    backgroundLayerEl.style.position = "absolute";
    backgroundLayerEl.style.inset = "0";
    backgroundLayerEl.style.zIndex = "0";
    backgroundLayerEl.style.pointerEvents = "none";
    backgroundLayerEl.style.background =
      "linear-gradient(to bottom, #03070D 0%, #012340 100%)";
    rootEl.appendChild(backgroundLayerEl);
    createdBackgroundLayerEl = true;
  }

  if (DEBUG_HERO) {
    console.log("[Hero][DOM] videoEl:", videoEl ? "found" : "missing");
    console.log("[Hero][DOM] sharedCanvasRootEl:", sharedCanvasRootEl ? "found" : "missing");
    console.log("[Hero][DOM] backgroundLayerEl:", backgroundLayerEl ? "found" : "missing");
    console.groupEnd();
  }

  const threeRoot = initHeroThreeRoot({
    mountEl: sharedCanvasRootEl,
  });

  const videoScene = initHeroVideo({
    stageEl: videoStageEl,
    videoEl,
  });
  const tunnelScene = initHeroTunnel({
    threeRoot,
    cueScopeEl: tunnelStageEl,
  });

  const stageState = {
    currentStage: "video",
    localProgress: {
      video: 0,
      tunnel: 0,
    },
  };
  let lastProgressBucket = -1;

  function getCurrentStage(progress, currentStage) {
    const videoEnd = config.ranges.video[1];
    const h = STAGE_SWITCH_HYSTERESIS;

    if (currentStage === "video") {
      return progress < videoEnd + h ? "video" : "tunnel";
    }

    return progress < videoEnd - h ? "video" : "tunnel";
  }

  function updateCanvasVisibility(progress) {
    if (!videoEl || !sharedCanvasRootEl) {
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
    sharedCanvasRootEl.style.opacity = String(canvasOpacity);
    sharedCanvasRootEl.style.pointerEvents = "none";
  }

  function switchStage(nextStage) {
    if (nextStage === stageState.currentStage) {
      return;
    }

    if (DEBUG_HERO) {
      console.groupCollapsed("[Hero] Stage Change");
      console.log(`[Hero][Stage] \u2192 ${nextStage}`);
    }

    stageState.currentStage = nextStage;

    if (nextStage === "video") {
      if (DEBUG_HERO) {
        console.log("[Hero][Stage] disabling Three.js (video stage)");
        console.groupEnd();
      }
      tunnelScene.hide?.();
      threeRoot.setActiveScene(null);
      return;
    }

    if (DEBUG_HERO) {
      console.log("[Hero][Stage] activating scene: tunnelScene");
      console.groupEnd();
    }
    tunnelScene.init?.();
    tunnelScene.show?.();
    threeRoot.setActiveScene(tunnelScene);
  }

  function renderAtProgress(progress) {
    const holdMultiplier = Math.max(1, config.holdMultiplier || 1);
    const extendedProgress = clamp(progress, 0, 1) * holdMultiplier;
    const p = clamp(extendedProgress, 0, 1);
    const videoProgress = getStageProgress(p, config.ranges.video);
    const tunnelProgress = getStageProgress(p, config.ranges.tunnel);
    const nextStage = getCurrentStage(p, stageState.currentStage);
    const progressBucket = Math.floor(p * 10);
    if (DEBUG_HERO && progressBucket !== lastProgressBucket) {
      lastProgressBucket = progressBucket;
      console.log(`[Hero][Scroll] progress: ${p.toFixed(2)} | stage: ${nextStage}`);
    }

    if (p >= config.transitions.tunnelWarmStart && !tunnelScene.initialized) {
      tunnelScene.init();
    }

    switchStage(nextStage);

    if (p <= config.ranges.video[1]) {
      videoScene.update(videoProgress);
    }

    if (nextStage === "tunnel") {
      tunnelScene.update(tunnelProgress);
    }

    stageState.localProgress.video = videoProgress;
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
    const width = window.innerWidth || rootEl.clientWidth || 1;
    const height = window.innerHeight || rootEl.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    videoScene.resize(width, height, dpr);
    tunnelScene.resize(width, height, dpr);
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
    end: `+=${Math.round(config.scrollDistance * Math.max(1, config.holdMultiplier || 1))}`,
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
      if (sharedCanvasRootEl) {
        sharedCanvasRootEl.style.opacity = "";
        sharedCanvasRootEl.style.pointerEvents = "";
      }
      if (createdBackgroundLayerEl && backgroundLayerEl && backgroundLayerEl.parentNode) {
        backgroundLayerEl.parentNode.removeChild(backgroundLayerEl);
      }
      if (createdSharedCanvasRootEl && sharedCanvasRootEl && sharedCanvasRootEl.parentNode) {
        sharedCanvasRootEl.parentNode.removeChild(sharedCanvasRootEl);
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
