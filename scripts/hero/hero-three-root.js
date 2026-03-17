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

function resolveRendererConfig() {
  const heroThree = window.HeroThree || {};
  const THREE = heroThree.THREE || window.THREE;
  const backend = heroThree.backend || "webgl";

  if (!THREE) {
    return null;
  }

  if (backend === "webgpu") {
    const RendererCtor =
      heroThree.WebGPURenderer ||
      heroThree.WEBGPU?.WebGPURenderer ||
      heroThree.THREE?.WebGPURenderer ||
      null;

    return {
      backend,
      THREE,
      RendererCtor,
      asyncInit: true,
    };
  }

  return {
    backend: "webgl",
    THREE,
    RendererCtor: heroThree.WebGLRenderer || THREE.WebGLRenderer,
    asyncInit: false,
  };
}

export function initHeroThreeRoot({ mountEl } = {}) {
  const config = resolveRendererConfig();

  if (DEBUG_HERO) {
    console.groupCollapsed("[Hero] ThreeRoot Init");
    console.log("[Hero][ThreeRoot] backend:", config?.backend || "missing");
    console.log("[Hero][ThreeRoot] THREE available:", Boolean(config?.THREE));
    console.log("[Hero][ThreeRoot] mount element:", mountEl || null);
    console.groupEnd();
  }

  if (!config?.THREE || !mountEl || !config.RendererCtor) {
    if (DEBUG_HERO) {
      console.error("[Hero][ThreeRoot] renderer setup unavailable — aborting init");
    }
    return {
      isReady: false,
      setActiveScene() {},
      resize() {},
      render() {},
      destroy() {},
    };
  }

  const THREE = config.THREE;

  let isDestroyed = false;
  let isReady = false;
  let activeScene = null;
  let rafId = 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
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
  const initialDpr = getSafePixelRatio(
    initialWidth,
    initialHeight,
    window.devicePixelRatio || 1
  );

  const renderer = new config.RendererCtor({ alpha: true, antialias: true });
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
    renderer.render(scene, camera);
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

  async function initializeRenderer() {
    try {
      if (typeof renderer.init === "function") {
        await renderer.init();
      }

      if (isDestroyed) {
        return;
      }

      attachCanvas();
      isReady = true;
      ensureLoop();
    } catch (error) {
      if (DEBUG_HERO) {
        console.error("[Hero][ThreeRoot] renderer init failed", error);
      }
    }
  }

  void initializeRenderer();

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
    backend: config.backend,
    THREE,
    scene,
    camera,
    renderer,
    setActiveScene,
    resize,
    render,
    destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;

      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }

      if (typeof renderer.setAnimationLoop === "function") {
        renderer.setAnimationLoop(null);
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
