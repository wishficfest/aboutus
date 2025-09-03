/* =========================================================
   Motivation Wall — TEST (no backend)
   - LocalStorage only
   - Rotating colors: navy → pink → green
   - Search, client-side moderation, lazy render
   - Per-note delete, Reset all, Secret notes (??)
   - Export PNG
========================================================= */

const LS_KEY = "wish_test_wall_v1";
const LS_COLOR_INDEX = "wish_test_wall_color_idx";

const COLORS = ["navy", "pink", "green"]; // fixed order wanted
const board = document.getElementById("board");
const form = document.getElementById("form");
const aliasEl = document.getElementById("alias");
const messageEl = document.getElementById("message");
const resetBtn = document.getElementById("btnReset");
const searchEl = document.getElementById("q");
const noteCountEl = document.getElementById("noteCount");
const btnExport = document.getElementById("btnExport");

let ALL = loadLS();     // [{id, alias, message, color, created_at}]
let FILTERED = [];

/* ---------- Utils ---------- */
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()) }
function saveLS(){ localStorage.setItem(LS_KEY, JSON.stringify(ALL)) }
function loadLS(){ try{ return JSON.parse(localStorage.getItem(LS_KEY) || "[]") }catch{ return [] } }
function getColor(){
  const i = Number(localStorage.getItem(LS_COLOR_INDEX) || "0");
  const color = COLORS[i % COLORS.length];
  localStorage.setItem(LS_COLOR_INDEX, String((i+1)%COLORS.length));
  return color;
}
function escapeHTML(s){
  return (s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function tip(msg){ window.alert(msg) }

/* ---------- Moderation (very light) ---------- */
const BANNED = ["anjing","bangsat","kontol","goblok","babi","fuck","bitch","cunt"];
function modCheck(msg){
  const m = (msg||"").toLowerCase();
  if (!m.trim()) return [false, "Pesan kosong."];
  if (m.length > 220) return [false, "Maks 220 karakter ya."];
  if (/(https?:\/\/|www\.)/i.test(m)) return [false, "Link tidak diperbolehkan di preview test."];
  if (BANNED.some(w => m.includes(w))) return [false, "Bahasa kurang sopan 🙏"];
  if (/(.)\1{6,}/.test(m)) return [false, "Pesan terlalu repetitif."];
  return [true, ""];
}

/* ---------- Create / Delete ---------- */
form.addEventListener("submit", (e)=>{
  e.preventDefault();
  const alias = (aliasEl.value || "anon").trim().slice(0,24);
  const message = (messageEl.value || "").trim();
  const [ok, why] = modCheck(message);
  if (!ok) { tip(why); return; }

  const item = {
    id: uid(),
    alias,
    message,
    color: getColor(),
    created_at: new Date().toISOString()
  };
  ALL.unshift(item);
  saveLS();
  messageEl.value = "";
  renderFiltered();
});

resetBtn.addEventListener("click", ()=>{
  if (!confirm("Hapus semua catatan di device ini?")) return;
  ALL = [];
  saveLS();
  renderFiltered();
});

function deleteById(id){
  ALL = ALL.filter(n => n.id !== id);
  saveLS();
  renderFiltered();
}

/* ---------- Search / Filter ---------- */
searchEl.addEventListener("input", ()=>{
  clearTimeout(searchEl._t);
  searchEl._t = setTimeout(renderFiltered, 120);
});

function renderFiltered(){
  const q = (searchEl.value || "").toLowerCase().trim();
  FILTERED = !q ? ALL.slice() :
    ALL.filter(n => (n.message && n.message.toLowerCase().includes(q))
                 || (n.alias && n.alias.toLowerCase().includes(q)));
  renderLazy(FILTERED);
  noteCountEl.textContent = FILTERED.length;
}

/* ---------- Note Element ---------- */
function makeNoteEl(note){
  const div = document.createElement("div");
  div.className = `note ${note.color}`;
  // tiny tilt for personality
  const tilt = (Math.random()*2 - 1).toFixed(2);
  div.style.setProperty("--tilt", `${tilt}deg`);

  // Secret: starts with ??
  let text = note.message || "";
  const isSecret = text.startsWith("??");
  if (isSecret) text = text.slice(2).trim();
  if (isSecret) div.classList.add("secret");

  div.innerHTML = `
    <button class="x" title="Delete">✕</button>
    ${isSecret ? `<button class="reveal" type="button">reveal</button>` : ""}
    <div class="content">
      ${escapeHTML(text)}<small>— ${escapeHTML(note.alias||"anon")}</small>
    </div>
  `;

  div.querySelector(".x").addEventListener("click", ()=> deleteById(note.id));
  if (isSecret){
    div.querySelector(".reveal").addEventListener("click", ()=> div.classList.add("revealed"));
  }

  return div;
}

/* ---------- Lazy renderer ---------- */
function renderLazy(list){
  board.innerHTML = "";
  const CHUNK = 24;
  let i = 0;
  function step(){
    const end = Math.min(i + CHUNK, list.length);
    for (; i < end; i++){
      board.appendChild(makeNoteEl(list[i]));
    }
    if (i < list.length) requestAnimationFrame(step);
  }
  step();
}

/* ---------- Export PNG ---------- */
btnExport.addEventListener("click", async ()=>{
  btnExport.disabled = true;
  btnExport.textContent = "Rendering…";
  try{
    const canvas = await html2canvas(board, {backgroundColor:"#ffffff", scale:2});
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `wishfic-notes-${new Date().toISOString().slice(0,10)}.png`;
    a.click();
  }finally{
    btnExport.disabled = false;
    btnExport.textContent = "📸 Export PNG";
  }
});

/* ---------- Init ---------- */
renderFiltered();
