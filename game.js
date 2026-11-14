/* 金鳄会 · 德州扑克 —— 游戏流程与 UI */
'use strict';

/* ================= 全局状态 ================= */
const G = {
  players: [],        // 8 个座位
  deck: [],
  board: [],
  pot: 0,             // 已收集的底池（不含当前轮下注）
  handNo: 0,
  dealerBtn: 0,       // 庄家按钮座位
  sb: 10, bb: 20,
  currentBet: 0,
  minRaise: 20,
  stage: '',
  heroName: '大侠',
  hint: true,          // 实时决策教练（默认开）
  panel: true,          // 牌桌局势面板开关
  intel: (typeof window === 'undefined' || window.innerWidth > 720), // 手机默认收起情报卡
  running: false,
  roundActions: [],     // 当前下注轮的动作流
  handActions: [],      // 整手牌的动作流
  advice: null,         // 当前读数与建议
  resultText: '',       // 摊牌结果摘要
  openRaiser: '',       // 本手翻牌前第一个加注开池者
  openAmt: 0,
  roundOpener: '',      // 本轮第一个主动下注者
  roundOpenAmt: 0,
};

const STAGE_CN = { preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌' };
const ACT_CN = { blind: '盲注', fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注' };
const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];
let eqCache = { key: '', value: 0 };

const STATS = { hands: 0, wins: 0, biggest: 0, tips: 0 };

/* 名人阵容：名字为致敬设定，3D 形象均为虚构角色，非本人肖像 */
const BOTS = [
  { name: 'Yara',    emo: '🌹', pers: { tight: .72, aggr: .58, bluff: .28 }, style: '特邀 · 冷艳紧凶' },
  { name: 'Siaqiu',  emo: '🌸', pers: { tight: .32, aggr: .32, bluff: .16 }, style: '特邀 · 甜美松弱' },
  { name: '布兰妮',   emo: '✨', pers: { tight: .28, aggr: .78, bluff: .48 }, style: '特邀 · 表演型松凶' },
  { name: 'Tanxuan', emo: '🎩', pers: { tight: .78, aggr: .66, bluff: .22 }, style: '特邀 · 精英紧凶' },
  { name: 'Dwan',    emo: '🦈', pers: { tight: .14, aggr: .92, bluff: .58 }, style: '特邀 · 传奇松凶' },
  { name: '老狐狸',   emo: '🦊', pers: { tight: .90, aggr: .20, bluff: .05 }, style: '紧弱型' },
  { name: '算牌师',   emo: '🧮', pers: { tight: .50, aggr: .50, bluff: .20 }, style: '均衡型' },
];

const DEALER_LINES = {
  welcome: ['欢迎来到金鳄会，今晚由我陪你玩，别紧张嘛～', '坐好啦，牌和运气都交给我～', '又见面啦，这次想赢多少呢？'],
  deal: ['洗牌咯，都是真随机，来试试手气嘛～', '新的一手，我给你发好牌，别急～', '牌面朝下，先看清楚再动心哦～'],
  flop: ['翻牌来咯，看仔细了再下注嘛～', '三张一起翻，心跳有没有快一点？', '小心哦，牌面开始说话了～'],
  turn: ['转牌来了，别急着脸红嘛～', '第四张，气氛越来越热咯～'],
  river: ['最后一张咯，屏住呼吸～', '河牌落下，敢不敢跟到底？'],
  bigRaise: ['哇，好大胆嘛，我都有点紧张了～', '这么凶？看来是拿到好牌啦～', '加这么多，想吓唬谁呢～'],
  allin: ['ALL IN！胆子真大，我都不敢看了～', 'ALL IN 啦！屏住呼吸等结果哦～', '筹码全推进来了，ALL IN，好刺激～'],
  heroWin: ['恭喜你呀，手气真好，再来一把嘛～', '漂亮！这手赢得我都心动了～', '又赢啦？今晚要不要请我喝一杯～'],
  heroLose: ['别灰心嘛，下一手我给你发好牌～', '啧，好可惜，我陪你再等一手～', '输一手不算什么，稳住哦～'],
  fold: ['有人先撤啦，识时务呢～', '弃牌也是一种性感的克制哦～', '这就跑了？下次可不许啦～'],
};

/* ================= 牌手行为档案（最近 20 把 → 人格 → 压榨策略） ================= */
const PROFILES = {};       // { name: [record, ...] }，每人最多 20 手
let profSelected = null;

function posName(seat) {
  return (typeof POS_NAMES !== 'undefined' && POS_NAMES)
    ? POS_NAMES[(seat - G.dealerBtn + 8) % 8] : '—';
}

async function apiLoadProfiles() {
  try {
    const r = await fetch('/api/profiles');
    const d = await r.json();
    if (d && d.profiles) {
      Object.keys(d.profiles).forEach(k => {
        if (Array.isArray(d.profiles[k])) PROFILES[k] = d.profiles[k].slice(-20);
      });
    }
    renderProfiles();
  } catch (e) { /* 后端不可达时只用本次会话数据 */ }
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('profiles') === '1') {
      renderProfiles();
      $('modal-profiles').classList.remove('hidden');
    }
  } catch (e) {}
}

