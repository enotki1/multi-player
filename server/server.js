const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "..", "public")));

// ================== DEBUG ==================
const DEBUG = true;
const log = (...args) => {
  if (DEBUG) console.log(...args);
};

// ================== CONFIG ==================
const TICK_RATE = 60;

const BASE_W = 1024;
const STAGE_LEFT = 50;
const STAGE_RIGHT = BASE_W - 50;

const FLOOR_Y = 330;

const GRAVITY = 1.2;

const JUMP_VY = -20;
const SPEED_X = 10;

const MAX_PLAYERS_PER_ROOM = 2;
const ROUND_SECONDS = 60;

const BODY_W = 50;
const BODY_H = 150;

const DAMAGE = 20;
const HEART_HEAL_AMOUNT = 15;
const BLOCK_MULT = 0.2;

const KB_POWER = 4;
const KB_DECAY = 0.75;

const HIT_FRAME_TICK = { samurai: 9, kenji: 2 };

const ATTACK_DURATION_TICKS = 20;
const ATTACK_COOLDOWN_TICKS = 20;

// ================== ROOMS ==================
const rooms = new Map();

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeName(name) {
  return String(name || "")
    .trim()
    .slice(0, 16);
}

function makeRoom(roomId) {
  const room = {
    id: roomId,
    started: false,
    ended: false,

    // Server-authoritative pause flag
    paused: false,

    // Tracks who paused the game (only this player can resume)
    pausedById: null,
    pausedByName: "",

    // Leader / host (first player who joined). Only the leader can start the game.
    leaderId: null,
    leaderName: "",

    timer: ROUND_SECONDS,
    lastSecondTick: Date.now(),
    winnerText: "",
    players: new Map(),
  };

  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || makeRoom(roomId);
}

function isNameTaken(room, name) {
  for (const p of room.players.values()) {
    if (p.name.toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}

function nextSlot(room) {
  const used = new Set([...room.players.values()].map((p) => p.slot));
  return used.has(1) ? 2 : 1;
}

function spawnForSlot(slot) {
  if (slot === 1) return { x: 332, char: "samurai" };
  return { x: 692, char: "kenji" };
}

function roomPublicState(room) {
  return {
    id: room.id,
    started: room.started,
    ended: room.ended,
    paused: !!room.paused,
    timer: room.timer,
    winnerText: room.winnerText,

    // Leader info for Lobby UI
    leaderId: room.leaderId,
    leaderName: room.leaderName,

    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      char: p.char,
      x: p.x,
      y: p.y,
      facing: p.facing,
      health: p.health,
      dead: p.dead,
      blocking: !!p.inputs.block,
      attacking: p.attacking,
    })),
  };
}

function updateFacing(room) {
  const ps = [...room.players.values()];
  if (ps.length < 2) return;

  const a = ps[0];
  const b = ps[1];

  if (a.x < b.x) {
    a.facing = 1;
    b.facing = -1;
  } else {
    a.facing = -1;
    b.facing = 1;
  }
}

/**
 * Ensures the room has a valid leader.
 * - If the current leader is still connected, nothing changes.
 * - If the leader left, assigns the first remaining player as the new leader.
 * - If the room is empty, clears leader fields.
 */
function reassignLeaderIfNeeded(room) {
  if (room.leaderId && room.players.has(room.leaderId)) return;

  const first = room.players.values().next().value;
  if (first) {
    room.leaderId = first.id;
    room.leaderName = first.name || "Host";
  } else {
    room.leaderId = null;
    room.leaderName = "";
  }
}

// ================== PUSHBOX / HITBOX ==================
function resolvePushbox(a, b) {
  const aBottom = a.y + BODY_H;
  const bBottom = b.y + BODY_H;
  const yClose = Math.abs(aBottom - bBottom) < 60;
  if (!yClose) return;

  const ax1 = a.x,
    ax2 = a.x + BODY_W;
  const bx1 = b.x,
    bx2 = b.x + BODY_W;

  const overlap = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  if (overlap <= 0) return;

  const push = overlap / 2;
  if (ax1 < bx1) {
    a.x -= push;
    b.x += push;
  } else {
    a.x += push;
    b.x -= push;
  }

  a.x = clamp(a.x, STAGE_LEFT, STAGE_RIGHT - BODY_W);
  b.x = clamp(b.x, STAGE_LEFT, STAGE_RIGHT - BODY_W);
}

function bodyBox(p) {
  return { x: p.x, y: p.y, w: BODY_W, h: BODY_H };
}

