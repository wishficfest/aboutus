// Wish Fic Fest – Live status + countdown for timeline.html
(function start(run){
  if (document.readyState !== 'loading') run();
  else {
    document.addEventListener('DOMContentLoaded', run, { once:true });
    window.addEventListener('load', run, { once:true });
  }
})(function(){
  // helpers
  function D(y,m,d){ return new Date(y, m-1, d); }
  function endOfDay(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }
  function inRange(t,r){ return t>=r.start && t<=endOfDay(r.end); }
  function pad(n){ return n<10?('0'+n):''+n; }

  // dates (local)
  const dates={
    prompting:{start:D(2025,8,15), end:D(2025,8,25)},
    claimOpen:D(2025,8,17),
    signups:{ start:D(2025,8,17), end:D(2025,9,13)},
    checkin:{ start:D(2025,9,1),  end:D(2025,9,1)},
    submission:{ start:D(2025,9,15), end:D(2025,10,12)}
  };

  function phase(t){
    if(inRange(t,dates.submission)) return {k:'submission',title:'Submission Period',detail:'Posting to AO3 is open.'};
    if(inRange(t,dates.checkin))   return {k:'checkin',title:'Check-In',detail:'Send a quick status to mods.'};
    if(inRange(t,dates.signups))   return {k:'signups',title:'Author Sign-ups & Claiming',detail:'Self-prompt or claim a prompt.'};
    if(t>=dates.claimOpen && t<dates.signups.start) return {k:'claim',title:'Claiming Begins',detail:'Claims are open.'};
    if(inRange(t,dates.prompting)) return {k:'prompting',title:'Prompting',detail:'Submit your ideas.'};
    if(t<dates.prompting.start)    return {k:'prefest',title:'Pre-fest',detail:'Prompting opens Aug 15.'};
    return {k:'closed',title:'Closed',detail:'Round finished — thank you!'};
  }

  // fill “Where we are now”
  const now=phase(new Date());
  const nowBox=document.getElementById('nowBox');
  const nowPhase=document.getElementById('nowPhase');
  const nowDetail=document.getElementById('nowDetail');
  if(nowPhase) nowPhase.textContent=now.title;
  if(nowDetail) nowDetail.textContent=now.detail;
  if(nowBox) nowBox.classList.add(now.k==='submission'?'ok':now.k==='prefest'?'warn':'');

  // countdown → Oct 12, 23:59 (local)
  const deadline=new Date(2025,9,12,23,59,59,999);
  const elCount=document.getElementById('hCount');
  const elDetail=document.getElementById('countDetail');
  const elBox=document.getElementById('countBox');

  function tick(){
    if(!elCount) return;
    const diff=deadline-new Date();
    if(diff>0){
      const day=86400000, hr=3600000, min=60000, sec=1000;
      const d=Math.floor(diff/day);
      const h=Math.floor((diff%day)/hr);
      const m=Math.floor((diff%hr)/min);
      const s=Math.floor((diff%min)/sec);
      elCount.textContent=`${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
      if(elDetail) elDetail.textContent='until Oct 12, 23:59';
      if(elBox){
        elBox.classList.remove('due','warn','ok');
        if(d<=3) elBox.classList.add('due');
        else if(d<=10) elBox.classList.add('warn');
        else elBox.classList.add('ok');
      }
    } else {
      elCount.textContent='Closed';
      if(elDetail) elDetail.textContent='Submission window ended (Oct 12).';
      if(elBox) elBox.classList.add('due');
    }
  }
  tick(); setInterval(tick,1000);
});
