const DEBUG_HERO = true;

const HERO_THREE_URLS = {
  three: "https://esm.sh/three@0.160.0",
  gltfLoader: "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
  effectComposer:
    "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js",
  renderPass:
    "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js",
  unrealBloomPass:
    "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js",
};

let depsPromise = null;

async function importModule(url) {
  return import(/* @vite-ignore */ url);
}

export async function ensureHeroThreeDeps() {
  if (window.THREE && window.EffectComposer && window.RenderPass && window.UnrealBloomPass) {
    return true;
  }

  if (depsPromise) {
    return depsPromise;
  }

  depsPromise = (async () => {
    try {
      const threeMod = await importModule(HERO_THREE_URLS.three);
      const gltfMod = await importModule(HERO_THREE_URLS.gltfLoader);
      const composerMod = await importModule(HERO_THREE_URLS.effectComposer);
      const passMod = await importModule(HERO_THREE_URLS.renderPass);
      const bloomMod = await importModule(HERO_THREE_URLS.unrealBloomPass);

      window.THREE = window.THREE || threeMod.default || threeMod;
      window.GLTFLoader = window.GLTFLoader || gltfMod.GLTFLoader;
      window.EffectComposer = window.EffectComposer || composerMod.EffectComposer;
      window.RenderPass = window.RenderPass || passMod.RenderPass;
      window.UnrealBloomPass = window.UnrealBloomPass || bloomMod.UnrealBloomPass;

      if (DEBUG_HERO) {
        console.groupCollapsed("[Hero] ThreeDeps");
        console.log("[Hero][ThreeDeps] THREE:", Boolean(window.THREE));
        console.log("[Hero][ThreeDeps] GLTFLoader:", Boolean(window.GLTFLoader));
        console.log("[Hero][ThreeDeps] EffectComposer:", Boolean(window.EffectComposer));
        console.log("[Hero][ThreeDeps] RenderPass:", Boolean(window.RenderPass));
        console.log("[Hero][ThreeDeps] UnrealBloomPass:", Boolean(window.UnrealBloomPass));
        console.groupEnd();
      }

      return true;
    } catch (error) {
      if (DEBUG_HERO) {
        console.error("[Hero][ThreeDeps] Failed to load Three.js dependencies", error);
      }
      return false;
    }
  })();

  return depsPromise;
}
