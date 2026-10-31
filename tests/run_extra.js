#!/usr/bin/env node
/**
 * 人间四季 · v3.16 高阶回归运行器（D1~D5）
 * 用法：node tests/run_extra.js
 * 依赖：本机 Edge / Chrome（无头），可用环境变量 EDGE 指定可执行文件。
 * 行为：把 tests/恋爱与兼容测试.js 注入 人间开发.html 的临时副本，
 *       在 1366x768 与 375x667 两个视口各跑一遍，合并成一份结果。
 * 产出：控制台断言表 + _extra_result.json；退出码 0 = 全过。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, '人间开发.html');
const TEST = path.join(__dirname, '恋爱与兼容测试.js');
const OUT = path.join(ROOT, '_extra_result.json');

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

const VIEWPORTS = [
  { tag: '宽屏', size: '1366,768', args: [] },
  // 小屏档：Windows 上的 Chromium 无头窗口有 ~500px 最小宽度，无法真压到 375；
  // 这里尽量压窄（实测视口以页面回读的 innerWidth/innerHeight 为准），
  // 真正的 375x667 由探针里的「等效容器」子项（327×619 约束）覆盖。
  { tag: '小屏', size: '390,700', args: [] }
];

const html = fs.readFileSync(GAME, 'utf8');
const test = fs.readFileSync(TEST, 'utf8');
const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';

function runOne(vp, idx) {
  const tmp = path.join(ROOT, '_extra_run_' + idx + '.html');
  fs.writeFileSync(tmp, html.replace('</body>', openTag + '\n' + test + '\n' + closeTag + '\n</body>'), 'utf8');
  const url = 'file:///' + tmp.split(path.sep).join('/') + '?rjs_test=1';
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + path.join(os.tmpdir(), 'rj-extra-profile-' + idx),
    '--virtual-time-budget=240000',
    '--window-size=' + vp.size
  ].concat(vp.args || []).concat([
    '--dump-dom', url
  ]), { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000 });
  try { fs.unlinkSync(tmp); } catch (e) {}
  const raw = r.stdout || '';
  // 取最后一个标记块（注入的脚本源码里也可能出现标记文本，必须跳过源码注释区）
  const start = raw.lastIndexOf('##STAB##');
  const end = start < 0 ? -1 : raw.indexOf('##END##', start);
  if (start < 0 || end < 0) return { tag: vp.tag, fatal: '测试脚本没有产出结果（页面可能报错或浏览器启动失败）' };
  const m = [null, raw.slice(start + 8, end)];
  let res;
  try { res = JSON.parse(m[1]); } catch (e) { return { tag: vp.tag, fatal: '结果 JSON 解析失败: ' + e.message }; }
  // 用页面里实测的视口尺寸命名（无头窗口会被系统下限夹住，标签必须写实测值）
  res.tag = (res.viewport && res.viewport.w) ? (res.viewport.w + 'x' + res.viewport.h) : vp.tag;
  res.viewportTag = vp.tag;
  return res;
}

const runs = VIEWPORTS.map(runOne);
let total = 0, pass = 0, fail = 0, errs = 0;
const lines = [];
const merged = { runs: [], summary: {}, generatedAt: new Date().toISOString() };

for (const r of runs) {
  console.log('\n===== 视口 ' + r.tag + ' =====');
  if (r.fatal) {
    console.log('FATAL ' + r.fatal);
    fail++;
    merged.runs.push({ tag: r.tag, fatal: r.fatal });
    continue;
  }
  for (const g of r.groups) {
    total++;
    if (g.p) { pass++; lines.push('  PASS  ' + g.n + (g.i ? '   [' + g.i + ']' : '')); }
    else { fail++; lines.push('  FAIL  ' + g.n + (g.i ? '   [' + g.i + ']' : '')); }
  }
  for (const n of (r.notes || [])) lines.push('  note  ' + n);
  errs += (r.errors || []).length;
  console.log(lines.splice(0).join('\n'));
  console.log('  JS 错误 ' + (r.errors || []).length + ' 条' + ((r.errors || []).length ? '：' + r.errors.join(' | ') : ''));
  merged.runs.push({
    tag: r.tag,
    viewport: r.viewport,
    stats: r.stats,
    summary: r.summary,
    errors: r.errors,
    fails: r.groups.filter((g) => !g.p).map((g) => g.n + (g.i ? ' :: ' + g.i : '')),
    groups: r.groups
  });
}

merged.summary = { total, pass, fail, jsErrors: errs };
console.log('\n---');
console.log('D1~D6 断言 ' + pass + '/' + total + ' 通过 · 失败 ' + fail + ' · JS 错误 ' + errs + ' 条');
try { fs.writeFileSync(OUT, JSON.stringify(merged, null, 2), 'utf8'); } catch (e) {}
process.exit(fail === 0 && errs === 0 ? 0 : 1);
