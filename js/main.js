// main.js (CLEAN TABLEPROJECT)

import { setStatus } from "./utils.js";
import { client } from "./supabase.js";
import * as state from "./state.js";

// =============================
// REALTIME CHANNELS
// =============================

let participantChannel = null;
let chatChannel = null;
let storageChannel = null;
let screenChannel = null;

// =============================
// SCREEN SLOTS (ARBEITSPLÄTZE)
// =============================

let screenSlots = [
  { owner: null },
  { owner: null },
  { owner: null },
  { owner: null }
];

// =============================
// BASIS
// =============================

function getName() {
  return document.getElementById("nameInput")?.value.trim() || "";
}

function getRoom() {
  return document.getElementById("roomInput")?.value.trim().toUpperCase() || "";
}

// =============================
// RAUM
// =============================

async function createRoom() {
  const name = getName();
  if (!name) return setStatus("Bitte Namen eingeben");

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await client.from("rooms").insert([{ code, owner_name: name }]);
  if (error) return setStatus(error.message);

  document.getElementById("roomInput").value = code;
  setStatus("Raum erstellt: " + code);

  await joinRoom();
}

async function joinRoom() {
  const name = getName();
  const code = getRoom();

  if (!name) return setStatus("Bitte Namen eingeben");
  if (!code) return setStatus("Bitte Raumcode eingeben");

  const { data } = await client.from("rooms").select("*").eq("code", code).limit(1);
  if (!data || !data.length) return setStatus("Raum nicht gefunden");

  state.currentRoom = code;
  state.currentParticipantName = name;
  state.currentRoomOwner = data[0].owner_name;

  await client.from("participants").insert([
    { room_code: code, name, status: "online" }
  ]);

  setStatus("Verbunden mit: " + code);

  loadParticipants();
  loadChat();
  loadStorageItems();
  loadScreens();

  subscribeParticipants();
  subscribeChat();
  subscribeStorage();
  subscribeScreens();
}

// =============================
// TEILNEHMER
// =============================

async function loadParticipants() {
  const { data } = await client
    .from("participants")
    .select("*")
    .eq("room_code", state.currentRoom);

  const box = document.getElementById("participantsBox");
  if (!box) return;

  if (!data || !data.length) {
    box.innerHTML = "<p>Keine Teilnehmer</p>";
    return;
  }

  box.innerHTML =
    "<h3>Im Raum:</h3>" +
    data.map(p => `<div>${p.name}</div>`).join("");
}

function subscribeParticipants() {
  if (participantChannel) client.removeChannel(participantChannel);

  participantChannel = client
    .channel("participants-" + state.currentRoom)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "participants",
      filter: "room_code=eq." + state.currentRoom
    }, loadParticipants)
    .subscribe();
}

// =============================
// CHAT
// =============================

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  await client.from("chat_messages").insert([
    {
      room_code: state.currentRoom,
      sender_name: state.currentParticipantName,
      message: text
    }
  ]);

  input.value = "";
}

async function loadChat() {
  const { data } = await client
    .from("chat_messages")
    .select("*")
    .eq("room_code", state.currentRoom)
    .order("created_at", { ascending: true });

  const box = document.getElementById("chatMessages");

  if (!data || !data.length) {
    box.innerHTML = "<p>Noch keine Nachrichten</p>";
    return;
  }

  box.innerHTML = data
    .map(m => `<div><strong>${m.sender_name}</strong><br>${m.message}</div>`)
    .join("");

  box.scrollTop = box.scrollHeight;
}

function subscribeChat() {
  if (chatChannel) client.removeChannel(chatChannel);

  chatChannel = client
    .channel("chat-" + state.currentRoom)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: "room_code=eq." + state.currentRoom
    }, loadChat)
    .subscribe();
}

// =============================
// STORAGE
// =============================

async function loadStorageItems() {
  const { data } = await client
    .from("storage_items")
    .select("*")
    .eq("room_code", state.currentRoom);

  const files = document.getElementById("filesArea");
  const images = document.getElementById("imagesArea");
  const texts = document.getElementById("textsArea");

  files.innerHTML = "";
  images.innerHTML = "";
  texts.innerHTML = "";

  (data || []).forEach(item => {
    if (item.type === "file") {
      files.innerHTML += `<a href="${item.content}" target="_blank">${item.file_name}</a><br>`;
    }

    if (item.type === "image") {
      images.innerHTML += `<img src="${item.content}" style="width:100%;margin-bottom:10px;">`;
    }

    if (item.type === "text") {
      texts.innerHTML += `<div>${item.content}</div>`;
    }
  });
}

function subscribeStorage() {
  if (storageChannel) client.removeChannel(storageChannel);

  storageChannel = client
    .channel("storage-" + state.currentRoom)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "storage_items",
      filter: "room_code=eq." + state.currentRoom
    }, loadStorageItems)
    .subscribe();
}

// =============================
// 🔥 SCREEN = ARBEITSPLÄTZE
// =============================

async function loadScreens() {
  const { data } = await client
    .from("screen_share")
    .select("*")
    .eq("room_code", state.currentRoom);

  screenSlots = [
    { owner: null },
    { owner: null },
    { owner: null },
    { owner: null }
  ];

  (data || []).forEach(s => {
    screenSlots[s.slot_index] = { owner: s.owner };
  });

  renderScreens();
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
    const owner = screenSlots[i].owner;

    if (owner) {
      body.innerHTML = `<p><strong>${owner}</strong><br>arbeitet hier</p>`;
    } else {
      body.innerHTML = "<p>Frei</p>";
    }
  });
}

function subscribeScreens() {
  if (screenChannel) client.removeChannel(screenChannel);

  screenChannel = client
    .channel("screen-" + state.currentRoom)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "screen_share",
      filter: "room_code=eq." + state.currentRoom
    }, loadScreens)
    .subscribe();
}

// =============================
// SLOT ÜBERNEHMEN
// =============================

async function toggleScreenSlot() {
  const input = prompt("Slot wählen (1-4)", "1");
  if (!input) return;

  const slot = parseInt(input) - 1;

  const existing = await client
    .from("screen_share")
    .select("*")
    .eq("room_code", state.currentRoom)
    .eq("slot_index", slot);

  if (existing.data.length && existing.data[0].owner === state.currentParticipantName) {
    await client.from("screen_share").delete()
      .eq("room_code", state.currentRoom)
      .eq("slot_index", slot);

    setStatus("Slot freigegeben");
  } else {
    await client.from("screen_share").upsert({
      room_code: state.currentRoom,
      slot_index: slot,
      owner: state.currentParticipantName
    });

    setStatus("Slot übernommen");
  }
}

// =============================
// BUTTONS
// =============================

document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("shareScreenBtn")
    ?.addEventListener("click", toggleScreenSlot);

  setStatus("TableProject bereit");
});

// =============================
// GLOBAL
// =============================

window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.sendChatMessage = sendChatMessage;
