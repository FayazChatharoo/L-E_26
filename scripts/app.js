console.log("app loaded");
import { initHeroOrchestrator } from "./hero/hero-orchestrator.js";
import { ensureHeroThreeDeps } from "./hero/hero-three-deps.js";
import { initWebGPUSmokePOC } from "./poc/webgpu-smoke.js";

let heroController = null;
const DEBUG_HERO = true;

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
    const deps = await ensureHeroThreeDeps({
      preferredBackend: "auto",
      allowFallback: true,
    });

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
  const isPOCPage = Boolean(document.querySelector("[data-webgpu-poc-canvas]"));
  if (isPOCPage) {
    await initWebGPUSmokePOC();
    return;
  }

  const page = document.body?.dataset?.page;
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
