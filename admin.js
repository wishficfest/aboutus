/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const toast=(m)=>{const t=$('#toast');t.textContent=m;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),1700);};

/************ NAV ************/
$('#nav')?.addEventListener('click',e=>{
  const el=e.target.closest('[data-view]'); if(!el) return;
  const v=el.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});
function setActive(v){ $$('#nav .nav-btn').forEach(b=>b.classList.remove('ring-2')); $(`#nav [data-view="${v}"]`)?.classList.add('ring-2'); }

/************ VIEWS (placeholder dulu) ************/
const VIEWS={
  async overview(){
    $('#view').innerHTML=`
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2 text-sm">
            <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAny" class="btn-lite">Import</button>
          </div>
        </div>
        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="text-sm">Total Prompts</div><div id="k1" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Available Prompts</div><div id="k2" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Active Claims</div><div id="k3" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Authors</div><div id="k4" class="text-2xl font-bold">—</div></div>
        </div>
      </section>`;
    $('#btnImportAny').onclick = handleImportAny;
    const {data:s}=await sb.from('v_stats').select('*').maybeSingle();
    $('#k1').textContent=s?.prompts_total??0; $('#k2').textContent=s?.prompts_available??0;
    $('#k3').textContent=s?.claims_active??0; $('#k4').textContent=s?.authors_total??0;
  },
  async prompts(){ $('#view').innerHTML=`<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">💡 Prompts</h2><p class="text-sm mt-1">List prompt akan tampil di sini.</p></section>`; },
  async claims(){ $('#view').innerHTML=`<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">✍️ Claims</h2><p class="text-sm mt-1">List klaim akan tampil di sini.</p></section>`; },
  async authors(){ $('#view').innerHTML=`<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">👩‍💻 Authors</h2><p class="text-sm mt-1">List author akan tampil di sini.</p></section>`; },
  async announcements(){ $('#view').innerHTML=`<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">📢 Announcements</h2><p class="text-sm mt-1">Kelola pengumuman.</p></section>`; },
  async timeline(){ $('#view').innerHTML=`<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">🗓️ Timeline</h2><p class="text-sm mt-1">Countdown pakai kolom <code>start_date</code>.</p></section>`; },
  async design(){ $('#view').innerHTML=`<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">🎨 Design</h2><p class="text-sm mt-1">Board design di sini.</p></section>`; },
};
setActive('overview'); VIEWS.overview();

