
  import * as THREE from "https://esm.sh/three@0.160.0";
  import { EffectComposer } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
  import { RenderPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
  import { UnrealBloomPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";
  import GUI from "https://esm.sh/lil-gui@0.19.2";

  (() => {
    const mount = document.getElementById("data-tunnel");
    if (!mount) return;

    // Anti double init (Webflow / transitions)
    if (mount.dataset.init === "1") return;
    mount.dataset.init = "1";

    // -----------------------------
    // PARAMS (effet identique + ajouts)
    // -----------------------------
    const params = {
      // Colors / background
      colorBg: "#080808",
      colorLine: "#373f48",

      // Global Transform
      lineCount: 80,
      globalRotation: 0,
      positionX: 0, // auto-centered below
      positionY: 0,

      // Geometry
      spreadHeight: 30.33,
      spreadDepth: 0,
      curveLength: 50,
      straightLength: 100,
      curvePower: 0.8265,

      // NEW: Convergence width (Option A)
      convergeWidth: 1.6, // largeur minimale (en "unités scène", pas pixels)

      // Line Animation
      waveSpeed: 2.48,
      waveHeight: 0.145,
      lineOpacity: 0.557,

      // Bloom
      bloomStrength: 3.0,
      bloomRadius: 0.5,

      // Slow-mo (timeline-friendly)
      slowmoScale: 0.10,     // 0.05-0.2 typiquement
      slowmoDuration: 0.55,  // en secondes
      slowmoEase: "power2.out"
    };

    // Auto center (comme le Pen)
    params.positionX = (params.curveLength - params.straightLength) / 2;

    const CONSTANTS = { segmentCount: 150 };

    // -----------------------------
    // SCENE / CAMERA / RENDERER
    // -----------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(params.colorBg);
    scene.fog = new THREE.FogExp2(params.colorBg, 0.002);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    camera.position.set(0, 0, 90);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const contentGroup = new THREE.Group();
    contentGroup.position.set(params.positionX, params.positionY, 0);
    scene.add(contentGroup);

    const bgMaterial = new THREE.LineBasicMaterial({
      color: params.colorLine,
      transparent: true,
      opacity: params.lineOpacity,
      depthWrite: false
    });

    // Postprocessing
    const getSize = () => ({
      w: Math.max(1, mount.clientWidth),
      h: Math.max(1, mount.clientHeight),
    });

    const { w: w0, h: h0 } = getSize();
    renderer.setSize(w0, h0);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w0, h0), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = params.bloomStrength;
    bloomPass.radius = params.bloomRadius;
    composer.addPass(bloomPass);

    // -----------------------------
    // PATH (identique + convergeWidth Option A)
    // -----------------------------
    function getPathPoint(t, lineIndex, time) {
      const totalLen = params.curveLength + params.straightLength;
      const currentX = -params.curveLength + t * totalLen;

      let y = 0;
      let z = 0;

      const spreadFactor = (lineIndex / params.lineCount - 0.5) * 2;

      if (currentX < 0) {
        const ratio = (currentX + params.curveLength) / params.curveLength;
        let shapeFactor = (Math.cos(ratio * Math.PI) + 1) / 2;
        shapeFactor = Math.pow(shapeFactor, params.curvePower);

        // Option A: converge vers une largeur minimale (au lieu de 0)
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

    // -----------------------------
    // LINES
    // -----------------------------
    let backgroundLines = [];

    function rebuildLines() {
      backgroundLines.forEach((l) => {
        contentGroup.remove(l);
        l.geometry.dispose();
      });
      backgroundLines = [];

      for (let i = 0; i < params.lineCount; i++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(CONSTANTS.segmentCount * 3);
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const line = new THREE.Line(geometry, bgMaterial);
        line.userData = { id: i };
        line.renderOrder = 0;
        contentGroup.add(line);
        backgroundLines.push(line);
      }

      // Si lineCount change, on reconstruit les signals (car lanes dépendent de lineCount)
      rebuildAllSignalGroups();
    }

    // -----------------------------
    // SIGNAL GROUPS (1 groupe par couleur)
    // -----------------------------
    const signalMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true
    });

    const MAX_TRAIL = 150;
    let signalGroups = []; // [{ name, color, enabled, count, speed, trailLength, signals: [] }]

    // Palette 6 couleurs (paramétrables)
    const defaultPalette = ["#8fc9ff", "#ff0055", "#ffcc00", "#00ffd5", "#a855ff", "#00ff66"];

    function initSignalGroups() {
      signalGroups = defaultPalette.map((hex, idx) => ({
        name: `Color ${idx + 1}`,
        color: hex,
        enabled: idx === 0, // comme le Pen: une couleur active par défaut
        count: idx === 0 ? 94 : 0,
        speed: 0.345,
        trailLength: 3,
        signals: []
      }));
    }

    function createSignalMesh() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));

      const mesh = new THREE.Line(geometry, signalMaterial);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      contentGroup.add(mesh);

      return mesh;
    }

    function addSignalToGroup(groupIndex) {
      const group = signalGroups[groupIndex];
      const mesh = createSignalMesh();

      group.signals.push({
        mesh,
        laneIndex: Math.floor(Math.random() * params.lineCount),
        speed: 0.2 + Math.random() * 0.5,
        progress: Math.random(),
        history: [],
        assignedColor: new THREE.Color(group.color)
      });
    }

    function clearGroup(groupIndex) {
      const group = signalGroups[groupIndex];
      group.signals.forEach((s) => {
        contentGroup.remove(s.mesh);
        s.mesh.geometry.dispose();
      });
      group.signals = [];
    }

    function rebuildSignalGroup(groupIndex) {
      clearGroup(groupIndex);

      const group = signalGroups[groupIndex];
      if (!group.enabled) return;

      const targetCount = Math.max(0, Math.floor(group.count));
      for (let i = 0; i < targetCount; i++) addSignalToGroup(groupIndex);
    }

    function rebuildAllSignalGroups() {
      for (let i = 0; i < signalGroups.length; i++) rebuildSignalGroup(i);
    }

    initSignalGroups();
    rebuildLines();

    // -----------------------------
    // SLOW-MO (timeline-friendly)
    // -----------------------------
    let signalsTimeScale = 1.0; // ce que tu vas animer avec GSAP plus tard

    // API publique (pour GSAP ou Webflow interactions)
    window.DataTunnel = window.DataTunnel || {};
    window.DataTunnel.setSignalsTimeScale = (v) => { signalsTimeScale = Math.max(0, Number(v) || 0); };
    window.DataTunnel.getSignalsTimeScale = () => signalsTimeScale;

    // Tween helper (GSAP si présent, sinon tween maison)
    function tweenSignalsTimeScale(target) {
      const dur = params.slowmoDuration;
      const hasGsap = typeof window.gsap !== "undefined";

      if (hasGsap) {
        window.gsap.to({ v: signalsTimeScale }, {
          v: target,
          duration: dur,
          ease: params.slowmoEase,
          onUpdate() { signalsTimeScale = this.targets()[0].v; }
        });
        return;
      }

      // fallback sans GSAP
      const start = signalsTimeScale;
      const t0 = performance.now();
      const ease = (p) => 1 - Math.pow(1 - p, 3); // approx "power2.out-ish"

      function step(now) {
        const p = Math.min(1, (now - t0) / (dur * 1000));
        const e = ease(p);
        signalsTimeScale = start + (target - start) * e;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function bindSlowmoHover() {
      // Priorité: data-tunnel-slowmo, sinon #slowmo-trigger
      const trigger = document.querySelector("[data-tunnel-slowmo]") || document.getElementById("slowmo-trigger");
      if (!trigger) return;

      trigger.addEventListener("mouseenter", () => tweenSignalsTimeScale(params.slowmoScale));
      trigger.addEventListener("mouseleave", () => tweenSignalsTimeScale(1.0));
    }
    bindSlowmoHover();

    // -----------------------------
    // GUI (contrôles compris)
    // -----------------------------
    const gui = new GUI({ title: "Settings" });

    const folderColors = gui.addFolder("Colors");
    folderColors.addColor(params, "colorBg").name("Background").onChange((v) => {
      scene.background.set(v);
      scene.fog.color.set(v);
      mount.style.background = v;
    });
    folderColors.addColor(params, "colorLine").name("Lines").onChange((v) => bgMaterial.color.set(v));

    const folderGeneral = gui.addFolder("General");
    folderGeneral.add(params, "globalRotation", -180, 180).name("Rotation (Deg)").onChange((v) => {
      contentGroup.rotation.z = THREE.MathUtils.degToRad(v);
    });
    folderGeneral.add(params, "positionX", -200, 200).name("Position X").onChange((v) => (contentGroup.position.x = v));
    folderGeneral.add(params, "positionY", -100, 100).name("Position Y").onChange((v) => (contentGroup.position.y = v));
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
    folderAnim.add(params, "lineOpacity", 0, 1).name("Line Opacity").onChange((v) => (bgMaterial.opacity = v));

    const folderBloom = gui.addFolder("Bloom");
    folderBloom.add(params, "bloomStrength", 0, 5).name("Strength").onChange((v) => (bloomPass.strength = v));
    folderBloom.add(params, "bloomRadius", 0, 1).name("Radius").onChange((v) => (bloomPass.radius = v));

    const folderSlowmo = gui.addFolder("Slow-mo");
    folderSlowmo.add(params, "slowmoScale", 0.01, 1.0).name("Hover scale");
    folderSlowmo.add(params, "slowmoDuration", 0.05, 2.0).name("Tween duration");

    // Signal groups folders
    const folderSignals = gui.addFolder("Signals (6 groups)");
    signalGroups.forEach((g, idx) => {
      const fg = folderSignals.addFolder(g.name);

      fg.add(g, "enabled").name("Enabled").onChange(() => rebuildSignalGroup(idx));
      fg.addColor(g, "color").name("Color").onChange((v) => {
        g.color = v;
        // update assigned colors
        g.signals.forEach(s => s.assignedColor.set(v));
      });

      fg.add(g, "count", 0, 200, 1).name("Count").onFinishChange(() => rebuildSignalGroup(idx));
      fg.add(g, "speed", 0, 3, 0.001).name("Speed");
      fg.add(g, "trailLength", 0, 100, 1).name("Trail Length");
    });

    // -----------------------------
    // ANIMATION LOOP
    // -----------------------------
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Update Lines (identique)
      backgroundLines.forEach((line) => {
        const positions = line.geometry.attributes.position.array;
        const lineId = line.userData.id;

        for (let j = 0; j < CONSTANTS.segmentCount; j++) {
          const t = j / (CONSTANTS.segmentCount - 1);
          const vec = getPathPoint(t, lineId, time);
          positions[j * 3] = vec.x;
          positions[j * 3 + 1] = vec.y;
          positions[j * 3 + 2] = vec.z;
        }
        line.geometry.attributes.position.needsUpdate = true;
      });

      // Update Signals (par groupe)
      for (const group of signalGroups) {
        if (!group.enabled || group.signals.length === 0) continue;

        const speedGlobal = group.speed;
        const trailLength = Math.max(0, Math.floor(group.trailLength));
        const drawCount = Math.max(1, trailLength);

        for (const sig of group.signals) {
          // Progression : identique, mais multipliée par group.speed et signalsTimeScale (slow-mo)
          sig.progress += sig.speed * 0.005 * speedGlobal * signalsTimeScale;

          if (sig.progress > 1.0) {
            sig.progress = 0;
            sig.laneIndex = Math.floor(Math.random() * params.lineCount);
            sig.history = [];
            sig.assignedColor.set(group.color);
          }

          const pos = getPathPoint(sig.progress, sig.laneIndex, time);
          sig.history.push(pos);
          if (sig.history.length > trailLength + 1) sig.history.shift();

          const positions = sig.mesh.geometry.attributes.position.array;
          const colors = sig.mesh.geometry.attributes.color.array;
          const currentLen = sig.history.length;

          for (let i = 0; i < drawCount; i++) {
            let index = currentLen - 1 - i;
            if (index < 0) index = 0;
            const p = sig.history[index] || new THREE.Vector3();

            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;

            let alpha = 1;
            if (trailLength > 0) alpha = Math.max(0, 1 - i / trailLength);

            colors[i * 3] = sig.assignedColor.r * alpha;
            colors[i * 3 + 1] = sig.assignedColor.g * alpha;
            colors[i * 3 + 2] = sig.assignedColor.b * alpha;
          }

          sig.mesh.geometry.setDrawRange(0, drawCount);
          sig.mesh.geometry.attributes.position.needsUpdate = true;
          sig.mesh.geometry.attributes.color.needsUpdate = true;
        }
      }

      composer.render();
    }

    // Resize (container-based)
    function handleResize() {
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }

    window.addEventListener("resize", handleResize);
    handleResize();
    animate();

    // Cleanup
    window.addEventListener("beforeunload", () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      bgMaterial.dispose();
      signalMaterial.dispose();
      backgroundLines.forEach(l => l.geometry.dispose());
      signalGroups.forEach((g, i) => clearGroup(i));
      gui.destroy();
    });
  })();
