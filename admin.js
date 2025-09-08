// === REPLACE these functions in admin.js ===

// 1) handleImport tetap
async function handleImport(input, target){
  const file = input?.files?.[0];
  if(!file){ toast('Pilih file CSV/XLSX'); return; }
  const wb = await readWorkbook(file);
  let inserted = 0, failed = 0;

  if(!target || target==='prompts'){ const r = await upsertPrompts(wb); inserted+=r.ok; failed+=r.fail; }
  if(!target || target==='claims'){  const r = await upsertClaims(wb);  inserted+=r.ok; failed+=r.fail; }
  if(!target || target==='authors'){ const r = await upsertAuthors(wb); inserted+=r.ok; failed+=r.fail; }

  $('#lastSync').textContent = 'Last import: ' + new Date().toLocaleString();
  toast(`Import selesai: ${inserted} ok${failed?`, ${failed} gagal`:''}`);
  const active = $$('#nav .nav-btn').find(b=>b.classList.contains('active'))?.dataset.view || 'overview';
  showView(active);
}

// 2) reader tetap
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

// 3) helper
function findCols(headers, keys){
  const h = headers.map(x=>String(x).trim().toLowerCase());
  const idx = {};
  for(const k in keys){ idx[k] = h.findIndex(c => keys[k].some(kw=> c.includes(kw))); }
  return idx;
}
function val(v){ return (v==null)? null : String(v).trim(); }
function parseDate(v){
  if(!v) return null;
  const s = String(v).trim();
  const dt = luxon.DateTime.fromISO(s);
  if(dt.isValid) return dt.toISODate();
  const asNum = Number(s);
  if(!Number.isNaN(asNum) && asNum>20000){
    const base = luxon.DateTime.fromISO('1899-12-30').plus({days:asNum});
    return base.toISODate();
  }
  return null;
}
async function insertBatched(table, rows, batchSize=300){
  let ok=0, fail=0;
  for(let i=0;i<rows.length;i+=batchSize){
    const chunk = rows.slice(i,i+batchSize);
    const { error } = await sb.from(table).insert(chunk);
    if(error){ console.error(`[${table}] batch error`, error); fail += chunk.length; }
    else ok += chunk.length;
  }
  return {ok, fail};
}

// 4) UPSERTS — return {ok, fail}
async function upsertPrompts(sheets){
  let rows = [];
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
    const part = ws.rows.slice(1)
      .filter(r=> (r[idx.text]||'').toString().trim()!=='')
      .map(r=>({
        prompt_date: parseDate(r[idx.date]),
        prompter_name: val(r[idx.prompter_name]),
        prompter_ao3: val(r[idx.prompter_ao3]),
        pairing: val(r[idx.pairing]),
        additonal_tags: val(r[idx.tags]),      // per schema kamu
        rating: val(r[idx.rating]),
        text: val(r[idx.text]),
        prompt_bank_upload: val(r[idx.bank]),
        status: (val(r[idx.status])||'available').toLowerCase()
      }));
    rows = rows.concat(part);
  }
  if(!rows.length) return {ok:0, fail:0};
  return await insertBatched('prompts', rows);
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

async function upsertClaims(sheets){
  let rows = [];
  for(const ws of sheets){
    if(!ws.rows.length) continue;
    const idx = findCols(ws.rows[0], {
      pairing:['pairing'],
      status:['status','status_works','status_words'],
      ao3:['ao3','ao3 link','ao3_link'],
      notes:['notes','catatan'],
      author:['author','authors','claimed_by','name']
    });
    // kalau tidak ada kolom apapun, skip
    if(idx.pairing<0 && idx.status<0 && idx.author<0) continue;

    const part = ws.rows.slice(1)
      .filter(r => (val(r[idx.author])||val(r[idx.pairing])||'')!=='')
      .map(r=>({
        pairing: val(r[idx.pairing]),
        status: normClaimStatus(val(r[idx.status])||'pending'),
        ao3_link: val(r[idx.ao3]),
        notes: val(r[idx.notes]),
        author_name: val(r[idx.author]) || null
      }));
    rows = rows.concat(part);
  }
  if(!rows.length) return {ok:0, fail:0};
  return await insertBatched('claims', rows);
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

async function upsertAuthors(sheets){
  let rows = [];
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

    const part = ws.rows.slice(1)
      .filter(r => (val(r[idx.name])||val(r[idx.email])||val(r[idx.twitter])||'')!=='')
      .map(r=>({
        name: val(r[idx.name]),
        claimed_date: parseDate(r[idx.claimed_date]),
        progress: normalizeProgress(val(r[idx.progress])),
        email: val(r[idx.email]),
        twitter: val(r[idx.twitter])
      }));
    rows = rows.concat(part);
  }
  if(!rows.length) return {ok:0, fail:0};
  return await insertBatched('authors', rows);
}
