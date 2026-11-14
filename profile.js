/* 金鳄会 · 牌手行为档案分析
 * 输入：某玩家最近 20 手的行为记录（由 game.js 每手结算时归档）
 * 输出：量化指标、人格判定、打法描述、针对性压榨策略、时间线
 * 纯逻辑，可在浏览器与 Node 中直接运行（便于单测）。
 */
'use strict';

const POS_NAMES = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'MP2', 'CO', 'HJ'];

/* 由指标判定人格（顺序即优先级） */
function judgePersona(s, n) {
  if (n < 3) return { key: 'unknown', name: '样本不足', emoji: '❔', color: 'muted' };
  if (s.allinRate >= 0.18 || (s.af >= 4 && s.vpip >= 0.4)) {
    return { key: 'maniac', name: '疯狂型 Maniac', emoji: '🤪', color: 'bluff' };
  }
  if (s.vpip >= 0.36 && s.pfr <= 0.15 && s.af <= 1.5) {
    return { key: 'station', name: '跟注站 Calling Station', emoji: '🐟', color: 'weak' };
  }
  if (s.vpip <= 0.22 && s.pfr <= 0.13) {
    return { key: 'nit', name: '石头型 Nit', emoji: '🪨', color: 'weak' };
  }
  if (s.vpip >= 0.34 && s.pfr >= 0.2 && s.af >= 2) {
    return { key: 'lag', name: '松凶型 LAG', emoji: '🔥', color: 'bluff' };
  }
  if (s.vpip <= 0.3 && s.pfr >= 0.15 && s.af >= 1.8) {
    return { key: 'tag', name: '紧凶型 TAG', emoji: '🦊', color: 'strong' };
  }
  if (s.vpip >= 0.34) {
    return { key: 'loose', name: '松弱型 Loose-Passive', emoji: '🐑', color: 'mid' };
  }
  return { key: 'balanced', name: '均衡型 ABC', emoji: '🧮', color: 'mid' };
}

const PERSONA_DESC = {
  unknown: '记录的手数还太少，继续打几手，档案会自动补全。',
  maniac: '几乎每手都要加注或全下，波动极大。他的范围里掺了大量空气牌，专靠施压逼人弃牌。',
  station: '入池很松但很少主动加注，摊牌率高、摊牌胜率低——舍不得弃牌，爱用边缘牌跟到底。',
  nit: '只玩极少数强牌，翻前加注范围非常窄，面对压力极易放弃。',
  lag: '入池宽、下注凶，位置感强，会用听牌和空气牌持续施压，是最难缠也最容易反打的对手。',
  tag: '起手牌扎实、打得有章法，翻前加注与翻后持续下注都代表真实牌力。',
  loose: '什么牌都想看一看，但拿到牌后多为被动跟注，很少主动造池。',
  balanced: '各项指标都在合理区间，没有特别明显的漏洞，需要靠位置和牌面找边缘优势。',
};

