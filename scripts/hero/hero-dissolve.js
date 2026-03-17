import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const DISSOLVE_COLORS = {
  top: "#120f1f",
  mid: "#412126",
  bottom: "#f57b28",
};

function createGradientPlane(THREE, colors) {
  const geometry = new THREE.PlaneGeometry(8, 8, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colors.mid),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -1.2);
  return {
    mesh,
    material,
    colorTop: new THREE.Color(colors.top),
    colorMid: new THREE.Color(colors.mid),
    colorBottom: new THREE.Color(colors.bottom),
  };
}

export function initHeroDissolve({
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
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] init");
    }

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

    const color = gradient.colorMid.clone();
    if (p < 0.5) {
      color.lerpColors(gradient.colorTop, gradient.colorMid, p / 0.5);
    } else {
      color.lerpColors(gradient.colorMid, gradient.colorBottom, (p - 0.5) / 0.5);
    }
    gradient.material.color.copy(color);
    gradient.material.opacity = visibleAmount;
    gradient.mesh.rotation.z = (p - 0.5) * 0.12;
  }

  function show() {
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] show");
    }
    group.visible = true;
    visibleAmount = 1;
    if (gradient) gradient.material.opacity = visibleAmount;
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] hide");
    }
    visibleAmount = 0;
    if (gradient) gradient.material.opacity = visibleAmount;
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
