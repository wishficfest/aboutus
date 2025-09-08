/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); };

/************ NAV / ROUTER ************/
$('#nav')?.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  const v = el.dataset.view; setActive(v); (VIEWS[v]||VIEWS.overview)();
});
function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  const el = $(`#nav [data-view="${v}"]`); el?.classList.add('active');
}

/************ START ************/
setActive('overview'); (window.VIEWS={}); // placeholder; actual views set below

/************ NOTES (sidebar) ************/
(function initNotes(){
  const d = $('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10);
  $('#modSave')?.addEventListener('click', saveNotes);
  loadRecent();
})();
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="badge" style="background:${map[s]||'#eee'}">${s}</span>`;
}
async function saveNotes(){
  const row = {
    mod:    $('#modWho').value,
    mood:   $('#modMood').value,
    status: $('#modStatus').value,
    on_date: $('#modDate').value || new Date().toISOString().slice(0,10),
    note:   $('#modNote').value.trim()
  };
  const { error } = await sb.from('mod_notes').upsert(row, { onConflict:'mod,on_date' });
  if(error){ console.error(error); toast('Gagal menyimpan notes'); return; }
  $('#modNote').value = '';
  toast('Notes tersimpan ✅');
  loadRecent();
}
async function loadRecent(){
  const { data=[], error } = await sb.from('mod_notes')
    .select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  if(error){ console.error(error); return; }
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note ? ' · '+esc(x.note) : ''}
    </div>
  `).join('') : '<div class="opacity-60">Belum ada notes.</div>';
}

/************ IMPORT / EXPORT HELPERS ************/
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
  return wb.SheetNames.map(n=>({ name:n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'' }) }));
}

/** Map allsheets_for_website.xlsx → tables
 * Prompts: prompt_date, prompter_name, prompter_ao3/twitter, pairing, additonal_tags, rating, prompt/description, prompt_bank_upload, status_prompt
 * Claims : pairing, status_works, author_email, author_twitter, AO3 fulfilled, Notes (+ ideally prompt fields if present)
 * Authors: claimed_by, claimed_date, status_works, author_email, author_twitter
 * Ann   : title, publish_in, should_publish_at
 * Timeline: phase, date_range, tasks, start_date (optional)
 * Design: post, agenda, due_date, status, link
 */
