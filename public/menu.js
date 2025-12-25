// menu.js - isolated UI layer for the in-game menu.
// Responsible only for DOM elements and UI events.

(function () {
  let isMenuOpen = false;
  let isMuted = false;

  function getEl(id) {
    return document.getElementById(id);
  }

  const MenuUI = {
    openMenu(text) {
      const overlay = getEl("menu-overlay");
      const info = getEl("menu-info");
      if (!overlay) return;

      if (text && info) info.textContent = text;

      overlay.classList.remove("hidden");
      isMenuOpen = true;
    },

    closeMenu() {
      const overlay = getEl("menu-overlay");
      if (!overlay) return;

      overlay.classList.add("hidden");
      isMenuOpen = false;
    },

    isOpen() {
      return isMenuOpen;
    },

    showSystemMessage(text, timeout = 2000) {
      const msg = getEl("system-message");
      if (!msg) return;

      msg.textContent = text;
      msg.classList.remove("hidden");
      msg.classList.add("visible");

      clearTimeout(msg._hideTimer);
      msg._hideTimer = setTimeout(() => {
        msg.classList.remove("visible");
        msg.classList.add("hidden");
      }, timeout);
    },
  };

  // Expose UI helpers globally
  window.MenuUI = MenuUI;

  function setMenuLock({ isOwner, pausedByName }) {
    const pauseBtn = getEl("pause-button");
    const resumeBtn = getEl("resume-button");
    const quitBtn = getEl("quit-button");
    const info = getEl("menu-info");

    // Owner can resume; non-owner cannot interact except quit
    if (pauseBtn) pauseBtn.disabled = !isOwner;
    if (resumeBtn) resumeBtn.disabled = !isOwner;
    if (quitBtn) quitBtn.disabled = false;

    if (pauseBtn) pauseBtn.classList.toggle("is-disabled", !isOwner);
    if (resumeBtn) resumeBtn.classList.toggle("is-disabled", !isOwner);

    if (!isOwner && info) {
      const who = pausedByName || "the other player";
      info.textContent = `${who} paused the game. Please wait until they resume the game.`;
    }
  }

  function unlockMenuControls() {
    const pauseBtn = getEl("pause-button");
    const resumeBtn = getEl("resume-button");

    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.classList.remove("is-disabled");
    }
    if (resumeBtn) {
      resumeBtn.disabled = false;
      resumeBtn.classList.remove("is-disabled");
    }
  }

  function createMenuDOM() {
    const parent =
      getEl("gameRoot") || getEl("scaleLayer") || getEl("viewport") || document.body;

    // Pause button
    const pauseBtn = document.createElement("button");
    pauseBtn.id = "pause-button";
    pauseBtn.className = "ui-button pause-button";
    pauseBtn.textContent = "Pause";

    // Mute button (smaller, same style theme)
    const soundBtn = document.createElement("button");
    soundBtn.id = "sound-button";
    soundBtn.className = "sound-button";
    soundBtn.textContent = "MUTE";

    // Overlay container
    const overlay = document.createElement("div");
    overlay.id = "menu-overlay";
    overlay.className = "menu-overlay hidden";

    // Menu panel
    const panel = document.createElement("div");
    panel.className = "menu-panel";

    const title = document.createElement("h2");
    title.id = "menu-title";
    title.className = "menu-title";
    title.textContent = "Game Paused";

    const info = document.createElement("p");
    info.id = "menu-info";
    info.className = "menu-info";
    info.textContent = "Press resume to continue";

    // Buttons row
    const buttons = document.createElement("div");
    buttons.className = "menu-buttons";

    const resumeBtn = document.createElement("button");
    resumeBtn.id = "resume-button";
    resumeBtn.className = "ui-button";
    resumeBtn.textContent = "Resume";

    const quitBtn = document.createElement("button");
    quitBtn.id = "quit-button";
    quitBtn.className = "ui-button danger";
    quitBtn.textContent = "Quit";

    buttons.appendChild(resumeBtn);
    buttons.appendChild(quitBtn);

    panel.appendChild(title);
    panel.appendChild(info);
    panel.appendChild(buttons);
    overlay.appendChild(panel);

    // System message
    const systemMsg = document.createElement("div");
    systemMsg.id = "system-message";
    systemMsg.className = "system-message hidden";

    parent.appendChild(pauseBtn);
    parent.appendChild(soundBtn);
    parent.appendChild(overlay);
    parent.appendChild(systemMsg);

    // Pause: send request to server (no local "request sent" spam)
    pauseBtn.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("menu:pauseRequest"));
    });

    // Resume: send request to server (server will broadcast if allowed)
    resumeBtn.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("menu:resumeRequest"));
    });

    // Quit: always available
    quitBtn.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("menu:quitRequest"));
    });

    function toggleMute() {
      isMuted = !isMuted;
      soundBtn.textContent = isMuted ? "MUTED" : "MUTE";

      // Dispatch for audio.js
      document.dispatchEvent(
        new CustomEvent("menu:muteToggle", { detail: { isMuted } })
      );

      MenuUI.showSystemMessage(
        isMuted ? "Sound muted (M)" : "Sound unmuted (M)",
        1500
      );
    }

    soundBtn.addEventListener("click", toggleMute);

    // Sync button label when mute is toggled via keyboard
    document.addEventListener("menu:muteToggle", (e) => {
      if (e.detail?.isMuted !== undefined && e.detail.isMuted !== isMuted) {
        isMuted = e.detail.isMuted;
        soundBtn.textContent = isMuted ? "MUTED" : "MUTE";
      }
    });

    // React to authoritative server sync (pause/resume/quit)
    window.addEventListener("net-menu-action", (ev) => {
      const { action, name } = ev.detail || {};
      const who = name || "Player";
      const myName = window.NET?.myName || "";
      const isOwner = who === myName;

      if (action === "pause") {
        MenuUI.openMenu(`${who} paused the game`);
        setMenuLock({ isOwner, pausedByName: who });
      }

      if (action === "resume") {
        unlockMenuControls();
        MenuUI.closeMenu();
        MenuUI.showSystemMessage(`${who} resumed the game`);
      }

      if (action === "quit") {
        const overlay = document.getElementById("menu-overlay");
        const info = document.getElementById("menu-info");
        const title = document.getElementById("menu-title");
      
        MenuUI.openMenu();
      
        if (title) title.textContent = "Opponent Left";
        if (info) info.textContent = `${who} quit the game. Returning to Join menu...`;
      
        // Prevent any interaction while redirecting
        const pauseBtn = document.getElementById("pause-button");
        const resumeBtn = document.getElementById("resume-button");
        const quitBtn = document.getElementById("quit-button");
      
        if (pauseBtn) pauseBtn.disabled = true;
        if (resumeBtn) resumeBtn.disabled = true;
        if (quitBtn) quitBtn.disabled = true;
      
        setTimeout(() => {
          sessionStorage.removeItem("playerName");
          location.href = "/";
        }, 1500);
      }
      
      
    });

    // Show a message only to the player whose request was denied by the server
    window.addEventListener("net-menu-action-denied", (ev) => {
      const reason = ev.detail?.reason;
      if (reason) {
        MenuUI.showSystemMessage(reason, 2500);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    createMenuDOM();
  });
})();
