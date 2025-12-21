const gravity = 0.7;
const BASE_W = 1024;
const BASE_H = 576;

/* ---------- Stable fullscreen scaling ---------- */
function fitToScreenStable() {
  const layer = document.getElementById('scaleLayer');
  if (!layer) return;

  const vv = window.visualViewport;
  const w = vv ? vv.width : document.documentElement.clientWidth;
  const h = vv ? vv.height : document.documentElement.clientHeight;
  const offX = vv ? vv.offsetLeft : 0;
  const offY = vv ? vv.offsetTop : 0;
  if (!w || !h) return;

  let scale = Math.min(w / BASE_W, h / BASE_H);
  const STEP = 0.01;
  scale = Math.max(STEP, Math.floor(scale / STEP) * STEP);

  const x = Math.round(offX + (w - BASE_W * scale) / 2);
  const y = Math.round(offY + (h - BASE_H * scale) / 2);

  layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

requestAnimationFrame(() => {
  fitToScreenStable();
  requestAnimationFrame(fitToScreenStable);
});

addEventListener('resize', fitToScreenStable);
addEventListener('orientationchange', fitToScreenStable);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitToScreenStable);
  window.visualViewport.addEventListener('scroll', fitToScreenStable);
}
new ResizeObserver(fitToScreenStable).observe(document.documentElement);

/* ---------- DOM elements ---------- */
const backgroundEl = document.getElementById('background');
const shopEl = document.getElementById('shop');
const playerEl = document.getElementById('player');
const enemyEl = document.getElementById('enemy');
const playerAtkEl = document.getElementById('playerAttackBox');
const enemyAtkEl = document.getElementById('enemyAttackBox');

/* ---------- background ---------- */
const backgrround = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: './img/background.png',
  el: backgroundEl,
  framesMax: 1,
  scale: 1,
  offset: { x: 0, y: 0 }
});
backgrround.framesHold = 999999;

/* ---------- shop animated ---------- */
const shop = new Sprite({
  position: { x: 600, y: 128 },
  imageSrc: './img/shop.png',
  el: shopEl,
  scale: 2.75,
  framesMax: 6,
  offset: { x: 0, y: 0 }
});

/* ---------- start positions ---------- */
const START_GAP = 360;
const CENTER_X = BASE_W / 2;
const PLAYER_START_X = Math.round(CENTER_X - START_GAP / 2);
const ENEMY_START_X  = Math.round(CENTER_X + START_GAP / 2);

/* ---------- fighters ---------- */
const player = new Fighter({
  position: { x: PLAYER_START_X, y: 0 },
  velocity: { x: 0, y: 0 },
  imageSrc: './img/samuraiMack/Idle.png',
  framesMax: 8,
  scale: 2.5,
  offset: { x: 215, y: 155 },
  el: playerEl,
  attackEl: playerAtkEl,
  sprites: {
    idle:    { imageSrc: './img/samuraiMack/Idle.png',     framesMax: 8 },
    run:     { imageSrc: './img/samuraiMack/Run.png',      framesMax: 8 },
    jump:    { imageSrc: './img/samuraiMack/Jump.png',     framesMax: 2 },
    fall:    { imageSrc: './img/samuraiMack/Fall.png',     framesMax: 2 },
    attack1: { imageSrc: './img/samuraiMack/Attack1.png',  framesMax: 6 },
    takeHit: { imageSrc: './img/samuraiMack/Take Hit.png', framesMax: 4 },
    death:   { imageSrc: './img/samuraiMack/Death.png',    framesMax: 6 }
  },
  attackBox: { offset: { x: 100, y: 50 }, width: 135, height: 50 }
});