function findCols(header, wanted){
  const h = header.map(x=>String(x).trim().toLowerCase());
  const idx = {};
  for(const k in wanted){ idx[k] = h.findIndex(c => wanted[k].some(w => c.includes(w))); }
  return idx;
}
function toArray(v){ if(v==null) return null; if(Array.isArray(v)) return v; return String(v).split(/[,;]\s*/).filter(Boolean); }
function normProgress(s){
  const v = String(s||'').toLowerCase();
  if(v.includes('posted')) return 'posted';
  if(v.includes('ready')||v.includes('80')) return 'ready';
  if(v.includes('beta')||v.includes('60')) return 'beta';
  if(v.includes('draft')||v.includes('40')) return 'draft';
  if(v.includes('outline')||v.includes('20')) return 'outline';
  if(v.includes('idea')||v.includes('0')||v.includes('belum')) return 'idea';
  return v || null;
}
async function importAny(file){
  const sheets = await readWorkbook(file);
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const H = ws.rows[0];

    // PROMPTS
    let cols = findCols(H,{
      prompt_date:['prompt_date','tanggal'],
      prompter_name:['prompter_name','prompter'],
      prompter_ao3:['ao3','twitter','pseud'],
      pairing:['pairing'],
      additonal_tags:['additional_tags','additonal_tags','tags'],
      rating:['rating'],
      text:['prompt','description','desc','teks'],
      prompt_bank_upload:['prompt_bank_upload','bank'],
      status:['status_prompt','status']
    });
    if(cols.text>=0 && cols.status>=0){
      const rows = ws.rows.slice(1).filter(r=>String(r[cols.text]||'').trim()!=='').map(r=>({
        prompt_date: r[cols.prompt_date]||null,
        prompter_name: r[cols.prompter_name]||null,
        prompter_ao3: r[cols.prompter_ao3]||null,
        pairing: r[cols.pairing]||null,
        additonal_tags: r[cols.additonal_tags]||null,
        rating: r[cols.rating]||null,
        text: r[cols.text]||null,
        prompt_bank_upload: r[cols.prompt_bank_upload]||null,
        status: String(r[cols.status]||'available').toLowerCase()
      }));
      if(rows.length){ await sb.from('prompts').insert(rows); }
    }

    // CLAIMS
    cols = findCols(H,{
      pairing:['pairing'],
      status:['status_works','status'],
      author_email:['author_email','email'],
      author_twitter:['author_twitter','twitter'],
      ao3_link:['ao3','fulfilled'],
      notes:['notes','catatan'],
      // optional prompt fields if present in claim sheet
      c_text:['prompt','description','desc'],
      c_tags:['tags','additional_tags','additonal_tags'],
      c_pairing:['pairing']
    });
    if(cols.status>=0 && (cols.author_email>=0 || cols.author_twitter>=0 || cols.ao3_link>=0)){
      const rows = ws.rows.slice(1).filter(r=>
        String(r[cols.author_email]||r[cols.author_twitter]||r[cols.ao3_link]||'').trim()!==''
      ).map(r=>({
        pairing: r[cols.pairing]||null,
        status: String(r[cols.status]||'pending').toLowerCase(),
        author_email: r[cols.author_email]||null,
        author_twitter: r[cols.author_twitter]||null,
        ao3_link: r[cols.ao3_link]||null,
        notes: r[cols.notes]||null,
        // store prompt info redundantly in claims if present
        prompt_text: cols.c_text>=0 ? r[cols.c_text] : null,
        prompt_tags: cols.c_tags>=0 ? String(r[cols.c_tags]).split(/[,;]\s*/).filter(Boolean) : null,
        prompt_pairing: cols.c_pairing>=0 ? r[cols.c_pairing] : null
      }));
      if(rows.length){ await sb.from('claims').insert(rows); }
    }

    // AUTHORS
    cols = findCols(H,{
      name:['claimed_by','author','nama','name'],
      claimed_date:['claimed_date','tanggal'],
      progress:['status_works','progress'],
      email:['author_email','email'],
      twitter:['author_twitter','twitter'],
      ao3:['ao3','pseud'],

      // OPTIONAL prompt mapping to show in Authors
      a_prompt:['prompt','description','desc'],
      a_pairing:['pairing'],
      a_tags:['tags','additional_tags','additonal_tags']
    });
    if(cols.name>=0 || cols.ao3>=0){
      const rows = ws.rows.slice(1).filter(r=>String(r[cols.name]||r[cols.ao3]||'').trim()!=='').map(r=>({
        name: r[cols.name]||null,
        claimed_date: r[cols.claimed_date]||null,
        progress: normProgress(r[cols.progress]||''),
        email: r[cols.email]||null,
        twitter: r[cols.twitter]||null,
        ao3: r[cols.ao3]||null,
        // store prompt snapshot fields (if sheet provides)
        prompt_text: cols.a_prompt>=0 ? r[cols.a_prompt] : null,
        prompt_pairing: cols.a_pairing>=0 ? r[cols.a_pairing] : null,
        prompt_tags: cols.a_tags>=0 ? String(r[cols.a_tags]).split(/[,;]\s*/).filter(Boolean) : null
      }));
      if(rows.length){ await sb.from('authors').insert(rows); }
    }

    // ANNOUNCEMENTS
    cols = findCols(H,{ title:['title'], publish_in:['publish','channel','in'], when:['should_publish','when','tanggal'] });
    if(cols.title>=0){
      const rows = ws.rows.slice(1).filter(r=>String(r[cols.title]||'').trim()!=='').map(r=>({
        title: r[cols.title], publish_in: cols.publish_in>=0? r[cols.publish_in] : null,
        should_publish_at: cols.when>=0? r[cols.when] : null, is_published: false
      }));
      if(rows.length){ await sb.from('announcements').insert(rows); }
    }

    // TIMELINE
    cols = findCols(H,{ phase:['phase'], date_range:['date range','date_range'], tasks:['tasks'], start_date:['start_date','start'] });
    if(cols.phase>=0){
      const rows = ws.rows.slice(1).filter(r=>String(r[cols.phase]||'').trim()!=='').map(r=>({
        phase: r[cols.phase], date_range: cols.date_range>=0? r[cols.date_range]:null,
        tasks: cols.tasks>=0? r[cols.tasks]:null, start_date: cols.start_date>=0? r[cols.start_date]:null
      }));
      if(rows.length){ await sb.from('timeline').insert(rows); }
    }

    // DESIGN
    cols = findCols(H,{ post:['post'], agenda:['agenda'], due_date:['due','date'], status:['status'], link:['link'] });
    if(cols.post>=0){
      const rows = ws.rows.slice(1).filter(r=>String(r[cols.post]||'').trim()!=='').map(r=>({
        post:r[cols.post], agenda:r[cols.agenda]||null, due_date:r[cols.due_date]||null,
        status:String(r[cols.status]||'pending').toLowerCase(), link:r[cols.link]||null
      }));
      if(rows.length){ await sb.from('design').insert(rows); }
    }
  }
}

