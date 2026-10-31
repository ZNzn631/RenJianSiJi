(function () {
  window.confirm = function () { return true; };
  // v3.16.1：模拟开关——render / 属性飘字 / 音效全部空转，只跑数值。
  // 放在最前面，保证任何一次 doAction 之前就已生效。
  window.IS_SIMULATION = true;
  if (typeof performance === 'object' && performance.now) { /* 计时用，保持原样 */ }

  /* ---------- 渲染打桩：让 doAction 的 DOM 开销归零（不改任何游戏逻辑） ---------- */
  function fakeEl() {
    return {
      hidden: false, textContent: '', innerHTML: '', value: '',
      style: {}, dataset: {}, children: [], scrollTop: 0, scrollHeight: 0, clientHeight: 0,
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      setAttribute: function () {}, removeAttribute: function () {}, getAttribute: function () { return null; },
      appendChild: function () {}, removeChild: function () {}, addEventListener: function () {},
      querySelectorAll: function () { return []; }, querySelector: function () { return null; },
      getBoundingClientRect: function () { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
      firstChild: null, lastChild: null
    };
  }
  var SHARED = fakeEl();
  var REAL_RESET = document.getElementById('btnReset');
  document.getElementById = function () { return SHARED; };

  var S = function () { return RJS.state; };
  var ACTS = RJS.actions.map(function (a) { return a.id; });
  var OUT = { random: [], smart: [], parent: [], parentLow: [] };

  function chooseRandom() {
    var ev = RJS.simPendingEvent();
    if (!ev) return;
    var free = [];
    for (var i = 0; i < ev.options.length; i++) if (RJS.checkRequires(ev.options[i]).length === 0) free.push(i);
    RJS.simChoose(free.length ? free[Math.floor(Math.random() * free.length)] : 0);
  }
  function randomAction() {
    for (var k = 0; k < 40; k++) {
      var id = ACTS[Math.floor(Math.random() * ACTS.length)];
      var act = RJS.actions.filter(function (a) { return a.id === id; })[0];
      if (act && RJS.checkRequires(act).length === 0) return id;
    }
    return null;
  }
  function smartAction() {
    var s = S();
    if (s.sta < 30 || s.mood < 20) return 'rest';
    if (!s.salary && s.age >= 18) {
      var c = RJS.actions.filter(function (a) { return a.id === 'clerk'; })[0];
      if (c && RJS.checkRequires(c).length === 0) return 'clerk';
    }
    if (s.salary && s.money < 30000) {
      var w = RJS.actions.filter(function (a) { return a.id === 'work'; })[0];
      if (w && RJS.checkRequires(w).length === 0) return 'work';
    }
    return randomAction();
  }

  var MARK_AGES = [16, 18, 22, 25, 30, 35, 40, 50, 60, 70, 80];

  function life(opts) {
    opts = opts || {};
    REAL_RESET.click();
    var s = S();
    if (opts.setup) opts.setup(s);
    var steps = 0, negMonths = 0, lastMonth = -1, marks = {};
    while (!s.ended && steps < 26000) {
      if (RJS.simPendingEvent()) { chooseRandom(); steps++; continue; }
      if (s.pendingExam) { RJS.simSettleExam(); steps++; continue; }
      var id = opts.smart ? smartAction() : randomAction();
      if (!id) { steps++; continue; }
      s.logs.length = 0;
      RJS.doAction(id);
      steps++;
      var mk = s.y * 12 + s.m;
      if (mk !== lastMonth) {
        lastMonth = mk;
        if (s.money < 0) negMonths++;
        for (var i = 0; i < MARK_AGES.length; i++) {
          if (s.age === MARK_AGES[i] && marks[MARK_AGES[i]] === undefined) marks[MARK_AGES[i]] = Math.round(s.money);
        }
      }
    }
    s.logs.length = 0;                       // 每局结束清一次日志，防止文本内存跨局累积
    window.IS_SIMULATION = true;             // 兜底：万一 reset 之后被人改过
    return {
      ending: s.endingId || 'ALIVE80+', age: s.age, money: Math.round(s.money),
      negMonths: negMonths, married: s.married, kids: s.kids, edu: s.edu, tier: s.schoolTier, school: s.school,
      marks: marks, steps: steps
    };
  }

  // 局数可由外部注入（check_balance.js 用 --quick 跑 150 局做快速预检）
  var N_RANDOM = (typeof window.__SIM_N_RANDOM__ === 'number') ? window.__SIM_N_RANDOM__ : 500;
  var N_SMART = (typeof window.__SIM_N_SMART__ === 'number') ? window.__SIM_N_SMART__ : 60;
  var N_PARENT = (typeof window.__SIM_N_PARENT__ === 'number') ? window.__SIM_N_PARENT__ : 40;
  var N_PARENT_LOW = (typeof window.__SIM_N_PARENT_LOW__ === 'number') ? window.__SIM_N_PARENT_LOW__ : 30;
  var t0 = performance.now();
  for (var i = 0; i < N_RANDOM; i++) OUT.random.push(life({}));
  for (var j = 0; j < N_SMART; j++) OUT.smart.push(life({ smart: true }));
  for (var k = 0; k < N_PARENT; k++) OUT.parent.push(life({
    setup: function (s) {
      var now = s.y * 12 + s.m;
      s.age = 30; s.edu = '本科'; s.job = '部门主管'; s.salary = 8000;
      s.money = 50000; s.int = 110; s.sta = 70; s.mood = 70;
      s.married = true; s.spouse = '林晓'; s.love = 65; s.moodMax = 115;
      s.children = [
        { id: 'a', name: '大宝', sex: '女', bornAt: now - 36, birth: '顺产', int: 60, sta: 65, cha: 55, luck: 50, edu: '幼儿园', invest: '普通', relation: 60, alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: now },
        { id: 'b', name: '二宝', sex: '男', bornAt: now - 6, birth: '顺产', int: 55, sta: 65, cha: 50, luck: 45, edu: '婴幼儿', invest: '普通', relation: 60, alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: now }
      ];
      s.kids = 2; s.logs = [];
    }
  }));
  for (var m = 0; m < N_PARENT_LOW; m++) OUT.parentLow.push(life({
    setup: function (s) {
      var now = s.y * 12 + s.m;
      s.age = 30; s.edu = '本科'; s.job = '普通文员'; s.salary = 3000;
      s.money = 30000; s.int = 90; s.sta = 70; s.mood = 70;
      s.married = true; s.spouse = '林晓'; s.love = 65; s.moodMax = 115;
      s.children = [
        { id: 'a', name: '大宝', sex: '女', bornAt: now - 36, birth: '顺产', int: 60, sta: 65, cha: 55, luck: 50, edu: '幼儿园', invest: '普通', relation: 60, alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: now },
        { id: 'b', name: '二宝', sex: '男', bornAt: now - 6, birth: '顺产', int: 55, sta: 65, cha: 50, luck: 45, edu: '婴幼儿', invest: '普通', relation: 60, alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: now }
      ];
      s.kids = 2; s.logs = [];
    }
  }));

  var pre = document.createElement('pre');
  pre.textContent = '##SIM##' + JSON.stringify({ ms: Math.round(performance.now() - t0), data: OUT }) + '##END##';
  document.body.appendChild(pre);
})();
