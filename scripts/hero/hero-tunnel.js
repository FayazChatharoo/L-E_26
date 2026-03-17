import { clamp, createCueController } from "../utils.js";

const TUNNEL_COLORS = {
  top: "#0d1735",
  mid: "#162f66",
  bottom: "#6d2cb6",
};

function createTunnelPlane(THREE, colors) {
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
        float yCurve = smoothstep(0.0, 1.0, vUv.y);
        vec3 high = mix(uMid, uTop, yCurve);
        vec3 low = mix(uBottom, uMid, yCurve);
        vec3 gradient = mix(low, high, yCurve);
        float wave = 0.12 * sin((vUv.x * 14.0) + (uProgress * 10.0));
        vec3 color = gradient + vec3(0.0, wave * 0.25, wave * 0.5);
        gl_FragColor = vec4(color, uVisible);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -1.1);
  return { mesh, material };
}

export function initHeroTunnel({
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
  let tunnel = null;
  let visibleAmount = 0;

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "tunnel",
  });

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;

    tunnel = createTunnelPlane(THREE, TUNNEL_COLORS);
    group.add(tunnel.mesh);
    threeRoot.scene.add(group);
  }

  function update(progress) {
    const p = clamp(progress, 0, 1);
    cues.update(p);

    if (!initialized || !tunnel) {
      return;
    }

    tunnel.material.uniforms.uProgress.value = p;
    tunnel.material.uniforms.uVisible.value = visibleAmount;
  }

  function show() {
    group.visible = true;
    visibleAmount = 1;
    if (tunnel) {
      tunnel.material.uniforms.uVisible.value = visibleAmount;
    }
  }

  function hide() {
    visibleAmount = 0;
    if (tunnel) {
      tunnel.material.uniforms.uVisible.value = visibleAmount;
    }
    group.visible = false;
  }

  function destroy() {
    cues.destroy();
    if (!initialized) {
      return;
    }

    if (tunnel) {
      tunnel.mesh.geometry.dispose();
      tunnel.material.dispose();
      tunnel = null;
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
