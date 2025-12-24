// menu.js - isolated UI layer for the in-game menu.
// Responsible only for DOM elements and UI events.

(function () {
    let isMenuOpen = false;
  
    function getEl(id) {
      return document.getElementById(id);
    }
  
    function createMenuDOM() {
      const parent = document.getElementById("gameRoot") 
  || document.getElementById("scaleLayer") 
  || document.getElementById("viewport") 
  || document.body;

  
      // Pause button in the corner
      const pauseBtn = document.createElement("button");
      pauseBtn.id = "pause-button";
      pauseBtn.className = "ui-button pause-button";
      pauseBtn.textContent = "Pause";
  
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
  
      // System message (e.g. "Ann paused the game")
      const systemMsg = document.createElement("div");
      systemMsg.id = "system-message";
      systemMsg.className = "system-message hidden";
  
      // Attach everything to the game viewport
      parent.appendChild(pauseBtn);
      parent.appendChild(overlay);
      parent.appendChild(systemMsg);
  
      // UI event listeners – they dispatch custom events and update local UI
      pauseBtn.addEventListener("click", () => {
        MenuUI.openMenu("Game paused");
        MenuUI.showSystemMessage("You paused the game");
        const ev = new CustomEvent("menu:pauseRequest");
        document.dispatchEvent(ev);
      });
  
      resumeBtn.addEventListener("click", () => {
        MenuUI.closeMenu();
        MenuUI.showSystemMessage("You resumed the game");
        const ev = new CustomEvent("menu:resumeRequest");
        document.dispatchEvent(ev);
      });
  
      quitBtn.addEventListener("click", () => {
        MenuUI.showSystemMessage("You quit the game");
        const ev = new CustomEvent("menu:quitRequest");
        document.dispatchEvent(ev);
      });
    }
  
    const MenuUI = {
      openMenu(text) {
        const overlay = getEl("menu-overlay");
        const info = getEl("menu-info");
        if (!overlay) return;
        if (text && info) {
          info.textContent = text;
        }
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
  
    // Expose to other client scripts (game.js, net.js)
    window.MenuUI = MenuUI;
  
    document.addEventListener("DOMContentLoaded", () => {
      console.log("menu DOM init");
      createMenuDOM();
    });
  })();
  