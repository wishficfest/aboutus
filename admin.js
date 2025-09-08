/************ CONFIG ************/
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DateTime = luxon.DateTime;

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1800); };
const setActive = (v)=> $$('#nav .nav-btn').forEach(b=> b.classList.toggle('active', b.dataset.view===v));

/************ ROUTER ************/
$('#nav').addEventListener('click', (e)=>{
  const el = e.target.closest('[data-view]'); if(!el) return;
  showView(el.dataset.view);
});

function showView(view){
  setActive(view);
  // hide all
  ['overview','prompts','claims','authors','announcements','timeline','design']
    .forEach(id => $(`#sec-${id}`)?.classList.add('hidden'));
  // show one
  $(`#sec-${view}`)?.classList.remove('hidden');

  // load content
  const map = {overview, prompts, claims, authors, announcements, timeline, design};
  (map[view]||overview)();
}

document.addEventListener('DOMContentLoaded', ()=>{
  // default date in notes
  const d = $('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10);
  // buttons
  $('#btnImportAny')?.addEventListener('click', ()=> handleImport($('#fileAny')));
  $('#impPrompts')?.addEventListener('click', ()=> handleImport($('#filePrompts'), 'prompts'));
  $('#impClaims') ?.addEventListener('click', ()=> handleImport($('#fileClaims'),  'claims'));
  $('#impAuthors')?.addEventListener('click', ()=> handleImport($('#fileAuthors'), 'authors'));
  $('#expPrompts')?.addEventListener('click', exportPrompts);
  $('#expClaims') ?.addEventListener('click', exportClaims);
  $('#expAuthors')?.addEventListener('click', exportAuthors);

  $('#annForm')?.addEventListener('submit', saveAnnouncement);
  $('#addPhase')?.addEventListener('click', addPhase);
  $('#addDesign')?.addEventListener('click', addDesign);

  $('#modSave')?.addEventListener('click', saveNotes);

  showView('overview');
});

/************ XLSX/CSV IMPORT ************/
async function handleImport(input, target){
  const file = input?.files?.[0];
  if(!file){ toast('Pilih file CSV/XLSX'); return; }
  const wb = await readWorkbook(file);
  let inserted = 0;

  if(!target || target==='prompts'){
    inserted += await upsertPrompts(wb);
  }
  if(!target || target==='claims'){
    inserted += await upsertClaims(wb);
  }
  if(!target || target==='authors'){
    inserted += await upsertAuthors(wb);
  }

  $('#lastSync').textContent = 'Last import: ' + new Date().toLocaleString();
  toast(`Imported ${inserted} rows`);
  // reload current view
  const active = $$('#nav .nav-btn').find(b=>b.classList.contains('active'))?.dataset.view || 'overview';
  showView(active);
}

function readWorkbook(file){
  return new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = e=>{
      const sheets = [];
      if(file.name.toLowerCase().endsWith('.csv')){
        const rows = e.target.result.split(/\r?\n/).map(l=>l.split(','));
        sheets.push({name:'CSV', rows});
      } else {
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

/************ UPSERT HELPERS (FOLLOW YOUR LATEST SCHEMA) ************/
/* prompts: prompt_date, prompter_name, prompter_ao3, pairing, additonal_tags, rating, text(prompt/desc), prompt_bank_upload, status */
async function upsertPrompts(sheets){
  let count=0;
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      date:['prompt_date','date'],
      prompter_name:['prompter_name','prompter'],
      prompter_ao3:['prompter_ao3','prompter_twitter','ao3','twitter'],
      pairing:['pairing'],
      tags:['additonal_tags','additional','tags','tag'],
      rating:['rating'],
      text:['prompt','description','text'],
      bank:['prompt_bank_upload'],
      status:['status_prompt','status']
    });
    if(idx.text<0) continue;

    const rows = ws.rows.slice(1)
      .filter(r=> (r[idx.text]||'').toString().trim()!=='')
      .map(r=>({
        prompt_date: parseDate(r[idx.date]),
        prompter_name: val(r[idx.prompter_name]),
        prompter_ao3: val(r[idx.prompter_ao3]),
        pairing: val(r[idx.pairing]),
        additonal_tags: val(r[idx.tags]),
        rating: val(r[idx.rating]),
        text: val(r[idx.text]),
        prompt_bank_upload: val(r[idx.bank]),
        status: (val(r[idx.status])||'available').toLowerCase()
      }));
    if(rows.length){
      const {error} = await sb.from('prompts').insert(rows);
      if(!error) count += rows.length;
    }
  }
  return count;
}

/* claims: pairing, status, ao3_link, notes, plus prompt join fields (read-only) & author */
async function upsertClaims(sheets){
  let count=0;
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      pairing:['pairing'],
      status:['status','status_works','status_words'],
      ao3:['ao3','ao3 link','ao3_link'],
      notes:['notes','catatan'],
      author:['author','authors','claimed_by','name'],
      prompt:['prompt','description','text'],
      tags:['tag','tags'],
    });
    if(idx.author<0 && idx.pairing<0 && idx.status<0) continue;

    const rows = ws.rows.slice(1).filter(r => (val(r[idx.author])||val(r[idx.pairing])||'')!=='')
      .map(r=>({
        pairing: val(r[idx.pairing]),
        status: normClaimStatus(val(r[idx.status])||'pending'),
        ao3_link: val(r[idx.ao3]),
        notes: val(r[idx.notes]),
        author_name: val(r[idx.author]) || null
      }));
    if(rows.length){
      const {error} = await sb.from('claims').insert(rows);
      if(!error) count += rows.length;
    }
  }
  return count;
}

