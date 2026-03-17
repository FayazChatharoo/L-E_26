import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const TUNNEL_COLORS = {
  top: "#0d1735",
  mid: "#162f66",
  bottom: "#6d2cb6",
};

function createTunnelPlane(THREE, colors) {
  const geometry = new THREE.PlaneGeometry(8, 8, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colors.mid),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -1.1);
  return {
    mesh,
    material,
    colorTop: new THREE.Color(colors.top),
    colorMid: new THREE.Color(colors.mid),
    colorBottom: new THREE.Color(colors.bottom),
  };
}

export function initHeroTunnel({
  threeRoot,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  if (!threeRoot?.THREE || !threeRoot?.scene) {
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
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] init");
    }

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

    const color = tunnel.colorMid.clone();
    if (p < 0.5) {
      color.lerpColors(tunnel.colorTop, tunnel.colorMid, p / 0.5);
    } else {
      color.lerpColors(tunnel.colorMid, tunnel.colorBottom, (p - 0.5) / 0.5);
    }
    tunnel.material.color.copy(color);
    tunnel.material.opacity = visibleAmount;
    tunnel.mesh.rotation.z = -(p - 0.5) * 0.08;
    tunnel.mesh.position.z = -1.1 + p * 0.15;
  }

  function show() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] show");
    }
    group.visible = true;
    visibleAmount = 1;
    if (tunnel) tunnel.material.opacity = visibleAmount;
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] hide");
    }
    visibleAmount = 0;
    if (tunnel) tunnel.material.opacity = visibleAmount;
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
