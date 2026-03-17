const DEBUG_HERO = true;

const HERO_THREE_VERSION = "0.160.0";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/three@${HERO_THREE_VERSION}`;
const ESM_BASE = `https://esm.sh/three@${HERO_THREE_VERSION}`;

const MODULE_SPECS = {
  three: [
    `${CDN_BASE}/build/three.module.js`,
    `${ESM_BASE}`,
    "three",
  ],
  webgpu: [
    `${ESM_BASE}/examples/jsm/renderers/webgpu/WebGPURenderer.js`,
    `${CDN_BASE}/examples/jsm/renderers/webgpu/WebGPURenderer.js`,
    "three/addons/renderers/webgpu/WebGPURenderer.js",
    "three/webgpu",
  ],
  tsl: [
    `${ESM_BASE}/examples/jsm/nodes/Nodes.js`,
    `${CDN_BASE}/examples/jsm/nodes/Nodes.js`,
    "three/addons/nodes/Nodes.js",
    "three/tsl",
  ],
  webgpuCap: [
    `${ESM_BASE}/examples/jsm/capabilities/WebGPU.js`,
    "three/addons/capabilities/WebGPU.js",
    `${CDN_BASE}/examples/jsm/capabilities/WebGPU.js`,
  ],
  gltfLoader: [
    `${ESM_BASE}/examples/jsm/loaders/GLTFLoader.js`,
    "three/addons/loaders/GLTFLoader.js",
    `${CDN_BASE}/examples/jsm/loaders/GLTFLoader.js`,
  ],
  effectComposer: [
    `${ESM_BASE}/examples/jsm/postprocessing/EffectComposer.js`,
    "three/addons/postprocessing/EffectComposer.js",
    `${CDN_BASE}/examples/jsm/postprocessing/EffectComposer.js`,
  ],
  renderPass: [
    `${ESM_BASE}/examples/jsm/postprocessing/RenderPass.js`,
    "three/addons/postprocessing/RenderPass.js",
    `${CDN_BASE}/examples/jsm/postprocessing/RenderPass.js`,
  ],
  unrealBloomPass: [
    `${ESM_BASE}/examples/jsm/postprocessing/UnrealBloomPass.js`,
    "three/addons/postprocessing/UnrealBloomPass.js",
    `${CDN_BASE}/examples/jsm/postprocessing/UnrealBloomPass.js`,
  ],
};

const BACKEND = {
  WEBGPU: "webgpu",
  WEBGL: "webgl",
};

let depsPromise = null;
let selectedBackend = null;

