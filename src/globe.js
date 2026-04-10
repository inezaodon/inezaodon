import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

function texUrl(file) {
  return `${base}textures/${file}`;
}

/** Y-up sphere aligned with typical equirectangular Earth textures (e.g. three.js planet maps). */
function latLonToGlobeLocal(latDeg, lonDeg, radius) {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function parabolicArcControl(a, b, radius, bulge) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return mid.normalize().multiplyScalar(radius + bulge);
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

  const markerRoot = new THREE.Group();
  globeGroup.add(markerRoot);

  const PIN_RADIUS = 1.492;
  const pulseMarkers = [];

  const ndPos = latLonToGlobeLocal(41.7031, -86.2384, PIN_RADIUS);
  const rwPos = latLonToGlobeLocal(-1.944, 30.0619, PIN_RADIUS);

  const PIN_HEIGHT = 0.1;
  const PIN_RADIUS_CONE = 0.034;
  const pinMat = new THREE.MeshStandardMaterial({
    color: 0xc62828,
    emissive: 0xff1744,
    emissiveIntensity: 0.4,
    metalness: 0.14,
    roughness: 0.42
  });

  function addRedPin(anchor) {
    const normal = anchor.clone().normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(PIN_RADIUS_CONE, PIN_HEIGHT, 14), pinMat);
    cone.geometry.translate(0, PIN_HEIGHT / 2, 0);
    const group = new THREE.Group();
    group.position.copy(anchor);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    cone.renderOrder = 6;
    group.renderOrder = 6;
    group.add(cone);
    markerRoot.add(group);
  }

  addRedPin(ndPos);
  addRedPin(rwPos);
  pulseMarkers.push({ coreMat: pinMat, pulsePhase: 0 });

  const arcBulge = 0.56;
  const arcCurve = new THREE.QuadraticBezierCurve3(
    ndPos.clone(),
    parabolicArcControl(ndPos, rwPos, PIN_RADIUS, arcBulge),
    rwPos.clone()
  );

  const arcPts = arcCurve.getPoints(128);
  const arcPosFlat = [];
  for (let i = 0; i < arcPts.length; i += 1) {
    arcPosFlat.push(arcPts[i].x, arcPts[i].y, arcPts[i].z);
  }
  const arcLineGeo = new LineGeometry();
  arcLineGeo.setPositions(arcPosFlat);

  const arcLineMat = new LineMaterial({
    color: 0x1565c0,
    linewidth: 6,
    worldUnits: false,
    transparent: true,
    opacity: 1,
    depthTest: true
  });
  arcLineMat.resolution.set(wrap.clientWidth, wrap.clientHeight);

  const arcLine = new Line2(arcLineGeo, arcLineMat);
  arcLine.computeLineDistances();
  arcLine.renderOrder = 4;
  markerRoot.add(arcLine);

  const ARROW_H = 0.095;
  const ARROW_R = 0.048;
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0x42a5f5,
    emissive: 0x0d47a1,
    emissiveIntensity: 0.45,
    metalness: 0.22,
    roughness: 0.32
  });

  function addArrowAtEnd(anchor, dirAlongArrow) {
    const d = dirAlongArrow.clone().normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(ARROW_R, ARROW_H, 12), arrowMat);
    cone.geometry.translate(0, ARROW_H / 2, 0);
    const g = new THREE.Group();
    g.position.copy(anchor.clone().sub(d.clone().multiplyScalar(ARROW_H)));
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    cone.renderOrder = 5;
    g.renderOrder = 5;
    g.add(cone);
    markerRoot.add(g);
  }

  const tanStart = arcCurve.getTangentAt(0).normalize();
  const tanEnd = arcCurve.getTangentAt(1).normalize();
  addArrowAtEnd(ndPos, tanStart);
  addArrowAtEnd(rwPos, tanEnd);

  function pinLabelPosition(anchor) {
    const n = anchor.clone().normalize();
    return anchor.clone().add(n.multiplyScalar(PIN_HEIGHT + 0.14));
  }

  function addGlobeLabel(text, position) {
    const el = document.createElement("div");
    el.className = "globe-label";
    el.textContent = text;
    const label = new CSS2DObject(el);
    label.position.copy(position);
    label.center.set(0.5, 1);
    markerRoot.add(label);
    return label;
  }

  addGlobeLabel("Notre Dame (Home)", pinLabelPosition(ndPos));
  addGlobeLabel("Rwanda (Home)", pinLabelPosition(rwPos));

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(wrap.clientWidth, wrap.clientHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  labelRenderer.domElement.style.zIndex = "1";
  wrap.appendChild(labelRenderer.domElement);

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
    labelRenderer.setSize(w, h);
    arcLineMat.resolution.set(w, h);
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
    markerRoot.rotation.copy(globe.rotation);
    const pulseBase = 0.38;
    const pulseAmp = 0.22;
    for (let i = 0; i < pulseMarkers.length; i += 1) {
      const m = pulseMarkers[i];
      m.coreMat.emissiveIntensity = pulseBase + Math.sin(t * 2.35 + m.pulsePhase) * pulseAmp;
    }
    globeGroup.position.y = Math.sin(t * 0.8) * 0.06;
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    if (ro) ro.disconnect();
    if (labelRenderer.domElement.parentNode === wrap) {
      wrap.removeChild(labelRenderer.domElement);
    }
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
