/************ CONFIG ************/
// admin.js
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

// ====== BOOT ======
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const toast = (msg)=>{ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1500); };
const setActive = (v)=> $$('#nav .nav-btn').forEach(b=> b.classList.toggle('bg-[var(--pink)]', b.dataset.view===v));

// CSV helpers
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

// XLSX/CSV reader → [{name, rows:[[...]]}]
async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:'array' });
  const sheets = [];
  wb.SheetNames.forEach(n=>{
    const ws = wb.Sheets[n];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
    sheets.push({ name:n, rows });
  });
  return sheets;
}

// normalize progress from label
function normalizeProgress(s){
  s = String(s||'').toLowerCase();
  if (s.includes('belum')) return 'idea';
  if (s.includes('outline')) return 'outline';
  if (s.includes('draft') && s.includes('hampir')) return 'beta';
  if (s.includes('finishing') || s.includes('ready')) return 'ready';
  if (s.includes('draft')) return 'draft';
  if (['idea','outline','draft','beta','ready','posted'].includes(s)) return s;
  return 'idea';
}

// ====== ROUTER ======
$('#nav').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-view]');
  if(!btn) return;
  navigate(btn.dataset.view);
});
async function navigate(view){
  setActive(view);
  const router = { overview, prompts, claims, authors, announcements, timeline };
  await (router[view]||overview)();
}
navigate('overview');