/************ OVERVIEW ************/
VIEWS.overview = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <h2 class="text-xl font-semibold">📊 Overview</h2>
        <div class="flex items-center gap-2">
          <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impAny" class="btn btn-dark">Import</button>
          <button id="expAll" class="btn">Export CSV (Prompts)</button>
        </div>
      </div>
      <div class="grid md:grid-cols-5 gap-3 mt-3">
        <div class="kpi"><div class="text-sm opacity-70">Total Prompts</div><div id="kP1" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">Available Prompts</div><div id="kP2" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">Active Claims</div><div id="kP3" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">Authors</div><div id="kP4" class="text-2xl font-bold">—</div></div>
        <div class="kpi"><div class="text-sm opacity-70">% Progress (authors)</div><div id="kP5" class="text-2xl font-bold">—</div></div>
      </div>
      <div class="mt-4">
        <h3 class="font-semibold mb-1">Pairing percentage</h3>
        <p class="text-xs opacity-70 mb-2">From prompter (all prompts) vs claimed (claims).</p>
        <canvas id="pairChart" height="140"></canvas>
      </div>
    </section>

    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">🗓️ Headline</h2>
        <div class="text-sm opacity-70">Live countdown</div>
      </div>
      <div id="headline" class="grid md:grid-cols-2 gap-3 mt-2"></div>
    </section>
  `;

  // Import
  $('#impAny').onclick = async ()=>{
    const f = $('#fileAny').files?.[0]; if(!f){ toast('Pilih file CSV/XLSX'); return; }
    await importAny(f); toast('Import sukses ✅'); VIEWS.overview();
  };
  $('#expAll').onclick = async ()=>{
    const { data=[] } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    download('prompts.csv', toCSV(data));
  };

  // KPIs
  const { data: stats } = await sb.from('v_stats').select('*').maybeSingle();
  const s = stats || { prompts_total:0, prompts_available:0, claims_active:0, authors_total:0 };
  $('#kP1').textContent = s.prompts_total ?? 0;
  $('#kP2').textContent = s.prompts_available ?? 0;
  $('#kP3').textContent = s.claims_active ?? 0;
  $('#kP4').textContent = s.authors_total ?? 0;

  // crude progress % from authors.progress
  const { data: auth=[] } = await sb.from('authors').select('progress');
  const done = auth.filter(a=>['beta','ready','posted','done'].includes(String(a.progress||'').toLowerCase())).length;
  const pct = (auth.length? Math.round(100*done/auth.length) : 0);
  $('#kP5').textContent = pct + '%';

  // Pairing percentage (prompts vs claims)
  const { data: pr=[] } = await sb.from('prompts').select('pairing');
  const { data: cl=[] } = await sb.from('claims').select('pairing');
  const count = (arr)=> {
    const m = new Map();
    arr.filter(x=>x?.pairing).forEach(x=>{
      const k = String(x.pairing).trim();
      m.set(k,(m.get(k)||0)+1);
    });
    return m;
  };
  const pMap = count(pr), cMap = count(cl);
  const labels = Array.from(new Set([...pMap.keys(), ...cMap.keys()]));
  const pVals = labels.map(k=>pMap.get(k)||0);
  const cVals = labels.map(k=>cMap.get(k)||0);
  const ctx = $('#pairChart').getContext('2d');
  new Chart(ctx, {
    type:'bar',
    data:{ labels,
      datasets:[
        { label:'From Prompter', data:pVals },
        { label:'Claimed', data:cVals }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' }}, scales:{ x:{ stacked:false }, y:{ beginAtZero:true } } }
  });

  // Headline (Author Sign-ups, Check-In)
  await renderHeadline($('#headline'));
};
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

/************ PROMPTS ************/
VIEWS.prompts = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">💡 Prompts</h2>
        <div class="flex items-center gap-2">
          <input id="fileP" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impP" class="btn btn-dark">Import</button>
          <button id="expP" class="btn">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Date</th><th>Prompter</th><th>Pairing</th><th>Tags</th><th>Prompt</th><th>Status</th></tr></thead>
          <tbody id="tbP"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impP').onclick = async ()=>{
    const f=$('#fileP').files?.[0]; if(!f) return;
    await importAny(f); toast('Prompts imported'); VIEWS.prompts();
  };
  $('#expP').onclick = async ()=>{
    const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    download('prompts.csv', toCSV(data));
  };
  const { data=[] } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
  $('#tbP').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.prompt_date||'')}</td>
      <td>${esc(r.prompter_name||'')} <span class="opacity-60">${esc(r.prompter_ao3||'')}</span></td>
      <td>${esc(r.pairing||'')}</td>
      <td>${esc(r.additonal_tags||'')}</td>
      <td>${esc(r.text||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="p-2 opacity-60">No data</td></tr>';
  $$('#tbP select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
};

/************ CLAIMS ************/
VIEWS.claims = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">✍️ Claims</h2>
        <div class="flex items-center gap-2">
          <input id="fileC" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impC" class="btn btn-dark">Import</button>
          <button id="expC" class="btn">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead>
            <tr><th>Prompt</th><th>Pairing</th><th>Tags</th><th>Status</th><th>AO3</th><th>Notes</th></tr>
          </thead>
          <tbody id="tbC"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impC').onclick = async ()=>{
    const f=$('#fileC').files?.[0]; if(!f) return;
    await importAny(f); toast('Claims imported'); VIEWS.claims();
  };
  $('#expC').onclick = async ()=>{
    const {data=[]} = await sb.from('claims').select('*').order('created_at',{ascending:false});
    download('claims.csv', toCSV(data));
  };

  // Ambil claims; tampilkan prompt info dari field redundan (prompt_text/prompt_tags/prompt_pairing) bila ada
  const { data=[] } = await sb.from('claims').select('*').order('created_at',{ascending:false});
  $('#tbC').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.prompt_text||'')}</td>
      <td>${esc(r.prompt_pairing||r.pairing||'')}</td>
      <td>${esc(Array.isArray(r.prompt_tags)? r.prompt_tags.join(', ') : (r.prompt_tags||''))}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${r.ao3_link? `<a class="underline" target="_blank" href="${esc(r.ao3_link)}">link</a>` : '—'}</td>
      <td><textarea data-id="${r.id}" data-field="notes" rows="2" class="rounded-lg border p-1 w-56">${esc(r.notes||'')}</textarea></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="p-2 opacity-60">No data</td></tr>';

  $$('#tbC select').forEach(sel=>{
    sel.onchange = async ()=>{ await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id); toast('Updated'); };
  });
  $$('#tbC textarea[data-field="notes"]').forEach(t=>{
    t.onchange = async ()=>{ await sb.from('claims').update({notes: t.value}).eq('id', t.dataset.id); toast('Updated'); };
  });
};

/************ AUTHORS ************/
const PROG_OPTS = ['idea','outline','draft','beta','ready','posted'];
VIEWS.authors = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
        <div class="flex items-center gap-2">
          <input id="fileA" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impA" class="btn btn-dark">Import</button>
          <button id="expA" class="btn">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Name/AO3</th><th>Prompt</th><th>Pairing</th><th>Description</th><th>Progress</th><th>Email</th><th>Twitter</th><th>Action (DM/Email/Checked)</th></tr></thead>
          <tbody id="tbA"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impA').onclick = async ()=>{
    const f=$('#fileA').files?.[0]; if(!f) return;
    await importAny(f); toast('Authors imported'); VIEWS.authors();
  };
  $('#expA').onclick = async ()=>{
    const {data=[]} = await sb.from('authors').select('*').order('created_at',{ascending:false});
    download('authors.csv', toCSV(data));
  };

  const { data=[] } = await sb.from('authors').select('*').order('created_at',{ascending:false});
  $('#tbA').innerHTML = data.map(r=>{
    const prog = `<select data-id="${r.id}" data-field="progress" class="rounded-lg border p-1">
      ${PROG_OPTS.map(p=>`<option value="${p}" ${r.progress===p?'selected':''}>${p}</option>`).join('')}
    </select>`;
    const email = `<input data-id="${r.id}" data-field="email" value="${esc(r.email||'')}" class="rounded-lg border p-1 w-40"/>`;
    const tw    = `<input data-id="${r.id}" data-field="twitter" value="${esc(r.twitter||'')}" class="rounded-lg border p-1 w-36"/>`;
    const actions = `
      <div class="flex flex-col gap-1">
        ${['dmed','emailed','checked'].map(act=>`
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" data-act="${act}" data-name="${esc(r.name||'')}" />
            <span class="text-xs">${act}</span>
            <input type="date" data-for="${act}" class="rounded-lg border p-1" style="width: 9.5rem"/>
          </label>
        `).join('')}
      </div>`;
    return `<tr>
      <td><div class="font-medium">${esc(r.name||'')}</div><div class="opacity-60 text-xs">${esc(r.ao3||'')}</div></td>
      <td>${esc(r.prompt_text||'')}</td>
      <td>${esc(r.prompt_pairing||'')}</td>
      <td>${esc(Array.isArray(r.prompt_tags)? r.prompt_tags.join(', ') : (r.prompt_tags||''))}</td>
      <td>${prog}</td>
      <td>${email}</td>
      <td>${tw}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="p-2 opacity-60">No data</td></tr>';

  // inline updates
  $$('#tbA [data-field]').forEach(el=>{
    el.onchange = async ()=>{
      const id = el.dataset.id, field = el.dataset.field, val = el.value;
      await sb.from('authors').update({ [field]: val }).eq('id', id);
      toast('Updated');
    };
  });
  // outreach log
  $$('#tbA input[type="checkbox"][data-act]').forEach(chk=>{
    chk.onchange = async ()=>{
      const act = chk.dataset.act;
      const name = chk.dataset.name || '';
      const dateEl = $(`#tbA input[type="date"][data-for="${act}"]`);
      const on_date = dateEl?.value || new Date().toISOString().slice(0,10);
      await sb.from('outreach').insert({ author_name:name, action:act, on_date });
      toast('Action logged');
    };
  });
};

