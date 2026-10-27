#!/usr/bin/env python3
"""Prepare a self-contained static paper site from the rendered Manim deck.

Run with the slide environment: python website/util/prepare_assets.py
Only regeneration needs NumPy and FFmpeg. Viewing the site needs no build step.
"""
from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

import numpy as np

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent
SLIDES = ROOT / "slides"
ASSETS = SITE / "assets"
CASES = {
    "three-sources": 6,
    "binary-hierarchy": 8,
    "wrf-hierarchy": 10,
    "voxels": 3,
    "octree": 4,
    "uav-dynamics": 12,
    "nmpc": 13,
    "fleet-level3": 14,
    "fleet-level4": 15,
    "fleet-level5": 16,
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_slides():
    """Keep the slide player local, with individually loaded video segments."""
    output = ASSETS / "slides"
    output.mkdir(parents=True, exist_ok=True)
    segments = []

    def extract(match):
        name = f"segment-{len(segments) + 1:03d}.mp4"
        payload = base64.b64decode(match.group(1), validate=True)
        (output / name).write_bytes(payload)
        segments.append({"file": f"assets/slides/{name}", "bytes": len(payload),
                         "sha256": hashlib.sha256(payload).hexdigest()})
        return f"assets/slides/{name}"

    source = (SLIDES / "higum.html").read_text()
    html = re.sub(r"data:video/mp4;base64,([A-Za-z0-9+/=]+)", extract, source)
    if not segments:
        raise ValueError("The exported deck contains no embedded MP4 segments")
    (SITE / "slides.html").write_text(html)
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-encode all animation clips")
    args = parser.parse_args()
    for name in ("media", "posters", "images", "data"):
        (ASSETS / name).mkdir(parents=True, exist_ok=True)
    video = SLIDES / "media/videos/higum/1080p30/HiGUM.mp4"
    if not video.is_file():
        parser.error("Render the HiGUM deck at 1080p first; see slides/readme.md")
    states = json.loads((SLIDES / "util/review/review_states.json").read_text())
    last = {s["topic"]: s["time"] for s in states}
    provenance = {"source_video_sha256": digest(video),
                  "source_states_sha256": digest(SLIDES / "util/review/review_states.json"),
                  "clips": {}, "source": "Existing Manim slides; no paper figure images used."}
    cache_file = ASSETS / "manifest.json"
    cached = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    current = all(cached.get(k) == provenance[k] for k in ("source_video_sha256", "source_states_sha256"))

    def encode(item):
        slug, topic = item
        # Remove the preceding page's fade-out at the deck's default 1.6 pace.
        start, end = last[topic - 1] + .56, last[topic]
        output = ASSETS / "media" / f"{slug}.mp4"
        poster = ASSETS / "posters" / f"{slug}.jpg"
        if args.force or not current or not output.exists() or not poster.exists():
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.6f}", "-i", str(video),
                            "-t", f"{end-start:.6f}", "-vf", "scale=1280:720", "-r", "30", "-an",
                            "-c:v", "libx264", "-preset", "fast", "-crf", "24", "-pix_fmt", "yuv420p",
                            "-movflags", "+faststart", "-map_metadata", "-1", str(output)], check=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{end-.1:.6f}", "-i", str(video),
                            "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "3", str(poster)], check=True)
        return slug, {"slide": topic, "start": start, "end": end,
                      "duration": end-start, "bytes": output.stat().st_size,
                      "file": f"assets/media/{slug}.mp4", "poster": f"assets/posters/{slug}.jpg"}

    with ThreadPoolExecutor(max_workers=2) as pool:
        for slug, clip in pool.map(encode, CASES.items()):
            provenance["clips"][slug] = clip
            print(f"Prepared {slug}: {clip['duration']:.1f}s", flush=True)
    for name in ("lehigh_logo.png", "uta_logo.png", "forest_smoke.jpg"):
        shutil.copyfile(SLIDES / "assets" / name, ASSETS / "images" / name)
    shutil.copyfile(ROOT / "conference_101719.pdf", ASSETS / "paper.pdf")
    provenance["slides"] = export_slides()
    export_viewer_data()
    export_source()
    cache_file.write_text(json.dumps(provenance, indent=2) + "\n")
    print("Website assets ready.")


if __name__ == "__main__":
    main()
