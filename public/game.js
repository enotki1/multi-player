// public/js/game.js
(() => {
  const DEBUG_INPUT = false;
  // ===== DEBUG =====
  const DEBUG_DEATH = true; // death/resets
  const DEBUG_ROOM_FLOW = true; // started/ended transitions
  const DEBUG_THROTTLE_MS = 500; // antispam

  const _dbgLast = new Map(); // key -> timestamp
  function dbg(key, ...args) {
    const now = performance.now();
    const last = _dbgLast.get(key) || 0;
    if (now - last < DEBUG_THROTTLE_MS) return;
    _dbgLast.set(key, now);
    console.log(...args);
  }
  function pLabel(p) {
    const me = window.NET?.myId;
    const tag = p.id === me ? "ME" : "OPP";
    return `${tag}:${p.name}(${p.slot})`;
  }

  const BASE_W = 1024;
  const BASE_H = 576;

  // Coin spawn & trajectory tuning
  const COIN_SPAWN_X = 650; // approx. x of the glowing hole
  const COIN_SPAWN_Y = 220; // approx. y of the hole
  const COIN_TARGET_X = BASE_W / 2; // where we want them to land (center)
  const COIN_FLIGHT_FRAMES = 65; // how long the “throw” lasts in frames

  let prevEnded = false;

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

  function resetFighterLocalState(f) {
    if (DEBUG_DEATH) {
      console.log("[RESET fighter]", {
        id: f?.id,
        _dead: f?._dead,
        _state: f?._state,
        frame: f?.frameCurrent,
        _hitAnim: f?._hitAnim,
        _attackAnim: f?._attackAnim,
        _waitRelease: f?._waitRelease,
      });
    }

    // clear client-side animation locks
    f._dead = false;
    f._hitAnim = false;
    f._attackAnim = false;
    f._waitRelease = false;

    f.dead = false;

    f._srvAttacking = false;
    f._prevSrvAttacking = false;

    // reset state + animation
    f.image = null;
    f._state = "idle";
    f.switchSprite("idle");
    f.frameCurrent = 0;

    // align to last known net position to avoid jump
    f.position.x = f._netX ?? f.position.x;
    f.position.y = f._netY ?? f.position.y;
    f._lastNetX = f._netX ?? f._lastNetX;
    f._lastNetY = f._netY ?? f._lastNetY;
  }

  addEventListener("resize", fitToScreenStable);
  addEventListener("orientationchange", fitToScreenStable);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitToScreenStable);
    window.visualViewport.addEventListener("scroll", fitToScreenStable);
  }
  new ResizeObserver(fitToScreenStable).observe(document.documentElement);

  
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

   el.style.left = "0px";