function attackBox(p) {
  const conf =
    p.char === "samurai"
      ? { ox: 100, oy: 50, w: 135, h: 50 }
      : { ox: 50, oy: 50, w: 170, h: 50 };

  const ax = p.facing === 1 ? p.x + conf.ox : p.x + (BODY_W - conf.ox - conf.w);

  return { x: ax, y: p.y + conf.oy, w: conf.w, h: conf.h };
}

function rectHit(a, b) {
  return (
    a.x + a.w >= b.x && a.x <= b.x + b.w && a.y + a.h >= b.y && a.y <= b.y + b.h
  );
}

function isOnGround(p) {
  return Math.abs(p.y - FLOOR_Y) < 0.001 && Math.abs(p.vy) < 0.001;
}

// ================== GAMEFLOW ==================
function determineWinner(room) {
  const ps = [...room.players.values()].sort((a, b) => a.slot - b.slot);
  if (ps.length < 2) return "Tie";
  const [p1, p2] = ps;
  if (p1.health === p2.health) return "Tie";
  return p1.health > p2.health ? `${p1.name} wins` : `${p2.name} wins`;
}

function endRound(room, text) {
  room.started = false;
  room.ended = true;
  room.paused = false;
  room.winnerText = text;

  // Reset attack state if the round ends mid-attack
  for (const p of room.players.values()) {
    p.attacking = false;
    p.attackTick = 0;
    p.attackDidHit = false;
    p.queue.attack = 0;
    p.queue.jump = 0;
  }

  io.to(room.id).emit("game-over", { winnerText: text });
  io.to(room.id).emit("room-state", roomPublicState(room));
}

function startRound(room) {
  room.started = true;
  room.ended = false;
  room.paused = false;
  room.timer = ROUND_SECONDS;
  room.winnerText = "";
  room.lastSecondTick = Date.now();

  for (const p of room.players.values()) {
    const sp = spawnForSlot(p.slot);

    p.char = sp.char;
    p.x = sp.x;
    p.y = FLOOR_Y;

    p.vx = 0;
    p.vy = 0;
    p.kb = 0;

    p.health = 100;
    p.dead = false;

    p.inputs = { left: false, right: false, block: false };
    p.queue = { attack: 0, jump: 0 };

    p.lastActionSeq = 0;

    p.attacking = false;
    p.attackTick = 0;
    p.attackDidHit = false;
    p.attackCooldown = 0;

    p.facing = p.slot === 1 ? 1 : -1;
  }

  updateFacing(room);
  io.to(room.id).emit("timer", { timer: room.timer });
  io.to(room.id).emit("room-state", roomPublicState(room));
}

function applyHit(attacker, victim) {
  let dmg = DAMAGE;
  if (victim.inputs.block) dmg = Math.max(0, Math.floor(dmg * BLOCK_MULT));

  victim.health -= dmg;
  if (victim.health < 0) victim.health = 0;

  const dir = attacker.x < victim.x ? 1 : -1;
  const kb = victim.inputs.block ? KB_POWER * 0.35 : KB_POWER;

  // Do not accumulate knockback
  victim.kb = dir * kb;

  if (victim.health <= 0) victim.dead = true;

  const room = rooms.get(attacker.roomId);
  if (room) {
    if (!heartSpawns.has(room.id)) {
      heartSpawns.set(room.id, {
        lastSpawnTime: 0,
        lastHitTime: 0,
        damageDealtSinceSpawn: 0,
      });
    }
    const spawn = heartSpawns.get(room.id);
    spawn.lastHitTime = Date.now();
    spawn.damageDealtSinceSpawn += dmg;
  }

  io.to(attacker.roomId).emit("hit", {
    attackerId: attacker.id,
    victimId: victim.id,
    victimHealth: victim.health,
    victimDead: victim.dead,
  });
}

function tryHit(room, attacker) {
  const ps = [...room.players.values()];
  const victim = ps.find((p) => p.id !== attacker.id);
  if (!victim || victim.dead) return;

  const hit = rectHit(attackBox(attacker), bodyBox(victim));
  if (hit) applyHit(attacker, victim);
}

