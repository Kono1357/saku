/* 《月途》—— 朔一个人玩的单人桌游
 * 玩法：掷骰子沿着纸上画的路往前走，从家门口一直走到月亮。
 * 纯前端、无依赖、确定性种子（同一天同一局结果一致）。
 */
(function (global) {
  'use strict';

  var COLS = 10, ROWS = 3;          // 10 x 3 = 30 格，蛇形
  var CELLS = COLS * ROWS;

  /* 格子类型：字符 -> [颜色, 说明, 效果] */
  var KINDS = {
    '.': ['#4a5570', '空地', 'nothing'],
    ',': ['#5f7f4a', '落叶', 'mood+1'],
    '~': ['#2d5a9a', '水洼', 'skip'],
    'b': ['#8a6f4a', '长椅', 'rest'],
    '"': ['#3f7a45', '草地', 'mood+1'],
    '*': ['#d8cf9a', '星星', 'again'],
    'o': ['#c9a95e', '路灯', 'mood+2'],
    'T': ['#3f7a45', '树', 'nothing'],
    '(': ['#e8d9a8', '月亮', 'goal']
  };

  var state = null;
  var host = null, boardEl = null, diceEl = null, infoEl = null, logEl = null;
  var rnd = Math.random;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- 棋盘生成（确定性） ---------- */
  function buildBoard(seed) {
    rnd = mulberry32(seed);
    var pool = [',', '"', 'T', '.', '.', 'o', 'b', '~', '*', '.'];
    var cells = [];
    for (var i = 0; i < CELLS; i++) {
      if (i === 0) { cells.push('.'); continue; }
      if (i === CELLS - 1) { cells.push('('); continue; }
      if (i % 7 === 0) { cells.push('o'); continue; }
      cells.push(pool[Math.floor(rnd() * pool.length)]);
    }
    return cells;
  }

  /* ---------- 蛇形布局 ---------- */
  function cellPos(i) {
    var row = Math.floor(i / COLS);
    var col = (row % 2 === 0) ? (i % COLS) : (COLS - 1 - (i % COLS));
    return { r: row, c: col };
  }

  /* ---------- 渲染 ---------- */
  function esc(ch) { return ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch; }

  function render() {
    var grid = [];
    for (var r = 0; r < ROWS * 3; r++) grid.push(new Array(COLS * 4).fill(null));

    state.cells.forEach(function (ch, i) {
      var p = cellPos(i);
      var baseY = p.r * 3, baseX = p.c * 4;
      var here = (i === state.pos);
      var visited = state.visited[i];
      var col = KINDS[ch] ? KINDS[ch][0] : '#4a5570';
      if (here) col = '#f2ecdc';
      else if (visited) col = '#7d8a9e';

      grid[baseY][baseX] = [here ? '@' : ch, col];
      // 连接线
      if (p.c < COLS - 1) {
        grid[baseY][baseX + 1] = ['-', '#3d4763'];
        grid[baseY][baseX + 2] = ['-', '#3d4763'];
        grid[baseY][baseX + 3] = ['>', '#3d4763'];
      }
    });

    var html = grid.map(function (row) {
      var out = '';
      row.forEach(function (cell2) {
        out += cell2 ? '<span style="color:' + cell2[1] + '">' + esc(cell2[0]) + '</span>' : ' ';
      });
      return out;
    }).join('\n');
    boardEl.innerHTML = html;
  }

  function diceFace(n) {
    var faces = {
      1: ['+-----+', '|     |', '|  o  |', '|     |', '+-----+'],
      2: ['+-----+', '| o   |', '|     |', '|   o |', '+-----+'],
      3: ['+-----+', '| o   |', '|  o  |', '|   o |', '+-----+'],
      4: ['+-----+', '| o o |', '|     |', '| o o |', '+-----+'],
      5: ['+-----+', '| o o |', '|  o  |', '| o o |', '+-----+'],
      6: ['+-----+', '| o o |', '| o o |', '| o o |', '+-----+']
    };
    return faces[n] || faces[1];
  }

  function drawDice(n) {
    var f = diceFace(n);
    if (n === 0) f = ['+-----+', '|     |', '|  ?  |', '|     |', '+-----+'];
    diceEl.innerHTML = f.map(function (l) {
      return '<span style="color:#e8d9a8">' + l + '</span>';
    }).join('\n');
  }

  function say(text) {
    if (!logEl) return;
    var div = document.createElement('div');
    div.textContent = text;
    logEl.insertBefore(div, logEl.firstChild);
    while (logEl.children.length > 7) logEl.removeChild(logEl.lastChild);
  }

  function status() {
    infoEl.innerHTML = '<span style="color:#c9b98f">步数 ' + state.steps + '</span>'
      + '  <span style="color:#8ea0bd">心情 ' + state.mood + '/10</span>'
      + '  <span style="color:#5d6a80">第 ' + state.turn + ' 回合</span>';
  }

  /* ---------- 掷骰子 ---------- */
  function roll() {
    if (state.over) { say('已经走到月亮了。'); return; }
    if (state.skip > 0) {
      state.skip--;
      state.turn++;
      say('（水洼）这一回合停一下。');
      status();
      return;
    }
    var n = 1 + Math.floor(rnd() * 6);
    state.turn++;
    drawDice(n);
    var from = state.pos;
    step(n, from);
  }

  function step(n, from) {
    var left = n;
    function advance() {
      if (left <= 0) {
        landing(from);
        return;
      }
      if (state.pos >= CELLS - 1) { landing(from); return; }
      state.pos++;
      state.visited[state.pos] = true;
      left--;
      render();
      setTimeout(advance, 130);
    }
    advance();
  }

  function landing(from) {
    var ch = state.cells[state.pos];
    var k = KINDS[ch] || KINDS['.'];
    state.steps++;
    var eff = k[2];
    if (eff === 'mood+1') { state.mood = Math.min(10, state.mood + 1); say('（' + k[1] + '）心情好了一点。'); }
    else if (eff === 'mood+2') { state.mood = Math.min(10, state.mood + 2); say('（路灯）灯光落在肩上，暖了一点。'); }
    else if (eff === 'skip') { state.skip = 1; say('（水洼）踩到水了，停一回合。'); }
    else if (eff === 'rest') { state.mood = Math.min(10, state.mood + 1); say('（长椅）坐了一会儿。'); }
    else if (eff === 'again') { say('（星星）再掷一次。'); status(); render(); setTimeout(roll, 500); return; }
    else if (eff === 'goal') { state.over = true; }
    else { say('（' + k[1] + '）什么也没发生。'); }

    status();
    render();
    if (state.over) {
      setTimeout(function () {
        say('走到月亮了。用了 ' + state.turn + ' 回合，' + state.steps + ' 步。');
        say('朔把骰子收进口袋，把纸折好。');
      }, 300);
    }
  }

  /* ---------- 开局 ---------- */
  function newGame(seed) {
    var s = seed || (new Date().getFullYear() * 10000
      + (new Date().getMonth() + 1) * 100
      + new Date().getDate());
    state = {
      cells: buildBoard(s),
      pos: 0,
      steps: 0,
      turn: 0,
      mood: 5,
      skip: 0,
      over: false,
      visited: {}
    };
    state.visited[0] = true;
    logEl.innerHTML = '';
    say('朔在纸上画了一条路，从家门口一直画到月亮。');
    say('点「掷骰子」开始。');
    drawDice(0);
    status();
    render();
  }

  function init(o) {
    host = o.host;
    host.innerHTML = ''
      + '<div class="mp-head">月途 · 朔画的单人桌游</div>'
      + '<pre class="mp-board"></pre>'
      + '<div class="mp-row">'
      + '  <pre class="mp-dice"></pre>'
      + '  <div class="mp-side"><div class="mp-info"></div><div class="mp-btns">'
      + '    <button class="mp-roll">掷骰子</button>'
      + '    <button class="mp-new">重开</button>'
      + '  </div></div>'
      + '</div>'
      + '<div class="mp-log"></div>';
    boardEl = host.querySelector('.mp-board');
    diceEl = host.querySelector('.mp-dice');
    infoEl = host.querySelector('.mp-info');
    logEl = host.querySelector('.mp-log');
    host.querySelector('.mp-roll').addEventListener('click', roll);
    host.querySelector('.mp-new').addEventListener('click', function () { newGame(); });
    newGame();
  }

  global.MoonPath = { init: init, newGame: newGame, roll: roll };
})(window);
