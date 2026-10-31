  'use strict';

  /* ================= school 事件数据 ================= */
  var schoolEvents = [
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
    {
      id: 'E_TEEN_REBEL',
      title: '青春期',
      description: '为了一件很小的事——你妈翻了你的书包——你们吵了半个小时。她说「我都是为你好」。',
      weight: 6,
      requires: { minAge: 13, maxAge: 15 },
      options: [
        {
          label: '摔门出去，在小区花坛边坐到半夜',
          effects: { mood: -8, will: 5 },
          result: '她没下来找你。回家的时候，门没锁。'
        },
        {
          label: '冷战，三天不跟她说话',
          effects: { mood: -6, eq: -2 },
          result: '第四天早上，桌上多了一碗你爱吃的面。'
        },
        {
          label: '回房间，把门反锁',
          effects: { mood: -4, intelligence: 1 },
          result: '你在房间里把一本借来的小说看完了，看到凌晨。'
        }
      ]
    },
    {
      id: 'E_TEEN_CRUSH',
      title: '同桌',
      description: '你的同桌借你橡皮的时候，头发会扫到你的胳膊。你开始盼着上数学课。',
      weight: 6,
      requires: { minAge: 13, maxAge: 15 },
      options: [
        {
          label: '写一张纸条，折成很小的方块递过去',
          effects: { cha: 3, mood: 6, luck: 2 },
          result: '她看了一眼，脸红了，把纸条夹进了笔记本。'
        },
        {
          label: '什么也不说，每天提早十分钟来擦她的桌子',
          effects: { mood: 4, eq: 3, will: 2 },
          result: '她一直以为是值日生擦的。'
        },
        {
          label: '被老师发现你在看她',
          effects: { mood: -6, will: -1 },
          result: '你被叫起来回答问题，答错了，全班都在笑。她没有笑。'
        }
      ]
    },
    {
      id: 'E_TEEN_NETCAFE',
      title: '网吧',
      description: '翻墙出去上网。第二局刚开始，教导主任的手电筒就照到了你脸上。',
      weight: 6,
      requires: { minAge: 13, maxAge: 15 },
      options: [
        {
          label: '认罚，跟他回办公室写检查',
          effects: { mood: -5, will: 3 },
          result: '你写了三页检查，字写得很端正。',
          nextEventId: 'E_TEEN_NETCAFE_PARENT'
        },
        {
          label: '从后门溜掉',
          effects: { mood: 2, luck: -2, will: 1 },
          result: '你跑掉了。第二天班主任在班会上说「有人最好自己站出来」。'
        },
        {
          label: '撒谎说是陪同学来找人',
          effects: { eq: 2, will: -1, mood: -3 },
          result: '主任看了你两秒，说「行，那你把他叫来」。',
          nextEventId: 'E_TEEN_NETCAFE_PARENT'
        }
      ]
    },
    {
      id: 'E_TEEN_NETCAFE_PARENT',
      title: '叫家长',
      description: '教导主任的电话打到了家里。你爸骑着摩托车到了学校门口，一路上一句话没说。',
      weight: 1,
      chainOnly: true,
      requires: { minAge: 13, maxAge: 15 },
      options: [
        {
          label: '到家就挨了一顿揍',
          effects: { stamina: -4, mood: -8, will: 3 },
          result: '皮带抽在腿上，你一声没吭。第二天上学，你走路有点瘸。'
        },
        {
          label: '抱着他的腿求情',
          effects: { eq: 3, mood: -4 },
          result: '他的手抬起来，又放下了，只说了句「再有下次」。'
        },
        {
          label: '回房间反锁门，一晚上不出来',
          effects: { mood: -10, will: 2 },
          result: '半夜你听见门外有脚步声，停了一会儿，走了。'
        }
      ]
    },
    {
      id: 'E_TEEN_ISOLATED',
      title: '被孤立',
      description: '不知道从哪一天起，课间没人跟你说话。你走进教室，几个聚在一起的人会突然安静。',
      weight: 5,
      requires: { minAge: 13, maxAge: 15, onceEver: true },
      options: [
        {
          label: '忍着，等他们忘了',
          effects: { mood: -12, will: 5 },
          result: '你学会了一个人吃饭、一个人回家。半年后，那件事没人再提。'
        },
        {
          label: '主动讨好，给他们带零食',
          effects: { eq: 3, mood: -5, money: 20 },
          result: '他们收下了零食。课间还是没叫你。'
        },
        {
          label: '跟父母说想转学',
          effects: { mood: -6, eq: 2 },
          result: '你妈去找了班主任。班主任在班会上念了一篇关于「团结」的文章。'
        }
      ]
    },
    {
      id: 'E_HS_MOCK_FAIL',
      title: '模拟考',
      description: '高三第三次模拟考，你的排名又掉了一百名。成绩单贴在教室后墙，红色的名次很刺眼。',
      weight: 6,
      requires: { minAge: 16, maxAge: 18 },
      options: [
        {
          label: '把错题抄三遍，抄到会为止',
          effects: { intelligence: 3, stamina: -3, will: 3 },
          result: '你抄到凌晨两点。台灯下影子拉得很长，窗外的路灯灭了一半。'
        },
        {
          label: '把成绩单塞进抽屉，出去打了一场球',
          effects: { mood: 6, intelligence: -2 },
          result: '球场上你很猛。回教室的时候，灯已经关了。'
        },
        {
          label: '找个没人的地方哭一场',
          effects: { mood: -4, will: 2 },
          result: '你躲在实验楼后面哭了十分钟，然后回去继续做题。'
        }
      ]
    },
    {
      id: 'E_HS_FAINT',
      title: '体育课',
      description: '八百米跑到第三圈，眼前一黑。你听见有人在喊你的名字，声音越来越远。',
      weight: 5,
      requires: { minAge: 16, maxAge: 18 },
      options: [
        {
          label: '去医务室检查',
          effects: { stamina: 3, mood: -2 },
          result: '校医说是低血糖，让你以后一定吃早饭。'
        },
        {
          label: '灌一瓶糖水，说自己没事',
          effects: { stamina: -3, will: 2 },
          result: '你下午又吐了一次，什么也没跟谁说。'
        },
        {
          label: '被同学扶回宿舍，睡了一下午',
          effects: { mood: -3, eq: 1 },
          result: '醒来的时候天已经黑了，床头上放着一瓶水。'
        }
      ]
    },
    {
      id: 'E_HS_CANTEEN',
      title: '食堂',
      description: '半份土豆丝下面，躺着一只完整的、黑色的虫子。',
      weight: 5,
      requires: { minAge: 16, maxAge: 18 },
      options: [
        {
          label: '端着盘子去找校长',
          effects: { will: 4, cha: 1, mood: -4 },
          result: '食堂主任道了歉，赔了你二十块。第二个星期，窗口多了个意见箱。'
        },
        {
          label: '悄悄倒掉，去小卖部买泡面',
          effects: { money: -15, stamina: -2, mood: -5 },
          result: '泡面泡好了，你吃了两口就吃不下了。'
        },
        {
          label: '拍下来发到班级群',
          effects: { mood: 2, eq: -2, will: 2 },
          result: '群里炸了。第二天食堂门口站了三个检查的。'
        }
      ]
    },
    {
      id: 'E_HS_STREAM',
      title: '文理分科',
      description: '分科表发下来了，明天就要交。你爸说理科好就业，你的历史老师说你应该读文科。',
      weight: 6,
      requires: { minAge: 16, maxAge: 18, onceEver: true },
      options: [
        {
          label: '选理科，听说好就业',
          effects: { intelligence: 2, will: 2, mood: -2 },
          result: '你在「理」后面打了个勾。笔尖有点钝，勾画得不太好看。'
        },
        {
          label: '选文科，你喜欢那些年代',
          effects: { mood: 4, intelligence: 2 },
          result: '你爸没说什么。只是从那天起，晚饭桌上很少再聊学校的事。'
        },
        {
          label: '跟爸妈吵了一架，最后听了他们的',
          effects: { mood: -6, will: 2, eq: 1 },
          result: '你选的其实是他们选的。你后来花了很多年才接受这件事。'
        }
      ]
    }
,
  ];
  // 合并回全局 eventsData（保持引擎抽取逻辑不变）
  for (var _i = 0; _i < schoolEvents.length; _i++) eventsData.push(schoolEvents[_i]);
