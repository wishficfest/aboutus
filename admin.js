/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

/************ UTILS ************/
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1500); };
function setActive(view){ $$('#nav .nav-btn').forEach(b=> b.classList.toggle('ring-2', b.dataset.view===view)); }
function toCSV(arr){ if(!arr?.length) return ''; const keys=Object.keys(arr[0]); return [keys.join(',')].concat(arr.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n'); }
const toArr = v => v==null? null : Array.isArray(v)? v : String(v).split(/[,;]\s*/).filter(Boolean);

/************ ROUTER ************/
$('#nav').addEventListener('click', e=>{
  const b = e.target.closest('[data-view]'); if(!b) return;
  navigate(b.dataset.view);
});
navigate('overview'); // initial

async function navigate(view){
  setActive(view);
  const R = { overview, prompts, claims, authors, announcements, timeline };
  await (R[view]||overview)();
}

/************ OVERVIEW ************/
async function overview(){
  $('#view').innerHTML = `
    <section class="p-6 rounded-2xl card">
      <h2 class="text-xl font-semibold mb-2">💖 Welcome</h2>
      <p>Pilih menu untuk untuk mengelola: <b>Prompts, Claims, Authors, Announcements, Timeline</b>, dan <b>Overview</b>.</p>
      <p class="mt-2 text-sm">Impor CSV/XLSX di sini untuk mass update semua tabel sekaligus.</p>
      <div class="mt-3 flex items-center gap-2">
        <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
        <button id="btnImportAny" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
      </div>
    </section>

    <section class="grid md:grid-cols-4 gap-3">
      ${['Total Prompts','Available Prompts','Active Claims','Authors'].map(()=>
        `<div class="p-4 rounded-2xl card"><div class="text-sm opacity-70">—</div><div class="text-2xl font-bold">—</div></div>`).join('')}
    </section>
  `;

  $('#btnImportAny').onclick = async ()=>{
    const f = $('#fileAny').files[0]; if(!f) return toast('Pilih file dulu');
    await importWorkbook(f, /*guess all*/ null);
    toast('Import selesai'); overview();
  };

  // KPI dari view v_stats
  const cards = $$('#view .grid .card');
  const { data: s } = await sb.from('v_stats').select('*').maybeSingle();
  const vals = [s?.prompts_total||0, s?.prompts_available||0, s?.claims_active||0, s?.authors_total||0];
  const labels = ['Total Prompts','Available Prompts','Active Claims','Authors'];
  vals.forEach((v,i)=>{ cards[i].children[0].textContent = labels[i]; cards[i].children[1].textContent = v; });
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
          <thead><tr><th>ID</th><th>Text</th><th>Tags</th><th>Prompter</th><th>Status</th></tr></thead>
          <tbody id="tbP"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impP').onclick = async ()=>{
    const f = $('#fileP').files[0]; if(!f) return toast('Pilih file'); await importWorkbook(f,'prompts'); prompts();
  };
  $('#expP').onclick = async ()=>{
    const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    download('prompts.csv', toCSV(data));
  };

  const { data=[] } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
  $('#tbP').innerHTML = data.map(r=>`
    <tr>
      <td class="font-mono text-xs">${esc(r.prompt_id || r.id.slice(0,8))}</td>
      <td>${esc(r.text||'')}</td>
      <td>${(r.tags||[]).map(t=>`<span class="pill mr-1">${esc(t)}</span>`).join('')}</td>
      <td>${esc(r.prompter_name||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" class="p-2 text-sm opacity-60">No data</td></tr>';

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
          <thead><tr><th>ID</th><th>Author</th><th>Status</th><th>AO3</th><th>Notes</th></tr></thead>
          <tbody id="tbC"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impC').onclick = async ()=>{
    const f = $('#fileC').files[0]; if(!f) return toast('Pilih file'); await importWorkbook(f,'claims'); claims();
  };
  $('#expC').onclick = async ()=>{
    const {data=[]} = await sb.from('claims').select('*').order('created_at',{ascending:false});
    download('claims.csv', toCSV(data));
  };

  const { data=[] } = await sb.from('claims').select('*').order('created_at',{ascending:false});
  $('#tbC').innerHTML = data.map(r=>`
    <tr>
      <td class="font-mono text-xs">${esc(r.id.slice(0,8))}</td>
      <td>${esc(r.author_name||'')} <span class="opacity-60">${esc(r.author_ao3||'')}</span></td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['pending','approved','revoked','dropped','submitted','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${r.ao3_link? `<a class="underline" target="_blank" href="${esc(r.ao3_link)}">link</a>` : '—'}</td>
      <td>${esc(r.notes||'')}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="p-2 text-sm opacity-60">No data</td></tr>';

  $$('#tbC select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
}

/************ AUTHORS ************/
const PROG_OPTS = ['idea','outline','draft','beta','ready','posted'];
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
    </section>
  `;
  $('#impA').onclick = async ()=>{
    const f = $('#fileA').files[0]; if(!f) return toast('Pilih file'); await importWorkbook(f,'authors'); authors();
  };
  $('#expA').onclick = async ()=>{
    const {data=[]} = await sb.from('authors').select('*').order('created_at',{ascending:false});
    download('authors.csv', toCSV(data));
  };

  const { data=[] } = await sb.from('authors').select('*').order('created_at',{ascending:false});
  $('#tbA').innerHTML = data.map(r=>{
    const prog = `<select data-id="${r.id}" class="rounded-lg border p-1">
      ${PROG_OPTS.map(p=>`<option value="${p}" ${r.progress===p?'selected':''}>${p}</option>`).join('')}
    </select>`;
    return `<tr>
      <td>${esc(r.name||'')}</td>
      <td>${esc(r.ao3||'')} ${r.twitter? `· ${esc(r.twitter)}`:''}</td>
      <td>${prog}</td>
      <td>${esc(r.email||'')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';

  $$('#tbA select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('authors').update({progress: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
}

/************ ANNOUNCEMENTS ************/
async function announcements(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">📢 Announcements</h2>
        <form id="annForm" class="flex gap-2">
          <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
          <input id="annBody" class="rounded-xl border p-2" placeholder="Body…"/>
          <label class="inline-flex items-center gap-1 text-sm"><input id="annPub" type="checkbox"/> publish</label>
          <button class="px-3 py-2 rounded-xl bg-black text-white">Save</button>
        </form>
      </div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Title</th><th>Published</th><th>When</th></tr></thead>
          <tbody id="annList"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#annForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const row = { title: $('#annTitle').value.trim(), body: $('#annBody').value.trim(), is_published: $('#annPub').checked };
    if(!row.title) return;
    await sb.from('announcements').insert(row);
    toast('Saved'); announcements();
  });
  const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50);
  $('#annList').innerHTML = data.map(r=>`
    <tr><td>${esc(r.title||'')}</td><td>${r.is_published?'Yes':'No'}</td><td>${DateTime.fromISO(r.created_at).toFormat('dd LLL yyyy, HH:mm')}</td></tr>
  `).join('') || '<tr><td colspan="3" class="p-2 text-sm opacity-60">No data</td></tr>';
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
          <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th></tr></thead>
          <tbody id="tbTL"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#addTL').onclick = async ()=>{
    const phase = prompt('Phase name'); if(!phase) return;
    const date_range = prompt('Date range (text)')||'';
    const tasks = prompt('Tasks')||'';
    await sb.from('timeline').insert({ phase, date_range, tasks });
    timeline();
  };
  const { data=[] } = await sb.from('timeline').select('*').order('created_at',{ascending:true});
  $('#tbTL').innerHTML = data.map(r=>`<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td></tr>`).join('')
    || '<tr><td colspan="3" class="p-2 text-sm opacity-60">No data</td></tr>';
}

/************ NOTES (save + list) ************/
initNotes();
function initNotes(){
  $('#modDate').value = new Date().toISOString().slice(0,10);
  $('#modSave').onclick = async ()=>{
    const D = $('#modDate').value;
    const rows = [
      {mod:'Nio',   mood:$('#nioMood').value,  status:$('#nioStatus').value,   on_date:D, note:$('#modNote').value.trim()},
      {mod:'Sha',   mood:$('#shaMood').value,  status:$('#shaStatus').value,   on_date:D, note:$('#modNote').value.trim()},
      {mod:'Naya',  mood:$('#nayaMood').value, status:$('#nayaStatus').value,  on_date:D, note:$('#modNote').value.trim()},
      {mod:'Cinta', mood:$('#cintaMood').value,status:$('#cintaStatus').value, on_date:D, note:$('#modNote').value.trim()},
    ];
    // upsert per baris (primary key: mod,on_date)
    for(const r of rows){
      await sb.from('mod_notes').upsert(r, { onConflict: 'mod,on_date' });
    }
    $('#modNote').value='';
    toast('Notes saved'); loadRecentNotes();
  };
  loadRecentNotes();
}
function badge(s){
  const map = { available:'background:#C7F9CC;', away:'background:#FFE3B3;', slow:'background:#FFD6E7;' };
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="${map[s]||'background:#eee;'}">${s}</span>`;
}
async function loadRecentNotes(){
  const { data=[] } = await sb.from('mod_notes').select('*')
    .order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(12);
  $('#modRecent').innerHTML = data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${badge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note? ' · '+esc(x.note):''}
    </div>`).join('') || '<div class="opacity-60">No notes yet.</div>';
}

