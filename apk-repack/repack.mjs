// Rebuild the APK that works on the owner's Nokia C32 with today's web app.
//
//   node repack.mjs <base.apk> <dist dir> <out-unsigned.apk> <versionCode>
//
// Everything in the base APK is kept exactly as it was (native code, resources,
// manifest, each entry's stored-or-deflated packing; Android refuses an APK
// whose resources.arsc is compressed) except:
//   - assets/public/  is replaced by the web build (dist/)
//   - the old signature (META-INF/*.SF|RSA|MF) is dropped, to be re-signed
//   - android:versionCode is raised, so it installs as an update
// The output still needs `zipalign -p 4` and `apksigner sign`.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const [base, dist, out, codeArg] = process.argv.slice(2);
if (!base || !dist || !out || !codeArg) {
  console.error('usage: node repack.mjs <base.apk> <dist dir> <out-unsigned.apk> <versionCode>');
  process.exit(2);
}
const versionCode = Number(codeArg);

const VERSION_CODE_ATTR = 0x0101021b; // android:versionCode

/** Rewrite android:versionCode inside the binary AndroidManifest.xml. */
export function patchVersionCode(input, code) {
  const b = Buffer.from(input);
  if (b.readUInt16LE(0) !== 0x0003) throw new Error('not a binary XML file');
  let off = b.readUInt16LE(2);
  const resIds = [];
  while (off < b.length) {
    const type = b.readUInt16LE(off);
    const headerSize = b.readUInt16LE(off + 2);
    const size = b.readUInt32LE(off + 4);
    if (type === 0x0180) {
      for (let i = off + headerSize; i < off + size; i += 4) resIds.push(b.readUInt32LE(i));
    } else if (type === 0x0102) {
      const ext = off + headerSize;
      const attrStart = b.readUInt16LE(ext + 8);
      const attrSize = b.readUInt16LE(ext + 10);
      const count = b.readUInt16LE(ext + 12);
      for (let a = 0; a < count; a++) {
        const at = ext + attrStart + a * attrSize;
        if (resIds[b.readUInt32LE(at + 4)] !== VERSION_CODE_ATTR) continue;
        const dataType = b.readUInt8(at + 15);
        if (dataType !== 0x10 && dataType !== 0x11) throw new Error(`versionCode has value type ${dataType}`);
        const was = b.readUInt32LE(at + 16);
        b.writeInt32LE(-1, at + 8);
        b.writeUInt32LE(code, at + 16);
        return { buf: b, was };
      }
    }
    off += size;
  }
  throw new Error('android:versionCode not found');
}

const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name), rel + d.name + '/') : [rel + d.name]);

const src = new AdmZip(base);
const dst = new AdmZip();
const SIGNATURE = /^META-INF\/[^/]+\.(SF|RSA|DSA|EC|MF)$/i;
let kept = 0, dropped = 0, replaced = 0, wasCode = null;

for (const e of src.getEntries()) {
  if (e.isDirectory) continue;
  const name = e.entryName;
  if (SIGNATURE.test(name) || name.startsWith('assets/public/')) { dropped++; continue; }
  let data = e.getData();
  if (name === 'AndroidManifest.xml') {
    const r = patchVersionCode(data, versionCode);
    data = r.buf; wasCode = r.was;
  }
  dst.addFile(name, data);
  dst.getEntry(name).header.method = e.header.method;
  kept++;
}
for (const rel of walk(dist)) {
  const name = 'assets/public/' + rel;
  dst.addFile(name, fs.readFileSync(path.join(dist, rel)));
  dst.getEntry(name).header.method = 8;
  replaced++;
}
dst.writeZip(out);
console.log(`kept ${kept} entries as packed, dropped ${dropped} (old web app + signature), added ${replaced} web files; versionCode ${wasCode} -> ${versionCode}`);
