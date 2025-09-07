/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

/************ UTILS ************/
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1500); };
function setActive(view){ $$('#nav .nav-btn').forEach(b=>b.classList.toggle('ring-2', b.dataset.view===view)); }
function toCSV(rows){ if(!rows?.length) return ''; const k=Object.keys(rows[0]); return [k.join(',')].concat(rows.map(r=>k.map(x=>`"${String(r[x]??'').replace(/"/g,'""')}"`).join(','))).join('\n'); }
function toArray(v){ if(v==null) return null; if(Array.isArray(v)) return v; return String(v).split(/[,;]\s*/).filter(Boolean); }
function normalizeProgress(v){
  const s = String(v||'').toLowerCase();
  if(s.includes('belum')||s.includes('0')||s==='idea') return 'idea';
  if(s.includes('outline')||s.includes('20'))         return 'outline';
  if(s.includes('draft')||s.includes('40'))           return 'draft';
  if(s.includes('hampir')||s.includes('60')||s.includes('beta')) return 'beta';
  if(s.includes('finishing')||s.includes('80')||s.includes('ready')) return 'ready';
  if(s.includes('posted')||s.includes('done'))        return 'posted';
  return s || null;
}

/************ ROUTER (sidebar) ************/
$('#nav').addEventListener('click', e=>{
  const b = e.target.closest('[data-view]'); if(!b) return;
  navigate(b.dataset.view);
});
async function navigate(view){
  setActive(view);
  const routes = { overview, prompts, claims, authors, announcements, timeline };
  await (routes[view]||overview)();
}
navigate('overview');

/************ XLSX/CSV PARSER ************/
async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  if(file.name.toLowerCase().endsWith('.csv')){
    const txt = new TextDecoder().decode(buf);
    const rows = txt.split(/\r?\n/).filter(Boolean).map(l=>l.split(','));
    return [{name:'CSV', rows}];
  }
  const wb = XLSX.read(buf, {type:'array'});
  return wb.SheetNames.map(n=>({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''})}));
}

/************ OVERVIEW ************/
async function overview(){
  $('#view').innerHTML = `
    <section class="p-6 rounded-2xl card">
      <h2 class="text-xl font-semibold mb-2">💖 Welcome</h2>
      <p>Halo mods! Pilih menu di kiri untuk kelola <b>Prompts, Claims, Authors, Announcements, Timeline</b>. 
      Impor/ekspor CSV/XLSX ada di <b>Overview</b> & tiap section.</p>
    </section>

    <section class="grid md:grid-cols-4 gap-3">
      <div class="p-4 rounded-2xl card"><div class="text-sm">Total Prompts</div><div id="k1" class="text-2xl font-bold">—</div></div>
      <div class="p-4 rounded-2xl card"><div class="text-sm">Available</div><div id="k2" class="text-2xl font-bold">—</div></div>
      <div class="p-4 rounded-2xl card"><div class="text-sm">Active Claims</div><div id="k3" class="text-2xl font-bold">—</div></div>
      <div class="p-4 rounded-2xl card"><div class="text-sm">Authors</div><div id="k4" class="text-2xl font-bold">—</div></div>
    </section>

    <section class="p-4 rounded-2xl card">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold">📥 Import one sheet (CSV/XLSX)</h3>
        <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white ml-auto"/>
        <button id="btnImportAny" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
      </div>
      <p class="text-xs opacity-70 mt-2">Kolom minimal: <code>table</code> (prompt/claim/author) + kolom-kolom terkait.</p>
    </section>
  `;

  const { data: s } = await sb.from('v_stats').select('*').maybeSingle();
  $('#k1').textContent = s?.prompts_total ?? 0;
  $('#k2').textContent = s?.prompts_available ?? 0;
  $('#k3').textContent = s?.claims_active ?? 0;
  $('#k4').textContent = s?.authors_total ?? 0;

  $('#btnImportAny').onclick = async ()=>{
    const f = $('#fileAny').files[0]; if(!f) return toast('Pilih file dulu ya');
    await importOneSheet(f);
    toast('Imported'); overview();
  };
}