function apiSaveProfiles(records) {
  if (!records || !records.length) return;
  try {
    fetch('/api/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    }).catch(() => {});
  } catch (e) {}
}

/* 每手结算后归档 8 家的完整行为，并持久化到后端 */
function archiveHands() {
  const ts = Date.now();
  const records = [];
  G.players.forEach((p, i) => {
    const acts = G.handActions.filter(a => a.name === p.name);
    const pre = acts.filter(a => a.stage === 'preflop');
    const agg = { bet: 0, raise: 0, call: 0, check: 0, fold: 0, blind: 0 };
    acts.forEach(a => { if (agg[a.act] !== undefined) agg[a.act]++; });
    const betAmts = acts.filter(a => a.act === 'raise' || a.act === 'bet').map(a => a.amt || 0);
    const maxBet = betAmts.length ? Math.max(...betAmts) : 0;
    const rec = {
      ts: ts + i, handNo: G.handNo, pos: posName(i), seat: i,
      vpip: pre.some(a => a.act === 'call' || a.act === 'raise') ? 1 : 0,
      pfr: pre.some(a => a.act === 'raise') ? 1 : 0,
      threeBet: pre.filter(a => a.act === 'raise').length >= 2 ? 1 : 0,
      opened: p.name === G.openRaiser ? 1 : 0,
      fold: p.folded ? 1 : 0,
      showdown: (!p.folded && G.stage === 'showdown') ? 1 : 0,
      won: p.won > 0 ? 1 : 0,
      net: (p.won || 0) - (p.totalBet || 0),
      allin: acts.some(a => (a.extra || '').indexOf('全下') >= 0) ? 1 : 0,
      maxBetBB: Math.round(maxBet / Math.max(1, G.bb)),
      agg,
      line: actionLine(acts),
      acts: acts.map(a => `${STAGE_CN[a.stage] || ''}${ACT_CN[a.act] || a.act}${a.amt ? a.amt : ''}`),
    };
    const arr = PROFILES[p.name] || (PROFILES[p.name] = []);
    arr.push(rec);
    if (arr.length > 20) PROFILES[p.name] = arr.slice(-20);
    records.push({ name: p.name, record: rec });
  });
  apiSaveProfiles(records);
  renderProfiles();
}

function allProfiles() {
  const out = {};
  G.players.forEach(p => {
    if (typeof buildProfile === 'function') {
      out[p.name] = buildProfile(p.name, PROFILES[p.name] || [], { seat: p.seat, emo: p.emo });
    }
  });
  return out;
}

function renderProfiles() {
  const list = $('prof-list');
  if (!list || !G.players.length) return;
  const all = allProfiles();
  if (!profSelected || !G.players.some(p => p.name === profSelected)) {
    const t = (typeof findTarget === 'function') ? findTarget(all) : null;
    profSelected = t ? t.name : (G.players[1] ? G.players[1].name : G.players[0].name);
  }
  list.innerHTML = G.players.map(p => {
    const pr = all[p.name];
    const badge = pr ? pr.persona : { color: 'muted', emoji: '❔' };
    const cnt = pr ? pr.n : 0;
    return `<div class="prof-row${p.name === profSelected ? ' cur' : ''}" data-name="${p.name}">
      <span>${p.emo}</span><span class="pn">${p.name}</span>
      <span class="badge ${badge.color}">${badge.emoji} ${cnt}/20</span></div>`;
  }).join('');
  const rows = list.querySelectorAll ? list.querySelectorAll('.prof-row') : [];
  rows.forEach(el => {
    el.onclick = () => { profSelected = el.dataset.name; renderProfiles(); };
  });

  const pr = all[profSelected];
  const detail = $('prof-detail');
  if (!pr || !detail) return;
  const s = pr.stats;
  const pc = (x) => Math.round((x || 0) * 100) + '%';
  const stat = (k, v, ratio) => `<div class="prof-stat"><div class="k">${k}</div><div class="v">${v}</div>`
    + `<div class="bar"><i style="width:${Math.min(100, Math.max(0, Math.round((ratio || 0) * 100)))}%"></i></div></div>`;
  const grid = [
    stat('VPIP 入池率', pc(s.vpip), s.vpip),
    stat('PFR 翻前加注', pc(s.pfr), s.pfr),
    stat('3Bet 率', pc(s.bet3), Math.min(1, s.bet3 * 3)),
    stat('AF 激进度', s.af.toFixed(1), Math.min(1, s.af / 4)),
    stat('WTSD 摊牌率', pc(s.wtsd), s.wtsd),
    stat('W$SD 摊牌胜率', pc(s.wsd), s.wsd),
    stat('弃牌率', pc(s.foldRate), s.foldRate),
    stat('胜率', pc(s.winRate), s.winRate),
    stat('全下率', pc(s.allinRate), Math.min(1, s.allinRate * 3)),
    stat('累计净收益', (s.net >= 0 ? '+' : '') + s.net, Math.min(1, Math.abs(s.net) / 1000)),
  ].join('');
  detail.innerHTML = `
    <div class="prof-title">${pr.persona.emoji} ${profSelected} · ${pr.persona.name}</div>
    <div class="prof-desc">${pr.desc}</div>
    <div class="prof-sample">样本 ${pr.n}/20 手 · 常驻位置 ${pr.favPos} · 平均最大下注 ${s.avgBB.toFixed(1)} BB · 开池率 ${pc(s.openedRate)}</div>
    <div class="prof-grid">${grid}</div>
    <div class="prof-h3">🎯 压榨策略（针对他的漏洞）</div>
    <ol class="prof-exploits">${pr.exploits.map(x => `<li>${x}</li>`).join('')}</ol>
    <div class="prof-h3">🕒 最近 ${Math.min(8, pr.timeline.length)} 手行为</div>
    <div class="prof-timeline">${pr.timeline.slice(0, 8).map(t =>
      `<div class="tl-row"><span class="tl-pos">${t.pos}</span><span class="tl-line">#${t.handNo} ${t.line}${t.showdown ? ' 摊牌' : ''}</span>`
      + `<span class="tl-net ${t.net >= 0 ? 'plus' : 'minus'}">${t.result} ${t.net >= 0 ? '+' : ''}${t.net}</span></div>`
    ).join('') || '<div>还没有记录，打几手就自动生成。</div>'}</div>`;

  if (typeof findTarget === 'function') {
    const t = findTarget(all);
    const box = $('prof-target');
    if (box) box.innerHTML = t
      ? `🎯 <b>本场最值得压榨：${t.name}</b>（${t.persona.emoji} ${t.persona.name}）— ${t.tip}`
      : '🎯 再打几手就能算出谁的漏洞最大，并给出针对性压榨策略。';
    const it = $('intel-target');
    if (it) it.innerHTML = t
      ? `🎯 压榨 <b>${t.name}</b>：${(t.tip || '').replace('【核心】', '')}` : '';
  }
}

/* ================= 工具 ================= */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (n) => n.toLocaleString('zh-CN');

/* 音频调用统一入口：audio.js 未加载 / 不支持时静默降级（Node 烟测也能跑） */
function sfx(name, ...args) {
  try {
    if (typeof Sound !== 'undefined' && Sound && typeof Sound[name] === 'function') Sound[name](...args);
  } catch (e) { /* 音频不可用时不影响游戏 */ }
}
/* 3D 牌桌调用统一入口：模块未加载 / 不支持 WebGL 时静默降级 */
let t3dOn = true;
let t3dFace = false;
function t3d(name, ...args) {
  try {
    if (typeof window !== 'undefined' && window.Table3D && typeof window.Table3D[name] === 'function') window.Table3D[name](...args);
  } catch (e) { /* 3D 不可用时不影响游戏 */ }
}
function t3dSnapshot() {
  return {
    board: (G.board || []).slice(),
    pot: totalPot(),
    bb: G.bb || 20,
    stage: G.stage,
    players: (G.players || []).map(p => ({
      name: p.name, chips: p.chips, bet: p.bet, folded: !!p.folded,
      allin: !!p.allin, hole: (p.hole || []).slice(), revealed: !!p.revealed,
      isHero: !!p.isHero, won: p.won || 0, cardsFolded: !!p.cardsFolded,
      thinking: !!p.thinking,
    })),
  };
}
function t3dSync() { t3d('sync', t3dSnapshot()); }
window.Table3DReady = (info) => {
  t3dOn = !!(info && info.on);
  t3dFace = !!(info && info.focus);
  const b = $('btn-3d');
  if (b) {
    b.textContent = `🎲 3D 桌:${t3dOn ? '开' : '关'}`;
    b.classList.toggle('t3d-on', t3dOn);
  }
  const fb = $('btn-3d-face');
  if (fb) fb.textContent = t3dFace ? '🌐 回到全景' : '🔍 荷官特写';
  setTimeout(t3dSync, 350);
};
window.Table3DDealerClick = () => {
  const keys = ['greet', 'deal', 'shuffle', 'cheer', 'think', 'wow', 'heart', 'cheers'];
  dealerAct(keys[Math.floor(Math.random() * keys.length)]);
  const lines = ['哎哟，点我干嘛呀～', '想让我再发一手吗？', '别急嘛，慢慢玩～', '看我看我，牌可在我手里哦～'];
  sfx('dealerSay', lines[Math.floor(Math.random() * lines.length)]);
};
/* 点击 3D 牌手 → 打开他的行为档案 / 人格 / 压榨策略 */
window.Table3DPlayerClick = (seat) => {
  const p = G.players[seat];
  if (!p) return;
  profSelected = p.name;
  renderProfiles();
  $('modal-profiles').classList.remove('hidden');
  showShout(`📇 ${p.name} · ${p.style || '你的座位'}`, 1800);
};
function dealerAct(key, silent) {
  try {
    if (typeof Dealer !== 'undefined' && Dealer && typeof Dealer.playAction === 'function') Dealer.playAction(key, silent);
    t3d('playAction', key);
  } catch (e) { /* 荷官模块未加载时忽略 */ }
}

function log(msg, cls) {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  el.textContent = msg;
  $('log').appendChild(el);
  $('log-panel').scrollTop = 999999;
}

let dealerTimer = null;
/* voiceLine：气泡显示中文撩人文案，语音可单独指定（全下时喊标准 "All in!"） */
function dealerSay(lines, voiceLine) {
  const line = lines[Math.floor(Math.random() * lines.length)];
  if (typeof Dealer !== 'undefined' && Dealer && typeof Dealer.say === 'function') {
    Dealer.say(line);
  } else {
    $('dealer-text').textContent = line;
    $('dealer-speech').classList.add('show');
    clearTimeout(dealerTimer);
    dealerTimer = setTimeout(() => $('dealer-speech').classList.remove('show'), 3200);
  }
  if (voiceLine !== null) sfx('dealerSay', voiceLine || line);
}

/* ---- 真实感反馈：喊话播报 / 收牌 / 发牌 / 筹码 ---- */
function showShout(text, ms) {
  try {
    const el = $('shout-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('allin-shout', /ALL IN/i.test(text));
    el.classList.add('show');
    clearTimeout(showShout._t);
    showShout._t = setTimeout(() => el.classList.remove('show'), ms || 1300);
  } catch (e) {}
}

/* 弃牌：把该座位的手牌复制到浮层做「翻面收走」动画，随后牌位清空 */
function foldCards(p) {
  p.cardsFolded = true;
  try {
    const box = $('hole-' + p.seat);
    if (!box || !box.children.length || !document.body) return;
    const r = box.getBoundingClientRect();
    [...box.children].forEach((el, i) => {
      const ghost = el.cloneNode(true);
      ghost.className = el.className + ' folding';
      ghost.style.cssText = `position:fixed;left:${r.left + i * 30}px;top:${r.top}px;z-index:30;margin:0;`;
      ghost.style.animationDelay = (i * 0.07) + 's';
      document.body.appendChild(ghost);
      setTimeout(() => ghost.remove(), 850);
    });
  } catch (e) { /* Node 烟测无真实 DOM，静默降级 */ }
}

/* 一手结束：所有手牌与公共牌被荷官收走 */
function collectAllCards() {
  try {
    for (let i = 0; i < 8; i++) {
      const box = $('hole-' + i);
      if (box) [...box.children].forEach((el, j) => { el.style.animationDelay = (j * 0.05) + 's'; el.classList.add('collecting'); });
    }
    const b = $('board');
    if (b) [...b.children].forEach((el, j) => { el.style.animationDelay = (j * 0.05) + 's'; el.classList.add('collecting'); });
  } catch (e) {}
}

/* 下注筹码从座位飞向底池 */
function flyChips(seat, amt) {
  try {
    if (!document.body) return;
    const s = $('seat-' + seat), pot = $('pot-num');
    if (!s || !pot) return;
    const a = s.getBoundingClientRect(), b = pot.getBoundingClientRect();
    const n = Math.min(4, 1 + Math.floor(amt / 120));
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'chip-fly';
      d.style.left = (a.left + a.width / 2 - 8 + i * 7) + 'px';
      d.style.top = (a.top + 26) + 'px';
      d.style.setProperty('--dx', (b.left - a.left - a.width / 2 + 8) + 'px');
      d.style.setProperty('--dy', (b.top - a.top - 26) + 'px');
      d.style.animationDelay = (i * 0.05) + 's';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 800);
    }
  } catch (e) {}
}

/* 谁在说话：座位高亮一下 */
const _seatTimers = {};
function pulseSeat(seat) {
  try {
    const el = $('seat-' + seat);
    if (!el) return;
    el.classList.add('speaking');
    clearTimeout(_seatTimers[seat]);
    _seatTimers[seat] = setTimeout(() => el.classList.remove('speaking'), 1200);
  } catch (e) {}
}

/* 打赏飘字 */
function tipFloat(amount, name) {
  try {
    if (!document.body) return;
    const card = $('dealer-card');
    const r = card ? card.getBoundingClientRect() : { left: 20, top: 120 };
    const d = document.createElement('div');
    d.className = 'tip-float';
    d.textContent = `-${amount} 💐 ${name}`;
    d.style.left = (r.left + 8) + 'px';
    d.style.top = (r.top + 40) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2000);
  } catch (e) {}
}

/* 打赏荷官 */
function tipDealer(amount) {
  const hero = G.players[0];
  const name = (typeof Dealer !== 'undefined' && Dealer.config) ? Dealer.config().name : '荷官';
  if (!G.running || !hero || hero.chips < amount) {
    if (typeof Dealer !== 'undefined' && Dealer.say) Dealer.say('筹码不够啦，先赢一把再打赏嘛～', 2400);
    return;
  }
  hero.chips -= amount;
  STATS.tips = (STATS.tips || 0) + amount;
  if (typeof Dealer !== 'undefined' && Dealer.celebrate) Dealer.celebrate();
  tipFloat(amount, name);
  sfx('tipSay', amount);
  sfx('event', 'click');
  showShout(`💐 打赏 ${name} ${amount}`, 1600);
  dealerSay([amount >= 100 ? '谢谢老板！今晚我专门给你发好牌～' : '谢谢你呀，真贴心～']);
  log(`💐 你打赏了 ${name} ${amount} 积分`, 'hl');
  renderSeats(); updateTop(); apiSave();
}

function cardEl(c, faceUp) {
  if (!faceUp) { const d = document.createElement('div'); d.className = 'card back'; return d; }
  const d = document.createElement('div');
  d.className = 'card' + (c.s === 'h' || c.s === 'd' ? ' red' : '');
  d.innerHTML = `<span class="rank">${RANK_CH[c.r]}</span><span class="suit">${SUIT_CH[c.s]}</span>`;
  d.dataset.id = c.id;
  return d;
}

/* 我的手牌：放大单独展示（3D 模式下座位手牌隐藏，这里始终可见） */
function renderMyHand() {
  const box = $('mh-cards'), tag = $('mh-tag'), read = $('mh-read'), panel = $('my-hand');
  if (!box || !tag || !read || !panel) return;
  const hero = G.players[0];
  if (!hero || !hero.hole || hero.hole.length < 2) {
    box.dataset.key = '';
    box.innerHTML = '<div class="card back"></div><div class="card back"></div>';
    tag.textContent = '等待发牌';
    read.innerHTML = '入座后，你的两张底牌会放大显示在这里，并实时给出牌型与胜率';
    panel.classList.remove('mh-folded');
    return;
  }
  const key = hero.hole.map(c => c.id || (c.r + c.s)).join('|');
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = '';
    hero.hole.forEach(c => {
      const el = cardEl(c, true);
      if (G.justDealt) el.classList.add('dealt');
      box.appendChild(el);
    });
  }
  // Node vm 烟测里的假 DOM 可能没有 toggle，做一层防御
  if (typeof panel.classList.toggle === 'function') panel.classList.toggle('mh-folded', !!hero.folded);
  tag.textContent = hero.hole.map(c => RANK_CH[c.r] + SUIT_CH[c.s]).join(' ') + (hero.folded ? ' · 已弃牌' : '');
  let grade = '';
  if (G.board.length < 3) {
    const s = preflopStrength(hero.hole);
    grade = s >= .85 ? '超强起手' : s >= .70 ? '强牌' : s >= .50 ? '可玩' : s >= .32 ? '边缘牌' : '弱牌';
  }
  let made = '';
  if (G.board.length >= 3) {
    try { made = handName(best7(hero.hole.concat(G.board)).score); } catch (e) { made = ''; }
  }
  const eq = G.advice && typeof G.advice.eq === 'number' ? G.advice.eq : null;
  read.innerHTML = [
    made ? `当前牌型 <b>${made}</b>` : (grade ? `起手评估 <b>${grade}</b>` : ''),
    G.advice && G.advice.detail ? `<span class="mh-detail" style="color:#9fb3cf">${G.advice.detail}</span>` : '',
    eq !== null ? `胜率 <b>${(eq * 100).toFixed(1)}%</b>` : '',
    G.advice && G.advice.action ? `建议 <b>${G.advice.action}</b>` : '',
    hero.folded ? '<span style="color:#ff9a9a">本手已放弃</span>' : '',
  ].filter(Boolean).join(' · ');
}

/* ================= 初始化 / 存档 ================= */
async function apiLoad(name) {
  try {
    const r = await fetch(`/api/load?name=${encodeURIComponent(name)}`);
    return await r.json();
  } catch (e) { return { found: false }; }
}
async function apiSave() {
  try {
    const hero = G.players[0];
    await fetch('/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: G.heroName, chips: hero ? hero.chips : 0, stats: STATS }),
    });
  } catch (e) { log('⚠ 存档失败（后端不可达）', 'bad'); }
}
async function apiRank() {
  try {
    const r = await fetch('/api/leaderboard');
    const d = await r.json();
    const tb = $('rank-table').querySelector('tbody');
    tb.innerHTML = '';
    if (!d.list || !d.list.length) { tb.innerHTML = '<tr><td colspan="5">还没有存档，快去赢积分吧！</td></tr>'; return; }
    d.list.forEach((x, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${x.name}</td><td>${fmt(x.chips)}</td><td>${x.hands}</td><td>${x.wins}</td>`;
      tb.appendChild(tr);
    });
  } catch (e) { log('⚠ 排行榜获取失败', 'bad'); }
}

