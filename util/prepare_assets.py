#!/usr/bin/env python3
"""Prepare a self-contained static paper site from the rendered Manim deck.

Run with the slide environment: python website/util/prepare_assets.py
Regeneration uses the Manim slide environment. Viewing needs no build step.
"""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

import numpy as np

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
SLIDES = ROOT / "slides"
ASSETS = SITE / "assets"



def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_slides():
    """Keep the slide player local, with individually loaded video segments."""
    output = ASSETS / "slides"
    output.mkdir(parents=True, exist_ok=True)
    segments = []

    def extract(match):
        payload = base64.b64decode(match.group(1), validate=True)
        sha = hashlib.sha256(payload).hexdigest()
        name = f"segment-{len(segments) + 1:03d}-{sha[:10]}.mp4"
        (output / name).write_bytes(payload)
        segments.append({"file": f"assets/slides/{name}", "bytes": len(payload),
                         "sha256": sha})
        return f"assets/slides/{name}"

    source = (SLIDES / "higum.html").read_text()
    html = re.sub(r"data:video/mp4;base64,([A-Za-z0-9+/=]+)", extract, source)
    if not segments:
        raise ValueError("The exported deck contains no embedded MP4 segments")
    (SITE / "slides.html").write_text(html)
    retained = {Path(segment['file']).name for segment in segments}
    for obsolete in output.glob('segment-*.mp4'):
        if obsolete.name not in retained:
            obsolete.unlink()
    return {"source_sha256": digest(SLIDES / "higum.html"), "segments": segments}


def export_viewer_data():
    with np.load(SLIDES / "assets/higum_data.npz", allow_pickle=False) as data:
        points = data["wrf_points"]
        center = (points.min(0) + points.max(0)) / 2
        stretch = np.array([1.0, 1.0, 6.0])
        scale = np.ptp((points - center) * stretch, axis=0).max() / 2
        transform = stretch / scale
        ids = np.linspace(0, len(points) - 1, 850, dtype=int)
        levels = []
        for level in range(6):
            stem = f"wrf_level{level}"
            nodes = []
            for mean, cov, concentration, count in zip(
                data[stem + "_means"], data[stem + "_covariances"],
                data[stem + "_concentration"], data[stem + "_counts"],
            ):
                values, vectors = np.linalg.eigh(cov)
                basis = (vectors @ np.diag(2 * np.sqrt(np.maximum(values, 1e-10)))) * transform[:, None]
                nodes.append({"mean": ((mean - center) * transform).round(6).tolist(),
                              "basis": basis.round(6).tolist(),
                              "concentration": float(concentration), "samples": int(count)})
            levels.append(nodes)
        payload = {
            "dataset": "WRF-FIRE static smoke snapshot",
            "displayedSamples": len(ids), "retainedSamples": len(points),
            "verticalExaggeration": 6,
            "concentrationRange": [float(data["wrf_concentration"].min()), float(data["wrf_concentration"].max())],
            "points": ((points[ids] - center) * transform).round(6).tolist(),
            "levels": levels,
            "note": "Exact slide data. Wireframes show two-standard-deviation covariance ellipsoids. "
                    "Color encodes the arithmetic mean PM2.5 of each node, on a logarithmic scale. "
                    "Spatial coordinates are normalized for display and z is exaggerated six times.",
        }
    output = ASSETS / "data"
    output.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    (output / "hierarchy.json").write_text(encoded + "\n")
    (output / "hierarchy.js").write_text("window.HIGUM_DATA=" + encoded + ";\n")


def export_source():
    path = ASSETS / "higum-source.zip"
    archive_readme = """# HiGUM source bundle

Original paper methods are in code/. The Manim presentation is in slides/.
See the README in each directory for requirements and execution instructions.
The included precomputed NPZ bundles are enough to render the slides.
The original large WRF-FIRE input arrays are not bundled; rebuilding from raw
simulation data requires code/fire_smoke_data.npy as described in code/README.md.
The manuscript is distributed separately as paper.pdf on the project website.
"""
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.md", archive_readme)
        for source in sorted((ROOT / "code").glob("*.py")):
            z.write(source, source.relative_to(ROOT))
        z.write(ROOT / "code/README.md", "code/README.md")
        for name in ("higum.py", "manim.cfg", "requirements.txt", "readme.md"):
            z.write(SLIDES / name, "slides/" + name)
        for source in sorted((SLIDES / "util").glob("*.py")):
            z.write(source, source.relative_to(ROOT))
        for source in sorted((SLIDES / "assets").iterdir()):
            if source.is_file() and not source.name.startswith("airplane"):
                z.write(source, source.relative_to(ROOT))


def main():
    from export_animations import export
    for name in ("images", "data"):
        (ASSETS / name).mkdir(parents=True, exist_ok=True)
    for name in ("lehigh_logo.png", "uta_logo.png", "forest_smoke.jpg"):
        shutil.copyfile(SLIDES / "assets" / name, ASSETS / "images" / name)
    shutil.copyfile(ROOT / "conference_101719.pdf", ASSETS / "paper.pdf")
    slides = export_slides()
    export_viewer_data()
    export_source()
    export()
    provenance = {"mode": "Native Canvas geometry animations", "featured_scenes": 9,
                  "source": "Exact Manim numerical data; no featured video clips.",
                  "manim_deck": slides}
    (ASSETS / "manifest.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("Website assets ready.")


if __name__ == "__main__":
    main()
