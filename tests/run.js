#!/usr/bin/env node
/**
 * 人间四季 · 稳定性回归测试
 * 用法：node tests/run.js [视口尺寸，如 1280,900]
 * 依赖：本机 Edge / Chrome（无头模式），可用环境变量 EDGE 指定可执行文件。
 * 输出：断言表 + 汇总；退出码 0 = 全过。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, '人间开发.html');
const TEST = path.join(__dirname, '稳定性测试.js');
const TMP = path.join(ROOT, '_stability_run.html');
const VIEW = process.argv[2] || '1280,900';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome'
];
const EDGE = process.env.EDGE || CANDIDATES.find((p) => fs.existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge/Chrome，请用环境变量 EDGE 指定浏览器路径');
  process.exit(2);
}

const html = fs.readFileSync(GAME, 'utf8');
const test = fs.readFileSync(TEST, 'utf8');
const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';
fs.writeFileSync(TMP, html.replace('</body>', openTag + '\n' + test + '\n' + closeTag + '\n</body>'), 'utf8');

const url = 'file:///' + TMP.split(path.sep).join('/') + '?rjs_test=1';
const r = spawnSync(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--user-data-dir=' + path.join(os.tmpdir(), 'rj-stability-profile'),
  '--virtual-time-budget=180000',
  '--window-size=' + VIEW,
  '--dump-dom', url
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

try { fs.unlinkSync(TMP); } catch (e) {}

const m = /##STAB##(\{[\s\S]*?\})##END##/.exec(r.stdout || '');
if (!m) {
  console.error('测试脚本没有产出结果（页面可能报错或浏览器启动失败）');
  process.exit(2);
}

const res = JSON.parse(m[1]);
let fail = 0;
for (const g of res.groups) {
  if (!g.p) { fail++; console.log('FAIL  ' + g.n + (g.i ? '  :: ' + g.i : '')); }
}
for (const n of res.notes) console.log('note  ' + n);
console.log('---');
console.log('断言 ' + res.summary.pass + '/' + res.summary.total + ' 通过 · JS 错误 ' + res.errors.length + ' 条 · 属性越界 ' + res.bounds.length + ' 处');
if (res.errors.length) console.log('errors: ' + res.errors.join(' | '));
if (res.bounds.length) console.log('bounds: ' + res.bounds.join(' | '));
process.exit(fail === 0 && res.errors.length === 0 && res.bounds.length === 0 ? 0 : 1);
