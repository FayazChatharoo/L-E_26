import { clamp, createCueController } from "../utils.js";

export function initHeroVideo({
  stageEl,
  videoEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  if (!stageEl || !videoEl) {
    return {
      update() {},
      resize() {},
      destroy() {},
      isReady: false,
    };
  }

  let isDestroyed = false;
  let isReady = Number.isFinite(videoEl.duration) && videoEl.duration > 0;
  let duration = isReady ? videoEl.duration : 0;
  let lastTime = -1;

  const cues = createCueController({
    scopeEl: stageEl,
    selector: cueSelector,
    stageName: "video",
  });

  if (!videoEl.hasAttribute("playsinline")) {
    videoEl.setAttribute("playsinline", "true");
  }
  if (videoEl.preload === "none" || !videoEl.preload) {
    videoEl.preload = "auto";
  }

  function onLoadedMetadata() {
    if (isDestroyed) {
      return;
    }
    duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    isReady = duration > 0;
  }

  videoEl.addEventListener("loadedmetadata", onLoadedMetadata);
  videoEl.addEventListener("durationchange", onLoadedMetadata);

  try {
    videoEl.pause();
    videoEl.load();
  } catch (error) {
    console.warn("[hero-video] preload failed", error);
  }

  function update(progress) {
    if (isDestroyed) {
      return;
    }

    const p = clamp(progress, 0, 1);
    cues.update(p);

    if (!isReady || duration <= 0) {
      return;
    }

    const targetTime = p * duration;
    if (Math.abs(targetTime - lastTime) < 1 / 60) {
      return;
    }

    const maxTime = Math.max(0, duration - 0.001);
    videoEl.currentTime = clamp(targetTime, 0, maxTime);
    lastTime = videoEl.currentTime;
  }

  function destroy() {
    if (isDestroyed) {
      return;
    }
    isDestroyed = true;
    videoEl.removeEventListener("loadedmetadata", onLoadedMetadata);
    videoEl.removeEventListener("durationchange", onLoadedMetadata);
    cues.destroy();
  }

  return {
    update,
    resize() {},
    destroy,
    get isReady() {
      return isReady;
    },
  };
}
