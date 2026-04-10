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

/** Max Y of lathe profile: tip at ground, head up +Y (map pin height for label offset). */
const MAP_PIN_TIP_TO_HEAD = 0.137;

/** Inverted teardrop: tip at y=0, round head at top (classic map pin silhouette). */
function createMapPinGroup(redMat, headDotMat) {
  const profile = [
    new THREE.Vector2(0.0012, 0),
    new THREE.Vector2(0.011, 0.019),
    new THREE.Vector2(0.03, 0.048),
    new THREE.Vector2(0.046, 0.076),
    new THREE.Vector2(0.053, 0.098),
    new THREE.Vector2(0.048, 0.115),
    new THREE.Vector2(0.032, 0.128),
    new THREE.Vector2(0.014, 0.135),
    new THREE.Vector2(0, MAP_PIN_TIP_TO_HEAD)
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 26), redMat);
  const headDot = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 14), headDotMat);
  headDot.position.set(0, 0.118, 0);
  headDot.renderOrder = 7;
  body.renderOrder = 6;
  const group = new THREE.Group();
  group.add(body, headDot);
  return group;
}

function clampMinRadius(v, minR) {
  const len = v.length();
  if (len < minR) v.normalize().multiplyScalar(minR);
  return v;
}

function clampPointsMinRadius(points, minR) {
  for (let i = 0; i < points.length; i += 1) {
    clampMinRadius(points[i], minR);
  }
}

function buildBouncyRoute(start, end, minRadius) {
  const pts = [];
  const knots = 13;
  const chordLen = start.distanceTo(end);
  const u = new THREE.Vector3().subVectors(end, start).normalize();
  let side = new THREE.Vector3(0, 1, 0).cross(u);
  if (side.lengthSq() < 1e-8) side = new THREE.Vector3(1, 0, 0).cross(u);
  side.normalize();
  const mate = new THREE.Vector3().crossVectors(u, side).normalize();

  for (let i = 0; i < knots; i += 1) {
    const t = i / (knots - 1);
    const base = start.clone().lerp(end, t);
    const radial = base.clone().normalize();
    const env = Math.sin(t * Math.PI);
    const wobble =
      Math.sin(t * Math.PI * 5.2) * 0.28 + Math.sin(t * Math.PI * 8.4 + 0.9) * 0.12 + Math.cos(t * Math.PI * 11) * 0.06;
    const springUp = Math.sin(t * Math.PI) * 0.52;
    const out = new THREE.Vector3(0, 0, 0);
    out.add(side.clone().multiplyScalar(wobble * env * chordLen * 0.16));
    out.add(mate.clone().multiplyScalar(Math.cos(t * Math.PI * 3.4) * env * chordLen * 0.1));
    out.add(radial.multiplyScalar(springUp * 0.4));
    const p = base.add(out);
    pts.push(clampMinRadius(p, minRadius));
  }
  return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.45);
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

  const pinMat = new THREE.MeshStandardMaterial({
    color: 0xc62828,
    emissive: 0xff1744,
    emissiveIntensity: 0.4,
    metalness: 0.14,
    roughness: 0.42
  });
  const pinHeadDotMat = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    roughness: 0.35,
    metalness: 0.06,
    emissive: 0x222222,
    emissiveIntensity: 0.08
  });

  function addMapPin(anchor) {
    const normal = anchor.clone().normalize();
    const group = createMapPinGroup(pinMat, pinHeadDotMat);
    group.position.copy(anchor);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    group.renderOrder = 6;
    markerRoot.add(group);
  }

  addMapPin(ndPos);
  addMapPin(rwPos);
  pulseMarkers.push({ coreMat: pinMat, pulsePhase: 0 });

  const CLOUD_SHELL_R = 1.465;
  const ROUTE_MIN_R = Math.max(PIN_RADIUS + 0.02, CLOUD_SHELL_R + 0.048);

  const ROUTE_LIFT = 0.09;
  const routeStart = clampMinRadius(
    ndPos.clone().normalize().multiplyScalar(ndPos.length() + ROUTE_LIFT),
    ROUTE_MIN_R
  );
  const routeEnd = clampMinRadius(
    rwPos.clone().normalize().multiplyScalar(rwPos.length() + ROUTE_LIFT),
    ROUTE_MIN_R
  );
  const routeCurve = buildBouncyRoute(routeStart, routeEnd, ROUTE_MIN_R);

  const T_LINE0 = 0.1;
  const T_LINE1 = 0.9;
  const lineSegs = 220;
  const arcPts = [];
  for (let i = 0; i <= lineSegs; i += 1) {
    const uu = i / lineSegs;
    const t = T_LINE0 + (T_LINE1 - T_LINE0) * uu;
    arcPts.push(routeCurve.getPoint(t).clone());
  }
  clampPointsMinRadius(arcPts, ROUTE_MIN_R);

  const ARROW_H = 0.088;
  const ARROW_R = 0.044;
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0x1565c0,
    emissive: 0x0d47a1,
    emissiveIntensity: 0.45,
    metalness: 0.22,
    roughness: 0.32
  });

  const fwd0 = arcPts[1].clone().sub(arcPts[0]).normalize();
  const fwd1 = arcPts[arcPts.length - 1].clone().sub(arcPts[arcPts.length - 2]).normalize();

  /** One connected <----------> piece: cone base on `basePoint`, tip along `tipDir` (unit). */
  function addArrowHeadOnRibbon(basePoint, tipDir) {
    const d = tipDir.clone().normalize();
    if (d.lengthSq() < 1e-10) return;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(ARROW_R, ARROW_H, 12), arrowMat);
    cone.geometry.translate(0, ARROW_H / 2, 0);
    const g = new THREE.Group();
    g.position.copy(basePoint);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    cone.renderOrder = 5;
    g.renderOrder = 5;
    g.add(cone);
    markerRoot.add(g);
  }

  addArrowHeadOnRibbon(arcPts[0].clone(), fwd0.clone().multiplyScalar(-1));
  addArrowHeadOnRibbon(arcPts[arcPts.length - 1].clone(), fwd1);

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

  function pinLabelPosition(anchor) {
    const n = anchor.clone().normalize();
    return anchor.clone().add(n.multiplyScalar(MAP_PIN_TIP_TO_HEAD + 0.12));
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
