// public/js/game.js
(() => {
  const DEBUG_INPUT = false;

  const BASE_W = 1024;
  const BASE_H = 576;

  // Coin spawn & trajectory tuning
  const COIN_SPAWN_X = 650; // approx. x of the glowing hole
  const COIN_SPAWN_Y = 220; // approx. y of the hole
  const COIN_TARGET_X = BASE_W / 2; // where we want them to land (center)
  const COIN_FLIGHT_FRAMES = 65; // how long the “throw” lasts in frames

  function fitToScreenStable() {
    const layer = document.getElementById("scaleLayer");
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

  addEventListener("resize", fitToScreenStable);
  addEventListener("orientationchange", fitToScreenStable);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitToScreenStable);
    window.visualViewport.addEventListener("scroll", fitToScreenStable);
  }
  new ResizeObserver(fitToScreenStable).observe(document.documentElement);

  // защита от двойной загрузки
  if (window.__GAME_JS_LOADED__) {
    console.warn("[CLIENT] game.js loaded twice - ignoring second load");
    return;
  }
  window.__GAME_JS_LOADED__ = true;

  const backgroundEl = document.getElementById("background");
  const shopEl = document.getElementById("shop");

  const backgrround = new Sprite({
    position: { x: 0, y: 0 },
    //imageSrc: "./img/background.png",
    imageSrc: "./img/background_new.png",
    el: backgroundEl,
    framesMax: 1,
    scale: 1,
    offset: { x: 0, y: 0 },
  });
  backgrround.framesHold = 999999;

  /* const shop = new Sprite({
    position: { x: 600, y: 150 },
    imageSrc: "./img/shop.png",
    el: shopEl,
    scale: 2.75,
    framesMax: 6,
    offset: { x: 0, y: 0 },
  }); */
  const fightersLayer = document.getElementById("fightersLayer");
  const p1HealthEl = document.getElementById("p1Health");
  const p2HealthEl = document.getElementById("p2Health");
  const timerEl = document.getElementById("timer");
  const overlayEl = document.getElementById("displayText");

  const fighters = new Map();

  // ===== COINS / PICKUPS =====
  const coins = new Map(); // Track active coins
  // max hearts allowed on the field at once
  const MAX_HEARTS_ON_FIELD = 2;

  // updated from room-state
  //undedPlayer = false;
  let isGameActive = false;

  function createCoin(x, y, vx, vy) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.width = "40px";
    el.style.height = "40px";

    // Use pixel-art coin image
    el.style.backgroundImage = 'url("./img/heart.jpg")';
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.imageRendering = "pixelated"; // keep it crisp

    // Remove old circle styles
    // (no borderRadius, no boxShadow now)

    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.zIndex = "2";
    fightersLayer.appendChild(el);

    const coinObj = {
      el,
      x,
      y,
      baseY: y, // remember ground position
      vx,
      vy,
      collected: false,
      life: 1200,
      bobPhase: Math.random() * Math.PI * 2, // desync hearts
    };

    return coinObj;
  }

  function spawnCoins() {
    // don’t spawn if game isn’t running
    if (!isGameActive) return;

    // don’t spawn if nobody needs healing
    if (!hasWoundedPlayer) return;

    // don’t flood the map
    if (coins.size > 0) return;

    // how many can we still add?
    const remaining = MAX_HEARTS_ON_FIELD - coins.size;

    // 1–2 hearts per wave, but not more than remaining
    let coinCount = Math.floor(Math.random() * 2) + 1;
    if (coinCount > remaining) coinCount = remaining;
    if (coinCount <= 0) return;

    // play soft “appearing” sound once per spawn wave
    audioManager.play("heartSpawn", 0.6);

    // horizontal speed needed to travel from hole → center in COIN_FLIGHT_FRAMES
    const baseVx = (COIN_TARGET_X - COIN_SPAWN_X) / COIN_FLIGHT_FRAMES;

    // small upward kick so it makes an arc before falling
    const baseVy = -6; // negative = up, gravity will pull it down

    for (let i = 0; i < coinCount; i++) {
      const coin = createCoin(
        COIN_SPAWN_X + (Math.random() - 0.5) * 10, // tiny spread at spawn
        COIN_SPAWN_Y + (Math.random() - 0.5) * 10,
        baseVx + (Math.random() - 0.5) * 0.4, // subtle variation
        baseVy + (Math.random() - 0.5) * 0.4
      );

      coins.set(Math.random(), coin);
    }
  }

  // Spawn coins every 5 seconds
  //setInterval(spawnCoins, 5000);

  function makeFighterDOM() {
    const el = document.createElement("div");
    el.className = "fighter";
    fightersLayer.appendChild(el);

    const atk = document.createElement("div");
    atk.className = "attackBox";
    fightersLayer.appendChild(atk);

    return { el, atk };
  }

  function createFighterForPlayer(p) {
    const { el, atk } = makeFighterDOM();
    const isSamurai = p.char === "samurai";

    const attackBoxCfg = isSamurai
      ? { offset: { x: 100, y: 50 }, width: 135, height: 50 }
      : { offset: { x: 50, y: 50 }, width: 170, height: 50 };

    const f = new Fighter({
      position: { x: p.x, y: p.y },
      velocity: { x: 0, y: 0 },
      imageSrc: isSamurai
        ? "./img/samuraiMack/Idle.png"
        : "./img/kenji/Idle.png",
      framesMax: isSamurai ? 8 : 4,
      scale: 2.5,
      offset: isSamurai ? { x: 215, y: 115 } : { x: 215, y: 129 },
      el,
      attackEl: atk,
      baseFlip: isSamurai ? 1 : -1,
      sprites: isSamurai
        ? {
            idle: { imageSrc: "./img/samuraiMack/Idle.png", framesMax: 8 },
            run: { imageSrc: "./img/samuraiMack/Run.png", framesMax: 8 },
            jump: { imageSrc: "./img/samuraiMack/Jump.png", framesMax: 2 },
            fall: { imageSrc: "./img/samuraiMack/Fall.png", framesMax: 2 },
            attack1: {
              imageSrc: "./img/samuraiMack/Attack1.png",
              framesMax: 6,
            },
            takeHit: {
              imageSrc: "./img/samuraiMack/Take Hit.png",
              framesMax: 4,
            },
            death: { imageSrc: "./img/samuraiMack/Death.png", framesMax: 6 },
          }
        : {
            idle: { imageSrc: "./img/kenji/Idle.png", framesMax: 4 },
            run: { imageSrc: "./img/kenji/Run.png", framesMax: 8 },
            jump: { imageSrc: "./img/kenji/Jump.png", framesMax: 2 },
            fall: { imageSrc: "./img/kenji/Fall.png", framesMax: 2 },
            attack1: { imageSrc: "./img/kenji/Attack1.png", framesMax: 4 },
            takeHit: { imageSrc: "./img/kenji/TakeHit.png", framesMax: 3 },
            death: { imageSrc: "./img/kenji/Death.png", framesMax: 7 },
          },
      attackBox: attackBoxCfg,
    });

    f._netX = p.x;
    f._netY = p.y;
    f._lastNetX = p.x;
    f._lastNetY = p.y;

    f._state = "idle";
    f._dead = false;
    f._attacking = false;

    // ✅ hard-freeze winner after round end

    f._srvAttacking = false; // что говорит сервер сейчас
    f._prevSrvAttacking = false; // что было на прошлом апдейте
    f._attackAnim = false; // сейчас проигрываем attack1?
    f._waitRelease = false;
    f._hitAnim = false; // проигрываем takeHit до конца (локальный лок)
    // анимацию сыграли, ждём пока сервер отпустит attacking

    return f;
  }

  function ensureFighters(room) {
    for (const id of fighters.keys()) {
      if (!room.players.find((pp) => pp.id === id)) {
        const f = fighters.get(id);
        try {
          f.el.remove();
          f.attackEl?.remove();
        } catch {}
        fighters.delete(id);
      }
    }
    for (const p of room.players) {
      if (!fighters.has(p.id)) fighters.set(p.id, createFighterForPlayer(p));
    }
  }

  // ---------- helpers ----------
  function getSpriteMax(f, key) {
    const spr = f?.sprites?.[key];
    return spr?.framesMax ?? 1;
  }
  function isSprite(f, key) {
    const spr = f?.sprites?.[key];
    return !!spr?.image && f.image === spr.image;
  }
  function isAnimPlaying(f, key) {
    if (!isSprite(f, key)) return false;
    const max = getSpriteMax(f, key);
    return f.frameCurrent < max - 1;
  }
  function holdLastFrame(f, key) {
    const max = getSpriteMax(f, key);
    f.frameCurrent = Math.max(0, max - 1);
    f.draw();
  }

  // ---- INPUT (удерживаемое) ----
  const keys = { left: false, right: false, block: false };

  function sendInput() {
    if (!window.NET) return;
    window.NET.sendInput(keys);
    if (DEBUG_INPUT) console.log("[CLIENT input]", { ...keys });
  }

  // ---- ACTION seq ----
  let actionSeq = 0;
  function sendAction(type) {
    if (!window.NET) return;
    actionSeq++;
    const payload = { roomId: window.NET.roomId, type, seq: actionSeq };
    window.NET.socket.emit("action", payload);
    if (DEBUG_INPUT) console.log("[CLIENT action]", payload);
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    switch (e.key) {
      case "a":
        keys.left = true;
        sendInput();
        return;
      case "d":
        keys.right = true;
        sendInput();
        return;
      case "Shift":
        keys.block = true;
        sendInput();
        if (isGameActive) audioManager.play("block", 0.5);
        return;
      case "w":
        sendAction("jump");
        if (isGameActive) audioManager.play("jump", 0.6);
        return;
      case " ":
        sendAction("attack");
        if (isGameActive) audioManager.play("punch", 0.8);
        return;
      case "m":
      case "M":
        // Toggle mute with M key
        const currentMuted = audioManager.isMuted;
        document.dispatchEvent(
          new CustomEvent("menu:muteToggle", {
            detail: { isMuted: !currentMuted },
          })
        );
        return;
    }
  });

  window.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "a":
        keys.left = false;
        sendInput();
        return;
      case "d":
        keys.right = false;
        sendInput();
        return;
      case "Shift":
        keys.block = false;
        sendInput();
        if (isGameActive) audioManager.play("block", 0.3);
        return;
    }
  });

  // ---- apply room ----
  function applyRoom(room) {
    ensureFighters(room);

    // Check if anyone is wounded (alive + health < 100)
    //hasWoundedPlayer = room.players.some(
    //  (p) => !p.dead && typeof p.health === "number" && p.health < 100
    //);

    const p1 = room.players.find((p) => p.slot === 1);
    const p2 = room.players.find((p) => p.slot === 2);
    if (p1) p1HealthEl.style.width = `${p1.health}%`;
    if (p2) p2HealthEl.style.width = `${p2.health}%`;

    for (const p of room.players) {
      const f = fighters.get(p.id);
      if (!f) continue;

      f._lastNetX = f._netX;
      f._lastNetY = f._netY;
      f._netX = p.x;
      f._netY = p.y;

      f._dead = !!p.dead;
      f._prevSrvAttacking = f._srvAttacking;
      f._srvAttacking = !room.ended && !p.dead ? !!p.attacking : false;

      // rising edge: server started attack => start animation ONCE
      if (f._srvAttacking && !f._prevSrvAttacking) {
        f._attackAnim = true;
        f._waitRelease = false;
        f._state = "attack1";
        f.switchSprite("attack1");
      }

      // if server released attack => allow new attacks later
      if (!f._srvAttacking) {
        f._waitRelease = false;
      }

      // ✅ ABSOLUTE FIX: after round end, winner is frozen (no animateFrame)
      if (room.ended && !f._dead) {
        // победитель: уйти в idle и больше не атаковать
        f._attacking = false;
        f._state = "idle";
        f.switchSprite("idle");
      }

      f.setFacing(p.facing);

      if (p.blocking) f.el.classList.add("blocking");
      else f.el.classList.remove("blocking");

      if (f._dead && f._state !== "death") {
        f._state = "death";
        f.switchSprite("death");
      }
    }
  }

  window.addEventListener("room-state", (ev) => {
    const room = ev.detail;

    // update game active flag
    isGameActive = !!room.started && !room.ended;

    if (typeof room.timer === "number" && timerEl)
      timerEl.textContent = room.timer;

    applyRoom(room);

    if (room.ended && room.winnerText) {
      overlayEl.style.display = "flex";
      overlayEl.textContent = room.winnerText;

      // Play tie music if it's a tie, otherwise stop all music
      if (room.winnerText.toLowerCase().includes("tie")) {
        audioManager.playTie();
      } else {
        audioManager.stopBackground();
      }

      for (const coin of coins.values()) {
        coin.el.remove();
      }
      coins.clear();
    } else {
      overlayEl.style.display = "none";
      overlayEl.textContent = "";
      if (audioManager.backgroundMusic && audioManager.backgroundMusic.paused) {
        audioManager.playBackground();
      }
    }
  });

  window.addEventListener("net-heart-spawn", (ev) => {
    const { heartId, x, y, flightFrames } = ev.detail;

    // Create heart with arc trajectory
    const baseVx = (512 - x) / flightFrames; // COIN_TARGET_X - COIN_SPAWN_X
    const baseVy = -6;

    const coin = createCoin(
      x + (Math.random() - 0.5) * 10,
      y + (Math.random() - 0.5) * 10,
      baseVx + (Math.random() - 0.5) * 0.4,
      baseVy + (Math.random() - 0.5) * 0.4
    );

    coin.serverId = heartId; // Track server ID
    coins.set(heartId, coin);

    audioManager.play("heartSpawn", 0.6);
  });

  (() => {
    const socket = window.NET?.socket;
    if (!socket) return;

    socket.on("heart-spawn", (data) => {
      window.dispatchEvent(
        new CustomEvent("net-heart-spawn", { detail: data })
      );
    });
  })();

  window.addEventListener("net-state", (ev) => applyRoom(ev.detail));
  window.addEventListener("net-timer", (ev) => {
    if (timerEl) timerEl.textContent = ev.detail;
  });
  window.addEventListener("net-gameover", (ev) => {
    overlayEl.style.display = "flex";
    overlayEl.textContent = ev.detail || "Game Over";

    const result = ev.detail || "";
    if (result.includes("wins")) {
      if (result.includes(window.NET.myName)) {
        audioManager.play("victory", 1.0);
      } else {
        audioManager.play("defeat", 0.9);
      }
    }
  });

  window.addEventListener("net-hit", (ev) => {
    const { victimId, victimDead } = ev.detail || {};
    const f = fighters.get(victimId);
    if (!f) return;

    audioManager.play("hit", 0.7);

    if (victimDead) {
      if (!f._dead) {
        f._dead = true;
        f._state = "death";
        f.switchSprite("death");
        audioManager.play("defeat", 0.8);
      }
      return;
    }

    if (f._dead) return;

    // ✅ сбиваем любые "ожидания атаки", чтобы hit точно показывался
    f._attackAnim = false;
    f._waitRelease = false;

    // ✅ запускаем takeHit и лочим его до конца
    f._hitAnim = true;
    f._state = "takeHit";
    f.switchSprite("takeHit");
  });

  // ======== 60 FPS LOOP ========
  function animate() {
    requestAnimationFrame(animate);

    backgrround.update({ freeze: false });
    //shop.update({ freeze: false });

    for (const f of fighters.values()) {
      // позиция по сети
      f.position.x += (f._netX - f.position.x) * 0.35;
      f.position.y = f._netY;

      // death: play once then hold
      if (f._dead) {
        if (f._state !== "death") {
          f._state = "death";
          f.switchSprite("death");
        }
        if (isAnimPlaying(f, "death")) {
          f.animateFrame();
          f.draw();
        } else {
          holdLastFrame(f, "death");
        }
        continue;
      }

      // takeHit: uninterruptible while playing
      // ✅ takeHit: play fully, cannot be overridden by idle/run/jump/fall
      if (f._hitAnim) {
        if (!isSprite(f, "takeHit")) {
          f._state = "takeHit";
          f.switchSprite("takeHit");
        }

        if (isAnimPlaying(f, "takeHit")) {
          f.animateFrame();
          f.draw();
          continue;
        }

        // last frame reached -> unlock and go idle
        f._hitAnim = false;
        f._state = "idle";
        f.switchSprite("idle");
        f.animateFrame();
        f.draw();
        continue;
      }

      // attack: do not loop, hold last frame while server says attacking
      // attack animation: play once, then go idle and wait server release (no freeze, no double)
      if (f._attackAnim) {
        if (f._state !== "attack1") {
          f._state = "attack1";
          f.switchSprite("attack1");
        }

        if (isAnimPlaying(f, "attack1")) {
          f.animateFrame();
          f.draw();
          continue;
        }

        // animation finished
        f._attackAnim = false;
        f._waitRelease = true;

        // go idle immediately (so it doesn't "stick" on last attack frame)
        f._state = "idle";
        f.switchSprite("idle");
        f.animateFrame();
        f.draw();
        continue;
      }

      // while server still says attacking=true, do NOT restart attack1
      // just stay idle until server releases attacking=false
      if (f._waitRelease && f._srvAttacking) {
        if (f._state !== "idle") {
          f._state = "idle";
          f.switchSprite("idle");
        }
        f.animateFrame();
        f.draw();
        continue;
      }

      // normal state selection
      const dx = f._netX - f._lastNetX;
      const dy = f._netY - f._lastNetY;

      let next = "idle";
      if (dy < -0.1) next = "jump";
      else if (dy > 0.1) next = "fall";
      else if (Math.abs(dx) > 0.1) next = "run";

      if (f._state !== next) {
        f._state = next;
        f.switchSprite(next);
      }

      f.animateFrame();
      f.draw();
    }

    // Update coins
    for (const [id, coin] of coins.entries()) {
      if (coin.collected) {
        coins.delete(id);
        continue;
      }

      coin.life--;
      if (coin.life <= 0) {
        coin.el.remove();
        coins.delete(id);
        continue;
      }

      // Physics
      coin.x += coin.vx;
      coin.y += coin.vy;
      coin.vy += 0.3; // Gravity

      // Ground collision – stop on the floor
      const GROUND_Y = 480;
      if (coin.y >= GROUND_Y) {
        coin.y = GROUND_Y;
        coin.vy = 0;
        coin.vx = 0;
        coin.baseY = coin.y; // bob around the floor position
      }

      // Idle bobbing (visual only)
      if (coin.vy === 0) {
        coin.bobPhase += 0.02;
        coin.y = coin.baseY + Math.sin(coin.bobPhase) * 2;
      }

      coin.el.style.left = coin.x + "px";
      coin.el.style.top = coin.y + "px";

      // Check collision with fighters
      for (const [playerId, f] of fighters.entries()) {
        // use fighter's feet as pickup point
        const feetX = f.position.x + f.width / 2;
        const feetY = f.position.y + f.height;

        // use coin center
        const coinCenterX = coin.x + 16; // 32px / 2
        const coinCenterY = coin.y + 16;

        const dx = Math.abs(coinCenterX - feetX);
        const dy = Math.abs(coinCenterY - feetY);

        // pickup zone around the feet
        if (dx < 60 && dy < 60) {
          // Heart collected!
          coin.collected = true;
          coin.el.remove();

          audioManager.play("heartPickup", 0.9);

          // Emit to server that player picked up heart
          if (window.NET) {
            window.NET.socket.emit("coin-pickup", {
              roomId: window.NET.roomId,
              playerId, // <-- this is the key in room.players on the server
              heartId: id, // <-- send the heart ID so server can track it
            });
          }

          coins.delete(id);
          break;
        }
      }
    }
  }

  animate();
})();
