- 👋 Hi, I’m @inezaodon
- 👀 I’m interested in Computer Science and Research analysis.
- 🌱 I’m currently learning React Js, Django, JavaScript
- 💞️ I’m looking to collaborate on ...
- 📫 How to reach me ...

## Profile site (GitHub Pages)

This repository builds a **Vite + Three.js** page with **bundled** Three.js and **self-hosted** Earth textures (no `unpkg` / no runtime dependency on `threejs.org` for scripts).

- **Develop:** `npm install` then `npm run dev`
- **Build:** `python3 scripts/fetch_textures.py` then `npm run build` (output: `docs/`)

**Pages settings:** **Deploy from branch** → **main** and **`/docs`** folder. Do **not** publish the repository **root** as the site; the root `index.html` is **source** for Vite only—the built site lives in **`docs/`**.

You can add a GitHub Actions “Deploy Pages” workflow later if you want builds on every push (requires a token with the `workflow` scope to push workflow files).

<!---
inezaodon/inezaodon is a ✨ special ✨ repository because its `README.md` (this file) appears on your GitHub profile.
You can click the Preview link to take a look at your changes.
--->
