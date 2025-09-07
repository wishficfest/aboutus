/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); };

/************ HELPERS ************/
function setActive(v){ $$('#nav .nav-btn').forEach(x=>x.classList.remove('ring-2')); $(`#nav [data-view="${v}"]`)?.classList.add('ring-2'); }
function toCSV(arr){ if(!arr?.length) return ''; const keys=Object.keys(arr[0]); return [keys.join(',')].concat(arr.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))).join('\n'); }
function download(name, text){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }

/* XLSX → worksheets [{name, rows:[[...]]}] */
function readWorkbook(file){
  return new Promise(res=>{
    const fr=new FileReader();
    fr.onload = e=>{
      let sheets=[];
      if(file.name.toLowerCase().endsWith('.csv')){
        const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
        sheets.push({name:'CSV', rows});
      }else{
        const wb=XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        wb.SheetNames.forEach(n=> sheets.push({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''})}));
      }
      res(sheets);
    };
    file.name.toLowerCase().endsWith('.csv') ? fr.readAsText(file) : fr.readAsArrayBuffer(file);
  });
}
const arr = v => Array.isArray(v) ? v : String(v??'').split(/[,;]\s*/).filter(Boolean);

/************ ROUTER ************/
$('#nav').addEventListener('click', e=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  const v = el.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});

