import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const DISSOLVE_CONFIG = {
  modelUrls: ["https://lionelephant2026.netlify.app/scripts/ASSETS/dissolve.glb", "/scripts/ASSETS/dissolve.glb"],
  edge: 0.06,
  frequency: 1.35,
  roughness: 0.2,
  metalness: 0.85,
  baseColor: "#191923",
  edgeColor: "#bc6dff",
  particleCount: 2200,
  particleBand: 0.1,
  particleSize: 0.03,
  particleSpread: 0.18,
  particleSpeed: 0.65,
  bloomStrength: 1.5,
  bloomRadius: 0.2,
  bloomThreshold: 0.1,
};

const FALLBACK_COLORS = {
  top: "#120f1f",
  mid: "#412126",
  bottom: "#f57b28",
};

function createFallbackPlane(THREE, colors) {
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

async function loadGLTFWithFallback(GLTFLoader, urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      if (DEBUG_HERO) {
        console.log("[Hero][Dissolve] loading model:", url);
      }

      const gltf = await new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(url, resolve, undefined, reject);
      });

      if (DEBUG_HERO) {
        console.log("[Hero][Dissolve] model loaded:", url);
      }

      return gltf;
    } catch (error) {
      lastError = error;
      if (DEBUG_HERO) {
        console.warn("[Hero][Dissolve] model load failed:", url, error);
      }
    }
  }

  throw lastError || new Error("Dissolve model loading failed");
}

function fitModelToCamera(THREE, root, camera) {
  root.position.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(root);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const initialCenter = initialBox.getCenter(new THREE.Vector3());

  const maxDim = Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
  const targetSize = 2.1;
  const scale = targetSize / maxDim;

  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  // Recenter in world space AFTER scaling so the mesh lands at the origin.
  const centeredBox = new THREE.Box3().setFromObject(root);
  const centered = centeredBox.getCenter(new THREE.Vector3());
  root.position.sub(centered);
  root.updateMatrixWorld(true);

  if (camera) {
    const fov = (camera.fov * Math.PI) / 180;
    const distanceByHeight = (targetSize * 0.6) / Math.tan(fov * 0.5);
    const distance = Math.max(3.2, distanceByHeight * 1.15);
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
  }

  if (DEBUG_HERO) {
    const finalBox = new THREE.Box3().setFromObject(root);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    const finalCenter = finalBox.getCenter(new THREE.Vector3());
    console.log("[Hero][Dissolve] model bounds size:", initialSize);
    console.log("[Hero][Dissolve] model bounds center:", initialCenter);
    console.log("[Hero][Dissolve] model scale:", scale.toFixed(3));
    console.log("[Hero][Dissolve] model final center:", finalCenter);
    console.log("[Hero][Dissolve] model final size:", finalSize);
    console.log("[Hero][Dissolve] camera position:", camera?.position);
  }
}

