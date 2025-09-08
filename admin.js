/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// utils
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const toast=(msg)=>{const t=$("#toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),1700);};
const fmt=(d)=>window.luxon.DateTime.fromISO(d).toFormat('yyyy-LL-dd');

// Router
$('#nav')?.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  setActive(el.dataset.view); (VIEWS[el.dataset.view]||VIEWS.overview)();
});
function setActive(v){ $$('#nav .nav-btn').forEach(b=>b.classList.remove('active')); const el=$(`#nav [data-view="${v}"]`); el?.classList.add('active'); }

// ---------- NOTES ----------
(function initNotes(){
  // default today
  const today = new Date().toISOString().slice(0,10);
  $('#noteDate').value = today;

  $('#noteSave')?.addEventListener('click', async ()=>{
    const row = {
      mod:   $('#noteMod').value,
      mood:  $('#noteMood').value,
      status:$('#noteAvail').value,
      on_date: $('#noteDate').value || today,
      note:  $('#noteText').value.trim()
    };
    // upsert per (mod,on_date)
    const {error} = await sb.from('mod_notes').upsert(row,{onConflict:'mod,on_date'});
    if(error){ console.error(error); toast('Gagal simpan notes'); return; }
    $('#noteText').value=''; toast('Notes tersimpan ✓'); loadNoteRecent();
  });

  loadNoteRecent();
})();
async function loadNoteRecent(){
  const {data,error}=await sb.from('mod_notes').select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  if(error){ console.error(error); return; }
  $('#noteRecent').innerHTML = data.length ? data.map(x=>{
    const badge = `<span class="pill">${x.status}</span>`;
    return `<div class="rounded-lg p-2" style="background:var(--peach)">
      <b>${x.mod}</b> — ${x.mood||''} — ${badge}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note?` · ${x.note}`:''}
    </div>`;
  }).join('') : '<div class="opacity-60">No notes yet.</div>';
}

// ---------- DATA HELPERS ----------
async function getPrompts(){ const {data,error}=await sb.from('prompts').select('*'); if(error) throw error; return data; }
async function getClaims(){ const {data,error}=await sb.from('claims').select('*'); if(error) throw error; return data; }
async function getAuthors(){ const {data,error}=await sb.from('authors').select('*'); if(error) throw error; return data; }
async function getTimeline(){ const {data,error}=await sb.from('timeline').select('*').order('start_date',{ascending:true}); if(error) throw error; return data; }

