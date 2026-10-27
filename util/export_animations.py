#!/usr/bin/env python3
"""Export exact slide geometry for native browser animations (no video render)."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

import numpy as np

SITE = Path(__file__).resolve().parents[1]
SLIDES = SITE.parent / 'slides'
sys.path.insert(0, str(SLIDES / 'util'))
from spatial_representations import build_representation_data, validate_representation_data
from control_slides import DubinsIllustration


def rounded(values):
    return np.asarray(values).round(7).tolist()


def export():
    payload = {'datasets': {}, 'fleets': {}, 'provenance': {}}
    with np.load(SLIDES / 'assets/higum_data.npz', allow_pickle=False) as data, np.load(
            SLIDES / 'assets/improved_plans.npz', allow_pickle=False) as improved:
        for stem, count, exaggeration in [('fig1', 5, 1), ('fig2', 4, 1), ('wrf', 6, 6)]:
            points = data[stem + '_points']
            center = (points.min(0) + points.max(0)) / 2
            stretch = np.array([1., 1., exaggeration])
            scale = np.ptp((points - center) * stretch, axis=0).max() / 2
            transform = stretch / scale
            ids = np.linspace(0, len(points) - 1, min(len(points), 850 if stem == 'wrf' else 900), dtype=int)
            dataset = {'points': rounded((points[ids]-center)*transform), 'levels': [],
                       'range': [float(data[stem+'_concentration'].min()), float(data[stem+'_concentration'].max())],
                       'log': stem == 'wrf', 'verticalExaggeration': exaggeration}
            for level in range(count):
                prefix = f'{stem}_level{level}'
                nodes = []
                for mean, cov, concentration in zip(data[prefix+'_means'], data[prefix+'_covariances'], data[prefix+'_concentration']):
                    values, vectors = np.linalg.eigh(cov)
                    basis = (vectors @ np.diag(2*np.sqrt(np.maximum(values, 1e-10)))) * transform[:, None]
                    nodes.append({'mean': rounded((mean-center)*transform), 'basis': rounded(basis), 'concentration': float(concentration)})
                dataset['levels'].append({'nodes': nodes, 'labels': data[prefix+'_labels'][ids].tolist()})
            if stem == 'fig1':
                rep = build_representation_data(data)
                validate_representation_data(rep)
                def cells(items):
                    return [{'lower': rounded((c.lower-center)*transform), 'side': rounded(c.side*transform),
                             'concentration': float(rep['concentration'][c.ids].mean()), 'depth': c.depth} for c in items]
                dataset['voxels'] = [{'name': f'{n}³ grid · {len(c)} nonempty cells', 'cells': cells(c)} for n,c in rep['voxels'].items()]
                dataset['octree'] = [{'name': f'Depth {n} · {len(c)} nonempty leaves', 'cells': cells(c)} for n,c in rep['octree'].items()]
                dataset['root'] = cells([rep['root']])[0]
            payload['datasets'][stem] = dataset
        payload['smokeXY'] = rounded(data['wrf_points'][::6,:2])
        for level in (3, 4, 5):
            source = improved if level == 4 else data
            stem = f'plans_level{level}'
            fleet = {'depot': rounded(source[stem+'_depot']), 'vehicles': [], 'replanned': level == 4}
            assigned = []
            for vehicle in range(5 if level == 5 else 3):
                route, trajectory = source[f'{stem}_route{vehicle}'], source[f'{stem}_trajectory{vehicle}']
                events, start = [], 2
                for target in route:
                    samples = np.arange(start, len(trajectory), 2)
                    hits = samples[np.linalg.norm(trajectory[samples,:2]-target,axis=1) < 3]
                    assert len(hits), 'Unreached assigned target'
                    events.append(int(hits[0])); start=events[-1]+2
                assert events[-1] == len(trajectory)-1
                assigned.extend(route[:-1])
                fleet['vehicles'].append({'route': rounded(route), 'trajectory': rounded(trajectory), 'accepted': events})
            matches = np.linalg.norm(np.array(assigned)[:,None,:]-data[f'wrf_level{level}_means'][None,:,:2],axis=-1)<1e-8
            assert np.all(matches.sum(0)==1) and np.all(matches.sum(1)==1)
            payload['fleets'][str(level)] = fleet
    curve = DubinsIllustration()
    payload['dubins'] = {'poses': [rounded(np.r_[curve.pose(s)[0][:2], curve.pose(s)[1]]) for s in np.linspace(0, curve.length, 301)],
                         'joins': [curve.arc_length/curve.length, (curve.arc_length+curve.straight)/curve.length]}
    for filename in ('higum_data.npz', 'improved_plans.npz'):
        payload['provenance'][filename] = hashlib.sha256((SLIDES/'assets'/filename).read_bytes()).hexdigest()
    out = SITE/'assets/data/animations.js'
    out.write_text('window.HIGUM_ANIMATIONS='+json.dumps(payload, separators=(',', ':'), allow_nan=False)+';\n')
    shutil.copyfile(SLIDES/'assets/monitoring_uav.jpg', SITE/'assets/images/monitoring_uav.jpg')
    print(f'Exported native animation data: {out.stat().st_size:,} bytes; 10 scenes; exact fleet acceptance events.')


if __name__ == '__main__':
    export()