/* 压榨策略库：每种人格 5 条，另按具体指标动态追加 */
const EXPLOITS = {
  unknown: [
    '先积累 5~10 手样本再下结论，别用零散热度做判断。',
    '重点记两个数字：他翻前主动投钱的频率、面对下注弃不弃牌。',
  ],
  maniac: [
    '【核心】停止用边缘牌抓他，改用强牌设陷阱：翻前平跟诱他加注，再 3bet 或全下反打。',
    '缩小自己的开池范围，把筹码留给坚果牌；他的每次加注都在替你造大池。',
    '别在翻后跟他比 aggression，拿到顶对以上就 check-call 到河牌让他自己送。',
    '他有位置时别用中等牌入池；他在盲注时可以用宽范围偷，但准备好被 3bet。',
    '记住：他的全下不代表坚果，用真牌去接一次，波动就会反转到你这边。',
  ],
  station: [
    '【核心】彻底停止诈唬：他对下注弃牌太少，bluff 是净送钱。',
    '把价值下注打薄：第二对、顶对弱踢脚、甚至高张 A 也能下注，他会用更差的牌跟。',
    '价值下注加大尺度到 ¾ 池~满池，他对尺度不敏感，只看自己手里那两张。',
    '别慢打：他不会替你下注，强牌自己开火，否则河牌白白少一条街的价值。',
    '河牌别去抓他：他突然加注时绝大多数是真成牌，用中等牌果断弃。',
  ],
  nit: [
    '【核心】疯狂偷他的盲注：他在 SB/BB 会用绝大多数牌弃牌，任何两张都能开池。',
    '他翻前加注/3bet 时直接收紧：范围基本是 TT+/AK，用中小对子和同花连张果断弃牌。',
    '他翻后主动下注 = 顶对以上，别用一对去 bluff-catch。',
    '用位置持续施压：他在不利位置面对连续下注极易放弃，两条街足够打走他。',
    '别对他诈唬到底：一旦他跟到转牌，基本已经套池，河牌再开火是浪费筹码。',
  ],
  lag: [
    '【核心】缩紧自己的范围，让他自己送：用比平时更强的牌去跟他的三条街。',
    '用强牌慢打诱捕：翻牌拿到两对以上先过牌，让他持续开火。',
    '别用边缘牌跟他到底，他的空气牌比例高但下注尺度也大，抓错一次代价很高。',
    '在他有位置时减少入池；他在盲注时开池要准备好被 3bet，用能抗 3bet 的牌。',
    '留意他的下注尺度规律：突然变小往往是真牌，突然超池常是空气。',
  ],
  tag: [
    '【核心】他是好玩家，别硬碰：主要从他放弃的池子里拿钱（偷盲、抢死钱）。',
    '他 UTG/MP 开池时收窄跟注范围；他在 CO/BTN 开池时可以用 3bet light 反抢。',
    '翻牌他 c-bet 后，用有后门听牌的牌 float 一条街，转牌他过牌就拿下底池。',
    '别用明显的诈唬线去打他：他会算你的范围，用有阻断牌的牌型才做 bluff。',
    '把战场挪到有位置的那几手，位置是他最难受的变量。',
  ],
  loose: [
    '【核心】用更强的起手牌隔离他：翻前加注把他单独留下来打。',
    '价值下注为主、诈唬为辅：他跟注多，但也会用一些奇怪的牌抓你。',
    '翻后拿到顶对以上就连续下注两条街，他会用各种听牌和弱对子付钱。',
    '他突然加注时可信度较高，别用一对硬抓。',
    '控制底池：没有强牌时别跟他造大池，用 check 控到底。',
  ],
  balanced: [
    '没有明显漏洞，先从位置入手：只在 BTN/CO 扩大开池范围。',
    '留意他对持续下注的反应，找他 fold-to-cbet 偏高的牌面（干燥高牌面）。',
    '用下注尺度做文章：在同一牌面上，用不同尺度试探他的阈值。',
    '避免用大底池去试他，把战斗集中在小池和偷盲上。',
    '继续记录样本，等某个指标偏移到极端再切换到压榨模式。',
  ],
};

function pct(x) { return Math.round(x * 100); }
function safeDiv(a, b) { return b > 0 ? a / b : 0; }

