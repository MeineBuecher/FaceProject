const SUPABASE_URL = "DEINE_SUPABASE_URL";
const SUPABASE_KEY = "DEIN_ANON_KEY";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Raum erstellen
async function createRoom() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { error } = await client
    .from("rooms")
    .insert([{ code: code }]);

  if (error) {
    document.getElementById("status").innerText = "Fehler: " + error.message;
    return;
  }

  document.getElementById("status").innerText = "Raum erstellt: " + code;
}

// Raum beitreten
async function joinRoom() {
  const code = document.getElementById("roomInput").value.trim();

  if (!code) {
    document.getElementById("status").innerText = "Bitte Code eingeben";
    return;
  }

  const { data, error } = await client
    .from("rooms")
    .select("*")
    .eq("code", code);

  if (error || !data || data.length === 0) {
    document.getElementById("status").innerText = "Raum nicht gefunden";
    return;
  }

  document.getElementById("status").innerText = "Verbunden mit: " + code;
}