/************ NOTES (selalu aktif) ************/
const MODS=['Nio','Sha','Naya','Cinta'];
function statusBadge(s){const m={available:'#C7F9CC',away:'#FFE3B3',slow:'#FFD6E7'};return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${m[s]||'#eee'}">${s}</span>`;}

async function saveNotes(){
  const on_date=$('#modDate').value || new Date().toISOString().slice(0,10);
  const note=$('#modNote').value.trim(); const target=$('#noteFor').value;
  const rows=MODS.map(m=>({
    mod:m, on_date,
    mood: $(`#${m.toLowerCase()}Mood`)?.value||'',
    status:$(`#${m.toLowerCase()}Status`)?.value||'available',
    note: (target&&target===m)?note:''
  }));
  const {error}=await sb.from('mod_notes').upsert(rows,{onConflict:'mod,on_date'});
  if(error){console.error(error); toast('❌ Gagal simpan'); return;}
  $('#modNote').value=''; $('#noteFor').value=''; toast('✅ Saved'); loadRecent();
}
async function loadRecent(){
  const {data=[],error}=await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  if(error){console.error(error); return;}
  $('#modRecent').innerHTML = data.length? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${x.mod}</b> — ${x.mood||''} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>${x.note?' · '+x.note:''}
    </div>`).join('') : '<div class="opacity-60">No notes yet.</div>';
}
// init Notes
$('#modDate').value = new Date().toISOString().slice(0,10);
$('#modSave').addEventListener('click', saveNotes);
loadRecent();

/************ IMPORT XLSX (Overview tombol) ************/
async function handleImportAny(){
  const f=$('#fileAny')?.files?.[0]; if(!f){toast('Pilih file .xlsx dulu');return;}
  try{
    const buf=await f.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'});
    // Prompts sheet (heuristik nama)
    for(const name of wb.SheetNames){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''});
      if(!rows.length) continue;
      const H=rows[0].map(x=>String(x).trim().toLowerCase());
      // PROMPTS
      const iprompt = ['prompt','prompt_text','description'].map(k=>H.indexOf(k)).find(i=>i>-1);
      const istatus = ['status','status_prompt'].map(k=>H.indexOf(k)).find(i=>i>-1);
      if(iprompt>-1){
        const pairing = ['pairing'].map(k=>H.indexOf(k)).find(i=>i>-1);
        const tags = ['additonal_tags','tags'].map(k=>H.indexOf(k)).find(i=>i>-1);
        const prompter = ['prompter_name','name','prompter'].map(k=>H.indexOf(k)).find(i=>i>-1);
        const ao3 = ['prompter_ao3/twitter','prompter_ao3','twitter','ao3'].map(k=>H.indexOf(k)).find(i=>i>-1);
        const data = rows.slice(1).filter(r=>(r[iprompt]||'').toString().trim()!=='').map(r=>({
          text:r[iprompt], status:(r[istatus]||'available').toString().toLowerCase(),
          pairing: pairing>-1? r[pairing] : null,
          tags: tags>-1? String(r[tags]).split(/[,;]\s*/).filter(Boolean): [],
          prompter_name: prompter>-1? r[prompter] : null,
          prompter_ao3: ao3>-1? r[ao3] : null
        }));
        if(data.length){ await sb.from('prompts').insert(data); }
        toast(`✅ Import Prompts: ${data.length}`);
        continue;
      }
      // CLAIMS
      const iauthor = ['author','author_name','claimed_by'].map(k=>H.indexOf(k)).find(i=>i>-1);
      const istatusC = ['status_works','status'].map(k=>H.indexOf(k)).find(i=>i>-1);
      if(iauthor>-1){
        const pairingC=H.indexOf('pairing'); const email=H.indexOf('author_email'); const tw=H.indexOf('author_twitter'); const link=H.indexOf('ao3 link');
        const notes=H.indexOf('notes');
        const data=rows.slice(1).filter(r=>(r[iauthor]||'').toString().trim()!=='').map(r=>({
          author_name:r[iauthor], status:(r[istatusC]||'pending').toString().toLowerCase(),
          pairing: pairingC>-1? r[pairingC]: null, author_email: email>-1? r[email]: null,
          author_twitter: tw>-1? r[tw]: null, ao3_link: link>-1? r[link]: null, notes: notes>-1? r[notes]: null
        }));
        if(data.length){ await sb.from('claims').insert(data); }
        toast(`✅ Import Claims: ${data.length}`);
        continue;
      }
      // AUTHORS
      const iname = ['claimed_by','name','author'].map(k=>H.indexOf(k)).find(i=>i>-1);
      if(iname>-1){
        const prog=['status_works','progress'].map(k=>H.indexOf(k)).find(i=>i>-1);
        const email=H.indexOf('author_email'); const tw=H.indexOf('author_twitter');
        const data=rows.slice(1).filter(r=>(r[iname]||'').toString().trim()!=='').map(r=>({
          name:r[iname], progress: (r[prog]||'').toString().toLowerCase(),
          email: email>-1? r[email]: null, twitter: tw>-1? r[tw]: null
        }));
        if(data.length){ await sb.from('authors').insert(data); }
        toast(`✅ Import Authors: ${data.length}`);
        continue;
      }
    }
    VIEWS.overview(); // refresh KPI
  }catch(err){ console.error(err); toast('❌ Import gagal'); }
}
