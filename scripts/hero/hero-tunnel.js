import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const CONSTANTS = {
  segmentCount: 150,
  maxTrail: 150,
};

const DEFAULT_PARAMS = {
  colorBg: "#080808",
  colorLine: "#373f48",
  lineCount: 80,
  globalRotation: 0,
  positionX: 0,
  positionY: 0,
  spreadHeight: 30.33,
  spreadDepth: 0,
  curveLength: 50,
  straightLength: 100,
  curvePower: 0.8265,
  convergeWidth: 1.6,
  waveSpeed: 2.48,
  waveHeight: 0.145,
  lineOpacity: 0.557,
  bloomStrength: 3.0,
  bloomRadius: 0.5,
  bloomThreshold: 0.0,
  slowmoScale: 0.1,
  slowmoDuration: 0.55,
  color1: "#8fc9ff",
  color2: "#ff0055",
  color3: "#ffcc00",
  color4: "#00ffd5",
  color5: "#a855ff",
  color6: "#00ff66",
};

const DEFAULT_SIGNAL_GROUPS = [
  {
    colorKey: "color1",
    name: "Color 1",
    enabled: true,
    count: 94,
    speed: 0.345,
    trailLength: 3,
    speedInfluence: 0.15,
    countInfluence: 18,
    trailInfluence: 1.2,
    presenceMode: "stable",
  },
  {
    colorKey: "color2",
    name: "Color 2",
    enabled: true,
    count: 56,
    speed: 0.35,
    trailLength: 3,
    speedInfluence: 0.85,
    countInfluence: 42,
    trailInfluence: 3.0,
    presenceMode: "reactive",
  },
  {
    colorKey: "color3",
    name: "Color 3",
    enabled: true,
    count: 44,
    speed: 0.33,
    trailLength: 3,
    speedInfluence: 0.5,
    countInfluence: 30,
    trailInfluence: 2.2,
    presenceMode: "mid",
  },
  {
    colorKey: "color4",
    name: "Color 4",
    enabled: true,
    count: 40,
    speed: 0.31,
    trailLength: 3,
    speedInfluence: 0.7,
    countInfluence: 34,
    trailInfluence: 2.4,
    presenceMode: "high",
  },
  {
    colorKey: "color5",
    name: "Color 5",
    enabled: true,
    count: 52,
    speed: 0.46,
    trailLength: 3,
    speedInfluence: 1.2,
    countInfluence: 44,
    trailInfluence: 3.6,
    presenceMode: "chaotic",
  },
  {
    colorKey: "color6",
    name: "Color 6",
    enabled: true,
    count: 30,
    speed: 0.28,
    trailLength: 3,
    speedInfluence: 0.4,
    countInfluence: 16,
    trailInfluence: 1.8,
    presenceMode: "accent",
  },
];

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
  params.positionX = (params.curveLength - params.straightLength) / 2;

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
  const tunnelFogDensity = 0.002;

  const contentGroup = new THREE.Group();
  contentGroup.position.set(params.positionX, params.positionY, 0);
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

    const targetCount = Math.max(0, Math.floor(groupState.count));
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
    // Scroll-driven modulation while keeping all GUI controls available.
    const glowScale = 0.6 + p * 0.9;
    const convergeScale = 1 - p * 0.65;
    const spreadScale = 0.65 + p * 0.6;
    const waveSpeedScale = 0.55 + p * 1.35;

    baseMotionSpeed = THREE.MathUtils.lerp(0.85, 2.2, p);

    if (bloomPass) {
      bloomPass.strength = params.bloomStrength * glowScale;
      bloomPass.radius = params.bloomRadius;
      bloomPass.threshold = params.bloomThreshold;
    }

    params.runtimeWaveSpeed = params.waveSpeed * waveSpeedScale;
    signalGroups.forEach((groupState) => {
      const presence = getPresenceFactor(groupState.presenceMode, p);
      const baseSpeed = 0.7;

      groupState.runtimePresence = presence;
      groupState.runtimeSpeed =
        groupState.speed * (baseSpeed + p * groupState.speedInfluence) * (0.65 + presence * 0.6);
      groupState.runtimeCount = Math.max(
        0,
        Math.floor((groupState.baseCount + p * groupState.countInfluence) * presence)
      );
      groupState.runtimeTrail = Math.max(
        1,
        Math.floor(groupState.baseTrail + p * groupState.trailInfluence)
      );
    });

    params.runtimeConvergeWidth = Math.max(0.05, params.convergeWidth * convergeScale);
    params.runtimeSpreadHeight = params.spreadHeight * spreadScale;
  }

  function updateLinesAndSignals() {
    backgroundLines.forEach((line) => {
      const positions = line.geometry.attributes.position.array;
      const lineId = line.userData.id;

      for (let j = 0; j < CONSTANTS.segmentCount; j += 1) {
        const t = j / (CONSTANTS.segmentCount - 1);
        const vec = getPathPoint(THREE, t, lineId, scrollTime, {
          ...params,
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
    folderColors.addColor(params, "colorBg").name("Background").onChange((v) => {
      if (isVisible) {
        threeRoot.scene.background = new THREE.Color(v);
        threeRoot.scene.fog = new THREE.FogExp2(v, tunnelFogDensity);
      }
    });
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
    folderGeo.add(params, "curveLength", 20, 150).name("Curve Length").onFinishChange(() => {
      params.positionX = (params.curveLength - params.straightLength) / 2;
      contentGroup.position.x = params.positionX;
    });
    folderGeo.add(params, "straightLength", 20, 200).name("Straight Length").onFinishChange(() => {
      params.positionX = (params.curveLength - params.straightLength) / 2;
      contentGroup.position.x = params.positionX;
    });
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
    contentGroup.position.set(params.positionX, params.positionY, 0);
    contentGroup.rotation.z = THREE.MathUtils.degToRad(params.globalRotation);

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
    threeRoot.scene.background = new THREE.Color(params.colorBg);
    threeRoot.scene.fog = new THREE.FogExp2(params.colorBg, tunnelFogDensity);
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] hide");
    }
    group.visible = false;
    isVisible = false;
    threeRoot.scene.background = null;
    threeRoot.scene.fog = null;
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