/* 主分析函数：hands = 最近 20 手记录（旧→新） */
function buildProfile(name, hands, meta) {
  const H = Array.isArray(hands) ? hands.slice(-20) : [];
  const n = H.length;
  const sum = (f) => H.reduce((s, h) => s + (f(h) || 0), 0);
  const agg = (key) => sum(h => (h.agg && h.agg[key]) || 0);

  const vpip = safeDiv(sum(h => h.vpip ? 1 : 0), n);
  const pfr = safeDiv(sum(h => h.pfr ? 1 : 0), n);
  const bet3 = safeDiv(sum(h => h.threeBet ? 1 : 0), n);
  const foldRate = safeDiv(sum(h => h.fold ? 1 : 0), n);
  const wtsd = safeDiv(sum(h => h.showdown ? 1 : 0), n);
  const showdowns = sum(h => h.showdown ? 1 : 0);
  const wsd = safeDiv(sum(h => h.showdown && h.won ? 1 : 0), showdowns);
  const winRate = safeDiv(sum(h => h.won ? 1 : 0), n);
  const bets = agg('bet') + agg('raise');
  const calls = agg('call');
  const af = safeDiv(bets, calls);
  const allinRate = safeDiv(sum(h => h.allin ? 1 : 0), n);
  const avgBB = safeDiv(sum(h => h.maxBetBB || 0), n);
  const net = sum(h => h.net || 0);
  const openedRate = safeDiv(sum(h => h.opened ? 1 : 0), n);

  const stats = { vpip, pfr, bet3, af, wtsd, wsd, winRate, foldRate, allinRate, avgBB, net, openedRate, n };
  const persona = judgePersona(stats, n);

  const exploits = (EXPLOITS[persona.key] || EXPLOITS.balanced).slice();
  // 按具体指标追加数据驱动的补充建议
  if (n >= 5 && foldRate <= 0.18) exploits.push(`【数据】近 ${n} 手他只有 ${pct(foldRate)}% 的弃牌率，任何纯诈唬的期望值都是负的。`);
  if (n >= 5 && af >= 3) exploits.push(`【数据】激进度 AF=${af.toFixed(1)}，他绝大多数下注来自主动开火，用 check-call 设陷阱比反加注更赚。`);
  if (n >= 5 && wtsd >= 0.45 && wsd <= 0.4) exploits.push(`【数据】摊牌率 ${pct(wtsd)}% 但摊牌胜率只有 ${pct(wsd)}%，把价值下注打薄、打满三条街。`);
  if (n >= 5 && pfr <= 0.1) exploits.push(`【数据】翻前加注率仅 ${pct(pfr)}%，他平跟入池时几乎没有强牌，可以放心隔离加注。`);
  if (n >= 5 && bet3 >= 0.12) exploits.push(`【数据】3bet 率 ${pct(bet3)}%，你的开池范围要收紧，别给他免费反抢的机会。`);

  const positionCounts = {};
  H.forEach(h => { if (h.pos) positionCounts[h.pos] = (positionCounts[h.pos] || 0) + 1; });
  const favPos = Object.entries(positionCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    name, meta: meta || {}, n, stats, persona,
    desc: (PERSONA_DESC[persona.key] || PERSONA_DESC.balanced)
      + (n < 8 ? '（当前样本偏少，结论仅供参考，再打几手会更准。）' : ''),
    exploits,
    summary: `${persona.emoji} ${persona.name} · VPIP ${pct(vpip)}% / PFR ${pct(pfr)}% / AF ${af.toFixed(1)}`,
    favPos: favPos ? favPos[0] : '—',
    timeline: H.slice().reverse().map(h => ({
      handNo: h.handNo, pos: h.pos || '—',
      line: h.line || (h.acts || []).join(' '),
      result: h.won ? '赢' : (h.fold ? '弃' : '—'),
      net: h.net || 0,
      showdown: !!h.showdown,
    })),
  };
}

/* 找出全场最值得压榨的对手（漏洞分越高越好打） */
function findTarget(profiles) {
  let best = null;
  Object.values(profiles || {}).forEach(p => {
    if (!p || p.name === undefined) return;
    const s = p.stats || {};
    if ((s.n || 0) < 3) return;
    // 漏洞分：入池松 + 摊牌多 + 摊牌胜率低 + 不肯弃牌 = 最好打
    const leak = (s.vpip || 0) * 1.5 - (s.pfr || 0) * 1.2 + (s.wtsd || 0) * 1.0
      - (s.wsd || 0) * 1.0 + (1 - (s.foldRate || 0)) * 0.8;
    const bonus = p.persona
      ? ({ station: 1.5, loose: 1.2, maniac: 0.8, nit: 0.4, lag: 0.2 }[p.persona.key] || 0) : 0;
    const score = leak + bonus;
    if (!best || score > best.score) best = { name: p.name, persona: p.persona, score, tip: (p.exploits || [])[0] || '' };
  });
  return best;
}

if (typeof module !== 'undefined') {
  module.exports = { buildProfile, judgePersona, findTarget, POS_NAMES, EXPLOITS };
}
