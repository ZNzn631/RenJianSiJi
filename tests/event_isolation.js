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
  var AGES = [6, 8, 10, 12, 13, 15, 16, 18, 20, 22, 24, 26, 28, 30, 35, 40, 45, 50, 60, 70];   // v3.28：补童年/青春期
  var EDUS = ['初中', '高中', '专科', '本科', '硕士', '博士'];
  var LOVE = ['single', 'dating', 'married'];
  var HOUS = ['home', 'dorm', 'rent'];
  var CITIES = ['normal', 'beijing', 'chengdu', 'changsha', 'hegang', 'county'];
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

  function friendsOf(mode, nowM) {
    if (mode === 0) return [];
    if (mode === 1) return [{ id: 'f1', name: '林晓宇', favor: 80, tag: '同事', lastInteract: nowM }];
    if (mode === 2) return [
      { id: 'f1', name: '林晓宇', favor: 80, tag: '同事', lastInteract: nowM },
      { id: 'f2', name: '沈子墨', favor: 40, tag: '同学', lastInteract: nowM }
    ];
    if (mode === 3) return [{ id: 'f1', name: '林晓宇', favor: 80, tag: '同事', lastInteract: nowM, debt: { amount: 5000, outcome: 'repay' } }];
    return [{ id: 'f1', name: '林晓宇', favor: 80, tag: '同事', lastInteract: nowM, debt: { amount: 5000, outcome: 'vanish' } }];
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
    s.city = cfg.city || 'normal';
    s.schoolTier = cfg.tier;
    s.hasInsurance = cfg.insurance;
    s.stockValue = 10000;   // v3.22：覆盖股票事件的可满足性
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
    s.friends = friendsOf(cfg.friendsMode, s.y * 12 + s.m);   // v3.32：朋友采样
    s.recentSetback = cfg.setback ? (s.y * 12 + s.m) : 0;     // v3.32：挫折采样
    s.skills = cfg.skills || { coding: 0, writing: 0, cooking: 0 };   // v3.34：技能采样
    return s;
  }

  function randomCfg() {
    return {
      age: pick(AGES), edu: pick(EDUS), job: pick(JOBS), money: pick(MONEY),
      sta: pick(STA), mood: pick(MOOD), attr: pick(ATTR), love: pick(LOVE),
      housing: pick(HOUS), city: pick(CITIES), month: pick(MONTHS), tier: pick(['重点', '普通']),
      insurance: Math.random() < 0.5, teenLove: Math.random() < 0.3,
      exam: Math.random() < 0.7, posYears: Math.floor(Math.random() * 8),
      jobCooldown: Math.floor(Math.random() * 36), childrenMode: Math.floor(Math.random() * 4),
      offset: pick([0, 2, 3, 6, 9, 12]), lastMarry: 0,
      loveVal: pick([0, 15, 35, 60, 85, 100]),
      friendsMode: Math.floor(Math.random() * 5), setback: Math.random() < 0.5,
      skills: Math.random() < 0.5 ? { coding: 60, writing: 60, cooking: 60 } : { coding: 0, writing: 0, cooking: 0 }
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
    if (key === 'houseMoney') { s.money = houseCost(Number(val)) - 1; return true; }   // v3.24：房价门槛反证
    if (key === 'city') {
      var clist = Array.isArray(val) ? val : [val];
      for (var ci = 0; ci < CITIES.length; ci++) if (clist.indexOf(CITIES[ci]) === -1) { s.city = CITIES[ci]; return true; }
      return false;
    }
    // v3.32：朋友条件反证
    if (key === 'friendFavor') {
      var needF = Number(val);
      var fl = s.friends || [];
      for (var fi = 0; fi < fl.length; fi++) fl[fi].favor = Math.max(0, needF - 1);
      return fl.length > 0;
    }
    if (key === 'friendTag') {
      if (val === true) { s.friends = []; return true; }
      var needT = Array.isArray(val) ? val : [val];
      var fl2 = s.friends || [];
      for (var ti = 0; ti < fl2.length; ti++) if (needT.indexOf(fl2[ti].tag) > -1) { fl2[ti].tag = '__none__'; return true; }
      return false;
    }
    if (key === 'friendDebt') {
      var fl3 = s.friends || [];
      for (var di = 0; di < fl3.length; di++) if (fl3[di].debt) { delete fl3[di].debt; return true; }
      return false;
    }
    if (key === 'setbackRecent') { s.recentSetback = 0; return true; }
    if (key === 'skill') {
      var sk2 = s.skills || (s.skills = {});
      for (var sn in val) {
        if (Object.prototype.hasOwnProperty.call(val, sn)) sk2[sn] = Math.max(0, Number(val[sn]) - 1);
      }
      return true;
    }
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

  /* ---------------- ISO4 死链与孤儿 ---------------- */
  (function () {
    var broken = [], orphan = [];
    var referenced = {};
    for (var i = 0; i < EV.length; i++) {
      var opts = EV[i].options || [];
      for (var j = 0; j < opts.length; j++) {
        var nx = opts[j].nextEventId;
        if (nx) {
          if (!ids[nx]) broken.push(EV[i].id + '\u2192' + nx);
          referenced[nx] = true;
        }
      }
    }
    for (var k = 0; k < EV.length; k++) {
      if (EV[k].chainOnly && !referenced[EV[k].id]) orphan.push(EV[k].id);
    }
    ok('ISO4a 所有 nextEventId 目标存在（无断链）', broken.length === 0,
      broken.length ? broken.slice(0, 10).join(', ') : 'clean');
    ok('ISO4b chainOnly 事件都有入口（无孤儿）', orphan.length === 0,
      orphan.length ? orphan.join(', ') : 'clean');
    RES.stats.iso.broken = broken.length;
    RES.stats.iso.orphan = orphan.length;
  })();

  /* ---------------- ISO5 弹窗死锁（穷光蛋 + 全属性极低） ---------------- */
  (function () {
    function extremeCfg(age, job, love) {
      return {
        age: age, edu: '初中', job: job, money: 0, sta: 0, mood: 0, attr: 0,
        love: love, housing: 'home', month: 6, tier: '普通', insurance: false,
        teenLove: false, exam: false, posYears: 0, jobCooldown: 0,
        childrenMode: 0, offset: 0, lastMarry: 0, loveVal: 0
      };
    }
    var ages = [18, 25, 40, 65];
    var jobs = ['无业', '外卖骑手', '普通程序员'];
    var loves = ['single', 'married'];
    var states = [];
    for (var a = 0; a < ages.length; a++)
      for (var b = 0; b < jobs.length; b++)
        for (var c = 0; c < loves.length; c++)
          states.push(extremeCfg(ages[a], jobs[b], loves[c]));

    var dead = [];
    var eligibleHits = 0;
    for (var s = 0; s < states.length; s++) {
      makeState(states[s]);
      for (var e = 0; e < EV.length; e++) {
        var ev = EV[e];
        if (!ev.options || !ev.options.length) continue;
        if (RJS.checkRequires(ev).length !== 0) continue;   // 事件本身不该出现
        eligibleHits++;
        var anyFree = false;
        for (var o = 0; o < ev.options.length; o++) {
          if (RJS.checkRequires(ev.options[o]).length === 0) { anyFree = true; break; }
        }
        if (!anyFree) dead.push(ev.id + '@age' + states[s].age + ':' + states[s].job + ':' + states[s].love);
      }
    }
    // 去重（同一个事件在多种极端态下都可能死锁）
    var uniq = {};
    for (var d = 0; d < dead.length; d++) uniq[dead[d].split('@')[0]] = true;
    var deadIds = Object.keys(uniq);
    ok('ISO5a 穷光蛋+低属性下，所有可触发事件都至少有一个可点选项（无弹窗死锁）',
      deadIds.length === 0,
      deadIds.length ? deadIds.slice(0, 12).join(', ') : 'clean');
    RES.stats.iso.deadlock = deadIds.length;
    RES.stats.iso.deadlockScanned = eligibleHits;
    if (deadIds.length) RES.stats.iso.deadlockList = deadIds;
  })();

  /* ---------------- ISO6 状态漂移（读档一致性 / sanitize 白名单） ---------------- */
  (function () {
    var SAVE_KEY = 'renjian-siji-save-v1';
    // 构造一个「复杂状态」：已婚、有娃、生病、在职 + 尽可能多的字段
    restoreComplex();
    var s = S();
    s.y = 2026; s.m = 7; s.d = 12; s.age = 34;
    s.edu = '本科'; s.job = '大厂程序员'; s.salary = 24000;
    s.int = 220; s.sta = 28; s.cha = 66; s.will = 77; s.eq = 88; s.luck = 55;
    s.money = 234567; s.mood = 42; s.housing = 'rent';
    s.married = true; s.spouse = '林知'; s.partnerName = '林知'; s.inLove = true;
    s.loveState = 'married'; s.love = 61; s.moodMax = 115; s.marriedAt = 400;
    s.kids = 2; s.divorceCount = 1; s.coldMonths = 1; s.familyCost = 3450;
    s.dink = false; s.lostChild = 0; s.supportIncome = 1500;
    s.children = [
      { id: 'c1', name: '小禾', sex: '男', bornAt: 340, birth: '顺产', int: 90, sta: 60, cha: 55, luck: 50, edu: '小学', invest: '重点', relation: 70, alive: true, support: 0, hasChild: false, lastGrow: 0 },
      { id: 'c2', name: '小满', sex: '女', bornAt: 120, birth: '顺产', int: 60, sta: 55, cha: 50, luck: 45, edu: '幼儿园', invest: '普通', relation: 65, alive: true, support: 0, hasChild: false, lastGrow: 0 }
    ];
    s.hadTeenLove = true; s.hasInsurance = true; s.hospitalCount = 2;
    s.severancePay = 12000; s.severanceLeft = 1; s.firstSalary = true;
    s.datingStart = 0; s.datingLove = 0; s.isSummerBreak = false;
    s.enteredCollegeMonth = 0; s.summerBreakEnd = 0;
    s.school = '实验中学'; s.schoolTier = '重点'; s.schoolBonus = 10;
    s.examLog = [{ stage: 'gaokao', score: 600 }];
    s.milestones = ['6', '12', '15', '18'];
    s.pendingExam = null;
    s.totalWorkYears = 9; s.currentPositionYears = 4; s.lastJobChangeMonth = 300;
    s.studyCarry = 0.5; s.hopCount = 2; s.deathStrikes = 0;
    s.triggeredEvents = ['E_LOST_WALLET', 'LV_MEET_PARENT'];
    s.usage = { study: { day: '2026-7-12' } };
    s.profile = { name: '张三丰', sex: '男' };
    s.ended = false; s.endingId = ''; s.endReason = '';
    s.talents = [{ id: 'T_HARDWORK', level: 2 }];
    s.logs = [{ k: 'sys', y: 2026, m: 7, d: 1, t: '复杂态日志', a: 34, e: '本科' }];
    s.at = 1234567890;

    var keysBefore = Object.keys(s).sort();

    // 走真实存档通路：btnSave → btnLoad → sanitize
    var btnSave = document.getElementById('btnSave');
    var btnLoad = document.getElementById('btnLoad');
    if (btnSave) btnSave.click();

    // 破坏内存态，确保读档真的从 localStorage 重建
    var fresh = RJS.state;
    Object.keys(fresh).forEach(function (k) { delete fresh[k]; });
    if (btnLoad) btnLoad.click();

    var after = S();
    var keysAfter = Object.keys(after);
    var missing = keysBefore.filter(function (k) { return keysAfter.indexOf(k) < 0; });

    // 白名单：这些字段在 sanitize 中会被有意重构/重置，不算「漂移」
    var allowlist = ['logs', 'usage', 'isStudent', 'pendingExam', 'school', 'schoolBonus', 'examLog', 'milestones', 'talents', 'at'];
    var realMissing = missing.filter(function (k) { return allowlist.indexOf(k) < 0; });

    ok('ISO6a 复杂状态（已婚/有娃/在职/住院）读档后关键字段无丢失',
      realMissing.length === 0,
      realMissing.length ? '丢失：' + realMissing.join(', ') : 'clean');
    ok('ISO6b 新增字段 inLove/partnerName 在读档后保留',
      after.inLove === true && after.partnerName === '林知',
      after.inLove + '/' + after.partnerName);
    ok('ISO6c 子女明细读档后完整（数量/名字/投入档）',
      Array.isArray(after.children) && after.children.length === 2
        && after.children[0].name === '小禾' && after.children[1].invest === '普通',
      'children=' + (after.children || []).length);
    ok('ISO6d 属性数值经 sanitize 夹取后仍在合法范围（不漂移成 NaN）',
      isFinite(after.money) && isFinite(after.sta) && isFinite(after.mood)
        && after.sta >= 0 && after.sta <= 100 && after.mood <= (after.moodMax || 100),
      'money=' + after.money + ' sta=' + after.sta + ' mood=' + after.mood);

    RES.stats.iso.missingFields = realMissing;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}

    function restoreComplex() {
      var src = BACKUP;
      var st = S();
      Object.keys(st).forEach(function (k) { delete st[k]; });
      Object.keys(src).forEach(function (k) { st[k] = src[k]; });
    }
  })();

  /* ---------------- ISO7 环状死循环（nextEventId 图） ---------------- */
  (function () {
    var color = {}, cycles = [];
    function dfs(id, stack) {
      if (color[id] === 1) { cycles.push(stack.concat(id).join('\u2192')); return; }
      if (color[id] === 2) return;
      color[id] = 1;
      var ev = ids[id];
      if (ev && ev.options) {
        for (var i = 0; i < ev.options.length; i++) {
          var nx = ev.options[i].nextEventId;
          if (nx && ids[nx]) dfs(nx, stack.concat(id));
        }
      }
      color[id] = 2;
    }
    for (var key in ids) if (Object.prototype.hasOwnProperty.call(ids, key) && color[key] !== 2) dfs(key, []);
    ok('ISO7a nextEventId 网络无环（无 A→B→A 死循环）', cycles.length === 0,
      cycles.length ? cycles.slice(0, 5).join(' / ') : 'acyclic');
    RES.stats.iso.cycles = cycles.length;
    if (cycles.length) RES.stats.iso.cycleList = cycles.slice(0, 10);
  })();

  // 复位
  (function () {
    var s = S();
    Object.keys(s).forEach(function (x) { delete s[x]; });
    Object.keys(BACKUP).forEach(function (x) { s[x] = BACKUP[x]; });
    try { RJS.render(); } catch (err) {}
  })();

    var pre = document.createElement('pre');
    pre.id = 'isotout';
    pre.textContent = '##ISO##' + JSON.stringify(RES) + '##END##';
    document.body.appendChild(pre);
  })();
})();
