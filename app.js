function createRoom() {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  document.getElementById("status").innerText = "Raum erstellt: " + roomCode;
}

function joinRoom() {
  const code = document.getElementById("roomInput").value.trim();

  if (!code) {
    document.getElementById("status").innerText = "Bitte Raumcode eingeben";
    return;
  }

  document.getElementById("status").innerText = "Du bist im Raum: " + code;
}
