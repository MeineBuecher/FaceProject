const SUPABASE_URL = "https://zcpdiudjhzgyqgcsawjc.supabase.co";
const SUPABASE_KEY = "sb_publishable_PYWvX53ZCnSqCDL5iGjDgQ_VD-KN85H";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentRoom = null;
let currentChannel = null;
const deviceName = "Gerät-" + Math.floor(Math.random() * 1000);

// Raum erstellen
async function createRoom() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await client.from("rooms").insert([{ code }]);

  if (error) {
    document.getElementById("status").innerText =
      "Fehler beim Erstellen: " + error.message;
    return;
  }

  document.getElementById("roomInput").value = code;
  await joinRoom();
}

// Raum beitreten
async function joinRoom() {
  const code = document.getElementById("roomInput").value.trim();

  if (!code) {
    document.getElementById("status").innerText = "Bitte Raumcode eingeben";
    return;
  }

  const { data, error } = await client
    .from("rooms")
    .select("*")
    .eq("code", code);

  if (error) {
    document.getElementById("status").innerText = "Fehler: " + error.message;
    return;
  }

  if (!data || data.length === 0) {
    document.getElementById("status").innerText = "Raum nicht gefunden";
    return;
  }

  currentRoom = code;

  const { error: insertError } = await client.from("participants").insert([
    {
      room_code: code,
      name: deviceName
    }
  ]);

  if (insertError) {
    document.getElementById("status").innerText =
      "Teilnehmer-Fehler: " + insertError.message;
    return;
  }

  document.getElementById("status").innerText =
    "Verbunden mit: " + code + " als " + deviceName;

  await loadParticipants();
  subscribeRealtime();
}

// Teilnehmer laden
async function loadParticipants() {
  if (!currentRoom) return;

  const { data, error } = await client
    .from("participants")
    .select("*")
    .eq("room_code", currentRoom)
    .order("created_at", { ascending: true });

  if (error) {
    document.getElementById("participantsBox").innerHTML =
      "<p>Fehler beim Laden der Teilnehmer</p>";
    return;
  }

  renderParticipants(data || []);
}

// Teilnehmer anzeigen
function renderParticipants(list) {
  const box = document.getElementById("participantsBox");

  if (!list.length) {
    box.innerHTML = "<h3>Im Raum:</h3><p>Noch keine Teilnehmer</p>";
    return;
  }

  let html = "<h3>Im Raum:</h3>";
  list.forEach((p) => {
    html += `<div>${p.name}</div>`;
  });

  box.innerHTML = html;
}

// Live Updates abonnieren
function subscribeRealtime() {
  if (!currentRoom) return;

  if (currentChannel) {
    client.removeChannel(currentChannel);
  }

  currentChannel = client
    .channel("room-" + currentRoom)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "participants",
        filter: "room_code=eq." + currentRoom
      },
      () => {
        loadParticipants();
      }
    )
    .subscribe();
}
