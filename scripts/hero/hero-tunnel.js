import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const CONSTANTS = {
  segmentCount: 150,
  maxTrail: 150,
  backgroundTop: "#03070D",
  backgroundBottom: "#012340",
};

const DEFAULT_PARAMS = {
  colorBg: "#03070D",
  colorLine: "#666666",
  lineCount: 182,
  globalRotation: 90,
  positionX: 0,
  positionY: 0,
  spreadHeight: 100,
  spreadDepth: 0,
  curveLength: 37.57,
  straightLength: 100,
  curvePower: 0.8265,
  convergeWidth: 0.12,
  waveSpeed: 0.0,
  waveHeight: 0.0,
  lineOpacity: 0.268,
  bloomStrength: 1.055,
  bloomRadius: 0.784,
  bloomThreshold: 0.0,
  slowmoScale: 0.1,
  slowmoDuration: 0.55,
  color1: "#00bfff",
  color2: "#e68d29",
  color3: "#a94301",
  color4: "#c40fc7",
  color5: "#a74972",
  color6: "#e21dd1",
};

const DEFAULT_SIGNAL_GROUPS = [
  {
    colorKey: "color1",
    name: "Color 1",
    enabled: true,
    count: 61,
    speed: 0.964,
    trailLength: 17,
    speedInfluence: 0.15,
    countInfluence: 41,
    trailInfluence: 22,
    presenceMode: "stable",
  },
  {
    colorKey: "color2",
    name: "Color 2",
    enabled: true,
    count: 29,
    speed: 0.841,
    trailLength: 6,
    speedInfluence: 1.15,
    countInfluence: 95,
    trailInfluence: 33,
    presenceMode: "reactive",
  },
  {
    colorKey: "color3",
    name: "Color 3",
    enabled: true,
    count: 29,
    speed: 0.434,
    trailLength: 10,
    speedInfluence: 1.35,
    countInfluence: 87,
    trailInfluence: 29,
    presenceMode: "mid",
  },
  {
    colorKey: "color4",
    name: "Color 4",
    enabled: true,
    count: 0,
    speed: 0.25,
    trailLength: 6,
    speedInfluence: 1.6,
    countInfluence: 96,
    trailInfluence: 34,
    presenceMode: "high",
  },
  {
    colorKey: "color5",
    name: "Color 5",
    enabled: true,
    count: 0,
    speed: 0.52,
    trailLength: 8,
    speedInfluence: 2.1,
    countInfluence: 84,
    trailInfluence: 31,
    presenceMode: "chaotic",
  },
  {
    colorKey: "color6",
    name: "Color 6",
    enabled: true,
    count: 0,
    speed: 0.28,
    trailLength: 5,
    speedInfluence: 0.85,
    countInfluence: 52,
    trailInfluence: 24,
    presenceMode: "accent",
  },
];

const CINEMATIC_PHASES = {
  startEnd: 0.2,
  buildupEnd: 0.7,
  baseMotion: { start: 0.75, mid: 2.2, end: 6.2 },
  bloomStrength: { start: 1.055, mid: 2.4, end: 3.45 },
  lineOpacity: { start: 0.268, mid: 0.45, end: 0.557 },
  convergeWidth: { start: 0.18, mid: 0.1, end: 0.045 },
  spreadHeight: { start: 72, mid: 82.2, end: 96 },
  waveSpeed: { start: 0.12, mid: 1.5, end: 4.6 },
  waveHeight: { start: 0.02, mid: 0.22, end: 0.42 },
};

function isDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "true";
  } catch (error) {
    return false;
  }
}

function getPathPoint(THREE, t, lineIndex, time, params) {
  const totalLen = params.curveLength + params.straightLength;
  const currentX = -params.curveLength + t * totalLen;

  let y = 0;
  let z = 0;
  const spreadFactor = (lineIndex / params.lineCount - 0.5) * 2;

  if (currentX < 0) {
    const ratio = (currentX + params.curveLength) / Math.max(params.curveLength, 0.0001);
    let shapeFactor = (Math.cos(ratio * Math.PI) + 1) / 2;
    shapeFactor = Math.pow(shapeFactor, params.curvePower);

    const spread = params.convergeWidth + (params.spreadHeight - params.convergeWidth) * shapeFactor;
    y = spreadFactor * spread;

    const spreadZ = params.convergeWidth + (params.spreadDepth - params.convergeWidth) * shapeFactor;
    z = spreadFactor * spreadZ;

    const waveFactor = shapeFactor;
    const wave = Math.sin(time * params.waveSpeed + currentX * 0.1 + lineIndex) * params.waveHeight * waveFactor;
    y += wave;
  }

  return new THREE.Vector3(currentX, y, z);
}