/* ================= 玩家 ================= */
function makePlayers(heroName, heroChips) {
  const seats = [];
  seats.push({ seat: 0, name: heroName, emo: '😎', chips: heroChips, isHero: true, pers: null });
  BOTS.forEach((b, i) => seats.push({ seat: i + 1, name: b.name, emo: b.emo, chips: 1000, isHero: false, pers: b.pers, style: b.style }));
  return seats.map(p => ({ ...p, hole: [], bet: 0, totalBet: 0, folded: false, allin: false, acted: false, score: 0, won: 0 }));
}

function activePlayers() { return G.players.filter(p => !p.folded && !p.allin && p.chips > 0); }
function notFolded() { return G.players.filter(p => !p.folded); }
function totalPot() { return G.pot + G.players.reduce((s, p) => s + p.bet, 0); }


/* ================= 实时决策教练（顶栏「💡 教练」）=================
 * 旧版只在轮到你时往 #hint-tip 写一行「胜率 X% · 建议 Y」，和局势面板完全重复，
 * 开关打开几乎看不出变化。现在改成：常驻教练卡 + 推荐按钮高亮 + 一键采用建议下注额，
 * 并且任何状态变化（发牌 / 别人下注 / 翻牌）都会刷新。
 */
function coachTarget(action) {
  if (!action) return '';
  if (action.indexOf('弃牌') >= 0) return 'act-fold';
  if (/加注|下注|3bet/.test(action)) return 'act-raise';
  if (action.indexOf('跟注') >= 0) return 'act-call';
  if (action.indexOf('过牌') >= 0) return 'act-check';
  return '';
}
function clearCoachHighlights() {
  ['act-fold', 'act-check', 'act-call', 'act-raise'].forEach(id => {
    const b = $(id);
    if (b && b.classList && b.classList.remove) b.classList.remove('recommended');
  });
}
function applyCoachBet() {
  const a = G.advice, s = $('raise-slider');
  if (!a || !a.bet || !s) return;
  const lo = +(s.min || 0), hi = +(s.max || 0);
  s.value = String(Math.max(lo, Math.min(hi || a.bet, a.bet)));
  updateRaiseVal();
  const b = $('coach-apply');
  if (b) b.textContent = '✓ 已填入';
}
function renderCoach() {
  const box = $('coach-tip');
  if (!box) return;
  clearCoachHighlights();
  const a = G.advice;
  if (!G.hint || !a || G.stage === 'showdown') {
    if (box.classList.add) box.classList.add('coach-off');
    box.innerHTML = '';
    return;
  }
  if (box.classList.remove) box.classList.remove('coach-off');
  const eqTxt = (a.eq * 100).toFixed(0);
  const aggressive = /加注|下注|3bet/.test(a.action);
  // 主动下注时谈「跟注所需」会自相矛盾（8 人桌胜率天然低），改讲牌力档位与位置范围
  const cmp = aggressive
    ? `${a.range.pct} 范围 · 主动建池拿主动权`
    : (a.toCall > 0
      ? `胜率 <b class="${a.eq >= a.potOdds ? 'ok' : 'bad'}">${eqTxt}%</b> ${a.eq >= a.potOdds ? '≥' : '&lt;'} 跟注所需 ${(a.potOdds * 100).toFixed(0)}%`
      : `本轮无需跟注 · 估算胜率 ${eqTxt}%`);
  const whyShort = a.why.length > 62 ? a.why.slice(0, 62) + '…' : a.why;
  box.innerHTML =
    `<div class="coach-main">🎓 <b>${a.action}</b>${a.bet > 0 ? ` · 建议${a.betLabel} <b>${fmt(a.bet)}</b>` : ''}`
    + `<span class="coach-hand">${a.code} · ${a.grade.key} 级 · ${a.pos}</span></div>`
    + `<div class="coach-why">${cmp} ｜ ${whyShort}</div>`
    + (a.bet > 0 ? `<button id="coach-apply" type="button">👉 用建议额</button>` : '')
    + `<button id="coach-range" type="button">📋 范围表</button>`;
  const ap = $('coach-apply');
  if (ap) ap.onclick = applyCoachBet;
  const rg = $('coach-range');
  if (rg) rg.onclick = () => openStrategy();
  const t = coachTarget(a.action);
  if (t) {
    const b = $(t);
    if (b && b.classList && b.classList.add) b.classList.add('recommended');
  }
}

/* ================= 局势读数 / 胜率 / 建议 ================= */
/* 听牌：同花听牌、顺子听牌的补牌张数与成牌概率 */
function computeDraws(hole, board) {
  const all = hole.concat(board);
  const suitCount = { s: 0, h: 0, d: 0, c: 0 };
  all.forEach(c => suitCount[c.s]++);
  let flushOuts = 0, flushSuit = '';
  for (const s of Object.keys(suitCount)) {
    if (suitCount[s] === 4) { flushOuts = 13 - suitCount[s]; flushSuit = SUIT_CH[s]; }
  }
  const ranks = [...new Set(all.map(c => c.r))];
  let straightOuts = 0;
  for (let lo = 2; lo <= 10; lo++) {
    const win = [lo, lo + 1, lo + 2, lo + 3, lo + 4];
    const miss = win.filter(r => !ranks.includes(r));
    if (miss.length === 1) {
      const m = miss[0];
      straightOuts = Math.max(straightOuts, (m > lo && m < lo + 4) ? 4 : 8);
    }
  }
  let outs = 0; const parts = [];
  if (flushOuts) { outs += flushOuts; parts.push(`${flushSuit}同花听牌 ${flushOuts} 张`); }
  if (straightOuts && !flushOuts) { outs += straightOuts; parts.push(`顺子听牌 ${straightOuts} 张`); }
  const unknown = Math.max(1, 52 - all.length);
  const toCome = Math.max(0, 5 - board.length);
  let pct = 0;
  if (outs && toCome) {
    let noHit = 1;
    for (let i = 0; i < toCome; i++) noHit *= (unknown - outs - i) / (unknown - i);
    pct = 1 - noHit;
  }
  return { outs, pct, text: parts.length ? `${parts.join(' + ')} ≈ ${(pct * 100).toFixed(0)}%` : '无听牌' };
}

/* 蒙特卡洛胜率缓存：只在牌面/对手数变化时重算，避免每步动作都跑 */
function heroEquityNow() {
  const hero = G.players[0];
  const alive = notFolded().length;
  const key = [G.handNo, G.board.length, alive, hero.hole.map(cardKey).join(',')].join('|');
  if (eqCache.key === key) return eqCache.value;
  const v = equity(hero.hole, G.board, Math.max(1, alive - 1), 300);
  eqCache = { key, value: v };
  return v;
}


/* ================= 起手牌范围 / 位置 / 策略引擎 =================
 * 旧版把「8 人桌绝对摊牌胜率」直接和「单街底池赔率」比较，
 * 而 8 人桌 AA 也只有约 39%、中等牌 10~15%，导致除超强牌外一律建议弃牌。
 * 现在翻前按「位置 + 起手牌范围 + 前面动作」决策；翻后才用权益/赔率/听牌，
 * 并且用 eq×人数（相对均分）而不是绝对胜率判断强弱。
 */
const RANK_TXT = r => r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q'
  : r === 11 ? 'J' : r === 10 ? 'T' : String(r);

function handCode(cards) {
  if (!cards || cards.length < 2) return '';
  const rs = cards.map(c => c.r).sort((a, b) => b - a);
  const [hi, lo] = rs;
  const suited = cards[0].s === cards[1].s;
  return RANK_TXT(hi) + RANK_TXT(lo) + (hi === lo ? '' : (suited ? 's' : 'o'));
}
function scoreFromCode(code) {
  const V = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
  const hi = V[code[0]], lo = V[code[1]];
  if (!hi || !lo) return 0;
  const suited = code[2] === 's';
  return preflopStrength([{ r: hi, s: 's' }, { r: lo, s: suited ? 's' : 'h' }]);
}

/* 8 人桌相对庄家按钮的位置 */
const POS_BY_OFFSET = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO', 'BTN'];
function heroPos() {
  const btn = G.dealerBtn | 0;
  const off = (0 - ((btn + 1) % 8) + 8) % 8;
  return POS_BY_OFFSET[off];
}
const POS_RANGE_KEY = {
  SB: 'SB', BB: 'BB', UTG: 'UTG', 'UTG+1': 'UTG',
  MP: 'MP', 'MP+1': 'CO', CO: 'CO', BTN: 'BTN',
};

/* 各位置可玩范围：open=主动加注开池门槛，call=可入池门槛（preflopStrength 分数） */
const RANGE_TABLE = {
  UTG: { label: 'UTG / UTG+1 早位', pct: '前 8%', open: .84, call: .74,
         desc: '88+ / AJ+ / KQs / QJs；早位信息最少，只玩强牌' },
  MP:  { label: 'MP 中位', pct: '前 15%', open: .75, call: .66,
         desc: '77+ / A9s+ / ATo+ / KQ / QJs / JTs' },
  CO:  { label: 'CO / MP+1', pct: '前 25%', open: .65, call: .58,
         desc: '55+ / A2s+ / A9o+ / KJ+ / QTs+ / 同花连张' },
  BTN: { label: 'BTN 庄家位', pct: '前 40%', open: .51, call: .46,
         desc: '任意对子 / 任意 Ax / K8+ / Q9+ / J9+ / 同花连张' },
  SB:  { label: 'SB 小盲', pct: '前 50%', open: .50, call: .42,
         desc: '比 BTN 稍紧（翻后没位置）；补 10 很便宜时可放宽' },
  BB:  { label: 'BB 大盲', pct: '任意两张', open: .72, call: .36,
         desc: '无人加注免费看牌；面对加注按牌力防守' },
};
const DEFENSE = {
  threeBet: .88, call: .64,
  desc: '3bet：TT+ / AQs+ / AK；跟注：22+ / 同花连张 / AJo+ / KQ；其余弃牌',
};
const RANGE_TABS = [
  ['UTG', 'UTG 早位'], ['MP', 'MP'], ['CO', 'CO'], ['BTN', 'BTN'],
  ['SB', 'SB'], ['BB', 'BB'], ['VS_OPEN', '面对加注'],
];

function gradeHand(score) {
  if (score >= .90) return { key: 'S', label: 'S 级 · 超强', pct: '前 3%' };
  if (score >= .80) return { key: 'A', label: 'A 级 · 强牌', pct: '前 8%' };
  if (score >= .68) return { key: 'B', label: 'B 级 · 可开池', pct: '前 18%' };
  if (score >= .54) return { key: 'C', label: 'C 级 · 可入池', pct: '前 35%' };
  if (score >= .40) return { key: 'D', label: 'D 级 · 边缘', pct: '前 55%' };
  return { key: 'E', label: 'E 级 · 弱牌', pct: '后 45%' };
}