/************ VIEWS ************/
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAll" type="file" accept=".xlsx,.csv" class="rounded-xl border p-2 bg-white"/>
            <button id="impAll" class="px-3 py-2 rounded-xl">Import</button>
          </div>
        </div>
        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi card p-4"><div class="text-sm opacity-70">Total Prompts</div><div id="kTotal" class="text-2xl font-bold">—</div></div>
          <div class="kpi card p-4"><div class="text-sm opacity-70">Available Prompts</div><div id="kAvail" class="text-2xl font-bold">—</div></div>
          <div class="kpi card p-4"><div class="text-sm opacity-70">Active Claims</div><div id="kClaims" class="text-2xl font-bold">—</div></div>
          <div class="kpi card p-4"><div class="text-sm opacity-70">Authors</div><div id="kAuthors" class="text-2xl font-bold">—</div></div>
        </div>
        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div class="card p-4"><div class="text-sm opacity-70">Pairing % from prompter</div><div id="kPairAll" class="text-lg font-semibold">—</div></div>
          <div class="card p-4"><div class="text-sm opacity-70">Pairing % that claimed</div><div id="kPairClaimed" class="text-lg font-semibold">—</div></div>
        </div>
      </section>`;

    $('#impAll').onclick = async ()=>{
      const f = $('#fileAll').files[0]; if(!f) return toast('Pilih file terlebih dahulu');
      await importAllSheets(f); toast('✅ Import berhasil'); VIEWS.overview();
    };

    // KPIs
    const { data:stats } = await sb.from('v_stats').select('*').maybeSingle();
    const totals = stats || {prompts_total:0,prompts_available:0,claims_active:0,authors_total:0};
    $('#kTotal').textContent   = totals.prompts_total;
    $('#kAvail').textContent   = totals.prompts_available;
    $('#kClaims').textContent  = totals.claims_active;
    $('#kAuthors').textContent = totals.authors_total;

    // Pairing %
    // all prompts by pairing
    const { data:allP=[] } = await sb.from('prompts').select('pairing').not('pairing','is',null);
    const { data:claimedP=[] } = await sb.from('prompts').select('pairing,status').in('status',['claimed','fulfilled']);
    const dist = (rows)=> {
      const m=new Map(); rows.forEach(r=>{ const k=(r.pairing||'unknown').trim()||'unknown'; m.set(k,(m.get(k)||0)+1); });
      const sum = [...m.values()].reduce((a,b)=>a+b,0)||1;
      return [...m.entries()].map(([k,v])=>`${k}: ${(100*v/sum).toFixed(1)}%`).join(' • ') || '—';
    };
    $('#kPairAll').textContent     = dist(allP);
    $('#kPairClaimed').textContent = dist(claimedP);
  },

  async prompts(){
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
          <table class="min-w-full text-sm">
            <thead>
              <tr><th>Date</th><th>Prompter</th><th>AO3/Twitter</th><th>Pairing</th><th>Tags</th><th>Rating</th><th>Prompt / Description</th><th>Status</th></tr>
            </thead>
            <tbody id="tbP"></tbody>
          </table>
        </div>
      </section>`;

    $('#impP').onclick = ()=> importPerTarget($('#fileP')?.files?.[0],'prompts');
    $('#expP').onclick = async ()=>{
      const {data=[]}=await sb.from('prompts').select('*').order('created_at',{ascending:false});
      download('prompts.csv', toCSV(data));
    };

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
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" class="p-2 text-sm opacity-60">No data</td></tr>';

    $$('#tbP select').forEach(sel=>{
      sel.onchange = async ()=>{ await sb.from('prompts').update({status:sel.value}).eq('id', sel.dataset.id); toast('✅ Updated'); };
    });
  },

  async claims(){
    $('#view').innerHTML = `
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
          <table class="min-w-full text-sm">
            <thead><tr>
              <th>Prompt</th><th>Pairing</th><th>Description</th><th>Tags</th>
              <th>Status</th><th>AO3</th><th>Notes</th>
            </tr></thead>
            <tbody id="tbC"></tbody>
          </table>
        </div>
      </section>`;

    $('#impC').onclick = ()=> importPerTarget($('#fileC')?.files?.[0],'claims');
    $('#expC').onclick = async ()=>{
      const {data=[]}=await sb.from('claims').select('*').order('created_at',{ascending:false});
      download('claims.csv', toCSV(data));
    };

    // join ringan: ambil prompts lalu map by pairing/text
    const { data:PR=[] } = await sb.from('prompts').select('id,text,pairing,additonal_tags');
    const mapP = new Map(PR.map(p=>[p.id, p]));
    const { data=[] } = await sb.from('claims').select('*').order('created_at',{ascending:false});
    $('#tbC').innerHTML = data.map(r=>{
      const p = r.prompt_id? mapP.get(r.prompt_id) : null;
      return `<tr>
        <td>${esc(p?.text||'—')}</td>
        <td>${esc(p?.pairing||'—')}</td>
        <td>${esc(p?.text||'—')}</td>
        <td>${esc(p?.additonal_tags||'—')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['pending','approved','revoked','dropped','submitted','posted','claimed'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${r.ao3_link? `<a href="${esc(r.ao3_link)}" target="_blank" class="underline">link</a>` : '—'}</td>
        <td contenteditable data-note-id="${r.id}">${esc(r.notes||'')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="p-2 text-sm opacity-60">No data</td></tr>';

    $$('#tbC select').forEach(sel=>{
      sel.onchange = async ()=>{ await sb.from('claims').update({status:sel.value}).eq('id', sel.dataset.id); toast('✅ Updated'); };
    });
    $$('#tbC [contenteditable]').forEach(el=>{
      el.onblur = async ()=>{ await sb.from('claims').update({notes: el.textContent.trim()}).eq('id', el.dataset.noteId); toast('✅ Saved'); };
    });
  },

  async authors(){
    $('#view').innerHTML = `
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
          <table class="min-w-full text-sm">
            <thead>
              <tr>
                <th>Name</th><th>Claimed Date</th>
                <th>Prompt</th><th>Pairing</th><th>Description</th>
                <th>Progress</th><th>Email</th><th>Twitter</th>
                <th>Action (DM/Email/Checked)</th><th>Notes</th>
              </tr>
            </thead>
            <tbody id="tbA"></tbody>
          </table>
        </div>
      </section>`;

    $('#impA').onclick = ()=> importPerTarget($('#fileA')?.files?.[0],'authors');
    $('#expA').onclick = async ()=>{
      const {data=[]}=await sb.from('authors').select('*').order('created_at',{ascending:false});
      download('authors.csv', toCSV(data));
    };

    // load
    const { data:authors=[] } = await sb.from('authors').select('*').order('created_at',{ascending:false});
    // optional join claims/prompts by available info — fallback kosong
    $('#tbA').innerHTML = authors.map(a=>{
      const actDate = new Date().toISOString().slice(0,10);
      return `<tr>
        <td>${esc(a.name||'')}</td>
        <td>${esc(a.claimed_date||'')}</td>
        <td>${esc(a.prompt||'')}</td>
        <td>${esc(a.pairing||'')}</td>
        <td>${esc(a.description||'')}</td>
        <td>
          <select data-id="${a.id}" data-field="progress" class="rounded-lg border p-1">
            ${['idea','outline','draft','beta','ready','posted'].map(s=>`<option ${a.progress===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input data-id="${a.id}" data-field="email"   class="rounded-lg border p-1 w-44" value="${esc(a.email||'')}"/></td>
        <td><input data-id="${a.id}" data-field="twitter" class="rounded-lg border p-1 w-36" value="${esc(a.twitter||'')}"/></td>
        <td>
          <label class="mr-2 text-xs"><input type="checkbox" data-action="dmed"    data-name="${esc(a.name||'')}" /> dmed</label>
          <label class="mr-2 text-xs"><input type="checkbox" data-action="emailed" data-name="${esc(a.name||'')}" /> emailed</label>
          <label class="mr-2 text-xs"><input type="checkbox" data-action="checked" data-name="${esc(a.name||'')}" /> checked</label>
          <input type="date" class="rounded border p-1 text-xs" value="${actDate}" data-action-date="${esc(a.name||'')}"/>
        </td>
        <td><input class="rounded-lg border p-1 w-48" data-note-author="${esc(a.name||'')}" placeholder="note…"/></td>
      </tr>`;
    }).join('') || '<tr><td colspan="10" class="p-2 text-sm opacity-60">No data</td></tr>';

    // inline update
    $$('#tbA select[data-field], #tbA input[data-field]').forEach(el=>{
      const handler = async ()=>{
        const field = el.dataset.field;
        const val   = el.tagName==='SELECT' ? el.value : el.value.trim();
        await sb.from('authors').update({[field]:val}).eq('id', el.dataset.id);
        toast('✅ Saved');
      };
      el.onchange = handler; el.onblur = handler;
    });

    // outreach logger (dmed/emailed/checked)
    $$('#tbA input[type="checkbox"][data-action]').forEach(chk=>{
      chk.onchange = async ()=>{
        const nm = chk.dataset.name;
        const date = $(`#tbA [data-action-date="${CSS.escape(nm)}"]`)?.value || new Date().toISOString().slice(0,10);
        if(chk.checked){
          await sb.from('outreach').insert({ author_name:nm, action:chk.dataset.action, on_date:date });
          const noteInput = $(`#tbA [data-note-author="${CSS.escape(nm)}"]`);
          if(noteInput?.value.trim()) await sb.from('outreach').update({note:noteInput.value.trim()}).eq('author_name',nm).eq('on_date',date).eq('action',chk.dataset.action);
          toast('✅ Logged');
        }
      };
    });
  },

  async announcements(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold mb-2">📢 Announcements</h2>
        <form id="annForm" class="grid md:grid-cols-2 gap-2">
          <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
          <input id="annPubIn" class="rounded-xl border p-2" placeholder="Publish in (Twitter/AO3/etc)"/>
          <input id="annWhen" type="datetime-local" class="rounded-xl border p-2"/>
          <textarea id="annBody" rows="3" class="md:col-span-2 rounded-xl border p-2" placeholder="Body…"></textarea>
          <button class="md:col-span-2 px-3 py-2 rounded-xl bg-black text-white">Save</button>
        </form>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Title</th><th>Publish in</th><th>When</th><th>Published?</th></tr></thead>
            <tbody id="annList"></tbody>
          </table>
        </div>
      </section>`;

    $('#annForm').addEventListener('submit', async e=>{
      e.preventDefault();
      const row = {
        title: $('#annTitle').value.trim(),
        body: $('#annBody').value.trim(),
        publish_in: $('#annPubIn').value.trim()||null,
        should_publish_at: $('#annWhen').value? new Date($('#annWhen').value).toISOString(): null,
        is_published: false
      };
      if(!row.title) return;
      await sb.from('announcements').insert(row);
      toast('✅ Saved'); VIEWS.announcements();
    });

    const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
    $('#annList').innerHTML = data.map(r=>`
      <tr><td>${esc(r.title||'')}</td><td>${esc(r.publish_in||'')}</td>
      <td>${r.should_publish_at? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy, HH:mm'):'—'}</td>
      <td>${r.is_published?'Yes':'No'}</td></tr>
    `).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
  },

  async timeline(){
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
      </section>`;

    $('#addTL').onclick = async ()=>{
      const phase = prompt('Phase?'); if(!phase) return;
      const date_range = prompt('Date range?')||'';
      const tasks = prompt('Tasks?')||'';
      const start = prompt('Start date (YYYY-MM-DD, optional)')||null;
      await sb.from('timeline').upsert({phase,date_range,tasks,start_date:start}, {onConflict:'phase'});
      VIEWS.timeline();
    };

    // headline 2 kartu + countdown ke Masterlist
    const { data=[] } = await sb.from('timeline').select('*').order('created_at',{ascending:true});
    const master = data.find(x=>/^masterlist/i.test(x.phase||'')) || null;
    $('#headline').innerHTML = `
      <div class="p-3 rounded-xl card">
        <div class="text-sm opacity-70">Current Phase</div>
        <div class="text-lg font-semibold">${esc((data.find(x=>x.start_date && Date.parse(x.start_date)<=Date.now()))?.phase || data[0]?.phase || '—')}</div>
        <div class="text-sm opacity-70 mt-1">${esc((data.find(x=>x.start_date && Date.parse(x.start_date)<=Date.now()))?.tasks || '')}</div>
      </div>
      <div class="p-3 rounded-xl card">
        <div class="text-sm opacity-70">Countdown to Masterlist</div>
        <div id="countDown" class="text-2xl font-bold">—</div>
      </div>`;

    if(master?.start_date){
      const tick = ()=>{
        const end = new Date(master.start_date).getTime();
        let s = Math.max(0, Math.floor((end - Date.now())/1000));
        const d = Math.floor(s/86400); s%=86400;
        const h = Math.floor(s/3600); s%=3600;
        const m = Math.floor(s/60); s%=60;
        $('#countDown').textContent = `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      };
      tick(); setInterval(tick,1000);
    }

    $('#tbTL').innerHTML = data.map(r=>`<tr>
      <td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
  },

  async design(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🎨 Design</h2>
          <button id="addD" class="px-3 py-2 rounded-xl">Add</button>
        </div>
        <div class="table-wrap mt-3">
          <table class="min-w-full text-sm">
            <thead><tr><th>Post</th><th>Agenda</th><th>Due Date</th><th>Status</th><th>Link</th></tr></thead>
            <tbody id="tbD"></tbody>
          </table>
        </div>
      </section>`;

    $('#addD').onclick = async ()=>{
      const post = prompt('Post?'); if(!post) return;
      const agenda = prompt('Agenda?')||'';
      const due = prompt('Due date (YYYY-MM-DD)?')||null;
      const status = prompt('Status (pending/on progress/finished)?')||'pending';
      const link = prompt('Link?')||'';
      await sb.from('design').insert({post,agenda,due_date:due,status,link}); toast('✅ Added'); VIEWS.design();
    };

    const { data=[] } = await sb.from('design').select('*').order('created_at',{ascending:false});
    $('#tbD').innerHTML = data.map(r=>`<tr>
      <td>${esc(r.post||'')}</td><td>${esc(r.agenda||'')}</td><td>${esc(r.due_date||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded border p-1">
          ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${r.link? `<a class="underline" target="_blank" href="${esc(r.link)}">open</a>`:'—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>';

    $$('#tbD select').forEach(sel=>{
      sel.onchange = async ()=>{ await sb.from('design').update({status:sel.value}).eq('id', sel.dataset.id); toast('✅ Updated'); };
    });
  },
};

/************ IMPORT XLSX ************/
async function importPerTarget(file, target){
  if(!file){ toast('Pilih file'); return; }
  const sheets = await readWorkbook(file);
  if(target==='prompts'){ await upsertPrompts(sheets); toast('✅ Import prompts'); VIEWS.prompts(); }
  if(target==='claims'){  await upsertClaims(sheets);  toast('✅ Import claims');  VIEWS.claims();  }
  if(target==='authors'){ await upsertAuthors(sheets); toast('✅ Import authors'); VIEWS.authors(); }
}
async function importAllSheets(file){
  const sheets = await readWorkbook(file);
  await upsertPrompts(sheets);
  await upsertClaims(sheets);
  await upsertAuthors(sheets);
}

/* Deteksi kolom fleksibel (pakai "includes") */
function findCols(headers, keys){
  const h=headers.map(x=>String(x).trim().toLowerCase());
  const idx={}; for(const k in keys){ idx[k]=h.findIndex(c=> keys[k].some(kw=> c.includes(kw))); } return idx;
}

async function upsertPrompts(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0],{
      prompt_date:['prompt_date','date'],
      prompter_name:['prompter_name','name'],
      prompter_ao3:['prompter_ao3','twitter','ao3'],
      pairing:['pairing'],
      additonal_tags:['tags','additional_tags','additonal_tags'],
      rating:['rating'],
      text:['prompt','description','text'],
      status:['status','status_prompt'],
    });
    if(idx.text<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.text]||'').toString().trim()!=='').map(r=>({
      prompt_date: idx.prompt_date>=0? r[idx.prompt_date]||null : null,
      prompter_name: idx.prompter_name>=0? r[idx.prompter_name]||null : null,
      prompter_ao3:  idx.prompter_ao3>=0? r[idx.prompter_ao3]||null : null,
      pairing: idx.pairing>=0? r[idx.pairing]||null : null,
      additonal_tags: idx.additonal_tags>=0? r[idx.additonal_tags]||null : null,
      rating: idx.rating>=0? r[idx.rating]||null : null,
      text: r[idx.text],
      status: idx.status>=0? String(r[idx.status]).toLowerCase() : 'available'
    }));
    if(rows.length) await sb.from('prompts').insert(rows);
  }
}

async function upsertClaims(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0],{
      pairing:['pairing'],
      status:['status','status_works'],
      author_email:['author_email','email'],
      author_twitter:['author_twitter','twitter'],
      ao3_link:['ao3','ao3_link','link'],
      notes:['notes','catatan']
    });
    if(idx.pairing<0 && idx.author_email<0 && idx.author_twitter<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.pairing]||r[idx.author_email]||r[idx.author_twitter]||'').toString().trim()!=='')
      .map(r=>({
        pairing: idx.pairing>=0? r[idx.pairing]||null : null,
        status: idx.status>=0? String(r[idx.status]).toLowerCase() : 'pending',
        author_email: idx.author_email>=0? r[idx.author_email]||null : null,
        author_twitter: idx.author_twitter>=0? r[idx.author_twitter]||null : null,
        ao3_link: idx.ao3_link>=0? r[idx.ao3_link]||null : null,
        notes: idx.notes>=0? r[idx.notes]||null : null
      }));
    if(rows.length) await sb.from('claims').insert(rows);
  }
}

