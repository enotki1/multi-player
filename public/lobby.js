// lobby.js - shows a lobby overlay until the host starts the game.
// Minimal fix: once the round is over (game-over), lobby is permanently disabled
// so it never pops up again after the fight.

(function () {
    let lobbyDisabled = false; // Once true, lobby will never show again for this page lifetime
  
    function getPlayers(room) {
      if (!room) return [];
      if (Array.isArray(room.players)) return room.players;
      if (room.players && typeof room.players === "object") {
        return Object.values(room.players);
      }
      return [];
    }
  
    function goToJoin() {
      location.href = "/";
    }
  
    function createLobbyDOM() {
      const parent =
        document.getElementById("gameRoot") ||
        document.getElementById("scaleLayer") ||
        document.getElementById("viewport") ||
        document.body;
  
      const overlay = document.createElement("div");
      overlay.id = "lobby-overlay";
      overlay.className = "lobby-overlay hidden";
  
      const panel = document.createElement("div");
      panel.className = "lobby-panel";
  
      const title = document.createElement("div");
      title.className = "lobby-title";
      title.textContent = "LOBBY";
  
      const text = document.createElement("p");
      text.id = "lobby-text";
      text.className = "lobby-text";
      text.textContent = "Waiting for the other player to join...";
  
      const playersLine = document.createElement("p");
      playersLine.id = "lobby-players";
      playersLine.className = "lobby-text";
      playersLine.textContent = "Players: -";
  
      const buttonsRow = document.createElement("div");
      buttonsRow.className = "lobby-buttons";
  
      const startBtn = document.createElement("button");
      startBtn.id = "lobby-start";
      startBtn.className = "lobby-start";
      startBtn.textContent = "Start Game";
      startBtn.disabled = true;
  
      const backBtn = document.createElement("button");
      backBtn.id = "lobby-back";
      backBtn.className = "lobby-back";
      backBtn.textContent = "Back to Join";
  
      backBtn.addEventListener("click", goToJoin);
  
      startBtn.addEventListener("click", () => {
        // The server will validate host + exactly 2 players
        console.log("[lobby] Start clicked");
        document.dispatchEvent(new CustomEvent("lobby:startRequest"));
      });
  
      buttonsRow.appendChild(startBtn);
      buttonsRow.appendChild(backBtn);
  
      panel.appendChild(title);
      panel.appendChild(text);
      panel.appendChild(playersLine);
      panel.appendChild(buttonsRow);
  
      overlay.appendChild(panel);
      parent.appendChild(overlay);
  
      return { overlay, text, playersLine, startBtn, backBtn };
    }
  
    function showLobby(ui, msg) {
      if (lobbyDisabled) return; // <-- key: never show again after game-over
      if (msg) ui.text.textContent = msg;
      ui.overlay.classList.remove("hidden");
    }
  
    function hideLobby(ui) {
      ui.overlay.classList.add("hidden");
    }
  
    function setStartState(ui, { enabled, visible }) {
      ui.startBtn.disabled = !enabled;
      ui.startBtn.style.display = visible ? "inline-block" : "none";
    }
  
    document.addEventListener("DOMContentLoaded", () => {
      const ui = createLobbyDOM();
  
      // If the round is over, permanently disable lobby for this page
      window.addEventListener("net-gameover", () => {
        lobbyDisabled = true;
        hideLobby(ui);
      });
  
      // Show errors from server if someone tries to start incorrectly
      window.addEventListener("net-start-denied", (ev) => {
        const reason = ev.detail?.reason || "Start denied";
        if (window.MenuUI?.showSystemMessage) {
          window.MenuUI.showSystemMessage(reason, 2500);
        }
      });
  
      // Listen to authoritative room-state from the server
      window.addEventListener("room-state", (ev) => {
        if (lobbyDisabled) return; // <-- key: ignore all further room-state updates
        const room = ev.detail;
        if (!room) return;
  
        const players = getPlayers(room);
        const count = players.length;
  
        const myId = window.NET?.myId || null;
        const isLeader = !!myId && room.leaderId === myId;
  
        // Update players line
        const names = players.map((p) => p.name).filter(Boolean);
        ui.playersLine.textContent = names.length
          ? `Players: ${names.join(", ")}`
          : "Players: -";
  
        // If game has started, hide lobby
        if (room.started) {
          hideLobby(ui);
          return;
        }
  
        // Game not started -> lobby must be visible
        showLobby(ui);
  
        // Not enough players yet
        if (count < 2) {
          ui.text.textContent =
            "Waiting for the other player to join...\nYou can go back and try another room.";
          setStartState(ui, { enabled: false, visible: isLeader });
          return;
        }
  
        // Exactly 2 players, waiting for host decision
        if (count === 2) {
          if (isLeader) {
            ui.text.textContent =
              "All players are here. You can start the game when you're ready.";
            setStartState(ui, { enabled: true, visible: true });
          } else {
            ui.text.textContent = `Waiting for ${
              room.leaderName || "the host"
            } to start the game...`;
            setStartState(ui, { enabled: false, visible: false });
          }
          return;
        }
  
        // Safety (should not happen if max players is 2)
        ui.text.textContent = "Room is full.";
        setStartState(ui, { enabled: false, visible: false });
      });
    });
  })();
  