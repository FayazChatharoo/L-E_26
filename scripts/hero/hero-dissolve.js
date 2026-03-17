import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

export function initHeroDissolve({
  threeRoot,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "dissolve",
  });

  let initialized = false;
  let visible = false;
  let currentProgress = 0;

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] init");
    }
  }

  function update(progress) {
    currentProgress = clamp(progress, 0, 1);
    cues.update(currentProgress);
  }

  function show() {
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] show");
    }
    visible = true;
    // Stage 2 is intentionally text + fade only.
    threeRoot?.clearPostFXPreset?.();
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] hide");
    }
    visible = false;
  }

  function destroy() {
    cues.destroy();
  }

  return {
    init,
    update,
    tick() {},
    show,
    hide,
    resize() {},
    destroy,
    get initialized() {
      return initialized;
    },
    get visible() {
      return visible;
    },
  };
}
