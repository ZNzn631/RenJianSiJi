/* 人间四季 · 事件穿透（穿模）探针  v3.20
   ---------------------------------------------------------------
   它要回答的问题和 D4 正好相反：
     D4  ——「该出现的事件，是不是永远出不来」（死事件）
     本探针 ——「不该出现的事件，会不会混进来」（穿透 / 穿模）

   做法（对每个事件、每条 requires 逐个做反证）：
     1) 先在这套状态矩阵里找到一个「满足该事件全部条件」的真实态；
     2) 然后只破坏其中 ONE 个字段，再一次调用 checkRequires；
     3) 只要事件仍然可触发 → 说明这条 requires 根本没起作用 = 穿透。

   为什么要「先找到满足态」再破坏：直接构造违规态会把别的条件也弄坏，
   分不清是这条规则失效还是别处失败；单字段反证能精确定位到 (事件, 条件键)。

   输出：<pre id="isotout"> 内 ##ISO##{json}##END##，由 tests/run.js 解析并并入总表。
   --------------------------------------------------------------- */
(function () {
  var RES = { groups: [], stats: {} };
  function ok(n, p, i) { RES.groups.push({ n: n, p: !!p, i: i === undefined ? '' : String(i) }); }
  function S() { return RJS.state; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var BACKUP = clone(RJS.state);

  var EV = RJS.events;
  var ids = {};
  for (var i = 0; i < EV.length; i++) ids[EV[i].id] = EV[i];

  /* ---------------- 基础态构造（与 D4 覆盖矩阵同源） ---------------- */
  var AGES = [16, 18, 20, 22, 24, 26, 28, 30, 35, 40, 45, 50, 60, 70];
  var EDUS = ['初中', '高中', '专科', '本科', '硕士', '博士'];
  var LOVE = ['single', 'dating', 'married'];
  var HOUS = ['home', 'dorm', 'rent'];
  var MONEY = [0, 3000, 30000, 150000, 600000, 1000000];
  var STA = [0, 20, 60, 95];
  var MOOD = [10, 50, 90];
  var ATTR = [10, 60, 200];
  var MONTHS = [1, 2, 3, 5, 7, 9, 12];
  var JOBS = ['无业', '普通文员', '普通程序员', '大厂程序员', '人民教师', '外卖骑手', '网红主播'];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function kid(mode, nowM) {
    if (mode === 0) return { kids: 0, children: [] };
    if (mode === 1) return { kids: 1, children: [{ id: 'k1', name: '小满', sex: '女', bornAt: nowM - 60, birth: '顺产', int: 60, sta: 50, cha: 50, luck: 50, edu: '小学', invest: '普通', relation: 60, alive: true, support: 0, hasChild: false, lastGrow: 0 }] };
    if (mode === 2) return { kids: 1, children: [{ id: 'k1', name: '小禾', sex: '男', bornAt: nowM - 300, birth: '顺产', int: 90, sta: 60, cha: 55, luck: 50, edu: '硕士', invest: '重点', relation: 70, alive: true, support: 1500, hasChild: true, lastGrow: 0 }] };
    return { kids: 2, children: [
      { id: 'k1', name: '小禾', sex: '男', bornAt: nowM - 340, birth: '顺产', int: 95, sta: 60, cha: 55, luck: 50, edu: '硕士', invest: '重点', relation: 75, alive: true, support: 1500, hasChild: true, lastGrow: 0 },
      { id: 'k2', name: '小满', sex: '女', bornAt: nowM - 120, birth: '顺产', int: 70, sta: 55, cha: 50, luck: 45, edu: '初中', invest: '普通', relation: 65, alive: true, support: 0, hasChild: false, lastGrow: 0 }
    ] };
  }

  function makeState(cfg) {
    var s = S();
    s.y = 2026; s.m = cfg.month; s.d = 15;
    s.age = cfg.age; s.edu = cfg.edu;
    s.job = cfg.job; s.salary = cfg.job === '无业' ? 0 : 14000;
    s.money = cfg.money; s.sta = cfg.sta; s.mood = cfg.mood;
    s.int = cfg.attr; s.cha = cfg.attr; s.eq = cfg.attr; s.will = cfg.attr; s.luck = cfg.attr;
    s.loveState = cfg.love; s.married = cfg.love === 'married';
    s.love = (cfg.loveVal !== undefined) ? cfg.loveVal : (cfg.love === 'married' ? 60 : 0);
    s.housing = cfg.housing;
    s.schoolTier = cfg.tier;
    s.hasInsurance = cfg.insurance;
    s.dink = false; s.lostChild = 0;
    s.isStudent = cfg.edu === '本科' && cfg.age < 22;
    s.hadTeenLove = cfg.teenLove === true;
    s.summerBreakEnd = (s.y * 12 + s.m) - 6;
    s.enteredCollegeMonth = (s.y * 12 + s.m) - 12;
    s.examLog = cfg.exam ? [{ stage: 'gaokao', score: 400 }] : [];
    s.currentPositionYears = cfg.posYears;
    s.lastJobChangeMonth = (s.y * 12 + s.m) - cfg.jobCooldown;
    s.lastMarryMonth = cfg.lastMarry || 0;
    s.datingStart = cfg.offset ? (s.y * 12 + s.m) - cfg.offset : 0;
    s.datingLove = 50; s.partnerName = cfg.love === 'single' ? '' : '林知';
    s.inLove = cfg.love !== 'single';
    s.triggeredEvents = []; s.usage = {}; s.milestones = []; s.pendingExam = null;
    s.ended = false; s.hospitalCount = 0; s.deathStrikes = 0;
    var k = kid(cfg.childrenMode, s.y * 12 + s.m);
    s.kids = k.kids; s.children = k.children;
    return s;
  }

  function randomCfg() {
    return {
      age: pick(AGES), edu: pick(EDUS), job: pick(JOBS), money: pick(MONEY),
      sta: pick(STA), mood: pick(MOOD), attr: pick(ATTR), love: pick(LOVE),
      housing: pick(HOUS), month: pick(MONTHS), tier: pick(['重点', '普通']),
      insurance: Math.random() < 0.5, teenLove: Math.random() < 0.3,
      exam: Math.random() < 0.7, posYears: Math.floor(Math.random() * 8),
      jobCooldown: Math.floor(Math.random() * 36), childrenMode: Math.floor(Math.random() * 4),
      offset: pick([0, 2, 3, 6, 9, 12]), lastMarry: 0,
      loveVal: pick([0, 15, 35, 60, 85, 100])
    };
  }

  /* ---------------- 违规生成器：只破坏一个字段 ---------------- */
  // 返回 true = 已成功构造违规；false = 这个键暂时没法反证（跳过）
  function violate(s, key, val, ev) {
    var nowM = s.y * 12 + s.m;
    if (key === 'job') {
      if (val === 'not_null' || val === 'any') { s.job = '无业'; s.salary = 0; return true; }
      if (Array.isArray(val)) {
        for (var i = 0; i < JOBS.length; i++) if (val.indexOf(JOBS[i]) === -1) { s.job = JOBS[i]; s.salary = JOBS[i] === '无业' ? 0 : 14000; return true; }
        return false;
      }
      for (var j = 0; j < JOBS.length; j++) if (JOBS[j] !== val && JOBS[j] !== '无业') { s.job = JOBS[j]; s.salary = 14000; return true; }
      s.job = '无业'; s.salary = 0; return true;
    }
    if (key === 'minAge') { s.age = Math.max(0, Number(val) - 1); return true; }
    if (key === 'maxAge') { s.age = Number(val) + 1; return true; }
    if (key === 'married') { s.married = !val; s.loveState = val ? 'single' : 'married'; return true; }
    if (key === 'single') { if (val !== true) return false; s.married = true; s.loveState = 'married'; return true; }
    if (key === 'loveState') {
      var list = Array.isArray(val) ? val : [val];
      for (var k = 0; k < LOVE.length; k++) if (list.indexOf(LOVE[k]) === -1) { s.loveState = LOVE[k]; s.married = LOVE[k] === 'married'; return true; }
      return false;
    }
    if (key === 'education') {
      var need = Array.isArray(val) ? val : [val];
      for (var e = 0; e < EDUS.length; e++) if (need.indexOf(EDUS[e]) === -1) { s.edu = EDUS[e]; return true; }
      return false;
    }
    if (key === 'minEdu') {
      var rank = { '无': 0, '小学': 1, '初中': 2, '高中': 3, '专科': 4, '本科': 5, '硕士': 6, '博士': 7 };
      var cur = rank[val]; if (cur === undefined) return false;
      for (var r = 0; r < EDUS.length; r++) if (rank[EDUS[r]] < cur) { s.edu = EDUS[r]; return true; }
      return false;
    }
    if (key === 'housing') {
      for (var h = 0; h < HOUS.length; h++) if (HOUS[h] !== val) { s.housing = HOUS[h]; return true; }
      return false;
    }
    if (key === 'isStudent') { s.edu = val === true ? '初中' : '本科'; s.age = val === true ? 30 : 20; return true; }
    if (key === 'schoolTier') { s.schoolTier = val === '重点' ? '普通' : '重点'; return true; }
    if (key === 'hasChild') { s.kids = 0; s.children = []; return true; }
    if (key === 'adultChild') { s.kids = 1; s.children = kid(1, nowM).children; return true; }
    if (key === 'loveMax') { s.married = true; s.loveState = 'married'; s.love = Math.min(100, Number(val) + 1); return true; }
    if (key === 'monthIn') { var l1 = Array.isArray(val) ? val : [val]; for (var m1 = 1; m1 <= 12; m1++) if (l1.indexOf(m1) === -1) { s.m = m1; return true; } return false; }
    if (key === 'monthNotIn') { s.m = (Array.isArray(val) ? val : [val])[0]; return true; }
    if (key === 'onceEver') { if (val !== true) return false; s.triggeredEvents = [ev.id]; s.usage[ev.id] = { ever: true }; return true; }
    if (key === 'employed') { if (val !== true) return false; s.salary = 0; s.job = '无业'; return true; }
    if (key === 'unemployed') { if (val !== true) return false; s.salary = 14000; s.job = '普通程序员'; return true; }
    if (key === 'noInsurance') { if (val !== true) return false; s.hasInsurance = true; return true; }
    if (key === 'notTeenLove') { if (val !== true) return false; s.hadTeenLove = true; return true; }
    if (key === 'notSummerBreak') { if (val !== true) return false; s.isSummerBreak = true; s.summerBreakEnd = nowM + 3; s.enteredCollegeMonth = nowM; return true; }
    if (key === 'datingMonths') { s.datingStart = nowM; return true; }
    if (key === 'marryCooldown') { s.lastMarryMonth = nowM; return true; }
    if (key === 'jobCooldown') { s.lastJobChangeMonth = nowM; return true; }
    if (key === 'minPositionYears') { s.currentPositionYears = 0; return true; }
    if (key === 'demotable') { var c1 = RJS.careers ? RJS.careers[ s.job ] : null; s.job = '普通文员'; return true; }
    if (key === 'promotable') { s.job = '架构师'; return true; }
    if (key === 'alreadyExam') { s.examLog = []; return true; }
    if (key === 'oncePerDay') { if (val !== true) return false; var dk = s.y + '-' + s.m + '-' + s.d; s.usage[ev.id] = { day: dk }; return true; }
    if (key === 'oncePerWeek') { if (val !== true) return false; s.usage[ev.id] = { week: 'X' }; return true; }
    // 属性区间
    var MAP = { money: 'money', stamina: 'sta', mood: 'mood', intelligence: 'int', cha: 'cha', will: 'will', eq: 'eq', luck: 'luck' };
    if (MAP[key] && val && typeof val === 'object') {
      var f = MAP[key];
      if (typeof val.min === 'number') { s[f] = val.min - 1; return true; }
      if (typeof val.max === 'number') { s[f] = val.max + 1; return true; }
    }
    return false;
  }

  /* ---------------- 主流程 ---------------- */
  (function run() {
    var pool = [];
    for (var i = 0; i < EV.length; i++) if (EV[i].requires && Object.keys(EV[i].requires).length) pool.push(EV[i]);

    var found = 0, skipped = [], leaked = [], unstable = [];
    var checks = 0;

    for (var e = 0; e < pool.length; e++) {
      var ev = pool[e];
      // 1) 找一个满足态（最多 4000 次随机）
      var base = null;
      for (var t = 0; t < 4000; t++) {
        var cfg = randomCfg();
        makeState(cfg);
        if (RJS.checkRequires(ev).length === 0) { base = clone(cfg); break; }
      }
      if (!base) { skipped.push(ev.id); continue; }
      found++;

      // 2) 逐条反证
      var keys = Object.keys(ev.requires);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k], val = ev.requires[key];
        makeState(base);
        if (RJS.checkRequires(ev).length !== 0) { unstable.push(ev.id + '.' + key); continue; }  // 基础态不稳定（随机字段影响），跳过
        if (!violate(S(), key, val, ev)) continue;
        checks++;
        var miss = RJS.checkRequires(ev);
        if (miss.length === 0) leaked.push(ev.id + '.' + key);
      }
    }

    // 复位
    var s = S();
    Object.keys(s).forEach(function (x) { delete s[x]; });
    Object.keys(BACKUP).forEach(function (x) { s[x] = BACKUP[x]; });
    try { RJS.render(); } catch (err) {}

    ok('ISO1 穿透探针覆盖到 ' + found + ' 个带条件事件（跳过 ' + skipped.length + ' 个无满足态）',
      found > 0, 'checks=' + checks);
    ok('ISO2 全部 requires 单键反证：被破坏后事件必须不可触发（无穿透）',
      leaked.length === 0, leaked.length ? leaked.slice(0, 12).join(', ') + (leaked.length > 12 ? ' …共' + leaked.length + '处' : '') : 'clean');
    ok('ISO3 未发现「条件看起来写了、实际不生效」的字段',
      leaked.length === 0, leaked.length ? 'leaked=' + leaked.length : 'none');

    RES.stats.iso = {
      events: EV.length, withRequires: pool.length, satisfiable: found,
      skipped: skipped.length, checks: checks, leaked: leaked.length, unstable: unstable.length
    };
    if (skipped.length) RES.stats.iso.skippedIds = skipped.slice(0, 20);
    if (leaked.length) RES.stats.iso.leakedList = leaked.slice(0, 50);

    var pre = document.createElement('pre');
    pre.id = 'isotout';
    pre.textContent = '##ISO##' + JSON.stringify(RES) + '##END##';
    document.body.appendChild(pre);
  })();
})();