function refreshAdvice() {
  const hero = G.players[0];
  if (!hero || hero.hole.length < 2) { G.advice = null; renderRoundPanel(); renderMyHand(); renderCoach(); return null; }
  const eq = heroEquityNow();
  const toCall = Math.max(0, G.currentBet - hero.bet);
  const potNow = totalPot();
  const draws = computeDraws(hero.hole, G.board);
  const boardLen = G.board.length;
  const preflop = boardLen === 0;
  const alive = notFolded().length;
  const pos = heroPos();
  const rk = POS_RANGE_KEY[pos] || 'MP';
  const range = RANGE_TABLE[rk];
  const score = preflopStrength(hero.hole);
  const grade = gradeHand(score);
  const code = handCode(hero.hole);
  const openRaiser = G.stage === 'preflop' ? (G.openRaiser || '') : '';
  const bigRaise = G.currentBet >= G.bb * 6;

  /* 底池赔率：只算已进池的钱（不含自己本轮已投的注） */
  const othersBet = G.players.reduce((sum, p) => p === hero ? sum : sum + p.bet, 0);
  const potBefore = G.pot + othersBet;
  const need = toCall > 0 ? toCall / Math.max(1, potBefore + toCall) : 0;
  const rel = eq * alive;   // >1 表示强于「按人数均分」的期望

  let madeCat = -1, madeName = '';
  if (boardLen >= 3) {
    try {
      const sc = best7(hero.hole.concat(G.board)).score;
      madeCat = handCat(sc); madeName = handName(sc);
    } catch (e) { /* 牌面未齐时忽略 */ }
  }

  let action, why, bet = 0, betLabel = '', rangeTip = '';

  if (preflop) {
    const vsOpen = !!openRaiser || G.currentBet > G.bb;
    if (vsOpen) {
      /* 已有人开池：用更紧的防守范围 */
      if (score >= DEFENSE.threeBet && !bigRaise) {
        action = '再加注(3bet)'; betLabel = '再加注到';
        bet = Math.min(hero.bet + hero.chips,
          Math.round(Math.max(G.currentBet * 2.6, G.bb * 8) / 10) * 10);
        why = `${code} 是 ${grade.label}（${grade.pct}），对抗 ${openRaiser || '对手'} 的开池范围仍有优势，用 3bet 夺回主动权`;
      } else if (score >= DEFENSE.call && !bigRaise) {
        action = '跟注';
        why = `${code} 在防守范围内，跟注看翻牌；命中两对以上或强听牌再继续，没击中就果断弃`;
      } else {
        action = '弃牌';
        why = `${code} 是 ${grade.label}（${grade.pct}），不在「对抗开池」防守范围内；${bigRaise ? '这注加得很大，' : ''}别用弱牌去碰对方的强范围`;
      }
      rangeTip = `面对加注该玩：${DEFENSE.desc}`;
    } else if (pos === 'BB' && toCall === 0) {
      action = '过牌';
      why = `大盲免费看牌，${code} 任意两张都值得看翻牌；${score >= .72 ? '这手其实很强，若有人加注可以反击' : '没击中就直接过牌/弃牌'}`;
      rangeTip = `BB 防守：${range.desc}`;
    } else {
      /* 无人开池：按位置范围主动开池 */
      const cheap = toCall <= G.bb;   // SB 补 10 / 平跟 20 都很便宜
      if (score >= range.open) {
        action = '加注开池'; betLabel = '加注到';
        bet = Math.min(hero.bet + hero.chips,
          Math.max(G.bb * 3, Math.round(potNow * 0.75 / 10) * 10));
        why = `${code} 是 ${grade.label}（${grade.pct}），在 ${pos} 的开池范围（${range.pct}）里；前面无人加注，主动加注约 3BB 偷盲 + 隔离对手`;
      } else if (score >= range.call || (cheap && score >= .40)) {
        action = (cheap && score < range.call) ? '便宜跟注' : '跟注';
        why = `${code} 在 ${pos} 的可玩范围（${range.pct}）内，${cheap ? '补注很便宜，' : '平跟看翻牌，'}但别用边缘牌翻前加注`;
      } else {
        action = '弃牌';
        why = `${code} 是 ${grade.label}（${grade.pct}），不在 ${pos} 开池范围（${range.pct}）内；8 人桌用这手牌入池长期是亏的`;
      }
      rangeTip = `${pos} 该玩：${range.desc}`;
    }
  } else {
    /* 翻后：成牌牌型 + 相对权益 + 赔率 + 听牌 */
    const strongMade = madeCat >= 2;
    const drawPct = draws.pct || 0;
    if (toCall > 0) {
      const callFloor = Math.max(0, need - .04);
      if ((eq >= need + .10 && rel >= .85 && madeCat >= 1) || (strongMade && eq >= need - .02)) {
        action = '加注'; betLabel = '加注到';
        bet = Math.min(hero.bet + hero.chips,
          Math.max(G.currentBet + G.minRaise, Math.round((G.currentBet + potNow * .65) / 10) * 10));
        why = `${madeName || '成牌'}，胜率 ${(eq * 100).toFixed(1)}% 高于跟注所需 ${(need * 100).toFixed(1)}%，加注收价值并让听牌付钱`;
      } else if (eq >= callFloor
        || (draws.outs >= 8 && eq + drawPct * .5 >= need - .04)
        || (strongMade && need < .38)) {
        action = '跟注';
        why = `胜率 ${(eq * 100).toFixed(1)}% vs 跟注所需 ${(need * 100).toFixed(1)}%`
          + (draws.outs >= 8 ? `，另有 ${draws.outs} 张补牌（≈${(drawPct * 100).toFixed(0)}%）` : '')
          + `；${strongMade ? '已成牌，继续' : '可看下一张，没改善就撤'}`;
      } else {
        action = '弃牌';
        why = `${madeName || '未成牌'}，胜率 ${(eq * 100).toFixed(1)}% 低于跟注所需 ${(need * 100).toFixed(1)}%`
          + (draws.outs ? `，补牌也只有 ${draws.outs} 张` : '，也没有听牌') + '；这注不追';
      }
    } else {
      if (strongMade || (rel >= .9 && madeCat >= 1)) {
        action = '下注'; betLabel = '下注';
        bet = Math.min(hero.chips, Math.max(G.bb, Math.round(potNow * .55 / 10) * 10));
        why = `${madeName || '顶对'}，无人下注时主动要价值（约 ½~⅔ 池），别慢打让听牌免费看牌`;
      } else if (draws.outs >= 9) {
        action = '小额下注 / 过牌'; betLabel = '半诈唬下注';
        bet = Math.min(hero.chips, Math.max(G.bb, Math.round(potNow / 3 / 10) * 10));
        why = `${draws.outs} 张补牌（≈${(drawPct * 100).toFixed(0)}%），可以半诈唬下注；被加注再按赔率算`;
      } else if (madeCat >= 1 || rel >= .55) {
        action = '过牌';
        why = `${madeName || '中等牌力'}，先控池看下一张，遇到大额下注再按赔率决定`;
      } else {
        action = '过牌';
        why = `${madeName || '未击中'}，免费看牌；有人下注且胜率不够就果断弃`;
      }
    }
    rangeTip = '翻后看的是成牌牌型 / 相对权益 / 补牌数 / 底池赔率，不再只看翻前那两张牌';
  }

  G.advice = {
    eq, toCall, potOdds: need, potNow, draws, alive, action, why, bet, betLabel,
    code, score, grade, pos, range, rangeTip,
    detail: `${code} · ${grade.label}（${grade.pct}） · ${pos}`,
    madeName, madeCat,
  };
  renderRoundPanel();
  renderMyHand();
  renderCoach();
  return G.advice;
}

/* ---- 起手牌范围表（13×13 矩阵）---- */
let rangeTab = 'BTN';
function rangeMatrixHTML(key) {
  const R = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const defMode = key === 'VS_OPEN';
  const tbl = RANGE_TABLE[key] || RANGE_TABLE.MP;
  const cur = G.advice ? G.advice.code : '';
  let h = '<div class="rg-grid"><div class="rg-c rg-corner"></div>';
  h += R.map(r => `<div class="rg-c rg-h">${r}</div>`).join('');
  for (let i = 0; i < 13; i++) {
    h += `<div class="rg-c rg-h">${R[i]}</div>`;
    for (let j = 0; j < 13; j++) {
      const a = R[Math.min(i, j)], b = R[Math.max(i, j)];
      const code = i === j ? a + b : (j > i ? a + b + 's' : a + b + 'o');
      const sc = scoreFromCode(code);
      let cls = 'rg-fold', label = code;
      if (defMode) {
        if (sc >= DEFENSE.threeBet) cls = 'rg-3bet';
        else if (sc >= DEFENSE.call) cls = 'rg-call';
      } else if (key === 'BB') {
        if (sc >= tbl.open) cls = 'rg-open'; else cls = 'rg-call';
      } else {
        if (sc >= tbl.open) cls = 'rg-open';
        else if (sc >= tbl.call) cls = 'rg-call';
      }
      if (code === cur) cls += ' cur';
      h += `<div class="rg-c ${cls}" title="${code} 强度 ${sc.toFixed(2)}">${label}</div>`;
    }
  }
  return h + '</div>';
}
function renderStrategy() {
  const tabs = $('strat-tabs'), grid = $('range-grid'), sum = $('strat-summary'), ex = $('strat-explain');
  if (!tabs || !grid) return;
  tabs.innerHTML = RANGE_TABS.map(([k, n]) =>
    `<button class="rg-tab ${k === rangeTab ? 'cur' : ''}" data-rg="${k}">${n}</button>`).join('');
  tabs.querySelectorAll('.rg-tab').forEach(b => {
    b.onclick = () => { rangeTab = b.dataset.rg; renderStrategy(); };
  });
  grid.innerHTML = rangeMatrixHTML(rangeTab);
  const a = G.advice;
  const defMode = rangeTab === 'VS_OPEN';
  const tbl = RANGE_TABLE[rangeTab] || RANGE_TABLE.MP;
  sum.innerHTML = a
    ? `你当前这手：<b>${a.code}</b> · ${a.grade.label}（${a.grade.pct}） · 位置 <b>${a.pos}</b><br>`
      + `建议：<b>${a.action}</b> —— ${a.why}<br><span style="color:#9fb3cf">${a.rangeTip}</span>`
    : '入座开局后，这里会实时解读你的手牌属于哪个档位、当前位置该不该玩。';
  ex.innerHTML = defMode
    ? `<b>面对别人的加注</b>：紫色 = 可以 3bet 反击（${DEFENSE.desc.split('；')[0]}），绿色 = 可以跟注看翻牌，灰色 = 弃牌。<br>`
      + `关键：别人开池代表的是强范围，你要比自己开池时更紧一档；没有位置、加注很大时再收紧。`
    : `<b>${tbl.label}</b>（${tbl.pct}）：<span class="rg-legend-inline">`
      + `<i class="rg-open"></i>金色 = 主动加注开池　<i class="rg-call"></i>绿色 = 可以跟注入池　<i class="rg-fold"></i>灰色 = 弃牌</span><br>`
      + `该玩的牌：${tbl.desc}。<br>`
      + `位置越靠后（BTN &gt; CO &gt; MP &gt; UTG）能玩的牌越多，因为你可以看别人先行动；`
      + `早位容易被后面的人反打，所以只玩强牌。BB 无人加注时是免费看牌，任意两张都能看翻牌。`;
}
function openStrategy() {
  rangeTab = POS_RANGE_KEY[heroPos()] || 'BTN';
  renderStrategy();
  const m = $('modal-strategy');
  if (m && m.classList.remove) m.classList.remove('hidden');
}


function recordAction(p, act, amt, extra) {
  const item = { name: p.name, act, amt: amt || 0, me: !!p.isHero, extra: extra || '' };
  G.roundActions.push(item);
  G.handActions.push(Object.assign({}, item, { stage: G.stage }));
  // 谁先 open：翻前第一个加注者 = 开池者；每条街第一个主动下注者 = 本轮先手
  if (act === 'raise' || act === 'bet') {
    if (!G.roundOpener) { G.roundOpener = p.name; G.roundOpenAmt = amt; }
    if (G.stage === 'preflop' && !G.openRaiser && amt > G.bb) {
      G.openRaiser = p.name; G.openAmt = amt;
    }
  }
  refreshAdvice();
  // 记录里全下仍是 raise/bet/call（档案分析要用），但音效与语音必须走 all-in 专属通道
  const isAllin = (extra || '').indexOf('全下') >= 0;
  const voiceAct = isAllin ? 'allin' : act;
  sfx('action', p, voiceAct);
  sfx('playerSay', p, voiceAct);

  // ---- 真实感反馈 ----
  pulseSeat(p.seat);
  if (isAllin) {
    showShout(`🔥 ${p.name}  ALL IN！`, 1900);
    t3d('playAction', 'wow');
  }
  if (act === 'fold') {
    foldCards(p);
    sfx('shout', p, 'fold');
    sfx('announce', `${p.name} 弃牌`);
    showShout(`🃏 ${p.name} 弃牌`);
    if (typeof Dealer !== 'undefined' && Dealer.say) Dealer.say(`${p.name} 弃牌，收牌咯～`, 1700);
  } else if ((act === 'check' || act === 'call') && !isAllin) {
    sfx('shout', p, act);
  }
  if ((act === 'call' || act === 'bet' || act === 'raise' || act === 'blind') && (amt || 0) > 0) {
    flyChips(p.seat, amt || 0);
  }
}

