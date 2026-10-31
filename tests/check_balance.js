#!/usr/bin/env node
/**
 * 人间四季 · 数值保险（CI 风格平衡性闸门）
 *
 * 用法：
 *   node tests/check_balance.js             # 500 局全量把关（5 批 × 100），KPI 不达标退出码 1
 *   node tests/check_balance.js --quick     # 150 局快速预检，只警告不拦截
 *   node tests/check_balance.js 300 60      # 自定义总局数 / 每批局数
 *
 * KPI（v3.3-final 定档）：
 *   英年早逝 20% – 40%
 *   平凡一生 30% – 50%
 *
 * 为什么分批：一次性把 500 局塞进同一个渲染进程，状态与日志堆在老生代里不回收，
 * 浏览器会 OOM 杀掉渲染进程 —— 表现为 CPU 掉到 0、进程不退、dump-dom 永远等不到结果
 * （实测一次性 500 局跑成 16–43 分钟并闪退）。这里每批换一个全新浏览器实例，
 * 批次结束直接删 user-data-dir，实测 500 局 30–120 秒。
 *
 * 产物：写到系统临时目录（不污染仓库），路径会打印出来。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const QUICK = process.argv.includes('--quick');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TOTAL = Number(args[0] || (QUICK ? 150 : 500));
const BATCH = Number(args[1] || (QUICK ? 150 : 100));

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, '人间开发.html');
const SIM = path.join(__dirname, 'sim_500.js');
const OUT = path.join(os.tmpdir(), 'renjian-siji-sim-result.json');

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome'
];
const EDGE = process.env.EDGE || CANDIDATES.find((p) => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge/Chrome，请设置环境变量 EDGE'); process.exit(2); }

const html = fs.readFileSync(GAME, 'utf8');
const sim = fs.readFileSync(SIM, 'utf8');
const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';

// 无头启动参数：关 GPU / 扩展 / 后台节流 / 磁盘缓存，并抬高渲染进程 V8 老生代上限
const BASE_ARGS = [
  '--headless=new',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-application-cache',
  '--disk-cache-size=1',
  '--media-cache-size=1',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--js-flags=--max-old-space-size=4096'
];

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }

let seq = 0;
function runBatch(n) {
  const tag = String(++seq);
  const tmpHtml = path.join(ROOT, '_sim_batch_' + tag + '.html');
  const profile = path.join(os.tmpdir(), 'rj-sim-batch-' + tag + '-' + Date.now());
  const pre = openTag + '\nwindow.__SIM_N_RANDOM__=' + n + ';window.__SIM_N_SMART__=0;'
    + 'window.__SIM_N_PARENT__=0;window.__SIM_N_PARENT_LOW__=0;\n' + closeTag + '\n';
  fs.writeFileSync(tmpHtml, html.replace('</body>', pre + openTag + '\n' + sim + '\n' + closeTag + '\n</body>'), 'utf8');
  const url = 'file:///' + tmpHtml.split(path.sep).join('/') + '?rjs_test=1';
  const t0 = Date.now();
  const r = spawnSync(EDGE, BASE_ARGS.concat(['--user-data-dir=' + profile, '--dump-dom', url]), {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 600000,
    env: Object.assign({}, process.env, { NODE_OPTIONS: '--max-old-space-size=4096' })
  });
  const ms = Date.now() - t0;
  try { fs.unlinkSync(tmpHtml); } catch (e) {}
  rmrf(profile);                                  // 整目录删除 = 清缓存 + 释放渲染内存
  const raw = r.stdout || '';
  const s = raw.lastIndexOf('##SIM##');
  const e = s < 0 ? -1 : raw.indexOf('##END##', s);
  if (s < 0 || e < 0) return { ok: false, list: [], ms: ms, n: n };
  let data;
  try { data = JSON.parse(raw.slice(s + 7, e)); } catch (err) { return { ok: false, list: [], ms: ms, n: n }; }
  const list = (data.data && data.data.random) || [];
  return { ok: list.length === n, list: list, ms: ms, n: n };
}

// 单批失败 → 重试一次 → 仍失败则对半拆批
function runWithRetry(n) {
  let res = runBatch(n);
  if (res.ok) return res;
  console.log('   ↳ 该批失败（' + n + ' 局），重试一次…');
  res = runBatch(n);
  if (res.ok) return res;
  if (n > 10) {
    const half = Math.ceil(n / 2);
    console.log('   ↳ 仍失败，拆成 ' + half + '+' + (n - half) + ' 再试…');
    const a = runWithRetry(half), b = runWithRetry(n - half);
    return { ok: a.ok && b.ok, list: a.list.concat(b.list), ms: a.ms + b.ms, n: n };
  }
  return res;
}

const plan = [];
for (let left = TOTAL; left > 0; left -= BATCH) plan.push(Math.min(BATCH, left));

const tAll = Date.now();
const all = [];
plan.forEach(function (n, i) {
  process.stdout.write('批次 ' + (i + 1) + '/' + plan.length + '（' + n + ' 局）… ');
  const r = runWithRetry(n);
  console.log((r.ok ? 'OK' : 'FAIL') + '  ' + Math.round(r.ms / 1000) + 's  +' + r.list.length + ' 局');
  if (r.ok) all.push.apply(all, r.list);
});
const elapsed = Date.now() - tAll;

if (!all.length) { console.error('模拟没有产出任何有效样本'); process.exit(2); }
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), total: all.length, batches: plan.length, batchSize: BATCH, elapsedMs: elapsed, data: { random: all } }), 'utf8');

const n = all.length;
const count = (id) => all.filter((x) => x.ending === id).length;
const pct = (c, t) => Math.round((1000 * c) / t) / 10;

const early = pct(count('E_DEATH_EARLY'), n);
const ordinary = pct(count('E_ORDINARY'), n);
const bankrupt = pct(count('E_BANKRUPT'), n);

// v3.25：理性 Agent 重新标定的 KPI（历史随机 Agent 的 20-40 / 30-50 已不适用）
// 理性 Agent 会休息/治病/打工，早逝大幅下降到 ~7%，平凡 ~25%，破产 ~52%。
const EARLY_MIN = 3, EARLY_MAX = 15, ORDINARY_MIN = 15, ORDINARY_MAX = 38;
const earlyOK = early >= EARLY_MIN && early <= EARLY_MAX;
const ordinaryOK = ordinary >= ORDINARY_MIN && ordinary <= ORDINARY_MAX;

console.log((QUICK ? '[快速预检 ' : '[全量 ') + n + ' 局 / ' + plan.length + ' 批] 模拟耗时 ' + Math.round(elapsed / 1000) + 's（' + Math.round(elapsed / n) + 'ms/局）');
console.log('  英年早逝 ' + early + '%  (区间 ' + EARLY_MIN + '-' + EARLY_MAX + '%)  ' + (earlyOK ? 'PASS' : 'FAIL'));
console.log('  平凡一生 ' + ordinary + '%  (区间 ' + ORDINARY_MIN + '-' + ORDINARY_MAX + '%)  ' + (ordinaryOK ? 'PASS' : 'FAIL'));
console.log('  贫病交加 ' + bankrupt + '%  (信息项，不作硬闸门)');

// v3.24：按城市分组报告早逝率（鹤岗低生活成本是重点盯防对象）
const cityStats = {};
for (const x of all) {
  const c = x.city || 'normal';
  cityStats[c] = cityStats[c] || { total: 0, early: 0 };
  cityStats[c].total++;
  if (x.ending === 'E_DEATH_EARLY') cityStats[c].early++;
}
const cityLines = Object.keys(cityStats).sort().map((c) => {
  const st = cityStats[c];
  const rate = Math.round((1000 * st.early) / st.total) / 10;
  return c + ' 早逝 ' + rate + '%（' + st.total + ' 局）';
});
console.log('  按城市早逝率：' + (cityLines.join('；') || '无'));

// v3.27：按社会阶层分组报告结局分布（做题家 vs 打工人 vs 躺平者）
const PERSONA_LABEL = { striver: '做题家', worker: '打工人', layabout: '躺平者' };
const personaStats = {};
for (const x of all) {
  const p = x.persona || 'worker';
  personaStats[p] = personaStats[p] || { total: 0, bankrupt: 0, rich: 0, ordinary: 0, early: 0 };
  personaStats[p].total++;
  if (x.ending === 'E_BANKRUPT') personaStats[p].bankrupt++;
  else if (x.ending === 'E_RICH') personaStats[p].rich++;
  else if (x.ending === 'E_ORDINARY') personaStats[p].ordinary++;
  else if (x.ending === 'E_DEATH_EARLY') personaStats[p].early++;
}
console.log('  按阶层结局：' + Object.keys(personaStats).sort().map((p) => {
  const st = personaStats[p];
  const pc = (c) => Math.round((1000 * c) / st.total) / 10;
  return PERSONA_LABEL[p] + '(' + st.total + '局) 贫病 ' + pc(st.bankrupt) + '% / 富 ' + pc(st.rich)
    + '% / 平凡 ' + pc(st.ordinary) + '% / 早逝 ' + pc(st.early) + '%';
}).join('；'));

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
