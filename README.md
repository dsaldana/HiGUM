# HiGUM paper website

Static GitHub Pages site based on the Manim presentation in `../slides/`.
The page includes a live 3D Gaussian hierarchy, ten video animations, the paper,
an interactive slide deck, a source-code bundle, and a manuscript citation.
All runtime assets are local. No JavaScript dependencies, backend, or build step
are required.

## Preview

Open `index.html` directly, or run this command from the paper project root:

```bash
python3 -m http.server 8000 --directory website
```

Then visit `http://localhost:8000`. The site also works under a GitHub project
subpath because asset URLs are relative.

## Publish on GitHub Pages

Target repository: [dsaldana/HiGUM](https://github.com/dsaldana/HiGUM).
Expected Pages address after deployment: `https://dsaldana.github.io/HiGUM/`.
This address is a deployment target, not a claim that publication has completed.

The contents of `website/` can be the root of a dedicated repository. The included
`.github/workflows/pages.yml` publishes the site when changes reach `main`.

This folder is already a local Git repository on `main`, with `origin` configured
for `dsaldana/HiGUM` and the website committed on top of the existing repository
history. From the paper project root, push it with:

```bash
git -C website push -u origin main
```

If your terminal is already inside `website/`, use `git push -u origin main`.
Authenticate with your normal GitHub credentials when Git requests them.

1. Push the local `main` branch using the command above.
2. In the repository’s **Settings → Pages**, select **GitHub Actions** as the source.
3. Run the **Publish HiGUM to GitHub Pages** workflow, or push a commit to `main`.
4. The deployment job reports the published URL.

If the repository contains the whole paper project instead, keep this folder as
`website/` and copy `website/.github/workflows/pages.yml` to the repository root’s
`.github/workflows/pages.yml`. The workflow detects either layout and uploads only
the public static site files. It does not publish the surrounding Overleaf project.

The workflow uses GitHub’s built-in short-lived token with `contents: read`,
`pages: write`, and `id-token: write`. No personal access token is stored in the site.
See [GitHub’s custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Update animations and data

First render and export the updated slide deck, as described in `../slides/readme.md`.
Then use the environment containing NumPy and FFmpeg:

```bash
python website/util/prepare_assets.py
```

Run this from the paper project root. Unchanged video clips are reused. Use
`--force` to re-encode them. The script:

- extracts ten 720p H.264 clips and poster frames from the current rendered deck;
- exports real WRF-FIRE hierarchy statistics from `slides/assets/higum_data.npz`;
- copies the manuscript, official logos, and motivation photo;
- exports the complete slide player with local video segments in `assets/slides/`;
- builds a source ZIP with original methods, Manim scenes, and precomputed arrays.

The script trims transitions using the slides’ default animation pace of 1.6.
The generated clips and static assets are committed to the website repository,
so GitHub does not need Manim, TeX, NumPy, or FFmpeg to deploy it. Keep individual
files below GitHub’s repository size limit. The slide videos are separate files,
each below the browser uploader’s 25 MB limit. Keep `slides.html` and `assets/`
together when copying or downloading the site for offline use.

`assets/manifest.json` records clip source timestamps and source hashes.
`assets/data/hierarchy.json` stores the viewer data; the equivalent classic-script
version permits the viewer to work even when the page is opened directly from disk.

## Scientific scope and attribution

- Hero and Figure 3: static WRF-FIRE snapshot, every-50th-valid-voxel representation;
  the viewer displays 850 deterministic samples. Ellipsoids show two standard
  deviations. Color encodes mean PM2.5 on a log scale. Height is exaggerated six times.
- Figures 1 and 2: the slide animations of the synthetic plume and recursive hierarchy.
- Voxels and octree: supplementary spatial-data-structure illustrations from the slides,
  not complete reproductions of Voxblox or OctoMap.
- UAV dynamics: an analytic left-straight-right Dubins illustration, separate from the
  experiment trajectories. NMPC video explains the objective and feedback loop.
- Level-3 and level-5 fleet clips use the paper’s original MPC data. The level-4 clip
  is explicitly labeled as the separately replanned demonstration from slide 15.
- Playback seconds are not physical flight seconds. Independent planning does not
  impose collision avoidance. Original waypoint acceptance tolerance is 3 km.
- The citation is marked as an unpublished manuscript; no DOI or acceptance is claimed.

Forest photograph: Mike Lewelling / National Park Service, public domain,
[Alder Fire in Yellowstone](https://commons.wikimedia.org/wiki/File:Wildfire_(14503287131).jpg).
UAV photograph: NASA / Milan Loiacono,
[Black Swift S2](https://www.nasa.gov/image-detail/crater-052025-loiacono-3978/).
University logos are unchanged official artwork from
[Lehigh University](https://www.lehigh.edu/LTS/communication/logos/) and
[UT Arlington](https://www.uta.edu/).
Detailed image provenance is preserved in the source ZIP’s `slides/assets/` directory.

## Files

```text
website/
  index.html                  Paper page
  styles.css                  Responsive layout and typography
  app.js                      Viewer, video controls, tabs, citation copy
  slides.html                 Complete Manim Slides player (videos in assets/)
  .github/workflows/pages.yml GitHub Pages deployment
  assets/                     Videos, posters, data, paper, source archive, images
  util/prepare_assets.py       Rebuild assets from the paper and slides
```