/* ---- 每人的动作时序与牌况推测 ---- */
const ACT_ICON = { blind: '▫', fold: '×', check: '–', call: '=', bet: '●', raise: '↑' };
function actionLine(acts) {
  if (!acts.length) return '—';
  return acts.slice(-7).map(a =>
    `${ACT_ICON[a.act] || ''}${a.amt && a.act !== 'check' && a.act !== 'fold' ? a.amt : ''}`
  ).join(' ');
}
function boardNotes() {
  if (G.board.length < 3) return '';
  const ranks = G.board.map(c => c.r);
  const paired = new Set(ranks).size < ranks.length;
  const suits = {};
  G.board.forEach(c => suits[c.s] = (suits[c.s] || 0) + 1);
  const flushy = Object.values(suits).some(n => n >= 3);
  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  let connected = false;
  for (let i = 0; i + 2 < uniq.length; i++) {
    if (uniq[i + 2] - uniq[i] <= 4) { connected = true; break; }
  }
  const notes = [];
  if (paired) notes.push('牌面有对→可能三条/葫芦');
  if (flushy) notes.push('三同花→可能同花/听花');
  if (connected) notes.push('连张面→可能顺子/听顺');
  return notes.length ? `；${notes.join('、')}` : '';
}

function inferPlayer(p) {
  const acts = G.handActions.filter(a => a.name === p.name);
  const line = actionLine(acts);
  if (!acts.length) return { cls: 'muted', tier: '待观察', range: '尚未行动', line };
  if (p.folded) return { cls: 'muted', tier: '已弃牌', range: '本手已放弃', line };
  if (p.revealed && p.score) return { cls: 'strong', tier: '摊牌', range: `实际牌型 ${handName(p.score)}`, line };

  const pre = acts.filter(a => a.stage === 'preflop');
  const post = acts.filter(a => a.stage !== 'preflop');
  const allin = acts.some(a => (a.extra || '').includes('全下'));
  const raisedPre = pre.some(a => a.act === 'raise');
  const limped = pre.some(a => a.act === 'call') && !raisedPre;
  const tight = p.pers ? p.pers.tight : 0.5;
  const aggr = p.pers ? p.pers.aggr : 0.5;
  const bluffy = p.pers ? p.pers.bluff : 0.2;
  const postAggr = post.filter(a => a.act === 'raise' || a.act === 'bet').length;
  const postChecks = post.filter(a => a.act === 'check').length;
  const postCalls = post.filter(a => a.act === 'call').length;

  let preRange;
  if (raisedPre) {
    preRange = tight > 0.6 ? 'TT+ / AJ+ / KQs（紧手开池）'
      : (tight > 0.35 ? '77+ / AT+ / 同花连张' : '宽范围：任意对子 / 两高张');
  } else if (limped) {
    preRange = '小对子 / 同花连张 / 弱Ax（平跟投机）';
  } else {
    preRange = '仅盲注，范围任意';
  }
  let postRange = '';
  if (allin) postRange = '全下→坚果级或大额诈唬';
  else if (postAggr > 0) postRange = '翻后主动下注→顶对以上 / 强听牌';
  else if (postChecks >= 2) postRange = '连续过牌→未击中 / 慢打埋伏';
  else if (postCalls > 0) postRange = '跟注→中等成牌 / 听牌';
  let range = postRange ? `${preRange}；${postRange}` : preRange;
  range += boardNotes();

  // 牌力档位：动作激进度 + 玩家性格可信度（确定性，不随渲染跳动）
  const raiseCnt = acts.filter(a => a.act === 'raise' || a.act === 'bet').length;
  const checkCnt = acts.filter(a => a.act === 'check').length;
  let score = (p.name === G.openRaiser ? 2 : 0) + raiseCnt * 1.4 + (allin ? 3 : 0)
    + postCalls * 0.2 - checkCnt * 0.4 + (tight - 0.5) * 2 + (aggr - 0.5) * 0.6;
  const dryBoard = G.board.length >= 3 && !boardNotes();
  let cls, tier;
  if (bluffy > 0.45 && postAggr > 0 && dryBoard) { cls = 'bluff'; tier = '可能诈唬'; }
  else if (score >= 4) { cls = 'strong'; tier = '强'; }
  else if (score >= 1.6) { cls = 'mid'; tier = '中'; }
  else { cls = 'weak'; tier = '偏弱'; }
  return { cls, tier, range, line };
}

function renderIntel() {
  const panel = $('intel-panel');
  if (!G.intel) { panel.classList.add('intel-off'); return; }
  panel.classList.remove('intel-off');
  const openTxt = G.openRaiser
    ? `开池 ${G.openRaiser} ↑${fmt(G.openAmt)}<br>本轮先手 ${G.roundOpener || '—'}`
    : (G.roundOpener ? `翻前无人开池<br>本轮先手 ${G.roundOpener}`
      : (G.handActions.length ? '本轮无人下注<br>全部过牌 / 平跟' : '等待开局'));
  $('intel-open').innerHTML = openTxt;
  $('intel-list').innerHTML = G.players.map(p => {
    const inf = inferPlayer(p);
    const openTag = (p.name === G.openRaiser) ? '<span class="ir-open-tag">OPEN</span>' : '';
    return `<div class="intel-row">
      <div class="ir-top"><b>${p.emo} ${p.name}</b><span class="ir-tier ${inf.cls}">${inf.tier}</span>${openTag}</div>
      <div class="ir-range">${inf.range}</div>
      <div class="ir-line">${inf.line}</div>
    </div>`;
  }).join('');
}

function renderRoundPanel() {
  renderIntel();
  const panel = $('round-panel');
  if (!G.panel) { panel.classList.add('rp-off'); return; }
  panel.classList.remove('rp-off');
  const a = G.advice;
  $('rp-stage').textContent = `📊 ${STAGE_CN[G.stage] || '等待开局'} · ${G.openRaiser ? '开池 ' + G.openRaiser + '↑' + fmt(G.openAmt) : '翻前无人开池'}`;
  $('rp-stats').textContent = `底池 ${fmt(totalPot())} · 当前下注 ${fmt(G.currentBet)} · 需跟注 ${fmt(a ? a.toCall : 0)} · 剩余 ${notFolded().length} 家`;
  const curIdx = STREET_ORDER.indexOf(G.stage);
  $('rp-streets').innerHTML = STREET_ORDER.map((s, i) =>
    `<span class="${i < curIdx ? 'done' : (i === curIdx ? 'cur' : '')}">${STAGE_CN[s]}</span>`).join('');
  const acts = G.roundActions.slice(-5);
  $('rp-actions').innerHTML = acts.length
    ? acts.map(x => `<div class="${x.me ? 'me' : ''} ${x.act === 'fold' ? 'fold' : ''} ${x.act === 'raise' || x.act === 'bet' ? 'aggr' : ''}">${x.name} ${ACT_CN[x.act] || x.act}${x.amt ? ' ' + fmt(x.amt) : ''}${x.extra}</div>`).join('')
    : '本轮暂无动作';
  if (G.stage === 'showdown' && G.resultText) {
    $('rp-numbers').textContent = '本手已结束 · 下一手即将开始';
    $('rp-advice').innerHTML = `🏆 ${G.resultText}`;
    $('rp-bet').textContent = '';
    return;
  }
  if (!a) {
    $('rp-numbers').innerHTML = '等待开局 · 入座后自动计算胜率';
    $('rp-advice').innerHTML = '💡 建议：先看 📖 教学 再入座';
    $('rp-bet').textContent = '';
    return;
  }
  const eqCls = a.eq >= a.potOdds + 0.03 ? 'eq-good' : ((a.eq < a.potOdds - 0.03 && a.toCall > 0) ? 'eq-bad' : '');
  $('rp-numbers').innerHTML = `胜率 <b class="${eqCls}">${(a.eq * 100).toFixed(1)}%</b> · 赔率 ${(a.potOdds * 100).toFixed(1)}% · ${a.draws.text}`;
  $('rp-advice').innerHTML = `💡 建议：<b>${a.action}</b><span class="why">${a.detail}｜${a.why}</span>`;
  $('rp-bet').innerHTML = (a.bet > 0
      ? `👉 建议${a.betLabel} <b>${fmt(a.bet)}</b>（约 ${Math.round(a.bet / Math.max(1, a.potNow) * 100)}% 底池）`
      : '👉 不投入额外筹码，保留实力')
    + ` <span class="rg-link" title="打开起手牌范围表">📋 哪些牌该玩？</span>`;
}

/* ================= 渲染 ================= */
const SEAT_POS = {}; // 由 CSS 定位，这里只渲染内容
function renderSeats() {
  for (let i = 0; i < 8; i++) {
    const p = G.players[i];
    const el = $('seat-' + i);
    if (!p) { el.innerHTML = ''; continue; }
    const toAct = activePlayers().includes(p) && !p.acted && G.stage !== 'showdown';
    const badges = [];
    if (p.folded) badges.push('<span class="status-badge fold">已弃牌</span>');
    if (p.allin) badges.push('<span class="status-badge allin">全下</span>');
    if (p.won > 0) badges.push(`<span class="status-badge winb">+${fmt(p.won)}</span>`);
    const inf = inferPlayer(p);
    const mine = G.handActions.filter(a => a.name === p.name);
    const fullLine = mine.map(a => `${STAGE_CN[a.stage] || a.stage} ${ACT_CN[a.act] || a.act}${a.amt ? ' ' + a.amt : ''}`).join(' → ') || '尚未行动';
    el.innerHTML = `
      <div class="plate ${toAct ? 'active' : ''} ${p.won > 0 ? 'winner' : ''} ${p.thinking ? 'thinking' : ''} ${p.won > 0 ? 'winner-flash' : ''}" title="${p.name} 本手动作：${fullLine}｜推测：${inf.range}">
        ${G.dealerBtn === i ? '<div class="dealer-btn-chip">庄</div>' : ''}
        ${p.name === G.openRaiser ? '<div class="open-badge">OPEN</div>' : ''}
        <div class="pname"><img class="seat-face" src="models/players/face${i}.png" alt="">${p.emo} ${p.name} ${badges.join('')}${!p.isHero && p.style && p.style.indexOf('特邀') === 0 ? '<span class="guest-badge">特邀</span>' : ''}</div>
        <div class="pchips">🪙 ${fmt(p.chips)}</div>
        ${p.thinking ? '<div class="think-tag">🤔 思考中<span class="think-dots"></span></div>' : `<div class="p-actions">${inf.line}</div>`}
        <div class="p-read ${inf.cls}">${inf.tier} · ${inf.range}</div>
        ${p.bet > 0 ? `<div class="bet-chip">下注 ${fmt(p.bet)}</div>` : ''}
      </div>
      <div class="hole-cards" id="hole-${i}"></div>`;
    const hc = $('hole-' + i);
    // 弃牌后手牌已被荷官收走，不再显示
    if (!p.cardsFolded) {
      p.hole.forEach(c => {
        const ce = cardEl(c, p.isHero || p.revealed);
        if (G.justDealt) ce.classList.add('dealt');
        hc.appendChild(ce);
      });
    }
  }
  $('pot-num').textContent = fmt(totalPot());
  t3dSync();
  renderMyHand();
}

function renderBoard() {
  const b = $('board');
  b.innerHTML = '';
  G.board.forEach(c => b.appendChild(cardEl(c, true)));
  const names = { preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: 'Showdown!' };
  $('stage-label').textContent = names[G.stage] || '';
  t3dSync();
  renderMyHand();
}

function updateTop() {
  $('blind-info').textContent = `盲注 ${G.sb}/${G.bb}`;
  $('hand-no').textContent = `第 ${G.handNo} 手`;
  $('stat-info').textContent = `战绩 ${STATS.hands}手 ${STATS.wins}胜 · 💐 ${fmt(STATS.tips || 0)}`;
}

