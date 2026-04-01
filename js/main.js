// main.js

import { setStatus } from "./utils.js";
import { client } from "./supabase.js";
import * as state from "./state.js";

// =============================
// REALTIME CHANNELS
// =============================

let participantChannel = null;
let chatChannel = null;
let storageChannel = null;
let screenChannel = null; // 🔥 NEU

// =============================
// SCREEN STATE
// =============================

let screenSlots = [
  { owner: null, stream: null },
  { owner: null, stream: null },
  { owner: null, stream: null },
  { owner: null, stream: null }
];

let localScreens = {};

// =============================
// BASIS FUNKTIONEN
// =============================

function getName() {
  const input = document.getElementById("nameInput");
  return input ? input.value.trim() : "";
}

function getRoom() {
  const input = document.getElementById("roomInput");
  return input ? input.value.trim().toUpperCase() : "";
}

// =============================
// 🔥 STORAGE UPLOAD CORE
// =============================

async function uploadToStorage(file, type) {
  if (!state.currentRoom) throw new Error("Kein Raum aktiv");

  const fileName =
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 8) +
    "_" +
    file.name;

  const path = `${state.currentRoom}/${type}/${fileName}`;

  const { error } = await client.storage
    .from("faceproject-files")
    .upload(path, file);

  if (error) throw error;

  const { data } = client.storage
    .from("faceproject-files")
    .getPublicUrl(path);

  return {
    path,
    url: data.publicUrl
  };
}

// =============================
// RAUM ERSTELLEN
// =============================

async function createRoom() {
  const name = getName();
  if (!name) {
    setStatus("Bitte Namen eingeben");
    return;
  }

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await client.from("rooms").insert([
    {
      code,
      owner_name: name
    }
  ]);

  if (error) {
    setStatus(error.message);
    return;
  }

  document.getElementById("roomInput").value = code;

  setStatus("Raum erstellt: " + code);

  await joinRoom();
}

// =============================
// RAUM BEITRETEN
// =============================

async function joinRoom() {
  const name = getName();
  const code = getRoom();

  if (!name) {
    setStatus("Bitte Namen eingeben");
    return;
  }

  if (!code) {
    setStatus("Bitte Raumcode eingeben");
    return;
  }

  const { data, error } = await client
    .from("rooms")
    .select("*")
    .eq("code", code)
    .limit(1);

  if (error || !data.length) {
    setStatus("Raum nicht gefunden");
    return;
  }

  state.currentRoom = code;
  state.currentParticipantName = name;
  state.currentRoomOwner = data[0].owner_name;

  await client.from("participants").insert([
    {
      room_code: code,
      name: name,
      status: "online"
    }
  ]);

  setStatus("Verbunden mit: " + code);

  loadParticipants();
  loadChat();
  loadStorageItems();
  loadScreens(); // 🔥 NEU

  subscribeParticipantsRealtime();
  subscribeChatRealtime();
  subscribeStorageRealtime();
  subscribeScreenRealtime(); // 🔥 NEU
}

// =============================
// 🔥 SCREEN REALTIME
// =============================

function subscribeScreenRealtime() {
  if (!state.currentRoom) return;

  if (screenChannel) {
    client.removeChannel(screenChannel);
  }

  screenChannel = client
    .channel("screen-" + state.currentRoom)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "screen_share",
        filter: "room_code=eq." + state.currentRoom
      },
      () => {
        loadScreens();
      }
    )
    .subscribe();
}

// =============================
// SCREEN LOGIK
// =============================

async function loadScreens() {
  if (!state.currentRoom) return;

  const { data } = await client
    .from("screen_share")
    .select("*")
    .eq("room_code", state.currentRoom)
    .eq("active", true);

  screenSlots = [
    { owner: null, stream: null },
    { owner: null, stream: null },
    { owner: null, stream: null },
    { owner: null, stream: null }
  ];

  (data || []).forEach(s => {
    screenSlots[s.slot_index] = {
      owner: s.owner,
      stream: localScreens[s.slot_index]?.stream || null
    };
  });

  renderScreens();
}

async function startScreenShare(slotIndex) {
  if (localScreens[slotIndex]) {
    setStatus("Dieser Screen läuft bereits");
    return;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  localScreens[slotIndex] = { stream };

  await client.from("screen_share").insert([{
    room_code: state.currentRoom,
    owner: state.currentParticipantName,
    slot_index: slotIndex,
    active: true
  }]);

  stream.getTracks()[0].onended = () => {
    stopScreenShare(slotIndex);
  };

  setStatus("Screen " + (slotIndex + 1) + " gestartet");
}

async function stopScreenShare(slotIndex) {
  if (localScreens[slotIndex]?.stream) {
    localScreens[slotIndex].stream.getTracks().forEach(t => t.stop());
    delete localScreens[slotIndex];
  }

  await client
    .from("screen_share")
    .delete()
    .eq("room_code", state.currentRoom)
    .eq("owner", state.currentParticipantName)
    .eq("slot_index", slotIndex);

  setStatus("Screen " + (slotIndex + 1) + " beendet");
}

async function toggleScreenShare() {
  const input = prompt("Screen wählen (1-4)", "1");
  if (!input) return;

  const slot = parseInt(input) - 1;

  if (slot < 0 || slot > 3) {
    setStatus("1 bis 4 eingeben");
    return;
  }

  if (localScreens[slot]) {
    await stopScreenShare(slot);
  } else {
    await startScreenShare(slot);
  }
}

function renderScreens() {
  const boxes = [
    document.getElementById("primaryScreen"),
    document.getElementById("screenThumb1"),
    document.getElementById("screenThumb2"),
    document.getElementById("screenThumb3")
  ];

  boxes.forEach((box, i) => {
    if (!box) return;

    const body = box.querySelector(".screen-slot-body");
    if (!body) return;

    body.innerHTML = "";

    const slot = screenSlots[i];

    if (slot.stream) {
      const video = document.createElement("video");
      video.srcObject = slot.stream;
      video.autoplay = true;
      video.muted = true;
      video.style.width = "100%";
      video.style.height = "100%";

      body.appendChild(video);
    } else {
      body.innerHTML = "<p>Keine Freigabe aktiv</p>";
    }
  });
}

// =============================
// BUTTON VERBINDEN
// =============================

document.getElementById("shareScreenBtn")?.addEventListener("click", async () => {
  await toggleScreenShare();
});

// =============================
// REST BLEIBT UNVERÄNDERT
// =============================

document.addEventListener("DOMContentLoaded", () => {
  setStatus("TableProject bereit");
});