/* authors: name (claimed_by), claimed_date, progress(status_works), email, twitter, + (prompt view nanti di render hasil join) */
async function upsertAuthors(sheets){
  let count=0;
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      name:['claimed_by','author','authors','name'],
      claimed_date:['claimed_date','tanggal'],
      progress:['status_works','progress','tahap'],
      email:['author_email','email'],
      twitter:['author_twitter','twitter']
    });
    if(idx.name<0 && idx.email<0 && idx.twitter<0) continue;

    const rows = ws.rows.slice(1).filter(r => (val(r[idx.name])||val(r[idx.email])||val(r[idx.twitter])||'')!=='')
      .map(r=>({
        name: val(r[idx.name]),
        claimed_date: parseDate(r[idx.claimed_date]),
        progress: normalizeProgress(val(r[idx.progress])),
        email: val(r[idx.email]),
        twitter: val(r[idx.twitter])
      }));
    if(rows.length){
      const {error} = await sb.from('authors').insert(rows);
      if(!error) count += rows.length;
    }
  }
  return count;
}

function val(v){ return (v==null)? null : String(v).trim(); }
function parseDate(v){
  if(!v) return null;
  const s = String(v).trim();
  // try parse ISO or Excel date
  const dt = DateTime.fromISO(s);
  if(dt.isValid) return dt.toISODate();
  const asNum = Number(s);
  if(!Number.isNaN(asNum) && asNum>20000){ // excel serial?
    const base = DateTime.fromISO('1899-12-30').plus({days:asNum});
    return base.toISODate();
  }
  return null;
}
function normalizeProgress(s){
  const v = (s||'').toLowerCase();
  if(v.includes('0')||v.includes('belum')||v.includes('idea')) return 'idea';
  if(v.includes('20')||v.includes('outline')) return 'outline';
  if(v.includes('40')||v.includes('draft')) return 'draft';
  if(v.includes('60')||v.includes('beta')) return 'beta';
  if(v.includes('80')||v.includes('finishing')||v.includes('ready')) return 'ready';
  if(v.includes('posted')||v.includes('done')) return 'posted';
  return v || 'idea';
}
function normClaimStatus(s){
  const v=(s||'').toLowerCase();
  if(v.includes('post')) return 'posted';
  if(v.includes('submit')) return 'submitted';
  if(v.includes('drop')) return 'dropped';
  if(v.includes('claim')) return 'claimed';
  if(v.includes('approve')) return 'claimed';
  return 'pending';
}

