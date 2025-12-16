function rectangularCollision({ rectangle1, rectangle2 }) {
  return (
    rectangle1.attackBox.position.x + rectangle1.attackBox.width >= rectangle2.position.x &&
    rectangle1.attackBox.position.x <= rectangle2.position.x + rectangle2.width &&
    rectangle1.attackBox.position.y + rectangle1.attackBox.height >= rectangle2.position.y &&
    rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
  );
}

function determineWinner({ player, enemy, timerId }) {
  clearTimeout(timerId);
  const el = document.getElementById('displayText');
  el.style.display = 'flex';

  if (player.health === enemy.health) el.textContent = 'Tie';
  else if (player.health > enemy.health) el.textContent = 'Player one wins';
  else el.textContent = 'Player two wins';
}

let timer = 60;
let timerId;

function decreasTimer() {
  if (timer > 0) {
    timerId = setTimeout(decreasTimer, 1000);
    timer--;
    document.getElementById('timer').textContent = timer;
  }
  if (timer === 0) determineWinner({ player, enemy, timerId });
}