const enemy = new Fighter({
  position: { x: ENEMY_START_X, y: 0 },
  velocity: { x: 0, y: 0 },
  imageSrc: './img/kenji/Idle.png',
  framesMax: 4,
  scale: 2.5,
  offset: { x: 215, y: 167 },
  el: enemyEl,
  attackEl: enemyAtkEl,
  sprites: {
    idle:    { imageSrc: './img/kenji/Idle.png',    framesMax: 4 },
    run:     { imageSrc: './img/kenji/Run.png',     framesMax: 8 },
    jump:    { imageSrc: './img/kenji/Jump.png',    framesMax: 2 },
    fall:    { imageSrc: './img/kenji/Fall.png',    framesMax: 2 },
    attack1: { imageSrc: './img/kenji/Attack1.png', framesMax: 4 },
    takeHit: { imageSrc: './img/kenji/TakeHit.png', framesMax: 3 },
    death:   { imageSrc: './img/kenji/Death.png',   framesMax: 7 }
  },
 attackBox: {
  offset: { x: 50, y: 50 },   
  width: 170,
  height: 50
},
  baseFlip: -1
});

const keys = {
  a: { pressed: false },
  d: { pressed: false },
  ArrowLeft: { pressed: false },
  ArrowRight: { pressed: false }
};

decreasTimer();

/* ---------- HITSTOP + KNOCKBACK ---------- */
let hitStopFrames = 0;

function applyHit({ attacker, victim, baseDamage, kbPower, hitstop }) {
  const blocked = victim.isBlocking;

  victim.takeHit(baseDamage);

  const dir = attacker.position.x < victim.position.x ? 1 : -1;
  const kb = blocked ? kbPower * 0.35 : kbPower;

  victim.velocity.x += dir * kb;
  if (!blocked) victim.velocity.y = Math.min(victim.velocity.y, -2);

  hitStopFrames = Math.max(hitStopFrames, hitstop);
}

/* ---------- PUSHBOX ---------- */
function resolvePushbox(a, b) {
  const aBottom = a.position.y + a.height;
  const bBottom = b.position.y + b.height;
  const yClose = Math.abs(aBottom - bBottom) < 60;
  if (!yClose) return;

  const ax1 = a.position.x;
  const ax2 = a.position.x + a.width;
  const bx1 = b.position.x;
  const bx2 = b.position.x + b.width;

  const overlap = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  if (overlap <= 0) return;

  const push = overlap / 2;
  if (ax1 < bx1) {
    a.position.x -= push;
    b.position.x += push;
  } else {
    a.position.x += push;
    b.position.x -= push;
  }

  const L = 50, R = 1024 - a.width - 50;
  a.position.x = Math.max(L, Math.min(R, a.position.x));
  b.position.x = Math.max(L, Math.min(R, b.position.x));
}

