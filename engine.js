'use strict';

  function findAction(id) {
    for (var i = 0; i < actionsData.length; i++) {
      if (actionsData[i].id === id) return actionsData[i];
    }
    return null;
  }

  /* ================= [引擎层] 通用条件校验引擎 =================
     requires 的每一项按「键名」分两类处理：
       1) 键名在 ATTRS 里（mood / money / stamina / intelligence）→ 属性区间规则 {min,max}
       2) 键名在 REQUIRE_RULES 里 → 通用规则（年龄 / 次数 / 学历 …）
     未知键名直接忽略，加新规则只要往 REQUIRE_RULES 里塞一个函数。
     每条规则返回 null（通过）或 { key, title, detail, suffix } 描述未通过原因。 */

  // 当天键 / 当周键（周一为一周起点），用于次数限制
  function dayKey() { return state.y + '-' + pad2(state.m) + '-' + pad2(state.d); }

  function weekKeyOf(y, m, d) {
    var dt = new Date(y, m - 1, d);
    var offset = (dt.getDay() + 6) % 7;            // 周一 → 0
    dt.setDate(dt.getDate() - offset);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  function weekKey() { return weekKeyOf(state.y, state.m, state.d); }

  // 绝对月数（跨年也单调递增），用来算「距上次工作变动几个月」
  function absMonth() { return state.y * 12 + (state.m - 1); }

  function monthsSinceJobChange() {
    if (!state.lastJobChangeMonth) return 999;          // 从没换过工作
    return absMonth() - state.lastJobChangeMonth;
  }

  function markJobChange() { state.lastJobChangeMonth = absMonth(); }

  // 职业晋升树：next = 下一级，req = 晋升门槛（工龄 / 智力）
  function getAge() { return Math.max(0, Math.round(Number(state.age) || 0)); }

  var REQUIRE_RULES = {
    // 最小年龄：未满 18 岁，无法打工。
    minAge: function (v) {
      var age = getAge(), need = Number(v);
      if (!isFinite(need) || age >= need) return null;
      return {
        key: 'minAge', title: '年龄不足',
        detail: '未满 ' + need + ' 岁（当前 ' + age + ' 岁）',
        suffix: true                                  // 结尾接「，无法XX。」
      };
    },
    // 最大年龄
    maxAge: function (v) {
      var age = getAge(), limit = Number(v);
      if (!isFinite(limit) || age <= limit) return null;
      return {
        key: 'maxAge', title: '年龄超限',
        detail: '已超过 ' + limit + ' 岁（当前 ' + age + ' 岁）',
        suffix: true
      };
    },
    // 每天一次（只有显式 true 才生效，false = 不限制）
    oncePerDay: function (v, act) {
      if (v !== true) return null;
      var last = state.usage[act.id];
      if (!last || last.day !== dayKey()) return null;
      return {
        key: 'oncePerDay', title: '今日已完成',
        detail: '今天已经做过「' + act.name + '」了',
        suffix: false                                 // 本身就是完整一句
      };
    },
    // 每周一次（周一 ~ 周日）
    oncePerWeek: function (v, act) {
      if (v !== true) return null;
      var last = state.usage[act.id];
      if (!last || last.week !== weekKey()) return null;
      return {
        key: 'oncePerWeek', title: '本周已完成',
        detail: '本周已经做过「' + act.name + '」了',
        suffix: false
      };
    },
    // 在职 / 待业
    employed: function (v) {
      if (v !== true) return null;
      if (state.salary > 0) return null;
      return { key: 'employed', title: '暂无工作', detail: '你现在还没有工作', suffix: true };
    },
    unemployed: function (v) {
      if (v !== true) return null;
      if (!(state.salary > 0)) return null;
      return { key: 'unemployed', title: '在职中', detail: '你已经入职「' + state.job + '」了', suffix: true };
    },
    // 距上次工作变动必须满 N 个月（跳槽冷却）
    jobCooldown: function (v) {
      var need = Number(v) || 12;
      var cur = monthsSinceJobChange();
      if (cur >= need) return null;
      return {
        key: 'jobCooldown', title: '跳槽冷却中',
        detail: '刚换工作不到一年（已过 ' + cur + ' 个月，需满 ' + need + ' 个月），频繁跳槽会被HR拉黑',
        suffix: false
      };
    },
    // 当前岗位必须熬满 N 年
    minPositionYears: function (v) {
      var need = Number(v), cur = state.currentPositionYears;
      if (!isFinite(need) || cur >= need) return null;
      return {
        key: 'minPositionYears', title: '岗位资历不足',
        detail: '当前岗位才 ' + cur + ' 年（需要满 ' + need + ' 年）', suffix: true
      };
    },
    // 一生只发生一次（用 state.usage[id].ever 记录）
    onceEver: function (v, ev) {
      if (v !== true) return null;
      var id = ev && ev.id;
      var done = (state.triggeredEvents || []).indexOf(id) > -1
        || (state.usage[id] && state.usage[id].ever);
      if (done) {
        return { key: 'onceEver', title: '已经历过', detail: '这件事已经发生过了', suffix: true };
      }
      return null;
    },
    // 只在指定月份出现，例如 monthIn: [6, 7, 8]
    monthIn: function (v) {
      var list = Array.isArray(v) ? v : [v];
      if (list.indexOf(state.m) > -1) return null;
      return {
        key: 'monthIn', title: '时令不符',
        detail: '只在 ' + list.map(function (m) { return m + ' 月'; }).join(' / ')
          + '出现（当前 ' + state.m + ' 月）',
        suffix: true
      };
    },
    // 避开指定月份，例如 monthNotIn: [6, 7, 8]
    monthNotIn: function (v) {
      var list = Array.isArray(v) ? v : [v];
      if (list.indexOf(state.m) === -1) return null;
      return {
        key: 'monthNotIn', title: '时令不符',
        detail: '不会在 ' + list.map(function (m) { return m + ' 月'; }).join(' / ')
          + '出现（当前 ' + state.m + ' 月）',
        suffix: true
      };
    },
    // 岗位条件：'not_null' 表示只要在职；字符串表示指定岗位；数组表示其中任一
    job: function (v) {
      var cur = state.job || '无业';
      if (v === 'not_null' || v === 'any') {
        if (state.salary > 0) return null;
        return { key: 'job', title: '需要在职', detail: '你现在无业', suffix: true };
      }
      if (Array.isArray(v)) {
        if (v.indexOf(cur) > -1) return null;
        return { key: 'job', title: '岗位不符',
                 detail: '需要「' + v.join(' / ') + '」岗位（当前「' + cur + '」）', suffix: true };
      }
      if (typeof v === 'string') {
        if (cur === v) return null;
        return { key: 'job', title: '岗位不符',
                 detail: '需要「' + v + '」岗位（当前「' + cur + '」）', suffix: true };
      }
      return null;
    },
    // 还能往下降（不是最低岗位）
    demotable: function (v) {
      if (v !== true) return null;
      var c = CAREER[state.job];
      if (c && c.prev) return null;
      return {
        key: 'demotable', title: '已是最低岗位',
        detail: '「' + state.job + '」已经是最低级，没有更低的岗位可调', suffix: true
      };
    },
    // 还有上升空间
    promotable: function (v) {
      if (v !== true) return null;
      var c = CAREER[state.job];
      if (c && c.next) return null;
      return {
        key: 'promotable', title: '已到顶',
        detail: '「' + state.job + '」已经没有更高的位置了', suffix: true
      };
    },
    // 必须已经参加过统一高考（复读用）
    alreadyExam: function (v) {
      if (v !== true) return null;
      var list = state.examLog || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].stage === 'gaokao') return null;
      }
      return { key: 'alreadyExam', title: '尚未参加高考', detail: '先参加 18 岁的统一高考', suffix: false };
    },
    // 学历门槛（最低要求）：minEdu: '本科' → 本科及以上都行
    minEdu: function (v) {
      var need = String(v);
      var needRank = EDU_RANK[need];
      if (needRank === undefined) return null;                 // 未知学历要求忽略
      var cur = state.edu || '无';
      var curRank = EDU_RANK[cur];
      if (curRank !== undefined && curRank >= needRank) return null;
      return {
        key: 'minEdu', title: '学历不足',
        detail: '需要「' + need + '」及以上学历（当前「' + cur + '」）',
        suffix: true
      };
    },
    // 婚姻系统（v3.0）：single:true 要求未婚；married:true 要求已婚
    single: function (v) {
      if (v !== true || !state.married) return null;
      return { key: 'single', title: '已婚', detail: '你已经成家了', suffix: true };
    },
    married: function (v) {
      if (v !== true || state.married) return null;
      return { key: 'married', title: '未婚', detail: '还没有成家', suffix: true };
    },
    // 再婚冷却（v3.0.1）：距上次婚变不足 N 个月，不能触发相亲 / 再婚
    marryCooldown: function (v) {
      var need = Number(v) || MARRY_COOLDOWN;
      var last = Number(state.lastMarryMonth) || 0;
      if (!last) return null;                      // 从没结过婚：不设冷却
      var passed = (state.y * 12 + state.m) - last;
      if (passed >= need) return null;
      return {
        key: 'marryCooldown', title: '婚变冷却中',
        detail: '距上次婚变才 ' + passed + ' 个月（需满 ' + need + ' 个月）',
        suffix: true
      };
    },
    // 有存活子女（v3.1）
    hasChild: function (v) {
      if (v !== true) return null;
      if (livingChildren().length > 0) return null;
      return { key: 'hasChild', title: '没有孩子', detail: '你还没有孩子', suffix: true };
    },
    // 有已成年的孩子
    adultChild: function (v) {
      if (v !== true) return null;
      var list = livingChildren();
      for (var i = 0; i < list.length; i++) if (childAge(list[i]) >= CHILD_LEGAL_AGE) return null;
      return { key: 'adultChild', title: '孩子还小', detail: '孩子还没成年', suffix: true };
    },
    // 感情值上限（感情太好的时候不该出「裂痕」这类事件）
    loveMax: function (v) {
      if (!state.married) return null;
      var cap = Number(v);
      if (!isFinite(cap) || state.love <= cap) return null;
      return { key: 'loveMax', title: '感情尚可', detail: '当前感情值 ' + state.love + '，还不到这一步', suffix: true };
    },
    // 学历白名单：['本科','硕士'] 命中其一即可
    education: function (v) {
      var need = Array.isArray(v) ? v : [v];
      if (!need.length) return null;
      var cur = state.edu || '无';
      if (need.indexOf(cur) > -1) return null;
      return {
        key: 'education', title: '学历不足',
        detail: '需要「' + need.join(' / ') + '」学历（当前「' + cur + '」）',
        suffix: true
      };
    },
    // 早恋互斥（v3.5.3）：高中已经谈过，不再触发「初恋」
    notTeenLove: function (v) {
      if (v !== true) return null;
      if (!state.hadTeenLove) return null;
      return {
        key: 'notTeenLove', title: '已有早恋经历',
        detail: '你在高中已经谈过一场了，大学里不会再为「初恋」心动',
        suffix: true
      };
    },
    // 院校档次（v3.6）：'重点' = 985/211，'普通' = 普通本科院校
    schoolTier: function (v) {
      var need = Array.isArray(v) ? v : [v];
      var cur = state.schoolTier || '普通';
      if (need.indexOf(cur) > -1) return null;
      return {
        key: 'schoolTier', title: '院校档次不足',
        detail: '需要「' + need.join(' / ') + '」院校（当前「' + cur + '」）',
        suffix: true
      };
    },
    // 在校生（v3.7）：本科/专科且 <22 岁，动态判定（不读 state.isStudent，避免不同步）
    isStudent: function (v) {
      var s = (state.edu === '本科' || state.edu === '专科') && getAge() < 22;
      if (v === true) {
        if (s) return null;
        return { key: 'isStudent', title: '已不是在校生', detail: '你已经毕业或离开校园了', suffix: true };
      }
      if (v === false) {
        if (!s) return null;
        return { key: 'isStudent', title: '在校生', detail: '在校大学生不能做这件事（先完成学业）', suffix: true };
      }
      return null;
    },
    // 居住状态（v3.5.4）：'dorm' 宿舍 / 'rent' 出租屋，事件按此隔离
    housing: function (v) {
      var cur = state.housing || 'home';
      if (cur === v) return null;
      var label = { home: '住在家里', dorm: '住宿舍', rent: '租房子' };
      return {
        key: 'housing', title: '居住状态不符',
        detail: '需要「' + (label[v] || v) + '」（当前「' + (label[cur] || cur) + '」）',
        suffix: true
      };
    },
    // 感情状态（v3.7）：'single' 单身 / 'dating' 交往中 / 'married' 已婚
    loveState: function (v) {
      var need = Array.isArray(v) ? v : [v];
      var cur = state.loveState;
      if (cur !== 'dating' && cur !== 'married') cur = 'single';   // undefined/旧档 → single
      if (need.indexOf(cur) > -1) return null;
      var label = { single: '单身', dating: '交往中', married: '已婚' };
      return {
        key: 'loveState', title: '感情状态不符',
        detail: '当前处于「' + (label[cur] || cur) + '」阶段，不能触发这件事',
        suffix: true
      };
    },
    // 交往时长（v3.7）：距 startDating 满 N 个月才满足（领证用）
    datingMonths: function (v) {
      var need = Number(v) || 0;
      if (!state.datingStart) {
        return { key: 'datingMonths', title: '尚未交往', detail: '先通过相亲或旧情复燃开始一段感情', suffix: true };
      }
      var passed = nowMonth() - state.datingStart;
      if (passed >= need) return null;
      return {
        key: 'datingMonths', title: '交往尚浅',
        detail: '才交往 ' + passed + ' 个月（需满 ' + need + ' 个月）',
        suffix: true
      };
    },
    // 高考后暑假过渡态（v3.7）：还没开学，屏蔽大学校园生活事件
    notSummerBreak: function (v) {
      if (v !== true) return null;
      if (isSummerBreakNow()) {
        return { key: 'notSummerBreak', title: '暑假过渡期', detail: '刚高考完还没开学，校园生活尚未开始', suffix: true };
      }
      return null;
    },
    // 未购买医保（v3.13）：购买医保行动用，已买则锁定
    noInsurance: function (v) {
      if (v !== true) return null;
      if (!state.hasInsurance) return null;
      return { key: 'noInsurance', title: '已购买', detail: '你已经买过医疗保险了', suffix: true };
    },
    // v3.24：房价门槛（方案 B）。入参 base = 名义房价，实际判定 money >= round(base × houseFactor)
    houseMoney: function (v) {
      var base = Number(v);
      if (!isFinite(base) || base <= 0) return null;
      var need = houseCost(base);
      if (state.money >= need) return null;
      return {
        key: 'houseMoney', title: '首付不足',
        detail: '需要 ' + need + ' 元（当前 ' + state.money + ' 元，已按城市房价折算）',
        suffix: true
      };
    }
  };

  /* ================= [数据层] v3.7 状态机辅助函数（只读写 state 新字段，不碰引擎） ================= */

  // 在校生统一判定（与 REQUIRE_RULES.isStudent 同源，避免两处漂移）
  function isStudentNow() {
    return (state.edu === '本科' || state.edu === '专科') && getAge() < 22;
  }

  // 高考后暑假过渡态：懒初始化 + 到期自动清除，只读/写 state 新字段
  function isSummerBreakNow() {
    if (!state.enteredCollegeMonth) {
      if (isStudentNow() && state.housing === 'dorm') {
        state.enteredCollegeMonth = nowMonth();
        state.summerBreakEnd = nowMonth() + SUMMER_BREAK_MONTHS;
      }
    }
    if (state.summerBreakEnd && nowMonth() < state.summerBreakEnd) {
      state.isSummerBreak = true;
      return true;
    }
    state.isSummerBreak = false;
    return false;
  }

  // 休学跳年：只推进日历与常规结算，不抽事件（休学在外，没有校园事件）
  function skipMonths(n) {
    var total = Math.max(1, Math.round(Number(n) || 12));
    for (var i = 0; i < total; i++) {
      if (state.ended) break;
      var d = new Date(state.y, state.m - 1, 1);
      d.setMonth(d.getMonth() + 1);
      state.y = d.getFullYear();
      state.m = d.getMonth() + 1;
      var dim = daysInMonth(state.y, state.m);
      if (state.d > dim) state.d = dim;
      monthlySettle();
      if (state.m === 1) yearlySettle();
      if (state.ended) break;
    }
    clampStats();
  }

  // 开始交往：写入感情状态与起始月份（相亲/旧情复燃成功后调用）
  function startDating() {
    state.loveState = 'dating';
    state.datingStart = nowMonth();
    state.inLove = true;                                   // v3.16：别名同步
    if (!state.partnerName) state.partnerName = spouseName();
    addLog('event', '【恋爱】你们正式开始交往了。' + (state.partnerName ? '（' + state.partnerName + '）' : ''));
  }

  // 返回「未满足条件」的数组，空数组 = 全部满足、可执行
  function checkRequires(act) {
    var miss = [];
    var req = act && act.requires;
    if (!req) return miss;

    for (var key in req) {
      if (!Object.prototype.hasOwnProperty.call(req, key)) continue;
      var value = req[key];

      // ① 属性区间规则
      var meta = ATTRS[key];
      if (meta) {
        var rule = value || {};
        var cur = state[meta.key];
        var needMin = typeof rule.min === 'number';
        var needMax = typeof rule.max === 'number';
        var okMin = !needMin || cur >= rule.min;
        var okMax = !needMax || cur <= rule.max;
        if (okMin && okMax) continue;

        miss.push({
          key: key,
          title: meta.label + (okMin ? '过高' : '不足'),   // 【心情不足】/【心情过高】
          detail: okMin
            ? '当前' + meta.label + ' ' + cur + '，高于上限 ' + rule.max
            : '当前' + meta.label + ' ' + cur + '，未达到 ' + rule.min,
          suffix: true,
          style: 'attr'
        });
        continue;
      }

      // ② 通用规则
      var fn = REQUIRE_RULES[key];
      if (!fn) continue;                                  // 未知键名忽略，不炸
      var res = fn(value, act);
      if (res) miss.push(res);
    }
    return miss;
  }

  // 未满足条件的短标签，供 title 提示 / tooltip 复用
  function missLabel(m) { return m.title + '：' + m.detail; }

  // 生成提示文案。行动可用 denyText 覆盖默认措辞（按规则 key 指定整句）。
  function lockText(act, miss) {
    var m = miss[0];
    var custom = act && act.denyText && act.denyText[m.key];
    if (typeof custom === 'function') custom = custom(act, m);   // 支持动态措辞
    var t;

    if (custom) {
      t = custom;                                       // 数据里写了整句就用整句
    } else if (m.style === 'attr') {
      t = '【' + m.title + '】' + m.detail + '，无法' + act.name + '。';
    } else if (m.suffix) {
      t = m.detail + '，无法' + act.name + '。';          // 未满 18 岁（当前 16 岁），无法打工。
    } else {
      t = m.detail + '。';                               // 今天已经做过「打工」了。
    }

    if (miss.length > 1) {
      t = t.replace(/。$/, '') + '（另有 ' + (miss.length - 1) + ' 项条件未满足）。';
    }
    return t;
  }

  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var dirty = true;
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function weekdayOf(y, m, d) { return WEEK[new Date(y, m - 1, d).getDay()]; }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // 每月 4 回合：1-3 回合各 7 天，第 4 回合为当月剩余天数
  function roundInfo() {
    var dim = daysInMonth(state.y, state.m);
    var n, start, end;
    if (state.d <= 7)       { n = 1; start = 1;  end = 7; }
    else if (state.d <= 14) { n = 2; start = 8;  end = 14; }
    else if (state.d <= 21) { n = 3; start = 15; end = 21; }
    else                    { n = 4; start = 22; end = dim; }
    return { n: n, start: start, end: end, left: end - state.d + 1, size: end - start + 1 };
  }

  /* ================= [引擎层] 状态 ================= */
  var START_AGE = 16;                                  // 开局年龄
  var START_EDU = '高中';                               // 开局学历

  function newState() {
    var t = new Date();
    var talents = rollTalents(2);                    // 先天：开局随机抽 2 个
    var s = {
      v: 1,
      y: t.getFullYear(),
      m: t.getMonth() + 1,
      d: t.getDate(),
      int: 10,
      sta: 10,
      cha: 10,                                       // 魅力
      will: 10,                                        // 心志
      eq: 10,                                          // 情商
      luck: 10,                                        // 运气
      money: 2800,
      mood: 80,
      stockValue: 0,        // v3.22：股票市值（买入即 +1 万成本，settleStocks 每月按运气/随机涨跌）
      city: 'normal',       // v3.24：出生城市（默认普通城市，三系数全 1.0）
      housing: 'home',    // v3.5.4：居住状态 home/dorm/rent（开局住家，上大学→dorm，工作→rent）
      isStudent: false,   // v3.7：在校生（本科/专科且 <22 岁），由规则动态判定
      /* --- 婚姻系统（v3.0）：全部为新增字段，旧档由 sanitize 补默认值 --- */
      married: false,        // 是否已婚
      hadTeenLove: false,    // 高中是否谈过恋爱（v3.5.3：早恋互斥初恋用）
      loveState: 'single',   // v3.7：感情状态 single/dating/married
      /* --- v3.16：恋爱线状态别名（纯追加字段，不参与任何既有判定） --- */
      inLove: false,         // 是否在恋爱关系中（= loveState 为 dating / married）
      partnerName: '',       // 伴侣名（交往中=对方名字，婚后 = spouse）
      datingStart: 0,        // v3.7：开始交往的绝对月数（0=未交往）
      datingLove: 0,         // v3.9：恋爱好感度 0-100
      isSummerBreak: false,  // v3.7：高考后暑假过渡态
      enteredCollegeMonth: 0,// v3.7：考入大学的绝对月数（懒初始化）
      summerBreakEnd: 0,     // v3.7：暑假结束的绝对月数
      firstSalary: false,    // v3.7：是否已触发「第一笔工资」
      hasInsurance: false,   // v3.13：是否已购买医疗保险
      spouse: '',            // 配偶名字
      marriedAt: 0,          // 结婚绝对月数（y*12+m）
      love: 50,              // 感情值 0-100
      kids: 0,               // 子女数 0-3
      divorceCount: 0,       // 离婚次数
      familyCost: 0,         // 上月家用（UI 显示用）
      coldMonths: 0,         // 连续冷战月数（离婚判定）
      moodMax: 100,          // 心情上限：婚后 110，每多一个孩子 +5（封顶 120）
      lastMarryMonth: 0,     // 上次婚变月份（再婚冷却）
      /* --- 裁员缓冲（v3.3）：被裁后 3 个月按原月薪 50% 发失业金 --- */
      severancePay: 0,       // 每月失业金金额
      severanceLeft: 0,      // 还能领几个月
      /* --- 子女养育（v3.1）：kids 是派生计数，children 才是真相 --- */
      children: [],          // [{ id, name, sex, bornAt, birth, int, sta, cha, luck, edu, invest, relation, alive, support, hasChild, lastGrow }]
      dink: false,           // 是否选择了丁克
      lostChild: 0,          // 失去的孩子数（失孤结局用）
      supportIncome: 0,      // 上月子女反哺（UI 展示用）
      talents: talents,                                // [{ id, level }]
      school: '',                                      // 当前学校名
      schoolTier: '普通',                              // 重点 / 普通 / 职高
      schoolBonus: 0,                                  // 高考加分（学校档次）
      examLog: [],                                     // 历次升学考核
      milestones: [],                                  // 已触发的年龄节点
      pendingExam: null,                               // 排队中的考核（进存档）
      age: START_AGE,                                  // 年龄：每年 1 月 1 日自动 +1
      edu: START_EDU,                                  // 学历：高中 → 专科/本科 → …
      job: '无业',                                      // 当前职业
      salary: 0,                                       // 当前月薪（跨月自动发放）
      hopCount: 0,                                     // 跳槽次数（决定涨薪衰减）
      totalWorkYears: 0,                               // 总工龄：在职就涨（年终奖用），只被跳槽/辞职清零
      currentPositionYears: 0,                         // 当前岗位工龄：晋升门槛用，晋升/跳槽/辞职清零
      lastJobChangeMonth: 0,                           // 上次入职/跳槽/辞职的绝对月数（年×12+月-1），0 = 从未
      triggeredEvents: [],                             // 已触发过的事件 id（一次性事件用）
      studyCarry: 0,                                   // 智力递减收益的小数余量
      deathStrikes: 0,                                 // 濒死计数：钱不够时抢救两次即结束
      hospitalCount: 0,                                // v3.9：累计住院次数（达到阈值才猝死）
      ended: false,                                    // 人生是否已结束
      endingId: '',                                    // 达成的结局 ID
      endReason: '',                                   // 结束原因（age / health / manual），结算面板文案用
      usage: {},                                       // { 行动id: { day:'Y-M-D', week:'周一日期' } }
      logs: [],
      at: Date.now()
    };

    // 前史推演：6/12/15 岁三次升学一次性算完（方案 A）
    var hist = rollSchoolHistory(s.int);
    s.school = hist.school;
    s.schoolTier = hist.tier;
    s.schoolBonus = hist.bonus;
    s.examLog = hist.examLog;
    s.milestones = ['6', '12', '15'];

    return s;
  }

  // 记录一次成功执行，用于 oncePerDay / oncePerWeek
  function markUsage(act) {
    var req = act.requires;
    if (!req || (req.oncePerDay !== true && req.oncePerWeek !== true)) return;
    state.usage[act.id] = { day: dayKey(), week: weekKey() };
  }

  // 属性边界
  function clampStats() {
    state.mood = Math.max(0, Math.min(moodMaxOf(), Math.round(state.mood)));   // v3.0：上限改由 moodMax 决定
    state.int = Math.max(0, Math.min(500, Math.round(state.int)));
    state.sta = Math.max(0, Math.min(100, Math.round(state.sta)));   // 体质严格 0-100（生死判定依赖）
    state.cha = Math.max(0, Math.min(500, Math.round(state.cha)));
    state.will = Math.max(0, Math.min(500, Math.round(state.will)));
    state.eq = Math.max(0, Math.min(500, Math.round(state.eq)));
    state.luck = Math.max(0, Math.min(500, Math.round(state.luck)));
    state.money = Math.round(state.money);
  }

  /* ================= [UI层] 日志 ================= */
  function addLog(kind, text) {
    state.logs.push({ k: kind, y: state.y, m: state.m, d: state.d, t: text, a: getAge(), e: state.edu });
    if (state.logs.length > LOG_LIMIT) state.logs.splice(0, state.logs.length - LOG_LIMIT);
  }

  function snapshot() {
    return {
      int: state.int, sta: state.sta, cha: state.cha,
      will: state.will, eq: state.eq, luck: state.luck,
      money: state.money, mood: state.mood
    };
  }

  /* ---- 天赋加成（无天赋时倍率恒为 1、加成为 0，不影响原逻辑） ---- */
  function talentLevel(rec) {
    var t = talentById(rec && rec.id);
    if (!t) return 0;
    return Math.max(1, Math.min(t.max_level || 3, Math.round(Number(rec.level) || 1)));
  }

  // 倍率类：learning_speed / work_money / event_luck / mood_recover
  function talentMul(key) {
    var sum = 0;
    var list = state.talents || [];
    for (var i = 0; i < list.length; i++) {
      var t = talentById(list[i] && list[i].id);
      if (!t || !t.level_effect) continue;
      var v = t.level_effect[key];
      if (typeof v === 'number') sum += v * talentLevel(list[i]);
    }
    return 1 + Math.min(1, sum);                 // 封顶 +100%
  }

  // 固定加成：stat_gain 里指定的属性，本次有正增长就额外 +N
  function talentStatGain(attr) {
    var sum = 0;
    var list = state.talents || [];
    for (var i = 0; i < list.length; i++) {
      var t = talentById(list[i] && list[i].id);
      if (!t || !t.level_effect || !t.level_effect.stat_gain) continue;
      var v = t.level_effect.stat_gain[attr];
      if (typeof v === 'number') sum += v * talentLevel(list[i]);
    }
    return sum;
  }

  // 收益结算（唯一入口：doAction 调用）
  // 只按「本次行动的增量」加成，不碰事件结算、不碰发薪
  function applyTalentGain(before) {
    var gains = {
      int: state.int - before.int,
      sta: state.sta - before.sta,
      cha: state.cha - before.cha,
      will: state.will - before.will,
      eq: state.eq - before.eq,
      luck: state.luck - before.luck,
      money: state.money - before.money,
      mood: state.mood - before.mood
    };
    var mulMap = { int: 'learning_speed', money: 'work_money', mood: 'mood_recover' };
    for (var k in mulMap) {
      if (!Object.prototype.hasOwnProperty.call(mulMap, k)) continue;
      var g = gains[k];
      if (g <= 0) continue;
      var extra = g * (talentMul(mulMap[k]) - 1);
      if (extra !== 0) state[k] += extra;   // v3.12：允许负数（负面天赋）生效
    }
    var keys = ['int', 'sta', 'cha', 'will', 'eq', 'luck'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (gains[key] <= 0) continue;
      var add = talentStatGain(key);
      if (add !== 0) state[key] += add;   // v3.12：允许负数（负面天赋）生效
    }
    clampStats();
  }

  // opts.source = 'action' 时，行动赚到的钱吃「财商」加成；事件结算不加
  function applyEffects(effects, opts) {
    var source = opts && opts.source;
    for (var i = 0; i < ATTR_ORDER.length; i++) {
      var name = ATTR_ORDER[i];
      var meta = ATTRS[name];
      var v = effects && effects[name];
      if (typeof v !== 'number' || !isFinite(v) || v === 0) continue;

      if (v > 0) {
        // 天赋不在这里生效：收益加成统一在 doAction 的 applyTalentGain 里结算
      }

      state[meta.key] += v;
    }
  }

  function fmtDelta(v) { return (v > 0 ? '+' : '−') + Math.abs(v); }

  // 由「改动前快照」对比当前状态，输出 "智力 +2，心情 −2"（取实际变化量，属性封顶时不虚报）
  function deltaText(before) {
    var parts = [];
    for (var i = 0; i < ATTR_ORDER.length; i++) {
      var meta = ATTRS[ATTR_ORDER[i]];
      var v = state[meta.key] - before[meta.key];
      if (v === 0) continue;
      parts.push(meta.label + ' ' + fmtDelta(v));
    }
    return parts.join('，') || '—';
  }

  // 按钮上的数值小字，按 effects 的声明顺序推导，例如 "金钱 +100 · 体质 −2 · 心情 −5"
  function effectText(act) {
    var parts = [];
    var effects = act.displayEffects || act.effects || {};
    for (var name in effects) {
      if (!Object.prototype.hasOwnProperty.call(effects, name)) continue;
      if (!ATTRS[name]) continue;                       // 未知属性键直接跳过
      var v = effects[name];
      if (typeof v !== 'number' || !isFinite(v) || v === 0) continue;
      parts.push(ATTRS[name].label + ' ' + fmtDelta(v));
    }
    return parts.join(' · ') || '无属性变化';
  }

  // 时间 +1 天，返回 { month: 是否跨月, year: 是否跨年 }
  function advanceDay() {
    var prevYear = state.y;
    var d = new Date(state.y, state.m - 1, state.d);
    d.setDate(d.getDate() + 1);
    state.y = d.getFullYear();
    state.m = d.getMonth() + 1;
    state.d = d.getDate();
    return { month: state.d === 1, year: state.y !== prevYear };
  }

  function dailySettle() {
    if (state.mood < 100) {
      state.mood = Math.min(100, state.mood + 1);
      addLog('day', '【日结算】心情自然恢复+1');
    } else {
      addLog('day', '【日结算】心情已达上限（100），未恢复');
    }
  }

  // 裁员：心情 < 20 或 智力 < 30 时进入危机状态，每个跨月 30% 概率被优化
  var layoffRoll = Math.random;                  // 可替换以便测试

  // 当前岗位要求的智力（无业时为 0，自然不再有危机）
  function requiredIntelligence() {
    var c = CAREER[state.job];
    return c ? (c.requiredIntelligence || 0) : 0;
  }

  function inJobCrisis() {
    if (!(state.salary > 0)) return false;               // 无业：不判定
    return state.mood < 20 || state.int < requiredIntelligence();
  }

  function layoffCheck() {
    if (!inJobCrisis()) return false;

    addLog('danger', '【警告】老板对你近期的工作状态（或能力不足）极度不满，再这样下去你可能会被裁员！');

    var need = requiredIntelligence();
    var detail = [];
    if (state.int < need) detail.push('智力 ' + state.int + ' < 岗位要求 ' + need);
    if (state.mood < 20) detail.push('心情 ' + state.mood);
    addLog('sys', '【考核】「' + state.job + '」' + detail.join('；') + '。');

    if (layoffRoll() >= LAYOFF_CHANCE) return false;

    doLayoff();
    return true;
  }

  // 真正执行裁员（月结危机与事件共用）
  function doLayoff(reason) {
    if (!(state.salary > 0)) return false;
    // v3.3：裁员缓冲——先按原月薪算 3 个月失业金
    state.severancePay = Math.max(0, Math.round(state.salary * 0.5));
    state.severanceLeft = state.severancePay > 0 ? 3 : 0;
    state.job = '无业';
    state.salary = 0;
    state.totalWorkYears = 0;
    state.currentPositionYears = 0;
    markJobChange();
    addLog('danger', '【失业】你被公司无情优化了！当前失去收入来源。'
      + (reason ? '（' + reason + '）' : ''));
    return true;
  }

  /* ================= [引擎层] 城市 / 地域系统（v3.24） =================
     citiesData 在 data.js 里；这里只提供单点系数查询与房价折算。
     老档没有 city（或 city 不认识）→ 全部回退 1.0，绝不改变老玩家行为。 */

  function cityFactors() {
    var id = state.city || 'normal';
    if (typeof citiesData === 'undefined') return { salary: 1, living: 1, house: 1 };
    for (var i = 0; i < citiesData.length; i++) {
      if (citiesData[i].id === id) {
        return {
          salary: Number(citiesData[i].salaryFactor) || 1,
          living: Number(citiesData[i].livingFactor) || 1,
          house: Number(citiesData[i].houseFactor) || 1
        };
      }
    }
    return { salary: 1, living: 1, house: 1 };
  }

  function houseCost(base) {
    return Math.round((Number(base) || 0) * cityFactors().house);
  }

  function cityName() {
    var id = state.city || 'normal';
    if (typeof citiesData !== 'undefined') {
      for (var i = 0; i < citiesData.length; i++) {
        if (citiesData[i].id === id) return citiesData[i].name;
      }
    }
    return '普通城市';
  }

  // v3.23：股票每月结算。只读/写 state.stockValue，不碰 money / 生活费 / 工资。
  // 牛市 +50%（基础 35% ± 运气加成），熊市 −60%（固定 30%），其余平稳。
  // 长期期望为负：0.35×(+50%) + 0.30×(−60%) = +17.5% − 18% = −0.5%（不含手续费）。
  function settleStocks() {
    var v = state.stockValue || 0;
    if (!(v > 0)) return;                      // 没持仓，不产生日志噪音

    var roll = eventRoll();
    var bull = 0.35 + Math.max(-0.2, Math.min(0.2, ((state.luck || 0) - 50) / 500));
    var bear = 0.30;
    var old = v;

    if (roll < bull) {
      state.stockValue = Math.round(v * 1.5);
      addLog('event', '【股票】牛市！持仓 ' + old + ' → ' + state.stockValue + '（+50%）。');
    } else if (roll < bull + bear) {
      state.stockValue = Math.round(v * 0.4);
      addLog('danger', '【股票】熊市！持仓 ' + old + ' → ' + state.stockValue + '（−60%）。');
    } else {
      addLog('sys', '【股票】本月行情平稳，持仓 ' + v + ' 不变。');
    }
  }

  function monthlySettle() {
    // 生活成本随收入水涨船高：有工作时按比例计，无业按保底（数值见 LIVING_RATE / LIVING_BASE）
    var livingCost = livingCostOf(state.salary);
    state.money -= livingCost;
    addLog('month', '【月度结算】本月生活开销及固定支出：-' + livingCost + '元（生活成本随收入水涨船高）');

    // 22 岁前家里按月补贴，避免开局饿死
    if (state.age < 22) {
      state.money += 1200;
      addLog('sys', '【家用】父母打了 1200 元生活费过来。');
    }

    // 有工作：月底发薪，顺带消耗体质与心情
    if (state.salary > 0) {
      var pay = Math.round(state.salary * talentMul('work_money') * cityFactors().salary);   // 天赋：工资倍率 × 城市工资系数
      state.money += pay;
      if (state.sta >= 5) state.sta += PAY_STAMINA;
      state.mood += PAY_MOOD;
      clampStats();
      addLog('month', '【发薪日】你获得了工资 ' + pay + ' 元，上班让你有些疲惫');
      SoundFX.play('coin');                              // v3.5：发薪成功播金币音效
    }

    // 负债：跨月时强制扣健康
    if (state.money < 0) {
      if (DEBT_STAMINA > 0) state.sta -= DEBT_STAMINA;      // v3.3：默认 0，不再扣体质
      state.mood -= DEBT_MOOD;                              // v3.3：改扣心情，留翻盘余地
      clampStats();
      addLog('danger', '【资不抵债】你已经负债 ' + Math.abs(state.money)
        + ' 元，整夜睡不着（心情 -' + DEBT_MOOD + '），快去打零工赚钱！');
    }

    layoffCheck();                                // 每月跨月时判定一次
    healthCheck();                                // 体质归零的濒死判定
    if (state.severanceLeft > 0) {                   // v3.3：裁员缓冲期，每月发失业金
      state.money += state.severancePay;
      state.severanceLeft -= 1;
      addLog('month', '【失业金】本月领到 ' + state.severancePay + ' 元（还能领 '
        + state.severanceLeft + ' 个月）。');
    }
    if (state.age >= 22 && !(state.salary > 0) && state.money < BENEFIT_THRESHOLD) {   // v3.2：低保
      var benefit = Math.round(BENEFIT * cityFactors().salary);   // v3.26：低保随城市工资系数
      state.money += benefit;
      addLog('sys', '【低保】街道给了 ' + benefit + ' 元临时救助。');
    }
    if (state.age >= PENSION_AGE) {                 // v3.2：退休金（纯追加）
      var pension = Math.round(PENSION * cityFactors().salary);   // v3.26：养老金随城市工资系数（地域折叠）
      state.money += pension;
      addLog('sys', '【养老金】这个月到账 ' + pension + ' 元。');
    }
    if (state.married || (state.children && state.children.length)) settleFamily();   // v3.1：已婚或有孩子都要家庭月结
    settleStocks();                              // v3.22：股票每月涨跌（只动 stockValue，不碰生活费/工资）
    checkDisease();                              // v3.13：跨月疾病判定（只排队，弹窗交给 triggerMonthlyEvent）
  }

  // 年终奖：月薪 × (1 + 总工龄×0.2)，最多 3 个月
  function yearEndBonus() {
    var months = Math.min(3, 1 + state.totalWorkYears * 0.2);
    return Math.round(state.salary * months * cityFactors().salary);
  }

  // 跨年：年龄 +1，在职则工龄 +1 并结算年终奖
  function yearlySettle() {
    state.age += 1;
    addLog('sys', '【岁月】又是一年，你 ' + state.age + ' 岁了。');

    if (state.age >= 80) { endLife('age'); return; }

    checkMilestones();                             // 18 岁高考里程碑（只排队，不弹窗）

    if (state.salary > 0) {
      state.totalWorkYears += 1;
      state.currentPositionYears += 1;
      addLog('sys', '【工龄】在「' + state.job + '」又干了一年：总工龄 ' + state.totalWorkYears
        + ' 年，当前岗位 ' + state.currentPositionYears + ' 年。');

      var bonus = yearEndBonus();
      state.money += bonus;
      addLog('event', '【年终奖】老板给你发了 ' + bonus + ' 元年终奖！');
    }
  }

  /* ================= [引擎层] 婚姻家庭系统（v3.0） =================
     全部为新增函数：引擎原有函数只在上面的 4 个锚点追加了一行调用/改动。
     moodMax 只影响心情上限，sta / int 等属性的边界一行未动。 */
  function moodMaxOf() {
    return (typeof state.moodMax === 'number' && state.moodMax > 0) ? state.moodMax : 100;
  }

  function addLove(n) {
    if (!state.married) return 0;
    var before = state.love;
    state.love = Math.max(0, Math.min(100, Math.round(state.love + (Number(n) || 0))));
    var d = state.love - before;
    addLog('sys', '【感情】' + (d >= 0 ? '+' : '−') + Math.abs(d) + '（当前 ' + state.love + ' / 100）');
    return d;
  }

  function spouseName() {
    var a = SPOUSE_SURNAME[Math.min(SPOUSE_SURNAME.length - 1, Math.floor(eventRoll() * SPOUSE_SURNAME.length))];
    var b = SPOUSE_GIVEN[Math.min(SPOUSE_GIVEN.length - 1, Math.floor(eventRoll() * SPOUSE_GIVEN.length))];
    return a + b;
  }

  // 结婚：写婚姻状态 + 提心情上限（婚后 110，每个孩子再 +5，封顶 120）
  function marryTo(kind) {
    state.married = true;
    state.loveState = 'married';          // v3.7：感情状态机同步（marryTo 是唯一结婚入口）
    state.datingStart = 0;                // v3.7：领证后不再是「交往中」
    state.spouse = state.partnerName || spouseName();
    state.inLove = true;                                  // v3.16：别名同步
    state.partnerName = state.spouse;
    state.marriedAt = state.y * 12 + state.m;
    state.lastMarryMonth = state.marriedAt;
    state.love = 60;
    state.coldMonths = 0;
    state.moodMax = Math.min(MOOD_MAX_CAP, MOOD_MAX_MARRIED + (state.kids || 0) * MOOD_BONUS_PER_KID);
    state.mood = Math.min(moodMaxOf(), state.mood + 12);
    addLog('event', '【结婚】你和「' + state.spouse + '」领了证（' + (kind || '简办') + '）。'
      + '心情上限提升到 ' + moodMaxOf() + '。');
    clampStats();
    return state.spouse;
  }

  // 离婚：财产分割 → 状态清零 → 心情上限回到 100
  function divorceNow(kind) {
    var rate = kind === '净身' ? DIVORCE_SPLIT_CLEAN : DIVORCE_SPLIT;
    var lost = Math.round(Math.max(0, state.money) * rate);
    state.money -= lost;
    var ex = state.spouse || '对方';
    state.married = false;
    state.loveState = 'single';           // v3.7：感情状态机同步（divorceNow 是唯一离婚入口）
    state.inLove = false;                 // v3.16：别名同步
    state.partnerName = '';
    state.datingStart = 0;                // v3.7：离婚后不再「交往中」
    state.spouse = '';
    state.love = 0;
    state.coldMonths = 0;
    state.divorceCount = (state.divorceCount || 0) + 1;
    state.lastMarryMonth = state.y * 12 + state.m;
    state.moodMax = MOOD_MAX_BASE;
    state.mood = Math.max(0, Math.min(MOOD_MAX_BASE, state.mood - DIVORCE_MOOD));
    addLog('danger', '【离婚】你和「' + ex + '」分开了（' + (kind || '协议') + '），分走 ' + lost
      + ' 元。心情上限回到 100。');
    clampStats();
    return lost;
  }

  // v3.17：恋爱分手 —— 自由恋爱线（E_LOVE_*）的唯一出口。
  // 只清理恋爱相关字段：不碰 married / moodMax / 财产（恋爱阶段没有共同财产可分割）。
  // 结婚仍只走 marryTo()，离婚仍只走 divorceNow()。
  function breakUp() {
    var ex = state.partnerName || '对方';
    state.loveState = 'single';
    state.inLove = false;
    state.partnerName = '';
    state.datingStart = 0;
    state.datingLove = 0;
    addLog('danger', '【分手】你和「' + ex + '」分开了。');
    return true;
  }


  function addKid() {
    state.kids = Math.min(3, (state.kids || 0) + 1);
    if (state.married) state.moodMax = Math.min(MOOD_MAX_CAP, MOOD_MAX_MARRIED + state.kids * MOOD_BONUS_PER_KID);
    state.mood = Math.min(moodMaxOf(), state.mood + 6);
    addLog('event', '【孩子】你有了第 ' + state.kids + ' 个孩子。心情上限提升到 ' + moodMaxOf() + '。');
    clampStats();
  }

  // 家庭月结：由 monthlySettle 末尾调用（唯一接入点）
  function settleFamily() {
    settleChildren();                                   // v3.1：先做成长与成年判定

    var kidBill = 0, give = 0, leech = 0;
    var list = livingChildren();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      kidBill += kidCost(c);
      if (c.support > 0) {
        give += (state.age >= 60) ? Math.round(c.support * SUPPORT_OLD_MUL) : c.support;
      } else if (c.support < 0) {
        leech += -c.support;
      }
    }

    var cost = Math.max(FAMILY_MIN, Math.round((state.salary || 0) * FAMILY_RATE)) + kidBill;
    state.money -= cost;
    state.familyCost = cost;
    state.supportIncome = give - leech;
    if (give > 0) state.money += give;
    if (leech > 0) state.money -= leech;
    if (kidBill > 0) {
      addLog('month', '【养育】孩子本月开销 ' + kidBill + ' 元（' + list.length + ' 个孩子）。');
    }
    if (give > 0) addLog('event', '【反哺】孩子们这个月给了你 ' + give + ' 元。');
    if (leech > 0) {
      addLog('danger', '【啃老】孩子又从家里拿了 ' + leech + ' 元。');
      if (eventRoll() < LEECH_EVENT_CHANCE) {
        state.money -= LEECH_EVENT_COST;
        state.mood = Math.max(0, state.mood - 3);
        addLog('danger', '【啃老】孩子说欠了钱，你替他补了 ' + LEECH_EVENT_COST + ' 元。');
      }
    }

    var drain = LOVE_DRAIN + (state.money < 0 ? LOVE_DRAIN_DEBT : 0);
    state.love = Math.max(0, Math.min(100, state.love - drain));

    if (state.love >= LOVE_HAPPY) {
      state.mood = Math.min(moodMaxOf(), state.mood + MOOD_UP);
    } else if (state.love <= LOVE_COLD) {
      state.mood = Math.max(0, state.mood - MOOD_DOWN);
    }
    addLog('month', '【家庭】本月家用 ' + cost + ' 元，感情值 ' + state.love + '。');

    if (state.love <= 0) {
      state.coldMonths = (state.coldMonths || 0) + 1;
      addLog('danger', '【冷战】家里的空气冷了下来（连续 ' + state.coldMonths + ' 个月）。');
      if (state.coldMonths >= COLD_MONTHS) {
        state.coldMonths = 0;
        deferredEventIds.push('E_MARRIED_DIVORCE');            // 复用既有的「顺延队列」，下月必发
        addLog('danger', '【婚姻危机】对方提出了离婚。');
      }
    } else {
      state.coldMonths = 0;
    }
    clampStats();
  }

  /* ================= [引擎层] 子女养育（v3.1） ================= */
  function nowMonth() { return state.y * 12 + state.m; }

  function childAge(c) {
    var a = Math.floor((nowMonth() - (c.bornAt || nowMonth())) / 12);
    return Math.max(0, Math.min(99, a));
  }

  function livingChildren() {
    var list = state.children || [], out = [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].alive !== false) out.push(list[i]);
    return out;
  }

  function rnd(n) { return Math.floor(eventRoll() * n); }

  function kidName() {
    var a = KID_SURNAME[Math.min(KID_SURNAME.length - 1, rnd(KID_SURNAME.length))];
    var b = KID_GIVEN[Math.min(KID_GIVEN.length - 1, rnd(KID_GIVEN.length))];
    return (state.married && state.spouse ? state.spouse.charAt(0) : a) + b;
  }

  // 读档/老档迁移：数组白名单 + 只有 kids 数字时补录占位孩子
  function normalizeChildren(raw, out, legacyCount) {
    var list = Array.isArray(raw) ? raw : [];
    var res = [];
    for (var i = 0; i < list.length && res.length < KID_MAX; i++) {
      var x = list[i];
      if (!x || typeof x !== 'object') continue;
      var born = Number(x.bornAt);
      if (!isFinite(born) || born <= 0) born = (out.y * 12 + out.m) - 12 * Math.min(17, 2 + i * 3);
      res.push({
        id: typeof x.id === 'string' && x.id ? x.id.slice(0, 24) : ('c' + (i + 1)),
        name: typeof x.name === 'string' && x.name ? x.name.slice(0, 12) : '小满',
        sex: x.sex === '男' ? '男' : '女',
        bornAt: Math.round(born),
        birth: (x.birth === '剖腹产' || x.birth === '无痛' || x.birth === '领养') ? x.birth : '顺产',
        int: asInt(x.int, 45, 0, 500),
        sta: asInt(x.sta, 65, 0, 100),
        cha: asInt(x.cha, 50, 0, 500),
        luck: asInt(x.luck, 50, 0, 100),
        edu: typeof x.edu === 'string' ? x.edu.slice(0, 8) : '婴幼儿',
        invest: INVEST_MUL[x.invest] ? x.invest : '普通',
        relation: asInt(x.relation, 60, 0, 100),
        alive: x.alive !== false,
        support: asInt(x.support, 0, -99999, 99999),
        supportDone: x.supportDone === true,
        hasChild: x.hasChild === true,
        lastGrow: asInt(x.lastGrow, Math.round(born), 0, 999999)
      });
    }
    // 老存档只有 kids 数字：补录 N 个占位孩子（年龄按父母年龄粗略倒推）
    if (!res.length) {
      var n = Math.max(0, Math.min(KID_MAX, Math.round(Number(legacyCount) || 0) || 0));
      var nowAbs = out.y * 12 + out.m;
      for (var k = 0; k < n; k++) {
        var b = nowAbs - 12 * Math.min(17, 3 + k * 3);
        res.push({
          id: 'c_legacy' + (k + 1), name: '小满' + (k > 0 ? (k + 1) : ''), sex: k % 2 ? '男' : '女',
          bornAt: b, birth: '顺产', int: 45, sta: 65, cha: 50, luck: 50,
          edu: '学前', invest: '普通', relation: 60, alive: true,
          support: 0, supportDone: false, hasChild: false, lastGrow: b
        });
      }
    }
    return res;
  }

  // 出生：四维随机（luck 出生定死，int 受投入影响后逐年成长）
  function addChild(opts) {
    opts = opts || {};
    if (!state.children) state.children = [];
    if (state.children.length >= KID_MAX) return null;
    var c = {
      id: 'c' + (state.children.length + 1) + '_' + Math.floor(eventRoll() * 10000),
      name: kidName(),
      sex: eventRoll() < 0.5 ? '女' : '男',
      bornAt: nowMonth(),
      birth: opts.birth || '顺产',
      int: 30 + rnd(25) + (opts.birth === '领养' ? rnd(10) : 0),
      sta: 55 + rnd(25),
      cha: 40 + rnd(25),
      luck: 20 + rnd(60),                    // 运气出生时定死
      edu: '婴幼儿',
      invest: '普通',
      relation: opts.birth === '领养' ? 40 : 60,
      alive: true,
      support: 0,
      supportDone: false,
      hasChild: false,
      lastGrow: nowMonth()
    };
    state.children.push(c);
    state.kids = state.children.length;
    if (state.married) state.moodMax = Math.min(MOOD_MAX_CAP, MOOD_MAX_MARRIED + state.kids * MOOD_BONUS_PER_KID);
    state.mood = Math.min(moodMaxOf(), state.mood + 6);
    addLog('event', '【孩子】「' + c.name + '」出生了（' + c.birth + '）。运气 ' + c.luck
      + '，智力 ' + c.int + '。心情上限 ' + moodMaxOf() + '。');
    clampStats();
    return c;
  }

  // 兼容旧调用（v3.0 的 addKid）
  function addKid() { return addChild({}); }

  // 择校：给最小的未成年孩子设置教育投入档
  function setKidInvest(tier) {
    if (!INVEST_MUL[tier]) return null;
    var list = livingChildren(), target = null;
    for (var i = 0; i < list.length; i++) {
      if (childAge(list[i]) < CHILD_LEGAL_AGE) { target = list[i]; break; }
    }
    if (!target) return null;
    target.invest = tier;
    addLog('sys', '【择校】「' + target.name + '」转入「' + tier + '」档，每月开销 ×' + INVEST_MUL[tier] + '。');
    return target;
  }

  // 孙辈：给第一个成年孩子标记 hasChild（四世同堂结局的前置）
  function markGrandchild() {
    var list = livingChildren();
    for (var i = 0; i < list.length; i++) {
      if (childAge(list[i]) >= CHILD_LEGAL_AGE) {
        list[i].hasChild = true;
        addLog('event', '【孙辈】「' + list[i].name + '」有孩子了，你升级当爷爷/奶奶。');
        return list[i];
      }
    }
    return null;
  }

  // 陪孩子：所有存活子女的亲子关系 +n
  function addKidRelation(n) {
    var list = livingChildren();
    if (!list.length) return 0;
    for (var i = 0; i < list.length; i++) {
      list[i].relation = Math.max(0, Math.min(100, list[i].relation + (Number(n) || 0)));
    }
    addLog('sys', '【亲子】你和孩子的关系更近了一些（' + list[0].name
      + (list.length > 1 ? ' 等 ' + list.length + ' 人' : '') + '：关系 ' + list[0].relation + ' / 100）。');
    return n;
  }

  function kidCost(c) {
    var age = childAge(c);
    if (age >= CHILD_LEGAL_AGE) return 0;
    var idx = age <= 3 ? 0 : age <= 6 ? 1 : age <= 12 ? 2 : age <= 15 ? 3 : 4;
    var mul = INVEST_MUL[c.invest] || 1;
    return Math.round(KID_MONTHLY[idx] * mul);
  }

  function childAbility(c) {
    return Math.round(c.int * 0.6 + c.luck * 0.2 + (INVEST_ABILITY[c.invest] || 0) + c.relation * 0.2);
  }

  function computeSupport(c) {
    var ab = childAbility(c);
    if (c.relation < 30) return 0;                       // 关系太差，一分不给
    if (ab >= SUPPORT_GOOD_ABILITY) {
      return Math.min(SUPPORT_CAP, Math.round(1500 + (ab - SUPPORT_GOOD_ABILITY) * 25));
    }
    if (ab >= SUPPORT_MID_ABILITY) return 0;             // 普通：自给自足
    return SUPPORT_LEECH;                                 // 啃老
  }

  // 每年一次成长（生日月结算，随机浮动）
  function growChild(c) {
    var g = INVEST_GROWTH[c.invest] || 2;
    c.int = Math.max(0, Math.min(500, c.int + g + (rnd(5) - 2)));
    c.sta = Math.max(10, Math.min(100, c.sta + (rnd(4) - 1)));
    c.cha = Math.max(0, Math.min(500, c.cha + (rnd(4) - 1)));
    c.relation = Math.max(0, Math.min(100, c.relation + 2));
    if (eventRoll() < KID_LOSS_CHANCE) {                 // 极低概率：孩子意外离开
      c.alive = false;
      state.lostChild = (state.lostChild || 0) + 1;
      state.mood = Math.max(0, state.mood - 30);
      addLog('danger', '【噩耗】「' + c.name + '」出了意外，没能留下来。');
      return;
    }
    var a = childAge(c);
    c.edu = a < 4 ? '幼儿园' : a < 7 ? '学前' : a < 13 ? '小学' : a < 16 ? '初中' : a < 19 ? '高中' : '成年';
  }

  function settleChildren() {
    var list = state.children || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || c.alive === false) continue;

      // 成年：一次性算出反哺/啃老金额
      if (!c.supportDone && childAge(c) >= CHILD_LEGAL_AGE) {
        c.supportDone = true;
        c.support = computeSupport(c);
        c.edu = '成年';
        addLog(c.support > 0 ? 'event' : 'sys', '【子女】「' + c.name + '」成年了（能力 '
          + childAbility(c) + '）——'
          + (c.support > 0 ? '每月给你 ' + c.support + ' 元。' : c.support < 0 ? '回家住，每月要 ' + Math.abs(c.support) + ' 元。' : '自己过自己的日子。'));
      }

      // 年度成长
      if (nowMonth() - (c.lastGrow || c.bornAt) >= 12) {
        growChild(c);
        c.lastGrow = nowMonth();
      }
    }
  }

  // 状态面板里的「家庭」一行（只读）
  function dexNorm(raw) {
    var arr = Array.isArray(raw) ? raw : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      if (typeof x === 'string') {                 // v1 旧格式
        if (x) out.push({ id: x.slice(0, 24) });
        continue;
      }
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) continue;
      var rec = { id: x.id.slice(0, 24) };
      if (isFinite(Number(x.age))) rec.age = Math.max(0, Math.min(150, Math.round(Number(x.age))));
      if (typeof x.edu === 'string') rec.edu = x.edu.slice(0, 8);
      if (typeof x.job === 'string') rec.job = x.job.slice(0, 12);
      if (isFinite(Number(x.workYears))) rec.workYears = Math.round(Number(x.workYears));
      if (isFinite(Number(x.money))) rec.money = Math.round(Number(x.money));
      if (isFinite(Number(x.int))) rec.int = Math.round(Number(x.int));
      if (isFinite(Number(x.sta))) rec.sta = Math.round(Number(x.sta));
      if (isFinite(Number(x.mood))) rec.mood = Math.round(Number(x.mood));
      if (isFinite(Number(x.at))) rec.at = Number(x.at);
      out.push(rec);
    }
    return out;
  }

  function loadDex() {
    try {
      var raw = localStorage.getItem(DEX_KEY);
      return dexNorm(raw ? JSON.parse(raw) : []);
    } catch (e) { return []; }
  }

  function saveDex(arr) {
    try { localStorage.setItem(DEX_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // 首次达成时写入记录（含当时的属性快照）；已有记录则原样保留
  function unlockEnding(id, record) {
    var dex = loadDex();
    for (var i = 0; i < dex.length; i++) {
      if (dex[i].id === id) return false;
    }
    var rec = record && typeof record === 'object' ? record : {};
    rec.id = id;
    rec.at = Date.now();
    dex.push(rec);
    saveDex(dex);
    return true;                                  // 首次解锁
  }

  function pickEnding() {
    for (var i = 0; i < endingRules.length; i++) {
      if (endingRules[i].test()) return endingRules[i];
    }
    return endingRules[endingRules.length - 1];
  }

  // 结算面板渲染：只画界面，不改任何判定结果
  // isNew = 本次是否首次解锁该结局（决定「新结局已收入图鉴」那一行）
  function showEndPanel(ending, isNew) {
    SoundFX.play('death');                              // v3.5：结算面板弹出 → 死亡滑音
    var reason = state.endReason || 'manual';

    $('endTitle').textContent = ending.name;
    $('endDesc').textContent = ending.desc;
    $('endReason').textContent = (reason === 'age' ? '寿终正寝，享年 ' + state.age + ' 岁'
      : reason === 'health' ? '油尽灯枯，享年 ' + state.age + ' 岁'
      : '人生走到了尽头');

    var rows = [
      ['享年', state.age + ' 岁'],
      ['学历', state.edu || '无'],
      ['职业', state.job || '无业'],
      ['总工龄', state.totalWorkYears + ' 年'],
      ['金钱', (state.money < 0 ? '−¥' : '¥') + Math.abs(state.money).toLocaleString('en-US')],
      ['智力', state.int],
      ['体质', state.sta],
      ['心情', state.mood]
    ];
    $('endStats').innerHTML = rows.map(function (r) {
      return '<div class="end-row"><span class="end-k">' + esc(r[0]) + '</span>'
        + '<span class="end-v">' + esc(String(r[1])) + '</span></div>';
    }).join('');

    renderDex(ending.id);
    $('endDexNew').hidden = !isNew;
    $('endMask').hidden = false;
  }

  // 已经结束的人生被重新打开（读档回来 / 点了已结束局的行动）时，把面板再翻出来
  function reopenEndPanel() {
    var ending = null;
    for (var i = 0; i < endingRules.length; i++) {
      if (endingRules[i].id === state.endingId) { ending = endingRules[i]; break; }
    }
    if (!ending) ending = pickEnding();                       // 老存档没存 endingId：按当前属性重算
    showEndPanel(ending, false);
  }

  function endLife(reason) {
    if (state.ended) return false;
    state.ended = true;
    state.endReason = reason || 'manual';
    var ending = pickEnding();
    state.endingId = ending.id;

    // 首次达成时把当时的属性快照一起存进图鉴（老记录不覆盖）
    var isNew = unlockEnding(ending.id, {
      age: state.age,
      edu: state.edu,
      job: state.job,
      workYears: state.totalWorkYears,
      money: state.money,
      int: state.int,
      sta: state.sta,
      mood: state.mood
    });
    addLog('danger', '【人生终章】' + ending.name + '——' + ending.desc);

    showEndPanel(ending, isNew);
    render();
    return true;
  }

  // v3.9：过度劳累 → 强制大病住院（不直接死亡、不清空积蓄）
  // 住院费 = 当前现金 30%（保底 500、封顶 5 万），现金不足允许负债（父母/医保垫付）
  function skipDays(n) {
    var days = Math.max(0, Math.round(Number(n) || 0));
    for (var i = 0; i < days; i++) {
      if (state.ended) break;
      var r = advanceDay();
      dailySettle();
      if (r.month) monthlySettle();
      if (r.year) yearlySettle();
      if (state.ended) break;
    }
  }

  // 大病住院：扣 30% 现金、恢复体质、心情 -20、跳过 15 天。
  // 现金不足 → 负债（父母/医保垫付）且计一次「危险住院」；现金充足 → 普通住院、危险计数清零。
  function hospitalize() {
    var cash = Math.max(0, state.money || 0);
    var f = cityFactors().living;                    // v3.25：医疗费随城市生活成本缩放（小县城看病便宜）
    var cost = Math.round(cash * HOSPITAL_RATE * f);
    cost = Math.max(Math.round(HOSPITAL_MIN * f), Math.min(Math.round(HOSPITAL_MAX * f), cost));
    var broke = state.money < cost;                          // 现金不足 → 父母/医保垫付（负债）
    state.money -= cost;
    state.sta = HOSPITAL_STA;
    state.mood = Math.max(0, state.mood - HOSPITAL_MOOD_PENALTY);
    if (broke) {
      state.hospitalCount = (state.hospitalCount || 0) + 1;
      addLog('danger', '由于长期过度劳累，你晕倒被送进医院。因现金不足，住院费由父母/医保垫付（欠款 ¥'
        + cost.toLocaleString('en-US') + '），体质恢复到 ' + HOSPITAL_STA + '。');
      var hc = state.hospitalCount;                        // v3.9：死亡倒计时预警
      var left = HOSPITAL_DEATH - hc;
      if (left > 0) {
        addLog('danger', '【健康恶化】你因过度劳累被送进医院抢救，这已经是第 ' + hc + ' 次了。如果累计达到 '
          + HOSPITAL_DEATH + ' 次，你将彻底猝死！（还剩 ' + left + ' 次机会）');
        toast('⚠ 健康恶化：第 ' + hc + ' / ' + HOSPITAL_DEATH + ' 次住院');
      } else {
        addLog('danger', '【健康恶化】你因过度劳累被送进医院抢救，这已经是第 ' + hc + ' 次了。身体已到极限，你将彻底猝死！');
      }
    } else {
      state.hospitalCount = 0;
      addLog('danger', '由于长期过度劳累，你晕倒被送进医院，住院费花掉了你 30% 的积蓄（¥'
        + cost.toLocaleString('en-US') + '）。住院 ' + HOSPITAL_DAYS + ' 天，体质恢复到 ' + HOSPITAL_STA + '。');
    }
    clampStats();
    skipDays(HOSPITAL_DAYS);
  }

  function healthCheck() {
    if (state.ended) return;
    if (state.sta > 0) return;                               // 体质 > 0：健康，不处理
    hospitalize();                                           // 体质 ≤ 0：强制住院，不直接死亡
    if ((state.hospitalCount || 0) >= HOSPITAL_DEATH) endLife('health');   // 累计负债住院达到阈值才猝死
  }

  /* ================= [引擎层] 疾病与医疗系统（v3.13） ================= */
  var DISEASE_CHANCE = 0.10;          // 每次跨月、符合条件的得病概率
  var pendingDisease = null;          // 待弹出的疾病事件（与 pendingEvent 互斥）

  // 符合条件的疾病：年龄达标 + 体质低于阈值
  function eligibleDiseases() {
    var age = getAge();
    var out = [];
    for (var i = 0; i < diseasesData.length; i++) {
      var d = diseasesData[i];
      if (age >= d.minAge && state.sta < d.healthLimit) out.push(d);
    }
    return out;
  }

  // 构造疾病事件（复用事件弹窗机制）
  function buildDiseaseEvent(d) {
    var pay = state.hasInsurance ? Math.round(d.cost * 0.2) : d.cost;
    pay = Math.round(pay * cityFactors().living);    // v3.25：治疗费随城市生活成本缩放
    return {
      id: 'DISEASE_' + d.id,
      title: '生病了：' + d.name,
      description: '你最近总觉得不舒服，去医院检查后确诊「' + d.name + '」。'
        + (state.hasInsurance ? '（有医保，治疗费打 2 折）' : ''),
      options: [
        {
          label: '去医院治病（¥' + pay + '）',
          meta: '治疗费',
          effects: { money: -pay, stamina: 2 },
          result: '你住院治疗了几天，身体慢慢好转。'
        },
        {
          label: '硬扛过去',
          meta: '体质 -' + d.damage,
          effects: { stamina: -d.damage },
          result: '你没去医院，硬扛着，身体更差了。',
          onChoose: function () { if (state.sta <= 0) hospitalize(); }
        }
      ]
    };
  }

  // 跨月疾病判定：只在无待处理事件时进行，得病则排队
  function checkDisease() {
    if (state.ended) return;
    if (pendingEvent || pendingDisease) return;   // 已有事件不叠加
    var list = eligibleDiseases();
    if (!list.length) return;
    if (eventRoll() >= DISEASE_CHANCE) return;    // 90% 不得病
    var d = list[Math.floor(eventRoll() * list.length)];
    pendingDisease = buildDiseaseEvent(d);
  }

  /* ================= [引擎层] 事件系统 ================= */
  /* ---- 教育系统运行时（v2.8） ---- */
  var examOpen = false;                          // 弹窗期间冻结时间（保险 3）

  function hasMilestone(tag) {
    return (state.milestones || []).indexOf(tag) > -1;
  }
  function markMilestone(tag) {
    if (!state.milestones) state.milestones = [];
    if (state.milestones.indexOf(tag) === -1) state.milestones.push(tag);
  }

  // 年龄里程碑检查：只写 pendingExam，不直接弹窗（避免打断月度事件）
  function checkMilestones() {
    if (state.ended) return;                     // 保险 1：死人不能参加高考
    if (state.pendingExam) return;
    if (getAge() >= 18 && !hasMilestone('18') && state.edu === '高中') {
      state.pendingExam = { stage: 'gaokao' };
    }
  }

  function examScore(stage) {
    if (stage !== 'gaokao') {
      // 小升初 / 中考：保持 raw 量级（0-300），走原有分档
      var wave = 15;
      var base = state.int;
      return Math.max(0, Math.round(base + (eventRoll() * wave * 2 - wave)));
    }
    // v3.6：高考 750 分制，智力分段映射（非线性，防溢出）
    // 100→320(稳专科) / 130→450(本科) / 180→530(部分够一本550) / 250→620(冲985) / 500→745
    var int = Math.max(0, Math.min(500, state.int));
    var base750;
    if (int <= 100) base750 = int * 3.2;
    else if (int <= 130) base750 = 320 + (int - 100) * 130 / 30;
    else if (int <= 180) base750 = 450 + (int - 130) * 1.0;
    else if (int <= 250) base750 = 500 + (int - 180) * 120 / 70;
    else base750 = 620 + (int - 250) * 0.5;

    var schoolBonus = schoolBonusOfTier(state.schoolTier);   // 职高 -10 / 普通 0 / 重点 +10
    var eqBonus = Math.round(state.eq * 0.15);               // 情商加成（越往上越吃情商）
    var luck = (eventRoll() * 40 - 20);                      // ±20 波动
    var total = base750 + schoolBonus + eqBonus + luck;
    return Math.max(0, Math.min(EXAM_FULL_DISPLAY, Math.round(total)));
  }

  function examLineOf(stage, score) {
    var lines = EXAM_LINES[stage] || EXAM_LINES.gaokao;
    for (var i = 0; i < lines.length; i++) if (score >= lines[i].min) return lines[i];
    return lines[lines.length - 1];
  }

  // 结算写盘：只写 edu / school / examLog，不碰其它系统
  function applyExamResult(stage, score, line) {
    if (line.edu) state.edu = line.edu;
    if (stage === 'gaokao' && line.edu && line.edu !== '高中') state.housing = 'dorm';   // v3.5.4：高考/升学成功→住宿舍（教育结果副作用，不改判定）
    state.schoolTier = line.tier;
    state.school = (stage === 'gaokao' && line.school)
      ? line.school
      : schoolName(line.tier);
    state.schoolBonus = schoolBonusOfTier(line.tier);
    if (!state.examLog) state.examLog = [];
    state.examLog.push({ stage: stage, score: score, tier: line.tier, edu: line.edu, at: Date.now() });
    markMilestone('18');
  }

  function openExam() {
    if (!state.pendingExam) return;
    examOpen = true;
    SoundFX.play('event');                              // v3.5：升学考核弹窗 → 提示音
    var box = $('examMask');
    if (!box) { examOpen = false; return; }
    var st = state.pendingExam.stage;
    var isGk = st === 'gaokao';
    $('examStage').textContent = getAge() + ' 岁 · ' + (isGk ? '高考' : '升学');
    $('examTitle').textContent = isGk ? '全国统一高考' : '升学考核';
    $('examDesc').textContent = isGk
      ? '考场里只剩笔尖的声音。这一次，把三年都押上去。'
      : '按成绩分档，没有第二次机会。';
    $('examResult').hidden = true;
    $('examResult').innerHTML = '';
    var btn = $('btnExamGo');
    btn.textContent = '参加考试';
    btn.classList.remove('is-settled');
    box.hidden = false;
  }

  // 结算：算分 → 定档 → 写盘 → 立刻清队列（保险 2）
  function settleExam() {
    if (!state.pendingExam) return;
    var stage = state.pendingExam.stage;
    var preTierBonus = schoolBonusOfTier(state.schoolTier);   // 考前学校加成（写盘后会被覆盖）
    var score = examScore(stage);
    var line = examLineOf(stage, score);
    applyExamResult(stage, score, line);

    var isGk = stage === 'gaokao';
    addLog('event', examResultText(stage, score, line));

    var box = $('examResult');
    box.hidden = false;
    box.innerHTML = '<span class="exam-score">' + (isGk ? toDisplayScore(score) : score) + ' 分</span>'
      + '<span class="exam-line">' + esc(line.label)
      + (isGk ? '<i class="exam-full">满分 750</i>' : '') + '</span>'
      + '<span class="exam-note">' + esc(isGk
        ? '智力 ' + state.int + ' + 情商加成 ' + Math.round(state.eq * 0.2)
          + ' + 学校 ' + preTierBonus
        : '按当前智力与学校档次结算') + '</span>';

    state.pendingExam = null;                    // 保险 2：立刻清队列
    var go = $('btnExamGo');
    if (go) go.textContent = '确定';
    render();
  }

  function closeExam() {
    var box = $('examMask');
    if (box) box.hidden = true;
    examOpen = false;
    render();
  }

  var pendingEvent = null;
  var eventRoll = Math.random;                 // 抽事件用的随机源（可替换以便测试）
  var deferredEventIds = [];                   // 因冲突被顺延的必发事件
  var eventNoteText = '';                      // 显示在弹窗底部的顺延提示
  function eligibleEvents() {
    var fired = state.triggeredEvents || [];
    return eventsData.filter(function (ev) {
      if (ev.id === FALLBACK_ID || ev.chainOnly) return false;   // 保底与链式后续不进常规池
      if (fired.indexOf(ev.id) > -1) return false;               // 已触发过的不再进池
      return checkRequires(ev).length === 0;
    });
  }

  function fallbackEvent() {
    for (var i = 0; i < eventsData.length; i++) {
      if (eventsData[i].id === FALLBACK_ID) return eventsData[i];
    }
    return null;
  }

  // 在事件池里抽一个：优先补发上月顺延 → 再抽必发事件 → 最后走权重
  function pickEvent() {
    eventNoteText = '';

    // ① 上个月因冲突被顺延的事件，这个月优先补发
    if (deferredEventIds.length) {
      var deferredId = deferredEventIds.shift();
      var deferred = findEvent(deferredId);
      if (deferred) {
        eventNoteText = '【顺延补发】上次没能遇上「' + deferred.title + '」，这次补上。';
        return deferred;
      }
    }

    var pool = eligibleEvents();
    if (!pool.length) return fallbackEvent();

    // ② 必发事件（priority: true）无视权重，优先在这批里随机一个
    var must = pool.filter(function (ev) { return ev.priority === true; });
    if (must.length) {
      var idx = Math.floor(eventRoll() * must.length);
      var chosen = must[Math.min(idx, must.length - 1)];

      // 同一时间只能演一个：其余必发事件顺延到下次跨月
      var rest = must.filter(function (ev) { return ev !== chosen; });
      if (rest.length) {
        deferredEventIds = deferredEventIds
          .concat(rest.map(function (ev) { return ev.id; }))
          .slice(0, DEFER_LIMIT);
        eventNoteText = '本月还有必发事件被顺延：'
          + rest.map(function (ev) { return ev.title; }).join('、')
          + '（下次跨月补发）';
      }
      return chosen;
    }

    // ③ 常规权重抽取（天赋 event_luck：比池内中位权重更稀有的事件，权重上浮）
    var luck = talentMul('event_luck');
    var total = 0, i, w = [];
    var sorted = [];
    for (i = 0; i < pool.length; i++) sorted.push(pool[i].weight || 1);
    sorted.sort(function (a, b) { return a - b; });
    var midWeight = sorted[Math.floor(sorted.length / 2)] || 1;
    for (i = 0; i < pool.length; i++) {
      var base = pool[i].weight || 1;
      w[i] = (luck > 1 && base < midWeight) ? base * luck : base;
      total += w[i];
    }
    var r = eventRoll() * total;
    for (i = 0; i < pool.length; i++) {
      r -= w[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // 选项的收益预览，例如 "心情 +8"
  function optionMeta(opt) {
    var parts = [], effects = opt.effects || {};
    for (var name in effects) {
      if (!Object.prototype.hasOwnProperty.call(effects, name)) continue;
      if (!ATTRS[name]) continue;
      var v = effects[name];
      if (typeof v !== 'number' || !isFinite(v) || v === 0) continue;
      parts.push(ATTRS[name].label + ' ' + fmtDelta(v));
    }
    return parts.join(' · ') || '无属性变化';
  }

  function findEvent(id) {
    for (var i = 0; i < eventsData.length; i++) {
      if (eventsData[i].id === id) return eventsData[i];
    }
    return null;
  }

  function openEvent(ev) {
    SoundFX.play('event');                              // v3.5：事件弹窗 → 提示音
    pendingEvent = ev;
    $('eventTitle').textContent = ev.title;
    $('eventDesc').textContent = ev.description;
    $('eventDate').textContent = state.y + ' 年 ' + state.m + ' 月';
    $('eventOptions').innerHTML = ev.options.map(function (o, i) {
      var miss = checkRequires(o);
      var locked = miss.length > 0;
      var tip = locked ? miss.map(missLabel).join('；') : '';

      return '<button class="event-opt' + (locked ? ' is-locked' : '') + '" type="button"'
        + ' data-idx="' + i + '"'
        + (locked ? ' aria-disabled="true" tabindex="-1" title="' + esc(tip) + '"' : '')
        + '>'
        + '<span class="opt-label">' + esc(o.label) + '</span>'
        + '<span class="opt-meta">' + esc(locked ? miss[0].title : (o.meta || optionMeta(o))) + '</span>'
        + '</button>';
    }).join('');
    var noteEl = $('eventNote');
    if (noteEl) {
      if (eventNoteText) {
        noteEl.textContent = eventNoteText;
        noteEl.hidden = false;
        addLog('sys', eventNoteText);
        eventNoteText = '';
      } else {
        noteEl.hidden = true;
        noteEl.textContent = '';
      }
    }

    $('eventMask').hidden = false;
  }

  function chooseEvent(idx) {
    if (state.ended) return false;             // 结局已出：残留弹窗不再结算
    var ev = pendingEvent;
    if (!ev) return false;
    var opt = ev.options[idx];
    if (!opt) return false;

    // 选项条件不满足：只给提示，不结算、不关窗
    var miss = checkRequires(opt);
    if (miss.length) {
      toast(lockText({ name: opt.label }, miss));
      return false;
    }

    pendingEvent = null;

    var before = snapshot();
    applyEffects(opt.effects);
    clampStats();
    var delta = deltaText(before);
    addLog('event', '【事件·' + ev.title + '】' + opt.label + ((delta && delta !== '—') ? '（' + delta + '）' : ''));
    if (opt.result) addLog('sys', opt.result);

    if (typeof opt.onChoose === 'function') opt.onChoose(opt);   // 选项附带的特殊结算

    dirty = true;
    render();

    // 链式剧情：不关窗，直接换下一段
    var next = opt.nextEventId ? findEvent(opt.nextEventId) : null;
    if (next) {
      addLog('sys', '【事件】剧情继续：' + next.title + '。');
      openEvent(next);
      return true;
    }

    $('eventMask').hidden = true;
    // 月度事件处理完，若还压着升学考核，这时候补弹（避免两个弹窗打架）
    if (state.pendingExam && !examOpen) openExam();
    return true;
  }

  // 跨月后抽一次事件
  function triggerMonthlyEvent() {
    if (state.ended) return;                   // 人生已结束：不再抽事件
    if (pendingEvent) return;                  // 已有未处理的事件就不叠加
    if (pendingDisease) {                      // v3.13：疾病优先于常规随机事件
      var dis = pendingDisease;
      pendingDisease = null;
      openEvent(dis);
      return;
    }
    var ev = pickEvent();
    if (!ev) return;                           // 没有符合条件的事件就这月无事

    // 一次性事件：登记到 triggeredEvents
    if (ev.requires && ev.requires.onceEver === true) {
      if (!state.triggeredEvents) state.triggeredEvents = [];
      if (state.triggeredEvents.indexOf(ev.id) === -1) state.triggeredEvents.push(ev.id);
      state.usage[ev.id] = state.usage[ev.id] || {};
      state.usage[ev.id].ever = true;
    }
    openEvent(ev);
  }

  // 推进 n 天：每一天都单独结算（日结算 + 可能的月结算/跨年），支持 costDays > 1
  function advanceDays(n) {
    if (examOpen) return 0;                        // 考试期间时间冻结（保险 3）
    var days = Math.max(1, Math.round(Number(n) || 1));
    for (var i = 0; i < days; i++) {
      if (state.ended) break;                     // 结算中途结束了（濒死/寿终）：剩下的天数不再推进
      var r = advanceDay();
      dailySettle();
      if (r.month) {
        monthlySettle();
        triggerMonthlyEvent();                 // 发薪日结算完成后抽一个事件
      }
      if (r.year) yearlySettle();
    }
    // 跨年触发的升学考核：等手头事件处理完再弹，避免两个弹窗打架
    if (state.pendingExam && !pendingEvent && !examOpen) openExam();
    return days;
  }

  // v3.4 · S4：advanceDays 外部包层——不改 advanceDays 内部任何代码，
  // 只在执行前后比较绝对月，跨月/跨年结算完成后静默存一次档。
  // 测试/模拟环境（?rjs_test=1）直接透传，不自动存档，避免拖慢 500 局平衡模拟。
  function advanceDaysAutoSave(n) {
    if (TITLE_SKIP) return advanceDays(n);
    var before = absMonth();
    var prevSnapshot = JSON.stringify(state);   // v3.7：跨月前快照，回溯用
    var r = advanceDays(n);
    if (absMonth() !== before) {
      try { localStorage.setItem(PREV_KEY, prevSnapshot); } catch (e) {}
      saveGameSilent();
      checkAchievements();                        // v3.7：跨月结算时检测成就
    }
    return r;
  }

  // 唯一入口：查表 → 校验 requires → 应用 effects → 推进 costDays → 结算 → 重绘
  // v3.7：属性飘字动效（独立 DOM 动画，只读 before/after，不碰结算逻辑）
  function showFloatDeltas(before) {
    if (!before) return;
    // v3.16.1：模拟开关——飘字依赖 setTimeout 动画，批量跑局时会堆积成吨的定时器
    if (window.IS_SIMULATION === true) return;
    var map = { int:'sInt', sta:'sSta', cha:'sCha', will:'sWill', eq:'sEq', luck:'sLuck', money:'sMoney', mood:'sMood' };
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var d = Math.round(state[k] - (before[k] || 0));
      if (!d) continue;
      var el = $(map[k]);
      if (!el) continue;
      el.style.position = 'relative';
      var span = document.createElement('span');
      span.className = 'float-num ' + (d > 0 ? 'up' : 'down');
      span.textContent = (d > 0 ? '+' : '') + d;
      el.appendChild(span);
      (function (s) { setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 1000); })(span);
    }
  }

  function doAction(id) {
    if (uiLocked) return false;                    // v3.4：标题界面下拒绝一切行动（时间冻结第二道保险）
    var act = findAction(id);
    if (!act) { console.warn('[人间四季] 未找到行动：' + id); return false; }
    if (examOpen) {                                // 升学考核弹窗未结算：冻结所有行动
      toast('先完成升学考核。');
      return false;
    }
    if (state.ended) {                             // 人生已结束：给个反馈，并把结算面板翻出来
      toast('这一生已经走完了，点「重新投胎」再开一局。');
      reopenEndPanel();
      return false;
    }

    // 门槛不满足：只写日志 + 气泡提示，属性不变、时间不动
    var miss = checkRequires(act);
    if (miss.length) {
      var msg = lockText(act, miss);
      addLog('warn', msg);
      toast(msg);
      render();
      return false;
    }

    var before = snapshot();

    if (typeof act.beforeEffects === 'function') act.beforeEffects();   // 动态收益（如学习递减）
    applyEffects(act.effects);
    clampStats();
    addLog('action', '【' + act.name + '】' + deltaText(before));

    if (typeof act.onRun === 'function') act.onRun(act);   // 特殊结算（高考 / 入职 …）
    clampStats();            // onRun 里也可能加体质（如「休息」的偶数日 +1），再兜一次边界
    applyTalentGain(before); // 天赋：只对本次行动的增量加成
    advanceDaysAutoSave(act.costDays);   // v3.4：包层推进，跨月时静默存档
    markUsage(act);          // 记录「今天/本周做过了」

    dirty = true;
    render();
    showFloatDeltas(before);   // v3.7：属性飘字（只 UI 反馈，不碰结算）
    return true;
  }

  /* ================= [引擎层] 存档 / 读档 ================= */
  // 统一落盘核心：silent=true 时静默（不弹 toast，自动存档用）
  function persistGame(silent) {
    try {
      var payload = { app: 'renjian-siji', v: 1, at: Date.now(), state: state };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      dirty = false;
      renderFoot();
      if (!silent) toast('已保存到本地存档');
    } catch (e) {
      if (!silent) toast('本地存储不可用，保存失败');
    }
  }
  function saveGame() { persistGame(false); }        // 手动：带提示
  function saveGameSilent() { persistGame(true); }   // 自动/兜底：静默

  /* ================= [引擎层] v3.7 后悔机制（回溯时间） =================
     跨月前在 advanceDaysAutoSave 里把整份 state 存到 PREV_KEY。
     回溯时读 PREV_KEY 覆盖当前，扣 50% 存款，不碰引擎逻辑。 */
  function rewindTime() {
    var raw = null;
    try { raw = localStorage.getItem(PREV_KEY); } catch (e) {}
    if (!raw) { toast('还没有可以回溯的月份'); return; }
    var p;
    try { p = JSON.parse(raw); } catch (e) { toast('回溯数据已损坏'); return; }
    state = sanitize(p.state || p);
    state.money = Math.round((state.money || 0) * 0.5);   // 代价：存款减半
    state.logs = state.logs || [];
    pendingEvent = null; deferredEventIds = []; lastSeason = null;
    dirty = true;
    addLog('danger', '你从梦中惊醒，发现自己回到了上个月。');
    render();
    toast('⏪ 已回溯到上个月（存款减半）');
  }

  /* ================= [引擎层] v3.7 成就系统 ================= */
  function loadAch() { try { return JSON.parse(localStorage.getItem(ACH_KEY) || '[]'); } catch (e) { return []; } }
  function saveAch(arr) { try { localStorage.setItem(ACH_KEY, JSON.stringify(arr)); } catch (e) {} }

  function checkAchievements() {
    if (!state) return;
    var unlocked = loadAch(), newly = [];
    for (var i = 0; i < achievementsData.length; i++) {
      var a = achievementsData[i];
      if (unlocked.indexOf(a.id) > -1) continue;
      try {
        if (a.test(state)) { unlocked.push(a.id); newly.push(a); }
      } catch (e) {}
    }
    if (!newly.length) return;
    saveAch(unlocked);
    for (var j = 0; j < newly.length; j++) {
      addLog('sys', '【成就】解锁「' + newly[j].name + '」——' + newly[j].desc);
      toast('🏆 解锁成就：' + newly[j].name);
    }
  }

  function asInt(v, def, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function sanitize(s) {
    var now = new Date();
    // 婚姻系统：旧档没有 moodMax 时按 100 处理，心情上限只允许 100-120
    var moodMaxVal = asInt(s.moodMax, MOOD_MAX_BASE, MOOD_MAX_BASE, MOOD_MAX_CAP);
    var out = {
      v: 1,
      y: asInt(s.y, now.getFullYear(), 1900, 2200),
      m: asInt(s.m, now.getMonth() + 1, 1, 12),
      d: 1,
      int: asInt(s.int, 10, 0, 500),
      sta: asInt(s.sta, 10, 0, 100),
      cha: asInt(s.cha !== undefined ? s.cha : s.charm, 10, 0, 500),
      will: asInt(s.will, 10, 0, 500),
      eq: asInt(s.eq, 10, 0, 500),
      luck: asInt(s.luck, 10, 0, 500),
      money: isFinite(Number(s.money)) ? Math.round(Number(s.money)) : 2800,
      mood: asInt(s.mood, 80, 0, moodMaxVal),
      stockValue: asInt(s.stockValue, 0, 0, 999999999),   // v3.22：旧档缺失 → 0
      city: (typeof s.city === 'string' && s.city) ? s.city : 'normal',   // v3.24：旧档缺失/非法 → 普通城市（系数 1.0）
      housing: (s.housing === 'dorm' || s.housing === 'rent') ? s.housing : 'home',   // v3.5.4：居住状态，旧档缺省 home
      isStudent: (s.edu === '本科' || s.edu === '专科') && (Number(s.age) || 0) < 22,   // v3.7：在校生（读档时按学历+年龄回推）
      /* --- 婚姻系统字段（v3.0）--- */
      married: s.married === true,
      hadTeenLove: s.hadTeenLove === true,        // v3.5.3：早恋标记，旧档缺失 → false
      loveState: (s.loveState === 'dating' || s.loveState === 'married') ? s.loveState : (s.married ? 'married' : 'single'),   // v3.7：旧档按 married 回推
      /* v3.16：旧档完全没有 inLove / partnerName 时按感情状态与 spouse 回推，缺省 false / ''，绝不抛错 */
      inLove: (s.inLove === true)
        || (s.inLove === undefined && (s.loveState === 'dating' || s.loveState === 'married' || s.married === true)),
      partnerName: (typeof s.partnerName === 'string' && s.partnerName)
        ? s.partnerName.slice(0, 12)
        : (typeof s.spouse === 'string' ? s.spouse.slice(0, 12) : ''),
      datingStart: asInt(s.datingStart, 0, 0, 999999),   // v3.7
      datingLove: asInt(s.datingLove, 0, 0, 100),        // v3.9
      isSummerBreak: s.isSummerBreak === true,           // v3.7
      enteredCollegeMonth: asInt(s.enteredCollegeMonth, 0, 0, 999999),
      summerBreakEnd: asInt(s.summerBreakEnd, 0, 0, 999999),
      firstSalary: s.firstSalary === true,               // v3.7
      hasInsurance: s.hasInsurance === true,             // v3.13
      spouse: typeof s.spouse === 'string' ? s.spouse.slice(0, 12) : '',
      marriedAt: asInt(s.marriedAt, 0, 0, 999999),
      love: asInt(s.love, 50, 0, 100),
      kids: asInt(s.kids, 0, 0, 3),
      divorceCount: asInt(s.divorceCount, 0, 0, 9),
      familyCost: asInt(s.familyCost, 0, 0, 9999999),
      coldMonths: asInt(s.coldMonths, 0, 0, 12),
      moodMax: moodMaxVal,
      lastMarryMonth: asInt(s.lastMarryMonth, 0, 0, 999999),
      severancePay: asInt(s.severancePay, 0, 0, 9999999),
      severanceLeft: asInt(s.severanceLeft, 0, 0, 3),
      /* --- 子女养育（v3.1）--- */
      children: [],
      dink: s.dink === true,
      lostChild: asInt(s.lostChild, 0, 0, 9),
      supportIncome: asInt(s.supportIncome, 0, -99999, 99999),
      age: asInt(s.age, START_AGE, 0, 150),
      edu: (typeof s.edu === 'string' && EDU_RANK[s.edu] !== undefined) ? s.edu : START_EDU,
      job: typeof s.job === 'string' && s.job ? s.job.slice(0, 20) : '无业',
      salary: asInt(s.salary, 0, 0, 9999999),
      totalWorkYears: asInt(s.totalWorkYears, asInt(s.workYears, 0, 0, 80), 0, 80),
      currentPositionYears: asInt(s.currentPositionYears, asInt(s.workYears, 0, 0, 80), 0, 80),
      deathStrikes: asInt(s.deathStrikes, 0, 0, 9),
      hospitalCount: asInt(s.hospitalCount, 0, 0, 9),   // v3.9
      studyCarry: isFinite(Number(s.studyCarry)) ? Number(s.studyCarry) : 0,
      hopCount: asInt(s.hopCount, 0, 0, 99),
      triggeredEvents: Array.isArray(s.triggeredEvents)
        ? s.triggeredEvents.filter(function (x) { return typeof x === 'string'; }).slice(0, 200)
        : [],
      ended: s.ended === true,
      endingId: typeof s.endingId === 'string' ? s.endingId.slice(0, 24) : '',
      endReason: typeof s.endReason === 'string' ? s.endReason.slice(0, 12) : '',
      lastJobChangeMonth: asInt(s.lastJobChangeMonth, 0, 0, 999999),
      usage: {},
      logs: [],
      talents: [],
      school: '',
      schoolTier: '普通',
      schoolBonus: 0,
      examLog: [],
      milestones: [],
      pendingExam: null,
      profile: {                                   // v3.4：新增字段，旧档缺失 → 补默认值
        name: (typeof s.profile === 'object' && s.profile && typeof s.profile.name === 'string')
          ? s.profile.name.slice(0, 8) : '',
        sex: (s.profile && (s.profile.sex === '男' || s.profile.sex === '女')) ? s.profile.sex : '女'
      },
      at: Date.now()
    };
    out.d = asInt(s.d, 1, 1, daysInMonth(out.y, out.m));

    // 天赋：结构不合法或旧存档没有 → 补抽 2 个（读档后即生效）
    out.talents = normalizeTalents(s.talents);

    // 教育系统：旧存档补学校档位；已成年的人不补考，直接标记节点已过
    out.schoolTier = (typeof s.schoolTier === 'string' && SCHOOL_TIERS[s.schoolTier]) ? s.schoolTier : '普通';
    out.school = (typeof s.school === 'string' && s.school) ? s.school.slice(0, 16) : schoolName(out.schoolTier);
    out.schoolBonus = asInt(s.schoolBonus, schoolBonusOfTier(out.schoolTier), -20, 25);
    out.examLog = Array.isArray(s.examLog)
      ? s.examLog.filter(function (x) { return x && typeof x.stage === 'string'; }).slice(-12)
      : [];
    out.milestones = Array.isArray(s.milestones)
      ? s.milestones.filter(function (x) { return typeof x === 'string'; }).slice(0, 12)
      : [];
    if (out.age >= 18 && out.milestones.indexOf('18') === -1) out.milestones.push('18');
    out.pendingExam = (s.pendingExam && typeof s.pendingExam.stage === 'string') ? { stage: s.pendingExam.stage } : null;

    // 子女：v3.1 起用数组；老存档只有 kids 数字 → 补录占位孩子（年龄按父母年龄倒推）
    out.children = normalizeChildren(s.children, out, s.kids);
    out.kids = out.children.length;                 // kids 永远由数组长度派生

    // 老存档兼容：只有职业名、没有月薪的，按职业表补
    if (!out.salary && s.job && JOBS[s.job]) out.salary = JOBS[s.job].salary;
    if (!out.salary) out.job = '无业';

    // 老存档兼容：只有 birth、没有 age 的，按出生日期回推年龄
    if (s.birth && s.birth.y) {
      var age = out.y - asInt(s.birth.y, out.y - START_AGE, 1900, 2200);
      out.age = Math.max(0, Math.min(150, age));
    }

    // 行动次数记录：只收合法结构
    if (s.usage && typeof s.usage === 'object') {
      for (var id in s.usage) {
        if (!Object.prototype.hasOwnProperty.call(s.usage, id)) continue;
        var u = s.usage[id] || {};
        if (typeof u.day !== 'string' && typeof u.week !== 'string') continue;
        out.usage[id] = {
          day: typeof u.day === 'string' ? u.day.slice(0, 12) : '',
          week: typeof u.week === 'string' ? u.week.slice(0, 12) : ''
        };
        if (u.ever === true) out.usage[id].ever = true;   // 一生一次事件的标记
      }
    }

    if (Array.isArray(s.logs)) {
      var list = s.logs.slice(-LOG_LIMIT);
      for (var i = 0; i < list.length; i++) {
        var l = list[i];
        if (!l || typeof l.t !== 'string') continue;
        var k = (l.k === 'action' || l.k === 'day' || l.k === 'month' || l.k === 'sys' || l.k === 'warn' || l.k === 'event' || l.k === 'danger') ? l.k : 'sys';
        var entry = {
          k: k,
          y: asInt(l.y, out.y, 1900, 2200),
          m: asInt(l.m, out.m, 1, 12),
          d: asInt(l.d, out.d, 1, 31),
          t: l.t.slice(0, 300)
        };
        if (typeof l.a === 'number' && isFinite(l.a)) entry.a = Math.max(0, Math.min(150, Math.round(l.a)));
        if (typeof l.e === 'string') entry.e = l.e.slice(0, 10);
        out.logs.push(entry);
      }
    }
    return out;
  }

  function loadGame() {
    var raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (e) {
      toast('本地存储不可用，无法读取');
      return false;
    }
    if (!raw) { toast('暂无存档'); return false; }

    var p;
    try { p = JSON.parse(raw); } catch (e) { toast('存档已损坏'); return false; }
    if (!p || p.v !== 1 || !p.state) { toast('存档版本不兼容'); return false; }
    if (dirty && !confirm('读取存档会覆盖当前未保存的进度，继续吗？')) return false;

    state = sanitize(p.state);
    dirty = false;
    lastSeason = null;
    // v3.1：旧存档只有 kids 数字、没有 children 明细时，sanitize 已补录，这里给一条可见提示
    if (!Array.isArray(p.state.children) && (Number(p.state.kids) || 0) > 0 && state.children && state.children.length) {
      addLog('sys', '【补录】旧存档没有子女明细，已补录 ' + state.children.length + ' 个孩子（年龄按父母年龄估算）。');
    }
    addLog('sys', '【读取】已载入存档。');
    render();
    if (state.ended) reopenEndPanel();          // 存的是已结束的人生：直接把结算面板翻回来
    if (state.pendingExam && !state.ended) openExam();   // 存的是没考完的试：把考核弹窗补回来
    toast('已读取存档');
    return true;
  }