// ====== OVERVIEW ======
async function overview(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <h2 class="text-xl font-semibold">💖 Welcome</h2>
      <p class="mt-1">Hello mods! Sync here, have fun 🌈✨</p>
    </section>

    <section class="grid md:grid-cols-4 gap-3">
      ${['Total Prompts','Available Prompts','Active Claims','Authors'].map(()=>`
        <div class="p-4 rounded-2xl card">
          <div class="text-sm opacity-70">—</div>
          <div class="text-2xl font-bold">—</div>
        </div>`).join('')}
    </section>

    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">🗓️ Headline</h2>
        <div class="text-sm opacity-70">Live countdown</div>
      </div>
      <div id="headline" class="grid md:grid-cols-2 gap-3 mt-2"></div>
    </section>

    <section class="p-4 rounded-2xl card">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold">📥 Import one sheet (CSV/XLSX)</h2>
        <label class="ml-auto text-xs inline-flex items-center gap-1">
          <input id="replaceAll" type="checkbox" class="rounded"> Replace all
        </label>
        <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
        <button id="btnImportAny" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
      </div>
      <p class="text-xs opacity-70 mt-2">Columns: <code>table</code> (prompt/claim/author) + fields (see README).</p>
    </section>
  `;

  // stats
  const kpiCards = $$('#view .grid .card');
  const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
  const s = stats || { prompts_total:0, prompts_available:0, claims_active:0, authors_total:0 };
  const labels = ['Total Prompts','Available Prompts','Active Claims','Authors'];
  [s.prompts_total, s.prompts_available, s.claims_active, s.authors_total].forEach((v,i)=>{
    kpiCards[i].children[0].textContent = labels[i];
    kpiCards[i].children[1].textContent = v;
  });

  // headline countdown
  await renderHeadline($('#headline'));

  // import handler
  $('#btnImportAny').onclick = async ()=>{
    const f = $('#fileAny').files[0];
    if(!f){ toast('Choose a file'); return; }
    await importOneSheet(f, $('#replaceAll').checked);
    toast('Imported'); navigate('overview');
  };
}

// headline for Author Sign-ups + Check-In
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

// ====== PROMPTS ======
async function prompts(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-semibold">💡 Prompts</h2>
        <span id="countP" class="text-sm opacity-70"></span>
        <div class="ml-auto flex items-center gap-2">
          <input id="fileP" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <label class="text-xs inline-flex items-center gap-1"><input id="replaceAll" type="checkbox" class="rounded"> Replace all</label>
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
    const f = $('#fileP').files[0]; if(!f) return;
    await importOneSheet(f, $('#replaceAll').checked);
    prompts();
  };
  $('#expP').onclick = async ()=>{
    const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    download('prompts.csv', toCSV(data));
  };

  const { data=[] } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
  $('#countP').textContent = `(${data.length})`;
  $('#tbP').innerHTML = data.map(r=>`
    <tr>
      <td class="font-mono text-xs">${esc(r.prompt_id || r.id.slice(0,8))}</td>
      <td>${esc((r.text||'').slice(0,160))}</td>
      <td>${(r.tags||[]).map(t=>`<span class="pill mr-1">${esc(t)}</span>`).join('')}</td>
      <td>${esc(r.prompter_name||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="p-2 text-sm opacity-60">No data</td></tr>';

  $$('#tbP select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
}

// ====== CLAIMS ======
async function claims(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-semibold">✍️ Claims</h2>
        <span id="countC" class="text-sm opacity-70"></span>
        <div class="ml-auto flex items-center gap-2">
          <input id="fileC" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <label class="text-xs inline-flex items-center gap-1"><input id="replaceAll" type="checkbox" class="rounded"> Replace all</label>
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
    const f = $('#fileC').files[0]; if(!f) return;
    await importOneSheet(f, $('#replaceAll').checked);
    claims();
  };
  $('#expC').onclick = async ()=>{
    const {data=[]} = await sb.from('claims').select('*').order('created_at',{ascending:false});
    download('claims.csv', toCSV(data));
  };

  const { data=[] } = await sb.from('claims').select('*').order('created_at',{ascending:false});
  $('#countC').textContent = `(${data.length})`;
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
    </tr>
  `).join('') || '<tr><td colspan="5" class="p-2 text-sm opacity-60">No data</td></tr>';

  $$('#tbC select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
}

// ====== AUTHORS ======
const PROG_OPTS = ['idea','outline','draft','beta','ready','posted'];

async function authors(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
        <span id="countA" class="text-sm opacity-70"></span>
        <div class="ml-auto flex items-center gap-2">
          <input id="fileA" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <label class="text-xs inline-flex items-center gap-1"><input id="replaceAll" type="checkbox" class="rounded"> Replace all</label>
          <button id="impA" class="px-3 py-2 rounded-xl bg-black text-white">Import</button>
          <button id="expA" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Name</th><th>AO3/Twitter</th><th>Progress</th><th>Email</th><th>Check-in (Email/DM)</th></tr></thead>
          <tbody id="tbA"></tbody>
        </table>
      </div>
    </section>
  `;

  $('#impA').onclick = async ()=>{
    const f = $('#fileA').files[0]; if(!f) return;
    await importOneSheet(f, $('#replaceAll').checked);
    authors();
  };
  $('#expA').onclick = async ()=>{
    const {data=[]} = await sb.from('authors').select('*').order('created_at',{ascending:false});
    download('authors.csv', toCSV(data));
  };

  // date for check-in (from timeline "Check-In")
  const { data: tl } = await sb.from('timeline').select('*').eq('phase','Check-In').limit(1);
  const checkDate = tl?.[0]?.start_date || new Date().toISOString().slice(0,10);

  const { data=[] } = await sb.from('authors').select('*').order('created_at',{ascending:false});
  const { data: outs=[] } = await sb.from('outreach').select('*').eq('for_date', checkDate);
  const doneMap={}; outs.forEach(o=>doneMap[`${o.author_ao3}|${o.channel}`]=o.done);

  $('#countA').textContent = `(${data.length})`;
  $('#tbA').innerHTML = data.map(r=>{
    const prog = `<select data-id="${r.id}" class="rounded-lg border p-1">
      ${PROG_OPTS.map(p=>`<option value="${p}" ${r.progress===p?'selected':''}>${p}</option>`).join('')}
    </select>`;
    const cEmail = doneMap[`${r.ao3}|email`]? 'checked':'';
    const cDM    = doneMap[`${r.ao3}|dm`]? 'checked':'';
    return `<tr>
      <td>${esc(r.name||'')}</td>
      <td>${esc(r.ao3||'')}</td>
      <td>${prog}</td>
      <td>${esc(r.email||'')}</td>
      <td>
        <label class="inline-flex items-center gap-1"><input type="checkbox" data-ao3="${esc(r.ao3||'')}" data-ch="email" ${cEmail}/> Email</label>
        <label class="inline-flex items-center gap-1 ml-3"><input type="checkbox" data-ao3="${esc(r.ao3||'')}" data-ch="dm" ${cDM}/> DM</label>
        <span class="ml-2 text-xs opacity-70">${checkDate}</span>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="p-2 text-sm opacity-60">No data</td></tr>';

  $$('#tbA select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('authors').update({progress: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
  $$('#tbA input[type="checkbox"]').forEach(chk=>{
    chk.onchange = async ()=>{
      await sb.from('outreach').upsert({
        author_ao3: chk.dataset.ao3,
        channel: chk.dataset.ch,
        for_date: checkDate,
        done: chk.checked,
        done_at: chk.checked? new Date().toISOString(): null
      }, { onConflict: 'author_ao3,for_date,channel' });
    };
  });
}

// ====== ANNOUNCEMENTS ======
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

// ====== TIMELINE ======
async function timeline(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
        <button id="addTL" class="px-3 py-2 rounded-xl">Add</button>
      </div>
      <div id="headline" class="grid md:grid-cols-2 gap-3 mt-3"></div>
      <div class="table-wrap mt-3">
        <table class="min-w-full text-sm">
          <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
          <tbody id="tbTL"></tbody>
        </table>
      </div>
    </section>
  `;

  $('#addTL').onclick = async ()=>{
    const phase = prompt('Phase name'); if(!phase) return;
    const dateRange = prompt('Date range (text)'); 
    const tasks = prompt('Tasks');
    const start = prompt('Start date (YYYY-MM-DD, optional)');
    await sb.from('timeline').upsert({ phase, date_range: dateRange||null, tasks: tasks||null, start_date: start||null }, { onConflict:'phase,date_range' });
    timeline();
  };

  await renderHeadline($('#headline'));
  const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
  $('#tbTL').innerHTML = data.map(r=>
    `<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="p-2 text-sm opacity-60">No data</td></tr>';
}

// ====== NOTES (sidebar) ======
notesInit();
function notesInit(){
  const box = $('#notes');
  box.innerHTML = `
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <div class="grid gap-2">
      <select id="modWho" class="rounded-xl border p-1">
        <option>Nio</option><option>Sha</option><option>Naya</option><option>Cinta</option>
      </select>
      <input id="modMood" class="rounded-xl border p-1" placeholder="😀 / (´･ω･`)" />
      <select id="modStatus" class="rounded-xl border p-1">
        <option value="available">available</option>
        <option value="away">away</option>
        <option value="slow">slow resp</option>
      </select>
      <input id="modDate" type="date" class="rounded-xl border p-1" />
      <input id="modNote" class="rounded-xl border p-1" placeholder="short note..." />
      <button id="modSave" class="px-3 py-2 rounded-xl bg-black text-white">Save</button>
    </div>
    <div class="mt-3 text-sm">
      <div class="font-medium mb-1">Recent</div>
      <div id="modRecent" class="space-y-1"></div>
    </div>
  `;
  $('#modDate').value = new Date().toISOString().slice(0,10);
  $('#modSave').onclick = async ()=>{
    const row = {
      mod: $('#modWho').value,
      mood: $('#modMood').value,
      status: $('#modStatus').value,
      on_date: $('#modDate').value,
      note: $('#modNote').value.trim()
    };
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
  const {data=[]} = await sb.from('mod_notes').select('*')
    .order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(12);
  $('#modRecent').innerHTML = data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <span class="font-medium">${esc(x.mod)}</span>
      — <span>${esc(x.mood||'')}</span>
      — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note? ' · '+esc(x.note):''}
    </div>
  `).join('') || '<div class="opacity-60">No notes yet.</div>';
}

// ====== IMPORT ONE SHEET (CSV/XLSX) ======
async function importOneSheet(file, replaceAll){
  const sheets = await readWorkbook(file);
  if(replaceAll){
    // soft reset tables (idempotent)
    await sb.from('claims').delete().neq('id','00000000-0000-0000-0000-000000000000');
    await sb.from('authors').delete().neq('id','00000000-0000-0000-0000-000000000000');
    await sb.from('prompts').delete().neq('id','00000000-0000-0000-0000-000000000000');
  }
  for (const ws of sheets){
    if(!ws.rows.length) continue;
    const [H, ...R] = ws.rows;
    const head = H.map(h=>String(h).trim().toLowerCase());
    const gi = n => head.indexOf(n);

    const iTable  = gi('table');
    const iPromptText = gi('prompt_text');
    const iPromptId   = gi('prompt_id');
    const iPairing    = gi('pairing');
    const iTags       = gi('tags');
    const iPStatus    = gi('status_prompt')>-1? gi('status_prompt') : gi('prompt_status');

    const iCAuth   = gi('claim_author');
    const iCAO3    = gi('claim_ao3');
    const iCStatus = gi('status_words')>-1? gi('status_words') : gi('claim_status');
    const iAo3Link = gi('ao3_link');
    const iNotes   = gi('notes');

    const iAName   = gi('author_name');
    const iAAO3    = gi('author_ao3');
    const iAEmail  = gi('author_email');
    const iATw     = gi('author_twitter');
    const iAProg   = gi('author_progress');
    const iATz     = gi('author_timezone');

    const rowsP=[], rowsC=[], rowsA=[];
    for (const r of R){
      const t = String(r[iTable]||'').toLowerCase().trim();
      if (t==='prompt' && (r[iPromptText]||'').toString().trim()){
        rowsP.push({
          prompt_id: r[iPromptId]||null,
          text: r[iPromptText],
          pairing: r[iPairing]||null,
          tags: (r[iTags]||'').toString().split(/[,;]\s*/).filter(Boolean),
          status: (r[iPStatus]||'available').toLowerCase()
        });
      } else if (t==='claim' && (r[iCAuth]||r[iCAO3]||'').toString().trim()){
        rowsC.push({
          author_name: r[iCAuth]||null,
          author_ao3: r[iCAO3]||null,
          status: (r[iCStatus]||'pending').toLowerCase(),
          ao3_link: r[iAo3Link]||null,
          notes: r[iNotes]||null
        });
      } else if (t==='author' && (r[iAName]||r[iAAO3]||'').toString().trim()){
        rowsA.push({
          name: r[iAName]||null,
          ao3: r[iAAO3]||null,
          email: r[iAEmail]||null,
          twitter: r[iATw]||null,
          progress: normalizeProgress(r[iAProg]||''),
          timezone: r[iATz]||null
        });
      }
    }
    if (rowsP.length) await sb.from('prompts').insert(rowsP);
    if (rowsC.length) await sb.from('claims').insert(rowsC);
    if (rowsA.length) await sb.from('authors').insert(rowsA);
  }
}


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
