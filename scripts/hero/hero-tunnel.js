import { clamp, createCueController } from "../utils.js";

export function initHeroTunnel({
  canvasContainer,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  let isDestroyed = false;
  let initialized = false;

  let renderer = null;
  let scene = null;
  let camera = null;
  let tunnelMesh = null;
  let tunnelMaterial = null;
  let tunnelCurve = null;

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "tunnel",
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
    camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvasContainer.clientWidth || 1, canvasContainer.clientHeight || 1);
    canvasContainer.appendChild(renderer.domElement);

    const curvePoints = Array.from({ length: 16 }, (_, i) => {
      const t = i / 15;
      const z = -t * 80;
      const x = Math.sin(t * Math.PI * 3.5) * 2.8;
      const y = Math.cos(t * Math.PI * 2.0) * 1.1;
      return new THREE.Vector3(x, y, z);
    });
    tunnelCurve = new THREE.CatmullRomCurve3(curvePoints);

    const geometry = new THREE.TubeGeometry(tunnelCurve, 260, 1.85, 28, false);
    tunnelMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uProgress: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        varying vec2 vUv;

        void main() {
          float travel = fract(vUv.y * 28.0 - uProgress * 24.0);
          float lane = abs(fract(vUv.x * 14.0) - 0.5);
          float lineA = smoothstep(0.49, 0.50, travel);
          float lineB = smoothstep(0.44, 0.50, lane);
          float glow = max(lineA, lineB) * 0.9;

          vec3 base = vec3(0.03, 0.05, 0.10);
          vec3 accent = vec3(0.25, 0.80, 1.00);
          vec3 color = mix(base, accent, glow);
          gl_FragColor = vec4(color, 0.92);
        }
      `,
    });
    tunnelMesh = new THREE.Mesh(geometry, tunnelMaterial);
    scene.add(tunnelMesh);
  }

  function render() {
    if (!renderer || !scene || !camera) {
      return;
    }
    renderer.render(scene, camera);
  }

  function updateCamera(progress) {
    const THREE = window.THREE;
    if (!THREE || !camera || !tunnelCurve) {
      return;
    }

    const p = clamp(progress, 0, 1);
    const lookAhead = Math.min(1, p + 0.02);
    const camPos = tunnelCurve.getPointAt(p);
    const target = tunnelCurve.getPointAt(lookAhead);
    camera.position.copy(camPos);
    camera.lookAt(target);
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

    if (tunnelMaterial) {
      tunnelMaterial.uniforms.uProgress.value = p;
    }
    updateCamera(p);
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

    if (tunnelMesh) {
      tunnelMesh.geometry.dispose();
      tunnelMesh = null;
    }
    if (tunnelMaterial) {
      tunnelMaterial.dispose();
      tunnelMaterial = null;
    }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer = null;
    }

    tunnelCurve = null;
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
