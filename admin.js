/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); };

/************ SIDEBAR ROUTER ************/
$('#nav')?.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]');
  if(!el) return;
  const v = el.dataset.view;
  setActive(v);
  (VIEWS[v]||VIEWS.overview)();
});

function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('ring-2'));
  const el = $(`#nav [data-view="${v}"]`);
  el?.classList.add('ring-2');
}

/************ UTIL ************/
const MODS = ['Nio','Sha','Naya','Cinta'];
const KAOMOJIS = [
  "(´･ω･`)", "(＾▽＾)", "(｡T ω T｡)", "(╯°□°）╯︵ ┻━┻", "¯\\_(ツ)_/¯",
  "(^ ▽ ^)", "( •̀ ω •́ )✧", "(つ•̀-•́)つ", "(◕‿◕)", "(๑•̀‧̫•́๑)"
];
function fillKaomojiSelect(sel){
  sel.innerHTML = KAOMOJIS.map(k=>`<option>${k}</option>`).join('');
}
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="badge" style="background:${map[s]||'#eee'}">${s}</span>`;
}

/************ VIEWS ************/
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex gap-2 items-center">
            <input id="fileOverview" type="file" accept=".xlsx,.xls" class="text-sm"/>
            <button id="btnImport" class="btn">Import</button>
          </div>
        </div>

        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="opacity-70 text-sm">Total Prompts</div><div id="kpiTotal" class="text-2xl font-bold">–</div></div>
          <div class="kpi"><div class="opacity-70 text-sm">Available Prompts</div><div id="kpiAvail" class="text-2xl font-bold">–</div></div>
          <div class="kpi"><div class="opacity-70 text-sm">Active Claims</div><div id="kpiClaims" class="text-2xl font-bold">–</div></div>
          <div class="kpi"><div class="opacity-70 text-sm">Authors</div><div id="kpiAuthors" class="text-2xl font-bold">–</div></div>
        </div>

        <div class="mt-6 p-3 rounded-2xl" style="background:#fff8;">
          <h3 class="font-semibold mb-2">Pairing — Prompter vs Claimed</h3>
          <canvas id="pairingChart" height="120"></canvas>
        </div>
      </section>
    `;

    // bind import
    $('#btnImport')?.addEventListener('click', onImportXlsx);

    // stats
    try{
      const { data:vs } = await sb.rpc('v_stats'); // if function exists
      if(vs && vs.length){ const s=vs[0]; $('#kpiTotal').textContent=s.prompts_total; $('#kpiAvail').textContent=s.prompts_available; $('#kpiClaims').textContent=s.claims_active; $('#kpiAuthors').textContent=s.authors_total; }
      else{
        // fallback
        const [pall, pav, cl, au] = await Promise.all([
          sb.from('prompts').select('id', {count:'exact', head:true}),
          sb.from('prompts').select('id', {count:'exact', head:true}).eq('status','available'),
          sb.from('claims').select('id', {count:'exact', head:true}).in('status',['claimed','submitted','posted','approved']),
          sb.from('authors').select('id', {count:'exact', head:true}),
        ]);
        $('#kpiTotal').textContent = pall.count ?? '0';
        $('#kpiAvail').textContent = pav.count ?? '0';
        $('#kpiClaims').textContent = cl.count ?? '0';
        $('#kpiAuthors').textContent = au.count ?? '0';
      }
    }catch{}

    // pairing bar chart
    const [prompter, claimed] = await Promise.all([
      sb.from('prompts').select('pairing'),
      sb.from('claims').select('pairing'),
    ]);
    const cnt = (rows)=>rows?.data?.reduce((m,r)=>{ const k=(r.pairing||'Unknown').trim(); m[k]=(m[k]||0)+1; return m; },{})||{};
    const a = cnt(prompter||{data:[]});
    const b = cnt(claimed||{data:[]});
    const labels = Array.from(new Set([...Object.keys(a),...Object.keys(b)]));
    const da = labels.map(k=>a[k]||0);
    const db = labels.map(k=>b[k]||0);
    const ctx = $('#pairingChart').getContext('2d');
    new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[
        { label:'From Prompter', data:da },
        { label:'Claimed', data:db }
      ]},
      options:{ responsive:true, maintainAspectRatio:false }
    });
  },

  async prompts(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div class="flex gap-2 items-center">
            <input id="filePrompts" type="file" accept=".xlsx,.xls" class="text-sm"/>
            <button id="btnImportPrompts" class="btn">Import</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table>
            <thead><tr><th>Date</th><th>Prompter</th><th>AO3/Twitter</th><th>Pairing</th><th>Tags</th><th>Rating</th><th>Prompt</th><th>Status</th></tr></thead>
            <tbody id="tbPrompts"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#btnImportPrompts')?.addEventListener('click', onImportXlsx);

    const { data } = await sb.from('prompts').select('*').order('created_at',{ascending:false}).limit(300);
    $('#tbPrompts').innerHTML = (data||[]).map(r=>`
      <tr>
        <td>${r.prompt_date||''}</td>
        <td>${r.prompter_name||''}</td>
        <td>${r.prompter_ao3||''}</td>
        <td><span class="pill">${r.pairing||''}</span></td>
        <td>${r.additonal_tags||''}</td>
        <td>${r.rating||''}</td>
        <td>${(r.text||'').slice(0,140)}</td>
        <td>
          <select data-id="${r.id}" class="selPromptStatus rounded-xl border p-1">
            ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('');

    // inline update status
    $$('.selPromptStatus').forEach(sel=>{
      sel.addEventListener('change', async (e)=>{
        const id = sel.dataset.id; const status = sel.value;
        await sb.from('prompts').update({status}).eq('id', id);
        toast('Prompt updated');
      });
    });
  },

  async claims(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">✍️ Claims</h2>
          <div class="flex gap-2 items-center">
            <input id="fileClaims" type="file" accept=".xlsx,.xls" class="text-sm"/>
            <button id="btnImportClaims" class="btn">Import</button>
          </div>
        </div>
        <div class="table-wrap mt-3">
          <table>
            <thead><tr><th>Pairing</th><th>Status</th><th>Email</th><th>Twitter</th><th>AO3 link</th><th>Notes</th></tr></thead>
            <tbody id="tbClaims"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#btnImportClaims')?.addEventListener('click', onImportXlsx);

    const { data } = await sb.from('claims').select('*').order('created_at',{ascending:false}).limit(300);
    $('#tbClaims').innerHTML = (data||[]).map(r=>`
      <tr>
        <td>${r.pairing||''}</td>
        <td>
          <select data-id="${r.id}" class="selClaimStatus rounded-xl border p-1">
            ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${r.author_email||''}</td>
        <td>${r.author_twitter||''}</td>
        <td>${r.ao3_link ? `<a class="text-blue-700 underline" href="${r.ao3_link}" target="_blank">link</a>`:''}</td>
        <td>${r.notes||''}</td>
      </tr>
    `).join('');

    $$('.selClaimStatus').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        const id = sel.dataset.id; const status = sel.value;
        await sb.from('claims').update({status}).eq('id', id);
        toast('Claim updated');
      });
    });
  },

  async authors(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
          <div class="flex gap-2 items-center">
            <input id="fileAuthors" type="file" accept=".xlsx,.xls" class="text-sm"/>
            <button id="btnImportAuthors" class="btn">Import</button>
          </div>
        </div>

        <div class="table-wrap mt-3">
          <table>
            <thead>
              <tr>
                <th>Name/AO3</th><th>Prompt</th><th>Pairing</th><th>Description</th>
                <th>Progress</th><th>Email</th><th>Twitter</th><th>Notes</th>
              </tr>
            </thead>
            <tbody id="tbAuthors"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#btnImportAuthors')?.addEventListener('click', onImportXlsx);

    // fetch & merge: authors + claims + prompts
    const [authors, claims, prompts] = await Promise.all([
      sb.from('authors').select('*').order('created_at',{ascending:false}).limit(500),
      sb.from('claims').select('*').limit(1000),
      sb.from('prompts').select('id,text,pairing').limit(1000)
    ]);

    const byAuthor = {};
    (claims.data||[]).forEach(c=>{
      const key = (c.author_name||'').trim().toLowerCase();
      if(!key) return;
      // attach possible prompt info if your claims has prompt_id
      let promptText='', pairing=c.pairing||'';
      if (c.prompt_id && prompts.data){
        const pr = prompts.data.find(p=>p.id===c.prompt_id);
        if(pr){ promptText = pr.text||''; pairing = pr.pairing||pairing; }
      }
      byAuthor[key] = byAuthor[key] || {};
      byAuthor[key].pairing = pairing || byAuthor[key].pairing;
      byAuthor[key].prompt  = promptText || byAuthor[key].prompt;
      byAuthor[key].desc    = promptText || byAuthor[key].desc;
    });

    $('#tbAuthors').innerHTML = (authors.data||[]).map(a=>{
      const k = (a.name||'').trim().toLowerCase();
      const x = byAuthor[k] || {};
      return `
        <tr>
          <td>${a.name||''}<div class="opacity-60 text-xs">${a.claimed_date||''}</div></td>
          <td>${(x.prompt||'').slice(0,80)}</td>
          <td><span class="pill">${x.pairing||''}</span></td>
          <td>${(x.desc||'').slice(0,120)}</td>
          <td>
            <select data-id="${a.id}" class="selAuthorProg rounded-xl border p-1">
              ${['idea','outline','draft','beta','ready','posted'].map(s=>`<option ${a.progress===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </td>
          <td>${a.email||''}</td>
          <td>${a.twitter||''}</td>
          <td>${a.note||''}</td>
        </tr>
      `;
    }).join('');

    $$('.selAuthorProg').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        const id = sel.dataset.id; const progress = sel.value;
        await sb.from('authors').update({progress}).eq('id', id);
        toast('Author updated');
      });
    });
  },

  async announcements(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold">📢 Announcements</h2>
        <div class="table-wrap mt-3">
          <table>
            <thead><tr><th>Title</th><th>Publish In</th><th>Schedule</th><th>Published?</th></tr></thead>
            <tbody id="tbAnn"></tbody>
          </table>
        </div>
      </section>
    `;
    const { data } = await sb.from('announcements').select('*').order('created_at',{ascending:false});
    $('#tbAnn').innerHTML = (data||[]).map(a=>`
      <tr>
        <td>${a.title||''}</td>
        <td>${a.publish_in||''}</td>
        <td>${a.should_publish_at||''}</td>
        <td>${a.is_published? '✅' : '—'}</td>
      </tr>
    `).join('');
  },

  async timeline(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
        <p class="text-sm opacity-70">Countdown ke Masterlist + daftar fase.</p>
        <div class="mt-3 table-wrap">
          <table>
            <thead><tr><th>Phase</th><th>Date Range</th><th>Tasks</th><th>Start</th></tr></thead>
            <tbody id="tbT"></tbody>
          </table>
        </div>
      </section>
    `;
    const { data } = await sb.from('timeline').select('*').order('start_date',{ascending:true});
    $('#tbT').innerHTML = (data||[]).map(t=>`
      <tr><td>${t.phase}</td><td>${t.date_range||''}</td><td>${t.tasks||''}</td><td>${t.start_date||''}</td></tr>
    `).join('');
  },

  async design(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold">🎨 Design</h2>
        <div class="table-wrap mt-3">
          <table>
            <thead><tr><th>Post</th><th>Agenda</th><th>Due Date</th><th>Status</th><th>Link</th></tr></thead>
            <tbody id="tbDesign"></tbody>
          </table>
        </div>
      </section>
    `;
    const { data } = await sb.from('design').select('*').order('due_date',{ascending:true});
    $('#tbDesign').innerHTML = (data||[]).map(d=>`
      <tr>
        <td>${d.post||''}</td><td>${d.agenda||''}</td><td>${d.due_date||''}</td>
        <td>${d.status||''}</td><td>${d.link?`<a class="text-blue-700 underline" href="${d.link}" target="_blank">open</a>`:''}</td>
      </tr>
    `).join('');
  },
};

// default
setActive('overview'); VIEWS.overview();

/************ NOTES (save & recent) ************/
(function initNotes(){
  // date default today
  const d = $('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10);
  // fill kaomoji
  ['#nioMood','#shaMood','#nayaMood','#cintaMood'].forEach(id=>fillKaomojiSelect($(id)));
  // bind save
  $('#modSave')?.addEventListener('click', saveNotes);
  loadRecent();
})();

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

  const { error } = await sb.from('mod_notes')
    .upsert(rows, { onConflict:'mod,on_date' });
  if(error){ console.error(error); toast('❌ Gagal simpan'); return; }
  $('#modNote').value = '';
  toast('✅ Notes saved');
  loadRecent();
}

async function loadRecent(){
  const { data=[], error } = await sb.from('mod_notes')
    .select('*').order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  if(error){ console.error(error); return; }
  $('#modRecent').innerHTML = data.length ? data.map(x=>`
    <div class="chip">
      <b>${x.mod}</b> — ${x.mood||''} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note ? ' · '+x.note : ''}
    </div>
  `).join('') : '<div class="opacity-60">No notes yet.</div>';
}

/************ XLSX IMPORT ************/
async function onImportXlsx(){
  const inp = this.id==='btnImport' ? $('#fileOverview')
            : this.id==='btnImportPrompts' ? $('#filePrompts')
            : this.id==='btnImportClaims'  ? $('#fileClaims')
            : this.id==='btnImportAuthors' ? $('#fileAuthors') : $('#fileOverview');
  const file = inp?.files?.[0];
  if(!file){ toast('Pilih file .xlsx dulu'); return; }

  try{
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:'array'});

    // helper upsert
    const up = async (table, rows, onConflict) => {
      if(!rows.length) return;
      const { error } = await sb.from(table).upsert(rows, { onConflict });
      if(error) throw error;
    };

    // Prompts sheet
    const shP = wb.Sheets['Prompts'] || wb.Sheets['prompts'];
    if(shP){
      const arr = XLSX.utils.sheet_to_json(shP);
      const rows = arr.map(r=>({
        prompt_date: r.prompt_date || r.date || null,
        prompter_name: r.prompter_name || r.prompter || r.name || null,
        prompter_ao3: r.prompter_ao3 || r.twitter || r.ao3 || null,
        pairing: r.pairing || null,
        additonal_tags: r.additonal_tags || r.tags || null,
        rating: r.rating || null,
        text: r.prompt || r.description || r.text || null,
        prompt_bank_upload: r.prompt_bank_upload || null,
        status: (r.status_prompt || r.status || 'available').toString().toLowerCase()
      }));
      await up('prompts', rows, 'id');
    }

    // Claims sheet
    const shC = wb.Sheets['Claims'] || wb.Sheets['claims'];
    if(shC){
      const arr = XLSX.utils.sheet_to_json(shC);
      const rows = arr.map(r=>({
        pairing: r.pairing || null,
        status: (r.status || r.status_works || 'pending').toString().toLowerCase(),
        author_email: r.author_email || r.email || null,
        author_twitter: r.author_twitter || r.twitter || null,
        ao3_link: r['AO3 fulfilled'] || r.ao3 || r.ao3_link || null,
        notes: r.Notes || r.notes || null
      }));
      await up('claims', rows, 'id');
    }

    // Authors sheet
    const shA = wb.Sheets['Authors'] || wb.Sheets['authors'];
    if(shA){
      const arr = XLSX.utils.sheet_to_json(shA);
      const rows = arr.map(r=>({
        name: r.claimed_by || r.name || r.author || null,
        claimed_date: r.claimed_date || r.tanggal || null,
        progress: (r.status_works || r.progress || 'idea').toString().toLowerCase(),
        email: r.author_email || r.email || null,
        twitter: r.author_twitter || r.twitter || null
      })).filter(x=>x.name);
      await up('authors', rows, 'id');
    }

    toast('✅ Import berhasil');
    // refresh current view
    const active = $('#nav .ring-2')?.dataset?.view || 'overview';
    (VIEWS[active]||VIEWS.overview)();
  }catch(err){
    console.error(err);
    toast('❌ Import gagal');
  }
}
