/************ CONFIG ************/
// admin.js
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/************ UTILS ************/
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setActive(view){ $$('#nav .nav-btn').forEach(b=>b.classList.remove('ring-2')); $(`[data-view="${view}"]`).classList.add('ring-2'); }

/************ ROUTER ************/
$('#nav').addEventListener('click', e=>{
  const b = e.target.closest('[data-view]'); if(!b) return;
  const v = b.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});

/************ VIEWS ************/
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div>
            <label class="text-xs mr-2">Import CSV/XLSX:</label>
            <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAny" class="px-3 py-2 rounded-xl">Import</button>
          </div>
        </div>
        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="text-sm">Prompts</div><div id="kPrompts" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Claims</div><div id="kClaims" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Authors</div><div id="kAuthors" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">% Progress</div><div id="kProg" class="text-2xl font-bold">—</div></div>
        </div>
        <p class="mt-3 text-sm" id="analysis">Loading…</p>
      </section>
    `;
    $('#btnImportAny').onclick = () => handleFileImport($('#fileAny'));

    // KPI
    const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
    const donePct = stats?.authors_total ? Math.round(100* (stats.authors_done||0) / stats.authors_total) : 0;
    $('#kPrompts').textContent = stats?.prompts_total ?? 0;
    $('#kClaims').textContent  = stats?.claims_active ?? 0;
    $('#kAuthors').textContent = stats?.authors_total ?? 0;
    $('#kProg').textContent    = donePct + '%';
    $('#analysis').textContent = donePct<30 ? 'Early days — keep cheering writers! 💪'
                                : donePct<70 ? 'Nice momentum — schedule next check-in 📅'
                                             : 'Almost there — prepare posting assets 🎨';
  },

  async prompts(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div class="flex items-center gap-2">
            <input id="filePrompts" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impPrompts" class="px-3 py-2 rounded-xl">Import</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Text</th><th>Pairing</th><th>Tags</th><th>Status</th></tr></thead>
            <tbody id="tbPrompts"></tbody>
          </table>
        </div>
      </section>`;
    $('#impPrompts').onclick = () => handleFileImport($('#filePrompts'),'prompts');
    renderPrompts(await sb.from('prompts').select('*').order('created_at',{ascending:false}));
  },

  async claims(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">✍️ Claims</h2>
          <div class="flex items-center gap-2">
            <input id="fileClaims" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impClaims" class="px-3 py-2 rounded-xl">Import</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Prompt</th><th>Author</th><th>Status</th></tr></thead>
            <tbody id="tbClaims"></tbody>
          </table>
        </div>
      </section>`;
    $('#impClaims').onclick = () => handleFileImport($('#fileClaims'),'claims');
    renderClaims(await sb.from('claims').select('*, prompts(text)').order('created_at',{ascending:false}));
  },

  async authors(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
          <div class="flex items-center gap-2">
            <input id="fileAuthors" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impAuthors" class="px-3 py-2 rounded-xl">Import</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Name</th><th>AO3/Twitter</th><th>Progress</th><th>Email</th></tr></thead>
            <tbody id="tbAuthors"></tbody>
          </table>
        </div>
      </section>`;
    $('#impAuthors').onclick = () => handleFileImport($('#fileAuthors'),'authors');
    renderAuthors(await sb.from('authors').select('*').order('created_at',{ascending:false}));
  },

  async announcements(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📢 Announcements</h2>
          <div class="flex gap-2"><input id="annInput" class="rounded-xl border p-2 bg-white" placeholder="Type announcement…"/>
          <button id="annPost" class="px-3 py-2 rounded-xl">Post</button></div>
        </div>
        <div id="annList" class="mt-3 space-y-2 text-sm"></div>
      </section>`;
    const reload = async ()=>{
      const {data=[]} = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50);
      $('#annList').innerHTML = data.map(a=>`<div class="p-2 rounded-lg" style="background:var(--peach)">${esc(a.body)} <span class="text-xs opacity-70">(${new Date(a.created_at).toLocaleString()})</span></div>`).join('') || '<div class="text-sm opacity-60">No announcements yet.</div>';
    };
    $('#annPost').onclick = async ()=>{
      const body = $('#annInput').value.trim(); if(!body) return;
      await sb.from('announcements').insert({body, is_published:true}); $('#annInput').value = ''; reload();
    };
    reload();
  },

  async timeline(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
          <button id="addPhase" class="px-3 py-2 rounded-xl">Add</button>
        </div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th></tr></thead>
            <tbody id="tbTimeline"></tbody>
          </table>
        </div>
      </section>`;
    const seed = [
      ['Prep & Setup','Aug 10–14','Create Twitter, AO3 collection, graphics, rules'],
      ['Announcement','Aug 15','Launch Twitter thread'],
      ['Prompting','Aug 15–Aug 31','Prompt submissions open on form'],
      ['Claiming Begins','Aug 17','Prompt claiming opens on AO3'],
      ['Author Sign-ups','Aug 17–Sep 13','GForm stays open, rolling sign-ups allowed'],
      ['Check-In','Sep 8','Progress check via email/DM'],
      ['Submission Period','Sep 15–Sep 28','Final fic submissions (extension possible until Oct 4)'],
      ['Posting Starts','Sep 29','Writers post fics on AO3, off-anon'],
      ['Masterlist Thread','Oct 12','Final thread to collect all works'],
    ];
    const {data=[]} = await sb.from('timeline').select('*').order('created_at',{ascending:true});
    if(!data.length){ await sb.from('timeline').insert(seed.map(([phase,date_range,tasks])=>({phase,date_range,tasks}))); }
    const load = async ()=>{
      const {data=[]} = await sb.from('timeline').select('*').order('created_at',{ascending:true});
      $('#tbTimeline').innerHTML = data.map(r=>`<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range)}</td><td>${esc(r.tasks)}</td></tr>`).join('');
    };
    $('#addPhase').onclick = async ()=>{
      const phase = prompt('Phase?'); if(!phase) return;
      const date_range = prompt('Date range?')||''; const tasks = prompt('Tasks?')||'';
      await sb.from('timeline').insert({phase,date_range,tasks}); load();
    };
    load();
  },
};