/************ ANNOUNCEMENTS ************/
VIEWS.announcements = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">📢 Announcements</h2>
        <div class="flex items-center gap-2">
          <input id="fileN" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impN" class="btn btn-dark">Import</button>
        </div>
      </div>
      <form id="annForm" class="grid md:grid-cols-2 gap-2 mt-3">
        <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
        <input id="annWhere" class="rounded-xl border p-2" placeholder="Publish in (Twitter/AO3)"/>
        <input id="annWhen" type="datetime-local" class="rounded-xl border p-2"/>
        <label class="inline-flex items-center gap-2 text-sm"><input id="annPub" type="checkbox" class="rounded"/> Publish now</label>
        <textarea id="annBody" rows="3" class="md:col-span-2 rounded-xl border p-2" placeholder="Body…"></textarea>
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
  $('#impN').onclick = async ()=>{
    const f=$('#fileN').files?.[0]; if(!f) return;
    await importAny(f); toast('Announcements imported'); VIEWS.announcements();
  };
  $('#annForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const row = {
      title: $('#annTitle').value.trim(),
      publish_in: $('#annWhere').value.trim(),
      should_publish_at: $('#annWhen').value ? new Date($('#annWhen').value).toISOString() : null,
      is_published: $('#annPub').checked,
      body: $('#annBody').value.trim()
    };
    if(!row.title) return;
    await sb.from('announcements').insert(row);
    toast('Announcement saved'); VIEWS.announcements();
  });
  const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
  $('#annList').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.title||'')}</td>
      <td>${esc(r.publish_in||'-')}</td>
      <td>${r.should_publish_at? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy, HH:mm') : '-'}</td>
      <td>${r.is_published?'Yes':'No'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
};

/************ TIMELINE ************/
VIEWS.timeline = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between gap-2">
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
    const phase = prompt('Phase name'); if(!phase) return;
    const range = prompt('Date range (text)')||'';
    const tasks = prompt('Tasks')||'';
    const start = prompt('Start date (YYYY-MM-DD, optional)')||null;
    await sb.from('timeline').insert({ phase, date_range:range, tasks, start_date:start });
    toast('Timeline added'); VIEWS.timeline();
  };
  await renderHeadline($('#headline'));
  const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
  $('#tbTL').innerHTML = data.map(r=>`<tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
};

/************ DESIGN ************/
VIEWS.design = async function(){
  $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">🎨 Design Board</h2>
        <div class="flex items-center gap-2">
          <input id="fileD" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
          <button id="impD" class="btn btn-dark">Import</button>
          <button id="expD" class="btn">Export CSV</button>
        </div>
      </div>
      <div class="table-wrap mt-3">
        <table class="text-sm">
          <thead><tr><th>Post</th><th>Agenda</th><th>Due Date</th><th>Status</th><th>Link</th></tr></thead>
          <tbody id="tbD"></tbody>
        </table>
      </div>
    </section>
  `;
  $('#impD').onclick = async ()=>{
    const f=$('#fileD').files?.[0]; if(!f) return;
    await importAny(f); toast('Design imported'); VIEWS.design();
  };
  $('#expD').onclick = async ()=>{
    const {data=[]} = await sb.from('design').select('*').order('due_date',{ascending:true});
    download('design.csv', toCSV(data));
  };
  const { data=[] } = await sb.from('design').select('*').order('due_date',{ascending:true});
  $('#tbD').innerHTML = data.map(r=>`
    <tr>
      <td><input data-id="${r.id}" data-field="post" value="${esc(r.post||'')}" class="rounded-lg border p-1 w-40"/></td>
      <td><input data-id="${r.id}" data-field="agenda" value="${esc(r.agenda||'')}" class="rounded-lg border p-1 w-44"/></td>
      <td><input type="date" data-id="${r.id}" data-field="due_date" value="${r.due_date||''}" class="rounded-lg border p-1"/></td>
      <td>
        <select data-id="${r.id}" data-field="status" class="rounded-lg border p-1">
          ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input data-id="${r.id}" data-field="link" value="${esc(r.link||'')}" class="rounded-lg border p-1 w-56"/></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>';
  $$('#tbD [data-field]').forEach(el=>{
    el.onchange = async ()=>{ await sb.from('design').update({ [el.dataset.field]: el.value }).eq('id', el.dataset.id); toast('Updated'); };
  });
};