/************ IMPORTER (CSV/XLSX → tables) ************/
async function importWorkbook(file, target){
  const sheets = await readWorkbook(file);

  // Import per-target atau auto-detect
  if(!target || target==='prompts'){
    for(const ws of sheets){ await importPromptsSheet(ws); }
  }
  if(!target || target==='claims'){
    for(const ws of sheets){ await importClaimsSheet(ws); }
  }
  if(!target || target==='authors'){
    for(const ws of sheets){ await importAuthorsSheet(ws); }
  }
}

function readWorkbook(file){
  return new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      const res = [];
      if(file.name.toLowerCase().endsWith('.csv')){
        const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
        res.push({name:'CSV', rows});
      }else{
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        wb.SheetNames.forEach(n=> res.push({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''})}));
      }
      resolve(res);
    };
    if(file.name.toLowerCase().endsWith('.csv')) fr.readAsText(file);
    else fr.readAsArrayBuffer(file);
  });
}

function findCols(headers, spec){ // spec: {key:[kw1,kw2]}
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx={}; for(const k in spec){ idx[k] = h.findIndex(c=> spec[k].some(kw=> c.includes(kw))); }
  return idx;
}

async function importPromptsSheet(ws){
  if(!ws.rows.length) return;
  const idx = findCols(ws.rows[0], {
    text:['prompt','text','teks'],
    pairing:['pairing','pair'],
    tags:['tag'],
    status:['status_prompt','status']
  });
  if(idx.text<0) return; // not a prompt sheet
  const rows = ws.rows.slice(1).filter(r=> (r[idx.text]||'').toString().trim()!=='').map(r=>({
    text: r[idx.text],
    pairing: idx.pairing>=0 ? r[idx.pairing] : null,
    tags: idx.tags>=0 ? toArr(r[idx.tags]) : null,
    status: (idx.status>=0 ? String(r[idx.status]).toLowerCase() : 'available')
  }));
  if(rows.length) await sb.from('prompts').insert(rows);
}

