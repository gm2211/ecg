#!/usr/bin/env node
// Independent structure, coordinate, and activation checks for assets/heart.glb.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const THREE = require('../lib/three.min.js');
const HeartAnatomy = require('../heart-anatomy.js');
const EPSimModel = require('../simulation-model.js');

const ASSET = path.join(__dirname, '../assets/heart.glb');
const TOLERANCE = 1e-6;
const REQUIREMENTS = {
  chambers: [
    'VH_M_left_cardiac_atrium', 'VH_M_right_cardiac_atrium',
    'VH_M_heart_right_ventricle', 'VH_M_heart_left_ventricle',
  ],
  septum: 'VH_M_interventricular_septum',
  valves: ['VH_M_mitral_valve', 'VH_M_tricuspid_valve', 'VH_M_aortic_valve', 'VH_M_pulmonary_valve'],
  pulmonaryVeins: ['VH_M_pulmonary_vein_R_inf', 'VH_M_pulmonary_vein_R_sup', 'VH_M_pulmonary_vein_L_inf', 'VH_M_pulmonary_vein_L_sup'],
  aorticBranches: ['VH_M_brachiocephalic_artery_a', 'VH_M_left_common_carotid_artery_a', 'VH_M_left_subclavian_artery_a'],
  greatVessels: ['VH_M_aortic_arch', 'VH_M_ascending_aorta', 'VH_M_descending_aorta_a', 'VH_M_pulmonary_trunk', 'VH_M_pulmonary_artery_L', 'VH_M_pulmonary_artery_R', 'VH_M_superior_vena_cava', 'VH_M_inferior_vena_cava_a'],
};

function check(condition, message) { assert.ok(condition, message); }
function parseGlb(file) {
  const bytes = fs.readFileSync(file);
  check(bytes.toString('ascii', 0, 4) === 'glTF' && bytes.readUInt32LE(4) === 2, 'Expected a glTF 2.0 binary asset');
  check(bytes.readUInt32LE(8) === bytes.length, 'GLB total length does not match the file size');
  let cursor = 12, json, binary;
  while (cursor < bytes.length) {
    const length = bytes.readUInt32LE(cursor), type = bytes.toString('ascii', cursor + 4, cursor + 8);
    const chunk = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 'BIN\0') binary = chunk;
    cursor += 8 + length;
  }
  check(json && binary && json.buffers?.[0]?.byteLength <= binary.length, 'GLB JSON or binary chunk is missing');
  return { json, binary };
}

function accessor(doc, index) {
  const item = doc.json.accessors[index];
  check(item && !item.sparse, `Missing or sparse accessor ${index}`);
  const lanes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[item.type];
  const formats = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
  const format = formats[item.componentType];
  check(lanes && format, `Unsupported accessor ${index}`);
  const view = doc.json.bufferViews[item.bufferView];
  check(view && (view.buffer === undefined || view.buffer === 0), `Unsupported buffer for accessor ${index}`);
  const [reader, componentBytes] = format;
  const stride = view.byteStride || lanes * componentBytes;
  const start = (view.byteOffset || 0) + (item.byteOffset || 0);
  const values = new Array(item.count * lanes);
  for (let vertex = 0; vertex < item.count; vertex++) for (let lane = 0; lane < lanes; lane++) {
    values[vertex * lanes + lane] = doc.binary[reader](start + vertex * stride + lane * componentBytes);
  }
  return { item, values, lanes };
}

function transformFor(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(node.translation || [0, 0, 0])),
    new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
    new THREE.Vector3(...(node.scale || [1, 1, 1])),
  );
}

