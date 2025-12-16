class Sprite {
  constructor({ position, imageSrc, scale = 1, framesMax = 1, offset = { x: 0, y: 0 }, el }) {
    this.position = position;
    this.scale = scale;
    this.framesMax = framesMax;
    this.frameCurrent = 0;
    this.framesElapsed = 0;
    this.framesHold = 15;
    this.offset = offset;

    this.image = new Image();
    this.image.src = imageSrc;

    this.el = el;

    this.sheetEl = document.createElement('div');
    this.sheetEl.style.position = 'absolute';
    this.sheetEl.style.left = '0';
    this.sheetEl.style.top = '0';
    this.sheetEl.style.backgroundRepeat = 'no-repeat';
    this.sheetEl.style.transformOrigin = 'top left';
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
      this.sheetEl.style.backgroundSize =
        `${this.image.width * this.scale}px ${this.image.height * this.scale}px`;
    };
  }

  draw() {
    // wrapper position
    this.el.style.transform = `translate(${this.position.x}px, ${this.position.y}px)`;

    // current frame
    if (this.loaded) {
      const bgX = -(this.frameCurrent * this.frameWidth * this.scale);
      this.sheetEl.style.backgroundPosition = `${bgX}px 0px`;
    }
  }

  animateFrame() {
    this.framesElapsed++;
    if (this.framesElapsed % this.framesHold === 0) {
      if (this.frameCurrent < this.framesMax - 1) this.frameCurrent++;
      else this.frameCurrent = 0;
    }
  }

  update({ freeze = false } = {}) {
    this.draw();
    if (!freeze) this.animateFrame();
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
    baseFlip = 1
  }) {
    super({ position, imageSrc, scale, framesMax, offset, el });

    this.velocity = velocity;

    
    this.width = 50;
    this.height = 150;

    this.lastKey = undefined;

    this.attackBox = {
      position: { x: this.position.x, y: this.position.y },
      offset: attackBox.offset,
      width: attackBox.width,
      height: attackBox.height
    };

    this.attackEl = attackEl;

    this.isAttacking = false;
    this.isBlocking = false;

    this.health = 100;
    this.dead = false;

    
    this.facing = 1;
    this.baseFlip = baseFlip;
    this.sprites = sprites || {};
    for (const sprite in this.sprites) {
      this.sprites[sprite].image = new Image();
      this.sprites[sprite].image.src = this.sprites[sprite].imageSrc;
    }
  }

  setFacing(dir) {
    this.facing = dir === -1 ? -1 : 1;
  }

  setBlocking(v) {
    this.isBlocking = v;
    if (this.isBlocking) this.el.classList.add('blocking');
    else this.el.classList.remove('blocking');
  }

  draw() {
 
  const px = Math.round(this.position.x);
  const py = Math.round(this.position.y);
  this.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;

  
  const offX = Math.round(this.offset.x);
  const offY = Math.round(this.offset.y);

  const visualW = Math.round(((this.frameWidth || 0) * this.scale));

  
  const dir = (this.facing || 1) * (this.baseFlip || 1);

  if (dir === 1) {
    this.sheetEl.style.transform =
      `translate3d(${-offX}px, ${-offY}px, 0) scaleX(1)`;
  } else {
    this.sheetEl.style.transform =
      `translate3d(${(-offX + visualW)}px, ${-offY}px, 0) scaleX(-1)`;
  }

  if (this.loaded) {
    const bgX = -Math.round(this.frameCurrent * this.frameWidth * this.scale);
    this.sheetEl.style.backgroundPosition = `${bgX}px 0px`;
  }
}

  update({ freeze = false } = {}) {
    this.draw();
    if (!this.dead && !freeze) this.animateFrame();

    
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

      // ---- LIMITS ----
      const STAGE_LEFT = 50;
      const STAGE_RIGHT = 1024 - this.width - 50;
      if (this.position.x < STAGE_LEFT) this.position.x = STAGE_LEFT;
      if (this.position.x > STAGE_RIGHT) this.position.x = STAGE_RIGHT;

      // gravity / floor
      if (this.position.y + this.height + this.velocity.y >= 576 - 96) {
        this.velocity.y = 0;
        this.position.y = 330;
      } else {
        this.velocity.y += gravity;
      }

      
      this.velocity.x *= 0.9;
      if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
    }

    // debug hitbox выключен
    if (this.attackEl) this.attackEl.classList.remove('active');
  }

  attack() {
    if (this.dead) return;
    if (this.isBlocking) return;
    this.switchSprite('attack1');
    this.isAttacking = true;
  }

  takeHit(damage) {
    if (this.dead) return;

    if (this.isBlocking) damage = Math.max(0, Math.floor(damage * 0.2));

    this.health -= damage;
    if (this.health < 0) this.health = 0;

    this.isAttacking = false;

    if (this.health <= 0) this.switchSprite('death');
    else this.switchSprite('takeHit');
  }

  switchSprite(sprite) {
    // death lock
    if (this.sprites?.death && this.image === this.sprites.death.image) {
      if (this.frameCurrent === this.sprites.death.framesMax - 1) this.dead = true;
      return;
    }

    // death priority + DOM update
    if (sprite === 'death') {
      const s = this.sprites.death;
      if (!s) return;

      if (this.image !== s.image) {
        this.image = s.image;
        this.framesMax = s.framesMax;
        this.frameCurrent = 0;
        this.framesElapsed = 0;

        this.sheetEl.style.backgroundImage = `url("${s.imageSrc}")`;

        const applySizing = () => {
          const frameW = s.image.width / s.framesMax;
          const frameH = s.image.height;
          this.frameWidth = frameW;
          this.frameHeight = frameH;

          this.sheetEl.style.width = `${frameW * this.scale}px`;
          this.sheetEl.style.height = `${frameH * this.scale}px`;
          this.sheetEl.style.backgroundSize =
            `${s.image.width * this.scale}px ${s.image.height * this.scale}px`;
        };

        if (s.image.complete) applySizing();
        else s.image.onload = applySizing;
      }
      return;
    }

    // attack lock
    if (this.image === this.sprites.attack1.image &&
        this.frameCurrent < this.sprites.attack1.framesMax - 1) return;

    // takeHit lock
    if (this.image === this.sprites.takeHit.image &&
        this.frameCurrent < this.sprites.takeHit.framesMax - 1) return;

    const s = this.sprites[sprite];
    if (!s) return;

    if (this.image !== s.image) {
      this.image = s.image;
      this.framesMax = s.framesMax;
      this.frameCurrent = 0;
      this.framesElapsed = 0;

      this.sheetEl.style.backgroundImage = `url("${s.imageSrc}")`;

      const applySizing = () => {
        const frameW = s.image.width / s.framesMax;
        const frameH = s.image.height;

        this.frameWidth = frameW;
        this.frameHeight = frameH;

        this.sheetEl.style.width = `${frameW * this.scale}px`;
        this.sheetEl.style.height = `${frameH * this.scale}px`;
        this.sheetEl.style.backgroundSize =
          `${s.image.width * this.scale}px ${s.image.height * this.scale}px`;
      };

      if (s.image.complete) applySizing();
      else s.image.onload = applySizing;
    }
  }
}




