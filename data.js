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
    },

    /* v3.19：三个新职业的入职入口（数据层新增，不改引擎；晋升/降职对平级职业自动锁死） */
    {
      id: 'jobTeacher',
      name: '应聘人民教师',
      description: '考编，然后是几十年的黑板。',
      costDays: 1,
      effects: { mood: -1, eq: 2 },
      displayEffects: { mood: -1, eq: 2 },
      hideWhenLocked: true,
      requires: { minAge: 22, minEdu: '本科', isStudent: false, unemployed: true, eq: { min: 40 } },
      onRun: function () {
        state.job = '人民教师';
        state.salary = JOBS['人民教师'].salary;
        state.housing = 'rent';
        state.totalWorkYears = 0;
        state.currentPositionYears = 0;
        markJobChange();
        addLog('event', '你考上了编制，成了一名教师，月薪 7000。');
      }
    },
    {
      id: 'jobRider',
      name: '注册外卖骑手',
      description: '租车、买箱、领工服，今天就能上线。',
      costDays: 1,
      effects: { mood: 1, stamina: -2 },
      displayEffects: { mood: 1, stamina: -2 },
      hideWhenLocked: true,
      requires: { minAge: 20, unemployed: true, stamina: { min: 50 } },
      onRun: function () {
        state.job = '外卖骑手';
        state.salary = JOBS['外卖骑手'].salary;
        state.housing = 'rent';
        state.totalWorkYears = 0;
        state.currentPositionYears = 0;
        markJobChange();
        addLog('event', '你成了众包骑手，跑得多月入 8000 上下，全靠这双腿。');
      }
    },
    {
      id: 'jobStreamer',
      name: '开播试试',
      description: '补光灯、声卡、一张能说会道的嘴。',
      costDays: 1,
      effects: { mood: 2, stamina: -1, money: -1500 },
      displayEffects: { mood: 2, money: -1500 },
      hideWhenLocked: true,
      requires: { minAge: 18, unemployed: true, cha: { min: 55 }, luck: { min: 45 }, money: { min: 1500 } },
      onRun: function () {
        state.job = '网红主播';
        state.salary = JOBS['网红主播'].salary;
        state.housing = 'rent';
        state.totalWorkYears = 0;
        state.currentPositionYears = 0;
        markJobChange();
        addLog('event', '你开了第一个直播间，前三个月月流水 9000 上下，很不稳定。');
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
        },
        {
          // v3.16.2：把「协议离婚」这条死链接回主线——E_MARRIED_DIVORCE 原本是
          // chainOnly 却没有任何 nextEventId 指向，永远播不到，现已闭环。
          // 门槛用感情值兜底：感情还过得去（> 35）时这一步根本不会出现。
          label: '吵到要离，把「离婚」两个字说了出来',
          requires: { loveMax: 35 },
          effects: { mood: -12, will: 2 },
          result: '那两个字说出口之后，屋子里安静得能听见冰箱的嗡嗡声。',
          onChoose: function () { addLove(-10); },
          nextEventId: 'E_MARRIED_DIVORCE'
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
            clampStats();
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
    },

    /* ================= v3.15 学生时期事件库（高中 10 + 大学 10）================= */
    /* ---- 高中（education: ['高中']，minAge 16 / maxAge 18）---- */
    {
      id: 'E_HS_MOCK_EXAM',
      title: '高三模拟考',
      description: '高三第一次模拟考，你的名字排在年级倒数第三。班主任把你的卷子拍在桌上：「这就是你的态度？」',
      weight: 6,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '熬夜刷题，下次翻盘',
          effects: { intelligence: 6, stamina: -6, mood: -5 },
          result: '你把错题本抄了三遍，凌晨两点的台灯比月亮还亮。'
        },
        {
          label: '破罐子破摔',
          effects: { mood: 6, intelligence: -2, will: -3 },
          result: '你把卷子揉成一团塞进抽屉，转身去了篮球场。'
        }
      ]
    },
    {
      id: 'E_HS_NETCAFE_CAUGHT',
      title: '网吧被抓',
      description: '周三下午，你翻墙去网吧打排位。屏幕刚亮，教导主任的手电筒就照在了你脸上。',
      weight: 5,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '低头认错，写检查',
          effects: { mood: -6, will: 3, eq: 2 },
          result: '你在办公室站了一下午，检讨写得比作文还认真。'
        },
        {
          label: '翻窗就跑',
          effects: { stamina: -5, mood: 3, will: -2 },
          result: '你从后窗跳出去，摔了一跤，但没被记名字。'
        }
      ]
    },
    {
      id: 'E_HS_BULLY_WITNESS',
      title: '走廊尽头',
      description: '放学后，走廊尽头传来推搡声。几个高年级的把一个戴眼镜的男生堵在墙角，书包被扔在地上。',
      weight: 5,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '上前拦住',
          effects: { stamina: -6, mood: 5, will: 5, cha: 3 },
          result: '你挡在那个男生前面，霸凌者问你「多管闲事？」，你说「对」。',
          onChoose: function () {
            if (eventRoll() < 0.3) {
              state.sta -= 8;
              addLog('danger', '【挨打】你被推倒在地，但那个男生从此叫你哥。');
            }
            clampStats();
          }
        },
        {
          label: '报告老师',
          effects: { mood: -2, eq: 4 },
          result: '你跑去找了班主任，事情很快压了下去。'
        },
        {
          label: '视而不见',
          effects: { mood: -10, will: -2 },
          result: '你加快脚步，假装什么都没看见，那天晚上没睡着。'
        }
      ]
    },
    {
      id: 'E_HS_PARENT_MEETING',
      title: '家长会',
      description: '期中家长会定在周五下午。你爸在电话里说「我那天有事」，你知道他又要缺席了。',
      weight: 5,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '花钱找人冒充家长',
          requires: { money: { min: 500 } },
          effects: { money: -500, mood: 3, will: -2 },
          result: '你在校门口租了个「叔叔」，他演技很好，老师一点没怀疑。'
        },
        {
          label: '诚实面对，自己去',
          effects: { mood: -4, will: 4, eq: 2 },
          result: '你一个人坐在自己的座位上，老师多看了你几眼，什么也没说。'
        }
      ]
    },
    {
      id: 'E_HS_LOVE_LETTER',
      title: '收到情书',
      description: '课桌抽屉里多了一张折成心形的信纸，字很娟秀：「如果你愿意，周五放学操场见。」',
      weight: 6,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18, single: true, notTeenLove: true, cha: { min: 30 } },
      options: [
        {
          label: '周五去操场',
          effects: { mood: 12, cha: 4, eq: 3, money: -50 },
          result: '你在梧桐树下站了很久，直到她笑着走过来。',
          onChoose: function () { state.hadTeenLove = true; addLog('event', '【早恋】你们在一起了。'); }
        },
        {
          label: '把信放回去',
          effects: { mood: -4, will: 2, intelligence: 2 },
          result: '你把信原样放回抽屉，第二天换成了一张「一起考同一所大学」的纸条。'
        }
      ]
    },
    {
      id: 'E_HS_LATE_STUDY',
      title: '一起晚自习',
      description: '晚自习的教室只剩你们俩，她压低声音问你：「这道题……你会吗？」她的头发蹭到了你的手背。',
      weight: 5,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18, single: true },
      options: [
        {
          label: '认真地讲题',
          effects: { intelligence: 4, eq: 3, mood: 6 },
          result: '你把这道题讲了四遍，她终于懂了，你却没听清自己的心跳。',
          onChoose: function () {
            if (state.hadTeenLove) {
              state.mood += 3;
              addLog('event', '【晚自习】和早恋对象一起复习，连做题都变得有意思。');
            }
            clampStats();
          }
        },
        {
          label: '走神，看她',
          effects: { mood: 4, intelligence: -1, will: -2 },
          result: '你讲了半天不知所云，她笑了，你却慌了。'
        }
      ]
    },
    {
      id: 'E_HS_DESK_GRAFFITI',
      title: '课桌刻字',
      description: '你在课桌上刻了一行字：「去更大的世界。」班主任巡检时停在你桌前，盯着那行字看了很久。',
      weight: 3,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '坦承是自己刻的',
          effects: { mood: -2, will: 3, eq: 2 },
          result: '班主任没批评你，只说「那就别辜负这几个字」。'
        },
        {
          label: '装不知道',
          effects: { mood: -5, will: -1 },
          result: '班主任没再追问，但你那天都不敢抬头。'
        }
      ]
    },
    {
      id: 'E_HS_CANTEEN_QUEUE',
      title: '食堂插队',
      description: '排了二十分钟，快轮到你时，一个高个子直接插到了你前面。',
      weight: 4,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '当场指出',
          effects: { mood: 4, will: 3, cha: 2 },
          result: '他回头瞪你，你把餐盘往前一推：「排队。」后面的人小声叫好。'
        },
        {
          label: '忍了',
          effects: { mood: -5, stamina: 1 },
          result: '你多等了五分钟，饭都凉了。'
        }
      ]
    },
    {
      id: 'E_HS_SPORTS_INJURY',
      title: '体育课崴脚',
      description: '三对三篮球，你起跳落地时脚踝扭了一下，疼得站不起来。',
      weight: 4,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '去医务室',
          effects: { stamina: -4, mood: -2, intelligence: 1 },
          result: '校医给你缠了绷带，说「这两周别剧烈运动」。'
        },
        {
          label: '咬牙继续打',
          effects: { stamina: -10, mood: 6, will: 3 },
          result: '你打完最后五分钟，第二天脚踝肿得像馒头。'
        }
      ]
    },
    {
      id: 'E_HS_GRAD_PHOTO',
      title: '毕业照',
      description: '摄影师喊「三、二、一」的时候，你突然想起这三年的很多事。',
      weight: 3,
      requires: { onceEver: true, education: ['高中'], minAge: 16, maxAge: 18 },
      options: [
        {
          label: '笑得最用力',
          effects: { mood: 10, eq: 3 },
          result: '照片洗出来，你的笑比谁都灿烂，也比谁都不舍。'
        },
        {
          label: '避开镜头',
          effects: { mood: -3, will: 2 },
          result: '你站在最后一排角落，只露了半张脸。'
        }
      ]
    },

    /* ---- 大学（isStudent: true）---- */
    {
      id: 'E_UNI_DORM_DRAMA',
      title: '宿舍修罗场',
      description: '室友凌晨两点还在打游戏，外放声音。你新买的洗发水，三天见了底。',
      weight: 5,
      requires: { onceEver: true, isStudent: true, housing: 'dorm', minAge: 18, maxAge: 25 },
      options: [
        {
          label: '摊牌，把话说清楚',
          effects: { mood: -3, eq: 2, will: 2 },
          result: '你拉了个宿舍群，把话说开了，气氛尴尬但规矩立住了。'
        },
        {
          label: '忍，买副耳塞',
          effects: { money: -30, mood: -4, stamina: -1 },
          result: '你戴上耳塞，也戴上了沉默。'
        },
        {
          label: '申请换宿舍',
          effects: { mood: 4, money: -200, eq: -2 },
          result: '新宿舍安静，但你成了别人嘴里「听说很难相处」的人。'
        }
      ]
    },
    {
      id: 'E_UNI_EXAM_BRIBE',
      title: '期末能不能过',
      description: '高数期中你考了 41 分。期末前，室友神秘地说：「我认识老师，送点东西就能过。」',
      weight: 5,
      requires: { onceEver: true, isStudent: true, minAge: 18, maxAge: 25 },
      options: [
        {
          label: '跟着去送礼',
          requires: { money: { min: 500 } },
          effects: { money: -500, mood: 2, eq: -2, will: -2 },
          result: '老师说「下不为例」，你松了口气，也丢了点什么。'
        },
        {
          label: '疯狂复习，靠自己',
          effects: { intelligence: 6, stamina: -5, mood: -4 },
          result: '你在图书馆熬了十天，考了 68 分，不高，但踏实。'
        },
        {
          label: '躺平，挂了再说',
          effects: { mood: 3, intelligence: -2 },
          result: '你该干嘛干嘛，成绩出来那天，果然挂了。'
        }
      ]
    },
    {
      id: 'E_UNI_CLUB_STREET',
      title: '百团大战',
      description: '社团招新摆了一操场。学生会说能加综测，街舞社说能认识很多人，你宿舍的床也说它能睡你。',
      weight: 4,
      requires: { onceEver: true, isStudent: true, minAge: 18, maxAge: 22 },
      options: [
        {
          label: '加学生会',
          effects: { eq: 5, cha: 3, mood: -2, money: -50 },
          result: '你开始写通知、跑场地、陪笑，第二年当上了部长。'
        },
        {
          label: '加街舞社',
          effects: { cha: 6, stamina: 4, mood: 5 },
          result: '你练了半年，第一次在迎新晚会上跳舞，台下有人尖叫。'
        },
        {
          label: '宅在宿舍',
          effects: { mood: 2, intelligence: 2, cha: -2 },
          result: '你的大学变得很小，但也很安静。'
        }
      ]
    },
    {
      id: 'E_UNI_INTERN_CHOICE',
      title: '大三的岔路',
      description: '大厂实习的名额只有三个，导师说「去了就别回来」。另一边，考研的倒计时已经开始。',
      weight: 4,
      requires: { onceEver: true, isStudent: true, minAge: 20, maxAge: 24 },
      options: [
        {
          label: '去大厂实习',
          effects: { money: 3000, stamina: -6, intelligence: 4 },
          result: '你每天通勤两小时，做着最基础的活，但简历上多了一行。',
          nextEventId: 'E_UNI_INTERN_RESULT'
        },
        {
          label: '备考研究生',
          effects: { mood: -6, money: -1500, intelligence: 6 },
          result: '你买齐了资料，把手机壁纸换成了倒计时。'
        }
      ]
    },
    {
      id: 'E_UNI_INTERN_RESULT',
      title: '实习结束',
      description: '实习结束的时候，主管把你的工牌收走，说了一句「有机会常联系」。',
      weight: 1,
      chainOnly: true,
      requires: { isStudent: true },
      options: [
        {
          label: '争取转正',
          effects: {},
          result: '你把简历又改了一遍。',
          onChoose: function () {
            if (eventRoll() < 0.4) {
              state.money += 5000;
              addLog('event', '【转正】主管说「毕业了来我们这」，你悬着的心放下了。');
            } else {
              state.mood -= 8;
              addLog('sys', '【画饼】主管说「再等等」，你知道那是委婉的拒绝。');
            }
            clampStats();
          }
        }
      ]
    },
    {
      id: 'E_UNI_TUTOR_JOB',
      title: '家教',
      description: '中介发来消息：初中生家教，一小时八十。你看了眼下个月的生活费。',
      weight: 4,
      requires: { onceEver: true, isStudent: true, minAge: 18, maxAge: 25 },
      options: [
        {
          label: '接，反正闲不住',
          effects: { money: 800, stamina: -3, mood: -2, intelligence: 2 },
          result: '你每周跑三趟，钱是挣到了，周末也没了。'
        },
        {
          label: '不接，专心学业',
          effects: { mood: 2, intelligence: 3 },
          result: '你婉拒了，把钱省给了睡眠和绩点。'
        }
      ]
    },
    {
      id: 'E_UNI_ROLL_CALL',
      title: '帮我点个到',
      description: '室友去约会，你不会被点到，但你得替他答「到」。点名时，老师突然问：「你是本人吗？」',
      weight: 4,
      requires: { onceEver: true, isStudent: true, minAge: 18, maxAge: 25 },
      options: [
        {
          label: '硬着头皮答「是」',
          effects: { mood: -4, eq: 2, will: -1 },
          result: '老师盯了你两秒，说「坐下吧」，你后背全是汗。'
        },
        {
          label: '坦白，替他请假',
          effects: { mood: -2, eq: 4, cha: 2 },
          result: '老师没生气，反而夸你「还算实诚」。'
        }
      ]
    },
    {
      id: 'E_UNI_LONG_DISTANCE',
      title: '异地恋',
      description: '高中在一起的那个人，考去了另一座城市。车票越攒越多，视频通话越来越短。',
      weight: 3,
      requires: { onceEver: true, isStudent: true, single: true, minAge: 18, maxAge: 25 },
      options: [
        {
          label: '每个月见一次',
          effects: { money: -800, mood: 10, stamina: -2 },
          result: '你在硬座上睡了三小时，出站时她扑过来抱住了你。'
        },
        {
          label: '好聚好散',
          effects: { mood: -8, will: 3, intelligence: 2 },
          result: '你们把聊天记录翻了一遍，然后互相说了句「保重」。'
        }
      ]
    },
    {
      id: 'E_UNI_THESIS',
      title: '查重率 48%',
      description: '查重报告出来了，48%。导师只回了两个字：「重写。」',
      weight: 4,
      requires: { onceEver: true, isStudent: true, minAge: 20, maxAge: 25 },
      options: [
        {
          label: '熬夜自己改',
          effects: { stamina: -6, intelligence: 5, mood: -6 },
          result: '你改了四天，查重降到 9%，头发少了三分之一。'
        },
        {
          label: '花钱找人降重',
          requires: { money: { min: 500 } },
          effects: { money: -500, mood: 2, intelligence: -1 },
          result: '对方三天搞定，你拿到一份查重 5% 但你自己都读不懂的论文。'
        }
      ]
    },
    {
      id: 'E_UNI_GRAD_PHOTO',
      title: '学士帽',
      description: '毕业典礼那天，你把学士帽扔向天空，风把穗子吹成了一致的角度。',
      weight: 3,
      requires: { onceEver: true, isStudent: true, minAge: 20, maxAge: 25 },
      options: [
        {
          label: '和所有人合影',
          effects: { mood: 12, eq: 3, cha: 2 },
          result: '你拍了几百张照片，每一张都笑得很用力。'
        },
        {
          label: '一个人走一圈',
          effects: { mood: 4, will: 3, intelligence: 1 },
          result: '你把校园每个角落都走了一遍，然后头也不回地离开。'
        }
      ]
    },

    /* ================================================================
       v3.16 · 恋爱线事件库（15 条）
       ---------------------------------------------------------------
       命名空间 LV_ 前缀，与既有 E_LOVE_* / E_MARRY_* / M_* 完全不冲突。
       结构：9 条进常规池（可被权重抽到）+ 6 条 chainOnly（只由 nextEventId 唤出）。
       链路：LV_FIRST_TRIP → _B ／ LV_MEET_PARENT → _B → LV_HOUSE_ARGUE → _B
             → LV_PROPOSE → （领证 marryTo ／ 没说出口 → LV_PROPOSE_LATER）
             LV_COHABIT → _B ； LV_COLD_WAR → LV_MAKE_UP
       只读写 state 既有字段（loveState / datingStart / datingLove / married /
       spouse / love），不改任何引擎逻辑。
       ================================================================ */
    {
      id: 'LV_FIRST_TRIP',
      title: '第一次出远门',
      description: '车票是她买的，行程是你排的。三天两夜，两个人在硬座上把「到时候看」说了四遍，谁也没说这算不算正式开始。',
      weight: 6,
      requires: { loveState: 'dating', datingMonths: 2, minAge: 22, maxAge: 40 },
      options: [
        {
          label: '攒钱去一趟海边',
          requires: { money: { min: 3000 } },
          effects: { money: -3000, mood: 12, cha: 2 },
          result: '海风把你们的头发都吹乱了，照片拍了七十多张，能看的只有三张。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 8));
            addLog('event', '【恋爱】好感 +8（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'LV_FIRST_TRIP_B'
        },
        {
          label: '就在城里逛一天',
          effects: { money: -300, mood: 7, eq: 2 },
          result: '你们坐了两站公交，在一家很吵的面馆吃完了两碗面。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 4));
            addLog('event', '【恋爱】好感 +4（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'LV_FIRST_TRIP_B'
        },
        {
          label: '各自忙，改天再说',
          effects: { mood: -5 },
          result: '改天到最后也没有定下来是哪一天。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 6));
            addLog('event', '【恋爱】好感 −6（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'LV_FIRST_TRIP_B',
      title: '旅途中吵了一架',
      description: '第二天晚上，为了一件很小的事——你到底是不是把地图拿反了——你们在民宿门口站了很久，楼道灯灭了又亮。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '先低头，说一句是我不好',
          effects: { mood: -3, eq: 4, will: 2 },
          result: '她愣了一下，说「你干嘛」，语气已经软了。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 6));
            addLog('event', '【恋爱】好感 +6（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '讲道理，讲到对方不说话',
          effects: { mood: -7, will: 3, eq: -2 },
          result: '你赢了这场争论，回程的四个小时里谁也没开口。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 9));
            addLog('event', '【恋爱】好感 −9（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '下楼买两瓶汽水，放在门口',
          effects: { money: -20, mood: 3, cha: 3 },
          result: '门开了半扇，她伸手把汽水拿走了，说「冰的」。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 11));
            addLog('event', '【恋爱】好感 +11（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'LV_MEET_PARENT',
      title: '见家长',
      description: '第一次去对方家里吃饭。你在楼下便利店站了十分钟，冰柜的玻璃上印出你的脸，你想不出该买什么才算得体。',
      weight: 7,
      requires: { loveState: 'dating', datingMonths: 3, minAge: 22, maxAge: 45 },
      options: [
        {
          label: '认真挑两样东西上门',
          requires: { money: { min: 800 } },
          effects: { money: -800, mood: 6, cha: 3, eq: 2 },
          result: '一箱牛奶一盒茶叶，塑料袋换了两次，最后是拎着纸袋进的电梯。',
          nextEventId: 'LV_MEET_PARENT_B'
        },
        {
          label: '空手去，只说一句来得急',
          effects: { mood: -2, will: 2 },
          result: '开门的是她妈，眼神在你手上停了一下，然后把拖鞋推到你脚边。',
          nextEventId: 'LV_MEET_PARENT_B'
        },
        {
          label: '临阵脱逃，改约下周',
          effects: { mood: -8 },
          result: '你在小区门口绕了一圈又一圈，最后发了一条「临时加班」。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 12));
            addLog('event', '【恋爱】好感 −12（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'LV_MEET_PARENT_B',
      title: '饭桌上的三句话',
      description: '问题一个接一个：老家哪里的、父母做什么的、公积金交多少、打算什么时候买房。你答得很稳，筷子却一直没动。对方妈妈把最后一块排骨夹到你碗里，说「吃啊」，你说谢谢，声音比想象中小。饭后你去厨房帮忙洗碗，水开得太大，溅了一身。她爸在客厅问了一句「小伙子酒量怎么样」，你说一般，他笑了一声。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '如实说，包括月供压力',
          effects: { mood: -4, will: 3, eq: 5 },
          result: '她爸沉默了一会儿，说「年轻人先苦两年」。这句话你记了很多年。',
          nextEventId: 'E_LOVE_HOUSE'
        },
        {
          label: '报一个体面一点的数',
          effects: { mood: 2, eq: -2, luck: 1 },
          result: '话说出口你就后悔了，数字比实际多了一半。',
          nextEventId: 'E_LOVE_HOUSE'
        },
        {
          label: '把话头引到对方小时候',
          effects: { mood: 5, eq: 4, cha: 2 },
          result: '她妈讲了一晚上她小时候的事，饭桌上的空气终于松了下来。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 8));
            addLog('event', '【恋爱】好感 +8（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'E_LOVE_HOUSE'
        }
      ]
    },
    {
      id: 'LV_COHABIT',
      title: '同居试婚',
      description: '房子是合租的次卧，衣柜只够一个人用。你们把各自的东西各寄了一半回老家，剩下的塞进两个行李箱。',
      weight: 5,
      requires: { loveState: 'dating', datingMonths: 9, minAge: 24, maxAge: 42 },
      options: [
        {
          label: '搬到一起，房租对半',
          requires: { money: { min: 2000 } },
          effects: { money: -2000, mood: 8, eq: 2 },
          result: '第一个月你们都很客气，第二个月开始为谁忘了倒垃圾说话。',
          nextEventId: 'LV_COHABIT_B'
        },
        {
          label: '把钥匙给对方一把，先过渡',
          effects: { mood: 5, eq: 3 },
          result: '两把钥匙，两个地址，一个说不清的中间地带。',
          nextEventId: 'LV_COHABIT_B'
        },
        {
          label: '继续各住各的',
          effects: { mood: 2 },
          result: '每周见两三次，每次分别都在地铁口多站一会儿。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 4));
            addLog('event', '【恋爱】好感 −4（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'LV_COHABIT_B',
      title: '谁洗碗',
      description: '为洗碗这件事，你们第一次认真算了一笔账：谁做的饭、谁拖的地、谁加班到十一点、谁周末回了自己家。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '买一台洗碗机',
          requires: { money: { min: 3000 } },
          effects: { money: -3000, mood: 7, eq: 2 },
          result: '机器装好那天，你们并排站着看它转，像看一台新电视。',
          nextEventId: 'E_LOVE_HOUSE'
        },
        {
          label: '定一张轮值表贴在冰箱上',
          effects: { mood: 4, will: 3, eq: 4 },
          result: '表贴了三个月，最后一个格子一直空着，谁也没提。',
          nextEventId: 'E_LOVE_HOUSE'
        },
        {
          label: '谁也不说话，各洗各的那只碗',
          effects: { mood: -5, will: 1 },
          result: '水槽里从此常常只有两只碗，一左一右。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 7));
            addLog('event', '【恋爱】好感 −7（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'LV_PROPOSE',
      title: '求婚',
      description: '戒指是在商场负一层买的，导购问要不要刻字。你说了两个人的名字，又说「刻小一点」。回程的公交上，那个盒子一直在口袋里硌着你的腿。',
      weight: 8,
      priority: true,
      requires: { loveState: 'dating', datingMonths: 6, minAge: 22, maxAge: 45, onceEver: true },
      options: [
        {
          label: '单膝跪下，把准备好的话说出来',
          requires: { money: { min: 8000 } },
          effects: { money: -8000, mood: 18, cha: 4, eq: 3 },
          result: '她点头的时候，周围真的有人在鼓掌，你后来才知道是她提前叫来的朋友。',
          nextEventId: 'E_LOVE_MARRY'
        },
        {
          label: '把戒指放进她常喝的那只杯子底下',
          requires: { money: { min: 8000 } },
          effects: { money: -8000, mood: 14, eq: 5 },
          result: '她端起来喝了一口才发现，差点把杯子放下又拿起来。',
          nextEventId: 'E_LOVE_MARRY'
        },
        {
          label: '最后没说出口，戒指揣回兜里',
          effects: { mood: -12, will: 2 },
          result: '那天你们照常吃了饭，照常道了晚安，盒子在你抽屉里放了很久。',
          nextEventId: 'LV_PROPOSE_LATER'
        }
      ]
    },
    {
      id: 'LV_PROPOSE_LATER',
      title: '没说出口的那晚',
      description: '戒指在抽屉里放了三个月。你们照常吃饭、照常道晚安，只是你开始留意她手机屏幕亮起来的次数，也开始在她说「随便」的时候多想两秒。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '找个周末，把话重新说一遍',
          effects: { mood: 5, will: 5, eq: 3 },
          result: '你把戒指擦了一遍，放回口袋，决定这个周末不再拖。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 5));
            addLog('event', '【恋爱】好感 +5（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '把戒指退了',
          effects: { money: 6000, mood: -9, will: 2 },
          result: '退货窗口的姑娘问「尺寸不合适吗」，你说是。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 20));
            addLog('event', '【恋爱】好感 −20（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '什么也不做，继续这样过',
          effects: { mood: -6, luck: -2 },
          result: '有些话拖着拖着，就真的不用说了。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 8));
            addLog('event', '【恋爱】好感 −8（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'LV_WED_BILL',
      title: '婚礼账单',
      description: '账单摊在桌上：酒席、婚庆、摄影、车队、改口费、给双方父母的衣服。份子钱收了一沓，红纸上写着名字和数目，有几个名字你已经想不起脸了。',
      weight: 4,
      requires: { married: true, onceEver: true, minAge: 22 },
      options: [
        {
          label: '一笔一笔对完，把超支的地方标出来',
          requires: { money: { min: 20000 } },
          effects: { money: -20000, mood: -4, eq: 4, intelligence: 2 },
          result: '你算到半夜，发现最贵的是那束每天换一次的鲜花。',
          onChoose: function () { addLove(3); }
        },
        {
          label: '先还信用卡，剩下的慢慢还',
          effects: { money: -8000, mood: -9, will: 3 },
          result: '分期分了十二期，每个月十号手机都会响一下。',
          onChoose: function () { addLove(-2); }
        },
        {
          label: '让父母垫上，回头再说',
          effects: { mood: -6, eq: -3, will: 1 },
          result: '你妈说「不用还」，你说要还，这句话后来被提起了很多次。',
          onChoose: function () { addLove(-4); }
        }
      ]
    },
    {
      id: 'LV_MONEY_TALK',
      title: '婚后谈钱',
      description: '第一个月的水电费单子出来，她说「我们是不是该有个共同账户」。你把手机翻到余额页面，又按灭了，说了一句「都行」。',
      weight: 5,
      requires: { married: true, loveMax: 70, minAge: 23 },
      options: [
        {
          label: '开一个共同账户，每月各打一半',
          requires: { money: { min: 3000 } },
          effects: { money: -3000, mood: 8, eq: 5 },
          result: '账户名是两个人的姓，密码是领证那天。',
          onChoose: function () { addLove(5); }
        },
        {
          label: '各管各的，大件一起出',
          effects: { mood: 4, will: 3, eq: 2 },
          result: '你们各自有一张卡，冰箱上贴着一张「谁该付」的清单。',
          onChoose: function () { addLove(1); }
        },
        {
          label: '把钱全交出去，省事',
          effects: { mood: 6, eq: -4 },
          result: '每个月十号你收到一笔固定的零花，数目不大，但从来没缺过。',
          onChoose: function () { addLove(7); }
        }
      ]
    },
    {
      id: 'LV_COLD_WAR',
      title: '冷战',
      description: '这已经是第三天没说话了。昨晚你洗完碗，她在客厅把电视声音调大了一格；今天早上她出门前，把伞放在了门口的鞋柜上，而你正好没带伞。',
      weight: 6,
      requires: { married: true, loveMax: 40, minAge: 23 },
      options: [
        {
          label: '第二天早起，做两个人份的早饭',
          effects: { mood: 5, will: 3, eq: 4 },
          result: '她坐下吃完了，出门前说了一句「盐放多了」。',
          onChoose: function () { addLove(6); },
          nextEventId: 'LV_MAKE_UP'
        },
        {
          label: '等她先开口',
          effects: { mood: -7, will: 2 },
          result: '第七天的时候，是她先说话，说的是一句「酱油没了」。',
          onChoose: function () { addLove(-5); }
        },
        {
          label: '收拾行李，回自己家住几天',
          effects: { mood: -10, stamina: -3, will: 3 },
          result: '你在自己房间的床上躺了两晚，谁也没打那个电话。',
          nextEventId: 'LV_MAKE_UP'
        }
      ]
    },
    {
      id: 'LV_MAKE_UP',
      title: '台阶',
      description: '她先开了口，问你要不要吃楼下那家馄饨。你说好。两个人一起下楼，楼道里的声控灯一层一层亮起来，谁都没有提那三天。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '说一句「对不起」',
          effects: { mood: 10, eq: 5, will: 2 },
          result: '她低头吹了吹汤，说「早说啊」，眼睛有点红。',
          onChoose: function () { addLove(9); }
        },
        {
          label: '只说「下次早点说」',
          effects: { mood: 6, will: 3 },
          result: '你们各吃了一碗，回去的路上她把伞往你那边偏了偏。',
          onChoose: function () { addLove(4); }
        },
        {
          label: '把话说开，旧账也一并翻完',
          effects: { mood: -2, will: 4, eq: 6, intelligence: 1 },
          result: '从馄饨店说到去年春节，说到最后两个人都累了，但都舒服了。',
          onChoose: function () { addLove(2); }
        }
      ]
    }
,

    /* ================================================================
       v3.17 · 自由恋爱主线（20 条）
       ---------------------------------------------------------------
       与 LV_*（婚后线）分工：本线全权负责「相识 → 约会 → 热恋 → 婚前 → 结婚/分手」。
       LV_HOUSE_ARGUE / LV_WED_DAY 已删除（避免买两次房、办两场婚礼），
       LV_MEET_PARENT_B / LV_COHABIT_B 的下一跳改为本线的 E_LOVE_HOUSE。
       状态口径：一律用 loveState（single / dating / married），不新增判定键。
       收口：startDating() 开始交往，marryTo() 结婚，breakUp() 分手 —— 三个唯一入口。
       ================================================================ */

    /* ---- 第一阶段：命运的相遇（5 选 1，onceEver，单身且成年） ---- */
    {
      id: 'E_LOVE_MEET_WORK',
      title: '职场邂逅',
      description: '公司来了新人，工位正好在你旁边。TA 转过头问你打印机怎么用，你忽然忘了自己刚才在做什么。',
      weight: 7,
      requires: { onceEver: true, loveState: 'single', single: true, minAge: 22, maxAge: 45, job: 'not_null' },
      options: [
        {
          label: '主动带 TA 熟悉一圈',
          effects: { eq: 5, cha: 2, mood: 5 },
          result: '茶水间、会议室、报销流程，你讲了一个下午，下班时 TA 说「明天见」。',
          nextEventId: 'E_LOVE_DATE_1'
        },
        {
          label: '保持高冷，各做各的',
          effects: { will: 2, mood: -2 },
          result: '你们做了一个月的邻居，只说过「借过」和「好的」。'
        }
      ]
    },
    {
      id: 'E_LOVE_MEET_PARTY',
      title: '朋友组局',
      description: '周末被拉去玩剧本杀。昏暗的灯下你和一个陌生人拼车，搜证的时候配合得像排练过。',
      weight: 7,
      requires: { onceEver: true, loveState: 'single', single: true, minAge: 22, maxAge: 40 },
      options: [
        {
          label: '散场时加个微信',
          effects: { cha: 5, mood: 8 },
          result: 'TA 的备注写的是你游戏里的角色名，你笑了半天。',
          nextEventId: 'E_LOVE_DATE_1'
        },
        {
          label: '算了，只是过客',
          effects: { mood: 1 },
          result: '你在楼下等车，回头看了一眼，那桌人已经散了。'
        }
      ]
    },
    {
      id: 'E_LOVE_MEET_COFFEE',
      title: '咖啡店偶遇',
      description: '你在角落看书，一个人转身时把整杯美式泼在了你外套上。对方慌得连道歉都说不利索。',
      weight: 7,
      requires: { onceEver: true, loveState: 'single', single: true, minAge: 22, maxAge: 45 },
      options: [
        {
          label: '笑着说没关系，请 TA 喝一杯',
          effects: { money: -30, mood: 10, eq: 2 },
          result: '两杯拿铁端上来，你们从「这外套还能不能洗」聊到打烊。',
          nextEventId: 'E_LOVE_DATE_1'
        },
        {
          label: '暴怒索赔',
          effects: { money: 100, mood: -6, cha: -2 },
          result: 'TA 转了钱就再没抬头，店员看你的眼神有点复杂。'
        }
      ]
    },
    {
      id: 'E_LOVE_MEET_APP',
      title: '右滑',
      description: '交友软件推来一个人，照片拍得一般，简介却写得认真：「周末通常在家做饭，会做得比较慢。」',
      weight: 6,
      requires: { onceEver: true, loveState: 'single', single: true, minAge: 22, maxAge: 40, cha: { min: 20 } },
      options: [
        {
          label: '认真聊一周，再约见面',
          effects: { eq: 4, money: -100, mood: 6 },
          result: '第七天你们约在一家小馆子，发现照片确实比本人差。',
          nextEventId: 'E_LOVE_DATE_1'
        },
        {
          label: '当晚就约出来喝酒',
          effects: { luck: 3, mood: -4, stamina: -3 },
          result: '酒喝到一半你才发现，对方只是想找个人听 TA 说完前任。',
          nextEventId: 'E_LOVE_DATE_1'
        },
        {
          label: '删掉软件，还是算了',
          effects: { mood: 2 },
          result: '卸载的那一下很轻松，第二天又装回来了，这是后话。'
        }
      ]
    },
    {
      id: 'E_LOVE_MEET_EX',
      title: '久别重逢',
      description: '地铁口有人喊了你的名字。你回头，看见一个很久没联系、却一眼就认出来的人。',
      weight: 5,
      requires: { onceEver: true, loveState: 'single', single: true, minAge: 24, maxAge: 45 },
      options: [
        {
          label: '一起吃个饭，聊聊这些年',
          effects: { money: -200, mood: 6, eq: 3 },
          result: '饭吃到最后，你们谁都没提当年那件事，但都笑得很轻。',
          nextEventId: 'E_LOVE_DATE_1'
        },
        {
          label: '装作没认出，低头走过去',
          effects: { will: 2, mood: -3 },
          result: '回家路上你翻了很久的通讯录，最后什么也没点。'
        }
      ]
    },

    /* ---- 第二阶段：暧昧试探（链式，成功后 startDating 并断链） ---- */
    {
      id: 'E_LOVE_DATE_1',
      title: '第一次约会',
      description: '在微信上聊了半个月，终于约出来吃饭。菜单递过来的时候，两个人都在算该点几个菜。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '精心打扮，提前到，主动买单',
          effects: { money: -300, cha: 10, mood: 8 },
          result: '你把外套熨过，提前二十分钟到，菜单翻了四遍。TA 进门的瞬间你装作刚看到。',
          nextEventId: 'E_LOVE_DATE_2'
        },
        {
          label: '随意穿着，AA 制',
          effects: { mood: 2, eq: -2 },
          result: '吃完各自扫码付了自己的那份，出门时气氛像同事聚餐。',
          nextEventId: 'E_LOVE_DATE_2'
        }
      ]
    },
    {
      id: 'E_LOVE_DATE_2',
      title: '深夜散步',
      description: '吃完饭，TA 说「江边挺近的，走一段？」风把路灯的光拉得很长，你们的手在中间晃了很久。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '鼓起勇气，牵 TA 的手',
          requires: { cha: { min: 35 }, eq: { min: 35 } },
          effects: { mood: 14, cha: 3 },
          result: 'TA 的手先僵了一下，然后回握住了。你们谁都没说话，走完了整段江堤。',
          onChoose: function () { startDating(); }
        },
        {
          label: '怂了，说「风大，我们回去吧」',
          effects: { mood: -8, will: 2 },
          result: '回去的路上你们隔了半米，微信第二天回得也慢了些。'
        }
      ]
    },

    /* ---- 第三阶段：热恋日常（loveState: 'dating'，自然按月推进） ---- */
    {
      id: 'E_LOVE_GIFT',
      title: '情人节礼物',
      description: '第一个情人节。花店的玫瑰涨了三倍，你站在橱窗前，看见自己的脸映在玻璃上。',
      weight: 7,
      requires: { loveState: 'dating', monthIn: [2], minAge: 22 },
      options: [
        {
          label: '花两千块买礼物',
          requires: { money: { min: 2000 } },
          effects: { money: -2000, mood: 20 },
          result: 'TA 拆开盒子的时候眼睛亮了一下，你决定这个瞬间值两千。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 12));
            addLog('event', '【恋爱】好感 +12（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '亲手做个小手工',
          effects: { eq: 5, mood: 10 },
          result: '你做了三个晚上，成品有点歪，TA 摆在床头一直没换。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 8));
            addLog('event', '【恋爱】好感 +8（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '忘了这天',
          effects: { mood: -20 },
          result: 'TA 那晚发了一条朋友圈，只有一张图，没有任何文字。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 18));
            addLog('event', '【恋爱】好感 −18（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'E_LOVE_BREAKUP'
        }
      ]
    },
    {
      id: 'E_LOVE_COLD',
      title: '冷场',
      description: '聊天框停在「嗯」上已经三天。不是吵架，只是两个人都忙到没有力气讲一件完整的事。',
      weight: 6,
      requires: { loveState: 'dating', datingMonths: 3, minAge: 22 },
      options: [
        {
          label: '请一天假，去 TA 公司楼下等',
          effects: { money: -500, stamina: -3, mood: 8 },
          result: 'TA 出来看见你，愣了一下，然后走过来踢了你一脚。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 9));
            addLog('event', '【恋爱】好感 +9（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '各忙各的，等忙完再说',
          effects: { mood: -6 },
          result: '「忙完」这两个字，后来被拖成了一个不确定的期限。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 12));
            addLog('event', '【恋爱】好感 −12（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '发一条很长的消息',
          effects: { eq: 3, mood: -2 },
          result: '写了八百字，删到两百字，TA 回了三行，你反复看了很多遍。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 4));
            addLog('event', '【恋爱】好感 +4（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'E_LOVE_MONEY',
      title: '谁请客',
      description: '这个月第四次吃饭。收银台的扫码牌转到你面前，TA 的手正放在包上没动。',
      weight: 6,
      requires: { loveState: 'dating', datingMonths: 2, minAge: 22 },
      options: [
        {
          label: '每次都我来',
          requires: { money: { min: 1500 } },
          effects: { money: -1500, mood: 4, cha: 2 },
          result: '你扫了码，TA 说「下次我来」，下次还是你扫。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 10));
            addLog('event', '【恋爱】好感 +10（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '提议 AA，还记了个账',
          effects: { eq: 4, mood: 2 },
          result: '表格列得很清楚，月底对账的时候，气氛也像对账。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 2));
            addLog('event', '【恋爱】好感 −2（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '随口说「下次你请」',
          effects: { mood: 3 },
          result: 'TA 笑了笑说好，那顿饭之后你们隔了十一天才再见。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 8));
            addLog('event', '【恋爱】好感 −8（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'E_LOVE_SICK_OTHER',
      title: 'TA 生病了',
      description: '凌晨两点 TA 发来一句话：「烧到三十八度七，家里没药。」后面跟着一个很小的表情。',
      weight: 6,
      requires: { loveState: 'dating', minAge: 22 },
      options: [
        {
          label: '请假守一天',
          effects: { money: -800, stamina: -4, mood: 12 },
          result: '你买了药、煮了粥，坐在床边看 TA 睡了一整天。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 14));
            addLog('event', '【恋爱】好感 +14（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '点好外卖，再转一笔钱',
          effects: { money: -300, eq: 2, mood: 4 },
          result: 'TA 回了一句「谢谢你」，后面没有表情。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 4));
            addLog('event', '【恋爱】好感 +4（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '回一句「多喝热水」',
          effects: { eq: -2, mood: -4 },
          result: '那条消息已读，没有回音。三天后 TA 说「那天挺难的」。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 12));
            addLog('event', '【恋爱】好感 −12（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'E_LOVE_QUARREL',
      title: '手机里的秘密',
      description: 'TA 去洗手间，手机在桌上亮了一下。屏幕上跳出一行字：「昨晚谢谢你，早点休息。」发信人没有备注。',
      weight: 5,
      requires: { loveState: 'dating', datingMonths: 4, minAge: 22 },
      options: [
        {
          label: '等 TA 回来，直接问',
          effects: { mood: -20, eq: -2 },
          result: 'TA 说是一个同事，你问了第三遍，TA 就不说话了。那晚你们各自睡在床的两边。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 15));
            addLog('event', '【恋爱】好感 −15（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '先信 TA，自己偷偷查',
          effects: { will: 2, mood: -6 },
          result: '你记下了那个号码，接下来的两周，你变成了一个自己也不认识的人。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 3));
            addLog('event', '【恋爱】好感 −3（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'E_LOVE_INVEST_A'
        }
      ]
    },

    /* ---- 第四阶段：现实的毒打（婚前危机） ---- */
    {
      id: 'E_LOVE_HOUSE',
      title: '买房的分歧',
      description: '谈到结婚，对方家里把话说得很明白：「没有房子，别的都不用谈。」中介的报价单在桌上摊着，你们都没动。',
      weight: 7,
      requires: { loveState: 'dating', datingMonths: 6, minAge: 24, maxAge: 45 },
      options: [
        {
          label: '掏空积蓄，付掉首付',
          requires: { money: { min: 300000 } },
          effects: { money: -300000, mood: -10, will: 4 },
          result: '签完字你在售楼处门口站了很久，风把合同吹得哗啦响。',
          nextEventId: 'E_LOVE_BETROTHAL'
        },
        {
          label: '让父母先垫八万，剩下的慢慢还',
          requires: { money: { min: 80000 } },
          effects: { money: -80000, mood: -12, will: -2 },
          result: '你妈转账时只说了句「别委屈自己」。这句话后来每次过年都会被提起。',
          nextEventId: 'E_LOVE_BETROTHAL'
        },
        {
          label: '大吵一架，各回各家',
          effects: { mood: -30 },
          result: '你把「那就算了吧」说出了口。楼道里的声控灯灭了，谁也没有再喊一声。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 25));
            addLog('event', '【恋爱】好感 −25（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'E_LOVE_BREAKUP'
        }
      ]
    },
    {
      id: 'E_LOVE_BETROTHAL',
      title: '彩礼与嫁妆',
      description: '两家人第一次坐到一起，桌上摆着茶和一张写着数字的纸。谁都没有先动那杯茶。',
      weight: 6,
      requires: { loveState: 'dating', datingMonths: 8, minAge: 24 },
      options: [
        {
          label: '自己掏钱补齐',
          requires: { money: { min: 30000 } },
          effects: { money: -30000, mood: -6 },
          result: '三方都体面，只有你的账户不体面。',
          nextEventId: 'E_LOVE_MARRY'
        },
        {
          label: '让父母去谈',
          effects: { mood: -8 },
          result: '长辈们关起门谈了四个小时，你在客厅把一部电影看了两遍。',
          onChoose: function () {
            // 随机结果：谈成 / 谈崩，都只影响数值与日志，链路统一走向婚礼（谈崩仍可硬着头皮结）
            if (rnd(100) < 55) {
              state.money += 10000;
              addLog('event', '【彩礼】双方各让一步，家里还多给了 10000 撑场面（心情 +4）。');
              state.mood = Math.min(moodMaxOf(), state.mood + 4);
            } else {
              state.money -= 10000;
              addLog('event', '【彩礼】谈崩了，最后是你自己又添了 10000（心情 −12）。');
              state.mood = Math.max(0, state.mood - 12);
            }
            clampStats();
          },
          nextEventId: 'E_LOVE_MARRY'
        },
        {
          label: '谈不拢就算了',
          effects: { mood: -15 },
          result: '散场时两家人客客气气地握手，谁都知道这婚大概不会有了。',
          nextEventId: 'E_LOVE_BREAKUP'
        }
      ]
    },
    {
      id: 'E_LOVE_PARENT_AGAINST',
      title: '门当户对',
      description: 'TA 的妈妈把你从头到脚看了一遍，问的第一句是「你父母是做什么的」。饭还没上齐，你就知道这顿要吃到几点。',
      weight: 6,
      requires: { loveState: 'dating', datingMonths: 6, minAge: 24 },
      options: [
        {
          label: '用行动证明自己',
          effects: { eq: 5, will: 3, mood: -8 },
          result: '接下来的半年，你把自己活成了一份简历。TA 说「不用这样的」，你没有停。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 6));
            addLog('event', '【恋爱】好感 +6（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '让 TA 去说服家里',
          effects: { mood: -12 },
          result: 'TA 回去吵了三次，第三次之后，TA 开始跟你说「再给我一点时间」。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 10));
            addLog('event', '【恋爱】好感 −10（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '这段感情本来就不该开始',
          effects: { mood: -18, will: 2 },
          result: '你说得很难听，是故意的。TA 站起来的时候，椅子在地上刮了一声。',
          nextEventId: 'E_LOVE_BREAKUP'
        }
      ]
    },

    /* ---- 第五阶段：大结局 ---- */
    {
      id: 'E_LOVE_MARRY',
      title: '修成正果',
      description: '民政局门口排着队，前面那对手一直在自拍。轮到你们时，工作人员抬头问：「都想好了？」',
      weight: 8,
      requires: { loveState: 'dating', datingMonths: 6, single: true, minAge: 22 },
      options: [
        {
          label: '办一场体面的婚礼',
          requires: { money: { min: 40000 } },
          effects: { money: -40000, mood: 50, intelligence: 5, stamina: 5, cha: 5, will: 5, eq: 5 },
          result: '二十桌，倒香槟的时候你妈在台上哭了。你后来才知道那是高兴。',
          onChoose: function () { marryTo('风光'); }
        },
        {
          label: '旅行结婚',
          requires: { money: { min: 15000 } },
          effects: { money: -15000, mood: 40, intelligence: 5, stamina: 5, cha: 5, will: 5, eq: 5 },
          result: '两个人在海边拍了几十张照片，只有一张是两个人都在画面里的。',
          onChoose: function () { marryTo('旅行'); }
        },
        {
          label: '先领证，酒席以后再说',
          effects: { mood: 20, intelligence: 3, stamina: 3, cha: 3, will: 3, eq: 3 },
          result: '九块钱，两个红本，出门时天正好晴了。酒席这件事，后来一直「以后再说」。',
          onChoose: function () { marryTo('简办'); }
        }
      ]
    },
    {
      id: 'E_LOVE_BREAKUP',
      title: '和平分手',
      description: '最后一次见面在一家常去的店。你们把该还的东西都还了，桌上剩下两杯没喝完的柠檬水。',
      weight: 4,
      requires: { loveState: 'dating', minAge: 22 },
      options: [
        {
          label: '祝福彼此，好聚好散',
          effects: { mood: -30 },
          result: '出门时 TA 说「你要好好的」，你说「你也是」，然后各走一边。',
          onChoose: function () { breakUp(); }
        },
        {
          label: '纠缠不清',
          effects: { stamina: -10, money: -5000 },
          result: '又拖了半年。第二次说分手的时候，你们都没有第一次那么难过了。'
        }
      ]
    },

    /* ---- 补充分支：调查结果 A / B、久违的消息 ---- */
    {
      id: 'E_LOVE_INVEST_A',
      title: '查到的第一条线索',
      description: '那个号码属于一家公司，朋友圈是空的。你翻了两个小时，只翻到一张去年的团建合照。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '只当是误会，删掉截图',
          effects: { mood: 5, eq: 2 },
          result: '你把截图删了，也把那个搜索记录删了，像是删掉自己做过的一件不体面的事。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) + 6));
            addLog('event', '【恋爱】好感 +6（当前 ' + state.datingLove + ' / 100）');
          }
        },
        {
          label: '继续查下去',
          effects: { will: 2, mood: -4 },
          result: '你找到了更多，也找到了自己不想找的那部分。',
          nextEventId: 'E_LOVE_INVEST_B'
        }
      ]
    },
    {
      id: 'E_LOVE_INVEST_B',
      title: '真相',
      description: '答案很简单，也很俗：他们确实见过几次，也确实没发生什么，只是有些话，TA 更愿意对别人说。',
      weight: 1,
      chainOnly: true,
      options: [
        {
          label: '当场说分手',
          effects: { mood: -25 },
          result: '你没有吵，把手机放回桌上，说「我们到这儿吧」。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 20));
            addLog('event', '【恋爱】好感 −20（当前 ' + state.datingLove + ' / 100）');
          },
          nextEventId: 'E_LOVE_BREAKUP'
        },
        {
          label: '听 TA 解释，选择相信',
          effects: { mood: -12, eq: 3 },
          result: '你信了。信这件事本身，比真相更消耗人。',
          onChoose: function () {
            state.datingLove = Math.max(0, Math.min(100, (state.datingLove || 0) - 10));
            addLog('event', '【恋爱】好感 −10（当前 ' + state.datingLove + ' / 100）');
          }
        }
      ]
    },
    {
      id: 'E_LOVE_REUNION',
      title: '久违的消息',
      description: '一个很久没说话的头像忽然亮了一下：「最近还好吗。」你盯着那五个字，看了很久。',
      weight: 3,
      requires: { onceEver: true, loveState: 'single', single: true, minAge: 24, maxAge: 45 },
      options: [
        {
          label: '去见一面',
          effects: { money: -300, mood: 10, eq: 2 },
          result: '见面的第一句话是「你瘦了」，第二句是「你也是」，然后就没什么可说的了。',
          onChoose: function () { startDating(); }
        },
        {
          label: '礼貌回一句，就到这里',
          effects: { mood: 2 },
          result: '你打了「都挺好的，你也保重」，删掉了后面那半句。'
        }
      ]
    }
,

    /* ================================================================
       v3.18 · 暮年阶段事件库（12 条）
       ---------------------------------------------------------------
       全部 requires 带 minAge: 60；题材：广场舞 / 黄昏恋 / 保健讲座诈骗（2 段链式）
       / 带孙辈 / 体检大关 / 回顾一生（按身家给心情）/ 老友 / 养老金 / 老房子 / 遗嘱。
       只读写既有字段与既有规则（money / stamina / mood / onceEver / hasChild…），
       不新增判定键、不改引擎。
       ================================================================ */
    {
      id: 'E_OLD_DANCE',
      title: '广场舞',
      description: '傍晚的小广场，音响里放着一段很旧的曲子。前排的大姐回头看了你一眼，把扇子往旁边挪了挪，腾出半个位置。',
      weight: 7,
      requires: { minAge: 60 },
      options: [
        {
          label: '站到最后一排，跟着跳',
          effects: { mood: 12, stamina: 3, cha: 2 },
          result: '你踩错了三次，没人笑你。散场时有人问「明天还来吗」。',
        },
        {
          label: '在旁边看一会儿就走',
          effects: { mood: 3 },
          result: '你在长椅上坐了二十分钟，看了三支舞，然后回家热了碗剩饭。'
        },
        {
          label: '嫌吵，绕路回家',
          effects: { mood: -4, will: 1 },
          result: '你绕过整条街，路灯把你的影子拉得比平时长。'
        }
      ]
    },
    {
      id: 'E_OLD_DUSK_LOVE',
      title: '黄昏恋',
      description: '舞队里那个人，老伴走了三年。这天散场，TA 站在路灯下等你，说「顺路，一起走一段吧」。',
      weight: 6,
      requires: { minAge: 60, onceEver: true },
      options: [
        {
          label: '并肩走完那条街',
          effects: { mood: 20, cha: 2, luck: 3 },
          result: '你们聊了一路的天气和菜价，谁也没有提「以后」，但都走得很慢。',
          onChoose: function () {
            state.mood = Math.min(moodMaxOf(), state.mood + 4);
            clampStats();
            addLog('event', '【黄昏】这一段路，你走了四十分钟，比平时多一倍。');
          }
        },
        {
          label: '说「家里还有人等我」',
          effects: { mood: 4, will: 2 },
          result: 'TA 点点头，说「那快回去吧」，然后自己往另一边走了。'
        },
        {
          label: '从此再也不去跳舞',
          effects: { mood: -10 },
          result: '音响还在响，你换了一条路，一走就是两年。'
        }
      ]
    },
    {
      id: 'E_OLD_LECTURE',
      title: '保健讲座',
      description: '活动室里坐满了人，门口发鸡蛋和面条。台上那位「专家」穿着白大褂，说这个东西能调理三高、睡得香、腿脚有力。',
      weight: 7,
      requires: { minAge: 60 },
      options: [
        {
          label: '听完就订一疗程',
          effects: { money: -8000, mood: -3 },
          result: '你把现金数了三遍。出门时有人替你拎着那两盒东西，一直送到公交站。',
          nextEventId: 'E_OLD_FAKE_MED'
        },
        {
          label: '只领鸡蛋，一分不掏',
          effects: { mood: 5, will: 3 },
          result: '你把鸡蛋放进布袋，任台上怎么喊「今天最后一天」，都没有回头。'
        },
        {
          label: '举手问一句：批号是多少',
          effects: { cha: 2, eq: 2, mood: -2 },
          result: '「专家」愣了一下，说「这个不重要」。散场时有人悄悄跟你道谢。'
        }
      ]
    },
    {
      id: 'E_OLD_FAKE_MED',
      title: '天价假药',
      description: '一个月过去，那盒「进口软胶囊」还剩大半。你说的腿疼没见好，倒是每次吃完都觉得胃里发胀。',
      weight: 1,
      chainOnly: true,
      requires: { minAge: 60 },
      options: [
        {
          label: '再加两万的「加强疗程」',
          effects: { money: -20000, mood: -12, stamina: -2 },
          result: '电话那头叫你「叔叔」，叫得比你亲儿子还勤。第二个月，那个号码停机了。'
        },
        {
          label: '停手，去正规医院看',
          effects: { money: -2000, stamina: 4, mood: 2, intelligence: 2 },
          result: '医生看了盒子背面，说「这个成分表，说白了就是淀粉」。你笑了一下，笑得很不是滋味。'
        },
        {
          label: '拿着盒子去社区投诉',
          effects: { money: 4000, mood: 6, will: 3 },
          result: '退了四千，剩下的钱没人认。你在登记表上签了名，字写得比平时用力。'
        }
      ]
    },
    {
      id: 'E_OLD_GRANDKID',
      title: '带孙子',
      description: '儿女把孩子的书包往沙发上一放，说「就一个暑假」。孩子已经在翻你的抽屉了。',
      weight: 6,
      requires: { minAge: 60, hasChild: true },
      options: [
        {
          label: '接过来，带一整个暑假',
          effects: { stamina: -1, mood: 14, eq: 3 },
          result: '两个月里你学会了三种动画片的主题曲，也被老师叫去谈过一次话。',
          onChoose: function () {
            addLog('event', '【孙辈】家里多了一双小拖鞋，门口多了一辆自行车。');
          }
        },
        {
          label: '只周末带两天',
          effects: { stamina: -2, mood: 8 },
          result: '每个周日晚上送孩子回去，你都要在楼下站一会儿才上楼。'
        },
        {
          label: '出钱请个保姆，自己歇着',
          effects: { money: -12000, mood: -4 },
          result: '钱转过去，事办得妥妥帖帖。孩子下次来时，先喊的是阿姨。'
        }
      ]
    },
    {
      id: 'E_OLD_GRANDKID_TIRED',
      title: '腰不行了',
      description: '抱着孩子上了一次三楼，你在楼道里扶着栏杆歇了两次。晚上躺下，腰上像是塞了块石头。',
      weight: 5,
      requires: { minAge: 60, stamina: { max: 45 } },
      options: [
        {
          label: '去医院拍个片子',
          effects: { money: -1500, stamina: 3, mood: 2 },
          result: '医生说退行性改变，这个年纪都这样。你听着，反而松了口气。'
        },
        {
          label: '贴膏药，忍着',
          effects: { stamina: -2, mood: -5 },
          result: '膏药的味道在家里散了两天。孩子说「爷爷身上有味道」，你说那明天不抱了。'
        },
        {
          label: '跟儿女说：我带不动了',
          effects: { eq: 3, mood: -6, will: 2 },
          result: '话说出口比想象中难。儿女沉默了一会儿，说「那我们再想办法」。'
        }
      ]
    },
    {
      id: 'E_OLD_CHECKUP',
      title: '体检报告·大关',
      description: '一页纸，几个指标后面跟着小小的向上箭头。医生没有多说，只写了一句「建议进一步检查」。',
      weight: 8,
      requires: { minAge: 60 },
      options: [
        {
          label: '全套检查一次做完',
          effects: { money: -4000, mood: 4, intelligence: 1 },
          result: '抽了五管血，等结果的那三天，你把家里的药盒都整理了一遍。',
          onChoose: function () {
            if (rnd(100) < 62) {
              state.mood = Math.min(moodMaxOf(), state.mood + 10);
              addLog('event', '【体检】结果出来：虚惊一场，只是年纪到了（心情 +10）。');
            } else {
              state.stamina = Math.max(0, state.stamina - 6);
              state.mood = Math.max(0, state.mood - 14);
              addLog('danger', '【体检】查出点东西，需要长期吃药复查（体质 −6，心情 −14）。');
            }
            clampStats();
          }
        },
        {
          label: '只查最要紧的两项',
          effects: { money: -1200, mood: 2 },
          result: '你挑了最便宜的两项，剩下的打算「以后再说」。',
          onChoose: function () {
            if (rnd(100) < 55) {
              state.mood = Math.min(moodMaxOf(), state.mood + 4);
              addLog('event', '【体检】两项都还好，你把报告折起来放进抽屉。');
            } else {
              state.stamina = Math.max(0, state.stamina - 3);
              state.mood = Math.max(0, state.mood - 8);
              addLog('danger', '【体检】其中一项不太好，医生让你三个月后再来。');
            }
            clampStats();
          }
        },
        {
          label: '塞进抽屉，明年再说',
          effects: { mood: -6, stamina: -1, luck: -2 },
          result: '抽屉里已经有前年的、大前年的。它们叠在一起，比今年这本厚一点。'
        }
      ]
    },
    {
      id: 'E_OLD_REVIEW',
      title: '回顾一生',
      description: '整理柜子翻出一本旧相册。第一页是你十六岁那年，站在学校门口，手里拎着一个很旧的包。',
      weight: 6,
      requires: { minAge: 60, onceEver: true },
      options: [
        {
          label: '一页一页翻完',
          effects: { mood: 0 },
          result: '翻到最后一页时，天已经黑了，你没有开灯。',
          onChoose: function () {
            var m = state.money || 0, add, txt;
            if (m >= 1000000) { add = 20; txt = '这一生，账面上是赢的。'; }
            else if (m >= 300000) { add = 14; txt = '不算大富，但也没缺过什么。'; }
            else if (m >= 50000) { add = 8; txt = '攒下的钱不多，够用。'; }
            else { add = 3; txt = '钱一直很紧，可照片里的人都在笑。'; }
            state.mood = Math.min(moodMaxOf(), state.mood + add);
            clampStats();
            addLog('event', '【回顾】' + txt + '（心情 +' + add + '）');
          }
        },
        {
          label: '算一算这辈子攒下多少',
          effects: { mood: 0, intelligence: 2 },
          result: '你拿笔在报纸边上列了一串数字，最后把纸揉了。',
          onChoose: function () {
            var m = state.money || 0, add;
            if (m >= 1000000) { add = 16; }
            else if (m >= 300000) { add = 11; }
            else if (m >= 50000) { add = 6; }
            else { add = 0; }
            state.mood = Math.min(moodMaxOf(), state.mood + add);
            clampStats();
            addLog('event', '【回顾】存款 ' + Math.round(m) + ' 元（心情 +' + add + '）');
          }
        },
        {
          label: '合上，出门走走',
          effects: { mood: 6, stamina: 3 },
          result: '楼下的桂花开了，你站了一会儿，才想起来自己已经很久没有闻过这个味道。'
        }
      ]
    },
    {
      id: 'E_OLD_FRIEND_GONE',
      title: '老友走了',
      description: '电话是早上七点打来的。老同事的儿子在那边说得很客气，说「我爸最后还念着你」。',
      weight: 5,
      requires: { minAge: 60 },
      options: [
        {
          label: '去送最后一程',
          effects: { money: -500, mood: -8, eq: 3 },
          result: '鞠躬的时候你看见遗像上他还在笑，是四十岁那年的照片。'
        },
        {
          label: '在楼下坐一下午',
          effects: { mood: -10, will: 2 },
          result: '你没上去，就在花坛边坐着。有人来问路，你说不知道，声音有点哑。'
        },
        {
          label: '给还活着的老朋友打个电话',
          effects: { mood: 6, eq: 2 },
          result: '电话那头第一句是「你怎么想起给我打电话了」，你说「没事，就是问问」。'
        }
      ]
    },
    {
      id: 'E_OLD_PENSION',
      title: '养老金的窗口',
      description: '每月十五号，银行门口的队伍能排到街角。保安一遍遍喊「可以用手机银行的往这边走」。',
      weight: 4,
      requires: { minAge: 60 },
      options: [
        {
          label: '排一小时，取出来存定期',
          effects: { mood: 4, intelligence: 1 },
          result: '存单拿到手，你把它和身份证一起放进贴身的口袋。'
        },
        {
          label: '取出来给孙辈买辆自行车',
          effects: { money: -800, mood: 8 },
          result: '孩子骑着车在小区里绕圈，你在楼下站到天黑。'
        },
        {
          label: '学会用手机银行，不再排队',
          effects: { eq: 3, intelligence: 2, mood: 2 },
          result: '你让柜员教了三遍，第四遍自己点成了，心里有点得意。'
        }
      ]
    },
    {
      id: 'E_OLD_HOUSE_LEAK',
      title: '老房子漏雨',
      description: '连着下了三天雨，卧室天花板洇出一片黄，水一滴一滴落在搪瓷盆里，声音很规律。',
      weight: 5,
      requires: { minAge: 60 },
      options: [
        {
          label: '找人把屋顶重铺一遍',
          effects: { money: -6000, mood: 5, will: 2 },
          result: '师傅说这房子再撑二十年没问题。你算了算，二十年后自己八十几。'
        },
        {
          label: '拿盆接着，等雨停',
          effects: { stamina: -1, mood: -6 },
          result: '雨停了，盆还在原地。后来它就一直放在那儿，谁也没挪。'
        },
        {
          label: '搬到儿女家去住',
          effects: { mood: -3, eq: 2, money: 2000 },
          result: '房子空着，钥匙你带了两个月才交出去。'
        }
      ]
    },
    {
      id: 'E_OLD_WILL',
      title: '立遗嘱',
      description: '社区在宣传免费法律咨询。你坐在桌前，工作人员问：「房子、存款，打算怎么分？」',
      weight: 4,
      requires: { minAge: 60, money: { min: 100000 }, onceEver: true },
      options: [
        {
          label: '找律师，一条条写清楚',
          effects: { money: -3000, mood: 8, will: 3, eq: 2 },
          result: '签完字，你把那份东西锁进柜子最里面，忽然觉得轻松了。'
        },
        {
          label: '自己手写一份，压在抽屉底',
          effects: { mood: 2, intelligence: 1 },
          result: '写完改了三遍，最后一句是「你们别吵」。'
        },
        {
          label: '不写了，到时候再说',
          effects: { mood: -6, luck: -2 },
          result: '你把宣传单折起来垫了桌脚，那张桌子从此不晃了。'
        }
      ]
    }
,

    /* ================================================================
       v3.19 · 职业专属高光与至暗时刻（16 条 + 5 条链式后续）
       ---------------------------------------------------------------
       四类职业：大厂程序员 / 人民教师 / 外卖骑手 / 网红主播。
       全部事件 requires 带 job + minAge；16 条主事件进常规池，
       5 条 chainOnly 只由 nextEventId 唤出（大厂 2、教师 1、骑手 1、主播 1）。
       只读写既有字段与既有引擎函数（doLayoff / hospitalize / endLife / clampStats）。
       ================================================================ */

    /* ---------------- 一、大厂程序员 ---------------- */
    {
      id: 'E_JOB_BIGCO_P0',
      title: '半夜的 P0',
      description: '凌晨一点四十，告警电话把你从床上掀起来。核心接口全线超时，老板在群里连发九条消息，每条都 @你。',
      weight: 7,
      requires: { job: '大厂程序员', minAge: 22 },
      options: [
        {
          label: '通宵定位，天亮前把窟窿堵上',
          effects: { intelligence: 5, stamina: -10, money: 2000 },
          result: '四点半恢复。你在工位上眯了两小时，九点照常开会，会上没人提你的名字。',
          onChoose: function () {
            addLog('event', '【P0】值班补贴 2000 已到账（凌晨四点的打车费另报）。');
          }
        },
        {
          label: '甩锅给测试，先在群里把话说清楚',
          effects: { eq: -5, mood: -10 },
          result: '你在群里列了三条时间线，字字都对。第二天测试组没人跟你说话。'
        }
      ]
    },
    {
      id: 'E_JOB_BIGCO_NODULE',
      title: '体检报告的结节',
      description: '公司体检加了两项。报告上甲状腺那栏写着「结节，建议复查」，而镜子里那撮头发已经盖不住头顶。',
      weight: 6,
      requires: { job: '大厂程序员', minAge: 22 },
      options: [
        {
          label: '花钱做手术和理疗',
          effects: { money: -20000, stamina: 10 },
          result: '微创，三天出院。病理是良性。你把报告拍照发给了家里，说「没事，就是切了个包」。',
          onChoose: function () {
            state.sta = Math.min(100, state.sta + 5);
            clampStats();
            addLog('event', '【健康】手术后你请了两周假，这是三年来第一次连续休息这么久。');
          }
        },
        {
          label: '顺其自然，先买顶假发',
          effects: { money: -1000, mood: -5 },
          result: '假发很自然，同事说「你最近气色不错」。只有你知道那是三十七块钱一顶的护理液在撑着。'
        }
      ]
    },
    {
      id: 'E_JOB_BIGCO_35',
      title: '35 岁的毕业通知',
      description: 'HR 把你叫进小会议室，桌上放着一份 N+1 协议，纸角压得很平。她说「不是你的问题」。窗外是这栋楼最好的景色。',
      weight: 8,
      requires: { job: '大厂程序员', minAge: 35, onceEver: true },
      options: [
        {
          label: '拿钱走人，去大理住两个月',
          effects: { mood: 20 },
          result: '签字那天你走得很慢。第二天买了张单程票，在大理住下，第一次在早上七点自然醒。',
          onChoose: function () {
            var pack = Math.max(0, Math.round((state.salary || 0) * 1.5)) + 50000;
            state.money += pack;
            doLayoff('N+1 协议');
            state.mood = Math.min(moodMaxOf(), state.mood + 10);
            clampStats();
            addLog('event', '【离职】N+1 到手 ' + pack + ' 元（含补偿与年假折算），你正式失业了。');
          }
        },
        {
          label: '接受降薪 30%，留下来',
          effects: { mood: -20, will: 3 },
          result: '协议换成了另一份。工位从窗边挪到过道，你的名字从项目群里消失了。',
          onChoose: function () {
            var prevJob = (CAREER[state.job] || {}).prev;
            state.salary = Math.max(3000, Math.round((state.salary || 0) * 0.7));
            if (prevJob) state.job = prevJob;
            state.currentPositionYears = 0;
            markJobChange();
            addLog('danger', '【降薪】月薪降到 ' + state.salary + ' 元，职级退回「'
              + (state.job === '大厂程序员' ? '原岗（无处可退）' : state.job) + '」。');
          },
          nextEventId: 'E_JOB_BIGCO_EDGE'
        }
      ]
    },
    {
      id: 'E_JOB_BIGCO_HEART',
      title: '猝死边缘',
      description: '连续两周凌晨两点下班。这天你刚坐下，胸口像被一只手攥住，眼前一阵一阵发白，右手还搭在键盘上。',
      weight: 6,
      requires: { job: '大厂程序员', minAge: 22 },
      options: [
        {
          label: '立刻叫车去医院',
          effects: { money: -5000, stamina: 5 },
          result: '急诊做了心电图，医生说「再晚来一点就不好说」。你躺在观察室的床上，第一次觉得天花板很白。',
          nextEventId: 'E_JOB_BIGCO_STENT'
        },
        {
          label: '含两颗救心丸，先把这段敲完',
          effects: { mood: -10 },
          result: '你把药压在舌下，盯着屏幕上滚动的日志。手在抖，代码还在跑。',
          onChoose: function () {
            if (rnd(100) < 70) {
              addLog('danger', '【猝死】这口气没能缓过来。');
              endLife('health');
            } else {
              state.sta = Math.max(0, state.sta - 12);
              state.mood = Math.max(0, state.mood - 10);
              clampStats();
              addLog('danger', '【警告】你熬过了这一夜，但身体已经记账了（体质 −12）。');
            }
          }
        }
      ]
    },
    {
      id: 'E_JOB_BIGCO_EDGE',
      title: '边缘化',
      description: '留下来的第一个月，你被移出了三个项目群。新来的组长比你小六岁，安排你「把历史文档整理一下」。周报要写，会要开，活儿没有了。',
      weight: 1,
      chainOnly: true,
      requires: { job: '大厂程序员', minAge: 22 },
      options: [
        {
          label: '一边整理文档，一边偷偷面试',
          effects: { mood: -6, intelligence: 3, eq: 3 },
          result: '午休时间你在消防通道里接了三场电话面试，信号不好，但对方说「下周聊」。'
        },
        {
          label: '把冷板凳坐穿，等一个机会',
          effects: { mood: -18, will: 4 },
          result: '你每天准时到，准时走，工位很干净。第三个月，连周报都没人找你要了。'
        },
        {
          label: '主动提离职，把话说得体面',
          effects: { mood: -8, will: 3 },
          result: '你说「想换个环境」。组长点点头，说「理解」，然后签了字。',
          onChoose: function () {
            doLayoff('主动离职');
            addLog('event', '【离职】你自己走的，没有补偿，但也没有再等。');
          }
        }
      ]
    },
    {
      id: 'E_JOB_BIGCO_STENT',
      title: '一根支架',
      description: '造影做完了，医生说血管堵了七成，建议放支架。你问了价格，又问了「能不能先吃药看看」。',
      weight: 1,
      chainOnly: true,
      requires: { job: '大厂程序员', minAge: 22 },
      options: [
        {
          label: '放，钱可以再挣',
          effects: { money: -60000, stamina: 12, mood: 4 },
          result: '手术四十分钟。醒来时你第一件事是摸手机，看见 47 条未读，一条也没回。',
          onChoose: function () {
            state.sta = Math.min(100, state.sta + 8);
            clampStats();
            addLog('event', '【手术】医保报完自付 6 万。医生说以后别熬夜了，你答应了。');
          }
        },
        {
          label: '先吃药控制，回去继续上班',
          effects: { stamina: -6, mood: -8, money: -3000 },
          result: '药盒一天三次，你常常在下午那顿忘记。加班的时候，胸口还是会紧一下。'
        }
      ]
    },

    /* ---------------- 二、人民教师 ---------------- */
    {
      id: 'E_JOB_TEACHER_PARENT',
      title: '熊家长',
      description: '学生在走廊自己跑摔了，膝盖蹭破。第二天家长堵在办公室门口，说你推了孩子，要求学校给个说法。',
      weight: 7,
      requires: { job: '人民教师', minAge: 22 },
      options: [
        {
          label: '硬刚到底，调监控',
          effects: { will: 5, mood: -15 },
          result: '监控放了三遍，家长没道歉，走的时候摔了门。校长在会上说「以后注意方式方法」。'
        },
        {
          label: '赔礼道歉，息事宁人',
          effects: { money: -2000, mood: -10 },
          result: '你买了水果上门，说了七次对不起。走出小区时天已经黑了，你在路边站了一会儿。'
        }
      ]
    },
    {
      id: 'E_JOB_TEACHER_GIFT',
      title: '教师节的购物卡',
      description: '放学后，一个家长把你拉到楼梯拐角，往你手里塞了张卡，说「一点心意，孩子还得靠您多照顾」。卡面是五千。',
      weight: 6,
      requires: { job: '人民教师', minAge: 22 },
      options: [
        {
          label: '严词拒绝，把卡塞回去',
          effects: { will: 10, cha: 5 },
          result: '你说「这个我不能收」，说得很大声。第二天那孩子在班里被调到了第一排——不是你的意思。'
        },
        {
          label: '收下，反正没人知道',
          effects: { money: 5000, will: -10 },
          result: '卡进了抽屉最里层。之后再看见那个家长，你总是先笑。'
        }
      ]
    },
    {
      id: 'E_JOB_TEACHER_TITLE',
      title: '职称评定',
      description: '高级职称的名额只有一个，材料要装订成册。你连着一个月熬到十二点，教案摞起来比教案本还高。',
      weight: 6,
      requires: { job: '人民教师', minAge: 22, onceEver: true },
      options: [
        {
          label: '找人打点一下关系',
          effects: { money: -15000, mood: -4 },
          result: '饭局上你敬了七杯酒，说了一晚上「以后还要多请教」。',
          onChoose: function () {
            state.salary = (state.salary || 0) + 2000;
            addLog('event', '【职称】材料送审通过，月薪上调 2000（现行 ' + state.salary + ' 元）。');
          },
          nextEventId: 'E_JOB_TEACHER_TITLE_B'
        },
        {
          label: '凭实力硬卷，材料自己写到天亮',
          effects: { intelligence: -5, stamina: -10 },
          result: '你交上去的册子最厚。公示那天，名字不在上面。'
        }
      ]
    },
    {
      id: 'E_JOB_TEACHER_TITLE_B',
      title: '公示期',
      description: '职称名单公示七天，你的名字在第三个。第五天，教育局收到一封匿名举报信，说你「材料造假」。',
      weight: 1,
      chainOnly: true,
      requires: { job: '人民教师', minAge: 22 },
      options: [
        {
          label: '把每一页原件都翻出来对',
          effects: { will: 5, mood: -8, intelligence: 2 },
          result: '查了三天，全部对得上。举报信没有署名，事情就这么过去了，但你知道是谁。'
        },
        {
          label: '主动撤回，明年再报',
          effects: { mood: -12, money: -3000 },
          result: '撤回申请那张表，你填得比教案还工整。'
        }
      ]
    },
    {
      id: 'E_JOB_TEACHER_STUDENT',
      title: '叛逆期的课代表',
      description: '你带了三年的课代表，这周逃了两节课，作业本上是别人的字。走廊尽头，你看见 TA 和一个高年级的学生站在一起。',
      weight: 6,
      requires: { job: '人民教师', minAge: 22 },
      options: [
        {
          label: '叫家长，当着办公室批评',
          effects: { eq: -5, mood: -4 },
          result: '孩子站在办公室中间，一句话没说。第二天，课代表的职务被撤了，作业本再也没交过。'
        },
        {
          label: '放学后单独聊聊，像朋友那样',
          effects: { eq: 10, mood: 10 },
          result: '你们在操场边坐了一小时。TA 说了很多，你大多时候只是听着。'
        }
      ]
    },

    /* ---------------- 三、外卖骑手 ---------------- */
    {
      id: 'E_JOB_RIDER_RAIN',
      title: '暴雨天的超时',
      description: '雨大到看不清路。前面路口的红灯还有 90 秒，手机上的订单只剩 2 分钟，超时罚 20，差评扣 100。',
      weight: 7,
      requires: { job: '外卖骑手', minAge: 22 },
      options: [
        {
          label: '闯过去，逆行抄近道',
          effects: { stamina: -5, money: 200 },
          result: '你贴着护栏冲过去，一辆货车在身后按了很长的喇叭，雨水灌进领口。',
          nextEventId: 'E_JOB_RIDER_NEAR'
        },
        {
          label: '原地等绿灯，认罚',
          effects: { money: -100, mood: -5 },
          result: '订单超时四分钟。你在雨里给顾客打了三个电话，第三个被挂断。'
        }
      ]
    },
    {
      id: 'E_JOB_RIDER_NEAR',
      title: '擦肩',
      description: '拐弯的一瞬间，一辆右转的车贴着你过去，后视镜刮到你的手肘。你连人带车歪在路边，餐盒没洒。',
      weight: 1,
      chainOnly: true,
      requires: { job: '外卖骑手', minAge: 22 },
      options: [
        {
          label: '扶起车，先把这单送了',
          effects: { stamina: -6, mood: -8, money: 50 },
          result: '手肘渗着血，你把餐递到门口，顾客说「怎么这么慢」。'
        },
        {
          label: '坐在马路牙子上抽根烟',
          effects: { stamina: -2, mood: 4, will: 2 },
          result: '雨小了。你坐了十分钟，第一次觉得这条街这么宽。'
        },
        {
          label: '报警，走保险流程',
          effects: { money: -300, mood: -3, eq: 2 },
          result: '交警来了，做了笔录。保险赔了修车钱，误工费没有。'
        }
      ]
    },
    {
      id: 'E_JOB_RIDER_GUARD',
      title: '高档小区的保安',
      description: '保安拦在门口，说「外卖不许进」。顾客在电话里骂你，骂到你听见背景音里有人在笑。',
      weight: 6,
      requires: { job: '外卖骑手', minAge: 22 },
      options: [
        {
          label: '忍下来，隔着栏杆鞠躬道歉',
          effects: { mood: -15 },
          result: '你把餐放在岗亭外的台阶上，对着电话说了三遍对不起。单子还是被打了差评。'
        },
        {
          label: '和保安吵起来，最后动了手',
          effects: { stamina: -10, money: -500, mood: -20 },
          result: '两人被拉到物业办公室。你赔了五百块，站长来接你，一路上没说话。',
          onChoose: function () {
            addLog('danger', '【冲突】派出所做了笔录，没有拘留，但你的名字进了这个小区的黑名单。');
          }
        }
      ]
    },
    {
      id: 'E_JOB_RIDER_BATTERY',
      title: '电瓶被偷了',
      description: '下楼的时候，车还在，电瓶没了。锁挂在踏板上，被剪断的截面很新。这辆车是你分期买的，还差四期。',
      weight: 6,
      requires: { job: '外卖骑手', minAge: 22 },
      options: [
        {
          label: '报警，等消息',
          effects: { money: -3000, mood: -6 },
          result: '警察做了笔录，说「有消息通知你」。你等了三个月，接到过一个回访电话。'
        },
        {
          label: '咬牙花三千买个新的，今天还得跑',
          effects: { money: -3000, mood: -10 },
          result: '新电瓶装上，你当天跑到了晚上十一点，把这一天补回来一半。'
        }
      ]
    },
    {
      id: 'E_JOB_RIDER_WALLET',
      title: '捡到的包',
      description: '送餐路上，一个黑色手包躺在绿化带边上。拉开一条缝，里面是一沓现金，目测一万多，还有身份证和几张卡。',
      weight: 5,
      requires: { job: '外卖骑手', minAge: 22 },
      options: [
        {
          label: '交给警察',
          effects: { luck: 10, cha: 5, mood: 6 },
          result: '失主后来专门到站点送了面锦旗，站长把它挂在了墙上，还给你发了两百块奖金。',
          onChoose: function () {
            state.money += 200;
            addLog('event', '【拾金不昧】站点奖励 200 元。');
          }
        },
        {
          label: '收起来，反正没人看见',
          effects: { money: 10000, will: -20, mood: -8 },
          result: '你把包塞进外卖箱最底下，一整天心跳都很快。',
          onChoose: function () {
            if (rnd(100) < 45) {
              state.money -= 8000;
              state.mood = Math.max(0, state.mood - 20);
              clampStats();
              addLog('danger', '【警察上门】监控拍到了，钱退了，还被罚了 8000，站点把你开了。');
              doLayoff('涉嫌侵占');
            } else {
              addLog('sys', '【侥幸】这件事没有下文。只是每次路过那个路口，你都会绕开走。');
            }
          }
        }
      ]
    },

    /* ---------------- 四、网红主播 ---------------- */
    {
      id: 'E_JOB_STREAMER_TOP1',
      title: '榜一大哥的邀约',
      description: '他给你刷了十万。私信只有一句话：「周末出来吃个饭，就我们俩。」对话框上方显示「正在输入」很久。',
      weight: 7,
      requires: { job: '网红主播', minAge: 22 },
      options: [
        {
          label: '拒绝，把话说清楚',
          effects: { mood: 5, will: 4 },
          result: '他退了关注，带走了半个榜。第二天直播间人气掉了三成，你照样开播。',
          onChoose: function () {
            state.salary = Math.max(3000, Math.round((state.salary || 0) * 0.7));
            addLog('event', '【掉粉】榜一走了，月流水降到 ' + state.salary + ' 元。');
          }
        },
        {
          label: '赴约，把该拿的拿到手',
          effects: { money: 50000, mood: -20, will: -5 },
          result: '饭吃了两个小时，你几乎没动筷子。回程的车上，你把妆卸了，脸上什么表情都没有。'
        }
      ]
    },
    {
      id: 'E_JOB_STREAMER_HATE',
      title: '满屏的脏话',
      description: '开播十分钟，进来两百个没有头像的号，同一句话刷了满屏。房管的禁言名单翻了三页，还是刷。',
      weight: 6,
      requires: { job: '网红主播', minAge: 22 },
      options: [
        {
          label: '花钱请公关团队处理',
          effects: { money: -10000, mood: -3 },
          result: '第二天热搜撤了，那批号也消失了。团队说「这种情况一个月能来两次」。'
        },
        {
          label: '当场破防，和他们对骂',
          effects: { eq: -10, mood: -15 },
          result: '你骂了四十分钟，直播间被封。解封通知写着「违规行为，封禁 30 天」。',
          onChoose: function () {
            state.salary = 0;
            addLog('danger', '【封禁】直播间被封一个月，收入归零。');
          }
        }
      ]
    },
    {
      id: 'E_JOB_STREAMER_GOODS',
      title: '带货翻车',
      description: '你推的那款零食上了热搜：原料过期。评论区里全是「我买了三箱」「孩子已经吃了」。品牌方的电话打不通了。',
      weight: 6,
      requires: { job: '网红主播', minAge: 22 },
      options: [
        {
          label: '全额退款，直播里公开道歉',
          effects: { money: -50000, eq: 5, will: 3 },
          result: '你在镜头前鞠了三个躬，退款流程贴了三遍。掉了一批粉，但留下的人更铁了。',
          nextEventId: 'E_JOB_STREAMER_APOLOGY'
        },
        {
          label: '甩锅厂家，说自己也是受害者',
          effects: { cha: -8, mood: -10 },
          result: '你把合同截图发出来，字都对。评论区第一条是「那你退钱吗」，你没回。',
          onChoose: function () {
            state.salary = Math.max(3000, Math.round((state.salary || 0) * 0.8));
            addLog('danger', '【掉粉】月流水降到 ' + state.salary + ' 元，商务合作停了两周。');
          }
        }
      ]
    },
    {
      id: 'E_JOB_STREAMER_MCN',
      title: 'MCN 的陷阱',
      description: '三年前签的合同，你没细看。现在想解约，法务把违约金那一页推到你面前：500 万。',
      weight: 5,
      requires: { job: '网红主播', minAge: 22, onceEver: true },
      options: [
        {
          label: '打官司，硬解',
          effects: { money: -20000, will: 4, mood: -6 },
          result: '官司打了一年。最后判了八十万，分期。你换了城市，重新开播，粉丝从零开始。',
          onChoose: function () {
            state.salary = Math.max(3000, Math.round((state.salary || 0) * 0.6));
            addLog('event', '【解约】新账号重新起号，月流水 ' + state.salary + ' 元。');
          }
        },
        {
          label: '继续当牛做马，抽成 50%',
          effects: { mood: -20 },
          result: '排期表排到了明年。每个月结算那天，你看着被抽走的一半，什么也没说。',
          onChoose: function () {
            state.salary = Math.max(1500, Math.round((state.salary || 0) * 0.5));
            addLog('danger', '【抽成】机构抽走 50%，月流水变成 ' + state.salary + ' 元。');
          }
        }
      ]
    },
    {
      id: 'E_JOB_STREAMER_APOLOGY',
      title: '道歉直播',
      description: '道歉直播开了三个小时。弹幕从骂声变成「算了」，最后有人刷了个嘉年华，说「下次选品上点心」。',
      weight: 1,
      chainOnly: true,
      requires: { job: '网红主播', minAge: 22 },
      options: [
        {
          label: '把选品流程公开，接受监督',
          effects: { eq: 5, cha: 5, mood: 8 },
          result: '你把检测报告挂在直播间置顶。那一周，粉丝反而涨了两万。'
        },
        {
          label: '低调一个月，等风头过去',
          effects: { mood: -6, money: -3000 },
          result: '你停播了一个月，回来那天在线人数只有平时的四分之一。'
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
    '架构师':     { salary: 60000, next: null,       prev: '高级开发',   requiredIntelligence: 350 },

    /* v3.19：职业专属事件需要的三个平级职业（无晋升链，靠跳槽涨薪） */
    '人民教师':   { salary: 7000,  next: null, prev: null, requiredIntelligence: 80 },
    '外卖骑手':   { salary: 8000,  next: null, prev: null, requiredIntelligence: 30 },
    '网红主播':   { salary: 9000,  next: null, prev: null, requiredIntelligence: 40 }
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