function tickRoom(room) {
  if (!room.started) return;
  if (room.paused) return;

  const ps = [...room.players.values()];
  if (ps.length === 0) return;

  // Timer tick
  const now = Date.now();
  if (ps.length >= 2) {
    if (now - room.lastSecondTick >= 1000) {
      room.lastSecondTick += 1000;
      room.timer = Math.max(0, room.timer - 1);
      io.to(room.id).emit("timer", { timer: room.timer });
      if (room.timer === 0) return endRound(room, determineWinner(room));
    }
  }

  for (const p of ps) {
    if (p.dead) continue;

    if (p.attackCooldown > 0) p.attackCooldown--;

    const onGround = isOnGround(p);

    // JUMP consume
    if (p.queue.jump) {
      p.queue.jump = 0;
      if (onGround && !p.attacking && !p.inputs.block) {
        p.vy = JUMP_VY;
      }
    }

    // ATTACK consume
    if (p.queue.attack) {
      p.queue.attack = 0;

      if (p.attacking) continue;
      if (p.inputs.block) continue;
      if (p.attackCooldown > 0) continue;

      p.attacking = true;
      p.attackTick = 0;
      p.attackDidHit = false;
      p.attackCooldown = ATTACK_COOLDOWN_TICKS;
    }

    // MOVE
    let vx = 0;
    if (!p.inputs.block && !p.attacking) {
      if (p.inputs.left) vx -= SPEED_X;
      if (p.inputs.right) vx += SPEED_X;
    }

    // Knockback
    if (Math.abs(p.kb) > 0.01) {
      vx += p.kb;
      p.kb *= KB_DECAY;
      if (Math.abs(p.kb) < 0.05) p.kb = 0;
    }

    p.vx = vx;
    p.x += p.vx;

    // GRAVITY / FLOOR
    p.vy += GRAVITY;
    p.y += p.vy;

    if (p.y >= FLOOR_Y) {
      p.y = FLOOR_Y;
      p.vy = 0;
    }

    // Stage clamp
    p.x = clamp(p.x, STAGE_LEFT, STAGE_RIGHT - BODY_W);

    // ATTACK UPDATE
    if (p.attacking) {
      p.attackTick++;

      const hitTick = HIT_FRAME_TICK[p.char] ?? 0;
      if (!p.attackDidHit && p.attackTick === hitTick) {
        tryHit(room, p);
        p.attackDidHit = true;
      }

      if (p.attackTick >= ATTACK_DURATION_TICKS) {
        p.attacking = false;
        p.attackTick = 0;
        p.attackDidHit = false;
      }
    }
  }

  if (ps.length >= 2) {
    resolvePushbox(ps[0], ps[1]);
    updateFacing(room);

    const [a, b] = ps;
    if (a.health <= 0 || b.health <= 0) endRound(room, determineWinner(room));
  }
}

// =============== HEART SPAWNING ================
const heartSpawns = new Map();
const activeHearts = new Map();

const HEART_SPAWN_COOLDOWN = 5000;
const HEART_DAMAGE_THRESHOLD = 40;
const HEART_SPAWN_DELAY_AFTER_HIT = 2000;
const HEART_LIFETIME = 1200 * (1000 / 60);
const HEART_SPAWN_X = 650;
const HEART_SPAWN_Y = 220;
const HEART_FLIGHT_FRAMES = 65;

function checkAndSpawnHearts(room) {
  // Only spawn during active game and never while paused
  if (!room.started || room.ended || room.paused) return;

  if (!heartSpawns.has(room.id)) {
    heartSpawns.set(room.id, {
      lastSpawnTime: 0,
      lastHitTime: 0,
      damageDealtSinceSpawn: 0,
    });
  }

  if (!activeHearts.has(room.id)) {
    activeHearts.set(room.id, new Map());
  }

  const spawn = heartSpawns.get(room.id);
  const hearts = activeHearts.get(room.id);
  const now = Date.now();

  // Clean up expired hearts
  for (const [heartId, heartData] of hearts.entries()) {
    if (now - heartData.spawnTime > HEART_LIFETIME) {
      hearts.delete(heartId);
    }
  }

  if (hearts.size > 0) return;
  if (now - spawn.lastSpawnTime < HEART_SPAWN_COOLDOWN) return;

  if (spawn.lastHitTime && now - spawn.lastHitTime < HEART_SPAWN_DELAY_AFTER_HIT) return;
  if (spawn.damageDealtSinceSpawn < HEART_DAMAGE_THRESHOLD) return;

  const players = [...room.players.values()];
  const wounded = players.filter((p) => !p.dead && p.health < 100);
  if (wounded.length === 0) return;

  spawn.lastSpawnTime = now;
  spawn.damageDealtSinceSpawn = 0;

  const heartData = {
    id: `${room.id}-${now}`,
    spawnTime: now,
    x: HEART_SPAWN_X,
    y: HEART_SPAWN_Y,
  };

  hearts.set(heartData.id, heartData);

  io.to(room.id).emit("heart-spawn", {
    heartId: heartData.id,
    x: heartData.x,
    y: heartData.y,
    flightFrames: HEART_FLIGHT_FRAMES,
  });
}

