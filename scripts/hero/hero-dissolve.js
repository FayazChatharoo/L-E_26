import { clamp, createCueController } from "../utils.js";

const DISSOLVE_COLORS = {
  top: "#120f1f",
  mid: "#412126",
  bottom: "#f57b28",
};

function createGradientPlane(THREE, colors) {
  const geometry = new THREE.PlaneGeometry(7, 7, 1, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTop: { value: new THREE.Color(colors.top) },
      uMid: { value: new THREE.Color(colors.mid) },
      uBottom: { value: new THREE.Color(colors.bottom) },
      uProgress: { value: 0 },
      uVisible: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      uniform float uProgress;
      uniform float uVisible;
      varying vec2 vUv;

      void main() {
        float curve = smoothstep(0.0, 1.0, vUv.y);
        vec3 topBlend = mix(uMid, uTop, curve);
        vec3 bottomBlend = mix(uBottom, uMid, curve);
        vec3 gradient = mix(bottomBlend, topBlend, curve);
        float pulse = 0.08 * sin((vUv.y + uProgress * 0.9) * 8.0);
        vec3 color = gradient + vec3(pulse);
        gl_FragColor = vec4(color, uVisible);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -1.2);
  return { mesh, material };
}

export function initHeroDissolve({
  threeRoot,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  if (!threeRoot?.isReady) {
    return {
      initialized: false,
      init() {},
      update() {},
      show() {},
      hide() {},
      resize() {},
      destroy() {},
    };
  }

  const THREE = threeRoot.THREE;
  const group = new THREE.Group();
  group.visible = false;

  let initialized = false;
  let gradient = null;
  let visibleAmount = 0;

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "dissolve",
  });

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;

    gradient = createGradientPlane(THREE, DISSOLVE_COLORS);
    group.add(gradient.mesh);
    threeRoot.scene.add(group);
  }

  function update(progress) {
    const p = clamp(progress, 0, 1);
    cues.update(p);

    if (!initialized || !gradient) {
      return;
    }

    gradient.material.uniforms.uProgress.value = p;
    gradient.material.uniforms.uVisible.value = visibleAmount;
  }

  function show() {
    group.visible = true;
    visibleAmount = 1;
    if (gradient) {
      gradient.material.uniforms.uVisible.value = visibleAmount;
    }
  }

  function hide() {
    visibleAmount = 0;
    if (gradient) {
      gradient.material.uniforms.uVisible.value = visibleAmount;
    }
    group.visible = false;
  }

  function destroy() {
    cues.destroy();
    if (!initialized) {
      return;
    }

    if (gradient) {
      gradient.mesh.geometry.dispose();
      gradient.material.dispose();
      gradient = null;
    }

    if (group.parent) {
      group.parent.remove(group);
    }
  }

  return {
    init,
    update,
    show,
    hide,
    resize() {},
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
