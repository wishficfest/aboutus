/**************** CONFIG ****************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

/**************** BOOTSTRAP ************/
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1500); };
function setActive(view){ $$('#nav .nav-btn').forEach(b=>b.classList.remove('ring-2')); const btn=$(`[data-view="${view}"]`); if(btn) btn.classList.add('ring-2'); }

/******** CSV/XLSX helpers ********/
function toCSV(arr){
  if(!arr?.length) return '';
  const keys = Object.keys(arr[0]);
  const lines = [keys.join(',')].concat(arr.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(',')));
  return lines.join('\n');
}
function download(name, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
async function readWorkbook(file){
  // return [{name, rows:[[...]]}]
  return await new Promise((resolve)=>{
    const out=[]; const fr=new FileReader();
    fr.onload = e=>{
      if(file.name.toLowerCase().endsWith('.csv')){
        const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
        out.push({name:'CSV', rows});
        resolve(out);
      }else{
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        wb.SheetNames.forEach(n=>{
          out.push({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''})});
        });
        resolve(out);
      }
    };
    if(file.name.toLowerCase().endsWith('.csv')) fr.readAsText(file); else fr.readAsArrayBuffer(file);
  });
}
function findCols(headers, keys){ 
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx = {};
  for(const k in keys){ idx[k] = h.findIndex(c => keys[k].some(kw=> c.includes(kw))); }
  return idx;
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

/**************** ROUTER ***************/
$('#nav').addEventListener('click', e=>{
  const b = e.target.closest('[data-view]'); if(!b) return;
  const v = b.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});

/**************** VIEWS ****************/
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
          <div class="p-4 rounded-2xl card"><div class="text-sm">Prompts</div><div id="kPrompts" class="text-2xl font-bold">—</div></div>
          <div class="p-4 rounded-2xl card"><div class="text-sm">Claims</div><div id="kClaims" class="text-2xl font-bold">—</div></div>
          <div class="p-4 rounded-2xl card"><div class="text-sm">Authors</div><div id="kAuthors" class="text-2xl font-bold">—</div></div>
          <div class="p-4 rounded-2xl card"><div class="text-sm">% Progress</div><div id="kProg" class="text-2xl font-bold">—</div></div>
        </div>
        <p class="mt-3 text-sm" id="analysis">Loading…</p>
      </section>

      <section class="p-4 rounded-2xl card mt-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">🗓️ Headline</h2>
          <div class="text-sm opacity-70">Live countdown</div>
        </div>
        <div id="headline" class="grid md:grid-cols-2 gap-3 mt-2"></div>
      </section>
    `;
    $('#btnImportAny').onclick = () => handleFileImport($('#fileAny'));

    // KPI (graceful jika v_stats belum ada)
    try{
      const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
      const donePct = stats?.authors_total ? Math.round(100* (stats.authors_done||0) / stats.authors_total) : 0;
      $('#kPrompts').textContent = stats?.prompts_total ?? 0;
      $('#kClaims').textContent  = stats?.claims_active ?? 0;
      $('#kAuthors').textContent = stats?.authors_total ?? 0;
      $('#kProg').textContent    = donePct + '%';
      $('#analysis').textContent = donePct<30 ? 'Early days — keep cheering writers! 💪'
                                  : donePct<70 ? 'Nice momentum — schedule next check-in 📅'
                                               : 'Almost there — prepare posting assets 🎨';
    }catch{ $('#analysis').textContent = 'Stats view not found. (Optional)'; }

    await renderHeadline($('#headline'));
  },

  async prompts(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div class="flex items-center gap-2">
            <input id="filePrompts" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impPrompts" class="px-3 py-2 rounded-xl">Import</button>
            <button id="expPrompts" class="px-3 py-2 rounded-xl">Export CSV</button>
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
    $('#expPrompts').onclick = async ()=>{
      const {data=[]} = await sb.from('prompts').select('*');
      download('prompts.csv', toCSV(data));
    };
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
            <button id="expClaims" class="px-3 py-2 rounded-xl">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Author</th><th>Status</th><th>AO3</th><th>Notes</th></tr></thead>
            <tbody id="tbClaims"></tbody>
          </table>
        </div>
      </section>`;
    $('#impClaims').onclick = () => handleFileImport($('#fileClaims'),'claims');
    $('#expClaims').onclick = async ()=>{
      const {data=[]} = await sb.from('claims').select('*');
      download('claims.csv', toCSV(data));
    };
    renderClaims(await sb.from('claims').select('*').order('created_at',{ascending:false}));
  },

  async authors(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
          <div class="flex items-center gap-2">
            <input id="fileAuthors" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impAuthors" class="px-3 py-2 rounded-xl">Import</button>
            <button id="expAuthors" class="px-3 py-2 rounded-xl">Export CSV</button>
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
    $('#expAuthors').onclick = async ()=>{
      const {data=[]} = await sb.from('authors').select('*');
      download('authors.csv', toCSV(data));
    };
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
        <div id="headline" class="grid md:grid-cols-2 gap-3 mt-3"></div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
            <tbody id="tbTimeline"></tbody>
          </table>
        </div>
      </section>`;
    await renderHeadline($('#headline'));

    const load = async ()=>{
      const {data=[]} = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
      $('#tbTimeline').innerHTML = data.map(r=>`<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
    };
    $('#addPhase').onclick = async ()=>{
      const phase = prompt('Phase name'); if(!phase) return;
      const dateRange = prompt('Date range (text)'); 
      const tasks = prompt('Tasks');
      const start = prompt('Start date (YYYY-MM-DD, optional)');
      await sb.from('timeline').upsert({ phase, date_range: dateRange||null, tasks: tasks||null, start_date: start||null }, { onConflict:'phase,date_range' });
      load();
    };
    load();
  },
};

