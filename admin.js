/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-KEY-HERE"; // ganti dengan key bener
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const toast=(msg)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2000);};

/************ ROUTER ************/
$('#nav')?.addEventListener('click',(e)=>{
  const el=e.target.closest('[data-view]');if(!el)return;
  const v=el.dataset.view;setActive(v);(VIEWS[v]||VIEWS.overview)();
});
function setActive(v){$$('#nav .nav-btn').forEach(x=>x.classList.remove('ring-2'));$(`#nav [data-view="${v}"]`)?.classList.add('ring-2');}

/************ VIEWS ************/
const VIEWS={
  async overview(){/* isi Overview */},
  async prompts(){/* isi Prompts */},
  async claims(){/* isi Claims */},
  async authors(){/* isi Authors */},
  async announcements(){/* isi Ann */},
  async timeline(){/* isi Timeline */},
  async design(){/* isi Design */}
};
setActive('overview');VIEWS.overview();

/************ NOTES ************/
const MODS=['Nio','Sha','Naya','Cinta'];
function statusBadge(s){
  const map={available:'#C7F9CC',away:'#FFE3B3',slow:'#FFD6E7'};
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${map[s]||'#eee'}">${s}</span>`;
}
function renderNotes(){
  $('#notes').innerHTML=`
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <p class="text-xs mb-2">Update mood & status per hari. Ada history di bawah.</p>
    <label class="text-xs">Tanggal update</label>
    <input id="modDate" type="date" class="rounded-xl border p-2 bg-white w-full mb-2"/>
    ${MODS.map(m=>`
      <div class="note-row">
        <div class="note-row__label">${m}</div>
        <input id="${m.toLowerCase()}Mood" class="rounded-xl border p-2 bg-white grow" placeholder="(＾▽＾) / 😀 / …">
        <select id="${m.toLowerCase()}Status" class="rounded-xl border p-2 bg-white">
          <option value="available">available</option><option value="away">away</option><option value="slow">slow</option>
        </select>
      </div>`).join('')}
    <div class="flex items-center gap-2 mt-2">
      <input id="modNote" class="rounded-xl border p-2 bg-white w-full" placeholder="Catatan singkat (opsional)…"/>
      <select id="noteFor" class="rounded-xl border p-2 bg-white">
        <option value="">note for…</option>${MODS.map(m=>`<option value="${m}">${m}</option>`).join('')}
      </select>
    </div>
    <button id="modSave" class="w-full mt-2 px-3 py-2 rounded-xl bg-black text-white">Save</button>
    <div class="mt-3 text-sm">
      <div class="font-medium mb-1">Recent</div>
      <div id="modRecent" class="space-y-1"></div>
    </div>`;
  $('#modDate').value=new Date().toISOString().slice(0,10);
  $('#modSave').onclick=saveNotes;loadRecent();
}
renderNotes();

async function saveNotes(){
  const on_date=$('#modDate').value;
  const note=$('#modNote').value.trim();const target=$('#noteFor').value;
  const rows=MODS.map(m=>({mod:m,on_date,mood:$(`#${m.toLowerCase()}Mood`).value||'',status:$(`#${m.toLowerCase()}Status`).value||'available',note:(target&&target===m)?note:''}));
  const {error}=await sb.from('mod_notes').upsert(rows,{onConflict:'mod,on_date'});
  if(error){console.error(error);toast('❌ Gagal simpan');return;}
  $('#modNote').value='';$('#noteFor').value='';toast('✅ Saved');loadRecent();
}
async function loadRecent(){
  const {data=[],error}=await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  if(error){console.error(error);return;}
  $('#modRecent').innerHTML=data.length?data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${x.mod}</b> — ${x.mood||''} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>${x.note?' · '+x.note:''}
    </div>`).join(''):'<div class="opacity-60">No notes yet.</div>';
}
