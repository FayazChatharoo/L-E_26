console.log("app loaded");
import { initHeroOrchestrator } from "./hero/hero-orchestrator.js";
import { ensureHeroThreeDeps } from "./hero/hero-three-deps.js";

let heroController = null;
const DEBUG_HERO = true;
const HERO_CUE_BASE_STYLE_ID = "hero-cue-base-style";

function ensureHeroCueBaseStyles() {
  if (document.getElementById(HERO_CUE_BASE_STYLE_ID)) {
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.id = HERO_CUE_BASE_STYLE_ID;
  styleEl.textContent = `
[data-hero-cue]{
  visibility:hidden !important;
  pointer-events:none !important;
}
[data-hero-cue][data-hero-cue-visible="true"]{
  visibility:visible !important;
}
`;
  document.head.appendChild(styleEl);
}

function setBootCanvasVisibility(isHidden) {
  const roots = document.querySelectorAll("[data-hero-canvas-root]");
  roots.forEach((el) => {
    if (isHidden) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      return;
    }
    el.style.opacity = "";
    el.style.pointerEvents = "";
  });
}

function initHomePage() {
  if (heroController) {
    heroController.destroy();
    heroController = null;
  }
  heroController = initHeroOrchestrator();
}

async function bootHero() {
  setBootCanvasVisibility(true);

  const state = {
    phase: "BOOT_START",
    backend: null,
  };

  try {
    state.phase = "CHECK_SUPPORT";
    const deps = await ensureHeroThreeDeps();

    if (!deps?.ready || !deps.backend) {
      if (DEBUG_HERO) {
        console.error("[Hero][Boot] renderer deps failed", deps?.error || null);
      }
      return;
    }

    state.backend = deps.backend;
    state.phase = deps.backend === "webgpu" ? "COMMIT_WEBGPU" : "COMMIT_WEBGL";

    if (DEBUG_HERO) {
      console.log("[Hero][Boot] phase:", state.phase);
      console.log("[Hero][RenderBackend]", deps.backend);
    }

    initHomePage();
  } finally {
    setBootCanvasVisibility(false);
  }
}

async function boot() {
  ensureHeroCueBaseStyles();

  const page = document.body?.dataset?.page;

  // Optional manual smoke page only. Do not hijack the hero flow.
  if (page === "webgpu-poc") {
    const { initWebGPUSmokePOC } = await import("./poc/webgpu-smoke.js");
    await initWebGPUSmokePOC();
    return;
  }

  if (page === "home") {
    await bootHero();
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void boot();
    },
    { once: true }
  );
} else {
  void boot();
}
