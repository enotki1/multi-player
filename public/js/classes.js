class Sprite {
  constructor({
    position,
    imageSrc,
    scale = 1,
    framesMax = 1,
    offset = { x: 0, y: 0 },
    el,
    animFps = 12, // ✅ default animation speed
  }) {
    this.position = position;
    this.scale = scale;
    this.framesMax = framesMax;
    this.frameCurrent = 0;
    this.offset = offset;

    // ✅ time-based animation
    this.animFps = animFps;
    this._frameTimer = 0;

    this.image = new Image();
    this.image.src = imageSrc;

    this.el = el;

    this.sheetEl = document.createElement("div");
    this.sheetEl.style.position = "absolute";
    this.sheetEl.style.left = "0";
    this.sheetEl.style.top = "0";
    this.sheetEl.style.backgroundRepeat = "no-repeat";
    this.sheetEl.style.transformOrigin = "top left";
    this.el.appendChild(this.sheetEl);

    this.loaded = false;
    this.frameWidth = 0;
    this.frameHeight = 0;

    this.image.onload = () => {
      this.loaded = true;
      this.frameWidth = this.image.width / this.framesMax;
      this.frameHeight = this.image.height;

      this.sheetEl.style.width = `${this.frameWidth * this.scale}px`;
      this.sheetEl.style.height = `${this.frameHeight * this.scale}px`;

      this.sheetEl.style.backgroundImage = `url("${imageSrc}")`;
      this.sheetEl.style.backgroundSize = `${this.image.width * this.scale}px ${this.image.height * this.scale}px`;
    };
  }

  draw() {
    this.el.style.transform = `translate(${this.position.x}px, ${this.position.y}px)`;

    if (this.loaded) {
      const bgX = -(this.frameCurrent * this.frameWidth * this.scale);
      this.sheetEl.style.backgroundPosition = `${bgX}px 0px`;
    }
  }

  // ✅ time-based frame advance
  animateFrame(dt = 1000 / 60) {
    if (!this.animFps || this.animFps <= 0 || this.framesMax <= 1) return;

    const frameDuration = 1000 / this.animFps;
    this._frameTimer += dt;

    // clamp huge dt (tab switch etc.)
    if (this._frameTimer > 250) this._frameTimer = 250;

    while (this._frameTimer >= frameDuration) {
      this._frameTimer -= frameDuration;
      if (this.frameCurrent < this.framesMax - 1) this.frameCurrent++;
      else this.frameCurrent = 0;
    }
  }

  update({ freeze = false } = {}, dt = 1000 / 60) {
    this.draw();
    if (!freeze) this.animateFrame(dt);
  }
}

class Fighter extends Sprite {
  constructor({
    position,
    velocity,
    imageSrc,
    scale = 1,
    framesMax = 1,
    offset = { x: 0, y: 0 },
    sprites,
    attackBox = { offset: {}, width: undefined, height: undefined },
    el,
    attackEl,
    baseFlip = 1,
    animFps = 12,
  }) {
    super({ position, imageSrc, scale, framesMax, offset, el, animFps });

    this.velocity = velocity;

    this.width = 50;
    this.height = 150;

    this.attackBox = {
      position: { x: this.position.x, y: this.position.y },
      offset: attackBox.offset,
      width: attackBox.width,
      height: attackBox.height,
    };

    this.attackEl = attackEl;

    this.isAttacking = false;
    this.isBlocking = false;

    this.health = 100;
    this.dead = false;

    this.facing = 1;
    this.baseFlip = baseFlip;

    this.sprites = sprites || {};
    for (const key in this.sprites) {
      this.sprites[key].image = new Image();
      this.sprites[key].image.src = this.sprites[key].imageSrc;
    }
  }

  setFacing(dir) {
    this.facing = dir === -1 ? -1 : 1;
  }

  setBlocking(v) {
    this.isBlocking = v;
    if (this.isBlocking) this.el.classList.add("blocking");
    else this.el.classList.remove("blocking");
  }

