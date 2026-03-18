const DEBUG_HERO = true;

const HERO_THREE_VERSION = "0.171.0";
const ESM_BASE = `https://esm.sh/three@${HERO_THREE_VERSION}`;

let depsPromise = null;
let selectedBackend = null;
let moduleSpecsPromise = null;

function getModuleSpecs(useBareSpecifiers) {
  if (useBareSpecifiers) {
    return {
      three: ["three"],
      gltfLoader: ["three/addons/loaders/GLTFLoader.js"],
      effectComposer: ["three/addons/postprocessing/EffectComposer.js"],
      renderPass: ["three/addons/postprocessing/RenderPass.js"],
      unrealBloomPass: ["three/addons/postprocessing/UnrealBloomPass.js"],
      gui: ["lil-gui", "https://esm.sh/lil-gui@0.19.2"],
    };
  }

  return {
    three: [`${ESM_BASE}`],
    gltfLoader: [`${ESM_BASE}/examples/jsm/loaders/GLTFLoader.js`],
    effectComposer: [`${ESM_BASE}/examples/jsm/postprocessing/EffectComposer.js`],
    renderPass: [`${ESM_BASE}/examples/jsm/postprocessing/RenderPass.js`],
    unrealBloomPass: [`${ESM_BASE}/examples/jsm/postprocessing/UnrealBloomPass.js`],
    gui: ["https://esm.sh/lil-gui@0.19.2"],
  };
}

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
        console.log("[Hero][ThreeDeps] import map for bare 'three' not available, using esm.sh modules");
      }
      return getModuleSpecs(false);
    }
  })();

  return moduleSpecsPromise;
}

function normalizeModule(mod) {
  return mod?.default || mod;
}

function logDepsState() {
  if (!DEBUG_HERO) {
    return;
  }

  console.groupCollapsed("[Hero] ThreeDeps");
  console.log("[Hero][RenderBackend]", "webgl");
  console.log("[Hero][ThreeDeps] THREE:", Boolean(window.HeroThree?.THREE));
  console.log("[Hero][ThreeDeps] GLTFLoader:", Boolean(window.HeroThree?.GLTFLoader));
  console.log("[Hero][ThreeDeps] EffectComposer:", Boolean(window.HeroThree?.EffectComposer));
  console.log("[Hero][ThreeDeps] GUI:", Boolean(window.HeroThree?.GUI));
  console.groupEnd();
}

async function loadWebGLDeps() {
  const specs = await resolveModuleSpecs();
  const threeMod = await importFirst(specs.three);
  const gltfMod = await importFirst(specs.gltfLoader);
  const composerMod = await importFirst(specs.effectComposer);
  const passMod = await importFirst(specs.renderPass);
  const bloomMod = await importFirst(specs.unrealBloomPass);
  const guiMod = await importFirst(specs.gui);

  const THREE = normalizeModule(threeMod);
  const GUI = guiMod.GUI || guiMod.default || null;

  window.HeroThree = {
    backend: "webgl",
    THREE,
    WebGLRenderer: THREE.WebGLRenderer,
    GLTFLoader: gltfMod.GLTFLoader,
    EffectComposer: composerMod.EffectComposer,
    RenderPass: passMod.RenderPass,
    UnrealBloomPass: bloomMod.UnrealBloomPass,
    GUI,
  };

  window.THREE = window.THREE || THREE;
  window.GLTFLoader = window.GLTFLoader || gltfMod.GLTFLoader;
  window.EffectComposer = window.EffectComposer || composerMod.EffectComposer;
  window.RenderPass = window.RenderPass || passMod.RenderPass;
  window.UnrealBloomPass = window.UnrealBloomPass || bloomMod.UnrealBloomPass;

  return "webgl";
}

export function getSelectedHeroRenderBackend() {
  return selectedBackend;
}

export async function ensureHeroThreeDeps() {
  if (selectedBackend) {
    return { ready: true, backend: selectedBackend };
  }

  if (depsPromise) {
    return depsPromise;
  }

  depsPromise = (async () => {
    try {
      const backend = await loadWebGLDeps();
      selectedBackend = backend;
      logDepsState();
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