function createDissolveMaterial(THREE, TSL, originalMaterial, config) {
  const baseColor = new THREE.Color(config.baseColor);
  if (originalMaterial?.color?.isColor) {
    baseColor.copy(originalMaterial.color);
  }

  const material = new TSL.MeshPhysicalNodeMaterial({
    color: baseColor,
    roughness:
      typeof originalMaterial?.roughness === "number"
        ? originalMaterial.roughness
        : config.roughness,
    metalness:
      typeof originalMaterial?.metalness === "number"
        ? originalMaterial.metalness
        : config.metalness,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const uniforms = {
    progress: TSL.uniform(0),
    edge: TSL.uniform(config.edge),
    frequency: TSL.uniform(config.frequency),
    noiseOffset: TSL.uniform(new THREE.Vector3(0, 2.6, 0)),
    baseColor: TSL.uniform(baseColor),
    edgeColor: TSL.uniform(new THREE.Color(config.edgeColor)),
  };

  // Organic breakup in local/object space.
  const noiseInput = TSL.positionLocal
    .mul(uniforms.frequency)
    .add(uniforms.noiseOffset);

  // MaterialX fractal noise is available in Nodes.js and WebGPU-safe.
  const noiseRaw = TSL.mx_fractal_noise_float(noiseInput, 4, 2, 0.5, 1);
  const noise = noiseRaw.mul(0.5).add(0.5);

  // Inverted reveal required by project:
  // progress 0 => hidden, progress 1 => visible.
  const revealProgress = uniforms.progress.mul(1.25).sub(0.1);
  const dissolveMask = TSL.smoothstep(
    noise.sub(uniforms.edge),
    noise.add(uniforms.edge),
    revealProgress
  );
  const visibilityFloor = uniforms.progress.mul(0.24);
  const visibleMask = TSL.max(dissolveMask, visibilityFloor);

  const distanceToEdge = TSL.abs(noise.sub(revealProgress));
  const edgeMask = TSL.oneMinus(TSL.smoothstep(0.0, uniforms.edge, distanceToEdge));

  material.colorNode = TSL.mix(uniforms.baseColor, uniforms.edgeColor, edgeMask.mul(0.9));
  material.emissiveNode = uniforms.edgeColor.mul(edgeMask).mul(1.45);
  material.opacityNode = visibleMask;
  material.alphaTest = 0.03;

  return {
    material,
    uniforms,
  };
}

function buildSurfaceSamples(THREE, meshes, maxSamples) {
  const positions = [];
  const normals = [];

  meshes.forEach((mesh) => {
    const geom = mesh.geometry;
    const posAttr = geom?.attributes?.position;
    if (!posAttr) return;

    const normalAttr = geom.attributes.normal;
    const sampleStride = Math.max(1, Math.floor(posAttr.count / 1800));

    const matrix = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

    const p = new THREE.Vector3();
    const n = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i += sampleStride) {
      p.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);

      if (normalAttr) {
        n.fromBufferAttribute(normalAttr, i).applyMatrix3(normalMatrix).normalize();
      } else {
        n.set(0, 1, 0);
      }

      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
  });

  const totalVertices = positions.length / 3;
  const sampleCount = Math.min(maxSamples, totalVertices);

  const basePositions = new Float32Array(sampleCount * 3);
  const baseNormals = new Float32Array(sampleCount * 3);
  const seeds = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    const sourceIndex = Math.floor(Math.random() * totalVertices);
    const src = sourceIndex * 3;
    const dst = i * 3;

    basePositions[dst] = positions[src];
    basePositions[dst + 1] = positions[src + 1];
    basePositions[dst + 2] = positions[src + 2];

    baseNormals[dst] = normals[src];
    baseNormals[dst + 1] = normals[src + 1];
    baseNormals[dst + 2] = normals[src + 2];

    seeds[i] = Math.random();
  }

  return {
    sampleCount,
    basePositions,
    baseNormals,
    seeds,
  };
}

function createParticleLayer(THREE, meshes, config) {
  const sampled = buildSurfaceSamples(THREE, meshes, config.particleCount);

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(
    new Float32Array(sampled.sampleCount * 3),
    3
  );
  const colorAttr = new THREE.BufferAttribute(
    new Float32Array(sampled.sampleCount * 3),
    3
  );

  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);

  const material = new THREE.PointsMaterial({
    size: config.particleSize,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);

  return {
    points,
    material,
    geometry,
    positionAttr,
    colorAttr,
    basePositions: sampled.basePositions,
    baseNormals: sampled.baseNormals,
    seeds: sampled.seeds,
    count: sampled.sampleCount,
  };
}

function updateParticleLayer(particleLayer, progress, time, config, edgeColor, visibleAmount) {
  const p = clamp(progress, 0, 1);
  const band = config.particleBand;
  const spread = config.particleSpread;
  const speed = config.particleSpeed;

  const positions = particleLayer.positionAttr.array;
  const colors = particleLayer.colorAttr.array;

  for (let i = 0; i < particleLayer.count; i += 1) {
    const seed = particleLayer.seeds[i];
    const distance = Math.abs(seed - p);
    const active = distance <= band;

    const idx = i * 3;
    const bx = particleLayer.basePositions[idx];
    const by = particleLayer.basePositions[idx + 1];
    const bz = particleLayer.basePositions[idx + 2];

    const nx = particleLayer.baseNormals[idx];
    const ny = particleLayer.baseNormals[idx + 1];
    const nz = particleLayer.baseNormals[idx + 2];

    if (!active || visibleAmount <= 0) {
      positions[idx] = bx;
      positions[idx + 1] = by;
      positions[idx + 2] = bz;
      colors[idx] = 0;
      colors[idx + 1] = 0;
      colors[idx + 2] = 0;
      continue;
    }

    const intensity = 1 - distance / band;
    const drift = intensity * spread;
    const wave = Math.sin(time * (1.6 + seed * 2.4) * speed + seed * 23.0) * 0.03;

    positions[idx] = bx + nx * drift + wave;
    positions[idx + 1] = by + ny * drift + wave * 0.65;
    positions[idx + 2] = bz + nz * drift;

    colors[idx] = edgeColor.r * intensity;
    colors[idx + 1] = edgeColor.g * intensity;
    colors[idx + 2] = edgeColor.b * intensity;
  }

  particleLayer.positionAttr.needsUpdate = true;
  particleLayer.colorAttr.needsUpdate = true;
  particleLayer.material.opacity = visibleAmount;
}

