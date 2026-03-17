import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const TUNNEL_CONFIG = {
  colorLine: "#373f48",
  lineCount: 80,
  spreadHeight: 30.33,
  spreadDepth: 0,
  curveLength: 50,
  straightLength: 100,
  curvePower: 0.8265,
  convergeWidth: 1.6,
  waveSpeed: 2.48,
  waveHeight: 0.145,
  lineOpacity: 0.55,
  segmentCount: 150,
  maxTrail: 150,
  bloomStrength: 2.2,
  bloomRadius: 0.5,
  bloomThreshold: 0.15,
  signalDensity: 1,
  debug: true,
};

const SIGNAL_GROUP_CONFIG = [
  { name: "Blue", color: "#8fc9ff", enabled: true, count: 94, speed: 0.345, trailLength: 3 },
  { name: "Pink", color: "#ff0055", enabled: false, count: 24, speed: 0.29, trailLength: 3 },
  { name: "Amber", color: "#ffcc00", enabled: false, count: 18, speed: 0.32, trailLength: 3 },
  { name: "Cyan", color: "#00ffd5", enabled: false, count: 18, speed: 0.31, trailLength: 3 },
  { name: "Violet", color: "#a855ff", enabled: false, count: 16, speed: 0.34, trailLength: 3 },
  { name: "Green", color: "#00ff66", enabled: false, count: 16, speed: 0.3, trailLength: 3 },
];

function getPathPoint(THREE, t, lineIndex, time, params) {
  const totalLen = params.curveLength + params.straightLength;
  const currentX = -params.curveLength + t * totalLen;

  let y = 0;
  let z = 0;
  const spreadFactor = (lineIndex / Math.max(1, params.lineCount - 1) - 0.5) * 2;

  if (currentX < 0) {
    const ratio = (currentX + params.curveLength) / Math.max(0.0001, params.curveLength);
    let shapeFactor = (Math.cos(ratio * Math.PI) + 1) / 2;
    shapeFactor = Math.pow(shapeFactor, params.curvePower);

    const spread = params.convergeWidth + (params.spreadHeight - params.convergeWidth) * shapeFactor;
    y = spreadFactor * spread;

    const spreadZ = params.convergeWidth + (params.spreadDepth - params.convergeWidth) * shapeFactor;
    z = spreadFactor * spreadZ;

    const wave = Math.sin(time * params.waveSpeed + currentX * 0.1 + lineIndex) * params.waveHeight * shapeFactor;
    y += wave;
  }

  return new THREE.Vector3(currentX, y, z);
}

