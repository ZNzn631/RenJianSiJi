  'use strict';

  /* ================= life 事件数据 ================= */
  var lifeEvents = [
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
    {
      id: 'E_LOVE_ONLINE',
      title: '网恋奔现',
      description: '聊了半年的那个人终于约你见面，地点是城西的一家咖啡馆。',
      weight: 4,
      requires: { onceEver: true, notTeenLove: true, loveState: 'single', minAge: 18, maxAge: 25 },   // v3.7：未婚、单身、且没早恋过才网恋
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
          label: '咬牙买学区房',
          meta: '学区房（按城市折算）',
          requires: { houseMoney: 600000 },
          effects: { mood: 6, stamina: -3 },
          result: '你签了第二份贷款合同，孩子的名字写在了入学名单上。',
          onChoose: function () { state.money -= houseCost(600000); addLog('event', '【学区房】支出 ' + houseCost(600000) + ' 元（' + cityName() + '）。'); },
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
      requires: { houseMoney: 180000, minAge: 36, maxAge: 58 },   // v3.24：装修并入房价系数
      options: [
        { label: '好好装，住得舒服点', meta: '装修（按城市折算）', requires: { houseMoney: 180000 }, effects: { mood: 12, stamina: 2 }, result: '新家有了阳光，你第一次觉得钱花得值。', onChoose: function () { state.money -= houseCost(180000); addLog('event', '【装修】支出 ' + houseCost(180000) + ' 元（' + cityName() + '）。'); } },
        { label: '简单刷墙就行', meta: '装修（按城市折算）', effects: { mood: 2 }, result: '墙白了，家具还是旧的。', onChoose: function () { state.money -= houseCost(45000); addLog('event', '【装修】支出 ' + houseCost(45000) + ' 元（' + cityName() + '）。'); } }
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
      id: 'E_MARRY_URGE',
      title: '催婚',
      description: '过年回家，三姑六婆围坐一圈：「都快三十了，还一个人？」你妈把手机推到你面前，上面是一张照片。',
      weight: 6,
      priority: true,
      requires: { onceEver: true, loveState: 'single', minAge: MARRY_URGE_AGE, maxAge: 40, marryCooldown: MARRY_COOLDOWN },   // v3.7：单身态才催婚
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
      requires: { loveState: 'single', minAge: MARRY_MIN_AGE, maxAge: 45, marryCooldown: MARRY_COOLDOWN },   // v3.7：单身态才相亲
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
      requires: { onceEver: true, loveState: 'single', minAge: MARRY_MIN_AGE, maxAge: 34, cha: { min: 45 }, marryCooldown: MARRY_COOLDOWN },   // v3.7：单身态才旧情复燃
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
      requires: { coldMonths: 2, loveMax: 20 },   // v3.36：连续冷战 ≥2 月且感情 ≤20 才允许协议离婚
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
    {
      id: 'E_LOVE_MEET_WORK',
      title: '职场邂逅',
      description: '公司来了新人，工位正好在你旁边。TA 转过头问你打印机怎么用，你忽然忘了自己刚才在做什么。',
      weight: 7,
      requires: { onceEver: true, loveState: 'single', minAge: 22, maxAge: 45, job: 'not_null' },
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
      requires: { onceEver: true, loveState: 'single', minAge: 22, maxAge: 40 },
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
      requires: { onceEver: true, loveState: 'single', minAge: 22, maxAge: 45 },
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
      requires: { onceEver: true, loveState: 'single', minAge: 22, maxAge: 40, cha: { min: 20 } },
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
      requires: { onceEver: true, loveState: 'single', minAge: 24, maxAge: 45 },
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
    {
      id: 'E_LOVE_HOUSE',
      title: '买房的分歧',
      description: '谈到结婚，对方家里把话说得很明白：「没有房子，别的都不用谈。」中介的报价单在桌上摊着，你们都没动。',
      weight: 7,
      requires: { loveState: 'dating', datingMonths: 6, minAge: 24, maxAge: 45 },
      options: [
        {
          label: '掏空积蓄，付掉首付',
          meta: '首付（按城市折算）',
          requires: { houseMoney: 300000 },
          effects: { mood: -10, will: 4 },
          result: '签完字你在售楼处门口站了很久，风把合同吹得哗啦响。',
          onChoose: function () { state.money -= houseCost(300000); addLog('event', '【买房】首付 ' + houseCost(300000) + ' 元（' + cityName() + '）。'); },
          nextEventId: 'E_LOVE_BETROTHAL'
        },
        {
          label: '让父母先垫八万，剩下的慢慢还',
          meta: '首付（按城市折算）',
          requires: { houseMoney: 80000 },
          effects: { mood: -12, will: -2 },
          result: '你妈转账时只说了句「别委屈自己」。这句话后来每次过年都会被提起。',
          onChoose: function () { state.money -= houseCost(80000); addLog('event', '【买房】首付 ' + houseCost(80000) + ' 元（' + cityName() + '）。'); },
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
      requires: { onceEver: true, loveState: 'single', minAge: 24, maxAge: 45 },
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
    {
      id: 'E_KID_NICKNAME',
      title: '外号',
      description: '你有点胖，或者有点黑，或者说话有点结巴。总之从某一天起，全班开始用另一个名字叫你。',
      weight: 6,
      requires: { minAge: 6, maxAge: 12, onceEver: true },
      options: [
        {
          label: '冲上去打他',
          effects: { stamina: -2, will: 3, mood: -3 },
          result: '你们在教室后面打成一团。老师拉开你们的时候，你在流鼻血。第二天，外号还是那个外号。'
        },
        {
          label: '告诉老师',
          effects: { will: -1, eq: 2, mood: -5 },
          result: '老师让他当面道了歉。道歉的时候他笑了一下，只有你看见了。'
        },
        {
          label: '假装不在意，跟着一起笑',
          effects: { mood: -6, eq: 3, will: 1 },
          result: '你笑得比谁都大声。回家路上，你在河堤上坐了很久。'
        }
      ]
    },
    {
      id: 'E_KID_CARTOON',
      title: '动画片',
      description: '每天六点，那个频道的动画片开播。作业本摊在旁边，一页没动，铅笔滚到了桌角。',
      weight: 6,
      requires: { minAge: 6, maxAge: 12 },
      options: [
        {
          label: '先把这一集看完',
          effects: { mood: 7, intelligence: -1 },
          result: '一集看完还有下一集。作业是第二天早自习抄的。'
        },
        {
          label: '关掉电视，先写作业',
          effects: { will: 4, intelligence: 2, mood: -4 },
          result: '你写得很快。写完的时候，隔壁的电视声还响着。'
        },
        {
          label: '一边看一边写',
          effects: { intelligence: 1, mood: 2 },
          result: '字写得像鬼画符。第二天被老师叫去重写，写到手酸。'
        }
      ]
    },
    {
      id: 'E_KID_LUCKY_MONEY',
      title: '压岁钱',
      description: '过年收了一沓红包，攥在手里还没捂热，妈妈说「先帮你存着」。',
      weight: 5,
      requires: { minAge: 6, maxAge: 12, onceEver: true },
      options: [
        {
          label: '乖乖上交',
          effects: { mood: -4, will: 2 },
          result: '你看着她把红包塞进抽屉。那个抽屉后来一直锁着。'
        },
        {
          label: '偷偷藏一半在书包夹层',
          effects: { money: 300, luck: 2, will: -1, mood: 4 },
          result: '你藏了三百，每天上学都摸一下。后来这笔钱买了漫画。'
        },
        {
          label: '哭着要自己保管',
          effects: { mood: -6, cha: 1 },
          result: '你哭得很大声，最后拿到了一百。年夜饭桌上，没人说话。'
        }
      ]
    },
    {
      id: 'E_KID_SPORTS',
      title: '运动会',
      description: '四百米决赛，你在第二个弯道被绊倒，膝盖磕在塑胶跑道上。全校都在看台上。',
      weight: 5,
      requires: { minAge: 6, maxAge: 12 },
      options: [
        {
          label: '爬起来，把剩下的路跑完',
          effects: { will: 5, stamina: -2, mood: -1 },
          result: '你是最后一名。但班主任在终点抱住了你，说你很了不起。'
        },
        {
          label: '坐在地上哭',
          effects: { mood: -6, eq: -2 },
          result: '有人来扶你，你甩开了。那天下午你一句话没说。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_ENVELOPE',
      title: '地铁口的信封',
      description: '进站口的栏杆边躺着一个没封口的信封，里面是一沓现金和一张写着门牌号的缴费单。',
      weight: 3,
      requires: { minAge: 6 },
      options: [
        {
          label: '按地址送回去',
          effects: { luck: 6, mood: 8, will: 2 },
          result: '开门的是位老太太。她硬塞给你两个橘子，说「现在还有人会送回来」。'
        },
        {
          label: '收起来，装作没看见',
          effects: { money: 800, mood: -6, will: -2 },
          result: '钱进了口袋。之后每次经过那个进站口，你都下意识加快脚步。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_REROLL',
      title: '再来一瓶',
      description: '拧开瓶盖，里面印着四个字：再来一瓶。你换了一瓶，又中了。',
      weight: 3,
      requires: { minAge: 6 },
      options: [
        {
          label: '一直换下去，看能中几瓶',
          effects: { mood: 8, stamina: -1 },
          result: '一共中了五瓶。你抱着五瓶饮料站在便利店门口，笑得像个傻子。'
        },
        {
          label: '把中的送给同事',
          effects: { eq: 3, mood: 6 },
          result: '一下午办公室都在开瓶盖，气氛比发工资那天还好。'
        },
        {
          label: '拿去退钱',
          effects: { money: 30, mood: 2 },
          result: '老板看了你一眼，还是退了。三十块，一张整的。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_BENEFACTOR',
      title: '举手之劳',
      description: '你在路口扶了一位摔倒的老人，送到医院、垫了两百块。一周后，一辆黑色的车停在你楼下。',
      weight: 2,
      requires: { minAge: 12 },
      options: [
        {
          label: '收下感谢费',
          effects: { money: 5000, mood: 5 },
          result: '对方说这是「应该的」。钱装在信封里，比你想的厚。'
        },
        {
          label: '推辞，只要回那两百',
          effects: { money: 200, will: 5, luck: 8, mood: 8 },
          result: '老人握着你的手说了一句「好人」,声音很轻，但你记住了。'
        },
        {
          label: '收一半，剩下的捐了',
          effects: { money: 2000, eq: 3, cha: 2, mood: 6 },
          result: '对方愣了一下，然后真的去办了。转账截图发给了你。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_INHERITANCE',
      title: '远房亲戚',
      description: '一个你只在户口本上见过名字的远房亲戚走了。律师打电话来，说留了一份东西给你。',
      weight: 2,
      requires: { minAge: 18 },
      options: [
        {
          label: '全部收下',
          effects: { money: 20000, mood: -2 },
          result: '钱到账那天你没什么实感。那个人的样子，你其实想不起来。'
        },
        {
          label: '留一半，捐一半',
          effects: { money: 10000, mood: 6, eq: 3 },
          result: '你捐给了一家敬老院。收据上写着你的名字，也写着他的姓。'
        },
        {
          label: '全捐了，就当替他做件事',
          effects: { mood: 12, cha: 3, luck: 6, will: 3 },
          result: '你连收据都没留。有亲戚说你傻，你没解释。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_LOTTERY',
      title: '刮刮乐',
      description: '街角的彩票店，你随手买了一张十块的刮刮乐，刮开涂层的手有点抖。',
      weight: 3,
      requires: { minAge: 18 },
      options: [
        {
          label: '中了，见好就收',
          effects: { money: 200, mood: 8 },
          result: '两百块。你请自己吃了顿好的，剩下的塞进了钱包夹层。'
        },
        {
          label: '再买十张，趁热打铁',
          effects: { money: -100, mood: -3, luck: -2 },
          result: '十张全刮完了，一共中了三十。老板说「很正常」。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_SPRAIN',
      title: '崴脚',
      description: '下楼梯时最后一级台阶看错了高度，脚踝「咔」了一声，你扶着栏杆半天没站直。',
      weight: 3,
      requires: { minAge: 6 },
      options: [
        {
          label: '马上去医院拍片',
          effects: { money: -2000, stamina: 2, mood: -3 },
          result: '骨裂，打了石膏。医生让你一个月别乱跑，你问「能不能上班」，他看了你一眼。'
        },
        {
          label: '忍一忍，回家贴膏药',
          effects: { stamina: -8, mood: -6 },
          result: '肿了半个月。后来每逢下雨，那只脚都会先提醒你。'
        },
        {
          label: '找同事借个轮椅，撑着上班',
          effects: { money: -500, stamina: -3, will: 2 },
          result: '你被同事推着进会议室，全场鼓掌。你笑不出来。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_PHONE',
      title: '手机掉进马桶',
      description: '起身的时候手一滑，手机在空中翻了半圈，准确地、慢慢地，沉了下去。',
      weight: 3,
      requires: { minAge: 12 },
      options: [
        {
          label: '捞出来，赶紧关机晾着',
          effects: { stamina: -2, mood: -8, luck: -2 },
          result: '晾了三天，开机了，但屏幕右下角多了一块永远不会消失的水渍。'
        },
        {
          label: '直接买新的',
          effects: { money: -3000, mood: -4 },
          result: '新手机很好用。旧的那台被你扔进抽屉，一直没再打开。'
        },
        {
          label: '送去修，能修就修',
          effects: { money: -500, mood: -6 },
          result: '师傅拆开吹了半天，说「主板没事，算你运气好」。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_FRAUD',
      title: '陌生来电',
      description: '一个自称「平台客服」的电话，说你的账户涉嫌违规，需要「配合核实」，还要你把钱转到「安全账户」。',
      weight: 3,
      requires: { minAge: 18 },
      options: [
        {
          label: '直接挂断，拉黑',
          effects: { mood: 2, will: 3 },
          result: '你在网上搜了一下那个号码，第一条就是「诈骗」。'
        },
        {
          label: '听他讲完再挂',
          effects: { mood: -3, will: 1 },
          result: '他说了十分钟，逻辑严密，还报出了你的名字和身份证后四位。你挂了电话，手心有点凉。',
          nextEventId: 'E_SUDDEN_FRAUD_B'
        },
        {
          label: '按他说的操作了',
          effects: { money: -8000, mood: -15 },
          result: '转账成功的提示弹出来那一刻，你就知道完了。',
          nextEventId: 'E_SUDDEN_FRAUD_B'
        }
      ]
    },
    {
      id: 'E_SUDDEN_FRAUD_B',
      title: '追不回来的钱',
      description: '派出所的笔录做了两个小时。民警说，这类案子追回来的概率很低，让你有个心理准备。',
      weight: 1,
      chainOnly: true,
      requires: { minAge: 18 },
      options: [
        {
          label: '配合调查，等消息',
          effects: { money: 3000, mood: -8, will: 2 },
          result: '半年后追回了一部分。你签收的时候，民警说「算运气好的」。'
        },
        {
          label: '认栽，把钱当学费',
          effects: { mood: -12, will: 4, intelligence: 2 },
          result: '你把整件事写成了一篇长文发在家族群里，被转了很多次。'
        },
        {
          label: '告诉家人，被骂了一顿',
          effects: { eq: 3, mood: -6 },
          result: '你妈骂了半小时，最后说「还好人没事」。你听着，眼眶有点热。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_RENT',
      title: '黑中介',
      description: '合同签完、押金交完、钥匙拿到手，第二天房东找上门：「我没委托过任何人出租。」',
      weight: 3,
      requires: { minAge: 18, housing: 'rent' },
      options: [
        {
          label: '报警，走法律程序',
          effects: { money: -500, mood: -6, will: 4 },
          result: '中介公司第二天就注销了。案子挂在派出所，你学会了看营业执照和备案号。'
        },
        {
          label: '认栽，重新找房',
          effects: { money: -3000, mood: -10, stamina: -3 },
          result: '押金和中介费都要不回来。你在一周内搬了两次家。'
        },
        {
          label: '发动所有关系去堵那家门店',
          effects: { money: -1000, mood: -4, cha: 3, will: 2 },
          result: '你们六个人在门口坐了一下午。最后退了一半，剩下的打了欠条。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_DOG',
      title: '被狗咬',
      description: '你只是路过，那条没拴绳的狗突然冲出来，在小腿上留了两个牙印，血一下子渗了出来。',
      weight: 3,
      requires: { minAge: 6 },
      options: [
        {
          label: '立刻去打狂犬疫苗',
          effects: { money: -1500, stamina: -2, mood: -4 },
          result: '一共五针，打到第三针的时候你已经能自己数着日子了。'
        },
        {
          label: '找狗主人理论',
          effects: { money: 300, mood: -6, eq: 2 },
          result: '对方很不情愿地转了三百。疫苗还是你自己去打的。'
        },
        {
          label: '忍了，回家自己清洗',
          effects: { stamina: -4, luck: -3, mood: -6 },
          result: '伤口结了痂。那一个月你每天都查「狂犬病潜伏期」。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_CLASSMATE',
      title: '老同学',
      description: '商场二楼的扶梯上，对面那个人一直盯着你看。走到一半，两个人都笑了。',
      weight: 3,
      requires: { minAge: 20 },
      options: [
        {
          label: '一起吃个饭，聊聊这些年',
          effects: { money: -200, mood: 10, eq: 2 },
          result: '从毕业聊到工作，从工作聊到谁结婚了。结账的时候你们抢着扫码。'
        },
        {
          label: '加个微信，说改天再约',
          effects: { mood: 4, eq: 1 },
          result: '「改天」这个词，你们都懂。但那天晚上你还是翻了很久 TA 的朋友圈。'
        },
        {
          label: '点个头就走开',
          effects: { mood: -3, will: 1 },
          result: '走了十几米，你回头看了一眼，TA 也在回头。你们都装作在看别处。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_OLDCOAT',
      title: '旧衣服里的钱',
      description: '换季翻出一件好几年没穿的外套，手伸进内袋，摸到几张纸币——是上一个冬天的自己留下的。',
      weight: 3,
      requires: { minAge: 6 },
      options: [
        {
          label: '收下，当是给自己的礼物',
          effects: { money: 300, mood: 8 },
          result: '三百块。你请自己喝了杯一直舍不得点的咖啡，剩下的留着。'
        },
        {
          label: '请大家吃顿饭',
          effects: { money: 300, mood: 10, eq: 2 },
          result: '钱刚到手就花出去了。那顿饭吃了三个小时，很值。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_NEWS',
      title: '上了本地新闻',
      description: '你顺手做了件小事——把晕倒在路边的人送上救护车，然后就去上班了。三天后，记者找到了你单位。',
      weight: 2,
      requires: { minAge: 12 },
      options: [
        {
          label: '接受采访，说几句',
          effects: { cha: 5, luck: 4, mood: 10 },
          result: '新闻播了四十秒，你妈录了下来，逢人就放。'
        },
        {
          label: '婉拒，让记者别写名字',
          effects: { will: 5, mood: 6, luck: 3 },
          result: '报道里写的是「一位热心市民」。你看着这四个字，觉得比名字好。'
        },
        {
          label: '配合拍摄，但别拍脸',
          effects: { cha: 3, eq: 3, mood: 8 },
          result: '镜头里只有一个背影和一句话：「谁遇上都会这么做」。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_UMBRELLA',
      title: '雨里的伞',
      description: '暴雨突至，公交站台下挤满了人。你旁边那位没带伞，手里抱着一个怕淋的纸箱。',
      weight: 3,
      requires: { minAge: 8 },
      options: [
        {
          label: '把伞给 TA，自己淋回去',
          effects: { stamina: -3, luck: 6, mood: 8, cha: 2 },
          result: '你到家时全身湿透，但那天晚上睡得特别踏实。'
        },
        {
          label: '两个人一起打一把伞',
          effects: { cha: 3, eq: 2, mood: 6 },
          result: '一路没说什么话，但到站的时候，TA 说了句「谢谢，真的」。'
        },
        {
          label: '假装没看见',
          effects: { mood: -4, will: 1 },
          result: '车来了，你先上了。回头看时，TA 还在原地。'
        }
      ]
    },
    {
      id: 'E_SUDDEN_LETTER',
      title: '一封旧信',
      description: '整理抽屉时翻出一封很久以前的信，信封已经泛黄，收信人是你，寄信人那一栏的字迹你认得。',
      weight: 2,
      requires: { minAge: 12 },
      options: [
        {
          label: '坐下来，把它读完',
          effects: { mood: 8, will: 2 },
          result: '读完你在窗边坐了很久。有些话，隔了这么多年才听懂。'
        },
        {
          label: '合上，放回原处',
          effects: { mood: -4, will: 3 },
          result: '你知道里面写了什么。你决定让它继续待在抽屉里。'
        },
        {
          label: '想办法联系 TA',
          effects: { money: -100, mood: 5, eq: 3, luck: 2 },
          result: '电话打通了，那头愣了两秒，说「是你啊」。'
        }
      ]
    },
    {
      id: 'E_RENT_CHOICE',
      title: '租房抉择',
      description: '毕业了，你提着箱子站在城市的街头。住哪儿，是每个月都要重新回答的问题。',
      weight: 4,
      priority: true,
      requires: { onceEver: true, isStudent: false, minAge: 22, maxAge: 28 },
      options: [
        {
          label: '住在家里，省房租',
          effects: { mood: 2 },
          result: '你回了家。房租省了，但饭桌上开始出现「什么时候找对象」。',
          onChoose: function () { state.housing = 'home'; state.rentType = 'home'; state.commute = 40; }
        },
        {
          label: '市区合租，离公司近',
          effects: { mood: -3, eq: 1 },
          result: '你和两个陌生人合租。隔壁半夜煮泡面，你闻着香味饿着肚子。',
          onChoose: function () { state.housing = 'rent'; state.rentType = 'share'; state.commute = 20; }
        },
        {
          label: '市区整租，一个人住',
          effects: { mood: 4 },
          result: '一居室，租金贵，但关上门就是自己的世界。',
          onChoose: function () { state.housing = 'rent'; state.rentType = 'whole'; state.commute = 25; }
        },
        {
          label: '郊区整租，图个便宜安静',
          effects: { mood: 1, stamina: -1 },
          result: '房子大了三倍，通勤长了四倍。每天在公交上补觉。',
          onChoose: function () { state.housing = 'rent'; state.rentType = 'suburb'; state.commute = 90; }
        },
        {
          label: '先换个城市生活',
          requires: { money: { min: 5000 } },
          effects: { money: -5000 },
          result: '你把行李箱调了个方向。',
          nextEventId: 'E_MOVE_DEST'
        }
      ]
    },
    {
      id: 'E_MOVE_DEST',
      title: '搬去哪里？',
      description: '六个城市，各有各的活法。房价、工资、生活成本，全都不一样。',
      weight: 1,
      chainOnly: true,
      options: [
        { label: '北京 · 机会多，房价也高', effects: {}, result: '你拖着箱子，站在了北京的夜色里。', onChoose: function () { state.city = 'beijing'; } },
        { label: '成都 · 慢生活，物价适中', effects: {}, result: '你在成都的巷子里，闻到了花椒的香气。', onChoose: function () { state.city = 'chengdu'; } },
        { label: '长沙 · 房价友好，烟火气足', effects: {}, result: '长沙的夜宵摊，让你的胃先安了家。', onChoose: function () { state.city = 'changsha'; } },
        { label: '鹤岗 · 白菜房价，躺平圣地', effects: {}, result: '你在鹤岗，第一次觉得买房不是梦。', onChoose: function () { state.city = 'hegang'; } },
        { label: '小县城 · 安稳，机会少', effects: {}, result: '县城的日子很慢，慢到你能听见自己的呼吸。', onChoose: function () { state.city = 'county'; } },
        { label: '普通城市 · 不折腾了', effects: {}, result: '你留在了一座说不出名字的普通城市。', onChoose: function () { state.city = 'normal'; } }
      ]
    },
    {
      id: 'E_HG_FISHING',
      title: '去江边钓鱼',
      description: '鹤岗的江边很安静，连风都慢半拍。你支起鱼竿，等一条鱼，也等自己缓过来。',
      weight: 6,
      requires: { city: 'hegang', minAge: 18 },
      options: [
        { label: '钓一下午', effects: { mood: 8 }, result: '鱼没钓着几条，心却静了。' },
        { label: '钓到天黑', effects: { mood: 12, stamina: -1 }, result: '你在江边坐到了天黑，星光落在水面上。' }
      ]
    },
    {
      id: 'E_HG_MARKET',
      title: '早市买菜',
      description: '清晨的早市，两块五一斤的青菜，三块一碗的豆腐脑。日子在这里，是称得出来的。',
      weight: 5,
      requires: { city: ['hegang', 'county'], minAge: 18 },
      options: [
        { label: '逛一逛，买点菜', effects: { money: -30, mood: 6 }, result: '你拎着一兜青菜回家，觉得活着也没那么贵。' },
        { label: '只看不买，图个热闹', effects: { mood: 3 }, result: '你在人群里走了两圈，心里暖烘烘的。' }
      ]
    },
    {
      id: 'E_BJ_SUBWAY',
      title: '地铁早高峰',
      description: '北京的早高峰，你被挤成了一张照片，贴在车门上。',
      weight: 6,
      requires: { city: 'beijing', minAge: 18, maxAge: 60 },
      options: [
        { label: '硬着头皮挤上去', effects: { mood: -10, stamina: -5 }, result: '你到站的时候，衬衫已经皱了，人也像被拧过。' },
        { label: '早出门一小时避峰', effects: { mood: -3, stamina: -2 }, result: '你五点起床，赶在人群之前到了公司，趴在桌上补觉。' }
      ]
    },
    {
      id: 'E_BJ_RENT',
      title: '租不起市区的房',
      description: '房东又涨租了。中介说，同地段已经涨到一万二，你看着工资条，沉默了。',
      weight: 5,
      requires: { city: 'beijing', housing: 'rent', minAge: 22 },
      options: [
        { label: '搬到郊区，通勤认了', effects: { mood: -5 }, result: '你搬去了燕郊，每天通勤两小时。', onChoose: function () { state.rentType = 'suburb'; state.commute = 90; } },
        { label: '咬牙续租，吃土也要住市区', effects: { money: -1500, mood: -8 }, result: '你续了租，卡里又少了一截。' }
      ]
    },
    {
      id: 'E_FRIEND_DRINK',
      title: '深夜买醉',
      description: '你心里堵得慌。朋友看出你的不对劲，拉着你说：「走，喝酒去，天大的事明天再说。」',
      weight: 5,
      priority: true,
      requires: { friendFavor: 60, setbackRecent: true, minAge: 18 },
      options: [
        {
          label: '去，一醉方休',
          effects: { mood: 30, stamina: -3 },
          result: '你喝到后半夜，把委屈都吐了出来。朋友一直在旁边，没劝你，就陪着。',
          onChoose: function () {
            touchBestFriend();
            if (state.married && Math.random() < 0.5) {
              state.love = Math.max(0, (state.love || 0) - 10);
              addLog('danger', '【查岗】' + (state.spouse || '另一半') + '打来电话查岗，你满身酒气，对方很不高兴（感情 -10）。');
              var bf = bestFriend();
              if (bf) { bf.favor = Math.min(100, (bf.favor || 0) + 5); addLog('event', '【朋友】朋友帮你圆了场（好感 +5）。'); }
            }
          }
        },
        {
          label: '不去了，想一个人待着',
          effects: { mood: 3, will: 2 },
          result: '朋友没再坚持，只拍了拍你的肩。'
        }
      ]
    },
    {
      id: 'E_FRIEND_PHONE',
      title: '深夜电话',
      description: '凌晨一点，手机震了。是朋友打来的，问你最近怎么样，说「就想听听你的声音」。',
      weight: 4,
      requires: { friendFavor: 50, mood: { max: 40 }, minAge: 16 },
      options: [
        { label: '接起来，聊到天亮', effects: { mood: 15, stamina: -2 }, result: '你们从过去聊到现在，天快亮时才挂电话。', onChoose: function () { touchBestFriend(); } },
        { label: '挂断，明天再说', effects: { mood: -5 }, result: '你挂断了。第二天想回拨，又不知道从何说起。' }
      ]
    },
    {
      id: 'E_FRIEND_BIRTHDAY',
      title: '朋友的生日',
      description: '日历提醒你，今天是那位朋友的生日。',
      weight: 4,
      requires: { friendFavor: 40, minAge: 12 },
      options: [
        { label: '买个礼物送过去', effects: { money: -200, mood: 5 }, result: '朋友很惊喜，说你还记得。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.min(100, (bf.favor || 0) + 10); touchFriend(bf); } } },
        { label: '发条消息祝福', effects: { mood: 2 }, result: '你发了个红包过去，对方秒回「够意思」。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.min(100, (bf.favor || 0) + 3); touchFriend(bf); } } }
      ]
    },
    {
      id: 'E_FRIEND_BORROW',
      title: '朋友借钱',
      description: '朋友吞吞吐吐地开口：「最近手头紧，能不能借我 5000 块，下个月就还。」',
      weight: 5,
      requires: { friendTag: true, money: { min: 5000 }, minAge: 18 },
      options: [
        {
          label: '借给他',
          effects: { money: -5000 },
          result: '你把钱转了过去。他连声道谢。',
          onChoose: function () {
            var bf = bestFriend();
            if (bf) { bf.debt = { amount: 5000, outcome: (Math.random() < 0.5 ? 'repay' : 'vanish') }; touchFriend(bf); }
          }
        },
        {
          label: '婉拒，最近也紧',
          effects: { mood: -3 },
          result: '朋友没再说什么，但你们之间似乎隔了点什么。',
          onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.max(0, (bf.favor || 0) - 10); touchFriend(bf); } }
        }
      ]
    },
    {
      id: 'E_FRIEND_REPAY',
      title: '朋友还钱',
      description: '朋友如约把钱转给了你，还多转了个红包：「谢谢你当初拉了我一把。」',
      weight: 3,
      priority: true,
      requires: { friendDebt: 'repay', minAge: 18 },
      options: [
        {
          label: '收下，说声谢谢',
          effects: { money: 5000, mood: 8 },
          result: '你收下了。这份情，算是互相欠着了。',
          onChoose: function () { var f = clearDebt('repay'); if (f) { f.favor = Math.min(100, (f.favor || 0) + 20); touchFriend(f); } }
        }
      ]
    },
    {
      id: 'E_FRIEND_VANISH',
      title: '人间蒸发',
      description: '你打过去的电话，关机。发出去的消息，石沉大海。借出去的 5000 块，没了下文。',
      weight: 3,
      priority: true,
      requires: { friendDebt: 'vanish', minAge: 18 },
      options: [
        {
          label: '算了，认了',
          effects: { mood: -10 },
          result: '你把他从通讯录里删了。5000 块，买了个教训。',
          onChoose: function () {
            var f = clearDebt('vanish');
            if (f) {
              f.favor = 0;
              var list = state.friends || [];
              var idx = list.indexOf(f);
              if (idx > -1) list.splice(idx, 1);
              addLog('danger', '【朋友】「' + f.name + '」人间蒸发了，借出的 5000 打了水漂。');
            }
          }
        }
      ]
    },
    {
      id: 'E_FRIEND_GUARANTEE',
      title: '朋友求担保',
      description: '朋友想做笔生意，找你帮忙做担保：「你就签个字，出不了事。」',
      weight: 4,
      requires: { friendFavor: 70, minAge: 22 },
      options: [
        {
          label: '签字担保',
          effects: { mood: -4 },
          result: '你签了字。',
          onChoose: function () {
            var bf = bestFriend();
            if (bf) { touchFriend(bf); if (Math.random() < 0.3) { state.money = Math.max(0, (state.money || 0) - 8000); bf.favor = Math.max(0, (bf.favor || 0) - 30); addLog('danger', '【担保】朋友生意黄了，你被连累赔了 8000 元（好感 -30）。'); } }
          }
        },
        { label: '婉拒，这个忙帮不了', effects: { mood: -2 }, result: '朋友脸色有点难看，但没说什么。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.max(0, (bf.favor || 0) - 8); touchFriend(bf); } } }
      ]
    },
    {
      id: 'E_FRIEND_REFER',
      title: '朋友内推',
      description: '同事朋友跳槽去了大厂，拍着胸脯说：「我把你内推过去，比现在翻一倍。」',
      weight: 4,
      priority: true,
      requires: { friendTag: '同事', friendFavor: 70, job: '普通程序员', minAge: 22 },
      options: [
        {
          label: '接受内推',
          effects: { mood: 6 },
          result: '你更新了简历，紧张又期待。',
          onChoose: function () {
            var bf = bestFriend(); if (bf) touchFriend(bf);
            if (state.job === '普通程序员') {
              state.job = '大厂程序员';
              state.salary = JOBS['大厂程序员'] ? JOBS['大厂程序员'].salary : 20000;
              state.totalWorkYears = 0;
              state.currentPositionYears = 0;
              markJobChange();
              addLog('event', '【内推】你成功入职大厂，月薪 ' + state.salary + '。');
            }
          }
        },
        { label: '婉拒，现在挺好', effects: { mood: -2 }, result: '朋友说「机会难得啊」，你没再说话。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.max(0, (bf.favor || 0) - 5); touchFriend(bf); } } }
      ]
    },
    {
      id: 'E_FRIEND_BACKSTAB',
      title: '同事背刺',
      description: '你熬了三个通宵的方案，会上被那个「朋友」抢了功。老板夸的是他。',
      weight: 4,
      requires: { friendTag: '同事', minAge: 22, employed: true },
      options: [
        { label: '当面对质', effects: { mood: -15 }, result: '他支支吾吾，说「下次带你」。你冷笑，心凉透了。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = 0; touchFriend(bf); } } },
        { label: '忍了，山水有相逢', effects: { mood: -8, will: 3 }, result: '你记下了这笔账，也看清了一个人。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.max(0, (bf.favor || 0) - 20); touchFriend(bf); } } }
      ]
    },
    {
      id: 'E_FRIEND_PARTNER',
      title: '创业邀约',
      description: '朋友兴冲冲地找你：「咱俩合伙干一票！就缺你这 2 万块启动资金。」',
      weight: 4,
      requires: { friendFavor: 75, money: { min: 20000 }, minAge: 24 },
      options: [
        {
          label: '合伙，拼一把',
          effects: { money: -20000, mood: 5 },
          result: '你把积蓄打了过去，心里又兴奋又发虚。',
          onChoose: function () {
            var bf = bestFriend();
            if (!bf) return;
            touchFriend(bf);
            if (Math.random() < 0.5) { state.money += 40000; bf.favor = Math.min(100, (bf.favor || 0) + 15); addLog('event', '【创业】半年后项目成了，你分到 4 万，和朋友关系更铁了。'); }
            else { bf.favor = Math.max(0, (bf.favor || 0) - 25); addLog('danger', '【创业】项目黄了，2 万块打了水漂，朋友也躲着你了（好感 -25）。'); }
          }
        },
        { label: '婉拒，风险太大', effects: { mood: -3 }, result: '朋友说你「没胆」，悻悻走了。', onChoose: function () { var bf = bestFriend(); if (bf) { bf.favor = Math.max(0, (bf.favor || 0) - 10); touchFriend(bf); } } }
      ]
    },
    /* ================= v3.34 技能树与副业变现事件 ================= */
    {
      id: 'E_SKILL_CLIENT_RUN',
      title: '甲方跑路',
      description: '你熬了半个月做的外包项目，甲方突然失联了。最后一笔尾款，没了着落。',
      weight: 5,
      requires: { skill: { coding: 50 }, minAge: 18 },
      options: [
        { label: '自认倒霉，就当交学费', effects: { mood: -12, will: 3 }, result: '你删掉了所有聊天记录。有些钱，注定是学费。' },
        { label: '整理证据，试着维权', effects: { mood: -5, eq: 2, stamina: -2 }, result: '你花了一周整理证据，虽然希望渺茫，但心里没那么堵了。' }
      ]
    },
    {
      id: 'E_SKILL_NOVEL_HIT',
      title: '网文爆火',
      description: '你随手写的那本小说，突然上了平台的热搜榜。编辑连夜打来电话，要跟你签长约。',
      weight: 4,
      requires: { skill: { writing: 50 }, minAge: 18 },
      options: [
        { label: '签长约，吃一波红利', effects: { money: 8000, mood: 10, stamina: -3 }, result: '你签了字。第二天，银行卡里多了一笔你从没见过的数。' },
        { label: '慢慢写，不急着变现', effects: { mood: 5, will: 5 }, result: '你把合同放进了抽屉。故事还没讲完，先别急着卖。' }
      ]
    },
    {
      id: 'E_SKILL_LATE_PAY',
      title: '尾款拖欠',
      description: '合作方又拖尾款了，理由是「走流程」。你已经不是第一次听到这句话。',
      weight: 5,
      requires: { skill: { coding: 50 }, minAge: 18 },
      options: [
        { label: '上门催款', effects: { money: 3000, mood: -6, stamina: -3 }, result: '你在对方公司坐了一下午，终于拿到了钱。' },
        { label: '再等等，别撕破脸', effects: { mood: -4, eq: 2 }, result: '你回了个「好」。这一等，又是半个月。' }
      ]
    },
    /* v3.36：技能突破（50 级后死练无效，只能靠机缘——智力≥250 且运气≥100） */
    {
      id: 'E_SKILL_BREAK_CODE',
      title: '编程顿悟',
      description: '你盯着屏幕看了很久，突然之间，那些晦涩的概念像拼图一样对上了。',
      weight: 3,
      requires: { skill: { coding: 50 }, intelligence: { min: 250 }, luck: { min: 100 }, minAge: 18 },
      options: [
        { label: '趁热打铁，写个自己的作品', effects: { mood: 8 }, result: '你一夜没睡，写出了人生第一个像样的项目。', onChoose: function () { var sk = state.skills || (state.skills = {}); sk.coding = (sk.coding || 0) + 20; addLog('event', '【顿悟】编程 +20，当前 ' + sk.coding + '。'); } }
      ]
    },
    {
      id: 'E_SKILL_BREAK_WRITE',
      title: '写作顿悟',
      description: '你写下第一个字的时候，忽然明白了一直卡住你的那个问题。',
      weight: 3,
      requires: { skill: { writing: 50 }, intelligence: { min: 250 }, luck: { min: 100 }, minAge: 18 },
      options: [
        { label: '一气呵成，写完那个故事', effects: { mood: 8 }, result: '你写到天亮，眼泪和墨水混在了一起。', onChoose: function () { var sk = state.skills || (state.skills = {}); sk.writing = (sk.writing || 0) + 20; addLog('event', '【顿悟】写作 +20，当前 ' + sk.writing + '。'); } }
      ]
    },
    /* ================= v3.38 原生家庭与亲戚事件（10 条） =================
       防穿模：全部为常规池事件（无 nextEventId / 无 chainOnly），天然无死链、无孤儿。
       金钱惩罚 ≤10000；每个事件都留有一个不扣钱的兜底选项，避免破产死锁。 */
    {
      id: 'E_REL_URGE_MARRY',
      title: '过年催婚',
      description: '年夜饭吃到一半，三姑六婆把火力对准了你：「都这个岁数了，还不带个人回来？」',
      weight: 3,
      requires: { minAge: 22, maxAge: 40, single: true, monthIn: [1] },   // v3.38：未婚才被催婚，过年（1月）
      options: [
        { label: '敷衍过去', effects: { mood: -2 }, result: '你点头如捣蒜，心里盘算着明年找个借口不回来。' },
        { label: '把话题转到工作上', effects: { mood: -1, eq: 2 }, result: '「我最近升职了」四个字，成功堵住了所有人的嘴。' },
        { label: '认真说「还没准备好」', effects: { mood: -3, eq: 1 }, result: '桌上安静了两秒，你妈叹了口气。' }
      ]
    },
    {
      id: 'E_REL_BORROW',
      title: '亲戚借钱',
      description: '远房表哥打来电话，说孩子要交学费，想问你借一笔。',
      weight: 3,
      requires: { minAge: 25, money: { min: 30000 } },   // v3.38：有点积蓄才借得起
      options: [
        { label: '借一部分（3000）', effects: { money: -3000, mood: -2 }, result: '你转了一部分，说「剩下的我也紧」。' },
        { label: '借足额（6000）', effects: { money: -6000, mood: -3 }, result: '你咬咬牙转了账，心里却有点没底。' },
        { label: '婉拒', effects: { mood: -3, eq: 1 }, result: '你说最近手头也紧，表哥「哦」了一声挂了电话。' }
      ]
    },
    {
      id: 'E_REL_KID_FIGURE',
      title: '熊孩子弄坏手办',
      description: '过年亲戚带孩子来拜年，一声脆响——你柜子里最贵的手办摔成了两截。',
      weight: 3,
      requires: { minAge: 20, money: { min: 5000 } },   // v3.38：买得起手办说明有闲钱
      options: [
        { label: '算了算了', effects: { mood: -4 }, result: '你笑着说不值钱，回头把碎片扫进了垃圾桶。' },
        { label: '让家长照价赔', effects: { money: 500, mood: -2 }, result: '亲戚赔了钱，从此两家见面有点尴尬。' },
        { label: '憋着火教育两句', effects: { mood: -3, eq: -1 }, result: '孩子哇的一声哭了，你成了「小气」的那个人。' }
      ]
    },
    {
      id: 'E_REL_GATHERING',
      title: '家族聚会',
      description: '长辈张罗了一场大聚餐，微信群里@了所有人。',
      weight: 3,
      requires: { minAge: 16, monthIn: [1, 10] },   // v3.38：节假日聚会
      options: [
        { label: '热闹热闹', effects: { money: -200, mood: 4, eq: 1 }, result: '饭桌上聊到了很晚，你发现自己还挺想他们的。' },
        { label: '找借口不去', effects: { mood: -2 }, result: '你发了个「加班」的表情包，关掉了群消息。' }
      ]
    },
    {
      id: 'E_REL_URGE_BABY',
      title: '父母催生',
      description: '你妈又开始旁敲侧击：「隔壁老王家都抱上孙子了。」',
      weight: 3,
      requires: { married: true, minAge: 25, maxAge: 45 },
      options: [
        { label: '敷衍「再等等」', effects: { mood: -3 }, result: '「等稳定了再说」，这句话你已经说了第三年。' },
        { label: '好好聊聊顾虑', effects: { mood: -2, eq: 1 }, result: '你把房贷和育儿成本摊开算了一遍，你妈不说话了。' }
      ]
    },
    {
      id: 'E_REL_BRAG',
      title: '亲戚炫耀孩子',
      description: '饭桌上，二姨的手机在你眼前晃：「你看我家孩子，又考了年级第一。」',
      weight: 3,
      requires: { minAge: 22, maxAge: 55 },
      options: [
        { label: '微笑着听', effects: { mood: -3 }, result: '你点头夸「真厉害」，低头扒了两口饭。' },
        { label: '借故离开', effects: { mood: -1 }, result: '你说去洗手间，在走廊刷了十分钟手机。' },
        { label: '也夸自家两句', effects: { mood: 2, eq: -1 }, result: '你把自己夸得天花乱坠，桌上的人听得一愣一愣。' }
      ]
    },
    {
      id: 'E_REL_REDPACKET',
      title: '家族群抢红包',
      description: '大年初一，家族群里下起了红包雨。',
      weight: 3,
      requires: { minAge: 16, money: { min: 100 }, monthIn: [1, 2] },   // v3.38：春节抢红包
      options: [
        { label: '抢到手软', effects: { money: 80, mood: 3 }, result: '你手速惊人，抢了三个「手气最佳」。' },
        { label: '发个大点的', effects: { money: -500, mood: 2 }, result: '你包了 500 发出去，群里一片「老板大气」。' },
        { label: '潜水', effects: { mood: -1 }, result: '你看着满屏的「谢谢老板」，默默关掉了提醒。' }
      ]
    },
    {
      id: 'E_REL_SALARY',
      title: '亲戚打听工资',
      description: '「你现在一个月挣多少啊？」三姨凑过来，声音不大，全桌都听见了。',
      weight: 3,
      requires: { employed: true, minAge: 22, maxAge: 55 },
      options: [
        { label: '含糊其辞', effects: { mood: -2 }, result: '你说「够花」，三姨显然不太满意。' },
        { label: '往高了吹', effects: { mood: 2, eq: -1 }, result: '你报了个虚数，桌上安静了三秒。' },
        { label: '老实说', effects: { mood: -1, eq: 1 }, result: '你报了个实数，三姨「哦」了一声，转头问别人去了。' }
      ]
    },
    {
      id: 'E_REL_ANCESTOR',
      title: '祭祖',
      description: '清明，长辈喊你回老家上坟。',
      weight: 3,
      requires: { minAge: 16, monthIn: [4] },   // v3.38：清明（4月）祭祖
      options: [
        { label: '虔诚上香', effects: { mood: 2, will: 1 }, result: '你在墓碑前站了很久，心里忽然踏实了。' },
        { label: '心里默念几句', effects: { mood: 1 }, result: '你鞠了三个躬，把想说的话咽回了肚子里。' },
        { label: '没去', effects: { mood: -2 }, result: '你在电话里道了歉，那头沉默了很久。' }
      ]
    },
    {
      id: 'E_REL_INTRO',
      title: '亲戚介绍对象',
      description: '姑姑神秘兮兮地推来一张照片：「这姑娘/小伙不错，见见？」',
      weight: 3,
      requires: { loveState: 'single', minAge: 22, maxAge: 40 },   // v3.38：无对象才被介绍
      options: [
        { label: '见一面', effects: { mood: 2 }, result: '你答应周末去喝杯咖啡，心里有点期待。' },
        { label: '婉拒', effects: { mood: -2, eq: 1 }, result: '你说最近忙，姑姑失望地收起了手机。' }
      ]
    }
  ];
  // 合并回全局 eventsData（保持引擎抽取逻辑不变）
  for (var _i = 0; _i < lifeEvents.length; _i++) eventsData.push(lifeEvents[_i]);

  /* ================= v3.34 技能树与副业变现（行动） ================= */
  var skillActions = [
    {
      id: 'studyCode',
      name: '自学编程',
      description: '对着教程敲代码，一坐就是一下午。',
      costDays: 1,
      effects: { mood: -5, stamina: -3 },
      displayEffects: { mood: -5, stamina: -3 },
      hideWhenLocked: false,
      requires: { minAge: 12, skillMax: { coding: 49 } },
      denyText: { skillMax: '编程已达 50 瓶颈，需要机缘突破。' },
      onRun: function () {
        var sk = state.skills || (state.skills = {});
        sk.coding = (sk.coding || 0) + 10;
        addLog('event', '【技能】你埋头敲了一下午代码（编程 +10，体力 -3 心情 -5，当前 ' + sk.coding + '）。');
      }
    },
    {
      id: 'practiceWrite',
      name: '练习写作',
      description: '把想说的话写下来，一个字一个字地磨。',
      costDays: 1,
      effects: { mood: -5, stamina: -3 },
      displayEffects: { mood: -5, stamina: -3 },
      hideWhenLocked: false,
      requires: { minAge: 12, skillMax: { writing: 49 } },
      denyText: { skillMax: '写作已达 50 瓶颈，需要机缘突破。' },
      onRun: function () {
        var sk = state.skills || (state.skills = {});
        sk.writing = (sk.writing || 0) + 10;
        addLog('event', '【技能】你写了几千字，删删改改（写作 +10，体力 -3 心情 -5，当前 ' + sk.writing + '）。');
      }
    },
    {
      id: 'freelanceCode',
      name: '接外包私活',
      description: '接一个外包项目，熬夜换钱。',
      costDays: 3,
      effects: { money: 500, stamina: -2 },
      displayEffects: { money: 500, stamina: -2 },
      hideWhenLocked: true,
      requires: { skill: { coding: 50 }, minAge: 18, oncePerMonth: true },
      denyText: { skill: '编程技能不够，先自学编程到 50 点。' },
      onRun: function () {
        addLog('event', '【副业】你接了个外包私活，赚了 500 元，累得腰酸背痛。');
      }
    },
    {
      id: 'writeNovel',
      name: '写网文',
      description: '更新你的连载小说，靠读者打赏吃饭。',
      costDays: 2,
      effects: { mood: -5 },
      displayEffects: { mood: -5 },
      hideWhenLocked: true,
      requires: { skill: { writing: 50 }, minAge: 18, oncePerMonth: true },
      denyText: { skill: '写作技能不够，先练习写作到 50 点。' },
      onRun: function () {
        var income = 200 + Math.floor(Math.random() * 1001);   // 200~1200
        state.money += income;
        addLog('event', '【副业】你更新了几章小说，这个月稿费 ' + income + ' 元。');
      }
    }
  ];
  // 合并回全局 actionsData（保持引擎行动渲染不变）
  for (var _j = 0; _j < skillActions.length; _j++) actionsData.push(skillActions[_j]);
