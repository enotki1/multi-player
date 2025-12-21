const roomIdEl = document.getElementById("roomId");
const nameEl = document.getElementById("name");
const errEl = document.getElementById("err");
const joinBtn = document.getElementById("joinBtn");

function showErr(msg) {
  errEl.textContent = msg || "";
}

joinBtn.addEventListener("click", () => {
  showErr("");

  const roomId = roomIdEl.value.trim();
  const name = nameEl.value.trim();

  if (!roomId) return showErr("Room ID is required.");
  if (!name) return showErr("Name is required.");

  // сохраняем имя для game.html
  sessionStorage.setItem("playerName", name);

  // просто переходим в комнату — подключение делает net.js
  location.href = `/game.html?room=${encodeURIComponent(roomId)}`;
});

