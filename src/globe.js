import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

function texUrl(file) {
  return `${base}textures/${file}`;
}

export function createGlobe(wrap, canvas) {
  const canvasCount = document.querySelectorAll("#globe-canvas").length;
  if (canvasCount > 1) {
    console.warn("[globe] Multiple #globe-canvas in DOM:", canvasCount);
  }
  if (!wrap || !canvas) {
    console.error("[globe] Missing #globe-wrap or canvas.", { wrap: !!wrap, canvas: !!canvas });
    throw new Error("[globe] init failed");
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(0, 0.25, 6.1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const gl = renderer.getContext();
  if (!gl) {
    console.error("[globe] WebGL context could not be created.");
    throw new Error("[globe] WebGL unavailable");
  }

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 3.6;
  controls.maxDistance = 9.5;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;

  const ambient = new THREE.AmbientLight(0x97b8ff, 0.65);
  const key = new THREE.DirectionalLight(0xb7deff, 1.6);
  key.position.set(4, 3, 3);
  const rim = new THREE.DirectionalLight(0x2de7ff, 1.15);
  rim.position.set(-5, 1.5, -2.5);
  scene.add(ambient, key, rim);

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const loader = new THREE.TextureLoader();
  const loadTex = (file) => {
    const u = texUrl(file);
    return new Promise((resolve, reject) => {
      loader.load(
        u,
        (t) => resolve(t),
        undefined,
        (err) => reject(err)
      );
    });
  };

  const loadAll = async () => {
    try {
      const [colorMap, normalMap, specMap, cloudMap] = await Promise.all([
        loadTex("earth_atmos_2048.jpg"),
        loadTex("earth_normal_2048.jpg"),
        loadTex("earth_specular_2048.jpg"),
        loadTex("earth_clouds_1024.png")
      ]);
      colorMap.colorSpace = THREE.SRGBColorSpace;
      colorMap.anisotropy = 8;
      [normalMap, specMap, cloudMap].forEach((t) => {
        t.colorSpace = THREE.NoColorSpace;
        t.anisotropy = 8;
      });
      return { colorMap, normalMap, specMap, cloudMap };
    } catch (e) {
      console.warn("[globe] Local texture load failed, using solid fallback.", { base, error: e });
      return null;
    }
  };

  const texturesPromise = loadAll();

  const globeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1e5a8a),
    roughness: 0.9,
    metalness: 0.02,
    emissive: new THREE.Color(0x091a40),
    emissiveIntensity: 0.18
  });

  const cloudMat = new THREE.MeshPhongMaterial({
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    color: 0xffffff
  });

  const globe = new THREE.Mesh(new THREE.SphereGeometry(1.42, 96, 96), globeMat);
  globeGroup.add(globe);

  const cloudLayer = new THREE.Mesh(new THREE.SphereGeometry(1.465, 96, 96), cloudMat);
  globeGroup.add(cloudLayer);

  function makeOrbit(radius, tiltX, tiltY, color) {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius * 0.42, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(240).map((p) => new THREE.Vector3(p.x, p.y, 0));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    line.rotation.x = tiltX;
    line.rotation.y = tiltY;
    globeGroup.add(line);
    return line;
  }

  const orbitA = makeOrbit(2.03, 1.16, 0.38, 0x22eaff);
  const orbitB = makeOrbit(1.96, 0.44, -0.74, 0x1fd8ff);
  const orbitC = makeOrbit(2.11, -0.08, 0.98, 0x48efff);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 220;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const i3 = i * 3;
    starPos[i3] = (Math.random() - 0.5) * 24;
    starPos[i3 + 1] = (Math.random() - 0.5) * 18;
    starPos[i3 + 2] = -2 - Math.random() * 8;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x9fc7ff, size: 0.03, transparent: true, opacity: 0.8 })
  );
  scene.add(stars);

  texturesPromise.then((maps) => {
    if (!maps) return;
    globeMat.map = maps.colorMap;
    globeMat.normalMap = maps.normalMap;
    globeMat.metalnessMap = maps.specMap;
    globeMat.needsUpdate = true;
    cloudMat.map = maps.cloudMap;
    cloudMat.needsUpdate = true;
  });

  let warnedZeroSize = false;
  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!warnedZeroSize && (w === 0 || h === 0)) {
      warnedZeroSize = true;
      console.warn("[globe] #globe-wrap has zero size", {
        clientWidth: w,
        clientHeight: h,
        rect: wrap.getBoundingClientRect()
      });
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener("resize", resize);
  let ro;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
  }
  requestAnimationFrame(() => resize());

  const clock = new THREE.Clock();
  let raf = 0;
  function animate() {
    const t = clock.getElapsedTime();
    globe.rotation.y += 0.00125;
    globe.rotation.x = Math.sin(t * 0.22) * 0.05;
    cloudLayer.rotation.y += 0.00185;
    orbitA.rotation.z = t * 0.44;
    orbitB.rotation.z = -t * 0.35;
    orbitC.rotation.z = t * 0.28;
    globeGroup.position.y = Math.sin(t * 0.8) * 0.06;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    if (ro) ro.disconnect();
    controls.dispose();
    renderer.dispose();
    globeMat.dispose();
    cloudMat.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  return { destroy };
}