function onHeartPickedUp(room, heartId) {
  if (activeHearts.has(room.id)) {
    const hearts = activeHearts.get(room.id);
    if (hearts.has(heartId)) {
      hearts.delete(heartId);
    }
  }
}

// ================== SOCKETS ==================
io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    roomId = String(roomId || "").trim();
    if (!roomId) return socket.emit("join-error", "Room ID is required.");

    const room = getRoom(roomId);
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      return socket.emit("join-error", "Room is full (2/2). Create another room.");
    }
  
    name = sanitizeName(name);
    if (!name) return socket.emit("join-error", "Name is required.");
    if (isNameTaken(room, name)) {
      return socket.emit("join-error", "Name is taken in this room. Choose another.");
    }; 
  

    socket.join(roomId);

    const slot = nextSlot(room);
    const sp = spawnForSlot(slot);

    room.players.set(socket.id, {
      id: socket.id,
      roomId,
      name,
      slot,
      char: sp.char,

      x: sp.x,
      y: FLOOR_Y,
      vx: 0,
      vy: 0,
      kb: 0,
      facing: slot === 1 ? 1 : -1,

      health: 100,
      dead: false,

      inputs: { left: false, right: false, block: false },
      queue: { attack: 0, jump: 0 },

      lastActionSeq: 0,

      attacking: false,
      attackTick: 0,
      attackDidHit: false,
      attackCooldown: 0,
    });

    // Assign leader if this is the first player in the room
