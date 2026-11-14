/* 金鳄会 · 纯前端存档层
 * 拦截 /api/* 请求，用 localStorage 完整复刻 server.js 的行为。
 * 静态托管（GitHub Pages / CloudStudio / 任意静态服务器）零后端运行。
 */
(function () {
  'use strict';
  var KP = 'poker_static_players_v1';
  var KF = 'poker_static_profiles_v1';
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  function read(k, d) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch (e) { return d; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function reply(obj, code) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: code || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
  }
  function bodyOf(init, input) {
    var b = (init && init.body) || (input && typeof input !== 'string' && input.body);
    if (!b) return {};
    try { return typeof b === 'string' ? JSON.parse(b) : JSON.parse(String(b)); }
    catch (e) { return {}; }
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var u;
    try { u = new URL(url, location.href); }
    catch (e) { return nativeFetch(input, init); }
    var path = u.pathname;
    // 静态资源（glb / png / mp4 / js）一律放行
    if (path.indexOf('/api/') < 0) return nativeFetch(input, init);
    var method = (init && init.method) || (input && input.method) || 'GET';
    var body = bodyOf(init, input);
    var store, prev, ps, st, s, rec, name, list, prof, rows, added, key, arr;

    if (path.indexOf('/api/load') >= 0) {
      store = read(KP, {});
      name = u.searchParams.get('name') || '';
      rec = store[name];
      return reply(rec ? { found: true, chips: rec.chips, stats: rec.stats || {} } : { found: false });
    }
    if (path.indexOf('/api/save') >= 0) {
      name = String(body.name || '').slice(0, 20);
      if (!name) return reply({ ok: false, error: 'name required' }, 400);
      var chips = Math.max(0, Math.floor(Number(body.chips) || 0));
      s = body.stats || {};
      store = read(KP, {});
      prev = store[name] || { chips: 1000, stats: {} };
      ps = prev.stats || {};
      var hands = Math.max(s.hands | 0, ps.hands | 0);
      var wins = Math.min(Math.max(s.wins | 0, ps.wins | 0), hands);
      store[name] = {
        chips: chips,
        stats: {
          hands: hands, wins: wins,
          biggest: Math.max(s.biggest | 0, ps.biggest | 0),
          bestChips: Math.max(chips, ps.bestChips | 0),
          tips: Math.max(s.tips | 0, ps.tips | 0),
        },
        updatedAt: Date.now(),
      };
      write(KP, store);
      return reply({ ok: true });
    }
    if (path.indexOf('/api/leaderboard') >= 0) {
      store = read(KP, {});
      list = Object.keys(store).map(function (k) {
        st = store[k].stats || {};
        return { name: k, chips: store[k].chips, hands: st.hands || 0, wins: st.wins || 0 };
      }).sort(function (a, b) { return b.chips - a.chips; }).slice(0, 10);
      return reply({ list: list });
    }
    if (path.indexOf('/api/profiles') >= 0) {
      prof = read(KF, {});
      if (String(method).toUpperCase() === 'POST') {
        rows = Array.isArray(body.records) ? body.records : [];
        added = 0;
        rows.forEach(function (row) {
          if (!row || !row.name || !row.record) return;
          key = String(row.name).slice(0, 20);
          arr = Array.isArray(prof[key]) ? prof[key] : [];
          if (row.record.ts && arr.some(function (x) { return x && x.ts === row.record.ts; })) return;
          arr.push(row.record);
          prof[key] = arr.slice(-20);
          added++;
        });
        write(KF, prof);
        return reply({ ok: true, added: added });
      }
      return reply({ profiles: prof });
    }
    if (path.indexOf('/api/videos') >= 0) {
      return reply({ list: ['dealer_ai.mp4'] });
    }
    return reply({ ok: false, error: 'unknown api' }, 404);
  };
  window.POKER_STATIC = true;
})();
