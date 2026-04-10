import { createGlobe } from "./globe.js";

const wrap = document.getElementById("globe-wrap");
const canvas = wrap ? wrap.querySelector("canvas") : null;

try {
  createGlobe(wrap, canvas);
} catch (e) {
  console.error(e);
  if (wrap) {
    wrap.innerHTML =
      '<p style="padding:1rem;color:#94a1bd;font-size:0.95rem;">WebGL globe could not start. Try another browser or disable strict blocking.</p>';
  }
}
