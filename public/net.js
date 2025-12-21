(() => {
  const socket = io();
  const qs = new URLSearchParams(location.search);
  const roomId = qs.get("room");

  if (!roomId) {
    location.href = "/";
    return;
  }

  function getOrAskName() {
    let name = sessionStorage.getItem("playerName");
    if (name && name.trim()) return name.trim();

    name = prompt("Enter your name (unique in room):", "");
    name = (name || "").trim();
    if (!name) name = `Player_${Math.floor(Math.random() * 9999)}`;
    sessionStorage.setItem("playerName", name);
    return name;
  }

  const name = getOrAskName();

  window.NET = {
    socket,
    roomId,
    myId: null,
    sendInput(input) {
      socket.emit("input", { roomId, input });
    }
  };

  socket.on("connect", () => {
    window.NET.myId = socket.id;
    socket.emit("join-room", { roomId, name });
  });

  socket.on("join-error", (msg) => {
    alert(msg);
    sessionStorage.removeItem("playerName");
    location.href = "/";
  });

  socket.on("room-state", (room) => {
    window.dispatchEvent(new CustomEvent("room-state", { detail: room }));
  });

  socket.on("state", (room) => {
    window.dispatchEvent(new CustomEvent("net-state", { detail: room }));
  });

  socket.on("timer", ({ timer }) => {
    window.dispatchEvent(new CustomEvent("net-timer", { detail: timer }));
  });

  socket.on("game-over", ({ winnerText }) => {
    window.dispatchEvent(new CustomEvent("net-gameover", { detail: winnerText }));
  });

  socket.on("hit", (payload) => {
    window.dispatchEvent(new CustomEvent("net-hit", { detail: payload }));
  });
})();




