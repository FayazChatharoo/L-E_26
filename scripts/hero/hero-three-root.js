import { clamp } from "../utils.js";

const DEBUG_HERO = true;
const MAX_RENDER_DIMENSION = 8192;

function getSafePixelRatio(width, height, requestedDpr) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const dprLimitByWidth = MAX_RENDER_DIMENSION / safeWidth;
  const dprLimitByHeight = MAX_RENDER_DIMENSION / safeHeight;
  const dprLimit = Math.min(dprLimitByWidth, dprLimitByHeight);
  return Math.max(0.5, Math.min(requestedDpr, dprLimit, 2));
}

export function initHeroThreeRoot({ mountEl } = {}) {
  const heroThree = window.HeroThree || {};
  const THREE = heroThree.THREE || window.THREE;
  const RendererCtor = heroThree.WebGLRenderer || THREE?.WebGLRenderer;

  if (DEBUG_HERO) {
    console.groupCollapsed("[Hero] ThreeRoot Init");
    console.log("[Hero][ThreeRoot] backend:", "webgl");
    console.log("[Hero][ThreeRoot] THREE available:", Boolean(THREE));
    console.log("[Hero][ThreeRoot] mount element:", mountEl || null);
    console.groupEnd();
  }

  if (!THREE || !mountEl || !RendererCtor) {
    if (DEBUG_HERO) {
      console.error("[Hero][ThreeRoot] renderer setup unavailable — aborting init");
    }
    return {
      isReady: false,
      setActiveScene() {},
      resize() {},
      render() {},
      setPostFXPreset() {},
      clearPostFXPreset() {},
      destroy() {},
    };
  }

  let isDestroyed = false;
  let isReady = false;
  let activeScene = null;
  let rafId = 0;
  let hasRenderError = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  const initialWidth = Math.max(
    1,
    Math.min(mountEl.clientWidth || window.innerWidth || 1, window.innerWidth || 1)
  );
  const initialHeight = Math.max(
    1,
    Math.min(mountEl.clientHeight || window.innerHeight || 1, window.innerHeight || 1)
  );
  const initialDpr = getSafePixelRatio(initialWidth, initialHeight, window.devicePixelRatio || 1);

  const renderer = new RendererCtor({ alpha: true, antialias: true });
  renderer.setPixelRatio(initialDpr);
  renderer.setSize(initialWidth, initialHeight);

  function attachCanvas() {
    if (renderer.domElement && !mountEl.contains(renderer.domElement)) {
      mountEl.appendChild(renderer.domElement);
      if (DEBUG_HERO) {
        console.log("[Hero][ThreeRoot] canvas injected:", renderer.domElement);
      }
    }

    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.pointerEvents = "none";
  }

  function render() {
    if (isDestroyed || !isReady) {
      return;
    }

    try {
      if (activeScene && typeof activeScene.render === "function") {
        const handled = activeScene.render({ renderer, scene, camera });
        if (handled) {
          hasRenderError = false;
          return;
        }
      }

      renderer.render(scene, camera);
      hasRenderError = false;
    } catch (error) {
      if (!hasRenderError && DEBUG_HERO) {
        console.error("[Hero][ThreeRoot] render failed", error);
      }
      hasRenderError = true;
      if (activeScene && typeof activeScene.onRenderError === "function") {
        activeScene.onRenderError(error);
      }
    }
  }

  function tick() {
    if (isDestroyed) {
      return;
    }

    if (activeScene && typeof activeScene.tick === "function") {
      activeScene.tick();
    }

    render();
    rafId = window.requestAnimationFrame(tick);
  }

  function ensureLoop() {
    if (rafId || isDestroyed || !isReady) {
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  }

  attachCanvas();
  isReady = true;
  ensureLoop();

  function setActiveScene(nextScene) {
    if (activeScene === nextScene) {
      return;
    }

    if (activeScene && typeof activeScene.hide === "function") {
      activeScene.hide();
    }

    activeScene = nextScene || null;

    if (activeScene && typeof activeScene.show === "function") {
      activeScene.show();
    }
  }

  function resize(width, height, dpr = window.devicePixelRatio || 1) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
    const safeDpr = getSafePixelRatio(safeWidth, safeHeight, clamp(dpr, 1, 2));
    renderer.setPixelRatio(safeDpr);
    renderer.setSize(safeWidth, safeHeight, false);
    render();
  }

  return {
    get isReady() {
      return isReady;
    },
    backend: "webgl",
    THREE,
    scene,
    camera,
    renderer,
    setActiveScene,
    resize,
    render,
    setPostFXPreset() {},
    clearPostFXPreset() {},
    destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;

      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }

      if (typeof renderer.dispose === "function") {
        renderer.dispose();
      }
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
