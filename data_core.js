  'use strict';

  /* ================= 核心数据（常量/属性/天赋/结局/城市/疾病/核心行动） ================= */

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
      name: function () {
        return (getAge() < 18 || isStudentNow()) ? '和同学去操场' : '请客吃饭';
      },
      description: '和身边人聚一聚，热闹热闹。',
      costDays: 1,
      effects: { money: -200 },
      displayEffects: { money: -200 },
      requires: { money: { min: 200 }, minAge: 12 },
      denyText: { money: '钱不够，聚不起。', minAge: '还不到 12 岁，先好好上学。' },
      onRun: function () {
        var young = getAge() < 18 || isStudentNow();
        if (young) {
          state.eq += 2; state.cha += 2; state.mood += 5;
          addLog('sys', '【社交】你和同学去操场逛了一圈，心情舒畅。');
        } else {
          touchAllFriends();
          state.mood = Math.min(moodMaxOf(), state.mood + 8);   // v3.34：恢复原 treat/hangout 的心情加成，避免心情低→裁员→工龄清零
          if (state.married) addLove(5);
          else if (state.loveState === 'dating') {
            state.datingLove = Math.min(100, (state.datingLove || 0) + 5);
            addLog('sys', '【请客】和恋人共进晚餐，好感度 +5。');
          } else {
            state.eq += 1;
            addLog('sys', '【请客】和朋友吃饭聊天，情商 +1。');
          }
          if (Math.random() < 0.30) {
            var age = getAge();
            var tag = age <= 18 ? '同学' : (Math.random() < 0.5 ? '同事' : '酒肉朋友');
            var f = makeFriend(tag);
            state.friends = state.friends || [];
            state.friends.push(f);
            addLog('event', '【朋友】聚会上你认识了新朋友「' + f.name + '」（' + tag + '）。');
          }
        }
      }
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
          // v3.34：跨城限制——春节（1月）/国庆（10月）才回家，平时电话问候
          if (state.m === 1 || state.m === 10) {
            state.mood = Math.min(moodMaxOf(), state.mood + 3);
            addLog('sys', '【陪伴】你回家陪父母吃了顿饭，心情 +3。');
          } else {
            state.mood = Math.min(moodMaxOf(), state.mood + 1);
            addLog('sys', '【陪伴】离家太远，你给父母打了个电话，心情 +1（春节/国庆再回家）。');
          }
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
    /* v3.39：统一求职中心入口（移除散落应聘按钮，人才市场统一投递） */
    {
      id: 'jobCenter',
      name: '💼 投递简历',
      description: '打开人才市场，看看有什么工作。',
      costDays: 1,
      effects: {},
      displayEffects: {},
      hideWhenLocked: false,
      requires: { minAge: 18, unemployed: true },
      denyText: { unemployed: '已有工作，先辞职再来。', minAge: '18 岁才能投递简历。' },
      onRun: function () {
        openJobMarket();
      }
    },
    /* v3.43：闭关考证（点击打开考证中心，考证书耗天数 + 智力判定） */
    {
      id: 'certStudy',
      name: '📖 闭关考证',
      description: '闭关备考，拿下一张证书。',
      costDays: 1,
      effects: {},
      displayEffects: {},
      hideWhenLocked: false,
      requires: { minAge: 18 },
      onRun: function () {
        openCertMarket();
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

    /* v3.31：买房（原 E_DOWNPAY 事件改为点击行动触发，成功后 housing='own'） */
    {
      id: 'buyHouse',
      name: '买房',
      description: '中介发来一套房：三十平，首付按城市房价折算。「这是你自己的」。',
      costDays: 1,
      effects: { mood: -6, stamina: -3 },
      displayEffects: { mood: -6, stamina: -3 },
      hideWhenLocked: true,
      requires: { houseMoney: 900000, minAge: 18 },
      denyText: { houseMoney: '首付（按城市房价折算）不够，先攒钱或搬去房价低的城市。' },
      onRun: function () {
        var down = houseCost(900000);
        state.money -= down;
        state.housing = 'own';
        state.rentType = 'home';
        state.commute = 30;   // 已购房：通勤中等，不再付房租
        addLog('event', '【买房】首付 ' + down + ' 元（' + cityName() + '）。你有了自己的家。');
      }
    },
    /* v3.31：搬家去别的城市（消耗搬家费 5000，重新选择城市） */
    {
      id: 'moveCity',
      name: '搬家去别的城市',
      description: '收拾行李，换个城市重新开始。',
      costDays: 3,
      effects: { money: -5000 },
      displayEffects: { money: -5000 },
      hideWhenLocked: true,
      requires: { money: { min: 5000 }, minAge: 18 },
      onRun: function () {
        moveCityDecay();   // v3.32：人走茶凉，同事好友好感减半
        var ev = findEvent('E_MOVE_DEST');
        if (ev) openEvent(ev);   // 用事件选项当城市选择器（零新增 UI）
      }
    },
    /* v3.34：主动求婚（好感度 >85 成功结婚，否则分手） */
    {
      id: 'propose',
      name: '求婚',
      description: '买一枚戒指，单膝跪地，赌上这辈子的勇气。',
      costDays: 1,
      effects: { money: -10000 },
      displayEffects: { money: -10000 },
      hideWhenLocked: true,
      requires: { loveState: 'dating', money: { min: 10000 }, minAge: 22 },
      denyText: { loveState: '先交往，有了恋人才能求婚。' },
      onRun: function () {
        if ((state.datingLove || 0) > 85) {
          marryTo('求婚');
        } else {
          addLog('danger', '【求婚】对方说「我们还没准备好」，然后提了分手。');
          breakUp();
        }
      }
    },
    /* v3.34：跳过本月（直接跳到下月结算，缓解点击疲劳） */
    {
      id: 'skipMonth',
      name: '跳过本月',
      description: '这个月没什么好做的，直接跳到下个月。',
      costDays: 1,
      effects: { mood: -8 },
      displayEffects: { mood: -8 },
      hideWhenLocked: false,
      requires: { minAge: 16 },
      onRun: function () {
        if (window.IS_SIMULATION) return;   // v3.34：平衡模拟环境跳过跳月（skipMonth 是 UI 便利，不该影响 Agent 平衡）
        var left = daysInMonth(state.y, state.m) - state.d + 1;   // 本月剩余天数
        advanceDays(left);   // 逐天推进到月底（触发完整日/月结算与事件抽取，不用 skipMonths 以免漏事件）
        markJobChange();     // 跳月不等于跳槽，重置跳槽冷却
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

  /* ================= [数据层] 城市 / 地域系统（v3.24） =================
     id / name / salaryFactor 工资系数 / livingFactor 生活成本系数 / houseFactor 房价系数。
     'normal' 是兜底城市（老档默认），三系数全 1.0。
     系数初版为占位值，最终以 1000 局平衡测试标定为准（见 CHANGELOG）。 */
  var citiesData = window.citiesData = [
    { id: 'normal',   name: '普通城市', salaryFactor: 1.0,  livingFactor: 1.0,  houseFactor: 1.0,  moodBonus: 0 },
    { id: 'beijing',  name: '北京',     salaryFactor: 1.4,  livingFactor: 1.5,  houseFactor: 2.0,  moodBonus: -2 },
    { id: 'chengdu',  name: '成都',     salaryFactor: 1.0,  livingFactor: 0.85, houseFactor: 1.2,  moodBonus: 1 },
    { id: 'changsha', name: '长沙',     salaryFactor: 0.95, livingFactor: 0.75, houseFactor: 0.9,  moodBonus: 2 },
    { id: 'hegang',   name: '鹤岗',     salaryFactor: 0.7, livingFactor: 0.45, houseFactor: 0.15, moodBonus: 5 },
    { id: 'county',   name: '小县城',   salaryFactor: 0.75, livingFactor: 0.55, houseFactor: 0.25, moodBonus: 5 }
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

  /* 事件数组：由 data_events_school/career/life 按序合并（引擎抽取逻辑不变） */
  var eventsData = window.eventsData = [];


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
    '网红主播':   { salary: 9000,  next: null, prev: null, requiredIntelligence: 40 },

    /* v3.39：8 个高差异化新职业（最低级 = 职业名，晋升链 3-4 级） */
    // 医生（4 级）
    '医生':       { salary: 15000, next: '主治医师',   prev: null, requiredIntelligence: 200, req: { workYears: 2, intelligence: 260 } },
    '主治医师':   { salary: 22000, next: '副主任医师', prev: '医生', requiredIntelligence: 260, req: { workYears: 3, intelligence: 320 } },
    '副主任医师': { salary: 32000, next: '主任医师',   prev: '主治医师', requiredIntelligence: 320, req: { workYears: 4, intelligence: 380 } },
    '主任医师':   { salary: 45000, next: null,         prev: '副主任医师', requiredIntelligence: 380 },

    // 警察（3 级）
    '警察':       { salary: 9000,  next: '刑侦队长', prev: null, requiredIntelligence: 80,  req: { workYears: 2, intelligence: 120 } },
    '刑侦队长':   { salary: 15000, next: '分局局长', prev: '警察', requiredIntelligence: 120, req: { workYears: 3, intelligence: 180 } },
    '分局局长':   { salary: 22000, next: null,       prev: '刑侦队长', requiredIntelligence: 180 },

    // 金融分析师（3 级）
    '金融分析师': { salary: 18000, next: '高级分析师', prev: null, requiredIntelligence: 220, req: { workYears: 2, intelligence: 280 } },
    '高级分析师': { salary: 26000, next: '基金经理', prev: '金融分析师', requiredIntelligence: 280, req: { workYears: 3, intelligence: 340 } },
    '基金经理':   { salary: 40000, next: null,       prev: '高级分析师', requiredIntelligence: 340 },

    // 设计师（3 级）
    '设计师':     { salary: 12000, next: '高级设计师', prev: null, requiredIntelligence: 140, req: { workYears: 2, intelligence: 200 } },
    '高级设计师': { salary: 18000, next: '设计总监', prev: '设计师', requiredIntelligence: 200, req: { workYears: 3, intelligence: 260 } },
    '设计总监':   { salary: 25000, next: null,       prev: '高级设计师', requiredIntelligence: 260 },

    // 厨师（3 级）
    '厨师':       { salary: 7000,  next: '主厨',     prev: null, requiredIntelligence: 40,  req: { workYears: 2, intelligence: 100 } },
    '主厨':       { salary: 12000, next: '行政总厨', prev: '厨师', requiredIntelligence: 100, req: { workYears: 3, intelligence: 160 } },
    '行政总厨':   { salary: 18000, next: null,       prev: '主厨', requiredIntelligence: 160 },

    // 律师（3 级）
    '律师':       { salary: 14000, next: '执业律师', prev: null, requiredIntelligence: 200, req: { workYears: 2, intelligence: 260 } },
    '执业律师':   { salary: 24000, next: '合伙人', prev: '律师', requiredIntelligence: 260, req: { workYears: 3, intelligence: 320 } },
    '合伙人':     { salary: 38000, next: null,       prev: '执业律师', requiredIntelligence: 320 },

    // 销售（3 级）
    '销售':       { salary: 10000, next: '销售经理', prev: null, requiredIntelligence: 60,  req: { workYears: 2, intelligence: 120 } },
    '销售经理':   { salary: 16000, next: '销售总监', prev: '销售', requiredIntelligence: 120, req: { workYears: 3, intelligence: 180 } },
    '销售总监':   { salary: 24000, next: null,       prev: '销售经理', requiredIntelligence: 180 },

    // 公务员（3 级）
    '公务员':     { salary: 8000,  next: '副科',     prev: null, requiredIntelligence: 100, req: { workYears: 3, intelligence: 160 } },
    '副科':       { salary: 12000, next: '正科',     prev: '公务员', requiredIntelligence: 160, req: { workYears: 4, intelligence: 220 } },
    '正科':       { salary: 16000, next: null,       prev: '副科', requiredIntelligence: 220 },

    /* v3.40：终极扩充，16 个新职业（最低级 = 职业名，供专属事件 job 判定；体质门槛已换算到 0-100） */
    // 消防员（3 级）
    '消防员': { salary: 8000,  next: '班长',   prev: null, requiredIntelligence: 60,  req: { workYears: 2, intelligence: 90 } },
    '班长':   { salary: 11000, next: '中队长', prev: '消防员', requiredIntelligence: 90,  req: { workYears: 3, intelligence: 120 } },
    '中队长': { salary: 15000, next: null,     prev: '班长', requiredIntelligence: 120 },

    // 军人（3 级）
    '军人': { salary: 7000,  next: '士官', prev: null, requiredIntelligence: 60, req: { workYears: 2, intelligence: 90 } },
    '士官': { salary: 10000, next: '军官', prev: '军人', requiredIntelligence: 90, req: { workYears: 3, intelligence: 120 } },
    '军官': { salary: 15000, next: null,   prev: '士官', requiredIntelligence: 120 },

    // 司机（2 级）
    '司机':   { salary: 6000, next: '车队队长', prev: null, requiredIntelligence: 40, req: { workYears: 2, intelligence: 70 } },
    '车队队长': { salary: 9000, next: null,     prev: '司机', requiredIntelligence: 70 },

    // 快递员（2 级）
    '快递员':   { salary: 6500, next: '站点站长', prev: null, requiredIntelligence: 45, req: { workYears: 2, intelligence: 80 } },
    '站点站长': { salary: 9500, next: null,     prev: '快递员', requiredIntelligence: 80 },

    // 电商运营（3 级）
    '电商运营': { salary: 8000,  next: '运营主管', prev: null, requiredIntelligence: 150, req: { workYears: 2, intelligence: 200 } },
    '运营主管': { salary: 12000, next: '运营总监', prev: '电商运营', requiredIntelligence: 200, req: { workYears: 3, intelligence: 250 } },
    '运营总监': { salary: 18000, next: null,     prev: '运营主管', requiredIntelligence: 250 },

    // 作家（3 级）
    '作家':   { salary: 5000,  next: '签约作家', prev: null, requiredIntelligence: 180, req: { workYears: 2, intelligence: 230 } },
    '签约作家': { salary: 8000,  next: '白金大神', prev: '作家', requiredIntelligence: 230, req: { workYears: 3, intelligence: 280 } },
    '白金大神': { salary: 15000, next: null,     prev: '签约作家', requiredIntelligence: 280 },

    // 画家（3 级）
    '画家':   { salary: 4000, next: '艺术家', prev: null, requiredIntelligence: 150, req: { workYears: 2, intelligence: 200 } },
    '艺术家': { salary: 7000, next: '名家',   prev: '画家', requiredIntelligence: 200, req: { workYears: 3, intelligence: 250 } },
    '名家':   { salary: 12000, next: null,   prev: '艺术家', requiredIntelligence: 250 },

    // 音乐人（3 级）
    '音乐人':     { salary: 5000,  next: '独立音乐人', prev: null, requiredIntelligence: 180, req: { workYears: 2, intelligence: 230 } },
    '独立音乐人': { salary: 9000,  next: '明星',       prev: '音乐人', requiredIntelligence: 230, req: { workYears: 3, intelligence: 280 } },
    '明星':       { salary: 20000, next: null,         prev: '独立音乐人', requiredIntelligence: 280 },

    // 演员（3 级）
    '演员': { salary: 4000,  next: '配角',     prev: null, requiredIntelligence: 250, req: { workYears: 2, intelligence: 300 } },
    '配角': { salary: 8000,  next: '影帝影后', prev: '演员', requiredIntelligence: 300, req: { workYears: 3, intelligence: 350 } },
    '影帝影后': { salary: 25000, next: null,   prev: '配角', requiredIntelligence: 350 },

    // 运动员（3 级）
    '运动员': { salary: 8000,  next: '省队',   prev: null, requiredIntelligence: 70, req: { workYears: 2, intelligence: 100 } },
    '省队':   { salary: 12000, next: '国家队', prev: '运动员', requiredIntelligence: 100, req: { workYears: 3, intelligence: 130 } },
    '国家队': { salary: 20000, next: null,     prev: '省队', requiredIntelligence: 130 },

    // 健身教练（3 级）
    '健身教练': { salary: 7000,  next: '私人教练', prev: null, requiredIntelligence: 200, req: { workYears: 2, intelligence: 230 } },
    '私人教练': { salary: 11000, next: '店长',     prev: '健身教练', requiredIntelligence: 230, req: { workYears: 3, intelligence: 260 } },
    '店长':     { salary: 16000, next: null,       prev: '私人教练', requiredIntelligence: 260 },

    // 护士（3 级）
    '护士':   { salary: 7000,  next: '护师',   prev: null, requiredIntelligence: 150, req: { workYears: 2, intelligence: 200 } },
    '护师':   { salary: 10000, next: '护士长', prev: '护士', requiredIntelligence: 200, req: { workYears: 3, intelligence: 240 } },
    '护士长': { salary: 14000, next: null,     prev: '护师', requiredIntelligence: 240 },

    // 药剂师（3 级）
    '药剂师':   { salary: 8000,  next: '药师',     prev: null, requiredIntelligence: 200, req: { workYears: 2, intelligence: 240 } },
    '药师':     { salary: 12000, next: '主管药师', prev: '药剂师', requiredIntelligence: 240, req: { workYears: 3, intelligence: 280 } },
    '主管药师': { salary: 16000, next: null,       prev: '药师', requiredIntelligence: 280 },

    // 建筑师（3 级）
    '建筑师':   { salary: 12000, next: '高级建筑师', prev: null, requiredIntelligence: 250, req: { workYears: 2, intelligence: 300 } },
    '高级建筑师': { salary: 18000, next: '总建筑师', prev: '建筑师', requiredIntelligence: 300, req: { workYears: 3, intelligence: 350 } },
    '总建筑师':   { salary: 26000, next: null,     prev: '高级建筑师', requiredIntelligence: 350 },

    // 科研人员（3 级）
    '科研人员':   { salary: 10000, next: '副研究员', prev: null, requiredIntelligence: 300, req: { workYears: 2, intelligence: 350 } },
    '副研究员':   { salary: 15000, next: '首席科学家', prev: '科研人员', requiredIntelligence: 350, req: { workYears: 3, intelligence: 400 } },
    '首席科学家': { salary: 22000, next: null,       prev: '副研究员', requiredIntelligence: 400 },

    // 自由职业者（无晋升链）
    '自由职业者': { salary: 6000, next: null, prev: null, requiredIntelligence: 100 }
  };
  // v3.39：人才市场职位表（求职中心 UI 渲染 + 投递简历判定）
  // req 用 ATTRS 的属性名（intelligence/stamina/cha/will/eq/luck/money），key 映射见 ATTRS
  var JOB_OPENINGS = window.JOB_OPENINGS = [
    { job: '普通文员',   salary: 5000,  minAge: 22, minEdu: '专科', req: { intelligence: 100 }, desc: '坐办公室，先有份工作。' },
    { job: '普通程序员', salary: 15000, minAge: 22, minEdu: '本科', req: { intelligence: 130 }, desc: '小公司外包，先上车再说。' },
    { job: '大厂程序员', salary: 24000, minAge: 22, minEdu: '本科', schoolTier: '重点', major: '计算机', req: { intelligence: 180 }, cert: 'cet6', desc: '投了三百份简历。' },
    { job: '人民教师',   salary: 7000,  minAge: 22, minEdu: '本科', major: '师范', req: { eq: 40 }, cert: 'teacher', desc: '考编，然后是几十年的黑板。' },
    { job: '外卖骑手',   salary: 8000,  minAge: 20, req: { stamina: 50 }, desc: '今天就能上线，靠腿吃饭。' },
    { job: '网红主播',   salary: 9000,  minAge: 18, req: { cha: 55, luck: 45, money: 1500 }, desc: '补光灯、声卡、一张能说会道的嘴。' },
    { job: '医生',       salary: 15000, minAge: 26, minEdu: '本科', major: '临床医学', req: { intelligence: 200 }, desc: '规培三年，才配拿起第一把手术刀。' },
    { job: '警察',       salary: 9000,  minAge: 22, minEdu: '专科', req: { stamina: 60, will: 50 }, desc: '穿上这身警服，就没有节假日。' },
    { job: '金融分析师', salary: 18000, minAge: 24, minEdu: '本科', major: '金融学', req: { intelligence: 220 }, cert: 'cpa', desc: '高薪，但你的每个判断都值几千万。' },
    { job: '设计师',     salary: 12000, minAge: 22, minEdu: '专科', major: '艺术', req: { intelligence: 140, cha: 60 }, desc: '五彩斑斓的黑，是入门第一课。' },
    { job: '厨师',       salary: 7000,  minAge: 20, req: { stamina: 50 }, desc: '热油和菜刀，比想象中更近。' },
    { job: '律师',       salary: 14000, minAge: 25, minEdu: '本科', major: '法学', req: { intelligence: 200, will: 60 }, cert: 'lawyer', desc: '法考通过只是开始。' },
    { job: '销售',       salary: 10000, minAge: 22, req: { cha: 65, eq: 55 }, desc: '提成上不封顶，胃也是。' },
    { job: '公务员',     salary: 8000,  minAge: 24, minEdu: '本科', major: '法学', req: { intelligence: 100 }, cert: 'cet6', desc: '铁饭碗，也是温水。' },
    /* v3.40：16 个新职业（体质门槛已换算到 0-100） */
    { job: '消防员',   salary: 8000,  minAge: 20, minEdu: '高中', req: { stamina: 60 }, desc: '火场里，没有人等你准备好。' },
    { job: '军人',     salary: 7000,  minAge: 18, minEdu: '高中', req: { stamina: 70 }, desc: '穿上军装，你的命就不再只属于自己。' },
    { job: '司机',     salary: 6000,  minAge: 22, req: { stamina: 40 }, desc: '一单接一单，方向盘就是饭碗。' },
    { job: '快递员',   salary: 6500,  minAge: 18, req: { stamina: 45 }, desc: '风里雨里，包裹等你。' },
    { job: '电商运营', salary: 8000,  minAge: 22, minEdu: '专科', major: '计算机', req: { intelligence: 150, eq: 150 }, desc: '流量和转化，是唯一信仰。' },
    { job: '作家',     salary: 5000,  minAge: 18, req: { intelligence: 180 }, desc: '稿费浮动，灵感靠天。' },
    { job: '画家',     salary: 4000,  minAge: 18, major: '艺术', req: { cha: 150 }, desc: '卖画为生，也卖自己。' },
    { job: '音乐人',   salary: 5000,  minAge: 18, major: '艺术', req: { cha: 180 }, desc: '版权、演出、驻唱，总得先活着。' },
    { job: '演员',     salary: 4000,  minAge: 18, minEdu: '专科', major: '艺术', req: { cha: 250 }, desc: '片酬看脸，也看命。' },
    { job: '运动员',   salary: 8000,  minAge: 16, req: { stamina: 70 }, desc: '巅峰很短，伤病很长。' },
    { job: '健身教练', salary: 7000,  minAge: 22, minEdu: '专科', req: { stamina: 50, cha: 150 }, desc: '好身材就是活广告。' },
    { job: '护士',     salary: 7000,  minAge: 22, minEdu: '专科', major: '临床医学', req: { stamina: 45, will: 150 }, desc: '白班夜班，脚不沾地。' },
    { job: '药剂师',   salary: 8000,  minAge: 24, minEdu: '本科', major: '临床医学', req: { intelligence: 200 }, desc: '抓错一味药，就是一条命。' },
    { job: '建筑师',   salary: 12000, minAge: 24, minEdu: '本科', major: '土木建筑', req: { intelligence: 250 }, desc: '一栋楼，几代人的身家。' },
    { job: '科研人员', salary: 10000, minAge: 26, minEdu: '硕士', req: { intelligence: 300 }, desc: '几年青春，换一行数据。' },
    { job: '自由职业者', salary: 6000, minAge: 18, req: { cha: 100 }, desc: '收入波动，自由也波动。' }
  ];
  // v3.43：证书数据表（闭关考证中心渲染 + 报考判定）
  // studentOnly=在校大学生专属；prereq=前置证书；major=专业要求；minEdu=学历要求；intNeed=智力硬门槛
  var CERTIFICATES = window.CERTIFICATES = [
    { id: 'cet4',    name: '英语四级',   costDays: 10, intNeed: 80,  prereq: [],               studentOnly: true,  desc: '在校大学生专属，难度较低。' },
    { id: 'cet6',    name: '英语六级',   costDays: 15, intNeed: 150, prereq: ['cet4'],         studentOnly: true,  desc: '前置：需四级证书，难度中等。' },
    { id: 'teacher', name: '教师资格证', costDays: 15, intNeed: 150, prereq: [], minEdu: '本科', desc: '本科以上，无专业限制，难度中等。' },
    { id: 'lawyer',  name: '法考证书',   costDays: 30, intNeed: 250, prereq: [], major: '法学', desc: '需法学专业，极高难度。' },
    { id: 'cpa',     name: 'CPA 注会',   costDays: 30, intNeed: 250, prereq: [], major: '金融学', desc: '需金融专业，极高难度。' }
  ];
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
    var base = Math.max(LIVING_BASE, Math.round((Number(salary) || 0) * LIVING_RATE));
    // v3.24：生活成本按城市系数缩放（cityFactors 定义在 engine，运行时已加载）
    var f = (typeof cityFactors === 'function') ? cityFactors().living : 1;
    return Math.round(base * f);
  }

  // 开局日志用：把上面两个数值翻译成人话，改数值不用再改文案
  function livingCostText() {
    return '每月自动结算生活费：在职按月薪 ' + Math.round(LIVING_RATE * 100)
      + '%，无业保底 ' + LIVING_BASE + ' 元。';
  }

  /* ================= [数据层] v3.31 租房 / 通勤 / 城市流动 ================= */
  // 租房类型：rentFactor 是相对「市区合租」的房租倍率；commute 决定通勤惩罚
  var RENT_TYPES = {
    home:   { name: '住在家里',  commute: 40, rentFactor: 0,   desc: '省房租，但通勤靠公交，偶尔被念叨' },
    share:  { name: '市区合租',  commute: 20, rentFactor: 1.0, desc: '离公司近，与人合租' },
    whole:  { name: '市区整租',  commute: 25, rentFactor: 2.0, desc: '一个人住，离公司近，贵' },
    suburb: { name: '郊区整租',  commute: 90, rentFactor: 0.8, desc: '便宜安静，但通勤漫长' }
  };
  var RENT_BASE = 1400;          // 基准月租（市区合租、普通城市）；最终 = RENT_BASE × cityFactors().living × rentFactor
  var COMMUTE_THRESHOLD = 60;    // 通勤 > 60 分钟触发惩罚（按月）
  var COMMUTE_MOOD = -4;         // 通勤折磨：心情（每月）
  var COMMUTE_STA = -1;          // 通勤折磨：体力（每月）
  var RENT_ARREAR_MOOD = -6;     // 付不起房租：暂缓的心情惩罚（不扣成负数，留翻盘余地）

  function rentOf() {
    if (state.housing !== 'rent') return 0;
    var t = RENT_TYPES[state.rentType] || RENT_TYPES.home;
    if (!t || !t.rentFactor) return 0;
    var f = (typeof cityFactors === 'function') ? cityFactors().living : 1;   // 城市生活系数（北京贵/鹤岗便宜）
    return Math.round(RENT_BASE * f * t.rentFactor);
  }

  function settleHousing() {
    // ① 房租（租房才扣）
    var rent = rentOf();
    if (rent > 0) {
      if (state.money >= rent) {
        state.money -= rent;
        addLog('month', '【房租】本月房租 -' + rent + ' 元（' + (RENT_TYPES[state.rentType] ? RENT_TYPES[state.rentType].name : '租房') + ' · ' + (typeof cityName === 'function' ? cityName() : '') + '）。');
      } else {
        state.mood += RENT_ARREAR_MOOD;   // 暂缓：不扣成负数，只伤心情
        clampStats();
        addLog('danger', '【房租】这个月房租 ' + rent + ' 元交不上了，只能先欠着（心情 ' + RENT_ARREAR_MOOD + '）。得快点赚钱。');
      }
    }
    // ② 通勤折磨（> 60 分钟，每月扣心情/体力）
    var c = state.commute || 0;
    if (c > COMMUTE_THRESHOLD) {
      state.mood += COMMUTE_MOOD;
      state.sta += COMMUTE_STA;
      clampStats();
      addLog('sys', '【通勤】每天 ' + c + ' 分钟的路程，挤得人身心俱疲（心情 ' + COMMUTE_MOOD + ' / 体力 ' + COMMUTE_STA + '）。');
    }
  }

  // v3.31.1：城市躺平红利 / 北京亚健康（按城市 moodBonus 每月结算）
  function cityMoodBonus() {
    var id = state.city || 'normal';
    for (var i = 0; i < (citiesData || []).length; i++) {
      if (citiesData[i].id === id) return Number(citiesData[i].moodBonus) || 0;
    }
    return 0;
  }
  function settleCityWellbeing() {
    var bonus = cityMoodBonus();
    if (bonus !== 0) {
      state.mood += bonus;
      clampStats();
      addLog(bonus > 0 ? 'sys' : 'danger', '【城市】' + (typeof cityName === 'function' ? cityName() : '') + '的生活节奏' + (bonus > 0 ? '让你很放松（心情 +' + bonus + '）' : '压得你喘不过气（心情 ' + bonus + '）') + '。');
    }
    // 北京：高薪带血，在职每月扣 1 体质（亚健康累积）
    if ((state.city || 'normal') === 'beijing' && state.salary > 0) {
      state.sta += -1;
      clampStats();
      addLog('danger', '【北京】高强度通勤与加班，身体在透支（体力 -1）。');
    }
  }

  /* ================= [数据层] v3.32 朋友与社交网络 ================= */
  var FRIEND_SURNAME = ['林', '沈', '周', '许', '苏', '程', '叶', '陈', '温', '江', '顾', '陆'];
  var FRIEND_GIVEN = ['晓宇', '子墨', '一凡', '嘉树', '安然', '沐晴', '北辰', '思远', '若曦', '亦辰', '清越', '南乔'];
  var FRIEND_TAG_INIT = { 发小: 70, 同学: 50, 室友: 50, 同事: 40, 酒肉朋友: 40 };
  var FRIEND_DECAY_MONTHS = 3;   // 连续 N 个月没互动开始衰减
  var FRIEND_DECAY_AMOUNT = 2;   // 每月衰减量

  function makeFriend(tag) {
    var list = state.friends || [];
    var name = FRIEND_SURNAME[Math.floor(Math.random() * FRIEND_SURNAME.length)]
      + FRIEND_GIVEN[Math.floor(Math.random() * FRIEND_GIVEN.length)];
    return {
      id: 'f' + (list.length + 1), name: name,
      favor: FRIEND_TAG_INIT[tag] || 40, tag: tag,
      lastInteract: nowMonth()
    };
  }
  function touchFriend(f) { if (f) f.lastInteract = nowMonth(); }
  function touchAllFriends() {
    var list = state.friends || [];
    for (var i = 0; i < list.length; i++) list[i].lastInteract = nowMonth();
  }
  function bestFriend() {
    var list = state.friends || [];
    var best = null, max = -1;
    for (var i = 0; i < list.length; i++) {
      if ((list[i].favor || 0) > max) { max = list[i].favor || 0; best = list[i]; }
    }
    return best;
  }
  function touchBestFriend() { touchFriend(bestFriend()); }
  function clearDebt(outcome) {
    var list = state.friends || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i].debt;
      if (d && d.outcome === outcome) { delete list[i].debt; return list[i]; }
    }
    return null;
  }
  function settleFriends() {
    var list = state.friends || [];
    var now = nowMonth();
    for (var i = list.length - 1; i >= 0; i--) {
      var f = list[i];
      if (!f) { list.splice(i, 1); continue; }
      if (now - (f.lastInteract || now) >= FRIEND_DECAY_MONTHS) {
        f.favor = Math.max(0, (f.favor || 0) - FRIEND_DECAY_AMOUNT);
        if (f.favor <= 0 && f.tag !== '发小') {
          addLog('sys', '【朋友】你和「' + f.name + '」慢慢断了联系。');
          list.splice(i, 1);
        }
      }
    }
  }
  function moveCityDecay() {
    var list = state.friends || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var f = list[i];
      if (f.tag !== '同事') continue;
      f.favor = Math.floor((f.favor || 0) / 2);
      if (f.favor <= 0 || Math.random() < 0.3) {
        addLog('sys', '【朋友】你搬走了，和「' + f.name + '」渐渐断了联系（人走茶凉）。');
        list.splice(i, 1);
      } else {
        addLog('sys', '【朋友】你搬走了，和「' + f.name + '」的联系淡了（好感减半）。');
      }
    }
  }
  function normalizeFriends(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var f = raw[i];
      if (!f || typeof f !== 'object') continue;
      var rec = {
        id: (typeof f.id === 'string' && f.id) ? f.id : 'f' + (out.length + 1),
        name: (typeof f.name === 'string' && f.name) ? f.name : '朋友',
        favor: Math.max(0, Math.min(100, Math.round(Number(f.favor) || 0))),
        tag: (typeof f.tag === 'string' && f.tag) ? f.tag : '朋友',
        lastInteract: Math.max(0, Math.round(Number(f.lastInteract) || 0))
      };
      if (f.debt && typeof f.debt === 'object') {
        rec.debt = { amount: Math.max(0, Math.round(Number(f.debt.amount) || 0)), outcome: f.debt.outcome === 'vanish' ? 'vanish' : 'repay' };
      }
      out.push(rec);
    }
    return out;
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
    mood:         { key: 'mood',  label: '心情' },
    stockValue:   { key: 'stockValue', label: '股票市值' }   // v3.22：只进 ATTRS（供 checkRequires/optionMeta），不进 ATTR_ORDER，避免 applyEffects 误结算
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
  var BENEFIT = 530;                     // v3.2：22 岁以上失业且快没钱时的低保（v3.40：500→530，对冲 16 新职业+16 事件的事件池稀释）
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

