/* 金鳄会 · 荷官/牌手形象系统
 * 三层媒体：写实真人照片（AI 生成，黑色丝袜晚礼服）→ 真实 mp4 视频 → 参数化 SVG 动态立绘。
 * 默认显示写实照片，可一键切到循环视频或会眨眼/动嘴的动态立绘。
 */
'use strict';

const DEALER_LOOKS = {
  vivian: {
    name: '薇薇', tag: '经典红裙', photo: 'dealers/vivian.png',
    hair: '#1c1120', hairHi: '#8a5a72', hairMid: '#3a2334',
    dress1: '#ff5a7d', dress2: '#d81f4e', dress3: '#8d0f33', trim: '#ff9db1',
    skin1: '#ffe6d2', skin2: '#f0bf9f', shade: '#e0aa8b',
    lip1: '#ff4d6d', lip2: '#c1113b', lipHi: '#ff9db1',
    jewel: '#ffe9a8', jewelEdge: '#ffd76a', eye: '#2b1e3e',
    blush: '#f78f96', glow: '#ff9db1', eyeShadow: '#8a4a5c',
    hairStyle: 'waves',
  },
  yara: {
    name: 'Yara', tag: '冷艳黑金', photo: 'dealers/yara.png',
    hair: '#15141c', hairHi: '#b9b3c9', hairMid: '#3d3948',
    dress1: '#3b3550', dress2: '#171522', dress3: '#0a0910', trim: '#d8c98f',
    skin1: '#f7e5dd', skin2: '#e2bfb4', shade: '#cba79c',
    lip1: '#a8305a', lip2: '#6d1235', lipHi: '#d06a92',
    jewel: '#e8f4ff', jewelEdge: '#9fc6e8', eye: '#221a2e',
    blush: '#d98a9a', glow: '#9aa8e8', eyeShadow: '#5a4a78',
    hairStyle: 'straight',
  },
  siaqiu: {
    name: 'Siaqiu', tag: '甜美香槟', photo: 'dealers/siaqiu.png',
    hair: '#3a2118', hairHi: '#c88a5c', hairMid: '#6b3b28',
    dress1: '#ffd7c2', dress2: '#f2a48c', dress3: '#c46a63', trim: '#fff0d0',
    skin1: '#ffe9d6', skin2: '#f3c4a4', shade: '#e3ae8d',
    lip1: '#ff7a86', lip2: '#d83558', lipHi: '#ffb0ae',
    jewel: '#fff3c4', jewelEdge: '#e6c46a', eye: '#3a2430',
    blush: '#ff9d9d', glow: '#ffcf9a', eyeShadow: '#b4707a',
    hairStyle: 'ponytail',
  },
};

/* 云端生成的写实荷官发牌短片已下载为本地 public/videos/dealer_ai.mp4（真实 mp4，走 Range 播放）。
 * 也可把自己的视频放进 public/videos/（命名含 yara / siaqiu 会自动绑定对应牌手），或用 ?video=直链。 */
const DEFAULT_VIDEO = '';
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)$/i;
const VIDEO_LABEL = { dealer_ai: '写实荷官', yara: 'Yara', siaqiu: 'Siaqiu', vivian: '薇薇' };

/* 可播放的荷官动作库：点击按钮或点她本人触发（动画 + 语音 + 气泡 + 音效） */
const DEALER_ACTS = {
  greet:   { label: '👋 招呼', emoji: '👋', line: '嗨～看我这边，今晚想赢多少呀？', sfx: 'click' },
  deal:    { label: '🃏 发牌', emoji: '🃏', line: '牌来咯，接好～', sfx: 'deal' },
  shuffle: { label: '🔀 洗牌', emoji: '🃏', line: '洗牌中，都是真随机哦～', sfx: 'deal' },
  cheer:   { label: '🎉 祝贺', emoji: '🎉', line: '漂亮！这手打得真好看～', sfx: 'win' },
  think:   { label: '🤔 思考', emoji: '💭', line: '让我想想…这把你敢跟吗？', sfx: 'click' },
  wow:     { label: '😮 惊讶', emoji: '❗', line: '哇！这个下注好大胆～', sfx: 'click' },
  heart:   { label: '💖 比心', emoji: '💖', line: '谢谢你呀，比个心～', sfx: 'click' },
  toast:   { label: '🥂 干杯', emoji: '🥂', line: '祝你满载而归，干杯～', sfx: 'click' },
};
const ALL_ACT_CLASSES = Object.keys(DEALER_ACTS).map(k => 'act-' + k).join(' ');

