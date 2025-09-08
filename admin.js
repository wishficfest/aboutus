/*************************************************
 * Wish Fic Fest — Mod Dashboard (admin.js)
 * Requires: supabase-js v2, luxon, xlsx, chart.js
 **************************************************/

/* ========= CONFIG ========= */
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const esc = (v)=> (v??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); };
const setActive = (v)=> $$('#nav .nav-btn').forEach(el=> el.classList.toggle('active', el.dataset.view===v));

/* ========= NAV / ROUTER ========= */
$('#nav')?.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]');
  if(!el) return;
  navigate(el.dataset.view);
});

async function navigate(view){
  setActive(view);
  const map = { overview, prompts, claims, authors, announcements, timeline, design };
  await (map[view]||overview)();
}
navigate('overview');  // default

/* ========= NOTES (Sidebar) ========= */
// Kaomoji fix (sesuai preferensi kamu)
const MOODS = ["(´･ω･`)", "(＾▽＾)", "(｡T ω T｡)", "¯\\_(ツ)_/¯", "(╯°□°)╯︵ ┻━┻"];
const MODS  = ["Nio","Sha","Naya","Cinta"];
const STATUS = ["available","away","slow"];

initNotesUI();
loadRecentNotes();

function initNotesUI(){
  const box = $('#notes');
  if(!box) return;
  const today = new Date().toISOString().slice(0,10);
  box.innerHTML = `
    <h2 class="font-semibold mb-2">📝 Notes</h2>
    <p class="text-sm mb-3">Update mood & availability tiap mod (auto-log per tanggal).</p>

    ${MODS.map(m=>`
      <div class="mb-2">
        <div class="text-sm font-medium mb-1">Mods ${m}</div>
        <div class="grid gap-2" style="grid-template-columns:1fr 1fr">
          <select id="${m.toLowerCase()}Mood" class="rounded-xl border p-1">
            ${MOODS.map(k=>`<option>${k}</option>`).join('')}
          </select>
          <select id="${m.toLowerCase()}Status" class="rounded-xl border p-1">
            ${STATUS.map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      </div>
    `).join('')}

    <div class="mt-3 grid gap-2" style="grid-template-columns:1fr 1fr 1fr;">
      <input id="modDate" type="date" class="rounded-xl border p-1" value="${today}" />
      <input id="modNote" class="rounded-xl border p-1" placeholder="Catatan singkat..." />
      <button id="modSave" class="btn btn-dark">Save</button>
    </div>

    <div class="mt-3 text-sm">
      <div class="font-medium mb-1">Recent</div>
      <div id="modRecent" class="space-y-1"></div>
    </div>
  `;
  $('#modSave')?.addEventListener('click', saveNotes);
}

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
  toast('Notes updated');
  loadRecentNotes();
}

function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="badge" style="background:${map[s]||'#eee'}">${s}</span>`;
}
async function loadRecentNotes(){
  const { data=[], error } = await sb.from('mod_notes')
    .select('*')
    .order('on_date',{ascending:false})
    .order('created_at',{ascending:false})
    .limit(20);
  if(error){ console.error(error); return; }
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${esc(x.on_date)})</span>
      ${x.note? ' · '+esc(x.note):''}
    </div>
  `).join('') : '<div class="opacity-60">No notes yet.</div>';
}

/* ========= OVERVIEW ========= */
let piePrompted, pieClaimed;

