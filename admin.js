// ================= CONFIG =================
const SUPABASE_URL = "https://daaazpzydtkustcblyee.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhYWF6cHp5ZHRrdXN0Y2JseWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NDI5MDQsImV4cCI6MjA3MjIxODkwNH0.WOuTidQd_IM5qu1yYUhuZSzhXTkKBk6cyBrXJY2TcHY"; // <-- ganti dengan full anon key kamu (tanpa "...")
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DateTime = luxon.DateTime;
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const toast = (msg)=>{ const t=$('#toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),1600); };

// Debug function to check library loading
function debugLibraries() {
  console.log('=== Library Debug Info ===');
  console.log('XLSX available:', typeof XLSX !== 'undefined');
  console.log('Supabase available:', typeof window.supabase !== 'undefined');
  console.log('Luxon available:', typeof luxon !== 'undefined');
  console.log('All scripts loaded:', document.scripts.length);
  
  if (typeof XLSX !== 'undefined') {
    console.log('XLSX version:', XLSX.version || 'unknown');
  }
}

// Debug function to check database schema
async function debugDatabaseSchema() {
  console.log('=== Database Schema Debug ===');
  try {
    const tables = ['prompts', 'authors', 'mod_notes'];
    for (const table of tables) {
      try {
        const { data, error } = await sb.from(table).select('*').limit(1);
        if (error) {
          console.log(`${table} table error:`, error.message);
        } else if (data && data.length > 0) {
          console.log(`${table} table columns:`, Object.keys(data[0]));
          console.log(`${table} sample data:`, data[0]);
        } else {
          console.log(`${table} table: empty`);
          // For empty tables, try to get schema info from Supabase
          try {
            const { data: schemaInfo } = await sb.rpc('get_table_columns', { table_name: table });
            if (schemaInfo) {
              console.log(`${table} table schema from RPC:`, schemaInfo);
            }
          } catch (rpcError) {
            console.log(`${table} RPC schema check failed:`, rpcError.message);
          }
        }
      } catch (err) {
        console.log(`${table} table:`, err.message);
      }
    }
  } catch (err) {
    console.log('Database connection error:', err.message);
  }
}

// Debug toast untuk error JS umum
window.addEventListener('error', (e)=>{
  console.error(e.error || e.message);
  toast('JS error: ' + (e.error?.message || e.message));
});

// ================= BOOT =================
function waitForXLSX(retries = 10) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX !== 'undefined') {
      resolve();
      return;
    }
    
    if (retries <= 0) {
      reject(new Error('XLSX library failed to load'));
      return;
    }
    
    setTimeout(() => {
      waitForXLSX(retries - 1).then(resolve).catch(reject);
    }, 100);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Debug library loading
  debugLibraries();
  
  try {
    await waitForXLSX();
    console.log('XLSX library loaded successfully');
  } catch (error) {
    console.error('XLSX library not loaded!', error);
    toast('XLSX library not loaded. Please refresh the page.');
    return;
  }
  
  // Debug database schema
  await debugDatabaseSchema();
  
  // Test mod_notes table specifically
  await testModNotesTable();
  
  // Test Supabase connection
  await testSupabaseConnection();
  
  wireNav();
  setActive('overview');
  VIEWS.overview();
  initNotes();
});

// ================= NAV =================
function wireNav(){
  const nav = $('#nav'); if(!nav) return;
  nav.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-view]'); if(!el) return;
    const v = el.dataset.view;
    setActive(v);
    (VIEWS[v] || VIEWS.overview)();
  });
  nav.addEventListener('keydown', (e)=>{
    if((e.key==='Enter'||e.key===' ') && e.target.matches('[data-view]')){
      e.preventDefault(); e.target.click();
    }
  });
}
function setActive(v){
  $$('#nav .nav-btn').forEach(x=>x.classList.remove('active'));
  const el = $(`#nav [data-view="${v}"]`); el?.classList.add('active');
}

