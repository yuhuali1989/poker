/* 金鳄会 · 声音引擎
 * 纯 Web Audio API + SpeechSynthesis，无需任何外部音频文件：
 *  - 程序化生成的爵士 lounge 背景音乐（ii-V-I 循环 + 贝斯 + 鼓刷）
 *  - 8 个座位各自音色的动作音效
 *  - 中文语音：荷官薇薇（妩媚女声）+ 各玩家（按性格配 pitch/rate）
 * 浏览器自动播放策略：首次点击/按键后由 Sound.init() 解锁。
 */
'use strict';

const Sound = {
  ctx: null, master: null, musicGain: null, sfxGain: null, noiseBuf: null,
  musicOn: true, sfxOn: true, ready: false,
  voices: { female: null, male: null, any: null },
  musicTimer: null, nextBarTime: 0, bar: 0, lastSpeak: 0, lastShout: 0, lastVoiceStart: 0, unlocked: false,

  init() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ready = true;
      this.loadVoices();
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
      if (this.musicOn) this.startMusic();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { console.warn('[Sound] 初始化失败', e); }
  },

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.init();
  },

  loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const vs = window.speechSynthesis.getVoices() || [];
    const zh = vs.filter(v => /zh|cmn|Chinese/i.test(v.lang));
    const female = zh.find(v => /female|xiaoxiao|huihui|yaoyao|tingting|女|mei|lili|xiaoyi/i.test(v.name));
    const male = zh.find(v => /male|kangkang|yunxi|yunyang|男|qiang|zhizhe/i.test(v.name));
    // 英文嗓音：喊 "All in!" 这类扑克术语时用，中文 TTS 会把术语念成字母
    const en = vs.filter(v => /^en([-_]|$)/i.test(v.lang));
    const enFemale = en.find(v => /female|zira|samantha|victoria|karen|moira|tessa|fiona|aria|jenny|eva/i.test(v.name));
    const enMale = en.find(v => /male|david|daniel|alex|george|ryan|mark|guy|james/i.test(v.name));
    this.voices = {
      female: female || zh[0] || vs[0] || null,
      male: male || zh[0] || vs[0] || null,
      any: zh[0] || vs[0] || null,
      enFemale: enFemale || en[0] || null,
      enMale: enMale || en[0] || null,
      enAny: en[0] || null,
    };
  },

  /* ---------- 基础合成 ---------- */
  tone(freq, time, dur, vol, wave, dest) {
    if (!this.ready) return;
    const t = Math.max(time, this.ctx.currentTime + 0.001);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(time, dur, vol, hp, dest) {
    if (!this.ready) return;
    const t = Math.max(time, this.ctx.currentTime + 0.001);
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 3000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  },
  kick(time, vol) {
    if (!this.ready) return;
    const t = Math.max(time, this.ctx.currentTime + 0.001);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(vol || 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  },

  /* ---------- 背景音乐：Dm7 - G7 - Cmaj7 - A7 ---------- */
  scheduleBar(t, i) {
    const chords = [
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
      [48, 52, 55, 59], // Cmaj7
      [45, 49, 52, 55], // A7
    ];
    const roots = [38, 43, 36, 45]; // D2 G2 C2 A2
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const ch = chords[i % 4];
    ch.forEach((m, k) => this.tone(mtof(m), t + k * 0.018, 1.85, 0.026, 'triangle', this.musicGain));
    for (let b = 0; b < 4; b++) {
      const m = roots[i % 4] + (b % 2 ? 7 : 0);
      this.tone(mtof(m), t + b * 0.5, 0.36, 0.075, 'sine', this.musicGain);
    }
    for (let b = 0; b < 8; b++) this.noise(t + b * 0.25 + (b % 2 ? 0.02 : 0), 0.035, 0.011, 6000, this.musicGain);
    [0, 2].forEach(b => this.kick(t + b * 0.5, 0.055));
    this.tone(mtof(ch[3] + 12), t + 1.5, 0.22, 0.014, 'sine', this.musicGain);
  },
  startMusic() {
    if (!this.ready || this.musicTimer) return;
    this.musicGain.gain.setTargetAtTime(0.30, this.ctx.currentTime, 0.4);
    this.nextBarTime = this.ctx.currentTime + 0.12;
    this.bar = 0;
    const loop = () => {
      if (!this.ready || !this.musicOn) return;
      const now = this.ctx.currentTime;
      // 标签页挂起 / 系统休眠恢复后 currentTime 会大幅跳跃：
      // 直接重新对齐节拍，绝不批量补拍（否则会瞬间创建上千个振荡器把页面卡死）
      if (this.nextBarTime < now - 0.5) this.nextBarTime = now + 0.05;
      let guard = 0;
      while (this.nextBarTime < now + 0.6 && guard++ < 4) {
        this.scheduleBar(this.nextBarTime, this.bar++);
        this.nextBarTime += 2;
      }
    };
    loop();
    this.musicTimer = setInterval(loop, 120);
  },
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.ready) this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
  },
  toggleMusic(on) {
    this.musicOn = on;
    if (on) { this.init(); this.startMusic(); } else this.stopMusic();
  },
  toggleSfx(on) {
    this.sfxOn = on;
    if (!on && 'speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    if (on) this.init();
  },

  /* ---------- 每人的动作音效（音色按座位区分） ---------- */
  SEAT_TONE: {
    0: { wave: 'triangle', base: 523.25 }, // 你：明亮 C5
    1: { wave: 'sawtooth', base: 196.00 }, // 老狐狸：低沉 G3
    2: { wave: 'square', base: 659.25 },   // 疯子：尖锐 E5
    3: { wave: 'sine', base: 146.83 },     // 石头：闷 D3
    4: { wave: 'triangle', base: 392.00 }, // 算牌师：清亮 G4
    5: { wave: 'sine', base: 783.99 },     // 小美：叮咚 G5
    6: { wave: 'sawtooth', base: 164.81 }, // 鲨鱼：凶 E3
    7: { wave: 'square', base: 329.63 },   // 铁娘子：冷 E4
  },
  action(p, act) {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const tone = this.SEAT_TONE[p.seat] || this.SEAT_TONE[1];
    const seq = {
      blind: [0], check: [0], call: [0, 1], fold: [0, 1],
      bet: [0, 1, 2], raise: [0, 1, 2], allin: [0, 1, 2, 3, 4],
    }[act] || [0];
    seq.forEach((_, i) => {
      const semi = act === 'fold' ? -i * 3 : i * 2;
      const f = tone.base * Math.pow(2, semi / 12);
      this.tone(f, t + i * 0.07, act === 'allin' ? 0.16 : 0.1, 0.15 / (1 + i * 0.35), tone.wave);
    });
    if (act === 'allin') {
      this.tone(tone.base / 2, t, 0.55, 0.1, 'sawtooth');
      this.noise(t, 0.3, 0.035, 1200);
    }
    if (act === 'fold') this.noise(t, 0.09, 0.02, 2000);
  },

  /* ---------- 事件音效 ---------- */
  event(kind) {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    if (kind === 'deal') {
      this.noise(t, 0.15, 0.055, 2200);
      this.noise(t + 0.1, 0.12, 0.04, 2800);
    } else if (kind === 'flop' || kind === 'turn' || kind === 'river') {
      [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.07, 0.14, 0.085, 'triangle'));
    } else if (kind === 'win') {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.1, 0.3, 0.11, 'triangle'));
    } else if (kind === 'lose') {
      [440, 392, 330].forEach((f, i) => this.tone(f, t + i * 0.12, 0.3, 0.09, 'sine'));
    } else if (kind === 'click') {
      this.tone(880, t, 0.06, 0.04, 'sine');
    }
  },

  /* ---------- 语音 ---------- */
  speak(text, opts) {
    if (!this.sfxOn || !('speechSynthesis' in window)) return;
    opts = opts || {};
    const now = Date.now();
    if (now - this.lastSpeak < (opts.cooldown || 2800)) return;
    this.lastSpeak = now;
    try {
      const syn = window.speechSynthesis;
      // 防止语音队列无限堆积（某些浏览器在无手势/标签页挂起后 speaking 长期为 true）
      if (syn.speaking || syn.pending) {
        if (now - this.lastVoiceStart < 6000) return;
        try { syn.cancel(); } catch (e) {}
        const c0 = document.getElementById('dealer-card');
        if (c0) c0.classList.remove('talking');
        const dv0 = document.getElementById('dealer-visual');
        if (dv0) dv0.classList.remove('talking');
      }
      this.lastVoiceStart = now;
      const u = new SpeechSynthesisUtterance(text);
      // 纯英文短语（ALL IN 等）自动切英文嗓音，中文嗓音会逐字母念术语
      const isEn = /[A-Za-z]/.test(text) && !/[\u3400-\u9FFF]/.test(text);
      u.lang = isEn ? 'en-US' : 'zh-CN';
      u.pitch = opts.pitch === undefined ? 1.1 : opts.pitch;
      u.rate = opts.rate === undefined ? 0.95 : opts.rate;
      u.volume = 0.9;
      const voices = this.voices || {};
      const key = isEn ? (opts.gender === 'male' ? 'enMale' : 'enFemale') : (opts.gender || 'female');
      const v = voices[key] || (isEn ? voices.enAny : voices.any);
      if (v) u.voice = v;
      const dv = document.getElementById('dealer-visual');
      const dc = document.getElementById('dealer-card');
      const useMouth = opts.mouth !== false;
      if (useMouth && dv) dv.classList.add('talking');
      if (useMouth && dc) dc.classList.add('talking');   // 照片提亮 + 声波条
      const done = () => {
        if (useMouth && dv) dv.classList.remove('talking');
        if (useMouth && dc) dc.classList.remove('talking');
      };
      u.onend = done; u.onerror = done;
      window.speechSynthesis.speak(u);
    } catch (e) { /* 忽略语音不可用 */ }
  },

  dealerSay(line) {
    if (!this.sfxOn) return;
    if (this.ready) this.tone(1047, this.ctx.currentTime, 0.07, 0.035, 'sine');
    this.speak(line, { gender: 'female', pitch: 1.3, rate: 0.88, cooldown: 3400 });
  },

  PLAYER_VOICE: {
    // allin 一律喊牌桌通用术语 "All in!"，由 speak() 自动切英文嗓音
    0: { gender: 'male',   pitch: 1.00, rate: 1.00, raise: '我加注', allin: 'All in!', fold: '不跟了', check: '过牌', call: '跟' },
    1: { gender: 'female', pitch: 1.06, rate: 0.92, raise: '这把，我收了', allin: 'All in.', fold: '这把让你们', check: '过', call: '跟' },
    2: { gender: 'female', pitch: 1.38, rate: 1.10, raise: '我、我也加一点嘛', allin: 'All in!', fold: '我不跟啦', check: '过～', call: '我跟～' },
    3: { gender: 'female', pitch: 1.22, rate: 1.12, raise: '再来点！热闹起来', allin: 'All in!', fold: '先撤一下下', check: '过牌～', call: '跟上！' },
    4: { gender: 'male',   pitch: 0.80, rate: 0.88, raise: '按计划，加注', allin: 'All in.', fold: '不值得，弃', check: '过牌', call: '跟注' },
    5: { gender: 'male',   pitch: 0.92, rate: 1.10, raise: '加注，别磨蹭', allin: 'All in!', fold: '这把不要了', check: '过', call: '跟' },
    6: { gender: 'male',   pitch: 0.70, rate: 0.82, raise: '哼，加一点', allin: 'All in.', fold: '年轻人，我撤', check: '过', call: '跟' },
    7: { gender: 'male',   pitch: 1.02, rate: 1.02, raise: '概率不错，加注', allin: 'All in!', fold: '期望不足，弃', check: '看牌', call: '赔率够，跟' },
  },
  playerSay(p, act) {
    if (!this.sfxOn || (act !== 'raise' && act !== 'bet' && act !== 'allin')) return;
    const prof = this.PLAYER_VOICE[p.seat] || this.PLAYER_VOICE[1];
    const isAllin = act === 'allin';
    const line = isAllin ? prof.allin : prof.raise;
    this.speak(line, {
      gender: prof.gender,
      pitch: isAllin ? Math.min(1.5, prof.pitch + 0.06) : prof.pitch,
      rate: isAllin ? Math.min(1.4, prof.rate * 1.08) : prof.rate,
      cooldown: isAllin ? 2200 : 3000,
      mouth: false,
    });
  },
  /* 弃牌/过牌/跟注的短喊：冷却短、不打断荷官，牌桌才有人声烟火气 */
  shout(p, act) {
    if (!this.sfxOn || !('speechSynthesis' in window)) return;
    const prof = this.PLAYER_VOICE[p.seat] || this.PLAYER_VOICE[1];
    const line = prof[act];
    if (!line) return;
    const now = Date.now();
    if (now - (this.lastShout || 0) < 1100) return;
    const syn = window.speechSynthesis;
    if (syn.speaking || syn.pending) return;   // 荷官正在说话就不抢麦
    this.lastShout = now;
    try {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = 'zh-CN'; u.pitch = prof.pitch; u.rate = Math.min(1.4, prof.rate * 1.1); u.volume = 0.8;
      const v = this.voices[prof.gender || 'male'];
      if (v) u.voice = v;
      syn.speak(u);
    } catch (e) { /* 忽略 */ }
  },
  /* 荷官短播报（比 dealerSay 冷却短，用于弃牌等高频事件） */
  announce(text) {
    if (!this.sfxOn) return;
    this.speak(text, { gender: 'female', pitch: 1.3, rate: 0.94, cooldown: 1900 });
  },
  /* 荷官互动动作语音：短冷却、可打断（点她时必须立刻有回应） */
  actSay(text) {
    if (!this.sfxOn || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (now - (this.lastAct || 0) < 700) return;
    this.lastAct = now;
    try {
      const syn = window.speechSynthesis;
      if (syn.speaking || syn.pending) { try { syn.cancel(); } catch (e) {} }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.pitch = 1.3; u.rate = 0.92; u.volume = 0.92;
      const v = this.voices.female;
      if (v) u.voice = v;
      const card = document.getElementById('dealer-card');
      if (card) card.classList.add('talking');
      const done = () => { if (card) card.classList.remove('talking'); };
      u.onend = done; u.onerror = done;
      syn.speak(u);
    } catch (e) { /* 忽略 */ }
  },
  tipSay(amount) {
    if (!this.sfxOn) return;
    if (this.ready) {
      const t = this.ctx.currentTime;
      [784, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.22, 0.1, 'triangle'));
    }
    const lines = {
      10: '谢谢嘛，一点心意我也很开心～',
      50: '哇，这么多呀，你真大方～',
      100: '谢谢老板！今晚我专门给你发好牌～',
    };
    this.speak(lines[amount] || '谢谢你呀～', { gender: 'female', pitch: 1.34, rate: 0.9, cooldown: 600 });
  },
};

/* 任意用户手势后解锁音频（浏览器自动播放策略） */
if (typeof window !== 'undefined') {
  const unlock = () => Sound.unlock();
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}
