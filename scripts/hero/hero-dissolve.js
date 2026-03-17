import { clamp, createCueController } from "../utils.js";

const DEBUG_HERO = true;

const DISSOLVE_CONFIG = {
  modelUrls: [
    "https://lionelephant2026.netlify.app/scripts/ASSETS/dissolve.glb",
    "/scripts/ASSETS/dissolve.glb",
  ],
  edge: 0.055,
  frequency: 1.3,
  noiseOffsetY: 3,
  roughness: 0.2,
  metalness: 0.88,
  baseColor: "#ffffff",
  particleColor: "#bc6dff",
  particleCount: 12000,
  particleSize: 1,
  particleSpeed: 0.001,
  decayFrequency: 1,
  decayDistance: 0.2,
  bloomStrength: 1.5,
  bloomRadius: 0.2,
  bloomThreshold: 0.1,
};

const FALLBACK_COLORS = {
  top: "#120f1f",
  mid: "#412126",
  bottom: "#f57b28",
};

function getWebGPUContext() {
  const heroThree = window.HeroThree || {};
  const rawWebGPU = heroThree.rawWebGPUModule || {};
  const rawTSL = heroThree.rawTSLModule || {};
  return {
    WEBGPU: { ...rawWebGPU, ...(heroThree.WEBGPU || {}) },
    TSL: { ...rawTSL, ...(heroThree.TSL || {}) },
    MeshSurfaceSampler: heroThree.MeshSurfaceSampler || null,
    GLTFLoader: heroThree.GLTFLoader || window.GLTFLoader || null,
    backend: heroThree.backend || "webgl",
  };
}

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
    console.log("[Hero][Dissolve] model bounds size:", initialSize);
    console.log("[Hero][Dissolve] model bounds center:", initialCenter);
    console.log("[Hero][Dissolve] model scale:", scale.toFixed(3));
    console.log("[Hero][Dissolve] model final center:", finalBox.getCenter(new THREE.Vector3()));
    console.log("[Hero][Dissolve] model final size:", finalBox.getSize(new THREE.Vector3()));
    console.log("[Hero][Dissolve] camera position:", camera?.position);
  }
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
  addRow("noiseOffsetY", -10, 10, 0.01, config.noiseOffsetY, handlers.onNoiseOffsetY);
  addRow("particleSize", 0.05, 2, 0.001, config.particleSize, handlers.onParticleSize);
  addRow("particleSpeed", 0, 0.005, 0.0001, config.particleSpeed, handlers.onParticleSpeed);
  addRow("decayFrequency", 0, 2, 0.001, config.decayFrequency, handlers.onDecayFrequency);
  addRow("bloomStrength", 0, 3, 0.01, config.bloomStrength, handlers.onBloomStrength);
  addRow("bloomRadius", 0, 1, 0.01, config.bloomRadius, handlers.onBloomRadius);
  addRow("bloomThreshold", 0, 1, 0.01, config.bloomThreshold, handlers.onBloomThreshold);

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

