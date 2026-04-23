# Noise Playground

Live-tunable **OpenSimplex2** (K.jpg GLSL) + **fractal (fBm)**, **rigid** multifractal-style, and **cellular / Worley** noise in the browser. Built with **Vite** + **Three.js** (WebGL2 / GLSL 300 ES).

## Quick start

```bash
npm install
npm run dev
```

- **Build:** `npm run build` — output in `dist/`
- **Preview build:** `npm run preview`

## What’s inside

- **OpenSimplex2** and **OpenSimplex2S** — fragment shader code from the official [KdotJPG/OpenSimplex2](https://github.com/KdotJPG/OpenSimplex2) GLSL (Unlicense), embedded under `src/shaders/os2.glsl` and `os2s.glsl`.
- **Seeding** — the npm package [`open-simplex-noise`](https://www.npmjs.com/package/open-simplex-noise) is used to derive a stable 3D offset from the integer seed (not for the on-screen GLSL; it remains OpenSimplex2 in the fragment shader).
- **Cellular / Worley** — custom GLSL in `src/shaders/cellular.glsl` (F1, F2, F2−F1; Euclidean / Manhattan / Chebyshev).
- **2D** view — a plane; **3D slice** view — sample at `sliceZ` to explore a volume with a static orthographic “camera” (full-viewport quad in clip space).
- **Controls** — seed, frequency, amplitude, world scale, offsets, fractal octaves, lacunarity, gain, rigid parameters, display ramp / contrast, optional animation in Z.

## License

- Project: same as the underlying noise assets: OpenSimplex2 GLSL in this repo is from K.jpg’s [OpenSimplex2](https://github.com/KdotJPG/OpenSimplex2) (Unlicense, see upstream).
- `open-simplex-noise` (npm): [Unlicense](https://unlicense.org/).
