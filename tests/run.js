#!/usr/bin/env node
/**
 * 人间四季 · 全量回归测试（逻辑 + 穿模 + 布局）
 * 用法：node tests/run.js            → 两个视口各跑一遍并合并
 *      node tests/run.js 1280,900   → 只跑指定视口
 * 依赖：本机 Edge / Chrome（无头模式），可用环境变量 EDGE 指定可执行文件。
 *
 * 每次运行会自动加载两个探针：
 *   稳定性测试.js     —— 120 条逻辑断言 + D1~D7 高阶组
 *   event_isolation.js —— 事件穿透（穿模）反证探针
 * 输出：断言表 + 汇总；退出码 0 = 全过。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, '人间开发.html');
const STAB = path.join(__dirname, '稳定性测试.js');
const ISO = path.join(__dirname, 'event_isolation.js');
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
const stab = fs.readFileSync(STAB, 'utf8');
const iso = fs.readFileSync(ISO, 'utf8');
const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';

// 注入两个探针：先逻辑，再穿模（穿模探针自带状态保存/恢复）
const injected = html.replace('</body>',
  openTag + '\n' + stab + '\n' + closeTag + '\n'
  + openTag + '\n' + iso + '\n' + closeTag + '\n</body>');
fs.writeFileSync(TMP, injected, 'utf8');
const url = 'file:///' + TMP.split(path.sep).join('/') + '?rjs_test=1';

function parseMarker(raw, tag) {
  const open = '##' + tag + '##';
  const close = '##END##';
  const s = raw.lastIndexOf(open);
  const e = s < 0 ? -1 : raw.indexOf(close, s);
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(raw.slice(s + open.length, e)); }
  catch (err) { return null; }
}

function runOnce(view, idx) {
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + path.join(os.tmpdir(), 'rj-stability-profile-' + idx),
    '--virtual-time-budget=180000',
    '--window-size=' + view,
    '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000 });
  const raw = r.stdout || '';
  const stab = parseMarker(raw, 'STAB');
  const iso = parseMarker(raw, 'ISO');
  if (!stab) return { view: view, fatal: true };
  return { view: view, stab: stab, iso: iso };
}

let pass = 0, total = 0, fail = 0, errs = 0, bounds = 0;
let isoShown = false;

for (let i = 0; i < VIEWS.length; i++) {
  const res = runOnce(VIEWS[i], i);
  if (res.fatal) {
    console.log('\n===== 视口 ' + VIEWS[i] + ' =====');
    console.log('FATAL 测试脚本没有产出结果（页面可能报错或浏览器启动失败）');
    fail++;
    continue;
  }

  console.log('\n===== 视口 ' + (res.stab.viewport ? (res.stab.viewport.w + 'x' + res.stab.viewport.h) : VIEWS[i]) + ' =====');
  for (const g of res.stab.groups) {
    total++;
    if (g.p) pass++;
    else { fail++; console.log('FAIL  ' + g.n + (g.i ? '  :: ' + g.i : '')); }
  }
  for (const n of res.stab.notes) console.log('note  ' + n);
  errs += (res.stab.errors || []).length;
  bounds += (res.stab.bounds || []).length;
  if ((res.stab.errors || []).length) console.log('errors: ' + res.stab.errors.join(' | '));
  if ((res.stab.bounds || []).length) console.log('bounds: ' + res.stab.bounds.join(' | '));
  console.log('  本视口断言 ' + res.stab.summary.pass + '/' + res.stab.summary.total + ' · JS 错误 ' + (res.stab.errors || []).length + ' 条');

  // 穿模探针只在第一次跑并计入总表（与视口无关，避免重复计数）
  if (!isoShown && res.iso) {
    isoShown = true;
    console.log('\n----- 事件穿透探针（event_isolation） -----');
    for (const g of res.iso.groups) {
      total++;
      if (g.p) pass++;
      else { fail++; console.log('FAIL  ' + g.n + (g.i ? '  :: ' + g.i : '')); }
    }
    const st = res.iso.stats && res.iso.stats.iso;
    if (st) console.log('  扫描 ' + st.events + ' 个事件（' + st.withRequires + ' 个带条件，反证 ' + st.checks + ' 处，穿透 ' + st.leaked + ' 处）');
    if (st && st.skipped) console.log('  无满足态跳过 ' + st.skipped + ' 个（应由 D4 兜底）' + (st.skippedIds ? '：' + st.skippedIds.join(', ') : ''));
  }
}

try { fs.unlinkSync(TMP); } catch (e) {}

console.log('\n---');
console.log('断言 ' + pass + '/' + total + ' 通过 · JS 错误 ' + errs + ' 条 · 属性越界 ' + bounds + ' 处');
process.exit(fail === 0 && errs === 0 && bounds === 0 ? 0 : 1);
