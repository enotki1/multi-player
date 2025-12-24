const roomIdEl = document.getElementById("roomId");
const nameEl = document.getElementById("name");
const errEl = document.getElementById("err");
const joinBtn = document.getElementById("joinBtn");

/**
 * Show an error message in the error element.
 */
function showErr(msg) {
  errEl.textContent = msg || "";
}

/**
 * Try to join the room with current input values.
 */
function handleJoin() {
  showErr("");

  const roomId = roomIdEl.value.trim();
  const name = nameEl.value.trim();

  if (!roomId) {
    showErr("Room ID is required.");
    return;
  }

  if (!name) {
    showErr("Name is required.");
    return;
  }

  // Save player name for game.html
  sessionStorage.setItem("playerName", name);

  // Redirect to the game room; actual connection is handled in net.js
  location.href = `/game.html?room=${encodeURIComponent(roomId)}`;
}

joinBtn.addEventListener("click", handleJoin);

// Allow pressing Enter inside inputs to join
[roomIdEl, nameEl].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleJoin();
    }
  });
});
