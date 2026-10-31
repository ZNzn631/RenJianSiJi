#!/usr/bin/env node
/**
 * 人间四季 · 数值保险（CI 风格平衡性闸门）
 *
 * 用法：
 *   node tests/check_balance.js             # 500 局全量把关，KPI 不达标退出码 1
 *   node tests/check_balance.js --quick     # 150 局快速预检，只警告不拦截
 *
 * KPI（v3.3-final 定档）：
 *   英年早逝 20% – 40%
 *   平凡一生 30% – 50%
 *
 * 任何一侧跑出区间 → 退出码 1（全量）或打印 ⚠ 警告（quick）。
 * 脚本调用 tests/sim_500.js，结果写入仓库根目录 _sim_result.json。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const QUICK = process.argv.includes('--quick');
const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, '人间开发.html');
const SIM = path.join(__dirname, 'sim_500.js');
const TMP = path.join(ROOT, '_sim_run.html');
const OUT = path.join(ROOT, '_sim_result.json');

const N_RANDOM = QUICK ? 150 : 500;
const N_SMART = QUICK ? 0 : 60;
const N_PARENT = QUICK ? 0 : 40;
const N_PARENT_LOW = QUICK ? 0 : 30;

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome'
];
const EDGE = process.env.EDGE || CANDIDATES.find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge/Chrome，请设置环境变量 EDGE'); process.exit(2); }

const html = fs.readFileSync(GAME, 'utf8');
const sim = fs.readFileSync(SIM, 'utf8');
const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';
const preamble = openTag + '\nwindow.__SIM_N_RANDOM__ = ' + N_RANDOM + ';\n'
  + 'window.__SIM_N_SMART__ = ' + N_SMART + ';\n'
  + 'window.__SIM_N_PARENT__ = ' + N_PARENT + ';\n'
  + 'window.__SIM_N_PARENT_LOW__ = ' + N_PARENT_LOW + ';\n' + closeTag + '\n';
fs.writeFileSync(TMP, html.replace('</body>', preamble + openTag + '\n' + sim + '\n' + closeTag + '\n</body>'), 'utf8');

const r = spawnSync(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--user-data-dir=' + path.join(os.tmpdir(), 'rj-sim-profile'),
  '--virtual-time-budget=900000', '--dump-dom',
  'file:///' + TMP.split(path.sep).join('/') + '?rjs_test=1'
], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

try { fs.unlinkSync(TMP); } catch (e) {}

const m = /##SIM##(\{[\s\S]*?\})##END##/.exec(r.stdout || '');
if (!m) { console.error('模拟没有产出结果（页面可能报错或浏览器启动失败）'); process.exit(2); }

const data = JSON.parse(m[1]);
fs.writeFileSync(OUT, JSON.stringify(data), 'utf8');

const R = data.data.random;
const n = R.length;
if (!n) { console.error('随机人生样本为空'); process.exit(2); }
const count = (id) => R.filter((x) => x.ending === id).length;
const pct = (c, t) => Math.round((1000 * c) / t) / 10;

const early = pct(count('E_DEATH_EARLY'), n);
const ordinary = pct(count('E_ORDINARY'), n);

const EARLY_MIN = 20, EARLY_MAX = 40, ORDINARY_MIN = 30, ORDINARY_MAX = 50;
const earlyOK = early >= EARLY_MIN && early <= EARLY_MAX;
const ordinaryOK = ordinary >= ORDINARY_MIN && ordinary <= ORDINARY_MAX;

console.log((QUICK ? '[快速预检 ' + n + ' 局]' : '[全量 ' + n + ' 局]') + ' 模拟耗时 ' + data.ms + 'ms');
console.log('  英年早逝 ' + early + '%  (区间 ' + EARLY_MIN + '-' + EARLY_MAX + '%)  ' + (earlyOK ? 'PASS' : 'FAIL'));
console.log('  平凡一生 ' + ordinary + '%  (区间 ' + ORDINARY_MIN + '-' + ORDINARY_MAX + '%)  ' + (ordinaryOK ? 'PASS' : 'FAIL'));
console.log('  数据写入 ' + OUT);

if (earlyOK && ordinaryOK) {
  console.log('✅ 数值保险通过');
  process.exit(0);
}
if (QUICK) {
  console.log('⚠ 快速预检不拦截（样本小，仅供先扫一眼）；请用 node tests/check_balance.js 做全量把关');
  process.exit(0);
}
console.error('❌ 数值越界！请调整常量后重跑，不要带着失衡数值进下一版');
process.exit(1);
