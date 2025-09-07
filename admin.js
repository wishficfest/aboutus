/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

/************ BOOT ************/
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (m)=>{const t=$('#toast');t.textContent=m;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),1400);};
function setActive(v){ $$('#nav .nav-btn').forEach(b=>b.classList.toggle('ring-2', b.dataset.view===v)); }

/************ NAV ************/
$('#nav').addEventListener('click', e=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  const view = el.dataset.view; setActive(view); (VIEWS[view]||VIEWS.overview)();
});

/************ XLSX helpers ************/
function readWorkbook(file){
  return new Promise((resolve)=>{
    const fr=new FileReader();
    fr.onload=e=>{
      const arr=new Uint8Array(e.target.result);
      const wb=XLSX.read(arr,{type:'array'});
      const out=[]; wb.SheetNames.forEach(n=>{
        out.push({name:n,rows:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:''})});
      }); resolve(out);
    };
    fr.readAsArrayBuffer(file);
  });
}
function toCSV(rows){
  if(!rows?.length) return ''; const keys=Object.keys(rows[0]);
  return [keys.join(',')].concat(rows.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n');
}

/************ OVERVIEW ************/
async function overview(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">📊 Overview</h2>
        <div class="flex items-center gap-2">
          <input id="fileAll" type="file" accept=".xlsx,.csv" class="rounded-xl border p-2 bg-white"/>
          <button id="btnAll" class="px-3 py-2 rounded-xl">Import allsheet</button>
        </div>
      </div>
      <div class="grid md:grid-cols-4 gap-3 mt-3">
        <div class="kpi"><div class="text-sm">Total Prompts</div><div id="k1" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm">Available</div><div id="k2" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm">Active Claims</div><div id="k3" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm">Authors</div><div id="k4" class="text-2xl font-bold">—</div></div>
      </div>
    </section>

    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">🗓️ Where we are now</h2>
        <div class="text-sm opacity-70">Countdown to Masterlist</div>
      </div>
      <div id="headline" class="grid md:grid-cols-2 gap-3 mt-2"></div>
    </section>
  `;
  // stats
  const { data: s } = await sb.from('v_stats').select('*').maybeSingle();
  $('#k1').textContent = s?.prompts_total ?? 0;
  $('#k2').textContent = s?.prompts_available ?? 0;
  $('#k3').textContent = s?.claims_active ?? 0;
  $('#k4').textContent = s?.authors_total ?? 0;

  // headline
  renderHeadline($('#headline'));

  // import
  $('#btnAll').onclick = async ()=>{
    const f=$('#fileAll').files[0]; if(!f) return toast('Pilih file .xlsx');
    await importAllSheets(f); toast('Imported'); overview();
  };
}

function fmtCountdown(iso){
  const ts = DateTime.fromISO(iso||''); if(!ts.isValid) return '—';
  let s = Math.max(0, Math.floor((ts.toMillis()-Date.now())/1000));
  const d=Math.floor(s/86400); s%=86400; const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); const sc=s%60;
  return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
}
async function renderHeadline(root){
  const { data: tl=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true});
  if(!tl.length){ root.innerHTML='<div class="p-3 rounded-xl" style="background:var(--peach)">Timeline kosong.</div>'; return; }
  // nearest phase >= today
  const today = DateTime.now().toISODate();
  const next = tl.find(r=> (r.start_date||'')>=today ) || tl[tl.length-1];
  const master = tl.find(r=> r.phase==='Masterlist Thread') || tl[tl.length-1];

  root.innerHTML = `
    <div class="p-3 rounded-xl" style="background:var(--peach)">
      <div class="text-sm opacity-70">Next</div>
      <div class="text-lg font-semibold">${esc(next.phase)}</div>
      <div class="opacity-80">${esc(next.tasks||'')}</div>
      <div class="mt-2 text-2xl font-bold" data-c="${next.start_date||''}">—</div>
    </div>
    <div class="p-3 rounded-xl" style="background:var(--peach)">
      <div class="text-sm opacity-70">Masterlist</div>
      <div class="text-lg font-semibold">${esc(master.phase)}</div>
      <div class="opacity-80">${esc(master.tasks||'')}</div>
      <div class="mt-2 text-2xl font-bold" data-c="${master.start_date||''}">—</div>
    </div>`;
  const tick = ()=> $$('[data-c]').forEach(el=> el.textContent = fmtCountdown(el.dataset.c));
  tick(); setInterval(tick,1000);
}

/************ PROMPTS ************/
async function prompts(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">💡 Prompts</h2>
        <div class="flex items-center gap-2">
          <input id="fileP" type="file" accept=".xlsx,.csv" class="rounded-xl border p-2 bg-white"/>
          <button id="impP" class="px-3 py-2 rounded-xl">Import</button>
          <button id="expP" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Date</th><th>Prompter</th><th>AO3/Twitter</th><th>Pairing</th><th>Tags</th><th>Rating</th><th>Prompt</th><th>Status</th></tr></thead>
          <tbody id="tbP"></tbody>
        </table>
      </div>
    </section>`;
  $('#impP').onclick=()=>importSection($('#fileP'),'prompts');
  $('#expP').onclick=async()=>{const {data=[]}=await sb.from('prompts').select('*'); download('prompts.csv',toCSV(data));};
  const {data=[]}=await sb.from('prompts').select('*').order('created_at',{ascending:false});
  $('#tbP').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.prompt_date||'')}</td>
      <td>${esc(r.prompter_name||'')}</td>
      <td>${esc(r.prompter_ao3||'')}</td>
      <td>${esc(r.pairing||'')}</td>
      <td>${esc(r.additonal_tags||'')}</td>
      <td>${esc(r.rating||'')}</td>
      <td>${esc(r.text||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="p-2 opacity-60">No data</td></tr>';
  $$('#tbP select').forEach(s=> s.onchange=async()=>{await sb.from('prompts').update({status:s.value}).eq('id',s.dataset.id); toast('Updated');});
}

/************ CLAIMS ************/
async function claims(){
  $('#view').innerHTML=`
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">✍️ Claims</h2>
        <div class="flex items-center gap-2">
          <input id="fileC" type="file" accept=".xlsx,.csv" class="rounded-xl border p-2 bg-white"/>
          <button id="impC" class="px-3 py-2 rounded-xl">Import</button>
          <button id="expC" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Pairing</th><th>Status</th><th>Email</th><th>Twitter</th><th>AO3</th><th>Notes</th></tr></thead>
          <tbody id="tbC"></tbody>
        </table>
      </div>
    </section>`;
  $('#impC').onclick=()=>importSection($('#fileC'),'claims');
  $('#expC').onclick=async()=>{const {data=[]}=await sb.from('claims').select('*'); download('claims.csv',toCSV(data));};
  const {data=[]}=await sb.from('claims').select('*').order('created_at',{ascending:false});
  $('#tbC').innerHTML=data.map(r=>`
    <tr>
      <td>${esc(r.pairing||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input data-f="author_email" data-id="${r.id}" value="${esc(r.author_email||'')}" class="rounded-lg border p-1"/></td>
      <td><input data-f="author_twitter" data-id="${r.id}" value="${esc(r.author_twitter||'')}" class="rounded-lg border p-1"/></td>
      <td><input data-f="ao3_link" data-id="${r.id}" value="${esc(r.ao3_link||'')}" class="rounded-lg border p-1" placeholder="https://..."/></td>
      <td><textarea data-f="notes" data-id="${r.id}" rows="1" class="rounded-lg border p-1">${esc(r.notes||'')}</textarea></td>
    </tr>`).join('') || '<tr><td colspan="6" class="p-2 opacity-60">No data</td></tr>';
  $$('#tbC select').forEach(el=> el.onchange=()=>updateClaims(el.dataset.id,{status:el.value}));
  $$('#tbC [data-f]').forEach(el=> el.onchange=()=>updateClaims(el.dataset.id,{[el.dataset.f]:el.value}));
}
async function updateClaims(id, patch){ await sb.from('claims').update(patch).eq('id',id); toast('Saved'); }

/************ AUTHORS ************/
const PROG = ['idea','outline','draft','beta','ready','posted'];
async function authors(){
  $('#view').innerHTML=`
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
        <div class="flex items-center gap-2">
          <input id="fileA" type="file" accept=".xlsx,.csv" class="rounded-xl border p-2 bg-white"/>
          <button id="impA" class="px-3 py-2 rounded-xl">Import</button>
          <button id="expA" class="px-3 py-2 rounded-xl">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Name</th><th>Tanggal</th><th>Progress</th><th>Email</th><th>Twitter</th><th>Actions (tgl)</th><th>Notes</th></tr></thead>
          <tbody id="tbA"></tbody>
        </table>
      </div>
    </section>`;
  $('#impA').onclick=()=>importSection($('#fileA'),'authors');
  $('#expA').onclick=async()=>{const {data=[]}=await sb.from('authors').select('*'); download('authors.csv',toCSV(data));};
  const {data=[]}=await sb.from('authors').select('*').order('created_at',{ascending:false});

  // Ambil action per penulis (dmed/emailed/checked) untuk hari ini
  const today = DateTime.now().toISODate();
  const {data: acts=[]}=await sb.from('outreach').select('*').eq('on_date',today);
  const key=(n,a)=>`${n}|${a}`;
  const map=new Map(acts.map(x=>[key(x.author_name,x.action),x]));

  $('#tbA').innerHTML = data.map(r=>{
    const dmed = map.get(key(r.name,'dmed'))?.id;
    const emailed = map.get(key(r.name,'emailed'))?.id;
    const checked = map.get(key(r.name,'checked'))?.id;
    return `<tr>
      <td>${esc(r.name||'')}</td>
      <td>${esc(r.claimed_date||'')}</td>
      <td>
        <select data-id="${r.id}" data-f="progress" class="rounded-lg border p-1">
          ${PROG.map(p=>`<option ${r.progress===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </td>
      <td><input data-id="${r.id}" data-f="email" value="${esc(r.email||'')}" class="rounded-lg border p-1"/></td>
      <td><input data-id="${r.id}" data-f="twitter" value="${esc(r.twitter||'')}" class="rounded-lg border p-1"/></td>
      <td>
        <label><input type="checkbox" data-act="dmed" data-name="${esc(r.name||'')} " ${dmed?'checked':''}/> DM</label>
        <label class="ml-2"><input type="checkbox" data-act="emailed" data-name="${esc(r.name||'')} " ${emailed?'checked':''}/> Email</label>
        <label class="ml-2"><input type="checkbox" data-act="checked" data-name="${esc(r.name||'')} " ${checked?'checked':''}/> Checked</label>
        <span class="text-xs opacity-60 ml-2">${today}</span>
      </td>
      <td><input class="rounded-lg border p-1" placeholder="catatan singkat…" data-note="${esc(r.name||'')}"/></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="p-2 opacity-60">No data</td></tr>';

  // update author
  $$('#tbA [data-f]').forEach(el=> el.onchange=()=> sb.from('authors').update({[el.dataset.f]:el.value}).eq('id',el.dataset.id).then(()=>toast('Saved')));
  // action checkbox
  $$('#tbA [data-act]').forEach(ch=> ch.onchange=async()=>{
    const row={author_name:ch.dataset.name.trim(), action:ch.dataset.act, on_date:today};
    if(ch.checked){ await sb.from('outreach').insert(row); }
    else{ await sb.from('outreach').delete().eq('author_name',row.author_name).eq('action',row.action).eq('on_date',today); }
  });
}

/************ ANNOUNCEMENTS ************/
async function announcements(){
  $('#view').innerHTML=`
    <section class="p-4 rounded-2xl card">
      <h2 class="text-xl font-semibold mb-2">📢 Announcements</h2>
      <form id="annF" class="grid md:grid-cols-2 gap-2">
        <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
        <input id="annWhere" class="rounded-xl border p-2" placeholder="Publish in (Twitter/AO3/...)"/>
        <input id="annWhen" type="datetime-local" class="rounded-xl border p-2"/>
        <textarea id="annBody" rows="3" class="md:col-span-2 rounded-xl border p-2" placeholder="Body…"></textarea>
        <button class="md:col-span-2 px-3 py-2 rounded-xl bg-black text-white">Save</button>
      </form>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Title</th><th>Publish in</th><th>When</th><th>Published?</th></tr></thead>
          <tbody id="annList"></tbody>
        </table>
      </div>
    </section>`;
  $('#annF').onsubmit=async(e)=>{
    e.preventDefault();
    const row={
      title:$('#annTitle').value.trim(),
      body:$('#annBody').value.trim(),
      publish_in:$('#annWhere').value.trim(),
      should_publish_at: $('#annWhen').value? new Date($('#annWhen').value).toISOString() : null,
      is_published:false
    };
    if(!row.title) return;
    await sb.from('announcements').insert(row); toast('Saved'); announcements();
  };
  const {data=[]}=await sb.from('announcements').select('*').order('created_at',{ascending:false});
  $('#annList').innerHTML=data.map(r=>`
    <tr>
      <td>${esc(r.title||'')}</td>
      <td>${esc(r.publish_in||'-')}</td>
      <td>${r.should_publish_at? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy, HH:mm'):'-'}</td>
      <td><input type="checkbox" ${r.is_published?'checked':''} data-id="${r.id}" /></td>
    </tr>`).join('')||'<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
  $$('#annList input[type="checkbox"]').forEach(c=> c.onchange=()=> sb.from('announcements').update({is_published:c.checked}).eq('id',c.dataset.id));
}

/************ TIMELINE ************/
async function timeline(){
  $('#view').innerHTML=`
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
        <button id="addTL" class="px-3 py-2 rounded-xl">Add</button>
      </div>
      <div id="headline" class="grid md:grid-cols-2 gap-3 mt-2"></div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start (YYYY-MM-DD)</th></tr></thead>
          <tbody id="tbTL"></tbody>
        </table>
      </div>
    </section>`;
  renderHeadline($('#headline'));
  const load=async()=>{
    const {data=[]}=await sb.from('timeline').select('*').order('start_date',{ascending:true});
    $('#tbTL').innerHTML=data.map(r=>`
      <tr>
        <td>${esc(r.phase)}</td>
        <td>${esc(r.date_range||'')}</td>
        <td contenteditable data-id="${r.id}" data-f="tasks">${esc(r.tasks||'')}</td>
        <td contenteditable data-id="${r.id}" data-f="start_date">${esc(r.start_date||'')}</td>
      </tr>`).join('');
    $$('#tbTL [contenteditable]').forEach(el=> el.onblur=()=> sb.from('timeline').update({[el.dataset.f]:el.textContent.trim()||null}).eq('id',el.dataset.id));
  };
  $('#addTL').onclick=async()=>{
    const phase=prompt('Phase?'); if(!phase) return;
    const date_range=prompt('Date range (text)?')||null;
    const tasks=prompt('Tasks?')||null;
    const start_date=prompt('Start YYYY-MM-DD (optional)?')||null;
    await sb.from('timeline').insert({phase,date_range,tasks,start_date}); load();
  };
  load();
}

/************ DESIGN ************/
async function design(){
  $('#view').innerHTML=`
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🎨 Design</h2>
        <button id="addD" class="px-3 py-2 rounded-xl">Add</button>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Post</th><th>Agenda</th><th>Due</th><th>Status</th><th>Link</th></tr></thead>
          <tbody id="tbD"></tbody>
        </table>
      </div>
    </section>`;
  const load=async()=>{
    const {data=[]}=await sb.from('design').select('*').order('due_date',{ascending:true});
    $('#tbD').innerHTML=data.map(r=>`
      <tr>
        <td contenteditable data-id="${r.id}" data-f="post">${esc(r.post||'')}</td>
        <td contenteditable data-id="${r.id}" data-f="agenda">${esc(r.agenda||'')}</td>
        <td contenteditable data-id="${r.id}" data-f="due_date">${esc(r.due_date||'')}</td>
        <td>
          <select data-id="${r.id}" data-f="status" class="rounded-lg border p-1">
            ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td contenteditable data-id="${r.id}" data-f="link">${esc(r.link||'')}</td>
      </tr>`).join('')||'<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>';
    $$('#tbD [contenteditable]').forEach(el=> el.onblur=()=> sb.from('design').update({[el.dataset.f]:el.textContent.trim()||null}).eq('id',el.dataset.id));
    $$('#tbD select').forEach(el=> el.onchange=()=> sb.from('design').update({[el.dataset.f]:el.value}).eq('id',el.dataset.id));
  };
  $('#addD').onclick=async()=>{
    await sb.from('design').insert({post:'',agenda:'',due_date:null,status:'pending',link:null}); load();
  };
  load();
}

/************ NOTES (mood + status + tanggal + history) ************/
function notesInit(){
  const box=$('#notes');
  box.innerHTML=`
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <p class="text-sm mb-3">Update <i>mood</i> & status (available/away/slow) per hari.</p>
    ${['Nio','Sha','Naya','Cinta'].map(n=>`
      <div class="mb-2">
        <div class="text-sm font-medium mb-1">Mods ${n}</div>
        <div class="flex gap-2">
          <select id="${n}-mood" class="rounded-xl border p-1 grow">
            <option>(´･ω･`)</option><option>(＾▽＾)</option><option>(｡T ω T｡)</option><option>¯\\_(ツ)_/¯</option><option>(╯°□°)╯︵ ┻━┻</option>
          </select>
          <select id="${n}-status" class="rounded-xl border p-1">
            <option value="available">available</option>
            <option value="away">away</option>
            <option value="slow">slow</option>
          </select>
        </div>
      </div>
    `).join('')}
    <div class="mt-3 flex items-center gap-2">
      <input id="modDate" type="date" class="rounded-xl border p-1"/>
      <input id="modNote" class="rounded-xl border p-1 grow" placeholder="Catatan singkat…"/>
      <button id="modSave" class="px-3 py-2 rounded-xl bg-black text-white">Save</button>
    </div>
    <div class="mt-3 text-sm">
      <div class="font-medium mb-1">Recent</div>
      <div id="modRecent" class="space-y-1"></div>
    </div>
  `;
  $('#modDate').value = DateTime.now().toISODate();
  $('#modSave').onclick = async ()=>{
    const on_date = $('#modDate').value || DateTime.now().toISODate();
    for(const name of ['Nio','Sha','Naya','Cinta']){
      const row = {
        mod: name,
        on_date,
        mood: $(`#${name}-mood`).value,
        status: $(`#${name}-status`).value,
        note: $('#modNote').value.trim()||null
      };
      await sb.from('mod_notes').upsert(row,{onConflict:'mod,on_date'});
    }
    $('#modNote').value=''; loadRecent();
    toast('Notes saved');
  };
  async function loadRecent(){
    const {data=[]}=await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
    $('#modRecent').innerHTML = data.map(x=>`
      <div class="p-2 rounded-lg" style="background:var(--peach)">
        <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — <span class="pill">${esc(x.status)}</span>
        <span class="opacity-70 text-xs">(${x.on_date})</span>
        ${x.note? ' · '+esc(x.note):''}
      </div>`).join('') || '<div class="opacity-60">No notes yet.</div>';
  }
  loadRecent();
}

