  'use strict';

  /* ================= career 事件数据 ================= */
  var careerEvents = [
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
      id: 'E_FIRST_SALARY',
      title: '第一笔工资',
      description: '工资到账了，短信弹出来的那一下，你在公司楼下的便利店站了很久。',
      weight: 3,
      priority: true,
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
,
    {
      id: 'E_STOCK_TIP',
      title: '内部消息',
      description: '一个在券商的朋友半夜给你打电话，说某只票下周要重组，消息来源「很可靠」。他说完就挂了，你没来得及问是真是假。',
      weight: 5,
      requires: { minAge: 22, stockValue: { min: 1 } },
      options: [
        {
          label: '全仓梭哈，再加五万',
          requires: { money: { min: 50000 } },
          effects: { money: -50000 },
          result: '你把能动的钱都转了进去，第二天开盘，手心全是汗。',
          onChoose: function () {
            state.stockValue = (state.stockValue || 0) + 50000;
            if ((state.luck || 0) < 150) {
              state.money = Math.round((state.money || 0) * 0.2);        // 现金蒸发 80%
              state.stockValue = Math.round((state.stockValue || 0) * 0.5);
              state.mood = Math.max(0, state.mood - 30);
              clampStats();
              addLog('danger', '【股灾】内幕消息是假的！现金蒸发 80%（剩 ' + state.money + ' 元），'
                + (state.money < 0 ? '你负债了。' : '心情跌到 ' + state.mood + '。'));
            } else {
              var tipBefore = state.stockValue || 0;
              state.stockValue = Math.round((state.stockValue || 0) * 2);   // 极小概率：内幕应验，梭哈押中 → 持仓翻倍
              addLog('event', '【股票】内幕是真的！梭哈押中，持仓翻倍：' + tipBefore + ' → ' + state.stockValue + ' 元。');
            }
          }
        },
        {
          label: '半信半疑，小买一万',
          requires: { money: { min: 10000 } },
          effects: { money: -10000 },
          result: '你只买了一点，既怕踏空，又怕接盘。',
          onChoose: function () {
            state.stockValue = (state.stockValue || 0) + 10000;
            addLog('event', '【股票】小买 10000 元，市值 ' + state.stockValue + ' 元。');
          }
        },
        {
          label: '不信，当没接过这个电话',
          effects: { mood: 2, eq: 1 },
          result: '你把手机翻过去继续睡。后来才知道，那天夜里确实有人一夜暴富，也有人一夜上天台。'
        }
      ]
    }
  ];
  // 合并回全局 eventsData（保持引擎抽取逻辑不变）
  for (var _i = 0; _i < careerEvents.length; _i++) eventsData.push(careerEvents[_i]);


  /* 股票行动（buyStock/sellStock）：从 actionsData 拆出，合并回 actionsData */
  var stockActions = [
    /* v3.22：股市投资（stockValue 只在这里与 settleStocks 里增改） */
    {
      id: 'buyStock',
      name: '买入股票',
      description: '把一万元放进大盘里，赌它下个月是牛市。',
      costDays: 1,
      effects: { money: -10000 },
      displayEffects: { money: -10000 },
      hideWhenLocked: true,
      requires: { money: { min: 10000 }, minAge: 18 },
      denyText: { money: '现金不足 10000，买不起。' },
      onRun: function () {
        state.stockValue = (state.stockValue || 0) + 10000;
        state.money -= 100;   // v3.23：交易摩擦，买入固定手续费 100
        addLog('event', '【股票】买入 10000 元（手续费 100），当前市值 ' + state.stockValue + ' 元。');
      }
    },
    {
      id: 'sellStock',
      name: '卖出股票',
      description: '把账户里的持仓全部变现，落袋为安。',
      costDays: 1,
      effects: {},
      displayEffects: {},
      hideWhenLocked: true,
      requires: { stockValue: { min: 1 }, minAge: 18 },
      onRun: function () {
        var v = state.stockValue || 0;
        if (v > 0) {
          var fee = Math.max(1, Math.round(v * 0.01));   // v3.23：卖出 1% 手续费
          state.money += v - fee;
          addLog('event', '【股票】卖出全部持仓 ' + v + ' 元，扣手续费 ' + fee + '，到手 ' + (v - fee) + ' 元。');
        }
        state.stockValue = 0;
      }
    },
  ];
  for (var _j = 0; _j < stockActions.length; _j++) actionsData.push(stockActions[_j]);