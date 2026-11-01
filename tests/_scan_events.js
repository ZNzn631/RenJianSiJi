const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');
const GAME = path.join(ROOT, '人间开发.html');
const TMP = path.join(ROOT, '_scan_run.html');
const OUT = path.join(ROOT, '_event_matrix.md');

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];
const EDGE = process.env.EDGE || CANDIDATES.find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge/Chrome'); process.exit(2); }

const html = fs.readFileSync(GAME, 'utf8');
const scanJs = `
(function(){
  var out = [];
  var info = { has: typeof window.eventsData !== 'undefined', len: window.eventsData ? window.eventsData.length : -1, hasCity: typeof window.citiesData !== 'undefined' };
  if (window.eventsData) {
    out = window.eventsData.map(function(ev){
      var r = ev.requires || {};
      return {
        id: ev.id, title: ev.title, weight: ev.weight || 0,
        priority: !!ev.priority, chainOnly: !!ev.chainOnly,
        minAge: r.minAge, maxAge: r.maxAge,
        isStudent: r.isStudent, employed: r.employed, job: r.job,
        single: r.single, married: r.married, minEdu: r.minEdu, education: r.education,
        schoolTier: r.schoolTier, housing: r.housing, loveState: r.loveState, city: r.city,
        onceEver: r.onceEver, monthIn: r.monthIn, monthNotIn: r.monthNotIn,
        notSummerBreak: r.notSummerBreak, notTeenLove: r.notTeenLove, noInsurance: r.noInsurance,
        friendFavor: r.friendFavor, friendTag: r.friendTag, setbackRecent: r.setbackRecent, skill: r.skill,
        houseMoney: r.houseMoney, hasChild: r.hasChild, adultChild: r.adultChild,
        datingMonths: r.datingMonths, mood: r.mood, money: r.money, intelligence: r.intelligence,
        unemployed: r.unemployed, jobCooldown: r.jobCooldown
      };
    });
  }
  var pre = document.createElement('pre');
  pre.id = 'scanout';
  pre.textContent = '##SCAN##' + JSON.stringify({ info: info, events: out }) + '##END##';
  document.body.appendChild(pre);
})();
`;
const openTag = '<' + 'script>';
const closeTag = '</' + 'script>';
const injected = html.replace('</body>', openTag + '\n' + scanJs + '\n' + closeTag + '\n</body>');
fs.writeFileSync(TMP, injected, 'utf8');
const url = 'file:///' + TMP.split(path.sep).join('/') + '?rjs_test=1';

const r = spawnSync(EDGE, ['--headless=new','--disable-gpu','--no-sandbox',
  '--user-data-dir=' + path.join(os.tmpdir(),'rj-scan-profile'),
  '--virtual-time-budget=60000','--window-size=1366,768','--dump-dom', url],
  { encoding: 'utf8', maxBuffer: 64*1024*1024, timeout: 120000 });
const raw = r.stdout || '';
console.error('raw 尾部 600 字符:\n' + raw.slice(-600));
const s = raw.lastIndexOf('##SCAN##');
const e = s < 0 ? -1 : raw.indexOf('##END##', s);
let events = [];
let info = null;
if (s >= 0 && e > 0) {
  try {
    var parsed = JSON.parse(raw.slice(s + 8, e));
    info = parsed.info;
    events = parsed.events || [];
  } catch (err) { console.error('JSON 解析失败', err); }
} else {
  console.error('未找到 ##SCAN## 标记。raw 长度=' + raw.length);
}
try { fs.unlinkSync(TMP); } catch (err) {}

console.log('诊断 info: ' + JSON.stringify(info));
console.log('提取事件数: ' + events.length);