/************ OVERVIEW ************/
let chartPrompted, chartClaimed;

async function overview(){
  // KPI
  const {data:stats} = await sb.from('v_stats').select('*').maybeSingle();
  $('#kPrompts').textContent = stats?.prompts_total ?? 0;
  $('#kAvail').textContent   = stats?.prompts_available ?? 0;
  $('#kClaims').textContent  = stats?.claims_active ?? 0;
  $('#kAuthors').textContent = stats?.authors_total ?? 0;

  // Pairing distribution — prompted
  const {data:prompts=[]} = await sb.from('prompts').select('pairing').not('pairing','is',null);
  const freqP = countBy(prompts.map(p=>p.pairing));
  drawPie('chartPrompted', freqP, (c)=>{ chartPrompted=c; });
  renderTop5('#rankPrompted', '#topPrompted', freqP);

  // Pairing distribution — claimed (ambil dari claims.status in claimed/submitted/posted, fallback pending juga dihitung)
  const {data:claims=[]} = await sb.from('claims').select('pairing,status');
  const freqC = countBy(claims.filter(x=>true).map(x=>x.pairing).filter(Boolean));
  drawPie('chartClaimed', freqC, (c)=>{ chartClaimed=c; });
  renderTop5('#rankClaimed', '#topClaimed', freqC);

  // Countdown Masterlist
  const {data:tl=[]} = await sb.from('timeline').select('*').eq('phase','Masterlist Thread').limit(1);
  const target = tl?.[0]?.start_date;
  startCountdown('#countdown', target);
  startCountdown('#countdownTL', target);
}

