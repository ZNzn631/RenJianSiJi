const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');
const GAME = path.join(ROOT, '人间开发.html');
const SIM = path.join(ROOT, 'tests', 'sim_500.js');
const TMP = path.join(ROOT, '_scan_dynamic.html');
const OUT = path.join(ROOT, '_event_dynamic_report.md');

const html = fs.readFileSync(GAME, 'utf8');
const sim = fs.readFileSync(SIM, 'utf8');

const recorderJs = `
(function(){
  window.__eventLog = [];
  var __origOpen = openEvent;
  openEvent = function(ev){
    if (ev && ev.id) {
      var r = ev.requires || {};
      window.__eventLog.push({ id: ev.id, age: state.age, title: ev.title, minAge: r.minAge, maxAge: r.maxAge, chainOnly: !!ev.chainOnly });
    }
    return __origOpen(ev);
  };
})();
`;

const scanJs = `
(function(){
  var log = window.__eventLog || [];
  var bands = [
    [16,18,'16-18岁（高中）'],
    [19,22,'19-22岁（大学）'],
    [23,30,'23-30岁（职场初期）'],
    [31,50,'31-50岁（中年）'],
    [51,9999,'51+岁（暮年）']
  ];
  var agg = {};
  var titles = {};
  var hardLeak = [];
  var range = {};
  bands.forEach(function(b){ agg[b[2]] = {}; });
  log.forEach(function(rec){
    var recAge = rec.age;
    if ((typeof rec.minAge === 'number' && recAge < rec.minAge) || (typeof rec.maxAge === 'number' && recAge > rec.maxAge)) {
      hardLeak.push(rec);
    }
    titles[rec.id] = rec.title;
    if (!range[rec.id]) range[rec.id] = { min: 99999, max: -1, cnt: 0 };
    range[rec.id].min = Math.min(range[rec.id].min, recAge);
    range[rec.id].max = Math.max(range[rec.id].max, recAge);
    range[rec.id].cnt++;
    bands.forEach(function(b){
      if (recAge >= b[0] && recAge <= b[1]) {
        agg[b[2]][rec.id] = (agg[b[2]][rec.id] || 0) + 1;
      }
    });
  });
  var pre = document.createElement('pre');
  pre.id = 'scanout';
  pre.textContent = '##SCAN##' + JSON.stringify({ agg: agg, titles: titles, hardLeak: hardLeak, totalEvents: log.length, range: range }) + '##END##';
  document.body.appendChild(pre);
})();
`;

const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';
const injected = html.replace('</body>',
  openTag + '\n' + recorderJs + '\n' + closeTag + '\n'
  + openTag + '\nwindow.__SIM_N_RANDOM__ = 500; window.__SIM_N_SMART__ = 0; window.__SIM_N_PARENT__ = 0; window.__SIM_N_PARENT_LOW__ = 0;\n' + closeTag + '\n'
  + openTag + '\n' + sim + '\n' + closeTag + '\n'
  + openTag + '\n' + scanJs + '\n' + closeTag + '\n</body>');

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
  '--user-data-dir=' + path.join(os.tmpdir(),'rj-scan-dyn-profile'),
  '--virtual-time-budget=240000','--window-size=1366,768','--dump-dom', url],
  { encoding: 'utf8', maxBuffer: 64*1024*1024, timeout: 300000 });
const raw = r.stdout || '';
const s = raw.lastIndexOf('##SCAN##');
const e = s < 0 ? -1 : raw.indexOf('##END##', s);
let data = null;
if (s >= 0 && e > 0) { try { data = JSON.parse(raw.slice(s + 8, e)); } catch (err) { console.error('JSON 解析失败', err); } }
try { fs.unlinkSync(TMP); } catch (err) {}

if (!data) { console.error('未获取到扫描数据。raw 尾部:\n' + raw.slice(-300)); process.exit(1); }

const { agg, titles, hardLeak, totalEvents, range } = data;
const md = [];
md.push('# 事件动态扫描 · 500 局分层 Agent');
md.push('');
md.push('> 总触发事件数：**' + totalEvents + '**（500 局 × 分层 Agent 全程累计）。');
md.push('');

const bands = ['16-18岁（高中）','19-22岁（大学）','23-30岁（职场初期）','31-50岁（中年）','51+岁（暮年）'];
md.push('## 一、各年龄段触发频率 Top 10');
md.push('');
bands.forEach(function (b) {
  md.push('### ' + b);
  md.push('');
  const entries = Object.keys(agg[b]).sort(function (x, y) { return agg[b][y] - agg[b][x]; }).slice(0, 10);
  if (!entries.length) { md.push('（该年龄段无事件触发）'); md.push(''); return; }
  md.push('| 排名 | 事件ID | 标题 | 触发次数 |');
  md.push('|---|---|---|---|');
  entries.forEach(function (id, i) {
    md.push('| ' + (i + 1) + ' | `' + id + '` | ' + (titles[id] || '') + ' | ' + agg[b][id] + ' |');
  });
  md.push('');
});

md.push('## 二、硬穿模检测（实际年龄超出 requires 年龄边界）');
md.push('');
if (hardLeak.length === 0) {
  md.push('**未发现硬穿模**：所有事件的实际触发年龄均在 `requires.minAge/maxAge` 范围内。');
} else {
  md.push('| 事件ID | 标题 | 触发年龄 | requires 边界 |');
  md.push('|---|---|---|---|');
  hardLeak.forEach(function (rec) {
    md.push('| `' + rec.id + '` | ' + rec.title + ' | ' + rec.age + ' | ' + (rec.minAge === undefined ? '—' : rec.minAge) + '~' + (rec.maxAge === undefined ? '—' : rec.maxAge) + ' |');
  });
}
md.push('');

// 全事件实际触发年龄范围（供审查语义穿模）
md.push('## 三、全事件实际触发年龄范围（供审查「语义穿模」）');
md.push('');
md.push('| 事件ID | 标题 | 实际触发年龄范围 | 触发次数 |');
md.push('|---|---|---|---|');
const rids = Object.keys(range).sort(function (a, b) { return range[a].min - range[b].min; });
rids.forEach(function (id) {
  var rg = range[id];
  md.push('| `' + id + '` | ' + (titles[id] || '') + ' | ' + rg.min + '~' + rg.max + ' 岁 | ' + rg.cnt + ' |');
});
md.push('');

fs.writeFileSync(OUT, md.join('\n'), 'utf8');
console.log('已写入 ' + OUT);
console.log('总事件数=' + totalEvents + ' 硬穿模=' + hardLeak.length);
