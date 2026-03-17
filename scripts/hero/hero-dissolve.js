import { clamp, createCueController } from "../utils.js";

// Dissolve stage visual settings.
const DISSOLVE_CONFIG = {
  modelUrl: "/ASSETS/dissolve.glb",
  fallbackModelUrl: "/scripts/ASSETS/dissolve.glb",
  camera: {
    fov: 40,
    near: 0.1,
    far: 100,
  },
  framing: {
    distanceMultiplier: 1.25,
    yOffset: 0.08,
  },
  bloomStrength: 0.9,
  bloomRadius: 0.32,
  bloomThreshold: 0.22,
  edge: 0.055,
  frequency: 3.6,
  noiseOffset: 0.0,
  particleColor: "#ff9d29",
  particleSize: 1.15,
  particleSpeed: 1.8,
  decayFrequency: 3.2,
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
        vec3 p = vWorldPos * uFrequency + vec3(uNoiseOffset, uNoiseOffset * 0.5, 0.0);

        float nA = noise3d(p);
        float nB = noise3d(p * 2.0 + vec3(2.3, 7.9, 1.4)) * 0.5;
        float nC = noise3d(p * 4.0 + vec3(8.4, 1.2, 5.8)) * 0.25;
        float pattern = (nA + nB + nC) / 1.75;

        // Clear dissolve direction from bottom to top.
        float directional = clamp(vWorldPos.y * 0.4 + 0.5, 0.0, 1.0);
        pattern = mix(pattern, directional, 0.28);

        // Inverted behavior: 0 hidden, 1 revealed.
        float reveal = smoothstep(pattern - uEdge, pattern + uEdge, uProgress);

        // Strong and clean edge around dissolve frontier.
        float frontier = abs(pattern - uProgress);
        float edgeBand = 1.0 - smoothstep(0.0, uEdge * 0.9, frontier);
        float edgeGlow = smoothstep(0.0, uEdge * 1.8, uEdge * 1.8 - frontier);

        // Particle motion that appears to detach and fly away from the surface.
        vec3 moveDir = normalize(vNormal + vec3(0.2, 0.55, 0.1));
        vec3 particlePos = p + moveDir * (uTime * uParticleSpeed * 0.95);
        float particleNoise = noise3d(particlePos * 6.0 + vec3(3.1, 1.2, 5.4));
        float particleMask = smoothstep(0.70, 0.98, particleNoise) * edgeBand;
        float decay = exp(-frontier * (8.0 + uDecayFrequency * 4.0));
        float particles = particleMask * decay * uParticleSize;

        float lambert = dot(normalize(vNormal), normalize(vec3(0.2, 0.9, 0.5))) * 0.4 + 0.6;
        vec3 baseColor = mix(vec3(0.34, 0.37, 0.42), vec3(0.92, 0.94, 0.98), lambert);
        vec3 edgeColor = uParticleColor * (edgeBand * 0.95 + edgeGlow * 0.65);
        vec3 particleColor = uParticleColor * particles * 2.2;

        float alpha = clamp(reveal + particles * 0.18, 0.0, 1.0);
        if (alpha < 0.01) {
          discard;
        }

        gl_FragColor = vec4(baseColor + edgeColor + particleColor, alpha);
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

function frameModelAndCamera(THREE, modelRoot, camera) {
  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  console.log("Model bounds size", size);
  console.log("Model bounds center", center);

  // Center model around origin first.
  modelRoot.position.sub(center);
  modelRoot.rotation.set(0, 0, 0);

  // Fit camera distance to model extents.
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fovRad = (camera.fov * Math.PI) / 180;
  const fitDistance = maxDim / (2 * Math.tan(fovRad / 2));
  const distance = fitDistance * DISSOLVE_CONFIG.framing.distanceMultiplier;

  camera.position.set(0, size.y * DISSOLVE_CONFIG.framing.yOffset, distance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  console.log("Final camera position", camera.position);
  console.log("Final model scale", modelRoot.scale);
}

function createFallbackMesh(THREE, scene) {
  const geometry = new THREE.IcosahedronGeometry(0.75, 4);
  const material = new THREE.MeshBasicMaterial({ color: 0x33d8ff, wireframe: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
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
        onChange();
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
        onChange();
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
  let dissolveMaterial = null;
  let modelRoot = null;
  let fallbackMesh = null;
  let fallbackMaterial = null;
  let debugPanel = null;
  let rafId = 0;
  let lastTime = 0;
  let elapsedTime = 0;

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

    const tick = (time) => {
      if (isDestroyed) {
        return;
      }

      if (!lastTime) {
        lastTime = time;
      }

      const delta = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
      elapsedTime += delta;

      if (dissolveMaterial) {
        dissolveMaterial.uniforms.uTime.value = elapsedTime;
      }

      render();
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
    if (!dissolveMaterial) {
      return;
    }

    dissolveMaterial.uniforms.uEdge.value = debugState.edge;
    dissolveMaterial.uniforms.uFrequency.value = debugState.frequency;
    dissolveMaterial.uniforms.uParticleSize.value = debugState.particleSize;
    dissolveMaterial.uniforms.uParticleSpeed.value = debugState.particleSpeed;
    dissolveMaterial.uniforms.uDecayFrequency.value = debugState.decayFrequency;

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
        console.error("[hero-dissolve] All model URL attempts failed. Model not visible.");
        if (!fallbackMesh) {
          fallbackMesh = createFallbackMesh(THREE, scene);
          fallbackMaterial = fallbackMesh.material;
        }
        return;
      }

      const modelUrl = candidates[index];
      console.log(`[hero-dissolve] loading model from: ${modelUrl}`);

      loader.load(
        modelUrl,
        (gltf) => {
          if (isDestroyed || !scene || !dissolveMaterial) {
            return;
          }

          modelRoot = gltf.scene;
          console.log("Model loaded", modelRoot);
          modelRoot.position.set(0, 0, 0);
          modelRoot.scale.setScalar(1);
          frameModelAndCamera(THREE, modelRoot, camera);
          applyMaterialToModel(modelRoot, dissolveMaterial);
          scene.add(modelRoot);
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

    // Temporary forced framing for visibility debugging.
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 2, 2);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvasContainer.clientWidth || 1, canvasContainer.clientHeight || 1);

    if (THREE.SRGBColorSpace && "outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    if (!canvasContainer.contains(renderer.domElement)) {
      canvasContainer.appendChild(renderer.domElement);
    }

    dissolveMaterial = createDissolveMaterial(THREE);
    applyDebugUniforms();

    setupPostProcessing(THREE);
    mountDebugPanel();
    loadModel(THREE);

    initialized = true;
    startLoop();
  }

  function update(progress) {
    if (isDestroyed) {
      return;
    }

    const p = clamp(progress, 0, 1);
    console.log("dissolve progress", p);
    cues.update(p);

    if (!initialized || !dissolveMaterial) {
      return;
    }

    debugState.progress = p;
    const effectiveProgress = debugState.overrideProgress ? debugState.progress : p;
    dissolveMaterial.uniforms.uProgress.value = effectiveProgress;
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
    if (fallbackMaterial) {
      fallbackMaterial.dispose();
      fallbackMaterial = null;
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

    if (dissolveMaterial) {
      dissolveMaterial.dispose();
      dissolveMaterial = null;
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
