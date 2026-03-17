import { ensureHeroThreeDeps } from "../hero/hero-three-deps.js";

const DEBUG_HERO = true;

function getRendererCtor(heroThree) {
  return (
    heroThree?.WebGPURenderer ||
    heroThree?.WEBGPU?.WebGPURenderer ||
    heroThree?.THREE?.WebGPURenderer ||
    null
  );
}

export async function initWebGPUSmokePOC() {
  const canvas = document.querySelector("[data-webgpu-poc-canvas]");
  if (!canvas) {
    return null;
  }

  const deps = await ensureHeroThreeDeps({
    preferredBackend: "webgpu",
    allowFallback: false,
  });

  if (!deps?.ready || deps.backend !== "webgpu") {
    console.warn("[Hero][RenderBackend] webgpu-unavailable");
    return null;
  }

  const heroThree = window.HeroThree;
  const THREE = heroThree?.THREE;
  const RendererCtor = getRendererCtor(heroThree);

  if (!THREE || !RendererCtor) {
    console.warn("[Hero][RenderBackend] webgpu-unavailable");
    return null;
  }

  const renderer = new RendererCtor({ canvas, alpha: true, antialias: true });

  if (typeof renderer.init === "function") {
    await renderer.init();
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 3);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshNormalMaterial()
  );
  scene.add(cube);

  const onResize = () => {
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
  };

  onResize();
  window.addEventListener("resize", onResize);

  console.log("[Hero][RenderBackend] webgpu");

  const animate = () => {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.015;
    renderer.render(scene, camera);
  };

  if (typeof renderer.setAnimationLoop === "function") {
    renderer.setAnimationLoop(animate);
  } else {
    const tick = () => {
      animate();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  if (DEBUG_HERO) {
    console.log("[Hero][POC] WebGPU smoke running");
  }

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      if (typeof renderer.setAnimationLoop === "function") {
        renderer.setAnimationLoop(null);
      }
      cube.geometry.dispose();
      cube.material.dispose();
      if (typeof renderer.dispose === "function") {
        renderer.dispose();
      }
    },
  };
}