async function importFirst(specifiers) {
  let lastError = null;
  for (const specifier of specifiers) {
    try {
      return await import(/* @vite-ignore */ specifier);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Module import failed");
}

function normalizeModule(mod) {
  return mod?.default || mod;
}

function resolveWebGPURendererCtor(webgpuModule, threeModule) {
  return (
    webgpuModule?.default ||
    webgpuModule?.WebGPURenderer ||
    (typeof webgpuModule === "function" ? webgpuModule : null) ||
    webgpuModule?.default?.WebGPURenderer ||
    threeModule?.WebGPURenderer ||
    null
  );
}

async function webgpuPreflight({ THREE, WEBGPU, rendererCtor }) {
  if (!rendererCtor) {
    throw new Error("WebGPURenderer is unavailable");
  }

  const canvas = document.createElement("canvas");
  let renderer = null;
  let animationFrame = 0;

  try {
    renderer = new rendererCtor({ canvas, alpha: true, antialias: true });

    if (typeof renderer.init === "function") {
      await renderer.init();
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
    camera.position.z = 3;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshNormalMaterial()
    );
    scene.add(mesh);

    renderer.setPixelRatio(1);
    renderer.setSize(2, 2, false);
    renderer.render(scene, camera);

    mesh.geometry.dispose();
    mesh.material.dispose();

    if (typeof renderer.setAnimationLoop === "function") {
      renderer.setAnimationLoop(null);
    }

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    if (typeof renderer.dispose === "function") {
      renderer.dispose();
    }
  } catch (error) {
    if (renderer && typeof renderer.setAnimationLoop === "function") {
      renderer.setAnimationLoop(null);
    }
    if (renderer && typeof renderer.dispose === "function") {
      renderer.dispose();
    }
    throw error;
  }
}

async function loadWebGPUDeps() {
  const threeMod = await importFirst(MODULE_SPECS.three);
  const webgpuMod = await importFirst(MODULE_SPECS.webgpu);
  const tslMod = await importFirst(MODULE_SPECS.tsl);
  const capMod = await importFirst(MODULE_SPECS.webgpuCap);
  const gltfMod = await importFirst(MODULE_SPECS.gltfLoader);

  const THREE = normalizeModule(threeMod);
  const WEBGPU = normalizeModule(webgpuMod);
  const TSL = normalizeModule(tslMod);
  const capModule = normalizeModule(capMod);

  const isAvailable =
    (typeof capModule?.isAvailable === "function" && capModule.isAvailable()) ||
    Boolean(navigator.gpu);

  if (!isAvailable) {
    throw new Error("webgpu-unavailable");
  }

  const rendererCtor = resolveWebGPURendererCtor(webgpuMod, THREE);
  await webgpuPreflight({ THREE, WEBGPU, rendererCtor });

  window.HeroThree = {
    backend: BACKEND.WEBGPU,
    THREE,
    WEBGPU,
    TSL,
    WebGPURenderer: rendererCtor,
    GLTFLoader: gltfMod.GLTFLoader,
  };

  // Keep legacy globals while migrating modules.
  window.THREE = window.THREE || THREE;
  window.GLTFLoader = window.GLTFLoader || gltfMod.GLTFLoader;

  return BACKEND.WEBGPU;
}

async function loadWebGLDeps() {
  const threeMod = await importFirst(MODULE_SPECS.three);
  const gltfMod = await importFirst(MODULE_SPECS.gltfLoader);
  const composerMod = await importFirst(MODULE_SPECS.effectComposer);
  const passMod = await importFirst(MODULE_SPECS.renderPass);
  const bloomMod = await importFirst(MODULE_SPECS.unrealBloomPass);

  const THREE = normalizeModule(threeMod);

  window.HeroThree = {
    backend: BACKEND.WEBGL,
    THREE,
    WebGLRenderer: THREE.WebGLRenderer,
    GLTFLoader: gltfMod.GLTFLoader,
    EffectComposer: composerMod.EffectComposer,
    RenderPass: passMod.RenderPass,
    UnrealBloomPass: bloomMod.UnrealBloomPass,
  };

  window.THREE = window.THREE || THREE;
  window.GLTFLoader = window.GLTFLoader || gltfMod.GLTFLoader;
  window.EffectComposer = window.EffectComposer || composerMod.EffectComposer;
  window.RenderPass = window.RenderPass || passMod.RenderPass;
  window.UnrealBloomPass = window.UnrealBloomPass || bloomMod.UnrealBloomPass;

  return BACKEND.WEBGL;
}

function logDepsState(backend, extra = {}) {
  if (!DEBUG_HERO) {
    return;
  }

  console.groupCollapsed("[Hero] ThreeDeps");
  console.log("[Hero][RenderBackend]", backend);
  console.log("[Hero][ThreeDeps] THREE:", Boolean(window.HeroThree?.THREE));
  console.log("[Hero][ThreeDeps] GLTFLoader:", Boolean(window.HeroThree?.GLTFLoader));
  Object.entries(extra).forEach(([label, value]) => {
    console.log(`[Hero][ThreeDeps] ${label}:`, value);
  });
  console.groupEnd();
}

export function getSelectedHeroRenderBackend() {
  return selectedBackend;
}

export async function ensureHeroThreeDeps(options = {}) {
  const {
    preferredBackend = "auto",
    allowFallback = true,
  } = options;

  if (selectedBackend) {
    return { ready: true, backend: selectedBackend };
  }

  if (depsPromise) {
    return depsPromise;
  }

  depsPromise = (async () => {
    const tryWebGPU = preferredBackend !== BACKEND.WEBGL;

    if (tryWebGPU) {
      try {
        const backend = await loadWebGPUDeps();
        selectedBackend = backend;
        logDepsState(backend, {
          "WebGPU available": true,
        });
        return { ready: true, backend };
      } catch (error) {
        if (DEBUG_HERO) {
          console.warn("[Hero][RenderBackend] webgpu-unavailable", error);
        }

        if (!allowFallback && preferredBackend === BACKEND.WEBGPU) {
          return { ready: false, backend: null, error };
        }
      }
    }

    if (!allowFallback && preferredBackend === BACKEND.WEBGPU) {
      return { ready: false, backend: null };
    }

    try {
      const backend = await loadWebGLDeps();
      selectedBackend = backend;
      logDepsState(backend, {
        "WebGPU available": Boolean(navigator.gpu),
      });
      return { ready: true, backend };
    } catch (error) {
      if (DEBUG_HERO) {
        console.error("[Hero][ThreeDeps] Failed to load WebGL dependencies", error);
      }
      return { ready: false, backend: null, error };
    }
  })();

  const result = await depsPromise;

  if (!result?.ready) {
    depsPromise = null;
  }

  return result;
}
