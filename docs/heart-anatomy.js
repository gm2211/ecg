/* Shared HRA geometry: patient left +X, superior +Y, anterior +Z, meters. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HeartAnatomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const chambers = {
    VH_M_left_cardiac_atrium: 'LA', VH_M_right_cardiac_atrium: 'RA',
    VH_M_heart_right_ventricle: 'RV', VH_M_heart_left_ventricle: 'LV',
    VH_M_interventricular_septum: 'septum',
    VH_M_papillary_muscle_of_heart_anterior: 'RV',
    VH_M_papillary_muscle_of_heart_anterolateral: 'LV',
    VH_M_papillary_muscle_of_heart_posteromedial: 'LV',
    VH_M_papillary_muscle_of_heart_medial: 'RV',
    VH_M_papillary_muscle_of_heart_posterior: 'RV',
  };
  const codes = {RA: 1, LA: 2, RV: 3, LV: 4, septum: 5};
  const chamberOf = name => chambers[name] || null;
  function prepare(THREE, scene, extent) {
    scene.updateMatrixWorld(true);
    const entries = [], bounds = new THREE.Box3(), myocardialBounds = new THREE.Box3(), chamberBounds = {};
    scene.traverse(node => {
      if (!node.isMesh) return;
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      geometry.computeBoundingBox();
      const chamber = chamberOf(node.name);
      bounds.union(geometry.boundingBox);
      if (chamber) {
        myocardialBounds.union(geometry.boundingBox);
        (chamberBounds[chamber] ||= new THREE.Box3()).union(geometry.boundingBox);
      }
      entries.push({name: node.name, chamber, geometry, sourceBounds: geometry.boundingBox.clone()});
    });
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const scale = extent / Math.max(size.x, size.y, size.z);
    const toLocal = point => new THREE.Vector3(...point).sub(center).multiplyScalar(scale);
    for (const entry of entries) {
      entry.geometry.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale);
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
    }
    return {entries, center, scale, chamberBounds, toLocal,
      electricalCenter: toLocal(myocardialBounds.getCenter(new THREE.Vector3()).toArray()),
      bodyScale: 4 / scale,
      bodyPosition: new THREE.Vector3(center.x * 4, (center.y - .44) * 4, center.z * 4)};
  }
  function coordinates(THREE, view, entry, point) {
    const source = point.clone().divideScalar(view.scale).add(view.center);
    const bounds = view.chamberBounds[entry.chamber];
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    return source.sub(center).toArray().map((v,i) => Math.max(-1, Math.min(1, 2*v/Math.max(size.getComponent(i), 1e-6))));
  }
  function material(THREE, name) {
    const chamber = chamberOf(name), valve = name.includes('valve');
    const oxygenated = /aort|coronary_artery|descending_artery|marginal|diagonal_branch|carotid|subclavian_artery|brachiocephalic_artery|pulmonary_vein/.test(name);
    const color = valve ? 0xc5ad8f : chamber ? 0x853c42 : oxygenated ? 0xa64445 : 0x4e687f;
    return new THREE.MeshPhysicalMaterial({color: new THREE.Color(color).convertSRGBToLinear(), roughness: chamber ? .68 : .52,
      metalness: 0, envMapIntensity: .34, clearcoat: .10, clearcoatRoughness: .45,
      side: THREE.DoubleSide});
  }
  function orientation(camera, target) {
    const direction = camera.position.clone().sub(target);
    if (Math.abs(direction.y) > Math.max(Math.abs(direction.x), Math.abs(direction.z))) return direction.y > 0 ? 'Superior view' : 'Inferior view';
    if (Math.abs(direction.x) > Math.abs(direction.z)) return direction.x > 0 ? 'Patient left view' : 'Patient right view';
    return direction.z > 0 ? 'Anterior · patient R ← → L' : 'Posterior · patient L ← → R';
  }
  return {chamberOf, codes, prepare, coordinates, material, orientation};
});
