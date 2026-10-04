#!/usr/bin/env node
// Merge the HRA v1.2 heart and vessel GLBs without changing their coordinate frame.
// Usage: node scripts/prepare-heart.cjs /path/to/heart.glb /path/to/vessels.glb
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const THREE = require('../lib/three.min.js');

const EXPECTED = {
  heart: 'b1237e7e765178e9357fd2ea7ccf19d55d0bf9ca55e187886635febe28244c70',
  vessels: 'a31ebed6d527b1cff31942e3e50d7c074c30b574337f68c4b89e9c88e4309d0d',
};
const SOURCES = {
  heart: 'https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Heart.glb',
  vessels: 'https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Blood_Vasculature.glb',
  repository: 'https://github.com/hubmapconsortium/ccf-releases/tree/main/v1.2/models',
};
// glTF positions are float32. Round the lower plane upward and upper plane
// downward so quantization cannot leave a vertex just outside the requested slab.
function float32AtOrAbove(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  let bits = view.getUint32(0, true);
  if (view.getFloat32(0, true) < value) bits++;
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}
function float32AtOrBelow(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  let bits = view.getUint32(0, true);
  if (view.getFloat32(0, true) > value) bits--;
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}
const LOW_Y = float32AtOrAbove(0.415);
const HIGH_Y = float32AtOrBelow(0.585);
// Keep the cardiac view free of neck and abdominal tributaries that cross the slab.
const EXCLUDED_NODE = /brachiocephalic_vein|splenic_vein|hepatic_vein/i;
const DESTINATION = path.join(__dirname, '../assets/heart.glb');

function fail(message) { throw new Error(message); }
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

function readGlb(file, expectedHash, label) {
  const bytes = fs.readFileSync(file);
  const hash = sha256(bytes);
  if (hash !== expectedHash) fail(`${label} source integrity check failed: expected ${expectedHash}, got ${hash}`);
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    fail(`${label} is not a valid glTF 2.0 binary file`);
  }
  let offset = 12, gltf = null, binary = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') gltf = JSON.parse(chunk.toString('utf8').replace(/\0+$/g, '').trim());
    if (type === 'BIN\0') binary = chunk;
    offset += 8 + length;
  }
  if (!gltf || !binary || !gltf.buffers?.[0] || gltf.buffers[0].byteLength > binary.length) fail(`${label} has incomplete GLB chunks`);
  return { gltf, binary, hash };
}

function componentInfo(type) {
  const types = {
    5120: { bytes: 1, read: 'readInt8' }, 5121: { bytes: 1, read: 'readUInt8' },
    5122: { bytes: 2, read: 'readInt16LE' }, 5123: { bytes: 2, read: 'readUInt16LE' },
    5125: { bytes: 4, read: 'readUInt32LE' }, 5126: { bytes: 4, read: 'readFloatLE' },
  };
  if (!types[type]) fail(`Unsupported glTF component type ${type}`);
  return types[type];
}

function accessorValues(source, accessorIndex) {
  const accessor = source.gltf.accessors[accessorIndex];
  if (!accessor || accessor.sparse) fail(`Missing or sparse accessor ${accessorIndex}`);
  const lanes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  if (!lanes) fail(`Unsupported accessor type ${accessor.type}`);
  const component = componentInfo(accessor.componentType);
  const view = source.gltf.bufferViews[accessor.bufferView];
  if (!view || view.buffer !== undefined && view.buffer !== 0) fail(`Unsupported buffer view for accessor ${accessorIndex}`);
  const packedBytes = lanes * component.bytes;
  const stride = view.byteStride || packedBytes;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = new Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) {
    const values = new Array(lanes);
    for (let j = 0; j < lanes; j++) values[j] = source.binary[component.read](start + i * stride + j * component.bytes);
    out[i] = lanes === 1 ? values[0] : values;
  }
  return out;
}

function localMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  const position = new THREE.Vector3(...(node.translation || [0, 0, 0]));
  const rotation = new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1]));
  const scale = new THREE.Vector3(...(node.scale || [1, 1, 1]));
  return new THREE.Matrix4().compose(position, rotation, scale);
}