function loadScene(doc) {
  const scene = new THREE.Scene();
  const nodes = doc.json.nodes;
  const built = new Array(nodes.length);
  function build(index) {
    if (built[index]) return built[index];
    const source = nodes[index], group = new THREE.Group();
    group.name = source.name || `node-${index}`;
    group.matrix.copy(transformFor(source)); group.matrixAutoUpdate = false;
    if (source.mesh !== undefined) {
      const mesh = doc.json.meshes[source.mesh];
      check(mesh, `Missing mesh for ${group.name}`);
      for (const primitive of mesh.primitives) {
        check((primitive.mode ?? 4) === 4 && primitive.attributes.POSITION !== undefined && primitive.attributes.NORMAL !== undefined, `Unsupported or incomplete primitive in ${group.name}`);
        const positions = accessor(doc, primitive.attributes.POSITION);
        const normals = accessor(doc, primitive.attributes.NORMAL);
        check(positions.lanes === 3 && normals.lanes === 3 && positions.item.count === normals.item.count, `Position/normal count mismatch in ${group.name}`);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.values, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals.values, 3));
        if (primitive.indices !== undefined) {
          const indices = accessor(doc, primitive.indices);
          check(indices.lanes === 1, `Invalid index accessor in ${group.name}`);
          geometry.setIndex(indices.values);
        }
        const rendered = new THREE.Mesh(geometry, HeartAnatomy.material(THREE, group.name));
        rendered.name = group.name;
        group.add(rendered);
      }
    }
    built[index] = group;
    for (const child of source.children || []) group.add(build(child));
    return group;
  }
  const roots = doc.json.scenes[doc.json.scene || 0]?.nodes || [];
  check(roots.length > 0, 'Asset scene has no roots');
  for (const root of roots) scene.add(build(root));
  scene.updateMatrixWorld(true);
  return scene;
}

function finiteGeometry(scene) {
  const allPositions = new Map(), centers = new Map();
  let meshCount = 0, vertexCount = 0;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    meshCount++;
    const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
    check(positions && normals && positions.count > 0 && positions.count === normals.count, `Invalid vertex arrays in ${mesh.name}`);
    const determinant = mesh.matrixWorld.determinant();
    check(Number.isFinite(determinant) && determinant >= -1e-12, `Negative or invalid transform determinant in ${mesh.name}: ${determinant}`);
    for (let i = 0; i < positions.count; i++) {
      const values = [positions.getX(i), positions.getY(i), positions.getZ(i), normals.getX(i), normals.getY(i), normals.getZ(i)];
      check(values.every(Number.isFinite), `Non-finite vertex data in ${mesh.name}`);
      vertexCount++;
    }
    const worldGeometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    worldGeometry.computeBoundingBox();
    allPositions.set(mesh.name, { positions, matrixWorld: mesh.matrixWorld.clone() });
    centers.set(mesh.name, worldGeometry.boundingBox.getCenter(new THREE.Vector3()));
    worldGeometry.dispose();
  });
  return { allPositions, centers, meshCount, vertexCount };
}

function verifyNames(names) {
  for (const name of REQUIREMENTS.chambers) check(names.has(name), `Missing chamber ${name}`);
  check(names.has(REQUIREMENTS.septum), `Missing ${REQUIREMENTS.septum}`);
  for (const name of REQUIREMENTS.valves) check(names.has(name), `Missing valve ${name}`);
  for (const name of [...REQUIREMENTS.greatVessels, ...REQUIREMENTS.pulmonaryVeins, ...REQUIREMENTS.aorticBranches]) check(names.has(name), `Missing great vessel ${name}`);
  check(names.has('VH_M_blood_vasculature_of_heart'), 'Missing named cardiac vessel subtree');
  check(![...names].some(name => /brachiocephalic_vein|splenic_vein|hepatic_vein/i.test(name)), 'Neck and abdominal tributaries should be excluded');
}

function verifyAnatomicalOrientation(centers) {
  const la = centers.get('VH_M_left_cardiac_atrium');
  const ra = centers.get('VH_M_right_cardiac_atrium');
  const rv = centers.get('VH_M_heart_right_ventricle');
  const lv = centers.get('VH_M_heart_left_ventricle');
  check(la.z < ra.z && la.z < rv.z, `Left atrium is not posterior to the right atrium and ventricle: LA z=${la.z}, RA z=${ra.z}, RV z=${rv.z}`);
  check(lv.x > ra.x, `Left ventricle is not left of the right atrium: LV x=${lv.x}, RA x=${ra.x}`);
}

function verifyBodyRestoration(views, originals) {
  let maxError = 0, comparedVertices = 0;
  for (const view of views) for (const entry of view.entries) {
    const original = originals.get(entry.name);
    if (!original) continue;
    const attr = entry.geometry.getAttribute('position');
    for (let i = 0; i < attr.count; i++) {
      const local = new THREE.Vector3(attr.getX(i), attr.getY(i), attr.getZ(i));
      const restored = local.multiplyScalar(view.bodyScale).add(view.bodyPosition);
      const source = new THREE.Vector3(original.positions.getX(i), original.positions.getY(i), original.positions.getZ(i)).applyMatrix4(original.matrixWorld);
      const expected = new THREE.Vector3(4 * source.x, 4 * (source.y - 0.44), 4 * source.z);
      const error = restored.distanceTo(expected);
      if (error > maxError) maxError = error;
      check(Number.isFinite(error) && error <= TOLERANCE, `Prepared body transform drifted by ${error} viewer units for ${entry.name} vertex ${i}`);
      comparedVertices++;
    }
  }
  check(comparedVertices > 0, 'Body transform check did not compare vertices');
  return { comparedVertices, maximumError: maxError };
}