/************ IMPORT LOGIC ************/
async function importAllSheets(file){
  const sheets = await readWorkbook(file);
  // PROMPTS
  await upsertFromSheet(sheets, 'prompts', {
    prompt_date: ['prompt_date','date'],
    prompter_name: ['prompter_name','name'],
    prompter_ao3: ['prompter_ao3','prompter_twitter','ao3'],
    pairing: ['pairing'],
    additonal_tags: ['additonal_tags','tags'],
    rating: ['rating'],
    text: ['prompt','description'],
    prompt_bank_upload: ['prompt_bank_upload','bank'],
    status: ['status_prompt','status']
  });
  // CLAIMS
  await upsertFromSheet(sheets, 'claims', {
    pairing:['pairing'],
    status:['status_works','status'],
    author_email:['author_email','email'],
    author_twitter:['author_twitter','twitter'],
    ao3_link:['ao3','ao3_link'],
    notes:['notes']
  });
  // AUTHORS
  await upsertFromSheet(sheets, 'authors', {
    name:['claimed_by','author','name'],
    claimed_date:['claimed_date','tanggal'],
    progress:['status_works','progress'],
    email:['author_email','email'],
    twitter:['author_twitter','twitter']
  });
}
async function importSection(inputEl, target){
  const f=inputEl.files[0]; if(!f) return toast('Pilih file'); 
  const sheets=await readWorkbook(f);
  if(target==='prompts') await upsertFromSheet(sheets,'prompts',{prompt_date:['prompt_date','date'],prompter_name:['prompter_name'],prompter_ao3:['prompter_ao3','prompter_twitter'],pairing:['pairing'],additonal_tags:['additonal_tags','tags'],rating:['rating'],text:['prompt','description'],prompt_bank_upload:['prompt_bank_upload'],status:['status_prompt','status']});
  if(target==='claims')  await upsertFromSheet(sheets,'claims',{pairing:['pairing'],status:['status_works','status'],author_email:['author_email'],author_twitter:['author_twitter'],ao3_link:['ao3','ao3_link'],notes:['notes']});
  if(target==='authors') await upsertFromSheet(sheets,'authors',{name:['claimed_by','author','name'],claimed_date:['claimed_date'],progress:['status_works','progress'],email:['author_email'],twitter:['author_twitter']});
  toast('Imported');
  (VIEWS[target]||overview)();
}
async function upsertFromSheet(sheets, table, map){
  for(const ws of sheets){
    const [H,...R]=ws.rows; if(!H) continue;
    const head=H.map(h=>String(h).trim().toLowerCase());
    const gi=(names)=> head.findIndex(c=> names.some(n=>c===n));
    const idx={}; for(const k in map){ idx[k]=gi(map[k].map(s=>s.toLowerCase())); }
    // minimal satu kolom cocok
    if(Object.values(idx).every(v=>v<0)) continue;
    const rows=[];
    for(const r of R){
      const row={};
      let empty=true;
      for(const k in idx){
        const i=idx[k];
        if(i>=0){ row[k]=r[i]||null; if((r[i]??'').toString().trim()!=='') empty=false; }
      }
      if(!empty) rows.push(row);
    }
    if(rows.length) await sb.from(table).insert(rows);
  }
}
function download(name, text){
  const blob=new Blob([text],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}

/************ ROUTER ************/
const VIEWS = { overview, prompts, claims, authors, announcements, timeline, design };
notesInit();
setActive('overview'); overview();