/* ---------- AUTO-FACE ---------- */
function updateFacing() {
  if (player.position.x < enemy.position.x) {
    player.setFacing(1);
    enemy.setFacing(-1);
  } else {
    player.setFacing(-1);
    enemy.setFacing(1);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const freeze = hitStopFrames > 0;
  if (hitStopFrames > 0) hitStopFrames--;

  
  updateFacing();

  backgrround.update({ freeze: false });
  shop.update({ freeze });

  player.update({ freeze });
  enemy.update({ freeze });

  if (player.dead) {
    player.velocity.x = 0;
    player.isAttacking = false;
    keys.a.pressed = false;
    keys.d.pressed = false;
    player.setBlocking(false);
  }
  if (enemy.dead) {
    enemy.velocity.x = 0;
    enemy.isAttacking = false;
    keys.ArrowLeft.pressed = false;
    keys.ArrowRight.pressed = false;
    enemy.setBlocking(false);
  }

  if (!freeze) {
    player.velocity.x = 0;
    enemy.velocity.x = 0;

    if (!player.dead && !player.isBlocking) {
      if (keys.a.pressed && player.lastKey === 'a') player.velocity.x = -3;
      else if (keys.d.pressed && player.lastKey === 'd') player.velocity.x = 3;
    }

    if (!enemy.dead && !enemy.isBlocking) {
      if (keys.ArrowLeft.pressed && enemy.lastKey === 'ArrowLeft') enemy.velocity.x = -3;
      else if (keys.ArrowRight.pressed && enemy.lastKey === 'ArrowRight') enemy.velocity.x = 3;
    }

    resolvePushbox(player, enemy);

    
    updateFacing();
  }

  const playerIsAttacking =
    player.image === player.sprites.attack1.image &&
    player.frameCurrent < player.sprites.attack1.framesMax - 1;

  if (!playerIsAttacking && !player.dead) {
    if (player.velocity.y < 0) player.switchSprite('jump');
    else if (player.velocity.y > 0) player.switchSprite('fall');
    else if (player.velocity.x !== 0) player.switchSprite('run');
    else player.switchSprite('idle');
  }

  const enemyIsAttacking =
    enemy.image === enemy.sprites.attack1.image &&
    enemy.frameCurrent < enemy.sprites.attack1.framesMax - 1;

  const enemyIsTakingHit =
    enemy.image === enemy.sprites.takeHit.image &&
    enemy.frameCurrent < enemy.sprites.takeHit.framesMax - 1;

  if (!enemyIsAttacking && !enemyIsTakingHit && !enemy.dead) {
    if (enemy.velocity.y < 0) enemy.switchSprite('jump');
    else if (enemy.velocity.y > 0) enemy.switchSprite('fall');
    else if (enemy.velocity.x !== 0) enemy.switchSprite('run');
    else enemy.switchSprite('idle');
  }

  if (!freeze) {
    if (
      rectangularCollision({ rectangle1: player, rectangle2: enemy }) &&
      player.isAttacking &&
      player.frameCurrent === 4
    ) {
      player.isAttacking = false;
      applyHit({ attacker: player, victim: enemy, baseDamage: 20, kbPower: 7, hitstop: 6 });
      document.getElementById('enemyHealth').style.width = enemy.health + '%';
    }
    if (player.isAttacking && player.frameCurrent === 4) player.isAttacking = false;

    if (
      rectangularCollision({ rectangle1: enemy, rectangle2: player }) &&
      enemy.isAttacking &&
      enemy.frameCurrent === 2
    ) {
      enemy.isAttacking = false;
      applyHit({ attacker: enemy, victim: player, baseDamage: 20, kbPower: 7, hitstop: 6 });
      document.getElementById('playerHealth').style.width = player.health + '%';
    }
    if (enemy.isAttacking && enemy.frameCurrent === 2) enemy.isAttacking = false;
  }

  if (enemy.health <= 0 || player.health <= 0) determineWinner({ player, enemy, timerId });
}
animate();

/* ---------- INPUT ---------- */
window.addEventListener('keydown', (event) => {
  if (!player.dead) {
    switch (event.key) {
      case 'd': keys.d.pressed = true; player.lastKey = 'd'; break;
      case 'a': keys.a.pressed = true; player.lastKey = 'a'; break;
      case 'w':
        if (!player.isBlocking && player.velocity.y === 0 && player.position.y === 330) player.velocity.y = -20;
        break;
      case ' ': player.attack(); break;
      case 'Shift': player.setBlocking(true); break;
    }
  }

  if (!enemy.dead) {
    switch (event.key) {
      case 'ArrowRight': keys.ArrowRight.pressed = true; enemy.lastKey = 'ArrowRight'; break;
      case 'ArrowLeft': keys.ArrowLeft.pressed = true; enemy.lastKey = 'ArrowLeft'; break;
      case 'ArrowUp':
        if (!enemy.isBlocking && enemy.velocity.y === 0 && enemy.position.y === 330) enemy.velocity.y = -20;
        break;
      case 'ArrowDown': enemy.setBlocking(true); break;
      case 'Enter': enemy.attack(); break;
    }
  }
});

window.addEventListener('keyup', (event) => {
  switch (event.key) {
    case 'd': keys.d.pressed = false; break;
    case 'a': keys.a.pressed = false; break;
    case 'Shift': player.setBlocking(false); break;

    case 'ArrowRight': keys.ArrowRight.pressed = false; enemy.lastKey = 'ArrowRight'; break;
    case 'ArrowLeft': keys.ArrowLeft.pressed = false; enemy.lastKey = 'ArrowLeft'; break;
    case 'ArrowDown': enemy.setBlocking(false); break;
  }
});