/* ================= 一手牌流程 ================= */
function setupHand() {
  G.handNo++;
  // 盲注升级：每 12 手翻倍，封顶 160/320
  if (G.handNo > 1 && (G.handNo - 1) % 12 === 0 && G.bb < 320) {
    G.sb *= 2; G.bb *= 2;
    log(`⏰ 盲注升级为 ${G.sb}/${G.bb}`, 'hl');
    dealerSay(['盲注涨了哦，压力来到这边啦～', '盲注升级！抓紧机会吧～']);
  }
  G.deck = cryptoShuffle(makeDeck());
  G.board = [];
  G.pot = 0;
  G.stage = 'preflop';
  G.currentBet = 0;
  G.minRaise = G.bb;
  G.players.forEach(p => {
    p.bet = 0; p.totalBet = 0; p.folded = false; p.allin = false;
    p.acted = false; p.score = 0; p.won = 0; p.revealed = false;
    p.hole = []; p.cardsFolded = false; p.thinking = false;
  });
  // 破产 AI 自动买入
  G.players.forEach(p => {
    if (!p.isHero && p.chips < G.bb) { p.chips = 1000; log(`${p.name} 重新买入 1000`); }
  });
  // 发手牌
  for (let r = 0; r < 2; r++) {
    for (const p of G.players) {
      if (p.chips > 0 || p.isHero) p.hole.push(G.deck.pop());
    }
  }
  G.dealerBtn = (G.dealerBtn + 1) % 8;
  // 找到下一个有筹码的庄家位
  let guard = 0;
  while (G.players[G.dealerBtn].chips <= 0 && !G.players[G.dealerBtn].isHero && guard++ < 8) {
    G.dealerBtn = (G.dealerBtn + 1) % 8;
  }
  log(`—— 第 ${G.handNo} 手开始，庄家: ${G.players[G.dealerBtn].name} ——`, 'hl');
  G.justDealt = true;   // 本手第一次渲染走「发牌飞入」动画
  sfx('event', 'deal');
  if (G.handNo % 2 === 1) dealerAct('deal', true);   // 荷官同步做发牌动作
  dealerSay(DEALER_LINES.deal);
  G.roundActions = []; G.handActions = []; G.resultText = '';
  G.openRaiser = ''; G.openAmt = 0; G.roundOpener = ''; G.roundOpenAmt = 0;
  G.advice = null; eqCache = { key: '', value: 0 };
  refreshAdvice();
}

function postBlind(p, amt, label) {
  const real = Math.min(amt, p.chips);
  p.chips -= real; p.bet += real; p.totalBet += real;
  if (p.chips === 0) p.allin = true;
  log(`${p.name} 下${label} ${real}`);
  recordAction(p, 'blind', real, `(${label})`);
}

async function bettingRound(startSeat) {
  G.players.forEach(p => p.acted = false);
  G.minRaise = G.bb;
  G.roundActions = [];
  G.roundOpener = ''; G.roundOpenAmt = 0;
  refreshAdvice();
  let idx = startSeat;
  while (true) {
    const alive = notFolded();
    if (alive.length <= 1) break;
    const canAct = alive.filter(p => !p.allin);
    if (!canAct.length) break;
    const pending = canAct.filter(p => !p.acted || p.bet < G.currentBet);
    if (!pending.length) break;
    // 找下一个待行动座位
    let p = null, guard = 0;
    while (guard++ < 8) {
      const cand = G.players[idx % 8];
      if (pending.includes(cand)) { p = cand; idx = (idx % 8) + 1; break; }
      idx++;
    }
    if (!p) break;
    G.justDealt = false;
    if (!p.isHero) { p.thinking = true; showShout(`🤔 ${p.name} 思考中`, 900); }
    renderSeats();
    if (p.isHero) await heroAct(p);
    else await botAct(p);
    p.thinking = false;
    renderSeats();
  }
  // 收注入池
  G.players.forEach(p => { G.pot += p.bet; p.bet = 0; });
  renderSeats();
}

/* ---- 玩家行动 ---- */
let heroResolve = null;
function heroAct(p) {
  const toCall = G.currentBet - p.bet;
  $('act-fold').disabled = false;
  $('act-check').disabled = toCall > 0;
  $('act-call').disabled = toCall <= 0;
  $('act-call').textContent = toCall > 0 ? `跟注 ${fmt(Math.min(toCall, p.chips))}` : '跟注';
  // 加注滑条：最小加注额 ~ 全下
  const minRaiseTo = G.currentBet + G.minRaise;
  const maxTo = p.bet + p.chips;
  const slider = $('raise-slider');
  // 筹码不足以完成最小加注时，仍允许「短全下」
  const shortAllin = minRaiseTo > maxTo;
  slider.min = shortAllin ? maxTo : minRaiseTo;
  slider.max = maxTo;
  slider.value = shortAllin ? maxTo : Math.min(minRaiseTo + Math.round((maxTo - minRaiseTo) * 0.5 / 10) * 10, maxTo);
  slider.disabled = shortAllin;
  $('act-raise').disabled = maxTo <= G.currentBet;
  $('act-raise').textContent = shortAllin ? '全下' : (G.currentBet > 0 ? '加注到' : '下注');
  updateRaiseVal();

  // 提示
  const tip = toCall > 0
    ? `需跟注 ${fmt(toCall)} · 底池 ${fmt(totalPot())} · 你的筹码 ${fmt(p.chips)}`
    : `可免费过牌 · 底池 ${fmt(totalPot())} · 你的筹码 ${fmt(p.chips)}`;
  $('hero-stage-tip').textContent = tip;
  const adv = refreshAdvice();
  $('hint-tip').textContent = '';
  // 教练开启 + 建议主动下注时，直接把滑条预填到建议额（用户仍可手动改）
  if (G.hint && adv && adv.bet > 0 && /加注|下注|3bet/.test(adv.action) && !slider.disabled) {
    const lo = +slider.min, hi = +slider.max;
    slider.value = String(Math.max(lo, Math.min(hi, adv.bet)));
    updateRaiseVal();
  }

  return new Promise(resolve => { heroResolve = resolve; });
}

function updateRaiseVal() {
  const v = +$('raise-slider').value;
  $('raise-val').textContent = `加注到 ${fmt(v)}`;
}

function heroDo(action) {
  const p = G.players[0];
  const toCall = G.currentBet - p.bet;
  if (action === 'fold') {
    p.folded = true; p.acted = true;
    log(`你选择了弃牌`, 'bad'); dealerSay(DEALER_LINES.fold);
    recordAction(p, 'fold');
  } else if (action === 'check') {
    p.acted = true; log(`你过牌`); recordAction(p, 'check');
  } else if (action === 'call') {
    const real = Math.min(toCall, p.chips);
    p.chips -= real; p.bet += real; p.totalBet += real;
    if (p.chips === 0) p.allin = true;
    p.acted = true; log(`你跟注 ${real}${p.allin ? '（全下）' : ''}`);
    recordAction(p, 'call', real, p.allin ? '（全下）' : '');
  } else if (action === 'raise') {
    const raiseTo = +$('raise-slider').value;
    const add = Math.min(raiseTo, p.bet + p.chips) - p.bet;
    const wasBet = G.currentBet;
    p.chips -= add; p.bet += add; p.totalBet += add;
    if (p.chips === 0) p.allin = true;
    G.minRaise = Math.max(G.minRaise, (raiseTo - wasBet));
    G.currentBet = Math.max(G.currentBet, p.bet);
    G.players.forEach(x => { if (x !== p && !x.folded && !x.allin) x.acted = false; });
    p.acted = true;
    log(`你${wasBet > 0 ? '加注' : '下注'}到 ${p.bet}${p.allin ? '（全下）' : ''}`, 'hl');
    recordAction(p, wasBet > 0 ? 'raise' : 'bet', p.bet, p.allin ? '（全下）' : '');
    if (p.allin) dealerSay(DEALER_LINES.allin, 'All in!'); else if (p.bet >= totalPot() * 0.8) dealerSay(DEALER_LINES.bigRaise);
  }
  $('act-fold').disabled = $('act-check').disabled = $('act-call').disabled = $('act-raise').disabled = true;
  $('hero-stage-tip').textContent = ''; $('hint-tip').textContent = '';
  renderSeats();
  const r = heroResolve; heroResolve = null;
  if (r) setTimeout(r, 350);
}

/* ---- AI 行动 ---- */
/* 起手牌粗略强度 0~1（用于翻前开池决策，切尼尔公式简化版） */
function preflopStrength(hole) {
  const rs = hole.map(c => c.r).sort((a, b) => b - a);
  const [hi, lo] = rs;
  if (hi === lo) return 0.55 + (hi - 2) / 12 * 0.45;          // 对子：22≈0.55，AA≈1
  let s = (hi - 2) / 12 * 0.42 + (lo - 2) / 12 * 0.28;
  const gap = hi - lo;
  if (gap <= 1) s += 0.13; else if (gap <= 3) s += 0.06;
  if (hole[0].s === hole[1].s) s += 0.08;
  if (hi === 14) s += 0.05;
  return Math.min(1, s);
}

async function botAct(p) {
  // 思考时长按性格分化：紧手/被动型想得久，松凶型拍得快
  const thinkMs = Math.round(420 + p.pers.tight * 620 + (p.pers.aggr < 0.4 ? 380 : 0)
    + (G.currentBet > G.bb * 3 ? 260 : 0) + Math.random() * 520);
  await sleep(thinkMs);
  const toCall = G.currentBet - p.bet;
  const potNow = totalPot();
  const opps = Math.max(1, notFolded().length - 1);
  const pers = p.pers;
  const e = equity(p.hole, G.board, opps, 130) + (Math.random() - 0.5) * 0.07;

  const raiseTo = (size) => {
    let target = Math.min(G.currentBet + size, p.bet + p.chips);
    target = Math.max(target, G.currentBet + G.minRaise);
    target = Math.min(target, p.bet + p.chips);
    const add = target - p.bet;
    const wasBet = G.currentBet;
    p.chips -= add; p.bet += add; p.totalBet += add;
    if (p.chips === 0) p.allin = true;
    G.minRaise = Math.max(G.minRaise, target - wasBet);
    G.currentBet = Math.max(G.currentBet, p.bet);
    G.players.forEach(x => { if (x !== p && !x.folded && !x.allin) x.acted = false; });
    p.acted = true;
    log(`${p.name} ${wasBet > 0 ? '加注' : '下注'}到 ${p.bet}${p.allin ? '（全下）' : ''}`, 'hl');
    recordAction(p, wasBet > 0 ? 'raise' : 'bet', p.bet, p.allin ? '（全下）' : '');
    if (p.allin) dealerSay(DEALER_LINES.allin, 'All in!');
  };

  // 翻牌前：拿到强起手牌时主动开池（open raise），紧手门槛更高
  if (G.stage === 'preflop' && !G.openRaiser && p.chips > G.bb * 3) {
    const hs = preflopStrength(p.hole);
    const openLine = 0.60 - (1 - pers.tight) * 0.10 + (0.5 - pers.aggr) * 0.06;
    if (hs > openLine && Math.random() < 0.8) {
      const size = Math.max(G.bb * 3, Math.round(potNow * 0.8 / 10) * 10);
      raiseTo(size);
      renderSeats();
      return;
    }
  }

  if (toCall <= 0) {
    // 可免费过牌
    const openThresh = 0.5 - pers.aggr * 0.14 + pers.tight * 0.1;
    if (e > openThresh && p.chips > G.bb) {
      const size = Math.max(G.bb * 2, Math.round(potNow * (0.45 + pers.aggr * 0.45) / 10) * 10);
      raiseTo(size);
    } else if (G.stage !== 'preflop' && Math.random() < pers.bluff * 0.22 && p.chips > G.bb * 2) {
      const size = Math.max(G.bb * 2, Math.round(potNow * 0.5 / 10) * 10);
      raiseTo(size);
      log(`${p.name}（诈唬?）`);
    } else {
      p.acted = true; log(`${p.name} 过牌`); recordAction(p, 'check');
    }
  } else {
    const potOdds = toCall / (potNow + toCall);
    const callThresh = potOdds * (1 + pers.tight * 0.9) - pers.aggr * 0.02;
    const canRaise = p.chips > toCall;
    if (e > callThresh + 0.18 && canRaise && Math.random() < 0.3 + pers.aggr * 0.4) {
      const size = Math.max(G.minRaise, Math.round((toCall + potNow * (0.4 + pers.aggr * 0.4)) / 10) * 10);
      raiseTo(size);
    } else if (e > callThresh || (toCall <= G.bb && e > potOdds * 0.5)) {
      const real = Math.min(toCall, p.chips);
      p.chips -= real; p.bet += real; p.totalBet += real;
      if (p.chips === 0) p.allin = true;
      p.acted = true;
      log(`${p.name} 跟注 ${real}${p.allin ? '（全下）' : ''}`);
      recordAction(p, 'call', real, p.allin ? '（全下）' : '');
    } else {
      p.folded = true; p.acted = true;
      log(`${p.name} 弃牌`); recordAction(p, 'fold');
    }
  }
  renderSeats();
}