/************ RENDER HELPERS ************/
function renderPrompts({data=[],error}){ 
  $('#tbPrompts').innerHTML = (data||[]).map(r=>`<tr><td>${esc(r.text||'')}</td><td>${esc(r.pairing||'')}</td><td>${esc((r.tags||[]).join? r.tags.join(', '): r.tags || '')}</td><td>${esc(r.status||'available')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
}
function renderClaims({data=[],error}){
  $('#tbClaims').innerHTML = (data||[]).map(r=>`<tr><td>${esc(r.prompts?.text||'')}</td><td>${esc(r.author_name||r.author||'')}</td><td>${esc(r.status||'approved')}</td></tr>`).join('') || '<tr><td colspan="3" class="p-2 text-sm opacity-60">No data</td></tr>';
}
function renderAuthors({data=[],error}){
  $('#tbAuthors').innerHTML = (data||[]).map(r=>`<tr><td>${esc(r.name||'')}</td><td>${esc(r.ao3||'')}</td><td>${esc(r.progress||'')}</td><td>${esc(r.email||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
}

/************ IMPORT (XLSX/CSV → Supabase) ************/
async function handleFileImport(inputEl, target){
  const file = inputEl?.files?.[0]; if(!file){ alert('Pilih file'); return; }
  const parse = await readWorkbook(file);
  // heuristik deteksi sheet
  if(target==='prompts'){ await upsertPrompts(parse); return VIEWS.prompts(); }
  if(target==='claims'){  await upsertClaims(parse);  return VIEWS.claims(); }
  if(target==='authors'){ await upsertAuthors(parse); return VIEWS.authors(); }
  // kalau import dari Overview, kita coba isi semuanya yang terdeteksi
  await upsertPrompts(parse);
  await upsertClaims(parse);
  await upsertAuthors(parse);
  VIEWS.overview();
}

function readWorkbook(file){
  return new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      let sheets = [];
      if(file.name.toLowerCase().endsWith('.csv')){
        const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
        sheets.push({name:'CSV', rows});
      }else{
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        wb.SheetNames.forEach(n=>{
          sheets.push({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''})});
        });
      }
      resolve(sheets);
    };
    if(file.name.toLowerCase().endsWith('.csv')) fr.readAsText(file);
    else fr.readAsArrayBuffer(file);
  });
}

function findCols(headers, keys){ 
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx = {};
  for(const k in keys){
    idx[k] = h.findIndex(c => keys[k].some(kw=> c.includes(kw)));
  }
  return idx;
}

async function upsertPrompts(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      text:['prompt','text','teks'],
      pairing:['pairing','pair'],
      tags:['tag'],
      status:['status']
    });
    if(idx.text<0) continue; // not a prompt sheet
    const rows = ws.rows.slice(1).filter(r=> (r[idx.text]||'').toString().trim()!=='')
      .map(r=>({
        text: r[idx.text],
        pairing: idx.pairing>=0 ? r[idx.pairing] : null,
        tags: idx.tags>=0 ? toArray(r[idx.tags]) : null,
        status: (idx.status>=0 ? String(r[idx.status]).toLowerCase() : 'available')
      }));
    if(rows.length) await sb.from('prompts').insert(rows);
  }
}
async function upsertClaims(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      prompt:['prompt','text','teks'],
      author:['author','penulis','nama','name'],
      status:['status']
    });
    if(idx.prompt<0 || idx.author<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.author]||'').toString().trim()!=='')
      .map(r=>({ author_name:r[idx.author], status: idx.status>=0 ? r[idx.status] : 'approved', notes:null }));
    // kita tidak tau prompt_id; biarkan tanpa relasi dulu.
    if(rows.length) await sb.from('claims').insert(rows);
  }
}
async function upsertAuthors(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      name:['author','penulis','nama','name'],
      ao3:['ao3','twitter'],
      progress:['progress','tahap'],
      email:['email']
    });
    if(idx.name<0 && idx.ao3<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.name]||r[idx.ao3]||'').toString().trim()!=='')
      .map(r=>({
        name: idx.name>=0 ? r[idx.name] : null,
        ao3: idx.ao3>=0 ? r[idx.ao3] : null,
        progress: idx.progress>=0 ? normalizeProgress(r[idx.progress]) : null,
        email: idx.email>=0 ? r[idx.email] : null
      }));
    if(rows.length) await sb.from('authors').insert(rows);
  }
}

function toArray(v){ if(v==null) return null; if(Array.isArray(v)) return v; return String(v).split(/[,;]\s*/).filter(Boolean); }
function normalizeProgress(v){
  const s = String(v||'').toLowerCase();
  if(s.includes('0')||s.includes('belum')||s.includes('idea')) return 'idea';
  if(s.includes('20')||s.includes('outline')) return 'outline';
  if(s.includes('40')||s.includes('draft')) return 'draft';
  if(s.includes('60')||s.includes('beta')) return 'beta';
  if(s.includes('80')||s.includes('finishing')||s.includes('ready')) return 'ready';
  if(s.includes('posted')||s.includes('done')) return 'posted';
  return s || null;
}

/************ START ************/
setActive('overview'); VIEWS.overview();
