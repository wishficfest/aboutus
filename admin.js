// ===== CONFIG =====
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const toast = (m)=>{ const t=$('#toast'); t.textContent=m; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1800); };

// ===== Router (kecil dulu) =====
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAny" class="btn">Import</button>
          </div>
        </div>
        <p class="text-sm mt-2">Import <code>allsheets_for_website.xlsx</code> atau CSV. Hasil masuk ke <b>prompts/claims/authors</b>.</p>
      </section>
    `;
    bindGlobalImport();
  },
  async notes(){
    renderNotesBox();
  }
};
$('#nav')?.addEventListener('click', e=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  (VIEWS[el.dataset.view]||VIEWS.overview)();
});

// ===== Notes =====
const MODS = ['Nio','Sha','Naya','Cinta'];
function renderNotesBox(){
  const box = $('#notes'); if(!box) return;
  box.innerHTML = `
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <p class="text-sm mb-3">Update mood & availability per mod (harian). Simpan → history.</p>
    <div class="grid gap-2">
      ${MODS.map(m=>`
        <div class="p-2 rounded-xl" style="background:var(--peach)">
          <div class="text-sm font-medium mb-1">Mods ${m}</div>
          <div class="grid gap-2" style="grid-template-columns: 1fr 140px;">
            <select id="${m.toLowerCase()}Mood" class="rounded-xl border p-1">
              <option>(´･ω･`)</option>
              <option>(＾▽＾)</option>
              <option>(｡T ω T｡)</option>
              <option>¯\\_(ツ)_/¯</option>
              <option>(╯°□°)╯︵ ┻━┻</option>
            </select>
            <select id="${m.toLowerCase()}Status" class="rounded-xl border p-1">
              <option value="available">available</option>
              <option value="away">away</option>
              <option value="slow">slow</option>
            </select>
          </div>
        </div>
      `).join('')}
      <input id="modDate" type="date" class="rounded-xl border p-1"/>
      <textarea id="modNote" rows="2" class="rounded-xl border p-1" placeholder="Catatan singkat…"></textarea>
      <button id="modSave" class="btn btn-dark">Save</button>
    </div>
    <div class="mt-3 text-sm">
      <div class="font-medium mb-1">Recent</div>
      <div id="modRecent" class="space-y-1"></div>
    </div>
  `;
  $('#modDate').value = new Date().toISOString().slice(0,10);
  $('#modSave').onclick = saveNotes;
  loadRecent();
}
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${map[s]||'#eee'}">${s}</span>`;
}
async function saveNotes(){
  const on_date = $('#modDate')?.value || new Date().toISOString().slice(0,10);
  const note = $('#modNote')?.value.trim() || '';
  const rows = MODS.map(m=>({
    mod_name: m,
    on_date,
    mood:  $(`#${m.toLowerCase()}Mood`)?.value || '',
    status:$(`#${m.toLowerCase()}Status`)?.value || 'available',
    note
  }));
  const { error } = await sb.from('mod_notes').upsert(rows, { onConflict: 'mod_name,on_date' });
  if(error){ console.error(error); toast('Gagal simpan notes'); return; }
  $('#modNote').value=''; toast('Notes tersimpan ✅'); loadRecent();
}
async function loadRecent(){
  const { data=[], error } = await sb.from('mod_notes')
    .select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(24);
  if(error){ console.error(error); $('#modRecent').innerHTML='Error load'; return; }
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--light-pink)">
      <b>${x.mod_name}</b> — ${x.mood||''} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note ? ' · '+x.note : ''}
    </div>
  `).join('') : '<div class="opacity-60">Belum ada notes</div>';
}

// ===== Import CSV/XLSX =====
function bindGlobalImport(){
  const input = $('#fileAny'); const btn = $('#btnImportAny');
  if(!input || !btn) return;
  btn.onclick = async ()=>{
    const file = input.files?.[0];
    if(!file){ toast('Pilih file dulu'); return; }
    try{
      await importAll(file);
      toast('Import sukses ✅');
    }catch(e){ console.error(e); toast('Import gagal ❌'); }
  };
}
function readWorkbook(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      try{
        const sheets=[];
        if(file.name.toLowerCase().endsWith('.csv')){
          const rows = e.target.result.split(/\r?\n/).map(line=>line.split(','));
          sheets.push({name:'CSV', rows});
        }else{
          const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
          wb.SheetNames.forEach(n=>{
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''});
            sheets.push({name:n, rows});
          });
        }
        resolve(sheets);
      }catch(err){ reject(err); }
    };
    if(file.name.toLowerCase().endsWith('.csv')) fr.readAsText(file);
    else fr.readAsArrayBuffer(file);
  });
}
function findCols(headers, spec){
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx={};
  for(const key in spec){ idx[key] = h.findIndex(col => spec[key].some(k=> col.includes(k))); }
  return idx;
}
async function importAll(file){
  const sheets = await readWorkbook(file);
  const rowsP=[], rowsC=[], rowsA=[];
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const H = ws.rows[0]; const R = ws.rows.slice(1);

    const pIdx = findCols(H,{
      prompt_text:['prompt','description','prompt_text'],
      pairing:['pairing','pair'],
      tags:['tags','additional','additonal'],
      rating:['rating'],
      prompter:['prompter','prompter_name','author'],
      prompter_handle:['ao3','twitter','handle'],
      prompt_bank_upload:['bank','upload'],
      status:['status_prompt','status']
    });

    const cIdx = findCols(H,{
      prompt_text:['prompt','description','prompt_text'],
      pairing:['pairing','pair'],
      tags:['tags','additional','additonal'],
      author:['author','claimed_by','name'],
      is_self_prompt:['self','self_prompt'],
      status:['status','status_words','status_works'],
      ao3_link:['ao3','link'],
      notes:['notes','catatan'],
      claimed_at:['claimed_at','claimed_date','tanggal']
    });

    const aIdx = findCols(H,{
      author:['author','name','penulis'],
      email:['email'],
      twitter:['twitter','handle'],
      progress:['progress','status_works','tahap'],
      claimed_by:['claimed_by'],
      claimed_date:['claimed_date','tanggal'],
      prompt_text:['prompt','description','prompt_text'],
      pairing:['pairing','pair'],
      description:['desc','description','prompt_text']
    });

    const pick = (i,row)=> i>=0 ? row[i] : '';

    for(const row of R){
      // prompts
      if(pIdx.prompt_text>=0 && (pick(pIdx.prompt_text,row)||'').toString().trim()){
        rowsP.push({
          prompt_text: pick(pIdx.prompt_text,row),
          pairing: pIdx.pairing>=0 ? pick(pIdx.pairing,row) : null,
          additional_tags: pIdx.tags>=0 ? String(pick(pIdx.tags,row)) : null,
          rating: pIdx.rating>=0 ? pick(pIdx.rating,row) : null,
          prompter: pIdx.prompter>=0 ? pick(pIdx.prompter,row) : null,
          prompter_handle: pIdx.prompter_handle>=0 ? pick(pIdx.prompter_handle,row) : null,
          prompt_bank_upload: pIdx.prompt_bank_upload>=0 ? pick(pIdx.prompt_bank_upload,row) : null,
          status: pIdx.status>=0 ? String(pick(pIdx.status,row)).toLowerCase() : 'available'
        });
      }
      // claims
      if((cIdx.author>=0 || cIdx.is_self_prompt>=0) && (pick(cIdx.author,row)||pick(cIdx.is_self_prompt,row)||'').toString().trim()){
        rowsC.push({
          prompt_text: cIdx.prompt_text>=0 ? pick(cIdx.prompt_text,row) : null,
          pairing: cIdx.pairing>=0 ? pick(cIdx.pairing,row) : null,
          tags: cIdx.tags>=0 ? String(pick(cIdx.tags,row)) : null,
          author: cIdx.author>=0 ? pick(cIdx.author,row) : null,
          is_self_prompt: cIdx.is_self_prompt>=0 ? String(pick(cIdx.is_self_prompt,row)).toLowerCase().startsWith('y') : false,
          status: cIdx.status>=0 ? String(pick(cIdx.status,row)).toLowerCase() : 'pending',
          ao3_link: cIdx.ao3_link>=0 ? pick(cIdx.ao3_link,row) : null,
          notes: cIdx.notes>=0 ? pick(cIdx.notes,row) : null,
          claimed_at: cIdx.claimed_at>=0 ? pick(cIdx.claimed_at,row) : null
        });
      }
      // authors
      if(aIdx.author>=0 && (pick(aIdx.author,row)||'').toString().trim()){
        rowsA.push({
          author: pick(aIdx.author,row),
          email: aIdx.email>=0 ? pick(aIdx.email,row) : null,
          twitter: aIdx.twitter>=0 ? pick(aIdx.twitter,row) : null,
          progress: aIdx.progress>=0 ? String(pick(aIdx.progress,row)).toLowerCase() : null,
          claimed_by: aIdx.claimed_by>=0 ? pick(aIdx.claimed_by,row) : null,
          claimed_date: aIdx.claimed_date>=0 ? pick(aIdx.claimed_date,row) : null,
          prompt_text: aIdx.prompt_text>=0 ? pick(aIdx.prompt_text,row) : null,
          pairing: aIdx.pairing>=0 ? pick(aIdx.pairing,row) : null,
          description: aIdx.description>=0 ? pick(aIdx.description,row) : null
        });
      }
    }
  }
  if(rowsP.length){ const {error}=await sb.from('prompts').insert(rowsP); if(error) throw error; }
  if(rowsC.length){ const {error}=await sb.from('claims').insert(rowsC);  if(error) throw error; }
  if(rowsA.length){ const {error}=await sb.from('authors').insert(rowsA); if(error) throw error; }
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', ()=>{
  // default show overview (import)
  const first = $('#nav [data-view="overview"]');
  first?.classList.add('active');
  VIEWS.overview();

  // render notes sidebar juga
  renderNotesBox();
});
