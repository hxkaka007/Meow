/**
 * 测试结果落盘：每次运行生成一份带时间戳的独立报告，不覆盖历史。
 * 测试文件列表直接从 package.json 的 scripts.test 读取，避免两处维护。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var pkg = require('../package.json');

var OUT_DIR = path.join(__dirname, 'results');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 每次运行一份独立报告，但默认只保留最近 50 份；TEST_REPORT_KEEP=0 可关闭清理
var keep = Number(process.env.TEST_REPORT_KEEP);
keep = isNaN(keep) ? 50 : keep;
if (keep > 0) {
  var old = fs.readdirSync(OUT_DIR)
    .filter(function (f) { return /^\d{4}-\d{2}-\d{2}_.*\.xml$/.test(f); })
    .sort();
  while (old.length > keep - 1) fs.unlinkSync(path.join(OUT_DIR, old.shift()));
}

var files = (pkg.scripts.test || '').split(/\s+/).filter(function (s) {
  return /^test\/[\w.-]+\.test\.js$/.test(s);
});
if (!files.length) throw new Error('无法从 package.json 的 scripts.test 解析测试文件列表');

function pad(n, width) { return String(n).padStart(width, '0'); }
var d = new Date();
var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) +
  '_' + pad(d.getHours(), 2) + '-' + pad(d.getMinutes(), 2) + '-' + pad(d.getSeconds(), 2) +
  '-' + pad(d.getMilliseconds(), 3);

var dest = path.join(OUT_DIR, stamp + '.xml');
for (var i = 2; fs.existsSync(dest); i++) {
  dest = path.join(OUT_DIR, stamp + '-' + i + '.xml');
}

var args = [
  '--test',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', '--test-reporter-destination=' + dest
].concat(files);

var result = cp.spawnSync(process.execPath, args, { stdio: 'inherit' });
process.stdout.write('测试结果已写入 ' + path.relative(process.cwd(), dest).replace(/\\/g, '/') + '\n');
process.exitCode = result.status === null ? 1 : result.status;
