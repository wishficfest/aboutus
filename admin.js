/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DateTime = luxon.DateTime;
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1500); };

/************ NAV / ROUTER ************/
function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  const el = $(`#nav [data-view="${v}"]`); if(el) el.classList.add('active');
}
$('#nav')?.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  const v = el.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});

/************ CSV/XLSX helpers ************/
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
  const buf = await file.arrayBuffer();
  if(file.name.toLowerCase().endsWith('.csv')){
    const text = new TextDecoder().decode(buf);
    const rows = text.split(/\r?\n/).map(l=>l.split(','));
    return [{ name:'CSV', rows }];
  }
  const wb = XLSX.read(buf, { type:'array' });
  return wb.SheetNames.map(n=>{
    const ws = wb.Sheets[n];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
    return { name:n, rows };
  });
}
function findCols(headers, map){
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx={}; for(const k in map){ idx[k]= h.findIndex(c=> map[k].some(kw=> c.includes(kw))); }
  return idx;
}
function toArray(v){ if(v==null) return null; if(Array.isArray(v)) return v; return String(v).split(/[,;]\s*/).filter(Boolean); }

/************ NOTES (mood + status + last update date) ************/
const MODS=['Nio','Sha','Naya','Cinta'];
function statusBadge(s){ const m={available:'#C7F9CC',away:'#FFE3B3',slow:'#FFD6E7'}; return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${m[s]||'#eee'}">${s}</span>`; }

async function saveNotes(){
  const on_date = $('#modDate')?.value || new Date().toISOString().slice(0,10);
  const note    = $('#modNote')?.value.trim() || '';
  const rows = MODS.map(m=>({
    mod: m,
    on_date,
    mood:  $(`#${m.toLowerCase()}Mood`)?.value || '',
    status:$(`#${m.toLowerCase()}Status`)?.value || 'available',
    note
  }));
  const { error } = await sb.from('mod_notes').upsert(rows, { onConflict:'mod,on_date' });
  if(error){ console.error(error); toast('Gagal simpan'); return; }
  $('#modNote').value=''; toast('Saved'); loadRecent();
}
async function loadRecent(){
  const { data=[] } = await sb.from('mod_notes')
    .select('*').order('on_date',{ascending:false})
    .order('created_at',{ascending:false}).limit(20);
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${esc(x.on_date)})</span>${x.note?' · '+esc(x.note):''}
    </div>
  `).join('') : '<div class="opacity-60">No notes yet.</div>';
}
(function initNotes(){
  const d = $('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10);
  $('#modSave')?.addEventListener('click', saveNotes);
  loadRecent();
})();

/************ TIMELINE (fallback data + countdown) ************/
const TL_STATIC = [
  { phase:'Prep & Setup',      range:'Aug 10–14',                         tasks:'Create Twitter, AO3 collection, graphics, rules', start:'2025-08-10' },
  { phase:'Announcement',      range:'Aug 15',                            tasks:'Launch Twitter thread',                             start:'2025-08-15' },
  { phase:'Prompting',         range:'Aug 15–Aug 31',                     tasks:'Prompt submissions open on form',                  start:'2025-08-15' },
  { phase:'Claiming Begins',   range:'Aug 17',                            tasks:'Prompt claiming opens on AO3',                     start:'2025-08-17' },
  { phase:'Author Sign-ups',   range:'Aug 17–Sep 13',                     tasks:'GForm stays open, rolling sign-ups allowed',       start:'2025-08-17' },
  { phase:'Check-In',          range:'Sep 8',                             tasks:'Progress check via email/DM',                      start:'2025-09-08' },
  { phase:'Submission Period', range:'Sep 15–Sep 28 (2 weeks)',           tasks:'Final fic submissions (extension possible until Oct 4)', start:'2025-09-15' },
  { phase:'Posting Starts',    range:'Sep 29',                            tasks:'Writers post fics on AO3, off-anon',               start:'2025-09-29' },
  { phase:'Masterlist Thread', range:'Oct 12',                            tasks:'Final thread to collect all works',                 start:'2025-10-12' },
];
function fmtCountdown(iso){
  if(!iso) return '—';
  const end = new Date(iso).getTime();
  let s = Math.max(0, Math.floor((end - Date.now())/1000));
  const d = Math.floor(s/86400); s%=86400; const h = Math.floor(s/3600); s%=3600; const m = Math.floor(s/60); const sec = s%60;
  return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function currentPhase(rows){
  const now = new Date();
  const withDate = rows.map(r=>({ ...r, startDate: r.start ? new Date(r.start) : null })).filter(r=>r.startDate);
  withDate.sort((a,b)=> a.startDate - b.startDate);
  let cur = withDate[0]; for(const r of withDate){ if(r.startDate <= now) cur=r; else break; }
  return cur || rows[0];
}

/************ VIEWS ************/
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAny" class="btn-lite">Import</button>
          </div>
        </div>
        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="text-sm">Total Prompts</div><div id="kP1" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Available Prompts</div><div id="kP2" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Active Claims</div><div id="kC" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Authors</div><div id="kA" class="text-2xl font-bold">—</div></div>
        </div>
      </section>
    `;
    // KPI
    const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
    $('#kP1').textContent = stats?.prompts_total ?? 0;
    $('#kP2').textContent = stats?.prompts_available ?? 0;
    $('#kC').textContent  = stats?.claims_active ?? 0;
    $('#kA').textContent  = stats?.authors_total ?? 0;

    // Import handler (allsheets_for_website.xlsx)
    $('#btnImportAny').onclick = async ()=>{
      const f = $('#fileAny').files[0]; if(!f) return toast('Pilih file .csv/.xlsx dulu');
      await importWorkbook(f); toast('Imported'); VIEWS.overview();
    };
  },

  async prompts(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div class="flex items-center gap-2">
            <input id="fileP" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impP" class="btn-lite">Import</button>
            <button id="expP" class="btn-lite">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr>
              <th>Date</th><th>Prompter</th><th>AO3/Twitter</th><th>Pairing</th><th>Tags</th><th>Rating</th><th>Prompt</th><th>Bank</th><th>Status</th>
            </tr></thead>
            <tbody id="tbP"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impP').onclick = async()=>{ const f=$('#fileP').files[0]; if(!f) return toast('Pilih file'); await importWorkbook(f,'prompts'); VIEWS.prompts(); };
    $('#expP').onclick = async()=>{ const {data=[]}=await sb.from('prompts').select('*').order('created_at',{ascending:false}); download('prompts.csv', toCSV(data)); };

    const { data=[] } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    $('#tbP').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.prompt_date||'')}</td>
        <td>${esc(r.prompter_name||'')}</td>
        <td>${esc(r.prompter_ao3||'')}</td>
        <td>${esc(r.pairing||'')}</td>
        <td>${esc(r.additonal_tags||'')}</td>
        <td>${esc(r.rating||'')}</td>
        <td>${esc(r.text||'')}</td>
        <td>${esc(r.prompt_bank_upload||'')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="9" class="p-2 opacity-60">No data</td></tr>`;

    $$('#tbP select').forEach(sel=>{
      sel.onchange = async()=>{ await sb.from('prompts').update({status:sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
    });
  },

  async claims(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">✍️ Claims</h2>
          <div class="flex items-center gap-2">
            <input id="fileC" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impC" class="btn-lite">Import</button>
            <button id="expC" class="btn-lite">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Pairing</th><th>Status</th><th>Email</th><th>Twitter</th><th>AO3 Link</th><th>Notes</th></tr></thead>
            <tbody id="tbC"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impC').onclick = async()=>{ const f=$('#fileC').files[0]; if(!f) return toast('Pilih file'); await importWorkbook(f,'claims'); VIEWS.claims(); };
    $('#expC').onclick = async()=>{ const {data=[]}=await sb.from('claims').select('*').order('created_at',{ascending:false}); download('claims.csv', toCSV(data)); };

    const { data=[] } = await sb.from('claims').select('*').order('created_at',{ascending:false});
    $('#tbC').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.pairing||'')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input type="email" data-f="author_email" data-id="${r.id}" value="${esc(r.author_email||'')}" class="rounded-xl border p-1 w-44 bg-white"/></td>
        <td><input type="text"  data-f="author_twitter" data-id="${r.id}" value="${esc(r.author_twitter||'')}" class="rounded-xl border p-1 w-44 bg-white"/></td>
        <td><input type="url"   data-f="ao3_link" data-id="${r.id}" value="${esc(r.ao3_link||'')}" class="rounded-xl border p-1 w-52 bg-white"/></td>
        <td><textarea data-f="notes" data-id="${r.id}" rows="2" class="rounded-xl border p-1 w-60 bg-white">${esc(r.notes||'')}</textarea></td>
      </tr>
    `).join('') || `<tr><td colspan="6" class="p-2 opacity-60">No data</td></tr>`;

    // status change
    $$('#tbC select').forEach(sel=>{
      sel.onchange = async()=>{ await sb.from('claims').update({status:sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
    });
    // inline inputs
    $$('#tbC [data-f]').forEach(inp=>{
      inp.onchange = async()=>{
        const field = inp.dataset.f, id = inp.dataset.id;
        await sb.from('claims').update({ [field]: inp.value }).eq('id', id);
        toast('Saved');
      };
    });
  },

  async authors(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
          <div class="flex items-center gap-2">
            <input id="fileA" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impA" class="btn-lite">Import</button>
            <button id="expA" class="btn-lite">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Name</th><th>Claimed Date</th><th>Progress</th><th>Email</th><th>Twitter</th><th>Action (DM/Email/Checked)</th><th>Notes</th></tr></thead>
            <tbody id="tbA"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impA').onclick = async()=>{ const f=$('#fileA').files[0]; if(!f) return toast('Pilih file'); await importWorkbook(f,'authors'); VIEWS.authors(); };
    $('#expA').onclick = async()=>{ const {data=[]}=await sb.from('authors').select('*').order('created_at',{ascending:false}); download('authors.csv', toCSV(data)); };

    const PROG = ['idea','outline','draft','beta','ready','posted'];
    const { data=[] } = await sb.from('authors').select('*').order('created_at',{ascending:false});
    $('#tbA').innerHTML = data.map(r=>{
      const prog = `<select data-id="${r.id}" data-f="progress" class="rounded-lg border p-1">${PROG.map(p=>`<option ${r.progress===p?'selected':''}>${p}</option>`).join('')}</select>`;
      const today = new Date().toISOString().slice(0,10);
      return `<tr>
        <td>${esc(r.name||'')}</td>
        <td>${esc(r.claimed_date||'')}</td>
        <td>${prog}</td>
        <td><input type="email" data-f="email" data-id="${r.id}" value="${esc(r.email||'')}" class="rounded-xl border p-1 w-44 bg-white"/></td>
        <td><input type="text"  data-f="twitter" data-id="${r.id}" value="${esc(r.twitter||'')}" class="rounded-xl border p-1 w-40 bg-white"/></td>
        <td>
          <div class="flex items-center gap-2 flex-wrap">
            ${['dmed','emailed','checked'].map(a=>`
              <label class="inline-flex items-center gap-1">
                <input type="checkbox" data-action="${a}" data-author="${esc(r.name||'')}" />
                ${a} <input type="date" value="${today}" data-date-for="${a}" class="rounded border p-0.5 text-xs bg-white"/>
              </label>`).join('')}
          </div>
        </td>
        <td><input type="text" data-note-for="${esc(r.name||'')}" class="rounded-xl border p-1 w-48 bg-white" placeholder="note…"/></td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" class="p-2 opacity-60">No data</td></tr>`;

    // inline updates (progress/email/twitter)
    $$('#tbA [data-f]').forEach(el=>{
      el.onchange = async()=>{
        const id = el.dataset.id, field = el.dataset.f, val = el.value;
        await sb.from('authors').update({ [field]: val }).eq('id', id);
        toast('Saved');
      };
    });
    // outreach log (DM/Email/Checked)
    $$('#tbA input[type="checkbox"][data-action]').forEach(ch=>{
      ch.onchange = async()=>{
        const action = ch.dataset.action;
        const author = ch.dataset.author;
        const dateEl = ch.parentElement.querySelector(`[data-date-for="${action}"]`);
        const on_date = dateEl?.value || new Date().toISOString().slice(0,10);
        const noteEl  = $(`#tbA [data-note-for="${CSS.escape(author)}"]`);
        const note    = noteEl?.value || null;
        await sb.from('outreach').insert({ author_name: author, action, on_date, note });
        toast('Logged');
      };
    });
  },

  async announcements(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📢 Announcements</h2>
          <div class="flex items-center gap-2">
            <button id="newAnn" class="btn-lite">+ New</button>
          </div>
        </div>
        <form id="annForm" class="grid md:grid-cols-2 gap-2 mt-3 hidden">
          <input id="annTitle" class="rounded-xl border p-2 bg-white" placeholder="Title"/>
          <input id="annWhere" class="rounded-xl border p-2 bg-white" placeholder="Publish in (Twitter/AO3/…)" />
          <label class="inline-flex items-center gap-2 text-sm">
            <span>Schedule</span>
            <input id="annWhen" type="datetime-local" class="rounded-xl border p-1 bg-white"/>
          </label>
          <label class="inline-flex items-center gap-2 text-sm">
            <input id="annPub" type="checkbox" class="rounded"/> Publish now
          </label>
          <textarea id="annBody" rows="4" class="md:col-span-2 rounded-xl border p-2 bg-white" placeholder="Body…"></textarea>
          <button class="md:col-span-2 btn">Save</button>
        </form>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Title</th><th>Publish In</th><th>Schedule</th><th>Published</th><th>Created</th></tr></thead>
            <tbody id="annList"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#newAnn').onclick = ()=> $('#annForm').classList.toggle('hidden');
    $('#annForm').addEventListener('submit', async(e)=>{
      e.preventDefault();
      const row = {
        title: $('#annTitle').value.trim(),
        body: $('#annBody').value.trim(),
        publish_in: $('#annWhere').value.trim()||null,
        should_publish_at: $('#annWhen').value ? new Date($('#annWhen').value).toISOString() : null,
        is_published: $('#annPub').checked
      };
      if(!row.title) return;
      await sb.from('announcements').insert(row);
      toast('Saved'); VIEWS.announcements();
    });

    const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
    $('#annList').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.title||'')}</td>
        <td>${esc(r.publish_in||'-')}</td>
        <td>${r.should_publish_at? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy HH:mm'):'-'}</td>
        <td>${r.is_published?'Yes':'No'}</td>
        <td>${DateTime.fromISO(r.created_at).toFormat('dd LLL yyyy, HH:mm')}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="p-2 opacity-60">No announcements</td></tr>`;
  },

  async timeline(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
          <button id="tlAdd" class="btn-lite">Add</button>
        </div>
        <div id="tl-headline" class="grid md:grid-cols-2 gap-3 mt-3"></div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
            <tbody id="tbTL"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#tlAdd').onclick = async()=>{
      const phase = prompt('Phase?'); if(!phase) return;
      const date_range = prompt('Date range?')||null;
      const tasks = prompt('Tasks?')||null;
      const start = prompt('Start date (YYYY-MM-DD)? (optional)')||null;
      await sb.from('timeline').insert({ phase, date_range, tasks, start_date:start });
      VIEWS.timeline();
    };

    // Try DB, fallback ke static bila kosong/gagal
    let rows = [];
    try{
      const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
      rows = data.length ? data.map(r=>({ phase:r.phase, range:r.date_range, tasks:r.tasks, start:r.start_date })) : TL_STATIC;
    }catch{ rows = TL_STATIC; }

    const cur  = currentPhase(rows);
    const master = rows.find(r=>r.phase==='Masterlist Thread') || rows[rows.length-1];

    $('#tl-headline').innerHTML = `
      <div class="p-3 rounded-xl" style="background:var(--peach)">
        <div class="text-sm opacity-70">Now</div>
        <div class="text-lg font-semibold">${esc(cur.phase)}</div>
        <div class="mt-1 text-sm">${esc(cur.range||'')}</div>
        <div class="mt-1 text-sm opacity-80">${esc(cur.tasks||'')}</div>
      </div>
      <div class="p-3 rounded-xl" style="background:var(--peach)">
        <div class="text-sm opacity-70">Countdown to Masterlist</div>
        <div class="text-2xl font-bold" id="master-ct">—</div>
        <div class="mt-1 text-sm">${esc(master.range||'')}</div>
      </div>
    `;
    const tick = ()=>{ const el=$('#master-ct'); if(el) el.textContent = fmtCountdown(master.start); };
    tick(); setInterval(tick, 1000);

    $('#tbTL').innerHTML = rows.map(r=>`
      <tr><td>${esc(r.phase)}</td><td>${esc(r.range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start||'')}</td></tr>
    `).join('');
  },

  async design(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🎨 Design</h2>
          <button id="addD" class="btn-lite">+ New</button>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Post</th><th>Agenda</th><th>Due</th><th>Status</th><th>Link</th></tr></thead>
            <tbody id="tbD"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#addD').onclick = async()=>{
      const post = prompt('Post?'); if(!post) return;
      const agenda = prompt('Agenda?')||null;
      const due = prompt('Due date (YYYY-MM-DD)?')||null;
      const status = prompt('Status (pending/on progress/finished)?')||'pending';
      const link = prompt('Link?')||null;
      await sb.from('design').insert({ post, agenda, due_date:due, status, link }); VIEWS.design();
    };
    const { data=[] } = await sb.from('design').select('*').order('created_at',{ascending:false});
    $('#tbD').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.post||'')}</td>
        <td>${esc(r.agenda||'')}</td>
        <td>${esc(r.due_date||'')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${r.link? `<a class="underline" target="_blank" href="${esc(r.link)}">open</a>`:'—'}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>`;

    $$('#tbD select').forEach(sel=>{
      sel.onchange = async()=>{ await sb.from('design').update({status:sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
    });
  },
};

// default
setActive('overview'); VIEWS.overview();

/************ IMPORT workbook (.csv/.xlsx) ************/
async function importWorkbook(file, only){
  const sheets = await readWorkbook(file);

  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const H = ws.rows[0]; const R = ws.rows.slice(1);
    const h = H.map(x=>String(x).trim().toLowerCase());

    const gi = n => h.indexOf(n);

    // PROMPTS
    if(!only || only==='prompts'){
      const idx = {
        date: gi('prompt_date'),
        prompter: gi('prompter_name'),
        ao3: gi('prompter_ao3/twitter'),
        pairing: gi('pairing'),
        tags: gi('additonal_tags'),
        rating: gi('rating'),
        text: Math.max(gi('prompt'), gi('description'), gi('text')),
        bank: gi('prompt_bank_upload'),
        status: gi('status_prompt')
      };
      if(idx.text>-1){
        const rows = R.filter(r=> (r[idx.text]||'').toString().trim()!=='').map(r=>({
          prompt_date: r[idx.date]||null,
          prompter_name: r[idx.prompter]||null,
          prompter_ao3: r[idx.ao3]||null,
          pairing: r[idx.pairing]||null,
          additonal_tags: r[idx.tags]||null,
          rating: r[idx.rating]||null,
          text: r[idx.text]||null,
          prompt_bank_upload: r[idx.bank]||null,
          status: (r[idx.status]||'available').toString().toLowerCase()
        }));
        if(rows.length) await sb.from('prompts').insert(rows);
      }
    }

    // CLAIMS
    if(!only || only==='claims'){
      const idx = {
        pairing: gi('pairing'),
        status: Math.max(gi('status_works'), gi('status')),
        email: gi('author_email'),
        tw: gi('author_twitter'),
        ao3: gi('ao3 fulfilled'), // kolom kamu tulis “AO3 fulfilled”
        notes: gi('notes')
      };
      if(idx.pairing>-1){
        const rows = R.filter(r=> (r[idx.pairing]||r[idx.email]||r[idx.tw]||'').toString().trim()!=='').map(r=>({
          pairing: r[idx.pairing]||null,
          status: (r[idx.status]||'pending').toString().toLowerCase(),
          author_email: r[idx.email]||null,
          author_twitter: r[idx.tw]||null,
          ao3_link: r[idx.ao3]||null,
          notes: r[idx.notes]||null
        }));
        if(rows.length) await sb.from('claims').insert(rows);
      }
    }

    // AUTHORS
    if(!only || only==='authors'){
      const idx = {
        name: gi('claimed_by'),
        date: gi('claimed_date'),
        prog: Math.max(gi('status_works'), gi('progress')),
        email: gi('author_email'),
        tw: gi('author_twitter')
      };
      if(idx.name>-1 || idx.email>-1 || idx.tw>-1){
        const normProg = (v)=>{
          const s=String(v||'').toLowerCase();
          if(s.includes('idea')||s.includes('0')) return 'idea';
          if(s.includes('outline')||s.includes('20')) return 'outline';
          if(s.includes('draft')||s.includes('40')) return 'draft';
          if(s.includes('beta')||s.includes('60')) return 'beta';
          if(s.includes('ready')||s.includes('80')) return 'ready';
          if(s.includes('posted')||s.includes('100')) return 'posted';
          return s||null;
        };
        const rows = R.filter(r=> (r[idx.name]||r[idx.email]||r[idx.tw]||'').toString().trim()!=='').map(r=>({
          name: r[idx.name]||null,
          claimed_date: r[idx.date]||null,
          progress: normProg(r[idx.prog]),
          email: r[idx.email]||null,
          twitter: r[idx.tw]||null
        }));
        if(rows.length) await sb.from('authors').insert(rows);
      }
    }

    // ANNOUNCEMENTS
    if(!only || only==='announcements'){
      const idx = { title: gi('title'), where: gi('published in'), when: gi('when should be published?'), body: gi('body'), pub: gi('is_published') };
      if(idx.title>-1){
        const rows = R.filter(r=> (r[idx.title]||'').toString().trim()!=='').map(r=>({
          title: r[idx.title], body: idx.body>-1? r[idx.body]: null,
          publish_in: idx.where>-1? r[idx.where]: null,
          should_publish_at: idx.when>-1 && r[idx.when]? new Date(r[idx.when]).toISOString(): null,
          is_published: idx.pub>-1? /yes|true|1/i.test(String(r[idx.pub])) : false
        }));
        if(rows.length) await sb.from('announcements').insert(rows);
      }
    }

    // TIMELINE
    if(!only || only==='timeline'){
      const idx = { phase: gi('phase'), range: gi('date range'), tasks: gi('tasks'), start: gi('start_date') };
      if(idx.phase>-1){
        const rows = R.filter(r=> (r[idx.phase]||'').toString().trim()!=='').map(r=>({
          phase: r[idx.phase], date_range: r[idx.range]||null, tasks: r[idx.tasks]||null,
          start_date: r[idx.start]||null
        }));
        if(rows.length) await sb.from('timeline').insert(rows);
      }
    }

    // DESIGN
    if(!only || only==='design'){
      const idx = { post: gi('post'), agenda: gi('agenda'), due: gi('date to be submitted'), status: gi('status'), link: gi('link') };
      if(idx.post>-1){
        const rows = R.filter(r=> (r[idx.post]||'').toString().trim()!=='').map(r=>({
          post: r[idx.post], agenda: r[idx.agenda]||null,
          due_date: r[idx.due]||null,
          status: (r[idx.status]||'pending').toString().toLowerCase(),
          link: r[idx.link]||null
        }));
        if(rows.length) await sb.from('design').insert(rows);
      }
    }
  }
  return true;
}
