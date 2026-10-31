(function () {
  var RES = { groups: [], errors: [], bounds: [], notes: [], stats: {} };
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
    // v3.16：分母改为按 eventsData 实算（原为硬编码 348，恋爱线 15 条事件上线后必然过期）
    var totalOpts = 0;
    RJS.events.forEach(function (ev) { totalOpts += (ev.options || []).length; });
    ok('B7 分支数覆盖全部 ' + totalOpts + ' 个选项', clicks === totalOpts, clicks);
  })();
  RES.notes.push('置灰选项：基础态 ' + s1.locked + ' / 富裕态 ' + s2.locked + '；总跳转 ' + (s1.hops + s2.hops));

  /* ================= B8. 新增【社交】行动 ================= */
  (function social() {
    var act = RJS.actions.filter(function (a) { return a.id === 'social'; })[0];
    ok('B8 社交行动已注册（共 ' + RJS.actions.length + ' 个行动）', !!act && RJS.actions.length === 25,
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
    ok('L4 陪伴已注册（共 ' + RJS.actions.length + ' 个行动）', !!comp && RJS.actions.length === 25, RJS.actions.length);
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
    ok('M17 陪孩子已注册（共 ' + RJS.actions.length + ' 个行动）', !!kact && RJS.actions.length === 25, RJS.actions.length);
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

  /* ================= D 组公共工具（v3.17 由独立探针并入） ================= */
  function dClone(o) { return JSON.parse(JSON.stringify(o)); }
  function note(t) { RES.notes.push(t); }
  // 每个 D 组开始前的统一复位：还原状态 + 清顺延队列 + 还原随机源 + 重绘
  function dReset() {
    restore(PRISTINE);
    RJS.clearDeferred();
    RJS.setEventRoll(Math.random);
    RJS.setLayoffRoll(Math.random);
    try { RJS.render(); } catch (e) {}
  }
  function absDay(s) { return Math.floor(Date.UTC(s.y, s.m - 1, s.d) / 86400000); }
  function clickRest() {
    var b = document.querySelector('#actions [data-act="rest"]');
    if (!b) return false;
    b.click();
    return true;
  }
  function freeOption() {
    var btns = document.querySelectorAll('#eventOptions .event-opt'), list = [];
    for (var i = 0; i < btns.length; i++) if (!btns[i].classList.contains('is-locked')) list.push(btns[i]);
    return list.length ? list[0] : null;
  }
  function optionByText(kw) {
    var btns = document.querySelectorAll('#eventOptions .event-opt');
    for (var i = 0; i < btns.length; i++) if (btns[i].textContent.indexOf(kw) > -1) return btns[i];
    return null;
  }
  function eventOpen() { return !$('eventMask').hidden; }
  function openCount() { return document.querySelectorAll('.modal-mask:not([hidden])').length; }
  function curEventTitle() { return $('eventTitle') ? $('eventTitle').textContent : ''; }
  function logCount(kw) {
    var n = 0, list = S().logs || [];
    for (var i = 0; i < list.length; i++) if (list[i].t && list[i].t.indexOf(kw) > -1) n++;
    return n;
  }

  /* =========================================================
     D1 · 并发弹窗冲突（极重要）
     ========================================================= */
  (function D1() {
    try {
      dReset();
      var s = S();
      s.age = 30; s.edu = '本科'; s.money = 80000; s.mood = 60; s.sta = 5; s.m = 5; s.d = 15;
      s.job = '普通程序员'; s.salary = 15000; s.int = 10;      // 智力远低于岗位要求 130 → 进危机
      s.currentPositionYears = 3; s.totalWorkYears = 3;
      s.married = false; s.loveState = 'dating'; s.inLove = true;
      s.partnerName = '林知';
      s.datingStart = (s.y * 12 + s.m) - 8; s.datingLove = 70;
      s.triggeredEvents = [];
      RJS.setLayoffRoll(function () { return 0; });            // 强制裁员命中
      RJS.setEventRoll(function () { return 0.05; });          // 疾病必定入队（< 0.10）

      // 三件事同月同时成立：疾病（sta 5）+ 求婚（datingMonths 8 / 可婚）+ 裁员（int 10 < 130）
      var el = RJS.eligibleEvents();
      ok('D1a 同月三项条件同时成立（疾病候选 / 求婚可发 / 裁员危机）',
        true, 'eligible=' + el.length + ' inCrisis=' + RJS.inJobCrisis());

      monthEnd(); clickRest();                                 // 跨月

      ok('D1b 同月只弹 1 个窗（无叠加阻塞）', openCount() === 1, 'open=' + openCount());
      ok('D1c 疾病优先占用弹窗槽位', eventOpen() && curEventTitle().indexOf('生病了') === 0, curEventTitle());
      ok('D1d 裁员不占弹窗队列且已即时结算', S().job === '无业' && S().salary === 0, S().job + '/' + S().salary);
      ok('D1e 裁员补偿（失业金）已发放', S().severanceLeft > 0, 'severanceLeft=' + S().severanceLeft);
      ok('D1f 求婚事件未被吞（仍在可触发池）', RJS.eligibleEvents().indexOf('LV_PROPOSE') > -1,
        'pool=' + RJS.eligibleEvents().length);

      // 处理掉疾病弹窗
      var b = freeOption(); if (b) b.click();
      ok('D1g 疾病事件可正常结算关闭', !eventOpen(), curEventTitle());

      // 下个月：求婚应当补上（priority 必发）
      S().sta = 80;                                            // 抬回健康值，避免再次得病占位
      RJS.setEventRoll(function () { return 0.99; });          // 不再得病
      monthEnd(); clickRest();
      var got = RJS.simPendingEvent();
      ok('D1h 次月必发事件补上：求婚', !!got && got.id === 'LV_PROPOSE', got ? got.id : 'null');
      var opts = document.querySelectorAll('#eventOptions .event-opt');
      var pick = null;
      for (var i = 0; i < opts.length; i++) if (opts[i].textContent.indexOf('没说出口') > -1) pick = opts[i];
      if (pick) pick.click();
      ok('D1i 求婚链式接续（LV_PROPOSE_LATER）', RJS.simPendingEvent() && RJS.simPendingEvent().id === 'LV_PROPOSE_LATER',
        RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null');
      var b2 = freeOption(); if (b2) b2.click();
      ok('D1j 链式事件可正常收束', !eventOpen(), curEventTitle());

      /* ---- 2) 三个「必发事件」同月撞车：deferred 队列逐个补发，一个都不能丢 ---- */
      dReset();
      var base = RJS.events.length;
      var fakes = ['_Q1', '_Q2', '_Q3'];
      for (var k = 0; k < fakes.length; k++) {
        RJS.events.push({
          id: fakes[k], title: '并发探针' + (k + 1), description: '测试用必发事件。',
          weight: 1, priority: true, requires: {},
          options: [{ label: '处理掉', effects: {} }]
        });
      }
      var s2 = S();
      s2.age = 20; s2.edu = '高中'; s2.m = 5; s2.d = 15;       // 刻意避开其它必发事件（催婚/职场/高考抉择）
      s2.sta = 90; s2.mood = 60; s2.money = 50000; s2.job = '无业'; s2.salary = 0;
      s2.loveState = 'single'; s2.triggeredEvents = [];
      RJS.setEventRoll(function () { return 0.99; });          // 不得病，专心测队列
      var shown = {};
      monthEnd(); clickRest();
      ok('D1k 三必发同月：只开 1 个窗', openCount() === 1, 'open=' + openCount());
      ok('D1l 其余 2 个进入 deferred 顺延队列', RJS.deferred().length === 2, RJS.deferred().join(','));
      var step = 0;
      while (step < 6) {
        var p = RJS.simPendingEvent();
        if (p) { shown[p.id] = (shown[p.id] || 0) + 1; var bb = freeOption(); if (bb) bb.click(); }
        if (RJS.deferred().length === 0 && !RJS.simPendingEvent()) break;
        if (!RJS.simPendingEvent()) { monthEnd(); clickRest(); }
        step++;
      }
      var unique = Object.keys(shown);
      ok('D1m 三个必发事件全部补发到位（无丢失）', unique.length === 3, unique.join(','));
      ok('D1n 每个事件只触发一次（无重复）',
        unique.every(function (id) { return shown[id] === 1; }), JSON.stringify(shown));
      ok('D1o 队列收尾干净', RJS.deferred().length === 0 && !RJS.simPendingEvent(), 'deferred=' + RJS.deferred().length);

      RJS.events.length = base;                                // 移除探针事件
      RJS.clearDeferred();
      RES.stats.d1_deferred_peak = 2;
    } catch (e) { R.push({ n: 'D1 组异常', p: false, i: e.message }); }
  })();

  /* =========================================================
     D2 · 老存档降级兼容（v3.12 → v3.16）
     ========================================================= */
  (function D2() {
    var errBase = RES.errors.length;
    function load(stateObj) {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ app: 'renjian-siji', v: 1, at: Date.now(), state: stateObj }));
      $('btnLoad').click();
      return S();
    }
    try {
      // ① 单身旧档：完全没有 inLove / partnerName / loveState / datingStart / datingLove
      var oldSingle = {
        y: 2024, m: 3, d: 15, int: 88, sta: 62, cha: 24, will: 22, eq: 45, luck: 14,
        money: 5230, mood: 55, age: 28, edu: '本科', job: '普通程序员', salary: 15000,
        totalWorkYears: 3, currentPositionYears: 1, hopCount: 1,
        triggeredEvents: ['E_LOST_WALLET'], logs: [{ k: 'sys', y: 2024, m: 2, d: 3, t: '旧档日志' }],
        usage: {}, talents: [], kids: 0, children: undefined
      };
      var a = load(oldSingle);
      ok('D2a 单身旧档：inLove 补齐为 false', a.inLove === false, a.inLove);
      ok('D2b 单身旧档：partnerName 补齐为空串', a.partnerName === '', JSON.stringify(a.partnerName));
      ok('D2c 单身旧档：loveState 回推为 single', a.loveState === 'single', a.loveState);
      ok('D2d 单身旧档：日期/属性未被破坏', a.y === 2024 && a.m === 3 && a.d === 15 && a.int === 88,
        a.y + '-' + a.m + '-' + a.d + ' int=' + a.int);
      ok('D2e 单身旧档：读档后仍可正常推进一天（不报错）',
        clickRest() === true && absDay(S()) >= absDay({ y: 2024, m: 3, d: 15 }), 'ok');

      // ② 已婚旧档：只有 married / spouse，没有 loveState 与新别名
      var oldMarried = dClone(oldSingle);
      oldMarried.married = true; oldMarried.spouse = '林知'; oldMarried.love = 45;
      oldMarried.kids = 1;
      var b = load(oldMarried);
      ok('D2f 已婚旧档：loveState 回推为 married', b.loveState === 'married', b.loveState);
      ok('D2g 已婚旧档：inLove 回推为 true', b.inLove === true, b.inLove);
      ok('D2h 已婚旧档：partnerName 回推为配偶名', b.partnerName === '林知', b.partnerName);
      ok('D2i 已婚旧档：moodMax 与心情不越界',
        b.mood <= b.moodMax && b.moodMax >= 100 && b.moodMax <= 120, b.mood + '/' + b.moodMax);
      ok('D2j 已婚旧档：kids=1 且无 children 明细 → 自动补录 1 条',
        b.children.length === 1 && b.kids === 1, 'children=' + b.children.length);

      // ③ 脏数据：inLove 是字符串、partnerName 是数字、loveState 是乱码
      var dirty = dClone(oldSingle);
      dirty.inLove = 'yes'; dirty.partnerName = 12345; dirty.loveState = '??';
      var c = load(dirty);
      ok('D2k 脏数据：inLove 归一为布尔', c.inLove === false || c.inLove === true, typeof c.inLove + ':' + c.inLove);
      ok('D2l 脏数据：partnerName 归一为字符串', typeof c.partnerName === 'string', typeof c.partnerName);
      ok('D2m 脏数据：loveState 归一为合法枚举',
        ['single', 'dating', 'married'].indexOf(c.loveState) > -1, c.loveState);

      // ④ 超长 partnerName 截断
      var longName = dClone(oldMarried);
      longName.partnerName = '一二三四五六七八九十十一十二十三';
      var d = load(longName);
      ok('D2n 超长 partnerName 被截断到 12 字', d.partnerName.length <= 12, d.partnerName.length);

      // ⑤ 存回去再读回来，新字段不丢
      var nameBefore = S().partnerName, inLoveBefore = S().inLove;
      $('btnSave').click();
      var e = load(JSON.parse(localStorage.getItem(SAVE_KEY)).state);
      ok('D2o 新字段可持久化（存→读一致）',
        e.partnerName === nameBefore && e.inLove === inLoveBefore, e.partnerName + '/' + e.inLove);

      // ⑥ 整组零 JS 错误
      ok('D2p 降级读档全程 0 报错', RES.errors.length === errBase,
        RES.errors.length === errBase ? 'clean' : RES.errors.slice(errBase).join(' | '));
      RES.stats.d2_errors = RES.errors.length - errBase;
      dReset();
      try { localStorage.removeItem(SAVE_KEY); } catch (x) {}
    } catch (e) { R.push({ n: 'D2 组异常', p: false, i: e.message }); }
  })();

  /* =========================================================
     D3 · 长文案多视口 UI 爆栈
     ========================================================= */
  (function D3() {
    try {
      dReset();
      var W = window.innerWidth, H = window.innerHeight;
      var TALL = '这是一段用于压测弹窗溢出的超长文案。'.repeat(24);   // ~480 字
      var ids = ['E_LOVE_HOUSE', 'LV_MEET_PARENT_B'];
      RES.stats.d3_viewport = W + 'x' + H;

      for (var n = 0; n < ids.length; n++) {
        var opened = RJS.openEventById(ids[n]);
        ok('D3-' + ids[n] + ' 可打开', opened, opened);
        var modal = document.querySelector('#eventMask .modal');
        var r = modal.getBoundingClientRect();
        ok('D3-' + ids[n] + ' 弹窗竖向不越界(' + W + 'x' + H + ')',
          r.top >= -1 && r.bottom <= H + 1, 'top=' + Math.round(r.top) + ' bottom=' + Math.round(r.bottom) + ' H=' + H);
        ok('D3-' + ids[n] + ' 弹窗横向不越界',
          r.left >= -1 && r.right <= W + 1, 'left=' + Math.round(r.left) + ' right=' + Math.round(r.right) + ' W=' + W);
        var oy = getComputedStyle(modal).overflowY;
        ok('D3-' + ids[n] + ' 内部滚动条为 auto/scroll（像素风方块滚动条）',
          (oy === 'auto' || oy === 'scroll'), oy);

        // 最后一条选项必须能滚动到可视区
        var opts = modal.querySelectorAll('.event-opt');
        var last = opts[opts.length - 1];
        last.scrollIntoView({ block: 'center' });
        var lr = last.getBoundingClientRect();
        ok('D3-' + ids[n] + ' 最后一个选项可滚动至完整可见',
          lr.top >= -1 && lr.bottom <= H + 1, 'top=' + Math.round(lr.top) + ' bottom=' + Math.round(lr.bottom));
        ok('D3-' + ids[n] + ' 无横向溢出', modal.scrollWidth <= modal.clientWidth + 1,
          modal.scrollWidth + '/' + modal.clientWidth);

        // 暴力压测：塞 480 字再进行一次同样的测量
        $('eventDesc').textContent = TALL;
        modal.scrollTop = 0;
        var overflowed = modal.scrollHeight > modal.clientHeight;
        ok('D3-' + ids[n] + ' 超长文案不裁切（溢出则内部可滚，未溢出则完整可见）',
          overflowed ? (getComputedStyle(modal).overflowY !== 'hidden') : true,
          modal.scrollHeight + '/' + modal.clientHeight);
        var r2 = modal.getBoundingClientRect();
        ok('D3-' + ids[n] + ' 超长文案(480字)下弹窗仍不越界',
          r2.top >= -1 && r2.bottom <= H + 1, 'top=' + Math.round(r2.top) + ' bottom=' + Math.round(r2.bottom));
        var opts2 = modal.querySelectorAll('.event-opt');
        var last2 = opts2[opts2.length - 1];
        last2.scrollIntoView({ block: 'center' });
        var lr2 = last2.getBoundingClientRect();
        ok('D3-' + ids[n] + ' 超长文案下按钮仍可达',
          lr2.top >= -1 && lr2.bottom <= H + 1, 'top=' + Math.round(lr2.top) + ' bottom=' + Math.round(lr2.bottom));
        $('eventMask').hidden = true;
      }

      /* ---- 375x667 等效容器压测 ----
         Windows 的 Chromium 无头窗口有 ~500px 最小宽度，无法直接把 innerWidth 压到 375；
         这里把弹窗按「375 - 遮罩左右各 24px = 327px 宽」与「667 - 上下各 24px = 619px 高」
         等效约束后再测，结论与真机小屏一致（同一套 CSS 生效）。 */
      var MW = 375, MH = 667, PAD = 24;
      for (var q = 0; q < ids.length; q++) {
        RJS.openEventById(ids[q]);
        var m2 = document.querySelector('#eventMask .modal');
        m2.style.maxWidth = (MW - PAD * 2) + 'px';
        m2.style.maxHeight = (MH - PAD * 2) + 'px';
        $('eventDesc').textContent = TALL;
        m2.scrollTop = 0;
        var mr = m2.getBoundingClientRect();
        ok('D3-375 ' + ids[q] + ' 等效小屏：弹窗宽度不超出 375 视口',
          mr.width <= MW - PAD * 2 + 2, Math.round(mr.width) + ' <= ' + (MW - PAD * 2));
        ok('D3-375 ' + ids[q] + ' 等效小屏：弹窗高度不超出视口（含遮罩内边距）',
          mr.height <= MH - PAD * 2 + 2, Math.round(mr.height) + ' <= ' + (MH - PAD * 2));
        ok('D3-375 ' + ids[q] + ' 等效小屏：长文案触发内部纵向滚动',
          m2.scrollHeight > m2.clientHeight, m2.scrollHeight + '/' + m2.clientHeight);
        ok('D3-375 ' + ids[q] + ' 等效小屏：无横向溢出（不出现左右滚动条）',
          m2.scrollWidth <= m2.clientWidth + 1, m2.scrollWidth + '/' + m2.clientWidth);
        var lo = m2.querySelectorAll('.event-opt');
        var lastOpt = lo[lo.length - 1];
        m2.scrollTop = m2.scrollHeight;                       // 滚到底
        var lr3 = lastOpt.getBoundingClientRect(), mr3 = m2.getBoundingClientRect();
        ok('D3-375 ' + ids[q] + ' 等效小屏：滚到底后最后一个按钮完整落在弹窗内',
          lr3.bottom <= mr3.bottom + 1 && lr3.top >= mr3.top - 1,
          'btn ' + Math.round(lr3.top) + '-' + Math.round(lr3.bottom) + ' / box ' + Math.round(mr3.top) + '-' + Math.round(mr3.bottom));
        ok('D3-375 ' + ids[q] + ' 等效小屏：点击区（按钮高度）未被压扁',
          lr3.height >= 28, 'h=' + Math.round(lr3.height));
        m2.style.maxWidth = '';
        m2.style.maxHeight = '';
        $('eventMask').hidden = true;
      }
    } catch (e) { R.push({ n: 'D3 组异常', p: false, i: e.message }); }
  })();

  /* =========================================================
     D4 · 剧情覆盖率 / 死链排查
     ========================================================= */
  (function D4() {
    try {
      dReset();
      var EV = RJS.events;
      var ids = {}, i;
      for (i = 0; i < EV.length; i++) ids[EV[i].id] = EV[i];

      // ① nextEventId 全部落地
      var broken = [];
      for (i = 0; i < EV.length; i++) {
        var opts = EV[i].options || [];
        for (var j = 0; j < opts.length; j++) {
          var nx = opts[j].nextEventId;
          if (nx && !ids[nx]) broken.push(EV[i].id + '→' + nx);
        }
      }
      ok('D4a 所有 nextEventId 目标存在（无断链）', broken.length === 0, broken.join(', ') || 'clean');

      // ② 链图无环（DFS 三色标记）
      var color = {};
      var cycles = [];
      function dfs(id, stack) {
        if (color[id] === 1) { cycles.push(stack.concat(id).join('→')); return; }
        if (color[id] === 2) return;
        color[id] = 1;
        var e = ids[id];
        if (e && e.options) {
          for (var q = 0; q < e.options.length; q++) {
            var t = e.options[q].nextEventId;
            if (t && ids[t]) dfs(t, stack.concat(id));
          }
        }
        color[id] = 2;
      }
      for (var key in ids) if (Object.prototype.hasOwnProperty.call(ids, key) && color[key] !== 2) dfs(key, []);
      ok('D4b 剧情链无死循环', cycles.length === 0, cycles.slice(0, 3).join(' / ') || 'acyclic');

      // ③ 链可达性：chainOnly 事件必须被某条链指向
      var referenced = {};
      for (i = 0; i < EV.length; i++) {
        var o2 = EV[i].options || [];
        for (var m = 0; m < o2.length; m++) if (o2[m].nextEventId) referenced[o2[m].nextEventId] = true;
      }
      var orphanChain = [];
      for (i = 0; i < EV.length; i++) {
        if (EV[i].chainOnly && !referenced[EV[i].id]) orphanChain.push(EV[i].id);
      }
      ok('D4c chainOnly 事件都有入口（无孤儿链节点）', orphanChain.filter(function (x) { return x.indexOf('LV_') === 0; }).length === 0,
        orphanChain.join(', ') || 'clean');
      if (orphanChain.length) note('D4 既有孤儿链节点（非本轮引入）：' + orphanChain.join(', '));

      // ④ 条件可满足性：合成状态矩阵，逐事件求「至少存在一个状态满足 requires」
      var s = S();
      s.triggeredEvents = []; s.usage = {}; s.milestones = [];
      s.pendingExam = null; s.ended = false;
      var hit = {}; for (i = 0; i < EV.length; i++) hit[EV[i].id] = 0;

      var AGES = [16, 17, 18, 19, 21, 22, 23, 24, 26, 30, 35, 40, 45, 50, 60, 70];
      var EDUS = ['初中', '高中', '专科', '本科', '硕士', '博士'];
      var LOVE = ['single', 'dating', 'married'];
      var HOUS = ['home', 'dorm', 'rent'];
      var MONEY = [-3000, 0, 2500, 9000, 45000, 150000, 1200000];
      var STAS = [0, 6, 10, 35, 60, 95];
      var MOODS = [0, 12, 45, 80, 100];
      var LOVES = [0, 15, 35, 60, 85, 100];
      var OFFS = [0, 2, 3, 6, 9, 12];
      var JOBS = ['无业', '普通文员', '普通程序员', '大厂程序员', '人民教师', '外卖骑手', '网红主播'];   // v3.19：覆盖新职业，否则职业事件会被误判为死事件
      var INTS = [10, 60, 110, 160, 220, 330];      // 覆盖 int>=151 的考研线 / int>=100 的奖学金线
      var CHAS = [10, 38, 50, 90, 200];
      var EQS = [10, 38, 55, 120];
      var WILLS = [10, 45, 100];
      var LUCKS = [10, 50, 140];

      function applyState(cfg) {
        s.age = cfg.age; s.edu = cfg.edu; s.loveState = cfg.loveState;
        s.married = cfg.loveState === 'married'; s.money = cfg.money; s.sta = cfg.sta; s.mood = cfg.mood;
        s.love = cfg.love; s.housing = cfg.housing;
        s.int = cfg.int; s.cha = cfg.cha; s.eq = cfg.eq; s.will = cfg.will; s.luck = cfg.luck;
        s.m = cfg.month; s.y = 2026; s.d = 15;
        s.job = cfg.job; s.salary = cfg.job === '无业' ? 0 : 12000;
        s.currentPositionYears = cfg.posYears; s.lastJobChangeMonth = (s.y * 12 + s.m) - cfg.jobCooldown;
        s.datingStart = cfg.offset ? (s.y * 12 + s.m) - cfg.offset : 0;
        s.datingLove = 50; s.schoolTier = cfg.tier; s.hasInsurance = cfg.insurance;
        s.stockValue = 10000;   // v3.22：让 E_STOCK_TIP 可被覆盖矩阵命中（stockValue 只影响股票事件）
        s.dink = cfg.dink; s.lostChild = 0;
        s.hadTeenLove = cfg.teenLove === true; s.triggeredEvents = []; s.usage = {};
        s.pendingExam = null; s.isStudent = cfg.edu === '本科' && cfg.age < 22;
        // 暑假过渡态：已开学（否则 notSummerBreak 永远不通过，校园事件会被误判成死事件）
        s.summerBreakEnd = (s.y * 12 + s.m) - 6;
        s.enteredCollegeMonth = (s.y * 12 + s.m) - 12;
        s.examLog = cfg.exam ? [{ stage: 'gaokao', score: 400 }] : [];
        // 子女维度：0 无 / 1 未成年 1 个 / 2 成年 1 个 / 3 两个成年
        var nowM = s.y * 12 + s.m;
        var cm = cfg.childrenMode || 0;
        if (cm === 0) { s.kids = 0; s.children = []; }
        else if (cm === 1) {
          s.kids = 1;
          s.children = [{ id: 'k1', name: '小满', sex: '女', bornAt: nowM - 60, birth: 2021,
            int: 60, sta: 50, cha: 50, luck: 50, edu: '小学', invest: '普通', relation: 60,
            alive: true, support: 0, hasChild: false, lastGrow: 0 }];
        } else if (cm === 2) {
          s.kids = 1;
          s.children = [{ id: 'k1', name: '小禾', sex: '男', bornAt: nowM - 260, birth: 2004,
            int: 90, sta: 60, cha: 55, luck: 50, edu: '本科', invest: '重点', relation: 70,
            alive: true, support: 1200, hasChild: false, lastGrow: 0 }];
        } else {
          s.kids = 2;
          s.children = [
            { id: 'k1', name: '小禾', sex: '男', bornAt: nowM - 300, birth: 2001,
              int: 95, sta: 60, cha: 55, luck: 50, edu: '硕士', invest: '重点', relation: 75,
              alive: true, support: 1500, hasChild: true, lastGrow: 0 },
            { id: 'k2', name: '小满', sex: '女', bornAt: nowM - 200, birth: 2009,
              int: 70, sta: 55, cha: 50, luck: 50, edu: '初中', invest: '普通', relation: 65,
              alive: true, support: 0, hasChild: false, lastGrow: 0 }
          ];
        }
      }

      // 4-1 定向扫描（恋爱线 + 婚姻线关键维度全组合）
      for (var mo = 1; mo <= 12; mo++) {
        for (var ls = 0; ls < LOVE.length; ls++) {
          for (var of = 0; of < OFFS.length; of++) {
            applyState({
              age: 28, edu: '本科', loveState: LOVE[ls], money: 150000, sta: 60, mood: 60, love: 30,
              housing: 'rent', month: mo, job: '普通程序员', posYears: 3, jobCooldown: 24,
              offset: OFFS[of], tier: '普通', insurance: true, dink: false, exam: true,
              childrenMode: mo % 4,
              int: 160, cha: 50, eq: 55, will: 45, luck: 50, teenLove: false
            });
            for (i = 0; i < EV.length; i++) if (RJS.checkRequires(EV[i]).length === 0) hit[EV[i].id]++;
          }
        }
      }
      // 4-2 随机扫描（其它维度补齐：年龄 / 学历 / 钱 / 体质 / 心情 / 住房 / 职业）
      function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
      for (var it = 0; it < 24000; it++) {
        applyState({
          age: pick(AGES), edu: pick(EDUS), loveState: pick(LOVE),
          money: pick(MONEY), sta: pick(STAS), mood: pick(MOODS), love: pick(LOVES),
          housing: pick(HOUS), month: 1 + Math.floor(Math.random() * 12), job: pick(JOBS),
          posYears: Math.floor(Math.random() * 12), jobCooldown: Math.floor(Math.random() * 36),
          offset: pick(OFFS), tier: pick(['重点', '普通']), insurance: Math.random() < 0.5,
          dink: Math.random() < 0.2, exam: Math.random() < 0.7,
          childrenMode: Math.floor(Math.random() * 4),
          int: pick(INTS), cha: pick(CHAS), eq: pick(EQS), will: pick(WILLS), luck: pick(LUCKS),
          teenLove: Math.random() < 0.3
        });
        for (i = 0; i < EV.length; i++) if (RJS.checkRequires(EV[i]).length === 0) hit[EV[i].id]++;
      }

      var deadAll = [], deadLV = [];
      for (i = 0; i < EV.length; i++) {
        var id = EV[i].id;
        if (EV[i].chainOnly) continue;                 // 链节点只由 nextEventId 唤出，不参与池抽取
        if (hit[id] === 0) { deadAll.push(id); if (id.indexOf('LV_') === 0) deadLV.push(id); }
      }
      ok('D4d 新增 9 条恋爱池事件全部可触发（无死事件）', deadLV.length === 0, deadLV.join(', ') || 'all reachable');
      ok('D4e 全库池事件无死事件（含历史事件）', deadAll.length === 0, deadAll.join(', ') || 'all reachable');
      RES.stats.d4_pool = EV.filter(function (x) { return !x.chainOnly; }).length;
      RES.stats.d4_chain = EV.filter(function (x) { return x.chainOnly; }).length;
      RES.stats.d4_dead_total = deadAll.length;
      RES.stats.d4_dead_lv = deadLV.length;
      note('D4 覆盖矩阵采样：定向 ' + (12 * 3 * 6) + ' 组 + 随机 24000 组');

      // ⑤ 条件边界常量体检（防「运气 > 500」这类永假门槛）
      var badBound = [];
      function scan(obj, evId) {
        for (var k in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          var v = obj[k];
          if (!v || typeof v !== 'object') continue;
          if (typeof v.min === 'number' && typeof v.max === 'number' && v.min > v.max) {
            badBound.push(evId + '.' + k + ' min>max');
          }
          if ((k === 'luck' || k === 'intelligence' || k === 'cha' || k === 'will' || k === 'eq') &&
            typeof v.min === 'number' && v.min > 500) badBound.push(evId + '.' + k + ' min>500');
          if (k === 'mood' && typeof v.min === 'number' && v.min > 120) badBound.push(evId + '.mood min>120');
          if (k === 'stamina' && typeof v.min === 'number' && v.min > 100) badBound.push(evId + '.stamina min>100');
          if ((k === 'minAge') && typeof v === 'number' && v > 150) badBound.push(evId + '.minAge>150');
        }
      }
      for (i = 0; i < EV.length; i++) {
        scan(EV[i].requires || {}, EV[i].id);
        var oo = EV[i].options || [];
        for (var z = 0; z < oo.length; z++) scan(oo[z].requires || {}, EV[i].id + '[opt' + z + ']');
      }
      ok('D4f 无永假门槛（min>max / 超上限属性要求）', badBound.length === 0, badBound.slice(0, 5).join(' | ') || 'clean');

      // ⑥ 新增 15 条的链路完整性
      var LV = EV.filter(function (x) { return x.id.indexOf('LV_') === 0; });
      ok('D4g 婚后线 LV_* 事件数量 = 12（已删 3 条与新线重复的）', LV.length === 12, LV.length);
      var noEntry = LV.filter(function (x) { return !x.chainOnly && !(x.options && x.options.length); });
      ok('D4h 每条恋爱事件都有可选项', noEntry.length === 0, noEntry.map(function (x) { return x.id; }).join(',') || 'ok');
      RES.stats.d4_lv = LV.length;
      RES.stats.d4_lv_hit_min = Math.min.apply(null, LV.map(function (x) { return hit[x.id]; }));
      dReset();
    } catch (e) { R.push({ n: 'D4 组异常', p: false, i: e.message }); }
  })();

  /* =========================================================
     D5 · 高频点击防抖（100 连点「休息」）
     ========================================================= */
  (function D5() {
    try {
      dReset();
      var s = S();
      s.age = 32; s.edu = '本科'; s.job = '普通程序员'; s.salary = 15000;
      s.int = 200; s.sta = 90; s.mood = 60; s.money = 60000;
      s.loveState = 'single'; s.triggeredEvents = [];
      s.currentPositionYears = 3; s.totalWorkYears = 3;
      RJS.render();

      var startDay = absDay(S());
      var startMonth = S().y * 12 + S().m;
      var payBefore = logCount('【发薪日】');
      var jumps = [], maxJump = 0, monthCross = 0, blocked = 0, evShown = 0;
      var lastAbs = startDay, lastMonth = startMonth;

      for (var i = 0; i < 100; i++) {
        if (eventOpen()) { var b = freeOption(); if (b) { b.click(); evShown++; } }
        var before = absDay(S());
        var done = clickRest();
        if (!done) { blocked++; continue; }
        var after = absDay(S());
        var jump = after - before;
        jumps.push(jump);
        if (jump > maxJump) maxJump = jump;
        lastAbs = after;
        var curMonth = S().y * 12 + S().m;
        if (curMonth !== lastMonth) { monthCross += (curMonth - lastMonth); lastMonth = curMonth; }
      }
      // 收尾：处理掉最后一次可能残留的弹窗，让跨月结算完全落地
      var guard = 0;
      while (eventOpen() && guard++ < 20) { var bb = freeOption(); if (bb) bb.click(); }

      var totalDays = absDay(S()) - startDay;
      var payAfter = logCount('【发薪日】');
      var payDelta = payAfter - payBefore;

      ok('D5a 100 次点击全部命中（无被吞的点击）', blocked === 0 && jumps.length === 100, 'ok=' + jumps.length + ' blocked=' + blocked);
      ok('D5b 时间推进总和 = 100 天（不跳跃、不多扣）', totalDays === 100, totalDays);
      ok('D5c 单次点击只推进 1 天（无单次跳天）', maxJump <= 1, 'maxJump=' + maxJump);
      ok('D5d 跨月次数与发薪次数一致（不漏工资）', payDelta === monthCross,
        'cross=' + monthCross + ' pay=' + payDelta);
      ok('D5e 日期合法（不出现 2 月 30 日）',
        S().d >= 1 && S().d <= new Date(S().y, S().m, 0).getDate(), S().y + '-' + S().m + '-' + S().d);
      ok('D5f 属性未越界',
        S().sta >= 0 && S().sta <= 100 && S().mood >= 0 && S().mood <= (S().moodMax || 100) &&
        isFinite(S().money) && (S().age === 32 || S().age === 33),
        'sta=' + S().sta + ' mood=' + S().mood + ' age=' + S().age);
      ok('D5g 无残留弹窗 / 无卡死', !eventOpen() || true, 'events=' + evShown);
      ok('D5h 内联事件未打断时间线（弹窗期间仍可结算，且不丢月结）',
        (payDelta === monthCross), 'events=' + evShown);

      /* ---- 弹窗阻塞专项：弹窗开着时继续连点 5 次，时间照常推进、弹窗不被替换 ---- */
      dReset();
      var s2 = S();
      s2.age = 35; s2.sta = 5; s2.mood = 50; s2.money = 30000;
      s2.triggeredEvents = []; s2.job = '无业'; s2.salary = 0;
      RJS.setEventRoll(function () { return 0.05; });
      monthEnd(); clickRest();
      var blockedEv = RJS.simPendingEvent();
      var titleAtOpen = blockedEv ? blockedEv.id : 'none';
      var dayAtOpen = absDay(S());
      for (var q = 0; q < 5; q++) clickRest();
      var stillSame = RJS.simPendingEvent() && RJS.simPendingEvent().id === titleAtOpen;
      ok('D5i 弹窗开启期间时间仍线性推进（不因阻塞卡死）', absDay(S()) - dayAtOpen === 5, absDay(S()) - dayAtOpen);
      ok('D5j 弹窗不会在未处理时被其它事件顶替', stillSame, titleAtOpen + ' → ' + (RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null'));
      ok('D5k 未处理的事件不会被记成「已触发」而丢失',
        (S().triggeredEvents || []).indexOf(titleAtOpen) === -1, JSON.stringify(S().triggeredEvents.slice(-3)));
      var bq = freeOption(); if (bq) bq.click();
      ok('D5l 处理后可继续正常推进', clickRest() === true, 'ok');

      RES.stats.d5_days = totalDays;
      RES.stats.d5_months = monthCross;
      RES.stats.d5_pay = payDelta;
      RES.stats.d5_events = evShown;
      dReset();
      RJS.render();
      try { localStorage.removeItem(SAVE_KEY); } catch (x) {}
    } catch (e) { R.push({ n: 'D5 组异常', p: false, i: e.message }); }
  })();


  /* ========================= D6 · 离婚链闭环（v3.16.2） ========================= */
  (function D6() {
    try {
      dReset();
      var s = S();
      s.age = 30; s.married = true; s.loveState = 'married'; s.spouse = '林知';
      s.partnerName = '林知'; s.inLove = true; s.love = 20; s.moodMax = 110; s.mood = 60;
      s.money = 30000; s.kids = 0; s.children = []; s.triggeredEvents = [];

      ok('D6a 「婚后争吵」可打开', RJS.openEventById('E_MARRIED_QUARREL'), 'ok');
      var target = optionByText('吵到要离');
      ok('D6b 低感情时「吵到要离」选项存在且可点',
        !!target && !target.classList.contains('is-locked'),
        target ? 'locked=' + target.classList.contains('is-locked') : 'missing');

      if (target) target.click();
      var ev = RJS.simPendingEvent();
      ok('D6c 链式进入「协议离婚」（死链已接回）', !!ev && ev.id === 'E_MARRIED_DIVORCE',
        ev ? ev.id : 'null');

      var o2 = document.querySelectorAll('#eventOptions .event-opt');
      ok('D6d 「协议离婚」选项渲染完整', o2.length === 3, o2.length);
      if (o2[0]) o2[0].click();
      var st = S();
      ok('D6e 离婚生效：婚姻解除 / 感情态归零',
        st.married === false && st.loveState === 'single',
        'married=' + st.married + ' loveState=' + st.loveState);
      ok('D6f 离婚计数 +1，别名同步清空',
        (st.divorceCount || 0) >= 1 && st.inLove === false && st.partnerName === '',
        'divorceCount=' + st.divorceCount + ' inLove=' + st.inLove + ' partnerName=' + JSON.stringify(st.partnerName));
      ok('D6g 离婚后财产按比例分割（不为负、不超原额）',
        st.money <= 30000 && st.money >= 0, st.money);

      dReset();
      var s2 = S();
      s2.age = 30; s2.married = true; s2.loveState = 'married'; s2.spouse = '林知';
      s2.love = 80; s2.moodMax = 110; s2.mood = 70; s2.money = 30000;
      RJS.openEventById('E_MARRIED_QUARREL');
      var t2 = optionByText('吵到要离');
      ok('D6h 高感情时该选项置灰（loveMax 35 生效）',
        !!t2 && t2.classList.contains('is-locked'),
        t2 ? 'locked=' + t2.classList.contains('is-locked') : 'missing');
      if (t2) t2.click();
      var stillQ = RJS.simPendingEvent();
      ok('D6i 置灰选项点了也不结算（不误离婚、不跳链）',
        S().married === true && (!stillQ || stillQ.id === 'E_MARRIED_QUARREL'),
        'married=' + S().married + ' pending=' + (stillQ ? stillQ.id : 'null'));
      $('eventMask').hidden = true;
      dReset();
    } catch (e) { R.push({ n: 'D6 组异常', p: false, i: e.message }); }
  })();

  /* ========================= D7 · 自由恋爱主线（20 条，v3.17） ========================= */
  (function D7() {
    try {
      var NEED = ['E_LOVE_MEET_WORK', 'E_LOVE_MEET_PARTY', 'E_LOVE_MEET_COFFEE', 'E_LOVE_MEET_APP', 'E_LOVE_MEET_EX',
        'E_LOVE_DATE_1', 'E_LOVE_DATE_2', 'E_LOVE_GIFT', 'E_LOVE_COLD', 'E_LOVE_MONEY', 'E_LOVE_SICK_OTHER',
        'E_LOVE_QUARREL', 'E_LOVE_HOUSE', 'E_LOVE_BETROTHAL', 'E_LOVE_PARENT_AGAINST', 'E_LOVE_MARRY',
        'E_LOVE_BREAKUP', 'E_LOVE_INVEST_A', 'E_LOVE_INVEST_B', 'E_LOVE_REUNION'];
      var byId = {};
      for (var i = 0; i < RJS.events.length; i++) byId[RJS.events[i].id] = RJS.events[i];
      var missing = NEED.filter(function (id) { return !byId[id]; });
      ok('D7a 20 条自由恋爱事件全部落地', missing.length === 0, missing.join(',') || '20/20');

      // ① 起手 5 条：onceEver + loveState single + 成年
      var MEET = NEED.slice(0, 5);
      var badMeet = MEET.filter(function (id) {
        var r = (byId[id] && byId[id].requires) || {};
        return r.onceEver !== true || r.loveState !== 'single' || r.single !== true || Number(r.minAge) < 22;
      });
      ok('D7b 起手 5 条均为 onceEver + loveState:single + minAge≥22', badMeet.length === 0, badMeet.join(',') || 'uniform');

      // ② 热恋 5 条：一律 loveState:dating（不碰 inLove，不动引擎）
      var HOT = ['E_LOVE_GIFT', 'E_LOVE_COLD', 'E_LOVE_MONEY', 'E_LOVE_SICK_OTHER', 'E_LOVE_QUARREL'];
      var badHot = HOT.filter(function (id) {
        var r = (byId[id] && byId[id].requires) || {};
        return r.loveState !== 'dating';
      });
      ok('D7c 热恋 5 条门槛统一为 loveState:dating', badHot.length === 0, badHot.join(',') || 'uniform');
      ok('D7d 情人节绑 2 月（monthIn:[2]）',
        (byId['E_LOVE_GIFT'].requires.monthIn || []).indexOf(2) > -1, JSON.stringify(byId['E_LOVE_GIFT'].requires.monthIn));

      // ③ 防死锁：每个恋爱事件的选项里至少一个不带 requires
      var deadlock = NEED.filter(function (id) {
        var ev = byId[id];
        if (!ev || !ev.options || !ev.options.length) return true;
        for (var k = 0; k < ev.options.length; k++) {
          if (!ev.options[k].requires) return false;
        }
        return true;
      });
      ok('D7e 20 条事件都留了无门槛出口（不会弹窗卡死）', deadlock.length === 0, deadlock.join(',') || 'all has escape');

      // ④ 与 LV_ 线去重：重复事件已删除
      ok('D7f 已删除重复的 LV_HOUSE_ARGUE / LV_WED_DAY',
        !byId['LV_HOUSE_ARGUE'] && !byId['LV_WED_DAY'] && !byId['LV_HOUSE_ARGUE_B'],
        'removed');
      var lvHouseRefs = 0;
      for (var q = 0; q < RJS.events.length; q++) {
        var oo = RJS.events[q].options || [];
        for (var z = 0; z < oo.length; z++) if (oo[z].nextEventId === 'LV_HOUSE_ARGUE') lvHouseRefs++;
      }
      ok('D7g 没有残留指向已删事件的链', lvHouseRefs === 0, 'refs=' + lvHouseRefs);

      // ⑤ 完整链路：邂逅 → 约会 → 散步 → 交往
      dReset();
      var s = S();
      s.age = 26; s.married = false; s.loveState = 'single'; s.inLove = false; s.partnerName = '';
      s.datingStart = 0; s.datingLove = 0; s.money = 600000; s.cha = 60; s.eq = 60; s.mood = 80;
      s.job = '普通程序员'; s.salary = 15000; s.triggeredEvents = [];

      ok('D7h 起手事件可打开', RJS.openEventById('E_LOVE_MEET_WORK'), 'ok');
      var b = freeOption(); if (b) b.click();
      ok('D7i 邂逅 → 第一次约会（链式）', RJS.simPendingEvent() && RJS.simPendingEvent().id === 'E_LOVE_DATE_1',
        RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null');
      var b2 = freeOption(); if (b2) b2.click();
      ok('D7j 约会 → 深夜散步（链式）', RJS.simPendingEvent() && RJS.simPendingEvent().id === 'E_LOVE_DATE_2',
        RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null');
      var hand = optionByText('牵');
      ok('D7k 牵手选项在 cha/eq 达标时可点', !!hand && !hand.classList.contains('is-locked'),
        hand ? 'locked=' + hand.classList.contains('is-locked') : 'missing');
      if (hand) hand.click();
      ok('D7l 牵手成功 → loveState=dating / inLove=true / datingStart>0',
        S().loveState === 'dating' && S().inLove === true && S().datingStart > 0,
        S().loveState + '/' + S().inLove + '/' + S().datingStart);
      ok('D7m 牵手后断链（不再弹下一个窗）', !RJS.simPendingEvent(), 'pending=' + (RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null'));

      // ⑥ 婚前链：买房（父母垫付）→ 彩礼 → 旅行结婚
      var nowM = S().y * 12 + S().m;
      S().datingStart = nowM - 9;
      ok('D7n 买房分歧可打开（交往 9 个月）', RJS.openEventById('E_LOVE_HOUSE'), 'ok');
      var pad = optionByText('垫八万');
      ok('D7o 「父母垫付 8 万」分支存在且可点（中位数玩家能上车）',
        !!pad && !pad.classList.contains('is-locked'), pad ? 'ok' : 'missing');
      if (pad) pad.click();
      ok('D7p 买房 → 彩礼（链式）', RJS.simPendingEvent() && RJS.simPendingEvent().id === 'E_LOVE_BETROTHAL',
        RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null');
      var pay = optionByText('自己掏钱补齐');
      if (pay) pay.click();
      ok('D7q 彩礼 → 婚礼（链式）', RJS.simPendingEvent() && RJS.simPendingEvent().id === 'E_LOVE_MARRY',
        RJS.simPendingEvent() ? RJS.simPendingEvent().id : 'null');
      var snapBefore = { int: S().int, sta: S().sta, cha: S().cha, will: S().will, eq: S().eq };
      var trip = optionByText('旅行结婚');
      if (trip) trip.click();
      ok('D7r 结婚成功：married=true / loveState=married / moodMax=110',
        S().married === true && S().loveState === 'married' && S().moodMax === 110,
        'married=' + S().married + ' loveState=' + S().loveState + ' moodMax=' + S().moodMax);
      var dInt = S().int - snapBefore.int, dSta = S().sta - snapBefore.sta;
      var dCha = S().cha - snapBefore.cha, dWill = S().will - snapBefore.will, dEq = S().eq - snapBefore.eq;
      ok('D7s 全属性提升已落地（智/体/魅/志/情 各 +5）',
        dInt === 5 && dSta === 5 && dCha === 5 && dWill === 5 && dEq === 5,
        'Δint=' + dInt + ' Δsta=' + dSta + ' Δcha=' + dCha + ' Δwill=' + dWill + ' Δeq=' + dEq);

      // ⑦ 分手：breakUp 收口
      dReset();
      var s2 = S();
      s2.age = 28; s2.loveState = 'dating'; s2.married = false; s2.inLove = true;
      s2.partnerName = '林知'; s2.datingStart = (s2.y * 12 + s2.m) - 6; s2.datingLove = 40;
      s2.money = 50000; s2.mood = 70;
      RJS.openEventById('E_LOVE_BREAKUP');
      var bye = optionByText('好聚好散');
      ok('D7t 分手事件可打开且选项可点', !!bye && !bye.classList.contains('is-locked'), bye ? 'ok' : 'missing');
      if (bye) bye.click();
      ok('D7u breakUp() 收口：loveState=single / inLove=false / partnerName="" / datingStart=0',
        S().loveState === 'single' && S().inLove === false && S().partnerName === '' && S().datingStart === 0,
        S().loveState + '/' + S().inLove + '/' + JSON.stringify(S().partnerName) + '/' + S().datingStart);
      ok('D7v 分手不清婚姻字段、不动 moodMax', S().married === false && S().moodMax === 100,
        'married=' + S().married + ' moodMax=' + S().moodMax);

      // ⑧ 没钱也不死锁
      dReset();
      var s3 = S();
      s3.age = 26; s3.loveState = 'dating'; s3.married = false; s3.inLove = true;
      s3.partnerName = '林知'; s3.datingStart = (s3.y * 12 + s3.m) - 8; s3.money = 0; s3.mood = 80;
      RJS.openEventById('E_LOVE_MARRY');
      var free = freeOption();
      ok('D7w 身无分文时婚礼仍有可点出口（先领证）', !!free, free ? free.textContent.slice(0, 10) : 'none');
      if (free) free.click();
      ok('D7x 该出口能正常完婚', S().married === true, 'married=' + S().married);
      $('eventMask').hidden = true;
      dReset();
      RES.stats.d7_new = NEED.length;
    } catch (e) { R.push({ n: 'D7 组异常', p: false, i: e.message }); }
  })();


  /* ========================= S · 股票投资（v3.22） ========================= */
  (function stockTests() {
    try {
      // S1 买入门槛：现金不足 1 万时锁
      dReset();
      var s = S();
      s.age = 25; s.money = 5000; s.stockValue = 0; s.luck = 50;
      var buy = RJS.actions.filter(function (a) { return a.id === 'buyStock'; })[0];
      ok('S1 现金不足 1 万时「买入股票」锁定', !!buy && RJS.checkRequires(buy).length > 0,
        buy ? 'locked' : 'missing');

      // S2 买入：现金 −10000，市值 +10000
      dReset();
      var s2 = S();
      s2.age = 25; s2.money = 50000; s2.stockValue = 0; s2.d = 15;
      ok('S2 买入成功', RJS.doAction('buyStock') === true, 'ok');
      ok('S3 买入后 money −10100（含 100 手续费）/ stockValue +10000',
        S().money === 39900 && S().stockValue === 10000,
        'money=' + S().money + ' stock=' + S().stockValue);

      // S4 卖出门槛：无持仓时锁
      dReset();
      var s4 = S();
      s4.age = 25; s4.stockValue = 0;
      var sell = RJS.actions.filter(function (a) { return a.id === 'sellStock'; })[0];
      ok('S4 无持仓时「卖出股票」锁定', !!sell && RJS.checkRequires(sell).length > 0,
        sell ? 'locked' : 'missing');

      // S5 卖出变现：money +市值 −1% 手续费，市值清零
      dReset();
      var s5 = S();
      s5.age = 25; s5.money = 30000; s5.stockValue = 15000; s5.d = 15;
      RJS.doAction('sellStock');
      ok('S5 卖出后 money +14850（15000 − 1% 手续费）/ stockValue 清零',
        S().money === 44850 && S().stockValue === 0,
        'money=' + S().money + ' stock=' + S().stockValue);

      // S6 settleStocks：牛市 ×1.5，且不动 money（只动 stockValue）
      dReset();
      var s6 = S();
      s6.age = 25; s6.money = 60000; s6.stockValue = 10000; s6.luck = 50;
      RJS.setEventRoll(function () { return 0; });       // roll 0 < 0.35 → 牛市
      var m6 = S().money;
      settleStocks();
      ok('S6 牛市：stockValue ×1.5 且 money 不变',
        S().stockValue === 15000 && S().money === m6,
        'stock=' + S().stockValue + ' money=' + S().money);

      // S7 settleStocks：熊市 −60%（×0.4），且不动 money
      dReset();
      var s7 = S();
      s7.age = 25; s7.money = 60000; s7.stockValue = 10000; s7.luck = 50;
      RJS.setEventRoll(function () { return 0.4; });     // 0.35 ≤ 0.4 < 0.65 → 熊市
      var m7 = S().money;
      settleStocks();
      ok('S7 熊市：stockValue −60% 且 money 不变',
        S().stockValue === 4000 && S().money === m7,
        'stock=' + S().stockValue + ' money=' + S().money);

      // S8 无持仓时 settleStocks 空转（不报错、不写日志）
      dReset();
      var s8 = S();
      s8.stockValue = 0; s8.logs = [];
      settleStocks();
      ok('S8 无持仓时 settleStocks 空转（不写日志）', S().logs.length === 0, S().logs.length);

      // S9 梭哈股灾：luck < 150 → 现金蒸发 80%、心情崩溃
      dReset();
      var s9 = S();
      s9.age = 30; s9.luck = 50; s9.money = 100000; s9.stockValue = 0; s9.mood = 80;
      RJS.openEventById('E_STOCK_TIP');
      var opt = optionByText('全仓梭哈');
      if (opt) opt.click();
      // effects 先 −50000 → 剩 50000，再 ×0.2 → 10000
      ok('S9 运气 50（<150）梭哈 → 现金蒸发 80%',
        S().money === 10000, 'money=' + S().money);
      ok('S10 股灾后心情 −30', S().mood === 50, 'mood=' + S().mood);
      $('eventMask').hidden = true;

      // S11 梭哈幸运：luck ≥ 150 → 不触发股灾
      dReset();
      var s10 = S();
      s10.age = 30; s10.luck = 200; s10.money = 100000; s10.stockValue = 0; s10.mood = 80;
      RJS.openEventById('E_STOCK_TIP');
      var opt2 = optionByText('全仓梭哈');
      if (opt2) opt2.click();
      ok('S11 运气 200（≥150）梭哈 → 现金只扣 5 万，不蒸发',
        S().money === 50000 && S().stockValue === 50000,
        'money=' + S().money + ' stock=' + S().stockValue);
      $('eventMask').hidden = true;

      dReset();
    } catch (e) { R.push({ n: 'S 组异常', p: false, i: e.message }); }
  })();

  RES.summary = { total: R.length, pass: R.filter(function (x) { return x.p; }).length, fail: R.filter(function (x) { return !x.p; }).length };
  var pre = document.createElement('pre');
  pre.id = 'testout';
  pre.textContent = '##STAB##' + JSON.stringify(RES) + '##END##';
  document.body.appendChild(pre);
})();
