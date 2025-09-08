/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const esc = (s)=> (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); };

/************ NAV ************/
$('#nav')?.addEventListener('click', e=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  const v = el.dataset.view;
  setActive(v);
  (VIEWS[v]||VIEWS.overview)();
});
function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  $(`#nav [data-view="${v}"]`)?.classList.add('active');
}

/************ HELPERS ************/
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
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${map[s]||'#eee'}">${s}</span>`;
}
const ymd = (v)=> {
  if(!v) return null;
  // try parse excel date or yyyy-mm-dd
  const d = new Date(v); if(!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
};
const clean = (v)=> (v==null? null : String(v).trim());

/************ OVERVIEW ************/
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAll" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAll" class="btn">Import</button>
            <button id="btnExportAll" class="btn">Export CSVs</button>
          </div>
        </div>
        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="text-sm">Total Prompts</div><div id="kPrompts" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Available Prompts</div><div id="kAvail" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Active Claims</div><div id="kClaims" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Authors</div><div id="kAuthors" class="text-2xl font-bold">—</div></div>
        </div>

        <div class="grid md:grid-cols-2 gap-3 mt-4">
          <div class="p-3 rounded-2xl card">
            <div class="text-sm font-medium mb-1">Pairing distribution — Prompter</div>
            <canvas id="piePrompter" height="220"></canvas>
          </div>
          <div class="p-3 rounded-2xl card">
            <div class="text-sm font-medium mb-1">Pairing distribution — Claimed</div>
            <canvas id="pieClaimed" height="220"></canvas>
          </div>
        </div>

        <div class="p-3 rounded-2xl card mt-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">🗓️ Headline</h3>
            <div class="text-sm opacity-70">Live countdown</div>
          </div>
          <div id="headline" class="grid md:grid-cols-2 gap-3 mt-2"></div>
        </div>
      </section>
    `;

    // actions
    $('#btnImportAll').onclick = async ()=>{
      const f = $('#fileAll').files[0]; if(!f) return toast('Pilih file dulu');
      const res = await importAllSheets(f);
      toast(`✅ Imported: ${Object.entries(res).map(([k,v])=>`${k}:${v}`).join(' · ') || '0'}`);
      VIEWS.overview();
    };
    $('#btnExportAll').onclick = exportAllCSVs;

    // KPIs
    const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
    $('#kPrompts').textContent = stats?.prompts_total ?? 0;
    $('#kAvail').textContent   = stats?.prompts_available ?? 0;
    $('#kClaims').textContent  = stats?.claims_active ?? 0;
    $('#kAuthors').textContent = stats?.authors_total ?? 0;

    // Pies
    drawPie(await fetchPairingPrompter(),  $('#piePrompter'), 'Prompter');
    drawPie(await fetchPairingClaimed(),   $('#pieClaimed'),  'Claimed');

    // Headline (Author Sign-ups + Check-In)
    await renderHeadline($('#headline'));
  },

  /******** PROMPTS ********/
  async prompts(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div class="flex items-center gap-2">
            <input id="fileP" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impP" class="btn">Import</button>
            <button id="expP" class="btn">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Prompt</th><th>Pairing</th><th>Tags</th><th>Status</th></tr></thead>
            <tbody id="tbP"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impP').onclick = ()=> importPartial($('#fileP'),'prompts');
    $('#expP').onclick = async ()=>{
      const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
      download('prompts.csv', toCSV(data));
    };
    const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    $('#tbP').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.text||'')}</td>
        <td>${esc(r.pairing||'')}</td>
        <td>${Array.isArray(r.tags)? r.tags.map(t=>`<span class="pill mr-1">${esc(t)}</span>`).join('') : esc(r.tags||'')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
    $$('#tbP select').forEach(sel=>{
      sel.onchange = async ()=>{
        await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id);
        toast('Updated');
      };
    });
  },

  /******** CLAIMS ********/
  async claims(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">✍️ Claims</h2>
          <div class="flex items-center gap-2">
            <input id="fileC" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impC" class="btn">Import</button>
            <button id="expC" class="btn">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Prompt</th><th>Pairing</th><th>Tags</th><th>Status</th><th>AO3</th><th>Notes</th></tr></thead>
            <tbody id="tbC"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impC').onclick = ()=> importPartial($('#fileC'),'claims');
    $('#expC').onclick = async ()=>{
      const {data=[]} = await sb.from('claims').select('*').order('created_at',{ascending:false});
      download('claims.csv', toCSV(data));
    };

    // fetch claims + prompts to enrich prompt/tags
    const [{data: claims=[]},{data: prompts=[]}] = await Promise.all([
      sb.from('claims').select('*').order('created_at',{ascending:false}),
      sb.from('prompts').select('id,text,pairing,tags')
    ]);
    const byPair = new Map();
    prompts.forEach(p=>{
      const key = (p.pairing||'').toLowerCase().trim();
      if(key && !byPair.has(key)) byPair.set(key, p);
    });
    $('#tbC').innerHTML = claims.map(r=>{
      const p = byPair.get(String(r.pairing||'').toLowerCase().trim());
      const tags = p?.tags ?? [];
      return `
        <tr>
          <td>${esc(p?.text || '(—)')}</td>
          <td>${esc(r.pairing||p?.pairing||'')}</td>
          <td>${Array.isArray(tags)? tags.map(t=>`<span class="pill mr-1">${esc(t)}</span>`).join(''): esc(tags||'')}</td>
          <td>
            <select data-id="${r.id}" class="rounded-lg border p-1">
              ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </td>
          <td>
            <input data-id="${r.id}" data-col="ao3_link" class="rounded-lg border p-1 w-40" placeholder="https://…" value="${esc(r.ao3_link||'')}"/>
          </td>
          <td>
            <input data-id="${r.id}" data-col="notes" class="rounded-lg border p-1 w-56" placeholder="Notes…" value="${esc(r.notes||'')}"/>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="p-2 opacity-60">No data</td></tr>';

    // handlers
    $$('#tbC select').forEach(sel=>{
      sel.onchange = async ()=>{ await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
    });
    $$('#tbC input').forEach(inp=>{
      inp.onchange = async ()=>{
        const col = inp.dataset.col;
        await sb.from('claims').update({ [col]: inp.value }).eq('id', inp.dataset.id);
        toast('Saved');
      };
    });
  },

  /******** AUTHORS ********/
  async authors(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
          <div class="flex items-center gap-2">
            <input id="fileA" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impA" class="btn">Import</button>
            <button id="expA" class="btn">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Claimed By</th><th>Claimed Date</th><th>Progress</th><th>Email</th><th>Twitter</th><th>Prompt/Pairing/Desc</th></tr></thead>
            <tbody id="tbA"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impA').onclick = ()=> importPartial($('#fileA'),'authors');
    $('#expA').onclick = async ()=>{
      const {data=[]} = await sb.from('authors').select('*').order('created_at',{ascending:false});
      download('authors.csv', toCSV(data));
    };

    const [{data=[]},{data: prompts=[]}] = await Promise.all([
      sb.from('authors').select('*').order('created_at',{ascending:false}),
      sb.from('prompts').select('pairing,text,tags')
    ]);
    const byPair = new Map();
    prompts.forEach(p=> byPair.set(String(p.pairing||'').toLowerCase().trim(), p));
    const PROG_OPTS = ['idea','outline','draft','beta','ready','posted'];

    $('#tbA').innerHTML = data.map(r=>{
      const p = byPair.get(String(r.pairing||'').toLowerCase().trim()); // kalau authors punya kolom pairing; jika tidak, kosong
      return `
        <tr>
          <td>${esc(r.name||'')}</td>
          <td>${esc(r.claimed_date||'')}</td>
          <td>
            <select data-id="${r.id}" data-col="progress" class="rounded-lg border p-1">
              ${PROG_OPTS.map(s=>`<option ${r.progress===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><input data-id="${r.id}" data-col="email"   class="rounded-lg border p-1 w-44" value="${esc(r.email||'')}" placeholder="email"/></td>
          <td><input data-id="${r.id}" data-col="twitter" class="rounded-lg border p-1 w-40" value="${esc(r.twitter||'')}" placeholder="@handle"/></td>
          <td>
            <div class="text-xs">
              <div class="font-medium">${esc(p?.text||'(prompt not linked)')}</div>
              <div class="opacity-70">${esc(r.pairing||p?.pairing||'')}</div>
              ${Array.isArray(p?.tags)? p.tags.map(t=>`<span class="pill mr-1">${esc(t)}</span>`).join('') : ''}
            </div>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="p-2 opacity-60">No data</td></tr>';

    // Save handlers
    $$('#tbA select').forEach(sel=>{
      sel.onchange = async ()=>{ await sb.from('authors').update({[sel.dataset.col]: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
    });
    $$('#tbA input').forEach(inp=>{
      inp.onchange = async ()=>{ await sb.from('authors').update({[inp.dataset.col]: inp.value}).eq('id', inp.dataset.id); toast('Saved'); };
    });
  },

  /******** ANNOUNCEMENTS ********/
  async announcements(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold mb-2">📢 Announcements</h2>
        <form id="annForm" class="grid md:grid-cols-2 gap-2">
          <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
          <input id="annChannel" class="rounded-xl border p-2" placeholder="Publish in (Twitter/AO3/...)"/>
          <textarea id="annBody" rows="3" class="md:col-span-2 rounded-xl border p-2" placeholder="Body…"></textarea>
          <input id="annWhen" type="datetime-local" class="rounded-xl border p-2"/>
          <label class="inline-flex items-center gap-2 text-sm"><input id="annPub" type="checkbox" class="rounded"/> Publish now</label>
          <button class="md:col-span-2 btn btn-dark">Save</button>
        </form>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Title</th><th>Publish in</th><th>When</th><th>Published?</th></tr></thead>
            <tbody id="annList"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#annForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const row = {
        title: $('#annTitle').value.trim(),
        body: $('#annBody').value.trim(),
        publish_in: $('#annChannel').value.trim() || null,
        should_publish_at: $('#annWhen').value ? new Date($('#annWhen').value).toISOString() : null,
        is_published: $('#annPub').checked
      };
      if(!row.title) return;
      await sb.from('announcements').insert(row);
      toast('Saved'); VIEWS.announcements();
    });
    const {data=[]} = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
    $('#annList').innerHTML = data.map(r=>`
      <tr><td>${esc(r.title||'')}</td><td>${esc(r.publish_in||'')}</td><td>${r.should_publish_at ? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy, HH:mm'):'—'}</td><td>${r.is_published?'Yes':'No'}</td></tr>
    `).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
  },

  /******** TIMELINE ********/
  async timeline(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
          <button id="addTL" class="btn">Add</button>
        </div>
        <div id="headline" class="grid md:grid-cols-2 gap-3 mt-3"></div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
            <tbody id="tbTL"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#addTL').onclick = async ()=>{
      const phase = prompt('Phase?'); if(!phase) return;
      const range = prompt('Date range (text)')||null;
      const tasks = prompt('Tasks')||null;
      const start = prompt('Start date (YYYY-MM-DD, optional)')||null;
      await sb.from('timeline').upsert({ phase, date_range: range, tasks, start_date: start }, { onConflict:'phase' });
      VIEWS.timeline();
    };

    await renderHeadline($('#headline'));
    const {data=[]} = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
    $('#tbTL').innerHTML = data.map(r=>`<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
  },

  /******** DESIGN ********/
  async design(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">🎨 Design</h2>
          <div class="flex items-center gap-2">
            <input id="fileD" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impD" class="btn">Import</button>
            <button id="expD" class="btn">Export CSV</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Post</th><th>Agenda</th><th>Due</th><th>Status</th><th>Link</th></tr></thead>
            <tbody id="tbD"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impD').onclick = ()=> importPartial($('#fileD'),'design');
    $('#expD').onclick = async ()=>{
      const {data=[]} = await sb.from('design').select('*').order('created_at',{ascending:false});
      download('design.csv', toCSV(data));
    };
    const {data=[]} = await sb.from('design').select('*').order('created_at',{ascending:false});
    $('#tbD').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.post||'')}</td>
        <td>${esc(r.agenda||'')}</td>
        <td>${esc(r.due_date||'')}</td>
        <td>
          <select data-id="${r.id}" data-col="status" class="rounded-lg border p-1">
            ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input data-id="${r.id}" data-col="link" class="rounded-lg border p-1 w-56" value="${esc(r.link||'')}" placeholder="https://…"/></td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>';
    $$('#tbD select').forEach(sel=>{
      sel.onchange = async ()=>{ await sb.from('design').update({[sel.dataset.col]: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
    });
    $$('#tbD input').forEach(inp=>{
      inp.onchange = async ()=>{ await sb.from('design').update({[inp.dataset.col]: inp.value}).eq('id', inp.dataset.id); toast('Saved'); };
    });
  }
};

/************ DEFAULT ************/
setActive('overview'); VIEWS.overview();

/************ NOTES (save & recent) ************/
const MODS = ['Nio','Sha','Naya','Cinta'];

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
  $('#modNote').value = '';
  toast('Saved');
  loadRecent();
}
async function loadRecent(){
  const { data=[] } = await sb.from('mod_notes').select('*')
    .order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note ? ' · '+esc(x.note) : ''}
    </div>
  `).join('') : '<div class="opacity-60">No notes yet.</div>';
}
// init notes
$('#modSave')?.addEventListener('click', saveNotes);
(() => { const d=$('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10); loadRecent(); })();

/************ PIE CHARTS ************/
function drawPie(map, canvas, label){
  const labels = Object.keys(map);
  const data   = Object.values(map);
  if(!canvas) return;
  new Chart(canvas, {
    type: 'pie',
    data: { labels, datasets: [{ data }] },
    options: { plugins: { legend: { position:'bottom' }, title:{ display:false, text:label } } }
  });
}

async function fetchPairingPrompter(){
  const {data=[]} = await sb.from('prompts').select('pairing');
  const m={}; data.forEach(r=>{ const k=(r.pairing||'unknown').trim(); m[k]=(m[k]||0)+1; });
  return m;
}
async function fetchPairingClaimed(){
  const {data=[]} = await sb.from('claims').select('pairing,status');
  const m={}; data.filter(r=>['claimed','submitted','posted'].includes((r.status||'').toLowerCase()))
    .forEach(r=>{ const k=(r.pairing||'unknown').trim(); m[k]=(m[k]||0)+1; });
  return m;
}

/************ HEADLINE COUNTDOWN ************/
function fmtCountdown(targetISO){
  if(!targetISO) return '—';
  const end = new Date(targetISO).getTime();
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

/************ IMPORT XLSX (All-in-one OR per sheet) ************/
async function importAllSheets(file){
  const sheets = await readWorkbook(file);
  // coba deteksi mode: satu sheet bernama allsheets_for_website?
  const one = sheets.find(s=>/^allsheets_for_website$/i.test(s.name));
  if(one) return importFromOneSheet(one);
  // kalau tidak, pakai 6 sheet terpisah
  const res = {prompts:0,claims:0,authors:0,announcements:0,timeline:0,design:0};
  for(const s of sheets){
    if(/^prompts$/i.test(s.name))        res.prompts       += await upsertPrompts(s);
    else if(/^claims$/i.test(s.name))    res.claims        += await upsertClaims(s);
    else if(/^authors$/i.test(s.name))   res.authors       += await upsertAuthors(s);
    else if(/^announcements$/i.test(s.name)) res.announcements += await upsertAnnouncements(s);
    else if(/^timeline$/i.test(s.name))  res.timeline      += await upsertTimeline(s);
    else if(/^design$/i.test(s.name))    res.design        += await upsertDesign(s);
  }
  return res;
}

async function importPartial(inputEl, target){
  const f = inputEl?.files?.[0]; if(!f) return toast('Pilih file dulu');
  const [sheet] = await readWorkbook(f);
  let n=0;
  if(target==='prompts') n = await upsertPrompts(sheet);
  if(target==='claims')  n = await upsertClaims(sheet);
  if(target==='authors') n = await upsertAuthors(sheet);
  if(target==='announcements') n = await upsertAnnouncements(sheet);
  if(target==='timeline') n = await upsertTimeline(sheet);
  if(target==='design')  n = await upsertDesign(sheet);
  toast(`✅ ${target}: ${n}`);
  (VIEWS[target]||VIEWS.overview)();
}

function readWorkbook(file){
  return new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      const out=[];
      if(file.name.toLowerCase().endsWith('.csv')){
        const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
        out.push({name:'CSV', rows});
      }else{
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        wb.SheetNames.forEach(n=>{
          out.push({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''})});
        });
      }
      resolve(out);
    };
    if(file.name.toLowerCase().endsWith('.csv')) fr.readAsText(file);
    else fr.readAsArrayBuffer(file);
  });
}
function rowsToObjects(rows){
  if(!rows.length) return [];
  const head = rows[0].map(h=>String(h).trim());
  return rows.slice(1).map(r=>{
    const obj={}; head.forEach((k,i)=> obj[k]=r[i]); return obj;
  });
}

/************ UPSERT: ALLSHEETS SINGLE SHEET ************/
async function importFromOneSheet(ws){
  const objs = rowsToObjects(ws.rows);
  let cP=0,cC=0,cA=0,cN=0,cT=0,cD=0;

  // Prompts
  {
    const rows = objs.filter(r=>r.prompt || r.description).map(r=>({
      prompt_date: ymd(r.prompt_date),
      prompter_name: clean(r.prompter_name),
      prompter_ao3: clean(r['prompter_ao3/twitter']||r.prompter_ao3||r.prompter_twitter),
      pairing: clean(r.pairing),
      additonal_tags: clean(r.additonal_tags),
      rating: clean(r.rating),
      text: clean(r.prompt || r.description),
      prompt_bank_upload: clean(r.prompt_bank_upload),
      status: (clean(r.status_prompt)||'available').toLowerCase()
    })).filter(x=>x.text);
    if(rows.length){ const {count} = await sb.from('prompts').insert(rows, {count:'exact'}); cP += (count||0); }
  }

  // Claims
  {
    const rows = objs.filter(r=>r.status_works || r.pairing).map(r=>({
      pairing: clean(r.pairing),
      status: (clean(r.status_works)||'pending').toLowerCase(),
      author_email: clean(r.author_email),
      author_twitter: clean(r.author_twitter),
      ao3_link: clean(r['AO3 fulfilled']),
      notes: clean(r.notes)
    })).filter(x=>x.pairing || x.ao3_link || x.status);
    if(rows.length){ const {count} = await sb.from('claims').insert(rows, {count:'exact'}); cC += (count||0); }
  }

  // Authors
  {
    const rows = objs.filter(r=>r.claimed_by).map(r=>({
      name: clean(r.claimed_by),
      claimed_date: ymd(r.claimed_date),
      progress: (clean(r.status_works)||'idea').toLowerCase(),
      email: clean(r.author_email),
      twitter: clean(r.author_twitter),
      pairing: clean(r.pairing) || null  // kalau kamu tambahkan kolom pairing di authors
    }));
    if(rows.length){ const {count} = await sb.from('authors').insert(rows, {count:'exact'}); cA += (count||0); }
  }

  // Announcements
  {
    const rows = objs.filter(r=>r.Title || r.title).map(r=>({
      title: clean(r.Title||r.title),
      body: clean(r.Body||r.body),
      publish_in: clean(r['Published in']||r.publish_in),
      should_publish_at: ymd(r['When should be published?']||r.should_publish_at),
      is_published: String(r.is_published||'').toLowerCase()==='true'
    }));
    if(rows.length){ const {count} = await sb.from('announcements').insert(rows, {count:'exact'}); cN += (count||0); }
  }

  // Timeline
  {
    const rows = objs.filter(r=>r.Phase || r.phase).map(r=>({
      phase: clean(r.Phase||r.phase),
      date_range: clean(r['Date Range']||r.date_range),
      tasks: clean(r.Tasks||r.tasks),
      start_date: ymd(r.start_date)
    })).filter(x=>x.phase);
    for(const r of rows){ await sb.from('timeline').upsert(r, { onConflict:'phase' }); cT++; }
  }

  // Design
  {
    const rows = objs.filter(r=>r.Post || r.post).map(r=>({
      post: clean(r.Post||r.post),
      agenda: clean(r.Agenda||r.agenda),
      due_date: ymd(r['Date to be submitted']||r.due_date),
      status: (clean(r.status)||'pending').toLowerCase(),
      link: clean(r.link)
    }));
    if(rows.length){ const {count} = await sb.from('design').insert(rows, {count:'exact'}); cD += (count||0); }
  }

  return {prompts:cP,claims:cC,authors:cA,announcements:cN,timeline:cT,design:cD};
}

/************ UPSERT: PER SHEET ************/
async function upsertPrompts(ws){
  const rows = rowsToObjects(ws.rows).map(r=>({
    prompt_date: ymd(r.prompt_date),
    prompter_name: clean(r.prompter_name),
    prompter_ao3: clean(r['prompter_ao3/twitter']||r.prompter_ao3||r.prompter_twitter),
    pairing: clean(r.pairing),
    additonal_tags: clean(r.additonal_tags),
    rating: clean(r.rating),
    text: clean(r.prompt || r.description),
    prompt_bank_upload: clean(r.prompt_bank_upload),
    status: (clean(r.status_prompt)||'available').toLowerCase()
  })).filter(x=>x.text);
  if(!rows.length) return 0;
  const {count} = await sb.from('prompts').insert(rows, {count:'exact'});
  return count||0;
}
async function upsertClaims(ws){
  const rows = rowsToObjects(ws.rows).map(r=>({
    pairing: clean(r.pairing),
    status: (clean(r.status_works)||'pending').toLowerCase(),
    author_email: clean(r.author_email),
    author_twitter: clean(r.author_twitter),
    ao3_link: clean(r['AO3 fulfilled']),
    notes: clean(r.notes)
  })).filter(x=>x.pairing || x.ao3_link || x.status);
  if(!rows.length) return 0;
  const {count} = await sb.from('claims').insert(rows, {count:'exact'});
  return count||0;
}
async function upsertAuthors(ws){
  const rows = rowsToObjects(ws.rows).map(r=>({
    name: clean(r.claimed_by || r.name),
    claimed_date: ymd(r.claimed_date),
    progress: (clean(r.status_works)||'idea').toLowerCase(),
    email: clean(r.author_email || r.email),
    twitter: clean(r.author_twitter || r.twitter),
    pairing: clean(r.pairing) || null
  })).filter(x=>x.name);
  if(!rows.length) return 0;
  const {count} = await sb.from('authors').insert(rows, {count:'exact'});
  return count||0;
}
async function upsertAnnouncements(ws){
  const rows = rowsToObjects(ws.rows).map(r=>({
    title: clean(r.Title||r.title),
    body: clean(r.Body||r.body),
    publish_in: clean(r['Published in']||r.publish_in),
    should_publish_at: ymd(r['When should be published?']||r.should_publish_at),
    is_published: String(r.is_published||'').toLowerCase()==='true'
  })).filter(x=>x.title);
  if(!rows.length) return 0;
  const {count} = await sb.from('announcements').insert(rows, {count:'exact'});
  return count||0;
}
async function upsertTimeline(ws){
  const rows = rowsToObjects(ws.rows).map(r=>({
    phase: clean(r.Phase||r.phase),
    date_range: clean(r['Date Range']||r.date_range),
    tasks: clean(r.Tasks||r.tasks),
    start_date: ymd(r.start_date)
  })).filter(x=>x.phase);
  for(const r of rows){ await sb.from('timeline').upsert(r, { onConflict:'phase' }); }
  return rows.length;
}
async function upsertDesign(ws){
  const rows = rowsToObjects(ws.rows).map(r=>({
    post: clean(r.Post||r.post),
    agenda: clean(r.Agenda||r.agenda),
    due_date: ymd(r['Date to be submitted']||r.due_date),
    status: (clean(r.status)||'pending').toLowerCase(),
    link: clean(r.link)
  })).filter(x=>x.post);
  if(!rows.length) return 0;
  const {count} = await sb.from('design').insert(rows, {count:'exact'});
  return count||0;
}

/************ EXPORT ALL (quick) ************/
async function exportAllCSVs(){
  const tables = ['prompts','claims','authors','announcements','timeline','design'];
  for(const t of tables){
    const {data=[]}=await sb.from(t).select('*');
    download(`${t}.csv`, toCSV(data));
  }
  toast('Exported');
}
