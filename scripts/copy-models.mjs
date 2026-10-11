// Copies the MIT-licensed face models from @vladmandic/human-models into public/models so they are served from our own origin.
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve('node_modules/@vladmandic/human-models/models');
const dst = path.resolve('public/models');
fs.mkdirSync(dst, { recursive: true });
for (const n of ['blazeface', 'facemesh', 'iris']) for (const ext of ['json', 'bin']) fs.copyFileSync(path.join(src, `${n}.${ext}`), path.join(dst, `${n}.${ext}`));
console.log('models copied to public/models');
