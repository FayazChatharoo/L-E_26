const DEBUG_HERO = true;

const HERO_THREE_VERSION = "0.160.0";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/three@${HERO_THREE_VERSION}`;
const ESM_BASE = `https://esm.sh/three@${HERO_THREE_VERSION}`;

function getModuleSpecs(useBareSpecifiers) {
  if (useBareSpecifiers) {
    return {
      three: ["three"],
      webgpu: [
        "three/webgpu",
        "three/addons/renderers/webgpu/WebGPURenderer.js",
      ],
      tsl: [
        "three/tsl",
        "three/addons/nodes/Nodes.js",
      ],
      webgpuCap: ["three/addons/capabilities/WebGPU.js"],
      gltfLoader: ["three/addons/loaders/GLTFLoader.js"],
      effectComposer: ["three/addons/postprocessing/EffectComposer.js"],
      renderPass: ["three/addons/postprocessing/RenderPass.js"],
      unrealBloomPass: ["three/addons/postprocessing/UnrealBloomPass.js"],
    };
  }

  return {
    three: [`${ESM_BASE}`],
    webgpu: [`${ESM_BASE}/examples/jsm/renderers/webgpu/WebGPURenderer.js`],
    tsl: [`${ESM_BASE}/examples/jsm/nodes/Nodes.js`],
    webgpuCap: [`${ESM_BASE}/examples/jsm/capabilities/WebGPU.js`],
    gltfLoader: [`${ESM_BASE}/examples/jsm/loaders/GLTFLoader.js`],
    effectComposer: [`${ESM_BASE}/examples/jsm/postprocessing/EffectComposer.js`],
    renderPass: [`${ESM_BASE}/examples/jsm/postprocessing/RenderPass.js`],
    unrealBloomPass: [`${ESM_BASE}/examples/jsm/postprocessing/UnrealBloomPass.js`],
  };
}

const BACKEND = {
  WEBGPU: "webgpu",
  WEBGL: "webgl",
};

let depsPromise = null;
let selectedBackend = null;
let moduleSpecsPromise = null;

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

async function resolveModuleSpecs() {
  if (moduleSpecsPromise) {
    return moduleSpecsPromise;
  }

  moduleSpecsPromise = (async () => {
    try {
      await import(/* @vite-ignore */ "three");
      return getModuleSpecs(true);
    } catch (error) {
      if (DEBUG_HERO) {
        console.warn("[Hero][ThreeDeps] import map for bare 'three' not available, using esm.sh modules");
      }
      return getModuleSpecs(false);
    }
  })();

  return moduleSpecsPromise;
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
  function safeDisposeRenderer() {
    try {
      if (renderer && typeof renderer.setAnimationLoop === "function") {
        renderer.setAnimationLoop(null);
      }
      if (renderer && typeof renderer.dispose === "function") {
        renderer.dispose();
      }
    } catch (disposeError) {
      if (DEBUG_HERO) {
        console.warn("[Hero][ThreeDeps] renderer dispose warning during preflight", disposeError);
      }
    }
  }

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

    safeDisposeRenderer();
  } catch (error) {
    safeDisposeRenderer();
    throw error;
  }
}

async function loadWebGPUDeps() {
  const specs = await resolveModuleSpecs();
  const threeMod = await importFirst(specs.three);
  const webgpuMod = await importFirst(specs.webgpu);
  const tslMod = await importFirst(specs.tsl);
  const capMod = await importFirst(specs.webgpuCap);
  const gltfMod = await importFirst(specs.gltfLoader);

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
  const specs = await resolveModuleSpecs();
  const threeMod = await importFirst(specs.three);
  const gltfMod = await importFirst(specs.gltfLoader);
  const composerMod = await importFirst(specs.effectComposer);
  const passMod = await importFirst(specs.renderPass);
  const bloomMod = await importFirst(specs.unrealBloomPass);

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