if (!room.leaderId) {
  room.leaderId = socket.id;
  room.leaderName = name;
}

    io.to(roomId).emit("room-state", roomPublicState(room));

  });

  socket.on("start-game", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
  
    // Only the leader can start the game
    if (room.leaderId !== socket.id) {
      socket.emit("start-game-denied", { reason: "Only the host can start the game." });
      return;
    }
  
    // Must be exactly 2 players
    if (room.players.size !== 2) {
      socket.emit("start-game-denied", { reason: "Need exactly 2 players to start." });
      return;
    }
  
    if (room.started || room.ended) return;
  
    room.started = true;
    room.paused = false;
    room.pausedById = null;
    room.pausedByName = "";
    room.lastSecondTick = Date.now();
  
    io.to(roomId).emit("room-state", roomPublicState(room));
    startRound(room);
  });
  

  socket.on("menu-action", ({ roomId, action, name }) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const safeName = sanitizeName(name) || "Player";

  if (action === "pause") {
    room.paused = true;

    // Track who paused the game (only this player can resume)
    room.pausedById = socket.id;
    room.pausedByName = safeName;

    // Reset second tick anchor so timer does not "jump" after resume
    room.lastSecondTick = Date.now();
  }

  // Only the player who paused can resume
  if (
    action === "resume" &&
    room.paused &&
    room.pausedById &&
    room.pausedById !== socket.id
  ) {
    socket.emit("menu-action-denied", {
      reason: `Please wait until ${
        room.pausedByName || "the other player"
      } resumes the game.`,
    });
    return;
  }

  if (action === "resume") {
    room.paused = false;

    // Clear pause owner tracking
    room.pausedById = null;
    room.pausedByName = "";

    // Reset second tick anchor so timer does not "jump" after resume
    room.lastSecondTick = Date.now();
  }

  if (action === "quit") {
    // If the pause owner quits, auto-unpause to avoid a stuck room
    if (room.pausedById === socket.id) {
      room.paused = false;
      room.pausedById = null;
      room.pausedByName = "";
    }

    // Remove player from room if the sender is in it
    if (room.players.has(socket.id)) {
      room.players.delete(socket.id);
    }

    // Stop the game if there are not enough players
    if (room.players.size < 2) {
      room.started = false;
      room.paused = false;
      room.pausedById = null;
      room.pausedByName = "";
    }

    // Broadcast quit action first so remaining player sees the message
    io.to(roomId).emit("menu-action", { action: "quit", name: safeName });

    // Publish updated authoritative room state
    io.to(roomId).emit("room-state", roomPublicState(room));

    // Clean room if empty
    if (room.players.size === 0) {
      rooms.delete(roomId);
    }

    return;
  }

  // Broadcast to all clients (including the sender)
  io.to(roomId).emit("menu-action", { action, name: safeName });

  // Always publish the authoritative room state
  io.to(roomId).emit("room-state", roomPublicState(room));
});


  socket.on("input", ({ roomId, input }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.paused) return;

    const p = room.players.get(socket.id);
    if (!p || p.dead) return;

    p.inputs.left = !!input?.left;
    p.inputs.right = !!input?.right;
    p.inputs.block = !!input?.block;
  });

  socket.on("action", ({ roomId, type, seq }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.paused) return;

    const p = room.players.get(socket.id);
    if (!p || p.dead) return;

    const s = Number(seq) || 0;
    if (s <= p.lastActionSeq) return;
    p.lastActionSeq = s;

    if (type === "attack") {
      if (p.attacking || p.attackCooldown > 0 || p.inputs.block) return;
      p.queue.attack = 1;
    }

    if (type === "jump") {
      const onGround = isOnGround(p);
      if (!onGround || p.attacking || p.inputs.block) return;
      p.queue.jump = 1;
    }
  });

  socket.on("coin-pickup", ({ roomId, playerId, heartId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.paused) return;

    const p = room.players.get(playerId);
    if (!p) return;

    p.health = Math.min(100, p.health + HEART_HEAL_AMOUNT);
    onHeartPickedUp(room, heartId);

    io.to(roomId).emit("state", roomPublicState(room));
  });

  // ===== REMATCH SYSTEM =====
  socket.on("rematch-request", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.ended) return;

    const requester = room.players.get(socket.id);
    if (!requester) return;

    if (!room.rematchVotes) {
      room.rematchVotes = new Map();
    }
    room.rematchVotes.set(socket.id, true);

    const opponent = [...room.players.values()].find((p) => p.id !== socket.id);
    if (!opponent) return;

    io.to(opponent.id).emit("rematch-request", {
      opponentName: requester.name,
    });

    log(`[REMATCH] ${requester.name} requested rematch in ${roomId}`);
  });

  socket.on("rematch-response", ({ roomId, accepted }) => {
    const room = rooms.get(roomId);
    if (!room || !room.ended) return;

    const responder = room.players.get(socket.id);
    if (!responder) return;

    if (!room.rematchVotes) {
      room.rematchVotes = new Map();
    }

    if (accepted) {
      room.rematchVotes.set(socket.id, true);
      log(`[REMATCH] ${responder.name} accepted rematch in ${roomId}`);

      if (room.rematchVotes.size === 2) {
        room.rematchVotes.clear();
        startRound(room);
        io.to(roomId).emit("rematch-accepted");
      }
    } else {
      log(`[REMATCH] ${responder.name} declined rematch in ${roomId}`);
      const requester = [...room.players.values()].find(
        (p) => p.id !== socket.id
      );
      if (requester) {
        io.to(requester.id).emit("rematch-declined");
      }
      room.rematchVotes.clear();
    }
  });

  socket.on("rematch-cancelled", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const canceller = room.players.get(socket.id);
    if (!canceller) return;

    const opponent = [...room.players.values()].find((p) => p.id !== socket.id);
    if (opponent) {
      io.to(opponent.id).emit("rematch-cancelled");
    }

    if (room.rematchVotes) {
      room.rematchVotes.clear();
    }

    log(`[REMATCH] ${canceller.name} cancelled rematch in ${roomId}`);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (!room.players.has(socket.id)) continue;

      // Read player name BEFORE deleting from the room
      const player = room.players.get(socket.id);
      const playerName = player?.name || "A player";

      room.players.delete(socket.id);

      // Broadcast quit message to remaining players
      io.to(room.id).emit("menu-action", { action: "quit", name: playerName });


      if (room.players.size < 2) {
        room.started = false;
        room.paused = false;
        room.pausedById = null;
        room.pausedByName = "";
        room.lastSecondTick = Date.now();

      }

      io.to(room.id).emit("room-state", roomPublicState(room));
    }

    for (const [id, room] of rooms.entries()) {
      if (room.players.size === 0) rooms.delete(id);
    }
  });
}); // ✅ Close io.on("connection", ...)

// ✅ Global tick (must run once for the whole server)
setInterval(() => {
  for (const room of rooms.values()) tickRoom(room);
  for (const room of rooms.values()) checkAndSpawnHearts(room);

  for (const room of rooms.values()) {
    if (!room.started) continue;
    io.to(room.id).emit("state", roomPublicState(room));
  }
}, 1000 / TICK_RATE);

// ✅ Start server once
server.listen(PORT, () =>
  console.log(`Server running: http://localhost:${PORT}`)
);