async function upsertAuthors(sheets){
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0],{
      name:['claimed_by','name','author'],
      claimed_date:['claimed_date','tanggal','date'],
      progress:['status_works','progress'],
      email:['author_email','email'],
      twitter:['author_twitter','twitter'],
      prompt:['prompt','description','text'],
      pairing:['pairing'],
      description:['description','prompt_desc','text']
    });
    if(idx.name<0 && idx.email<0 && idx.twitter<0) continue;
    const rows = ws.rows.slice(1).filter(r=> (r[idx.name]||r[idx.email]||r[idx.twitter]||'').toString().trim()!=='')
      .map(r=>({
        name: idx.name>=0? r[idx.name]||null : null,
        claimed_date: idx.claimed_date>=0? r[idx.claimed_date]||null : null,
        progress: idx.progress>=0? String(r[idx.progress]).toLowerCase() : 'idea',
        email: idx.email>=0? r[idx.email]||null : null,
        twitter: idx.twitter>=0? r[idx.twitter]||null : null,
        prompt: idx.prompt>=0? r[idx.prompt]||null : null,
        pairing: idx.pairing>=0? r[idx.pairing]||null : null,
        description: idx.description>=0? r[idx.description]||null : null
      }));
    if(rows.length) await sb.from('authors').insert(rows);
  }
}