/************ PROMPTS ************/
async function prompts(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">💡 Prompts</h2>
        <div class="flex items-center gap-2">
          <input id="fileP" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impP" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
          <button id="expP" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Text</th><th>Pairing</th><th>Tags</th><th>Status</th></tr></thead>
          <tbody id="tbP"></tbody>
        </table>
      </div>
    </section>`;

  $('#impP').onclick = async ()=>{ const f=$('#fileP').files[0]; if(!f) return; await importOneSheet(f,'prompts'); prompts(); };
  $('#expP').onclick = async ()=>{ const {data=[]}=await sb.from('prompts').select('*'); download('prompts.csv', toCSV(data)); };

  const { data=[] } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
  $('#tbP').innerHTML = data.map(r=>`<tr>
    <td>${esc(r.text||'')}</td>
    <td>${esc(r.pairing||'')}</td>
    <td>${esc((r.tags||[]).join? r.tags.join(', '): r.tags||'')}</td>
    <td>
      <select data-id="${r.id}" class="rounded-lg border p-1">
        ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
  </tr>`).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';

  $$('#tbP select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
}

/************ CLAIMS ************/
async function claims(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">✍️ Claims</h2>
        <div class="flex items-center gap-2">
          <input id="fileC" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impC" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
          <button id="expC" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Author</th><th>Status</th><th>AO3</th><th>Notes</th></tr></thead>
          <tbody id="tbC"></tbody>
        </table>
      </div>
    </section>`;

  $('#impC').onclick = async ()=>{ const f=$('#fileC').files[0]; if(!f) return; await importOneSheet(f,'claims'); claims(); };
  $('#expC').onclick = async ()=>{ const {data=[]}=await sb.from('claims').select('*'); download('claims.csv', toCSV(data)); };

  const { data=[] } = await sb.from('claims').select('*').order('created_at',{ascending:false});
  $('#tbC').innerHTML = data.map(r=>`<tr>
    <td>${esc(r.author_name||'')} <span class="opacity-60">${esc(r.author_ao3||'')}</span></td>
    <td>
      <select data-id="${r.id}" class="rounded-lg border p-1">
        ${['pending','approved','revoked','dropped','submitted','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>${r.ao3_link? `<a class="underline" target="_blank" href="${esc(r.ao3_link)}">link</a>` : '—'}</td>
    <td>${esc(r.notes||'')}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';

  $$('#tbC select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
}

/************ AUTHORS ************/
async function authors(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
        <div class="flex items-center gap-2">
          <input id="fileA" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impA" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
          <button id="expA" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Name</th><th>AO3/Twitter</th><th>Progress</th><th>Email</th></tr></thead>
          <tbody id="tbA"></tbody>
        </table>
      </div>
    </section>`;

  $('#impA').onclick = async ()=>{ const f=$('#fileA').files[0]; if(!f) return; await importOneSheet(f,'authors'); authors(); };
  $('#expA').onclick = async ()=>{ const {data=[]}=await sb.from('authors').select('*'); download('authors.csv', toCSV(data)); };

  const { data=[] } = await sb.from('authors').select('*').order('created_at',{ascending:false});
  $('#tbA').innerHTML = data.map(r=>`<tr>
    <td>${esc(r.name||'')}</td>
    <td>${esc(r.ao3||'')} ${r.twitter? `· ${esc(r.twitter)}`:''}</td>
    <td>
      <select data-id="${r.id}" class="rounded-lg border p-1">
        ${['idea','outline','draft','beta','ready','posted'].map(s=>`<option ${r.progress===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>${esc(r.email||'')}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';

  $$('#tbA select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('authors').update({progress: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
}

/************ ANNOUNCEMENTS ************/
async function announcements(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <h2 class="text-xl font-semibold mb-2">📢 Announcements</h2>
      <form id="annForm" class="grid md:grid-cols-2 gap-2">
        <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
        <label class="inline-flex items-center gap-2 text-sm"><input id="annPub" type="checkbox" class="rounded"/> Publish now</label>
        <textarea id="annBody" rows="4" class="md:col-span-2 rounded-xl border p-2" placeholder="Body…"></textarea>
        <button class="md:col-span-2 px-3 py-2 rounded-xl bg-black text-white">Save</button>
      </form>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Title</th><th>Published</th><th>When</th></tr></thead>
          <tbody id="annList"></tbody>
        </table>
      </div>
    </section>`;
  $('#annForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const row = {title:$('#annTitle').value.trim(), body:$('#annBody').value.trim(), is_published: $('#annPub').checked};
    if(!row.title) return;
    await sb.from('announcements').insert(row);
    toast('Saved'); announcements();
  });
  const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50);
  $('#annList').innerHTML = data.map(r=>`<tr><td>${esc(r.title||'')}</td><td>${r.is_published?'Yes':'No'}</td><td>${DateTime.fromISO(r.created_at).toFormat('dd LLL yyyy, HH:mm')}</td></tr>`).join('') || '<tr><td colspan="3" class="p-2 opacity-60">No data</td></tr>';
}

/************ TIMELINE ************/
async function timeline(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
        <button id="addTL" class="px-3 py-2 rounded-xl">Add</button>
      </div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
          <tbody id="tbTL"></tbody>
        </table>
      </div>
    </section>`;
  $('#addTL').onclick = async ()=>{
    const phase = prompt('Phase name'); if(!phase) return;
    const dateRange = prompt('Date range (text)')||null;
    const tasks = prompt('Tasks')||null;
    const start = prompt('Start date (YYYY-MM-DD, optional)')||null;
    await sb.from('timeline').insert({phase, date_range:dateRange, tasks, start_date:start});
    timeline();
  };
  const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
  $('#tbTL').innerHTML = data.map(r=>`<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
}

/************ NOTES SIDEBAR ************/
notesInit();
function notesInit(){
  // set tanggal default hari ini
  const d = new Date().toISOString().slice(0,10);
  $('#modDate') && ($('#modDate').value = d);

  // tombol save
  const btn = $('#modSave'); if(!btn) return;
  btn.onclick = async ()=>{
    const day = $('#modDate').value || d;
    const rows = [
      {mod:'Nio',   mood: $('#nioMood')?.value||'',  status: $('#nioStatus')?.value||'available'},
      {mod:'Sha',   mood: $('#shaMood')?.value||'',  status: $('#shaStatus')?.value||'available'},
      {mod:'Naya',  mood: $('#nayaMood')?.value||'', status: $('#nayaStatus')?.value||'available'},
      {mod:'Cinta', mood: $('#cintaMood')?.value||'',status: $('#cintaStatus')?.value||'available'},
    ].map(x=>({...x, on_date: day, note: $('#modNote').value.trim() || null}));

    for(const r of rows){
      await sb.from('mod_notes').upsert(r, { onConflict: 'mod,on_date' });
    }
    $('#modNote').value = '';
    toast('Notes saved'); loadRecent();
  };

  loadRecent();
}
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  const bg = map[s] || '#eee';
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${bg}">${s}</span>`;
}
async function loadRecent(){
  const {data=[]} = await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(12);
  const el = $('#modRecent'); if(!el) return;
  el.innerHTML = data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)} 
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note? ' · '+esc(x.note):''}
    </div>`).join('') || '<div class="opacity-60">Belum ada catatan.</div>';
}

/************ IMPORT ONE SHEET ************/
async function importOneSheet(file, only){
  const sheets = await readWorkbook(file);

  const doPrompts = async (ws)=>{
    const H = ws.rows[0]?.map(h=>String(h).trim().toLowerCase())||[];
    const gi = k=>H.indexOf(k);
    const idx = { text: gi('prompt_text')>-1?gi('prompt_text'):gi('text'), pairing: gi('pairing'), tags: gi('tags'), status: gi('status_prompt')>-1?gi('status_prompt'):gi('status') };
    if(idx.text<0) return false;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.text]||'').toString().trim()!=='').map(r=>({
      text: r[idx.text], pairing: idx.pairing>=0? r[idx.pairing]: null, tags: idx.tags>=0? toArray(r[idx.tags]): null, status: idx.status>=0? String(r[idx.status]).toLowerCase(): 'available'
    }));
    if(rows.length) await sb.from('prompts').insert(rows);
    return true;
  };

  const doClaims = async (ws)=>{
    const H = ws.rows[0]?.map(h=>String(h).trim().toLowerCase())||[];
    const gi = k=>H.indexOf(k);
    const idx = { author: gi('claim_author')>-1?gi('claim_author'):gi('author'), ao3: gi('claim_ao3')>-1?gi('claim_ao3'):gi('ao3'), status: gi('status_words')>-1?gi('status_words'):gi('status'), link: gi('ao3_link'), notes: gi('notes') };
    if(idx.author<0 && idx.ao3<0) return false;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.author]||r[idx.ao3]||'').toString().trim()!=='').map(r=>({
      author_name: idx.author>=0? r[idx.author]: null,
      author_ao3:  idx.ao3>=0? r[idx.ao3]: null,
      status:      idx.status>=0? String(r[idx.status]).toLowerCase(): 'pending',
      ao3_link:    idx.link>=0? r[idx.link]: null,
      notes:       idx.notes>=0? r[idx.notes]: null
    }));
    if(rows.length) await sb.from('claims').insert(rows);
    return true;
  };

  const doAuthors = async (ws)=>{
    const H = ws.rows[0]?.map(h=>String(h).trim().toLowerCase())||[];
    const gi = k=>H.indexOf(k);
    const idx = { name: gi('author_name')>-1?gi('author_name'):gi('name'), ao3: gi('author_ao3')>-1?gi('author_ao3'):gi('ao3'), email: gi('author_email')>-1?gi('author_email'):gi('email'), tw: gi('author_twitter')>-1?gi('author_twitter'):gi('twitter'), prog: gi('author_progress')>-1?gi('author_progress'):gi('progress') };
    if(idx.name<0 && idx.ao3<0) return false;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.name]||r[idx.ao3]||'').toString().trim()!=='').map(r=>({
      name: idx.name>=0? r[idx.name]: null, ao3: idx.ao3>=0? r[idx.ao3]: null, email: idx.email>=0? r[idx.email]: null, twitter: idx.tw>=0? r[idx.tw]: null, progress: idx.prog>=0? normalizeProgress(r[idx.prog]): null
    }));
    if(rows.length) await sb.from('authors').insert(rows);
    return true;
  };

  for(const ws of sheets){
    if(only==='prompts'){ await doPrompts(ws); continue; }
    if(only==='claims'){  await doClaims(ws);  continue; }
    if(only==='authors'){ await doAuthors(ws); continue; }
    // auto-detect
    await doPrompts(ws) || await doClaims(ws) || await doAuthors(ws);
  }
}

function download(name, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
