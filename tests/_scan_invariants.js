const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');
const GAME = path.join(ROOT, '人间开发.html');
const SIM = path.join(ROOT, 'tests', 'sim_500.js');
const TMP = path.join(ROOT, '_scan_invariants.html');
const OUT = path.join(ROOT, '_invariant_report.md');

const html = fs.readFileSync(GAME, 'utf8');
const sim = fs.readFileSync(SIM, 'utf8');

const invariantsJs = `
(function(){
  window.__invariantErrors = [];
  window.__eventTriggerCount = {};
  window.__eventsThisMonth = [];

  // hook openEvent：记录事件触发次数（供参考）
  var __origOpen = openEvent;
  openEvent = function(ev){
    if (ev && ev.id) {
      window.__eventTriggerCount[ev.id] = (window.__eventTriggerCount[ev.id] || 0) + 1;
      window.__eventsThisMonth.push(ev.id);
    }
    return __origOpen(ev);
  };

  // hook monthlySettle：跨月后检查状态不变式
  var __origMonthly = monthlySettle;
  monthlySettle = function(){
    var prev = snapshot();
    window.__salaryGained = 0;   // v3.37：重置本月发薪计量
    __origMonthly();
    var s = state;
    var errs = [];
    var nowM = s.y * 12 + s.m;

    // 0. 封禁期不发薪
    if ((prev.streamerBanMonths || 0) > 0 && (window.__salaryGained || 0) > 0) {
      errs.push('【封禁】封禁期却发薪 ' + window.__salaryGained);
    }

    // 1. 身份与状态不变式
    if (s.job === '无业' && s.salary > 0) errs.push('【身份】无业却有工资 salary=' + s.salary);
    if (s.job !== '无业' && !(s.salary > 0)) errs.push('【身份】在职却无薪 job=' + s.job);
    if (!s.married && (s.spouse || s.loveState === 'married')) errs.push('【身份】未婚却有配偶/已婚态 spouse=' + s.spouse + ' loveState=' + s.loveState);
    if (s.married && s.loveState !== 'married') errs.push('【身份】已婚 loveState 非 married=' + s.loveState);

    // 2. 财务与股票不变式
    if (prev && prev.stockValue > 0 && s.stockValue === 0 && nowM < (s.stockLockUntil || 0)) {
      errs.push('【股票】锁定期清仓 stockValue ' + prev.stockValue + '→0（锁到 ' + s.stockLockUntil + '）');
    }

    // 3. 极值反常识：千万富翁池子不能有底层事件
    if (s.money > 10000000) {
      var pool = RJS.eligibleEvents();
      if (pool.indexOf('E_SCAM_CALL') > -1) errs.push('【反常识】千万富翁池子仍含 E_SCAM_CALL');
      if (pool.indexOf('oddjob') > -1 || pool.indexOf('E_BIGCITY_GIG') > -1) errs.push('【反常识】千万富翁池子仍含底层事件');
    }

    // 4. 唯一性：onceEver 事件在 triggeredEvents 里重复登记
    var te = s.triggeredEvents || [];
    var seen = {};
    var dup = [];
    for (var j = 0; j < te.length; j++) {
      if (seen[te[j]]) dup.push(te[j]);
      seen[te[j]] = true;
    }
    if (dup.length) errs.push('【唯一性】onceEver 重复登记：' + dup.join(','));

    // 5. 老年非暮年事件
    if (s.age > 80 && window.__eventsThisMonth.length) {
      window.__eventsThisMonth.forEach(function(id){
        if (id.indexOf('E_OLD_') !== 0) errs.push('【反常识】80+ 触发非暮年事件 ' + id + '（age=' + s.age + '）');
      });
    }

    window.__eventsThisMonth = [];
    for (var i = 0; i < errs.length; i++) window.__invariantErrors.push(errs[i]);
  };
})();
`;

const reportJs = `
(function(){
  var pre = document.createElement('pre');
  pre.id = 'scanout';
  pre.textContent = '##SCAN##' + JSON.stringify({ errors: window.__invariantErrors || [], triggerCount: window.__eventTriggerCount || {} }) + '##END##';
  document.body.appendChild(pre);
})();
`;

const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';
const injected = html.replace('</body>',
  openTag + '\n' + invariantsJs + '\n' + closeTag + '\n'
  + openTag + '\nwindow.__SIM_N_RANDOM__ = 500; window.__SIM_N_SMART__ = 0; window.__SIM_N_PARENT__ = 0; window.__SIM_N_PARENT_LOW__ = 0;\n' + closeTag + '\n'
  + openTag + '\n' + sim + '\n' + closeTag + '\n'
  + openTag + '\n' + reportJs + '\n' + closeTag + '\n</body>');

fs.writeFileSync(TMP, injected, 'utf8');
const url = 'file:///' + TMP.split(path.sep).join('/') + '?rjs_test=1';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];
const EDGE = process.env.EDGE || CANDIDATES.find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge/Chrome'); process.exit(2); }

const r = spawnSync(EDGE, ['--headless=new','--disable-gpu','--no-sandbox',
  '--user-data-dir=' + path.join(os.tmpdir(),'rj-scan-inv-profile'),
  '--virtual-time-budget=240000','--window-size=1366,768','--dump-dom', url],
  { encoding: 'utf8', maxBuffer: 64*1024*1024, timeout: 300000 });
const raw = r.stdout || '';
const s = raw.lastIndexOf('##SCAN##');
const e = s < 0 ? -1 : raw.indexOf('##END##', s);
let data = null;
if (s >= 0 && e > 0) { try { data = JSON.parse(raw.slice(s + 8, e)); } catch (err) { console.error('JSON 解析失败', err); } }
try { fs.unlinkSync(TMP); } catch (err) {}

if (!data) { console.error('未获取到数据。raw 尾部:\n' + raw.slice(-300)); process.exit(1); }

const errors = data.errors || [];
const md = [];
md.push('# 系统不变式审计 · 500 局分层 Agent');
md.push('');
md.push('> 违反不变式总数：**' + errors.length + '**。');
md.push('');

// 去重 + 分类统计
const uniq = {};
errors.forEach(function (x) { uniq[x] = (uniq[x] || 0) + 1; });
const keys = Object.keys(uniq);
md.push('## 一、违反类型汇总');
md.push('');
md.push('| 违反类型 | 出现次数 |');
md.push('|---|---|');
keys.forEach(function (k) { md.push('| ' + k + ' | ' + uniq[k] + ' |'); });
md.push('');

md.push('## 二、违反明细（前 100 条）');
md.push('');
if (!keys.length) {
  md.push('**未发现任何违反不变式的情况——系统已完美闭环。**');
} else {
  md.push('| # | 违反描述 |');
  md.push('|---|---|');
  errors.slice(0, 100).forEach(function (x, i) { md.push('| ' + (i + 1) + ' | ' + x + ' |'); });
}
md.push('');

fs.writeFileSync(OUT, md.join('\n'), 'utf8');
console.log('已写入 ' + OUT);
console.log('违反不变式总数: ' + errors.length);
console.log('违反类型数: ' + keys.length);
keys.slice(0, 10).forEach(function (k) { console.log('  - ' + k + ' ×' + uniq[k]); });
