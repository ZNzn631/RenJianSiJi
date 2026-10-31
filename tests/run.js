#!/usr/bin/env node
/**
 * 人间四季 · 稳定性回归测试（含 D1~D7 高阶组）
 * 用法：node tests/run.js            → 两个视口各跑一遍并合并
 *      node tests/run.js 1280,900   → 只跑指定视口
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

// 默认两档：宽屏 + 窄屏（Windows 无头窗口最小约 500px，375 由探针里的等效容器覆盖）
const VIEWS = process.argv[2] ? [process.argv[2]] : ['1366,768', '390,700'];

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

function runOnce(view, idx) {
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + path.join(os.tmpdir(), 'rj-stability-profile-' + idx),
    '--virtual-time-budget=180000',
    '--window-size=' + view,
    '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000 });
  const raw = r.stdout || '';
  const s = raw.lastIndexOf('##STAB##');
  const e = s < 0 ? -1 : raw.indexOf('##END##', s);
  if (s < 0 || e < 0) return { view: view, fatal: true };
  try { return Object.assign(JSON.parse(raw.slice(s + 8, e)), { view: view }); }
  catch (err) { return { view: view, fatal: true }; }
}

let pass = 0, total = 0, fail = 0, errs = 0, bounds = 0;
for (let i = 0; i < VIEWS.length; i++) {
  const res = runOnce(VIEWS[i], i);
  if (res.fatal) {
    console.log('\n===== 视口 ' + VIEWS[i] + ' =====');
    console.log('FATAL 测试脚本没有产出结果（页面可能报错或浏览器启动失败）');
    fail++;
    continue;
  }
  console.log('\n===== 视口 ' + (res.viewport ? (res.viewport.w + 'x' + res.viewport.h) : VIEWS[i]) + ' =====');
  for (const g of res.groups) {
    total++;
    if (g.p) pass++;
    else { fail++; console.log('FAIL  ' + g.n + (g.i ? '  :: ' + g.i : '')); }
  }
  for (const n of res.notes) console.log('note  ' + n);
  errs += (res.errors || []).length;
  bounds += (res.bounds || []).length;
  if ((res.errors || []).length) console.log('errors: ' + res.errors.join(' | '));
  if ((res.bounds || []).length) console.log('bounds: ' + res.bounds.join(' | '));
  console.log('  本视口断言 ' + res.summary.pass + '/' + res.summary.total + ' · JS 错误 ' + (res.errors || []).length + ' 条');
}

try { fs.unlinkSync(TMP); } catch (e) {}

console.log('\n---');
console.log('断言 ' + pass + '/' + total + ' 通过 · JS 错误 ' + errs + ' 条 · 属性越界 ' + bounds + ' 处');
process.exit(fail === 0 && errs === 0 && bounds === 0 ? 0 : 1);