function createDissolveDebugUI(config, handlers) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Dissolve Debug";
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
  panel.style.width = "260px";
  panel.style.maxHeight = "60vh";
  panel.style.overflow = "auto";
  panel.style.zIndex = "9999";
  panel.style.padding = "10px";
  panel.style.border = "1px solid rgba(255,255,255,0.2)";
  panel.style.background = "rgba(0,0,0,0.78)";
  panel.style.color = "#fff";
  panel.style.fontSize = "12px";
  panel.style.display = "none";

  const rows = [];
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
    rows.push(wrap);
  }

  const manualWrap = document.createElement("label");
  manualWrap.style.display = "flex";
  manualWrap.style.alignItems = "center";
  manualWrap.style.gap = "8px";
  manualWrap.style.marginBottom = "10px";

  const manualCheck = document.createElement("input");
  manualCheck.type = "checkbox";
  manualCheck.addEventListener("change", () => {
    handlers.onManualToggle(manualCheck.checked);
  });

  const manualText = document.createElement("span");
  manualText.textContent = "Manual progress";
  manualWrap.appendChild(manualCheck);
  manualWrap.appendChild(manualText);
  panel.appendChild(manualWrap);

  addRow("progress", 0, 1, 0.001, 0, handlers.onManualProgress);
  addRow("edge", 0.005, 0.25, 0.001, config.edge, handlers.onEdge);
  addRow("frequency", 0.1, 8, 0.01, config.frequency, handlers.onFrequency);
  addRow("noiseOffsetY", -10, 10, 0.01, 2.6, handlers.onNoiseOffsetY);
  addRow("particleSize", 0.005, 0.12, 0.001, config.particleSize, handlers.onParticleSize);
  addRow("particleSpeed", 0.05, 3, 0.01, config.particleSpeed, handlers.onParticleSpeed);
  addRow("particleBand", 0.02, 0.5, 0.005, config.particleBand, handlers.onParticleBand);
  addRow("bloomStrength", 0, 3, 0.01, config.bloomStrength, handlers.onBloomStrength);
  addRow("bloomRadius", 0, 1, 0.01, config.bloomRadius, handlers.onBloomRadius);
  addRow("bloomThreshold", 0, 1, 0.01, config.bloomThreshold, handlers.onBloomThreshold);

  button.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  document.body.appendChild(button);
  document.body.appendChild(panel);

  return {
    button,
    panel,
    destroy() {
      if (button.parentNode) button.parentNode.removeChild(button);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    },
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
  const TSL = window.HeroThree?.TSL || null;
  const GLTFLoader = window.HeroThree?.GLTFLoader || window.GLTFLoader;
  const backend = window.HeroThree?.backend || "webgl";

  const group = new THREE.Group();
  group.visible = false;

  let initialized = false;
  let visibleAmount = 0;
  let currentProgress = 0;

  let fallback = null;
  let useFallback = false;

  let dissolveRoot = null;
  let dissolveUniforms = [];
  let dissolveMeshes = [];
  let particleLayer = null;
  let edgeColor = new THREE.Color(DISSOLVE_CONFIG.edgeColor);
  let debugUI = null;
  let manualProgressEnabled = false;
  let manualProgressValue = 0;
  let renderFallbackActive = false;

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "dissolve",
  });

  function buildFallback() {
    useFallback = true;
    fallback = createFallbackPlane(THREE, FALLBACK_COLORS);
    group.add(fallback.mesh);
  }

  async function initWebGPUDissolve() {
    const gltf = await loadGLTFWithFallback(GLTFLoader, DISSOLVE_CONFIG.modelUrls);

    dissolveRoot = gltf.scene;
    dissolveRoot.updateMatrixWorld(true);

    fitModelToCamera(THREE, dissolveRoot, threeRoot.camera);

    const lit = new THREE.DirectionalLight(0xffffff, 1.4);
    lit.position.set(1.6, 1.2, 2.3);
    group.add(lit);

    const ambient = new THREE.AmbientLight(0x777777, 0.9);
    group.add(ambient);

    const rim = new THREE.PointLight(0xbc6dff, 1.8, 8);
    rim.position.set(-1.8, 1.1, 1.6);
    group.add(rim);

    const meshes = [];

    dissolveRoot.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const result = createDissolveMaterial(THREE, TSL, child.material, DISSOLVE_CONFIG);
        child.material = result.material;
        dissolveUniforms.push(result.uniforms);
        meshes.push(child);
      }
    });

    if (!meshes.length) {
      throw new Error("No mesh found in dissolve model");
    }
    dissolveMeshes = meshes;

    group.add(dissolveRoot);

    particleLayer = createParticleLayer(THREE, meshes, DISSOLVE_CONFIG);
    group.add(particleLayer.points);
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;

    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] init");
    }

    threeRoot.scene.add(group);

    const canUseAdvanced =
      backend === "webgpu" &&
      Boolean(TSL?.MeshPhysicalNodeMaterial) &&
      Boolean(TSL?.uniform) &&
      Boolean(TSL?.mx_fractal_noise_float) &&
      Boolean(TSL?.positionLocal) &&
      Boolean(TSL?.smoothstep) &&
      Boolean(TSL?.oneMinus) &&
      Boolean(TSL?.mix) &&
      Boolean(TSL?.abs) &&
      Boolean(GLTFLoader);

    if (!canUseAdvanced) {
      if (DEBUG_HERO) {
        console.warn("[Hero][Dissolve] advanced dissolve unavailable, using fallback plane");
      }
      buildFallback();
      return;
    }

    void initWebGPUDissolve().catch((error) => {
      if (DEBUG_HERO) {
        console.error("[Hero][Dissolve] advanced dissolve init failed, using fallback", error);
      }

      if (dissolveRoot && dissolveRoot.parent) {
        dissolveRoot.parent.remove(dissolveRoot);
      }

      dissolveRoot = null;
      dissolveUniforms = [];

      if (!fallback) {
        buildFallback();
      }
    });

    if (!debugUI) {
      debugUI = createDissolveDebugUI(DISSOLVE_CONFIG, {
        onManualToggle(value) {
          manualProgressEnabled = value;
        },
        onManualProgress(value) {
          manualProgressValue = value;
        },
        onEdge(value) {
          DISSOLVE_CONFIG.edge = value;
          dissolveUniforms.forEach((u) => {
            u.edge.value = value;
          });
        },
        onFrequency(value) {
          DISSOLVE_CONFIG.frequency = value;
          dissolveUniforms.forEach((u) => {
            u.frequency.value = value;
          });
        },
        onNoiseOffsetY(value) {
          dissolveUniforms.forEach((u) => {
            u.noiseOffset.value.y = value;
          });
        },
        onParticleSize(value) {
          DISSOLVE_CONFIG.particleSize = value;
          if (particleLayer) particleLayer.material.size = value;
        },
        onParticleSpeed(value) {
          DISSOLVE_CONFIG.particleSpeed = value;
        },
        onParticleBand(value) {
          DISSOLVE_CONFIG.particleBand = value;
        },
        onBloomStrength(value) {
          DISSOLVE_CONFIG.bloomStrength = value;
          threeRoot.setPostFXPreset?.("dissolve", {
            bloomStrength: DISSOLVE_CONFIG.bloomStrength,
            bloomRadius: DISSOLVE_CONFIG.bloomRadius,
            bloomThreshold: DISSOLVE_CONFIG.bloomThreshold,
          });
        },
        onBloomRadius(value) {
          DISSOLVE_CONFIG.bloomRadius = value;
          threeRoot.setPostFXPreset?.("dissolve", {
            bloomStrength: DISSOLVE_CONFIG.bloomStrength,
            bloomRadius: DISSOLVE_CONFIG.bloomRadius,
            bloomThreshold: DISSOLVE_CONFIG.bloomThreshold,
          });
        },
        onBloomThreshold(value) {
          DISSOLVE_CONFIG.bloomThreshold = value;
          threeRoot.setPostFXPreset?.("dissolve", {
            bloomStrength: DISSOLVE_CONFIG.bloomStrength,
            bloomRadius: DISSOLVE_CONFIG.bloomRadius,
            bloomThreshold: DISSOLVE_CONFIG.bloomThreshold,
          });
        },
      });
    }
  }

  function updateFallback(progress) {
    const p = clamp(manualProgressEnabled ? manualProgressValue : progress, 0, 1);
    const color = fallback.colorMid.clone();

    if (p < 0.5) {
      color.lerpColors(fallback.colorTop, fallback.colorMid, p / 0.5);
    } else {
      color.lerpColors(fallback.colorMid, fallback.colorBottom, (p - 0.5) / 0.5);
    }

    fallback.material.color.copy(color);
    fallback.material.opacity = visibleAmount;
    fallback.mesh.rotation.z = (p - 0.5) * 0.12;
  }

  function update(progress) {
    const p = clamp(manualProgressEnabled ? manualProgressValue : progress, 0, 1);
    currentProgress = p;
    cues.update(p);

    if (!initialized) {
      return;
    }

    if (fallback) {
      updateFallback(p);
      return;
    }

    if (!dissolveUniforms.length) {
      if (renderFallbackActive && dissolveMeshes.length) {
        dissolveMeshes.forEach((mesh) => {
          if (!mesh.material) return;
          mesh.material.opacity = visibleAmount * (0.12 + p * 0.88);
          mesh.material.transparent = true;
        });
      }
      return;
    }

    dissolveUniforms.forEach((u) => {
      u.progress.value = p;
    });

    if (particleLayer) {
      updateParticleLayer(
        particleLayer,
        p,
        performance.now() * 0.001,
        DISSOLVE_CONFIG,
        edgeColor,
        visibleAmount
      );
    }
  }

  function tick() {
    if (!initialized || !group.visible || !particleLayer || fallback || renderFallbackActive) {
      return;
    }

    updateParticleLayer(
      particleLayer,
      currentProgress,
      performance.now() * 0.001,
      DISSOLVE_CONFIG,
      edgeColor,
      visibleAmount
    );
  }

  function show() {
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] show");
    }

    group.visible = true;
    visibleAmount = 1;

    if (fallback) {
      fallback.material.opacity = visibleAmount;
    }
    if (particleLayer) {
      particleLayer.material.opacity = visibleAmount;
    }

    threeRoot.setPostFXPreset?.("dissolve", {
      bloomStrength: DISSOLVE_CONFIG.bloomStrength,
      bloomRadius: DISSOLVE_CONFIG.bloomRadius,
      bloomThreshold: DISSOLVE_CONFIG.bloomThreshold,
    });
  }

  function hide() {
    if (DEBUG_HERO) {
      console.log("[Hero][Dissolve] hide");
    }

    visibleAmount = 0;

    if (fallback) {
      fallback.material.opacity = 0;
    }
    if (particleLayer) {
      particleLayer.material.opacity = 0;
    }

    group.visible = false;
    threeRoot.clearPostFXPreset?.();
  }

  function destroy() {
    cues.destroy();

    if (!initialized) {
      return;
    }

    if (fallback) {
      fallback.mesh.geometry.dispose();
      fallback.material.dispose();
      fallback = null;
    }

    if (particleLayer) {
      particleLayer.geometry.dispose();
      particleLayer.material.dispose();
      if (particleLayer.points.parent) {
        particleLayer.points.parent.remove(particleLayer.points);
      }
      particleLayer = null;
    }

    if (dissolveRoot) {
      dissolveRoot.traverse((child) => {
        if (child.isMesh && child.material?.dispose) {
          child.material.dispose();
        }
      });

      if (dissolveRoot.parent) {
        dissolveRoot.parent.remove(dissolveRoot);
      }
      dissolveRoot = null;
      dissolveMeshes = [];
    }

    if (group.parent) {
      group.parent.remove(group);
    }
    if (debugUI) {
      debugUI.destroy();
      debugUI = null;
    }
    threeRoot.clearPostFXPreset?.();
  }

  return {
    init,
    update,
    tick,
    show,
    hide,
    resize() {},
    onRenderError(error) {
      if (renderFallbackActive || !dissolveRoot) {
        return;
      }
      renderFallbackActive = true;
      dissolveUniforms = [];

      if (DEBUG_HERO) {
        console.warn("[Hero][Dissolve] switching to safe material fallback after render error", error);
      }

      dissolveRoot.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (child.material?.dispose) {
          child.material.dispose();
        }
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(DISSOLVE_CONFIG.baseColor),
          emissive: new THREE.Color(DISSOLVE_CONFIG.edgeColor).multiplyScalar(0.35),
          roughness: 0.35,
          metalness: 0.75,
          transparent: true,
          opacity: visibleAmount,
          side: THREE.DoubleSide,
        });
      });

      if (particleLayer) {
        particleLayer.material.opacity = 0;
      }
    },
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