// ---------- XLSX IMPORT (allsheets) ----------
function normalizeKey(k){ return String(k||'').toLowerCase().replace(/\s+/g,'_').replace(/[^\w]+/g,'_'); }
async function importWorkbook(file){
  const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
  const names = wb.SheetNames.map(s=>s.toLowerCase());

  // PROMPTS
  if(wb.Sheets.Prompts || names.includes('prompts')){
    const sh = wb.Sheets.Prompts || wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==='prompts')];
    const rows = XLSX.utils.sheet_to_json(sh);
    const mapped = rows.map(r=>{
      const o={}; for(const k in r){ o[normalizeKey(k)] = r[k]; }
      return {
        prompt_date: o.prompt_date || o.date || null,
        prompter_name: o.prompter_name || o.prompter || null,
        prompter_ao3: o.prompter_ao3 || o.prompter_ao3_twitter || o.prompter_twitter || null,
        pairing: o.pairing || o.ship || null,
        additonal_tags: o.additonal_tags || o.tags || null,
        rating: o.rating || null,
        text: o.prompt || o.description || o.prompt_description || o.text || null,
        prompt_bank_upload: o.prompt_bank_upload || null,
        status: (o.status_prompt || o.status || 'available').toLowerCase()
      };
    });
    const {error}=await sb.from('prompts').upsert(mapped);
    if(error) throw error;
  }

  // CLAIMS
  if(wb.Sheets.Claims || names.includes('claims')){
    const sh = wb.Sheets.Claims || wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==='claims')];
    const rows = XLSX.utils.sheet_to_json(sh);
    const mapped = rows.map(r=>{
      const o={}; for(const k in r){ o[normalizeKey(k)] = r[k]; }
      return {
        pairing: o.pairing || null,
        status: (o.status_works || o.status || 'pending').toLowerCase(),
        ao3_link: o.ao3_fulfilled || o.ao3 || null,
        notes: o.notes || null,
        author_email: o.author_email || null,
        author_twitter: o.author_twitter || null
      };
    });
    const {error}=await sb.from('claims').upsert(mapped);
    if(error) throw error;
  }

  // AUTHORS
  if(wb.Sheets.Authors || names.includes('authors')){
    const sh = wb.Sheets.Authors || wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==='authors')];
    const rows = XLSX.utils.sheet_to_json(sh);
    const mapped = rows.map(r=>{
      const o={}; for(const k in r){ o[normalizeKey(k)] = r[k]; }
      return {
        name: o.claimed_by || o.name || null,
        claimed_date: o.claimed_date || null,
        progress: (o.status_works || o.progress || 'idea').toLowerCase(),
        email: o.author_email || o.email || null,
        twitter: o.author_twitter || o.twitter || null
      };
    });
    const {error}=await sb.from('authors').upsert(mapped);
    if(error) throw error;
  }

  // ANNOUNCEMENTS
  if(wb.Sheets.Announcements || names.includes('announcements')){
    const sh = wb.Sheets.Announcements || wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==='announcements')];
    const rows = XLSX.utils.sheet_to_json(sh);
    const mapped = rows.map(r=>{
      const o={}; for(const k in r){ o[normalizeKey(k)] = r[k]; }
      return {
        title:o.title||null,
        body:o.body||o.text||null,
        publish_in:o.published_in||o.publish_in||null,
        should_publish_at:o.when_should_be_published||o.date||null,
        is_published: !!o.is_published
      };
    });
    const {error}=await sb.from('announcements').upsert(mapped);
    if(error) throw error;
  }

  // TIMELINE
  if(wb.Sheets.Timeline || names.includes('timeline')){
    const sh = wb.Sheets.Timeline || wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==='timeline')];
    const rows = XLSX.utils.sheet_to_json(sh);
    const mapped = rows.map(r=>{
      const o={}; for(const k in r){ o[normalizeKey(k)] = r[k]; }
      return {
        phase:o.phase,
        date_range:o.date_range,
        tasks:o.tasks,
        start_date:o.start_date || null
      };
    });
    const {error}=await sb.from('timeline').upsert(mapped);
    if(error) throw error;
  }

  // DESIGN (opsional)
  if(wb.Sheets.Design || names.includes('design')){
    const sh = wb.Sheets.Design || wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==='design')];
    const rows = XLSX.utils.sheet_to_json(sh);
    const mapped = rows.map(r=>{
      const o={}; for(const k in r){ o[normalizeKey(k)] = r[k]; }
      return {
        post:o.post, agenda:o.agenda, due_date:o.date_to_be_submitted||o.due_date||null,
        status:(o.status||'pending').toLowerCase(), link:o.link||null
      };
    });
    await sb.from('design').upsert(mapped);
  }
}

/************ VIEWS ************/
const CLAIM_STATES = ['pending','claimed','submitted','dropped','posted'];
const AUTHOR_PROGRESS = ['idea','outline','draft','beta','ready','posted'];

