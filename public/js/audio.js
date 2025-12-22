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

    this.backgroundMusic = new Audio("./audio/background.wav");
    this.backgroundMusic.loop = true; // Loop when it ends
    this.backgroundMusic.volume = 0.1;
  }

  play(name, volume = 1) {
    if (this.isMuted || !this.sounds[name]) return;
    const audio = this.sounds[name].cloneNode();
    audio.volume = Math.min(1, volume);
    audio.play().catch((e) => console.log("Audio play failed:", e));
  }

  mute() {
    this.isMuted = true;
  }
  unmute() {
    this.isMuted = false;
  }

  playBackground() {
    if (this.isMuted || !this.backgroundMusic) return;
    this.backgroundMusic.volume = 0.4;
    this.backgroundMusic
      .play()
      .catch((e) => console.log("Background music failed:", e));
  }

  stopBackground() {
    if (!this.backgroundMusic) return;
    this.backgroundMusic.pause();
    this.backgroundMusic.currentTime = 0; // Reset to start
  }

  setBackgroundVolume(volume) {
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = Math.min(1, Math.max(0, volume));
    }
  }
}

const audioManager = new AudioManager();
audioManager.loadSounds();
