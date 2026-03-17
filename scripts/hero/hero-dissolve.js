import { clamp, createCueController } from "../utils.js";

// Dissolve stage visual settings.
const DISSOLVE_CONFIG = {
  modelUrl: "https://lionelephant2026.netlify.app/scripts/ASSETS/dissolve.glb",
  fallbackModelUrl: "/scripts/ASSETS/dissolve.glb",
  camera: {
    fov: 40,
    near: 0.1,
    far: 100,
    position: [0, 0.1, 4.0],
  },
  model: {
    rotationY: 0.0,
    scale: 1.7,
  },
  bloomStrength: 1.25,
  bloomRadius: 0.45,
  bloomThreshold: 0.1,
  edge: 0.08,
  frequency: 4.8,
  noiseOffset: 0.0,
  particleColor: "#ff9d29",
  particleSize: 1.4,
  particleSpeed: 1.6,
  decayFrequency: 3.4,
};

const THREE_CDN = {
  three: "https://esm.sh/three@0.160.0",
  gltfLoader: "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
  effectComposer:
    "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js",
  renderPass:
    "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js",
  unrealBloomPass:
    "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js",
};

const moduleLoadCache = new Map();

function importModuleOnce(url) {
  if (moduleLoadCache.has(url)) {
    return moduleLoadCache.get(url);
  }

  const promise = import(/* @vite-ignore */ url).catch((error) => {
    throw new Error(`[hero-dissolve] Failed to import module: ${url}\n${error}`);
  });
  moduleLoadCache.set(url, promise);
  return promise;
}

async function ensureThreeDependencies() {
  const threeModule = window.THREE
    ? { default: window.THREE }
    : await importModuleOnce(THREE_CDN.three);
  const gltfModule = await importModuleOnce(THREE_CDN.gltfLoader);
  const effectComposerModule = await importModuleOnce(THREE_CDN.effectComposer);
  const renderPassModule = await importModuleOnce(THREE_CDN.renderPass);
  const unrealBloomModule = await importModuleOnce(THREE_CDN.unrealBloomPass);

  window.THREE = window.THREE || threeModule.default || threeModule;
  window.GLTFLoader = window.GLTFLoader || gltfModule.GLTFLoader;
  window.EffectComposer = window.EffectComposer || effectComposerModule.EffectComposer;
  window.RenderPass = window.RenderPass || renderPassModule.RenderPass;
  window.UnrealBloomPass = window.UnrealBloomPass || unrealBloomModule.UnrealBloomPass;

  // Normalize globals for easier access across different script styles.
  window.GLTFLoader = window.GLTFLoader || window.THREE?.GLTFLoader;
  window.EffectComposer = window.EffectComposer || window.THREE?.EffectComposer;
  window.RenderPass = window.RenderPass || window.THREE?.RenderPass;
  window.UnrealBloomPass = window.UnrealBloomPass || window.THREE?.UnrealBloomPass;

  const missing = [];
  if (!window.THREE) missing.push("THREE");
  if (!window.GLTFLoader) missing.push("GLTFLoader");

  if (missing.length) {
    throw new Error(`[hero-dissolve] Missing Three dependencies: ${missing.join(", ")}`);
  }
}

function createDissolveMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uProgress: { value: 0 },
      uEdge: { value: DISSOLVE_CONFIG.edge },
      uFrequency: { value: DISSOLVE_CONFIG.frequency },
      uNoiseOffset: { value: DISSOLVE_CONFIG.noiseOffset },
      uParticleColor: { value: new THREE.Color(DISSOLVE_CONFIG.particleColor) },
      uParticleSize: { value: DISSOLVE_CONFIG.particleSize },
      uParticleSpeed: { value: DISSOLVE_CONFIG.particleSpeed },
      uDecayFrequency: { value: DISSOLVE_CONFIG.decayFrequency },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform float uEdge;
      uniform float uFrequency;
      uniform float uNoiseOffset;
      uniform vec3 uParticleColor;
      uniform float uParticleSize;
      uniform float uParticleSpeed;
      uniform float uDecayFrequency;
      uniform float uTime;

      varying vec3 vWorldPos;
      varying vec3 vNormal;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      float noise3d(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);

        float n000 = hash(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash(i + vec3(1.0, 1.0, 1.0));

        vec3 u = f * f * (3.0 - 2.0 * f);

        float nx00 = mix(n000, n100, u.x);
        float nx10 = mix(n010, n110, u.x);
        float nx01 = mix(n001, n101, u.x);
        float nx11 = mix(n011, n111, u.x);

        float nxy0 = mix(nx00, nx10, u.y);
        float nxy1 = mix(nx01, nx11, u.y);

        return mix(nxy0, nxy1, u.z);
      }

      void main() {
        vec3 samplePos = vWorldPos * uFrequency + vec3(uNoiseOffset, uNoiseOffset * 0.5, 0.0);
        float n1 = noise3d(samplePos);
        float n2 = noise3d(samplePos * 2.1 + vec3(6.7, 2.9, 1.1)) * 0.5;
        float n3 = noise3d(samplePos * 4.0 + vec3(1.3, 9.1, 5.7)) * 0.25;

        // Fractal-style breakup with directional bias for clearer dissolve direction.
        float pattern = (n1 + n2 + n3) / 1.75;
        float directional = clamp((vWorldPos.y * 0.35) + 0.5, 0.0, 1.0);
        pattern = mix(pattern, directional, 0.22);

        // Inverted behavior:
        // progress 0 => invisible
        // progress 1 => fully visible
        float reveal = smoothstep(pattern - uEdge, pattern + uEdge, uProgress);

        // Strong, visible edge band.
        float edgeBand = 1.0 - smoothstep(0.0, uEdge * 1.35, abs(pattern - uProgress));
        float flicker = sin((uTime * uParticleSpeed + pattern * 8.0) * 6.283185 * uDecayFrequency) * 0.5 + 0.5;
        float particleEdge = edgeBand * flicker * uParticleSize;

        float light = dot(normalize(vNormal), normalize(vec3(0.2, 0.9, 0.5))) * 0.4 + 0.6;
        vec3 baseColor = vec3(1.0) * light;
        vec3 edgeColor = uParticleColor * particleEdge;

        float alpha = reveal;
        if (alpha < 0.01) {
          discard;
        }

        gl_FragColor = vec4(baseColor + edgeColor, alpha);
      }
    `,
  });
}

function applyMaterialToModel(root, material) {
  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    if (child.material && typeof child.material.dispose === "function") {
      child.material.dispose();
    }

    child.material = material;
    child.castShadow = false;
    child.receiveShadow = false;
  });
}

function fitModelToFrame(THREE, modelRoot) {
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) {
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = DISSOLVE_CONFIG.model.scale / maxAxis;

  modelRoot.position.sub(center);
  modelRoot.scale.setScalar(scale);
  modelRoot.rotation.y = DISSOLVE_CONFIG.model.rotationY;
}

function createFallbackMesh(THREE, scene, material) {
  const geometry = new THREE.IcosahedronGeometry(1.0, 5);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

function createDebugPanel(state, onChange) {
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "16px";
  panel.style.width = "260px";
  panel.style.maxHeight = "50vh";
  panel.style.overflow = "auto";
  panel.style.padding = "10px";
  panel.style.background = "rgba(8,8,12,0.85)";
  panel.style.color = "#fff";
  panel.style.fontFamily = "monospace";
  panel.style.fontSize = "12px";
  panel.style.border = "1px solid rgba(255,255,255,0.2)";
  panel.style.borderRadius = "8px";
  panel.style.zIndex = "9999";
  panel.style.pointerEvents = "auto";
  panel.setAttribute("data-hero-dissolve-debug", "true");

  const title = document.createElement("div");
  title.textContent = "Dissolve Debug";
  title.style.marginBottom = "8px";
  title.style.fontWeight = "bold";
  panel.appendChild(title);

  const controls = [
    { key: "overrideProgress", label: "override progress", type: "checkbox" },
    { key: "progress", label: "uProgress", min: 0, max: 1, step: 0.001 },
    { key: "edge", label: "edge", min: 0.01, max: 0.25, step: 0.001 },
    { key: "frequency", label: "frequency", min: 0.5, max: 12, step: 0.01 },
    { key: "particleSize", label: "particleSize", min: 0, max: 3, step: 0.01 },
    { key: "particleSpeed", label: "particleSpeed", min: 0, max: 5, step: 0.01 },
    { key: "decayFrequency", label: "decayFrequency", min: 0, max: 8, step: 0.01 },
    { key: "bloomStrength", label: "bloomStrength", min: 0, max: 3, step: 0.01 },
    { key: "bloomRadius", label: "bloomRadius", min: 0, max: 1, step: 0.01 },
    { key: "bloomThreshold", label: "bloomThreshold", min: 0, max: 1, step: 0.01 },
  ];

  controls.forEach((control) => {
    const row = document.createElement("label");
    row.style.display = "block";
    row.style.marginBottom = "6px";

    const text = document.createElement("div");
    text.textContent = control.label;
    text.style.marginBottom = "2px";
    row.appendChild(text);

    if (control.type === "checkbox") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(state[control.key]);
      input.addEventListener("input", () => {
        state[control.key] = input.checked;
        onChange(control.key, state[control.key]);
      });
      row.appendChild(input);
    } else {
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      input.value = String(state[control.key]);
      input.style.width = "100%";

      const value = document.createElement("div");
      value.textContent = Number(state[control.key]).toFixed(3);

      input.addEventListener("input", () => {
        state[control.key] = Number(input.value);
        value.textContent = Number(state[control.key]).toFixed(3);
        onChange(control.key, state[control.key]);
      });

      row.appendChild(input);
      row.appendChild(value);
    }

    panel.appendChild(row);
  });

  document.body.appendChild(panel);
  return panel;
}

export function initHeroDissolve({
  canvasContainer,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  let isDestroyed = false;
  let initialized = false;
  let initStarted = false;

  let renderer = null;
  let scene = null;
  let camera = null;
  let composer = null;
  let bloomPass = null;
  let material = null;
  let modelRoot = null;
  let fallbackMesh = null;
  let rafId = 0;
  let needsRender = false;
  let debugPanel = null;

  const debugState = {
    overrideProgress: false,
    progress: 0,
    edge: DISSOLVE_CONFIG.edge,
    frequency: DISSOLVE_CONFIG.frequency,
    particleSize: DISSOLVE_CONFIG.particleSize,
    particleSpeed: DISSOLVE_CONFIG.particleSpeed,
    decayFrequency: DISSOLVE_CONFIG.decayFrequency,
    bloomStrength: DISSOLVE_CONFIG.bloomStrength,
    bloomRadius: DISSOLVE_CONFIG.bloomRadius,
    bloomThreshold: DISSOLVE_CONFIG.bloomThreshold,
  };

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "dissolve",
  });

  function requestRender() {
    needsRender = true;
  }

  function render() {
    if (!renderer || !scene || !camera) {
      return;
    }

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  function startLoop() {
    if (rafId) {
      return;
    }

    const tick = () => {
      if (isDestroyed) {
        return;
      }
      if (needsRender) {
        needsRender = false;
        render();
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function setupPostProcessing(THREE) {
    if (!window.EffectComposer || !window.RenderPass || !window.UnrealBloomPass) {
      return;
    }

    composer = new window.EffectComposer(renderer);
    const renderPass = new window.RenderPass(scene, camera);
    bloomPass = new window.UnrealBloomPass(
      new THREE.Vector2(1, 1),
      debugState.bloomStrength,
      debugState.bloomRadius,
      debugState.bloomThreshold
    );

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
  }

  function applyDebugUniforms() {
    if (!material) {
      return;
    }

    material.uniforms.uEdge.value = debugState.edge;
    material.uniforms.uFrequency.value = debugState.frequency;
    material.uniforms.uParticleSize.value = debugState.particleSize;
    material.uniforms.uParticleSpeed.value = debugState.particleSpeed;
    material.uniforms.uDecayFrequency.value = debugState.decayFrequency;

    if (bloomPass) {
      bloomPass.strength = debugState.bloomStrength;
      bloomPass.radius = debugState.bloomRadius;
      bloomPass.threshold = debugState.bloomThreshold;
    }
  }

  function mountDebugPanel() {
    if (document.querySelector('[data-hero-dissolve-debug="true"]')) {
      return;
    }

    debugPanel = createDebugPanel(debugState, () => {
      applyDebugUniforms();
      requestRender();
    });
  }

  function loadModel(THREE) {
    const modelUrlFromDom = canvasContainer?.dataset?.modelUrl || "";
    const candidates = [modelUrlFromDom, DISSOLVE_CONFIG.modelUrl, DISSOLVE_CONFIG.fallbackModelUrl]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);

    const loader = new window.GLTFLoader();

    const tryLoadAtIndex = (index) => {
      if (index >= candidates.length) {
        console.error("[hero-dissolve] All model URL attempts failed. Using fallback mesh.");
        fallbackMesh = createFallbackMesh(THREE, scene, material);
        requestRender();
        return;
      }

      const modelUrl = candidates[index];
      console.log(`[hero-dissolve] loading model from: ${modelUrl}`);

      loader.load(
        modelUrl,
        (gltf) => {
          if (isDestroyed || !scene) {
            return;
          }

          console.log(`[hero-dissolve] model loaded successfully from: ${modelUrl}`);
          modelRoot = gltf.scene;
          fitModelToFrame(THREE, modelRoot);
          applyMaterialToModel(modelRoot, material);
          scene.add(modelRoot);
          requestRender();
        },
        undefined,
        (error) => {
          console.error(`[hero-dissolve] model load failed for: ${modelUrl}`, error);
          tryLoadAtIndex(index + 1);
        }
      );
    };

    tryLoadAtIndex(0);
  }

  async function init() {
    if (initStarted || isDestroyed) {
      return;
    }
    initStarted = true;

    try {
      await ensureThreeDependencies();
    } catch (error) {
      console.error(error);
      return;
    }

    if (isDestroyed || !canvasContainer || !window.THREE) {
      return;
    }

    const THREE = window.THREE;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      DISSOLVE_CONFIG.camera.fov,
      1,
      DISSOLVE_CONFIG.camera.near,
      DISSOLVE_CONFIG.camera.far
    );
    camera.position.set(
      DISSOLVE_CONFIG.camera.position[0],
      DISSOLVE_CONFIG.camera.position[1],
      DISSOLVE_CONFIG.camera.position[2]
    );

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvasContainer.clientWidth || 1, canvasContainer.clientHeight || 1);

    if (THREE.SRGBColorSpace && "outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    if (!canvasContainer.contains(renderer.domElement)) {
      canvasContainer.appendChild(renderer.domElement);
    }

    material = createDissolveMaterial(THREE);
    applyDebugUniforms();

    setupPostProcessing(THREE);
    mountDebugPanel();
    loadModel(THREE);

    initialized = true;
    requestRender();
    startLoop();
  }

  function update(progress) {
    if (isDestroyed) {
      return;
    }

    const p = clamp(progress, 0, 1);
    console.log("dissolve progress", p);
    cues.update(p);

    if (!initialized || !material) {
      return;
    }

    debugState.progress = p;
    const effectiveProgress = debugState.overrideProgress ? debugState.progress : p;

    material.uniforms.uProgress.value = effectiveProgress;
    material.uniforms.uTime.value = effectiveProgress;

    if (modelRoot) {
      modelRoot.rotation.y = DISSOLVE_CONFIG.model.rotationY + effectiveProgress * 0.2;
    }

    if (fallbackMesh) {
      fallbackMesh.rotation.y = effectiveProgress * Math.PI * 0.8;
      fallbackMesh.rotation.x = effectiveProgress * 0.2;
    }

    requestRender();
  }

  function resize(width, height, dpr = window.devicePixelRatio || 1) {
    if (!initialized || !renderer || !camera) {
      return;
    }

    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);

    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.setSize(safeWidth, safeHeight, false);

    if (composer) {
      composer.setSize(safeWidth, safeHeight);
      if (bloomPass && bloomPass.setSize) {
        bloomPass.setSize(safeWidth, safeHeight);
      }
    }

    requestRender();
  }

  function destroy() {
    if (isDestroyed) {
      return;
    }
    isDestroyed = true;

    cues.destroy();

    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    if (fallbackMesh) {
      fallbackMesh.geometry.dispose();
      fallbackMesh = null;
    }

    if (modelRoot) {
      modelRoot.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.geometry.dispose();
        }
      });
      scene?.remove(modelRoot);
      modelRoot = null;
    }

    if (material) {
      material.dispose();
      material = null;
    }

    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer = null;
    }

    if (debugPanel && debugPanel.parentNode) {
      debugPanel.parentNode.removeChild(debugPanel);
      debugPanel = null;
    }

    scene = null;
    camera = null;
    composer = null;
    bloomPass = null;
  }

  return {
    init,
    update,
    resize,
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
