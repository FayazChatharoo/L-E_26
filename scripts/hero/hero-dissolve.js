import { clamp, createCueController } from "../utils.js";

export function initHeroDissolve({
  canvasContainer,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  let isDestroyed = false;
  let initialized = false;

  let renderer = null;
  let scene = null;
  let camera = null;
  let mesh = null;
  let modelRoot = null;
  let material = null;

  function createDissolveMaterial(THREE) {
    return new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uProgress: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        varying vec3 vPos;

        float rand(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 39.425))) * 43758.5453);
        }

        void main() {
          vec3 cell = floor(vPos * 9.0) / 9.0;
          float threshold = rand(cell);
          if (threshold < uProgress) discard;

          vec3 colorA = vec3(0.95, 0.45, 0.30);
          vec3 colorB = vec3(1.00, 0.95, 0.82);
          float shade = clamp(vPos.y * 0.45 + 0.55, 0.0, 1.0);
          vec3 color = mix(colorA, colorB, shade);
          float alpha = 1.0 - (uProgress * 0.35);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }

  function mountFallbackMesh(THREE) {
    const geometry = new THREE.IcosahedronGeometry(1.35, 5);
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  }

  function applyMaterialToModel(THREE, root) {
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

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "dissolve",
  });

  function ensureScene() {
    if (initialized || isDestroyed) {
      return;
    }
    initialized = true;

    const THREE = window.THREE;
    if (!THREE || !canvasContainer) {
      return;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 5);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvasContainer.clientWidth || 1, canvasContainer.clientHeight || 1);
    canvasContainer.appendChild(renderer.domElement);

    material = createDissolveMaterial(THREE);

    const modelUrl = canvasContainer.dataset.modelUrl || "";
    const GLTFLoader = THREE.GLTFLoader || window.GLTFLoader;
    if (modelUrl && GLTFLoader) {
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          if (isDestroyed || !scene) {
            return;
          }
          modelRoot = gltf.scene;
          modelRoot.scale.setScalar(1.8);
          applyMaterialToModel(THREE, modelRoot);
          scene.add(modelRoot);
          render();
        },
        undefined,
        () => {
          if (!mesh) {
            mountFallbackMesh(THREE);
          }
          render();
        }
      );
    } else {
      mountFallbackMesh(THREE);
    }
  }

  function render() {
    if (!renderer || !scene || !camera) {
      return;
    }
    renderer.render(scene, camera);
  }

  function update(progress) {
    if (isDestroyed) {
      return;
    }

    const p = clamp(progress, 0, 1);
    cues.update(p);

    if (!initialized) {
      return;
    }

    if (material) {
      material.uniforms.uProgress.value = p;
    }
    if (mesh) {
      mesh.rotation.y = p * Math.PI * 2;
      mesh.rotation.x = p * 0.4;
    }
    if (modelRoot) {
      modelRoot.rotation.y = p * Math.PI * 1.5;
      modelRoot.rotation.x = p * 0.2;
    }
    render();
  }

  function resize(width, height, dpr = window.devicePixelRatio || 1) {
    if (!initialized) {
      return;
    }
    if (renderer) {
      renderer.setPixelRatio(Math.min(dpr, 2));
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    }
    if (camera) {
      camera.aspect = Math.max(1, width) / Math.max(1, height);
      camera.updateProjectionMatrix();
    }
    render();
  }

  function destroy() {
    if (isDestroyed) {
      return;
    }
    isDestroyed = true;
    cues.destroy();

    if (mesh) {
      mesh.geometry.dispose();
      mesh = null;
    }
    if (modelRoot) {
      modelRoot.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.geometry.dispose();
        }
      });
      scene.remove(modelRoot);
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

    scene = null;
    camera = null;
  }

  return {
    init: ensureScene,
    update,
    resize,
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
