#!/usr/bin/env node
// Structural and atlas-mapping checks for the schematic conduction overlay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../lib/three.min.js');
const HeartAnatomy = require('../heart-anatomy.js');
const ConductionAnatomy = require('../conduction-anatomy.js');
const EPSimModel = require('../simulation-model.js');

function readAsset() {
  const bytes = fs.readFileSync(path.join(__dirname, '../assets/heart.glb'));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'Expected a GLB heart asset');
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 'BIN\0') binary = chunk;
    offset += 8 + length;
  }
  assert.ok(json && binary, 'GLB JSON and binary chunks should exist');
  function accessor(index) {
    const item = json.accessors[index], view = json.bufferViews[item.bufferView];
    assert.equal(item.componentType, 5126, 'Heart positions should be float accessors');
    const stride = view.byteStride || 12, start = (view.byteOffset || 0) + (item.byteOffset || 0);
    const values = [];
    for (let i = 0; i < item.count; i++) values.push([0, 1, 2].map(axis => binary.readFloatLE(start + i * stride + axis * 4)));
    return values;
  }
  const scene = new THREE.Scene();
  const built = new Array(json.nodes.length);
  function build(index) {
    if (built[index]) return built[index];
    const source = json.nodes[index];
    const node = new THREE.Group();
    node.name = source.name || `node-${index}`;
    node.matrix.copy(source.matrix ? new THREE.Matrix4().fromArray(source.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3(...(source.translation || [0, 0, 0])),
      new THREE.Quaternion(...(source.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(source.scale || [1, 1, 1]))));
    node.matrixAutoUpdate = false;
    built[index] = node;
    if (source.mesh !== undefined) {
      for (const primitive of json.meshes[source.mesh].primitives) {
        const positions = accessor(primitive.attributes.POSITION);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
        const mesh = new THREE.Mesh(geometry);
        mesh.name = node.name;
        node.add(mesh);
      }
    }
    for (const child of source.children || []) node.add(build(child));
    return node;
  }
  for (const index of json.scenes[json.scene || 0].nodes) scene.add(build(index));
  scene.updateMatrixWorld(true);
  return scene;
}

const close = (a, b, tolerance = 1e-7) => Math.abs(a - b) <= tolerance;
function fromLocal(view, point) {
  return point.clone().divideScalar(view.scale).add(view.center).toArray();
}
function distanceToMesh(point, geometry) {
  const attribute = geometry.attributes.position, index = geometry.index;
  const triangle = new THREE.Triangle();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const nearest = new THREE.Vector3(), candidate = new THREE.Vector3();
  let best = Infinity;
  const count = index ? index.count : attribute.count;
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const ia = index ? index.getX(offset) : offset;
    const ib = index ? index.getX(offset + 1) : offset + 1;
    const ic = index ? index.getX(offset + 2) : offset + 2;
    triangle.set(a.fromBufferAttribute(attribute, ia), b.fromBufferAttribute(attribute, ib), c.fromBufferAttribute(attribute, ic));
    triangle.closestPointToPoint(point, candidate);
    const distance = candidate.distanceToSquared(point);
    if (distance < best) { best = distance; nearest.copy(candidate); }
  }
  return Math.sqrt(best);
}
function valveCenter(view, name) {
  const bounds = new THREE.Box3();
  view.entries.filter(entry => entry.name === name).forEach(entry => bounds.union(entry.sourceBounds));
  return bounds.getCenter(new THREE.Vector3());
}

const view = HeartAnatomy.prepare(THREE, readAsset(), 2.3);
const model = EPSimModel.createModel({ scenario: 'normal' });
const overlay = ConductionAnatomy.create(THREE, view, model.paths);
const byId = new Map(overlay.paths.map(path => [path.id, path]));
const recruitmentSummary = {};
const expectedIds = [
  'sa-atria', 'bachmann', 'av-his', 'right-bundle', 'left-bundle', 'accessory', 'atrial-return',
  'purkinje-rv-1', 'purkinje-rv-2', 'purkinje-rv-3',
  'purkinje-lv-1', 'purkinje-lv-2', 'purkinje-lv-3',
];
assert.deepEqual([...byId.keys()].sort(), expectedIds.slice().sort(), 'Expected one geometry for each model path ID');
assert.equal(overlay.nodes.length, 5, 'Expose only SA, AV, His, and one Purkinje anchor per ventricle');
assert.deepEqual(overlay.nodes.map(node => node.id).sort(), ['av', 'his', 'purkinje-lv', 'purkinje-rv', 'sa']);

for (const path of overlay.paths) {
  assert.ok(path.points.length >= 2, `${path.id} needs a drawable route`);
  assert.equal(path.pointChambers.length, path.points.length, `${path.id} identifies the source mesh for each point`);
  for (let i = 0; i < path.points.length; i++) {
    const point = path.points[i];
    assert.ok([point.x, point.y, point.z].every(Number.isFinite), `${path.id} has a finite normalized point`);
    assert.ok(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) < 1.5, `${path.id} stays within the prepared heart envelope`);
    const chamber = path.pointChambers[i];
    const meshName = { RA: 'VH_M_right_cardiac_atrium', LA: 'VH_M_left_cardiac_atrium', RV: 'VH_M_heart_right_ventricle', LV: 'VH_M_heart_left_ventricle', septum: 'VH_M_interventricular_septum' }[chamber];
    const entries = view.entries.filter(item => item.name === meshName);
    const distance = Math.min(...entries.map(entry => distanceToMesh(point, entry.geometry)));
    assert.ok(distance < 1e-5, `${path.id} point ${i} lies on its actual ${chamber} mesh, not just inside a bounding box`);
  }
}

