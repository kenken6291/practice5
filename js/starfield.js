/*
  starfield.js
  背景の星空（3層の奥行き・またたき付き）
*/
function Starfield() {
  this.canvas = null;
  this.ctx = null;
  this.width = 0;
  this.height = 0;
  this.stars = [];
  this.count = 160;
  this.running = false;
}

Starfield.prototype.initialise = function (div) {
  var self = this;
  this.canvas = document.createElement('canvas');
  this.ctx = this.canvas.getContext('2d');
  div.appendChild(this.canvas);
  this.resize();
  window.addEventListener('resize', function () { self.resize(); });
};

Starfield.prototype.resize = function () {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  this.width = window.innerWidth;
  this.height = window.innerHeight;
  this.canvas.width = this.width * dpr;
  this.canvas.height = this.height * dpr;
  this.canvas.style.width = this.width + 'px';
  this.canvas.style.height = this.height + 'px';
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

Starfield.prototype.makeStar = function (y) {
  var layer = Math.random();
  var depth = layer < 0.6 ? 0 : (layer < 0.9 ? 1 : 2);   // 0:遠い 1:中間 2:近い
  var colors = ['#ffffff', '#cfe8ff', '#ffe9c4', '#d9d0ff'];
  return {
    x: Math.random() * this.width,
    y: y === undefined ? Math.random() * this.height : y,
    size: [1, 2, 3][depth],
    speed: [12, 28, 55][depth] * (0.8 + Math.random() * 0.4),
    alpha: [0.45, 0.7, 1][depth],
    twinkle: Math.random() * Math.PI * 2,
    color: colors[Math.floor(Math.random() * colors.length)]
  };
};

Starfield.prototype.start = function () {
  this.stars = [];
  for (var i = 0; i < this.count; i++) this.stars.push(this.makeStar());
  if (this.running) return;
  this.running = true;
  var self = this;
  var last = performance.now();
  function tick(now) {
    var dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    self.update(dt);
    self.draw();
    if (self.running) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};

Starfield.prototype.stop = function () {
  this.running = false;
};

Starfield.prototype.update = function (dt) {
  for (var i = 0; i < this.stars.length; i++) {
    var s = this.stars[i];
    s.y += s.speed * dt;
    s.twinkle += dt * 3;
    if (s.y > this.height) this.stars[i] = this.makeStar(-3);
  }
};

Starfield.prototype.draw = function () {
  var ctx = this.ctx;
  var g = ctx.createLinearGradient(0, 0, 0, this.height);
  g.addColorStop(0, '#05010f');
  g.addColorStop(1, '#0b0620');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, this.width, this.height);
  for (var i = 0; i < this.stars.length; i++) {
    var s = this.stars[i];
    ctx.globalAlpha = s.alpha * (0.75 + 0.25 * Math.sin(s.twinkle));
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
};
