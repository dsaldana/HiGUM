# HiGUM paper website

Static paper page with nine native Canvas animations based on the numerical Manim
slide data. Featured scenes contain no video player or prerecorded frames.
No dependencies, backend, or build step are needed to view the site.

## Preview

Open `index.html` directly, or from the paper project root run:

```bash
python3 -m http.server 8000 --directory website
```

Visit `http://localhost:8000`. All assets use relative paths and work on GitHub Pages.

## Animation controls

- **Play / Pause** runs the scene at the selected animation speed.
- **Next step** advances Gaussian levels, voxel resolution, octree depth, or NMPC stages.
- The slider scrubs progress; **↺** restarts and restores the view.
- Drag a smoke scene, or focus its canvas and use arrow keys, to rotate the 3D view.
- Fleet scenes draw each recorded trajectory, its assigned waypoints, the active target,
  and acceptance events. All UAVs share one sample clock.
- Animations start paused. Hidden panels and offscreen scenes pause automatically.

The nine scenes cover Figures 1–3, voxels, octrees, discrete-time UAV updates, the NMPC
feedback loop, and the two Figure 4 fleet cases. The separate **Manim presentation**
link preserves the original 18-topic video-based Manim Slides export; its local
segments in `assets/slides/` are used only by that original presentation.

## Publish

Repository: [dsaldana/HiGUM](https://github.com/dsaldana/HiGUM).
Public page: [dsaldana.github.io/HiGUM](https://dsaldana.github.io/HiGUM/).

This folder is a Git repository with `origin` configured. After committing changes,
push from the paper project root:

```bash
git -C website push -u origin main
```

Or use **Push origin** in GitHub Desktop. In repository **Settings → Pages**, use
**GitHub Actions**. `.github/workflows/pages.yml` publishes `main` automatically.
If this folder is placed inside the paper repository, copy the workflow to the
repository root; it detects either layout and publishes only the website files.

## Regenerate the numerical assets

Use the same Python environment as the slides (NumPy and Manim installed):

```bash
python website/util/export_animations.py
```

This exports `assets/data/animations.js` from `slides/assets/higum_data.npz` and
`improved_plans.npz`, reuses the slide voxel/octree routines and explicit-Euler dynamics model, verifies waypoint ownership and acceptance, and copies the UAV photograph.
It requires no video render, FFmpeg, or browser dependencies.

Check the player states and trajectory acceptance events with Node.js:

```bash
node website/util/check_animations.cjs
```

To also update the paper, hero viewer data, source ZIP, logos, photo, and original
Manim export, first export the slides as described in `../slides/readme.md`, then run:

```bash
python website/util/prepare_assets.py
```

`assets/manifest.json` records the original Manim export segments. Native data
provenance records SHA-256 hashes of the two source NPZ bundles.

## Scientific scope

- Figures 1 and 2 use all 900 and 650 slide samples, respectively. Hard-assignment
  subset colors in Figure 2 match the fitted hierarchy's labels.
- WRF-FIRE displays 850 deterministic samples of the slide's every-50th-valid-voxel
  subset. The separate benchmark uses all 257,896 valid samples. Z is exaggerated ×6.
- Ellipsoids show two standard deviations. Color encodes mean PM2.5, logarithmically
  for WRF-FIRE. Concentration does not weight the spatial GMM fit.
- Fixed voxels and sparse octrees use the exact same 900 Figure 1 samples. Empty
  cells are unobserved. These illustrate data structures, not full Voxblox/OctoMap.
- Dynamics uses six exact Euler steps with fixed speed, x/y displacement components,
  and steering-driven heading updates. The parameter values are illustrative, separate
  from the flight experiments. NMPC is an explanatory feedback-loop diagram;
  the browser does not solve an optimization problem.
- Fleet level 5 replays original MPC states. Level 4 replays the separately
  replanned route-aware, 20-step-horizon presentation experiment (96 vs 143 km).
  This does not replace the paper's original result.
- A waypoint is filled only after its assigned UAV's original acceptance event,
  checked at control-interval endpoints within the 3 km tolerance. Interpolation
  is for display only; it does not change or replan trajectories. Playback time is
  distinct from model time. Independent planning imposes no collision avoidance.
- The manuscript citation claims no DOI or acceptance.

## Attribution

Forest: Mike Lewelling / National Park Service, public domain,
[Alder Fire in Yellowstone](https://commons.wikimedia.org/wiki/File:Wildfire_(14503287131).jpg).
UAV: NASA / Milan Loiacono,
[Black Swift S2](https://www.nasa.gov/image-detail/crater-052025-loiacono-3978/).
Logos: unchanged official [Lehigh University](https://www.lehigh.edu/LTS/communication/logos/)
and [UT Arlington](https://www.uta.edu/) artwork. Image provenance is also in the
source ZIP's `slides/assets/` directory.

## Files

```text
index.html                   Paper page
styles.css                   Responsive layout
app.js                       Navigation, tabs, citation, hero viewer
animations.js                Native geometry players and controls
assets/data/animations.js    Exact exported slide geometry and trajectories
slides.html                  Separate original Manim Slides export
assets/                      Data, paper, source archive, photos, Manim segments
util/export_animations.py    Rebuild native animation data
util/prepare_assets.py       Rebuild all supporting assets
.github/workflows/pages.yml GitHub Pages deployment
```