function phaseCurve(progress) {
  const p = clamp(progress, 0, 1);

  if (p <= CINEMATIC_PHASES.startEnd) {
    const local = p / CINEMATIC_PHASES.startEnd;
    return { phase: "start", eased: Math.pow(local, 1.2) };
  }

  if (p <= CINEMATIC_PHASES.buildupEnd) {
    const local = (p - CINEMATIC_PHASES.startEnd) / (CINEMATIC_PHASES.buildupEnd - CINEMATIC_PHASES.startEnd);
    return { phase: "buildup", eased: Math.pow(local, 2.15) };
  }

  const local = (p - CINEMATIC_PHASES.buildupEnd) / (1 - CINEMATIC_PHASES.buildupEnd);
  return { phase: "final", eased: Math.pow(local, 3.0) };
}

function phaseLerp(THREE, progress, triplet) {
  const { phase, eased } = phaseCurve(progress);

  if (phase === "start") {
    return THREE.MathUtils.lerp(triplet.start * 0.85, triplet.start, eased);
  }
  if (phase === "buildup") {
    return THREE.MathUtils.lerp(triplet.start, triplet.mid, eased);
  }
  return THREE.MathUtils.lerp(triplet.mid, triplet.end, eased);
}

export function initHeroTunnel({
  threeRoot,
  cueScopeEl,
  cueSelector = "[data-hero-cue]",
} = {}) {
  if (!threeRoot?.THREE || !threeRoot?.scene || !threeRoot?.renderer) {
    return {
      initialized: false,
      init() {},
      update() {},
      show() {},
      hide() {},
      resize() {},
      tick() {},
      render() {
        return false;
      },
      destroy() {},
    };
  }

  const THREE = threeRoot.THREE;
  const params = { ...DEFAULT_PARAMS };
  params.positionX = 0;

  const heroThree = window.HeroThree || {};
  const EffectComposer = heroThree.EffectComposer || window.EffectComposer || null;
  const RenderPass = heroThree.RenderPass || window.RenderPass || null;
  const UnrealBloomPass = heroThree.UnrealBloomPass || window.UnrealBloomPass || null;
  const GUI = heroThree.GUI || null;

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "tunnel",
  });

  const group = new THREE.Group();
  group.visible = false;

  const contentGroup = new THREE.Group();
  contentGroup.position.set(0, params.positionY, 0);
  group.add(contentGroup);

  const bgMaterial = new THREE.LineBasicMaterial({
    color: params.colorLine,
    transparent: true,
    opacity: params.lineOpacity,
    depthWrite: false,
  });

  const signalMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });

  let backgroundLines = [];
  let signalGroups = [];
  let composer = null;
  let bloomPass = null;
  let gui = null;
  let initialized = false;
  let isVisible = false;
  let localProgress = 0;
  let scrollTime = 0;
  let baseMotionSpeed = 1.1;
  let lastFrameTime = performance.now() * 0.001;
  let gradientBackgroundTexture = null;
  let previousSceneBackground = null;

  function createBackgroundGradientTexture() {
    if (gradientBackgroundTexture) {
      return gradientBackgroundTexture;
    }

    const gradientCanvas = document.createElement("canvas");
    gradientCanvas.width = 2;
    gradientCanvas.height = 512;
    const gradientCtx = gradientCanvas.getContext("2d");
    if (!gradientCtx) {
      return null;
    }

    const gradient = gradientCtx.createLinearGradient(0, 0, 0, gradientCanvas.height);
    gradient.addColorStop(0, CONSTANTS.backgroundTop);
    gradient.addColorStop(1, CONSTANTS.backgroundBottom);

    gradientCtx.fillStyle = gradient;
    gradientCtx.fillRect(0, 0, gradientCanvas.width, gradientCanvas.height);

    gradientBackgroundTexture = new THREE.CanvasTexture(gradientCanvas);
    gradientBackgroundTexture.needsUpdate = true;
    gradientBackgroundTexture.colorSpace = THREE.SRGBColorSpace;
    return gradientBackgroundTexture;
  }

  function getPresenceFactor(mode, p) {
    if (mode === "stable") {
      return 0.8 + p * 0.2;
    }
    if (mode === "reactive") {
      return 0.35 + p * 0.65;
    }
    if (mode === "mid") {
      return Math.max(0, 1 - Math.abs(p - 0.55) / 0.35);
    }
    if (mode === "high") {
      return THREE.MathUtils.smoothstep(p, 0.65, 0.95);
    }
    if (mode === "chaotic") {
      return 0.45 + p * 0.55;
    }
    if (mode === "accent") {
      return 0.18 + p * 0.35;
    }
    return 1;
  }

  function createSignalMesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CONSTANTS.maxTrail * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(CONSTANTS.maxTrail * 3), 3));

    const mesh = new THREE.Line(geometry, signalMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    contentGroup.add(mesh);

    return mesh;
  }

  function clearGroup(groupState) {
    groupState.signals.forEach((signal) => {
      contentGroup.remove(signal.mesh);
      signal.mesh.geometry.dispose();
    });
    groupState.signals = [];
  }

  function rebuildSignalGroup(groupState) {
    clearGroup(groupState);

    if (!groupState.enabled) {
      return;
    }

    const poolCount = Math.max(
      0,
      Math.floor((groupState.baseCount ?? groupState.count) + (groupState.countInfluence || 0) * 2.2)
    );
    const targetCount = Math.max(poolCount, Math.floor(groupState.count));
    for (let i = 0; i < targetCount; i += 1) {
      groupState.signals.push({
        mesh: createSignalMesh(),
        laneIndex: Math.floor(Math.random() * Math.max(params.lineCount, 1)),
        speed: 0.2 + Math.random() * 0.5,
        progress: Math.random(),
        history: [],
        assignedColor: new THREE.Color(groupState.color),
      });
    }
  }

  function rebuildAllSignalGroups() {
    signalGroups.forEach((groupState) => rebuildSignalGroup(groupState));
  }

  function syncSignalColorsFromParams() {
    signalGroups.forEach((groupState) => {
      groupState.color = params[groupState.colorKey];
      groupState.signals.forEach((signal) => {
        signal.assignedColor.set(groupState.color);
      });
    });
  }

  function initSignalGroups() {
    signalGroups = DEFAULT_SIGNAL_GROUPS.map((entry) => ({
      ...entry,
      color: params[entry.colorKey],
      baseCount: entry.count,
      baseTrail: entry.trailLength,
      runtimeSpeed: entry.speed,
      runtimeCount: entry.count,
      runtimeTrail: entry.trailLength,
      runtimePresence: 1,
      signals: [],
    }));
  }

  function rebuildLines() {
    backgroundLines.forEach((line) => {
      contentGroup.remove(line);
      line.geometry.dispose();
    });
    backgroundLines = [];

    for (let i = 0; i < params.lineCount; i += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(CONSTANTS.segmentCount * 3), 3)
      );
      const line = new THREE.Line(geometry, bgMaterial);
      line.userData = { id: i };
      line.renderOrder = 0;
      contentGroup.add(line);
      backgroundLines.push(line);
    }

    rebuildAllSignalGroups();
  }

  function applyProgressToParams(progress) {
    const p = clamp(progress, 0, 1);
    const { phase } = phaseCurve(p);
    baseMotionSpeed = phaseLerp(THREE, p, CINEMATIC_PHASES.baseMotion);

    params.runtimeWaveSpeed = phaseLerp(THREE, p, CINEMATIC_PHASES.waveSpeed);
    params.runtimeWaveHeight = phaseLerp(THREE, p, CINEMATIC_PHASES.waveHeight);
    params.runtimeConvergeWidth = phaseLerp(THREE, p, CINEMATIC_PHASES.convergeWidth);
    params.runtimeSpreadHeight = phaseLerp(THREE, p, CINEMATIC_PHASES.spreadHeight);
    params.runtimeLineOpacity = phaseLerp(THREE, p, CINEMATIC_PHASES.lineOpacity);
    bgMaterial.opacity = params.runtimeLineOpacity;

    if (bloomPass) {
      bloomPass.strength = phaseLerp(THREE, p, CINEMATIC_PHASES.bloomStrength);
      bloomPass.radius = params.bloomRadius;
      bloomPass.threshold = params.bloomThreshold;
    }

    signalGroups.forEach((groupState) => {
      const presence = getPresenceFactor(groupState.presenceMode, p);
      const baseSpeed = phase === "start" ? 0.62 : phase === "buildup" ? 0.95 : 1.35;
      const speedPhaseBoost = phase === "final" ? 1.45 : 1;
      const trailPhaseBoost = phase === "final" ? 1.65 : phase === "buildup" ? 1.25 : 1;
      const countPhaseBoost = phase === "final" ? 1.85 : phase === "buildup" ? 1.35 : 1;

      groupState.runtimePresence = presence;
      groupState.runtimeSpeed =
        groupState.speed *
        (baseSpeed + Math.pow(p, 1.8) * groupState.speedInfluence) *
        (0.65 + presence * 0.6) *
        speedPhaseBoost;
      groupState.runtimeCount = Math.max(
        0,
        Math.floor(
          (groupState.baseCount + Math.pow(p, 2.1) * groupState.countInfluence * countPhaseBoost) *
            presence
        )
      );
      groupState.runtimeTrail = Math.max(
        1,
        Math.floor(groupState.baseTrail + Math.pow(p, 1.9) * groupState.trailInfluence * trailPhaseBoost)
      );
    });
  }

  function updateLinesAndSignals() {
    backgroundLines.forEach((line) => {
      const positions = line.geometry.attributes.position.array;
      const lineId = line.userData.id;

      for (let j = 0; j < CONSTANTS.segmentCount; j += 1) {
        const t = j / (CONSTANTS.segmentCount - 1);
        const vec = getPathPoint(THREE, t, lineId, scrollTime, {
          ...params,
          waveHeight: params.runtimeWaveHeight ?? params.waveHeight,
          convergeWidth: params.runtimeConvergeWidth ?? params.convergeWidth,
          spreadHeight: params.runtimeSpreadHeight ?? params.spreadHeight,
        });
        positions[j * 3] = vec.x;
        positions[j * 3 + 1] = vec.y;
        positions[j * 3 + 2] = vec.z;
      }

      line.geometry.attributes.position.needsUpdate = true;
    });

    signalGroups.forEach((groupState) => {
      if (!groupState.enabled || groupState.signals.length === 0) {
        return;
      }

      const trailLength = Math.max(0, Math.floor(groupState.runtimeTrail || groupState.trailLength));
      const drawCount = Math.max(1, trailLength);
      const activeCount = Math.min(
        groupState.signals.length,
        Math.max(0, Math.floor(groupState.runtimeCount ?? groupState.signals.length))
      );

      groupState.signals.forEach((signal, index) => {
        if (index >= activeCount) {
          signal.mesh.geometry.setDrawRange(0, 0);
          return;
        }

        signal.progress += signal.speed * 0.005 * (groupState.runtimeSpeed || groupState.speed);

        if (signal.progress > 1.0) {
          signal.progress = 0;
          signal.laneIndex = Math.floor(Math.random() * Math.max(params.lineCount, 1));
          signal.history = [];
          signal.assignedColor.set(groupState.color);
        }

        const pos = getPathPoint(THREE, signal.progress, signal.laneIndex, scrollTime, {
          ...params,
          waveSpeed: params.runtimeWaveSpeed ?? params.waveSpeed,
          waveHeight: params.runtimeWaveHeight ?? params.waveHeight,
          convergeWidth: params.runtimeConvergeWidth ?? params.convergeWidth,
          spreadHeight: params.runtimeSpreadHeight ?? params.spreadHeight,
        });

        signal.history.push(pos);
        if (signal.history.length > trailLength + 1) {
          signal.history.shift();
        }

        const positions = signal.mesh.geometry.attributes.position.array;
        const colors = signal.mesh.geometry.attributes.color.array;
        const currentLen = signal.history.length;

        for (let i = 0; i < drawCount; i += 1) {
          let index = currentLen - 1 - i;
          if (index < 0) {
            index = 0;
          }
          const p = signal.history[index] || new THREE.Vector3();

          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;

          const alpha = trailLength > 0 ? Math.max(0, 1 - i / trailLength) : 1;
          colors[i * 3] = signal.assignedColor.r * alpha;
          colors[i * 3 + 1] = signal.assignedColor.g * alpha;
          colors[i * 3 + 2] = signal.assignedColor.b * alpha;
        }

        signal.mesh.geometry.setDrawRange(0, drawCount);
        signal.mesh.geometry.attributes.position.needsUpdate = true;
        signal.mesh.geometry.attributes.color.needsUpdate = true;
      });
    });
  }

  function setupComposer() {
    if (!EffectComposer || !RenderPass || !UnrealBloomPass) {
      return;
    }

    const width = Math.max(1, window.innerWidth || 1);
    const height = Math.max(1, window.innerHeight || 1);

    composer = new EffectComposer(threeRoot.renderer);
    composer.addPass(new RenderPass(threeRoot.scene, threeRoot.camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      params.bloomStrength,
      params.bloomRadius,
      params.bloomThreshold
    );
    bloomPass.threshold = params.bloomThreshold;
    bloomPass.strength = params.bloomStrength;
    bloomPass.radius = params.bloomRadius;
    composer.addPass(bloomPass);
  }

  function setupGui() {
    if (!isDebugEnabled() || !GUI || gui) {
      return;
    }

    gui = new GUI({ title: "Data Tunnel" });

    const folderColors = gui.addFolder("Colors");
    folderColors.addColor(params, "colorBg").name("Background");
    folderColors.addColor(params, "colorLine").name("Lines").onChange((v) => bgMaterial.color.set(v));
    folderColors.addColor(params, "color1").name("Color 1").onChange(syncSignalColorsFromParams);
    folderColors.addColor(params, "color2").name("Color 2").onChange(syncSignalColorsFromParams);
    folderColors.addColor(params, "color3").name("Color 3").onChange(syncSignalColorsFromParams);
    folderColors.addColor(params, "color4").name("Color 4").onChange(syncSignalColorsFromParams);
    folderColors.addColor(params, "color5").name("Color 5").onChange(syncSignalColorsFromParams);
    folderColors.addColor(params, "color6").name("Color 6").onChange(syncSignalColorsFromParams);

    const folderGeneral = gui.addFolder("General");
    folderGeneral.add(params, "globalRotation", -180, 180).name("Rotation (Deg)").onChange((v) => {
      contentGroup.rotation.z = THREE.MathUtils.degToRad(v);
    });
    folderGeneral.add(params, "positionX", -200, 200).name("Position X").onChange((v) => {
      contentGroup.position.x = v;
    });
    folderGeneral.add(params, "positionY", -100, 100).name("Position Y").onChange((v) => {
      contentGroup.position.y = v;
    });
    folderGeneral.add(params, "lineCount", 10, 300, 1).name("Line Count").onFinishChange((v) => {
      params.lineCount = Math.floor(v);
      rebuildLines();
    });

    const folderGeo = gui.addFolder("Geometry");
    folderGeo.add(params, "spreadHeight", 0, 100).name("Spread Height");
    folderGeo.add(params, "spreadDepth", 0, 50).name("Spread Depth");
    folderGeo.add(params, "curveLength", 20, 150).name("Curve Length");
    folderGeo.add(params, "straightLength", 20, 200).name("Straight Length");
    folderGeo.add(params, "curvePower", 0.1, 3.0).name("Curve Power");
    folderGeo.add(params, "convergeWidth", 0.0, 15.0).name("Converge Width");

    const folderAnim = gui.addFolder("Lines");
    folderAnim.add(params, "waveSpeed", 0, 5).name("Wave Speed");
    folderAnim.add(params, "waveHeight", 0, 5).name("Wave Height");
    folderAnim.add(params, "lineOpacity", 0, 1).name("Line Opacity").onChange((v) => {
      bgMaterial.opacity = v;
    });

    const folderBloom = gui.addFolder("Bloom");
    folderBloom.add(params, "bloomStrength", 0, 5).name("Strength");
    folderBloom.add(params, "bloomRadius", 0, 1).name("Radius");
    folderBloom.add(params, "bloomThreshold", 0, 1).name("Threshold");

    const folderSlowmo = gui.addFolder("Slow-mo");
    folderSlowmo.add(params, "slowmoScale", 0.01, 1.0).name("Hover scale");
    folderSlowmo.add(params, "slowmoDuration", 0.05, 2.0).name("Tween duration");

    const folderSignals = gui.addFolder("Signals (6 groups)");
    signalGroups.forEach((groupState) => {
      const folder = folderSignals.addFolder(groupState.name);
      folder.add(groupState, "enabled").name("Enabled").onChange(() => rebuildSignalGroup(groupState));
      folder.add(groupState, "count", 0, 200, 1).name("Count").onFinishChange((v) => {
        groupState.baseCount = Math.max(0, Math.floor(v));
        rebuildSignalGroup(groupState);
      });
      folder.add(groupState, "speed", 0, 3, 0.001).name("Speed");
      folder.add(groupState, "trailLength", 0, 100, 1).name("Trail Length").onChange((v) => {
        groupState.baseTrail = Math.max(0, Math.floor(v));
      });
    });
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;

    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] init");
    }

    group.position.set(0, 0, 0);
    contentGroup.position.set(0, params.positionY, 0);
    contentGroup.rotation.z = THREE.MathUtils.degToRad(90);

    initSignalGroups();
    rebuildLines();
    syncSignalColorsFromParams();
    setupComposer();
    setupGui();

    threeRoot.camera.position.set(0, 0, 90);
    threeRoot.camera.lookAt(0, 0, 0);
    threeRoot.camera.near = 1;
    threeRoot.camera.far = 1000;
    threeRoot.camera.updateProjectionMatrix();

    threeRoot.scene.add(group);
  }

  function update(progress) {
    const p = clamp(progress, 0, 1);
    localProgress = p;
    cues.update(p);
    applyProgressToParams(p);
  }

  function show() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] show");
    }
    group.visible = true;
    isVisible = true;
    lastFrameTime = performance.now() * 0.001;
    previousSceneBackground = threeRoot.scene.background;
    const texture = createBackgroundGradientTexture();
    if (texture) {
      threeRoot.scene.background = texture;
    }
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] hide");
    }
    group.visible = false;
    isVisible = false;
    threeRoot.scene.background = previousSceneBackground || null;
    previousSceneBackground = null;
  }

  function resize(width, height) {
    if (composer) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
    }
  }

  function render() {
    if (!isVisible || !composer) {
      return false;
    }
    composer.render();
    return true;
  }

  function destroy() {
    cues.destroy();

    backgroundLines.forEach((line) => {
      contentGroup.remove(line);
      line.geometry.dispose();
    });
    backgroundLines = [];

    signalGroups.forEach((groupState) => clearGroup(groupState));
    signalGroups = [];

    bgMaterial.dispose();
    signalMaterial.dispose();

    if (gui) {
      gui.destroy();
      gui = null;
    }

    if (composer) {
      composer = null;
      bloomPass = null;
    }

    if (gradientBackgroundTexture) {
      gradientBackgroundTexture.dispose();
      gradientBackgroundTexture = null;
    }
    previousSceneBackground = null;

    if (group.parent) {
      group.parent.remove(group);
    }
  }

  return {
    init,
    update,
    show,
    hide,
    resize,
    tick() {
      if (!initialized || !isVisible) {
        return;
      }

      const now = performance.now() * 0.001;
      const deltaTime = Math.min(0.05, Math.max(0.001, now - lastFrameTime));
      lastFrameTime = now;

      // Base motion is always alive and independent from scroll.
      scrollTime += deltaTime * baseMotionSpeed;
      updateLinesAndSignals();
    },
    render,
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
