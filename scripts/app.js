console.log("app loaded");
import { initHeroOrchestrator } from "./hero/hero-orchestrator.js";
import { ensureHeroThreeDeps } from "./hero/hero-three-deps.js";

let heroController = null;
const DEBUG_HERO = true;

function initHomePage() {
  if (heroController) {
    heroController.destroy();
    heroController = null;
  }
  heroController = initHeroOrchestrator();
}

async function boot() {
  const page = document.body?.dataset?.page;
  if (page === "home") {
    const threeReady = await ensureHeroThreeDeps();
    if (DEBUG_HERO) {
      console.log("[Hero][Boot] three deps ready:", threeReady);
    }
    initHomePage();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  }, { once: true });
} else {
  void boot();
}
