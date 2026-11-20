/*
  spaceinvaders.js
  スペースインベーダー（ブラッシュアップ版）

  - ドット絵のインベーダー3種（2コマアニメ）＋UFO
  - 防御壁（トーチカ）は弾で少しずつ削れる
  - インベーダーは数が減るほど速くなる（行進音つき）
  - ハイスコア保存（localStorage）、エクストラライフ、一時停止、ミュート
  - requestAnimationFrame による滑らかな描画、高解像度ディスプレイ対応
*/
(function () {
  'use strict';

  // ===== 定数 =====
  var W = 800, H = 600;
  var PX = 3;                 // ドット1つの大きさ
  var GROUND_Y = 568;
  var PLAYER_Y = 536;
  var FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", "Meiryo", monospace';
  var STORAGE_HI = 'practice5_invaders_hi';
  var STORAGE_MUTE = 'practice5_invaders_mute';

  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 無視 */ } }
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  // ===== ドット絵データ =====
  var ART = {
    squid: [[
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '..#..#..',
      '.#.##.#.',
      '#.#..#.#'
    ], [
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '.#.##.#.',
      '#......#',
      '.#....#.'
    ]],
    crab: [[
      '..#.....#..',
      '...#...#...',
      '..#######..',
      '.##.###.##.',
      '###########',
      '#.#######.#',
      '#.#.....#.#',
      '...##.##...'
    ], [
      '..#.....#..',
      '#..#...#..#',
      '#.#######.#',
      '###.###.###',
      '###########',
      '.#########.',
      '..#.....#..',
      '.#.......#.'
    ]],
    octopus: [[
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '...##..##...',
      '..##.##.##..',
      '##........##'
    ], [
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '..###..###..',
      '.##..##..##.',
      '..##....##..'
    ]],
    ship: [[
      '......#......',
      '.....###.....',
      '.....###.....',
      '.###########.',
      '#############',
      '#############',
      '#############',
      '#############'
    ]],
    ufo: [[
      '.....######.....',
      '...##########...',
      '..############..',
      '.##.##.##.##.##.',
      '################',
      '..###..##..###..',
      '...#........#...'
    ]]
  };

  var TYPES = [
    { key: 'squid',   points: 30, color: '#ff6bd6' },
    { key: 'crab',    points: 20, color: '#5ef0ff' },
    { key: 'octopus', points: 10, color: '#8dff6a' }
  ];
  var ROW_TYPES = [0, 1, 1, 2, 2];
  var COLS = 11;
  var SHIP_COLOR = '#3dff8b';
  var UFO_COLOR = '#ff4b5c';
  var BUNKER_COLOR = '#3dff8b';

  // ドット絵を（光彩つきで）オフスクリーンキャンバスに描いておく
  function makeSprite(rows, color, res) {
    var glow = 6;
    var w = rows[0].length * PX, h = rows.length * PX;
    var c = document.createElement('canvas');
    c.width = Math.ceil((w + glow * 2) * res);
    c.height = Math.ceil((h + glow * 2) * res);
    var x = c.getContext('2d');
    x.scale(res, res);
    x.fillStyle = color;
    x.shadowColor = color;
    x.shadowBlur = glow;
    for (var r = 0; r < rows.length; r++) {
      for (var col = 0; col < rows[r].length; col++) {
        if (rows[r][col] === '#') x.fillRect(glow + col * PX, glow + r * PX, PX, PX);
      }
    }
    return { img: c, w: w, h: h, glow: glow, res: res };
  }

  function buildSprites(res) {
    var s = {};
    TYPES.forEach(function (t) {
      s[t.key] = ART[t.key].map(function (rows) { return makeSprite(rows, t.color, res); });
    });
    s.ship = makeSprite(ART.ship[0], SHIP_COLOR, res);
    s.shipIcon = makeSprite(ART.ship[0], SHIP_COLOR, res);
    s.ufo = makeSprite(ART.ufo[0], UFO_COLOR, res);
    return s;
  }

  function drawSprite(ctx, spr, cx, cy, scale) {
    scale = scale || 1;
    var dw = spr.img.width / spr.res * scale;
    var dh = spr.img.height / spr.res * scale;
    ctx.drawImage(spr.img, cx - dw / 2, cy - dh / 2, dw, dh);
  }

  // ===== サウンド =====
  function Sound() {
    this.ctx = null;
    this.master = null;
    this.buffers = {};
    this.muted = storeGet(STORAGE_MUTE) === '1';
    this.marchIndex = 0;
    this.lastMarch = 0;
    this.ufoNodes = null;
  }

  // ブラウザの自動再生制限のため、最初の操作時に音を有効にする
  Sound.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    var self = this;
    ['shoot', 'bang', 'explosion', 'invaderkilled'].forEach(function (name) {
      fetch('sounds/' + name + '.wav')
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) {
          return new Promise(function (res, rej) { self.ctx.decodeAudioData(b, res, rej); });
        })
        .then(function (buf) { self.buffers[name] = buf; })
        .catch(function () { /* 音が読めなくてもゲームは続行 */ });
    });
  };

  Sound.prototype.play = function (name, vol) {
    if (!this.ctx || !this.buffers[name]) return;
    var src = this.ctx.createBufferSource();
    var g = this.ctx.createGain();
    g.gain.value = vol === undefined ? 1 : vol;
    src.buffer = this.buffers[name];
    src.connect(g);
    g.connect(this.master);
    src.start(0);
  };

  Sound.prototype.tone = function (freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  // インベーダーの「ドッ、ドッ、ドッ、ドッ」という行進音
  Sound.prototype.march = function () {
    if (!this.ctx) return;
    var now = this.ctx.currentTime;
    if (now - this.lastMarch < 0.06) return;
    this.lastMarch = now;
    var notes = [123.5, 110, 98, 92.5];
    this.tone(notes[this.marchIndex], 0.09, 'square', 0.22);
    this.marchIndex = (this.marchIndex + 1) % notes.length;
  };

  Sound.prototype.ufoStart = function () {
    if (!this.ctx || this.ufoNodes) return;
    var o = this.ctx.createOscillator();
    var lfo = this.ctx.createOscillator();
    var lfoGain = this.ctx.createGain();
    var g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = 420;
    lfo.frequency.value = 7;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(this.master);
    o.start();
    lfo.start();
    this.ufoNodes = { o: o, lfo: lfo };
  };

  Sound.prototype.ufoStop = function () {
    if (!this.ufoNodes) return;
    try { this.ufoNodes.o.stop(); this.ufoNodes.lfo.stop(); } catch (e) { /* 無視 */ }
    this.ufoNodes = null;
  };

  Sound.prototype.setMuted = function (m) {
    this.muted = m;
    storeSet(STORAGE_MUTE, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  };

  // ===== 防御壁（トーチカ） =====
  function Bunker(x, y) {
    this.cs = 4;
    this.cols = 22;
    this.rows = 16;
    this.x = x;
    this.y = y;
    this.w = this.cols * this.cs;
    this.h = this.rows * this.cs;
    this.cells = new Uint8Array(this.cols * this.rows);
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var filled = true;
        if (r + c < 4 || r + (this.cols - 1 - c) < 4) filled = false;           // 上の角を丸める
        if (r >= 11 && c >= 7 && c <= 14) filled = false;                        // 下のアーチ
        if (r === 10 && c >= 8 && c <= 13) filled = false;
        this.cells[r * this.cols + c] = filled ? 1 : 0;
      }
    }
  }

  Bunker.prototype.filledAt = function (px, py) {
    var c = Math.floor((px - this.x) / this.cs);
    var r = Math.floor((py - this.y) / this.cs);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.cells[r * this.cols + c] === 1;
  };

  // y0→y1 の線分上で最初にぶつかった位置を返す（なければ null）
  Bunker.prototype.hitSegment = function (x, y0, y1) {
    if (x < this.x || x >= this.x + this.w) return null;
    var lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    if (hi < this.y || lo > this.y + this.h) return null;
    var step = y1 > y0 ? 2 : -2;
    var n = Math.ceil(Math.abs(y1 - y0) / 2) + 1;
    for (var i = 0, y = y0; i <= n; i++, y += step) {
      var yy = step > 0 ? Math.min(y, y1) : Math.max(y, y1);
      for (var dx = -1; dx <= 1; dx++) {
        if (this.filledAt(x + dx, yy)) return yy;
      }
    }
    return null;
  };

  Bunker.prototype.damage = function (px, py, radius) {
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var cx = this.x + c * this.cs + this.cs / 2;
        var cy = this.y + r * this.cs + this.cs / 2;
        var d = Math.hypot(cx - px, cy - py);
        if (d < radius * 0.55 || (d < radius && Math.random() < 0.5)) {
          this.cells[r * this.cols + c] = 0;
        }
      }
    }
  };

  Bunker.prototype.eraseRect = function (l, t, r, b) {
    if (r < this.x || l > this.x + this.w || b < this.y || t > this.y + this.h) return;
    for (var row = 0; row < this.rows; row++) {
      for (var c = 0; c < this.cols; c++) {
        var x0 = this.x + c * this.cs, y0 = this.y + row * this.cs;
        if (x0 + this.cs > l && x0 < r && y0 + this.cs > t && y0 < b) this.cells[row * this.cols + c] = 0;
      }
    }
  };

  Bunker.prototype.draw = function (ctx) {
    ctx.fillStyle = BUNKER_COLOR;
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (this.cells[r * this.cols + c]) {
          ctx.fillRect(this.x + c * this.cs, this.y + r * this.cs, this.cs, this.cs);
        }
      }
    }
  };

  // ===== ゲーム本体 =====
  function Game(canvas, sound) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sound = sound;
    this.dpr = 0;
    this.resize();

    this.hiScore = parseInt(storeGet(STORAGE_HI), 10) || 0;
    this.state = 'title';
    this.stateTime = 0;
    this.keys = { left: false, right: false, fire: false };
    this.touch = { left: false, right: false, fire: false };
    this.onUiChange = null;

    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.setupLevel();
  }

  Game.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.sprites = buildSprites(dpr);
  };

  Game.prototype.setState = function (s) {
    this.state = s;
    this.stateTime = 0;
    if (this.onUiChange) this.onUiChange();
  };

  Game.prototype.newGame = function () {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.nextExtra = 2000;
    this.newRecord = false;
    this.setupLevel();
    this.setState('intro');
  };

  Game.prototype.setupLevel = function () {
    var startY = 130 + Math.min(this.level - 1, 6) * 16;
    this.invaders = [];
    for (var row = 0; row < ROW_TYPES.length; row++) {
      var t = TYPES[ROW_TYPES[row]];
      var spr = ART[t.key][0];
      for (var col = 0; col < COLS; col++) {
        this.invaders.push({
          x: W / 2 + (col - (COLS - 1) / 2) * 46,
          y: startY + row * 38,
          w: spr[0].length * PX,
          h: spr.length * PX,
          type: t,
          col: col
        });
      }
    }
    this.dir = 1;
    this.dropNext = false;
    this.frame = 0;
    this.stepTimer = 0.5;

    this.bunkers = [];
    for (var i = 0; i < 4; i++) {
      this.bunkers.push(new Bunker(W * (i + 1) / 5 - 44, 432));
    }

    this.player = { x: W / 2, y: PLAYER_Y, w: 13 * PX, h: 8 * PX, invuln: 0 };
    this.rockets = [];
    this.bombs = [];
    this.fireCooldown = 0;
    this.bombTimer = 1.2;
    this.ufo = null;
    this.ufoTimer = rand(14, 24);
    this.sound.ufoStop();
  };

  Game.prototype.tryStart = function () {
    if (this.state === 'title' || (this.state === 'gameover' && this.stateTime > 1)) {
      this.sound.unlock();
      this.newGame();
    }
  };

  Game.prototype.togglePause = function (force) {
    if (this.state === 'play' && force !== false) {
      this.pausedFrom = 'play';
      this.sound.ufoStop();
      this.setState('paused');
    } else if (this.state === 'paused' && force !== true) {
      this.state = this.pausedFrom || 'play';
      if (this.ufo) this.sound.ufoStart();
      if (this.onUiChange) this.onUiChange();
    }
  };

  Game.prototype.toggleMute = function () {
    this.sound.unlock();
    this.sound.setMuted(!this.sound.muted);
    if (this.onUiChange) this.onUiChange();
  };

  // ===== 入力 =====
  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'fire', ArrowUp: 'fire', KeyW: 'fire',
    Enter: 'enter',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute'
  };

  Game.prototype.onKey = function (code, down, repeat) {
    var k = KEYMAP[code];
    if (!k) return false;
    if (down && !repeat) {
      this.sound.unlock();
      if (k === 'pause') this.togglePause();
      else if (k === 'mute') this.toggleMute();
      else if (k === 'fire' || k === 'enter') this.tryStart();
    }
    if (k === 'left' || k === 'right' || k === 'fire') this.keys[k] = down;
    return true;
  };

  Game.prototype.input = function (k) { return this.keys[k] || this.touch[k]; };

  // ===== エフェクト =====
  Game.prototype.burst = function (x, y, color, count, speed) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = rand(0.3, 1) * speed;
      this.particles.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rand(0.4, 0.9), max: 0.9, color: color, size: Math.random() < 0.3 ? 4 : 3
      });
    }
  };

  Game.prototype.popText = function (x, y, text, color) {
    this.texts.push({ x: x, y: y, text: text, color: color || '#fff', life: 1.2 });
  };

  Game.prototype.updateEffects = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 60 * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.y -= 30 * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  };

  Game.prototype.addScore = function (n) {
    this.score += n;
    if (this.score >= this.nextExtra) {
      this.nextExtra += 2000;
      if (this.lives < 6) {
        this.lives++;
        this.popText(this.player.x, this.player.y - 30, '1UP!', SHIP_COLOR);
        this.sound.tone(660, 0.12, 'square', 0.2);
        var s = this.sound;
        setTimeout(function () { s.tone(990, 0.18, 'square', 0.2); }, 110);
      }
    }
  };

  // ===== 更新 =====
  Game.prototype.update = function (dt) {
    this.stateTime += dt;
    switch (this.state) {
      case 'title':
      case 'gameover':
        this.updateEffects(dt);
        break;
      case 'intro':
        this.updateEffects(dt);
        if (this.stateTime >= 2.4) this.setState('play');
        break;
      case 'play':
        this.updatePlay(dt);
        this.updateEffects(dt);
        break;
      case 'dying':
        this.updateEffects(dt);
        if (this.stateTime >= 1.6) {
          if (this.lives <= 0) this.gameOver();
          else {
            this.player.x = W / 2;
            this.player.invuln = 2;
            this.setState('play');
          }
        }
        break;
      case 'clear':
        this.updateEffects(dt);
        if (this.stateTime >= 2.4) {
          this.level++;
          this.setupLevel();
          this.setState('intro');
        }
        break;
      case 'paused':
        break;
    }
  };

  Game.prototype.stepInterval = function () {
    var n = this.invaders.length;
    var base = 0.025 + 0.6 * (n / (COLS * ROW_TYPES.length));
    return base * Math.pow(0.9, Math.min(this.level - 1, 8));
  };

  Game.prototype.stepFormation = function () {
    var inv = this.invaders, i;
    if (this.dropNext) {
      for (i = 0; i < inv.length; i++) inv[i].y += 16;
      this.dir *= -1;
      this.dropNext = false;
    } else {
      for (i = 0; i < inv.length; i++) inv[i].x += 8 * this.dir;
    }
    var minX = Infinity, maxX = -Infinity, maxB = -Infinity;
    for (i = 0; i < inv.length; i++) {
      minX = Math.min(minX, inv[i].x - inv[i].w / 2);
      maxX = Math.max(maxX, inv[i].x + inv[i].w / 2);
      maxB = Math.max(maxB, inv[i].y + inv[i].h / 2);
    }
    if ((this.dir > 0 && maxX + 8 > W - 16) || (this.dir < 0 && minX - 8 < 16)) this.dropNext = true;
    this.frame ^= 1;
    this.sound.march();

    // インベーダーが重なった防御壁は削れる
    for (i = 0; i < inv.length; i++) {
      var v = inv[i];
      for (var b = 0; b < this.bunkers.length; b++) {
        this.bunkers[b].eraseRect(v.x - v.w / 2, v.y - v.h / 2, v.x + v.w / 2, v.y + v.h / 2);
      }
    }
    // 地上まで来たら侵略されてゲームオーバー
    if (maxB >= this.player.y - this.player.h / 2) this.killPlayer(true);
  };

  Game.prototype.fireBomb = function () {
    // 各列の一番下のインベーダーから撃つ（4割の確率でプレイヤーに近い列を狙う）
    var bottoms = {};
    this.invaders.forEach(function (v) {
      if (!bottoms[v.col] || bottoms[v.col].y < v.y) bottoms[v.col] = v;
    });
    var list = Object.keys(bottoms).map(function (k) { return bottoms[k]; });
    if (!list.length) return;
    var shooter;
    if (Math.random() < 0.4) {
      var px = this.player.x;
      list.sort(function (a, b) { return Math.abs(a.x - px) - Math.abs(b.x - px); });
      shooter = list[0];
    } else {
      shooter = list[Math.floor(Math.random() * list.length)];
    }
    this.bombs.push({
      x: shooter.x, y: shooter.y + shooter.h / 2 + 4,
      vy: 170 + Math.min(this.level - 1, 8) * 18,
      kind: Math.random() < 0.5 ? 0 : 1, t: 0
    });
  };

  Game.prototype.updatePlay = function (dt) {
    var p = this.player, i, j, b;

    // --- プレイヤー移動・発射 ---
    var move = (this.input('left') ? -1 : 0) + (this.input('right') ? 1 : 0);
    p.x = Math.max(28, Math.min(W - 28, p.x + move * 300 * dt));
    if (p.invuln > 0) p.invuln -= dt;
    this.fireCooldown -= dt;
    if (this.input('fire') && this.fireCooldown <= 0 && this.rockets.length < 2) {
      this.rockets.push({ x: p.x, y: p.y - p.h / 2 - 6, vy: -560 });
      this.fireCooldown = 0.3;
      this.sound.play('shoot', 0.35);
    }

    // --- 自機の弾 ---
    for (i = this.rockets.length - 1; i >= 0; i--) {
      var r = this.rockets[i];
      var prevY = r.y;
      r.y += r.vy * dt;
      var hit = false;

      if (r.y < 52) {
        this.burst(r.x, 52, '#ffffff', 5, 80);
        hit = true;
      }
      // 防御壁
      for (b = 0; b < this.bunkers.length && !hit; b++) {
        var hy = this.bunkers[b].hitSegment(r.x, prevY, r.y);
        if (hy !== null) {
          this.bunkers[b].damage(r.x, hy, 7);
          this.burst(r.x, hy, BUNKER_COLOR, 5, 70);
          hit = true;
        }
      }
      // 敵の弾との相打ち
      for (j = this.bombs.length - 1; j >= 0 && !hit; j--) {
        var bm = this.bombs[j];
        if (Math.abs(bm.x - r.x) < 6 && bm.y + 8 >= r.y && bm.y - 8 <= prevY) {
          this.bombs.splice(j, 1);
          this.burst(r.x, bm.y, '#ffd23f', 8, 100);
          this.addScore(5);
          hit = true;
        }
      }
      // インベーダー
      for (j = this.invaders.length - 1; j >= 0 && !hit; j--) {
        var v = this.invaders[j];
        if (Math.abs(r.x - v.x) <= v.w / 2 + 1 && r.y <= v.y + v.h / 2 && prevY >= v.y - v.h / 2) {
          this.invaders.splice(j, 1);
          this.addScore(v.type.points);
          this.burst(v.x, v.y, v.type.color, 16, 160);
          this.sound.play('invaderkilled', 0.5);
          hit = true;
        }
      }
      // UFO
      if (!hit && this.ufo) {
        var u = this.ufo;
        if (Math.abs(r.x - u.x) <= u.w / 2 && r.y <= u.y + u.h / 2 && prevY >= u.y - u.h / 2) {
          var pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
          this.addScore(pts);
          this.popText(u.x, u.y, pts + '点', UFO_COLOR);
          this.burst(u.x, u.y, UFO_COLOR, 30, 220);
          this.burst(u.x, u.y, '#ffffff', 10, 140);
          this.shake = 0.25;
          this.sound.ufoStop();
          this.sound.play('bang', 0.6);
          this.ufo = null;
          hit = true;
        }
      }
      if (hit) this.rockets.splice(i, 1);
    }

    // --- インベーダーの行進 ---
    this.stepTimer -= dt;
    while (this.stepTimer <= 0 && this.state === 'play' && this.invaders.length) {
      this.stepTimer += this.stepInterval();
      this.stepFormation();
    }
    if (this.state !== 'play') return;

    // --- 敵の弾 ---
    var maxBombs = Math.min(3 + Math.floor(this.level / 2), 7);
    this.bombTimer -= dt;
    if (this.bombTimer <= 0 && this.invaders.length) {
      if (this.bombs.length < maxBombs) this.fireBomb();
      this.bombTimer = rand(0.35, 1.1) * Math.pow(0.9, Math.min(this.level - 1, 8));
    }
    for (i = this.bombs.length - 1; i >= 0; i--) {
      var bomb = this.bombs[i];
      var py = bomb.y;
      bomb.y += bomb.vy * dt;
      bomb.t += dt;
      var gone = false;
      for (b = 0; b < this.bunkers.length && !gone; b++) {
        var by = this.bunkers[b].hitSegment(bomb.x, py, bomb.y + 6);
        if (by !== null) {
          this.bunkers[b].damage(bomb.x, by, 9);
          this.burst(bomb.x, by, BUNKER_COLOR, 6, 70);
          gone = true;
        }
      }
      if (!gone && p.invuln <= 0 &&
          Math.abs(bomb.x - p.x) < p.w / 2 - 2 &&
          bomb.y + 6 >= p.y - p.h / 2 + 4 && bomb.y - 6 <= p.y + p.h / 2) {
        this.bombs.splice(i, 1);
        this.killPlayer(false);
        return;
      }
      if (!gone && bomb.y > GROUND_Y - 4) {
        this.burst(bomb.x, GROUND_Y - 2, '#ffd23f', 4, 60);
        gone = true;
      }
      if (gone) this.bombs.splice(i, 1);
    }

    // --- UFO ---
    if (this.ufo) {
      this.ufo.x += this.ufo.vx * dt;
      if (this.ufo.x < -40 || this.ufo.x > W + 40) {
        this.ufo = null;
        this.sound.ufoStop();
      }
    } else if (this.invaders.length > 6) {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) {
        var fromLeft = Math.random() < 0.5;
        this.ufo = { x: fromLeft ? -30 : W + 30, y: 78, vx: fromLeft ? 130 : -130, w: 16 * PX, h: 7 * PX };
        this.ufoTimer = rand(16, 26);
        this.sound.ufoStart();
      }
    }

    // --- ステージクリア ---
    if (this.invaders.length === 0) {
      var bonus = this.level * 100;
      this.addScore(bonus);
      this.clearBonus = bonus;
      this.bombs = [];
      this.rockets = [];
      this.ufo = null;
      this.sound.ufoStop();
      this.sound.tone(523, 0.12, 'square', 0.2);
      var s = this.sound;
      setTimeout(function () { s.tone(659, 0.12, 'square', 0.2); }, 120);
      setTimeout(function () { s.tone(784, 0.25, 'square', 0.2); }, 240);
      this.setState('clear');
    }
  };

  Game.prototype.killPlayer = function (invaded) {
    if (invaded) this.lives = 0; else this.lives--;
    var p = this.player;
    this.burst(p.x, p.y, SHIP_COLOR, 40, 240);
    this.burst(p.x, p.y, '#ffffff', 16, 160);
    this.shake = 0.5;
    this.sound.play('explosion', 0.7);
    this.sound.ufoStop();
    this.bombs = [];
    this.rockets = [];
    this.ufo = null;
    this.setState('dying');
  };

  Game.prototype.gameOver = function () {
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.newRecord = true;
      storeSet(STORAGE_HI, String(this.hiScore));
    }
    this.setState('gameover');
  };

  // ===== 描画 =====
  Game.prototype.text = function (str, x, y, size, color, align, glow) {
    var c = this.ctx;
    c.font = size + 'px ' + FONT;
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    c.fillStyle = color || '#ffffff';
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    c.fillText(str, x, y);
    c.shadowBlur = 0;
  };

  Game.prototype.draw = function () {
    var c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.save();
    if (this.shake > 0) {
      var m = this.shake * 14;
      c.translate(rand(-m, m), rand(-m, m));
    }
    if (this.state === 'title') this.drawTitle();
    else this.drawWorld();
    this.drawEffects();
    c.restore();
  };

  Game.prototype.drawTitle = function () {
    var t = this.stateTime;
    this.text('SPACE INVADERS', W / 2, 110, 58, '#ffffff', 'center', 18);
    this.text('スペースインベーダー', W / 2, 165, 24, '#5ef0ff', 'center', 8);

    var rows = [
      { spr: this.sprites.ufo, label: '＝ ？ 点（なぞのUFO）', color: UFO_COLOR },
      { spr: this.sprites.squid[Math.floor(t * 2) % 2], label: '＝ 30 点', color: TYPES[0].color },
      { spr: this.sprites.crab[Math.floor(t * 2) % 2], label: '＝ 20 点', color: TYPES[1].color },
      { spr: this.sprites.octopus[Math.floor(t * 2) % 2], label: '＝ 10 点', color: TYPES[2].color }
    ];
    for (var i = 0; i < rows.length; i++) {
      var y = 228 + i * 44;
      drawSprite(this.ctx, rows[i].spr, W / 2 - 110, y);
      this.text(rows[i].label, W / 2 - 70, y, 20, rows[i].color, 'left');
    }

    this.text('← → 移動　　スペース 発射　　P 一時停止　　M 音のオン／オフ', W / 2, 432, 16, '#bbbbbb');
    this.text('スマホは画面下のボタンで操作できます', W / 2, 458, 16, '#bbbbbb');

    if (Math.floor(t * 2) % 2 === 0) {
      this.text('スペースキー ／ タップ でスタート', W / 2, 512, 26, '#ffd23f', 'center', 10);
    }
    this.text('HI-SCORE  ' + pad(this.hiScore, 5), W / 2, 566, 18, '#ffffff');
  };

  Game.prototype.drawWorld = function () {
    var c = this.ctx, i;

    // 防御壁
    for (i = 0; i < this.bunkers.length; i++) this.bunkers[i].draw(c);

    // インベーダー
    for (i = 0; i < this.invaders.length; i++) {
      var v = this.invaders[i];
      drawSprite(c, this.sprites[v.type.key][this.frame], v.x, v.y);
    }

    // UFO
    if (this.ufo) drawSprite(c, this.sprites.ufo, this.ufo.x, this.ufo.y);

    // 自機の弾
    c.fillStyle = '#ffffff';
    c.shadowColor = '#7df9ff';
    c.shadowBlur = 10;
    for (i = 0; i < this.rockets.length; i++) {
      var r = this.rockets[i];
      c.fillRect(r.x - 1.5, r.y - 7, 3, 14);
    }
    c.shadowBlur = 0;

    // 敵の弾
    for (i = 0; i < this.bombs.length; i++) {
      var b = this.bombs[i];
      var f = Math.floor(b.t * 14);
      if (b.kind === 0) {
        c.fillStyle = '#ffd23f';
        for (var k = 0; k < 4; k++) {
          var off = (f + k) % 2 ? -2 : 2;
          c.fillRect(b.x + off - 1.5, b.y - 8 + k * 4, 3, 4);
        }
      } else {
        c.fillStyle = '#ff7a59';
        c.fillRect(b.x - 1.5, b.y - 8, 3, 16);
        c.fillRect(b.x - 4.5, b.y - 6 + (f % 3) * 5, 9, 3);
      }
    }

    // 自機
    var p = this.player;
    var showShip = this.state !== 'dying' && !(this.state === 'gameover' && this.lives <= 0);
    if (showShip && (p.invuln <= 0 || Math.floor(p.invuln * 10) % 2 === 0)) {
      drawSprite(c, this.sprites.ship, p.x, p.y);
    }

    // 地面
    c.fillStyle = SHIP_COLOR;
    c.fillRect(0, GROUND_Y, W, 2);

    this.drawHud();

    // 状態ごとの重ね表示
    if (this.state === 'intro') {
      this.text('STAGE ' + this.level, W / 2, 300, 48, '#ffffff', 'center', 14);
      var n = Math.max(1, 3 - Math.floor(this.stateTime / 0.8));
      this.text('READY… ' + n, W / 2, 352, 24, '#ffd23f');
    } else if (this.state === 'clear') {
      this.text('STAGE CLEAR!', W / 2, 290, 48, '#ffd23f', 'center', 14);
      this.text('ボーナス +' + this.clearBonus + ' 点', W / 2, 345, 24, '#ffffff');
    } else if (this.state === 'paused') {
      this.dim(0.55);
      this.text('一時停止中', W / 2, 280, 44, '#ffffff', 'center', 12);
      this.text('P キー ／ ⏸ ボタンで再開', W / 2, 336, 20, '#bbbbbb');
    } else if (this.state === 'gameover') {
      this.dim(0.6);
      this.text('GAME OVER', W / 2, 220, 60, '#ff4b5c', 'center', 18);
      this.text('スコア　' + this.score + ' 点', W / 2, 296, 28, '#ffffff');
      this.text('到達ステージ　' + this.level, W / 2, 336, 22, '#bbbbbb');
      if (this.newRecord) this.text('★ ハイスコア更新！ ★', W / 2, 384, 26, '#ffd23f', 'center', 10);
      if (this.stateTime > 1 && Math.floor(this.stateTime * 2) % 2 === 0) {
        this.text('スペースキー ／ タップ でもう一度', W / 2, 450, 24, '#ffd23f');
      }
    }
  };

  Game.prototype.dim = function (a) {
    this.ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
    this.ctx.fillRect(-20, -20, W + 40, H + 40);
  };

  Game.prototype.drawHud = function () {
    this.text('SCORE', 24, 22, 16, '#bbbbbb', 'left');
    this.text(pad(this.score, 5), 24, 44, 24, '#ffffff', 'left');
    this.text('HI-SCORE', W / 2, 22, 16, '#bbbbbb');
    this.text(pad(Math.max(this.hiScore, this.score), 5), W / 2, 44, 24, '#ffffff');
    this.text('STAGE', W - 24, 22, 16, '#bbbbbb', 'right');
    this.text(String(this.level), W - 24, 44, 24, '#ffffff', 'right');

    // 残機
    this.text(String(Math.max(this.lives, 0)), 24, 586, 18, '#ffffff', 'left');
    for (var i = 0; i < Math.min(this.lives - 1, 5); i++) {
      drawSprite(this.ctx, this.sprites.shipIcon, 64 + i * 34, 586, 0.6);
    }
    if (this.sound.muted) this.text('🔇 ミュート中', W - 24, 586, 14, '#888888', 'right');
  };

  Game.prototype.drawEffects = function () {
    var c = this.ctx, i;
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    for (i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      c.globalAlpha = Math.min(1, t.life * 2);
      this.text(t.text, t.x, t.y, 20, t.color, 'center', 8);
    }
    c.globalAlpha = 1;
  };

  // ===== ループ =====
  Game.prototype.start = function () {
    var self = this;
    var last = performance.now();
    function tick(now) {
      var dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
      last = now;
      self.update(dt);
      self.draw();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  window.Game = Game;
  window.GameSound = Sound;
})();