  draw() {
    const px = Math.round(this.position.x);
    const py = Math.round(this.position.y);
    this.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;

    const offX = Math.round(this.offset.x);
    const offY = Math.round(this.offset.y);

    const visualW = Math.round((this.frameWidth || 0) * this.scale);
    const dir = (this.facing || 1) * (this.baseFlip || 1);

    if (dir === 1) {
      this.sheetEl.style.transform = `translate3d(${-offX}px, ${-offY}px, 0) scaleX(1)`;
    } else {
      this.sheetEl.style.transform = `translate3d(${(-offX + visualW)}px, ${-offY}px, 0) scaleX(-1)`;
    }

    if (this.loaded) {
      const bgX = -Math.round(this.frameCurrent * this.frameWidth * this.scale);
      this.sheetEl.style.backgroundPosition = `${bgX}px 0px`;
    }
  }

  update({ freeze = false } = {}, dt = 1000 / 60) {
    this.draw();
    if (!this.dead && !freeze) this.animateFrame(dt);

    const ox = this.attackBox.offset.x;
    const w = this.attackBox.width;

    if (this.facing === 1) {
      this.attackBox.position.x = this.position.x + ox;
    } else {
      this.attackBox.position.x = this.position.x + (this.width - ox - w);
    }
    this.attackBox.position.y = this.position.y + this.attackBox.offset.y;

    if (!freeze) {
      this.position.x += this.velocity.x;
      this.position.y += this.velocity.y;

      const STAGE_LEFT = 50;
      const STAGE_RIGHT = 1024 - this.width - 50;
      if (this.position.x < STAGE_LEFT) this.position.x = STAGE_LEFT;
      if (this.position.x > STAGE_RIGHT) this.position.x = STAGE_RIGHT;

      if (this.position.y + this.height + this.velocity.y >= 576 - 96) {
        this.velocity.y = 0;
        this.position.y = 330;
      } else {
        this.velocity.y += gravity;
      }

      this.velocity.x *= 0.9;
      if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
    }

    if (this.attackEl) this.attackEl.classList.remove("active");
  }

  switchSprite(sprite) {
    // death priority
    if (this.sprites?.death && this.image === this.sprites.death.image) {
      if (this.frameCurrent === this.sprites.death.framesMax - 1) this.dead = true;
      return;
    }

    if (sprite === "death") {
      const s = this.sprites.death;
      if (!s) return;
      this._applySprite(s);
      return;
    }

    // takeHit uninterruptible (except death)
    if (
      this.image === this.sprites?.takeHit?.image &&
      this.frameCurrent < this.sprites.takeHit.framesMax - 1
    ) {
      return;
    }

    // attack can be interrupted by takeHit
    if (
      this.image === this.sprites?.attack1?.image &&
      this.frameCurrent < this.sprites.attack1.framesMax - 1
    ) {
      if (sprite !== "takeHit") return;
    }

    const s = this.sprites?.[sprite];
    if (!s) return;
    if (this.image === s.image) return;

    this._applySprite(s);
  }

  _applySprite(s) {
    this.image = s.image;
    this.framesMax = s.framesMax;
    this.frameCurrent = 0;

    // ✅ per-sprite anim speed
    this.animFps = typeof s.animFps === "number" ? s.animFps : 12;

    // ✅ reset timer on sprite switch
    this._frameTimer = 0;

    this.sheetEl.style.backgroundImage = `url("${s.imageSrc}")`;

    const applySizing = () => {
      const frameW = s.image.width / s.framesMax;
      const frameH = s.image.height;

      this.frameWidth = frameW;
      this.frameHeight = frameH;

      this.sheetEl.style.width = `${frameW * this.scale}px`;
      this.sheetEl.style.height = `${frameH * this.scale}px`;
      this.sheetEl.style.backgroundSize = `${s.image.width * this.scale}px ${s.image.height * this.scale}px`;
    };

    if (s.image.complete) applySizing();
    else s.image.onload = applySizing;
  }
}