el.style.top = "0px";
el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
el.style.willChange = "transform"; 
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

    // hard-freeze winner after round end

    f._srvAttacking = false; // what server sends now
    f._prevSrvAttacking = false; // what was on the last update
    f._attackAnim = false; // attack now?
    f._waitRelease = false;
    f._hitAnim = false; // play takeHit for the end 
    
    f.id = p.id;
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

  // ---- INPUT ----
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

      // ===== DEBUG DEAD / REVIVE =====
      const wasDead = !!f._dead;
      const srvDead = !!p.dead;

      dbg(
        `dead-${p.id}`,
        "[DEAD sync]",
        pLabel(p),
        "room:",
        {
          started: room.started,
          ended: room.ended,
          paused: room.paused,
          timer: room.timer,
        },
        "srv:",
        { dead: srvDead, health: p.health, attacking: !!p.attacking },
        "cli(before):",
        { _dead: wasDead, _state: f._state, frame: f.frameCurrent }
      );

      f._dead = srvDead;
      // HARD GUARD:cant draw death, if server says live 
      if (!f._dead && isSprite(f, "death")) {
        
        f.image = null;  сработал
        f._state = "idle";
        f.switchSprite("idle");
        f.frameCurrent = 0;
      }

      
      if (wasDead && !f._dead) {
        console.warn("[REVIVE detected]", pLabel(p), {
          room: {
            started: room.started,
            ended: room.ended,
            paused: room.paused,
          },
          srvDead,
          cliBefore: {
            _dead: wasDead,
            _state: f._state,
            frame: f.frameCurrent,
          },
        });

        resetFighterLocalState(f);

        console.warn("[REVIVE after reset]", pLabel(p), {
          cliAfter: { _dead: f._dead, _state: f._state, frame: f.frameCurrent },
        });
      }

   
      if (!wasDead && f._dead) {
        console.error("[DEAD detected from server]", pLabel(p), {
          room: {
            started: room.started,
            ended: room.ended,
            paused: room.paused,
          },
          srv: { dead: srvDead, health: p.health },
        });
      }
      // ===== END DEBUG =====

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

      // ABSOLUTE FIX: after round end, winner is frozen (no animateFrame)
      if (room.ended && !f._dead) {
        
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

    // If we are aborting the room due to quit, never show winner/tie overlay.
    // Otherwise room-state updates will re-enable it on top of the quit menu.
    if (window.__ROOM_ABORTED__) {
      overlayEl.style.display = "none";
      overlayEl.textContent = "";
      return;
    }

    if (DEBUG_ROOM_FLOW) {
      console.log("[EVENT room-state]", {
        started: room.started,
        ended: room.ended,
        paused: room.paused,
        timer: room.timer,
        players: room.players.map((p) => ({
          id: p.id,
          name: p.name,
          slot: p.slot,
          dead: p.dead,
          health: p.health,
        })),
      });
    }

    // update game active flag
    isGameActive = !!room.started && !room.ended && !room.paused;

    const nowEnded = !!room.ended;
    const nowStarted = !!room.started && !room.ended;

    if (prevEnded && nowStarted) {
      // round restarted
      overlayEl.style.display = "none";
      overlayEl.textContent = "";
      for (const f of fighters.values()) resetFighterLocalState(f);

      // also clear hearts
      for (const coin of coins.values()) coin.el.remove();
      coins.clear();
    }
    prevEnded = nowEnded;

    if (typeof room.timer === "number" && timerEl)
      timerEl.textContent = room.timer;

    applyRoom(room);

    if (room.ended && room.winnerText) {
      overlayEl.style.display = "flex";
      overlayEl.textContent = room.winnerText;

      // clear hearts
      for (const coin of coins.values()) coin.el.remove();
      coins.clear();

      return; // important: don't fall into "else" that could restart music
    } else {
      overlayEl.style.display = "none";
      overlayEl.textContent = "";
      if (!room.ended && !room.paused) {
        if (
          audioManager.backgroundMusic &&
          audioManager.backgroundMusic.paused
        ) {
          audioManager.playBackground();
        }
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

  window.addEventListener("net-state", (ev) => {
    const room = ev.detail;
    if (DEBUG_ROOM_FLOW) {
      dbg(`net-state-${room.id || "room"}`, "[EVENT net-state]", {
        started: room.started,
        ended: room.ended,
        paused: room.paused,
        timer: room.timer,
      });
    }
    applyRoom(room);
  });

  window.addEventListener("net-timer", (ev) => {
    if (timerEl) timerEl.textContent = ev.detail;
  });
  const POSTGAME_DELAY_MS = 2500;

  let postGameMenuShown = false;
  let postGameResultSoundDone = false;

  let postGameUiTimer = null; // store the delayed UI timer
  window.__ROOM_ABORTED__ = false; // guard to block postgame UI after quit

  function maybeStartPostGameHold() {
    if (postGameMenuShown && postGameResultSoundDone) {
      // loop hold.wav while post-game menu is open
      window.audioManager?.playPause?.();
    }
  }

  window.addEventListener("net-gameover", (ev) => {
    if (DEBUG_ROOM_FLOW) console.log("[EVENT net-gameover]", ev.detail);

    const resultText = ev.detail || "Game Over";

    // show big center text
    overlayEl.style.display = "flex";
    overlayEl.textContent = resultText;

    postGameMenuShown = false;
    postGameResultSoundDone = false;

    window.__ROOM_ABORTED__ = false;
    if (postGameUiTimer) clearTimeout(postGameUiTimer);

    // stop everything before result sound
    audioManager.stopAll();

    const t = resultText.toLowerCase();

    // Play result sound and mark "done" when it ends
    let a = null;

    if (t.includes("tie")) {
      a = audioManager.playTie();
    } else if (t.includes("wins")) {
      if (resultText.includes(window.NET?.myName)) {
        a = audioManager.play("victory", 1.0);
      } else {
        a = audioManager.play("defeat", 0.9);
      }
    }

    if (a) {
      a.addEventListener(
        "ended",
        () => {
          postGameResultSoundDone = true;
          maybeStartPostGameHold();
        },
        { once: true }
      );
    } else {
      // muted or sound missing -> treat as finished immediately
      postGameResultSoundDone = true;
    }

    // after text moment -> hide text and show postgame menu
    postGameUiTimer = setTimeout(() => {
      // if opponent quit already, do NOT show postgame UI
      if (window.__ROOM_ABORTED__) return;

      overlayEl.style.display = "none";
      overlayEl.textContent = "";

      window.dispatchEvent(
        new CustomEvent("ui:postgame", { detail: { resultText } })
      );

      postGameMenuShown = true;
      maybeStartPostGameHold();
    }, POSTGAME_DELAY_MS);
  });

  window.addEventListener("net-menu-action", (ev) => {
    const { action } = ev.detail || {};
    if (action !== "quit") return;

    // Opponent quit: cancel delayed postgame UI to prevent "tie flash"
    window.__ROOM_ABORTED__ = true;

    if (postGameUiTimer) {
      clearTimeout(postGameUiTimer);
      postGameUiTimer = null;
    }

    // Optional: hide center result text immediately
    overlayEl.style.display = "none";
    overlayEl.textContent = "";
  });

  /*window.addEventListener("net-rematch-request", (ev) => {
    const { opponentName } = ev.detail;
    MenuUI.showRematchDialog(opponentName);
  });
   */
  window.addEventListener("net-rematch-accepted", () => {
    console.log("[EVENT net-rematch-accepted]");

    MenuUI.closeMenu();
    MenuUI.showSystemMessage("Opponent accepted! Starting new round...", 2000);

    // ✅ reset overlay + local fighter animations immediately
    overlayEl.style.display = "none";
    overlayEl.textContent = "";

    for (const f of fighters.values()) {
      resetFighterLocalState(f);
    }

    // optional: ensure background returns
    window.audioManager?.resumeBackground?.();
  });
  /*
  window.addEventListener("net-rematch-declined", () => {
    MenuUI.closeMenu();
    MenuUI.showSystemMessage("Opponent declined the rematch");
    setTimeout(() => {
      window.location.href = "/";
    }, 2000);
  });

  window.addEventListener("net-rematch-cancelled", () => {
    MenuUI.closeMenu();
    MenuUI.showSystemMessage("Opponent cancelled rematch request");
  });*/

  window.addEventListener("net-hit", (ev) => {
    if (DEBUG_DEATH) console.log("[EVENT net-hit]", ev.detail);
    const { victimId, victimDead } = ev.detail || {};
    const f = fighters.get(victimId);
    if (!f) return;

    audioManager.play("hit", 0.7);

    if (victimDead) {
      if (!f._dead) {
        f._hitAnim = false;
        f._attackAnim = false;
        f._waitRelease = false;
        f._dead = true;
        f._state = "death";
        f.switchSprite("death");
        audioManager.play("defeat", 0.8);
      }
      return;
    }

    if (f._dead) return;

    
    f._attackAnim = false;
    f._waitRelease = false;

    
    f._hitAnim = true;
    f._state = "takeHit";
    f.switchSprite("takeHit");
  });

  /*document.addEventListener("menu:rematchRequest", () => {
    if (window.NET) {
      MenuUI.showRematchWaiting();
      window.NET.socket.emit("rematch-request", {
        roomId: window.NET.roomId,
      });
    }
  });*/

  document.addEventListener("menu:quitRequest", () => {
    window.location.href = "/";
  });

  /*document.addEventListener("menu:rematchAccepted", () => {
    if (window.NET) {
      window.NET.socket.emit("rematch-response", {
        roomId: window.NET.roomId,
        accepted: true,
      });
    }
  });*/

  /*document.addEventListener("menu:rematchDeclined", () => {
    if (window.NET) {
      window.NET.socket.emit("rematch-response", {
        roomId: window.NET.roomId,
        accepted: false,
      });
    }
  });*/

  /*document.addEventListener("menu:rematchCancelled", () => {
    if (window.NET) {
      window.NET.socket.emit("rematch-cancelled", {
        roomId: window.NET.roomId,
      });
    }
  });*/

// ======== TIME-BASED LOOP ========
let _lastT = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = now - _lastT;
  _lastT = now;

  backgrround.update({ freeze: false }, dt);

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
        f.animateFrame(dt);
        f.draw();
      } else {
        holdLastFrame(f, "death");
      }
      continue;
    }

    // takeHit: uninterruptible while playing
    if (f._hitAnim) {
      if (!isSprite(f, "takeHit")) {
        f._state = "takeHit";
        f.switchSprite("takeHit");
      }

      if (isAnimPlaying(f, "takeHit")) {
        f.animateFrame(dt);
        f.draw();
        continue;
      }

      // last frame reached -> unlock and go idle
      f._hitAnim = false;
      f._state = "idle";
      f.switchSprite("idle");
      f.animateFrame(dt);
      f.draw();
      continue;
    }

    // attack: play once then go idle and wait server release
    if (f._attackAnim) {
      if (f._state !== "attack1") {
        f._state = "attack1";
        f.switchSprite("attack1");
      }

      if (isAnimPlaying(f, "attack1")) {
        f.animateFrame(dt);
        f.draw();
        continue;
      }

      // animation finished
      f._attackAnim = false;
      f._waitRelease = true;

      // go idle immediately
      f._state = "idle";
      f.switchSprite("idle");
      f.animateFrame(dt);
      f.draw();
      continue;
    }

    // while server still says attacking=true, do NOT restart attack1
    if (f._waitRelease && f._srvAttacking) {
      if (f._state !== "idle") {
        f._state = "idle";
        f.switchSprite("idle");
      }
      f.animateFrame(dt);
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

    f.animateFrame(dt);
    f.draw();
  }

  // ===== COINS UPDATE (FIX #2: use transform, not left/top) =====
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

    // ✅ FIX: position via transform
    coin.el.style.transform = `translate3d(${Math.round(coin.x)}px, ${Math.round(
      coin.y
    )}px, 0)`;

    // Check collision with fighters
    for (const [playerId, f] of fighters.entries()) {
      const feetX = f.position.x + f.width / 2;
      const feetY = f.position.y + f.height;

      const coinCenterX = coin.x + 16;
      const coinCenterY = coin.y + 16;

      const dx = Math.abs(coinCenterX - feetX);
      const dy = Math.abs(coinCenterY - feetY);

      if (dx < 60 && dy < 60) {
        coin.collected = true;
        coin.el.remove();

        audioManager.play("heartPickup", 0.9);

        if (window.NET) {
          window.NET.socket.emit("coin-pickup", {
            roomId: window.NET.roomId,
            playerId,
            heartId: id,
          });
        }

        coins.delete(id);
        break;
      }
    }
  }
}

requestAnimationFrame(animate);
})();

