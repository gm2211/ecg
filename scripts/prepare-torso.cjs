// Crop the CC BY 4.0 HRA v1.2 male skin reference into an upper-body teaching view.
// Usage: node scripts/prepare-torso.cjs /path/to/VH_M_Skin.glb
const fs = require('fs');
const path = require('path');
const THREE = require('../lib/three.min.js');
const source = fs.readFileSync(process.argv[2]);
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength));
const bin = source.subarray(28 + jsonLength);
function readAccessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const width = {SCALAR:1,VEC3:3}[a.type];
  const bytes = a.componentType === 5123 ? 2 : 4;
  return Array.from({length:a.count}, (_,i) => Array.from({length:width}, (_,j) => {
    const offset = (view.byteOffset || 0) + (a.byteOffset || 0) + i*(view.byteStride || width*bytes) + j*bytes;
    return a.componentType === 5126 ? bin.readFloatLE(offset) : bytes === 2 ? bin.readUInt16LE(offset) : bin.readUInt32LE(offset);
  }));
}
const primitive = gltf.meshes[0].primitives[0];
const positions = readAccessor(primitive.attributes.POSITION);
const normals = readAccessor(primitive.attributes.NORMAL);
const indices = readAccessor(primitive.indices).flat();
// Crop at neck and upper pelvis. Outer arms finish at elbow height; connected
// shoulders are retained from the source mesh, never reconstructed as primitives.
function clip(polygon, axis, boundary, direction) {
  const out = [];
  for (let i=0; i<polygon.length; i++) {
    const a=polygon[i], b=polygon[(i+1)%polygon.length];
    const distance = v => (Array.isArray(axis) ? axis.reduce((sum,n,k)=>sum+n*v.p[k],0) : v.p[axis]) - boundary;
    const da=distance(a)*direction, db=distance(b)*direction;
    if (da>=0) out.push(a);
    if ((da>=0)!==(db>=0)) {
      const t=da/(da-db);
      out.push({p:a.p.map((v,k)=>v+(b.p[k]-v)*t),n:a.n.map((v,k)=>v+(b.n[k]-v)*t)});
    }
  }
  return out;
}
const vertices=[], surfaceNormals=[];
const regions = [ [[[.9,.4,0],-.13,1],[[-.9,.4,0],-.13,1]] ];
for(let i=0;i<indices.length;i+=3) {
  const original=indices.slice(i,i+3).map(id=>({p:positions[id],n:normals[id]}));
  for(const region of regions) {
    let polygon=original;
    for(const plane of [[1,.15,1],[1,.695,-1],...region]) polygon=clip(polygon,...plane);
    for(let j=1;j+1<polygon.length;j++) {
      for(const v of [polygon[0],polygon[j],polygon[j+1]]) {
        vertices.push(v.p[0]*4,(v.p[1]-.44)*4,v.p[2]*4);
        const n=new THREE.Vector3(...v.n).normalize();surfaceNormals.push(...n.toArray());
      }
    }
  }
}
const pos=new Float32Array(vertices), norm=new Float32Array(surfaceNormals);
const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.computeBoundingBox();
const metadata={asset:{version:'2.0',generator:'ECG Studio torso crop',extras:{
  title:'Visible Human Male skin — cropped torso', author:'HuBMAP / Human Reference Atlas',
  license:'CC-BY-4.0',source:'https://github.com/hubmapconsortium/ccf-releases/blob/main/v1.2/models/VH_M_Skin.glb',
  modifications:'Cropped to neck, upper pelvis and upper arms. Coordinates: x=4*x_source, y=4*(y_source-0.44), z=4*z_source.'}},
  scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'HRA anatomical torso'}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},mode:4}]}],
  accessors:[{bufferView:0,componentType:5126,count:pos.length/3,type:'VEC3',min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()},
    {bufferView:1,componentType:5126,count:norm.length/3,type:'VEC3'}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:pos.byteLength,target:34962},{buffer:0,byteOffset:pos.byteLength,byteLength:norm.byteLength,target:34962}],
  buffers:[{byteLength:pos.byteLength+norm.byteLength}]};
let json=Buffer.from(JSON.stringify(metadata));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const binary=Buffer.concat([Buffer.from(pos.buffer),Buffer.from(norm.buffer)]);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length);jh.write('JSON',4);
const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.write('BIN\0',4);
const destination=path.join(__dirname,'../assets/torso.glb');fs.writeFileSync(destination,Buffer.concat([header,jh,json,bh,binary]));
console.log(JSON.stringify({triangles:pos.length/9,bytes:fs.statSync(destination).size,bounds:metadata.accessors[0]},null,2));