function countBy(arr){
  const m = new Map();
  arr.forEach(x=>{
    const k = (x||'').trim();
    if(!k) return;
    m.set(k, (m.get(k)||0)+1);
  });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
function drawPie(canvasId, entries, setRef){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  const labels = entries.slice(0,8).map(x=>x[0]);
  const data = entries.slice(0,8).map(x=>x[1]);
  if(setRef && ctx.chart){ ctx.chart.destroy(); }
  const c = new Chart(ctx, {
    type:'pie',
    data:{ labels, datasets:[{ data }] },
    options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } }
  });
  ctx.chart = c;
  setRef?.(c);
}
function renderTop5(listSel, capSel, entries){
  const top = entries.slice(0,5);
  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  $(capSel).textContent = top.length ? `Top ${top.length}` : '—';
  $(listSel).innerHTML = top.map((x,i)=> `<li>${medals[i]} <b>${x[0]}</b> — ${x[1]}</li>`).join('') || '<li class="opacity-60">No data</li>';
}
function startCountdown(sel, iso){
  const el = $(sel); if(!el) return;
  if(!iso){ el.textContent = '—'; return; }
  const tick = ()=>{
    const end = new Date(iso).getTime();
    let s = Math.max(0, Math.floor((end - Date.now())/1000));
    const d = Math.floor(s/86400); s%=86400;
    const h = Math.floor(s/3600); s%=3600;
    const m = Math.floor(s/60); const sec = s%60;
    el.textContent = `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };
  tick(); setInterval(tick,1000);
}

/************ PROMPTS ************/
async function prompts(){
  const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
  $('#tbPrompts').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.text)}</td>
      <td>${esc(r.pairing||'')}</td>
      <td>${esc(r.additonal_tags||'')}</td>
      <td>${esc(r.rating||'')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>`;

  $$('#tbPrompts select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
}

/************ CLAIMS ************/
async function claims(){
  // Ambil claims + coba join sederhana ke prompt yang cocok (by pairing + text mirip tidak selalu ada; minimal tampilkan yang ada)
  const {data=[]} = await sb.from('claims').select('*').order('created_at',{ascending:false});
  // ambil prompt list untuk bantu render prompt label
  const {data:plist=[]} = await sb.from('prompts').select('id,text,pairing,additonal_tags');

  $('#tbClaims').innerHTML = data.map(r=>{
    // heuristik link prompt: cari prompt dengan pairing sama (first match)
    const p = plist.find(x=> (x.pairing||'') === (r.pairing||''));
    const tags = p?.additonal_tags || '';
    const isSelf = (r.author_name && p && (p.prompter_name && r.author_name.toLowerCase().includes(p.prompter_name.toLowerCase()))) ? true : false;
    const badge = isSelf ? `<span class="pill">self-prompt</span>` : '';
    return `<tr>
      <td>${esc(p?.text || '—')}</td>
      <td>${esc(r.pairing||'')}</td>
      <td>${esc(p?.text || '—')}</td>
      <td>${esc(tags)}</td>
      <td>${esc(r.author_name||'')}</td>
      <td>${badge}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['pending','claimed','submitted','dropped','posted'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${r.ao3_link? `<a target="_blank" class="underline" href="${esc(r.ao3_link)}">link</a>`:'—'}<br/>
          <input data-id="${r.id}" data-field="ao3_link" class="rounded border p-1 w-40 mt-1" placeholder="paste AO3…" value="${esc(r.ao3_link||'')}"/>
      </td>
      <td><textarea data-id="${r.id}" data-field="notes" rows="2" class="rounded border p-1 w-48">${esc(r.notes||'')}</textarea></td>
      <td>${new Date(r.created_at).toLocaleDateString()}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="10" class="p-2 opacity-60">No data</td></tr>`;

  // events
  $$('#tbClaims select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('claims').update({status: sel.value}).eq('id', sel.dataset.id);
      toast('Updated');
    };
  });
  $$('#tbClaims input[data-field], #tbClaims textarea[data-field]').forEach(inp=>{
    inp.onchange = async ()=>{
      const field = inp.dataset.field;
      const val = inp.value.trim()||null;
      await sb.from('claims').update({[field]:val}).eq('id', inp.dataset.id);
      toast('Saved');
    };
  });
}

/************ AUTHORS ************/
async function authors(){
  // Authors
  const {data:authors=[]} = await sb.from('authors').select('*').order('created_at',{ascending:false});
  // Prompts untuk tampilan prompt/pairing/desc (heuristik by pairing/name — minimal tampil yang matching pairing)
  const {data:plist=[]} = await sb.from('prompts').select('id,text,pairing');

  $('#tbAuthors').innerHTML = authors.map(r=>{
    const p = plist.find(x=> (x.pairing||'') && (r.name||'').toLowerCase()); // loose; real join tidak ada foreign key
    return `<tr>
      <td>${esc(r.name||'')}</td>
      <td>${esc(r.claimed_date||'')}</td>
      <td>${esc((p?.text)||'—')}</td>
      <td>${esc(p?.pairing||'—')}</td>
      <td>${esc((p?.text)||'—')}</td>
      <td>
        <select data-id="${r.id}" class="rounded-lg border p-1">
          ${['idea','outline','draft','beta','ready','posted'].map(s=>`<option ${r.progress===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input data-id="${r.id}" data-field="email" class="rounded border p-1 w-44" value="${esc(r.email||'')}" placeholder="email"/></td>
      <td><input data-id="${r.id}" data-field="twitter" class="rounded border p-1 w-40" value="${esc(r.twitter||'')}" placeholder="@..."/></td>
      <td>
        <div class="flex flex-col gap-1">
          ${['dmed','emailed','checked'].map(act=>`
            <label class="text-xs inline-flex items-center gap-1">
              <input type="checkbox" class="outreachChk" data-name="${esc(r.name||'')}" data-act="${act}"/> ${act}
            </label>
          `).join('')}
          <input type="date" class="outreachDate rounded border p-1" data-name="${esc(r.name||'')}"/>
          <select class="outreachMod rounded border p-1" data-name="${esc(r.name||'')}">
            <option>Nio</option><option>Sha</option><option>Naya</option><option>Cinta</option>
          </select>
          <button class="btn saveOutreach" data-name="${esc(r.name||'')}">Save</button>
        </div>
      </td>
      <td><textarea data-id="${r.id}" data-field="notes" rows="2" class="rounded border p-1 w-48">${esc(r.notes||'')}</textarea></td>
    </tr>`;
  }).join('') || `<tr><td colspan="10" class="p-2 opacity-60">No data</td></tr>`;

  // update fields
  $$('#tbAuthors select').forEach(sel=>{
    sel.onchange = async ()=>{
      await sb.from('authors').update({progress: sel.value}).eq('id', sel.dataset.id);
      toast('Progress updated');
    };
  });
  $$('#tbAuthors input[data-field], #tbAuthors textarea[data-field]').forEach(inp=>{
    inp.onchange = async ()=>{
      const field = inp.dataset.field;
      const val = inp.value.trim()||null;
      await sb.from('authors').update({[field]:val}).eq('id', inp.dataset.id);
      toast('Saved');
    };
  });

  // outreach save
  $$('.saveOutreach').forEach(btn=>{
    btn.onclick = async ()=>{
      const name = btn.dataset.name;
      const row = btn.closest('td');
      const date = row.querySelector('.outreachDate')?.value || new Date().toISOString().slice(0,10);
      const mod  = row.querySelector('.outreachMod')?.value || 'Nio';
      const checks = row.querySelectorAll('.outreachChk');

      const payloads = [];
      checks.forEach(ch=>{
        if(ch.checked){
          payloads.push({ author_name:name, action: ch.dataset.act, on_date: date, note:null });
        }
      });
      if(payloads.length){
        const {error} = await sb.from('outreach').insert(payloads);
        if(!error) toast('Outreach saved');
      } else {
        toast('No action selected');
      }
    };
  });
}

/************ ANNOUNCEMENTS ************/
async function saveAnnouncement(e){
  e.preventDefault();
  const row = {
    title: $('#annTitle').value.trim(),
    body: $('#annBody').value.trim(),
    publish_in: $('#annPublishIn').value.trim() || null,
    should_publish_at: $('#annAt').value ? new Date($('#annAt').value).toISOString() : null,
    is_published: $('#annPub').checked
  };
  if(!row.title) return;
  await sb.from('announcements').insert(row);
  $('#annForm').reset();
  toast('Announcement saved');
  announcements();
}
async function announcements(){
  const {data=[]} = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(100);
  $('#annList').innerHTML = data.map(r=>`
    <tr>
      <td>${esc(r.title||'')}</td>
      <td>${esc(r.publish_in||'-')}</td>
      <td>${r.should_publish_at ? DateTime.fromISO(r.should_publish_at).toFormat('dd LLL yyyy, HH:mm') : '-'}</td>
      <td>${r.is_published? 'Yes':'No'}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>`;
}

/************ TIMELINE ************/
async function timeline(){
  // countdown handled in overview; here render table + edit
  const {data=[]} = await sb.from('timeline').select('*').order('start_date',{ascending:true}).order('created_at',{ascending:true});
  $('#tbTimeline').innerHTML = data.map(r=>`
    <tr>
      <td><input class="tlInp rounded border p-1 w-44" data-id="${r.id}" data-field="phase" value="${esc(r.phase)}"/></td>
      <td><input class="tlInp rounded border p-1 w-44" data-id="${r.id}" data-field="date_range" value="${esc(r.date_range||'')}"/></td>
      <td><input class="tlInp rounded border p-1 w-64" data-id="${r.id}" data-field="tasks" value="${esc(r.tasks||'')}"/></td>
      <td><input type="date" class="tlInp rounded border p-1" data-id="${r.id}" data-field="start_date" value="${esc(r.start_date||'')}"/></td>
      <td>
        <label class="text-xs inline-flex items-center gap-1">
          <input type="checkbox" class="tlDone" data-id="${r.id}" ${r.done?'checked':''}/> done
        </label>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>`;

  $$('.tlInp').forEach(inp=>{
    inp.onchange = async ()=>{
      const field = inp.dataset.field;
      const val = inp.value || null;
      await sb.from('timeline').update({[field]:val}).eq('id', inp.dataset.id);
      toast('Saved');
      if(field==='start_date' || field==='phase') overview();
    };
  });
  $$('.tlDone').forEach(ch=>{
    ch.onchange = async ()=>{
      await sb.from('timeline').update({done: ch.checked}).eq('id', ch.dataset.id);
      toast('Updated');
    };
  });
}
async function addPhase(){
  const phase = prompt('Phase?'); if(!phase) return;
  const date_range = prompt('Date range?')||'';
  const tasks = prompt('Tasks?')||'';
  const start_date = prompt('Start date (YYYY-MM-DD)?')||null;
  await sb.from('timeline').insert({phase, date_range, tasks, start_date});
  timeline(); overview();
}

/************ DESIGN ************/
async function design(){
  const {data=[]} = await sb.from('design').select('*').order('created_at',{ascending:false});
  $('#tbDesign').innerHTML = data.map(r=>`
    <tr>
      <td><input class="desInp rounded border p-1 w-40" data-id="${r.id}" data-field="post" value="${esc(r.post||'')}"/></td>
      <td><input class="desInp rounded border p-1 w-56" data-id="${r.id}" data-field="agenda" value="${esc(r.agenda||'')}"/></td>
      <td><input type="date" class="desInp rounded border p-1" data-id="${r.id}" data-field="due_date" value="${esc(r.due_date||'')}"/></td>
      <td>
        <select class="desInp rounded border p-1" data-id="${r.id}" data-field="status">
          ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input class="desInp rounded border p-1 w-48" data-id="${r.id}" data-field="link" value="${esc(r.link||'')}"/></td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="p-2 opacity-60">No data</td></tr>`;

  $$('.desInp').forEach(inp=>{
    inp.onchange = async ()=>{
      const field = inp.dataset.field; const val = inp.value || null;
      await sb.from('design').update({[field]:val}).eq('id', inp.dataset.id);
      toast('Saved');
    };
  });
}
async function addDesign(){
  const post = prompt('Post?'); if(!post) return;
  const agenda = prompt('Agenda?')||'';
  const due_date = prompt('Due date YYYY-MM-DD?')||null;
  const status = 'pending';
  const link = '';
  await sb.from('design').insert({post, agenda, due_date, status, link});
  design();
}

/************ NOTES (save & recent) ************/
const MODS = ['Nio','Sha','Naya','Cinta'];
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="badge" style="background:${map[s]||'#eee'}">${s}</span>`;
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
  toast('Notes saved');
  loadRecent();
}
async function loadRecent(){
  const {data=[]} = await sb.from('mod_notes').select('*')
    .order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(20);
  $('#modRecent').innerHTML = data.map(x=>`
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(x.mod)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${x.on_date})</span>
      ${x.note ? ' · '+esc(x.note) : ''}
    </div>
  `).join('') || '<div class="opacity-60">No notes yet.</div>';
}

/************ EXPORT HELPERS ************/
function toCSV(arr){
  if(!arr?.length) return '';
  const keys = Object.keys(arr[0]);
  const lines = [keys.join(',')].concat(arr.map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(',')));
  return lines.join('\n');
}
async function exportPrompts(){
  const {data=[]} = await sb.from('prompts').select('*').order('created_at',{ascending:false});
  download('prompts.csv', toCSV(data));
}
async function exportClaims(){
  const {data=[]} = await sb.from('claims').select('*').order('created_at',{ascending:false});
  download('claims.csv', toCSV(data));
}
async function exportAuthors(){
  const {data=[]} = await sb.from('authors').select('*').order('created_at',{ascending:false});
  download('authors.csv', toCSV(data));
}
function download(name, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}

/************ UTIL ************/
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// initial recent
loadRecent();
