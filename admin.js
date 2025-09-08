/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1800); };
const esc = (s)=>(s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/************ NOTES (mood + availability + note) ************/
// Dibikin dinamis supaya elemen selalu ada walau HTML berubah-ubah
const MODS = ['Nio','Sha','Naya','Cinta'];
function renderNotesBox(){
  const box = $('#notes'); if(!box) return;

  box.innerHTML = `
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <p class="text-sm mb-3">Update mood & availability per mod (harian). Simpan → terekam di history.</p>
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
      <input id="modDate" type="date" class="rounded-xl border p-1" />
      <textarea id="modNote" rows="2" class="rounded-xl border p-1" placeholder="Catatan singkat…"></textarea>
      <button id="modSave" class="btn btn-dark">Save</button>
    </div>
    <div class="mt-3 text-sm">
      <div class="font-medium mb-1">Recent</div>
      <div id="modRecent" class="space-y-1"></div>
    </div>
  `;

  $('#modDate').value = new Date().toISOString().slice(0,10);
  $('#modSave').addEventListener('click', saveNotes);
  loadRecent();
}
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${map[s]||'#eee'}">${s}</span>`;
}
async function saveNotes(){
  const on_date = $('#modDate')?.value || new Date().toISOString().slice(0,10);
  const note    = $('#modNote')?.value.trim() || '';

  const rows = MODS.map(m=>({
    mod_name: m,                                     // gunakan kolom mod_name (bukan "mod")
    on_date,
    mood:  $(`#${m.toLowerCase()}Mood`)?.value || '',
    status:$(`#${m.toLowerCase()}Status`)?.value || 'available',
    note
  }));

  const { error } = await sb.from('mod_notes').upsert(rows, { onConflict: 'mod_name,on_date' });
  if(error){ console.error(error); toast('Gagal simpan notes'); return; }
  $('#modNote').value = '';
  toast('Notes tersimpan ✅');
  loadRecent();
}
async function loadRecent(){
  const list = $('#modRecent'); if(!list) return;
  const { data=[], error } = await sb.from('mod_notes')
    .select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(24);
  if(error){ console.error(error); list.innerHTML='<div class="opacity-60">Gagal memuat history</div>'; return; }
  list.innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--light-pink)">
      <b>${esc(x.mod_name)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${esc(x.on_date)})</span>
      ${x.note ? ' · '+esc(x.note):''}
    </div>
  `).join('') : '<div class="opacity-60">Belum ada notes</div>';
}

/************ IMPORT XLSX/CSV → Supabase ************/
// Tombol umum di Overview: #fileAny + #btnImportAny
function bindGlobalImport(){
  const f = $('#fileAny');
  const b = $('#btnImportAny');
  if(!f || !b) return;
  b.onclick = async ()=>{
    const file = f.files?.[0];
    if(!file){ toast('Pilih file CSV/XLSX dulu'); return; }
    try{
      await importAllSheets(file);
      toast('Import selesai ✅');
    }catch(err){
      console.error(err);
      toast('Import gagal ❌ Cek console');
    }
  };
}

// baca workbook (CSV atau XLSX) → [{name, rows:[[...]]}]
function readWorkbook(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      try{
        const sheets=[];
        if(file.name.toLowerCase().endsWith('.csv')){
          const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
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

// cari indeks kolom by keywords (longgar)
function findCols(headers, spec){
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx={};
  for(const key in spec){
    idx[key] = h.findIndex(col => spec[key].some(k => col.includes(k)));
  }
  return idx;
}

async function importAllSheets(file){
  const sheets = await readWorkbook(file);

  // buffer per tabel
  const rowsPrompts = [];
  const rowsClaims  = [];
  const rowsAuthors = [];

  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const H = ws.rows[0].map(x=>String(x).trim());
    const R = ws.rows.slice(1);

    // PROMPTS mapping (fleksibel)
    const pIdx = findCols(H, {
      prompt_text: ['prompt','description','prompt_text'],
      pairing: ['pairing','pair'],
      tags: ['tags','additional','additonal'],
      rating: ['rating'],
      prompter: ['prompter','prompter_name','author'], // kadang ditulis "author"
      prompter_handle: ['ao3','twitter','handle'],
      prompt_bank_upload: ['prompt_bank','bank','upload'],
      status: ['status_prompt','status']
    });

    // CLAIMS mapping
    const cIdx = findCols(H, {
      prompt_text: ['prompt','description','prompt_text'],
      pairing: ['pairing','pair'],
      tags: ['tags','additional','additonal'],
      author: ['author','claimed_by','name'],
      is_self_prompt: ['self','self_prompt'],
      status: ['status','status_words','status_works'],
      ao3_link: ['ao3','link'],
      notes: ['notes','catatan'],
      claimed_at: ['claimed_at','claimed_date','tanggal']
    });

    // AUTHORS mapping
    const aIdx = findCols(H, {
      author: ['author','name','penulis'],
      email: ['email'],
      twitter: ['twitter','handle'],
      progress: ['progress','status_works','tahap'],
      claimed_by: ['claimed_by'],
      claimed_date: ['claimed_date','tanggal'],
      prompt_text: ['prompt','description','prompt_text'],
      pairing: ['pairing','pair'],
      description: ['desc','description','prompt_text']
    });

    // Kumpulkan baris valid
    for(const row of R){
      const pick = (i)=> i>=0 ? row[i] : '';

      // PROMPTS
      if(pIdx.prompt_text>=0 && (pick(pIdx.prompt_text)||'').toString().trim()){
        rowsPrompts.push({
          prompt_text: pick(pIdx.prompt_text),
          pairing: pIdx.pairing>=0 ? pick(pIdx.pairing) : null,
          additional_tags: pIdx.tags>=0 ? String(pick(pIdx.tags)) : null,
          rating: pIdx.rating>=0 ? pick(pIdx.rating) : null,
          prompter: pIdx.prompter>=0 ? pick(pIdx.prompter) : null,
          prompter_handle: pIdx.prompter_handle>=0 ? pick(pIdx.prompter_handle) : null,
          prompt_bank_upload: pIdx.prompt_bank_upload>=0 ? pick(pIdx.prompt_bank_upload) : null,
          status: pIdx.status>=0 ? String(pick(pIdx.status)).toLowerCase() : 'available'
        });
      }

      // CLAIMS
      if((cIdx.author>=0 || cIdx.is_self_prompt>=0) && (pick(cIdx.author)||pick(cIdx.is_self_prompt)||'').toString().trim()){
        rowsClaims.push({
          prompt_text: cIdx.prompt_text>=0 ? pick(cIdx.prompt_text) : null,
          pairing: cIdx.pairing>=0 ? pick(cIdx.pairing) : null,
          tags: cIdx.tags>=0 ? String(pick(cIdx.tags)) : null,
          author: cIdx.author>=0 ? pick(cIdx.author) : null,
          is_self_prompt: cIdx.is_self_prompt>=0 ? String(pick(cIdx.is_self_prompt)).toLowerCase().startsWith('y') : false,
          status: cIdx.status>=0 ? String(pick(cIdx.status)).toLowerCase() : 'pending',
          ao3_link: cIdx.ao3_link>=0 ? pick(cIdx.ao3_link) : null,
          notes: cIdx.notes>=0 ? pick(cIdx.notes) : null,
          claimed_at: cIdx.claimed_at>=0 ? pick(cIdx.claimed_at) : null
        });
      }

      // AUTHORS
      if(aIdx.author>=0 && (pick(aIdx.author)||'').toString().trim()){
        rowsAuthors.push({
          author: pick(aIdx.author),
          email: aIdx.email>=0 ? pick(aIdx.email) : null,
          twitter: aIdx.twitter>=0 ? pick(aIdx.twitter) : null,
          progress: aIdx.progress>=0 ? String(pick(aIdx.progress)).toLowerCase() : null,
          claimed_by: aIdx.claimed_by>=0 ? pick(aIdx.claimed_by) : null,
          claimed_date: aIdx.claimed_date>=0 ? pick(aIdx.claimed_date) : null,
          prompt_text: aIdx.prompt_text>=0 ? pick(aIdx.prompt_text) : null,
          pairing: aIdx.pairing>=0 ? pick(aIdx.pairing) : null,
          description: aIdx.description>=0 ? pick(aIdx.description) : null
        });
      }
    }
  }

  // Insert per batch (supaya error jelas per tabel)
  if(rowsPrompts.length){
    const { error } = await sb.from('prompts').insert(rowsPrompts);
    if(error){ console.error('prompts insert error', error); throw error; }
  }
  if(rowsClaims.length){
    const { error } = await sb.from('claims').insert(rowsClaims);
    if(error){ console.error('claims insert error', error); throw error; }
  }
  if(rowsAuthors.length){
    const { error } = await sb.from('authors').insert(rowsAuthors);
    if(error){ console.error('authors insert error', error); throw error; }
  }
}

/************ ROUTER (placeholder biar halaman gak kosong) ************/
function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  const el = $(`#nav [data-view="${v}"]`); el?.classList.add('active');
}
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAny" class="btn">Import</button>
          </div>
        </div>
        <p class="mt-2 text-sm">Gunakan file <code>allsheets_for_website.xlsx</code> atau CSV. Hasilnya masuk ke tabel: prompts, claims, authors.</p>
      </section>
    `;
    bindGlobalImport();
  },
  async prompts(){ $('#view').innerHTML = `<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">💡 Prompts</h2><p class="mt-2 text-sm">Daftar prompt akan tampil di sini (rendering table bisa ditambah nanti).</p></section>`; },
  async claims(){  $('#view').innerHTML = `<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">✍️ Claims</h2><p class="mt-2 text-sm">Daftar claims akan tampil di sini.</p></section>`; },
  async authors(){ $('#view').innerHTML = `<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">👩‍💻 Authors</h2><p class="mt-2 text-sm">Daftar author + prompt/pairing/desc akan tampil di sini.</p></section>`; },
  async announcements(){ $('#view').innerHTML = `<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">📢 Announcements</h2><p class="mt-2 text-sm">Kelola pengumuman di sini.</p></section>`; },
  async timeline(){ $('#view').innerHTML = `<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">🗓️ Timeline</h2><p class="mt-2 text-sm">Edit & countdown nanti di sini.</p></section>`; },
  async design(){ $('#view').innerHTML = `<section class="p-4 rounded-2xl card"><h2 class="text-xl font-semibold">🎨 Design</h2><p class="mt-2 text-sm">Board design (post/agenda/due/status/link).</p></section>`; },
};
$('#nav')?.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  const v = el.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});

/************ BOOT ************/
renderNotesBox();
setActive('overview');
VIEWS.overview();