function createTunnelDebugUI(params, handlers) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Tunnel Debug";
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "16px";
  button.style.zIndex = "9999";
  button.style.padding = "8px 10px";
  button.style.fontSize = "12px";
  button.style.border = "1px solid rgba(255,255,255,0.25)";
  button.style.background = "rgba(0,0,0,0.65)";
  button.style.color = "#fff";
  button.style.cursor = "pointer";

  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "52px";
  panel.style.width = "280px";
  panel.style.maxHeight = "60vh";
  panel.style.overflow = "auto";
  panel.style.zIndex = "9999";
  panel.style.padding = "10px";
  panel.style.border = "1px solid rgba(255,255,255,0.2)";
  panel.style.background = "rgba(0,0,0,0.78)";
  panel.style.color = "#fff";
  panel.style.fontSize = "12px";
  panel.style.display = "none";

  function addRow(label, min, max, step, value, onChange) {
    const wrap = document.createElement("label");
    wrap.style.display = "block";
    wrap.style.marginBottom = "8px";

    const title = document.createElement("div");
    title.textContent = `${label}: ${value}`;
    title.style.marginBottom = "4px";

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.width = "100%";

    input.addEventListener("input", () => {
      const nextValue = Number(input.value);
      title.textContent = `${label}: ${nextValue.toFixed(3)}`;
      onChange(nextValue);
    });

    wrap.appendChild(title);
    wrap.appendChild(input);
    panel.appendChild(wrap);
  }

  addRow("lineCount", 20, 220, 1, params.lineCount, handlers.onLineCount);
  addRow("spreadHeight", 2, 80, 0.1, params.spreadHeight, handlers.onSpreadHeight);
  addRow("waveSpeed", 0, 6, 0.01, params.waveSpeed, handlers.onWaveSpeed);
  addRow("waveHeight", 0, 2.5, 0.005, params.waveHeight, handlers.onWaveHeight);
  addRow("signalDensity", 0, 2, 0.01, params.signalDensity, handlers.onSignalDensity);
  addRow("trailLength", 1, 90, 1, 3, handlers.onTrailLength);
  addRow("bloomStrength", 0, 5, 0.01, params.bloomStrength, handlers.onBloomStrength);
  addRow("bloomRadius", 0, 1, 0.01, params.bloomRadius, handlers.onBloomRadius);
  addRow("bloomThreshold", 0, 1, 0.01, params.bloomThreshold, handlers.onBloomThreshold);

  button.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  document.body.appendChild(button);
  document.body.appendChild(panel);

  return {
    destroy() {
      if (button.parentNode) button.parentNode.removeChild(button);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    },
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
      tick() {},
      show() {},
      hide() {},
      resize() {},
      destroy() {},
    };
  }

  const THREE = threeRoot.THREE;
  const group = new THREE.Group();
  group.visible = false;

  const contentGroup = new THREE.Group();
  contentGroup.position.set((TUNNEL_CONFIG.curveLength - TUNNEL_CONFIG.straightLength) / 2, 0, 0);
  group.add(contentGroup);

  const bgMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(TUNNEL_CONFIG.colorLine),
    transparent: true,
    opacity: TUNNEL_CONFIG.lineOpacity,
    depthWrite: false,
  });

  const signalMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "tunnel",
  });

  let initialized = false;
  let visibleAmount = 0;
  let localProgress = 0;
  let lastTickTime = performance.now() * 0.001;
  let debugUI = null;
  let lines = [];
  let signalGroups = [];
  let runtimeTrailLength = 3;

  function createSignalMesh() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(TUNNEL_CONFIG.maxTrail * 3), 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(TUNNEL_CONFIG.maxTrail * 3), 3)
    );
    const mesh = new THREE.Line(geometry, signalMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    contentGroup.add(mesh);
    return mesh;
  }

  function clearSignalGroup(groupState) {
    groupState.signals.forEach((signal) => {
      contentGroup.remove(signal.mesh);
      signal.mesh.geometry.dispose();
    });
    groupState.signals = [];
  }

  function rebuildSignalGroup(groupState) {
    clearSignalGroup(groupState);

    if (!groupState.enabled) {
      groupState.currentCount = 0;
      return;
    }

    const targetCount = Math.max(0, Math.floor(groupState.count * TUNNEL_CONFIG.signalDensity));
    for (let i = 0; i < targetCount; i += 1) {
      groupState.signals.push({
        mesh: createSignalMesh(),
        laneIndex: Math.floor(Math.random() * TUNNEL_CONFIG.lineCount),
        speed: 0.2 + Math.random() * 0.5,
        progress: Math.random(),
        history: [],
        assignedColor: new THREE.Color(groupState.color),
      });
    }
    groupState.currentCount = targetCount;
  }

  function rebuildAllSignalGroups() {
    signalGroups.forEach((groupState) => rebuildSignalGroup(groupState));
  }

  function rebuildLines() {
    lines.forEach((line) => {
      contentGroup.remove(line);
      line.geometry.dispose();
    });
    lines = [];

    for (let i = 0; i < TUNNEL_CONFIG.lineCount; i += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(TUNNEL_CONFIG.segmentCount * 3), 3)
      );
      const line = new THREE.Line(geometry, bgMaterial);
      line.userData = { id: i };
      line.renderOrder = 0;
      contentGroup.add(line);
      lines.push(line);
    }

    rebuildAllSignalGroups();
  }

  function initSignalGroups() {
    signalGroups = SIGNAL_GROUP_CONFIG.map((entry) => ({
      ...entry,
      currentCount: 0,
      runtimeSpeed: entry.speed,
      signals: [],
    }));
  }

  function applyProgressEnergy() {
    const p = localProgress;
    const speedScale = 0.45 + p * 1.35;
    const waveScale = 0.35 + p * 1.25;
    const densityScale = 0.2 + p * 1.35;
    const trailScale = 0.45 + p * 1.2;

    TUNNEL_CONFIG.signalDensity = densityScale;
    bgMaterial.opacity = visibleAmount * (0.18 + p * 0.45);
    TUNNEL_CONFIG.waveHeight = 0.08 * waveScale;
    runtimeTrailLength = Math.max(1, Math.floor(3 * trailScale));

    signalGroups.forEach((groupState) => {
      groupState.runtimeSpeed = groupState.speed * speedScale;
      const targetCount = Math.max(
        1,
        Math.floor(groupState.count * Math.max(0.05, TUNNEL_CONFIG.signalDensity))
      );
      if (targetCount !== groupState.currentCount) {
        rebuildSignalGroup(groupState);
      }
    });
  }

  function updateBackgroundLines(time) {
    lines.forEach((line) => {
      const positions = line.geometry.attributes.position.array;
      const lineId = line.userData.id;

      for (let j = 0; j < TUNNEL_CONFIG.segmentCount; j += 1) {
        const t = j / (TUNNEL_CONFIG.segmentCount - 1);
        const vec = getPathPoint(THREE, t, lineId, time, TUNNEL_CONFIG);
        positions[j * 3] = vec.x;
        positions[j * 3 + 1] = vec.y;
        positions[j * 3 + 2] = vec.z;
      }
      line.geometry.attributes.position.needsUpdate = true;
    });
  }

  function updateSignals(time, dt) {
    signalGroups.forEach((groupState) => {
      if (!groupState.enabled || groupState.signals.length === 0) {
        return;
      }

      const trailLength = Math.max(1, Math.floor(groupState.trailLength * (runtimeTrailLength / 3)));
      const drawCount = Math.max(1, trailLength);

      groupState.signals.forEach((signal) => {
        signal.progress += signal.speed * 0.6 * groupState.runtimeSpeed * dt;

        if (signal.progress > 1.0) {
          signal.progress = 0;
          signal.laneIndex = Math.floor(Math.random() * TUNNEL_CONFIG.lineCount);
          signal.history = [];
          signal.assignedColor.set(groupState.color);
        }

        const pos = getPathPoint(
          THREE,
          signal.progress,
          signal.laneIndex,
          time,
          TUNNEL_CONFIG
        );

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

          const alpha = Math.max(0, 1 - i / trailLength);
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

  function applyTunnelPostFx() {
    threeRoot.setPostFXPreset?.("tunnel", {
      bloomStrength: TUNNEL_CONFIG.bloomStrength,
      bloomRadius: TUNNEL_CONFIG.bloomRadius,
      bloomThreshold: TUNNEL_CONFIG.bloomThreshold,
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

    initSignalGroups();
    rebuildLines();

    threeRoot.camera.position.set(0, 0, 90);
    threeRoot.camera.near = 1;
    threeRoot.camera.far = 1000;
    threeRoot.camera.lookAt(0, 0, 0);
    threeRoot.camera.updateProjectionMatrix();

    group.rotation.z = 0;
    contentGroup.position.x = (TUNNEL_CONFIG.curveLength - TUNNEL_CONFIG.straightLength) / 2;
    threeRoot.scene.add(group);

    if (TUNNEL_CONFIG.debug && !debugUI) {
      debugUI = createTunnelDebugUI(TUNNEL_CONFIG, {
        onLineCount(value) {
          TUNNEL_CONFIG.lineCount = Math.max(10, Math.floor(value));
          rebuildLines();
        },
        onSpreadHeight(value) {
          TUNNEL_CONFIG.spreadHeight = value;
        },
        onWaveSpeed(value) {
          TUNNEL_CONFIG.waveSpeed = value;
        },
        onWaveHeight(value) {
          TUNNEL_CONFIG.waveHeight = value;
        },
        onSignalDensity(value) {
          TUNNEL_CONFIG.signalDensity = value;
          rebuildAllSignalGroups();
        },
        onTrailLength(value) {
          runtimeTrailLength = Math.max(1, Math.floor(value));
          signalGroups.forEach((groupState) => {
            groupState.trailLength = runtimeTrailLength;
          });
        },
        onBloomStrength(value) {
          TUNNEL_CONFIG.bloomStrength = value;
          applyTunnelPostFx();
        },
        onBloomRadius(value) {
          TUNNEL_CONFIG.bloomRadius = value;
          applyTunnelPostFx();
        },
        onBloomThreshold(value) {
          TUNNEL_CONFIG.bloomThreshold = value;
          applyTunnelPostFx();
        },
      });
    }
  }

  function update(progress) {
    const p = clamp(progress, 0, 1);
    localProgress = p;
    cues.update(p);
    applyProgressEnergy();
  }

  function tick() {
    if (!initialized || !group.visible) {
      return;
    }

    const now = performance.now() * 0.001;
    const dt = Math.min(0.05, Math.max(0.001, now - lastTickTime));
    lastTickTime = now;

    updateBackgroundLines(now);
    updateSignals(now, dt);
  }

  function show() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] show");
    }
    group.visible = true;
    visibleAmount = 1;
    applyTunnelPostFx();
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Tunnel] hide");
    }
    visibleAmount = 0;
    group.visible = false;
    threeRoot.clearPostFXPreset?.();
  }

  function destroy() {
    cues.destroy();
    if (!initialized) {
      return;
    }

    lines.forEach((line) => {
      contentGroup.remove(line);
      line.geometry.dispose();
    });
    lines = [];

    signalGroups.forEach((groupState) => clearSignalGroup(groupState));
    signalGroups = [];

    bgMaterial.dispose();
    signalMaterial.dispose();

    if (debugUI) {
      debugUI.destroy();
      debugUI = null;
    }

    if (group.parent) {
      group.parent.remove(group);
    }
  }

  return {
    init,
    update,
    tick,
    show,
    hide,
    resize() {},
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
