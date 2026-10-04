'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs');
const rootFiles = [
  'index.html',
  'studio.css',
  'simulator.css',
  'simulation-model.js',
  'simulator-quiz.js',
  'simulator.js',
  'heart-anatomy.js',
];
const assetFiles = [
  'assets/heart.glb',
  'assets/torso.glb',
  'assets/ATTRIBUTION.md',
  'lib/THREE-LICENSE.txt',
  'lib/three.min.js',
  'lib/OrbitControls.js',
  'lib/GLTFLoader.js',
  'lib/RoomEnvironment.js',
];

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(output, relativePath);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Required Pages file is missing: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return relativePath;
}

function build() {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  const files = rootFiles.concat(assetFiles);
  const copied = files.map(copyFile).sort();
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  console.log(`Built ${copied.length} Pages files plus .nojekyll in docs/`);
  for (const file of copied) console.log(`  ${file}`);
}

build();
