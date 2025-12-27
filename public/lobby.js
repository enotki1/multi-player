// lobby.js - shows "waiting room" overlay until at least 2 players are in the room.
// Adds a safe exit button so players don't get stuck waiting forever.

(function () {
    function getPlayerCount(room) {
      if (!room) return 0;
  
      // Common shapes: room.players as array OR object
      if (Array.isArray(room.players)) return room.players.length;
      if (room.players && typeof room.players === "object") return Object.keys(room.players).length;
  
      return 0;
    }
  
    function goToJoin() {
      // Use "/" if your server serves index.html on root.
      // If not, change to "/index.html".
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
  
      const backBtn = document.createElement("button");
      backBtn.id = "lobby-back";
      backBtn.className = "lobby-back";
      backBtn.textContent = "Back to Join";
      backBtn.addEventListener("click", goToJoin);
  
      panel.appendChild(title);
      panel.appendChild(text);
      panel.appendChild(backBtn);
  
      overlay.appendChild(panel);
      parent.appendChild(overlay);
  
      return { overlay, text, backBtn };
    }
  
    function showLobby(ui, msg) {
      if (msg) ui.text.textContent = msg;
      ui.backBtn.disabled = false;
      ui.overlay.classList.remove("hidden");
    }
  
    function hideLobby(ui) {
      ui.overlay.classList.add("hidden");
    }
  
    document.addEventListener("DOMContentLoaded", () => {
      const ui = createLobbyDOM();
  
      // Listen to authoritative room-state from the server
      window.addEventListener("room-state", (ev) => {
        const room = ev.detail;
        const count = getPlayerCount(room);
  
        if (count < 2) {
          showLobby(ui, "Waiting for the other player to join...\nYou can go back and try another room.");
          return;
        }
  
        hideLobby(ui);
      });
    });
  })();
  