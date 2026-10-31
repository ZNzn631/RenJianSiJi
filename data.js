  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
     【代码分层结构】v3.7 单文件三分层（纯注释标注，不改变任何逻辑）

     ── 纯数据层（只改这里加内容，勿动引擎）─────────────────────────────
        · 常量区（SAVE_KEY / LOG_LIMIT / WEEK / SEASON）
        · actionsData（行动收益与门槛）
        · talentsData（先天天赋 10 个）
        · 教育常量（EXAM_LINES / SCHOOL_TIERS 分数线）
        · eventsData（125 个事件，requires 全在这）
        · 婚姻/家庭/子女数值常量（MARRY_* / KID_* / LIVING_*）

     ── 核心引擎层（红线：绝不允许改动）─────────────────────────────────
        · REQUIRE_RULES + checkRequires（条件校验）
        · 时间工具（daysInMonth / roundInfo / absMonth）
        · 状态（newState / clampStats / snapshot）
        · 核心循环（doAction / advanceDays / monthlySettle / yearlySettle）
        · 事件系统（pickEvent / openEvent / chooseEvent）
        · 结局系统（pickEnding / endLife / showEndPanel）
        · 存档（persistGame / loadGame / sanitize）
        · 婚姻/子女结算（settleFamily / settleChildren）

     ── UI 渲染层（只读 state，可随意重构）──────────────────────────────
        · renderStatus / renderLog / renderScene / renderActions
        · 事件/结局/图鉴/成就/考试 各弹窗渲染
        · 标题/设置页（S1-S3）
        · 音效 SoundFX / 飘字 showFloatDeltas / 成就图鉴 openAch
     ═══════════════════════════════════════════════════════════════════════ */

  /* ================= [数据层] 常量 ================= */
  var SAVE_KEY = 'renjian-siji-save-v1';
  var LOG_LIMIT = 400;
  var WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  // 索引 0..11 对应 1..12 月
  var SEASON_BY_MONTH = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
  var SEASON = {
    spring: { cn: '春', line: '窗外的枝头，又抽了新芽。' },
    summer: { cn: '夏', line: '蝉声铺满整条长街。' },
    autumn: { cn: '秋', line: '风把叶子一片一片数完了。' },
    winter: { cn: '冬', line: '雪落下来的时候，世界很安静。' }
  };

  /* ================= [数据层] 行动数据（数据与逻辑分离，只改这里就能加内容） ================= */
  //  id          唯一标识，同时是按钮 data-act 的值
  //  name        按钮主标题
  //  description 按钮上的小字（氛围描述）
  //  costDays    消耗天数，>1 时自动逐日结算（每日心情恢复 + 跨月扣生活费）
  //  effects     属性影响，键名见 ATTRS：intelligence / stamina / money / mood
  //  requires    可选。通用条件，两类键名混写在同一对象里：
  //              ① 属性区间：mood / stamina / intelligence / money → { min, max }
  //              ② 通用规则：minAge / maxAge / minEdu / education / oncePerDay / oncePerWeek
  //              requires: { stamina: { min: 1 }, minAge: 18, oncePerWeek: true }
  //  denyText    可选。按规则 key 覆盖提示整句，例如 { oncePerDay: '今天已经去过健身房了。' }
  //  onRun       可选。特殊结算函数，在行动日志之后、时间推进之前执行
  var actionsData = window.actionsData = [
    {
      id: 'study',
      name: '学习',
      description: '在旧书店坐到打烊。',
      costDays: 1,
      effects: { mood: -2 },
      displayEffects: { intelligence: 2, mood: -2 },   // 按钮上仍显示「智力 +2」，实际按递减结算
      requires: { mood: { min: 6 } },           // 心情 > 5 才读得进去
      beforeEffects: function () {
        // v3.6：属性成长边际递减（≤100 +2 / ≤200 +1 / ≤300 +0.5 / >300 +0.2）
        var int = state.int;
        var gain;
        if (int <= 100) gain = 2;
        else if (int <= 200) gain = 1;
        else if (int <= 300) gain = 0.5;
        else gain = 0.2;
        state.studyCarry = (state.studyCarry || 0) + gain;
        var real = Math.floor(state.studyCarry);
        state.studyCarry = state.studyCarry - real;
        state.int += real;
      }
    },
    {
      id: 'train',
      name: '锻炼',
      description: '沿着河堤跑完一圈。',
      costDays: 1,
      effects: { stamina: 2, mood: -1 },
      displayEffects: { stamina: 2, mood: -1 },
      requires: {
        stamina: { min: 1 },                    // 体质 > 0 才有力气出门
        oncePerDay: true                        // 每天只能练一次
      },
      denyText: { oncePerDay: '今天已经去过健身房了。' }
    },
    {
      id: 'work',
      name: '打工',
      description: '把一天卖给柜台。',
      costDays: 1,
      effects: { money: 100, stamina: -2, mood: -5, will: 1 },
      displayEffects: { money: 100, stamina: -2, mood: -5 },
      uiHideWhenEmployed: true,                 // v3.7：有正式工作后在 UI 隐藏（只藏按钮、不进 checkRequires，保住平衡模拟的体力消耗）
      requires: {
        stamina: { min: 1 },                    // 体质 > 0 才顶得住班
        minAge: 18,                             // 未满 18 岁不能打工
        oncePerDay: false                       // 次数限制关闭（改成 true 即每天一次）
      },
      denyText: { stamina: '体力不足，快去休息。' }
    },
    {
      id: 'oddjob',
      name: '打零工',
      description: '发传单、端盘子，什么都干。',
      costDays: 1,
      effects: { money: 100, stamina: -2, mood: -5, will: 1 },
      displayEffects: { money: 100, stamina: -2, mood: -5 },
      uiHideWhenEmployed: true,                 // v3.7：有正式工作后在 UI 隐藏（只藏按钮、不进 checkRequires，保住平衡模拟的体力消耗）
      requires: { stamina: { min: 1 } },          // 体力见底就只能先去休息
      denyText: { stamina: '体力不足，快去休息。' },
      // 破产时的保底现金流
      onRun: function () {
        addLog('sys', '你去街头发了一天的传单/端了一天盘子，赚了 100 块，但感觉很累。');
      }
    },
    {
      id: 'rest',
      name: '休息',
      description: '什么也不做，也是本事。',
      costDays: 1,
      effects: { mood: 10, stamina: 1 },
      displayEffects: { mood: 10, stamina: 1 },
      // 偶数日多回 1 点 → 平均每次 1.5 点（v3.7：2 → 1，配合内容扩展维持早逝率）
      onRun: function () {
        if (state.d % 2 === 0) {
          state.sta += 1;
          addLog('sys', '【休息】多躺了一会儿，体力额外 +1。');
        }
      }
      // 不设门槛：休息是永远可用的保底行动
    },
    {
      id: 'buyInsurance',
      name: '购买医保',
      description: '每年缴一次，生病能省一大笔。',
      costDays: 1,
      effects: { money: -2000 },
      displayEffects: { money: -2000 },
      hideWhenLocked: true,
      requires: {
        minAge: 18,                      // v3.13：成年才买
        money: { min: 2000 },
        monthIn: [1],                    // v3.13：仅每年 1 月可买
        noInsurance: true                // v3.13：已买则隐藏
      },
      onRun: function () {
        state.hasInsurance = true;
        addLog('event', '你购买了医疗保险，全年医疗费打 2 折。');
      }
    },
    {
      id: 'social',
      name: '社交',
      description: '去同学家蹭一顿饭，或者陪朋友在街上逛半天。',
      costDays: 1,
      effects: { money: -10, eq: 2, cha: 2, mood: 5 },
      displayEffects: { money: -10, eq: 2, cha: 2, mood: 5 },
      requires: {
        minAge: 12,                             // 12 岁以上才谈得上社交
        oncePerDay: false
      },
      denyText: { minAge: '还不到 12 岁，先好好上学。' }
    },
    {
      id: 'companion',
      name: '陪伴',
      description: '花一天时间，陪在重要的人身边。',
      costDays: 1,
      effects: { money: -100, mood: 3 },
      displayEffects: { money: -100, mood: 3 },
      requires: { oncePerDay: false },
      onRun: function () {
        // v3.9：按对象给不同加成——孩子 > 配偶 > 恋人 > 父母
        if (livingChildren().length > 0) {
          addKidRelation(6);
          addLog('sys', '【陪伴】你陪孩子玩了一天，亲子关系 +6。');
        } else if (state.married) {
          addLove(8);
        } else if (state.loveState === 'dating') {
          state.datingLove = Math.min(100, (state.datingLove || 0) + 6);
          addLog('sys', '【陪伴】你陪恋人度过了一天，好感度 +6。');
        } else {
          state.mood = Math.min(moodMaxOf(), state.mood + 3);
          addLog('sys', '【陪伴】你回家陪父母吃了顿饭，心情 +3。');
        }
      }
    },
    {
      id: 'shopping',
      name: '去商场购物',
      description: '买点自己喜欢的东西，犒劳一下自己。',
      costDays: 1,
      effects: { money: -500, mood: 8 },
      displayEffects: { money: -500, mood: 8 },
      requires: { money: { min: 500 }, oncePerDay: false },
      denyText: { money: '钱不够，逛不起商场。' }
    },
    {
      id: 'treat',
      name: '请客吃饭',
      description: '约上朋友或恋人，好好吃一顿。',
      costDays: 1,
      effects: { money: -300, mood: 6 },
      displayEffects: { money: -300, mood: 6 },
      requires: { money: { min: 300 }, oncePerDay: false },
      onRun: function () {
        // v3.9：按关系对象加「关系」——配偶加感情，恋人加好感，单身加情商
        if (state.married) addLove(5);
        else if (state.loveState === 'dating') {
          state.datingLove = Math.min(100, (state.datingLove || 0) + 5);
          addLog('sys', '【请客】和恋人共进晚餐，好感度 +5。');
        } else {
          state.eq += 1;
          addLog('sys', '【请客】和朋友吃饭聊天，情商 +1。');
        }
      },
      denyText: { money: '钱不够，请不起这顿。' }
    },
    {
      id: 'kidcare',
      name: '陪孩子',
      description: '蹲下来，听孩子把幼儿园的事讲完。',
      costDays: 1,
      effects: { money: -100, mood: 2 },
      displayEffects: { money: -100, mood: 2 },
      hideWhenLocked: true,                      // v3.9：没孩子时彻底隐藏
      requires: {
        hasChild: true,                         // 有存活子女才能点
        oncePerDay: false
      },
      onRun: function () { addKidRelation(6); },
      denyText: { hasChild: '还没有孩子，先成家吧。' }
    },
    {
      id: 'gaokao',
      name: '参加高考',
      description: '一次考试，两种人生。',
      costDays: 1,
      effects: { mood: -10, stamina: -3 },
      displayEffects: { mood: -10, stamina: -3 },
      hideWhenLocked: true,                      // 条件不足时直接隐藏
      requires: {
        minAge: 18, maxAge: 22,                  // 落榜/专科后 22 岁前可复读
        education: ['高中', '专科'],               // 只有高中（落榜）或专科能复读
        alreadyExam: true                        // 必须先经历过一次统一高考
      },
      denyText: {
        education: function () { return '已经是「' + state.edu + '」学历，不需要复读了。'; },
        alreadyExam: '先在 18 岁参加统一高考，落榜或专科后才谈复读。'
      },
      // 复读：直接走统一判定，分数够线即可翻盘
      onRun: function (act) {
        var score = examScore('gaokao');
        var line = examLineOf('gaokao', score);
        var oldEdu = state.edu;
        applyExamResult('gaokao', score, line);
        addLog('event', examResultText('gaokao', score, line));
        if (state.edu !== oldEdu) {
          addLog('event', '【复读成功】从「' + oldEdu + '」升到「' + state.edu + '」。');
        } else if (state.edu === '高中') {
          addLog('sys', '还是没够线，明年再来。');
        }
      }
    },
    {
      id: 'upgrade',
      name: '专升本',
      description: '再给自己两年。',
      costDays: 2,                               // 两年专升本，这里压缩成两天
      effects: { mood: -8, stamina: -4 },
      displayEffects: { mood: -8, stamina: -4 },
      hideWhenLocked: true,
      requires: {
        education: ['专科'],                      // 只有专科能升
        maxAge: 22
      },
      denyText: {
        education: function () { return '专升本只面向专科生（当前「' + state.edu + '」）。'; }
      },
      onRun: function () {
        if (state.int > 180) {
          state.edu = '本科';
          addLog('event', '专升本成功！');
        } else {
          addLog('warn', '专升本失败，智力不够。');
        }
      }
    },
    {
      id: 'clerk',
      name: '应聘普通文员',
      description: '先有份工作，再想别的。',
      costDays: 1,
      effects: { mood: 2, stamina: -1, eq: 1 },
      displayEffects: { mood: 2, stamina: -1 },
      hideWhenLocked: true,
      requires: { minAge: 22, minEdu: '专科', isStudent: false, unemployed: true },   // v3.5.3：坐办公室全职需专科+22岁，18岁只能打零工；v3.7：在校生不投全职
      onRun: function (act) {
        state.job = '普通文员';
        state.salary = JOBS['普通文员'].salary;
        state.housing = 'rent';                  // v3.5.4：正式工作后租房
        state.totalWorkYears = 0;                // 新工作，工龄从头算
        state.currentPositionYears = 0;
        markJobChange();                         // 入职同样开始计冷却
        addLog('event', '入职文员，每月月底发薪。');
      }
    },
    {
      id: 'coderRegular',
      name: '应聘普通程序员',
      description: '小公司外包项目，先上车再说。',
      costDays: 1,
      effects: { mood: 2, eq: 1 },
      displayEffects: { mood: 2 },
      hideWhenLocked: true,
      requires: {
        minAge: 22,
        minEdu: '本科',                          // v3.6：本科即可，不要求 985/211
        isStudent: false,                        // v3.7：在校生不投全职
        intelligence: { min: 130 },
        unemployed: true
      },
      onRun: function () {
        state.job = '普通程序员';
        state.salary = JOBS['普通程序员'].salary;
        state.housing = 'rent';
        state.totalWorkYears = 0;
        state.currentPositionYears = 0;
        markJobChange();
        addLog('event', '你入职了一家普通公司做开发，月薪 9000。');
      }
    },
    {
      id: 'coder',
      name: '应聘大厂程序员',
      description: '投了三百份简历。',
      costDays: 1,
      effects: { mood: -2, eq: 1 },
      displayEffects: { mood: -2 },
      hideWhenLocked: true,
      requires: {
        minAge: 22,
        minEdu: '本科',
        schoolTier: '重点',                      // v3.6：985/211 才能进大厂
        isStudent: false,                        // v3.7：在校生不投全职
        intelligence: { min: 180 },              // v3.6：新数值下达 180 已属千里挑一
        unemployed: true
      },
      onRun: function () {
        state.job = '大厂程序员';
        state.salary = JOBS['大厂程序员'].salary;
        state.housing = 'rent';                  // v3.5.4：正式工作后租房
        state.totalWorkYears = 0;                // 新工作，工龄从头算
        state.currentPositionYears = 0;
        markJobChange();                         // 入职同样开始计冷却
        addLog('event', '你成功入职大厂，月薪2万。');
      }
    },
    {
      id: 'promote',
      name: '申请晋升',
      description: '把这几年的活儿摆到桌上。',
      costDays: 1,
      effects: { mood: -3, eq: 2 },
      displayEffects: { mood: -3 },
      hideWhenLocked: true,
      requires: { employed: true, promotable: true },
      onRun: function () {
        var cur = CAREER[state.job];
        if (!cur || !cur.next) { addLog('warn', '你已经到头了，再往上没有位置。'); return; }

        var need = cur.req || {};

        // 资历不够（只看当前岗位熬了多久）
        if ((need.workYears || 0) > state.currentPositionYears) {
          addLog('warn', '【资历尚浅】在当前岗位才做了 ' + state.currentPositionYears
            + ' 年，晋升需要满 ' + need.workYears + ' 年。');
          return;
        }
        // 能力不够
        if ((need.intelligence || 0) > state.int) {
          addLog('warn', '【能力不足】晋升考核要求智力 ≥ ' + need.intelligence
            + '，你当前 ' + state.int + '。');
          return;
        }

        state.job = cur.next;
        state.salary = CAREER[cur.next].salary;
        state.currentPositionYears = 0;            // 只清当前岗位资历，总工龄保留（年终奖不受影响）
        addLog('event', '【升职加薪】恭喜你晋升为' + state.job + '，月薪涨至 ' + state.salary + '！');
      }
    },
    {
      id: 'demote',
      name: '主动降职',
      description: '为了保住饭碗。',
      costDays: 1,
      effects: { mood: -6 },
      displayEffects: { mood: -6 },
      hideWhenLocked: true,
      requires: { employed: true, demotable: true },
      onRun: function () {
        var cur = CAREER[state.job];
        if (!cur || !cur.prev) { addLog('warn', '已经是最低岗位了，没有更低的去处。'); return; }

        var target = cur.prev;
        state.job = target;
        state.salary = CAREER[target].salary;
        state.currentPositionYears = 0;            // 新岗位重新熬资历
        // totalWorkYears 保留：年终奖不打折

        addLog('event', '【主动降职】为了保住饭碗，你申请调岗至' + target
          + '，月薪降至 ' + state.salary + '。虽然钱少了，但压力也小了。');
        toast('已降职为「' + target + '」');
      }
    },
    {
      id: 'hop',
      name: '跳槽',
      description: '换个地方，重新开始。',
      costDays: 1,
      effects: { mood: -4, eq: 1 },
      displayEffects: { mood: -4 },
      hideWhenLocked: true,                      // v3.9：没工作时彻底隐藏
      requires: { employed: true, jobCooldown: 12, minPositionYears: 1 },
      denyText: { jobCooldown: '刚换工作不到一年，频繁跳槽会被HR拉黑。' },
      onRun: function () {
        var posYears = state.currentPositionYears;            // 在岗年限
        var totalYears = state.totalWorkYears;                // 总工龄

        // 涨薪幅度：在岗越久涨得越多
        var rate = posYears > 5 ? 0.3 : (posYears >= 3 ? 0.2 : 0.1);
        rate = rate / (1 + state.hopCount * 0.5);        // 跳得越多，涨得越少

        var baseSalary = (CAREER[state.job] || {}).salary || state.salary;
        var cap = Math.round(baseSalary * 3);            // 岗位薪资天花板：base × 3
        var wanted = Math.round(state.salary * (1 + rate));
        var newSalary = Math.min(wanted, Math.max(cap, state.salary));   // 已超上限则不再涨
        var capped = wanted > newSalary;

        // 签字费系数：看总工龄，1 年就跳对半罚
        var factor = totalYears >= 5 ? 2 : (totalYears >= 3 ? 1.5 : (totalYears >= 2 ? 1 : 0.5));
        var baseHalf = Math.round(newSalary / 2);             // 半个月工资
        var signBonus = Math.round(baseHalf * factor);

        state.salary = newSalary;
        state.hopCount += 1;
        state.money += signBonus;
        state.currentPositionYears = 0;
        state.totalWorkYears = Math.floor(state.totalWorkYears / 2);   // 新公司只认一半资历
        markJobChange();                                       // 重新开始冷却

        addLog('event', '【跳槽成功】你成功跳槽，底薪涨至 ' + newSalary
          + '，拿到签字费 ' + signBonus + '！工龄已清零。');
        addLog('sys', '【跳槽明细】在岗 ' + posYears + ' 年 → 涨薪 +' + Math.round(rate * 100) + '%（第 '
          + state.hopCount + ' 次跳槽，已衰减）；总工龄 ' + totalYears + ' 年 → 签字费 = 半个月工资 '
          + baseHalf + ' × ' + factor + ' = ' + signBonus + '；工龄按半折算为 ' + state.totalWorkYears + ' 年。'
          + (capped ? '（已触及该岗位 ' + cap + ' 元的薪资天花板，底薪不再上调）' : ''));
      }
    },
    {
      id: 'resign',
      name: '辞职',
      description: '把工牌放进抽屉。',
      costDays: 1,
      effects: { mood: 5 },
      displayEffects: { mood: 5 },
      hideWhenLocked: true,
      requires: { employed: true },
      onRun: function () {
        var old = state.job;
        state.job = '无业';
        state.salary = 0;
        state.severanceLeft = 0;                 // v3.3：主动辞职不享受失业金
        state.totalWorkYears = 0;                // 辞职清零工龄
        state.currentPositionYears = 0;
        markJobChange();
        state.usage = {};                        // 重置每日/每周次数限制
        addLog('event', '你辞去了「' + old + '」的工作。');
      }
    }
  ];

  /* ================= [数据层] 天赋数据（v2.7 先天天赋 10 个） ================= */
  // 文档 7.1 的字段：talent_id / name / category / rarity / type / max_level / level_effect
  // effect 是本实现里实际生效的键，目前支持：
  //   gain.<attr>    属性成长倍率（同类叠加封顶 +100%）
  //   mood_guard     心情损失减免（0.3 = 减 30%）
  //   work_pay       行动赚钱加成（0.2 = +20%）
  //   luck_base      开局运气
  //   int_base       开局智力
  //   monthly_sta    每月上班消耗的体质补偿
  // 先天天赋表（v2.7）
  //  level_effect 只允许这五个键（白名单）：
  //    learning_speed  学习收益倍率      work_money   打工/工资收益倍率
  //    event_luck      稀有事件权重      mood_recover 心情恢复加成
  //    stat_gain       指定属性收益 +N（对象，键为属性短名）
  //  效果线性叠加：倍率 = 1 + level × 系数，总加成封顶 +100%（即最高 2.0）
  var talentsData = window.talentsData = [
    { talent_id: 'T_MEMORY',  name: '过目不忘', category: '智力', type: '先天', max_level: 3,
      level_effect: { learning_speed: 0.5 } },
    { talent_id: 'T_SCHOLAR', name: '学霸基因', category: '智力', type: '先天', max_level: 3,
      level_effect: { learning_speed: 0.3 } },
    { talent_id: 'T_MONEY',   name: '财商过人', category: '商业', type: '先天', max_level: 3,
      level_effect: { work_money: 0.5 } },
    { talent_id: 'T_HUSTLE',  name: '拼命三郎', category: '商业', type: '先天', max_level: 3,
      level_effect: { work_money: 0.3 } },
    { talent_id: 'T_LUCK',    name: '锦鲤附体', category: '运气', type: '先天', max_level: 3,
      level_effect: { event_luck: 0.6 } },
    { talent_id: 'T_SMALL',   name: '小确幸',   category: '运气', type: '先天', max_level: 3,
      level_effect: { event_luck: 0.3 } },
    { talent_id: 'T_SUNNY',   name: '乐天派',   category: '心情', type: '先天', max_level: 3,
      level_effect: { mood_recover: 0.5 } },
    { talent_id: 'T_WARM',    name: '人见人爱', category: '魅力', type: '先天', max_level: 3,
      level_effect: { mood_recover: 0.3 } },
    { talent_id: 'T_BODY',    name: '体魄强健', category: '体质', type: '先天', max_level: 3,
      level_effect: { stat_gain: { sta: 1 } } },
    { talent_id: 'T_IRON',    name: '心志如铁', category: '心志', type: '先天', max_level: 3,
      level_effect: { stat_gain: { will: 1 } } },

    /* ===== v3.11 扩充：20 个新天赋（5 极品 / 5 负面 / 10 普通）=====
       红线：只使用现有 level_effect 字段（learning_speed / work_money / event_luck / mood_recover / stat_gain）。
       注意：引擎 applyTalentGain 对负数「只加不减」，目前真正生效的负数是 work_money（工资倍率）。 */
    // ── 极品（5）──
    { talent_id: 'T_PRODIGY',    name: '天生神童', category: '智力', type: '先天', max_level: 3,
      level_effect: { learning_speed: 1.0 } },
    { talent_id: 'T_LUCK_GOD',   name: '天选之子', category: '运气', type: '先天', max_level: 3,
      level_effect: { event_luck: 1.0 } },
    { talent_id: 'T_MONEY_KING', name: '财神爷',   category: '商业', type: '先天', max_level: 3,
      level_effect: { work_money: 1.0 } },
    { talent_id: 'T_IRON_BODY',  name: '天生神力', category: '体质', type: '先天', max_level: 3,
      level_effect: { stat_gain: { sta: 3 } } },
    { talent_id: 'T_ALLROUND',   name: '全才',     category: '智力', type: '先天', max_level: 3,
      level_effect: { learning_speed: 0.5, mood_recover: 0.5 } },

    // ── 负面（5）：真属性减益（v3.12 引擎已支持负数生效）──
    { talent_id: 'T_SICKLY',     name: '病秧子',   category: '体质', type: '先天', max_level: 3,
      level_effect: { stat_gain: { sta: -20 } } },
    { talent_id: 'T_LOST',       name: '路痴',     category: '心情', type: '先天', max_level: 3,
      level_effect: { mood_recover: -0.5 } },
    { talent_id: 'T_UNLUCKY',    name: '倒霉蛋',   category: '运气', type: '先天', max_level: 3,
      level_effect: { stat_gain: { luck: -20 } } },
    { talent_id: 'T_SHOPAHOLIC', name: '剁手党',   category: '商业', type: '先天', max_level: 3,
      level_effect: { stat_gain: { eq: -10 } } },
    { talent_id: 'T_LAZY',       name: '懒癌',     category: '心志', type: '先天', max_level: 3,
      level_effect: { stat_gain: { will: -20 } } },

    // ── 普通（10）──
    { talent_id: 'T_READER',  name: '书虫',   category: '智力', type: '先天', max_level: 3,
      level_effect: { learning_speed: 0.2 } },
    { talent_id: 'T_NOTE',    name: '速记',   category: '智力', type: '先天', max_level: 3,
      level_effect: { stat_gain: { int: 1 } } },
    { talent_id: 'T_SALES',   name: '推销员', category: '商业', type: '先天', max_level: 3,
      level_effect: { work_money: 0.2 } },
    { talent_id: 'T_SAVER',   name: '会攒钱', category: '商业', type: '先天', max_level: 3,
      level_effect: { work_money: 0.15 } },
    { talent_id: 'T_BLESS',   name: '小福星', category: '运气', type: '先天', max_level: 3,
      level_effect: { event_luck: 0.2 } },
    { talent_id: 'T_CALM',    name: '淡定',   category: '心情', type: '先天', max_level: 3,
      level_effect: { mood_recover: 0.2 } },
    { talent_id: 'T_CHARM',   name: '亲和力', category: '魅力', type: '先天', max_level: 3,
      level_effect: { mood_recover: 0.15 } },
    { talent_id: 'T_STRONG',  name: '壮实',   category: '体质', type: '先天', max_level: 3,
      level_effect: { stat_gain: { sta: 1 } } },
    { talent_id: 'T_FOCUS',   name: '专注',   category: '心志', type: '先天', max_level: 3,
      level_effect: { stat_gain: { will: 1 } } },
    { talent_id: 'T_SMOOTH',  name: '会来事', category: '情商', type: '先天', max_level: 3,
      level_effect: { stat_gain: { eq: 1 } } }
  ];

  /* ================= [数据层] 疾病数据（v3.13 疾病与医疗系统） ================= */
  // minAge 最低触发年龄；healthLimit 体质低于此值才可能得；cost 治疗费；damage 硬扛扣体质
  var diseasesData = window.diseasesData = [
    { id: 'D_COLD',         name: '感冒',     minAge: 0,  healthLimit: 40, cost: 300,   damage: 5 },
    { id: 'D_GASTRO',       name: '肠胃炎',   minAge: 0,  healthLimit: 40, cost: 800,   damage: 8 },
    { id: 'D_PNEUMONIA',    name: '肺炎',     minAge: 0,  healthLimit: 30, cost: 5000,  damage: 12 },
    { id: 'D_FRACTURE',     name: '骨折',     minAge: 0,  healthLimit: 30, cost: 3000,  damage: 15 },
    { id: 'D_NODULE',       name: '结节',     minAge: 30, healthLimit: 35, cost: 5000,  damage: 10 },
    { id: 'D_HYPERTENSION', name: '高血压',   minAge: 40, healthLimit: 40, cost: 8000,  damage: 12 },
    { id: 'D_DIABETES',     name: '糖尿病',   minAge: 40, healthLimit: 35, cost: 10000, damage: 15 },
    { id: 'D_HEART',        name: '心脏病',   minAge: 45, healthLimit: 30, cost: 30000, damage: 20 }
  ];

  /* ================= [引擎层] 教育系统（v2.8） ================= */
  // 学校档位只影响「高考加分」与 UI，不参与 EDU_RANK / minEdu 判定
  var SCHOOL_TIERS = {
    '重点': { bonus: 10, name: '实验中学' },
    '普通': { bonus: 0,  name: '第三中学' },
    '职高': { bonus: -10, name: '职业学校' }
  };
  var EXAM_LINES = {
    gaokao: [
      { min: 650, tier: '重点', edu: '本科', label: '985', school: '顶尖大学' },
      { min: 550, tier: '重点', edu: '本科', label: '一本 / 211', school: '重点大学' },
      { min: 450, tier: '普通', edu: '本科', label: '普通本科', school: '普通大学' },
      { min: 300, tier: '普通', edu: '专科', label: '专科', school: '专科学校' },
      { min: -999, tier: '普通', edu: '高中', label: '落榜' }
    ],
    xiaoshengchu: [
      { min: 60, tier: '重点', edu: '', label: '重点初中' },
      { min: -999, tier: '普通', edu: '', label: '普通初中' }
    ],
    zhongkao: [
      { min: 80, tier: '重点', edu: '高中', label: '重点高中' },
      { min: 55, tier: '普通', edu: '高中', label: '普通高中' },
      { min: -999, tier: '职高', edu: '高中', label: '职业高中' }
    ]
  };

  // v3.6：高考分数已是 750 分制，这里只做边界钳制
  var EXAM_FULL_RAW = 300;         // 小升初 / 中考仍用 raw（0-300 量级）
  var EXAM_FULL_DISPLAY = 750;
  function toDisplayScore(raw) {
    return Math.max(0, Math.min(EXAM_FULL_DISPLAY, Math.round(raw)));
  }
  function examResultText(stage, raw, line) {
    if (stage !== 'gaokao') return '【' + stage + '】' + raw + ' 分 → ' + line.label;
    var shown = toDisplayScore(raw);
    if (line.edu === '高中') {
      return '【高考出分】你的高考成绩为 ' + shown + ' 分（满分 750），没够着任何院校的分数线。';
    }
    return '【高考出分】你的高考成绩为 ' + shown + ' 分（满分 750），被' + (line.school || line.label) + '录取！';
  }

  function schoolName(tier) {
    return (SCHOOL_TIERS[tier] || SCHOOL_TIERS['普通']).name;
  }
  function schoolBonusOfTier(tier) {
    return (SCHOOL_TIERS[tier] || SCHOOL_TIERS['普通']).bonus;
  }

  // 前史推演：16 岁开局时补 6/12/15 三次升学（不弹窗，一次算完）
  function rollSchoolHistory(baseInt) {
    var log = [];
    var seeded = baseInt + 50 + Math.round((Math.random() * 20) - 10);   // 童年成长补偿
    var mid = seeded >= 60 ? '重点' : '普通';
    log.push({ stage: 'xiaoshengchu', score: seeded, tier: mid, at: Date.now() });

    var zk = Math.round(baseInt * 1.1 + 50 + (mid === '重点' ? 10 : 0) + (Math.random() * 30 - 15));
    var line = EXAM_LINES.zhongkao.filter(function (x) { return zk >= x.min; })[0];
    log.push({ stage: 'zhongkao', score: zk, tier: line.tier, at: Date.now() });

    return {
      tier: line.tier,
      school: schoolName(line.tier),
      examLog: log,
      bonus: schoolBonusOfTier(line.tier)
    };
  }

  function talentById(id) {
    for (var i = 0; i < talentsData.length; i++) {
      if (talentsData[i].talent_id === id) return talentsData[i];
    }
    return null;
  }

  // 开局抽 n 个不重复的先天天赋，存成 [{ id, level }]，方便以后接「天赋升级」
  function rollTalents(n) {
    var pool = talentsData.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var out = [];
    for (var k = 0; k < Math.min(n, pool.length); k++) out.push({ id: pool[k].talent_id, level: 1 });
    return out;
  }

  // 旧存档兼容：字符串 / {id,level} / 空 都能读，缺了就补抽
  function normalizeTalents(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      var id = typeof rec === 'string' ? rec : (rec && typeof rec.id === 'string' ? rec.id : '');
      var t = talentById(id);
      if (!t || seen[id]) continue;
      var lv = Math.max(1, Math.min(t.max_level || 3, Math.round(Number(rec && rec.level) || 1)));
      seen[id] = 1;
      out.push({ id: id, level: lv });
    }
    if (out.length >= 2) return out.slice(0, 2);
    var extra = rollTalents(2);
    for (var k = 0; k < extra.length && out.length < 2; k++) {
      if (seen[extra[k].id]) continue;
      seen[extra[k].id] = 1;
      out.push(extra[k]);
    }
    return out;
  }

  function talentName(rec) {
    var t = talentById(rec && rec.id ? rec.id : rec);
    return t ? t.name : '';
  }

  /* ===== 婚姻/生育年龄常量（v3.5 修复：必须定义在 eventsData 之前）=====
     这些常量被事件 requires 直接引用（minAge: MARRY_MIN_AGE 等）。
     若定义在 eventsData 之后，数组字面量求值时 var 提升只给了 undefined，
     导致 minAge/maxAge 规则失效（16 岁也能刷相亲、42 岁后还能刷生育的根因）。 */
  var MARRY_MIN_AGE = 22;          // 可以参加相亲 / 自由恋爱的最低年龄
  var MARRY_URGE_AGE = 26;         // 家里开始「催婚」的年龄
  var MARRY_COOLDOWN = 30;         // 婚变后的再婚冷却（月）
  var PREGNANCY_MIN_AGE = 26;      // 考虑生育的最低年龄
  var PREGNANCY_MAX_AGE = 42;      // 考虑生育的最高年龄
  var DATING_MIN_MONTHS = 3;       // v3.7：交往满几个月才可领证
  var SUMMER_BREAK_MONTHS = 2;     // v3.7：高考后暑假过渡期时长（月）

  /* ================= [数据层] 事件数据（跨月随机事件） ================= */
  //  id / title / description / weight（权重越大越常见）/ options[{ label, effects, result }]
  var eventsData = window.eventsData = [
    {
      id: 'E_LOST_WALLET',
      title: '捡到钱包',
      description: '你在路边捡到一个钱包，里面有 2000 块现金，还有一张写着名字的工牌。',
      weight: 3,
      requires: { onceEver: true },
      options: [
        {
          label: '占为己有',
          effects: { money: 2000, mood: -10 },
          result: '钱进了口袋，工牌被你扔进了垃圾桶。'
        },
        {
          label: '交给警察',
          effects: { mood: 6 },
          result: '你在派出所填了张表，失主已经联系上了。',
          nextEventId: 'E_POLICE_GOOD'            // 无缝接下一段剧情
        }
      ]
    },
    {
      id: 'E_POLICE_GOOD',
      title: '失主道谢',
      description: '第二天，警察带着失主找到了你。失主是个大老板，为表感谢，硬塞给你一笔奖金。',
      weight: 1,                                  // 只在链式里被调用，不进常规池
      chainOnly: true,
      options: [
        {
          label: '收下奖金',
          effects: { money: 1200, mood: 4 },
          result: '他说以后有事可以找他，你笑着点头。'
        }
      ]
    },
    {
      id: 'aircon',
      title: '空调坏了',
      description: '三伏天，出租屋的空调发出最后一声哀鸣，彻底不制冷了。',
      weight: 6,
      requires: { housing: 'rent', monthIn: [6, 7, 8] },   // v3.5.4：出租屋专属 + 夏天
      options: [
        {
          label: '花钱修好',
          requires: { money: { min: 500 } },
          effects: { money: -500, mood: 6 },
          result: '师傅换了个压缩机，屋里终于凉快了。'
        },
        {
          label: '忍一忍',
          effects: { stamina: -5, mood: -4 },
          result: '你靠风扇和凉席熬过了这个夏天。'
        }
      ]
    },
    {
      id: 'annualReview',
      title: '年终总结',
      description: '十二月，公司要求每人交一份年终总结，明早就要。',
      weight: 6,
      priority: true,                             // 关键事件：当月必发
      requires: { job: 'not_null', minAge: 18, monthIn: [12] },   // v3.5.2：年终总结必须在职+成年，避免高中生刷到
      options: [
        {
          label: '认真写完',
          effects: { mood: -5, intelligence: 2 },
          result: '你写到凌晨两点，把这一年的活儿都过了一遍。'
        },
        {
          label: '随便糊弄',
          effects: { mood: 5 },
          result: '你复制了去年的模板，老板一眼就看出来了。',
          onChoose: function () {
            // 30% 概率当场被优化（复用裁员随机源）
            if (!(state.salary > 0)) return;
            if (layoffRoll() >= 0.3) return;
            doLayoff('年终总结敷衍了事');
          }
        }
      ]
    },
    {
      id: 'overtime',
      title: '临时派活',
      description: '下班前十分钟，老板把一整个文件夹拍在你桌上：「今晚要。」',
      weight: 4,
      requires: { job: 'not_null', minAge: 18 },  // 无业 / 未成年不参与抽取
      options: [
        { label: '留下来加班', effects: { money: 200, stamina: -4, mood: -8 }, result: '你干到末班车停运。' },
        { label: '推说家里有事', effects: { mood: -3 }, result: '老板没说什么，只是记住了。' }
      ]
    },
    /* ============ 青年阶段（18-25 岁）剧情 ============ */
    {
      id: 'E_GRAD_CHOICE',
      title: '毕业抉择',
      description: '毕业典礼那天，三份东西摆在你桌上：大厂的 offer、考研报名表、老家的公务员招考简章。',
      weight: 8,
      priority: true,                             // 关键节点：必发
      requires: { onceEver: true, minEdu: '本科', minAge: 21, maxAge: 24 },   // v3.5.3：本科毕业才谈毕业抉择
      options: [
        {
          label: '签下大厂 offer',
          effects: { mood: -8, money: 3000 },
          result: '签字那一刻你想起同学说的「先上岸再说」，手有点抖。'
        },
        {
          label: '再考一年研',
          effects: { mood: -12, intelligence: 18, money: -1200 },
          result: '你把出租屋的墙贴满了英语单词，也把退路贴掉了。'
        },
        {
          label: '回家考公',
          effects: { mood: 4, money: -800 },
          result: '父母很高兴，你却在地铁上看了很久窗外的广告牌。'
        }
      ]
    },
    {
      id: 'E_WORKPLACE_TRAP',
      title: '职场潜规则',
      description: '部门出了纰漏，主管把你叫进会议室：「这个锅你背一下，年终我给你补回来。」',
      weight: 8,
      priority: true,                             // 关键节点：必发
      requires: { onceEver: true, job: 'not_null', minAge: 18, maxAge: 30 },
      options: [
        {
          label: '配合背锅',
          effects: { mood: -16, money: 2000 },
          result: '「补偿」到账了，但你的名字挂在了通报里。'
        },
        {
          label: '当场拒绝',
          effects: { mood: 8, stamina: -2 },
          result: '会议室安静了三秒，主管笑着说「年轻人有想法」。',
          onChoose: function () {
            if (!(state.salary > 0)) return;
            if (layoffRoll() >= 0.35) return;
            doLayoff('拒绝了主管的锅');
          }
        },
        {
          label: '收集证据举报',
          effects: { mood: -4, stamina: -3, intelligence: 2 },
          result: '你把邮件和聊天记录都存了下来，交上去那天手一直在抖。',
          onChoose: function () {
            if (!(state.salary > 0)) return;
            if (layoffRoll() >= 0.55) return;
            doLayoff('举报后被穿小鞋');
          }
        }
      ]
    },
    {
      id: 'E_LOVE_ONLINE',
      title: '网恋奔现',
      description: '聊了半年的那个人终于约你见面，地点是城西的一家咖啡馆。',
      weight: 4,
      requires: { onceEver: true, single: true, notTeenLove: true, loveState: 'single', minAge: 18, maxAge: 25 },   // v3.7：未婚、单身、且没早恋过才网恋
      options: [
        {
          label: '盛装赴约',
          effects: { mood: 4 },
          result: '你提前半小时到了，反复检查自己的头发。',
          nextEventId: 'E_LOVE_MEET'
        },
        {
          label: '先要个视频',
          effects: { mood: 2, intelligence: 1 },
          result: '你在心里给自己点了个赞：稳妥。',
          nextEventId: 'E_LOVE_OK'
        },
        {
          label: '删掉对方',
          effects: { mood: -2, intelligence: 1 },
          result: '你删得很干脆，然后失眠到三点。'
        }
      ]
    },
    {
      id: 'E_LOVE_MEET',
      title: '见面之后',
      description: '对面坐下的人，和照片差得有点远；聊了十分钟，你发现对方连工作都换了三次说法。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '硬着头皮吃完这顿',
          effects: { mood: -12, money: -180 },
          result: '你买了单，回家路上下起了雨。'
        },
        {
          label: '借口有事离开',
          effects: { mood: -6 },
          result: '你在街角站了很久，觉得自己像个小丑。'
        }
      ]
    },
    {
      id: 'E_LOVE_OK',
      title: '视频那头',
      description: '视频接通，对面的人比照片还耐看，说话也和聊天时一样。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '继续交往',
          effects: { mood: 14, money: -500 },
          result: '你们第一次约会吃了顿不便宜的火锅，你心甘情愿。'
        }
      ]
    },
    {
      id: 'E_ROOMMATE',
      title: '合租室友',
      description: '室友半夜敲你房门，说家里出了急事，想跟你借点钱周转。',
      weight: 4,
      requires: { onceEver: true, housing: 'rent', minAge: 18, maxAge: 28 },   // v3.5.4：出租屋/合租专属
      options: [
        {
          label: '借给他应急',
          requires: { money: { min: 800 } },
          effects: { money: -800, mood: 2 },
          result: '他连说了三声谢谢，还写了张欠条。',
          nextEventId: 'E_ROOMMATE_RUN'
        },
        {
          label: '婉言拒绝',
          effects: { mood: -3 },
          result: '之后一个月，你们在客厅遇见都只是点头。'
        }
      ]
    },
    {
      id: 'E_ROOMMATE_RUN',
      title: '人去房空',
      description: '一周后你下班回来，室友的东西全没了，欠条压在桌上，电话已关机。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '报警备案',
          effects: { money: -100, mood: -6 },
          result: '警察做了笔录，说这类事很难追回来。'
        },
        {
          label: '算了，认栽',
          effects: { mood: -10 },
          result: '你把欠条折好放进钱包，提醒自己记住这次。'
        }
      ]
    },
    {
      id: 'E_OLD_FRIEND',
      title: '旧友重逢',
      description: '高中最好的朋友突然联系你，说在附近出差，想见一面。饭吃到一半，他开口借钱。',
      weight: 4,
      requires: { onceEver: true, minAge: 18 },
      options: [
        {
          label: '借他一笔',
          requires: { money: { min: 3000 } },
          effects: { money: -3000, mood: 4 },
          result: '他拍着胸脯说三个月就还，你没要欠条。',
          nextEventId: 'E_OLD_FRIEND_DEBT'
        },
        {
          label: '只请这顿饭',
          effects: { money: -200, mood: 3 },
          result: '你们聊了很多以前的事，谁都没再提钱。'
        }
      ]
    },
    {
      id: 'E_OLD_FRIEND_DEBT',
      title: '三个月后',
      description: '约定的还款日过去两周了，他的头像一直是灰色的，朋友圈却更新得很勤。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '上门要账',
          effects: { money: 1200, mood: -10 },
          result: '你只拿回一小部分，还失去了一个朋友。'
        },
        {
          label: '自认倒霉',
          effects: { mood: -12, intelligence: 2 },
          result: '你把他删了，也把「借钱给朋友」这件事删了。'
        }
      ]
    },
    {
      id: 'E_POSTGRAD',
      title: '考研上岸',
      description: '分数出来了，你比分数线高了三十多分。导师的邮件躺在收件箱里，标题是「欢迎」。',
      weight: 3,
      requires: { onceEver: true, education: ['本科'], intelligence: { min: 151 }, minAge: 22, maxAge: 26 },   // v3.7：22 岁 + 本科学历才能考研（18 岁在校生不可）
      options: [
        {
          label: '报名冲刺',
          effects: { money: -1500, mood: -12, intelligence: 25 },
          result: '你把三年时间押在了一间只有六平米的出租屋里。'
        },
        {
          label: '放弃，先赚钱',
          effects: { money: 1500, mood: 3 },
          result: '你签了工作，把录取通知书夹进了抽屉最底层。'
        }
      ]
    },
    {
      id: 'E_DOWNPAY',
      title: '首付',
      description: '中介发来一套房：三十平，首付五万，月供压得人喘不过气，但「这是你自己的」。',
      weight: 2,
      requires: { money: { min: 900000 }, minAge: 18 },
      options: [
        {
          label: '咬牙付首付 90 万',
          requires: { money: { min: 900000 } },
          effects: { money: -900000, mood: -6, stamina: -3 },
          result: '签字那天你拍了张照，晚上就着泡面看了很久。'
        },
        {
          label: '再等等',
          effects: { mood: -4 },
          result: '中介第二天就说房子卖了，你不知道该庆幸还是后悔。'
        }
      ]
    },
    {
      id: 'E_SCAM_CALL',
      title: '诈骗电话',
      description: '一个自称「平台客服」的人说你开通了会员，不取消就要每月扣费，需要你「配合操作」。',
      weight: 3,
      requires: { onceEver: true, minAge: 18 },
      options: [
        {
          label: '按他说的操作',
          effects: { money: -3000, mood: -15 },
          result: '转账成功的那一刻你就明白了，但已经来不及了。'
        },
        {
          label: '挂断并举报',
          effects: { mood: 2, intelligence: 1 },
          result: '你顺手把号码举报了，心情意外地好。'
        }
      ]
    },
    {
      id: 'E_HEALTH',
      title: '体检报告',
      description: '公司体检报告出来了，几项指标后面跟着小小的向上箭头，医生建议复查。',
      weight: 3,
      requires: { job: 'not_null', minAge: 18 },   // v3.5.5：公司体检必须在职
      options: [
        {
          label: '花钱做详细检查',
          requires: { money: { min: 800 } },
          effects: { money: -800, stamina: 6, mood: 2 },
          result: '虚惊一场，但医生让你少熬夜。'
        },
        {
          label: '先不管它',
          effects: { stamina: -5, mood: -6 },
          result: '你把报告折起来塞进抽屉，继续熬夜。'
        }
      ]
    },
    {
      id: 'E_FIRST_SALARY',
      title: '第一笔工资',
      description: '工资到账了，短信弹出来的那一下，你在公司楼下的便利店站了很久。',
      weight: 3,
      requires: { employed: true, minAge: 18, maxAge: 28, onceEver: true },
      options: [
        {
          label: '转一半给家里',
          effects: { money: -1000, mood: 8 },
          result: '妈妈在电话里说「你自己留着花」，声音有点抖。',
          onChoose: function () { state.firstSalary = true; }   // v3.7：写入状态标记，配合 onceEver 防重复
        },
        {
          label: '给自己买点东西',
          effects: { money: -800, mood: 6, stamina: 1 },
          result: '你买了双一直想要的鞋，走路都轻了两斤。',
          onChoose: function () { state.firstSalary = true; }   // v3.7：写入状态标记，配合 onceEver 防重复
        }
      ]
    },
    /* ============ 青年阶段扩充：志愿 / 宿舍 / 大城市 / 初恋 / 钱 ============ */
    {
      id: 'E_APPLY_MAJOR',
      title: '填报志愿',
      description: '志愿表摊在桌上。热门专业分数线悬在头顶，爸妈在旁边说「稳一点好」。',
      weight: 4,
      requires: { onceEver: true, alreadyExam: true, minAge: 18, maxAge: 19, education: ['高中'] },   // v3.5.6：先高考再填志愿（alreadyExam 保证参加过高考）
      options: [
        {
          label: '冲热门计算机',
          effects: { intelligence: 6, mood: -8 },
          result: '你被调剂到了「信息管理」，课程表上一半的课看不懂。',
          nextEventId: 'E_FAMILY_QUARREL'
        },
        { label: '稳妥选师范', effects: { mood: 5, intelligence: 2 }, result: '录取通知书寄到那天，爸妈请了三桌。' },
        { label: '全听爸妈的', effects: { mood: -10, intelligence: 3 }, result: '你签完字才意识到，这个专业你根本不喜欢。' }
      ]
    },
    {
      id: 'E_FAMILY_QUARREL',
      title: '学费',
      description: '开学前一周，客厅里传来争吵声：这笔学费，家里要借。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '申请助学贷款', effects: { money: 3000, mood: -6, intelligence: 2 }, result: '你在银行排了一下午队，签字的手很稳。' },
        { label: '暑假自己挣', effects: { money: 1500, stamina: -5, mood: -3 }, result: '你在工地搬了四十天砖，晒脱了一层皮。' }
      ]
    },
    {
      id: 'E_DORM_NIGHT',
      title: '室友开黑',
      description: '凌晨一点，上铺的键盘声还在响，耳机漏出来的音乐一声比一声大。',
      weight: 5,
      requires: { housing: 'dorm', notSummerBreak: true, minAge: 18, maxAge: 25 },   // v3.7：暑假过渡期不出现
      options: [
        { label: '戴上耳塞忍了', effects: { mood: -5, stamina: -1 }, result: '你睁着眼睛看天花板，直到天亮。' },
        { label: '让他小点声', effects: { mood: -2, intelligence: 1 }, result: '他嘴上答应了，声音只小了三分钟。' },
        { label: '干脆加入', effects: { mood: 8, stamina: -3, intelligence: -2 }, result: '你们打到四点，第二天早课全翘了。' }
      ]
    },
    {
      id: 'E_DORM_THEFT',
      title: '宿舍丢东西',
      description: '你的耳机不见了。翻遍床底，最后在室友的抽屉缝里看到了那一截白色线。',
      weight: 3,
      requires: { onceEver: true, housing: 'dorm', notSummerBreak: true, minAge: 18, maxAge: 25 },   // v3.7：暑假过渡期不出现
      options: [
        { label: '私下问他', effects: { mood: -7 }, result: '他说「可能拿错了」，耳机还回来时线已经断了。' },
        {
          label: '直接找辅导员',
          effects: { mood: -4, intelligence: 1 },
          result: '全宿舍被叫去谈话，气氛降到了冰点。',
          nextEventId: 'E_DORM_FIGHT'
        },
        { label: '算了，再买一副', effects: { money: -200, mood: -4 }, result: '你买了副便宜的，从此东西都锁进柜子。' }
      ]
    },
    {
      id: 'E_DORM_FIGHT',
      title: '翻脸',
      description: '那件事之后，宿舍里没人再主动说话。椅子挪动的声音都像是挑衅。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '申请换寝室', effects: { money: -300, mood: 4 }, result: '新室友话不多，但你终于能睡好觉了。' },
        { label: '各退一步，吃顿饭', effects: { mood: -2, money: -80 }, result: '饭桌上谁都没提那件事，但气氛缓过来了。' }
      ]
    },
    {
      id: 'E_DORM_TALK',
      title: '宿舍夜谈',
      description: '熄灯后，不知道谁先开的口。四个人躺在黑暗里，聊起以后想过的生活。',
      weight: 4,
      requires: { housing: 'dorm', notSummerBreak: true, minAge: 18, maxAge: 25 },   // v3.7：暑假过渡期不出现
      options: [
        { label: '聊到天亮', effects: { mood: 13, stamina: -4 }, result: '第二天全员挂着黑眼圈，但那天晚上你记了很多年。' },
        { label: '听着，早早睡了', effects: { mood: 4, stamina: 1 }, result: '你听着他们的声音睡着，梦里也在笑。' }
      ]
    },
    {
      id: 'E_BIGCITY',
      title: '初到大城市',
      description: '出站口人潮推着你往前。手机里存着三个电话号码，没一个能立刻接你。',
      weight: 5,
      requires: { onceEver: true, unemployed: true, minAge: 18, maxAge: 25 },   // v3.5.4：初到城市=还没工作，工作后不再触发
      options: [
        {
          label: '先找中介租个床位',
          requires: { money: { min: 500 } },
          effects: { money: -500, mood: -2 },
          result: '中介说「押一付三」，你咬牙付了。',
          nextEventId: 'E_BIGCITY_SCAM'
        },
        { label: '住青旅慢慢找活', effects: { money: -100, stamina: -2, intelligence: 2 }, result: '你在青旅认识了三个同样来找工作的人。' },
        { label: '买张回程票', effects: { mood: -8, money: -150 }, result: '车开动时你一直看着窗外，说不出是什么滋味。' }
      ]
    },
    {
      id: 'E_BIGCITY_SCAM',
      title: '中介跑路',
      description: '交了押金的第二天，中介门店的卷帘门拉了下来，玻璃上贴着一张「转让」。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '报警备案', effects: { mood: -5, intelligence: 2 }, result: '警察说这类案子很多，让你先找个地方住下。' },
        { label: '认栽，重新找', effects: { money: -800, mood: -12 }, result: '你在网吧过了两晚，第三天找到一间群租房。' }
      ]
    },
    {
      id: 'E_BIGCITY_GIG',
      title: '第一份活',
      description: '城中村的招工牌上写着「日结、包午饭」。老板上下打量你：「能干几天？」',
      weight: 3,
      requires: { unemployed: true, minAge: 18, maxAge: 25 },
      options: [
        { label: '干满一个月', effects: { money: 2500, stamina: -6, mood: -5 }, result: '手上磨出了茧，你也第一次知道钱有多难挣。' },
        { label: '干两天就走', effects: { money: 100, mood: -4 }, result: '老板没留你，只说「下次别来了」。' }
      ]
    },
    {
      id: 'E_FIRST_LOVE',
      title: '初恋',
      description: '她在图书馆靠窗的位置看书，阳光落在书页上。你走过去的手心全是汗。',
      weight: 5,
      requires: { onceEver: true, single: true, notTeenLove: true, loveState: 'single', minAge: 18, maxAge: 25 },   // v3.7：单身态且未早恋才触发初恋
      options: [
        {
          label: '走过去表白',
          effects: { mood: 8, stamina: -1 },
          result: '你说完那句话，世界安静了三秒。',
          nextEventId: 'E_LOVE_YES'
        },
        { label: '什么都没说', effects: { mood: -9, intelligence: 1 }, result: '毕业那天你才知道，她等过你很久。' }
      ]
    },
    {
      id: 'E_LOVE_YES',
      title: '在一起了',
      description: '「好啊。」她说得很轻。你愣了半分钟才反应过来要笑。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '认真对待这段感情', effects: { mood: 18, money: -400 }, result: '你们一起自习、一起挤食堂，穷得很开心。' },
        {
          label: '患得患失，总觉得会失去',
          effects: { mood: -8, stamina: -2 },
          result: '你每天反复看她的消息，越看越不安。',
          nextEventId: 'E_LOVE_BREAK'
        }
      ]
    },
    {
      id: 'E_LOVE_BREAK',
      title: '分手',
      description: '「我们好像不太合适。」这句话她在电话里说了两遍，你只听见自己的心跳。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '苦苦挽留', effects: { mood: -16, money: -300 }, result: '你买了她最喜欢的蛋糕站在楼下，站到十一点。' },
        { label: '体面告别', effects: { mood: -9, intelligence: 3 }, result: '你删了聊天记录，但没删那个号码。' }
      ]
    },
    {
      id: 'E_LOVE_FIRST_DATE',
      title: '第一次约会',
      description: '约在周六下午三点，商场门口。你提前一小时到了，反复照橱窗里的自己。',
      weight: 3,
      requires: { onceEver: true, single: true, loveState: 'single', minAge: 18, maxAge: 25 },   // v3.7：单身态才约会
      options: [
        { label: '认真准备，花了心思', effects: { money: -350, mood: 14 }, result: '那天的照片你一直留着。' },
        { label: '穿平时的衣服就去了', effects: { mood: -6 }, result: '她没说什么，但全程都在看手机。' }
      ]
    },
    {
      id: 'E_CET4',
      title: '四级报名',
      description: '报名截止还有三天。班群里一半人在晒单词打卡，一半人在装死。',
      weight: 4,
      requires: { minEdu: '专科', minAge: 18, maxAge: 24 },   // v3.5.3：大学生才考四级
      options: [
        { label: '报名，认真背单词', effects: { money: -100, intelligence: 9, mood: -5 }, result: '你在图书馆的角落背完了整本词汇书。' },
        { label: '弃考', effects: { mood: -3 }, result: '你把报名费省了下来，也把这件事往后拖了一年。' }
      ]
    },
    {
      id: 'E_INTERN',
      title: '实习机会',
      description: '学长发来消息：有个实习名额，没工资，但能写进简历。',
      weight: 3,
      requires: { isStudent: true, notSummerBreak: true, unemployed: true, minEdu: '本科', minAge: 19, maxAge: 25 },   // v3.7：在校生专属实习，暑假过渡期不出现
      options: [
        { label: '去，白干也去', effects: { money: 1500, stamina: -5, intelligence: 6 }, result: '三个月你做了很多杂活，也第一次看懂了一个项目怎么跑起来。' },
        { label: '不去，专心准备考试', effects: { intelligence: 4, mood: -3 }, result: '你把自己关在自习室，窗外的夏天过去了。' }
      ]
    },
    {
      id: 'E_WEDDING',
      title: '同学婚礼',
      description: '请柬发到群里，红色烫金，落款是你高中同桌。份子钱的行情是八百。',
      weight: 3,
      requires: { minAge: 20, maxAge: 35 },
      options: [
        { label: '随八百，去喝一杯', requires: { money: { min: 800 } }, effects: { money: -800, mood: 7 }, result: '席上全是老面孔，你被灌了三杯。' },
        { label: '装没看见', effects: { mood: -7 }, result: '后来群里发的合照，你一个一个点开看了。' }
      ]
    },
    {
      id: 'E_BIKE_STOLEN',
      title: '车被偷了',
      description: '楼下那辆电动车只剩一个被剪断的锁，挂在栏杆上晃。',
      weight: 3,
      requires: { onceEver: true, minAge: 18 },
      options: [
        { label: '报警，再买一辆', requires: { money: { min: 2000 } }, effects: { money: -2000, mood: -11, stamina: 1 }, result: '警察做了笔录，新车第二天就买了。' },
        { label: '算了，以后挤公交', effects: { stamina: -5, mood: -7 }, result: '你每天多花一小时在路上。' }
      ]
    },
    {
      id: 'E_HOMESICK',
      title: '想家',
      description: '深夜刷到一条家乡的短视频，镜头扫过你小时候常去的那条街。',
      weight: 4,
      requires: { minAge: 18, maxAge: 26 },
      options: [
        { label: '给家里打个电话', effects: { mood: 9 }, result: '妈妈问「吃饭了没」，你说了三遍吃了。' },
        { label: '转点钱回去', requires: { money: { min: 500 } }, effects: { money: -500, mood: 11 }, result: '爸爸回了一句「自己留着用」，然后又转回来两百。' }
      ]
    },
    {
      id: 'E_SCHOLARSHIP',
      title: '奖学金',
      description: '辅导员在群里发了评定通知，名额三个，申请表要写两千字。',
      weight: 3,
      requires: { minEdu: '本科', isStudent: true, intelligence: { min: 100 }, minAge: 18, maxAge: 21 },   // v3.7：在校本科生才拿大学奖学金
      options: [
        { label: '认真写申请', effects: { intelligence: 5, money: 8000, mood: -3 }, result: '名单公示那天，你的名字在第二个。' },
        { label: '懒得写', effects: { mood: -2 }, result: '你在朋友圈看到别人晒证书，划过去了。' }
      ]
    },
    {
      id: 'E_TUITION',
      title: '学费',
      description: '缴费通知贴在班群置顶。一次性交清可以打折，分期要多付两百。',
      weight: 3,
      requires: { money: { min: 20000 }, minAge: 18, maxAge: 23 },
      options: [
        { label: '一次性交清', effects: { money: -20000, mood: -5, intelligence: 1 }, result: '账户余额瞬间见底，你截图存了个念。' },
        { label: '分期付款', effects: { money: -9000, mood: -9 }, result: '接下来半年，每个月都要想起这笔钱。' }
      ]
    },
    {
      id: 'E_GYM_CARD',
      title: '健身房推销',
      description: '「同学，年卡今天最后一天，一千二，平均一天三块钱。」销售拦住你。',
      weight: 3,
      requires: { minAge: 18, maxAge: 30 },
      options: [
        { label: '办卡', requires: { money: { min: 1200 } }, effects: { money: -1200, stamina: 7, mood: 3 }, result: '前两周你天天去，第三周开始一周一次。' },
        { label: '拒绝', effects: { mood: -1, intelligence: 1 }, result: '你算了算，一天三块钱也得先有一千二。' }
      ]
    },
    {
      id: 'E_JOB_FAIR',
      title: '招聘会',
      description: '体育馆里挤满了人，每张桌子后面都写着「本科以上」。',
      weight: 3,
      requires: { isStudent: false, unemployed: true, minAge: 18, maxAge: 26 },   // v3.7：在校生不投全职
      options: [
        { label: '挨个投简历', effects: { stamina: -4, intelligence: 3, mood: -4 }, result: '投出去二十份，收到两个面试电话。' },
        { label: '看了半圈就走了', effects: { mood: -6 }, result: '你在门口的长椅上坐了很久。' }
      ]
    },
    {
      id: 'E_TRAIN_SCAM',
      title: '培训班',
      description: '「包就业，不过退款。」宣传单上印着一排西装革履的学员照片。',
      weight: 2,
      requires: { onceEver: true, minAge: 18, maxAge: 26 },
      options: [
        { label: '交钱报名', requires: { money: { min: 3000 } }, effects: { money: -3000, intelligence: 10, mood: -6 }, result: '课程讲了三天基础，剩下的全是自习。' },
        { label: '去之前先查了查', effects: { intelligence: 2, mood: 2 }, result: '你在投诉平台上翻到四十条差评，转身走了。' }
      ]
    },
    {
      id: 'E_GAP_YEAR',
      title: '休学一年',
      description: '你在宿舍躺了两周，突然觉得：也许该停下来一年，先想清楚要什么。',
      weight: 2,
      requires: { onceEver: true, housing: 'dorm', notSummerBreak: true, minAge: 18, maxAge: 24 },   // v3.7：住宿舍的大学生才会休学；暑假过渡期不出现在校园
      options: [
        {
          label: '休学，出去走走',
          effects: { money: -1500, mood: 12, intelligence: 5, stamina: 3 },
          result: '你打了三份零工，也第一次看清楚自己怕什么。',
          onChoose: function () { skipMonths(12); }   // v3.7：真实跳过一年（只推进日历与常规结算，不抽事件，休学期间不会有舍友事件）
        },
        { label: '咬牙读完', effects: { mood: -8, intelligence: 4 }, result: '你按时毕业了，只是那一年过得很轻。' }
      ]
    },
    {
      id: 'E_FRIEND_DRIFT',
      title: '朋友渐远',
      description: '曾经每天都聊的朋友，消息停在半年前。你点开对话框，打了几个字又删掉。',
      weight: 4,
      requires: { minAge: 20, maxAge: 30 },
      options: [
        { label: '主动约他吃饭', effects: { money: -200, mood: 10 }, result: '你们聊到打烊，发现什么都没变。' },
        { label: '就这样吧', effects: { mood: -6 }, result: '后来你只是偶尔点开他的头像看看。' }
      ]
    },
    /* ============ 中年阶段（35-55 岁）扩充 ============ */
    {
      id: 'E_MID_CRISIS',
      title: '35 岁',
      description: 'HR 在优化名单上划了几笔，会议室的门没关严。你听见自己的名字被念到一半。',
      weight: 6,
      priority: true,
      requires: { onceEver: true, job: 'not_null', minAge: 35, maxAge: 42 },
      options: [
        { label: '主动加班证明价值', effects: { stamina: -6, mood: -8, money: 2000 }, result: '连续三个月你都是最后一个走的人。' },
        { label: '申请转管理岗', effects: { intelligence: 5, mood: -5 }, result: '你开始学着开会、写周报、替别人扛事。' },
        { label: '骑驴找马，开始投简历', effects: { mood: -3, intelligence: 3 }, result: '简历投出去四个月，回复寥寥。' }
      ]
    },
    {
      id: 'E_MORTGAGE_CALL',
      title: '房贷催收',
      description: '银行的短信一条接一条：本月应还一万二，已逾期三天，将计收罚息。',
      weight: 3,
      requires: { minAge: 36, maxAge: 60 },
      options: [
        { label: '找朋友周转', effects: { money: -36000, mood: -10 }, result: '你打了七个电话，凑够了这个月。' },
        { label: '先拖着，等下个月工资', effects: { money: -45000, mood: -16, intelligence: 1 }, result: '罚息滚上来，你开始怕看手机。' }
      ]
    },
    {
      id: 'E_PARENT_ILL',
      title: '父母住院',
      description: '凌晨两点的电话：父亲突发心梗，已经推进了急诊。',
      weight: 5,
      requires: { onceEver: true, minAge: 34, maxAge: 60 },
      options: [
        {
          label: '立刻买票赶回去',
          effects: { money: -6000, mood: 3, stamina: -3 },
          result: '你在医院走廊坐了一夜，天亮时医生说暂时稳住了。',
          nextEventId: 'E_PARENT_ILL_OP'
        },
        { label: '先汇钱，等把手头的项目收尾', effects: { money: -4000, mood: -10 }, result: '你在电话里听见母亲的哭声，手一直抖。' }
      ]
    },
    {
      id: 'E_PARENT_ILL_OP',
      title: '手术同意书',
      description: '医生把同意书推过来：手术成功率高，但费用八万，且不保证没有后遗症。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '签字，做手术 24 万', requires: { money: { min: 240000 } }, effects: { money: -240000, mood: -6, stamina: -3 }, result: '手术很成功。你在缴费窗口前站了很久。' },
        { label: '选择保守治疗', effects: { money: -6000, mood: -16 }, result: '你每天都去医院，也每天都在想那个没签的字。' }
      ]
    },
    {
      id: 'E_KID_SCHOOL',
      title: '孩子上学',
      description: '入学政策变了：想上那所小学，得在片区里有套房。',
      weight: 4,
      requires: { onceEver: true, hasChild: true, minAge: 36, maxAge: 50 },   // v3.5.5：有孩子才谈入学
      options: [
        {
          label: '咬牙买学区房 60 万',
          requires: { money: { min: 600000 } },
          effects: { money: -600000, mood: 6, stamina: -3 },
          result: '你签了第二份贷款合同，孩子的名字写在了入学名单上。',
          nextEventId: 'E_KID_STUDY_FIGHT'
        },
        { label: '就近上普通小学', effects: { mood: -6 }, result: '妻子没说什么，但那年过年她没怎么说话。' }
      ]
    },
    {
      id: 'E_KID_STUDY_FIGHT',
      title: '择校冲突',
      description: '为了这套房，你们已经三个月没一起吃过晚饭。今晚她终于开口了。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '听她的，把房卖了', effects: { money: 450000, mood: -8 }, result: '房子卖掉那天，你们谁都没提孩子的事。' },
        { label: '坚持，为了孩子', effects: { mood: -12, stamina: -2 }, result: '你继续还那份贷款，家里的沉默越来越长。' }
      ]
    },
    {
      id: 'E_KID_TUTOR',
      title: '补习班',
      description: '班主任在家长群里发了成绩排名，孩子的名字在倒数第五。',
      weight: 4,
      requires: { hasChild: true, minAge: 36, maxAge: 55 },   // v3.5.5：有孩子才谈补习
      options: [
        { label: '报一对一补习', requires: { money: { min: 20000 } }, effects: { money: -20000, mood: -4 }, result: '周末排满了课，孩子的眼神越来越空。' },
        { label: '坐下来陪他写作业', effects: { mood: -2, intelligence: 2 }, result: '你发现自己也忘了很多题，只好一起翻课本。' }
      ]
    },
    {
      id: 'E_STARTUP',
      title: '创业邀约',
      description: '老同事拉你入伙：「这个项目稳赚，你出十万，占一成。」',
      weight: 3,
      requires: { onceEver: true, minAge: 34, maxAge: 55 },
      options: [
        {
          label: '投钱入伙 30 万',
          requires: { money: { min: 100000 } },
          effects: { money: -100000, mood: 8 },
          result: '你把攒了五年的钱转了过去，那天晚上睡得很香。',
          nextEventId: 'E_STARTUP_RESULT'
        },
        { label: '婉拒，还是老老实实上班', effects: { mood: -3, intelligence: 1 }, result: '你后来听说这个项目确实火过一阵。' }
      ]
    },
    {
      id: 'E_STARTUP_RESULT',
      title: '一年后',
      description: '公司注销了。老同事的电话停机，那十万块像从来没存在过。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '走法律程序追', effects: { money: 75000, mood: -12, stamina: -3 }, result: '两年后追回一部分，律师费花掉了大半。' },
        { label: '认了，当交学费', effects: { mood: -18, intelligence: 3 }, result: '你再也没参加过任何「稳赚不赔」的饭局。' }
      ]
    },
    {
      id: 'E_LAYOFF_WAVE',
      title: '裁员潮',
      description: '整个部门被叫进大会议室，PPT 上写着「组织架构优化」。',
      weight: 4,
      requires: { job: 'not_null', minAge: 36, maxAge: 58 },
      options: [
        {
          label: '主动申请调去边缘部门',
          effects: { mood: -8, intelligence: 1 },
          result: '你保住了工作，也保住了工资单上那个数字。'
        },
        {
          label: '什么都不做，硬扛',
          effects: { mood: -6 },
          result: '你把简历更新了一遍，然后等着名单公布。',
          onChoose: function () {
            if (!(state.salary > 0)) return;
            if (layoffRoll() >= 0.4) return;
            doLayoff('裁员潮');
          }
        }
      ]
    },
    {
      id: 'E_REEMP',
      title: '重新找工作',
      description: '面试官看了看你的年龄，把简历放到了一边：「我们这个岗位，更希望年轻一点的。」',
      weight: 4,
      requires: { unemployed: true, minAge: 22 },   // v2.9.1：被裁 / 辞职后（无收入）自然出现，不再挂死在链式里
      options: [
        { label: '接受降薪入职', effects: { money: 3000, mood: -10 }, result: '工资打了七折，你签了。' },
        { label: '先歇一阵，陪陪家里人', effects: { money: -1000, mood: 4, stamina: 3 }, result: '你第一次在工作日去了菜市场。' }
      ]
    },
    {
      id: 'E_CAREER_SWITCH',
      title: '转行',
      description: '夜里刷到一条视频：「四十五岁转行做 XX，年入五十万。」你看了三遍。',
      weight: 2,
      requires: { onceEver: true, minAge: 38, maxAge: 55 },
      options: [
        { label: '报班学新技能', requires: { money: { min: 30000 } }, effects: { money: -30000, intelligence: 15, mood: -6, stamina: -2 }, result: '你白天上班晚上上课，学了八个月。' },
        { label: '算了，安稳最要紧', effects: { mood: -4 }, result: '你把那条视频点了「不感兴趣」。' }
      ]
    },
    {
      id: 'E_OLD_CLASSMATE',
      title: '同学聚会',
      description: '群里张罗着二十周年聚会，人均八百，AA。',
      weight: 4,
      requires: { minAge: 36, maxAge: 58 },
      options: [
        { label: '去，见见老同学', requires: { money: { min: 1500 } }, effects: { money: -1500, mood: 8 }, result: '有人发了财，有人没来，你们聊了很多以前的事。' },
        { label: '找个理由推掉', effects: { mood: -6 }, result: '你在群里发了个红包，然后退出了聊天。' }
      ]
    },
    {
      id: 'E_PARENT_LIVE',
      title: '接父母同住',
      description: '母亲在电话里说：「我们商量了一下，要不搬过去跟你们住？」',
      weight: 3,
      requires: { onceEver: true, minAge: 38, maxAge: 58 },
      options: [
        { label: '接过来一起住', effects: { money: -3000, mood: 9, stamina: -3 }, result: '家里热闹了，也拥挤了。' },
        { label: '请个护工在老家照顾', effects: { money: -8000, mood: -3 }, result: '你每个月打钱回去，视频里他们总说「挺好的」。' }
      ]
    },
    {
      id: 'E_KID_REBEL',
      title: '孩子叛逆',
      description: '孩子把房门反锁，隔着门喊：「你们根本不懂我。」',
      weight: 3,
      requires: { hasChild: true, minAge: 40, maxAge: 58 },   // v3.5.5：有孩子才谈叛逆
      options: [
        { label: '坐下来慢慢谈', effects: { mood: -3, intelligence: 3 }, result: '你们聊到半夜，第一次像两个大人一样说话。' },
        { label: '严厉管教', effects: { mood: -10, stamina: -2 }, result: '门被砸开那天，孩子一个月没叫你。' }
      ]
    },
    {
      id: 'E_DIVORCE',
      title: '婚姻危机',
      description: '她已经把行李箱放在门口了。客厅里只有钟表的声音。',
      weight: 2,
      requires: { onceEver: true, married: true, minAge: 36, maxAge: 56 },   // v3.5.5：已婚才有婚姻危机
      options: [
        { label: '努力挽回', effects: { money: -30000, mood: -6, intelligence: 2 }, result: '你们去做了咨询，勉强把日子继续过下去。' },
        { label: '离吧', requires: { money: { min: 360000 } }, effects: { money: -360000, mood: -20, stamina: -3 }, result: '分完财产那天，你一个人在新房子里坐到天亮。' },
        { label: '就这样耗着，谁也没力气再吵', effects: { mood: -10 }, result: '行李箱一直放在门口，谁也没动。' }
      ]
    },
    {
      id: 'E_INVEST_SCAM',
      title: '理财骗局',
      description: '「年化 18%，保本保息。」对方发来一叠截图，全是别人的收益到账。',
      weight: 3,
      requires: { minAge: 36, maxAge: 60 },
      options: [
        { label: '投五万试试', requires: { money: { min: 50000 } }, effects: { money: -50000, mood: -16, intelligence: 2 }, result: '三个月后，App 打不开了。' },
        { label: '先查了查', effects: { intelligence: 2, mood: 2 }, result: '你搜到一堆「已立案」的帖子，后背发凉。' }
      ]
    },
    {
      id: 'E_BODY_CHECK',
      title: '体检异常',
      description: '报告上有一行加粗的字：「建议进一步检查」。医生让你尽快。',
      weight: 3,
      requires: { minAge: 40, maxAge: 58 },
      options: [
        { label: '立刻住院检查', requires: { money: { min: 30000 } }, effects: { money: -30000, stamina: 5, mood: -4 }, result: '是良性。你坐在医院门口抽了半包烟。' },
        { label: '再等等，先忙完这阵', effects: { stamina: -9, mood: -9 }, result: '半年后复查，指标更差了。' }
      ]
    },
    {
      id: 'E_INSURANCE',
      title: '保险推销',
      description: '「您这个年纪，最该配一份重疾险。」电话那头的声音很有耐心。',
      weight: 3,
      requires: { minAge: 36, maxAge: 55 },
      options: [
        { label: '买一份', requires: { money: { min: 20000 } }, effects: { money: -20000, mood: 4 }, result: '合同很厚，你只看了保额那一页。' },
        { label: '不买，先攒钱', effects: { mood: -2 }, result: '你把名片夹进了抽屉。' }
      ]
    },
    {
      id: 'E_HOUSE_RENOVATE',
      title: '装修',
      description: '装修队给了两个方案：全包八万，或者只刷墙两万。',
      weight: 2,
      requires: { money: { min: 180000 }, minAge: 36, maxAge: 58 },
      options: [
        { label: '好好装，住得舒服点', requires: { money: { min: 180000 } }, effects: { money: -180000, mood: 12, stamina: 2 }, result: '新家有了阳光，你第一次觉得钱花得值。' },
        { label: '简单刷墙就行', effects: { money: -45000, mood: 2 }, result: '墙白了，家具还是旧的。' }
      ]
    },
    {
      id: 'E_DEFAULT',
      fallback: true,                          // 保底事件：不进常规抽取池
      title: '平淡的一月',
      description: '这个月没有什么特别的事情发生，你按部就班地生活着。',
      weight: 1,
      options: [
        { label: '继续生活', effects: {}, meta: '日子照常' }
      ]
    },
    {
      id: 'course',
      title: '路边推销',
      description: '地铁口有人拦住你：「同学，网课原价三千，今天只要八百。」',
      weight: 3,
      options: [
        {
          label: '买下课程',
          requires: { money: { min: 2000 } },     // 钱不够就买不了
          effects: { money: -800, intelligence: 12, mood: -2 },
          result: '课程在硬盘里躺了一个月，你还是看了两章。'
        },
        { label: '摆摆手走开', effects: { mood: 2 }, result: '你保住了钱包，也保住了周末。' }
      ]
    },
    /* ============ 校园阶段（16-18 岁）事件包 v2.9 ============ */
    {
      id: 'E_CAMPUS_COUNCIL',
      title: '学生会竞选',
      description: '团委贴出换届公告，班长在群里 @ 所有人：「有意向的明天放学前交报名表。」你盯着那张表看了很久。',
      weight: 6,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18, eq: { min: 35 } },
      options: [
        {
          label: '上台演讲拉票',
          effects: { mood: -6, eq: 5, cha: 7, will: 4 },
          result: '你把稿子背到第三遍才敢抬头，台下居然有人鼓掌。'
        },
        {
          label: '请全班喝奶茶',
          requires: { money: { min: 400 } },
          effects: { money: -400, mood: 8, cha: 5, eq: 4 },
          result: '一杯奶茶换一张选票，这笔账你自己心里算过。'
        },
        {
          label: '把报名表还回去',
          effects: { mood: 2, will: -3 },
          result: '你说「高三了，顾不上」，其实是不敢上台。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_SPORTS',
      title: '秋季运动会',
      description: '广播里循环着《运动员进行曲》，体育委员举着报名表挨个问：「八百米还差一个人，谁来？」',
      weight: 6,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18, stamina: { min: 30 } },
      options: [
        {
          label: '报八百米',
          requires: { stamina: { min: 45 } },
          effects: { stamina: -10, mood: 12, will: 5, cha: 8 },
          result: '最后一百米你几乎是靠同学喊出来的，冲线那刻全班站了起来。'
        },
        {
          label: '在看台上喊到嗓子哑',
          effects: { mood: 6, cha: 4, eq: 2, stamina: -2 },
          result: '你的加油声比广播还响，班上的人第一次觉得你挺可爱。'
        },
        {
          label: '装肚子疼躲过去',
          effects: { mood: 2, will: -3 },
          result: '你在医务室躺了一下午，欢呼声隔着玻璃一阵一阵的。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_EXAM_RANK',
      title: '月考放榜',
      description: '成绩单贴在走廊尽头，围了三层人。你从最后一行开始，往上找自己的名字。',
      weight: 6,
      requires: { education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '熬夜刷题，下次翻盘',
          effects: { intelligence: 4, stamina: -5, mood: -4 },
          result: '你把错题抄了三遍，凌晨一点的台灯比月亮亮。'
        },
        {
          label: '上讲台给全班讲错题',
          requires: { intelligence: { min: 60 } },
          effects: { intelligence: 2, cha: 4, eq: 6, mood: 3 },
          result: '你把那道题讲成了一个小故事，连后排趴着的都抬了头。'
        },
        {
          label: '把成绩单塞进抽屉最底下',
          effects: { mood: 3, will: 2, eq: 2 },
          result: '你告诉自己：这次不算，下次再说。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_LOVE',
      title: '早恋',
      description: '放学后，操场边的梧桐树下。对方捏着一张折成心形的纸条，声音很轻：「一起吃麻辣烫吗？」',
      weight: 7,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18, cha: { min: 35 } },
      options: [
        {
          label: '答应，一起自习',
          effects: { mood: 14, cha: 4, eq: 4, intelligence: 2, money: -120 },
          result: '两本练习册摊在一张桌上，谁也没多写几道题。',
          onChoose: function () { state.hadTeenLove = true; },   // v3.5.3：早恋标记
          nextEventId: 'E_CAMPUS_LOVE_END'
        },
        {
          label: '在走廊上牵着手走给全校看',
          effects: { mood: 16, cha: 6, eq: -3, money: -80 },
          result: '第二天，你们的名字被写在黑板「光荣榜」的旁边。',
          onChoose: function () { state.hadTeenLove = true; },   // v3.5.3：早恋标记
          nextEventId: 'E_CAMPUS_LOVE_END'
        },
        {
          label: '说还是做同学吧',
          effects: { mood: 3, will: 3 },
          result: '你说得很轻，那张纸条又被折回了原来的样子。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_LOVE_END',
      title: '班主任的谈话',
      description: '班主任把你们俩叫进办公室，桌上摊着这次月考的成绩单：「你们自己看看，掉了多少名。」',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '保证不影响成绩',
          effects: { mood: 8, will: 4, eq: 3 },
          result: '你们约定每周只见一次——在图书馆。',
          nextEventId: 'E_TEEN_LOVE_COLLEGE'   // v3.7：早恋在大学阶段延续
        },
        {
          label: '当面答应分开',
          effects: { mood: -14, will: -2, intelligence: 2 },
          result: '走出办公室时，走廊很长，谁都没有回头。'
        },
        {
          label: '顶一句「我们又没犯法」',
          effects: { mood: -6, cha: 4, will: 4, eq: -3 },
          result: '班主任把笔一摔，你觉得自己像个大人，又像个小丑。'
        }
      ]
    },
    {
      id: 'E_TEEN_LOVE_COLLEGE',
      title: '高考后的约定',
      description: '毕业前你们在操场走了很久。两张志愿表摊在桌上：是考同一座城市，还是各自去更好的学校？',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '一起报同一所大学',
          effects: { mood: 12, intelligence: 4, will: 3 },
          result: '你们把志愿填得一模一样，约定在同一个校园继续走下去。'
        },
        {
          label: '异地，但保持联系',
          effects: { mood: 6, eq: 3, will: 4 },
          result: '车票和聊天记录越攒越多，你们约定每个月见一次。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_BULLY',
      title: '校园霸凌',
      description: '你的课本被塞进垃圾桶，作业本上被人画了画。教室后门那几个人正笑着看你。',
      weight: 4,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '当场打回去',
          requires: { stamina: { min: 45 } },
          effects: { stamina: -12, mood: 8, will: 6, cha: 8, money: -300 },
          result: '你们在楼梯口滚成一团，最后你赔了校服钱，也赔上了「不好惹」的名声。'
        },
        {
          label: '告诉班主任和家长',
          effects: { mood: -6, eq: 10, cha: -2, will: 3 },
          result: '事情压下去了，但班上没人再主动跟你说话。'
        },
        {
          label: '忍着，把课桌搬到最后一排',
          effects: { mood: -18, will: 4, eq: -2 },
          result: '你学会了低着头走路，也学会了不说话。'
        },
        {
          label: '请那几个人吃一顿换个位置',
          requires: { money: { min: 500 } },
          effects: { money: -500, mood: -4, eq: 3 },
          result: '饭桌上很热闹，第二天你的课本又回到了桌洞里。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_NETCAFE',
      title: '网吧通宵',
      description: '晚自习铃响过十分钟，后门有人拍了拍你：「新开的网吧，包夜一晚二十。」',
      weight: 5,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '翻墙出去通宵开黑',
          effects: { money: -150, stamina: -12, mood: 16, cha: 6, eq: 6, intelligence: -2 },
          result: '天亮时你们吃了两笼包子，早读课上你被点了三次名。'
        },
        {
          label: '只玩两小时就回宿舍',
          effects: { money: -60, stamina: -4, mood: 6, cha: 2, eq: 2 },
          result: '你踩着熄灯前十分钟翻回宿舍，心跳到半夜才平。'
        },
        {
          label: '转身回教室',
          effects: { mood: -3, will: 5, intelligence: 2 },
          result: '教室里只有你和值班老师的脚步声。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_CHEAT',
      title: '考试作弊',
      description: '最后一道大题还空着，收卷铃还有二十分钟。你摸到了袖子里那张写满公式的纸。',
      weight: 5,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18, mood: { max: 75 } },
      options: [
        {
          label: '把小抄抽出来',
          effects: { mood: -8, will: -3, intelligence: 2 },
          result: '你抄到第三个公式时，监考老师停在了你桌边。',
          nextEventId: 'E_CAMPUS_PARENT'
        },
        {
          label: '抄同桌的答案',
          requires: { eq: { min: 20 } },
          effects: { mood: -6, eq: -2, intelligence: 2 },
          result: '同桌把卷子往你这边挪了挪，也被拍了下来。',
          nextEventId: 'E_CAMPUS_PARENT'
        },
        {
          label: '空着交卷',
          effects: { mood: -6, will: 4, intelligence: 1 },
          result: '你交了卷，走在阳光里，觉得心里干净一点。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_PARENT',
      title: '叫家长',
      description: '办公室的暖气很足。你妈坐在你旁边，手里攥着那张被摊平的公式纸，一句话也没说。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '主动认错，写三千字检查',
          effects: { mood: -10, will: 4 },
          result: '写到第三页手都麻了，你妈在旁边替你说了句「孩子知道错了」。',
          nextEventId: 'E_CAMPUS_PENALTY'
        },
        {
          label: '让爸妈替你说情',
          requires: { money: { min: 1000 } },
          effects: { money: -1000, mood: -4, eq: 3 },
          result: '你爸拎着两箱水果在办公室门口站了半小时，你觉得丢人，又觉得心酸。',
          nextEventId: 'E_CAMPUS_PENALTY'
        },
        {
          label: '摔门出去',
          effects: { mood: -18, will: 5, eq: -4 },
          result: '你在操场上坐到天黑，回家时饭桌上是凉的。'
        }
      ]
    },
    {
      id: 'E_CAMPUS_PENALTY',
      title: '处分决定',
      description: '布告栏上贴出一张纸，你的名字被红笔圈了两道，下面写着「记过」。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '认罚，站到旗杆下念检讨',
          effects: { mood: -20, will: 5, cha: -4 },
          result: '一千多人看着你念完，你把每个字都念得很清楚。'
        },
        {
          label: '托班主任把处分解成警告',
          requires: { money: { min: 600 } },
          effects: { money: -600, mood: -6, eq: 4, will: -2 },
          result: '纸上的字改小了，你心里的字没有改。'
        },
        {
          label: '回家挨一顿，从此把书念好',
          effects: { mood: -12, stamina: -5, will: 6, intelligence: 3 },
          result: '你爸那一下不重，但你在台灯下坐到了凌晨三点。'
        }
      ]
    },    /* ============ 恋爱婚姻系统（v3.0） ============ */
    {
      id: 'E_MARRY_URGE',
      title: '催婚',
      description: '过年回家，三姑六婆围坐一圈：「都快三十了，还一个人？」你妈把手机推到你面前，上面是一张照片。',
      weight: 6,
      priority: true,
      requires: { onceEver: true, single: true, loveState: 'single', minAge: MARRY_URGE_AGE, maxAge: 40, marryCooldown: MARRY_COOLDOWN },   // v3.7：单身态才催婚
      options: [
        {
          label: '去见一面',
          effects: { mood: -4 },
          result: '你加了对方微信，约在周六下午的咖啡馆。',
          nextEventId: 'E_MARRY_SEEK'
        },
        {
          label: '推掉，说工作忙',
          effects: { mood: -8, will: 2 },
          result: '饭桌上安静了半分钟，你妈把菜往你碗里拨。'
        }
      ]
    },
    {
      id: 'E_MARRY_SEEK',
      title: '相亲',
      description: '咖啡馆靠窗的位置，对方比照片上瘦一点。你们从工作聊到房子，从房子聊到以后想要几个孩子。',
      weight: 6,
      requires: { single: true, loveState: 'single', minAge: MARRY_MIN_AGE, maxAge: 45, marryCooldown: MARRY_COOLDOWN },   // v3.7：单身态才相亲
      options: [
        {
          label: '认真打扮，提前半小时到',
          effects: { money: -2000, mood: -3, cha: 2 },
          result: '你把衬衫熨了一遍，一直聊到店打烊。',
          nextEventId: 'E_MARRY_SECOND'
        },
        {
          label: '穿平时的衣服去',
          effects: { mood: 1 },
          result: '你说得不多，对方笑得也不多。',
          nextEventId: 'E_MARRY_SECOND'
        },
        {
          label: '临时放鸽子',
          effects: { mood: 4, will: 1 },
          result: '你在家躺了一下午，手机响了两声就停了。'
        }
      ]
    },
    {
      id: 'E_MARRY_SECOND',
      title: '第二次见面',
      description: '第二次见面是在电影院门口。对方穿得很正式，你忽然意识到这件事可能真要往下走了。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '继续联系',
          requires: { cha: { min: 35 }, eq: { min: 35 } },
          effects: { mood: 10, eq: 3 },
          result: '你们约了下周一起去看家具。',
          onChoose: function () { startDating(); }   // v3.7：先交往，几个月后再领证
        },
        {
          label: '坦白自己没什么钱',
          effects: { mood: -2, will: 3 },
          result: '对方沉默了一会儿，说「我也一样」。',
          onChoose: function () { startDating(); }   // v3.7：先交往，几个月后再领证
        },
        {
          label: '说做朋友吧',
          effects: { mood: -6, cha: 1 },
          result: '对方说「好啊」，然后把电影票收进了口袋。'
        }
      ]
    },
    {
      id: 'E_MARRY_WED',
      title: '领证',
      description: '民政局门口排着队，前面那对手一直在自拍。轮到你时，工作人员抬头看了一眼：「都想好了？」',
      weight: 3,
      requires: { loveState: 'dating', datingMonths: DATING_MIN_MONTHS, single: true, minAge: MARRY_MIN_AGE },   // v3.7：交往满 N 个月才可领证
      options: [
        {
          label: '风风光光办一场',
          requires: { money: { min: 120000 } },
          effects: { money: -120000, mood: 15, cha: 4 },
          result: '酒席摆了二十桌，你妈在台上哭了。',
          onChoose: function () { marryTo('风光'); }
        },
        {
          label: '两家人吃顿饭就行',
          requires: { money: { min: 30000 } },
          effects: { money: -30000, mood: 8 },
          result: '六个人，一桌菜，红本本揣在兜里。',
          onChoose: function () { marryTo('简办'); }
        },
        {
          label: '再等等吧',
          effects: { mood: -10 },
          result: '对方没说什么，把户口本收回了包里。'
        }
      ]
    },
    {
      id: 'E_LOVE_GROWN',
      title: '旧情复燃',
      description: '同学会上，你看见了当年那个人。散场时对方说：「顺路，送你一段。」',
      weight: 5,
      requires: { onceEver: true, single: true, loveState: 'single', minAge: MARRY_MIN_AGE, maxAge: 34, cha: { min: 45 }, marryCooldown: MARRY_COOLDOWN },   // v3.7：单身态才旧情复燃
      options: [
        {
          label: '把当年没说完的话说完',
          effects: { mood: 14, cha: 3 },
          result: '路明明很短，你们走了四十分钟。',
          onChoose: function () { startDating(); }   // v3.7：先交往，几个月后再领证
        },
        {
          label: '只聊近况，不留号码',
          effects: { mood: 2, will: 3 },
          result: '你说「有空常联系」，然后谁也没加谁。'
        }
      ]
    },
    {
      id: 'E_MARRIED_QUARREL',
      title: '婚后争吵',
      description: '为了一件很小的事——谁忘了倒垃圾——你们从厨房吵到客厅。',
      weight: 7,
      requires: { married: true },
      options: [
        {
          label: '先低头，去厨房把碗洗了',
          effects: { mood: -3 },
          result: '水声盖过了话，第二天早上桌上有两碗面。',
          onChoose: function () { addLove(6); }
        },
        {
          label: '讲道理，非要说清楚',
          effects: { mood: -8, eq: 2 },
          result: '你赢了这场辩论，输了一晚上的安静。',
          onChoose: function () { addLove(-8); }
        },
        {
          label: '买点东西哄哄',
          requires: { money: { min: 800 } },
          effects: { money: -800, mood: 2 },
          result: '一束花放在门口，气就消了一半。',
          onChoose: function () { addLove(10); }
        }
      ]
    },
    {
      id: 'E_FAMILY_KID',
      title: '要不要孩子',
      description: '体检报告放在桌上。医生说你们这个年纪还来得及，但越早越好。',
      weight: 5,
      requires: { onceEver: true, married: true, minAge: PREGNANCY_MIN_AGE, maxAge: PREGNANCY_MAX_AGE },
      options: [
        {
          label: '备孕',
          effects: { mood: 2 },
          result: '你们开始算日子、戒酒、早睡。',
          nextEventId: 'E_KID_BIRTH'
        },
        {
          label: '领养一个',
          effects: { mood: 2, will: 2 },
          result: '福利院的孩子看了你很久，才把手递过来。',
          nextEventId: 'E_KID_ADOPT'
        },
        {
          label: '不要孩子，说好做丁克',
          effects: { mood: 8, will: 3 },
          result: '你们认真谈了一晚，最后决定养一只猫，和彼此。',
          onChoose: function () {
            state.dink = true;
            addLove(4);
            addLog('sys', '【丁克】你们决定这一生不要孩子。');
          }
        }
      ]
    },
    {
      id: 'E_FAMILY_AFFAIR',
      title: '裂痕',
      description: '对方的手机在桌上亮了一下，你看见一个不该出现的名字。',
      weight: 3,
      requires: { onceEver: true, married: true, minAge: 25, loveMax: 40 },
      options: [
        {
          label: '摊牌',
          effects: { mood: -18, will: 4 },
          result: '你把手机推回桌子中间，说「我们聊聊」。',
          onChoose: function () { divorceNow('协议'); }
        },
        {
          label: '装作没看见',
          effects: { mood: -10, eq: 2 },
          result: '你什么也没说，那晚你睡了客房。',
          onChoose: function () { addLove(-15); }
        },
        {
          label: '冷静问清楚',
          requires: { eq: { min: 60 } },
          effects: { mood: -6, eq: 3 },
          result: '对方哭了，说是工作上的误会，你信了一半。',
          onChoose: function () { addLove(-5); }
        }
      ]
    },
    {
      id: 'E_MARRIED_DIVORCE',
      title: '协议离婚',
      description: '两本结婚证摊在桌上，对方说：「房子归你，别的我不要。」窗外在下雨。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '协议离婚，财产对半',
          effects: { mood: -22 },
          result: '民政局的手续很快，比结婚那天快得多。',
          onChoose: function () { divorceNow('协议'); }
        },
        {
          label: '再试一次',
          requires: { money: { min: 20000 } },
          effects: { money: -20000, mood: -6 },
          result: '你们去做了婚姻咨询，第一节课谁都没说话。',
          onChoose: function () {
            state.love = Math.min(100, state.love + 25);
            state.coldMonths = 0;
            addLog('sys', '【婚姻】感情值回到 ' + state.love + '。');
          }
        },
        {
          label: '净身出户，只求快点结束',
          effects: { mood: -30 },
          result: '你拖着一个箱子走出小区，雨停了。',
          onChoose: function () { divorceNow('净身'); }
        }
      ]
    },
    {
      id: 'E_KID_BIRTH',
      title: '分娩',
      description: '产房外的走廊很白，护士出来问：「家属签个字，顺产还是剖？」',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '顺产',
          requires: { money: { min: 8000 } },
          effects: { money: -8000, stamina: -8, mood: 6 },
          result: '凌晨三点，你听见第一声哭。',
          onChoose: function () { addChild({ birth: '顺产' }); }
        },
        {
          label: '剖腹产，稳妥一点',
          requires: { money: { min: 25000 } },
          effects: { money: -25000, stamina: -12, mood: 2 },
          result: '手术室的灯亮了一个小时，母子平安。',
          onChoose: function () { addChild({ birth: '剖腹产' }); }
        },
        {
          label: '无痛分娩',
          requires: { money: { min: 30000 } },
          effects: { money: -30000, stamina: -6, mood: 4 },
          result: '她说不疼了，你却一直没敢松手。',
          onChoose: function () { addChild({ birth: '无痛' }); }
        },
        {
          // 兜底：钱不够也能生（欠费住院），避免链式事件全部置灰卡死弹窗
          label: '先欠着，医院催费再说',
          effects: { money: -8000, stamina: -8, mood: -4 },
          result: '缴费单被压在枕头底下，孩子的哭声盖过了一切。',
          onChoose: function () { addChild({ birth: '顺产' }); }
        }
      ]
    },
    {
      id: 'E_KID_ADOPT',
      title: '领养',
      description: '手续比想象中慢。孩子坐在你对面，鞋尖一直没碰到地。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '把手续办完',
          requires: { money: { min: 60000 } },
          effects: { money: -60000, mood: 8 },
          result: '回家的路上，孩子第一次叫了你的名字。',
          onChoose: function () { addChild({ birth: '领养' }); }
        },
        {
          label: '还是算了吧',
          effects: { mood: -6 },
          result: '你在福利院门口站了很久。'
        }
      ]
    },
    {
      id: 'E_KID_SCHOOL_PICK',
      title: '择校',
      description: '孩子在客厅转圈，问：「爸爸，我要去哪个学校？」桌上摊着三张招生简章。',
      weight: 6,
      requires: { hasChild: true, minAge: 28 },
      options: [
        {
          label: '普通学校，就近上',
          effects: { mood: 2 },
          result: '走路十分钟，放学能自己回家。',
          onChoose: function () { setKidInvest('普通'); }
        },
        {
          label: '重点学校，托人找关系',
          requires: { money: { min: 30000 } },
          effects: { money: -30000, mood: -4 },
          result: '每天接送，作业到十点。',
          onChoose: function () { setKidInvest('重点'); }
        },
        {
          label: '国际学校，砸钱',
          requires: { money: { min: 120000 } },
          effects: { money: -120000, mood: -8 },
          result: '学费单子很长，你还是签了。',
          onChoose: function () { setKidInvest('国际'); }
        }
      ]
    },
    {
      id: 'E_KID_GRANDCHILD',
      title: '当爷爷/奶奶',
      description: '孩子打来电话：「妈，你要当奶奶了。」你握着手机，半天没说话。',
      weight: 4,
      requires: { onceEver: true, adultChild: true, minAge: 55 },
      options: [
        {
          label: '去帮着带孩子',
          effects: { mood: 14, stamina: -4 },
          result: '你在婴儿床边站了一整夜，一点不觉得累。',
          onChoose: function () { markGrandchild(); }
        },
        {
          label: '给钱，让他们自己带',
          requires: { money: { min: 30000 } },
          effects: { money: -30000, mood: 6 },
          result: '红包发过去，你妈的照片被摆在了最中间。',
          onChoose: function () { markGrandchild(); }
        },
        {
          label: '随他们去吧',
          effects: { mood: -2 },
          result: '你说「想好了就生」，然后挂了电话。'
        }
      ]
    },

    /* ================= v3.7 模块 A：纯正大学生活（10 个，isStudent） ================= */
    {
      id: 'U_SKIP_CLASS',
      title: '翘课被抓',
      description: '你躲在被窝里刷手机，突然收到消息：「老师点名了，就你没到。」',
      weight: 5,
      requires: { isStudent: true, notSummerBreak: true, minAge: 18, maxAge: 25 },
      options: [
        { label: '跑着去教室', effects: { stamina: -3, intelligence: 2, mood: -2 }, result: '你冲进教室时，老师正好念到你的名字。' },
        { label: '继续睡，无所谓', effects: { mood: 3, intelligence: -1 }, result: '期末你发现，那节课划了三个重点。' }
      ]
    },
    {
      id: 'U_EXAM_CRAM',
      title: '期末突击',
      description: '考试周到了，图书馆的通宵区全是你的同学。',
      weight: 6,
      requires: { isStudent: true, notSummerBreak: true, minAge: 18, maxAge: 25 },   // v3.7：在校生专属；暑假过渡期不出现
      options: [
        { label: '通宵抱佛脚', effects: { stamina: -6, intelligence: 8, mood: -5 }, result: '你背到凌晨四点，考场上手还在抖。' },
        { label: '随缘复习', effects: { mood: 2 }, result: '你睡得很香，卷子也写得很快——快得没写几题。' }
      ]
    },
    {
      id: 'U_CLUB',
      title: '社团招新',
      description: '百团大战，学长学姐扯着嗓子拉人。',
      weight: 4,
      requires: { isStudent: true, notSummerBreak: true, onceEver: true, minAge: 18, maxAge: 22 },   // v3.7：一生一次 + 暑假不出现
      options: [
        { label: '加入辩论队', effects: { eq: 4, cha: 3, mood: 2, money: -100 }, result: '第一次上场，你舌头打结，但台下掌声很响。' },
        { label: '啥也不加，回宿舍', effects: { mood: -1 }, result: '你绕开人群，心里有点空。' }
      ]
    },
    {
      id: 'U_GRAD_CHOICE2',
      title: '考研还是就业',
      description: '室友签了工作，另一个保了研。你躺在床上盯着天花板，两条路都看不清。',
      weight: 5,
      requires: { isStudent: true, notSummerBreak: true, minAge: 20, maxAge: 24, onceEver: true },
      options: [
        { label: '备战考研', effects: { mood: -6, money: -800, intelligence: 5 }, result: '你买了全套资料，把手机壁纸换成了倒计时。', nextEventId: 'U_GRAD_CHOICE2B' },
        { label: '开始投简历', effects: { mood: -3, intelligence: 2 }, result: '你把简历改了七版，投出去四十份。' }
      ]
    },
    {
      id: 'U_GRAD_CHOICE2B',
      title: '考研出分',
      description: '成绩出来了，你盯着那三个数字，反复刷新了三遍。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '上岸了', effects: { mood: 16, intelligence: 10 }, result: '你在宿舍喊了一嗓子，整栋楼都听见了。' },
        { label: '差了几分', effects: { mood: -14, will: 3 }, result: '你关了页面，决定明年再战。' }
      ]
    },
    {
      id: 'U_LIBRARY',
      title: '图书馆占座',
      description: '你抱着一摞书去图书馆，发现座位被一本《五年高考》占了。',
      weight: 3,
      requires: { isStudent: true, notSummerBreak: true, minAge: 18, maxAge: 25 },
      options: [
        { label: '把书挪开，坐下', effects: { intelligence: 3, mood: -2 }, result: '那本书的主人回来，瞪了你一眼。' },
        { label: '换个地方', effects: { stamina: -1 }, result: '你绕了三层楼，最后在楼梯间蹲着背了会书。' }
      ]
    },
    {
      id: 'U_CANTEEN_JOB',
      title: '食堂兼职',
      description: '食堂窗口招钟点工，一小时十五块，管一顿饭。',
      weight: 4,
      requires: { isStudent: true, notSummerBreak: true, minAge: 18, maxAge: 25 },
      options: [
        { label: '去干，赚点零花', effects: { money: 800, stamina: -4, mood: -2 }, result: '你端了四个小时盘子，手酸得夹不住筷子。' },
        { label: '算了，好好学习', effects: { mood: 1 }, result: '你回宿舍翻开了书，想着那顿饭还是省点好。' }
      ]
    },
    {
      id: 'U_CAMPUS_LOVE2',
      title: '操场告白',
      description: '有人在操场用蜡烛摆了个爱心，围观的人起哄。那个人，你认识。',
      weight: 3,
      requires: { isStudent: true, notSummerBreak: true, single: true, notTeenLove: true, loveState: 'single', minAge: 18, maxAge: 25, cha: { min: 40 } },   // v3.7：暑假不出现、单身且未早恋才告白
      options: [
        { label: '走上去，说愿意', effects: { mood: 15, cha: 3 }, result: '你穿过人群，心跳快得像要炸开。' },
        { label: '悄悄走开', effects: { mood: -6, will: 2 }, result: '那晚你在操场绕了三圈，没敢回头。' }
      ]
    },
    {
      id: 'U_DORM_NET',
      title: '宿舍断网',
      description: '宿舍网络突然断了，全楼的哀嚎声此起彼伏。',
      weight: 3,
      requires: { isStudent: true, housing: 'dorm', notSummerBreak: true, minAge: 18, maxAge: 25 },
      options: [
        { label: '拿手机流量顶', effects: { money: -50, mood: -2 }, result: '你刷了几个视频，话费告急。' },
        { label: '正好早点睡', effects: { mood: 3, stamina: 2 }, result: '你难得十点就睡着了。' }
      ]
    },
    {
      id: 'U_CONTEST',
      title: '竞赛获奖',
      description: '你随手报了个比赛，结果进了决赛。',
      weight: 2,
      requires: { isStudent: true, notSummerBreak: true, intelligence: { min: 150 }, minAge: 18, maxAge: 25, onceEver: true },
      options: [
        { label: '认真备战', effects: { stamina: -5, intelligence: 10, mood: -3 }, result: '颁奖那天，你的名字排在第三个。' },
        { label: '去划水', effects: { mood: 2 }, result: '你见识了什么叫「降维打击」。' }
      ]
    },

    /* ================= v3.7 模块 B：职场与中年危机（10 个，job） ================= */
    {
      id: 'B_BOSS_PROMISE',
      title: '老板画大饼',
      description: '老板拍着你的肩：「好好干，明年让你带团队。」去年他也是这么说的。',
      weight: 5,
      requires: { job: 'not_null', minAge: 22, maxAge: 58 },
      options: [
        { label: '信他一次，加把劲', effects: { mood: 3, stamina: -3, will: 2 }, result: '你又熬了三个通宵，饼还是那张饼。' },
        { label: '左耳进右耳出', effects: { mood: 1, eq: 2 }, result: '你笑着点头，心里盘算着简历。' }
      ]
    },
    {
      id: 'B_OVERWORK',
      title: '过劳预警',
      description: '体检单上「心律不齐」四个字，让你盯着看了很久。',
      weight: 4,
      requires: { job: 'not_null', minAge: 25, maxAge: 55 },
      options: [
        { label: '请假休息一周', effects: { money: -500, stamina: 8, mood: 4 }, result: '你在家躺了一周，才觉得自己还活着。' },
        { label: '硬扛，项目要紧', effects: { stamina: -8, mood: -6, money: 2000 }, result: '你靠咖啡撑过去，代价是下个月的胃药。' }
      ]
    },
    {
      id: 'B_COLLEAGUE_BLAME',
      title: '同事甩锅',
      description: '项目出了 bug，同事在会上轻描淡写：「这部分是小王负责的。」',
      weight: 5,
      requires: { job: 'not_null', minAge: 22, maxAge: 55 },
      options: [
        { label: '当场拿出证据', effects: { mood: -4, eq: 2, intelligence: 2 }, result: '你把提交记录一放，会议室安静了。' },
        { label: '忍了，记在心里', effects: { mood: -8, will: 2 }, result: '你学会了保存每一封邮件。' }
      ]
    },
    {
      id: 'B_OT_RACE',
      title: '加班内卷',
      description: '下班时间到了，没有一个人动。大家盯着屏幕，比谁更晚走。',
      weight: 5,
      requires: { job: 'not_null', minAge: 22, maxAge: 55 },
      options: [
        { label: '到点就走', effects: { mood: 4, stamina: 2, will: 1 }, result: '你拎包走人，背后有人小声议论。' },
        { label: '再坐一小时', effects: { mood: -3, stamina: -1 }, result: '你假装很忙，其实在刷手机。' }
      ]
    },
    {
      id: 'B_PERF_REVIEW',
      title: '绩效面谈',
      description: 'HR 把你叫进小房间，摊开一张评分表。',
      weight: 4,
      requires: { job: 'not_null', minAge: 22, maxAge: 55 },
      options: [
        { label: '据理力争', effects: { mood: -5, eq: 2, money: 2000 }, result: '你争取到了加薪，但也得罪了领导。' },
        { label: '点头称是', effects: { mood: -3 }, result: '评分表上的数字，比你想的还低。' }
      ]
    },
    {
      id: 'B_LAYOFF_CHAIN',
      title: '裁员名单',
      description: 'HR 拿着一叠纸走进来，念到你的名字时，你脑子嗡了一下。',
      weight: 4,
      requires: { job: 'not_null', minAge: 30, maxAge: 55, onceEver: true },
      options: [
        { label: '接受降薪留下', effects: { mood: -12 }, result: '你签了降薪协议，保住了工位。', onChoose: function () { state.salary = Math.round(state.salary * 0.7); addLog('sys', '【降薪】月薪降到 ' + state.salary + ' 元。'); } },
        { label: '拿赔偿走人', effects: { money: 60000, mood: -8 }, result: '你拿了 N+1，抱着纸箱走出大楼。', nextEventId: 'B_LAYOFF_CHAINB' }
      ]
    },
    {
      id: 'B_LAYOFF_CHAINB',
      title: '失业之后',
      description: '不用打卡的第一天，你反而在七点自然醒了。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '马上开始投简历', effects: { mood: -4, intelligence: 2 }, result: '你刷招聘软件刷到凌晨。' },
        { label: '先歇一个月', effects: { mood: 4, stamina: 3, money: -2000 }, result: '你去了趟海边，把手机调成静音。' }
      ]
    },
    {
      id: 'B_HEADHUNTER',
      title: '猎头挖角',
      description: '猎头打来电话：「有个机会，比你现在多 30%，考虑吗？」',
      weight: 3,
      requires: { job: 'not_null', minAge: 25, maxAge: 50, onceEver: true },
      options: [
        { label: '去面试试试', effects: { mood: 4, intelligence: 2 }, result: '三轮面试后，对方给了 offer。' },
        { label: '婉拒，先稳住', effects: { mood: -1 }, result: '你挂了电话，把猎头拉进了通讯录。' }
      ]
    },
    {
      id: 'B_OFFICE_POLITICS',
      title: '站队风波',
      description: '两个领导明争暗斗，都来探你的口风。',
      weight: 3,
      requires: { job: 'not_null', minAge: 25, maxAge: 55 },
      options: [
        { label: '装傻充愣', effects: { eq: 2, mood: -1 }, result: '你学会了「我不知道，我马上去查」。' },
        { label: '站看起来会赢的那边', effects: { mood: -4, will: -2 }, result: '你赌错了，接下来半年都不好过。' }
      ]
    },
    {
      id: 'B_BONUS',
      title: '意外的奖金',
      description: '财务发来消息：这个季度项目超额，给你批了一笔奖金。',
      weight: 3,
      requires: { job: 'not_null', minAge: 22, maxAge: 58, onceEver: true },
      options: [
        { label: '存起来', effects: { money: 15000, mood: 5 }, result: '你看着余额，踏实了不少。' },
        { label: '请同事吃饭', effects: { money: 5000, mood: 8, cha: 3 }, result: '一顿饭，把不少关系都捂热了。' }
      ]
    },

    /* ================= v3.7 模块 C：婚姻与家庭（10 个，married） ================= */
    {
      id: 'M_MOTHER_IN_LAW',
      title: '婆媳矛盾',
      description: '婆婆来住了一周，家里气氛一天比一天紧张。',
      weight: 4,
      requires: { married: true, minAge: 22, maxAge: 60 },
      options: [
        { label: '主动沟通', effects: { mood: -4, eq: 3 }, result: '你们谈了三个小时，误会解开了一半。' },
        { label: '躲出去清净', effects: { mood: 2, money: -500 }, result: '你在外面逛到天黑才回家。' }
      ]
    },
    {
      id: 'M_BABY_PRESSURE',
      title: '催生压力',
      description: '饭桌上，两边老人轮流开口：「趁年轻，赶紧生一个。」',
      weight: 4,
      requires: { married: true, minAge: 24, maxAge: 45 },
      options: [
        { label: '说还没准备好', effects: { mood: -3, will: 2 }, result: '你们把话题岔开了，但气氛冷了下来。' },
        { label: '开始备孕', effects: { mood: 2, money: -2000 }, result: '你们去了趟医院，做了全套检查。' }
      ]
    },
    {
      id: 'M_SCHOOL_DISTRICT',
      title: '学区房首付',
      description: '中介发来一套学区房：「就剩这一套了，明天涨五万。」',
      weight: 3,
      requires: { married: true, hasChild: true, minAge: 28, maxAge: 50, onceEver: true },
      options: [
        { label: '咬牙付首付', requires: { money: { min: 900000 } }, effects: { money: -900000, mood: -8 }, result: '签完字，你们在车里坐了半个小时。' },
        { label: '放弃，读普通学校', effects: { mood: -5 }, result: '你们把那张传单揉成一团，扔进了垃圾桶。' }
      ]
    },
    {
      id: 'M_HOMEWORK_MELTDOWN',
      title: '辅导作业崩溃',
      description: '一道数学题讲了三遍，孩子还是瞪着大眼睛看你。',
      weight: 4,
      requires: { married: true, hasChild: true, minAge: 30, maxAge: 55 },
      options: [
        { label: '压住火，换种讲法', effects: { mood: -4, eq: 2, intelligence: 1 }, result: '第四遍，孩子终于「哦」了一声。' },
        { label: '拍桌子吼了', effects: { mood: -8, stamina: -1 }, result: '孩子哭了，你躲进厨房抽了根烟。' }
      ]
    },
    {
      id: 'M_CHORES',
      title: '家务分工',
      description: '水槽里堆着昨天的碗，谁都不想去洗。',
      weight: 4,
      requires: { married: true, minAge: 22, maxAge: 60 },
      options: [
        { label: '主动去洗', effects: { mood: -1, eq: 2 }, result: '你洗完碗，对方给你削了个苹果。' },
        { label: '剪刀石头布', effects: { mood: 2 }, result: '你输了，边洗边嘟囔。' }
      ]
    },
    {
      id: 'M_ANNIVERSARY',
      title: '纪念日忘了',
      description: '对方发来一张旧照片，配文：「今天是什么日子？」',
      weight: 3,
      requires: { married: true, minAge: 22, maxAge: 60 },
      options: [
        { label: '马上补一顿大餐', effects: { money: -800, mood: 6 }, result: '你们去吃了那家一直舍不得去的餐厅。' },
        { label: '老实承认忘了', effects: { mood: -10, eq: 1 }, result: '你睡了一晚沙发，第二天订了花。' }
      ]
    },
    {
      id: 'M_SPOUSE_LAIDOFF',
      title: '对方失业',
      description: '对方回家，把工牌往桌上一放：「公司，把我裁了。」',
      weight: 3,
      requires: { married: true, minAge: 25, maxAge: 55, onceEver: true },
      options: [
        { label: '安慰，一起扛', effects: { mood: -3, eq: 3, money: -1000 }, result: '你握住对方的手，说「还有我」。' },
        { label: '着急催找工作', effects: { mood: -8 }, result: '你们吵了一架，都红了眼。' }
      ]
    },
    {
      id: 'M_KID_FEVER',
      title: '孩子发烧',
      description: '半夜孩子烧到 39 度，额头烫得吓人。',
      weight: 4,
      requires: { married: true, hasChild: true, minAge: 25, maxAge: 55 },
      options: [
        { label: '连夜送医院', effects: { money: -600, stamina: -4, mood: -4 }, result: '挂完水，天也快亮了。' },
        { label: '物理降温再观察', effects: { mood: -3, stamina: -3 }, result: '你守了一夜，天快亮时退烧了。' }
      ]
    },
    {
      id: 'M_FAMILY_TRIP',
      title: '全家旅行',
      description: '孩子放暑假了，吵着要去海边。',
      weight: 3,
      requires: { married: true, hasChild: true, minAge: 28, maxAge: 55 },
      options: [
        { label: '说走就走', effects: { money: -8000, mood: 12, stamina: -3 }, result: '照片里，每个人都在笑。' },
        { label: '改近郊一日游', effects: { money: -1500, mood: 5 }, result: '孩子撅着嘴，但在草坪上跑得很欢。' }
      ]
    },
    {
      id: 'M_INLAW_LOAN',
      title: '老丈人借钱',
      description: '老丈人开口要借二十万，说是家里要盖房子。',
      weight: 3,
      requires: { married: true, minAge: 28, maxAge: 60, onceEver: true },
      options: [
        { label: '借，一家人', requires: { money: { min: 200000 } }, effects: { money: -200000, mood: 3, eq: 2 }, result: '你转了账，对方连声道谢。' },
        { label: '委婉拒绝', effects: { mood: -6 }, result: '之后每次家庭聚会，你都能感觉到那道目光。' }
      ]
    },

    /* ================= v3.7 模块 D：投资与风险（5 个） ================= */
    {
      id: 'D_RELATIVE_LOAN',
      title: '亲戚借钱',
      description: '多年不联系的亲戚突然上门，开口借五万，说是周转几天。',
      weight: 4,
      requires: { minAge: 22, maxAge: 60, onceEver: true },
      options: [
        { label: '借，写张欠条', requires: { money: { min: 50000 } }, effects: { money: -50000, mood: -2 }, result: '欠条写了，人也再没来过电话。' },
        { label: '说手头也紧', effects: { mood: -3, eq: 1 }, result: '对方坐了一会儿，悻悻地走了。' }
      ]
    },
    {
      id: 'D_STOCK_UP',
      title: '股票大涨',
      description: '你随手买的几只股票，今天涨了 8%。',
      weight: 3,
      requires: { minAge: 22, maxAge: 60, money: { min: 10000 } },
      options: [
        { label: '见好就收', effects: { money: 15000, mood: 8 }, result: '你卖了，落袋为安。' },
        { label: '再拿拿看', effects: { mood: 4, will: 1 }, result: '你盯着 K 线，心跳跟着起伏。' }
      ]
    },
    {
      id: 'D_STOCK_DOWN',
      title: '股票大跌',
      description: '今天开盘就是一路绿，你的持仓缩水了两成。',
      weight: 3,
      requires: { minAge: 22, maxAge: 60, money: { min: 10000 } },
      options: [
        { label: '割肉止损', effects: { money: -10000, mood: -10 }, result: '你卖出去了，心像被剜了一块。' },
        { label: '死扛等反弹', effects: { mood: -6 }, result: '你关掉软件，假装什么都没发生。' }
      ]
    },
    {
      id: 'D_NET_SCAM',
      title: '网络诈骗',
      description: '「客服」打来电话，说你有一笔退款要操作，需要验证码。',
      weight: 4,
      requires: { minAge: 22, maxAge: 70, onceEver: true },
      options: [
        { label: '警觉，直接挂断', effects: { mood: 1, intelligence: 2 }, result: '你反手举报了这个号码。' },
        { label: '按对方说的操作', effects: { money: -20000, mood: -14 }, result: '钱转出去那一刻，你才意识到被骗了。' }
      ]
    },
    {
      id: 'D_WEALTH_ADVISOR',
      title: '理财推销',
      description: '理财顾问热情推荐：「年化 15%，保本，限时抢购。」',
      weight: 3,
      requires: { minAge: 25, maxAge: 65, money: { min: 50000 } },
      options: [
        { label: '投一笔试试', requires: { money: { min: 50000 } }, effects: { money: -50000, mood: 2 }, result: '三个月后，你发现「保本」二字很微妙。' },
        { label: '不碰，太像骗局', effects: { mood: 1, intelligence: 1 }, result: '你挂断电话，把这个号码标记了骚扰。' }
      ]
    },

    /* ================= v3.14 中年危机事件库（35-55 岁，15 个）================= */
    {
      id: 'E_LAYOFF_N1',
      title: 'N+1 的诱惑',
      description: 'HR 把你叫进会议室，桌上摊着一份「协商解除协议」：签了，拿 N+1；不签，下个月优化名单上见。',
      weight: 5,
      priority: true,
      requires: { onceEver: true, job: 'not_null', minAge: 35, maxAge: 55 },
      options: [
        {
          label: '签了，拿钱走人',
          effects: { mood: -8, stamina: -2 },
          result: '你签了字，抱着纸箱走出大楼，阳光有点刺眼。',
          onChoose: function () {
            state.money += 60000;
            doLayoff('拿了 N+1 主动离职');
            addLog('event', '【N+1】赔偿金到账，你正式失业，但至少还有一笔钱。');
          }
        },
        {
          label: '降薪苟活',
          effects: { mood: -14, stamina: -3 },
          result: '你签了降薪协议，保住了工位，也保住了房贷。',
          onChoose: function () {
            if (state.salary > 0) state.salary = Math.round(state.salary * 0.7);
            addLog('sys', '【降薪】月薪降到 ' + state.salary + ' 元，但饭碗保住了。');
          }
        }
      ]
    },
    {
      id: 'E_MENTOR_NEWBIE',
      title: '带新人',
      description: '老板把一个刚毕业的年轻人塞到你手里：「你经验足，带带他。」你看着他眼里的光，想起十年前的自己。',
      weight: 4,
      requires: { onceEver: true, job: 'not_null', minAge: 35, maxAge: 55 },
      options: [
        {
          label: '倾囊相授',
          effects: { mood: -4, intelligence: 3, will: 2 },
          result: '你把自己十年的经验都倒给了他，他学得很快。',
          onChoose: function () {
            if (eventRoll() < 0.25 && state.salary > 0) {
              doLayoff('被自己带的徒弟顶替');
              addLog('danger', '【被替代】公司觉得新人更便宜，你被优化了。');
            } else {
              addLog('sys', '【带新人】你多了一个徒弟，也多了一份被替代的风险。');
            }
          }
        },
        {
          label: '留一手，只教皮毛',
          effects: { mood: 3, eq: -2, will: -2 },
          result: '你教了些无关痛痒的东西，他连门都没摸到。',
          onChoose: function () {
            addLog('sys', '【留一手】你保住了位置，但老板对你的评价打了折扣。');
          }
        }
      ]
    },
    {
      id: 'E_HEALTH_RED',
      title: '体检报告亮红灯',
      description: '体检报告上，几行红字触目惊心：脂肪肝、血压偏高、心电图异常。医生建议复查。',
      weight: 4,
      requires: { onceEver: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '花钱做全面治疗',
          requires: { money: { min: 10000 } },
          effects: { money: -10000, stamina: 10, mood: 4 },
          result: '你住院调理了半个月，指标终于降下来了。'
        },
        {
          label: '硬扛，先忙工作',
          effects: { stamina: -12, mood: -8 },
          result: '你把报告塞进抽屉，继续熬夜加班。'
        }
      ]
    },
    {
      id: 'E_KID_CLASS',
      title: '几万块的辅导班',
      description: '孩子拿着辅导班传单回来：「同学都报了。」一学期三万八，你算了算卡里的余额。',
      weight: 5,
      requires: { onceEver: true, hasChild: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '砸锅卖铁也要报',
          requires: { money: { min: 38000 } },
          effects: { money: -38000, mood: -6, stamina: -2 },
          result: '你刷了卡，孩子抱着新书包笑了，你却笑不出来。',
          onChoose: function () { addKidRelation(10); }
        },
        {
          label: '顺其自然',
          effects: { mood: -4, will: 2 },
          result: '你跟孩子说「不报也行」，他低着头没说话。',
          onChoose: function () { addKidRelation(-5); }
        }
      ]
    },
    {
      id: 'E_SPOUSE_NEGLECT',
      title: '你就是不顾家',
      description: '凌晨回家，桌上留着一张便签：「这个家有你没你都一样。」你站在玄关，半天没换鞋。',
      weight: 5,
      requires: { onceEver: true, married: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '吵一架，把憋的话都说出来',
          effects: { mood: -10, stamina: -2 },
          result: '你们吵到凌晨两点，最后谁也没说服谁。',
          onChoose: function () { addLove(-8); }
        },
        {
          label: '请个假，带家人出去吃饭',
          requires: { money: { min: 2000 } },
          effects: { money: -2000, mood: 4 },
          result: '你破天荒请了半天假，一家人吃了顿火锅，气氛缓和了。',
          onChoose: function () { addLove(8); }
        }
      ]
    },
    {
      id: 'E_PARENT_BED',
      title: '陪床',
      description: '母亲住院了，腰椎手术。父亲在电话里说：「你不用回来，我照顾得了。」语气却不像。',
      weight: 4,
      requires: { onceEver: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '请假回家陪床',
          effects: { money: -5000, mood: 5, stamina: -5 },
          result: '你在医院陪了七天，母亲醒来第一句话是问你吃饭没。'
        },
        {
          label: '花钱请护工',
          requires: { money: { min: 8000 } },
          effects: { money: -8000, mood: -3 },
          result: '你请了最好的护工，但视频里母亲一直在问「你什么时候回来」。'
        }
      ]
    },
    {
      id: 'E_RATE_HIKE',
      title: '利率又涨了',
      description: '银行发来短信：LPR 上调，你每个月的月供多了两千二。你盯着那条短信，把烟掐了。',
      weight: 4,
      requires: { onceEver: true, minAge: 35, maxAge: 55, money: { min: 50000 } },
      options: [
        {
          label: '咬牙提前还一部分',
          requires: { money: { min: 100000 } },
          effects: { money: -100000, mood: 5, stamina: -2 },
          result: '你还了一大笔本金，月供降了，手头也空了。'
        },
        {
          label: '硬扛，慢慢还',
          effects: { mood: -10, stamina: -2 },
          result: '你算了算，这辈子可能都在给银行打工。'
        }
      ]
    },
    {
      id: 'E_RELATIVE_DEBT_NEW',
      title: '钱是借给亲戚的',
      description: '表弟借你的三万块，说好三个月还，如今两年了。家庭聚会上，他正在朋友圈晒新买的车。',
      weight: 4,
      requires: { onceEver: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '饭桌上把话挑明',
          effects: { mood: -6, eq: 2 },
          result: '你开了口，全桌安静，表弟红着脸说下个月还。',
          onChoose: function () {
            state.money += 30000;
            addLog('event', '【要账】你要回了 30000 元，但亲戚关系彻底凉了。');
          }
        },
        {
          label: '算了，就当没这亲戚',
          effects: { mood: -12, will: 3 },
          result: '你把这件事咽了下去，从此再没参加过家庭聚会。'
        }
      ]
    },
    {
      id: 'E_NODULE_CHECK',
      title: '体检发现结节',
      description: 'B 超报告上写着「甲状腺结节，建议进一步检查」。医生说八成是良性的，但你心里还是发毛。',
      weight: 3,
      requires: { onceEver: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '花钱做详细检查',
          requires: { money: { min: 8000 } },
          effects: { money: -8000, mood: -4 },
          result: '你预约了穿刺活检，等结果的那几天，你谁也没告诉。',
          nextEventId: 'E_NODULE_RESULT'
        },
        {
          label: '先去网上查查',
          effects: { mood: -3, intelligence: 1 },
          result: '你搜了一晚上，越搜越怕，最后关了电脑。',
          onChoose: function () {
            if (eventRoll() < 0.2) {
              state.sta -= 8;
              addLog('danger', '【恶化】结节似乎变大了，你终于决定去医院。');
            }
          }
        }
      ]
    },
    {
      id: 'E_NODULE_RESULT',
      title: '检查结果',
      description: '医生把报告推过来，镜片后的眼睛看不出情绪：「我们一项一项看。」',
      weight: 1,
      chainOnly: true,
      requires: { minAge: 35 },
      options: [
        {
          label: '听医生说',
          effects: {},
          result: '你屏住了呼吸。',
          onChoose: function () {
            if (eventRoll() < 0.7) {
              state.mood += 20;
              addLog('event', '【虚惊一场】医生说是良性，定期复查就行。你走出医院，觉得天都亮了。');
            } else {
              state.sta -= 15;
              state.money -= 20000;
              state.mood -= 15;
              addLog('danger', '【确诊重病】医生说是恶性，需要立即手术。你握着报告的手一直在抖。');
            }
            clampStats();
          }
        }
      ]
    },
    {
      id: 'E_FRIEND_INVEST',
      title: '朋友的项目',
      description: '老同学约你吃饭，说有个「稳赚不赔」的项目，投十万，一年翻倍。他拍着胸脯保证。',
      weight: 4,
      requires: { onceEver: true, minAge: 35, maxAge: 55, money: { min: 100000 } },
      options: [
        {
          label: '投十万试试',
          requires: { money: { min: 100000 } },
          effects: { money: -100000, mood: 3 },
          result: '你转了账，老同学说「等着数钱吧」。',
          nextEventId: 'E_INVEST_RESULT'
        },
        {
          label: '婉拒，我不懂这个',
          effects: { mood: -2, intelligence: 2 },
          result: '你笑着拒绝，回家路上有点后悔，又有点庆幸。'
        }
      ]
    },
    {
      id: 'E_INVEST_RESULT',
      title: '一年后',
      description: '一年之期到了，项目终于有了结果。',
      weight: 1,
      chainOnly: true,
      requires: { minAge: 35 },
      options: [
        {
          label: '查看账户',
          effects: {},
          result: '你登录了那个很久没打开的 App。',
          onChoose: function () {
            if (eventRoll() < 0.5) {
              state.money += 200000;
              state.mood += 15;
              addLog('event', '【翻倍】项目真的赚了，你的十万变成了二十万。');
            } else {
              state.mood -= 18;
              addLog('danger', '【暴雷】项目暴雷，老同学失联，十万块打了水漂。');
            }
            clampStats();
          }
        }
      ]
    },
    {
      id: 'E_KID_TALENT',
      title: '孩子的天赋',
      description: '美术老师打来电话，说孩子画画很有天赋，建议送去专业班，一年学费五万。',
      weight: 3,
      requires: { onceEver: true, hasChild: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '砸钱培养',
          requires: { money: { min: 50000 } },
          effects: { money: -50000, mood: -3 },
          result: '你报了班，孩子每周背着画板去上课。',
          nextEventId: 'E_KID_TALENT_RESULT'
        },
        {
          label: '顺其自然',
          effects: { mood: -2, eq: 2 },
          result: '你说「画画当爱好就好」，孩子接受了这个说法。',
          onChoose: function () { addKidRelation(-3); }
        }
      ]
    },
    {
      id: 'E_KID_TALENT_RESULT',
      title: '三年后',
      description: '孩子的画挂在了市青少年画展的墙上，老师说他很有希望。',
      weight: 1,
      chainOnly: true,
      requires: { minAge: 35 },
      options: [
        {
          label: '看他捧回奖杯',
          effects: {},
          result: '你站在展厅里，觉得那五万块花得值。',
          onChoose: function () {
            if (eventRoll() < 0.6) {
              state.mood += 15;
              addLog('event', '【成材】孩子拿了金奖，你眼眶红了。');
            } else {
              state.mood -= 8;
              addLog('sys', '【平平】孩子没拿奖，但他真的很喜欢画画。');
            }
            clampStats();
          }
        }
      ]
    },
    {
      id: 'E_PARENT_TOUR',
      title: '父母想出去走走',
      description: '父亲翻着旅游杂志说：「你妈这辈子还没坐过飞机。」你看了眼堆积如山的工作。',
      weight: 3,
      requires: { onceEver: true, minAge: 35, maxAge: 55 },
      options: [
        {
          label: '请假，带他们去',
          effects: { money: -10000, mood: 12, stamina: -3 },
          result: '你们在飞机上拍了张全家福，父亲一直笑。'
        },
        {
          label: '给他们报个团，我就不去了',
          requires: { money: { min: 5000 } },
          effects: { money: -5000, mood: -4, eq: 1 },
          result: '你给他们报了豪华团，自己继续加班，心里有点堵。'
        }
      ]
    }
  ];

  // 按 id 查行动：线性查找而不是静态索引，保证外部往 actionsData 里 push 新条目后立刻可用
  var CAREER = {
    '普通文员':   { salary: 5000,  next: '部门主管', prev: null,        requiredIntelligence: 30,  req: { workYears: 1, intelligence: 100 } },
    '部门主管':   { salary: 10000, next: '部门经理', prev: '普通文员',   requiredIntelligence: 100, req: { workYears: 2, intelligence: 150 } },
    '部门经理':   { salary: 17000, next: null,       prev: '部门主管',   requiredIntelligence: 150 },

    '普通程序员': { salary: 15000, next: '大厂程序员', prev: null,        requiredIntelligence: 130, req: { workYears: 2, intelligence: 180 } },
    '大厂程序员': { salary: 24000, next: '高级开发', prev: '普通程序员', requiredIntelligence: 180, req: { workYears: 2, intelligence: 250 } },
    '高级开发':   { salary: 38000, next: '架构师',   prev: '大厂程序员', requiredIntelligence: 250, req: { workYears: 3, intelligence: 350 } },
    '架构师':     { salary: 60000, next: null,       prev: '高级开发',   requiredIntelligence: 350 }
  };
  // 兼容旧引用（入职时按职业取名薪）
  var JOBS = {};
  for (var _job in CAREER) JOBS[_job] = { salary: CAREER[_job].salary };
  var PAY_STAMINA = -1;    // 上班每月消耗（v3.2：-2 → -1，工作不再慢性致死）
  var PAY_MOOD = -5;

  // 生活费：有工作时按月薪的比例收，无业按保底收。
  // 数值只在这里定义一次，月结结算与开局文案都读它，避免文案和逻辑各写一套。
  var LIVING_BASE = 1100;                                    // v3.7：无业 / 低薪时的保底生活费（略提高，防内容扩展后早逝偏低）
  var LIVING_RATE = 0.32;                                    // 在职时占月薪的比例

  /* ===== [数据层] 婚姻 / 家庭 / 子女：数值集中管理（v3.0.2） =====
     改手感只动这里；事件 requires 与结算函数都读这些常量。
     （MARRY_MIN_AGE / MARRY_URGE_AGE / MARRY_COOLDOWN / PREGNANCY_* 已提前到 eventsData 之前定义） */
  var CHILD_LEGAL_AGE = 18;        // 子女成年（成年前扣养育费，成年后进入反哺判定）

  var MOOD_MAX_BASE = 100;         // 未婚心情上限
  var MOOD_MAX_MARRIED = 110;      // 婚后心情上限
  var MOOD_BONUS_PER_KID = 5;      // 每个孩子额外上限
  var MOOD_MAX_CAP = 120;          // 心情上限天花板

  var FAMILY_RATE = 0.15;          // 家用占月薪比例
  var FAMILY_MIN = 800;            // 家用保底
  var KID_MONTHLY_COST = 1200;     // 每个孩子的月度养育费
  var LOVE_DRAIN = 1;              // 感情自然衰减 / 月
  var LOVE_DRAIN_DEBT = 3;         // 负债月份额外衰减
  var LOVE_HAPPY = 60;             // 高于此值：每月心情 +MOOD_UP
  var LOVE_COLD = 20;              // 低于此值：每月心情 −MOOD_DOWN
  var MOOD_UP = 8;
  var MOOD_DOWN = 6;
  var COLD_MONTHS = 2;             // 连续冷战几个月触发离婚
  var DIVORCE_MOOD = 25;           // 离婚扣的心情
  var DIVORCE_SPLIT = 0.5;         // 协议离婚分走的比例
  var DIVORCE_SPLIT_CLEAN = 0.7;   // 净身出户分走的比例

  /* ===== [数据层] 子女养育（v3.1）===== */
  var KID_MONTHLY = [800, 1100, 1500, 2000, 2800];    // v3.2 下调：原 [1200,1800,2200,3000,4000]
  var INVEST_MUL = { '普通': 1, '重点': 1.5, '国际': 2.0 };   // v3.2：1.6/2.4 → 1.5/2.0
  var INVEST_GROWTH = { '普通': 2, '重点': 4, '国际': 6 };    // 每年智力成长加成
  var INVEST_ABILITY = { '普通': 0, '重点': 30, '国际': 60 }; // 成年能力加成
  var KID_MAX = 3;                 // 最多几个孩子
  var SUPPORT_CAP = 4000;          // 反哺封顶（每月）
  var SUPPORT_OLD_MUL = 1.3;       // 父母 60 岁后的反哺倍率
  var SUPPORT_LEECH = -1500;       // 啃老每月倒贴
  var SUPPORT_GOOD_ABILITY = 180;  // 能力值 ≥ 此线才算「有出息」
  var SUPPORT_MID_ABILITY = 90;    // 低于此线算「啃老」
  var LEECH_EVENT_CHANCE = 0.1;    // 啃老孩子每月要钱的概率
  var LEECH_EVENT_COST = 5000;
  var KID_LOSS_CHANCE = 0.002;    // 孩子每年意外的概率（很低，但「失孤」结局存在）

  function livingCostOf(salary) {
    return Math.max(LIVING_BASE, Math.round((Number(salary) || 0) * LIVING_RATE));
  }

  // 开局日志用：把上面两个数值翻译成人话，改数值不用再改文案
  function livingCostText() {
    return '每月自动结算生活费：在职按月薪 ' + Math.round(LIVING_RATE * 100)
      + '%，无业保底 ' + LIVING_BASE + ' 元。';
  }

  // 学历阶梯：minEdu 按这里的顺序比较高低
  var EDU_LADDER = ['无', '小学', '初中', '高中', '专科', '本科', '硕士', '博士'];
  var EDU_RANK = {};
  EDU_LADDER.forEach(function (e, i) { EDU_RANK[e] = i; });

  // 玩家年龄：state.age 是唯一来源，跨年时 +1
  var ATTRS = {
    intelligence: { key: 'int',   label: '智力' },
    stamina:      { key: 'sta',   label: '体质' },
    cha:        { key: 'cha', label: '魅力' },
    will:         { key: 'will',  label: '心志' },
    eq:           { key: 'eq',    label: '情商' },
    luck:         { key: 'luck',  label: '运气' },
    money:        { key: 'money', label: '金钱' },
    mood:         { key: 'mood',  label: '心情' }
  };
  var ATTR_ORDER = ['intelligence', 'stamina', 'cha', 'will', 'eq', 'luck', 'money', 'mood'];


  // 快照 / 应用 effects / 生成增减文案
  var LAYOFF_CHANCE = 0.3;
  var SPOUSE_SURNAME = ['林', '沈', '周', '许', '苏', '程', '叶', '陈', '温', '江'];
  var SPOUSE_GIVEN = ['晓', '知', '南', '宁', '安', '清', '然', '棠', '屿', '禾'];

  var KID_SURNAME = ['许', '林', '沈', '周', '苏', '程', '叶', '陈', '温', '江'];
  var KID_GIVEN = ['小满', '小禾', '一诺', '知乐', '念安', '时雨', '长宁', '星野', '阿圆', '小满'];

  var endingRules = [
    {
      id: 'E_DEATH_EARLY', name: '英年早逝', priority: 1,
      desc: '身体先于岁月垮掉了。你走得太早，很多话没来得及说。',
      hint: '反复过度劳累，多次住院后身体彻底垮掉。',
      test: function () { return (state.hospitalCount || 0) >= HOSPITAL_DEATH; }   // v3.9：累计负债住院达阈值（见 HOSPITAL_DEATH）
    },
    {
      id: 'E_BANKRUPT', name: '贫病交加', priority: 2,
      desc: '账户是负数，名下没有工作，日子一天比一天更薄。',
      hint: '身无分文，且失去了收入来源。',
      test: function () { return state.money < 0 && (state.job === '无业' || !state.salary); }
    },
    {
      id: 'E_RICH', name: '功成名就', priority: 3,
      desc: '你读过书，也算挣到了钱。至少这一生，账面上是赢的。',
      hint: '积累了惊人的财富，且拥有高学历。',
      test: function () {
        return state.money > 1000000 &&
          (EDU_RANK[state.edu] || 0) >= EDU_RANK['本科'];
      }
    },
    {
      id: 'E_LABOR', name: '劳碌一生', priority: 4,
      desc: '三十多年，你把时间一格一格交给了工位。',
      hint: '在某份工作上奉献了超过 30 年的青春。',
      test: function () { return state.totalWorkYears > 30; }
    },
    {
      id: 'E_LOST_CHILD', name: '失孤', priority: 5,
      desc: '家里的相框擦得很干净，饭桌上永远多摆一副碗筷。',
      hint: '失去过孩子，且再没有别的孩子陪在身边。',
      test: function () {
        return (state.lostChild || 0) > 0 && livingChildren().length === 0 && getAge() >= 55;
      }
    },
    {
      id: 'E_FOUR_GEN', name: '四世同堂', priority: 6,
      desc: '过年时桌子不够坐，得把茶几也搬过来。你坐在最里面，看着一屋子人。',
      hint: '有两个以上的孩子，且已经有孙辈。',
      test: function () {
        var list = livingChildren();
        if (list.length < 2) return false;
        for (var i = 0; i < list.length; i++) if (list[i].hasChild) return getAge() >= 70;
        return false;
      }
    },
    {
      id: 'E_DINK', name: '丁克家族', priority: 7,
      desc: '两个人把一辈子过成了两个人的。存款够花，房子够住，狗活了十四年。',
      hint: '结婚且主动选择不要孩子，活到晚年。',
      test: function () {
        return state.married === true && state.dink === true && livingChildren().length === 0 && getAge() >= 70;
      }
    },
    {
      id: 'E_ORDINARY', name: '平凡的一生', priority: 99,
      desc: '没有大富大贵，也没有大起大落。你就这样过完了一辈子。',
      hint: '像大多数人一样，走完了普通的一生。',
      test: function () { return true; }
    }
  ];

  /* ---- 结局图鉴：跨人生持久化，重开不会清 ----
     存储格式 v2：[{ id, age, edu, job, workYears, money, int, sta, mood, at }]
     兼容 v1（纯字符串 ID 数组）：读出来补成 { id }，年龄显示「未知」*/
  var DEX_KEY = 'renjian-siji-endings-v1';

  var HOSPITAL_RATE = 0.30;
  var HOSPITAL_MIN = 500;
  var HOSPITAL_MAX = 50000;
  var HOSPITAL_STA = 30;                 // 住院后体质恢复到 30
  var HOSPITAL_MOOD_PENALTY = 20;        // 住院心情 -20
  var HOSPITAL_DAYS = 15;                // 住院跳过 15 天
  var HOSPITAL_DEATH = 6;                // 累计「负债住院」达到 6 次才猝死（有钱住院会清零）
  var DEBT_STAMINA = 0;                  // v3.3：负债不再扣体质（穷不等于死）
  var DEBT_MOOD = 6;                     // v3.3：改为每月心情 -6
  var PENSION = 1600;                    // v3.2：60 岁起每月养老金（否则退休必然破产）
  var BENEFIT = 500;                     // v3.2：22 岁以上失业且快没钱时的低保
  var BENEFIT_THRESHOLD = 2000;          // 手头低于这个数才触发低保
  var PENSION_AGE = 60;

  // 跳过 N 天：只推进日历与常规结算，不抽事件（住院休养期间没有事件）
  var DEFER_LIMIT = 3;

  var FALLBACK_ID = 'E_DEFAULT';

  // 满足前置条件的事件池（requires 复用同一套引擎；保底事件不参与常规抽取）
  var PREV_KEY = 'renjian-siji-save-prev';   // v3.7：跨月前快照（回溯时间用）

  var ACH_KEY = 'renjian-siji-ach-v1';
  var achievementsData = window.achievementsData = [
    { id: 'A_985',     name: '金榜题名', desc: '考上 985 顶尖大学',         test: function (s) { return s.school === '顶尖大学'; } },
    { id: 'A_SAL10K',  name: '月薪破万', desc: '首次月薪突破 10000 元',      test: function (s) { return s.salary >= 10000; } },
    { id: 'A_MONEY1M', name: '百万富翁', desc: '存款达到 100 万',            test: function (s) { return s.money >= 1000000; } },
    { id: 'A_MARRIED', name: '携手成家', desc: '步入婚姻殿堂',              test: function (s) { return s.married === true; } },
    { id: 'A_KID',     name: '为人父母', desc: '迎来第一个孩子',            test: function (s) { return s.kids > 0; } },
    { id: 'A_FIRSTLOVE', name: '情窦初开', desc: '经历过一段刻骨铭心的感情', test: function (s) { return s.hadTeenLove === true || (s.triggeredEvents || []).indexOf('E_FIRST_LOVE') > -1; } },
    { id: 'A_HOP3',    name: '跳槽达人', desc: '累计跳槽 3 次',             test: function (s) { return (s.hopCount || 0) >= 3; } },
    { id: 'A_ARCHITECT', name: '架构师',  desc: '晋升为架构师',              test: function (s) { return s.job === '架构师'; } },
    { id: 'A_RICH',    name: '功成名就', desc: '存款 100 万且本科以上',      test: function (s) { return s.money > 1000000 && (EDU_RANK[s.edu] || 0) >= EDU_RANK['本科']; } },
    { id: 'A_DINK',    name: '丁克自由', desc: '选择丁克生活方式',            test: function (s) { return s.dink === true; } }
  ];

  var SFX_KEY = 'renjian-siji-sfx-v1';