const sa = overlay.nodes.find(node => node.id === 'sa');
const saSource = fromLocal(view, sa.position);
const svc = view.entries.find(entry => entry.name === 'VH_M_superior_vena_cava').sourceBounds.getCenter(new THREE.Vector3());
assert.ok(Math.abs(saSource[1] - svc.y) < 0.035, 'SA node should sit near the superior vena cava/right atrial roof');
assert.ok(saSource[2] > 0.04, 'SA node should be on the anterior side of the right atrium');
const av = overlay.nodes.find(node => node.id === 'av'), his = overlay.nodes.find(node => node.id === 'his');
const avSource = new THREE.Vector3(...fromLocal(view, av.position));
const hisSource = new THREE.Vector3(...fromLocal(view, his.position));
const tricuspid = valveCenter(view, 'VH_M_tricuspid_valve');
assert.ok(avSource.distanceTo(tricuspid) < 0.025, 'AV node should lie adjacent to the septal tricuspid annulus');
assert.ok(hisSource.distanceTo(avSource) < 0.03, 'His should continue just superior to the AV node across the septal junction');
assert.ok(avSource.y > hisSource.y, 'AV node should sit superior to His at the septal junction');
assert.ok(avSource.z < hisSource.z, 'AV node should sit posterior to His');

for (const chamber of ['RV', 'LV']) {
  const bundle = byId.get(chamber === 'RV' ? 'right-bundle' : 'left-bundle');
  const fans = [...byId.values()].filter(path => path.kind === 'purkinje' && path.chamber === chamber);
  assert.equal(fans.length, 3, `${chamber} needs three fan branches`);
  assert.ok(bundle.points.at(-1).distanceTo(fans[0].points[0]) < 1e-7, `${chamber} bundle should meet its fan apex`);
  const side = chamber === 'RV' ? -1 : 1;
  const primary = model.regions.find(region => region.id === chamber.toLowerCase());
  const last = Math.max(...model.regions.filter(region => region.chamber === chamber && region.id !== 'preexcitation').map(region => region.end));
  for (const fan of fans) {
    const modelFan = model.paths.find(path => path.id === fan.id);
    assert.equal(modelFan.chamberPoints.length, fan.chamberPoints.length, `${fan.id} preserves the model's timing point count`);
    assert.equal(fan.timingNeedsRecompute, true, `${fan.id} signals that projected coordinates need fresh timing`);
    assert.equal(fan.points.length, fan.chamberPoints.length, `${fan.id} geometry and timing samples align`);
    assert.ok(fan.chamberPoints.at(-1)[1] > fan.chamberPoints[0][1], `${fan.id} starts at the apex and ascends the wall`);
    const times = fan.chamberPoints.map(([x, y, z]) => primary.onset +
      (0.70 * (y + 1) / 2 + 0.25 * (side * x + 1) / 2 + 0.05 * (z + 1) / 2) * (last - primary.onset));
    recruitmentSummary[fan.id] = times.map(time => +time.toFixed(1));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], `${fan.id} projected recruitment remains increasing: ${times.join(', ')} at ${JSON.stringify(fan.chamberPoints)}`);
    fan.points.forEach((point, index) => {
      const actual = fromLocal(view, point), bounds = view.chamberBounds[chamber];
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      const recovered = actual.map((value, axis) => 2 * (value - center.getComponent(axis)) / size.getComponent(axis));
      recovered.forEach((value, axis) => assert.ok(close(value, fan.chamberPoints[index][axis]), `${fan.id} point ${index} timing coordinate matches the projected surface`));
      recovered.forEach(value => assert.ok(Math.abs(value) <= 1.0001, `${fan.id} point ${index} remains inside chamber coordinates without clamping`));
    });
  }
}

const rightBundleSource = fromLocal(view, byId.get('right-bundle').points[1]);
const leftBundleSource = fromLocal(view, byId.get('left-bundle').points[1]);
assert.ok(rightBundleSource[0] < leftBundleSource[0], 'Right bundle should remain on patient-right side of left bundle');

for (const [scenario, blockedId] of [['rbbb', 'purkinje-rv-1'], ['lbbb', 'purkinje-lv-1']]) {
  const scenarioModel = EPSimModel.createModel({ scenario });
  const scenarioPaths = new Map(ConductionAnatomy.create(THREE, view, scenarioModel.paths).paths.map(path => [path.id, path]));
  assert.equal(scenarioPaths.get(blockedId).blocked, true, `${scenario} keeps the affected fan marked blocked`);
  const otherId = scenario === 'rbbb' ? 'purkinje-lv-1' : 'purkinje-rv-1';
  assert.equal(scenarioPaths.get(otherId).blocked, false, `${scenario} leaves the other ventricle's fan available`);
}

const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../conduction-anatomy.js'), 'utf8'), browser);
assert.equal(typeof browser.ConductionAnatomy.create, 'function', 'UMD browser API should be exposed');

console.log(`PASS: HRA-surface conduction tracts, canonical IDs, mapped Purkinje timing, orientation, and blocked-side metadata. ${JSON.stringify(recruitmentSummary)}`);
