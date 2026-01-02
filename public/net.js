console.log("[net.js] loaded");

(() => {
  const socket = io();
  const qs = new URLSearchParams(location.search);
  const roomId = qs.get("room");

  // Redirect back if no room ID provided
  if (!roomId) {
    location.href = "/";
    return;
  }

  // Retrieve player name from session or ask if missing
  function getOrAskName() {
    let name = sessionStorage.getItem("playerName");
    if (name && name.trim()) return name.trim();

    name = prompt("Enter your name (unique in room):", "");
    name = (name || "").trim();

    if (!name) {
      name = `Player_${Math.floor(Math.random() * 9999)}`;
    }

    sessionStorage.setItem("playerName", name);
    return name;
  }

  const name = getOrAskName();

  // Expose NET object globally (input sending, ids, etc.)
  window.NET = {
    socket,
    roomId,
    myId: null,
    myName: name,
    sendInput(input) {
      socket.emit("input", { roomId, input });
    },
  };

  // Handle socket connection
  socket.on("connect", () => {
    window.NET.myId = socket.id;
    socket.emit("join-room", { roomId, name });
  });

  // Handle join room errors
  socket.on("join-error", (msg) => {
    alert(msg);
    sessionStorage.removeItem("playerName");
    location.href = "/";
  });

  // Receive static room info
  socket.on("room-state", (room) => {
    window.dispatchEvent(new CustomEvent("room-state", { detail: room }));
  });

  // Receive frame-by-frame game state updates
  socket.on("state", (room) => {
    window.dispatchEvent(new CustomEvent("net-state", { detail: room }));
  });

  // Sync game timer
  socket.on("timer", ({ timer }) => {
    window.dispatchEvent(new CustomEvent("net-timer", { detail: timer }));
  });

  // Game over event
  socket.on("game-over", ({ winnerText }) => {
    window.dispatchEvent(
      
      new CustomEvent("net-gameover", { detail: winnerText })
    
    );
  });

  socket.on("rematch-request", (data) => {
    window.dispatchEvent(
      new CustomEvent("net-rematch-request", {
        detail: { opponentName: data.opponentName },
      })
    );
  });

  socket.on("rematch-accepted", () => {
    window.dispatchEvent(new CustomEvent("net-rematch-accepted"));
  });

  socket.on("rematch-declined", () => {
    window.dispatchEvent(new CustomEvent("net-rematch-declined"));
  });

  socket.on("rematch-cancelled", () => {
    window.dispatchEvent(new CustomEvent("net-rematch-cancelled"));
  });

  // Handle hit event
  socket.on("hit", (payload) => {
    window.dispatchEvent(new CustomEvent("net-hit", { detail: payload }));
  });

  // Receive menu actions broadcasted to everyone in the room
  socket.on("menu-action", (payload) => {
    console.log("[net.js] menu-action from server", payload);
    window.dispatchEvent(
      
      new CustomEvent("net-menu-action", { detail: payload })
    
    );
  });

  socket.on("menu-action-denied", (payload) => {
    window.dispatchEvent(
      
      new CustomEvent("net-menu-action-denied", { detail: payload })
    
    );
  });

  // =========================
  // Lobby: start game request
  // =========================
  document.addEventListener("lobby:startRequest", () => {
    console.log("[net.js] lobby:startRequest -> emit start-game", { roomId });
    socket.emit("start-game", { roomId });
  });

  socket.on("start-game-denied", (payload) => {
    window.dispatchEvent(
      new CustomEvent("net-start-denied", { detail: payload })
    );
  });

  // =========================
  // Pause menu actions
  // =========================
  document.addEventListener("menu:pauseRequest", () => {
    socket.emit("menu-action", {
     
      roomId,
     
      action: "pause",
     
      name: window.NET.myName,
   ,
    });
  });

  document.addEventListener("menu:resumeRequest", () => {
    socket.emit("menu-action", {
     
      roomId,
     
      action: "resume",
     
      name: window.NET.myName,
   ,
    });
  });

  document.addEventListener("menu:quitRequest", () => {
    // Inform server and all players
    socket.emit("menu-action", {
      roomId,
      action: "quit",
      name: window.NET.myName,
    });
    socket.emit("menu-action", {
      roomId,
      action: "quit",
      name: window.NET.myName,
    });

    // Optional legacy event (safe try/catch)
    try {
      socket.emit("playerQuit", { roomId, name: window.NET.myName });
    } catch (err) {
      console.error("Error sending playerQuit:", err);
    }

    // Gracefully disconnect socket
    try {
      socket.disconnect();
    } catch (err) {
      console.error("Socket disconnect error:", err);
    }

    // Redirect back to join page
    window.location.href = "/";
  });

  document.addEventListener("menu:rematchRequest", () => {
    socket.emit("rematch-request", { roomId });
  });

  document.addEventListener("menu:rematchAccepted", () => {
    socket.emit("rematch-response", { roomId, accepted: true });
  });

  document.addEventListener("menu:rematchDeclined", () => {
    socket.emit("rematch-response", { roomId, accepted: false });
  });

  document.addEventListener("menu:rematchCancelled", () => {
    socket.emit("rematch-cancelled", { roomId });
  });
})();