// ================= HELPERS =================
function esc(s){ return (s??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toDate(v){ 
  try{ 
    if(!v || v.toString().trim() === '') return null;
    
    // Handle different date formats from Excel
    let dateStr = v.toString().trim();
    
    // If it's already in YYYY-MM-DD format, return as is
    if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    
    // Check for malformed dates with extreme years
    if(dateStr.includes('020865') || dateStr.includes('020876')) {
      console.warn('Malformed date detected:', dateStr, '- returning null');
      return null;
    }
    
    // Try to parse the date
    const d = new Date(dateStr);
    if(isNaN(d)) return null;
    
    // Check if the year seems reasonable (not in the far future or past)
    const year = d.getFullYear();
    if(year > 2030 || year < 1900) {
      console.warn('Unreasonable year detected:', year, 'for date:', dateStr, '- returning null');
      return null;
    }
    
    return d.toISOString().slice(0,10);
  }catch{
    console.warn('Date parsing error for:', v, '- returning null');
    return null;
  }
}
function normProgress(s){
  s = String(s||'').toLowerCase();
  if(s.includes('posted')||s.includes('done')) return 'posted';
  if(s.includes('ready')||s.includes('80'))    return 'ready';
  if(s.includes('beta') ||s.includes('60'))    return 'beta';
  if(s.includes('draft')||s.includes('40'))    return 'draft';
  if(s.includes('outline')||s.includes('20'))  return 'outline';
  return 'idea';
}
function medal(i){ return ['🥇','🥈','🥉','4️⃣','5️⃣'][i]||''; }

// ================= VIEWS =================
const VIEWS = {
  async overview(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">📊 Overview</h2>
          <div class="flex items-center gap-2">
            <input id="fileAny" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="btnImportAny" class="btn btn-dark">Upload</button>
            <span id="upStatus" class="text-xs opacity-70"></span>
            <button id="btnExportJSON" class="btn btn-ghost">Export JSON</button>
            <button id="btnExportCSV" class="btn btn-ghost">Export CSV</button>
          </div>
        </div>

        <div class="grid md:grid-cols-4 gap-3 mt-3">
          <div class="kpi"><div class="text-sm">Total Prompts</div><div id="k1" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Available Prompts</div><div id="k2" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Claimed</div><div id="k3" class="text-2xl font-bold">—</div></div>
          <div class="kpi"><div class="text-sm">Authors</div><div id="k4" class="text-2xl font-bold">—</div></div>
        </div>

        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div class="p-3 rounded-xl card">
            <h3 class="font-semibold mb-2">🍰 Pairing — Prompter (Top 5)</h3>
            <canvas id="piePrompt" width="280" height="280"></canvas>
            <div id="rankPrompt" class="mt-2 text-sm"></div>
          </div>
          <div class="p-3 rounded-xl card">
            <h3 class="font-semibold mb-2">🍰 Pairing — Claimed (Top 5)</h3>
            <canvas id="pieClaim" width="280" height="280"></canvas>
            <div id="rankClaim" class="mt-2 text-sm"></div>
          </div>
        </div>
      </section>
    `;

    $('#btnImportAny').onclick = async ()=>{
      const btn = $('#btnImportAny'), s=$('#upStatus'), f=$('#fileAny')?.files?.[0];
      if(!f){ toast('Pilih file .xlsx/.csv'); return; }
      
      // Validate file size (max 10MB)
      if(f.size > 10 * 1024 * 1024) {
        toast('File terlalu besar (max 10MB)');
        return;
      }
      
      btn.disabled = true; s.textContent='Uploading…';
      try{
        console.log('Starting upload for file:', f.name, 'Size:', f.size, 'bytes');
        await importWorkbookToSupabase(f);
        s.textContent='Done ✓'; toast('Upload sukses');
        await loadKPIs(); await drawPies();
      }catch(err){
        console.error('Upload error:', err); 
        s.textContent='Failed ✗'; 
        toast('Upload gagal: '+(err.message||'Unknown error'));
      }finally{ 
        btn.disabled=false; 
        // Clear the file input
        $('#fileAny').value = '';
      }
    };

    // Export button handlers
    $('#btnExportJSON').onclick = () => exportData('json');
    $('#btnExportCSV').onclick = () => exportData('excel');

    await loadKPIs();
    await drawPies();
  },

  async prompts(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">💡 Prompts</h2>
          <div class="flex items-center gap-2">
            <input id="filePrompts" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impPrompts" class="btn btn-dark">Upload</button>
            <span id="upPrompts" class="text-xs opacity-70"></span>
          </div>
        </div>
        
        <!-- Filters -->
        <div class="grid md:grid-cols-4 gap-2 mt-3 p-3 rounded-xl" style="background:var(--peach)">
          <select id="filterPromptsPairing" class="rounded-xl border p-2">
            <option value="">All Pairings</option>
          </select>
          <select id="filterPromptsStatus" class="rounded-xl border p-2">
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="claimed">Claimed</option>
            <option value="dropped">Dropped</option>
            <option value="fulfilled">Fulfilled</option>
          </select>
          <select id="filterPromptsPrompter" class="rounded-xl border p-2">
            <option value="">All Prompters</option>
          </select>
          <button id="clearPromptsFilters" class="btn btn-ghost">Clear Filters</button>
        </div>
        
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr>
              <th>Date</th><th>Prompter</th><th>AO3/Twitter</th><th>Pairing</th><th>Tags</th><th>Rating</th><th>Prompt</th><th>Description</th><th>Bank</th><th>Status</th>
            </tr></thead>
            <tbody id="tbPrompts"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#impPrompts').onclick = () => handleUpload('#filePrompts','#upPrompts','prompts');

    // Load and display prompts data
    let promptsData = [];
    const loadPromptsData = async () => {
    console.log('Loading prompts data...');
    const { data=[], error } = await sb.from('prompts').select('*').order('created_at',{ascending:false});
    console.log('Prompts query result:', { data, error });
    if(error){ 
      console.error('Prompts load error:', error);
      $('#tbPrompts').innerHTML='<tr><td colspan="10">Gagal load: ' + error.message + '</td></tr>'; 
      return; 
    }
      promptsData = data;
      console.log('Loaded prompts data:', promptsData.length, 'records');
      
      // Populate filter dropdowns
      const uniquePairings = [...new Set(data.map(r => r.pairing).filter(Boolean))].sort();
      const uniquePrompters = [...new Set(data.map(r => r.prompter_name).filter(Boolean))].sort();
      
      $('#filterPromptsPairing').innerHTML = '<option value="">All Pairings</option>' + 
        uniquePairings.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      $('#filterPromptsPrompter').innerHTML = '<option value="">All Prompters</option>' + 
        uniquePrompters.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      
      filterPromptsData();
    };

    // Filter prompts data
    const filterPromptsData = () => {
      const pairingFilter = $('#filterPromptsPairing').value;
      const statusFilter = $('#filterPromptsStatus').value;
      const prompterFilter = $('#filterPromptsPrompter').value;
      
      const filtered = promptsData.filter(r => 
        (!pairingFilter || (r.pairing||'') === pairingFilter) &&
        (!statusFilter || (r.status||'') === statusFilter) &&
        (!prompterFilter || (r.prompter_name||'') === prompterFilter)
      );
      
      $('#tbPrompts').innerHTML = filtered.map(r=>`
      <tr>
        <td>${esc(r.prompt_date||'')}</td>
        <td>${esc(r.prompter_name||'')}</td>
        <td>${esc(r.prompter_ao3||'')}</td>
        <td>${esc(r.pairing||'')}</td>
        <td>${esc(r.additonal_tags||'')}</td>
        <td>${esc(r.rating||'')}</td>
        <td>${esc(r.text||'')}</td>
        <td>${esc(r.description||'')}</td>
        <td>${esc(r.prompt_bank_upload||'')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['available','claimed','dropped','fulfilled'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="10" class="p-2 opacity-60">No data</td></tr>';

    $$('#tbPrompts select').forEach(sel=>{
      sel.onchange = async ()=>{
        await sb.from('prompts').update({status: sel.value}).eq('id', sel.dataset.id);
        toast('Status updated');
      };
    });
    };

    // Add filter event listeners
    $('#filterPromptsPairing').oninput = filterPromptsData;
    $('#filterPromptsStatus').oninput = filterPromptsData;
    $('#filterPromptsPrompter').oninput = filterPromptsData;
    $('#clearPromptsFilters').onclick = () => {
      $('#filterPromptsPairing').value = '';
      $('#filterPromptsStatus').value = '';
      $('#filterPromptsPrompter').value = '';
      filterPromptsData();
    };

    // Load initial data
    await loadPromptsData();
  },


  async authors(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">👩‍💻 Authors</h2>
          <div class="flex items-center gap-2">
            <input id="fileAuthors" type="file" accept=".csv,.xlsx" class="rounded-xl border p-2 bg-white"/>
            <button id="impAuthors" class="btn btn-dark">Upload</button>
            <button id="createSampleAuthors" class="btn btn-ghost">Sample Data</button>
            <button id="importCheckinData" class="btn btn-ghost">Import Check-in Data</button>
            <button id="exportAuthors" class="btn btn-ghost">Export CSV</button>
            <span id="upAuthors" class="text-xs opacity-70"></span>
          </div>
        </div>
        
        <!-- Manual Entry Form -->
        <div class="mt-4 p-4 rounded-xl" style="background:var(--peach)">
          <h3 class="font-semibold mb-3">➕ Add New Author</h3>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <input id="newAuthor" class="rounded-xl border p-2" placeholder="Author Name" required/>
          <input id="newAuthorTwitter" class="rounded-xl border p-2" placeholder="Author Twitter (e.g., @username)"/>
          <input id="newAuthorEmail" class="rounded-xl border p-2" placeholder="Author Email"/>
            <select id="newMods" class="rounded-xl border p-2">
              <option value="">Select Mod</option>
              <option value="Nio">Nio</option>
              <option value="Sha">Sha</option>
              <option value="Naya">Naya</option>
              <option value="Cinta">Cinta</option>
            </select>
            <select id="newStatus" class="rounded-xl border p-2">
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="replied">Replied</option>
              <option value="havent replied">Haven't Replied</option>
              <option value="blocked">Blocked</option>
            </select>
            <input id="newCheckinDate" type="date" class="rounded-xl border p-2" value="${new Date().toISOString().slice(0,10)}"/>
            <input id="newCheckinTime" type="time" class="rounded-xl border p-2" value="09:00"/>
          </div>
          <div class="mt-3">
            <textarea id="newNotes" class="w-full rounded-xl border p-2" placeholder="Notes" rows="2"></textarea>
          </div>
          <div class="mt-3 flex gap-2">
            <button id="addAuthorBtn" class="btn btn-dark">Add Author</button>
            <button id="clearFormBtn" class="btn btn-ghost">Clear Form</button>
          </div>
        </div>
        <!-- Filters -->
        <div class="mt-3 p-3 rounded-xl" style="background:var(--peach)">
          <h4 class="font-semibold mb-2">🔍 Filters</h4>
          <div class="grid md:grid-cols-3 lg:grid-cols-5 gap-2">
            <select id="filterMods" class="rounded-lg border p-2">
              <option value="">All Mods</option>
              <option value="Nio">Nio</option>
              <option value="Sha">Sha</option>
              <option value="Naya">Naya</option>
              <option value="Cinta">Cinta</option>
            </select>
            <select id="filterStatus" class="rounded-lg border p-2">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="replied">Replied</option>
              <option value="havent replied">Haven't Replied</option>
              <option value="blocked">Blocked</option>
            </select>
            <select id="filterFicProgress" class="rounded-lg border p-2">
              <option value="">All Progress</option>
              <option value="0%">Belum mulai (0%)</option>
              <option value="20%">Masih outline / planning (20%)</option>
              <option value="40%">Lagi nulis draft (40%)</option>
              <option value="60%">Hampir kelar draft (60%)</option>
              <option value="80%">Selesai draft, lagi finishing (80%)</option>
              <option value="100%">Sudah lengkap / selesai (100%)</option>
            </select>
            <select id="filterAuthorStatus" class="rounded-lg border p-2">
              <option value="">All Author Status</option>
              <option value="on track">Iya, on track 🚀</option>
              <option value="butuh waktu">Mungkin, butuh waktu tambahan ⏳</option>
              <option value="drop">Kayaknya nggak sempet, kemungkinan drop 🙇</option>
            </select>
            <select id="filterPromptsStatus" class="rounded-lg border p-2">
              <option value="">All Prompts Status</option>
              <option value="own prompt">Using my own prompt</option>
              <option value="changes">Changes, using others</option>
            </select>
          </div>
          <div class="mt-2 flex gap-2">
            <button id="clearFilters" class="btn btn-ghost btn-sm">Clear Filters</button>
            <span id="filterCount" class="text-sm opacity-70"></span>
          </div>
        </div>
        
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr>
          <th>Author</th><th>Author Twitter</th><th>Author Email</th><th>Mods</th><th>Status</th><th>Date Checkin</th><th>Notes</th><th>% Fic</th><th>Word Counts</th><th>Prompts Status</th><th>Request for Mods</th><th>Actions</th>
            </tr></thead>
            <tbody id="tbAuthors"></tbody>
          </table>
        </div>

      </section>
    `;
    $('#impAuthors').onclick = () => handleUpload('#fileAuthors','#upAuthors','authors');

    // Add sample data button
    const sampleBtn = $('#createSampleAuthors');
    if (sampleBtn) {
      sampleBtn.onclick = async () => {
        console.log('Sample data button clicked');
        const success = await createSampleAuthorsData();
        if (success) {
          toast('Sample data created! Refreshing...');
          // Refresh the authors view
          setTimeout(() => VIEWS.authors(), 1000);
        } else {
          toast('Failed to create sample data');
        }
      };
    } else {
      console.error('Sample data button not found!');
    }
    
    // Filter functionality
    let allAuthorsData = [];
    let filteredAuthorsData = [];
    
    // Load and filter authors data
    const loadAuthorsData = async () => {
      try {
        const { data, error } = await sb.from('authors').select('*').order('created_at', {ascending: false});
        if (error) throw error;
        allAuthorsData = data || [];
        applyFilters();
      } catch (e) {
        console.error('Error loading authors:', e);
        $('#tbAuthors').innerHTML = '<tr><td colspan="14" class="p-2 opacity-60">Error loading data</td></tr>';
      }
    };
    
    // Apply filters
    const applyFilters = () => {
      const modsFilter = $('#filterMods').value;
      const statusFilter = $('#filterStatus').value;
      const ficProgressFilter = $('#filterFicProgress').value;
      const authorStatusFilter = $('#filterAuthorStatus').value;
      const promptsStatusFilter = $('#filterPromptsStatus').value;
      
      filteredAuthorsData = allAuthorsData.filter(author => {
        return (!modsFilter || author.mods === modsFilter) &&
               (!statusFilter || author.status === statusFilter) &&
               (!ficProgressFilter || author.fic_progress === ficProgressFilter) &&
               (!authorStatusFilter || author.author_status === authorStatusFilter) &&
               (!promptsStatusFilter || author.prompts_status === promptsStatusFilter);
      });
      
      renderAuthorsTable();
      updateFilterCount();
    };
    
    // Render authors table
    const renderAuthorsTable = () => {
      $('#tbAuthors').innerHTML = filteredAuthorsData.map(r=>{
        return `<tr>
        <td contenteditable="true" data-author="${r.id}">${esc(r.claimed_by||'')}</td>
        <td contenteditable="true" data-twitter="${r.id}">${esc(r.author_twitter||'')}</td>
        <td contenteditable="true" data-email="${r.id}">${esc(r.author_email||'')}</td>
          <td>
            <select data-id="${r.id}" data-field="mods" class="rounded-lg border p-1">
              <option value="">Select Mod</option>
              <option value="Nio" ${r.mods==='Nio'?'selected':''}>Nio</option>
              <option value="Sha" ${r.mods==='Sha'?'selected':''}>Sha</option>
              <option value="Naya" ${r.mods==='Naya'?'selected':''}>Naya</option>
              <option value="Cinta" ${r.mods==='Cinta'?'selected':''}>Cinta</option>
          </select>
        </td>
          <td>
            <select data-id="${r.id}" data-field="status" class="rounded-lg border p-1">
              <option value="pending" ${r.status==='pending'?'selected':''}>Pending</option>
              <option value="sent" ${r.status==='sent'?'selected':''}>Sent</option>
              <option value="replied" ${r.status==='replied'?'selected':''}>Replied</option>
              <option value="havent replied" ${r.status==='havent replied'?'selected':''}>Haven't Replied</option>
              <option value="blocked" ${r.status==='blocked'?'selected':''}>Blocked</option>
            </select>
          </td>
          <td><input type="date" data-id="${r.id}" data-field="checkin_date" class="rounded-lg border p-1" value="${r.checkin_date||''}"/></td>
        <td contenteditable="true" data-notes="${r.id}">${esc(r.notes||'')}</td>
          <td>
            <select data-id="${r.id}" data-field="fic_progress" class="rounded-lg border p-1">
              <option value="">Select Progress</option>
              <option value="0%" ${r.fic_progress==='0%'?'selected':''}>Belum mulai (0%)</option>
              <option value="20%" ${r.fic_progress==='20%'?'selected':''}>Masih outline / planning (20%)</option>
              <option value="40%" ${r.fic_progress==='40%'?'selected':''}>Lagi nulis draft (40%)</option>
              <option value="60%" ${r.fic_progress==='60%'?'selected':''}>Hampir kelar draft (60%)</option>
              <option value="80%" ${r.fic_progress==='80%'?'selected':''}>Selesai draft, lagi finishing (80%)</option>
              <option value="100%" ${r.fic_progress==='100%'?'selected':''}>Sudah lengkap / selesai (100%)</option>
            </select>
          </td>
          <td><input type="number" data-id="${r.id}" data-field="word_counts" class="rounded-lg border p-1" placeholder="Words" value="${r.word_counts||''}"/></td>
          <td>
            <select data-id="${r.id}" data-field="prompts_status" class="rounded-lg border p-1">
              <option value="">Select Status</option>
              <option value="own prompt" ${r.prompts_status==='own prompt'?'selected':''}>Using my own prompt</option>
              <option value="changes" ${r.prompts_status==='changes'?'selected':''}>Changes, using others</option>
            </select>
          </td>
          <td contenteditable="true" data-request="${r.id}">${esc(r.request_for_mods||'')}</td>
          <td>
            <button onclick="deleteAuthor('${r.id}')" class="btn btn-sm btn-error">Delete</button>
            <button onclick="copyDMTemplate('${r.id}')" class="btn btn-sm btn-ghost">Copy DM</button>
          </td>
      </tr>`;
      }).join('') || '<tr><td colspan="13" class="p-2 opacity-60">📝 No authors data yet<br><small>Upload an Excel file with authors data to get started<br>Expected columns: claimed_by, claimed_date, progress, author_email, author_twitter, pairing_from_claim, prompts, description, mods, status, checkin_date, checkin_time, notes, fic_progress, author_status, word_counts, prompts_status, request_for_mods</small></td></tr>';
      
      // Add event listeners for the rendered table
      addTableEventListeners();
    };
    
    // Update filter count
    const updateFilterCount = () => {
      const total = allAuthorsData.length;
      const filtered = filteredAuthorsData.length;
      $('#filterCount').textContent = `Showing ${filtered} of ${total} authors`;
    };
    
    // Add event listeners for table interactions
    const addTableEventListeners = () => {
      // update dropdowns (mods, status, fic_progress, author_status, prompts_status)
    $$('#tbAuthors select').forEach(sel=>{
      sel.onchange = async ()=>{
          const field = sel.dataset.field;
          const payload = {};
          payload[field] = sel.value;
          try {
            const { error } = await sb.from('authors').update(payload).eq('id', sel.dataset.id);
            if (error) {
              console.error(`Error updating ${field}:`, error);
              toast(`Error updating ${field}: ${error.message}`);
            } else {
              toast(`${field} updated`);
              // Refresh data after update
              loadAuthorsData();
            }
          } catch (err) {
            console.error(`Exception updating ${field}:`, err);
            toast(`Error updating ${field}: ${err.message}`);
          }
      };
    });
      
      // update date, time, and number inputs
      $$('#tbAuthors input[type="date"], #tbAuthors input[type="time"], #tbAuthors input[type="number"]').forEach(input=>{
        input.addEventListener('change', async ()=>{
          const field = input.dataset.field;
          const payload = {};
          payload[field] = input.value;
          await sb.from('authors').update(payload).eq('id', input.dataset.id);
          toast(`${field} updated`);
          // Refresh data after update
          loadAuthorsData();
        });
      });
      
      // update editable cells (author, twitter, email, notes, request_for_mods)
      $$('#tbAuthors [data-author], #tbAuthors [data-twitter], #tbAuthors [data-email], #tbAuthors [data-notes], #tbAuthors [data-request]').forEach(cell=>{
      cell.addEventListener('blur', async ()=>{
          const id = cell.getAttribute('data-author') || cell.getAttribute('data-twitter') || cell.getAttribute('data-email') || cell.getAttribute('data-notes') || cell.getAttribute('data-request');
        const payload = {};
          if(cell.hasAttribute('data-author')) payload.claimed_by = cell.textContent.trim();
          if(cell.hasAttribute('data-twitter')) payload.author_twitter = cell.textContent.trim();
          if(cell.hasAttribute('data-email')) payload.author_email = cell.textContent.trim();
          if(cell.hasAttribute('data-notes')) payload.notes = cell.textContent.trim();
          if(cell.hasAttribute('data-request')) payload.request_for_mods = cell.textContent.trim();
        await sb.from('authors').update(payload).eq('id', id);
        toast('Saved');
          // Refresh data after update
          loadAuthorsData();
      });
    });
    };
    
    // Filter event listeners
    $$('#filterMods, #filterStatus, #filterFicProgress, #filterAuthorStatus, #filterPromptsStatus').forEach(filter => {
      filter.addEventListener('change', applyFilters);
    });
    
    // Clear filters button
    $('#clearFilters').onclick = () => {
      $('#filterMods').value = '';
      $('#filterStatus').value = '';
      $('#filterFicProgress').value = '';
      $('#filterAuthorStatus').value = '';
      $('#filterPromptsStatus').value = '';
      applyFilters();
    };
    
    // Load initial data
    loadAuthorsData();
    
    // Import check-in data button
    const checkinBtn = $('#importCheckinData');
    if (checkinBtn) {
      checkinBtn.onclick = async () => {
        try {
          // Create a file input for check-in data
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv,.xlsx';
          input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            toast('Processing check-in data...');
            await handleCheckinDataUpload(file);
          };
          input.click();
        } catch (e) {
          console.error('Error importing check-in data:', e);
          toast('Failed to import check-in data: ' + e.message);
        }
      };
    }
    
    // Add author form
    $('#addAuthorBtn').onclick = async () => {
      const author = $('#newAuthor').value.trim();
      const twitter = $('#newAuthorTwitter').value.trim();
      const email = $('#newAuthorEmail').value.trim();
      const mods = $('#newMods').value;
      const status = $('#newStatus').value;
      const checkinDate = $('#newCheckinDate').value;
      const checkinTime = $('#newCheckinTime').value;
      const notes = $('#newNotes').value.trim();
      
      if (!author) {
        toast('Author name is required');
        return;
      }

      try {
        const { error } = await sb.from('authors').insert({
          claimed_by: author,
          author_twitter: twitter,
          author_email: email,
          mods: mods,
          status: status,
          checkin_date: checkinDate,
          checkin_time: checkinTime,
          notes: notes,
          claimed_date: new Date().toISOString().slice(0,10)
        });
        
        if (error) throw error;
        
        toast('Author added successfully!');
        $('#clearFormBtn').click(); // Clear form
        loadAuthorsData(); // Refresh data
      } catch (e) {
        console.error('Error adding author:', e);
        toast('Failed to add author: ' + e.message);
      }
    };
    
    // Clear form button
    $('#clearFormBtn').onclick = () => {
      $('#newAuthor').value = '';
      $('#newAuthorTwitter').value = '';
      $('#newAuthorEmail').value = '';
      $('#newMods').value = '';
      $('#newStatus').value = 'pending';
      $('#newCheckinDate').value = new Date().toISOString().slice(0,10);
      $('#newCheckinTime').value = '09:00';
      $('#newNotes').value = '';
    };
    
    // Export CSV button
    $('#exportAuthors').onclick = async () => {
      try {
        const { data, error } = await sb.from('authors').select('*');
        if (error) throw error;
        
        // Create CSV content
    const headers = ['Author', 'Author Twitter', 'Author Email', 'Mods', 'Status', 'Date Checkin', 'Notes', '% Fic', 'Word Counts', 'Prompts Status', 'Request for Mods', 'Created Date'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        `"${(row.claimed_by || '').replace(/"/g, '""')}"`,
        `"${(row.author_twitter || '').replace(/"/g, '""')}"`,
        `"${(row.author_email || '').replace(/"/g, '""')}"`,
        `"${(row.mods || '').replace(/"/g, '""')}"`,
        `"${(row.status || '').replace(/"/g, '""')}"`,
        `"${(row.checkin_date || '').replace(/"/g, '""')}"`,
        `"${(row.notes || '').replace(/"/g, '""')}"`,
        `"${(row.fic_progress || '').replace(/"/g, '""')}"`,
        `"${(row.word_counts || '').replace(/"/g, '""')}"`,
        `"${(row.prompts_status || '').replace(/"/g, '""')}"`,
        `"${(row.request_for_mods || '').replace(/"/g, '""')}"`,
        `"${(row.claimed_date || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `authors_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        toast('CSV exported successfully!');
      } catch (e) {
        console.error('Export error:', e);
        toast('Failed to export: ' + e.message);
      }
    };


  },

  async announcements(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <h2 class="text-xl font-semibold mb-2">📢 Announcements</h2>
        <form id="annForm" class="grid md:grid-cols-2 gap-2">
          <input id="annTitle" class="rounded-xl border p-2" placeholder="Title"/>
          <label class="inline-flex items-center gap-2 text-sm"><input id="annPub" type="checkbox" class="rounded"/> Publish now</label>
          <textarea id="annBody" rows="4" class="md:col-span-2 rounded-xl border p-2" placeholder="Body…"></textarea>
          <button class="md:col-span-2 btn btn-dark">Save</button>
        </form>
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Title</th><th>Published</th><th>When</th></tr></thead>
            <tbody id="annList"></tbody>
          </table>
        </div>
      </section>
    `;
    $('#annForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const row = { title: $('#annTitle').value.trim(), body: $('#annBody').value.trim(), is_published: $('#annPub').checked };
      if(!row.title) return;
      await sb.from('announcements').insert(row);
      $('#annTitle').value=''; $('#annBody').value=''; $('#annPub').checked=false;
      toast('Saved'); announcements();
    });

    const { data=[] } = await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(50);
    $('#annList').innerHTML = data.map(r=>`
      <tr><td>${esc(r.title||'')}</td><td>${r.is_published?'Yes':'No'}</td><td>${DateTime.fromISO(r.created_at).toFormat('dd LLL yyyy, HH:mm')}</td></tr>
    `).join('') || '<tr><td colspan="3" class="p-2 opacity-60">No data</td></tr>';
  },

  async timeline(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🗓️ Timeline</h2>
          <button id="addTL" class="btn btn-ghost">Add</button>
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
      const phase = prompt('Phase name'); if(!phase) return;
      const dateRange = prompt('Date range (text)')||'';
      const tasks = prompt('Tasks')||'';
      const start = prompt('Start date (YYYY-MM-DD, optional)')||null;
      await sb.from('timeline').insert({ phase, date_range: dateRange, tasks, start_date: start });
      toast('Added'); timeline();
    };

    await renderHeadline($('#headline'));
    const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true});
    
    // Remove duplicates by phase (keep the first one)
    const uniqueData = [];
    const seenPhases = new Set();
    data.forEach(item => {
      if (!seenPhases.has(item.phase)) {
        seenPhases.add(item.phase);
        uniqueData.push(item);
      }
    });
    $('#tbTL').innerHTML = uniqueData.map(r=>`
      <tr><td>${esc(r.phase)}</td><td>${esc(r.date_range||'')}</td><td>${esc(r.tasks||'')}</td><td>${esc(r.start_date||'')}</td></tr>
    `).join('') || '<tr><td colspan="4" class="p-2 opacity-60">No data</td></tr>';
  },

  async design(){
    $('#view').innerHTML = `
      <section class="p-4 rounded-2xl card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">🎨 Design</h2>
        </div>
        
        <!-- Add Form -->
        <form id="designForm" class="grid md:grid-cols-2 gap-3 mt-3 p-3 rounded-xl" style="background:var(--peach)">
          <input id="designPost" class="rounded-xl border p-2" placeholder="Post title" required/>
          <input id="designAgenda" class="rounded-xl border p-2" placeholder="Agenda"/>
          <input id="designDue" type="date" class="rounded-xl border p-2" placeholder="Due date"/>
          <select id="designStatus" class="rounded-xl border p-2">
            <option value="pending">pending</option>
            <option value="on progress">on progress</option>
            <option value="finished">finished</option>
          </select>
          <input id="designRequested" class="rounded-xl border p-2" placeholder="Requested by (e.g., Nio)"/>
          <button type="submit" class="md:col-span-2 btn btn-dark">Add Design Item</button>
        </form>
        
        <div class="table-wrap mt-3">
          <table class="text-sm">
            <thead><tr><th>Post</th><th>Agenda</th><th>Due</th><th>Status</th><th>Requested</th><th>Link</th><th>Actions</th></tr></thead>
            <tbody id="tbD"></tbody>
          </table>
        </div>
      </section>
    `;
    
    // Handle form submission
    $('#designForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const post = $('#designPost').value.trim();
      if(!post) return;
      
      const row = { 
        post, 
        agenda: $('#designAgenda').value.trim(), 
        due_date: $('#designDue').value || null, 
        status: $('#designStatus').value, 
        requested: $('#designRequested').value.trim()
      };
      
      await sb.from('design').insert(row);
      $('#designPost').value=''; 
      $('#designAgenda').value=''; 
      $('#designDue').value=''; 
      $('#designStatus').value='pending'; 
      $('#designRequested').value='';
      toast('Saved'); 
      design();
    });

    const { data=[] } = await sb.from('design').select('*').order('created_at',{ascending:false});
    $('#tbD').innerHTML = data.map(r=>`
      <tr>
        <td>${esc(r.post||'')}</td>
        <td>${esc(r.agenda||'')}</td>
        <td>${esc(r.due_date||'')}</td>
        <td>
          <select data-id="${r.id}" class="rounded-lg border p-1">
            ${['pending','on progress','finished'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>${esc(r.requested||'')}</td>
        <td>
          <input type="url" data-id="${r.id}" data-field="link" class="rounded-lg border p-1 w-full" 
                 placeholder="Add link after request" value="${esc(r.link||'')}"/>
        </td>
        <td>
          <button data-id="${r.id}" class="btn-delete text-red-600 hover:text-red-800 text-xs">Delete</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="p-2 opacity-60">No data</td></tr>';

    $$('#tbD select').forEach(sel=>{
      sel.onchange = async ()=>{
        await sb.from('design').update({status: sel.value}).eq('id', sel.dataset.id);
        toast('Updated');
      };
    });
    
    // Handle link input changes
    $$('#tbD input[data-field="link"]').forEach(input=>{
      input.addEventListener('blur', async ()=>{
        const link = input.value.trim();
        await sb.from('design').update({link: link || null}).eq('id', input.dataset.id);
        toast('Link updated');
      });
    });
    
    $$('#tbD .btn-delete').forEach(btn=>{
      btn.onclick = async ()=>{
        if(confirm('Delete this design item?')){
          await sb.from('design').delete().eq('id', btn.dataset.id);
          toast('Deleted');
          design();
        }
      };
    });
  },
};

// ================= EXPORT FUNCTIONALITY =================
async function exportData(format = 'json') {
  try {
    console.log('Starting data export...');
    
    if (format === 'json') {
      // Export all data as JSON
      const { data, error } = await sb.rpc('export_all_data');
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wish-fic-fest-data-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast('Data exported as JSON ✓');
    } else if (format === 'excel') {
      // Export combined data like your Excel structure
      const { data, error } = await sb.rpc('export_combined_data');
      if (error) throw error;
      
      // Convert to CSV format
      if (data && data.length > 0) {
        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(header => `"${(row[header] || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wish-fic-fest-data-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast('Data exported as CSV ✓');
      }
    }
  } catch (error) {
    console.error('Export error:', error);
    toast('Export failed: ' + error.message);
  }
}

// ================= OVERVIEW helpers =================
async function loadKPIs(){
  try{
    console.log('Loading KPIs...');
    
    // Total Prompts (total all prompts)
    const { count: totalPrompts } = await sb.from('prompts').select('*', { count: 'exact', head: true });
    console.log('Total prompts count:', totalPrompts);
    
    // Available Prompts (total prompts that status are available)
    const { count: availablePrompts } = await sb.from('prompts').select('*', { count: 'exact', head: true }).eq('status', 'available');
    console.log('Available prompts count:', availablePrompts);
    
    // Claimed (prompts that have claimed_by and Self Prompt)
    const { count: claimedPrompts } = await sb.from('prompts').select('*', { count: 'exact', head: true }).in('status', ['claimed', 'self_prompt']);
    console.log('Claimed prompts count:', claimedPrompts);
    
    // Authors (Total authors on authors)
    const { count: totalAuthors } = await sb.from('authors').select('*', { count: 'exact', head: true });
    console.log('Total authors count:', totalAuthors);
    
    $('#k1').textContent = totalPrompts ?? 0;
    $('#k2').textContent = availablePrompts ?? 0;
    $('#k3').textContent = claimedPrompts ?? 0;
    $('#k4').textContent = totalAuthors ?? 0;
    
    console.log('KPIs loaded successfully');
  }catch(e){ 
    console.error('KPI loading error:', e); 
    toast('Gagal load KPI: ' + e.message); 
  }
}

async function drawPies(){
  // Prompter chart: ALL pairings from prompts (all prompts submitted)
  const { data: P=[] } = await sb.from('prompts').select('pairing');
  
  // Claimed chart: Only pairings from prompts (status claimed/self_prompt)
  const { data: C=[] } = await sb.from('prompts').select('pairing').in('status', ['claimed', 'self_prompt']);

  const top5 = (arr)=>{
    const m = new Map();
    arr.forEach(x=>{
      const p = (x?.pairing||'').trim(); if(!p) return;
      m.set(p, (m.get(p)||0)+1);
    });
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  };
  
  // TP = Top 5 pairings from ALL prompts (prompter data)
  // TC = Top 5 pairings from CLAIMED prompts (claimed data)
  const TP = top5(P), TC = top5(C);

  const pie = (canvasId, entries)=>{
    const cnv = document.getElementById(canvasId);
    if(!cnv) return;
    const ctx = cnv.getContext('2d');
    const W=cnv.width=280, H=cnv.height=280, R=110, cx=W/2, cy=H/2;
    const total = entries.reduce((s, [,v])=>s+v,0) || 1;
    let a=-Math.PI/2;
    entries.forEach(([,v],i)=>{
      const frac=v/total, a2=a+2*Math.PI*frac;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,a,a2); ctx.closePath();
      ctx.fillStyle=`hsl(${(i*62)%360} 70% 60%)`; ctx.fill(); a=a2;
    });
  };
  pie('piePrompt', TP);
  pie('pieClaim',  TC);

  const rank = (rootId, entries)=>{
    const root = document.getElementById(rootId);
    if(!root) return;
    root.innerHTML = entries.map(([k,v],i)=> `<div>${medal(i)} <b>${esc(k)}</b> — ${v}</div>`).join('') || '<div class="opacity-60">No data</div>';
  };
  rank('rankPrompt', TP);
  rank('rankClaim',  TC);
}

// ================= HEADLINE / TIMELINE =================
function fmtCountdown(target){
  if(!target) return '—';
  const end = new Date(target).getTime();
  let s = Math.max(0, Math.floor((end - Date.now())/1000));
  const d = Math.floor(s/86400); s%=86400;
  const h = Math.floor(s/3600);  s%=3600;
  const m = Math.floor(s/60);    const sec = s%60;
  return `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
async function renderHeadline(root){
  const { data=[] } = await sb.from('timeline').select('*').order('start_date',{ascending:true});
  
  // Show only the "Reveals" phase countdown
  const revealsPhase = data.find(r => r.phase === 'Reveals');
  
  if (revealsPhase) {
    root.innerHTML = `<div class="p-3 rounded-xl" style="background:var(--peach)">
      <div class="text-sm opacity-70">${esc(revealsPhase.phase)}</div>
      <div class="text-lg font-semibold">${esc(revealsPhase.tasks||'')}</div>
      <div class="mt-1 text-sm">${esc(revealsPhase.date_range||'')}</div>
      <div class="mt-2 text-2xl font-bold" data-countdown="${revealsPhase.start_date||''}">—</div>
    </div>`;
  } else {
    // Fallback if Reveals phase not found
    root.innerHTML = `<div class="p-3 rounded-xl" style="background:var(--peach)">
      <div class="text-sm opacity-70">Reveals</div>
      <div class="text-lg font-semibold">Author reveals and fic posting</div>
      <div class="mt-1 text-sm">Week 9</div>
      <div class="mt-2 text-2xl font-bold" data-countdown="2025-03-12">—</div>
    </div>`;
  }
  
  const tick = ()=> $$('[data-countdown]').forEach(el=>{
    const iso = el.getAttribute('data-countdown'); 
    el.textContent = iso && iso !== 'null' && iso !== '' ? fmtCountdown(iso) : '—';
  });
  tick(); setInterval(tick, 1000);
}

// ================= CSV PARSING =================
function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const row = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

// ================= XLSX/CSV UPLOAD =================
async function handleUpload(inputSel, statusSel, target){
  const file = $(inputSel)?.files?.[0]; const s=$(statusSel);
  if(!file){ toast('Pilih file'); return; }
  
  // Validate file size (max 10MB)
  if(file.size > 10 * 1024 * 1024) {
    toast('File terlalu besar (max 10MB)');
    return;
  }
  
  s.textContent='Uploading…';
  try{
    console.log('Starting upload for file:', file.name, 'Size:', file.size, 'bytes', 'Target:', target);
    const result = await importWorkbookToSupabase(file, target);
    console.log('Upload completed successfully:', result);
    s.textContent='Done ✓'; 
    toast('Upload sukses');
    
    // refresh ringan
    if(target==='prompts') {
      console.log('Refreshing prompts view...');
      VIEWS.prompts();
    } else if(target==='authors') {
      console.log('Refreshing authors view...');
      VIEWS.authors();
    }
  }catch(err){
    console.error('Upload error:', err); 
    s.textContent='Failed ✗'; 
    toast('Upload gagal: '+(err.message||'Unknown error'));
  }finally{
    // Clear the file input
    $(inputSel).value = '';
  }
}

// baca excel lalu insert sesuai sheet/kolom
async function importWorkbookToSupabase(file, target){
  console.log('Starting file import:', file.name, 'target:', target);
  
  // Validate file type
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
    throw new Error('File must be CSV, XLSX, or XLS format');
  }
  
  const buf = await file.arrayBuffer();
  let sheets = [];
  
  if (fileName.endsWith('.csv')){
    console.log('Processing CSV file');
    const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
    // Better CSV parsing that handles quoted fields
    const rows = parseCSV(text);
    sheets = [{ name:'CSV', rows }];
  } else {
    console.log('Processing Excel file');
    
    // Check if XLSX is available
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX library not loaded. Please refresh the page and try again, or save your Excel file as CSV format.');
    }
    
    try {
    const wb = XLSX.read(buf, { type:'array' });
      console.log('Excel sheets found:', wb.SheetNames);
    wb.SheetNames.forEach(n=>{
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, defval:'' });
        console.log(`Sheet "${n}" has ${rows.length} rows`);
      sheets.push({ name:n, rows });
    });
    } catch (error) {
      console.error('Excel parsing error:', error);
      throw new Error('Failed to parse Excel file: ' + error.message);
    }
  }

  for(const ws of sheets){
    if(!ws.rows.length) {
      console.log(`Skipping empty sheet: ${ws.name}`);
      continue;
    }
    
    console.log(`Processing sheet: ${ws.name} with ${ws.rows.length} rows`);
    const H = ws.rows[0].map(x=>String(x).trim().toLowerCase());
    console.log('Headers found:', H);
    
    // Store columns globally for debugging
    window.currentExcelColumns = ws.rows[0];
    
    // More flexible column detection
    const gi = (k)=> {
      const exact = H.indexOf(k);
      if (exact >= 0) return exact;
      
      // Try partial matches for common variations
      const variations = [
        k.replace(/[_\s]/g, ''), // Remove underscores and spaces
        k.replace(/[_\s]/g, '_'), // Replace spaces with underscores
        k.replace(/[_\s]/g, ' '), // Replace underscores with spaces
      ];
      
      for (const variation of variations) {
        const match = H.findIndex(h => h.includes(variation) || variation.includes(h));
        if (match >= 0) return match;
      }
      
      return -1;
    };

    // PROMPTS (Updated to match your Excel structure)
    const looksPrompt = ['prompt_date','prompter_name','pairing','prompts','descripton','status'].some(k=>gi(k)>=0);
    if((target==='prompts' || (!target && looksPrompt))){
      console.log('Processing prompts data...');
      
      // Try to get the actual table schema first
      let tableSchema = null;
      try {
        const { data: schemaData } = await sb.from('prompts').select('*').limit(1);
        if (schemaData && schemaData.length > 0) {
          tableSchema = Object.keys(schemaData[0]);
          console.log('Table schema found:', tableSchema);
        }
      } catch (schemaError) {
        console.warn('Could not fetch table schema:', schemaError);
      }
      
      const rows = ws.rows.slice(1).map((r, index)=>{
        try {
          const row = {
        prompt_date:        gi('prompt_date')>=0 ? toDate(r[gi('prompt_date')]) : '2025-01-01', // Default to 2025
            prompter_name:      gi('prompter_name')>=0 ? String(r[gi('prompter_name')] || '').trim() : null,
            prompter_ao3:       gi('prompter_ao3/twitter')>=0 ? String(r[gi('prompter_ao3/twitter')] || '').trim() : null,
            pairing:            gi('pairing')>=0 ? String(r[gi('pairing')] || '').trim() : null,
            additonal_tags:     gi('additonal_tags')>=0 ? String(r[gi('additonal_tags')] || '').trim() : null,
            rating:             gi('rating')>=0 ? String(r[gi('rating')] || '').trim() : null,
            description:        gi('descripton')>=0 ? String(r[gi('descripton')] || '').trim() : null,
            prompt_bank_upload: gi('prompt_bank_upload')>=0 ? String(r[gi('prompt_bank_upload')] || '').trim() : null,
            status:             gi('status')>=0 ? String(r[gi('status')] || 'available').toLowerCase() : 'available'
          };
          
          // Try different column names for the prompt text
          const promptText = gi('prompts')>=0 ? String(r[gi('prompts')] || '').trim() : 
                            gi('prompt')>=0 ? String(r[gi('prompt')] || '').trim() :
                            gi('text')>=0 ? String(r[gi('text')] || '').trim() : null;
          
          // Use the correct column name based on schema
          if (tableSchema) {
            if (tableSchema.includes('text')) {
              row.text = promptText;
            } else if (tableSchema.includes('prompt')) {
              row.prompt = promptText;
            } else if (tableSchema.includes('prompt_text')) {
              row.prompt_text = promptText;
            } else {
              // Default to text if we can't determine
              row.text = promptText;
            }
          } else {
            // Default to text
            row.text = promptText;
          }
          
          return row;
        } catch (error) {
          console.error(`Error processing row ${index + 2}:`, error, r);
          return null;
        }
      }).filter(x=>x && (x.text||x.prompt||x.prompt_text||x.description||x.pairing));
      
      console.log(`Found ${rows.length} valid prompt rows to insert`);
      console.log('Sample row:', rows[0]);
      
      if(rows.length){ 
        console.log('Attempting to insert prompts with data:', rows.slice(0, 2)); // Log first 2 rows for debugging
        const { error } = await sb.from('prompts').insert(rows); 
        if(error) {
          console.error('Database error inserting prompts:', error);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
          console.error('Error code:', error.code);
          console.error('Sample row that failed:', rows[0]);
          throw new Error('Failed to insert prompts: ' + error.message);
        }
        console.log('Successfully inserted prompts');
      }
    }


    // AUTHORS - More flexible detection
    const authorsColumns = [
      'claimed_by', 'claimed by', 'author', 'authors', 'name',
      'claimed_date', 'claimed date', 'date',
      'progress',
      'author_email', 'author email', 'email',
      'author_twitter', 'author twitter', 'twitter',
      'pairing_from_claim', 'pairing from claim', 'pairing',
      'prompts',
      'description',
      'mods', 'mod',
      'status',
      'checkin_date', 'checkin date',
      'checkin_time', 'checkin time', 'time',
      'notes',
      // Google Form check-in columns
      'timestamp', 'isi nama user', 'pseud ao3', 'tahap', 'words', 'bisa menyelesaikan', 'pake prompt', 'request khusus'
    ];
    const looksAuthors = authorsColumns.some(k=>gi(k)>=0) || target==='authors';
    console.log('Authors detection check:', {
      target: target,
      looksAuthors: looksAuthors,
      availableColumns: ws.rows[0] || [],
      columnIndices: {
        claimed_by: gi('claimed_by'),
        claimed_date: gi('claimed_date'),
        progress: gi('progress'),
        author_email: gi('author_email'),
        author_twitter: gi('author_twitter'),
        pairing_from_claim: gi('pairing_from_claim'),
        prompts: gi('prompts'),
        description: gi('description')
      }
    });
    
    if((target==='authors' || (!target && looksAuthors))){
      console.log('Processing authors data...');
      
      // Try to get the actual table schema first
      let tableSchema = null;
      try {
        const { data: schemaData } = await sb.from('authors').select('*').limit(1);
        if (schemaData && schemaData.length > 0) {
          tableSchema = Object.keys(schemaData[0]);
          console.log('authors table schema found:', tableSchema);
        }
      } catch (schemaError) {
        console.warn('Could not fetch authors table schema:', schemaError);
      }
      
      const rows = ws.rows.slice(1).map((r, index)=>{
        try {
          const row = {
        claimed_date: gi('claimed_date')>=0 ? toDate(r[gi('claimed_date')]) : 
                     gi('claimed date')>=0 ? toDate(r[gi('claimed date')]) :
                     gi('date')>=0 ? toDate(r[gi('date')]) : '2025-01-01', // Default to 2025
        progress:     gi('progress')>=0 ? normProgress(r[gi('progress')]) : 
                     gi('tahap')>=0 ? normProgress(r[gi('tahap')]) : null,
        pairing_from_claim: gi('pairing_from_claim')>=0 ? String(r[gi('pairing_from_claim')] || '').trim() : 
                           gi('pairing from claim')>=0 ? String(r[gi('pairing from claim')] || '').trim() :
                           gi('pairing')>=0 ? String(r[gi('pairing')] || '').trim() : null,
        prompts: gi('prompts')>=0 ? String(r[gi('prompts')] || '').trim() : null,
        description: gi('description')>=0 ? String(r[gi('description')] || '').trim() : null,
        // New fields for mod workflow
        mods: gi('mods')>=0 ? String(r[gi('mods')] || '').trim() : 
              gi('mod')>=0 ? String(r[gi('mod')] || '').trim() : null,
        status: gi('status')>=0 ? String(r[gi('status')] || '').trim() : 'pending',
        checkin_date: gi('checkin_date')>=0 ? toDate(r[gi('checkin_date')]) : 
                     gi('checkin date')>=0 ? toDate(r[gi('checkin date')]) : 
                     gi('timestamp')>=0 ? toDate(r[gi('timestamp')]) : null,
        checkin_time: gi('checkin_time')>=0 ? String(r[gi('checkin_time')] || '').trim() : 
                     gi('checkin time')>=0 ? String(r[gi('checkin time')] || '').trim() :
                     gi('time')>=0 ? String(r[gi('time')] || '').trim() : null,
        notes: gi('notes')>=0 ? String(r[gi('notes')] || '').trim() : 
                gi('request khusus')>=0 ? String(r[gi('request khusus')] || '').trim() : null
          };
          
          // Handle claimed_by with flexible column names
          const claimedBy = gi('claimed_by')>=0 ? String(r[gi('claimed_by')] || '').trim() : 
                           gi('claimed by')>=0 ? String(r[gi('claimed by')] || '').trim() :
                           gi('author')>=0 ? String(r[gi('author')] || '').trim() :
                           gi('authors')>=0 ? String(r[gi('authors')] || '').trim() :
                           gi('name')>=0 ? String(r[gi('name')] || '').trim() :
                           gi('isi nama user')>=0 ? String(r[gi('isi nama user')] || '').trim() :
                           gi('pseud ao3')>=0 ? String(r[gi('pseud ao3')] || '').trim() : null;
          if (claimedBy && tableSchema) {
            if (tableSchema.includes('claimed_by')) {
              row.claimed_by = claimedBy;
            } else if (tableSchema.includes('author_name')) {
              row.author_name = claimedBy;
            } else if (tableSchema.includes('name')) {
              row.name = claimedBy;
            } else if (tableSchema.includes('author')) {
              row.author = claimedBy;
            } else {
              row.claimed_by = claimedBy;
            }
          } else if (claimedBy) {
            row.claimed_by = claimedBy;
          }
          
          // Handle author_email with flexible column names
          const emailValue = gi('author_email')>=0 ? String(r[gi('author_email')] || '').trim() : 
                            gi('author email')>=0 ? String(r[gi('author email')] || '').trim() :
                            gi('email')>=0 ? String(r[gi('email')] || '').trim() : null;
          if (emailValue) {
            row.author_email = emailValue;
          }
          
          // Handle author_twitter with flexible column names
          const twitterValue = gi('author_twitter')>=0 ? String(r[gi('author_twitter')] || '').trim() : 
                              gi('author twitter')>=0 ? String(r[gi('author twitter')] || '').trim() :
                              gi('twitter')>=0 ? String(r[gi('twitter')] || '').trim() : null;
          if (twitterValue) {
            row.author_twitter = twitterValue;
          }
          
          // Skip if no claimed_by (as requested)
          if (!claimedBy || claimedBy.trim() === '') {
            console.log(`Skipping authors row ${index + 2}: no claimed_by value`);
            return null;
          }
          
          return row;
        } catch (error) {
          console.error(`Error processing authors row ${index + 2}:`, error, r);
          return null;
        }
      }).filter(x=>x && (x.claimed_by||x.author_email||x.author_twitter));
      
      console.log(`Found ${rows.length} valid author rows to insert`);
      console.log('Sample author row:', rows[0]);
      
      if(rows.length){ 
        console.log('Attempting to insert authors with data:', rows.slice(0, 2)); // Log first 2 rows for debugging
        const { error } = await sb.from('authors').insert(rows); 
        if(error) {
          console.error('Database error inserting authors:', error);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
          console.error('Error code:', error.code);
          console.error('Sample row that failed:', rows[0]);
          throw new Error('Failed to insert authors: ' + error.message);
        }
        console.log('Successfully inserted authors');
      }
    }
  }
}


// ================= DEBUG FUNCTIONS =================
// Make functions available globally for console testing
window.debugExcelColumns = function() {
  console.log('=== EXCEL COLUMNS DEBUG ===');
  console.log('Available columns in current Excel file:');
  if (window.currentExcelColumns) {
    window.currentExcelColumns.forEach((col, index) => {
      console.log(`${index}: "${col}"`);
    });
  } else {
    console.log('No Excel file loaded. Upload a file first.');
  }
};

window.createSampleAuthorsData = async function() {
  console.log('Creating sample authors data...');
  try {
    const sampleData = [
      {
        claimed_by: 'Alice',
        claimed_date: '2025-01-01',
        progress: 'idea',
        author_email: 'alice@example.com',
        author_twitter: '@alice_writes',
        pairing_from_claim: 'Harry/Draco',
        prompts: 'Enemies to lovers',
        description: 'Working on a new fic'
      },
      {
        claimed_by: 'Bob',
        claimed_date: '2025-01-02',
        progress: 'draft',
        author_email: 'bob@example.com',
        author_twitter: '@bob_author',
        pairing_from_claim: 'Hermione/Ron',
        prompts: 'Friends to lovers',
        description: 'First draft complete'
      }
    ];
    
    const { data, error } = await sb.from('authors').insert(sampleData);
    if (error) {
      console.error('Error creating sample data:', error);
      return false;
    }
    
    console.log('✅ Sample authors data created successfully');
    return true;
  } catch (e) {
    console.error('❌ Error creating sample data:', e);
    return false;
  }
};

// Also create a local function for internal use
async function createSampleAuthorsData() {
  return await window.createSampleAuthorsData();
}

// Delete author function
window.deleteAuthor = async function(id) {
  if (confirm('Are you sure you want to delete this author?')) {
    try {
      const { error } = await sb.from('authors').delete().eq('id', id);
      if (error) throw error;
      toast('Author deleted');
      VIEWS.authors(); // Refresh the view
    } catch (e) {
      console.error('Error deleting author:', e);
      toast('Failed to delete author: ' + e.message);
    }
  }
};

// Handle check-in data upload function
async function handleCheckinDataUpload(file) {
  try {
    console.log('Processing check-in data file:', file.name);
    
    // Parse the file
    const ws = await parseFile(file);
    if (!ws || !ws.rows || ws.rows.length < 2) {
      throw new Error('Invalid file format or no data found');
    }
    
    console.log('Check-in data columns:', ws.rows[0]);
    console.log('Check-in data rows:', ws.rows.length - 1);
    
    // Process each row
    const checkinData = [];
    for (let i = 1; i < ws.rows.length; i++) {
      const row = ws.rows[i];
      if (!row || row.length === 0) continue;
      
      // Map Google Form columns to our data structure
      const authorName = row[1] || ''; // "Isi nama user/pseud ao3 kamu"
      const progress = row[2] || ''; // "Saat ini fanfic kamu sudah sampai tahap mai"
      const wordCount = row[3] || ''; // "Kira - kira berapa words yang akan di publish"
      const canFinish = row[4] || ''; // "Apakah kamu bisa menyelesaikan fic kamu?"
      const usePrompt = row[5] || ''; // "Apakah kamu mau tetap pake prompt yang k"
      const specialRequest = row[6] || ''; // "Ada request khusus buat mods?"
      const timestamp = row[0] || ''; // "Timestamp"
      
      if (!authorName.trim()) continue;
      
      // Create author record
      const authorRecord = {
        claimed_by: authorName.trim(),
        progress: progress.trim(),
        description: `Words: ${wordCount} | Can finish: ${canFinish} | Use prompt: ${usePrompt}`,
        notes: specialRequest.trim(),
        status: 'replied', // They replied to the check-in
        checkin_date: toDate(timestamp) || new Date().toISOString().slice(0,10),
        checkin_time: '09:00', // Default time
        claimed_date: new Date().toISOString().slice(0,10)
      };
      
      checkinData.push(authorRecord);
    }
    
    if (checkinData.length === 0) {
      throw new Error('No valid author data found in the file');
    }
    
    console.log('Processed check-in data:', checkinData);
    
    // Insert into database
    const { error } = await sb.from('authors').insert(checkinData);
    if (error) throw error;
    
    toast(`Successfully imported ${checkinData.length} author check-in responses!`);
    VIEWS.authors(); // Refresh the view
    
  } catch (e) {
    console.error('Error processing check-in data:', e);
    toast('Failed to import check-in data: ' + e.message);
  }
}

// Copy DM template function
window.copyDMTemplate = async function(id) {
  try {
    // Get author data
    const { data, error } = await sb.from('authors').select('*').eq('id', id).single();
    if (error) throw error;
    
    const author = data.claimed_by || 'Author';
    const checkinDate = data.checkin_date || new Date().toISOString().slice(0,10);
    const checkinTime = data.checkin_time || '09:00';
    
    // Format date and time
    const date = new Date(checkinDate);
    const formattedDate = date.toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // DM Template
    const dmTemplate = `Hi, ${author}! Semoga harimu menyenangkan ✨

Kami mau cek progress fic yang lagi kamu buat, tapi jangan khawatir, ini bukan lagi nodong, kok! 🫣

Mohon kesediaannya isi form ini dalam waktu 3x24 jam ⬇️
🔗 http://bit.ly/WFFCheckIn

Kalau ada kesulitan, tolong infokan mods yaaa! Good luck and we'll be waiting for your responses 🫶`;
    
    // Copy to clipboard
    await navigator.clipboard.writeText(dmTemplate);
    toast('DM template copied to clipboard!');
    
  } catch (e) {
    console.error('Error copying DM template:', e);
    toast('Failed to copy DM template: ' + e.message);
  }
};

async function testSupabaseConnection() {
  console.log('=== TESTING SUPABASE CONNECTION ===');
  try {
    // Test basic connection
    const { data, error } = await sb.from('prompts').select('count').limit(1);
    console.log('Supabase connection test result:', { data, error });
    
    if (error) {
      console.error('Supabase connection failed:', error);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    return true;
  } catch (e) {
    console.error('❌ Supabase connection error:', e);
    return false;
  }
}

function debugUploadIssues() {
  console.log('=== UPLOAD DEBUG INFO ===');
  console.log('XLSX library loaded:', typeof XLSX !== 'undefined');
  console.log('Supabase client:', typeof sb !== 'undefined');
  console.log('Current view:', window.currentView);
  
  // Test database connection
  sb.from('prompts').select('count').then(result => {
    console.log('Database connection test:', result);
  }).catch(err => {
    console.error('Database connection failed:', err);
  });
}

// ================= NOTES (save & recent) =================
function initNotes(){
  const d = $('#modDate'); if(d) d.value = new Date().toISOString().slice(0,10);
  $('#modSave')?.addEventListener('click', saveNotes);
  loadRecent();
}
function statusBadge(s){
  const map = { available:'#C7F9CC', away:'#FFE3B3', slow:'#FFD6E7' };
  return `<span class="px-2 py-0.5 rounded-full text-xs" style="background:${map[s]||'#eee'}">${s}</span>`;
}
async function saveNotes(){
  const modValue = $('#modWho')?.value || 'Nio';
  const onDateValue = $('#modDate')?.value || new Date().toISOString().slice(0,10);
  
  console.log('Attempting to save notes for mod:', modValue, 'date:', onDateValue);
  
  // Try multiple possible column configurations
  const possibleConfigs = [
    // Config 1: Standard mod column
    {
      row: {
        mod: modValue,
        on_date: onDateValue,
        mood: $('#modMood')?.value || '૮ ˶ᵔ ᵕ ᵔ˶ ა',
        status: $('#modStatus')?.value || 'available',
        note: $('#modNote')?.value?.trim() || null
      },
      conflict: 'mod,on_date'
    },
    // Config 2: Moderator column
    {
      row: {
        moderator: modValue,
        on_date: onDateValue,
        mood: $('#modMood')?.value || '૮ ˶ᵔ ᵕ ᵔ˶ ა',
        status: $('#modStatus')?.value || 'available',
        note: $('#modNote')?.value?.trim() || null
      },
      conflict: 'moderator,on_date'
    },
    // Config 3: Mod_name column
    {
      row: {
        mod_name: modValue,
        on_date: onDateValue,
        mood: $('#modMood')?.value || '૮ ˶ᵔ ᵕ ᵔ˶ ა',
        status: $('#modStatus')?.value || 'available',
        note: $('#modNote')?.value?.trim() || null
      },
      conflict: 'mod_name,on_date'
    },
    // Config 4: Who column
    {
      row: {
        who: modValue,
        on_date: onDateValue,
        mood: $('#modMood')?.value || '૮ ˶ᵔ ᵕ ᵔ˶ ა',
        status: $('#modStatus')?.value || 'available',
        note: $('#modNote')?.value?.trim() || null
      },
      conflict: 'who,on_date'
    }
  ];
  
  // Try each configuration until one works
  for (let i = 0; i < possibleConfigs.length; i++) {
    const config = possibleConfigs[i];
    console.log(`Trying configuration ${i + 1}:`, config.row);
    
    try {
      const { error } = await sb.from('mod_notes').upsert(config.row, { onConflict: config.conflict });
      
      if (!error) {
        console.log(`Successfully saved notes with configuration ${i + 1}`);
        $('#modNote').value = '';
        toast('Notes saved ✓');
        loadRecent();
        return;
      } else {
        console.log(`Configuration ${i + 1} failed:`, error.message);
        // If this is the last configuration, show the error
        if (i === possibleConfigs.length - 1) {
          console.error('All configurations failed. Last error:', error);
          toast('Notes gagal: ' + error.message);
          return;
        }
      }
    } catch (err) {
      console.log(`Configuration ${i + 1} threw error:`, err.message);
      if (i === possibleConfigs.length - 1) {
        console.error('All configurations failed. Last error:', err);
        toast('Notes gagal: ' + err.message);
        return;
      }
    }
  }
}

// Test function to help debug mod_notes table
async function testModNotesTable() {
  console.log('=== Testing mod_notes table ===');
  
  // Try to insert a test record with different column names
  const testConfigs = [
    { mod: 'Test', on_date: '2025-01-01', mood: 'test', status: 'available', note: 'test' },
    { moderator: 'Test', on_date: '2025-01-01', mood: 'test', status: 'available', note: 'test' },
    { mod_name: 'Test', on_date: '2025-01-01', mood: 'test', status: 'available', note: 'test' },
    { who: 'Test', on_date: '2025-01-01', mood: 'test', status: 'available', note: 'test' }
  ];
  
  for (let i = 0; i < testConfigs.length; i++) {
    const config = testConfigs[i];
    console.log(`Testing config ${i + 1}:`, config);
    
    try {
      const { error } = await sb.from('mod_notes').insert(config);
      if (!error) {
        console.log(`✅ Config ${i + 1} worked! Column names:`, Object.keys(config));
        // Clean up test data
        await sb.from('mod_notes').delete().eq('on_date', '2025-01-01');
        return Object.keys(config);
      } else {
        console.log(`❌ Config ${i + 1} failed:`, error.message);
      }
    } catch (err) {
      console.log(`❌ Config ${i + 1} threw error:`, err.message);
    }
  }
  
  console.log('❌ No configuration worked for mod_notes table');
  return null;
}

async function loadRecent(){
  const wrap = $('#modRecent'); if(!wrap) return;
  const { data=[], error } = await sb.from('mod_notes').select('*')
    .order('on_date',{ascending:false}).order('created_at',{ascending:false}).limit(12);
  if(error){ 
    console.error('Load recent notes error:', error); 
    wrap.innerHTML='<div class="opacity-60">Gagal load notes.</div>'; 
    return; 
  }
  
  wrap.innerHTML = data.map(x=>{
    // Get the mod name from different possible column names
    const modName = x.mod || x.moderator || x.mod_name || x.who || 'Unknown';
    
    return `
    <div class="p-2 rounded-lg" style="background:var(--peach)">
      <b>${esc(modName)}</b> — ${esc(x.mood||'')} — ${statusBadge(x.status)}
      <span class="opacity-70 text-xs">(${esc(x.on_date)})</span>
      ${x.note ? ' · '+esc(x.note) : ''}
    </div>
  `;
  }).join('') || '<div class="opacity-60">Belum ada notes.</div>';
}