/************ NOTES (save & recent) ************/
const MODS = ['Nio','Sha','Naya','Cinta'];
function statusBadge(s){ const map={available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7'}; return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${map[s]||'#eee'}">${s}</span>`; }

async function saveNotes(){
  const on_date = $('#modDate')?.value || new Date().toISOString().slice(0,10);
  const note    = $('#modNote')?.value.trim() || '';
  // upsert per mod
  for(const m of MODS){
    const row = {
      mod: m,
      on_date,
      mood:  $(`#${m.toLowerCase()}Mood`)?.value || '',
      status:$(`#${m.toLowerCase()}Status`)?.value || 'available',
      note
    };
    const { error } = await sb.from('mod_notes').upsert(row, { onConflict:'mod,on_date' });
    if(error){ console.error(error); toast(`Gagal simpan ${m}`); return; }
  }
  $('#modNote').value='';
  toast('✅ Notes berhasil disimpan'); loadRecent();
}
async function loadRecent(){
  const { data=[] } = await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(24);
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note? ' · '+esc(x.note):''}
    </div>
  `).join('') : '<div class="opacity-60">No notes yet.</div>';
}
(function initNotes(){
  const d=$('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10);
  $('#modSave')?.addEventListener('click', saveNotes);
  loadRecent();
})();

/************ BOOT ************/
setActive('overview'); VIEWS.overview();