/* ---- 摊牌与结算 ---- */
function revealAndScore() {
  const alive = notFolded();
  alive.forEach(p => {
    p.revealed = true;
    if (p.hole.length) {
      const r = best7(p.hole.concat(G.board));
      p.score = r.score;
      p.bestCards = r.cards;
    }
  });
}

function awardPots() {
  const contribs = G.players.map(p => ({ p, amt: p.totalBet }));
  const levels = [...new Set(contribs.filter(c => c.amt > 0).map(c => c.amt))].sort((a, b) => a - b);
  let prev = 0;
  const pots = [];
  for (const L of levels) {
    let amt = 0;
    for (const c of contribs) amt += Math.min(c.amt, L) - Math.min(c.amt, prev);
    const elig = contribs.filter(c => c.amt >= L && !c.p.folded).map(c => c.p);
    pots.push({ amt, elig });
    prev = L;
  }
  const results = [];
  for (const pot of pots) {
    if (!pot.amt) continue;
    let elig = pot.elig.length ? pot.elig : notFolded();
    const best = Math.max(...elig.map(p => p.score));
    const winners = elig.filter(p => p.score === best);
    const share = Math.floor(pot.amt / winners.length);
    let rem = pot.amt - share * winners.length;
    winners.forEach(w => { w.chips += share; w.won += share; });
    winners[0].chips += rem; winners[0].won += rem;
    results.push({ winners, pot: pot.amt, score: best });
  }
  return results;
}

async function showdown() {
  G.stage = 'showdown';
  const alive = notFolded();
  if (alive.length > 1) {
    revealAndScore();
    log('—— 摊牌 ——', 'hl');
    alive.forEach(p => {
      if (p.hole.length) log(`${p.name}: ${p.hole.map(c => RANK_CH[c.r] + SUIT_CH[c.s]).join(' ')} → ${handName(p.score)}`);
    });
  }
  const results = awardPots();
  // 高亮赢家牌
  const winnerScore = Math.max(...G.players.map(p => p.score));
  renderSeats();
  document.querySelectorAll('.card').forEach(el => {
    const wp = G.players.find(p => p.score === winnerScore && p.won > 0);
    if (wp && wp.bestCards && wp.bestCards.some(c => c.id === el.dataset.id)) el.classList.add('win-glow');
  });
  const heroWon = results.some(r => r.winners.some(w => w.isHero));
  let saidWin = false, saidLose = false;
  for (const r of results) {
    const names = r.winners.map(w => w.name).join('、');
    const cat = handName(r.score);
    log(`🏆 ${names} 以「${cat}」赢得底池 ${fmt(r.pot)}`, 'good');
    if (r.winners.some(w => w.isHero)) {
      STATS.biggest = Math.max(STATS.biggest, r.pot);
      if (!saidWin) { dealerSay(DEALER_LINES.heroWin); saidWin = true; }
    } else if (G.players[0].won === 0 && !G.players[0].folded && !saidLose) {
      dealerSay(DEALER_LINES.heroLose); saidLose = true;
    }
  }
  // 胜场按「手」计，一手赢多个边池也只算 1 胜（排行榜 wins 不能大于 hands）
  if (heroWon) STATS.wins++;
  if (heroWon) dealerAct('cheer', true);
  sfx('event', heroWon ? 'win' : 'lose');
  G.resultText = results.length
    ? results.map(r => `${r.winners.map(w => w.name).join('、')} 以「${handName(r.score)}」赢 ${fmt(r.pot)}`).join(' / ')
    : '';
  updateTop();
  renderBoard(); renderSeats(); renderRoundPanel();
}

function collectBets() {
  G.players.forEach(p => { G.pot += p.bet; p.bet = 0; });
  renderSeats();
}

async function playHand() {
  setupHand();
  renderBoard(); renderSeats(); updateTop();
  G.justDealt = false;
  await sleep(900);

  // 盲注
  const sbSeat = (G.dealerBtn + 1) % 8;
  const bbSeat = (G.dealerBtn + 2) % 8;
  postBlind(G.players[sbSeat], G.sb, '小盲');
  postBlind(G.players[bbSeat], G.bb, '大盲');
  G.currentBet = G.bb;
  renderSeats(); refreshAdvice();
  await sleep(600);

  // 翻牌前：大盲下一位开始
  await bettingRound((G.dealerBtn + 3) % 8);
  if (notFolded().length > 1) {
    collectBets(); G.stage = 'flop'; G.currentBet = 0;
    for (let i = 0; i < 3; i++) G.board.push(G.deck.pop());
    renderBoard(); log(`翻牌: ${G.board.map(c => RANK_CH[c.r] + SUIT_CH[c.s]).join(' ')}`);
    sfx('event', 'flop'); dealerSay(DEALER_LINES.flop);
    refreshAdvice();
    await sleep(800);
    await bettingRound((G.dealerBtn + 1) % 8);
  }
  if (notFolded().length > 1) {
    collectBets(); G.stage = 'turn'; G.currentBet = 0;
    G.board.push(G.deck.pop());
    renderBoard(); log(`转牌: ${RANK_CH[G.board[3].r] + SUIT_CH[G.board[3].s]}`);
    sfx('event', 'turn'); dealerSay(DEALER_LINES.turn);
    refreshAdvice();
    await sleep(800);
    await bettingRound((G.dealerBtn + 1) % 8);
  }
  if (notFolded().length > 1) {
    collectBets(); G.stage = 'river'; G.currentBet = 0;
    G.board.push(G.deck.pop());
    renderBoard(); log(`河牌: ${RANK_CH[G.board[4].r] + SUIT_CH[G.board[4].s]}`);
    sfx('event', 'river'); dealerSay(DEALER_LINES.river);
    refreshAdvice();
    await sleep(800);
    await bettingRound((G.dealerBtn + 1) % 8);
  }

  // 没到河牌就只剩一人 → 直接赢
  if (notFolded().length === 1 && G.stage !== 'showdown') {
    G.stage = 'showdown';
    const w = notFolded()[0];
    w.won = G.pot; w.chips += G.pot; G.pot = 0;
    log(`🏆 ${w.name} 其他人全部弃牌，赢得底池 ${fmt(w.won)}`, 'good');
    if (w.isHero) { STATS.wins++; STATS.biggest = Math.max(STATS.biggest, w.won); dealerSay(DEALER_LINES.heroWin); }
    sfx('event', w.isHero ? 'win' : 'lose');
    G.resultText = `${w.name} 收下底池 ${fmt(w.won)}（全场弃牌）`;
    updateTop(); renderSeats(); renderRoundPanel();
  } else {
    await showdown();
  }

  STATS.hands++;
  updateTop();
  await apiSave();
  const hero = G.players[0];
  log(`—— 第 ${G.handNo} 手结束。你的筹码: ${fmt(hero.chips)} ——`, 'hl');
  archiveHands();      // 归档 8 家行为到最近 20 手并写后端
  collectAllCards();   // 荷官把桌面所有牌收走
  await sleep(2200);
  G.players.forEach(p => { p.won = 0; p.revealed = false; p.cardsFolded = false; });
}

async function gameLoop() {
  G.running = true;
  dealerSay(DEALER_LINES.welcome);
  while (G.running) {
    const hero = G.players[0];
    if (hero.chips < G.bb) {
      const keep = await maybeRebuy(hero);
      if (!keep) { G.running = false; break; }
    }
    // 盲注升级逻辑在 setupHand() 内按手数执行
    await playHand();
  }
}

let rebuyResolve = null;
function maybeRebuy(hero) {
  $('rebuy-text').textContent = `${G.heroName}，你的筹码只剩 ${fmt(hero.chips)}，不足以支付大盲。重新买入 1000 继续迎战？`;
  $('modal-rebuy').classList.remove('hidden');
  dealerSay(['哎呀，输光了呀？重新买入继续吧，我看好你哦～']);
  return new Promise(r => { rebuyResolve = r; });
}

