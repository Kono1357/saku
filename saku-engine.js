/* 朔的世界 —— 浏览器引擎（纯前端 · 确定性）
 *
 * 与服务器版的根本区别：
 *   世界不再"随机生成后落盘"，而是每次打开时，从世界起点用固定种子的
 *   伪随机序列重算到当前时刻。同一时刻的结果永远相同，
 *   所以刷新不可能改变任何一条记录，也不需要任何后端或数据库。
 */
(function (global) {
  'use strict';

  var WEEK_CN = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

  // ---------------------------------------------------------------- 确定性随机
  var rnd = Math.random;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedWith(s) { rnd = mulberry32(s); }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pickRaw(pool) { return pool[Math.floor(rnd() * pool.length)]; }

  // ---------------------------------------------------------------- 时间工具
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function addMin(d, m) { return new Date(d.getTime() + m * 60000); }
  function mins(a, b) { return (b.getTime() - a.getTime()) / 60000; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  // ---------------------------------------------------------------- 天气
  var WEATHER_BY_MONTH = {
    1: [['晴', 4], ['多云', 3], ['阴', 2], ['小雪', 1]],
    2: [['晴', 4], ['多云', 3], ['阴', 2], ['小雨', 1]],
    3: [['晴', 3], ['多云', 4], ['阴', 3], ['小雨', 2]],
    4: [['晴', 3], ['多云', 4], ['阴', 2], ['小雨', 3]],
    5: [['晴', 4], ['多云', 4], ['阴', 2], ['小雨', 3]],
    6: [['晴', 4], ['多云', 3], ['阴', 2], ['雷雨', 3]],
    7: [['晴', 5], ['多云', 3], ['阴', 1], ['雷雨', 3]],
    8: [['晴', 5], ['多云', 3], ['阴', 1], ['雷雨', 2]],
    9: [['晴', 5], ['多云', 3], ['阴', 1], ['小雨', 2]],
    10: [['晴', 5], ['多云', 3], ['阴', 2], ['小雨', 1]],
    11: [['晴', 4], ['多云', 3], ['阴', 3], ['小雨', 1]],
    12: [['晴', 5], ['多云', 3], ['阴', 2], ['小雪', 1]]
  };
  function pickWeather(d) {
    var pool = WEATHER_BY_MONTH[d.getMonth() + 1] || [['晴', 1]];
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i][1];
    var x = rnd() * total;
    for (i = 0; i < pool.length; i++) { x -= pool[i][1]; if (x <= 0) return pool[i][0]; }
    return pool[0][0];
  }

  var RAINY = ['小雨', '雷雨', '中雨', '大雨', '小雪'];
  var COLD = [11, 12, 1, 2, 3];
  var HOT = [6, 7, 8];
  var CYCLE_LEN = 28, PERIOD_DAYS = 5;

  // ---------------------------------------------------------------- 场景划分
  function sceneOf(d) {
    var wd = d.getDay();                       // 0=周日 6=周六
    var weekend = (wd === 0 || wd === 6);
    var h = d.getHours() + d.getMinutes() / 60;

    if (weekend) {
      if (h < 8.2) return 'sleep';
      if (h < 11.0) return 'wk_morning';
      if (h < 14.0) return 'wk_noon';
      if (h < 18.0) return 'wk_afternoon';
      if (h < 22.5) return 'wk_evening';
      return 'night';
    }
    if (h < 6.3) return 'sleep';
    if (h < 7.0) return 'wake';
    if (h < 7.7) return 'commute';
    if (h < 12.0) return 'school_am';
    if (h < 13.0) return 'lunch';
    if (h < 13.8) return 'school_noon';
    if (h < 17.2) return 'school_pm';
    if (h < 18.3) return 'commute_home';
    if (h < 19.6) return 'home_evening';
    if (h < 22.6) return 'study';
    return 'night';
  }

  var BODY_SCENES = { night: 1, wake: 1, study: 1, home_evening: 1, wk_evening: 1 };
  var CYCLE_SCENES = {
    wake: 1, school_am: 1, school_pm: 1, lunch: 1, home_evening: 1, night: 1,
    wk_morning: 1, wk_noon: 1, wk_afternoon: 1, wk_evening: 1
  };
  var TAIL_SCENES = {
    school_am: 1, school_pm: 1, school_noon: 1, study: 1, lunch: 1,
    home_evening: 1, wk_morning: 1, wk_noon: 1, wk_afternoon: 1, wk_evening: 1
  };

  // ---------------------------------------------------------------- 抽取
  function pick(pool, used) {
    if (!pool || !pool.length) return null;
    var cand = [], i;
    for (i = 0; i < pool.length; i++) if (used.indexOf(pool[i]) < 0) cand.push(pool[i]);
    if (!cand.length) cand = pool.slice();
    var t = cand[Math.floor(rnd() * cand.length)];
    used.push(t);
    return t;
  }

  function bodyPool(d, D) {
    if (d.getHours() >= 21 || d.getHours() < 6) return D.BODY.concat(D.BODY_NIGHT);
    return D.BODY;
  }

  function tail(d, weather, scene, D) {
    if (scene === 'sleep') return '';
    var out = '';
    function add(s) { out = out + ' ' + s.trim(); }
    if (RAINY.indexOf(weather) >= 0 && TAIL_SCENES[scene] && rnd() < 0.45) add(pickRaw(D.RAIN_TAILS));
    var m = d.getMonth() + 1;
    if (COLD.indexOf(m) >= 0 && rnd() < 0.22) add(pickRaw(D.COLD_TAILS));
    else if (HOT.indexOf(m) >= 0 && rnd() < 0.20) add(pickRaw(D.HOT_TAILS));
    if (rnd() < 0.04) add(pickRaw(D.DICE_TAILS));
    else if (rnd() < 0.06) add(pickRaw(D.CHAPTER_TAILS));
    return out;
  }

  function render(scene, d, weather, used, first, inPeriod, D) {
    var sc = D.scenes[scene];
    if (first && sc) {
      var t = pick(sc.head, used);
      if (t) return t;
    }
    if (inPeriod && CYCLE_SCENES[scene] && rnd() < 0.30) {
      var c = pick(D.CYCLE, used);
      if (c) return c;
    }
    if (BODY_SCENES[scene] && rnd() < 0.28) {
      var b = pick(bodyPool(d, D), used);
      if (b) return b;
    }
    if (!sc) return null;
    var text = pick(sc.body, used);
    if (!text) return null;
    return text + tail(d, weather, scene, D);
  }

  // ---------------------------------------------------------------- 颗粒度
  function stepRange(g) {
    if (g <= 30) return [5, 12];
    if (g <= 120) return [10, 25];
    if (g <= 720) return [20, 45];
    if (g <= 2880) return [35, 70];
    if (g <= 10080) return [45, 90];
    return [70, 130];
  }

  function inPeriod(anchorDate, d) {
    var days = Math.round((startOfDay(d) - startOfDay(anchorDate)) / 86400000);
    return (((days % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN) < PERIOD_DAYS;
  }

  // ---------------------------------------------------------------- 时间点规划
  function planPoints(cur, now, lo, hi, anchor, D) {
    var pts = [], t = new Date(cur), i;

    while (t < now) {
      t = addMin(t, ri(lo, hi));
      if (t < now) pts.push(new Date(t));
    }

    // 场景段落（5 分钟粒度扫描），整段没有记录的（睡眠除外）补一条
    var segs = [], segStart = new Date(cur), last = sceneOf(cur), tt = new Date(cur), guard = 0;
    while (tt <= now && guard++ < 300000) {
      var s = sceneOf(tt);
      if (s !== last) { segs.push([segStart, last, new Date(tt)]); segStart = new Date(tt); last = s; }
      tt = addMin(tt, 5);
    }
    segs.push([segStart, last, new Date(now)]);

    for (i = 0; i < segs.length; i++) {
      var st = segs[i][0], scn = segs[i][1], en = segs[i][2];
      if (scn === 'sleep' || st >= now) continue;
      var covered = false;
      for (var j = 0; j < pts.length; j++) if (pts[j] >= st && pts[j] < en) { covered = true; break; }
      if (!covered) pts.push(addMin(st, ri(0, 12)));
    }

    pts.sort(function (a, b) { return a - b; });
    var seen = {}, uniq = [];
    for (i = 0; i < pts.length; i++) {
      if (pts[i] > now) continue;
      var k = pts[i].getTime();
      if (seen[k]) continue;
      seen[k] = 1; uniq.push(pts[i]);
    }
    pts = uniq;

    // 每天保底一条"身体与欲望"
    var bodyPts = [], usedBody = {};
    var days = {};
    for (i = 0; i < pts.length; i++) days[dayKey(pts[i])] = 1;
    Object.keys(days).sort().forEach(function (day) {
      var buckets = {};
      for (var n = 0; n < pts.length; n++) {
        if (dayKey(pts[n]) !== day) continue;
        var sk = sceneOf(pts[n]);
        if (!BODY_SCENES[sk]) continue;
        (buckets[sk] = buckets[sk] || []).push(pts[n]);
      }
      var second = [], firsts = [];
      Object.keys(buckets).forEach(function (sk) {
        if (buckets[sk].length >= 2) second.push(buckets[sk][1]);
        firsts.push(buckets[sk][0]);
      });
      var cand = second.length ? second : firsts;
      if (cand.length) {
        var g = cand[Math.floor(rnd() * cand.length)].getTime();
        if (!usedBody[g]) { usedBody[g] = 1; bodyPts.push(g); }
      }
    });

    // 经期期间每天保底一条
    var cyclePts = [], usedCyc = {};
    Object.keys(days).sort().forEach(function (day) {
      var probe = new Date(day + 'T12:00:00');
      if (!inPeriod(anchor, probe)) return;
      var buckets = {};
      for (var n = 0; n < pts.length; n++) {
        if (dayKey(pts[n]) !== day) continue;
        if (bodyPts.indexOf(pts[n].getTime()) >= 0) continue;
        var sk = sceneOf(pts[n]);
        if (!CYCLE_SCENES[sk]) continue;
        (buckets[sk] = buckets[sk] || []).push(pts[n]);
      }
      var second = [], firsts = [];
      Object.keys(buckets).forEach(function (sk) {
        if (buckets[sk].length >= 2) second.push(buckets[sk][1]);
        firsts.push(buckets[sk][0]);
      });
      var cand = second.length ? second : firsts;
      if (cand.length) {
        var g = cand[Math.floor(rnd() * cand.length)].getTime();
        if (!usedCyc[g] && bodyPts.indexOf(g) < 0) { usedCyc[g] = 1; cyclePts.push(g); }
      }
    });

    return { pts: pts, bodyPts: bodyPts, cyclePts: cyclePts };
  }

  // ---------------------------------------------------------------- 世界生成
  function generate(worldStart, now, D) {
    seedWith(worldStart.seed);

    var cur = new Date(worldStart.date);
    var events = [];
    var weather = pickWeather(cur);
    var weatherSetAt = new Date(cur);
    var used = [], usedDay = null, seenScenes = [];
    var prevT = new Date(cur);
    var guard = 0;

    while (cur < now && guard++ < 5000) {
      var totalMin = mins(cur, now);
      var r = stepRange(totalMin);
      var lo = r[0], hi = r[1];

      if (totalMin < lo) break;                    // 还不到该记下一条的时候

      var MAXI = 400;
      var est = totalMin / ((lo + hi) / 2);
      if (est > MAXI) { var f = est / MAXI; lo = Math.max(5, Math.floor(lo * f)); hi = Math.max(6, Math.floor(hi * f)); }

      var planned = planPoints(cur, now, lo, hi, worldStart.anchor, D);
      var pts = planned.pts;

      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];

        if (mins(weatherSetAt, p) > 6 * 60 + rnd() * 8 * 60) {
          weather = pickWeather(p);
          weatherSetAt = new Date(p);
        }

        var dk = dayKey(p);
        if (usedDay !== dk) { usedDay = dk; used = []; seenScenes = []; }

        var scene = sceneOf(p);
        if (scene === 'sleep' && mins(prevT, p) < 110) continue;

        var first = seenScenes.indexOf(scene) < 0;
        var text;
        if (planned.bodyPts.indexOf(p.getTime()) >= 0) {
          text = pick(bodyPool(p, D), used);
        } else if (planned.cyclePts.indexOf(p.getTime()) >= 0) {
          text = pick(D.CYCLE, used);
        } else {
          text = render(scene, p, weather, used, first, inPeriod(worldStart.anchor, p), D);
        }
        if (text) {
          seenScenes.push(scene);
          events.push({ t: new Date(p), s: scene, x: text });
          prevT = new Date(p);
        }
      }
      cur = new Date(now);
    }
    return { events: events, weather: weather };
  }

  // ---------------------------------------------------------------- 对外
  function feed(worldStart, now, D) {
    var res = generate(worldStart, now, D);
    var events = res.events;

    var days = {}, order = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i], k = dayKey(ev.t);
      if (!days[k]) {
        days[k] = { date: k, weekday: WEEK_CN[(ev.t.getDay() + 6) % 7], items: [] };
        order.push(k);
      }
      days[k].items.push({ time: hhmm(ev.t), text: ev.x });
    }

    var last = events.length ? events[events.length - 1].t : null;
    return {
      now: dayKey(now) + ' ' + hhmm(now),
      nowWeekday: WEEK_CN[(now.getDay() + 6) % 7],
      bornAt: dayKey(worldStart.date),
      lastTime: last ? hhmm(last) : '--:--',
      weather: res.weather,
      scene: sceneOf(now),
      period: inPeriod(worldStart.anchor, now),
      total: events.length,
      days: order.map(function (k) { return days[k]; })
    };
  }

  global.Saku = { feed: feed, sceneOf: sceneOf, inPeriod: inPeriod, WEEK_CN: WEEK_CN };
})(typeof window !== 'undefined' ? window : this);