function ageText(ev) {
  var a = ev.minAge, b = ev.maxAge;
  if (a === undefined && b === undefined) return '不限';
  if (b === undefined) return a + '+';
  if (a === undefined) return '≤' + b;
  return a + '-' + b;
}
function mustText(ev) {
  var p = [];
  if (ev.isStudent === true) p.push('在校生');
  if (ev.isStudent === false) p.push('非在校');
  if (ev.employed === true) p.push('在职');
  if (ev.unemployed === true) p.push('待业');
  if (ev.job === 'not_null' || ev.job === 'any') p.push('在职');
  else if (typeof ev.job === 'string') p.push('岗位:' + ev.job);
  else if (Array.isArray(ev.job)) p.push('岗位:' + ev.job.join('/'));
  if (ev.single === true) p.push('单身');
  if (ev.married === true) p.push('已婚');
  if (ev.minEdu) p.push('学历≥' + ev.minEdu);
  if (Array.isArray(ev.education)) p.push('学历:' + ev.education.join('/'));
  if (ev.schoolTier) p.push(ev.schoolTier + '院校');
  if (ev.housing === 'rent') p.push('租房');
  else if (ev.housing === 'dorm') p.push('住宿舍');
  else if (ev.housing === 'own') p.push('已买房');
  else if (ev.housing === 'home') p.push('住家');
  if (ev.loveState) p.push(ev.loveState === 'dating' ? '交往中' : ev.loveState === 'married' ? '已婚' : ev.loveState);
  if (ev.city) p.push('城市:' + (Array.isArray(ev.city) ? ev.city.join('/') : ev.city));
  if (ev.friendFavor) p.push('好友≥' + ev.friendFavor);
  if (ev.friendTag) p.push(ev.friendTag === true ? '有朋友' : '有' + (Array.isArray(ev.friendTag) ? ev.friendTag.join('/') : ev.friendTag) + '朋友');
  if (ev.setbackRecent) p.push('近12月有挫折');
  if (ev.skill) { p.push(Object.keys(ev.skill).map(function(k){return k + '≥' + ev.skill[k];}).join('+')); }
  if (ev.hasChild) p.push('有娃');
  if (ev.adultChild) p.push('孩子成年');
  if (ev.datingMonths) p.push('交往≥' + ev.datingMonths + '月');
  if (ev.houseMoney) p.push('首付达标');
  if (ev.jobCooldown) p.push('跳槽冷却≥' + ev.jobCooldown + '月');
  if (ev.mood && typeof ev.mood === 'object') p.push('心情' + (ev.mood.min ? '≥' + ev.mood.min : '') + (ev.mood.max ? '≤' + ev.mood.max : ''));
  if (ev.money && typeof ev.money === 'object') p.push('钱' + (ev.money.min ? '≥' + ev.money.min : '') + (ev.money.max ? '≤' + ev.money.max : ''));
  if (ev.intelligence && typeof ev.intelligence === 'object') p.push('智力' + (ev.intelligence.min ? '≥' + ev.intelligence.min : '') + (ev.intelligence.max ? '≤' + ev.intelligence.max : ''));
  return p.join(' · ') || '—';
}
function mutexText(ev) {
  var p = [];
  if (ev.onceEver) p.push('一生一次');
  if (ev.chainOnly) p.push('链式专属');
  if (ev.monthIn) p.push((Array.isArray(ev.monthIn) ? ev.monthIn : [ev.monthIn]).join('/') + '月');
  if (ev.monthNotIn) p.push('避开' + (Array.isArray(ev.monthNotIn) ? ev.monthNotIn : [ev.monthNotIn]).join('/') + '月');
  if (ev.notSummerBreak) p.push('非暑假过渡');
  if (ev.notTeenLove) p.push('无早恋');
  if (ev.noInsurance) p.push('未买医保');
  return p.join(' · ') || '—';
}

// 冲突检测
function conflicts(ev) {
  var c = [];
  if (ev.isStudent === true && (ev.employed === true || ev.job === 'not_null' || ev.job === 'any')) c.push('在校+在职冲突');
  if (ev.single === true && ev.married === true) c.push('单身+已婚冲突');
  if (ev.isStudent === true && ev.housing === 'rent') c.push('在校+租房冲突');
  return c;
}

events.sort(function (a, b) {
  var x = (a.minAge === undefined ? 0 : a.minAge) - (b.minAge === undefined ? 0 : b.minAge);
  if (x !== 0) return x;
  return (a.title || '').localeCompare(b.title || '');
});

// 年龄覆盖判定
function covers(ev, age) {
  var a = ev.minAge === undefined ? 0 : ev.minAge;
  var b = ev.maxAge === undefined ? 999 : ev.maxAge;
  return age >= a && age <= b;
}

var bands = [
  ['6-12', 6, 12], ['13-15', 13, 15], ['16-18', 16, 18], ['19-22', 19, 22],
  ['23-25', 23, 25], ['26-30', 26, 30], ['31-40', 31, 40],
  ['41-50', 41, 50], ['51-60', 51, 60], ['60+', 61, 999]
];

var md = [];
md.push('# 事件全景扫描 · 静态矩阵表');
md.push('');
md.push('> 事件总数：**' + events.length + '**。脚本自动生成，未人工增删。');
md.push('');
md.push('## 一、年龄段覆盖事件数统计');
md.push('');
md.push('| 年龄段 | 覆盖事件数 |');
md.push('|---|---|');
var bandCount = {};
bands.forEach(function (b) {
  var cnt = events.filter(function (ev) { return covers(ev, (b[1] + b[2]) / 2); }).length;
  bandCount[b[0]] = cnt;
  md.push('| ' + b[0] + ' | ' + cnt + ' |');
});
md.push('');

// 冲突项
var confList = events.filter(function (ev) { return conflicts(ev).length > 0; });
md.push('## 二、潜在冲突项（requires 自相矛盾）');
md.push('');
if (confList.length === 0) {
  md.push('未发现明显冲突项。');
} else {
  md.push('| 事件ID | 标题 | 冲突 |');
  md.push('|---|---|---|');
  confList.forEach(function (ev) { md.push('| ' + ev.id + ' | ' + ev.title + ' | ' + conflicts(ev).join('；') + ' |'); });
}
md.push('');

// 完整矩阵表
md.push('## 三、完整事件矩阵表（按触发年龄下限排序）');
md.push('');
md.push('| 事件ID | 标题 | 触发年龄 | 必须状态 | 互斥条件 |');
md.push('|---|---|---|---|---|');
events.forEach(function (ev) {
  md.push('| `' + ev.id + '` | ' + ev.title + ' | ' + ageText(ev) + ' | ' + mustText(ev) + ' | ' + mutexText(ev) + ' |');
});
md.push('');

fs.writeFileSync(OUT, md.join('\n'), 'utf8');
console.log('已写入 ' + OUT);
console.log('冲突项: ' + confList.length);
console.log('年龄段覆盖: ' + JSON.stringify(bandCount));