function transformedAttributes(source, primitive, worldMatrix) {
  const positionIndex = primitive.attributes.POSITION;
  const normalIndex = primitive.attributes.NORMAL;
  if (positionIndex === undefined || normalIndex === undefined) fail('Every source mesh must include positions and normals');
  const positions = accessorValues(source, positionIndex);
  const normals = accessorValues(source, normalIndex);
  if (positions.length !== normals.length) fail('Position and normal counts differ');
  const identity = worldMatrix.equals(new THREE.Matrix4());
  if (identity) return { positions, normals, transformed: false };
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
  for (let i = 0; i < positions.length; i++) {
    const point = new THREE.Vector3(...positions[i]).applyMatrix4(worldMatrix);
    const normal = new THREE.Vector3(...normals[i]).applyMatrix3(normalMatrix).normalize();
    positions[i] = point.toArray();
    normals[i] = normal.toArray();
  }
  return { positions, normals, transformed: true };
}

function clippedTriangles(positions, normals, sourceIndices) {
  const outputPositions = [], outputNormals = [], outputIndices = [];
  const vertexIndex = new Map(), pointCache = new Map();
  const original = index => {
    const key = `v${index}`;
    if (!pointCache.has(key)) pointCache.set(key, { p: positions[index], n: normals[index], key });
    return pointCache.get(key);
  };
  function crossing(a, b, boundary, planeTag) {
    const key = `${planeTag}:${a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`}`;
    if (pointCache.has(key)) return pointCache.get(key);
    const t = (boundary - a.p[1]) / (b.p[1] - a.p[1]);
    const n = a.n.map((value, axis) => value + (b.n[axis] - value) * t);
    const length = Math.hypot(...n);
    if (length) for (let axis = 0; axis < 3; axis++) n[axis] /= length;
    const point = { p: a.p.map((value, axis) => value + (b.p[axis] - value) * t), n, key };
    point.p[1] = boundary;
    pointCache.set(key, point);
    return point;
  }
  function clip(polygon, boundary, keepAbove, tag) {
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const insideA = keepAbove ? a.p[1] >= boundary : a.p[1] <= boundary;
      const insideB = keepAbove ? b.p[1] >= boundary : b.p[1] <= boundary;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) clipped.push(crossing(a, b, boundary, tag));
    }
    return clipped;
  }
  function emit(point) {
    if (!vertexIndex.has(point.key)) {
      vertexIndex.set(point.key, outputPositions.length / 3);
      outputPositions.push(...point.p);
      outputNormals.push(...point.n);
    }
    return vertexIndex.get(point.key);
  }
  for (let i = 0; i < sourceIndices.length; i += 3) {
    let polygon = [original(sourceIndices[i]), original(sourceIndices[i + 1]), original(sourceIndices[i + 2])];
    polygon = clip(polygon, LOW_Y, true, 'low');
    polygon = clip(polygon, HIGH_Y, false, 'high');
    for (let j = 1; j + 1 < polygon.length; j++) {
      outputIndices.push(emit(polygon[0]), emit(polygon[j]), emit(polygon[j + 1]));
    }
  }
  return { positions: outputPositions, normals: outputNormals, indices: outputIndices };
}

const heartPath = process.argv[2], vesselPath = process.argv[3];
if (!heartPath || !vesselPath || process.argv.length !== 4) {
  console.error('Usage: node scripts/prepare-heart.cjs /path/to/heart.glb /path/to/vessels.glb');
  process.exit(2);
}

try {
  const heart = readGlb(heartPath, EXPECTED.heart, 'heart');
  const vessels = readGlb(vesselPath, EXPECTED.vessels, 'vessels');
  const allSources = [heart, vessels];
  const output = {
    asset: { version: '2.0', generator: 'ECG Studio HRA heart preparation', extras: {
      title: 'Human Reference Atlas heart and clipped cardiac vasculature',
      attribution: 'HuBMAP Consortium / Human Reference Atlas contributors',
      license: 'CC-BY-4.0',
      sources: SOURCES,
      sourceSha256: { heart: heart.hash, vessels: vessels.hash },
      modifications: `Merged labeled heart meshes with the HRA blood vasculature subtree; excluded nodes matching ${EXCLUDED_NODE}; clipped vessel geometry to source y=${LOW_Y}..${HIGH_Y} m without caps. Coordinates remain metric: x=patient left, y=superior, z=anterior.`,
    } },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
  };
  const binaryParts = [];
  let binaryLength = 0;
  const materialMaps = allSources.map(source => source.gltf.materials?.map(material => {
    const copy = JSON.parse(JSON.stringify(material));
    // Texture references are intentionally removed; source material color and identity remain.
    delete copy.pbrMetallicRoughness?.baseColorTexture;
    delete copy.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete copy.normalTexture; delete copy.occlusionTexture; delete copy.emissiveTexture;
    delete copy.extensions;
    const index = output.materials.length;
    output.materials.push(copy);
    return index;
  }) || []);

  function appendBytes(buffer, target) {
    const padding = (4 - binaryLength % 4) % 4;
    if (padding) { binaryParts.push(Buffer.alloc(padding)); binaryLength += padding; }
    const byteOffset = binaryLength;
    const bytes = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    binaryParts.push(bytes); binaryLength += bytes.length;
    const bufferView = output.bufferViews.length;
    output.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, ...(target ? { target } : {}) });
    return bufferView;
  }
  function addAccessor(values, type, target, bounds) {
    const lanes = type === 'SCALAR' ? 1 : 3;
    const array = Float32Array.from(values);
    const view = appendBytes(array, target);
    const accessor = { bufferView: view, componentType: 5126, count: array.length / lanes, type };
    if (bounds) {
      const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i += 3) for (let j = 0; j < 3; j++) {
        mins[j] = Math.min(mins[j], array[i + j]); maxs[j] = Math.max(maxs[j], array[i + j]);
      }
      accessor.min = mins; accessor.max = maxs;
    }
    const index = output.accessors.length; output.accessors.push(accessor); return index;
  }
  function addIndices(indices) {
    let max = 0, min = Infinity;
    for (const value of indices) { max = Math.max(max, value); min = Math.min(min, value); }
    const array = max <= 65535 ? Uint16Array.from(indices) : Uint32Array.from(indices);
    const view = appendBytes(array, 34963);
    const index = output.accessors.length;
    output.accessors.push({ bufferView: view, componentType: max <= 65535 ? 5123 : 5125, count: array.length, type: 'SCALAR', min: [min], max: [max] });
    return index;
  }

  function buildMesh(sourceNumber, source, meshIndex, worldMatrix, clipVessels) {
    const mesh = source.gltf.meshes[meshIndex];
    if (!mesh) fail(`Missing source mesh ${meshIndex}`);
    const primitives = [];
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.targets || primitive.extensions) fail(`Unsupported primitive in ${mesh.name || meshIndex}`);
      const attrs = transformedAttributes(source, primitive, worldMatrix);
      const indices = primitive.indices === undefined ? attrs.positions.map((_, i) => i) : accessorValues(source, primitive.indices);
      if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= attrs.positions.length) || indices.length % 3) fail(`Invalid triangle indices in ${mesh.name || meshIndex}`);
      const data = clipVessels ? clippedTriangles(attrs.positions, attrs.normals, indices) : {
        positions: attrs.positions.flat(), normals: attrs.normals.flat(), indices,
      };
      if (!data.indices.length) continue;
      const position = addAccessor(data.positions, 'VEC3', 34962, true);
      const normal = addAccessor(data.normals, 'VEC3', 34962, false);
      const index = addIndices(data.indices);
      const material = primitive.material === undefined ? undefined : materialMaps[sourceNumber][primitive.material];
      primitives.push({ attributes: { POSITION: position, NORMAL: normal }, indices: index, mode: 4, ...(material === undefined ? {} : { material }) });
    }
    if (!primitives.length) return null;
    const index = output.meshes.length;
    output.meshes.push({ name: mesh.name, primitives });
    return index;
  }

  function appendRoot(sourceNumber, source, rootIndex, clipVessels) {
    const sourceNodes = source.gltf.nodes;
    const root = sourceNodes[rootIndex];
    if (!root || !root.name) fail(`Source ${sourceNumber ? 'vessels' : 'heart'} has no named root`);
    const meshByNode = new Map();
    const childrenByNode = new Map();
    const visiting = new Set();
    function visit(index, parentWorld, excluded) {
      if (visiting.has(index)) fail('Cycle found in source node hierarchy');
      const node = sourceNodes[index];
      if (!node) fail(`Missing node ${index}`);
      const skip = excluded || (clipVessels && EXCLUDED_NODE.test(node.name || ''));
      if (skip) return false;
      visiting.add(index);
      const world = parentWorld.clone().multiply(localMatrix(node));
      let keep = false;
      if (node.mesh !== undefined) {
        const built = buildMesh(sourceNumber, source, node.mesh, world, clipVessels);
        if (built !== null) { meshByNode.set(index, built); keep = true; }
      }
      const childIndices = [];
      for (const child of node.children || []) if (visit(child, world, false)) { childIndices.push(child); keep = true; }
      childrenByNode.set(index, childIndices);
      visiting.delete(index);
      return keep;
    }
    if (!visit(rootIndex, new THREE.Matrix4(), false)) fail(`No geometry remains in ${root.name}`);
    function clone(index) {
      const node = sourceNodes[index];
      const copy = {};
      if (node.name) copy.name = (index === rootIndex && clipVessels) ? 'VH_M_blood_vasculature_of_heart' : node.name;
      if (node.extras !== undefined) copy.extras = JSON.parse(JSON.stringify(node.extras));
      if (meshByNode.has(index)) copy.mesh = meshByNode.get(index);
      const children = childrenByNode.get(index) || [];
      if (children.length) copy.children = children.map(clone);
      const outputIndex = output.nodes.length;
      output.nodes.push(copy);
      // Children are allocated first; glTF child references must point to their actual indices.
      if (children.length) copy.children = copy.children.map(child => child.__index);
      return { __index: outputIndex };
    }
    const created = clone(rootIndex).__index;
    output.scenes[0].nodes.push(created);
  }

  const heartRoot = heart.gltf.scenes[heart.gltf.scene || 0]?.nodes?.[0];
  const vesselRoot = vessels.gltf.scenes[vessels.gltf.scene || 0]?.nodes?.[0];
  if (heartRoot === undefined || vesselRoot === undefined) fail('A source scene has no root node');
  appendRoot(0, heart, heartRoot, false);
  appendRoot(1, vessels, vesselRoot, true);
  output.buffers[0].byteLength = binaryLength;
  const binary = Buffer.concat(binaryParts, binaryLength);
  let json = Buffer.from(JSON.stringify(output), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const paddedBinary = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
  const header = Buffer.alloc(12); header.write('glTF'); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + paddedBinary.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.write('JSON', 4);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(paddedBinary.length, 0); binHeader.write('BIN\0', 4);
  const result = Buffer.concat([header, jsonHeader, json, binHeader, paddedBinary]);
  fs.writeFileSync(DESTINATION, result);

  const bounds = output.accessors.filter(accessor => accessor.type === 'VEC3' && accessor.min).reduce((total, accessor) => {
    for (let axis = 0; axis < 3; axis++) {
      total.min[axis] = Math.min(total.min[axis], accessor.min[axis]);
      total.max[axis] = Math.max(total.max[axis], accessor.max[axis]);
    }
    return total;
  }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const names = output.nodes.filter(node => node.mesh !== undefined).map(node => node.name);
  const report = {
    output: DESTINATION, sha256: sha256(result), bytes: result.length,
    sources: { heart: heart.hash, vessels: vessels.hash },
    counts: { labeledHeartMeshes: heart.gltf.nodes.filter(node => node.mesh !== undefined && node.extras?.label).length, outputMeshes: output.meshes.length, outputMeshNodes: names.length, triangles: output.accessors.filter(accessor => accessor.type === 'SCALAR' && (accessor.componentType === 5123 || accessor.componentType === 5125)).reduce((sum, accessor) => sum + accessor.count / 3, 0) },
    boundsMeters: bounds, namedMeshes: names,
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`prepare-heart: ${error.message}`);
  process.exitCode = 1;
}