const Dealer = {
  look: 'vivian',
  mode: 'photo',        // photo=写实真人照片 / video=真视频 / draw=SVG 动态立绘
  playing: true,
  onTip: null,
  onLookChange: null,
  videos: [],
  activeVideo: null,
  muted: true,

  init() {
    const saved = (() => { try { return localStorage.getItem('poker_dealer_look'); } catch (e) { return null; } })();
    const urlLook = (() => {
      try { return new URLSearchParams(location.search).get('look'); } catch (e) { return null; }
    })();
    const pick = urlLook && DEALER_LOOKS[urlLook] ? urlLook : (saved && DEALER_LOOKS[saved] ? saved : null);
    if (pick) this.look = pick;
    try {
      const m = new URLSearchParams(location.search).get('mode');
      if (m === 'video' || m === 'draw' || m === 'photo') this.mode = m;
    } catch (e) {}
    this.render();
    // 先同步显示照片（避免等异步 /api/videos 时白屏），媒体模式由 loadVideos() 完成后统一应用
    const c0 = document.getElementById('dealer-card');
    if (c0) { c0.classList.remove('mode-photo', 'mode-video', 'mode-draw'); c0.classList.add('mode-' + this.mode); }
    const im0 = document.getElementById('dealer-photo');
    if (im0) im0.setAttribute('src', this.config().photo);
    const mi = document.getElementById('mobile-dealer-img');
    if (mi) mi.setAttribute('src', this.config().photo);
    const mn = document.getElementById('mobile-dealer-name');
    if (mn) mn.textContent = '✨ 荷官 · ' + this.config().name + ' ✨';
    const box = document.getElementById('dealer-looks');
    if (box) {
      box.innerHTML = Object.entries(DEALER_LOOKS).map(([k, v]) =>
        `<button class="look-btn${k === this.look ? ' cur' : ''}" data-look="${k}" title="${v.tag}">${v.name}</button>`
      ).join('');
      box.querySelectorAll('.look-btn').forEach(b => {
        b.onclick = () => this.setLook(b.dataset.look);
      });
    }
    this.renderActionButtons();
    const pp = document.getElementById('dealer-playpause');
    if (pp) pp.onclick = (e) => { e.stopPropagation(); this.togglePlay(); };
    const mute = document.getElementById('dealer-mute');
    if (mute) mute.onclick = (e) => { e.stopPropagation(); this.toggleMute(); };
    // 点荷官本人 = 随机互动动作
    if (c0) c0.onclick = () => {
      const keys = Object.keys(DEALER_ACTS);
      this.playAction(keys[Math.floor(Math.random() * keys.length)]);
    };
    this.loadVideos();
    // ?act=cheer 可直接播放指定动作，方便验证/分享
    try {
      const a = new URLSearchParams(location.search).get('act');
      if (a && DEALER_ACTS[a]) setTimeout(() => this.playAction(a, true), 900);
      const z = new URLSearchParams(location.search).get('zoom');
      if (z === '1') { this.fullBody = true; const c = document.getElementById('dealer-card'); if (c) c.classList.add('zoom-full'); }
    } catch (e) {}
  },

  /* ---------- 真视频 ---------- */
  async loadVideos() {
    let files = [];
    try {
      const r = await fetch('/api/videos');
      const d = await r.json();
      files = d.list || [];
    } catch (e) { /* 服务不可用时忽略 */ }
    this.videos = files.map(f => {
      const base = f.replace(VIDEO_EXT, '');
      const key = Object.keys(VIDEO_LABEL).find(k => base.toLowerCase().indexOf(k) >= 0);
      return {
        name: key ? VIDEO_LABEL[key] : base,
        url: 'videos/' + encodeURIComponent(f),
        look: Object.keys(DEALER_LOOKS).find(k => f.toLowerCase().indexOf(k) >= 0) || null,
      };
    });
    try {
      const q = new URLSearchParams(location.search).get('video');
      if (q) this.videos.unshift({ name: '自定义视频', url: q, look: null });
    } catch (e) {}
    // 本地没有视频时，回退到云端生成的写实荷官短片
    if (!this.videos.length && DEFAULT_VIDEO && DEFAULT_VIDEO.indexOf('__') !== 0) {
      this.videos.push({ name: 'AI 写实荷官', url: DEFAULT_VIDEO, look: null });
    }
    this.renderMediaButtons();
    this.applyMedia();
  },

  /* ---------- 动作库与互动 ---------- */
  renderActionButtons() {
    const box = document.getElementById('dealer-actions');
    if (!box) return;
    box.innerHTML = Object.entries(DEALER_ACTS)
      .map(([k, a]) => `<button class="act-btn" data-act="${k}">${a.label}</button>`).join('');
    box.querySelectorAll('.act-btn').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); this.playAction(b.dataset.act); };
    });
  },

  playAction(key, silent) {
    const a = DEALER_ACTS[key];
    if (!a) return;
    const card = document.getElementById('dealer-card');
    if (card) {
      card.classList.remove('acting', ...ALL_ACT_CLASSES.split(' '));
      void card.offsetWidth;   // 强制重排，让连续点击也能重播动画
      card.classList.add('acting', 'act-' + key);
      clearTimeout(this._actTimer);
      this._actTimer = setTimeout(() => {
        card.classList.remove('acting', 'act-' + key);
        document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('cur'));
      }, 1600);
    }
    const em = document.getElementById('dealer-act-emoji');
    if (em) em.textContent = a.emoji;
    document.querySelectorAll('.act-btn').forEach(b => b.classList.toggle('cur', b.dataset.act === key));
    if (!silent) {
      this.say(a.line, 2600);
      try {
        if (typeof Sound !== 'undefined' && Sound) {
          if (Sound.actSay) Sound.actSay(a.line);
          if (Sound.event) Sound.event(a.sfx);
        }
      } catch (e) {}
    }
    if (key === 'cheer' || key === 'heart') this.celebrate();
  },

  renderMediaButtons() {
    const box = document.getElementById('dealer-video-list');
    if (!box) return;
    let html = '<button class="video-btn' + (this.mode === 'photo' ? ' cur' : '') + '" data-m="photo">📷 真人照片</button>';
    this.videos.forEach((v, i) => {
      html += '<button class="video-btn' + (this.mode === 'video' && this.activeVideo === v.url ? ' cur' : '')
        + '" data-m="video" data-i="' + i + '" title="' + v.name + '">▶ ' + v.name + '</button>';
    });
    html += '<button class="video-btn' + (this.mode === 'draw' ? ' cur' : '') + '" data-m="draw">🎨 动态立绘</button>';
    html += '<button class="video-btn zoom-btn" data-zoom="1">🔍 ' + (this.fullBody ? '看脸' : '看全身(黑丝)') + '</button>';
    box.innerHTML = html;
    box.querySelectorAll('[data-zoom]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); this.toggleZoom(); this.renderMediaButtons(); };
    });
    box.querySelectorAll('.video-btn:not([data-zoom])').forEach(b => {
      b.onclick = () => {
        if (b.dataset.m === 'video') this.setMode('video', this.videos[+b.dataset.i].url);
        else this.setMode(b.dataset.m);
        this.renderMediaButtons();
      };
    });
  },

  fullBody: false,

  toggleZoom() {
    this.fullBody = !this.fullBody;
    const card = document.getElementById('dealer-card');
    if (card) card.classList.toggle('zoom-full', this.fullBody);
    this.say(this.fullBody ? '站着看全局也不错吧～黑色丝袜好看吗？' : '凑近一点，看清我的脸了嘛～', 2400);
    try { if (typeof Sound !== 'undefined' && Sound && Sound.actSay) Sound.actSay(this.fullBody ? '看看全身吧' : '看我的脸呀'); } catch (e) {}
  },

  setMode(mode, videoUrl) {
    this.mode = mode;
    if (mode === 'video' && videoUrl) this.activeVideo = videoUrl;
    this.applyMedia();
  },

  setVideo(url) { // 兼容旧接口
    this.setMode(url === '__none__' ? 'draw' : 'video', url === '__none__' ? null : url);
  },

  /* 三层媒体：写实照片（默认） / 真 mp4 视频 / SVG 动态立绘 */
  applyMedia() {
    const card = document.getElementById('dealer-card');
    if (!card) return;
    card.classList.remove('mode-photo', 'mode-video', 'mode-draw');
    card.classList.add('mode-' + this.mode);
    const img = document.getElementById('dealer-photo');
    if (img) {
      const src = this.config().photo;
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.onerror = () => { if (this.mode === 'photo') this.setMode('draw'); };
    }
    const v = document.getElementById('dealer-video');
    if (!v) return;
    if (this.mode !== 'video') { try { v.pause(); } catch (e) {} return; }
    const chosen = this.videos.find(x => x.url === this.activeVideo)
      || this.videos.find(x => x.look === this.look) || this.videos[0];
    if (!chosen) {
      this.mode = 'photo';
      card.classList.remove('mode-video'); card.classList.add('mode-photo');
      return;
    }
    if (v.getAttribute('src') !== chosen.url) { v.setAttribute('src', chosen.url); v.load(); }
    v.muted = this.muted;
    const play = () => { try { this.playing ? v.play() : v.pause(); } catch (e) {} };
    play();
    v.oncanplay = play;
    v.onerror = () => { card.classList.remove('mode-video'); card.classList.add('mode-photo'); };
  },

  toggleMute() {
    this.muted = !this.muted;
    const v = document.getElementById('dealer-video');
    if (v) v.muted = this.muted;
    const b = document.getElementById('dealer-mute');
    if (b) b.textContent = this.muted ? '🔇' : '🔊';
  },

  config() { return DEALER_LOOKS[this.look]; },

  setLook(key) {
    if (!DEALER_LOOKS[key] || key === this.look) return;
    this.look = key;
    const own = this.videos.find(x => x.look === key);
    this.activeVideo = own ? own.url : null;   // 换人时切到该形象的专属视频
    try { localStorage.setItem('poker_dealer_look', key); } catch (e) {}
    this.render();
    const mi = document.getElementById('mobile-dealer-img');
    if (mi) mi.setAttribute('src', this.config().photo);
    const mn = document.getElementById('mobile-dealer-name');
    if (mn) mn.textContent = '✨ 荷官 · ' + this.config().name + ' ✨';
    this.applyMedia();
    document.querySelectorAll('.look-btn').forEach(b => b.classList.toggle('cur', b.dataset.look === key));
    const c = this.config();
    this.say(`我是 ${c.name}，今晚由我陪你玩，准备好了吗～`, 3600);
    this.celebrate();
    if (this.onLookChange) this.onLookChange(key, c.name);
  },

  togglePlay() {
    this.playing = !this.playing;
    const stage = document.getElementById('dealer-visual');
    if (stage) stage.classList.toggle('paused', !this.playing);
    const svg = document.getElementById('dealer-svg');
    if (svg && svg.pauseAnimations) {
      try { this.playing ? svg.unpauseAnimations() : svg.pauseAnimations(); } catch (e) {}
    }
    const pp = document.getElementById('dealer-playpause');
    if (pp) pp.textContent = this.playing ? '⏸' : '▶';
    const live = document.getElementById('dealer-live');
    if (live) live.classList.toggle('off', !this.playing);
    const v = document.getElementById('dealer-video');
    if (v) { try { this.playing ? v.play() : v.pause(); } catch (e) {} }
  },

  say(text, ms) {
    const bubble = document.getElementById('dealer-speech');
    const el = document.getElementById('dealer-text');
    if (!bubble || !el) return;
    el.textContent = text;
    const ml = document.getElementById('mobile-dealer-line');
    if (ml) ml.textContent = text;
    bubble.classList.add('show');
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(() => bubble.classList.remove('show'), ms || 3200);
  },

  setTalking(on) {
    const v = document.getElementById('dealer-visual');
    if (v) v.classList.toggle('talking', !!on);
  },

  celebrate() {
    const host = document.getElementById('dealer-hearts');
    if (!host) return;
    for (let i = 0; i < 7; i++) {
      const h = document.createElement('span');
      h.className = 'heart';
      h.textContent = ['♥', '✦', '♥', '✨'][i % 4];
      h.style.left = (12 + Math.random() * 76) + '%';
      h.style.animationDelay = (i * 0.12) + 's';
      host.appendChild(h);
      setTimeout(() => h.remove(), 2200);
    }
  },

  /* ---------- 参数化立绘 ---------- */
  svg(c) {
    const hairBack = c.hairStyle === 'straight'
      ? `M52 92 Q46 26 100 22 Q154 26 148 92 Q152 180 146 250 Q138 262 132 248 Q140 160 136 96 L64 96 Q60 160 68 248 Q62 262 54 250 Q48 180 52 92Z`
      : c.hairStyle === 'ponytail'
        ? `M50 92 Q44 26 100 22 Q156 26 150 92 Q158 150 150 190 Q142 200 136 188 Q144 140 138 96 L62 96 Q56 140 64 188 Q58 200 50 190 Q42 150 50 92Z`
        : `M48 96 Q40 26 100 22 Q160 26 152 96 Q166 140 150 202 Q140 214 132 200 Q142 150 138 100 L62 100 Q58 150 68 200 Q60 214 50 202 Q34 140 48 96Z`;
    return `
<svg id="dealer-svg" viewBox="0 0 200 360" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="dressGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.dress1}"/><stop offset="0.55" stop-color="${c.dress2}"/><stop offset="1" stop-color="${c.dress3}"/>
    </linearGradient>
    <linearGradient id="hairGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c.hairMid}"/><stop offset="0.5" stop-color="${c.hair}"/><stop offset="1" stop-color="#0d0910"/>
    </linearGradient>
    <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.skin1}"/><stop offset="1" stop-color="${c.skin2}"/>
    </linearGradient>
    <linearGradient id="lipGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.lip1}"/><stop offset="1" stop-color="${c.lip2}"/>
    </linearGradient>
    <linearGradient id="stockGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#100d14"/><stop offset="0.38" stop-color="#413a48"/><stop offset="0.62" stop-color="#2a2431"/><stop offset="1" stop-color="#0b0910"/>
    </linearGradient>
    <radialGradient id="glowGrad" cx="0.5" cy="0.36" r="0.62">
      <stop offset="0" stop-color="${c.glow}" stop-opacity="0.42"/><stop offset="0.6" stop-color="${c.glow}" stop-opacity="0.14"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <ellipse cx="100" cy="150" rx="99" ry="170" fill="url(#glowGrad)"/>
  <g class="sparkles" fill="${c.jewel}">
    <path class="sp sp1" d="M24 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
    <path class="sp sp2" d="M176 106 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z"/>
    <path class="sp sp3" d="M164 34 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z"/>
  </g>
  <!-- 头发后层 -->
  <path d="${hairBack}" fill="url(#hairGrad)"/>
  <path d="M52 92 Q46 30 100 26 Q154 30 148 92" stroke="${c.hairHi}" stroke-width="2" fill="none" opacity="0.45"/>
  ${c.hairStyle === 'ponytail' ? `<path d="M150 92 Q182 120 172 190 Q160 210 150 190 Q166 140 144 108Z" fill="url(#hairGrad)"/><path d="M156 110 Q174 140 164 184" stroke="${c.hairHi}" stroke-width="2" fill="none" opacity="0.5"/>` : ''}
  <!-- 黑色丝袜双腿 + 高跟鞋（舞台背光让丝袜轮廓可见） -->
  <ellipse cx="100" cy="292" rx="48" ry="64" fill="#ffe6bf" opacity="0.10"/>
  <g class="legs">
    <path d="M76 246 Q74 282 78 322 L92 322 Q92 284 94 246Z" fill="url(#stockGrad)" stroke="#6d6379" stroke-width="0.9"/>
    <path d="M106 246 Q108 284 108 322 L122 322 Q126 282 124 246Z" fill="url(#stockGrad)" stroke="#6d6379" stroke-width="0.9"/>
    <path d="M79 252 Q78 286 81 316" stroke="#7d7488" stroke-width="1.6" fill="none" opacity="0.45"/>
    <path d="M109 252 Q110 286 111 316" stroke="#7d7488" stroke-width="1.6" fill="none" opacity="0.45"/>
    <path d="M76 246 Q100 252 124 246" stroke="#0b0910" stroke-width="3" fill="none" opacity="0.8"/>
    <path d="M76 318 L94 318 L96 334 Q96 340 88 340 L70 340 Q66 336 72 330Z" fill="#17131c"/>
    <path d="M106 318 L124 318 L128 330 Q134 336 130 340 L112 340 Q104 340 104 334Z" fill="#17131c"/>
    <path d="M70 340 L96 340" stroke="${c.jewelEdge}" stroke-width="1.4" opacity="0.7"/>
    <path d="M104 340 L130 340" stroke="${c.jewelEdge}" stroke-width="1.4" opacity="0.7"/>
  </g>
  <!-- 裙身 -->
  <path d="M70 150 Q66 196 58 244 Q100 258 142 244 Q134 196 130 150Z" fill="url(#dressGrad)"/>
  <path d="M62 226 Q100 240 138 226" stroke="${c.trim}" stroke-width="1.6" fill="none" opacity="0.5"/>
  <path d="M78 160 Q74 200 68 238" stroke="${c.trim}" stroke-width="1.2" fill="none" opacity="0.3"/>
  <path d="M122 160 Q126 200 132 238" stroke="${c.trim}" stroke-width="1.2" fill="none" opacity="0.3"/>
  <!-- 脖颈 + 锁骨 -->
  <path d="M86 84 Q100 96 114 84 L116 108 Q100 120 84 108 Z" fill="url(#skinGrad)"/>
  <path d="M72 110 Q86 122 100 122 Q114 122 128 110" stroke="${c.shade}" stroke-width="1.6" fill="none" opacity="0.7"/>
  <!-- 抹胸深V上身 -->
  <path d="M70 108 Q80 100 88 112 Q100 132 112 112 Q120 100 130 108 Q142 114 145 136 Q147 150 142 156 Q100 166 58 156 Q53 150 55 136 Q58 114 70 108Z" fill="url(#dressGrad)"/>
  <path d="M88 112 Q100 132 112 112 Q100 122 88 112Z" fill="${c.skin1}" opacity="0.55"/>
  <path d="M70 108 Q78 102 88 112" stroke="${c.trim}" stroke-width="2" fill="none" opacity="0.85"/>
  <path d="M130 108 Q122 102 112 112" stroke="${c.trim}" stroke-width="2" fill="none" opacity="0.85"/>
  <path d="M58 150 Q100 160 142 150" stroke="${c.dress3}" stroke-width="2.4" fill="none" opacity="0.7"/>
  <!-- 颈链 + 钻石 -->
  <path d="M84 106 Q100 120 116 106" stroke="${c.jewel}" stroke-width="1.8" fill="none"/>
  <path class="diamond" d="M100 118 l4 4 -4 5 -4 -5z" fill="#fff8dc" stroke="${c.jewelEdge}" stroke-width="0.8"/>
  <!-- 左臂托牌 -->
  <path d="M62 126 Q44 154 56 184 Q64 196 84 194" stroke="url(#skinGrad)" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M56 170 Q52 180 58 186" stroke="${c.jewelEdge}" stroke-width="2" fill="none" opacity="0.9"/>
  <!-- 右臂：发牌动作循环 -->
  <g class="deal-arm">
    <path d="M138 126 Q158 150 150 178 Q142 190 124 188" stroke="url(#skinGrad)" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M148 168 Q152 178 146 184" stroke="${c.jewelEdge}" stroke-width="2" fill="none" opacity="0.9"/>
  </g>
  <!-- 脸 -->
  <ellipse cx="100" cy="60" rx="33" ry="37" fill="url(#skinGrad)"/>
  <path d="M67 58 Q68 82 78 92 Q70 84 69 64Z" fill="${c.shade}" opacity="0.45"/>
  <path d="M133 58 Q132 82 122 92 Q130 84 131 64Z" fill="${c.shade}" opacity="0.45"/>
  <!-- 刘海 -->
  <path d="M66 58 Q60 20 100 20 Q140 20 134 58 Q130 36 108 32 Q96 44 70 52Z" fill="${c.hair}"/>
  <path d="M72 40 Q94 26 122 32" stroke="${c.hairHi}" stroke-width="2" fill="none" opacity="0.7"/>
  <path d="M64 54 Q56 96 66 122 Q72 94 70 60Z" fill="${c.hair}"/>
  <path d="M136 54 Q144 96 134 122 Q128 94 130 60Z" fill="${c.hair}"/>
  <path d="M62 70 Q58 100 64 118" stroke="${c.hairHi}" stroke-width="1.4" fill="none" opacity="0.55"/>
  <path d="M138 70 Q142 100 136 118" stroke="${c.hairHi}" stroke-width="1.4" fill="none" opacity="0.55"/>
  <!-- 眼妆 / 眉 -->
  <path d="M76 52 Q86 46 96 51" stroke="${c.eyeShadow}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.4"/>
  <path d="M104 51 Q114 46 124 52" stroke="${c.eyeShadow}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.4"/>
  <path d="M77 47 Q86 42 96 47" stroke="${c.hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M104 47 Q114 42 123 47" stroke="${c.hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <!-- 眨眼 + wink -->
  <g id="dealer-eyes">
    <ellipse cx="86" cy="58" rx="6" ry="7.4" fill="${c.eye}">
      <animate attributeName="ry" values="7.4;7.4;0.8;7.4;7.4" keyTimes="0;0.44;0.47;0.5;1" dur="4.6s" repeatCount="indefinite"/>
    </ellipse>
    <circle cx="87.6" cy="55.6" r="2.2" fill="#fff"/>
    <path d="M79 51 Q86 47 93 51" stroke="${c.eye}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M79 52 l-3 -3 M93 52 l3 -3" stroke="${c.eye}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M106 58 Q113 53 120 58" stroke="${c.eye}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M105 55 l-2 -3 M121 55 l2 -3" stroke="${c.eye}" stroke-width="1.5" stroke-linecap="round"/>
  </g>
  <ellipse cx="75" cy="68" rx="6.5" ry="3.6" fill="${c.blush}" opacity="0.5"/>
  <ellipse cx="125" cy="68" rx="6.5" ry="3.6" fill="${c.blush}" opacity="0.5"/>
  <circle cx="121" cy="75" r="1.3" fill="#7a4a3c" opacity="0.8"/>
  <!-- 唇（说话动） -->
  <g id="dealer-mouth">
    <path d="M86 76 Q93 71 100 75 Q107 71 114 76 Q107 88 100 88 Q93 88 86 76Z" fill="url(#lipGrad)"/>
    <path d="M90 78 Q100 81 110 78" stroke="${c.lipHi}" stroke-width="1.3" fill="none" opacity="0.8"/>
    <path d="M94 84 Q100 86 106 84" stroke="${c.lipHi}" stroke-width="1.6" fill="none" opacity="0.7"/>
  </g>
  <!-- 耳环 -->
  <g class="earring"><circle cx="66" cy="70" r="3" fill="${c.jewel}"/><path d="M66 73 l3 5 -3 4 -3 -4z" fill="#fff8dc" stroke="${c.jewelEdge}" stroke-width="0.7"/></g>
  <g class="earring"><circle cx="134" cy="70" r="3" fill="${c.jewel}"/><path d="M134 73 l3 5 -3 4 -3 -4z" fill="#fff8dc" stroke="${c.jewelEdge}" stroke-width="0.7"/></g>
  <!-- 手上的牌 -->
  <g transform="rotate(-14 78 190)">
    <rect x="62" y="178" width="30" height="42" rx="4" fill="#fff" stroke="${c.dress2}" stroke-width="1.5"/>
    <text x="70" y="196" font-size="13" font-weight="bold" fill="#222">A</text>
    <text x="70" y="210" font-size="11" fill="#222">♠</text>
  </g>
  <!-- 循环发牌飞出的牌 -->
  <g class="fly-card">
    <rect x="140" y="176" width="24" height="34" rx="3" fill="#fff" stroke="${c.dress2}" stroke-width="1.4"/>
    <text x="147" y="196" font-size="12" font-weight="bold" fill="${c.dress2}">K</text>
  </g>
  <!-- 光影扫过（小视频质感） -->
  <rect class="light-sweep" x="0" y="0" width="60" height="360" fill="url(#shineGrad)"/>
</svg>`;
  },

  render() {
    const stage = document.getElementById('dealer-visual');
    if (!stage) return;
    const c = this.config();
    stage.innerHTML = this.svg(c);
    const nm = document.getElementById('dealer-name');
    if (nm) nm.innerHTML = `✨ ${c.name} · ${c.tag} ✨<br><span>今晚由我陪你玩</span>`;
    const tag = document.getElementById('dealer-role');
    if (tag) tag.textContent = '荷官 / 牌手';
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => Dealer.init());
  // 打赏按钮由 game.js 绑定（需要扣积分），这里只做外观切换
  Dealer.onTip = null;
}
