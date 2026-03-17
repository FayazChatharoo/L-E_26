import { clamp, createCueController } from "../utils.js";

// Dissolve stage visual settings.
// These values are intentionally centralized for easy tuning.
const DISSOLVE_CONFIG = {
  modelUrl: "/ASSETS/dissolve.glb",
  backgroundColor: 0x000000,
  camera: {
    fov: 38,
    near: 0.1,
    far: 100,
    position: [0, 0.15, 4.2],
  },
  model: {
    scale: 1.6,
    rotationY: 0.0,
  },
  bloomStrength: 0.7,
  bloomRadius: 0.55,
  bloomThreshold: 0.2,
  edge: 0.12,
  frequency: 3.2,
  noiseOffset: 0.0,
  particleColor: "#ff9d29",
  particleSize: 0.9,
  particleSpeed: 1.4,
  decayFrequency: 2.4,
};

function getThreeRuntime() {
  const THREE = window.THREE;
  if (!THREE) {
    return null;
  }

  const GLTFLoader = THREE.GLTFLoader || window.GLTFLoader || null;
  const EffectComposer =
    THREE.EffectComposer || window.EffectComposer || window.POSTPROCESSING?.EffectComposer || null;
  const RenderPass =
    THREE.RenderPass || window.RenderPass || window.POSTPROCESSING?.RenderPass || null;
  const UnrealBloomPass =
    THREE.UnrealBloomPass || window.UnrealBloomPass || window.POSTPROCESSING?.UnrealBloomPass || null;

  return { THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass };
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

      // Hash-based pseudo noise. Good enough for stylized dissolve breakup.
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
        vec3 samplePos = vWorldPos * uFrequency + vec3(uNoiseOffset);
        float pattern = noise3d(samplePos);

        // Inverted behavior (requested):
        // progress 0 -> invisible, progress 1 -> fully visible.
        float reveal = smoothstep(pattern - uEdge, pattern + uEdge, uProgress);

        // A thin band around the dissolve frontier for sparks/edge glow.
        float edgeMask = 1.0 - smoothstep(0.0, uEdge * 1.6, abs(pattern - uProgress));
        float particlePulse = sin((pattern + uTime * uParticleSpeed) * 6.283185 * uDecayFrequency) * 0.5 + 0.5;
        float edgeParticles = edgeMask * particlePulse * uParticleSize;

        float lighting = dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.7))) * 0.35 + 0.65;
        vec3 baseColor = vec3(1.0) * lighting;
        vec3 color = baseColor + uParticleColor * edgeParticles;

        float alpha = reveal;
        if (alpha < 0.01) {
          discard;
        }

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function applyDissolveMaterial(root, material) {
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

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const normalizedScale = DISSOLVE_CONFIG.model.scale / maxAxis;

  modelRoot.position.sub(center);
  modelRoot.scale.setScalar(normalizedScale);
  modelRoot.rotation.y = DISSOLVE_CONFIG.model.rotationY;
}

function buildFallbackMesh(THREE, scene, material) {
  const geometry = new THREE.IcosahedronGeometry(1, 5);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

export function initHeroDissolve({
  canvasContainer,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  let isDestroyed = false;
  let initialized = false;
  let rafId = 0;
  let needsRender = false;

  let runtime = null;
  let renderer = null;
  let composer = null;
  let bloomPass = null;
  let scene = null;
  let camera = null;
  let modelRoot = null;
  let fallbackMesh = null;
  let dissolveMaterial = null;

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
    const { EffectComposer, RenderPass, UnrealBloomPass } = runtime;
    if (!EffectComposer || !RenderPass || !UnrealBloomPass || !renderer) {
      return;
    }

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      DISSOLVE_CONFIG.bloomStrength,
      DISSOLVE_CONFIG.bloomRadius,
      DISSOLVE_CONFIG.bloomThreshold
    );

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
  }

  function loadModelOrFallback() {
    const { THREE, GLTFLoader } = runtime;
    const modelUrl = canvasContainer?.dataset?.modelUrl || DISSOLVE_CONFIG.modelUrl;

    if (!GLTFLoader || !modelUrl) {
      fallbackMesh = buildFallbackMesh(THREE, scene, dissolveMaterial);
      requestRender();
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (isDestroyed || !scene) {
          return;
        }

        modelRoot = gltf.scene;
        fitModelToFrame(THREE, modelRoot);
        applyDissolveMaterial(modelRoot, dissolveMaterial);
        scene.add(modelRoot);
        requestRender();
      },
      undefined,
      () => {
        if (!fallbackMesh) {
          fallbackMesh = buildFallbackMesh(THREE, scene, dissolveMaterial);
          requestRender();
        }
      }
    );
  }

  function init() {
    if (initialized || isDestroyed) {
      return;
    }

    initialized = true;
    runtime = getThreeRuntime();

    if (!runtime || !canvasContainer) {
      return;
    }

    const { THREE } = runtime;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(DISSOLVE_CONFIG.backgroundColor);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;

    if (!canvasContainer.contains(renderer.domElement)) {
      canvasContainer.appendChild(renderer.domElement);
    }

    dissolveMaterial = createDissolveMaterial(THREE);

    setupPostProcessing(THREE);
    loadModelOrFallback();
    requestRender();
    startLoop();
  }

  function update(progress) {
    if (isDestroyed) {
      return;
    }

    const p = clamp(progress, 0, 1);
    cues.update(p);

    if (!initialized || !dissolveMaterial) {
      return;
    }

    dissolveMaterial.uniforms.uProgress.value = p;
    dissolveMaterial.uniforms.uTime.value = p * DISSOLVE_CONFIG.particleSpeed;

    if (modelRoot) {
      modelRoot.rotation.y = DISSOLVE_CONFIG.model.rotationY + p * 0.22;
    }
    if (fallbackMesh) {
      fallbackMesh.rotation.y = p * Math.PI * 0.85;
      fallbackMesh.rotation.x = p * 0.15;
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
      if (scene) {
        scene.remove(modelRoot);
      }
      modelRoot = null;
    }

    if (dissolveMaterial) {
      dissolveMaterial.dispose();
      dissolveMaterial = null;
    }

    if (composer) {
      composer = null;
      bloomPass = null;
    }

    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer = null;
    }

    scene = null;
    camera = null;
    runtime = null;
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
