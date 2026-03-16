console.log("app loaded");
import { initHeroOrchestrator } from "./hero/hero-orchestrator.js";

let heroController = null;

function initHomePage() {
  if (heroController) {
    heroController.destroy();
    heroController = null;
  }
  heroController = initHeroOrchestrator();
}

function boot() {
  const page = document.body?.dataset?.page;
  if (page === "home") {
    initHomePage();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
