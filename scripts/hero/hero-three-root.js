import { clamp } from "../utils.js";

const DEBUG_HERO = true;

export function initHeroThreeRoot({ mountEl } = {}) {
  const THREE = window.THREE;
  if (DEBUG_HERO) {
    console.groupCollapsed("[Hero] ThreeRoot Init");
    console.log("[Hero][ThreeRoot] THREE available:", Boolean(THREE));
    console.log("[Hero][ThreeRoot] mount element:", mountEl || null);
    console.groupEnd();
  }

  if (!THREE) {
    if (DEBUG_HERO) {
      console.error("[Hero][ThreeRoot] THREE is undefined — aborting init");
    }
    return {
      isReady: false,
      setActiveScene() {},
      resize() {},
      render() {},
      destroy() {},
    };
  }

  if (!THREE || !mountEl) {
    return {
      isReady: false,
      setActiveScene() {},
      resize() {},
      render() {},
      destroy() {},
    };
  }

  let isDestroyed = false;
  let activeScene = null;
  let rafId = 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Math.max(1, mountEl.clientWidth || 1), Math.max(1, mountEl.clientHeight || 1));

  if (!mountEl.contains(renderer.domElement)) {
    mountEl.appendChild(renderer.domElement);
    if (DEBUG_HERO) {
      console.log("[Hero][ThreeRoot] canvas injected:", renderer.domElement);
    }
  }

  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.pointerEvents = "none";

  function render() {
    if (isDestroyed) {
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
    if (rafId) {
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  }

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
    renderer.setPixelRatio(Math.min(clamp(dpr, 1, 2), 2));
    renderer.setSize(safeWidth, safeHeight, false);
    render();
  }

  ensureLoop();

  return {
    isReady: true,
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

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
