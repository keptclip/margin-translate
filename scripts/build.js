#!/usr/bin/env node
/**
 * 生成可发布的扩展包：dist/margin-translate-v<version>.zip
 * 零第三方依赖（用 node 内置 zlib 手写 ZIP）。
 *
 * 用法：npm run release
 * 产物用途：① 上传到 GitHub Releases 供用户直接下载 / 加载已解压扩展
 *          ② 上传到 Chrome 应用商店开发者后台
 *
 * 只打包运行必需文件：manifest、icons、src、_locales、LICENSE、PRIVACY.md。
 * 打包脚本、测试、私有笔记、Git 元数据一律不进包（避免把密钥或私人内容带出去）。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const INCLUDE_DIRS = ['icons', 'src', '_locales'];
const INCLUDE_FILES = ['manifest.json', 'LICENSE', 'PRIVACY.md'];

// CRC32
const crc32 = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = ~0;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (~c) >>> 0;
  };
})();

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.DS_Store' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const rel = path.relative(base, full);
    if (fs.statSync(full).isDirectory()) walk(full, base, out);
    else out.push(rel);
  }
  return out;
}

function dosTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const version = manifest.version;

  const files = [];
  INCLUDE_FILES.forEach((f) => {
    if (fs.existsSync(path.join(ROOT, f))) files.push(f);
  });
  INCLUDE_DIRS.forEach((d) => {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) files.push(...walk(abs, ROOT));
  });

  fs.mkdirSync(DIST, { recursive: true });
  const outFile = path.join(DIST, `margin-translate-v${version}.zip`);

  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime();

  for (const rel of files) {
    const name = rel.split(path.sep).join('/');
    const raw = fs.readFileSync(path.join(ROOT, rel));
    const crc = crc32(raw);
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const zip = Buffer.concat([Buffer.concat(chunks), cdBuf, eocd]);
  fs.writeFileSync(outFile, zip);

  console.log(`版本 v${version}`);
  console.log(`包含 ${files.length} 个文件：`);
  files.forEach((f) => console.log('  ·', f.split(path.sep).join('/')));
  console.log(`\n产物：${outFile}  (${(zip.length / 1024).toFixed(1)} KB)`);
  console.log('用途：GitHub Releases 附件 / Chrome 应用商店上传');
}

main();
