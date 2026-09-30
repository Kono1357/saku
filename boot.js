// 零依赖 bootstrap：只需要 node。把仓库里的 saku-src.enc.js 解回整个项目。
const fs = require('fs'), crypto = require('crypto'), zlib = require('zlib');
const PW = process.argv[2] || 'Saku-Yueliang-2026-X7';
const raw = fs.readFileSync(process.argv[3] || 'saku-src.enc.js', 'utf8');
const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const key = crypto.pbkdf2Sync(PW, Buffer.from(o.salt, 'base64'), 250000, 32, 'sha256');
const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64'));
d.setAuthTag(Buffer.from(o.tag, 'base64'));
const zip = Buffer.concat([d.update(Buffer.from(o.ct, 'base64')), d.final()]);
fs.writeFileSync('saku-src.zip', zip);
console.log('① 解密成功 →', zip.length, 'B 的 zip');
console.log('② 接下来解压即可（系统自带 unzip，或用 python3 -m zipfile -e）：');
console.log('     unzip -o saku-src.zip -d .');
console.log('     # 或： python3 -m zipfile -e saku-src.zip .');
