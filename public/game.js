// public/js/game.js
(() => {
  const DEBUG_INPUT = false;

  const BASE_W = 1024;
  const BASE_H = 576;

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
    imageSrc: "./img/background.png",
    el: backgroundEl,
    framesMax: 1,
    scale: 1,
    offset: { x: 0, y: 0 },
  });
  backgrround.framesHold = 999999;

  const shop = new Sprite({
    position: { x: 600, y: 128 },
    imageSrc: "./img/shop.png",
    el: shopEl,
    scale: 2.75,
    framesMax: 6,
    offset: { x: 0, y: 0 },
  });

  const fightersLayer = document.getElementById("fightersLayer");
  const p1HealthEl = document.getElementById("p1Health");
  const p2HealthEl = document.getElementById("p2Health");
  const timerEl = document.getElementById("timer");
  const overlayEl = document.getElementById("displayText");

  const fighters = new Map();

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
      offset: isSamurai ? { x: 215, y: 155 } : { x: 215, y: 167 },
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
    f._winnerFrozen = false;

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
        audioManager.play("block", 0.5);
        return;
      case "w":
        sendAction("jump");
        audioManager.play("jump", 0.6);
        return;
      case " ":
        sendAction("attack");
        audioManager.play("punch", 0.8);
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
        audioManager.play("block", 0.3);
        return;
    }
  });

  // ---- apply room ----
  function applyRoom(room) {
    ensureFighters(room);

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
      f._attacking = room.ended ? false : !!p.attacking;

      // ✅ ABSOLUTE FIX: after round end, winner is frozen (no animateFrame)
      f._winnerFrozen = !!room.ended && !f._dead;

      f.setFacing(p.facing);

      if (p.blocking) f.el.classList.add("blocking");
      else f.el.classList.remove("blocking");

      if (f._dead && f._state !== "death") {
        f._state = "death";
        f.switchSprite("death");
      }
    }
  }

  // ---- NET EVENTS ----
  window.addEventListener("room-state", (ev) => {
    const room = ev.detail;

    if (typeof room.timer === "number" && timerEl)
      timerEl.textContent = room.timer;

    applyRoom(room);

    if (room.ended && room.winnerText) {
      overlayEl.style.display = "flex";
      overlayEl.textContent = room.winnerText;
      audioManager.stopBackground();
    } else {
      overlayEl.style.display = "none";
      overlayEl.textContent = "";
      if (room.started && !audioManager.backgroundMusic.playing) {
        audioManager.playBackground();
      }
    }
  });

  window.addEventListener("room-state", (ev) => {
    const room = ev.detail;

    // Start music when game begins
    if (room.started && !room.ended) {
      audioManager.playBackground();
    }
    // Stop music when game ends
    if (room.ended) {
      audioManager.stopBackground();
    }
  });

  window.addEventListener("net-state", (ev) => applyRoom(ev.detail));

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
    if (isSprite(f, "takeHit") && isAnimPlaying(f, "takeHit")) return;

    f._state = "takeHit";
    f.switchSprite("takeHit");
  });

  // ======== 60 FPS LOOP ========
  function animate() {
    requestAnimationFrame(animate);

    backgrround.update({ freeze: false });
    shop.update({ freeze: false });

    for (const f of fighters.values()) {
      // позиция по сети
      f.position.x += (f._netX - f.position.x) * 0.35;
      f.position.y = f._netY;

      // ✅ ABSOLUTE FIX:
      // winner after round end: DO NOT call animateFrame() => nothing can loop
      if (f._winnerFrozen) {
        f.draw();
        continue;
      }

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
      if (isSprite(f, "takeHit") && isAnimPlaying(f, "takeHit")) {
        f._state = "takeHit";
        f.animateFrame();
        f.draw();
        continue;
      }

      // attack: do not loop, hold last frame while server says attacking
      if (f._attacking) {
        if (f._state !== "attack1") {
          f._state = "attack1";
          f.switchSprite("attack1");
        }
        if (isAnimPlaying(f, "attack1")) {
          f.animateFrame();
          f.draw();
        } else {
          holdLastFrame(f, "attack1");
        }
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
  }

  animate();
})();