/* ================= 教学 ================= */
const TUT_PAGES = [
  {
    title: '🃏 第 1 课 · 目标与规则',
    html: `<div class="tut">
      <p><b>德州扑克（Texas Hold'em）</b>用一副 52 张牌，每人发 2 张底牌（只有自己可见），桌面先后发出 5 张公共牌。</p>
      <p>你的最终目标：用自己的 2 张底牌 + 5 张公共牌中<b>任选 5 张</b>组成最大的牌型，比过所有对手，赢下底池积分。</p>
      <p>游戏分 4 轮下注：<b>翻牌前 → 翻牌(3张公共牌) → 转牌(第4张) → 河牌(第5张)</b>。每轮所有未弃牌玩家下注额一致后进入下一轮。</p>
      <div class="tipbox">💡 本桌为 8 人桌，你是 0 号位。积分保存在后端服务器，下次上线自动恢复。</div>
    </div>`,
  },
  {
    title: '📊 第 2 课 · 牌型大小（从小到大）',
    html: `<div class="tut">
      <table class="rank-table">
        <tr><th>牌型</th><th>说明</th></tr>
        <tr><td>高牌</td><td>啥都没有，比最大单张</td></tr>
        <tr><td>一对</td><td>两张相同点数，如 ♠A ♥A</td></tr>
        <tr><td>两对</td><td>两个对子，如 AAKK</td></tr>
        <tr><td>三条</td><td>三张相同，如 ♠7 ♥7 ♦7</td></tr>
        <tr><td>顺子</td><td>五张连续点数，如 56789（A可当最小的1: A2345）</td></tr>
        <tr><td>同花</td><td>五张同一花色</td></tr>
        <tr><td>葫芦</td><td>三条 + 一对，如 777KK</td></tr>
        <tr><td>四条</td><td>四张相同，如 ♠9♥9♦9♣9</td></tr>
        <tr><td>同花顺</td><td>同一花色的顺子，最大牌型！</td></tr>
      </table>
      <div class="tipbox">💡 同点数比花色大小不影响胜负：花色无大小，平分时平分底池。</div>
    </div>`,
  },
  {
    title: '💰 第 3 课 · 盲注与行动',
    html: `<div class="tut">
      <p><b>小盲/大盲</b>：庄家左侧两位玩家每手强制下注（本桌 10/20，每 12 手翻倍），这就是底池的起点。</p>
      <p>轮到你时可以做出 4 种动作：</p>
      <p>🔴 <b>加注/下注</b>：投入更多筹码施压（可用滑条或 ½池/满池快捷键）</p>
      <p>🟢 <b>跟注</b>：补齐与当前下注一致的筹码</p>
      <p>🔵 <b>过牌</b>：无人下注时不投钱继续看牌</p>
      <p>⚫ <b>弃牌</b>：放弃本手，已投入的筹码不退还</p>
      <p><b>全下</b>：把全部筹码推入底池，之后不再行动，摊牌时按边池规则结算。</p>
      <div class="tipbox">💡 位置很重要！越晚行动信息越多。庄家按钮（庄）是全场最好的位置。</div>
    </div>`,
  },
  {
    title: '🧮 第 4 课 · 起手牌范围与位置',
    html: `<div class="tut">
      <p>翻前不是「看胜率决定玩不玩」，而是<b>按位置选一个可玩范围</b>：位置越靠后，能玩的牌越多。8 人桌人多，早位尤其要紧。</p>
      <table class="rank-table">
        <tr><th>位置</th><th>建议范围</th><th>该玩的牌</th></tr>
        <tr><td>UTG 早位</td><td>前 8%</td><td>88+ / AJ+ / KQs</td></tr>
        <tr><td>MP 中位</td><td>前 15%</td><td>77+ / ATo+ / KQ / JTs</td></tr>
        <tr><td>CO</td><td>前 25%</td><td>55+ / A9o+ / KJ+ / 同花连张</td></tr>
        <tr><td>BTN 庄家</td><td>前 40%</td><td>任意对子 / 任意 Ax / K8+ / Q9+</td></tr>
        <tr><td>SB / BB</td><td>补注便宜更宽</td><td>BB 无人加注可免费看任意两张</td></tr>
      </table>
      <p><b>有人先加注时</b>把范围收紧一档：只用 TT+ / AQs+ / AK 去 3bet，用 22+ / 同花连张 / AJo+ 跟注，其余弃牌。</p>
      <div class="tipbox">💡 点顶栏「🎯 范围表」可看 13×13 手牌矩阵：<b>金色</b>=加注开池、<b>绿色</b>=可跟注、<b>灰色</b>=弃牌，还会用红框标出你当前这手牌，并解释为什么给这个建议。</div>
    </div>`,
  },
  {
    title: '⚔️ 第 5 课 · 底池赔率',
    html: `<div class="tut">
      <p>跟注前问自己：<b>跟注额 ÷ (底池+跟注额) = 需要的最低胜率</b></p>
      <p>例：底池 100，对手下注 50，你需跟 50 → 50/(150+50)=25%。若你的估算胜率超过 25%，跟注长期是赚的。</p>
      <p><b>听牌</b>：翻牌圈拿到四张同花/四张顺子时，补成牌约 35%/32%（两张牌到河牌），可据此追注。</p>
      <div class="tipbox">💡 AI 对手各有性格：老狐狸紧凶、疯子阿豪乱来、石头哥只玩大牌——观察下注模式，别被诈唬吓跑。右侧「🔍 玩家情报」会标出谁先开池、每人的动作串，并据此推测各家手牌范围（如紧手翻前加注≈TT+/AJ+，翻后连续过牌≈未击中）。</div>
    </div>`,
  },
  {
    title: '🎓 第 6 课 · 新手守则',
    html: `<div class="tut">
      <p>1️⃣ 前期只玩前 20% 的起手牌，紧一点不丢人。</p>
      <p>2️⃣ 位置差（庄家前）时更容易被反打，收窄范围。</p>
      <p>3️⃣ 多人跟注时，你的对子/顶对价值下降，别恋战。</p>
      <p>4️⃣ 输了几手别上头（Tilt），弃牌也是省钱。</p>
      <p>5️⃣ 记住：每一手都是独立事件，长期打期望值。</p>
      <div class="tipbox">💡 8 人桌所有人的绝对胜率都被摊薄（AA 也只有约 39%），所以别只看一个百分比就弃牌：局势面板会写清「这手牌什么档位 / 当前位置该不该玩 / 为什么给这个动作 / 建议下注多少」，配「🎯 范围表」一起看。祝旗开得胜！</div>
    </div>`,
  },
];
let tutPage = 0;
function renderTut() {
  const pg = TUT_PAGES[tutPage];
  $('tutorial-body').innerHTML = `<div class="tut"><h2>${pg.title}</h2>${pg.html}</div>`;
  $('tut-page').textContent = `${tutPage + 1} / ${TUT_PAGES.length}`;
  $('tut-prev').disabled = tutPage === 0;
  $('tut-next').textContent = tutPage === TUT_PAGES.length - 1 ? '完成 ✓' : '下一步';
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  $('act-fold').onclick = () => heroDo('fold');
  $('act-check').onclick = () => heroDo('check');
  $('act-call').onclick = () => heroDo('call');
  $('act-raise').onclick = () => heroDo('raise');
  $('raise-slider').oninput = updateRaiseVal;
  document.querySelectorAll('.preset').forEach(btn => {
    btn.onclick = () => {
      const p = G.players[0];
      const maxTo = p.bet + p.chips;
      const slider = $('raise-slider');
      if (btn.dataset.frac === 'allin') slider.value = maxTo;
      else {
        const target = G.currentBet + Math.round(totalPot() * +btn.dataset.frac / 10) * 10;
        slider.value = Math.max(+slider.min, Math.min(target, maxTo));
      }
      updateRaiseVal();
    };
  });
  $('btn-tutorial').onclick = () => { tutPage = 0; renderTut(); $('modal-tutorial').classList.remove('hidden'); };
  const md = $('mobile-dealer');
  if (md) md.onclick = () => {
    const keys = ['greet', 'deal', 'shuffle', 'cheer', 'think', 'wow', 'heart', 'cheers'];
    dealerAct(keys[Math.floor(Math.random() * keys.length)]);
    const lines = ['哎哟，点我干嘛呀～', '想让我再发一手吗？', '别急嘛，慢慢玩～', '看我看我，牌可在我手里哦～'];
    sfx('dealerSay', lines[Math.floor(Math.random() * lines.length)]);
  };
  const bs = $('btn-strategy');
  if (bs) bs.onclick = openStrategy;
  const sc = $('strat-close');
  if (sc) sc.onclick = () => $('modal-strategy').classList.add('hidden');
  document.addEventListener('click', e => {
    if (e && e.target && e.target.classList && e.target.classList.contains('rg-link')) openStrategy();
  });
  $('btn-start-tutorial').onclick = () => { tutPage = 0; renderTut(); $('modal-tutorial').classList.remove('hidden'); };
  $('tut-prev').onclick = () => { if (tutPage > 0) { tutPage--; renderTut(); } };
  $('tut-next').onclick = () => {
    if (tutPage < TUT_PAGES.length - 1) { tutPage++; renderTut(); }
    else $('modal-tutorial').classList.add('hidden');
  };
  $('tut-close').onclick = () => $('modal-tutorial').classList.add('hidden');
  $('btn-profiles').onclick = () => { renderProfiles(); $('modal-profiles').classList.remove('hidden'); };
  $('btn-3d').onclick = () => {
    const api = typeof window !== 'undefined' ? window.Table3D : null;
    if (!api || typeof api.isReady !== 'function' || !api.isReady()) {
      alert('当前浏览器不支持 WebGL，已保持 2D 牌桌');
      return;
    }
    t3dOn = !t3dOn;
    api.setOn(t3dOn);
    $('btn-3d').textContent = `🎲 3D 桌:${t3dOn ? '开' : '关'}`;
    $('btn-3d').classList.toggle('t3d-on', t3dOn);
    setTimeout(t3dSync, 120);
  };
  $('btn-3d-face').onclick = () => {
    const api = typeof window !== 'undefined' ? window.Table3D : null;
    if (!api || typeof api.focusDealer !== 'function') return;
    t3dFace = !t3dFace;
    api.focusDealer(t3dFace);
    $('btn-3d-face').textContent = t3dFace ? '🌐 回到全景' : '🔍 荷官特写';
  };
  $('prof-close').onclick = () => $('modal-profiles').classList.add('hidden');
  $('btn-rank').onclick = async () => { await apiRank(); $('modal-rank').classList.remove('hidden'); };
  $('rank-close').onclick = () => $('modal-rank').classList.add('hidden');
  $('btn-hint').textContent = `💡 教练:${G.hint ? '开' : '关'}`;
  $('btn-hint').onclick = () => {
    G.hint = !G.hint;
    $('btn-hint').textContent = `💡 教练:${G.hint ? '开' : '关'}`;
    renderCoach();
  };
  $('btn-panel').onclick = () => {
    G.panel = !G.panel;
    $('btn-panel').textContent = `📊 局势:${G.panel ? '开' : '关'}`;
    renderRoundPanel();
  };
  $('btn-intel').onclick = () => {
    G.intel = !G.intel;
    $('btn-intel').textContent = `🔍 情报:${G.intel ? '开' : '关'}`;
    renderIntel();
  };
  $('btn-music').onclick = () => {
    const on = !(typeof Sound !== 'undefined' && Sound.musicOn);
    sfx('toggleMusic', on);
    $('btn-music').textContent = `🎵 音乐:${on ? '开' : '关'}`;
  };
  $('btn-sfx').onclick = () => {
    const on = !(typeof Sound !== 'undefined' && Sound.sfxOn);
    sfx('toggleSfx', on);
    $('btn-sfx').textContent = `🔊 声音:${on ? '开' : '关'}`;
  };
  document.querySelectorAll('.tip-btn').forEach(b => {
    b.onclick = () => tipDealer(+b.dataset.tip);
  });
  if (typeof Dealer !== 'undefined' && Dealer) {
    Dealer.onLookChange = (key, name) => {
      sfx('announce', `我是${name}，请多指教～`);
      log(`✨ 荷官 / 牌手切换为 ${name}`, 'hl');
    };
  }
  $('btn-rebuy').onclick = () => {
    const hero = G.players[0];
    hero.chips = 1000;
    log(`${hero.name} 重新买入 1000`, 'hl');
    $('modal-rebuy').classList.add('hidden');
    dealerSay(['满血复活！这把一定要稳住哦～']);
    const r = rebuyResolve; rebuyResolve = null;
    if (r) r(true);
  };
  $('btn-start').onclick = startGame;
  $('input-name').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });
}

async function startGame() {
  if (G.running) return;
  const name = ($('input-name').value || '大侠').trim().replace(/["<>]/g, '').slice(0, 12) || '大侠';
  G.heroName = name;
  const rec = await apiLoad(name);
  let chips = 1000;
  if (rec.found && rec.chips > 0) chips = rec.chips;
  if (rec.found && rec.stats) Object.assign(STATS, rec.stats);
  G.players = makePlayers(name, chips);
  sfx('init');   // 用户点击「入座开局」= 手势，解锁音频
  $('modal-start').classList.add('hidden');
  $('log').innerHTML = '';
  log(`欢迎, ${name}! ${rec.found ? `已恢复后端存档: ${fmt(chips)} 积分` : '初始积分 1000'}`, 'hl');
  dealerSay(rec.found ? [`${name}，欢迎回来～你的积分都替你保管好了呢。`] : [`${name}，初次见面，我叫薇薇，今晚由我为你发牌～`]);
  updateTop();
  apiLoadProfiles();
  renderProfiles();
  gameLoop();
}

/* ================= 启动 ================= */
window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderBoard();
  // 空桌预览
  // 开局前禁用操作区（避免空桌误触）
  ['act-fold', 'act-check', 'act-call', 'act-raise'].forEach(id => $(id).disabled = true);
  $('raise-slider').disabled = true;
  G.players = makePlayers('大侠', 1000);
  renderSeats();
  updateRaiseVal();
  renderRoundPanel();
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search);
    if (params.get('tutorial') === '1') {
      tutPage = 0; renderTut(); $('modal-tutorial').classList.remove('hidden');
    }
    if (params.get('range') === '1') {
      setTimeout(openStrategy, 900);
    }
    if (params.get('demo') === '1') {
      $('input-name').value = '演示侠';
      startGame();
      setInterval(() => {
        if (typeof heroResolve !== 'undefined' && heroResolve) {
          heroDo($('act-check').disabled ? 'call' : 'check');
        }
        if (typeof rebuyResolve !== 'undefined' && rebuyResolve) {
          const r = rebuyResolve; rebuyResolve = null;
          G.players[0].chips = 1000;
          $('modal-rebuy').classList.add('hidden');
          if (r) r(true);
        }
      }, 300);
    }
    // 全下喊话直达演示：?allin=1（方便直接看/听 "All in!" 效果）
    if (params.get('allin') === '1') {
      $('modal-start').classList.add('hidden');
      setTimeout(() => {
        showShout('🔥 Dwan  ALL IN！', 9000);
        dealerSay(DEALER_LINES.allin, 'All in!');
        t3d('playAction', 'wow');
      }, 1500);
    }
  }
});
