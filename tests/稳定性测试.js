(function () {
  var RES = { groups: [], errors: [], bounds: [], notes: [] };
  var R = RES.groups;
  function ok(name, cond, info) { R.push({ n: name, p: !!cond, i: info === undefined ? '' : String(info) }); }
  window.addEventListener('error', function (e) { RES.errors.push('onerror: ' + e.message + ' @' + e.lineno); });
  window.addEventListener('unhandledrejection', function (e) { RES.errors.push('reject: ' + e.reason); });
  console.error = function () { RES.errors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); };
  console.warn = function () { RES.errors.push('console.warn: ' + Array.prototype.join.call(arguments, ' ')); };
  window.confirm = function () { return true; };

  var SAVE_KEY = 'renjian-siji-save-v1';
  var DEX_KEY = 'renjian-siji-endings-v1';
  function $(id) { return document.getElementById(id); }
  function S() { return RJS.state; }
  var PRISTINE = JSON.parse(JSON.stringify(RJS.state));
  PRISTINE.talents = [];   // 隔离随机天赋（含负面），避免属性断言受随机抽卡影响

  function restore(src) {
    // 引擎没暴露清理接口：有残留事件/未结算考核时，用「重新开始」把 pendingEvent/examOpen 清干净
    if (RJS.getPendingEvent() || ($('examMask') && !$('examMask').hidden)) {
      if ($('examMask') && !$('examMask').hidden) { $('btnExamGo').click(); $('btnExamGo').click(); }
      if (RJS.getPendingEvent()) $('btnReset').click();
    }
    var s = RJS.state;
    var c = JSON.parse(JSON.stringify(src || PRISTINE));
    Object.keys(s).forEach(function (k) { delete s[k]; });
    Object.keys(c).forEach(function (k) { s[k] = c[k]; });
    if ($('eventMask')) $('eventMask').hidden = true;
    if ($('examMask')) $('examMask').hidden = true;
    if ($('endMask')) $('endMask').hidden = true;
  }
  function bounds(tag) {
    var s = S(), b = [];
    if (!isFinite(s.sta) || s.sta < 0 || s.sta > 100) b.push('sta=' + s.sta);
    var mcap = (typeof s.moodMax === 'number' && s.moodMax > 0) ? s.moodMax : 100;
    if (!isFinite(s.mood) || s.mood < 0 || s.mood > mcap) b.push('mood=' + s.mood + '/' + mcap);
    ['int', 'cha', 'will', 'eq', 'luck'].forEach(function (k) {
      if (!isFinite(s[k]) || s[k] < 0 || s[k] > 500) b.push(k + '=' + s[k]);
    });
    if (!isFinite(s.money)) b.push('money=' + s.money);
    if (!isFinite(s.age) || s.age < 0 || s.age > 150) b.push('age=' + s.age);
    if (b.length && RES.bounds.indexOf(tag + ': ' + b.join(',')) === -1) RES.bounds.push(tag + ': ' + b.join(','));
    return b.length === 0;
  }
  function dateOk() {
    var s = S();
    var dim = new Date(s.y, s.m, 0).getDate();
    return s.m >= 1 && s.m <= 12 && s.d >= 1 && s.d <= dim && isFinite(s.y);
  }
  function clickFreeOption(random) {
    var btns = document.querySelectorAll('#eventOptions .event-opt'), free = [];
    for (var i = 0; i < btns.length; i++) {
      if (!btns[i].classList.contains('is-locked')) free.push(btns[i]);
    }
    if (!free.length) return false;
    free[random ? Math.floor(Math.random() * free.length) : 0].click();
    return true;
  }
  function monthEnd() { S().d = new Date(S().y, S().m, 0).getDate(); }

  /* ================= A. 长跑：4 条人生 × 700 天，随机行动 ================= */
  (function longRun() {
    var acts = RJS.actions.map(function (a) { return a.id; });
    var runs = [];
    for (var r = 0; r < 4; r++) {
      restore(PRISTINE);
      var days = 0, fired = {}, badDate = 0, stuck = 0, lastAge = S().age, overLog = 0, blocked = 0, examCount = 0;
      while (days < 700 && !S().ended) {
        if (!$('examMask').hidden) { examCount++; $('btnExamGo').click(); $('btnExamGo').click(); days++; continue; }
        if (!$('eventMask').hidden) {
          if (!clickFreeOption(r % 2 === 1)) { stuck++; $('eventMask').hidden = true; }
          continue;
        }
        // 打乱行动顺序，取第一个满足条件的（避免随机漏采）
        var order = acts.slice().sort(function () { return Math.random() - 0.5; });
        var pick = null;
        for (var i = 0; i < order.length; i++) {
          var act = RJS.actions.filter(function (x) { return x.id === order[i]; })[0];
          if (act && RJS.checkRequires(act).length === 0) { pick = act; break; }
        }
        if (!pick) { stuck++; break; }
        var ret = RJS.doAction(pick.id);
        if (ret === false) { blocked++; if (blocked > 30) { stuck++; break; } continue; }
        blocked = 0;
        days++;
        if (!dateOk()) badDate++;
        bounds('长跑#' + r);
        if (S().age < lastAge) badDate++;
        lastAge = Math.max(lastAge, S().age);
        if (S().logs.length > 400) overLog++;
      }
      while (!$('eventMask').hidden) { if (!clickFreeOption()) { $('eventMask').hidden = true; break; } }
      if (!$('examMask').hidden) { $('btnExamGo').click(); $('btnExamGo').click(); }
      $('btnSave').click();
      var saveLen = 0;
      try { saveLen = (localStorage.getItem(SAVE_KEY) || '').length; } catch (e) {}
      runs.push({
        days: days, age: S().age, ended: S().ended, ending: S().endingId || '-',
        ev: Object.keys(fired).length, badDate: badDate, stuck: stuck, exam: examCount,
        saveKB: Math.round(saveLen / 1024), overLog: overLog,
        stats: [S().int, S().sta, S().cha, S().will, S().eq, S().luck, S().money, S().mood].join('/')
      });
    }
    ok('A1 四条人生跑满 700 天，无断流', runs.every(function (x) { return x.days >= 700 || x.ended; }), JSON.stringify(runs));
    ok('A2 日期始终合法', runs.every(function (x) { return x.badDate === 0; }), runs.map(function (x) { return x.badDate; }).join(','));
    ok('A3 八项属性从未越界', RES.bounds.length === 0, RES.bounds.slice(0, 4).join(' | '));
    ok('A4 日志长度不超过 400', runs.every(function (x) { return x.overLog === 0; }), '');
    ok('A5 存档体积 < 300KB', runs.every(function (x) { return x.saveKB < 300; }), runs.map(function (x) { return x.saveKB + 'KB'; }).join(','));
    ok('A6 长跑中出现过升学考核', runs.some(function (x) { return x.exam > 0; }), runs.map(function (x) { return x.exam; }).join(','));
    RES.notes.push('长跑: ' + JSON.stringify(runs));
  })();

  /* ================= B. 全部事件 × 全部选项 ================= */
  function sweep(tag, setup) {
    var lockedTotal = 0, allLocked = [], errs = [], hops = 0;
    RJS.events.forEach(function (ev) {
      restore(PRISTINE);
      if (setup) setup();
      $('eventMask').hidden = true;
      try { RJS.openEventById(ev.id); } catch (e) { errs.push(ev.id + ' open: ' + e.message); return; }
      if ($('eventMask').hidden) { errs.push(ev.id + ' 未打开'); return; }
      var guard = 0;
      while (!$('eventMask').hidden && guard++ < 6) {
        var btns = document.querySelectorAll('#eventOptions .event-opt'), free = [];
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].classList.contains('is-locked')) lockedTotal++;
          else free.push(btns[i]);
        }
        if (!free.length) { allLocked.push(ev.id); $('eventMask').hidden = true; break; }
        try { free[0].click(); } catch (e) { errs.push(ev.id + ' click: ' + e.message); break; }
        hops++;
        bounds(tag + '/' + ev.id);
      }
    });
    return { locked: lockedTotal, allLocked: allLocked, errs: errs, hops: hops };
  }
  var s1 = sweep('基础态');
  ok('B1 基础态：76 条事件全部能打开并结算', s1.errs.length === 0, s1.errs.slice(0, 4).join(' | '));
  ok('B2 基础态：没有「全选项不可点」的死锁事件', s1.allLocked.length === 0, s1.allLocked.join(','));

  var rich = function () {
    var s = S();
    s.age = 30; s.edu = '本科'; s.job = '部门经理'; s.salary = 15000;
    s.int = 300; s.sta = 80; s.cha = 300; s.will = 300; s.eq = 300; s.luck = 300;
    s.money = 9000000; s.mood = 60; s.totalWorkYears = 8; s.currentPositionYears = 3;
    s.ended = false; s.endingId = '';
  };
  var s2 = sweep('富裕态', rich);
  ok('B3 富裕态：全部事件可打开并结算', s2.errs.length === 0, s2.errs.slice(0, 4).join(' | '));
  ok('B4 富裕态：所有选项均可点（无死锁）', s2.allLocked.length === 0 && s2.locked === 0, 'locked=' + s2.locked + ' allLocked=' + s2.allLocked.join(','));
  ok('B5 链式跳转正常（结算次数 > 事件数）', s1.hops >= 76, s1.hops);
  (function branchSweep() {
    var clicks = 0, errs = [];
    RJS.events.forEach(function (ev) {
      for (var idx = 0; idx < ev.options.length; idx++) {
        restore(PRISTINE); rich(); $('eventMask').hidden = true;
        try {
          RJS.openEventById(ev.id);
          var btns = document.querySelectorAll('#eventOptions .event-opt');
          if (!btns[idx] || btns[idx].classList.contains('is-locked')) continue;
          btns[idx].click();
          clicks++;
          bounds('分支/' + ev.id + '#' + idx);
        } catch (e) { errs.push(ev.id + '#' + idx + ': ' + e.message); }
      }
    });
    ok('B6 每一个选项分支都能单独结算', errs.length === 0, 'clicks=' + clicks + ' errs=' + errs.slice(0, 3).join(' | '));
    ok('B7 分支数覆盖全部 348 个选项', clicks === 348, clicks);
  })();
  RES.notes.push('置灰选项：基础态 ' + s1.locked + ' / 富裕态 ' + s2.locked + '；总跳转 ' + (s1.hops + s2.hops));

  /* ================= B8. 新增【社交】行动 ================= */
  (function social() {
    var act = RJS.actions.filter(function (a) { return a.id === 'social'; })[0];
    ok('B8 社交行动已注册（共 ' + RJS.actions.length + ' 个行动）', !!act && RJS.actions.length === 20,
      act ? 'costDays=' + act.costDays : '缺 social');
    if (!act) return;
    restore(PRISTINE);
    S().d = 10;                                     // 固定非月末，避免跨月结算干扰
    var before = { eq: S().eq, cha: S().cha, mood: S().mood, money: S().money };
    var ret = RJS.doAction('social');
    ok('B9 社交结算：情商/魅力/心情上升、金钱下降、推进 1 天',
      ret === true && S().eq >= before.eq + 2 && S().cha >= before.cha + 2 &&
      S().mood >= Math.min(100, before.mood + 5) && S().money <= before.money - 10,
      'ret=' + ret + ' eq+' + (S().eq - before.eq) + ' cha+' + (S().cha - before.cha) +
      ' mood+' + (S().mood - before.mood) + ' money' + (S().money - before.money));
    restore(PRISTINE); S().age = 11;
    ok('B10 11 岁时社交被门槛拦住', RJS.checkRequires(act).length > 0, '');
    restore(PRISTINE); S().age = 12;
    ok('B11 12 岁解锁社交', RJS.checkRequires(act).length === 0, '');
    restore(PRISTINE); S().age = 17; S().edu = '高中'; S().eq = 35;
    ok('B12 学生会竞选门槛已降到情商 35', RJS.eligibleEvents().indexOf('E_CAMPUS_COUNCIL') > -1, '');
    restore(PRISTINE);
  })();

  /* ================= C. 边界与生存闭环 ================= */
  restore(PRISTINE); S().sta = 100;
  RJS.doAction('rest');
  ok('C1 满体质休息不溢出', S().sta <= 100, S().sta);

  restore(PRISTINE); S().int = 500; S().mood = 100;
  RJS.doAction('study');
  ok('C2 智力封顶 500，心情封顶 100', S().int <= 500 && S().mood <= 100, S().int + '/' + S().mood);

  // C3 负债跨月：v3.3 改为扣心情，体质不掉
  restore(PRISTINE); S().money = -5000; S().job = '无业'; S().salary = 0;
  S().age = 30; S().mood = 70; S().sta = 60;
  monthEnd();
  var moodB = S().mood, staB = S().sta;
  RJS.doAction('study');
  ok('C3 负债跨月扣心情且不掉体质',
    S().mood < moodB && S().sta === staB && S().logs.some(function (l) { return l.k === 'danger' || l.k === 'warn'; }),
    'mood ' + moodB + '→' + S().mood + ' sta ' + staB + '→' + S().sta);

  // C3b 裁员失业金：3 个月，每月原月薪 50%
  restore(PRISTINE);
  var lay = S();
  lay.age = 35; lay.job = '部门主管'; lay.salary = 10000; lay.mood = 10; lay.money = 20000;
  lay.d = new Date(lay.y, lay.m, 0).getDate();
  RJS.setLayoffRoll(function () { return 0; });     // 必被裁
  RJS.doAction('rest');
  ok('C3b 被裁后拿到失业金（月薪 50%，当月先发一期）',
    S().salary === 0 && S().severancePay === 5000 && S().severanceLeft === 2,
    'salary=' + S().salary + ' pay=' + S().severancePay + ' left=' + S().severanceLeft);
  var beforeSev = S().money;
  S().d = new Date(S().y, S().m, 0).getDate();
  RJS.doAction('study');
  ok('C3c 失业金按月发放并递减', S().severanceLeft === 1 && S().logs.some(function (l) { return l.t.indexOf('失业金') > -1; }),
    'left=' + S().severanceLeft + ' money ' + beforeSev + '→' + S().money);
  RJS.setLayoffRoll(null);
  restore(PRISTINE);

  // C4 体质归零有钱住院：回 30 体 / 扣费 / 危险计数清零
  restore(PRISTINE); S().sta = 0; S().money = 5000; S().hospitalCount = 1; S().age = 30;
  monthEnd();
  var m0 = S().money;
  RJS.doAction('study');
  ok('C4 有钱住院（回 30 体 / 扣费 / 危险计数清零）', S().sta === 30 && S().money < m0 && S().hospitalCount === 0,
    'money ' + m0 + '→' + S().money + ' sta=' + S().sta + ' 危险住院' + S().hospitalCount + ' 次');

  // C5 累计负债住院达到阈值 → 猝死（英年早逝）
  restore(PRISTINE); S().sta = 0; S().money = 0; S().hospitalCount = 5; S().age = 30;
  monthEnd();
  RJS.doAction('study');
  ok('C5 累计负债住院达阈值猝死', S().ended === true && S().endReason === 'health',
    'ended=' + S().ended + ' reason=' + S().endReason + ' 危险住院' + S().hospitalCount + ' 次');

  // C6 第一次负债住院不猝死
  restore(PRISTINE); S().sta = 0; S().money = 0; S().hospitalCount = 0; S().age = 30;
  monthEnd();
  RJS.doAction('study');
  ok('C6 第一次负债住院不猝死（回 30 体 / 计 1 次）', S().ended === false && S().sta === 30 && S().hospitalCount === 1,
    'ended=' + S().ended + ' sta=' + S().sta + ' 危险住院' + S().hospitalCount + ' 次');

  restore(PRISTINE); S().money = 1e9; S().salary = 60000; S().job = '架构师'; S().totalWorkYears = 9;
  RJS.doAction('rest');
  ok('C7 巨款下跨月不崩、数值有限', isFinite(S().money) && S().money > 0, S().money);

  /* ================= D. 高考：排队 / 750 制 / 冻结 / 复读 / 寿终 ================= */
  restore(PRISTINE);
  var st = S();
  st.age = 17; st.y = 2026; st.m = 12; st.d = 31; st.edu = '高中';
  st.milestones = ['6', '12', '15']; st.pendingExam = null; st.examLog = [];
  st.int = 260; st.eq = 100; st.schoolTier = '重点';
  RJS.doAction('rest');                                  // 跨年 → 18 岁
  var monthlyPending = !$('eventMask').hidden;           // 跨年同月：可能先弹月度事件
  // 月度事件可能是多段链（如「催婚→相亲」），一路点完，考核才会补弹
  var chainGuard = 0;
  while (chainGuard++ < 10 && $('examMask').hidden && !$('eventMask').hidden) {
    if (!clickFreeOption()) { $('eventMask').hidden = true; break; }
  }
  ok('D1 18 岁跨年后高考窗弹出（如有月度事件则顺延到其后）', !$('examMask').hidden, 'monthlyFirst=' + monthlyPending + ' examHidden=' + $('examMask').hidden);
  ok('D2 pendingExam 已排队 gaokao', !!S().pendingExam && S().pendingExam.stage === 'gaokao', JSON.stringify(S().pendingExam));

  var y0 = S().y, m0b = S().m, d0 = S().d;
  var froze = RJS.doAction('rest');
  ok('D3 考试期间时间冻结', froze === false && S().y === y0 && S().m === m0b && S().d === d0, 'ret=' + froze + ' ' + [y0, m0b, d0] + '→' + [S().y, S().m, S().d]);

  $('btnExamGo').click();
  ok('D4 结算日志为 750 分制', S().logs.some(function (l) { return l.t.indexOf('满分 750') > -1; }), S().logs.slice(-1)[0].t);
  ok('D5 examLog 记录 gaokao', (S().examLog || []).some(function (x) { return x.stage === 'gaokao'; }), JSON.stringify(S().examLog).slice(0, 100));
  ok('D6 结算后 pendingExam 清空', S().pendingExam === null, JSON.stringify(S().pendingExam));
  $('btnExamGo').click();
  ok('D7 确定后关窗、时间恢复推进', $('examMask').hidden === true && RJS.doAction('rest') === true, 'hidden=' + $('examMask').hidden);

  var eduNow = S().edu;
  var gk = RJS.actions.filter(function (a) { return a.id === 'gaokao'; })[0];
  var gkOpen = RJS.checkRequires(gk).length === 0;
  ok('D8 复读按钮可用性与学历一致', (eduNow === '高中' || eduNow === '专科') ? gkOpen : !gkOpen, 'edu=' + eduNow + ' 可复读=' + gkOpen);

  // 80 岁寿终当天不排队高考
  restore(PRISTINE);
  var s79 = S();
  s79.age = 79; s79.y = 2026; s79.m = 12; s79.d = 31; s79.sta = 1; s79.mood = 40;
  s79.milestones = ['6', '12', '15', '18']; s79.pendingExam = null; s79.edu = '高中';
  RJS.doAction('rest');
  ok('D9 80 岁寿终时不排队高考', S().ended === true && !S().pendingExam, 'ended=' + S().ended + ' pending=' + JSON.stringify(S().pendingExam));

  /* ================= E. 存读档 ================= */
  restore(PRISTINE); S().money = 7777; S().int = 88;
  $('btnSave').click();
  var raw = localStorage.getItem(SAVE_KEY);
  ok('E1 存档写入成功', !!raw && raw.length > 100, (raw || '').length + ' 字符');
  S().money = 1; S().int = 1;
  $('btnLoad').click();
  ok('E2 读档还原数值', S().money === 7777 && S().int === 88, S().money + '/' + S().int);

  localStorage.setItem(SAVE_KEY, JSON.stringify({
    app: 'renjian-siji', v: 1, at: Date.now(),
    state: { y: 2020, m: 5, d: 9, int: 120, sta: 60, money: 9000, mood: 50, age: 30, edu: '本科', job: '部门主管', workYears: 4, logs: [], usage: {} }
  }));
  $('btnLoad').click();
  var st2 = S();
  ok('E3 老档六维补 10', st2.cha === 10 && st2.eq === 10 && st2.will === 10 && st2.luck === 10, [st2.cha, st2.eq, st2.will, st2.luck].join(','));
  ok('E4 老档补抽 2 天赋', (st2.talents || []).length === 2, JSON.stringify(st2.talents));
  ok('E5 老档补学校档位', typeof st2.schoolTier === 'string' && typeof st2.schoolBonus === 'number', st2.schoolTier + '/' + st2.schoolBonus);
  ok('E6 workYears 迁移到双轨工龄', st2.totalWorkYears === 4 && st2.currentPositionYears === 4, st2.totalWorkYears + '/' + st2.currentPositionYears);
  ok('E7 按职业表补月薪 10000', st2.salary === 10000, st2.salary);
  ok('E8 成年老档不补考', (st2.milestones || []).indexOf('18') > -1, JSON.stringify(st2.milestones));

  var eBefore = RES.errors.length;
  localStorage.setItem(SAVE_KEY, '{oops');
  $('btnLoad').click();
  localStorage.setItem(SAVE_KEY, JSON.stringify({ app: 'renjian-siji', v: 2, state: {} }));
  $('btnLoad').click();
  localStorage.setItem(SAVE_KEY, JSON.stringify({ app: 'renjian-siji', v: 1, state: { y: 'x', m: 99, d: -5, int: 'NaN', money: 'abc', age: 999 } }));
  $('btnLoad').click();
  ok('E9 损坏档/版本不符/脏数据不崩', RES.errors.length === eBefore && isFinite(S().age) && S().age <= 150, 'age=' + S().age + ' err+' + (RES.errors.length - eBefore));

  restore(PRISTINE); S().age = 60; S().sta = 30; S().money = 2e6; S().edu = '本科';
  RJS.endLife('age');
  var endId = S().endingId;
  $('btnSave').click();
  restore(PRISTINE);
  $('btnLoad').click();
  ok('E10 已结束存档读回后结算面板重现', $('endMask').hidden === false && S().endingId === endId, 'ending=' + S().endingId + ' mask=' + $('endMask').hidden);

  // 存档里带 pendingExam：读档后考试窗自动补弹
  restore(PRISTINE);
  var pe = S();
  pe.pendingExam = { stage: 'gaokao' }; pe.age = 18; pe.edu = '高中';
  $('btnSave').click();
  restore(PRISTINE);
  $('btnLoad').click();
  ok('E11 存档里的 pendingExam 读回后自动补弹', $('examMask').hidden === false, 'hidden=' + $('examMask').hidden);
  $('btnExamGo').click(); $('btnExamGo').click();

  /* ================= F. 五种结局 + 图鉴持久化 ================= */
  function endingOf(mut) { restore(PRISTINE); var s = S(); mut(s); var r = RJS.pickEnding(); return r && r.id; }
  var e1 = endingOf(function (s) { s.hospitalCount = 6; });
  var e2 = endingOf(function (s) { s.money = -1; s.job = '无业'; s.salary = 0; s.sta = 40; s.deathStrikes = 0; });
  var e3 = endingOf(function (s) { s.money = 2000000; s.edu = '本科'; s.sta = 40; s.deathStrikes = 0; });
  var e4 = endingOf(function (s) { s.totalWorkYears = 31; s.money = 100; s.edu = '高中'; s.sta = 40; });
  var e5 = endingOf(function (s) { s.money = 100; s.edu = '高中'; s.totalWorkYears = 3; s.sta = 40; });
  ok('F1 五种结局按优先级命中', [e1, e2, e3, e4, e5].join(',') === 'E_DEATH_EARLY,E_BANKRUPT,E_RICH,E_LABOR,E_ORDINARY', [e1, e2, e3, e4, e5].join(','));

  try { localStorage.removeItem(DEX_KEY); } catch (e) {}
  restore(PRISTINE); S().age = 60; S().money = 2e6; S().edu = '本科';
  RJS.endLife('age');
  var dex1 = RJS.dex().length;
  ok('F2 结算写入图鉴', dex1 >= 1, dex1);
  $('btnReset').click();
  ok('F3 重新开始后图鉴保留、状态归零', RJS.dex().length === dex1 && S().age === 16, RJS.dex().length + ' / age=' + S().age);
  ok('F4 重置后弹窗清空', $('endMask').hidden === true && $('eventMask').hidden === true, '');

  /* ================= G. 交互一致性 ================= */
  restore(PRISTINE); S().ended = true; S().endingId = 'E_ORDINARY'; S().endReason = 'manual';
  ok('G1 结局后行动被拦截', RJS.doAction('rest') === false, '');
  restore(PRISTINE);

  var el16 = RJS.eligibleEvents();
  ok('G2 16 岁校园事件在池内', el16.indexOf('E_CAMPUS_EXAM_RANK') > -1, el16.filter(function (x) { return x.indexOf('E_CAMPUS_') === 0; }).join(','));
  var leak = el16.filter(function (id) {
    var ev = RJS.events.filter(function (x) { return x.id === id; })[0];
    return ev && (ev.chainOnly || ev.id === 'E_DEFAULT');
  });
  ok('G3 链式/保底事件不泄漏进常规池', leak.length === 0, leak.join(','));

  restore(PRISTINE); S().age = 30; S().job = '无业'; S().salary = 0;
  ok('G7 无业时「重新找工作」进池', RJS.eligibleEvents().indexOf('E_REEMP') > -1, '');
  restore(PRISTINE); S().age = 30; S().job = '部门经理'; S().salary = 15000; S().currentPositionYears = 1;
  ok('G8 在职时「重新找工作」不进池', RJS.eligibleEvents().indexOf('E_REEMP') === -1, '');
  restore(PRISTINE); S().age = 17;
  ok('G9 未成年时「重新找工作」不进池', RJS.eligibleEvents().indexOf('E_REEMP') === -1, '');

  restore(PRISTINE); S().age = 19; S().edu = '本科';
  var el19 = RJS.eligibleEvents().filter(function (x) { return x.indexOf('E_CAMPUS_') === 0; });
  ok('G4 19 岁/本科后校园池关闭', el19.length === 0, el19.join(','));

  restore(PRISTINE);
  var t1 = S().y * 372 + S().m * 31 + S().d;
  var okCnt = 0;
  for (var i = 0; i < 10; i++) { if (RJS.doAction('rest') === true) okCnt++; if (!$('eventMask').hidden) clickFreeOption(); }
  var t2 = S().y * 372 + S().m * 31 + S().d;
  ok('G5 连点休息 10 次推进 10 天且日期连续', t2 - t1 === 10 && okCnt === 10, t1 + '→' + t2 + ' 成功' + okCnt);

  var bad = 0;
  for (var j = 0; j < 50; j++) { if (RJS.doAction('rest') === true) bad++; }
  ok('G6 连续 50 次行动无异常', RES.errors.length === 0, '成功 ' + bad + ' 次 / errors ' + RES.errors.length);

  /* ================= H. 本地存储不可用（降级） ================= */
  (function () {
    var real = window.localStorage;
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new Error('storage disabled'); } });
    var before = RES.errors.length;
    try { $('btnSave').click(); } catch (e) { RES.errors.push('save throw: ' + e.message); }
    try { $('btnLoad').click(); } catch (e) { RES.errors.push('load throw: ' + e.message); }
    ok('H0 存储被禁用时保存/读取不抛异常', RES.errors.length === before, RES.errors.slice(before).join(' | '));
    Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
  })();

  /* ================= I. 布局 ================= */
  var panels = document.querySelectorAll('.panel, .status, .side');
  var lay = [];
  for (var k = 0; k < panels.length; k++) {
    lay.push((panels[k].id || panels[k].className) + ':' + panels[k].clientHeight + '/' + panels[k].scrollHeight);
  }
  var clipped = lay.filter(function (x) {
    var p = x.split(':')[1].split('/');
    return Number(p[1]) > Number(p[0]) + 1;
  });
  ok('I1 面板无纵向裁切', clipped.length === 0, clipped.join(' ') || lay.join(' '));
  ok('I2 页面无横向溢出', document.documentElement.scrollWidth <= window.innerWidth + 1, document.documentElement.scrollWidth + '/' + window.innerWidth);
  RES.notes.push('视口 ' + window.innerWidth + 'x' + window.innerHeight + ' | ' + lay.join(' '));

  /* ================= J. 开新档 200 次：前史/天赋/学校档位 ================= */
  (function bootstrap() {
    var tiers = {}, bonusBad = 0, talBad = 0, msBad = 0, ageBad = 0, tierSeen = {};
    for (var i = 0; i < 200; i++) {
      $('btnReset').click();
      var s = S();
      tiers[s.schoolTier] = (tiers[s.schoolTier] || 0) + 1;
      tierSeen[s.schoolTier] = 1;
      if (s.schoolBonus !== ({ '重点': 10, '普通': 0, '职高': -10 })[s.schoolTier]) bonusBad++;
      var t = s.talents || [];
      if (t.length !== 2 || !t[0].id || t[0].id === t[1].id || t[0].level < 1) talBad++;
      if ((s.milestones || []).join(',') !== '6,12,15') msBad++;
      if (s.age !== 16 || s.edu !== '高中' || s.int !== 10 || s.money !== 2800) ageBad++;
    }
    ok('J1 200 档开局：学校档位/天赋/前史节点全部合法', bonusBad === 0 && talBad === 0 && msBad === 0 && ageBad === 0,
      'bonusBad=' + bonusBad + ' talBad=' + talBad + ' msBad=' + msBad + ' initBad=' + ageBad);
    ok('J2 三种学校档位都会出现（随机前史生效）', Object.keys(tierSeen).length === 3, JSON.stringify(tiers));
    RES.notes.push('前史分布: ' + JSON.stringify(tiers));
  })();

  /* ================= K. 图鉴弹窗 ================= */
  (function dexUI() {
    restore(PRISTINE);
    var key = localStorage.getItem(SAVE_KEY);
    $('btnDex').click();
    var opened = $('dexMask') && !$('dexMask').hidden;
    var sameSave = localStorage.getItem(SAVE_KEY) === key;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    var closed = !$('dexMask') || $('dexMask').hidden;
    ok('K1 图鉴弹窗可开可关（Esc）', opened && closed, 'open=' + opened + ' close=' + closed);
    ok('K2 图鉴开关不写存档', sameSave, '');
    if (!($('dexMask') && $('dexMask').hidden)) { var c = $('btnDexClose'); if (c) c.click(); }
  })();

  /* ================= D10. 高考只结算一次 ================= */
  (function () {
    restore(PRISTINE);
    var s = S();
    s.age = 18; s.edu = '高中'; s.milestones = ['6', '12', '15']; s.pendingExam = null; s.examLog = [];
    s.y = 2027; s.m = 3; s.d = 1; s.int = 200; s.sta = 80; s.mood = 70; s.money = 5000;
    var guard = 0;
    while (guard++ < 500) {
      // 先把所有弹窗清干净（事件可能链式）
      var inner = 0;
      while (inner++ < 12) {
        if (!$('examMask').hidden) { $('btnExamGo').click(); if (!$('examMask').hidden) $('btnExamGo').click(); continue; }
        if (!$('eventMask').hidden) { if (!clickFreeOption()) { $('eventMask').hidden = true; } continue; }
        break;
      }
      if ((S().examLog || []).length >= 1 && !S().pendingExam) break;
      monthEnd();
      if (RJS.doAction('rest') === false) break;
      if (S().ended) break;
    }
    // 再跑一个月，确认不会二次排队
    var inner2 = 0;
    while (inner2++ < 8) {
      if (!$('examMask').hidden) { $('btnExamGo').click(); continue; }
      if (!$('eventMask').hidden) { if (!clickFreeOption()) $('eventMask').hidden = true; continue; }
      break;
    }
    monthEnd();
    RJS.doAction('rest');
    var inner3 = 0;
    while (inner3++ < 8) {
      if (!$('eventMask').hidden) { if (!clickFreeOption()) $('eventMask').hidden = true; continue; }
      break;
    }
    var cnt = (S().examLog || []).filter(function (x) { return x.stage === 'gaokao'; }).length;
    ok('D10 高考只结算一次，不重复排队', cnt === 1, 'examLog=' + cnt + ' pending=' + JSON.stringify(S().pendingExam) + ' age=' + S().age);
  })();

  /* ================= L. 婚姻家庭系统（v3.0） ================= */
  (function marriage() {
    restore(PRISTINE);
    var st = S();
    ok('L1 新档婚姻字段默认值', st.married === false && st.love === 50 && st.moodMax === 100 && st.spouse === '' && st.kids === 0,
      [st.married, st.love, st.moodMax, st.kids].join('/'));

    // 领证：走真事件
    restore(PRISTINE);
    S().age = 30; S().money = 200000; S().edu = '本科'; S().cha = 60; S().eq = 60;
    RJS.openEventById('E_MARRY_WED');
    document.querySelector('#eventOptions .event-opt[data-idx="0"]').click();
    var marriedNow = S();
    ok('L2 领证写入婚姻状态', marriedNow.married === true && !!marriedNow.spouse && marriedNow.moodMax === 110,
      'spouse=' + marriedNow.spouse + ' love=' + marriedNow.love + ' moodMax=' + marriedNow.moodMax);
    ok('L3 领证扣彩礼（风光 12 万）', marriedNow.money === 80000, marriedNow.money);

    // 陪伴行动
    var comp = RJS.actions.filter(function (a) { return a.id === 'companion'; })[0];
    ok('L4 陪伴已注册（共 ' + RJS.actions.length + ' 个行动）', !!comp && RJS.actions.length === 20, RJS.actions.length);
    restore(PRISTINE); S().age = 30;
    ok('L5 单身也能陪伴（不再锁已婚）', RJS.checkRequires(comp).length === 0, '');
    restore(PRISTINE); S().age = 30; S().married = true; S().spouse = '林晓'; S().love = 50; S().money = 5000;
    S().d = 10;                                     // 固定非月末，避免跨月结算干扰
    var b4 = { love: S().love, money: S().money, mood: S().mood };
    var retC = RJS.doAction('companion');
    ok('L6 陪伴：感情 +8 / 金钱 −100 / 心情 +3 / 推进 1 天',
      retC === true && S().love === b4.love + 8 && S().money === b4.money - 100 && S().mood >= b4.mood + 3,
      'love+' + (S().love - b4.love) + ' money' + (S().money - b4.money) + ' mood+' + (S().mood - b4.mood));

    // 家庭月结：家用 = max(800, 月薪×15%)，感情 −1
    restore(PRISTINE);
    var m = S();
    m.age = 30; m.married = true; m.spouse = '林晓'; m.love = 70; m.mood = 60; m.moodMax = 110;
    m.salary = 10000; m.job = '部门主管'; m.money = 100000;
    m.int = 200; m.currentPositionYears = 1; m.talents = [];   // 去掉天赋倍率与裁员随机，金额可精确断言
    m.d = new Date(m.y, m.m, 0).getDate();
    RJS.doAction('rest');
    // 生活成本 1500 + 家用 1500（10000×15%）= −3000；发薪 +10000；感情 −1
    // v3.2：生活成本 3200（10k × 32%）+ 家用 3200（10k × 15% → 取 max(800,1500)=1500? 见下）
    ok('L7 家庭月结扣家用并掉感情',
      S().familyCost === 1500 && S().love === 69 && S().money === 105300,
      'cost=' + S().familyCost + ' love=' + S().love + ' money=' + S().money);

    // 冷战两次 → 顺延队列里排入离婚事件
    restore(PRISTINE);
    var c = S();
    c.age = 30; c.married = true; c.spouse = '林晓'; c.love = 0; c.money = 50000; c.salary = 0; c.moodMax = 110;
    for (var i = 0; i < 2; i++) {
      c.d = new Date(c.y, c.m, 0).getDate();
      RJS.doAction('rest');
      if (!$('eventMask').hidden) { $('eventMask').hidden = true; }
    }
    ok('L8 感情归零连续两月 → 排入离婚事件', RJS.deferred().indexOf('E_MARRIED_DIVORCE') > -1, RJS.deferred().join(','));

    // 离婚结算
    restore(PRISTINE);
    var d = S();
    d.age = 35; d.married = true; d.spouse = '林晓'; d.love = 10; d.money = 100000; d.moodMax = 110; d.coldMonths = 2;
    RJS.openEventById('E_MARRIED_DIVORCE');
    document.querySelector('#eventOptions .event-opt[data-idx="0"]').click();
    ok('L9 协议离婚：财产对半 / 上限回 100 / 计数 +1',
      S().married === false && S().money === 50000 && S().moodMax === 100 && S().divorceCount === 1 && S().spouse === '',
      'money=' + S().money + ' moodMax=' + S().moodMax + ' count=' + S().divorceCount);

    // 心情上限真的生效
    restore(PRISTINE);
    var e = S();
    e.married = true; e.spouse = '林晓'; e.love = 80; e.mood = 100; e.moodMax = 110;
    RJS.doAction('rest');
    ok('L10 婚后心情可以突破 100（上限 110）', S().mood === 110, S().mood);

    // 存读档：婚姻状态与心情上限都要活下来
    $('btnSave').click();
    restore(PRISTINE);
    $('btnLoad').click();
    ok('L11 存读档保留配偶/感情/上限/心情',
      S().married === true && S().spouse === '林晓' && S().love >= 79 && S().moodMax === 110 && S().mood === 110,
      'spouse=' + S().spouse + ' love=' + S().love + ' moodMax=' + S().moodMax + ' mood=' + S().mood);

    // 老档（v2.9 结构，没有婚姻字段）
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      app: 'renjian-siji', v: 1, at: Date.now(),
      state: { y: 2020, m: 5, d: 9, int: 120, sta: 60, money: 9000, mood: 50, age: 30, edu: '本科', job: '部门主管', workYears: 4, logs: [], usage: {} }
    }));
    $('btnLoad').click();
    ok('L12 老档读入默认未婚 / 感情 50 / 上限 100',
      S().married === false && S().love === 50 && S().moodMax === 100 && S().spouse === '',
      'married=' + S().married + ' love=' + S().love + ' moodMax=' + S().moodMax);

    // 相亲门槛：未婚进池、已婚不进池
    restore(PRISTINE); S().age = 30; S().cha = 60; S().eq = 60;
    ok('L13 未婚时相亲在池内', RJS.eligibleEvents().indexOf('E_MARRY_SEEK') > -1, '');
    restore(PRISTINE); S().age = 30; S().married = true; S().spouse = '林晓'; S().cha = 60; S().eq = 60;
    ok('L14 已婚时相亲与旧情复燃都不进池',
      RJS.eligibleEvents().indexOf('E_MARRY_SEEK') === -1 && RJS.eligibleEvents().indexOf('E_LOVE_GROWN') === -1, '');

    // 相亲链：二次见面的属性门槛
    restore(PRISTINE); S().age = 30; S().cha = 10; S().eq = 10;
    RJS.openEventById('E_MARRY_SECOND');
    var btns = document.querySelectorAll('#eventOptions .event-opt');
    ok('L15 情商/魅力不足时「继续联系」置灰', btns[0].classList.contains('is-locked'), btns[0].className);
    restore(PRISTINE); S().age = 30; S().cha = 40; S().eq = 40;
    RJS.openEventById('E_MARRY_SECOND');
    btns = document.querySelectorAll('#eventOptions .event-opt');
    ok('L16 情商/魅力达标后可继续联系', !btns[0].classList.contains('is-locked'), btns[0].className);

    // 再婚冷却（v3.0.1）：距 lastMarryMonth 不足 30 个月不许进相亲池
    restore(PRISTINE);
    var cd = S();
    cd.age = 35; cd.cha = 60; cd.eq = 60; cd.married = false;
    cd.lastMarryMonth = (cd.y * 12 + cd.m) - 10;
    var pool10 = RJS.eligibleEvents();
    ok('L19 离婚 10 个月：相亲/催婚/旧情全部被冷却挡住',
      pool10.indexOf('E_MARRY_SEEK') === -1 &&
      pool10.indexOf('E_MARRY_URGE') === -1 &&
      pool10.indexOf('E_LOVE_GROWN') === -1,
      pool10.filter(function (x) { return x.indexOf('E_MARRY') === 0 || x === 'E_LOVE_GROWN'; }).join(','));

    restore(PRISTINE);
    var cd2 = S();
    cd2.age = 35; cd2.cha = 60; cd2.eq = 60; cd2.married = false;
    cd2.lastMarryMonth = (cd2.y * 12 + cd2.m) - 31;
    var pool31 = RJS.eligibleEvents();
    ok('L20 离婚满 31 个月：重新进池', pool31.indexOf('E_MARRY_SEEK') > -1 && pool31.indexOf('E_MARRY_URGE') > -1,
      pool31.filter(function (x) { return x.indexOf('E_MARRY') === 0; }).join(','));

    restore(PRISTINE);
    S().age = 30; S().cha = 60; S().eq = 60;
    ok('L21 从未结婚不受冷却影响（lastMarryMonth=0）', RJS.eligibleEvents().indexOf('E_MARRY_SEEK') > -1, '');

    // 冷战 → 离婚 → 立刻再查池：应被冷却挡住
    restore(PRISTINE);
    var cd3 = S();
    cd3.age = 33; cd3.married = true; cd3.spouse = '林晓'; cd3.love = 0; cd3.money = 80000; cd3.moodMax = 110;
    cd3.salary = 0; cd3.cha = 60; cd3.eq = 60;
    for (var k = 0; k < 2; k++) {
      cd3.d = new Date(cd3.y, cd3.m, 0).getDate();
      RJS.doAction('rest');
      if (!S().ended) { if (!$('eventMask').hidden) { $('eventMask').hidden = true; } }
    }
    RJS.openEventById('E_MARRIED_DIVORCE');
    var dl = document.querySelectorAll('#eventOptions .event-opt');
    if (dl[0] && !dl[0].classList.contains('is-locked')) dl[0].click();
    var afterDivorce = RJS.eligibleEvents();
    ok('L22 刚离婚当月不能马上再相亲（冷却生效）',
      S().married === false && S().divorceCount >= 1 && afterDivorce.indexOf('E_MARRY_SEEK') === -1,
      'divorce=' + S().divorceCount + ' inPool=' + (afterDivorce.indexOf('E_MARRY_SEEK') > -1));
    restore(PRISTINE);

    // 冷却常数边界：29 个月仍被挡，30 个月整放行（MARRY_COOLDOWN 常量是否被事件与规则共用）
    restore(PRISTINE);
    var b29 = S();
    b29.age = 35; b29.cha = 60; b29.eq = 60;
    b29.lastMarryMonth = (b29.y * 12 + b29.m) - 29;
    ok('L23 冷却第 29 个月仍被挡（常量=30）', RJS.eligibleEvents().indexOf('E_MARRY_SEEK') === -1, '');
    restore(PRISTINE);
    var b30 = S();
    b30.age = 35; b30.cha = 60; b30.eq = 60;
    b30.lastMarryMonth = (b30.y * 12 + b30.m) - 30;
    ok('L24 冷却满 30 个月放行', RJS.eligibleEvents().indexOf('E_MARRY_SEEK') > -1, '');

    // 婚后事件只在婚后出现
    restore(PRISTINE); S().age = 30;
    ok('L17 未婚时婚后事件不进池',
      RJS.eligibleEvents().indexOf('E_MARRIED_QUARREL') === -1 && RJS.eligibleEvents().indexOf('E_FAMILY_KID') === -1, '');
    restore(PRISTINE); S().age = 30; S().married = true; S().spouse = '林晓'; S().love = 70;
    ok('L18 已婚时婚后事件进池', RJS.eligibleEvents().indexOf('E_MARRIED_QUARREL') > -1, '');
    restore(PRISTINE);
  })();

  /* ================= M. 子女养育系统（v3.1） ================= */
  (function children() {
    try {
    restore(PRISTINE);
    var st = S();
    ok('M1 新档子女字段默认值', Array.isArray(st.children) && st.children.length === 0 && st.kids === 0 && st.dink === false,
      JSON.stringify({ kids: st.kids, dink: st.dink }));

    // 生育：走真事件
    restore(PRISTINE);
    var b = S();
    b.age = 30; b.married = true; b.spouse = '林晓'; b.money = 50000; b.sta = 80; b.love = 70; b.moodMax = 110;
    var m0 = b.money, s0 = b.sta;
    RJS.openEventById('E_KID_BIRTH');
    document.querySelector('#eventOptions .event-opt[data-idx="0"]').click();
    var c0 = S().children[0];
    ok('M2 顺产生出孩子并写入数组', !!c0 && S().children.length === 1 && S().kids === 1 && !!c0.name,
      c0 ? c0.name + ' / luck ' + c0.luck + ' / int ' + c0.int : '无');
    ok('M3 生育扣钱扣体质', S().money === m0 - 8000 && S().sta === s0 - 8, (S().money - m0) + ' / sta' + (S().sta - s0));
    ok('M4 有孩子后心情上限 110+5=115', S().moodMax === 115, S().moodMax);
    ok('M5 孩子运气在 20-79 随机区间', c0.luck >= 20 && c0.luck <= 79, c0.luck);

    // 领养
    restore(PRISTINE);
    var ad = S();
    ad.age = 30; ad.married = true; ad.spouse = '林晓'; ad.money = 100000;
    RJS.openEventById('E_KID_ADOPT');
    document.querySelector('#eventOptions .event-opt[data-idx="0"]').click();
    ok('M6 领养写入数组且关系从 40 起', S().children.length === 1 && S().children[0].relation === 40,
      S().children.length + ' / rel ' + (S().children[0] && S().children[0].relation));

    // 丁克
    restore(PRISTINE);
    var dk = S();
    dk.age = 30; dk.married = true; dk.spouse = '林晓'; dk.money = 50000; dk.mood = 60;
    RJS.openEventById('E_FAMILY_KID');
    document.querySelector('#eventOptions .event-opt[data-idx="2"]').click();
    ok('M7 选丁克：dink=true 且没有孩子', S().dink === true && S().children.length === 0, 'dink=' + S().dink);

    // 择校
    restore(PRISTINE);
    var sc = S();
    sc.age = 35; sc.married = true; sc.spouse = '林晓'; sc.money = 200000;
    RJS.openEventById('E_KID_BIRTH');
    document.querySelector('#eventOptions .event-opt[data-idx="0"]').click();
    $('eventMask').hidden = true;
    RJS.openEventById('E_KID_SCHOOL_PICK');
    document.querySelector('#eventOptions .event-opt[data-idx="1"]').click();
    ok('M8 择校把投入档改成「重点」', S().children[0].invest === '重点', S().children[0].invest);

    // 分档计费：0-3 岁普通 vs 国际
    restore(PRISTINE);
    var f1 = S();
    f1.age = 30; f1.married = true; f1.spouse = '林晓'; f1.salary = 0; f1.money = 100000;
    f1.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: f1.y * 12 + f1.m, birth: '顺产',
      int: 60, sta: 60, cha: 50, luck: 50, edu: '婴幼儿', invest: '普通', relation: 60,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: f1.y * 12 + f1.m }];
    f1.kids = 1;
    f1.d = new Date(f1.y, f1.m, 0).getDate();
    RJS.doAction('rest');
    ok('M9 0-3 岁普通档每月养育费 800', S().familyCost === 800 + 800, S().familyCost);

    restore(PRISTINE);
    var f2 = S();
    f2.age = 30; f2.married = true; f2.spouse = '林晓'; f2.salary = 0; f2.money = 100000;
    f2.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: f2.y * 12 + f2.m, birth: '顺产',
      int: 60, sta: 60, cha: 50, luck: 50, edu: '婴幼儿', invest: '国际', relation: 60,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: f2.y * 12 + f2.m }];
    f2.kids = 1;
    f2.d = new Date(f2.y, f2.m, 0).getDate();
    RJS.doAction('rest');
    ok('M10 国际档 ×2.0 → 1600', S().familyCost === 800 + 1600, S().familyCost);

    // 成长：跨过 12 个月，智力应随投入增长
    restore(PRISTINE);
    var g1 = S();
    g1.age = 40; g1.married = true; g1.spouse = '林晓'; g1.salary = 0; g1.money = 500000;
    g1.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: g1.y * 12 + g1.m - 120, birth: '顺产',
      int: 100, sta: 60, cha: 50, luck: 50, edu: '小学', invest: '重点', relation: 60,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: g1.y * 12 + g1.m - 12 }];
    g1.kids = 1;
    g1.d = new Date(g1.y, g1.m, 0).getDate();
    RJS.doAction('rest');
    var g2 = S().children[0];
    ok('M11 年度成长：重点档智力至少 +2', g2.int >= 102, 'int ' + g2.int + ' lastGrow ok=' + (g2.lastGrow === S().y * 12 + S().m));

    // 成年反哺：能力 ≥180 → 1500+(ab-180)*25，封顶 4000
    restore(PRISTINE);
    var r1 = S();
    r1.age = 45; r1.married = true; r1.spouse = '林晓'; r1.salary = 0; r1.money = 100000;
    r1.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: r1.y * 12 + r1.m - 19 * 12, birth: '顺产',
      int: 300, sta: 60, cha: 50, luck: 90, edu: '高中', invest: '重点', relation: 80,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: r1.y * 12 + r1.m }];
    r1.kids = 1;
    r1.d = new Date(r1.y, r1.m, 0).getDate();
    var beforeR = S().money;
    RJS.doAction('rest');
    var kid = S().children[0];
    ok('M12 成年判定写入反哺金额并到账', kid.supportDone === true && kid.support === 3100 && S().supportIncome === 3100,
      'support=' + kid.support + ' income=' + S().supportIncome);

    // 60 岁后 ×1.3
    restore(PRISTINE);
    var r2 = S();
    r2.age = 65; r2.married = true; r2.spouse = '林晓'; r2.salary = 0; r2.money = 100000;
    r2.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: r2.y * 12 + r2.m - 40 * 12, birth: '顺产',
      int: 300, sta: 60, cha: 50, luck: 90, edu: '高中', invest: '重点', relation: 80,
      alive: true, support: 3100, supportDone: true, hasChild: false, lastGrow: r2.y * 12 + r2.m }];
    r2.kids = 1;
    r2.d = new Date(r2.y, r2.m, 0).getDate();
    RJS.doAction('rest');
    ok('M13 60 岁后反哺 ×1.3 = 4030', S().supportIncome === 4030, S().supportIncome);

    // 反哺封顶 4000
    restore(PRISTINE);
    var r3 = S();
    r3.age = 50; r3.married = true; r3.spouse = '林晓'; r3.salary = 0; r3.money = 100000;
    r3.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: r3.y * 12 + r3.m - 25 * 12, birth: '顺产',
      int: 500, sta: 60, cha: 50, luck: 100, edu: '高中', invest: '国际', relation: 100,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: r3.y * 12 + r3.m }];
    r3.kids = 1;
    r3.d = new Date(r3.y, r3.m, 0).getDate();
    RJS.doAction('rest');
    ok('M14 反哺封顶 4000', S().children[0].support === 4000, S().children[0].support);

    // 啃老
    restore(PRISTINE);
    var r4 = S();
    r4.age = 50; r4.married = true; r4.spouse = '林晓'; r4.salary = 0; r4.money = 100000;
    r4.children = [{ id: 'c1', name: '小满', sex: '男', bornAt: r4.y * 12 + r4.m - 22 * 12, birth: '顺产',
      int: 30, sta: 60, cha: 40, luck: 20, edu: '高中', invest: '普通', relation: 50,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: r4.y * 12 + r4.m }];
    r4.kids = 1;
    r4.d = new Date(r4.y, r4.m, 0).getDate();
    var beforeLeech = S().money;
    RJS.doAction('rest');
    ok('M15 低能力孩子啃老 −1500/月', S().children[0].support === -1500 && S().supportIncome === -1500,
      'support=' + S().children[0].support + ' money ' + beforeLeech + '→' + S().money);

    // 关系 <30 不给钱
    restore(PRISTINE);
    var r5 = S();
    r5.age = 50; r5.married = true; r5.spouse = '林晓'; r5.salary = 0; r5.money = 100000;
    r5.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: r5.y * 12 + r5.m - 22 * 12, birth: '顺产',
      int: 300, sta: 60, cha: 50, luck: 90, edu: '高中', invest: '重点', relation: 20,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: r5.y * 12 + r5.m }];
    r5.kids = 1;
    r5.d = new Date(r5.y, r5.m, 0).getDate();
    RJS.doAction('rest');
    ok('M16 亲子关系 <30 时一分不给', S().children[0].support === 0, S().children[0].support);

    // 陪孩子行动
    restore(PRISTINE);
    var kc = S();
    kc.age = 35; kc.married = true; kc.spouse = '林晓'; kc.money = 5000; kc.mood = 60;
    kc.children = [{ id: 'c1', name: '小满', sex: '女', bornAt: kc.y * 12 + kc.m - 60, birth: '顺产',
      int: 60, sta: 60, cha: 50, luck: 50, edu: '幼儿园', invest: '普通', relation: 60,
      alive: true, support: 0, supportDone: false, hasChild: false, lastGrow: kc.y * 12 + kc.m }];
    kc.kids = 1;
    var kact = RJS.actions.filter(function (a) { return a.id === 'kidcare'; })[0];
    ok('M17 陪孩子已注册（共 ' + RJS.actions.length + ' 个行动）', !!kact && RJS.actions.length === 20, RJS.actions.length);
    S().d = 10;                                     // 固定非月末，避免跨月结算干扰
    var kb = { money: S().money, mood: S().mood, rel: S().children[0].relation };
    RJS.doAction('kidcare');
    ok('M18 陪孩子：−100 元 / 关系 +6 / 心情 +2', S().money === kb.money - 100 &&
      S().children[0].relation === kb.rel + 6 && S().mood >= kb.mood + 2,
      'money' + (S().money - kb.money) + ' rel+' + (S().children[0].relation - kb.rel));
    restore(PRISTINE); S().age = 35;
    ok('M19 没有孩子时陪孩子被锁', RJS.checkRequires(kact).length > 0, '');

    // 老档：只有 kids 数字，没有 children 数组
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      app: 'renjian-siji', v: 1, at: Date.now(),
      state: { y: 2026, m: 5, d: 9, int: 120, sta: 60, money: 9000, mood: 50, age: 40, edu: '本科',
        job: '部门主管', workYears: 4, kids: 2, married: true, spouse: '林晓', love: 60, moodMax: 110,
        logs: [], usage: {} }
    }));
    $('btnLoad').click();
    ok('M20 老档 kids=2 自动补录 2 个孩子', S().children.length === 2 && S().kids === 2,
      'children=' + S().children.length + ' kids=' + S().kids);
    ok('M21 补录的孩子字段完整', S().children.every(function (c) {
      return c.name && typeof c.bornAt === 'number' && typeof c.invest === 'string' && typeof c.relation === 'number';
    }), JSON.stringify(S().children[0]).slice(0, 90));

    // 迁移边界：kids=0 不产生幽灵孩子
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      app: 'renjian-siji', v: 1, at: Date.now(),
      state: { y: 2026, m: 5, d: 9, int: 120, sta: 60, money: 9000, mood: 50, age: 40,
        edu: '本科', job: '部门主管', workYears: 4, kids: 0, logs: [], usage: {} }
    }));
    $('btnLoad').click();
    ok('M20b 老档 kids=0 → children 为空', Array.isArray(S().children) && S().children.length === 0, S().children);

    // 迁移边界：children 不是数组 / 超过 3 个 → 不崩且截断
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      app: 'renjian-siji', v: 1, at: Date.now(),
      state: { y: 2026, m: 5, d: 9, int: 120, sta: 60, money: 9000, mood: 50, age: 40,
        edu: '本科', children: '坏数据', kids: 2, logs: [], usage: {} }
    }));
    $('btnLoad').click();
    ok('M20c children 坏数据能兜住并回落为 kids 补录', S().children.length === 2, S().children.length);

    localStorage.setItem(SAVE_KEY, JSON.stringify({
      app: 'renjian-siji', v: 1, at: Date.now(),
      state: { y: 2026, m: 5, d: 9, int: 120, sta: 60, money: 9000, mood: 50, age: 40,
        edu: '本科', kids: 5, children: [
          { id: 'a', name: '一', bornAt: 24200 }, { id: 'b', name: '二', bornAt: 24100 },
          { id: 'c', name: '三', bornAt: 24000 }, { id: 'd', name: '四', bornAt: 23900 },
          { id: 'e', name: '五', bornAt: 23800 }
        ], logs: [], usage: {} }
    }));
    $('btnLoad').click();
    ok('M20d 超过 3 个孩子被截断到上限', S().children.length === 3 && S().kids === 3, S().children.length);

    // 存读档保留 children（数量、名字、投入档、关系都要活下来）
    var kidsBefore = S().children.length;
    var nameBefore = S().children[0].name;
    var relBefore = S().children[0].relation;
    $('btnSave').click();
    restore(PRISTINE);
    $('btnLoad').click();
    ok('M22 存读档保留子女数组', S().children.length === kidsBefore && S().children[0].name === nameBefore
      && S().children[0].relation === relBefore,
      'children=' + S().children.length + ' name=' + S().children[0].name);

    // 三条新结局
    function endingWith(mut) { restore(PRISTINE); var x = S(); mut(x); var r = RJS.pickEnding(); return r && r.id; }
    var eLost = endingWith(function (x) {
      x.age = 60; x.money = 1000; x.lostChild = 1;
      x.children = [{ id: 'c1', name: '小满', bornAt: x.y * 12 + x.m - 240, alive: false, relation: 60, invest: '普通' }];
      x.kids = 1;
    });
    var eFour = endingWith(function (x) {
      x.age = 72; x.money = 1000; x.married = true; x.spouse = '林晓';
      x.children = [
        { id: 'c1', name: '小满', bornAt: x.y * 12 + x.m - 480, alive: true, relation: 80, invest: '重点', hasChild: true },
        { id: 'c2', name: '小禾', bornAt: x.y * 12 + x.m - 400, alive: true, relation: 70, invest: '普通', hasChild: false }
      ];
      x.kids = 2;
    });
    var eDink = endingWith(function (x) {
      x.age = 72; x.money = 1000; x.married = true; x.spouse = '林晓'; x.dink = true; x.children = []; x.kids = 0;
    });
    ok('M23 失孤结局命中', eLost === 'E_LOST_CHILD', eLost);
    ok('M24 四世同堂结局命中', eFour === 'E_FOUR_GEN', eFour);
    ok('M25 丁克家族结局命中', eDink === 'E_DINK', eDink);
    restore(PRISTINE);
    } catch (e) { R.push({ n: 'M 组异常', p: false, i: e.message }); }
  })();

  RES.summary = { total: R.length, pass: R.filter(function (x) { return x.p; }).length, fail: R.filter(function (x) { return !x.p; }).length };
  var pre = document.createElement('pre');
  pre.id = 'testout';
  pre.textContent = '##STAB##' + JSON.stringify(RES) + '##END##';
  document.body.appendChild(pre);
})();
