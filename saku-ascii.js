/* 朔 · ASCII 观测窗渲染器（两套地图：室内 room / 大世界 overmap）
 * 依赖 window.SAKU_ASCII = {w,h,ink,scenes,overmap}
 * 符号体系参考 CDDA：道路与边界用 box-drawing，地标用字母
 */
(function (global) {
  'use strict';

  var D = null, W = 0, H = 0, INK = {}, SC = {}, OM = null, PLAN = {}, PLACES = {};
  var host = null, preEl = null, actorEl = null, fxEl = null, tagEl = null, sayEl = null;
  var LX = 0, LY = 0;
  var cur = '', mode = 'room', sceneKey = '', forcedXY = null;
  var opts = { night: false, rain: false, snow: false, period: false };
  var anim = { name: 'idle', t0: 0 };
  var tick = null, fitBound = false;

  var PAD_X = 8, PAD_Y = 8;

  /* 室内：角色落点 */
  var SPOT = {
    bedroom: [26, 12], desk: [20, 12], classroom: [22, 12], library: [26, 15],
    street: [27, 14], crossing: [27, 14], park: [27, 13], kitchen: [26, 12],
    bath: [24, 11], store: [28, 14], station: [27, 13], playground: [28, 13],
    hall: [26, 9], stair: [30, 9], roof: [27, 8], laundry: [24, 11],
    cafe: [24, 10], bookstore: [27, 15]
  };

  var ACTOR_TXT = {
    idle: '站着，没什么表情', sleep: '睡着了', walk: '在走',
    study: '低头写着什么', eat: '在吃东西', read: '在看书',
    bath: '在洗漱', shop: '在挑东西', wait: '在等车',
    play: '在操场边上', cook: '在煮东西', phone: '在看手机'
  };

  function esc(ch) {
    return ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
  }

  function rowsOf(which, name) {
    if (which === 'world') return (OM && OM.rows) || [];
    var sc = SC[name] || SC.bedroom;
    return sc.rows || [];
  }

  function hlRanges(which) {
    if (which !== 'world' || !OM || !OM.rows) return null;
    var p = forcedXY;
    if (!p) return null;
    var b = { name: (PLACES[sceneKey] ? PLACES[sceneKey][3][0] : '') };
    /* 返回当前地标的所有字符范围，用亮色渲染 */
    var ranges = [];
    for (var y = 0; y < H; y++) {
      var row = OM.rows[y] || '';
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        var d2 = Math.abs(x - p[0]) + Math.abs(y - p[1]);
        if (d2 <= 7 && '^SLCATP'.indexOf(ch) >= 0) ranges.push([y, x, x]);
      }
    }
    return ranges;
  }

  function renderMap(which, name) {
    var rows = rowsOf(which, name), out = [];
    var hl = hlRanges(which);
    for (var y = 0; y < H; y++) {
      var line = rows[y] || '';
      var i = 0, buf = '', html = '', c0 = undefined;
      while (i < line.length) {
        var ch = line[i];
        var c = INK[ch] || '#2a3244';
        if (hl) {
          for (var q = 0; q < hl.length; q++) {
            if (hl[q][0] === y && i >= hl[q][1] && i <= hl[q][2]) { c = '#f0e6c8'; break; }
          }
        }
        if (c !== c0) {
          if (buf) html += '<span style="color:' + c0 + '">' + buf + '</span>';
          buf = ''; c0 = c;
        }
        buf += esc(ch);
        i++;
      }
      if (buf) html += '<span style="color:' + c0 + '">' + buf + '</span>';
      out.push(html || '&nbsp;');
    }
    preEl.innerHTML = out.join('\n');
  }

  function placeActor() {
    var sp;
    if (mode === 'world') {
      sp = forcedXY || [15, 11];
    } else {
      sp = SPOT[cur] || [26, 12];
    }
    LX = sp[0]; LY = sp[1];
    actorEl.style.left = 'calc(' + PAD_X + 'px + ' + LX + 'ch)';
    actorEl.style.top = 'calc(' + PAD_Y + 'px + ' + (LY * 1.18) + 'em)';
    actorEl.textContent = '@';
  }

  function makeFx() {
    if (!fxEl) return;
    /* 室内淋不到雨雪 */
    if (mode === 'room' || (!opts.rain && !opts.snow)) { fxEl.innerHTML = ''; return; }
    var n = opts.rain ? 26 : 18, html = '';
    for (var i = 0; i < n; i++) {
      var left = (Math.random() * 100).toFixed(1);
      var dur = (opts.rain ? 0.45 + Math.random() * 0.35 : 2.4 + Math.random() * 2.4).toFixed(2);
      var delay = (Math.random() * 2).toFixed(2);
      var col = opts.rain ? 'rgba(150,190,255,.55)' : 'rgba(235,242,255,.8)';
      html += '<i style="left:' + left + '%;animation-duration:' + dur + 's;animation-delay:'
        + delay + 's;color:' + col + '">' + (opts.rain ? '|' : '*') + '</i>';
    }
    fxEl.innerHTML = html;
  }

  function loop() {
    if (!actorEl) return;
    var now = performance.now();
    var lx = LX, ly = LY * 1.18;
    if (anim.name === 'idle') {
      ly -= (Math.floor((now - anim.t0) / 620) % 2) ? 0.32 : 0;
    } else if (anim.name === 'sleep') {
      ly += (Math.floor((now - anim.t0) / 1400) % 2) ? 0.12 : 0;
    } else if (anim.name === 'walk') {
      var s = Math.floor((now - anim.t0) / 260) % 8;
      lx += [0, 1, 2, 3, 3, 2, 1, 0][s];
      ly -= (s % 2) ? 0.16 : 0;
    }
    actorEl.style.left = 'calc(' + PAD_X + 'px + ' + lx + 'ch)';
    actorEl.style.top = 'calc(' + PAD_Y + 'px + ' + ly + 'em)';
  }

  function fit() {
    if (!host) return;
    var w = host.clientWidth - 16;
    var fs = w / (W * 0.6);
    fs = Math.max(4.5, Math.min(13, fs));
    host.style.fontSize = fs.toFixed(2) + 'px';
  }

  function init(o) {
    host = o.host;
    D = o.data;
    W = D.w; H = D.h; INK = D.ink; SC = D.scenes; OM = D.overmap;
    PLAN = D.plan || {}; PLACES = D.places || {};
    preEl = document.createElement('pre'); preEl.className = 'a-pre';
    actorEl = document.createElement('span'); actorEl.className = 'a-actor';
    fxEl = document.createElement('div'); fxEl.className = 'a-fx';
    tagEl = document.createElement('div'); tagEl.className = 'a-tag';
    sayEl = document.createElement('div'); sayEl.className = 'a-say';
    host.appendChild(preEl);
    host.appendChild(fxEl);
    host.appendChild(actorEl);
    host.appendChild(tagEl);
    host.appendChild(sayEl);
    fit();
    if (!fitBound) { window.addEventListener('resize', fit); fitBound = true; }
    if (tick) clearInterval(tick);
    tick = setInterval(loop, 110);
    return Promise.resolve();
  }

  /* 按现实时刻查朔在哪：返回 {place,scene,act,indoor,cn,map,xy} */
  function mins(hhmm) { var p = hhmm.split(':'); return (+p[0]) * 60 + (+p[1]); }

  function placeAt(date) {
    var plan = (date.getDay() === 0 || date.getDay() === 6) ? PLAN.weekend : PLAN.weekday;
    if (!plan || !plan.length) return null;
    var m = date.getHours() * 60 + date.getMinutes();
    var hit = plan[plan.length - 1];
    for (var i = 0; i < plan.length; i++) {
      if (mins(plan[i][0]) <= m && m < mins(plan[i][1])) { hit = plan[i]; break; }
    }
    var p = PLACES[hit[2]] || ['bedroom', true, '卧室', ['home', 6, 8]];
    return {
      place: hit[2], scene: hit[3], act: hit[4],
      room: p[0], indoor: !!p[1], cn: p[2],
      map: p[3] ? p[3][0] : 'road',
      xy: p[3] ? [p[3][1], p[3][2]] : [15, 11]
    };
  }

  /* o: {map:'room'|'world', sceneKey, night, rain, snow, period} */
  function setScene(name, o) {
    o = o || {};
    opts.night = !!o.night; opts.rain = !!o.rain;
    opts.snow = !!o.snow; opts.period = !!o.period;
    if (o.sceneKey) sceneKey = o.sceneKey;
    if (o.xy) forcedXY = o.xy;
    var want = o.map === 'world' ? 'world' : 'room';
    var key = want === 'world' ? '__world__' : name;
    if (mode !== want || cur !== key) { mode = want; cur = key; renderMap(want, name); }
    host.classList.toggle('is-night', opts.night);
    host.classList.toggle('is-period', opts.period);
    host.classList.toggle('is-world', mode === 'world');

    makeFx();
    placeActor();
  }

  function setAction(name, text) {
    if (!ACTOR_TXT[name]) name = 'idle';
    if (anim.name !== name) { anim.name = name; anim.t0 = performance.now(); }
    if (sayEl) sayEl.textContent = text || ACTOR_TXT[name] || '';
    placeActor();
  }

  function setTag(text) {
    if (!tagEl) return;
    tagEl.textContent = text;
    tagEl.style.display = 'block';
  }

  function say(text) {
    sayEl.textContent = text;
    sayEl.classList.add('on');
    setTimeout(function () { sayEl.classList.remove('on'); }, 2600);
  }

  global.SakuAscii = { init: init, setScene: setScene, setAction: setAction, setTag: setTag, say: say, placeAt: placeAt };
})(window);