const VIEWS = {
  // -------- Overview --------
  async overview(){
    setActive('overview');
    const wrap = $('#view');
    wrap.innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center gap-2 justify-between">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAll" type="file" accept=".xlsx,.xls" class="text-sm"/>
            <button id="btnAllImport" class="btn">Import</button>
          </div>
        </div>
        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="opacity-70 text-sm">Total Prompts</div><div id="k_total" class="text-2xl font-semibold">-</div></div>
          <div class="kpi"><div class="opacity-70 text-sm">Available Prompts</div><div id="k_avail" class="text-2xl font-semibold">-</div></div>
          <div class="kpi"><div class="opacity-70 text-sm">Active Claims</div><div id="k_claim" class="text-2xl font-semibold">-</div></div>
          <div class="kpi"><div class="opacity-70 text-sm">Authors</div><div id="k_auth" class="text-2xl font-semibold">-</div></div>
        </div>
        <div class="mt-6">
          <h3 class="font-semibold mb-2">Pairing distribution</h3>
          <canvas id="pairingPie" height="160"></canvas>
          <div class="text-xs mt-1 opacity-70">Donut: cincin dalam = prompter; cincin luar = claimed.</div>
        </div>
      </section>`;

    // numbers
    const [prompts, claims, authors] = await Promise.all([getPrompts(), getClaims(), getAuthors()]);
    $('#k_total').textContent = prompts.length;
    $('#k_avail').textContent = prompts.filter(p=>p.status==='available').length;
    $('#k_claim').textContent = claims.filter(c=>['claimed','submitted','posted'].includes((c.status||'').toLowerCase())).length;
    $('#k_auth').textContent = authors.length;

    // pie (donut double ring)
    const by = (arr)=>arr.reduce((m,p)=>{ const k=(p.pairing||'Unknown').trim(); m[k]=(m[k]||0)+1; return m; },{});
    const promptDist = by(prompts);
    const claimedDist = by(claims.filter(c=>['claimed','submitted','posted'].includes((c.status||'').toLowerCase())));
    const labels = Array.from(new Set([...Object.keys(promptDist), ...Object.keys(claimedDist)]));
    const inner = labels.map(l=>promptDist[l]||0);
    const outer = labels.map(l=>claimedDist[l]||0);

    new Chart($('#pairingPie'),{
      type:'doughnut',
      data:{ labels,
        datasets:[
          { label:'Prompter', data:inner },
          { label:'Claimed', data:outer }
        ]
      },
      options:{ responsive:true, plugins:{ legend:{ position:'right' }}, cutout:'55%' }
    });

    // import
    $('#btnAllImport')?.addEventListener('click', async ()=>{
      const f = $('#fileAll')?.files?.[0]; if(!f) return toast('Pilih file dulu');
      try{ await importWorkbook(f); toast('Import berhasil ✓'); VIEWS.overview(); }catch(e){ console.error(e); toast('Import gagal'); }
    });
  },

  // -------- Prompts --------
  async prompts(){
    setActive('prompts');
    const data = await getPrompts();
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div><input id="filePrompts" type="file" accept=".xlsx,.csv" class="text-sm"/>
          <button id="btnImpP" class="btn">Import</button></div>
        </div>
        <div class="table-wrap mt-3">
          <table>
            <thead><tr>
              <th>Prompter</th><th>AO3/Twitter</th><th>Pairing</th><th>Tags</th><th>Rating</th><th>Prompt / Desc</th><th>Status</th>
            </tr></thead>
            <tbody id="p_body"></tbody>
          </table>
        </div>
      </section>`;
    $('#p_body').innerHTML = data.map(p=>`
      <tr>
        <td>${p.prompter_name||''}</td>
        <td>${p.prompter_ao3||''}</td>
        <td>${p.pairing||''}</td>
        <td>${p.additonal_tags||''}</td>
        <td>${p.rating||''}</td>
        <td>${p.text||''}</td>
        <td>
          <select data-id="${p.id}" class="p_status">
            ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('');
    // update status
    $('#p_body').addEventListener('change', async (e)=>{
      const sel = e.target.closest('.p_status'); if(!sel) return;
      const {error}=await sb.from('prompts').update({status:sel.value}).eq('id', sel.dataset.id);
      if(error){ console.error(error); toast('Gagal update'); } else toast('Updated ✓');
    });
    // import only Prompts sheet
    $('#btnImpP').addEventListener('click', async ()=>{
      const f=$('#filePrompts').files?.[0]; if(!f) return toast('Pilih file');
      try{
        const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
        const sh=wb.Sheets.Prompts||wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(sh);
        const mapped=rows.map(r=>{const o={};for(const k in r){o[normalizeKey(k)]=r[k];}
          return { prompt_date:o.prompt_date||null, prompter_name:o.prompter_name||o.prompter||null,
            prompter_ao3:o.prompter_ao3||o.prompter_ao3_twitter||o.prompter_twitter||null,
            pairing:o.pairing||null, additonal_tags:o.additonal_tags||o.tags||null,
            rating:o.rating||null, text:o.prompt||o.description||o.text||null,
            prompt_bank_upload:o.prompt_bank_upload||null, status:(o.status_prompt||o.status||'available').toLowerCase()
          };
        });
        await sb.from('prompts').upsert(mapped); toast('Import berhasil ✓'); VIEWS.prompts();
      }catch(e){ console.error(e); toast('Import gagal'); }
    });
  },

  // -------- Claims (dengan prompt/tags/pairing tampil) --------
  async claims(){
    setActive('claims');
    const [claims, prompts] = await Promise.all([getClaims(), getPrompts()]);
    // enrich by pairing
    const byPair = new Map();
    prompts.forEach(p=>byPair.set((p.pairing||'').trim(), p));
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">✍️ Claims</h2>
          <div><input id="fileClaims" type="file" accept=".xlsx,.csv" class="text-sm"/>
          <button id="btnImpC" class="btn">Import</button></div>
        </div>
        <div class="table-wrap mt-3">
          <table>
            <thead><tr>
              <th>Prompter</th><th>Prompt</th><th>Tags</th><th>Pairing</th>
              <th>Status</th><th>AO3 link</th><th>Notes</th>
            </tr></thead>
            <tbody id="c_body"></tbody>
          </table>
        </div>
      </section>`;
    $('#c_body').innerHTML = claims.map(c=>{
      const p = byPair.get((c.pairing||'').trim())||{};
      return `<tr>
        <td>${p.prompter_name||''}</td>
        <td style="min-width:260px">${p.text||''}</td>
        <td>${p.additonal_tags||''}</td>
        <td><span class="pill">${c.pairing||p.pairing||''}</span></td>
        <td>
          <select data-id="${c.id}" class="c_status">
            ${CLAIM_STATES.map(s=>`<option ${String(c.status).toLowerCase()===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input data-id="${c.id}" data-k="ao3_link" value="${c.ao3_link||''}" placeholder="https://ao3..."/></td>
        <td><textarea data-id="${c.id}" data-k="notes" rows="1">${c.notes||''}</textarea></td>
      </tr>`;
    }).join('');

    // update handlers
    $('#c_body').addEventListener('change', async (e)=>{
      const sel = e.target.closest('.c_status'); if(sel){
        const {error}=await sb.from('claims').update({status:sel.value}).eq('id', sel.dataset.id);
        return error? (console.error(error), toast('Gagal update')) : toast('Updated ✓');
      }
      const inp=e.target.closest('input,textarea'); if(inp){
        const payload={}; payload[inp.dataset.k]=inp.value;
        const {error}=await sb.from('claims').update(payload).eq('id', inp.dataset.id);
        return error? (console.error(error), toast('Gagal update')) : toast('Updated ✓');
      }
    });

    // import only Claims sheet
    $('#btnImpC').addEventListener('click', async ()=>{
      const f=$('#fileClaims').files?.[0]; if(!f) return toast('Pilih file');
      try{
        const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
        const sh=wb.Sheets.Claims||wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(sh);
        const mapped=rows.map(r=>{const o={};for(const k in r){o[normalizeKey(k)]=r[k];}
          return { pairing:o.pairing||null, status:(o.status_works||o.status||'pending').toLowerCase(),
            ao3_link:o.ao3_fulfilled||o.ao3||null, notes:o.notes||null,
            author_email:o.author_email||null, author_twitter:o.author_twitter||null };
        });
        await sb.from('claims').upsert(mapped); toast('Import berhasil ✓'); VIEWS.claims();
      }catch(e){ console.error(e); toast('Import gagal'); }
    });
  },

  // -------- Authors (pakai claimed_by + tampilin prompt/pairing/desc) --------
  async authors(){
    setActive('authors');
    const [authors, claims, prompts] = await Promise.all([getAuthors(), getClaims(), getPrompts()]);
    // map email -> claim -> prompt
    const claimByEmail = new Map();
    claims.forEach(c=>{ if(c.author_email) claimByEmail.set(c.author_email.trim().toLowerCase(), c); });
    const promptByPair = new Map(); prompts.forEach(p=>promptByPair.set((p.pairing||'').trim(), p));

    $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
        <div><input id="fileAuthors" type="file" accept=".xlsx,.csv" class="text-sm"/>
        <button id="btnImpA" class="btn">Import</button>
        <button id="btnExpA" class="btn btn-ghost">Export CSV</button></div>
      </div>

      <div class="table-wrap mt-3">
        <table>
          <thead><tr>
            <th>Name</th><th>Claimed Date</th>
            <th>Prompt</th><th>Pairing</th><th>Description</th>
            <th>Progress</th><th>Email</th><th>Twitter</th>
          </tr></thead>
          <tbody id="a_body"></tbody>
        </table>
      </div>
    </section>`;

    $('#a_body').innerHTML = authors.map(a=>{
      const c = a.email ? claimByEmail.get(String(a.email).toLowerCase()) : null;
      const p = c ? promptByPair.get((c.pairing||'').trim()) : null;
      return `<tr>
        <td>${a.name||''}</td>
        <td>${a.claimed_date||''}</td>
        <td style="min-width:240px">${p?.text||'-'}</td>
        <td>${p?.pairing||c?.pairing||'-'}</td>
        <td>${p?.additonal_tags||'-'}</td>
        <td>
          <select data-id="${a.id}" class="a_progress">
            ${AUTHOR_PROGRESS.map(s=>`<option ${String(a.progress).toLowerCase()===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input data-id="${a.id}" data-k="email" value="${a.email||''}"/></td>
        <td><input data-id="${a.id}" data-k="twitter" value="${a.twitter||''}"/></td>
      </tr>`;
    }).join('');

    // updates
    $('#a_body').addEventListener('change', async (e)=>{
      const sel=e.target.closest('.a_progress'); if(sel){
        const {error}=await sb.from('authors').update({progress:sel.value}).eq('id',sel.dataset.id);
        return error? (console.error(error), toast('Gagal update')) : toast('Updated ✓');
      }
      const inp=e.target.closest('input'); if(inp){
        const payload={}; payload[inp.dataset.k]=inp.value;
        const {error}=await sb.from('authors').update(payload).eq('id',inp.dataset.id);
        return error? (console.error(error), toast('Gagal update')) : toast('Updated ✓');
      }
    });

    // import only Authors sheet
    $('#btnImpA').addEventListener('click', async ()=>{
      const f=$('#fileAuthors').files?.[0]; if(!f) return toast('Pilih file');
      try{
        const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
        const sh=wb.Sheets.Authors||wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(sh);
        const mapped=rows.map(r=>{const o={};for(const k in r){o[normalizeKey(k)]=r[k];}
          return { name:o.claimed_by||o.name||null, claimed_date:o.claimed_date||null,
            progress:(o.status_works||o.progress||'idea').toLowerCase(),
            email:o.author_email||o.email||null, twitter:o.author_twitter||o.twitter||null };
        });
        await sb.from('authors').upsert(mapped); toast('Import berhasil ✓'); VIEWS.authors();
      }catch(e){ console.error(e); toast('Import gagal'); }
    });

    // export CSV sederhana
    $('#btnExpA').addEventListener('click', ()=>{
      const headers=['name','claimed_date','progress','email','twitter'];
      const csv=[headers.join(',')].concat(authors.map(a=>headers.map(h=>JSON.stringify(a[h]??'')).join(','))).join('\n');
      const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download='authors.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  },

  // -------- Announcements (ringkas) --------
  async announcements(){
    setActive('announcements');
    const {data}=await sb.from('announcements').select('*').order('created_at',{ascending:false});
    $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <h2 class="text-xl font-semibold">📢 Announcements</h2>
      <div class="mt-3 space-y-3" id="ann_list">
        ${(data||[]).map(a=>`
          <div class="p-3 rounded-2xl" style="background:var(--peach)">
            <div class="font-medium">${a.title||'(no title)'} ${a.is_published?'<span class="pill">published</span>':''}</div>
            <div class="text-sm opacity-80">${a.body||''}</div>
          </div>`).join('')}
      </div>
    </section>`;
  },

  // -------- Timeline (restore + countdown) --------
  async timeline(){
    setActive('timeline');
    const rows = await getTimeline();
    const master = rows.find(r=>String(r.phase).toLowerCase().includes('masterlist'));
    const days = master?.start_date ? Math.max(0, Math.ceil((new Date(master.start_date)-new Date())/86400000)) : null;

    $('#view').innerHTML = `
    <section class="p-4 rounded-2xl card">
      <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
      <div class="mt-2">${days!=null?`<span class="pill">Countdown: ${days} day(s) to Masterlist</span>`:''}</div>
      <div class="table-wrap mt-3">
        <table>
          <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
          <tbody id="tl_body"></tbody>
        </table>
      </div>
    </section>`;
    $('#tl_body').innerHTML = rows.map(r=>`
      <tr>
        <td><b>${r.phase}</b></td>
        <td>${r.date_range||''}</td>
        <td><input data-id="${r.id}" class="tl_tasks" value="${r.tasks||''}" /></td>
        <td>${r.start_date||''}</td>
      </tr>`).join('');

    // inline save tasks
    $('#tl_body').addEventListener('change', async (e)=>{
      const inp=e.target.closest('.tl_tasks'); if(!inp) return;
      const {error}=await sb.from('timeline').update({tasks:inp.value}).eq('id',inp.dataset.id);
      error? (console.error(error), toast('Gagal update')) : toast('Updated ✓');
    });
  },

  // -------- Design (placeholder) --------
  async design(){
    setActive('design');
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold">🎨 Design</h2>
        <p class="text-sm mt-2">Board untuk post/agenda/due/status/link. (opsional—data akan ikut di import bila sheet <i>Design</i> ada.)</p>
      </section>`;
  }
};

// default load
setActive('overview'); VIEWS.overview();
