import { readFileSync } from 'node:fs';

function inspect(path) {
  const buf = readFileSync(path);
  // glb header: magic(4) version(4) length(4)
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'glTF') { console.log(path, 'NOT a glb'); return; }
  let offset = 12;
  let json = null;
  while (offset < buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLen);
    if (chunkType === 0x4e4f534a) { // 'JSON'
      json = JSON.parse(chunkData.toString('utf8'));
      break;
    }
    offset += 8 + chunkLen;
  }
  if (!json) { console.log(path, 'no JSON chunk'); return; }
  const anims = (json.animations ?? []).map(a => a.name ?? '(unnamed)');
  const meshes = (json.meshes ?? []).map(m => m.name ?? '(unnamed)');
  const skins = json.skins ? json.skins.length : 0;
  const mats = (json.materials ?? []).map(m => m.name ?? '(unnamed)');
  console.log('===', path, '===');
  console.log('  meshes:', meshes.length, meshes.slice(0, 10).join(', '));
  console.log('  skins(骨骼):', skins);
  console.log('  animations:', anims.length);
  console.log('   ', anims.join(' | '));
  console.log('  materials:', mats.slice(0, 8).join(', '));
}

for (const p of process.argv.slice(2)) inspect(p);
