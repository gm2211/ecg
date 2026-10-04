/* Schematic conduction overlay projected onto real HRA chamber meshes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConductionAnatomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const chamberMeshes = {
    RA: 'VH_M_right_cardiac_atrium', LA: 'VH_M_left_cardiac_atrium',
    RV: 'VH_M_heart_right_ventricle', LV: 'VH_M_heart_left_ventricle',
    septum: 'VH_M_interventricular_septum',
  };
  const fanFallback = [
    [[0.80, -0.60, 0.10], [0.90, 0.20, 0.08], [0.75, 0.62, 0.05]],
    [[0.30, -0.60, 0.50], [0.65, 0.00, 0.68], [0.50, 0.53, 0.70]],
    [[0.25, -0.55, -0.40], [0.65, -0.05, -0.65], [0.45, 0.50, -0.70]],
  ];
  const clamp = value => Math.max(-1, Math.min(1, value));

  function create(THREE, view, modelPaths) {
    if (!THREE?.Vector3 || !THREE?.Triangle || !view?.toLocal || !view?.chamberBounds || !Array.isArray(view.entries)) {
      throw new TypeError('create requires THREE and a prepared HeartAnatomy view');
    }
    for (const chamber of Object.keys(chamberMeshes)) {
      if (!view.chamberBounds[chamber]) throw new Error(`Prepared heart is missing ${chamber} bounds`);
    }

    const paths = [], nodes = [];
    const sourcePathById = new Map((Array.isArray(modelPaths) ? modelPaths : []).map(path => [path.id, path]));
    const geometries = {};
    for (const [chamber, name] of Object.entries(chamberMeshes)) {
      const entries = view.entries.filter(item => item.name === name && item.geometry?.attributes?.position);
      if (!entries.length) throw new Error(`Prepared heart is missing chamber mesh ${name}`);
      geometries[chamber] = { entries };
    }

    const sourcePoint = (chamber, normalized) => {
      const bounds = view.chamberBounds[chamber];
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      return [0, 1, 2].map(axis => center.getComponent(axis) +
        size.getComponent(axis) * clamp(normalized[axis]) * 0.5);
    };
    const localPoint = source => view.toLocal(source);
    const toSource = local => local.clone().divideScalar(view.scale).add(view.center).toArray();
    const chamberCoordinates = (chamber, local) => {
      const source = toSource(local), bounds = view.chamberBounds[chamber];
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      return source.map((value, axis) => 2 * (value - center.getComponent(axis)) / Math.max(size.getComponent(axis), 1e-9));
    };
    const recruitment = (chamber, point) => {
      const side = chamber === 'RV' ? -1 : 1;
      const [x, y, z] = point;
      return 0.70 * (y + 1) / 2 + 0.25 * (side * x + 1) / 2 + 0.05 * (z + 1) / 2;
    };
    const valveCenter = name => {
      const entries = view.entries.filter(item => item.name === name && item.sourceBounds);
      if (!entries.length) throw new Error(`Prepared heart is missing valve mesh ${name}`);
      const bounds = new THREE.Box3();
      for (const entry of entries) bounds.union(entry.sourceBounds);
      return bounds.getCenter(new THREE.Vector3());
    };

    // Project each route point onto actual chamber triangles. Closest-surface
    // projection follows tapered or oblique walls instead of continuing a
    // straight box ray through empty space.
    function projectToMesh(chamber, desired) {
      const target = localPoint(desired);
      const triangle = new THREE.Triangle();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const candidate = new THREE.Vector3(), nearest = new THREE.Vector3();
      let nearestDistance = Infinity;
      for (const entry of geometries[chamber].entries) {
        const attribute = entry.geometry.attributes.position, index = entry.geometry.index;
        const count = index ? index.count : attribute.count;
        for (let offset = 0; offset + 2 < count; offset += 3) {
          const ia = index ? index.getX(offset) : offset;
          const ib = index ? index.getX(offset + 1) : offset + 1;
          const ic = index ? index.getX(offset + 2) : offset + 2;
          triangle.set(a.fromBufferAttribute(attribute, ia), b.fromBufferAttribute(attribute, ib), c.fromBufferAttribute(attribute, ic));
          triangle.closestPointToPoint(target, candidate);
          const distance = candidate.distanceToSquared(target);
          if (distance < nearestDistance) { nearestDistance = distance; nearest.copy(candidate); }
        }
      }
      if (!Number.isFinite(nearestDistance)) throw new Error(`Could not project onto ${chamber} mesh`);
      return nearest;
    }
    const anchor = (chamber, normalized) => {
      const point = projectToMesh(chamber, sourcePoint(chamber, normalized));
      return { chamber, position: point, chamberPoint: chamberCoordinates(chamber, point) };
    };
    const fromValve = (chamber, valve, offset) => {
      const base = valveCenter(valve);
      const desired = [base.x + offset[0], base.y + offset[1], base.z + offset[2]];
      return anchor(chamber, chamberCoordinates(chamber, localPoint(desired)));
    };
    const addNode = (id, label, chamber, point) => {
      nodes.push({ id, label, chamber, position: point.position, chamberPoint: point.chamberPoint });
      return point;
    };
    const addPath = (id, label, anchors, metadata = {}) => {
      paths.push({ id, label, kind: 'specialized-tract', points: anchors.map(item => item.position), pointChambers: anchors.map(item => item.chamber), ...metadata });
      return anchors;
    };

    // The SA node lies under the superior/anterior RA roof beside the SVC.
    const sa = addNode('sa', 'SA node', 'RA', anchor('RA', [-0.08, 0.82, 0.70]));
    // Koch's triangle is adjacent to the septal tricuspid leaflet. Locating AV
    // and His from the valve places the short AV-His axis above the ventricular
    // silhouette and across the atrial/ventricular septal junction.
    const av = addNode('av', 'AV node', 'RA', fromValve('RA', 'VH_M_tricuspid_valve', [0.003, 0.014, -0.010]));
    const his = addNode('his', 'Bundle of His', 'septum', fromValve('septum', 'VH_M_tricuspid_valve', [0.009, 0.007, -0.002]));
    const laRoof = anchor('LA', [-0.12, 0.75, -0.12]);

    addPath('sa-atria', 'SA node to atria', [sa, anchor('RA', [-0.38, 0.18, 0.45]), av]);
    addPath('bachmann', "Bachmann's bundle", [sa, anchor('RA', [0.18, 0.82, 0.26]), laRoof]);
    addPath('av-his', 'AV node and His conduction', [av, fromValve('septum', 'VH_M_tricuspid_valve', [0.006, 0.010, -0.005]), his]);

    const apexByChamber = { RV: [0.30, -0.85, 0.10], LV: [-0.30, -0.88, 0.15] };
    for (const chamber of ['RV', 'LV']) {
      const isRight = chamber === 'RV';
      const side = isRight ? -1 : 1;
      const branchId = isRight ? 'right-bundle' : 'left-bundle';
      const modelBranch = sourcePathById.get(branchId);
      const blocked = !!modelBranch?.blocked;
      const apex = anchor(chamber, apexByChamber[chamber]);
      addPath(branchId, isRight ? 'Right bundle branch' : 'Left bundle branch', [
        his,
        anchor('septum', [side * 0.46, 0.18, 0.10]),
        apex,
      ], { chamber, blocked });
      addNode(`purkinje-${chamber.toLowerCase()}`, `${chamber} Purkinje network`, chamber, apex);

      const modelFans = (Array.isArray(modelPaths) ? modelPaths : [])
        .filter(path => path.kind === 'purkinje' && path.chamber === chamber)
        .sort((a, b) => a.id.localeCompare(b.id));
      const fans = modelFans.length ? modelFans : fanFallback.map((fan, index) => ({
        id: `purkinje-${chamber.toLowerCase()}-${index + 1}`,
        chamberPoints: [apexByChamber[chamber], ...fan.map(([x, y, z]) => [side * x, y, z])],
        blocked,
        label: `${chamber} Purkinje fan ${index + 1}`,
      }));
      for (const fan of fans) {
        if (!Array.isArray(fan.chamberPoints) || fan.chamberPoints.length < 2) {
          throw new Error(`${fan.id} needs at least two chamber-local points`);
        }
        const anchors = fan.chamberPoints.map(point => anchor(chamber, point));
        const mainFan = {
          id: fan.id,
          label: fan.label,
          kind: 'purkinje',
          chamber,
          points: anchors.map(item => item.position),
          pointChambers: anchors.map(item => item.chamber),
          chamberPoints: anchors.map(item => item.chamberPoint),
          timingNeedsRecompute: true,
          blocked: !!fan.blocked,
        };
        paths.push(mainFan);

        // The chamber meshes are a surface scaffold, not segmented
        // endocardium or Purkinje fibers. Add three terminal arbors to each
        // schematic fan. Each starts at an exact fan sample and is projected
        // back onto the real chamber triangles so it follows the tapered wall.
        // Root-owned timing is recomputed from these projected chamberPoints.
        for (let branchIndex = 1; branchIndex <= 3; branchIndex++) {
          const parentIndex = Math.min(branchIndex, anchors.length - 2);
          const root = anchors[parentIndex];
          const rootCoords = root.chamberPoint;
          const lateral = (branchIndex % 2 ? 1 : -1) * (chamber === 'RV' ? -1 : 1);
          const depth = branchIndex === 2 ? 1 : -1;
          const offsets = [
            [lateral * 0.16, 0.18, depth * 0.14],
            [lateral * 0.28, 0.38, depth * 0.24],
          ];
          const childAnchors = [root];
          for (const [dx, dy, dz] of offsets) {
            const previous = childAnchors.at(-1).chamberPoint;
            let projected = null;
            for (let rise = 0; rise <= 0.4; rise += 0.04) {
              const desired = [rootCoords[0] + dx, rootCoords[1] + dy + rise, rootCoords[2] + dz];
              const candidate = anchor(chamber, desired);
              if (recruitment(chamber, candidate.chamberPoint) > recruitment(chamber, previous) + 1e-6) {
                projected = candidate;
                break;
              }
            }
            if (!projected) throw new Error(`${fan.id} branch ${branchIndex} does not recruit monotonically after mesh projection`);
            childAnchors.push(projected);
          }
          paths.push({
            id: `${fan.id}-branch-${branchIndex}`,
            sourceId: fan.id,
            parentId: fan.id,
            branchParentProgress: parentIndex / (anchors.length - 1),
            label: `${fan.label} arbor ${branchIndex}`,
            kind: 'purkinje',
            chamber,
            points: childAnchors.map(item => item.position),
            pointChambers: childAnchors.map(item => item.chamber),
            chamberPoints: childAnchors.map(item => item.chamberPoint),
            timingNeedsRecompute: true,
            blocked: !!fan.blocked,
          });
        }
      }
    }

    addPath('accessory', 'Left free-wall accessory pathway', [
      anchor('LA', [0.78, -0.78, -0.35]), anchor('LA', [0.92, -0.50, -0.28]), anchor('LV', [0.84, 0.78, -0.25]),
    ], { accessory: true });
    addPath('atrial-return', 'Retrograde atrial spread', [
      anchor('LA', [0.78, -0.78, -0.35]), anchor('LA', [0.30, -0.42, -0.18]), anchor('RA', [0.74, -0.58, -0.10]), av,
    ], { retrograde: true });
    return { paths, nodes };
  }

  return { create };
});