async function overview(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">📊 Overview</h2>
        <div class="flex items-center gap-2">
          <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="btnImportAny" class="btn btn-dark">Upload XLSX/CSV</button>
        </div>
      </div>
      <div class="grid md:grid-cols-4 gap-3 mt-3">
        <div class="kpi"><div class="text-sm opacity-70">Total Prompts</div><div id="k_p_all" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">Available Prompts</div><div id="k_p_av" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">Active Claims</div><div id="k_c_act" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">Authors</div><div id="k_a_all" class="text-2xl font-bold">—</div></div>
      </div>
      <div class="grid md:grid-cols-2 gap-3 mt-4">
        <div class="p-3 rounded-2xl card">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">🍰 Pairing distribution — Prompted (Top 5)</h3>
            <span class="text-xs opacity-70">by prompter</span>
          </div>
          <canvas id="piePrompted" height="240"></canvas>
          <div id="legendPrompted" class="text-xs mt-2"></div>
        </div>
        <div class="p-3 rounded-2xl card">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">🍰 Pairing distribution — Claimed (Top 5)</h3>
            <span class="text-xs opacity-70">by claims</span>
          </div>
          <canvas id="pieClaimed" height="240"></canvas>
          <div id="legendClaimed" class="text-xs mt-2"></div>
        </div>
      </div>
      <p id="analysis" class="text-sm opacity-80 mt-3">Loading…</p>
    </section>
  `;

  // Upload handler
  $('#btnImportAny').onclick = async ()=>{
    const file = $('#fileAny')?.files?.[0];
    if(!file){ toast('Pilih file dulu'); return; }
    $('#btnImportAny').disabled = true;
    try{
      const sheets = await readWorkbook(file);
      await importAllSheets(sheets);
      toast('Upload sukses');
      await overview(); // refresh KPI+charts
    }catch(err){
      console.error(err); toast('Upload gagal');
    }finally{
      $('#btnImportAny').disabled = false;
    }
  };

  // KPIs
  const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
  $('#k_p_all').textContent = stats?.prompts_total ?? 0;
  $('#k_p_av').textContent  = stats?.prompts_available ?? 0;
  $('#k_c_act').textContent = stats?.claims_active ?? 0;
  $('#k_a_all').textContent = stats?.authors_total ?? 0;

  // Charts
  const prompterPairs = await getPairingCountsFromPrompts();
  const claimedPairs  = await getPairingCountsFromClaims();

  drawPie('piePrompted', 'legendPrompted', top5WithMedals(prompterPairs));
  drawPie('pieClaimed',  'legendClaimed',  top5WithMedals(claimedPairs));

  // Simple analysis line
  const donePct = (stats?.authors_total? Math.round(100*(stats?.authors_done||0)/stats.authors_total) : 0);
  $('#analysis').textContent = donePct<30 ? 'Early days — cheer writers 💪'
                             : donePct<70 ? 'Nice momentum — schedule next check-in 📅'
                             : 'Almost there — prepare posting assets 🎨';
}

/* ========= PROMPTS ========= */
async function prompts(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">💡 Prompts</h2>
        <div class="flex items-center gap-2">
          <input id="fileP" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impP" class="btn btn-dark">Import</button>
          <button id="expP" class="btn">Export CSV</button>
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
  $('#impP').onclick = ()=> importFromPicker('#fileP', ['prompts']);
  $('#expP').onclick = ()=> exportTable('prompts');

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
    sel.onchange = async ()=>{
      await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
}

/* ========= CLAIMS ========= */
async function claims(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">✍️ Claims</h2>
        <div class="flex items-center gap-2">
          <input id="fileC" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impC" class="btn btn-dark">Import</button>
          <button id="expC" class="btn">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr>
            <th>Author</th><th>Prompt</th><th>Pairing</th><th>Desc/Tags</th><th>Status</th><th>AO3 Link</th><th>Self?</th><th>Claimed At</th><th>Notes</th>
          </tr></thead>
          <tbody id="tbC"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impC').onclick = ()=> importFromPicker('#fileC', ['claims']);
  $('#expC').onclick = ()=> exportTable('claims');

  // ambil prompts untuk join tampilan
  const [promptsRes, claimsRes] = await Promise.all([
    sb.from('prompts').select('id,text,pairing,additonal_tags'),
    sb.from('claims').select('*').order('created_at',{ascending:false})
  ]);
  const prompts = promptsRes.data||[];
  const byPair  = groupBy(prompts, p=> (p.pairing||'').toLowerCase());
  const byText  = groupBy(prompts, p=> (p.text||'').slice(0,80).toLowerCase());

  const rows = (claimsRes.data||[]).map(c=>{
    // heuristik cocokan prompt (tidak mengubah DB)
    let show = { text:'', pairing:c.pairing||'', tags:'' };
    if(c.prompt_text){
      const key = c.prompt_text.slice(0,80).toLowerCase();
      const hit = (byText[key]||[])[0];
      if(hit) show = { text: hit.text, pairing: hit.pairing, tags: hit.additonal_tags };
    }else if(c.pairing){
      const hit = (byPair[(c.pairing||'').toLowerCase()]||[])[0];
      if(hit) show = { text: hit.text, pairing: hit.pairing, tags: hit.additonal_tags };
    }
    const medal = c.is_self_prompt ? `<span class="badge badge-self">self-prompt</span>` : '';
    return { c, show, medal };
  });

  $('#tbC').innerHTML = rows.map(({c, show, medal})=>`
    <tr>
      <td>${esc(c.author_name||'')}</td>
      <td>${esc(show.text||'')}</td>
      <td>${esc(show.pairing||'')}</td>
      <td>${esc(show.tags||'')}</td>
      <td>
        <select data-id="${c.id}" class="rounded-lg border p-1">
          ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${c.ao3_link? `<a target="_blank" href="${esc(c.ao3_link)}">open</a>`:''}
          <div class="mt-1"><input type="url" placeholder="https://ao3..." value="${esc(c.ao3_link||'')}" data-id="${c.id}" data-field="ao3_link" class="rounded-xl border p-1" /></div>
      </td>
      <td>${medal}</td>
      <td>${c.claimed_at? esc(c.claimed_at.slice(0,10)) : ''}</td>
      <td><textarea rows="2" data-id="${c.id}" data-field="notes" class="rounded-xl border p-1" placeholder="catatan…">${esc(c.notes||'')}</textarea></td>
    </tr>
  `).join('') || `<tr><td colspan="9" class="p-2 opacity-60">No data</td></tr>`;

  // handlers
  $$('#tbC select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
  $$('#tbC input[data-field], #tbC textarea[data-field]').forEach(inp=>{
    inp.onchange = async ()=>{
      const field = inp.dataset.field;
      const val = inp.value.trim() || null;
      await sb.from('claims').update({[field]: val}).eq('id', inp.dataset.id);
      toast('Saved');
    };
  });
}

/* ========= AUTHORS ========= */
async function authors(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
        <div class="flex items-center gap-2">
          <input id="fileA" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impA" class="btn btn-dark">Import</button>
          <button id="expA" class="btn">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr>
            <th>Name</th><th>Prompt</th><th>Pairing</th><th>Description</th>
            <th>Progress</th><th>Email</th><th>Twitter</th>
            <th>Actions (dmed/emailed/checked)</th>
          </tr></thead>
          <tbody id="tbA"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impA').onclick = ()=> importFromPicker('#fileA', ['authors']);
  $('#expA').onclick = ()=> exportTable('authors');

  const [authorsRes, claimsRes, promptsRes] = await Promise.all([
    sb.from('authors').select('*').order('created_at',{ascending:false}),
    sb.from('claims').select('*'),
    sb.from('prompts').select('text,pairing,additonal_tags')
  ]);
  const authors = authorsRes.data||[];
  const claimsByAuthor = groupBy(claimsRes.data||[], r=> (r.author_name||'').toLowerCase());
  const promptByPair   = groupBy(promptsRes.data||[], p=> (p.pairing||'').toLowerCase());

  const PROG = ['idea','outline','draft','beta','ready','posted'];
  const today = new Date().toISOString().slice(0,10);

  $('#tbA').innerHTML = authors.map(a=>{
    // heuristik: cari claim terbaru author → tarik prompt info
    let prompt='', pairing='', desc='';
    const cs = (claimsByAuthor[(a.name||'').toLowerCase()]||[]).sort((x,y)=> (y.created_at||'').localeCompare(x.created_at||''));
    if(cs.length){
      pairing = cs[0].pairing||'';
      const hit = (promptByPair[pairing.toLowerCase()]||[])[0];
      if(hit){ prompt = hit.text||''; desc = hit.additonal_tags||''; }
    }
    return `
      <tr>
        <td>${esc(a.name||'')}</td>
        <td>${esc(prompt||'')}</td>
        <td>${esc(pairing||'')}</td>
        <td>${esc(desc||'')}</td>
        <td>
          <select data-id="${a.id}" data-field="progress" class="rounded-xl border p-1">
            ${PROG.map(p=>`<option ${a.progress===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </td>
        <td><input class="rounded-xl border p-1" data-id="${a.id}" data-field="email" type="email" value="${esc(a.email||'')}" placeholder="email"/></td>
        <td><input class="rounded-xl border p-1" data-id="${a.id}" data-field="twitter" type="text" value="${esc(a.twitter||'')}" placeholder="@handle"/></td>
        <td>
          <div class="flex items-center gap-2">
            ${['dmed','emailed','checked'].map(act=>`
              <label class="inline-flex items-center gap-1">
                <input type="checkbox" data-author="${esc(a.name||'')}" data-action="${act}" />
                ${act}
              </label>`).join('')}
          </div>
          <div class="text-xs opacity-70 mt-1">date: <input type="date" value="${today}" data-author="${esc(a.name||'')}" data-date="1"/></div>
          <div class="mt-1"><input class="rounded-xl border p-1" data-author="${esc(a.name||'')}" data-note="1" placeholder="note (optional)"/></div>
          <button class="btn mt-1" data-author="${esc(a.name||'')}" data-log="1">Save Log</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="8" class="p-2 opacity-60">No data</td></tr>`;

  // edits
  $$('#tbA select[data-field], #tbA input[data-field]').forEach(el=>{
    el.onchange = async ()=>{
      const field = el.dataset.field;
      const val   = el.value || null;
      await sb.from('authors').update({[field]: val}).eq('id', el.dataset.id);
      toast('Saved');
    };
  });

  // outreach log
  $$('#tbA button[data-log]').forEach(btn=>{
    btn.onclick = async ()=>{
      const name = btn.dataset.author;
      const date = $(`#tbA input[data-author="${cssSel(name)}"][data-date]`)?.value || today;
      const note = $(`#tbA input[data-author="${cssSel(name)}"][data-note]`)?.value?.trim() || null;
      const checks = $$('#tbA input[type="checkbox"][data-author="'+name+'"]:checked').map(x=>x.dataset.action);
      if(!checks.length){ toast('Pilih minimal satu action'); return; }
      const rows = checks.map(action=>({ author_name: name, action, on_date: date, note }));
      await sb.from('outreach').insert(rows);
      toast('Log saved');
    };
  });
}
function cssSel(s){ return s.replace(/"/g,'\\"'); }

/* ========= ANNOUNCEMENTS ========= */
async function announcements(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">📢 Announcements</h2>
        <div class="flex items-center gap-2">
          <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
          <input id="annWhere" class="rounded-xl border p-2" placeholder="Publish in (Twitter/AO3)"/>
          <input id="annWhen" type="datetime-local" class="rounded-xl border p-2"/>
          <button id="annSave" class="btn btn-dark">Save</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Title</th><th>Publish In</th><th>Schedule</th><th>Published?</th></tr></thead>
          <tbody id="annList"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#annSave').onclick = async ()=>{
    const row = {
      title: $('#annTitle').value.trim(),
      body: '',
      publish_in: $('#annWhere').value.trim() || null,
      should_publish_at: $('#annWhen').value ? new Date($('#annWhen').value).toISOString() : null,
      is_published: false
    };
    if(!row.title){ toast('Title kosong'); return; }
    await sb.from('announcements').insert(row);
    toast('Saved'); announcements();
  };
  const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false});
  $('#annList').innerHTML = data.map(r=>`
    <tr><td>${esc(r.title||'')}</td><td>${esc(r.publish_in||'')}</td><td>${r.should_publish_at? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy, HH:mm'):''}</td><td>${r.is_published?'Yes':'No'}</td></tr>
  `).join('') || `<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>`;
}

/* ========= TIMELINE ========= */
async function timeline(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
        <button id="addTL" class="btn">Add</button>
      </div>
      <div class="grid md:grid-cols-2 gap-3 mt-3" id="headline"></div>
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
    const date_range = prompt('Date range?')||'';
    const tasks = prompt('Tasks?')||'';
    const start = prompt('Start date (YYYY-MM-DD)?')||null;
    await sb.from('timeline').insert({ phase, date_range, tasks, start_date:start });
    toast('Added'); timeline();
  };

  await renderHeadline($('#headline'));
  const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
  $('#tbTL').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.phase)}</td>
      <td contenteditable data-id="${r.id}" data-field="date_range">${esc(r.date_range||'')}</td>
      <td contenteditable data-id="${r.id}" data-field="tasks">${esc(r.tasks||'')}</td>
      <td><input type="date" value="${r.start_date||''}" data-id="${r.id}" data-field="start_date" class="rounded-xl border p-1"/></td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>`;

  // edit handlers
  $$('#tbTL [contenteditable][data-field]').forEach(cell=>{
    cell.addEventListener('blur', async ()=>{
      const id = cell.dataset.id, field = cell.dataset.field, val = cell.textContent.trim()||null;
      await sb.from('timeline').update({[field]: val}).eq('id', id);
      toast('Saved');
      await renderHeadline($('#headline')); // refresh countdown if changed
    });
  });
  $$('#tbTL input[data-field="start_date"]').forEach(inp=>{
    inp.onchange = async ()=>{
      await sb.from('timeline').update({start_date: inp.value||null}).eq('id', inp.dataset.id);
      toast('Saved');
      await renderHeadline($('#headline'));
    };
  });
}

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
  const phases = ['Author Sign-ups','Check-In','Masterlist Thread'];
  root.innerHTML = phases.map(p=>{
    const r = data.find(x=>x.phase===p);
    if(!r) return `<div class="p-3 rounded-xl card"><div class="font-medium">${esc(p)}</div><div class="opacity-70">Not set</div></div>`;
    return `<div class="p-3 rounded-xl card">
      <div class="text-sm opacity-70">${esc(r.phase)}</div>
      <div class="text-lg font-semibold">${esc(r.tasks||'')}</div>
      <div class="mt-1 text-sm">${esc(r.date_range||'')}</div>
      <div class="mt-2 text-2xl font-bold" data-countdown="${r.start_date||''}">—</div>
    </div>`;
  }).join('');
  const tick = ()=> $$('#headline [data-countdown]').forEach(el=>{
    const iso = el.getAttribute('data-countdown'); el.textContent = iso? fmtCountdown(iso) : '—';
  });
  tick(); setInterval(tick, 1000);
}

/* ========= DESIGN ========= */
async function design(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🎨 Design</h2>
        <div class="flex items-center gap-2">
          <input id="dPost" class="rounded-xl border p-2" placeholder="Post"/>
          <input id="dAgenda" class="rounded-xl border p-2" placeholder="Agenda"/>
          <input id="dDue" type="date" class="rounded-xl border p-2"/>
          <select id="dStatus" class="rounded-xl border p-2">
            <option>pending</option><option>on progress</option><option>finished</option>
          </select>
          <input id="dLink" class="rounded-xl border p-2" placeholder="Link"/>
          <button id="dAdd" class="btn btn-dark">Add</button>
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
  $('#dAdd').onclick = async ()=>{
    const row = {
      post: $('#dPost').value.trim(),
      agenda: $('#dAgenda').value.trim()||null,
      due_date: $('#dDue').value||null,
      status: $('#dStatus').value,
      link: $('#dLink').value.trim()||null
    };
    if(!row.post){ toast('Post kosong'); return; }
    await sb.from('design').insert(row); toast('Added'); design();
  };
  const { data=[] } = await sb.from('design').select('*').order('created_at',{ascending:false});
  $('#tbD').innerHTML = data.map(r=>`
    <tr>
      <td contenteditable data-id="${r.id}" data-field="post">${esc(r.post||'')}</td>
      <td contenteditable data-id="${r.id}" data-field="agenda">${esc(r.agenda||'')}</td>
      <td><input type="date" value="${r.due_date||''}" data-id="${r.id}" data-field="due_date" class="rounded-xl border p-1"/></td>
      <td>
        <select data-id="${r.id}" data-field="status" class="rounded-xl border p-1">
          ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input value="${esc(r.link||'')}" data-id="${r.id}" data-field="link" class="rounded-xl border p-1" placeholder="https://..."/></td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>`;

  // edits
  $$('#tbD [contenteditable][data-field]').forEach(cell=>{
    cell.addEventListener('blur', async ()=>{
      await sb.from('design').update({[cell.dataset.field]: cell.textContent.trim()||null}).eq('id', cell.dataset.id);
      toast('Saved');
    });
  });
  $$('#tbD select[data-field], #tbD input[data-field]').forEach(el=>{
    el.onchange = async ()=>{
      await sb.from('design').update({[el.dataset.field]: el.value||null}).eq('id', el.dataset.id);
      toast('Saved');
    };
  });
}

/* ========= XLSX IMPORT ========= */
async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  if(file.name.toLowerCase().endsWith('.csv')){
    const rows = new TextDecoder().decode(new Uint8Array(buf)).split(/\r?\n/).map(l=>l.split(','));
    return [{name:'CSV', rows}];
  }
  const wb = XLSX.read(buf, { type:'array' });
  return wb.SheetNames.map(n=>({ name:n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''}) }));
}

async function importFromPicker(selector, targets){
  const f = $(selector)?.files?.[0];
  if(!f){ toast('Pilih file dulu'); return; }
  const sheets = await readWorkbook(f);
  await importAllSheets(sheets, targets);
  toast('Import sukses'); navigate(targets?.[0]||'overview');
}

function findCols(headers, keys){
  const h = headers.map(x=> String(x).trim().toLowerCase());
  const idx = {};
  for(const k in keys){
    idx[k] = h.findIndex(c => keys[k].some(kw => c.includes(kw)));
  }
  return idx;
}
function toArray(v){ if(v==null) return null; if(Array.isArray(v)) return v; return String(v).split(/[,;]\s*/).filter(Boolean).join(', '); }

async function importAllSheets(sheets, targets){
  const wantAll = !targets || !targets.length;
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const H = ws.rows[0].map(x=> String(x).trim());
    const R = ws.rows.slice(1);

    // PROMPTS
    if(wantAll || targets.includes('prompts')){
      const pIdx = findCols(H, {
        prompt_date:['prompt_date','date'],
        prompter_name:['prompter_name','prompter'],
        prompter_ao3:['prompter_ao3','twitter','ao3'],
        pairing:['pairing'],
        additonal_tags:['additonal_tags','tags'],
        rating:['rating'],
        text:['prompt','description','text'],
        prompt_bank_upload:['prompt_bank_upload','bank'],
        status:['status_prompt','status']
      });
      if(pIdx.text>=0){
        const rows = R.filter(r=> (r[pIdx.text]||'').toString().trim()!=='').map(r=>({
          prompt_date:        pIdx.prompt_date>=0? r[pIdx.prompt_date] : null,
          prompter_name:      pIdx.prompter_name>=0? r[pIdx.prompter_name] : null,
          prompter_ao3:       pIdx.prompter_ao3>=0? r[pIdx.prompter_ao3] : null,
          pairing:            pIdx.pairing>=0? r[pIdx.pairing] : null,
          additonal_tags:     pIdx.additonal_tags>=0? toArray(r[pIdx.additonal_tags]) : null,
          rating:             pIdx.rating>=0? r[pIdx.rating] : null,
          text:               r[pIdx.text],
          prompt_bank_upload: pIdx.prompt_bank_upload>=0? r[pIdx.prompt_bank_upload] : null,
          status:             pIdx.status>=0? String(r[pIdx.status]||'available').toLowerCase() : 'available'
        }));
        if(rows.length) await sb.from('prompts').insert(rows);
      }
    }

    // CLAIMS
    if(wantAll || targets.includes('claims')){
      const cIdx = findCols(H, {
        author_name:['author','claimed_by','name'],
        pairing:['pairing'],
        status:['status_works','status'],
        ao3_link:['ao3','link'],
        notes:['notes','catatan'],
        prompt_text:['prompt','description','text'],
        claimed_at:['claimed_date','date']
      });
      if(cIdx.author_name>=0){
        const rows = R.filter(r=> (r[cIdx.author_name]||'').toString().trim()!=='').map(r=>({
          author_name: r[cIdx.author_name],
          pairing:     cIdx.pairing>=0? r[cIdx.pairing] : null,
          status:      cIdx.status>=0? normalizeClaimStatus(r[cIdx.status]) : 'pending',
          ao3_link:    cIdx.ao3_link>=0? r[cIdx.ao3_link] : null,
          notes:       cIdx.notes>=0? r[cIdx.notes] : null,
          prompt_text: cIdx.prompt_text>=0? r[cIdx.prompt_text] : null,
          is_self_prompt: guessSelfPrompt(r[cIdx.author_name], cIdx.prompt_text>=0? r[cIdx.prompt_text] : ''),
          claimed_at:  cIdx.claimed_at>=0? toISODate(r[cIdx.claimed_at]) : null
        }));
        if(rows.length) await sb.from('claims').insert(rows);
      }
    }

    // AUTHORS
    if(wantAll || targets.includes('authors')){
      const aIdx = findCols(H, {
        name:['claimed_by','author','name'],
        claimed_date:['claimed_date','date'],
        progress:['status_works','progress'],
        email:['author_email','email'],
        twitter:['author_twitter','twitter']
      });
      if(aIdx.name>=0){
        const rows = R.filter(r=> (r[aIdx.name]||'').toString().trim()!=='').map(r=>({
          name:         r[aIdx.name],
          claimed_date: aIdx.claimed_date>=0? toISODate(r[aIdx.claimed_date]) : null,
          progress:     aIdx.progress>=0? normalizeProgress(r[aIdx.progress]) : null,
          email:        aIdx.email>=0? r[aIdx.email] : null,
          twitter:      aIdx.twitter>=0? r[aIdx.twitter] : null
        }));
        if(rows.length) await sb.from('authors').insert(rows);
      }
    }
  }
}

function toISODate(v){
  if(!v) return null;
  const s = String(v);
  // try yyyy-mm-dd
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  // Excel date number
  const n = Number(s);
  if(!isNaN(n)){
    // Excel epoch 1899-12-30
    const d = new Date(1899,11,30); d.setDate(d.getDate()+n);
    return d.toISOString().slice(0,10);
  }
  // fallback
  const d = new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}
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
function normalizeClaimStatus(v){
  const s = String(v||'').toLowerCase();
  if(s.includes('post')) return 'posted';
  if(s.includes('submit')) return 'submitted';
  if(s.includes('drop')) return 'dropped';
  if(s.includes('claim')) return 'claimed';
  if(s.includes('pending')||!s) return 'pending';
  return s;
}
function guessSelfPrompt(author, promptText){
  if(!author || !promptText) return false;
  const a = String(author).toLowerCase();
  const t = String(promptText).toLowerCase();
  return t.includes(a);
}
function groupBy(arr, keyFn){
  const m = Object.create(null);
  (arr||[]).forEach(x=>{
    const k = keyFn(x)||'__';
    (m[k]||(m[k]=[])).push(x);
  });
  return m;
}
async function exportTable(table){
  const { data=[], error } = await sb.from(table).select('*');
  if(error){ toast('Export gagal'); return; }
  const csv = toCSV(data);
  download(`${table}.csv`, csv);
}
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

/* ========= CHARTS ========= */
function top5WithMedals(countMap){
  const arr = Object.entries(countMap).map(([k,v])=>({name:k, val:v})).sort((a,b)=>b.val-a.val).slice(0,5);
  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  return arr.map((x,i)=> ({ label: `${medals[i]} ${x.name}`, val:x.val }));
}

async function getPairingCountsFromPrompts(){
  const { data=[] } = await sb.from('prompts').select('pairing');
  const c = {};
  data.forEach(r=>{
    const k = (r.pairing||'').trim();
    if(!k) return;
    c[k] = (c[k]||0)+1;
  });
  return c;
}
async function getPairingCountsFromClaims(){
  const { data=[] } = await sb.from('claims').select('pairing');
  const c = {};
  data.forEach(r=>{
    const k = (r.pairing||'').trim();
    if(!k) return;
    c[k] = (c[k]||0)+1;
  });
  return c;
}
function drawPie(canvasId, legendId, items){
  const el = document.getElementById(canvasId);
  if(!el) return;
  // destroy old
  if(canvasId==='piePrompted' && piePrompted) { piePrompted.destroy(); }
  if(canvasId==='pieClaimed'  && pieClaimed)  { pieClaimed.destroy(); }
  const labels = items.map(x=>x.label);
  const data = items.map(x=>x.val);
  const chart = new Chart(el, {
    type:'pie',
    data:{ labels, datasets:[{ data }]},
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });
  if(canvasId==='piePrompted') piePrompted = chart; else pieClaimed = chart;
  // legend
  const lg = document.getElementById(legendId);
  if(lg){ lg.innerHTML = labels.map((l,i)=> `<div>${esc(l)} — <b>${data[i]}</b></div>`).join(''); }
}

/* ========= STARTUP (ensure sidebar state) ========= */
document.addEventListener('DOMContentLoaded', ()=>{
  const first = $('#nav [data-view].nav-btn');
  if(first) setActive(first.dataset.view);
});
