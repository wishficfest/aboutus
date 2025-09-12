/* ===== Members & Colors ===== */
const COLORS = {
  Sion:  "#7c3aed", // purple
  Riku:  "#e74d3c", // red
  Yushi: "#3b82f6", // blue
  Jaehee:"#22c55e"  // green
};
const order = []; // chosen two names

/* ===== WHO items & keys (stable keys for DB) ===== */
const WHO_ITEMS = [
  "First to confess","Does housework","Drives the car","Cooks dinner",
  "Good handwriting","Yaps the most","Spoils the other","Wakes up first",
  "Proposes first","The clinger"
];
const WHO_KEYS = [
  "first_to_confess","does_housework","drives","cooks_dinner",
  "good_handwriting","yaps_most","spoils_other","wakes_up_first",
  "proposes_first","the_clinger"
];

/* ===== DOM ===== */
const sheet = document.getElementById('sheet');
const pills = [...document.querySelectorAll('.pill')];
const nameL = document.getElementById('nameL');
const nameR = document.getElementById('nameR');
const swapBtn = document.getElementById('swapBtn');
const whoList = document.getElementById('whoList');

/* ===== WHO builder ===== */
function buildWho(){
  whoList.innerHTML = "";
  WHO_ITEMS.forEach((q,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${q}</span>
      <button class="btn left"  data-q="${i}" data-choose="L"></button>
      <span class="sep">/</span>
      <button class="btn both"  data-q="${i}" data-choose="B">Both</button>
      <span class="sep">/</span>
      <button class="btn right" data-q="${i}" data-choose="R"></button>
    `;
    whoList.appendChild(li);
  });
  relabelSideButtons();
}
document.addEventListener('click', (e)=>{
  if(!e.target.classList.contains('btn')) return;
  const q = e.target.dataset.q;
  document.querySelectorAll(`.btn[data-q="${q}"]`).forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
});

/* ===== Member picking ===== */
pills.forEach(p=>{
  p.addEventListener('click', ()=>{
    const id = p.dataset.id;
    if(p.classList.contains('active')){
      p.classList.remove('active');
      const idx = order.indexOf(id); if(idx>-1) order.splice(idx,1);
    }else{
      if(order.length===2){
        const last = order.pop();
        document.querySelector(`.pill[data-id="${last}"]`).classList.remove('active');
      }
      p.classList.add('active'); order.push(id);
    }
    applyColorsAndNames();
  });
});
swapBtn.addEventListener('click', ()=>{
  if(order.length===2){ order.reverse(); applyColorsAndNames(); }
});
function setAccent(varName, value){ sheet.style.setProperty(varName, value); }
function applyColorsAndNames(){
  const left = order[0] || "Riku";
  const right = order[1] || "Yushi";
  setAccent("--left", COLORS[left]);
  setAccent("--right", COLORS[right]);
  nameL.value = left;
  nameR.value = right;
  relabelSideButtons();
  // refresh duo fill gradient extents
  document.querySelectorAll('.duo-track').forEach(updateDuoFill);
}
function relabelSideButtons(){
  document.querySelectorAll('.btn.left').forEach(b=> b.textContent = nameL.value || 'Left');
  document.querySelectorAll('.btn.right').forEach(b=> b.textContent = nameR.value || 'Right');
}

/* ===== DUO meter logic ===== */
function updateDuoFill(track){
  const L = track.querySelector('.duo-left');
  const R = track.querySelector('.duo-right');
  const fill = track.querySelector('.duo-fill');
  const l = Number(L.value), r = Number(R.value);
  const start = Math.min(l,r), end = Math.max(l,r);
  fill.style.left  = start + '%';
  fill.style.width = (end - start) + '%';
}
document.querySelectorAll('.duo-track').forEach(t=>{
  const handler = ()=>updateDuoFill(t);
  t.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', handler);
    inp.addEventListener('change', handler);
  });
  updateDuoFill(t);
});

/* ===== Export PNG ===== */
document.getElementById('exportBtn').addEventListener('click', async ()=>{
  const prev = sheet.style.backgroundColor;
  sheet.style.backgroundColor = '#ffffff';
  const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: null, useCORS: true });
  sheet.style.backgroundColor = prev;
  const png = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  const left = nameL.value || 'Left';
  const right = nameR.value || 'Right';
  a.download = `wish-ship-${left}x${right}.png`;
  a.href = png;
  a.click();

  const text = `My Ship at a Glance: ${left} × ${right} #wishficfest`;
  try{ await navigator.clipboard.writeText(text); }catch{}
});

/* ===== Share link (encode small subset) ===== */
document.getElementById('shareBtn').addEventListener('click', ()=>{
  const state = {
    pair: [nameL.value, nameR.value],
    picks: WHO_KEYS.map((_,i)=>{
      const act = document.querySelector(`.btn.active[data-q="${i}"]`);
      return act ? act.dataset.choose : null;
    })
  };
  const url = `${location.origin}${location.pathname}?s=${encodeURIComponent(JSON.stringify(state))}`;
  if(navigator.share){ navigator.share({title:'My Ship at a Glance', url}).catch(()=>{}); }
  else { navigator.clipboard.writeText(url); alert('Link copied!'); }
});

/* ===== Load from URL ===== */
(function init(){
  buildWho(); applyColorsAndNames();
  const s = new URLSearchParams(location.search).get('s');
  if(!s) return;
  try{
    const state = JSON.parse(decodeURIComponent(s));
    nameL.value = state.pair?.[0] || nameL.value;
    nameR.value = state.pair?.[1] || nameR.value;
    pills.forEach(p=>{
      if([nameL.value,nameR.value].includes(p.dataset.id)){
        p.classList.add('active');
        if(!order.includes(p.dataset.id)) order.push(p.dataset.id);
      }else{ p.classList.remove('active'); }
    });
    WHO_KEYS.forEach((k,i)=>{
      const ch = state.picks?.[i];
      if(!ch) return;
      const btn = document.querySelector(`.btn[data-q="${i}"][data-choose="${ch}"]`);
      if(btn) btn.classList.add('active');
    });
    applyColorsAndNames();
  }catch{}
})();

/* ===== Build full state (for DB) ===== */
function byId(id){ return document.getElementById(id); }
function collectLove(side){
  const ids=['ll_as_','ll_qt_','ll_wa_','ll_pt_','ll_rg_'];
  const keys=['acts_service','quality_time','words_affirm','physical_touch','receiving_gifts'];
  const out={}; ids.forEach((p,i)=> out[keys[i]] = Number(byId(p+side).value)); return out;
}
function collectAxes(){
  const o={}; for(let i=1;i<=10;i++) o['ax'+i]=Number(byId('ax'+i).value);
  o.pm1x=Number(byId('pm1-x').value); o.pm1y=Number(byId('pm1-y').value);
  o.pm2x=Number(byId('pm2-x').value); o.pm2y=Number(byId('pm2-y').value);
  o.pm3x=Number(byId('pm3-x').value); o.pm3y=Number(byId('pm3-y').value);
  return o;
}
function collectWho(){
  const o={}; WHO_KEYS.forEach((k,i)=>{
    const act = document.querySelector(`.btn.active[data-q="${i}"]`); o[k]=act?act.dataset.choose:null;
  }); return o;
}
function buildFullState(){
  const colors = {
    left:  getComputedStyle(sheet).getPropertyValue('--left').trim(),
    right: getComputedStyle(sheet).getPropertyValue('--right').trim()
  };
  return {
    pair: [nameL.value||'Riku', nameR.value||'Yushi'],
    colors,
    ages: {L: byId('ageL').value || null, R: byId('ageR').value || null},
    heights: {L: byId('hgtL').value || null, R: byId('hgtR').value || null},
    couple: (document.querySelector('input[name="couple"]:checked')?.value)||'duh',
    canon_duo: {
      left: Number(document.querySelector('#duo-canon .duo-left').value),
      right:Number(document.querySelector('#duo-canon .duo-right').value)
    },
    love_left:  collectLove('L'),
    love_right: collectLove('R'),
    axes: collectAxes(),
    who: collectWho()
  };
}

/* ===== SAVE to Supabase (new row per save) ===== */
async function saveSubmission(){
  if(!window.supabase){ alert('Supabase client missing'); return; }
  const s = buildFullState();

  // 1) main submission
  const { data, error } = await supabase
    .from('ship_glance_submissions')
    .insert([{
      author_name: null,
      twitter_handle: null,
      pair_left:  s.pair[0],
      pair_right: s.pair[1],
      left_color: s.colors.left,
      right_color:s.colors.right,
      payload:    s
    }])
    .select('id')
    .single();
  if(error){ console.error(error); alert('Save failed'); return; }

  // 2) who choices (flat rows)
  const rows = [];
  WHO_KEYS.forEach((k,i)=>{
    const ch = s.who[k]; if(ch) rows.push({ submission_id: data.id, q_key: k, choice: ch });
  });
  if(rows.length){
    const { error:e2 } = await supabase.from('ship_glance_who_choices').insert(rows);
    if(e2) console.error(e2);
  }
  alert('Saved! Thank you 💙');
}
document.getElementById('saveBtn').addEventListener('click', saveSubmission);