function verifyActivation(views) {
  // Tricuspid papillary muscles follow RV activation; mitral muscles follow LV.
  for (const suffix of ['anterior', 'medial', 'posterior']) {
    check(HeartAnatomy.chamberOf(`VH_M_papillary_muscle_of_heart_${suffix}`) === 'RV', `Tricuspid ${suffix} papillary muscle mapped outside RV`);
  }
  for (const suffix of ['anterolateral', 'posteromedial']) {
    check(HeartAnatomy.chamberOf(`VH_M_papillary_muscle_of_heart_${suffix}`) === 'LV', `Mitral ${suffix} papillary muscle mapped outside LV`);
  }
  const mapped = views[0].entries.filter(entry => entry.chamber);
  check(mapped.length > 0, 'No myocardial meshes map to an electrical chamber');
  for (const name of REQUIREMENTS.greatVessels.concat(REQUIREMENTS.pulmonaryVeins, REQUIREMENTS.aorticBranches, REQUIREMENTS.valves)) {
    check(HeartAnatomy.chamberOf(name) === null, `${name} must not map to myocardium`);
  }
  for (const id of ['normal', 'rbbb', 'lbbb', 'wpw', 'avblock', 'avrt']) {
    const model = EPSimModel.createModel({ scenario: id });
    let tested = 0;
    for (const view of views) for (const entry of view.entries) {
      if (!entry.chamber) continue;
      const position = entry.geometry.getAttribute('position');
      const stride = Math.max(1, Math.floor(position.count / 900));
      for (let i = 0; i < position.count; i += stride) {
        const point = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
        const coordinates = HeartAnatomy.coordinates(THREE, view, entry, point);
        const timing = model.activation(entry.chamber, ...coordinates);
        check(Number.isFinite(timing.onset) && Number.isFinite(timing.recovery) && Number.isFinite(timing.recoveryEnd), `Non-finite activation in ${id}/${entry.name}/${i}`);
        check(timing.recoveryEnd >= timing.recovery, `Recovery ends before it starts in ${id}/${entry.name}/${i}`);
        tested++;
      }
    }
    check(tested > 0, `No actual myocardial vertices tested for ${id}`);
  }
  for (const name of [...REQUIREMENTS.greatVessels, ...REQUIREMENTS.pulmonaryVeins, ...REQUIREMENTS.aorticBranches, ...REQUIREMENTS.valves]) {
    const result = EPSimModel.createModel({ scenario: 'normal' }).activation(HeartAnatomy.chamberOf(name), 0, 0, 0);
    check(!Number.isFinite(result.onset) && !Number.isFinite(result.recovery), `${name} unexpectedly received myocardial activation`);
  }
  return { scenarios: 6, views: views.length, myocardialMeshes: mapped.length };
}

try {
  const doc = parseGlb(ASSET);
  const scene = loadScene(doc);
  const loaded = finiteGeometry(scene);
  verifyNames(new Set(doc.json.nodes.map(node => node.name).filter(Boolean)));
  verifyAnatomicalOrientation(loaded.centers);
  const views = [HeartAnatomy.prepare(THREE, scene, 1.32), HeartAnatomy.prepare(THREE, scene, 2.3)];
  const body = verifyBodyRestoration(views, loaded.allPositions);
  const activation = verifyActivation(views);
  console.log(JSON.stringify({
    asset: ASSET,
    source: doc.json.asset.extras?.sourceSha256,
    sceneRoots: doc.json.scenes[doc.json.scene || 0].nodes.map(index => doc.json.nodes[index].name),
    meshes: loaded.meshCount,
    vertices: loaded.vertexCount,
    required: { chambers: REQUIREMENTS.chambers.length, septum: 1, valves: REQUIREMENTS.valves.length, pulmonaryVeins: REQUIREMENTS.pulmonaryVeins.length, aorticBranches: REQUIREMENTS.aorticBranches.length },
    orientation: 'LA posterior to RA/RV; LV left of RA',
    bodyRestoration: body,
    activation,
    result: 'PASS',
  }, null, 2));
} catch (error) {
  console.error(`check-heart-anatomy: ${error.message}`);
  process.exitCode = 1;
}
