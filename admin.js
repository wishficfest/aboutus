<script type="module">
/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidq2o5qu1yYUhuZSzhXTkKBk6cyBrxY2TcHY";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

function showToast(msg){
  const t = $('#toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"),2000);
}

/************ Router ************/
$('#nav')?.addEventListener('click',(e)=>{
  const el = e.target.closest('[data-view]');
  if(!el) return;
  const v = el.dataset.view;
  setActive(v);
  (VIEWS[v]||VIEWS.overview)();
});

function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  $(`#nav [data-view="${v}"]`)?.classList.add('active');
}

/************ Notes ************/
const MODS = ["Nio","Sha","Naya","Cinta"];
const MOODS = ["૮ ˶ᵔ ᵕ ᵔ˶ ა","(´･ω･`)","(＾▽＾)","(｡T ω T｡)","¯\\_(ツ)_/¯","(╯°□°)╯︵ ┻━┻","(๑•̀ㅂ•́)و✧"];

function statusBadge(s){
  const map = { 
    "available":"bg-green-200", 
    "away":"bg-orange-200", 
    "slow":"bg-pink-200" 
  };
  return `<span class="px-2 py-0.5 rounded-full text-xs ${map[s]||'bg-gray-200'}">${s}</span>`;
}

async function loadNotes(){
  const { data, error } = await sb.from("v_mod_latest").select("*");
  if(error){ console.error(error); return; }
  let html = `<h2 class="font-semibold mb-2">📝 Notes</h2>
    <p class="text-sm mb-3">Update mood & status tiap mod (daily).</p>
    <div class="space-y-4">`;
  MODS.forEach(m=>{
    const rec = data.find(r=>r.mod_name===m);
    html += `
      <div class="p-2 rounded-lg border bg-white">
        <div class="text-sm font-semibold mb-1">${m}</div>
        <div class="space-y-2">
          <select id="mood_${m}" class="rounded-xl border p-1 w-full">
            ${MOODS.map(k=>`<option ${rec?.mood===k?'selected':''}>${k}</option>`).join('')}
          </select>
          <select id="status_${m}" class="rounded-xl border p-1 w-full">
            <option value="available" ${rec?.status==='available'?'selected':''}>available</option>
            <option value="away" ${rec?.status==='away'?'selected':''}>away</option>
            <option value="slow" ${rec?.status==='slow'?'selected':''}>slow resp</option>
          </select>
          <textarea id="note_${m}" rows="2" class="rounded-xl border p-1 w-full" placeholder="Catatan singkat…">${rec?.note||''}</textarea>
          <input type="date" id="date_${m}" class="rounded-xl border p-1 w-full" value="${rec?.on_date || new Date().toISOString().slice(0,10)}"/>
          <button class="btn btn-dark w-full" onclick="saveNote('${m}')">💾 Save ${m}</button>
        </div>
        <div class="mt-2 text-xs text-gray-600">Last update: ${rec?.on_date||'-'}</div>
      </div>`;
  });
  html += `</div>`;
  $("#notes").innerHTML = html;
}

async function saveNote(modName){
  const mood   = $(`#mood_${modName}`).value;
  const status = $(`#status_${modName}`).value;
  const note   = $(`#note_${modName}`).value;
  const on_date = $(`#date_${modName}`).value || new Date().toISOString().slice(0,10);

  const { error } = await sb.from("mod_notes").upsert([{
    mod_name: modName,
    mood,
    status,
    note,
    on_date
  }], { onConflict: "mod_name,on_date" });

  if(error){ console.error(error); showToast("❌ Gagal update note"); }
  else { showToast("✅ Note saved!"); loadNotes(); }
}

/************ File Upload (Excel → Supabase) ************/
async function handleFileUpload(e){
  const file = e.target.files[0];
  if(!file){ showToast("No file selected"); return; }

  showToast("⏳ Uploading...");

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });

    // Ambil setiap sheet & simpan ke supabase
    for(const sheetName of workbook.SheetNames){
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws);

      if(sheetName.toLowerCase().includes("prompt")){
        const {error} = await sb.from("prompts").upsert(rows,{onConflict:"prompt_id"});
        if(error) console.error("Prompts error:", error);
      }
      if(sheetName.toLowerCase().includes("claim")){
        const {error} = await sb.from("claims").upsert(rows,{onConflict:"id"});
        if(error) console.error("Claims error:", error);
      }
      if(sheetName.toLowerCase().includes("author")){
        const {error} = await sb.from("authors").upsert(rows,{onConflict:"id"});
        if(error) console.error("Authors error:", error);
      }
      if(sheetName.toLowerCase().includes("announce")){
        const {error} = await sb.from("announcements").upsert(rows,{onConflict:"id"});
        if(error) console.error("Announcements error:", error);
      }
      if(sheetName.toLowerCase().includes("timeline")){
        const {error} = await sb.from("timeline").upsert(rows,{onConflict:"phase"});
        if(error) console.error("Timeline error:", error);
      }
    }

    showToast("✅ Data Excel berhasil diupload!");
  }catch(err){
    console.error(err);
    showToast("❌ Upload gagal");
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  // default view
  setActive("overview");
  VIEWS.overview();

  loadNotes();

  // file upload listener
  const fileInput = document.getElementById("fileUpload");
  if(fileInput){
    fileInput.addEventListener("change", handleFileUpload);
  }
});
</script>