function createReferenceDissolveMesh({
  THREE,
  WEBGPU,
  TSL,
  MeshSurfaceSampler,
  renderer,
  mesh,
  sourceMaterial,
  config,
}) {
  const {
    MeshStandardNodeMaterial,
    SpriteNodeMaterial,
    InstancedMesh,
    PlaneGeometry,
    AdditiveBlending,
    DoubleSide,
    Color,
    Vector3,
  } = WEBGPU;
  const {
    Discard,
    Fn,
    If,
    deltaTime,
    float,
    hash,
    instanceIndex,
    instancedArray,
    length,
    min,
    output,
    positionLocal,
    select,
    sin,
    uniform,
    uv,
    vec3,
    vec4,
    mx_fractal_noise_float,
  } = TSL;

  if (
    !MeshStandardNodeMaterial ||
    !SpriteNodeMaterial ||
    !InstancedMesh ||
    !PlaneGeometry ||
    !MeshSurfaceSampler ||
    !renderer?.computeAsync ||
    !Fn ||
    !uniform ||
    !positionLocal ||
    !mx_fractal_noise_float
  ) {
    throw new Error("Reference dissolve dependencies are unavailable");
  }

  const baseColor = new Color(config.baseColor);
  if (sourceMaterial?.color?.isColor) {
    baseColor.copy(sourceMaterial.color);
  }

  const material = new MeshStandardNodeMaterial({
    roughness: config.roughness,
    metalness: config.metalness,
  });
  material.side = DoubleSide;

  const uniforms = {
    progress: uniform(0),
    edge: uniform(config.edge),
    frequency: uniform(config.frequency),
    noiseOffset: uniform(vec3(0, config.noiseOffsetY, 0)),
    baseColor: uniform(baseColor),
    particles: {
      size: uniform(config.particleSize),
      speed: uniform(config.particleSpeed),
      decayFrequency: uniform(config.decayFrequency),
      decayDistance: uniform(config.decayDistance),
      color: uniform(new Color(config.particleColor)),
    },
  };

  const noise = Fn(() => {
    const sample = positionLocal.add(uniforms.noiseOffset).mul(uniforms.frequency);
    return mx_fractal_noise_float(sample, 4, 2, 0.5, 1);
  })();

  const mappedProgress = float(1)
    .sub(uniforms.progress)
    .remap(0, 1, -1, 1)
    .toVar("mappedProgress");
  const edgeWidth = mappedProgress.add(uniforms.edge).toVar("edgeWidth");
  const isEdge = noise
    .greaterThan(mappedProgress)
    .and(noise.lessThan(edgeWidth))
    .toVar("isEdge");

  material.emissiveNode = select(isEdge, uniforms.particles.color, vec3(0));
  material.colorNode = Fn(() => {
    Discard(noise.lessThan(mappedProgress));
    return select(
      isEdge,
      vec4(uniforms.particles.color, 1),
      vec4(uniforms.baseColor, 1)
    );
  })();

  mesh.material = material;

  const particlesMaterial = new SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    blending: AdditiveBlending,
  });

  const particleCount = Math.max(1, config.particleCount);
  const particlesMesh = new InstancedMesh(new PlaneGeometry(), particlesMaterial, particleCount);
  mesh.add(particlesMesh);

  const sampler = new MeshSurfaceSampler(mesh).build();
  const samplePosition = new Vector3();
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i += 1) {
    sampler.sample(samplePosition);
    positions[i * 3] = samplePosition.x;
    positions[i * 3 + 1] = samplePosition.y;
    positions[i * 3 + 2] = samplePosition.z;
  }

  const particlesBasePositionsBuffer = instancedArray(positions, "vec3");
  const particlesPositionsBuffer = instancedArray(positions, "vec3");
  const particlesVelocitiesBuffer = instancedArray(particleCount * 3, "vec3");
  const particlesLifeBuffer = instancedArray(particleCount, "float");

  renderer.computeAsync(
    Fn(() => {
      particlesVelocitiesBuffer.element(instanceIndex).assign(vec3(0));
      particlesLifeBuffer.element(instanceIndex).assign(hash(instanceIndex));
    })().compute(particleCount)
  );

  particlesMaterial.positionNode = Fn(() => {
    const life = particlesLifeBuffer.element(instanceIndex);
    const velocity = particlesVelocitiesBuffer.element(instanceIndex);
    const basePositionNode = particlesBasePositionsBuffer.element(instanceIndex);
    const positionNode = particlesPositionsBuffer.element(instanceIndex);

    const newPosition = positionNode.toVar("newPosition");
    const newLife = life.toVar("newLife");
    const newVelocity = velocity.toVar("newVelocity");

    const xWave1 = sin(newPosition.y.mul(20)).mul(0.8);
    const xWave2 = sin(newPosition.y.mul(50)).mul(0.7);
    newVelocity.addAssign(vec3(xWave1.add(xWave2), 1, 0).mul(deltaTime.mul(uniforms.particles.speed)));
    newPosition.addAssign(newVelocity);

    const distanceDecay = basePositionNode
      .distance(positionNode)
      .remapClamp(0, 1, uniforms.particles.decayDistance, 1);

    newLife.assign(
      life
        .add(deltaTime.mul(uniforms.particles.decayFrequency).mul(distanceDecay))
    );

    If(newLife.greaterThan(1), () => {
      newPosition.assign(basePositionNode);
      newVelocity.assign(vec3(0));
    });

    newLife.assign(newLife.mod(1));

    positionNode.assign(newPosition);
    velocity.assign(newVelocity);
    life.assign(newLife);

    return positionNode;
  })().compute(particleCount);

  particlesMaterial.scaleNode = Fn(() => {
    const life = particlesLifeBuffer.element(instanceIndex);
    return float(0.05)
      .mul(uniforms.particles.size)
      .mul(hash(instanceIndex).mul(0.4).add(0.6))
      .mul(min(life.smoothstep(0, 0.1), life.smoothstep(0.5, 1).oneMinus()));
  })();

  particlesMaterial.colorNode = Fn(() => {
    Discard(isEdge.not());

    const distanceToCenter = length(uv().sub(0.5));
    const value = 0.05;
    const alpha = float(value)
      .div(distanceToCenter)
      .sub(value * 2);

    return vec4(uniforms.particles.color, alpha);
  })();

  return {
    mesh,
    particlesMesh,
    uniforms,
    dispose() {
      particlesBasePositionsBuffer.dispose();
      particlesPositionsBuffer.dispose();
      particlesVelocitiesBuffer.dispose();
      particlesLifeBuffer.dispose();
      if (particlesMesh.parent) {
        particlesMesh.parent.remove(particlesMesh);
      }
      particlesMesh.geometry.dispose();
      particlesMaterial.dispose();
      material.dispose();
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
  const { WEBGPU, TSL, MeshSurfaceSampler, GLTFLoader, backend } = getWebGPUContext();

  const group = new THREE.Group();
  group.visible = false;

  let initialized = false;
  let visibleAmount = 0;
  let currentProgress = 0;
  let fallback = null;
  let dissolveRoot = null;
  let dissolveParts = [];
  let debugUI = null;
  let manualProgressEnabled = false;
  let manualProgressValue = 0;
  let pointLight1 = null;
  let pointLight2 = null;
  let lastTickTime = performance.now() * 0.001;

  const cues = createCueController({
    scopeEl: cueScopeEl,
    selector: cueSelector,
    stageName: "dissolve",
  });

  function buildFallback() {
    fallback = createFallbackPlane(THREE, FALLBACK_COLORS);
    group.add(fallback.mesh);
  }

  function applyConfigToDissolve() {
    dissolveParts.forEach((part) => {
      part.uniforms.edge.value = DISSOLVE_CONFIG.edge;
      part.uniforms.frequency.value = DISSOLVE_CONFIG.frequency;
      part.uniforms.noiseOffset.value.y = DISSOLVE_CONFIG.noiseOffsetY;
      part.uniforms.particles.size.value = DISSOLVE_CONFIG.particleSize;
      part.uniforms.particles.speed.value = DISSOLVE_CONFIG.particleSpeed;
      part.uniforms.particles.decayFrequency.value = DISSOLVE_CONFIG.decayFrequency;
      part.uniforms.particles.decayDistance.value = DISSOLVE_CONFIG.decayDistance;
      part.uniforms.particles.color.value.set(DISSOLVE_CONFIG.particleColor);
    });

    threeRoot.setPostFXPreset?.("dissolve", {
      bloomStrength: DISSOLVE_CONFIG.bloomStrength,
      bloomRadius: DISSOLVE_CONFIG.bloomRadius,
      bloomThreshold: DISSOLVE_CONFIG.bloomThreshold,
    });
  }

  async function initAdvancedDissolve() {
    const gltf = await loadGLTFWithFallback(GLTFLoader, DISSOLVE_CONFIG.modelUrls);
    dissolveRoot = gltf.scene;
    dissolveRoot.updateMatrixWorld(true);

    fitModelToCamera(THREE, dissolveRoot, threeRoot.camera);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    directionalLight.position.set(1, 1, 1);
    group.add(directionalLight);

    pointLight1 = new THREE.PointLight(0xff6b6b, 1.5, 10);
    pointLight2 = new THREE.PointLight(0x4ecdc4, 1.5, 10);
    group.add(pointLight1);
    group.add(pointLight2);

    dissolveRoot.traverse((child) => {
      if (!child.isMesh || !child.geometry) {
        return;
      }

      if (!child.geometry.attributes?.normal && typeof child.geometry.computeVertexNormals === "function") {
        child.geometry.computeVertexNormals();
      }

      const dissolvePart = createReferenceDissolveMesh({
        THREE,
        WEBGPU,
        TSL,
        MeshSurfaceSampler,
        renderer: threeRoot.renderer,
        mesh: child,
        sourceMaterial: child.material,
        config: DISSOLVE_CONFIG,
      });

      dissolveParts.push(dissolvePart);
    });

    if (!dissolveParts.length) {
      throw new Error("No renderable mesh found for dissolve");
    }

    group.add(dissolveRoot);
    applyConfigToDissolve();
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
      GLTFLoader &&
      MeshSurfaceSampler &&
      WEBGPU?.MeshStandardNodeMaterial &&
      WEBGPU?.SpriteNodeMaterial &&
      WEBGPU?.InstancedMesh &&
      TSL?.Fn &&
      TSL?.uniform &&
      TSL?.mx_fractal_noise_float;

    if (!canUseAdvanced) {
      if (DEBUG_HERO) {
        console.warn("[Hero][Dissolve] advanced dissolve unavailable, using fallback plane");
      }
      buildFallback();
    } else {
      void initAdvancedDissolve().catch((error) => {
        if (DEBUG_HERO) {
          console.error("[Hero][Dissolve] advanced dissolve init failed, using fallback", error);
        }

        if (dissolveRoot && dissolveRoot.parent) {
          dissolveRoot.parent.remove(dissolveRoot);
        }
        dissolveRoot = null;
        dissolveParts = [];

        if (!fallback) {
          buildFallback();
        }
      });
    }

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
          applyConfigToDissolve();
        },
        onFrequency(value) {
          DISSOLVE_CONFIG.frequency = value;
          applyConfigToDissolve();
        },
        onNoiseOffsetY(value) {
          DISSOLVE_CONFIG.noiseOffsetY = value;
          applyConfigToDissolve();
        },
        onParticleSize(value) {
          DISSOLVE_CONFIG.particleSize = value;
          applyConfigToDissolve();
        },
        onParticleSpeed(value) {
          DISSOLVE_CONFIG.particleSpeed = value;
          applyConfigToDissolve();
        },
        onDecayFrequency(value) {
          DISSOLVE_CONFIG.decayFrequency = value;
          applyConfigToDissolve();
        },
        onBloomStrength(value) {
          DISSOLVE_CONFIG.bloomStrength = value;
          applyConfigToDissolve();
        },
        onBloomRadius(value) {
          DISSOLVE_CONFIG.bloomRadius = value;
          applyConfigToDissolve();
        },
        onBloomThreshold(value) {
          DISSOLVE_CONFIG.bloomThreshold = value;
          applyConfigToDissolve();
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

    dissolveParts.forEach((part) => {
      part.uniforms.progress.value = p;
    });
  }

  function tick() {
    if (!initialized || !group.visible || fallback || !pointLight1 || !pointLight2) {
      return;
    }

    const now = performance.now() * 0.001;
    lastTickTime = now;

    const time = now * 0.8;
    const radius = 4;

    pointLight1.position.x = radius * Math.sin(time);
    pointLight1.position.y = radius * Math.sin(time) * Math.cos(time);
    pointLight1.position.z = 0;

    pointLight2.position.x = radius * Math.sin(time + Math.PI + 0.3);
    pointLight2.position.y =
      radius * Math.sin(time + Math.PI + 0.3) * Math.cos(time + Math.PI + 0.3);
    pointLight2.position.z = 0;
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

    dissolveParts.forEach((part) => {
      part.dispose();
    });
    dissolveParts = [];

    if (dissolveRoot && dissolveRoot.parent) {
      dissolveRoot.parent.remove(dissolveRoot);
      dissolveRoot = null;
    }

    if (debugUI) {
      debugUI.destroy();
      debugUI = null;
    }

    if (group.parent) {
      group.parent.remove(group);
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
    destroy,
    get initialized() {
      return initialized;
    },
  };
}