/************* HEADLINE (countdown) *************/
function fmtCountdown(target){
  if(!target) return '—';
  const end = new Date(target).getTime();
  let s = Math.max(0, Math.floor((end - Date.now())/1000));
  const d = Math.floor(s/86400); s%=86400;
  const h = Math.floor(s/3600); s%=3600;
  const m = Math.floor(s/60); const sec = s%60;
  return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
async function renderHeadline(root){
  const { data=[] } = await sb.from('timeline').select('*');
  const phases = ['Author Sign-ups','Check-In'];
  root.innerHTML = phases.map(p=>{
    const r = data.find(x=>x.phase===p);
    if(!r) return `<div class="p-3 rounded-xl" style="background:var(--peach)"><div class="font-medium">${p}</div><div class="opacity-70">Not set</div></div>`;
    return `<div class="p-3 rounded-xl" style="background:var(--peach)">
      <div class="text-sm opacity-70">${esc(r.phase)}</div>
      <div class="text-lg font-semibold">${esc(r.tasks||'')}</div>
      <div class="mt-1 text-sm">${esc(r.date_range||'')}</div>
      <div class="mt-2 text-2xl font-bold" data-countdown="${r.start_date||''}">—</div>
    </div>`;
  }).join('');
  const tick = ()=> $$('[data-countdown]').forEach(el=>{
    const iso = el.getAttribute('data-countdown'); el.textContent = iso? fmtCountdown(iso) : '—';
  });
  tick(); setInterval(tick, 1000);
}

/************* RENDER TABLE HELPERS *************/
function renderPrompts({data=[],error}){ 
  $('#tbPrompts').innerHTML = (data||[]).map(r=>`<tr><td>${esc(r.text||'')}</td><td>${esc(r.pairing||'')}</td><td>${esc((r.tags||[]).join? r.tags.join(', '): r.tags || '')}</td><td>${esc(r.status||'available')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
}
function renderClaims({data=[],error}){
  $('#tbClaims').innerHTML = (data||[]).map(r=>`<tr><td>${esc(r.author_name||r.author||'')}</td><td>${esc(r.status||'approved')}</td><td>${r.ao3_link? `<a class="underline" target="_blank" href="${esc(r.ao3_link)}">link</a>`:'—'}</td><td>${esc(r.notes||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
}
function renderAuthors({data=[],error}){
  $('#tbAuthors').innerHTML = (data||[]).map(r=>`<tr><td>${esc(r.name||'')}</td><td>${esc(r.ao3||'')}</td><td>${esc(r.progress||'')}</td><td>${esc(r.email||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
}

/************* IMPORT (sheet → tables) ***********/
async function handleFileImport(inputEl, target){
  const file = inputEl?.files?.[0]; if(!file){ alert('Choose a file'); return; }
  const sheets = await readWorkbook(file);

  if(target==='prompts'){ await upsertPrompts(sheets); return VIEWS.prompts(); }
  if(target==='claims'){  await upsertClaims(sheets);  return VIEWS.claims(); }
  if(target==='authors'){ await upsertAuthors(sheets); return VIEWS.authors(); }

  // import dari Overview → coba isi semuanya
  await upsertPrompts(sheets); await upsertClaims(sheets); await upsertAuthors(sheets);
  toast('Imported'); VIEWS.overview();
}
async function upsertPrompts(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], { text:['prompt','text','teks'], pairing:['pairing','pair'], tags:['tag'], status:['status'] });
    if(idx.text<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.text]||'').toString().trim()!=='')
      .map(r=>({ text:r[idx.text], pairing: idx.pairing>=0 ? r[idx.pairing] : null, tags: idx.tags>=0 ? toArray(r[idx.tags]) : null, status: (idx.status>=0 ? String(r[idx.status]).toLowerCase() : 'available') }));
    if(rows.length) await sb.from('prompts').insert(rows);
  }
}
async function upsertClaims(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], { author:['author','penulis','nama','name'], status:['status'], ao3:['ao3','link'] });
    if(idx.author<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.author]||'').toString().trim()!=='')
      .map(r=>({ author_name:r[idx.author], status: idx.status>=0 ? String(r[idx.status]).toLowerCase() : 'approved', ao3_link: idx.ao3>=0 ? r[idx.ao3] : null }));
    if(rows.length) await sb.from('claims').insert(rows);
  }
}
async function upsertAuthors(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], { name:['author','penulis','nama','name'], ao3:['ao3','twitter'], progress:['progress','tahap'], email:['email'] });
    if(idx.name<0 && idx.ao3<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.name]||r[idx.ao3]||'').toString().trim()!=='')
      .map(r=>({ name: idx.name>=0 ? r[idx.name] : null, ao3: idx.ao3>=0 ? r[idx.ao3] : null, progress: idx.progress>=0 ? normalizeProgress(r[idx.progress]) : null, email: idx.email>=0 ? r[idx.email] : null }));
    if(rows.length) await sb.from('authors').insert(rows);
  }
}

/************* NOTES (sidebar) *************/
notesInit();
function notesInit(){
  const box = $('#notes');
  if(!box) return;
  box.innerHTML = `
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <div class="grid gap-2">
      <select id="modWho" class="rounded-xl border p-1"><option>Nio</option><option>Sha</option><option>Naya</option><option>Cinta</option></select>
      <input id="modMood" class="rounded-xl border p-1" placeholder="😀 / (´･ω･`)" />
      <select id="modStatus" class="rounded-xl border p-1"><option value="available">available</option><option value="away">away</option><option value="slow">slow resp</option></select>
      <input id="modDate" type="date" class="rounded-xl border p-1" />
      <input id="modNote" class="rounded-xl border p-1" placeholder="short note..." />
      <button id="modSave" class="px-3 py-2 rounded-xl bg-black text-white">Save</button>
    </div>
    <div class="mt-3 text-sm"><div class="font-medium mb-1">Recent</div><div id="modRecent" class="space-y-1"></div></div>
  `;
  $('#modDate').value = new Date().toISOString().slice(0,10);
  $('#modSave').onclick = async ()=>{
    const row = { mod: $('#modWho').value, mood: $('#modMood').value, status: $('#modStatus').value, on_date: $('#modDate').value, note: $('#modNote').value.trim() };
    await sb.from('mod_notes').upsert(row, { onConflict: 'mod,on_date' });
    $('#modNote').value=''; loadRecent();
  };
  loadRecent();
}
function statusBadge(s){
  const map = { available:'background:#C7F9CC;', away:'background:#FFE3B3;', slow:'background:#FFD6E7;' };
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="${map[s]||'background:#eee;'}">${s}</span>`;
}
async function loadRecent(){
  const {data=[]} = await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(12);
  const box = $('#modRecent'); if(!box) return;
  box.innerHTML = data.map(x=>`<div class="p-2 rounded-lg" style="background:var(--peach)"><span class="font-medium">${esc(x.mod)}</span> — <span>${esc(x.mood||'')}</span> — ${statusBadge(x.status)} <span class="opacity-70 text-xs">(${x.on_date})</span> ${x.note? ' · '+esc(x.note):''}</div>`).join('') || '<div class="opacity-60">No notes yet.</div>';
}

/************* STARTUP *************/
setActive('overview');
VIEWS.overview();