async function importClaimsSheet(ws){
  if(!ws.rows.length) return;
  const idx = findCols(ws.rows[0], {
    author:['author','penulis','nama','name'],
    ao3:['ao3'],
    status:['status_words','status'],
    ao3link:['ao3_link'],
    notes:['notes','catatan']
  });
  if(idx.author<0 && idx.ao3<0) return;
  const rows = ws.rows.slice(1).filter(r=> (r[idx.author]||r[idx.ao3]||'').toString().trim()!=='').map(r=>({
    author_name: idx.author>=0 ? r[idx.author] : null,
    author_ao3:  idx.ao3>=0 ? r[idx.ao3] : null,
    status: (idx.status>=0 ? String(r[idx.status]).toLowerCase() : 'pending'),
    ao3_link: idx.ao3link>=0 ? r[idx.ao3link] : null,
    notes: idx.notes>=0 ? r[idx.notes] : null
  }));
  if(rows.length) await sb.from('claims').insert(rows);
}

async function importAuthorsSheet(ws){
  if(!ws.rows.length) return;
  const idx = findCols(ws.rows[0], {
    name:['author_name','author','nama','name'],
    ao3:['author_ao3','ao3'],
    twitter:['author_twitter','twitter'],
    email:['author_email','email'],
    progress:['author_progress','progress','tahap'],
    tz:['author_timezone','timezone','tz']
  });
  if(idx.name<0 && idx.ao3<0) return;
  const normProg = (v)=>{
    const s = String(v||'').toLowerCase();
    if(s.includes('belum')||s.includes('0')||s.includes('idea')) return 'idea';
    if(s.includes('outline')||s.includes('20')) return 'outline';
    if(s.includes('draft')&&s.includes('hampir')) return 'beta';
    if(s.includes('draft')||s.includes('40')) return 'draft';
    if(s.includes('beta')||s.includes('60')) return 'beta';
    if(s.includes('finishing')||s.includes('ready')||s.includes('80')) return 'ready';
    if(s.includes('posted')||s.includes('done')) return 'posted';
    return s||null;
  };
  const rows = ws.rows.slice(1).filter(r=> (r[idx.name]||r[idx.ao3]||'').toString().trim()!=='').map(r=>({
    name: idx.name>=0 ? r[idx.name] : null,
    ao3: idx.ao3>=0 ? r[idx.ao3] : null,
    twitter: idx.twitter>=0 ? r[idx.twitter] : null,
    email: idx.email>=0 ? r[idx.email] : null,
    progress: idx.progress>=0 ? normProg(r[idx.progress]) : null,
    timezone: idx.tz>=0 ? r[idx.tz] : null
  }));
  if(rows.length) await sb.from('authors').insert(rows);
}

/************ HELPERS ************/
function download(name, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
