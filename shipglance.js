/* ===== Members & Colors ===== */
const COLORS = {
  Sion:  "#7c3aed", // purple
  Riku:  "#e74d3c", // red
  Yushi: "#3b82f6", // blue
  Jaehee:"#22c55e"  // green
};
const order = []; // will store the two picked names

/* ===== DOM ===== */
const sheet = document.getElementById('sheet');
const pills = [...document.querySelectorAll('.pill')];
const nameL = document.getElementById('nameL');
const nameR = document.getElementById('nameR');
const swapBtn = document.getElementById('swapBtn');
const whoList = document.getElementById('whoList');

/* ===== Who list (click to choose Left/Both/Right) ===== */
const WHO_ITEMS = [
  "First to confess","Does housework","Drives the car","Cooks dinner",
  "Good handwriting","Yaps the most","Spoils the other","Wakes up first",
  "Proposes first","The clinger"
];
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
  relabelSides();
}
document.addEventListener('click', (e)=>{
  if(!e.target.classList.contains('btn')) return;
  const q = e.target.dataset.q;
  document.querySelectorAll(`.btn[data-q="${q}"]`).forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
});

/* ===== Pick 2 members ===== */
pills.forEach(p=>{
  p.addEventListener('click', ()=>{
    const id = p.dataset.id;
    if (p.classList.contains('active')) {
      p.classList.remove('active');
      const idx = order.indexOf(id);
      if (idx>-1) order.splice(idx,1);
    } else {
      if (order.length === 2) {
        // replace the last picked
        const last = order.pop();
        document.querySelector(`.pill[data-id="${last}"]`).classList.remove('active');
      }
      p.classList.add('active');
      order.push(id);
    }
    applyColorsAndNames();
  });
});

swapBtn.addEventListener('click', ()=>{
  if(order.length===2){
    order.reverse();
    applyColorsAndNames();
  }
});

function applyColorsAndNames(){
  const left = order[0] || "Riku";
  const right = order[1] || "Yushi";
  setAccent("--left", COLORS[left]);
  setAccent("--right", COLORS[right]);
  nameL.value = left;
  nameR.value = right;
  relabelSides();
}
function setAccent(varName, value){
  sheet.style.setProperty(varName, value);
}
function relabelSides(){
  // Label the buttons with names
  document.querySelectorAll('.btn.left').forEach(b=> b.textContent = nameL.value || 'Left');
  document.querySelectorAll('.btn.right').forEach(b=> b.textContent = nameR.value || 'Right');
}

/* ===== Export PNG ===== */
document.getElementById('exportBtn').addEventListener('click', async ()=>{
  // temporarily add a white background for clean PNG
  const prev = sheet.style.backgroundColor;
  sheet.style.backgroundColor = '#ffffff';
  const canvas = await html2canvas(sheet, {scale: 2, backgroundColor: null, useCORS: true});
  sheet.style.backgroundColor = prev;
  const png = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  const left = nameL.value || 'Left';
  const right = nameR.value || 'Right';
  a.download = `wish-ship-${left}x${right}.png`;
  a.href = png;
  a.click();
});

/* ===== Share link (URL encodes just names + picks) ===== */
document.getElementById('shareBtn').addEventListener('click', ()=>{
  const state = {
    pair: [nameL.value, nameR.value],
    picks: WHO_ITEMS.map((_,i)=>{
      const act = document.querySelector(`.btn.active[data-q="${i}"]`);
      return act ? act.dataset.choose : null;
    })
  };
  const url = `${location.origin}${location.pathname}?s=${encodeURIComponent(JSON.stringify(state))}`;
  if(navigator.share){ navigator.share({title:'My Ship at a Glance', url}).catch(()=>{}); }
  else { navigator.clipboard.writeText(url); alert('Link copied!'); }
});

/* ===== Load from URL if present ===== */
(function loadFromURL(){
  const s = new URLSearchParams(location.search).get('s');
  if(!s) { buildWho(); applyColorsAndNames(); return; }
  try{
    const state = JSON.parse(decodeURIComponent(s));
    nameL.value = state.pair?.[0] || nameL.value;
    nameR.value = state.pair?.[1] || nameR.value;
    // activate pills if names match
    pills.forEach(p=>{
      if([nameL.value,nameR.value].includes(p.dataset.id)){
        p.classList.add('active');
        if(!order.includes(p.dataset.id)) order.push(p.dataset.id);
      } else {
        p.classList.remove('active');
      }
    });
    buildWho();
    (state.picks||[]).forEach((ch,i)=>{
      if(!ch) return;
      const btn = document.querySelector(`.btn[data-q="${i}"][data-choose="${ch}"]`);
      if(btn) btn.classList.add('active');
    });
    applyColorsAndNames();
  }catch{
    buildWho(); applyColorsAndNames();
  }
})();
