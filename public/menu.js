// menu.js - isolated UI layer for the in-game menu.
// Responsible only for DOM elements and UI events.

(function () {
  let isMenuOpen = false;
  let isMuted = false;

  let menuMode = "pause"; // "pause" | "postGame" | "rematchPrompt" | "rematchWaiting"
  let lastOpponentName = "";
  let rematchRequesterName = "";

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

  let pendingMenuMode = null; // { mode, payload }

  function safeSetMode(mode, payload) {
    if (typeof window.__setMenuMode === "function") {
      window.__setMenuMode(mode, payload);
    } else {
      pendingMenuMode = { mode, payload };
    }
  }

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
      getEl("gameRoot") ||
      getEl("scaleLayer") ||
      getEl("viewport") ||
      document.body;

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

    resumeBtn.addEventListener("click", () => {
      if (menuMode === "pause") {
        document.dispatchEvent(new CustomEvent("menu:resumeRequest"));
        return;
      }

      if (menuMode === "postGame") {
        // player requests rematch (one more battle / take revenge)
        MenuUI.showSystemMessage("Rematch request sent", 1500);
        setMode("rematchWaiting");
        MenuUI.openMenu(); // keep open
        document.dispatchEvent(new CustomEvent("menu:rematchRequest"));
        return;
      }

      if (menuMode === "rematchPrompt") {
        // accept rematch
        setMode("rematchWaiting");
        document.dispatchEvent(new CustomEvent("menu:rematchAccepted"));
        return;
      }

      if (menuMode === "rematchWaiting") {
        // cancel waiting
        setMode("postGame", {
          resultText: getEl("menu-info")?.textContent || "",
        });
        document.dispatchEvent(new CustomEvent("menu:rematchCancelled"));
        return;
      }
    });

    quitBtn.addEventListener("click", () => {
      if (menuMode === "rematchPrompt") {
        // decline rematch
        document.dispatchEvent(new CustomEvent("menu:rematchDeclined"));
        MenuUI.closeMenu();
        return;
      }

      // default quit
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

    function setMode(mode, payload = {}) {
      menuMode = mode;

      // reset disabled state
      resumeBtn.disabled = false;
      quitBtn.disabled = false;
      resumeBtn.classList.remove("is-disabled");
      quitBtn.classList.remove("is-disabled");

      if (mode === "pause") {
        title.textContent = "Game Paused";
        resumeBtn.textContent = "Resume";
        quitBtn.textContent = "Quit";
        if (payload.text) info.textContent = payload.text;
      }

      if (mode === "postGame") {
        title.textContent = "Round Over";
        info.textContent = payload.resultText || "";

        // Choose label based on result text
        const t = (payload.resultText || "").toLowerCase();
        const myName = window.NET?.myName || "";

        if (t.includes("tie")) {
          resumeBtn.textContent = "One More Battle";
        } else if (
          t.includes("wins") &&
          (payload.resultText || "").includes(myName)
        ) {
          // you won
          resumeBtn.textContent = "One More Battle";
        } else {
          // you lost
          resumeBtn.textContent = "Take Revenge";
        }

        quitBtn.textContent = "Quit";
      }

      if (mode === "rematchPrompt") {
        title.textContent = "Rematch?";
        info.textContent = `${
          payload.opponentName || "Opponent"
        } wants to play again`;
        resumeBtn.textContent = "Accept";
        quitBtn.textContent = "Decline";
      }

      if (mode === "rematchWaiting") {
        title.textContent = "Waiting...";
        info.textContent = "Waiting for opponent to respond";
        resumeBtn.textContent = "Cancel";
        quitBtn.style.display = "none"; // hide decline
      } else {
        quitBtn.style.display = "inline-block";
      }
    }

    window.__setMenuMode = setMode;

    if (pendingMenuMode) {
      setMode(pendingMenuMode.mode, pendingMenuMode.payload);
      pendingMenuMode = null;
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
        const text = `${who} paused the game`;

        MenuUI.openMenu(text);

        //  set labels to Pause mode (Resume/Quit) and set text in menu-info
        window.__setMenuMode?.("pause", { text });

        // lock controls based on ownership (other player can't resume)
        setMenuLock({ isOwner, pausedByName: who });

        window.audioManager?.playPause();
      }

      if (action === "resume") {
        unlockMenuControls();
        window.__setMenuMode?.("pause"); // resets labels if needed
        MenuUI.closeMenu();
        MenuUI.showSystemMessage(`${who} resumed the game`);

        window.audioManager?.resumeBackground();
      }

      if (action === "quit") {
        const info = document.getElementById("menu-info");
        const title = document.getElementById("menu-title");

        window.__ROOM_ABORTED__ = true;

        MenuUI.openMenu();

        // make sure the winner/tie overlay never covers the quit menu
        const overlay = document.getElementById("displayText");
        if (overlay) {
          overlay.style.display = "none";
          overlay.textContent = "";
        }

        if (title) title.textContent = "Opponent Left";
        if (info)
          info.textContent = `${who} quit the game. Returning to Join menu...`;

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

        window.audioManager?.stopAll();
      }
    });
  }

  // Show a message only to the player whose request was denied by the server
  window.addEventListener("net-menu-action-denied", (ev) => {
    const reason = ev.detail?.reason;
    if (reason) {
      MenuUI.showSystemMessage(reason, 2500);
    }
  });

  window.addEventListener("ui:postgame", (ev) => {
    const resultText = ev.detail?.resultText || "";
    MenuUI.openMenu();
    safeSetMode("postGame", { resultText });
  });

  window.addEventListener("net-rematch-request", (ev) => {
    const opponentName = ev.detail?.opponentName || "Opponent";
    rematchRequesterName = opponentName;

    MenuUI.openMenu();
    safeSetMode("rematchPrompt", { opponentName });
  });

  window.addEventListener("net-rematch-declined", () => {
    MenuUI.showSystemMessage("Opponent declined rematch", 2500);
    // go back to post-game screen
    safeSetMode("postGame", {
      resultText: getEl("menu-info")?.textContent || "",
    });
  });

  window.addEventListener("net-rematch-cancelled", () => {
    MenuUI.showSystemMessage("Rematch request cancelled", 2000);
    safeSetMode("postGame", {
      resultText: getEl("menu-info")?.textContent || "",
    });
  });

  window.addEventListener("net-rematch-accepted", () => {
    MenuUI.closeMenu();
    MenuUI.showSystemMessage("Rematch starting!", 1500);
    window.audioManager?.resumeBackground?.();
  });

  document.addEventListener("DOMContentLoaded", () => {
    createMenuDOM();
  });
})();
