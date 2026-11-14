/* poker-core.js —— 纯逻辑：真随机洗牌、牌力评估、蒙特卡洛胜率
 * 不依赖 DOM，可在浏览器与 Node 中直接使用（定义全局函数）。
 */
'use strict';

const SUIT_CH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_RED = { h: true, d: true };
const RANK_CH = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function cryptoRandomInt(maxExclusive) {
  // 使用 crypto 真随机
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const range = 4294967296; // 2^32
    const limit = range - (range % maxExclusive);
    const buf = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % maxExclusive;
  }
  const c = typeof require === 'function' ? require('crypto') : null;
  if (c) return c.randomInt(0, maxExclusive);
  return Math.floor(Math.random() * maxExclusive);
}

// Fisher–Yates + crypto 真随机
function cryptoShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDeck() {
  const d = [];
  for (const s of ['s', 'h', 'd', 'c']) {
    for (let r = 2; r <= 14; r++) d.push({ r, s, id: r + s });
  }
  return d;
}

/* ---- 5 张牌评估：返回可比较分数（越大越强） ---- */
function eval5(c) {
  const rs = c.map(x => x.r).sort((a, b) => b - a);
  const flush = c.every(x => x.s === c[0].s);
  const uniq = [...new Set(rs)];
  let straight = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straight = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straight = 5; // A-2-3-4-5
  }
  const cnt = {};
  for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt).map(([r, n]) => [+r, n])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let cat, tie;
  if (straight && flush) { cat = 8; tie = [straight]; }
  else if (groups[0][1] === 4) { cat = 7; tie = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; tie = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = 5; tie = rs; }
  else if (straight) { cat = 4; tie = [straight]; }
  else if (groups[0][1] === 3) { cat = 3; tie = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; tie = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2) { cat = 1; tie = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]; }
  else { cat = 0; tie = rs; }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (tie[i] || 0);
  return score;
}

const HAND_CAT_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
function handCat(score) {
  // 编码：score = cat*15^5 + k1*15^4 + ... + k5（15^5 = 759375）
  return Math.floor(score / 759375);
}
function handName(score) { return HAND_CAT_NAMES[handCat(score)]; }

/* ---- 7 选 5：返回 {score, cards(最佳5张)} ---- */
function best7(cards) {
  const n = cards.length;
  const idx = [...cards.keys()];
  let best = -1, bestCards = null;
  // 枚举所有 5 张组合
  const combo = (start, chosen) => {
    if (chosen.length === 5) {
      const sc = eval5(chosen);
      if (sc > best) { best = sc; bestCards = chosen.slice(); }
      return;
    }
    for (let i = start; i < n; i++) {
      chosen.push(cards[i]);
      combo(i + 1, chosen);
      chosen.pop();
    }
  };
  combo(0, []);
  return { score: best, cards: bestCards };
}

/* bestScore 快速版（蒙特卡洛用，不保留牌面） */
function best7Score(cards) { return best7(cards).score; }

/* ---- 蒙特卡洛胜率 ---- */
function cardKey(c) { return c.id || (c.r + c.s); }
function equity(hole, board, nOpp, iters) {
  iters = iters || 150;
  const known = new Set([...hole, ...board].map(cardKey));
  const rest = makeDeck().filter(c => !known.has(c.id));
  const needBoard = 5 - board.length;
  let shareSum = 0;
  const myAll = hole.concat(board);
  for (let t = 0; t < iters; t++) {
    cryptoShuffle(rest);
    const full = board.concat(rest.slice(0, needBoard));
    const my = best7Score(myAll.concat(full.slice(board.length)));
    let oppBest = -1;
    const scores = [];
    let cursor = needBoard;
    for (let o = 0; o < nOpp; o++) {
      const oh = [rest[cursor++], rest[cursor++]];
      const s = best7Score(full.concat(oh));
      scores.push(s);
      if (s > oppBest) oppBest = s;
    }
    if (my > oppBest) shareSum += 1;
    else if (my === oppBest) {
      // 平分时按真实份额 1/(平分人数) 计
      shareSum += 1 / (1 + scores.filter(s => s === my).length);
    }
  }
  return shareSum / iters;
}

if (typeof module !== 'undefined') {
  module.exports = { SUIT_CH, RANK_CH, makeDeck, cryptoShuffle, eval5, best7, best7Score, handCat, handName, equity };
}
