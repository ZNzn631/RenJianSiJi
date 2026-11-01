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

  var MOVE_CITY_ORDER = ['beijing', 'chengdu', 'changsha', 'hegang', 'county', 'normal'];   // 与 E_MOVE_DEST 选项顺序一致
  function cityMeta(id) {
    var arr = window.citiesData || [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return { id: id, salaryFactor: 1, livingFactor: 1, houseFactor: 1, moodBonus: 0 };
  }
  function chooseRandom() {
    var ev = RJS.simPendingEvent();
    if (!ev) return;
    var free = [];
    for (var i = 0; i < ev.options.length; i++) if (RJS.checkRequires(ev.options[i]).length === 0) free.push(i);
    if (!free.length) { RJS.simChoose(0); return; }
    var s = S();
    // v3.31.1：搬家选城市 —— 按人设与状态理性选择，避免「永远选第一个=北京」的虹吸
    if (ev.id === 'E_MOVE_DEST') {
      var cBest = free[0], cBestScore = -Infinity;
      for (var ci = 0; ci < free.length; ci++) {
        var cityId = MOVE_CITY_ORDER[free[ci]] || 'normal';
        var meta = cityMeta(cityId);
        var lf = meta.livingFactor || 1, sf = meta.salaryFactor || 1, mb = meta.moodBonus || 0;
        var score = 0;
        if (PERSONA === 'layabout') {
          score = (1 - lf) * 100 + mb * 4 + Math.random() * 30;   // 躺平：去最低成本（鹤岗/县城），随机分散
        } else if (PERSONA === 'worker' && (s.sta < 40 || s.mood < 30)) {
          score = sf * 40 - lf * 15 + mb + Math.random() * 10;   // 打工人撑不住：逃离到工资不暴跌+成本降的城市（长沙/成都）
        } else {
          score = sf * 12 + mb;   // striver 与状态好的 worker 追工资
        }
        if (score > cBestScore) { cBestScore = score; cBest = free[ci]; }
      }
      RJS.simChoose(cBest);
      return;
    }
    // 10% 作死：偏要挑最「伤」的（硬扛疾病、冲动花大钱）
    if (Math.random() < 0.10) {
      var worst = free[0], worstScore = Infinity;
      for (var w = 0; w < free.length; w++) {
        var wfx = ev.options[free[w]].effects || {};
        var wSta = (typeof wfx.stamina === 'number') ? wfx.stamina : 0;
        var wMoney = (typeof wfx.money === 'number') ? wfx.money : 0;
        var wScore = wSta * 1000 + Math.max(-500, wMoney);
        if (wScore < worstScore) { worstScore = wScore; worst = free[w]; }
      }
      RJS.simChoose(worst);
      return;
    }
    // 理性选择：① 优先回血；② 避开「单次扣款 > 现有现金一半」的冲动消费
    var best = free[0], bestScore = -Infinity;
    for (var j = 0; j < free.length; j++) {
      var fx = ev.options[free[j]].effects || {};
      var dSta = (typeof fx.stamina === 'number') ? fx.stamina : 0;
      var dMoney = (typeof fx.money === 'number') ? fx.money : 0;
      if (dMoney < 0 && Math.abs(dMoney) > s.money * 0.5 && PERSONA !== 'striver') continue;   // 打工人/躺平不买掏空自己的大件；做题家敢买房
      var score = dSta * 1000 + Math.max(-500, dMoney);
      if (score > bestScore) { bestScore = score; best = free[j]; }
    }
    RJS.simChoose(best);
  }
  function randomAction(sabotage) {
    var EXCLUDE = sabotage ? { moveCity: 1, skipMonth: 1 } : { resign: 1, buyStock: 1, moveCity: 1, skipMonth: 1, propose: 1 };
    for (var k = 0; k < 40; k++) {
      var id = ACTS[Math.floor(Math.random() * ACTS.length)];
      if (EXCLUDE[id]) continue;
      var act = RJS.actions.filter(function (a) { return a.id === id; })[0];
      if (act && RJS.checkRequires(act).length === 0) return id;
    }
    return 'rest';
  }
  function firstOk(order) {
    for (var i = 0; i < order.length; i++) {
      var a = RJS.actions.filter(function (x) { return x.id === order[i]; })[0];
      if (a && RJS.checkRequires(a).length === 0) return order[i];
    }
    return null;
  }
  // v3.27：分层 Agent —— 模拟「社会的参差」。
  //   35% 内卷做题家：读书考大学 → 程序员 → 晋升 → 高收入
  //   35% 普通打工人：不卷学历 → 文员/骑手 → 精打细算
  //   30% 随性躺平者：长期零工 → 心情高但抗风险差
  // 之上叠加 10% 的随机「作死」（硬扛疾病 / 冲动投资 / 裸辞）。
  var PERSONA = 'worker';
  function assignPersona() {
    var r = Math.random();
    if (r < 0.35) return 'striver';
    if (r < 0.70) return 'worker';
    return 'layabout';
  }
  function shouldMove(s) {
    if (s.age < 22 || s.money < 6000) return false;
    if (PERSONA === 'striver') return s.city !== 'beijing';                          // 做题家：追北京
    if (PERSONA === 'worker') {
      if (s.city === 'beijing') return (s.sta < 30 || s.mood < 20);   // 北京极端撑不住才逃（先休息恢复，别轻易逃离）
      return s.age < 30 && s.sta >= 60 && s.mood >= 50;   // 年轻时状态好 → 进京打工追工资
    }
    if (PERSONA === 'layabout') return (s.city === 'beijing' || s.city === 'normal') && (s.sta < 40 || s.mood < 30);   // 躺平者：大城市撑不住才逃
    return false;
  }
  function smartAction() {
    var s = S();
    if (Math.random() < 0.10) return randomAction(true);   // 随机作死：跳过理性决策
    if (shouldMove(s)) return 'moveCity';                   // v3.31.1：状态驱动的搬家决策（逃离北上广）

    if (s.mood < 12) return 'rest';

    if (PERSONA === 'striver') {
      if (!s.salary) {
        if (s.age < 18 || (s.isStudent && s.age < 22)) return 'study';
        if (s.sta < 50) return 'rest';
        if (s.age >= 22) {
          var j = firstOk(['coder', 'coderRegular', 'clerk', 'jobTeacher', 'jobRider']);
          if (j) return j;
        }
        return firstOk(['oddjob']) || 'rest';
      }
      if (s.sta < 40) return 'rest';
      if (firstOk(['promote'])) return 'promote';
      if (s.int < 220) return 'study';
      if (s.sta < 70) return 'train';
      return randomAction();
    }

    if (PERSONA === 'worker') {
      if (!s.salary) {
        if (s.age < 18) return 'rest';                        // 不卷学历
        if (s.sta < 50) return 'rest';
        if (s.age >= 22) {
          var j = firstOk(['clerk', 'jobTeacher', 'jobRider', 'coderRegular']);
          if (j) return j;
        }
        return firstOk(['oddjob']) || 'rest';
      }
      if (s.sta < 40) return 'rest';
      if (s.money < 30000) return 'work';                     // 精打细算
      if (s.sta < 70) return 'train';
      return randomAction();
    }

    // layabout：心情优先，长期零工，偶尔接骑手活
    if (s.mood < 25) return 'rest';
    if (s.sta < 20) return 'rest';
    if (s.age >= 20 && s.sta >= 50 && Math.random() < 0.2) {
      var j = firstOk(['jobRider']);
      if (j) return j;
    }
    return firstOk(['oddjob']) || 'rest';
  }

  var MARK_AGES = [16, 18, 22, 25, 30, 35, 40, 50, 60, 70, 80];

  // v3.24：城市系统 —— 每局从 citiesData 均匀抽一个出生城市，供平衡模拟按城市分组
  var CITY_IDS = (window.citiesData || []).map(function (c) { return c.id; });
  if (!CITY_IDS.length) CITY_IDS = ['normal'];
  function pickCity() { return CITY_IDS[Math.floor(Math.random() * CITY_IDS.length)]; }

  function life(opts) {
    opts = opts || {};
    REAL_RESET.click();
    var s = S();
    s.city = pickCity();                     // v3.24：本局出生城市（在结算前指定，系数随之生效）
    PERSONA = assignPersona();               // v3.27：本局社会阶层人设
    if (opts.setup) opts.setup(s);
    var steps = 0, negMonths = 0, lastMonth = -1, marks = {};
    while (!s.ended && steps < 26000) {
      if (RJS.simPendingEvent()) { chooseRandom(); steps++; continue; }
      if (s.pendingExam) { RJS.simSettleExam(); steps++; continue; }
      var id = smartAction();                 // v3.25：所有平衡模拟统一用理性 Agent
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
      city: s.city || 'normal',          // v3.24：记录本局城市，供按城市分组
      persona: PERSONA,                   // v3.27：记录本局阶层，供按阶层分组
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
