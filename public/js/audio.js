class AudioManager {
  constructor() {
    this.sounds = {};
    this.isMuted = false;
    this.backgroundMusic = null;
  }

  loadSound(name, path) {
    const audio = new Audio(path);
    audio.preload = "auto";
    this.sounds[name] = audio;
    return audio;
  }

  loadSounds() {
    this.loadSound("punch", "./audio/sword-hit.ogg");
    this.loadSound("hit", "./audio/hit.wav");
    this.loadSound("block", "./audio/attack-block.wav");
    this.loadSound("jump", "./audio/jump.wav");
    this.loadSound("victory", "./audio/victory.wav");
    this.loadSound("defeat", "./audio/defeat.wav");

    // ❤️ heart-related sounds
    this.loadSound("heartSpawn", "./audio/powerup.ogg");
    this.loadSound("heartPickup", "./audio/heart-collect.wav");

    this.backgroundMusic = new Audio("./audio/background.wav");
    this.backgroundMusic.loop = true; // Loop when it ends
    this.backgroundMusic.volume = 0.1;

    this.tieMusic = new Audio("./audio/tie.wav");
    this.tieMusic.loop = false;
    this.tieMusic.volume = 0.5;

    this.pauseMusic = new Audio("./audio/hold.wav"); // You'll need to add this file
    this.pauseMusic.loop = true;
    this.pauseMusic.volume = 0.3;

    this.currentTrack = null; // Track what's currently playing
  }

  play(name, volume = 1) {
    if (this.isMuted || !this.sounds[name]) return;
    const audio = this.sounds[name].cloneNode();
    audio.volume = Math.min(1, volume);
    audio.currentTime = 0;
    audio.play().catch((e) => console.log("Audio play failed:", e));
    return audio;
  }

  mute() {
    this.isMuted = true;
  }
  unmute() {
    this.isMuted = false;
  }

  setMuted(muted) {
    if (muted) {
      this.mute();
    } else {
      this.unmute();
    }
  }

  playBackground() {
    if (this.isMuted || !this.backgroundMusic) return;
    this.backgroundMusic.volume = 0.4;
    this.backgroundMusic
      .play()
      .catch((e) => console.log("Background music failed:", e));
  }

  stopBackground() {
    this.stopAll();
  }

  setBackgroundVolume(volume) {
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = Math.min(1, Math.max(0, volume));
    }
  }

  playTie() {
    this.stopAll();
    if (this.isMuted || !this.tieMusic) return;
    this.currentTrack = this.tieMusic;
    this.tieMusic.currentTime = 0;
    this.tieMusic.play().catch((e) => console.log("Tie music failed:", e));
    return this.tieMusic;
  }

  playPause() {
    this.stopAll();
    if (this.isMuted || !this.pauseMusic) return;
    this.currentTrack = this.pauseMusic;
    this.pauseMusic.currentTime = 0;
    this.pauseMusic.play().catch((e) => console.log("Pause music failed:", e));
  }

  stopAll() {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
    }
    if (this.tieMusic) {
      this.tieMusic.pause();
    }
    if (this.pauseMusic) {
      this.pauseMusic.pause();
    }
    this.currentTrack = null;
  }

  resumeBackground() {
    this.stopAll();
    this.playBackground();
  }
}

const audioManager = new AudioManager();
audioManager.loadSounds();

window.audioManager = audioManager;

document.addEventListener("menu:muteToggle", (event) => {
  const { isMuted } = event.detail;

  console.log("[AUDIO] Mute toggle:", isMuted);

  if (isMuted) {
    audioManager.mute();
    audioManager.stopBackground();
  } else {
    audioManager.unmute();
    audioManager.playBackground();
  }
});

function unlockAudioOnce() {
  const unlock = () => {
    // Start/stop a silent play to "unlock" HTMLAudio in some browsers
    try {
      if (audioManager.backgroundMusic) {
        audioManager.backgroundMusic.volume = 0;
        audioManager.backgroundMusic
          .play()
          .then(() => {
            audioManager.backgroundMusic.pause();
            audioManager.backgroundMusic.currentTime = 0;
            audioManager.backgroundMusic.volume = 0.4;
          })
          .catch(() => {});
      }
    } catch (_) {}

    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

unlockAudioOnce();
