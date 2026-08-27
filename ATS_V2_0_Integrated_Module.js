/* ==========================================================================
   RECRUITMENT ATS V2.0 - INTEGRATED MODULE
   Baseline: Recruitment_ATS_V1_8_2_Interview_Workflow_Fix.html + V1.8.2a

   Adds without rewriting the core HTML:
   - Automated Screening workbench + screening-rule master
   - SiPsiko fixed-link + 8-character access code workflow
   - Psychotest review / PDF / Candidate Profile 360 card
   - Controlled server-side stage movement (no forward skipping)
   - Keeps existing Interview HR/User, Offering, Join, Analytics, etc.
   ========================================================================== */
(function(){
  'use strict';

  const V2={
    psychSessions:[],
    screeningRows:[],
    psychLoading:false,
    screeningLoading:false,
    psychUrlKey:'ats_v2_psychotest_url',
    defaultPsychUrl:'psikotes.html'
  };

  const esc=v=>typeof atsEsc==='function'?atsEsc(v):String(v??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
  const fmt=d=>!d?'—':(typeof formatDate==='function'?formatDate(d):new Date(d).toLocaleDateString('id-ID'));
  const appById=id=>typeof getApplication==='function'?getApplication(id):(DB?.applications||[]).find(x=>x.application_id===id);
  const candById=id=>typeof getCandidate==='function'?getCandidate(id):(DB?.candidates||[]).find(x=>x.candidate_id===id);
  const posById=id=>typeof getPosition==='function'?getPosition(id):(DB?.positions||[]).find(x=>x.position_id===id);
  const coById=id=>typeof getCompany==='function'?getCompany(id):(DB?.companies||[]).find(x=>x.company_id===id);
  const scoped=arr=>{try{return typeof scopeByCompany==='function'?scopeByCompany(arr||[]):arr||[];}catch(_){return arr||[];}};
  const safeFile=v=>String(v||'Kandidat').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'')||'Kandidat';
  const safePath=v=>String(v||'').replace(/[^a-zA-Z0-9._-]+/g,'_');

  function psychBaseUrl(){
    const saved=(localStorage.getItem(V2.psychUrlKey)||'').trim();
    const raw=saved||V2.defaultPsychUrl;
    try{return new URL(raw,window.location.href).href.split('?')[0].split('#')[0];}catch(_){return raw;}
  }
  function latestPsych(appId){return (V2.psychSessions||[]).filter(s=>s.application_id===appId).sort((a,b)=>Number(b.attempt_no||0)-Number(a.attempt_no||0))[0]||null;}
  function testLabel(code){return ({CIFT:'Tes Kognitif',PAPIKOSTIK:'PAPI Kostick',INTEGRITY:'Tes Integritas',MSDT:'MSDT',DISC:'DISC',OVERALL:'Kesimpulan'})[code]||code||'Tes';}
  function psychStatusClass(s){if(s==='Selesai')return'bg-emerald-100 text-emerald-700';if(s==='Dalam Proses')return'bg-blue-100 text-blue-700';if(s==='Belum Dimulai')return'bg-slate-100 text-slate-700';if(['Kedaluwarsa','Dibatalkan'].includes(s))return'bg-red-100 text-red-700';return'bg-slate-100 text-slate-600';}
  function decisionClass(s){if(s==='Lanjut'||s==='Lolos Otomatis')return'bg-emerald-100 text-emerald-700';if(s==='Tidak Lanjut'||s==='Tidak Lolos Otomatis')return'bg-red-100 text-red-700';return'bg-amber-100 text-amber-700';}

  async function loadPsych(silent=true){
    if(V2.psychLoading)return V2.psychSessions;V2.psychLoading=true;
    try{const {data,error}=await sb.rpc('list_psychotest_sessions');if(error)throw error;V2.psychSessions=Array.isArray(data)?data:(data?[data]:[]);return V2.psychSessions;}
    catch(e){console.error('ATS V2 psych load',e);if(!silent)showToast('Gagal memuat psikotes: '+(e.message||e),'warning');return V2.psychSessions;}
    finally{V2.psychLoading=false;}
  }
  async function loadScreening(silent=true){
    if(V2.screeningLoading)return V2.screeningRows;V2.screeningLoading=true;
    try{const {data,error}=await sb.rpc('list_screening_workbench');if(error)throw error;V2.screeningRows=Array.isArray(data)?data:(data?[data]:[]);return V2.screeningRows;}
    catch(e){console.error('ATS V2 screening load',e);if(!silent)showToast('Gagal memuat screening: '+(e.message||e),'warning');return V2.screeningRows;}
    finally{V2.screeningLoading=false;}
  }

  // -----------------------------------------------------------------------
  // UI injection
  // -----------------------------------------------------------------------
  function makeNav(beforeEl,page,icon,label,badgeId){
    if(document.querySelector(`.nav-item[data-page="${page}"]`))return;
    const a=document.createElement('a');a.href='#';a.className='nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium';a.dataset.page=page;
    a.innerHTML=`<i class="fas ${icon} w-5 text-center"></i><span class="nav-text">${label}</span>${badgeId?`<span id="${badgeId}" class="nav-text ml-auto hidden min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center"></span>`:''}`;
    a.addEventListener('click',e=>{e.preventDefault();navigate(page);});beforeEl?.insertAdjacentElement('beforebegin',a);
  }
  function injectUi(){
    const intNav=document.querySelector('.nav-item[data-page="interviews"]');
    makeNav(intNav,'psychotests','fa-brain','Psikotes','navBadgePsychV2');
    const psychNav=document.querySelector('.nav-item[data-page="psychotests"]');
    makeNav(psychNav,'screening-workbench','fa-filter','Screening','navBadgeScreenV2');
    const masterPos=document.querySelector('.nav-item[data-page="master-position"]');
    if(masterPos&&!document.querySelector('.nav-item[data-page="screening-rules"]')){
      const a=document.createElement('a');a.href='#';a.className='nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium';a.dataset.page='screening-rules';
      a.innerHTML='<i class="fas fa-sliders w-5 text-center"></i><span class="nav-text">Aturan Screening</span>';a.onclick=e=>{e.preventDefault();navigate('screening-rules');};
      masterPos.insertAdjacentElement('afterend',a);
    }

    const intPage=document.getElementById('page-interviews');
    if(intPage&&!document.getElementById('page-psychotests')){const p=document.createElement('div');p.id='page-psychotests';p.className='page';intPage.insertAdjacentElement('beforebegin',p);}
    if(intPage&&!document.getElementById('page-screening-workbench')){const p=document.createElement('div');p.id='page-screening-workbench';p.className='page';intPage.insertAdjacentElement('beforebegin',p);}
    const posPage=document.getElementById('page-master-position');
    if(posPage&&!document.getElementById('page-screening-rules')){const p=document.createElement('div');p.id='page-screening-rules';p.className='page';posPage.insertAdjacentElement('afterend',p);}
  }

  async function renderScreening(reload=true){
    injectUi();if(reload)await loadScreening(true);const root=document.getElementById('page-screening-workbench');if(!root)return;
    const review=V2.screeningRows.filter(x=>x.screening_status==='Perlu Review HR'&&!x.review_decision).length;
    const pass=V2.screeningRows.filter(x=>x.screening_status==='Lolos Otomatis'||x.review_decision==='Lanjut').length;
    const fail=V2.screeningRows.filter(x=>x.screening_status==='Tidak Lolos Otomatis'||x.review_decision==='Tidak Lanjut').length;
    const badge=document.getElementById('navBadgeScreenV2');if(badge){badge.textContent=review;badge.classList.toggle('hidden',review===0);}
    root.innerHTML=`<div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6"><div><h1 class="text-2xl font-bold">Automated Screening</h1><p class="text-sm text-slate-500">Lolos otomatis, review HR, dan knockout yang terkontrol per jabatan.</p></div><div class="flex gap-2"><button onclick="renderScreeningV2(true)" class="px-3 py-2 border rounded-lg text-sm bg-white"><i class="fas fa-rotate mr-1"></i>Refresh</button><button onclick="navigate('screening-rules')" class="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm">Atur Rule</button></div></div>
      <div class="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 text-xs text-amber-900"><b>Fail-safe:</b> requirement lama tidak otomatis menjadi knockout. Data ambigu/belum terstruktur selalu masuk Review HR.</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4"><div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Perlu Review HR</div><div class="text-2xl font-bold mt-1 text-amber-600">${review}</div></div><div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Lolos / Lanjut</div><div class="text-2xl font-bold mt-1 text-emerald-600">${pass}</div></div><div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Tidak Lolos</div><div class="text-2xl font-bold mt-1 text-red-600">${fail}</div></div></div>
      <div class="bg-white border rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr class="border-b text-left text-xs text-slate-500 uppercase"><th class="px-4 py-3">Kandidat</th><th class="px-4 py-3">Posisi</th><th class="px-4 py-3">Tahap</th><th class="px-4 py-3">Hasil</th><th class="px-4 py-3">Match</th><th class="px-4 py-3">Review HR</th><th class="px-4 py-3">Aksi</th></tr></thead><tbody>${V2.screeningRows.map(r=>`<tr class="border-b"><td class="px-4 py-3 font-medium">${esc(r.candidate_name)}<div class="text-[10px] text-slate-400 font-mono">${esc(r.application_id)}</div></td><td class="px-4 py-3">${esc(r.position_name)}</td><td class="px-4 py-3">${esc(r.current_stage)}</td><td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-[10px] font-semibold ${decisionClass(r.screening_status)}">${esc(r.screening_status||'Belum Dievaluasi')}</span></td><td class="px-4 py-3">${r.match_score==null?'—':Number(r.match_score).toFixed(1)+'%'}</td><td class="px-4 py-3">${esc(r.review_decision||'—')}</td><td class="px-4 py-3 whitespace-nowrap">${r.screening_status==='Perlu Review HR'&&!r.review_decision?`<button onclick="openScreenReviewV2('${r.application_id}')" class="text-amber-700 text-xs font-semibold mr-2">Review</button>`:''}<button onclick="rerunScreeningV2('${r.application_id}')" class="text-blue-700 text-xs mr-2">Evaluasi Ulang</button><button onclick="viewCandidateDetail('${r.candidate_id}','${r.application_id}')" class="text-slate-600 text-xs">Profile</button></td></tr>`).join('')||'<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada data screening.</td></tr>'}</tbody></table></div></div>`;
  }

  async function rerunScreening(appId){const {data,error}=await sb.rpc('ats_evaluate_application_screening',{p_application_id:appId,p_actor:'HR · Evaluasi Ulang'});if(error)return showToast('Evaluasi gagal: '+error.message,'danger');await Promise.all([loadScreening(true),loadFromSupabase()]);renderAll();renderScreening(false);showToast('Screening dievaluasi: '+(data?.screening_status||''),'success');}
  async function openScreenReview(appId){
    let s;try{const {data,error}=await sb.rpc('get_screening_summary_for_application',{p_application_id:appId});if(error)throw error;s=data;}catch(e){return showToast('Gagal membaca screening: '+e.message,'danger');}
    const d=s?.screening?.detail_json||[];openModal(`<div class="p-6"><h3 class="font-bold text-lg">Review Screening HR</h3><p class="text-xs text-slate-500 mt-1">Rule otomatis tidak menemukan knockout yang jelas. HR menetapkan keputusan.</p><div class="mt-4 max-h-64 overflow-y-auto space-y-2">${d.map(x=>`<div class="border rounded-lg p-3 text-xs"><div class="font-semibold">${esc(x.text||x.requirement_id)}</div><div class="text-slate-500 mt-1">${esc(x.rule||'')} · ${esc(x.result||'')} ${x.actual!=null?'· Aktual: '+esc(x.actual):''}</div></div>`).join('')||'<div class="text-xs text-slate-400">Tidak ada detail rule.</div>'}</div><label class="block text-xs text-slate-500 mt-4">Catatan HR</label><textarea id="screenReviewNotesV2" rows="3" class="w-full border rounded-lg p-2 text-sm mt-1"></textarea><div class="grid grid-cols-2 gap-2 mt-4"><button onclick="saveScreenReviewV2('${appId}','Lanjut')" class="px-3 py-2 bg-emerald-600 text-white rounded-lg">Lanjut ke Psikotes</button><button onclick="saveScreenReviewV2('${appId}','Tidak Lanjut')" class="px-3 py-2 bg-red-600 text-white rounded-lg">Tidak Lanjut</button></div><div class="text-right mt-3"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Batal</button></div></div>`);
  }
  async function saveScreenReview(appId,decision){const notes=document.getElementById('screenReviewNotesV2')?.value?.trim()||null;const {error}=await sb.rpc('review_application_screening',{p_application_id:appId,p_decision:decision,p_notes:notes});if(error)return showToast('Gagal simpan review: '+error.message,'danger');closeModal();await Promise.all([loadScreening(true),loadFromSupabase()]);renderAll();renderScreening(false);showToast('Keputusan screening: '+decision,'success');}

  function configOptions(list,val){return list.map(([v,l])=>`<option value="${esc(v)}" ${v===val?'selected':''}>${esc(l)}</option>`).join('');}
  function renderScreeningRules(){
    injectUi();const root=document.getElementById('page-screening-rules');if(!root)return;const positions=scoped(DB?.positions||[]).filter(p=>(p.status||'Aktif')!=='Tidak Aktif');
    const selected=document.getElementById('v2RulePosition')?.value||positions[0]?.position_id||'';const reqs=(DB?.position_requirements||[]).filter(r=>r.position_id===selected).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    root.innerHTML=`<div class="flex justify-between items-start gap-4 mb-6"><div><h1 class="text-2xl font-bold">Aturan Screening Otomatis</h1><p class="text-sm text-slate-500">Tetapkan mana yang Knockout, Wajib Review, atau Preferensi. Auto-reject hanya untuk Knockout terstruktur.</p></div></div><div class="bg-white border rounded-xl p-4 mb-4"><label class="text-xs text-slate-500">Jabatan</label><select id="v2RulePosition" onchange="renderScreeningRulesV2()" class="w-full md:w-96 border rounded-lg px-3 py-2 mt-1">${positions.map(p=>`<option value="${esc(p.position_id)}" ${p.position_id===selected?'selected':''}>${esc(p.position_name)} · ${esc(coById(p.company_id)?.brand||'')}</option>`).join('')}</select></div><div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-xs leading-5"><b>KNOCKOUT:</b> hanya untuk field terstruktur yang diizinkan (pendidikan, jurusan, pengalaman, bersedia shift, notice period). Usia, domisili, gaji, perusahaan/jabatan terakhir tidak boleh menjadi auto-reject. <b>WAJIB_REVIEW:</b> gagal/ambigu masuk HR. <b>PREFERENSI:</b> hanya memengaruhi match score.</div><div class="bg-white border rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-slate-500 uppercase border-b"><th class="p-3">Requirement</th><th class="p-3">Klasifikasi</th><th class="p-3">Auto</th><th class="p-3">Field Kandidat</th><th class="p-3">Operator</th><th class="p-3">Nilai Target (JSON/Text)</th></tr></thead><tbody>${reqs.map(r=>`<tr class="border-b v2-rule-row" data-id="${esc(r.requirement_id)}"><td class="p-3"><div class="font-medium">${esc(r.requirement_text||'-')}</div><div class="text-[10px] text-slate-400">${esc(r.requirement_type||'')}</div></td><td class="p-3"><select class="v2-rule-class border rounded p-1.5 text-xs">${configOptions([['KNOCKOUT','KNOCKOUT'],['WAJIB_REVIEW','WAJIB_REVIEW'],['PREFERENSI','PREFERENSI']],r.screening_rule||'WAJIB_REVIEW')}</select></td><td class="p-3"><input type="checkbox" class="v2-rule-auto" ${r.auto_screenable?'checked':''}></td><td class="p-3"><select class="v2-rule-field border rounded p-1.5 text-xs">${configOptions([['','— Pilih —'],['age','Usia'],['education','Pendidikan'],['major','Jurusan'],['experience','Pengalaman (tahun)'],['expected_salary','Expected Salary'],['willing_shift','Bersedia Shift'],['city','Domisili/Kota'],['notice_period','Ketersediaan/Notice'],['last_role','Jabatan Terakhir'],['last_company','Perusahaan Terakhir']],r.source_field||'')}</select></td><td class="p-3"><select class="v2-rule-op border rounded p-1.5 text-xs">${configOptions([['','—'],['EQ','='],['NEQ','≠'],['IN','Dalam daftar'],['NOT_IN','Bukan dalam daftar'],['GTE','≥'],['LTE','≤'],['GT','>'],['LT','<'],['CONTAINS','Mengandung'],['NOT_CONTAINS','Tidak mengandung'],['EDUCATION_MIN','Pendidikan minimal']],r.operator||'')}</select></td><td class="p-3"><input class="v2-rule-expect border rounded p-1.5 text-xs min-w-48" value="${esc(r.expected_value==null?'':(typeof r.expected_value==='string'?r.expected_value:JSON.stringify(r.expected_value)))}" placeholder='Contoh: 1 atau ["Ya","Bersedia"]'></td></tr>`).join('')||'<tr><td colspan="6" class="p-8 text-center text-slate-400">Jabatan ini belum memiliki position_requirements.</td></tr>'}</tbody></table></div></div><div class="mt-4 flex justify-end"><button onclick="saveScreeningRulesV2()" class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Simpan Aturan</button></div>`;
  }
  async function saveScreeningRules(){
    const rows=[...document.querySelectorAll('.v2-rule-row')];
    const knockoutAllowed=new Set(['education','major','experience','willing_shift','notice_period']);
    for(const r of rows){
      let expected=null;const raw=r.querySelector('.v2-rule-expect').value.trim();if(raw){try{expected=JSON.parse(raw);}catch(_){expected=raw;}}
      const rule=r.querySelector('.v2-rule-class').value,field=r.querySelector('.v2-rule-field').value||null,auto=r.querySelector('.v2-rule-auto').checked;
      if(rule==='KNOCKOUT'&&auto&&!knockoutAllowed.has(field)){return showToast('KNOCKOUT tidak boleh memakai field ini sebagai auto-reject. Gunakan Wajib Review / Preferensi.','danger');}
      const payload={p_requirement_id:r.dataset.id,p_screening_rule:rule,p_auto_screenable:auto,p_source_field:field,p_operator:r.querySelector('.v2-rule-op').value||null,p_expected_value:expected,p_screening_weight:null,p_screening_active:null,p_review_margin:null};
      const {error}=await sb.rpc('save_position_screening_rule',payload);if(error)return showToast('Gagal simpan '+r.dataset.id+': '+error.message,'danger');
    }
    await loadFromSupabase();renderScreeningRules();showToast('Aturan screening tersimpan. Kandidat baru akan mengikuti rule ini.','success');
  }

  // -----------------------------------------------------------------------
  // Psychotest
  // -----------------------------------------------------------------------
  async function renderPsych(reload=true){
    injectUi();if(reload)await loadPsych(true);const root=document.getElementById('page-psychotests');if(!root)return;const apps=scoped(DB?.applications||[]).filter(a=>a.current_stage==='Psikotes'||latestPsych(a.application_id));const review=V2.psychSessions.filter(s=>s.status==='Selesai'&&s.workflow_decision==='Perlu Review HR').length;const badge=document.getElementById('navBadgePsychV2');if(badge){badge.textContent=review;badge.classList.toggle('hidden',review===0);}
    root.innerHTML=`<div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6"><div><h1 class="text-2xl font-bold">Psikotes</h1><p class="text-sm text-slate-500">Generate kode 8 karakter, pantau pengerjaan SiPsiko, review hasil, dan dokumen.</p></div><div class="flex flex-wrap gap-2"><button onclick="openPsychUrlSettingV2()" class="px-3 py-2 border rounded-lg text-sm bg-white"><i class="fas fa-link mr-1"></i>URL SiPsiko</button><button onclick="renderPsychV2(true)" class="px-3 py-2 border rounded-lg text-sm bg-white"><i class="fas fa-rotate mr-1"></i>Refresh</button></div></div><div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-xs leading-5"><b>Link kandidat tetap:</b> ${esc(psychBaseUrl())}<br>Kandidat cukup memasukkan <b>kode akses 8 karakter</b>. Hasil engine tidak memindahkan tahap otomatis; keputusan tetap HR.</div><div class="bg-white border rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr class="border-b text-left text-xs text-slate-500 uppercase"><th class="px-4 py-3">Kandidat</th><th class="px-4 py-3">Posisi</th><th class="px-4 py-3">Tes</th><th class="px-4 py-3">Kode</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Engine</th><th class="px-4 py-3">Keputusan HR</th><th class="px-4 py-3">Aksi</th></tr></thead><tbody>${apps.map(a=>{const c=candById(a.candidate_id),p=posById(a.position_id),s=latestPsych(a.application_id),tests=(s?.test_package_snapshot||[]).map(x=>x.test_code).filter(Boolean);let acts='';if(!s)acts+=`<button onclick="createPsychAccessV2('${a.application_id}')" class="text-blue-700 text-xs font-semibold mr-2">Buat Kode</button>`;else{if(['Belum Dimulai','Dalam Proses'].includes(s.status))acts+=`<button onclick="showPsychAccessV2('${a.application_id}')" class="text-blue-700 text-xs mr-2">Akses</button>`;if(s.status==='Belum Dimulai')acts+=`<button onclick="rotatePsychAccessV2('${a.application_id}')" class="text-amber-700 text-xs mr-2">Ganti Kode</button>`;if(s.status==='Selesai'){acts+=`<button onclick="viewPsychResultV2('${a.application_id}')" class="text-blue-700 text-xs mr-2">Hasil</button><button onclick="openPsychReviewV2('${a.application_id}')" class="text-amber-700 text-xs mr-2">Review</button><button onclick="downloadPsychPdfV2('${a.application_id}')" class="text-emerald-700 text-xs mr-2">PDF</button>`;if(s.workflow_decision==='Lanjut'&&a.current_stage==='Psikotes')acts+=`<button onclick="advanceToInterviewHrV2('${a.application_id}')" class="text-indigo-700 text-xs font-semibold mr-2">Lanjut Interview HR</button>`;if(a.current_stage==='Psikotes')acts+=`<button onclick="createPsychRetestV2('${a.application_id}')" class="text-slate-600 text-xs mr-2">Retest</button>`;}}acts+=`<button onclick="viewCandidateDetail('${a.candidate_id}','${a.application_id}')" class="text-slate-600 text-xs">Profile</button>`;return`<tr class="border-b"><td class="px-4 py-3 font-medium">${esc(c?.candidate_name||'-')}<div class="text-[10px] font-mono text-slate-400">${esc(a.application_id)}</div></td><td class="px-4 py-3">${esc(p?.position_name||'-')}</td><td class="px-4 py-3 text-xs">${tests.length?tests.map(testLabel).map(esc).join(' · '):'Belum dibuat'}</td><td class="px-4 py-3 font-mono font-semibold">${esc(s?.access_code||'—')}</td><td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-[10px] font-semibold ${psychStatusClass(s?.status)}">${esc(s?.status||'Belum Dibuat')}</span></td><td class="px-4 py-3 text-xs">${esc(s?.engine_recommendation||'—')}</td><td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-[10px] font-semibold ${decisionClass(s?.workflow_decision)}">${esc(s?.workflow_decision||'—')}</span></td><td class="px-4 py-3 whitespace-nowrap">${acts}</td></tr>`;}).join('')||'<tr><td colspan="8" class="p-8 text-center text-slate-400">Belum ada kandidat di tahap Psikotes.</td></tr>'}</tbody></table></div></div>`;
  }
  function openPsychUrlSetting(){openModal(`<div class="p-6"><h3 class="font-bold text-lg">URL SiPsiko Kandidat</h3><p class="text-xs text-slate-500 mt-1">Gunakan URL Netlify/hosting psikotes yang tetap. Kandidat tidak menerima URL bertoken.</p><input id="v2PsychUrlInput" class="w-full border rounded-lg px-3 py-2 mt-4 text-sm" value="${esc(psychBaseUrl())}" placeholder="https://.../psikotes.html"><div class="flex justify-end gap-2 mt-4"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Batal</button><button onclick="savePsychUrlV2()" class="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm">Simpan</button></div></div>`);}
  function savePsychUrl(){const v=document.getElementById('v2PsychUrlInput')?.value?.trim();if(!v)return showToast('URL wajib diisi','warning');localStorage.setItem(V2.psychUrlKey,v);closeModal();renderPsych(false);showToast('URL SiPsiko disimpan di browser HR ini.','success');}
  async function createPsychAccess(appId){const {data,error}=await sb.rpc('create_psychotest_access',{p_application_id:appId,p_expiry_days:7});if(error)return showToast('Gagal buat kode: '+error.message,'danger');await loadPsych(true);showAccessModal(appId,data);if(currentPage==='psychotests')renderPsych(false);}
  async function rotatePsychAccess(appId){const {data,error}=await sb.rpc('rotate_psychotest_access',{p_application_id:appId,p_expiry_days:7});if(error)return showToast('Gagal ganti kode: '+error.message,'danger');await loadPsych(true);showAccessModal(appId,data);if(currentPage==='psychotests')renderPsych(false);}
  async function createPsychRetest(appId){if(!confirm('Buat attempt psikotes baru? Hasil attempt sebelumnya tetap disimpan.'))return;const {data,error}=await sb.rpc('create_psychotest_retest',{p_application_id:appId,p_expiry_days:7});if(error)return showToast('Gagal buat retest: '+error.message,'danger');await loadPsych(true);showAccessModal(appId,data);if(currentPage==='psychotests')renderPsych(false);}
  function showPsychAccess(appId){const s=latestPsych(appId);if(!s)return showToast('Sesi belum tersedia','warning');showAccessModal(appId,s);}
  function psychInviteMessageV22(appId,row){
    const app=appById(appId),c=candById(app?.candidate_id),p=posById(app?.position_id),co=coById(app?.company_id);
    const code=row?.access_code||latestPsych(appId)?.access_code||'';
    const url=psychBaseUrl();
    const expiry=fmt(row?.expires_at||latestPsych(appId)?.expires_at);
    const recruiter=(typeof currentAuthUser!=='undefined'&&currentAuthUser?.email)||(typeof currentProfile!=='undefined'&&currentProfile?.full_name)||(typeof getUser==='function'&&getUser('U04')?.name)||'HR';
    let tpl=null;
    try{tpl=typeof getWaTemplates==='function'?(getWaTemplates()||[]).find(t=>t.id==='psikotes'):null;}catch(_){}
    const map={
      nama:c?.candidate_name||'Kandidat',
      posisi:p?.position_name||'-',
      brand:co?.brand||co?.company_name||'-',
      rekruter:recruiter,
      tanggal:expiry,
      kode:`${code}\n🔗 Link: ${url}`,
      lokasi:url
    };
    if(tpl?.body){try{return typeof fillWaTemplate==='function'?fillWaTemplate(tpl.body,map):Object.entries(map).reduce((t,[k,v])=>t.replace(new RegExp('\\{'+k+'\\}','g'),v||'-'),tpl.body);}catch(_){} }
    return `Halo ${map.nama},\n\nTerima kasih telah melamar posisi *${map.posisi}* di *${map.brand}*.\n\nAnda diundang mengikuti *Psikotes*.\n📅 Batas pengerjaan: ${expiry}\n🔑 Kode Akses: ${code}\n🔗 Link: ${url}\n\nHormat kami,\n${recruiter}\nTim Rekrutmen ${map.brand}`;
  }
  function showAccessModal(appId,row){const app=appById(appId),c=candById(app?.candidate_id),code=row?.access_code||latestPsych(appId)?.access_code||'';const url=psychBaseUrl();const expiry=fmt(row?.expires_at||latestPsych(appId)?.expires_at);const msg=psychInviteMessageV22(appId,row);openModal(`<div class="p-6"><h3 class="font-bold text-lg">Akses Psikotes Kandidat</h3><p class="text-xs text-slate-500 mt-1">Pesan di bawah memakai <b>Pengaturan Proses → Template WhatsApp → Undangan Psikotes</b>. Perubahan template akan langsung dipakai pada undangan berikutnya.</p><div class="mt-4 bg-slate-50 border rounded-xl p-4"><div class="text-xs text-slate-500">Link SiPsiko</div><div class="font-mono text-sm break-all mt-1">${esc(url)}</div><div class="text-xs text-slate-500 mt-4">Kode Akses</div><div class="font-mono text-3xl font-bold tracking-[.25em] mt-1">${esc(code)}</div><div class="text-xs text-slate-400 mt-2">Berlaku s.d. ${esc(expiry)}</div></div><label class="block text-xs font-semibold text-slate-600 mt-4 mb-1">Preview Template WhatsApp</label><textarea id="v2PsychWaText" class="w-full border rounded-lg p-3 text-xs" rows="10">${esc(msg)}</textarea><div class="grid grid-cols-2 gap-2 mt-4"><button onclick="copyTextV2('${esc(url)}','Link disalin')" class="px-3 py-2 border rounded-lg text-sm">Salin Link</button><button onclick="copyTextV2('${esc(code)}','Kode disalin')" class="px-3 py-2 border rounded-lg text-sm">Salin Kode</button><button onclick="copyPsychMessageV2()" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm">Salin Pesan</button><button onclick="openPsychWhatsAppV2('${appId}')" class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm"><i class="fab fa-whatsapp mr-1"></i>WhatsApp</button></div><div class="text-right mt-3"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Tutup</button></div></div>`);}
  async function copyText(v,msg){try{await navigator.clipboard.writeText(v);showToast(msg||'Disalin','success');}catch(_){showToast('Clipboard tidak tersedia','warning');}}
  async function copyPsychMessage(){return copyText(document.getElementById('v2PsychWaText')?.value||'','Pesan disalin');}
  function openPsychWhatsApp(appId){const app=appById(appId),c=candById(app?.candidate_id);let phone=String(c?.phone||'').replace(/[^0-9]/g,'');if(phone.startsWith('0'))phone='62'+phone.slice(1);const msg=document.getElementById('v2PsychWaText')?.value||'';window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank','noopener');}

  async function psychSummary(appId){const {data,error}=await sb.rpc('get_psychotest_summary_for_application',{p_application_id:appId});if(error)throw error;return data;}
  function resultValue(r){const j=r?.result_json||{};if(r?.test_code==='CIFT')return r.score==null?'—':`${Number(r.score).toFixed(0)}/30`;if(r?.test_code==='PAPIKOSTIK')return r.score==null?'—':`Avg ${Number(r.score).toFixed(2)}`;if(r?.test_code==='MSDT')return j.type||'—';if(r?.test_code==='DISC'){const sc=j.scores||{};const d=Object.entries(sc).sort((a,b)=>Number(b[1])-Number(a[1]))[0];return d?`Dominan ${d[0]} (${d[1]})`:'—';}if(r?.test_code==='INTEGRITY')return`A ${j.total_a??'—'} · B ${j.total_b??'—'} · C ${j.total_c??'—'}`;return r?.recommendation||'—';}
  async function viewPsychResult(appId){try{const s=await psychSummary(appId);if(!s?.exists)return showToast('Belum ada hasil','warning');const sess=s.session||{};openModal(`<div class="p-6"><div class="flex justify-between gap-3"><div><h3 class="font-bold text-lg">Hasil Psikotes</h3><p class="text-xs text-slate-500">Attempt ${esc(sess.attempt_no||1)} · ${esc(fmt(sess.completed_at))}</p></div><span class="px-2 py-1 rounded-full text-xs ${decisionClass(sess.workflow_decision)}">${esc(sess.workflow_decision)}</span></div><div class="space-y-2 mt-4">${(s.results||[]).filter(r=>r.test_code!=='OVERALL').map(r=>`<div class="border rounded-lg p-3"><div class="flex justify-between gap-3"><b class="text-sm">${esc(testLabel(r.test_code))}</b><span class="text-sm font-semibold">${esc(resultValue(r))}</span></div>${r.interpretation?`<p class="text-xs text-slate-500 mt-2">${esc(r.interpretation)}</p>`:''}</div>`).join('')}</div><div class="bg-slate-50 rounded-lg p-3 mt-3 text-xs"><b>Rekomendasi Engine:</b> ${esc(sess.engine_recommendation||'—')}</div><div class="text-right mt-4"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg">Tutup</button></div></div>`);}catch(e){showToast('Gagal membaca hasil: '+e.message,'danger');}}
  async function openPsychReview(appId){let s;try{s=await psychSummary(appId);}catch(e){return showToast('Gagal membaca hasil: '+e.message,'danger');}if(!s?.exists||s.session?.status!=='Selesai')return showToast('Psikotes belum selesai','warning');openModal(`<div class="p-6"><h3 class="font-bold text-lg">Review Hasil Psikotes</h3><p class="text-sm text-slate-500 mt-1">Rekomendasi engine: <b>${esc(s.session.engine_recommendation||'—')}</b>. Keputusan recruitment tetap HR.</p><textarea id="v2PsychNotes" rows="4" class="w-full border rounded-lg p-2 mt-4 text-sm" placeholder="Catatan pertimbangan HR">${esc(s.session.hr_notes||'')}</textarea><div class="grid grid-cols-3 gap-2 mt-4"><button onclick="savePsychReviewV2('${appId}','Lanjut')" class="px-2 py-2 bg-emerald-600 text-white rounded-lg text-sm">Lanjut</button><button onclick="savePsychReviewV2('${appId}','Perlu Review HR')" class="px-2 py-2 bg-amber-500 text-white rounded-lg text-sm">Review</button><button onclick="savePsychReviewV2('${appId}','Tidak Lanjut')" class="px-2 py-2 bg-red-600 text-white rounded-lg text-sm">Tidak Lanjut</button></div><div class="text-right mt-3"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Batal</button></div></div>`);}
  async function savePsychReview(appId,decision){const notes=document.getElementById('v2PsychNotes')?.value?.trim()||null;const {error}=await sb.rpc('review_psychotest_result',{p_application_id:appId,p_decision:decision,p_hr_notes:notes});if(error)return showToast('Gagal simpan review: '+error.message,'danger');closeModal();await loadPsych(true);if(currentPage==='psychotests')renderPsych(false);injectPsychCard(appId);showToast('Keputusan psikotes: '+decision,'success');}
  async function advanceToInterviewHr(appId){await transitionStage(appId,'Interview HR');}

  function buildPsychPdf(summary,appId){if(!window.jspdf?.jsPDF)return null;const app=appById(appId),c=candById(app?.candidate_id),p=posById(app?.position_id),co=coById(app?.company_id),sess=summary.session||{};const {jsPDF}=window.jspdf,doc=new jsPDF();let y=16;const line=(t,s=9,b=false)=>{doc.setFontSize(s);doc.setFont('helvetica',b?'bold':'normal');for(const z of doc.splitTextToSize(String(t??'—'),180)){if(y>282){doc.addPage();y=16;}doc.text(z,15,y);y+=5;}y+=1;};line('LAPORAN HASIL PSIKOTES',15,true);line(`${c?.candidate_name||'-'} · ${p?.position_name||'-'} · ${co?.brand||co?.company_name||'-'}`,10,true);line(`Application: ${appId} · Attempt: ${sess.attempt_no||1} · Selesai: ${fmt(sess.completed_at)}`);line(`Rekomendasi SiPsiko: ${sess.engine_recommendation||'—'} · Keputusan HR: ${sess.workflow_decision||'—'}`);line('HASIL PER TES',11,true);(summary.results||[]).filter(r=>r.test_code!=='OVERALL').forEach(r=>{line(`${testLabel(r.test_code)}: ${resultValue(r)}`,9,true);if(r.interpretation)line(r.interpretation,8);});const overall=(summary.results||[]).find(r=>r.test_code==='OVERALL');if(overall?.interpretation){line('INTERPRETASI KESELURUHAN',11,true);line(overall.interpretation);}if(sess.hr_notes){line('CATATAN HR',11,true);line(sess.hr_notes);}line('Keputusan workflow recruitment ditetapkan HR dan dipisahkan dari rekomendasi engine SiPsiko.',8);return doc;}
  async function downloadPsychPdf(appId){try{const s=await psychSummary(appId);const doc=buildPsychPdf(s,appId);if(!doc)return showToast('jsPDF belum termuat','danger');doc.save(`Hasil_Psikotes_${safeFile(candById(appById(appId)?.candidate_id)?.candidate_name)}.pdf`);}catch(e){showToast('Gagal membuat PDF: '+e.message,'danger');}}
  async function savePsychPdf(appId){try{const s=await psychSummary(appId),app=appById(appId),c=candById(app?.candidate_id),sess=s.session||{},doc=buildPsychPdf(s,appId);if(!doc)throw new Error('jsPDF belum termuat');const stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=`hasil-psikotes-${safeFile(c?.candidate_name)}-${stamp}.pdf`,path=`${safePath(app.company_id)}/${safePath(appId)}/${safePath(sess.session_id)}/${name}`,blob=doc.output('blob');const {error:e1}=await sb.storage.from('psychotest-results').upload(path,blob,{contentType:'application/pdf',upsert:false});if(e1)throw e1;const {error:e2}=await sb.rpc('register_psychotest_document',{p_session_id:sess.session_id,p_storage_path:path,p_file_name:name,p_mime_type:'application/pdf'});if(e2)throw e2;injectPsychCard(appId);showToast('PDF tersimpan di Storage','success');}catch(e){showToast('Gagal simpan PDF: '+e.message,'danger');}}
  async function openPsychDoc(path){try{const {data,error}=await sb.storage.from('psychotest-results').createSignedUrl(path,120);if(error)throw error;window.open(data.signedUrl,'_blank','noopener');}catch(e){showToast('Gagal buka dokumen: '+e.message,'danger');}}

  // -----------------------------------------------------------------------
  // Candidate Profile 360 injections
  // -----------------------------------------------------------------------
  async function injectScreenCard(appId){const root=document.getElementById('candidateDetailContent');if(!root)return;root.querySelector('#v2ScreenCard')?.remove();const h=document.createElement('div');h.id='v2ScreenCard';h.className='mt-4';root.appendChild(h);try{const {data,error}=await sb.rpc('get_screening_summary_for_application',{p_application_id:appId});if(error)throw error;if(!data?.exists){h.innerHTML='<div class="bg-white border rounded-xl p-4"><h3 class="font-semibold"><i class="fas fa-filter mr-2 text-primary-600"></i>Screening</h3><p class="text-xs text-slate-400 mt-1">Belum ada evaluasi screening.</p></div>';return;}const s=data.screening||{},detail=s.detail_json||[];h.innerHTML=`<div class="bg-white border rounded-xl p-4"><div class="flex justify-between gap-3"><div><h3 class="font-semibold"><i class="fas fa-filter mr-2 text-primary-600"></i>Screening · Candidate Profile 360°</h3><p class="text-xs text-slate-500 mt-1">${esc(s.evaluation_mode||'')} · ${esc(fmt(s.screened_at))}</p></div><span class="px-2 py-1 h-fit rounded-full text-[10px] font-semibold ${decisionClass(s.screening_status)}">${esc(s.review_decision||s.screening_status||'—')}</span></div><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3"><div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Hasil Sistem</div><b>${esc(s.screening_status||'—')}</b></div><div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Match Preference</div><b>${s.match_score==null?'—':Number(s.match_score).toFixed(1)+'%'}</b></div><div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Keputusan HR</div><b>${esc(s.review_decision||'—')}</b></div></div><div class="mt-3 text-xs text-slate-500">${detail.slice(0,6).map(x=>`<div class="py-1 border-b last:border-0"><b>${esc(x.text||x.requirement_id)}</b> · ${esc(x.result||'')}</div>`).join('')}</div></div>`;}catch(e){h.innerHTML=`<div class="bg-amber-50 border rounded-xl p-4 text-xs">Screening belum dapat dimuat: ${esc(e.message)}</div>`;}}
  async function injectPsychCard(appId){const root=document.getElementById('candidateDetailContent');if(!root)return;root.querySelector('#v2PsychCard')?.remove();const h=document.createElement('div');h.id='v2PsychCard';h.className='mt-4';root.appendChild(h);try{const s=await psychSummary(appId),app=appById(appId);if(!s?.exists){h.innerHTML=`<div class="bg-white border rounded-xl p-4 flex justify-between gap-3"><div><h3 class="font-semibold"><i class="fas fa-brain mr-2 text-primary-600"></i>Psikotes</h3><p class="text-xs text-slate-400 mt-1">Belum ada sesi psikotes.</p></div>${app?.current_stage==='Psikotes'?`<button onclick="createPsychAccessV2('${appId}')" class="px-3 py-2 bg-primary-600 text-white rounded-lg text-xs">Buat Kode</button>`:''}</div>`;return;}const sess=s.session||{},rows=(s.results||[]).filter(r=>r.test_code!=='OVERALL'),docs=s.documents||[];h.innerHTML=`<div class="bg-white border rounded-xl p-4"><div class="flex justify-between gap-3"><div><h3 class="font-semibold"><i class="fas fa-brain mr-2 text-primary-600"></i>Psikotes · Candidate Profile 360°</h3><p class="text-xs text-slate-500 mt-1">Attempt ${esc(sess.attempt_no||1)} · ${esc(fmt(sess.completed_at))}</p></div><div class="flex gap-2"><span class="px-2 py-1 h-fit rounded-full text-[10px] font-semibold ${psychStatusClass(sess.status)}">${esc(sess.status)}</span><span class="px-2 py-1 h-fit rounded-full text-[10px] font-semibold ${decisionClass(sess.workflow_decision)}">${esc(sess.workflow_decision)}</span></div></div><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">${rows.map(r=>`<div class="border rounded-lg p-3"><div class="text-[10px] uppercase text-slate-400">${esc(testLabel(r.test_code))}</div><b class="text-sm">${esc(resultValue(r))}</b></div>`).join('')}</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3"><div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Rekomendasi Engine</div><b>${esc(sess.engine_recommendation||'—')}</b></div><div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Catatan HR</div><b>${esc(sess.hr_notes||'—')}</b></div></div>${docs.length?`<div class="mt-3 text-xs"><b>Dokumen:</b> ${docs.map(d=>`<button onclick="openPsychDocV2('${esc(d.storage_path)}')" class="ml-2 text-primary-700 underline">${esc(d.file_name||'Hasil Psikotes.pdf')}</button>`).join('')}</div>`:''}<div class="flex flex-wrap gap-2 mt-4"><button onclick="viewPsychResultV2('${appId}')" class="px-3 py-2 border rounded-lg text-xs">Detail</button><button onclick="openPsychReviewV2('${appId}')" class="px-3 py-2 border rounded-lg text-xs">Review HR</button><button onclick="downloadPsychPdfV2('${appId}')" class="px-3 py-2 border rounded-lg text-xs">Download PDF</button><button onclick="savePsychPdfV2('${appId}')" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs">Simpan PDF</button>${sess.workflow_decision==='Lanjut'&&app?.current_stage==='Psikotes'?`<button onclick="advanceToInterviewHrV2('${appId}')" class="px-3 py-2 bg-primary-600 text-white rounded-lg text-xs">Lanjut Interview HR</button>`:''}</div></div>`;}catch(e){h.innerHTML=`<div class="bg-amber-50 border rounded-xl p-4 text-xs">Psikotes belum dapat dimuat: ${esc(e.message)}</div>`;}}

  // -----------------------------------------------------------------------
  // Strict workflow hooks: stage movement, offering creation, and hire.
  // -----------------------------------------------------------------------
  const originalMove=typeof window.moveCandidateStage==='function'?window.moveCandidateStage:null;
  const originalSaveOffering=typeof window.saveNewOffering==='function'?window.saveNewOffering:null;

  async function confirmHireV2(appId,offeringId=null,joinDate=null){
    try{
      const {data,error}=await sb.rpc('ats_confirm_candidate_hire',{
        p_application_id:appId,
        p_offering_id:offeringId||null,
        p_join_date:joinDate||null
      });
      if(error)throw error;
      await loadFromSupabase();
      renderAll();
      showToast(data?.already_hired?'Kandidat sudah berstatus Diterima':'Offering diterima. Kandidat berstatus Diterima dan menunggu konfirmasi join.','success');
      return data;
    }catch(e){
      showToast('Kandidat belum dapat ditetapkan Diterima: '+(e.message||e),'danger');
      try{await loadFromSupabase();renderAll();}catch(_){}
      return null;
    }
  }

  async function transitionStage(appId,target,reason=null){
    if(target==='Diterima')return confirmHireV2(appId,null,null);
    try{
      const {data,error}=await sb.rpc('ats_transition_application',{p_application_id:appId,p_target_stage:target,p_reason:reason});
      if(error)throw error;
      await loadFromSupabase();renderAll();
      if(currentPage==='psychotests')renderPsych(false);
      if(currentPage==='screening-workbench')renderScreening(false);
      showToast(`Tahap kandidat: ${data?.current_stage||target}`,'success');
      return data;
    }catch(e){
      showToast('Perpindahan tahap ditolak: '+(e.message||e),'danger');
      try{await loadFromSupabase();renderAll();}catch(_){}
      return null;
    }
  }

  if(originalMove){
    window.moveCandidateStage=function(appId,newStage,rejectReason=null,options={}){
      return transitionStage(appId,newStage,rejectReason);
    };
  }

  // Existing V1.8.2 Offering modal may still list Interview User candidates.
  // Before the old save function inserts an offering, move the application through
  // the controlled RPC so Interview User completion is validated server-side.
  if(originalSaveOffering){
    window.saveNewOffering=async function(){
      const appId=document.getElementById('offCand')?.value;
      const app=appById(appId);
      if(!app)return showToast('Kandidat tidak valid','danger');
      if(['Interview User','Interview Final','Medical Check Up'].includes(app.current_stage)){
        const moved=await transitionStage(appId,'Offering');
        if(!moved)return;
      }
      return originalSaveOffering();
    };
  }

  // Quick Hire can no longer bypass offering acceptance.
  window.hireCandidate=function(appId,joinDate){return confirmHireV2(appId,null,joinDate||null);};
  window.acceptOffer=function(oid){
    const off=(DB?.offerings||[]).find(x=>x.offering_id===oid);
    if(!off)return showToast('Offering tidak ditemukan','danger');
    return confirmHireV2(off.application_id,oid,off.expected_join_date||null);
  };

  // Hook rendering + Candidate 360.
  injectUi();
  if(typeof window.renderPage==='function'){const orig=window.renderPage;window.renderPage=function(page){if(page==='screening-workbench')return renderScreening(true);if(page==='screening-rules')return renderScreeningRules();if(page==='psychotests')return renderPsych(true);return orig(page);};}
  if(typeof window.viewCandidateDetail==='function'){const orig=window.viewCandidateDetail;window.viewCandidateDetail=function(candidateId,appId){const r=orig(candidateId,appId);const id=appId||(DB?.applications||[]).find(a=>a.candidate_id===candidateId)?.application_id;if(id)setTimeout(()=>{injectScreenCard(id);injectPsychCard(id);},0);return r;};}

  // Expose dynamic actions.
  Object.assign(window,{
    renderScreeningV2:renderScreening,rerunScreeningV2:rerunScreening,openScreenReviewV2:openScreenReview,saveScreenReviewV2:saveScreenReview,
    renderScreeningRulesV2:renderScreeningRules,saveScreeningRulesV2:saveScreeningRules,
    renderPsychV2:renderPsych,openPsychUrlSettingV2:openPsychUrlSetting,savePsychUrlV2:savePsychUrl,createPsychAccessV2:createPsychAccess,rotatePsychAccessV2:rotatePsychAccess,createPsychRetestV2:createPsychRetest,showPsychAccessV2:showPsychAccess,
    copyTextV2:copyText,copyPsychMessageV2:copyPsychMessage,openPsychWhatsAppV2:openPsychWhatsApp,viewPsychResultV2:viewPsychResult,openPsychReviewV2:openPsychReview,savePsychReviewV2:savePsychReview,advanceToInterviewHrV2:advanceToInterviewHr,downloadPsychPdfV2:downloadPsychPdf,savePsychPdfV2:savePsychPdf,openPsychDocV2:openPsychDoc,
    injectScreenCardV2:injectScreenCard,injectPsychCardV2:injectPsychCard,transitionStageV2:transitionStage,confirmHireV2:confirmHireV2
  });

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>Promise.all([loadPsych(true),loadScreening(true)]).then(()=>{if(typeof renderAll==='function')renderAll();}),1200));
  console.log('%cRecruitment ATS V2.0 Integrated Module loaded','color:#2563eb;font-weight:bold');
})();

/* ========================================================================== 
   RECRUITMENT ATS V2.1 - UX SIMPLIFICATION EXTENSION
   Drop-in extension for V2.0 module. No database migration required.

   UX principles:
   - Pipeline = read-only visibility, never a stage-moving surface.
   - One operational menu = Antrian Seleksi.
   - Candidate Detail = one context-aware Next Action.
   - Screening/Psikotes/Interview/Offering remain fully functional, but are
     reached from the queue/detail instead of separate sidebar menus.
   ========================================================================== */
(function(){
  'use strict';

  const V21={
    activeTab:'screening',
    screeningRows:[],
    psychSessions:[],
    loading:false,
    loadedAt:null,
    detailAppId:null,
    refreshTimer:null
  };

  const h=v=>typeof atsEsc==='function'?atsEsc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const scopedApps=()=>{try{return typeof scopeByCompany==='function'?scopeByCompany(DB?.applications||[]):DB?.applications||[];}catch(_){return DB?.applications||[];}};
  const appById21=id=>typeof getApplication==='function'?getApplication(id):(DB?.applications||[]).find(x=>x.application_id===id);
  const candById21=id=>typeof getCandidate==='function'?getCandidate(id):(DB?.candidates||[]).find(x=>x.candidate_id===id);
  const posById21=id=>typeof getPosition==='function'?getPosition(id):(DB?.positions||[]).find(x=>x.position_id===id);
  const coById21=id=>typeof getCompany==='function'?getCompany(id):(DB?.companies||[]).find(x=>x.company_id===id);

  function installCss(){
    if(document.getElementById('ats-v21-ux-css'))return;
    const s=document.createElement('style');s.id='ats-v21-ux-css';s.textContent=`
      .candidate-card{cursor:pointer!important}.candidate-card.dragging{opacity:1!important}
      .v21-readonly-pipeline .kanban-col{outline:none!important}.v21-readonly-pipeline .candidate-card{user-select:text}
      .v21-tab-btn{transition:.15s ease}.v21-tab-btn.active{background:var(--brand,#2563eb);color:#fff;border-color:var(--brand,#2563eb)}
      .v21-next-card{box-shadow:0 8px 24px -18px rgba(15,23,42,.45)}
      .v21-overflow{position:relative}.v21-overflow-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:60;min-width:190px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 18px 40px -18px rgba(15,23,42,.35);padding:6px}
      .v21-overflow-menu>button{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:8px;font-size:12px}.v21-overflow-menu>button:hover{background:#f8fafc}
      .v21-task-row:hover{background:#f8fafc}
    `;document.head.appendChild(s);
  }

  function hideLegacyWorkflowNav(){
    ['screening-workbench','psychotests','interviews','offerings'].forEach(page=>{
      const n=document.querySelector(`.nav-item[data-page="${page}"]`);if(n){n.style.display='none';n.setAttribute('aria-hidden','true');n.dataset.v21Hidden='1';}
    });
  }

  function injectSelectionQueueUi(){
    installCss();hideLegacyWorkflowNav();
    let nav=document.querySelector('.nav-item[data-page="selection-queue"]');
    if(!nav){
      const cand=document.querySelector('.nav-item[data-page="candidates"]');
      nav=document.createElement('a');nav.href='#';nav.className='nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium';nav.dataset.page='selection-queue';
      nav.innerHTML='<i class="fas fa-list-check w-5 text-center"></i><span class="nav-text">Antrian Seleksi</span><span id="navBadgeSelectionV21" class="nav-text ml-auto hidden min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center"></span>';
      nav.addEventListener('click',e=>{e.preventDefault();navigate('selection-queue');});
      cand?.insertAdjacentElement('afterend',nav);
    }
    if(!document.getElementById('page-selection-queue')){
      const anchor=document.getElementById('page-candidates')||document.getElementById('page-pipeline');
      const p=document.createElement('div');p.id='page-selection-queue';p.className='page';
      anchor?.insertAdjacentElement('afterend',p);
    }
  }

  async function loadQueueData(silent=true){
    if(V21.loading)return;V21.loading=true;
    try{
      const [scr,psy]=await Promise.all([
        sb.rpc('list_screening_workbench'),
        sb.rpc('list_psychotest_sessions')
      ]);
      if(scr.error)throw scr.error;if(psy.error)throw psy.error;
      V21.screeningRows=Array.isArray(scr.data)?scr.data:(scr.data?[scr.data]:[]);
      V21.psychSessions=Array.isArray(psy.data)?psy.data:(psy.data?[psy.data]:[]);
      V21.loadedAt=new Date();
    }catch(e){if(!silent&&typeof showToast==='function')showToast('Antrian belum dapat dimuat: '+(e.message||e),'warning');console.warn('ATS V2.1 queue load',e);}
    finally{V21.loading=false;}
  }

  function screeningFor(appId){return (V21.screeningRows||[]).find(x=>x.application_id===appId)||null;}
  function psychFor(appId){return (V21.psychSessions||[]).filter(x=>x.application_id===appId).sort((a,b)=>Number(b.attempt_no||0)-Number(a.attempt_no||0))[0]||null;}
  function scheduled21(appId,type){
    try{if(typeof scheduledInterview==='function')return scheduledInterview(appId,type);}catch(_){}
    return (DB?.interviews||[]).filter(i=>i.application_id===appId&&i.interview_type===type&&i.date).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0))[0]||null;
  }
  function scorecard21(appId,type){
    try{if(typeof scorecardsFor==='function')return (scorecardsFor(appId)||[]).find(x=>x.interview_type===type)||null;}catch(_){}
    return (DB?.scorecards||[]).filter(x=>x.application_id===appId&&x.interview_type===type).sort((a,b)=>new Date(b.assessed_at||b.created_at||0)-new Date(a.assessed_at||a.created_at||0))[0]||null;
  }
  function link21(appId,type='Interview User'){
    try{if(typeof latestInterviewLink==='function')return latestInterviewLink(appId,type);}catch(_){}
    return (DB?.interview_links||[]).filter(x=>x.application_id===appId&&x.interview_type===type&&x.status!=='Dicabut').sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;
  }
  function offering21(appId){return (DB?.offerings||[]).filter(x=>x.application_id===appId).sort((a,b)=>new Date(b.offer_date||b.created_at||0)-new Date(a.offer_date||a.created_at||0))[0]||null;}

  function interviewDecision(rec){
    const v=String(rec||'').trim();if(!v)return'Perlu Review HR';
    if(['Lanjut','Sangat Direkomendasikan','Direkomendasikan'].includes(v))return'Lanjut';
    if(v==='Pertimbangkan'||v==='Perlu Review HR'||v==='Rekomendasikan Posisi Lain')return'Perlu Review HR';
    if(v==='Talent Pool')return'Talent Pool';
    if(v==='Tidak Lanjut'||v==='Tidak Direkomendasikan')return'Tidak Lanjut';
    return'Perlu Review HR';
  }

  function taskState(app){
    if(!app)return null;
    const appId=app.application_id,stage=app.current_stage||'Lamaran Masuk',status=app.status||'Aktif';
    const terminal=status==='Tidak Lanjut'||status==='Diterima'||['Tidak Lanjut','Diterima','Talent Pool'].includes(stage);
    if(terminal){return{tab:null,stage,processStatus:status,decision:status,action:null,label:null,tone:'slate'};}

    if(['Lamaran Masuk','Screening CV','Screening HR'].includes(stage)){
      const s=screeningFor(appId);
      if(!s)return{tab:'screening',stage,processStatus:'Belum dievaluasi',decision:'Belum Ada',action:'screen-evaluate',label:'Evaluasi Screening',tone:'blue'};
      const dec=s.review_decision||s.screening_status||'Belum Ada';
      if(s.screening_status==='Perlu Review HR'&&!s.review_decision)return{tab:'screening',stage,processStatus:'Menunggu review HR',decision:'Perlu Review HR',action:'screen-review',label:'Review Screening',tone:'amber'};
      if(s.screening_status==='Tidak Lolos Otomatis'||s.review_decision==='Tidak Lanjut')return{tab:'screening',stage,processStatus:'Selesai',decision:'Tidak Lanjut',action:null,label:null,tone:'red'};
      if(s.screening_status==='Lolos Otomatis'||s.review_decision==='Lanjut')return{tab:'screening',stage,processStatus:'Screening selesai',decision:'Lanjut',action:'screen-advance',label:'Lanjut ke Psikotes',tone:'emerald'};
      return{tab:'screening',stage,processStatus:'Perlu verifikasi',decision:dec,action:'screen-evaluate',label:'Evaluasi Ulang Screening',tone:'amber'};
    }

    if(stage==='Psikotes'){
      const p=psychFor(appId);
      if(!p)return{tab:'psych',stage,processStatus:'Belum ada akses',decision:'Belum Ada',action:'psych-create',label:'Generate Akses Psikotes',tone:'blue'};
      if(['Belum Dimulai','Dalam Proses'].includes(p.status))return{tab:'psych',stage,processStatus:p.status,decision:p.workflow_decision||'Belum Ada',action:'psych-access',label:p.status==='Belum Dimulai'?'Lihat Akses Psikotes':'Lihat Status Psikotes',tone:p.status==='Dalam Proses'?'blue':'slate'};
      if(['Kedaluwarsa','Dibatalkan'].includes(p.status))return{tab:'psych',stage,processStatus:p.status,decision:'Perlu Akses Baru',action:'psych-create',label:'Buat Akses Psikotes Baru',tone:'red'};
      if(p.status==='Selesai'&&(!p.workflow_decision||p.workflow_decision==='Perlu Review HR'))return{tab:'psych',stage,processStatus:'Selesai dikerjakan',decision:'Perlu Review HR',action:'psych-review',label:'Review Hasil Psikotes',tone:'amber'};
      if(p.status==='Selesai'&&p.workflow_decision==='Lanjut')return{tab:'psych',stage,processStatus:'Selesai dikerjakan',decision:'Lanjut',action:'hr-schedule',label:'Jadwalkan Interview HR',tone:'emerald'};
      if(p.workflow_decision==='Tidak Lanjut')return{tab:'psych',stage,processStatus:'Selesai',decision:'Tidak Lanjut',action:'reject-finalize',label:'Finalisasi Tidak Lanjut',tone:'red'};
      return{tab:'psych',stage,processStatus:p.status||'Perlu perhatian',decision:p.workflow_decision||'Perlu Review HR',action:'psych-review',label:'Review Psikotes',tone:'amber'};
    }

    if(stage==='Interview HR'){
      const sched=scheduled21(appId,'Interview HR'),card=scorecard21(appId,'Interview HR');
      if(!sched)return{tab:'hr',stage,processStatus:'Belum dijadwalkan',decision:'Belum Ada',action:'hr-schedule',label:'Jadwalkan Interview HR',tone:'blue'};
      if(!card)return{tab:'hr',stage,processStatus:'Sudah dijadwalkan',decision:'Belum Dinilai',action:'hr-score',label:'Isi Interview HR',tone:'indigo'};
      const d=interviewDecision(card.workflow_decision||card.recommendation);
      if(d==='Lanjut')return{tab:'hr',stage,processStatus:'Penilaian selesai',decision:'Lanjut',action:'user-schedule',label:'Jadwalkan Interview User',tone:'emerald'};
      if(d==='Tidak Lanjut')return{tab:'hr',stage,processStatus:'Penilaian selesai',decision:d,action:'reject-finalize',label:'Finalisasi Tidak Lanjut',tone:'red'};
      if(d==='Talent Pool')return{tab:'hr',stage,processStatus:'Penilaian selesai',decision:d,action:'talent-finalize',label:'Masukkan Talent Pool',tone:'amber'};
      return{tab:'hr',stage,processStatus:'Penilaian selesai',decision:d,action:'hr-review',label:'Review & Putuskan Interview HR',tone:'amber'};
    }

    if(stage==='Interview User'){
      const sched=scheduled21(appId,'Interview User'),card=scorecard21(appId,'Interview User'),lnk=link21(appId,'Interview User');
      if(!sched)return{tab:'user',stage,processStatus:'Belum dijadwalkan',decision:'Belum Ada',action:'user-schedule',label:'Jadwalkan Interview User',tone:'blue'};
      if(!card){
        if(!lnk)return{tab:'user',stage,processStatus:'Terjadwal · link belum dibuat',decision:'Belum Dinilai',action:'user-link',label:'Buat Link Scorecard User',tone:'indigo'};
        return{tab:'user',stage,processStatus:`Menunggu User · ${lnk.status||'Link aktif'}`,decision:'Belum Dinilai',action:'user-link',label:'Lihat / Salin Link User',tone:'amber'};
      }
      const d=interviewDecision(card.workflow_decision||card.recommendation);
      if(d==='Lanjut')return{tab:'user',stage,processStatus:'Penilaian selesai',decision:'Lanjut',action:'user-offering',label:'Buat Offering',tone:'emerald'};
      if(d==='Tidak Lanjut')return{tab:'user',stage,processStatus:'Penilaian selesai',decision:d,action:'reject-finalize',label:'Finalisasi Tidak Lanjut',tone:'red'};
      if(d==='Talent Pool')return{tab:'user',stage,processStatus:'Penilaian selesai',decision:d,action:'talent-finalize',label:'Masukkan Talent Pool',tone:'amber'};
      return{tab:'user',stage,processStatus:'Penilaian selesai',decision:d,action:'user-review',label:'Review & Putuskan Interview User',tone:'amber'};
    }

    if(['Offering','Interview Final','Medical Check Up'].includes(stage)){
      const off=offering21(appId);
      if(stage!=='Offering'&&!off)return{tab:'offering',stage,processStatus:'Siap Offering',decision:'Lanjut',action:'user-offering',label:'Lanjut ke Offering',tone:'emerald'};
      if(!off)return{tab:'offering',stage,processStatus:'Offering belum dibuat',decision:'Belum Ada',action:'offering-create',label:'Buat Offering',tone:'blue'};
      return{tab:'offering',stage,processStatus:off.status||'Offering dibuat',decision:off.status||'Belum Ada',action:'offering-manage',label:'Kelola Offering',tone:['Ditolak','Kadaluarsa','Dibatalkan'].includes(off.status)?'red':'amber',offeringId:off.offering_id};
    }

    return{tab:null,stage,processStatus:'Tidak ada tindakan aktif',decision:'—',action:null,label:null,tone:'slate'};
  }

  function toneClasses(tone){return({blue:'bg-blue-50 text-blue-700 border-blue-100',indigo:'bg-indigo-50 text-indigo-700 border-indigo-100',amber:'bg-amber-50 text-amber-700 border-amber-100',emerald:'bg-emerald-50 text-emerald-700 border-emerald-100',red:'bg-red-50 text-red-700 border-red-100',slate:'bg-slate-50 text-slate-600 border-slate-100'})[tone]||'bg-slate-50 text-slate-600 border-slate-100';}

  function tasksByTab(){
    const out={screening:[],psych:[],hr:[],user:[],offering:[]};
    scopedApps().filter(a=>a.status!=='Tidak Lanjut'&&a.status!=='Diterima'&&a.current_stage!=='Talent Pool').forEach(app=>{
      const st=taskState(app);if(st?.tab&&st.action)out[st.tab].push({app,state:st});
    });
    return out;
  }

  function updateSelectionBadge(tasks){
    const n=Object.values(tasks).reduce((s,a)=>s+a.length,0),b=document.getElementById('navBadgeSelectionV21');
    if(b){b.textContent=n>99?'99+':String(n);b.classList.toggle('hidden',n===0);}
  }

  function tabLabel(k){return({screening:'Screening',psych:'Psikotes',hr:'Interview HR',user:'Interview User',offering:'Offering'})[k]||k;}
  function actionIcon(action){if(action?.includes('screen'))return'fa-filter';if(action?.includes('psych'))return'fa-brain';if(action?.includes('schedule'))return'fa-calendar-plus';if(action?.includes('score')||action?.includes('result')||action?.includes('review'))return'fa-clipboard-check';if(action?.includes('link'))return'fa-link';if(action?.includes('offering'))return'fa-handshake';if(action?.includes('reject'))return'fa-circle-xmark';if(action?.includes('talent'))return'fa-box-archive';return'fa-arrow-right';}

  async function renderSelectionQueue(reload=true){
    injectSelectionQueueUi();if(reload)await loadQueueData(false);
    const root=document.getElementById('page-selection-queue');if(!root)return;
    const tasks=tasksByTab();updateSelectionBadge(tasks);
    if(!tasks[V21.activeTab])V21.activeTab='screening';const rows=tasks[V21.activeTab]||[];
    const total=Object.values(tasks).reduce((s,a)=>s+a.length,0);
    root.innerHTML=`
      <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
        <div><h1 class="text-2xl font-bold">Antrian Seleksi</h1><p class="text-sm text-slate-500 mt-1">Satu tempat untuk seluruh pekerjaan seleksi yang perlu ditindak HR. Tahap kandidat bergerak melalui keputusan proses, bukan drag & drop.</p></div>
        <button onclick="renderSelectionQueueV21(true)" class="px-3 py-2 border rounded-lg bg-white text-sm"><i class="fas fa-rotate mr-1"></i>Refresh</button>
      </div>
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-blue-900"><i class="fas fa-circle-info mr-2"></i><b>${total} tindakan</b> menunggu pada seluruh proses seleksi. Klik satu tindakan utama; sistem akan menjaga urutan tahap.</div>
      <div class="flex flex-wrap gap-2 mb-4">${Object.keys(tasks).map(k=>`<button onclick="openSelectionTabV21('${k}')" class="v21-tab-btn ${V21.activeTab===k?'active':''} px-3 py-2 rounded-lg border bg-white text-sm font-medium">${tabLabel(k)} <span class="ml-1 text-xs opacity-80">${tasks[k].length}</span></button>`).join('')}</div>
      <div class="bg-white border rounded-xl overflow-hidden">
        <div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr class="border-b text-left text-xs text-slate-500 uppercase"><th class="px-4 py-3">Kandidat</th><th class="px-4 py-3">Posisi</th><th class="px-4 py-3">Status Proses</th><th class="px-4 py-3">Keputusan</th><th class="px-4 py-3">Next Action</th><th class="px-4 py-3">Profil</th></tr></thead>
        <tbody>${rows.map(({app,state})=>{const c=candById21(app.candidate_id),p=posById21(app.position_id),co=coById21(app.company_id);return`<tr class="v21-task-row border-b"><td class="px-4 py-3"><div class="font-semibold">${h(c?.candidate_name||'-')}</div><div class="text-[10px] font-mono text-slate-400">${h(app.application_id)}</div></td><td class="px-4 py-3">${h(p?.position_name||'-')}<div class="text-[10px] text-slate-400">${h(co?.brand||co?.company_name||'')}</div></td><td class="px-4 py-3"><div class="font-medium">${h(state.processStatus)}</div><div class="text-[10px] text-slate-400">Tahap: ${h(state.stage)}</div></td><td class="px-4 py-3"><span class="inline-flex px-2 py-1 rounded-full border text-[10px] font-semibold ${toneClasses(state.tone)}">${h(state.decision)}</span></td><td class="px-4 py-3"><button onclick="runNextActionV21('${h(app.application_id)}')" class="px-3 py-2 bg-primary-600 text-white rounded-lg text-xs font-semibold whitespace-nowrap"><i class="fas ${actionIcon(state.action)} mr-1"></i>${h(state.label)}</button></td><td class="px-4 py-3"><button onclick="viewCandidateDetail('${h(app.candidate_id)}','${h(app.application_id)}')" class="text-primary-700 text-xs font-semibold">Buka 360°</button></td></tr>`;}).join('')||`<tr><td colspan="6" class="p-10 text-center text-slate-400"><i class="fas fa-circle-check text-2xl text-emerald-500 mb-2"></i><div>Tidak ada tindakan pada ${tabLabel(V21.activeTab)}.</div></td></tr>`}</tbody></table></div>
      </div>`;
  }

  function openSelectionTab(tab){V21.activeTab=tab;if(typeof navigate==='function'&&typeof currentPage!=='undefined'&&currentPage!=='selection-queue')navigate('selection-queue');else renderSelectionQueue(false);}

  async function openOfferingForApp(appId){
    const app=appById21(appId);if(!app)return showToast('Kandidat tidak ditemukan','danger');
    if(app.current_stage!=='Offering'){
      if(typeof window.transitionStageV2!=='function')return showToast('Workflow transition tidak tersedia','danger');
      const moved=await window.transitionStageV2(appId,'Offering');if(!moved)return;
    }
    if(typeof openOfferingModal!=='function')return showToast('Form Offering tidak tersedia','danger');
    openOfferingModal();
    setTimeout(()=>{const sel=document.getElementById('offCand');if(!sel)return;sel.value=appId;try{sel.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){}},30);
  }

  async function finalizeRejectV21(appId){
    if(typeof openRejectModal==='function')return openRejectModal(appId);
    const reason=prompt('Alasan kandidat tidak dilanjutkan:');
    if(!reason||!reason.trim())return;
    return window.transitionStageV2?.(appId,'Tidak Lanjut',reason.trim());
  }

  async function finalizeTalentPoolV21(appId){
    if(!confirm('Masukkan kandidat ke Talent Pool?'))return;
    return window.transitionStageV2?.(appId,'Talent Pool');
  }

  async function runNextAction(appId){
    const app=appById21(appId);if(!app)return showToast('Application tidak ditemukan','danger');
    if(!V21.loadedAt)await loadQueueData(true);const st=taskState(app);if(!st?.action)return showToast('Tidak ada tindakan yang perlu dilakukan pada kandidat ini.','info');
    switch(st.action){
      case'screen-evaluate':return window.rerunScreeningV2?.(appId);
      case'screen-review':return window.openScreenReviewV2?.(appId);
      case'screen-advance':return window.transitionStageV2?.(appId,'Psikotes');
      case'psych-create':return window.createPsychAccessV2?.(appId);
      case'psych-access':return window.showPsychAccessV2?.(appId);
      case'psych-review':return window.openPsychReviewV2?.(appId);
      case'psych-advance':return typeof openInterviewModal==='function'?openInterviewModal(appId,'Interview HR'):showToast('Form jadwal Interview HR tidak tersedia','danger');
      case'hr-schedule':return typeof openInterviewModal==='function'?openInterviewModal(appId,'Interview HR'):showToast('Form jadwal Interview HR tidak tersedia','danger');
      case'hr-score':return typeof openInterviewScorecard==='function'?openInterviewScorecard(appId,'Interview HR'):showToast('Scorecard HR tidak tersedia','danger');
      case'hr-review':return typeof window.openInterviewReviewV22==='function'?window.openInterviewReviewV22(appId,'Interview HR'):showToast('Review Interview HR belum tersedia. Jalankan patch SQL V2.2.','warning');
      case'hr-result':return typeof viewInterviewResult==='function'?viewInterviewResult(appId):showToast('Hasil Interview HR tidak tersedia','warning');
      case'user-schedule':return typeof openInterviewModal==='function'?openInterviewModal(appId,'Interview User'):showToast('Form jadwal Interview User tidak tersedia','danger');
      case'user-link':return typeof openInterviewerLinkModal==='function'?openInterviewerLinkModal(appId,'Interview User'):showToast('Portal Interview User tidak tersedia','danger');
      case'user-review':return typeof window.openInterviewReviewV22==='function'?window.openInterviewReviewV22(appId,'Interview User'):showToast('Review Interview User belum tersedia. Jalankan patch SQL V2.2.','warning');
      case'user-result':return typeof viewInterviewResult==='function'?viewInterviewResult(appId):showToast('Hasil Interview User tidak tersedia','warning');
      case'reject-finalize':return finalizeRejectV21(appId);
      case'talent-finalize':return finalizeTalentPoolV21(appId);
      case'user-offering':case'offering-create':return openOfferingForApp(appId);
      case'offering-manage':{const off=offering21(appId);if(off&&typeof editOffering==='function')return editOffering(off.offering_id);if(typeof navigate==='function')return navigate('offerings');return;}
      default:return showToast('Tindakan belum tersedia','warning');
    }
  }

  function updatePipelineCopy(page){
    if(!page)return;
    const headings=[...page.querySelectorAll('h1,h2,h3')];
    const title=headings.find(el=>/Recruitment Pipeline/i.test(el.textContent||''));
    if(title){
      const sub=title.parentElement?.querySelector('p');
      if(sub&&/Geser kartu|pakai Pindah|Gugur|WhatsApp/i.test(sub.textContent||'')){
        sub.innerHTML='Lihat posisi kandidat pada setiap tahapan. Proses seleksi dilakukan dari <b>Antrian Seleksi</b> atau Candidate Profile 360°.';
      }
    }
  }

  function stripPipelineActions(board){
    if(!board)return;
    const forbiddenText=/^(Pindah|Hire|Gugur|Reject|Tidak Lanjut)$/i;
    const forbiddenCode=/(openMove|moveCandidateStage|hireCandidate|rejectCandidate|openReject|gugur|rejectApplication)/i;
    board.querySelectorAll('button,a,[role="button"]').forEach(el=>{
      const text=(el.textContent||'').trim().replace(/\s+/g,' ');
      const code=[el.getAttribute('onclick')||'',el.getAttribute('href')||'',el.getAttribute('data-action')||'',el.id||''].join(' ');
      if(forbiddenText.test(text)||forbiddenCode.test(code)){el.remove();}
    });
  }

  function installPipelineGuard(){
    if(document.__v211PipelineGuard)return;
    document.__v211PipelineGuard=true;
    document.addEventListener('click',function(e){
      const page=document.getElementById('page-pipeline');
      if(!page||page.classList.contains('hidden')||page.offsetParent===null)return;
      const el=e.target?.closest?.('button,a,[role="button"]');
      if(!el||!page.contains(el))return;
      const text=(el.textContent||'').trim().replace(/\s+/g,' ');
      const code=[el.getAttribute('onclick')||'',el.getAttribute('href')||'',el.getAttribute('data-action')||'',el.id||''].join(' ');
      if(/^(Pindah|Hire|Gugur|Reject|Tidak Lanjut)$/i.test(text)||/(openMove|moveCandidateStage|hireCandidate|rejectCandidate|openReject|gugur|rejectApplication)/i.test(code)){
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
        if(typeof closeModal==='function')try{closeModal();}catch(_){}
        if(typeof showToast==='function')showToast('Pipeline hanya untuk melihat posisi kandidat. Proses kandidat dari Antrian Seleksi atau Candidate Profile 360°.','info');
      }
    },true);
  }

  function lockPipeline(){
    const page=document.getElementById('page-pipeline');if(!page)return;page.classList.add('v21-readonly-pipeline');
    updatePipelineCopy(page);
    const board=document.getElementById('kanbanBoard');if(!board)return;
    board.querySelectorAll('.kanban-col').forEach(col=>{col.removeAttribute('ondragover');col.removeAttribute('ondrop');col.removeAttribute('ondragleave');col.classList.remove('drag-over');});
    board.querySelectorAll('.candidate-card,[draggable="true"]').forEach(card=>{card.draggable=false;card.setAttribute('draggable','false');card.removeAttribute('ondragstart');card.removeAttribute('ondragend');card.classList.remove('dragging');});
    stripPipelineActions(board);
    if(!board.__v211Observer){
      board.__v211Observer=new MutationObserver(()=>{
        board.querySelectorAll('.candidate-card,[draggable="true"]').forEach(card=>{card.draggable=false;card.setAttribute('draggable','false');card.removeAttribute('ondragstart');card.removeAttribute('ondragend');card.classList.remove('dragging');});
        stripPipelineActions(board);
      });
      board.__v211Observer.observe(board,{childList:true,subtree:true});
    }
    installPipelineGuard();
    const wrapper=document.getElementById('kanbanWrapper')||board.parentElement;
    if(wrapper&&!document.getElementById('v21PipelineInfo')){const d=document.createElement('div');d.id='v21PipelineInfo';d.className='mb-4 p-4 rounded-xl border border-blue-100 bg-blue-50 text-sm text-blue-900';d.innerHTML='<i class="fas fa-eye mr-2"></i><b>Pipeline sekarang read-only.</b> Gunakan Pipeline untuk melihat posisi kandidat. Untuk memproses kandidat, buka <b>Antrian Seleksi</b> atau Candidate Profile 360°.';wrapper.parentElement?.insertBefore(d,wrapper);}
  }

  function createOverflowMenu(controlRow){
    if(!controlRow||controlRow.querySelector('.v21-overflow'))return;
    const secondary=[];
    [...controlRow.querySelectorAll('button')].forEach(btn=>{
      const t=(btn.textContent||'').trim();
      if(!t)return;
      if(/WhatsApp/i.test(t))return;
      if(/^(Ubah Status|Pindah|Hire)$/i.test(t)||/^Screening$/i.test(t)){btn.remove();return;}
      secondary.push(btn);
    });
    if(!secondary.length)return;
    const wrap=document.createElement('div');wrap.className='v21-overflow';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='px-3 py-1.5 border rounded-lg bg-white text-slate-600 text-sm font-bold';toggle.innerHTML='<i class="fas fa-ellipsis"></i>';toggle.title='Aksi lainnya';
    const menu=document.createElement('div');menu.className='v21-overflow-menu hidden';
    secondary.forEach(btn=>{btn.className='text-slate-700';menu.appendChild(btn);});
    toggle.addEventListener('click',e=>{e.stopPropagation();menu.classList.toggle('hidden');});
    menu.addEventListener('click',e=>e.stopPropagation());
    wrap.append(toggle,menu);controlRow.appendChild(wrap);
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))menu.classList.add('hidden');});
  }

  async function simplifyCandidateDetail(appId){
    V21.detailAppId=appId;await loadQueueData(true);const root=document.getElementById('candidateDetailContent');if(!root)return;
    const select=document.getElementById('detailStageSelect'),controlRow=select?.parentElement||[...root.querySelectorAll('div')].find(d=>[...d.querySelectorAll(':scope > button')].some(b=>/Ubah Status|Pindah|WhatsApp|Gugur|Hire/.test(b.textContent||'')));
    if(select)select.remove();
    if(controlRow){[...controlRow.querySelectorAll('button')].forEach(btn=>{const t=(btn.textContent||'').trim();if(/^(Ubah Status|Pindah|Hire)$/i.test(t)||/^Screening$/i.test(t))btn.remove();});createOverflowMenu(controlRow);}
    root.querySelector('#v21NextActionCard')?.remove();
    const app=appById21(appId);if(!app)return;const st=taskState(app),firstCard=root.querySelector(':scope > .bg-white.rounded-xl')||root.firstElementChild;
    const card=document.createElement('div');card.id='v21NextActionCard';card.className='v21-next-card bg-white rounded-xl border border-slate-200 p-5 mb-4';
    card.innerHTML=`<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Next Action</div><div class="text-lg font-bold mt-1">${h(st?.label||'Tidak ada tindakan berikutnya')}</div><div class="text-xs text-slate-500 mt-1">Sistem menentukan langkah berikut berdasarkan hasil tahap sebelumnya.</div></div>${st?.action?`<button onclick="runNextActionV21('${h(appId)}')" class="px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold whitespace-nowrap"><i class="fas ${actionIcon(st.action)} mr-2"></i>${h(st.label)}</button>`:'<span class="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold">Tidak ada tindakan aktif</span>'}</div><div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4"><div class="rounded-lg bg-slate-50 p-3"><div class="text-[10px] uppercase text-slate-400">Tahap</div><div class="text-sm font-semibold mt-1">${h(st?.stage||app.current_stage||'-')}</div></div><div class="rounded-lg bg-slate-50 p-3"><div class="text-[10px] uppercase text-slate-400">Status Proses</div><div class="text-sm font-semibold mt-1">${h(st?.processStatus||'-')}</div></div><div class="rounded-lg bg-slate-50 p-3"><div class="text-[10px] uppercase text-slate-400">Keputusan</div><div class="mt-1"><span class="inline-flex px-2 py-1 rounded-full border text-[10px] font-semibold ${toneClasses(st?.tone)}">${h(st?.decision||'-')}</span></div></div></div>`;
    if(firstCard?.parentNode)firstCard.parentNode.insertBefore(card,firstCard.nextSibling);else root.prepend(card);
  }

  function decorateDashboard(){
    const box=document.getElementById('recruiterTasks');if(!box)return;
    const tasks=tasksByTab();updateSelectionBadge(tasks);
    const data=[['screening','fa-filter','Screening',tasks.screening.length,'text-blue-700 bg-blue-50'],['psych','fa-brain','Psikotes',tasks.psych.length,'text-purple-700 bg-purple-50'],['hr','fa-user-tie','Interview HR',tasks.hr.length,'text-indigo-700 bg-indigo-50'],['user','fa-users','Interview User',tasks.user.length,'text-amber-700 bg-amber-50'],['offering','fa-handshake','Offering',tasks.offering.length,'text-emerald-700 bg-emerald-50']];
    box.className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3';
    box.innerHTML=data.map(([tab,icon,label,count,cls])=>`<button onclick="openSelectionTabV21('${tab}')" class="text-left rounded-lg border border-slate-100 p-3 ${cls} hover:shadow-sm"><div class="flex items-center justify-between"><i class="fas ${icon}"></i><span class="text-2xl font-bold">${count}</span></div><div class="text-xs font-medium mt-2">${label} perlu tindakan</div></button>`).join('');
  }

  function refreshUxAfterAction(){
    clearTimeout(V21.refreshTimer);V21.refreshTimer=setTimeout(async()=>{await loadQueueData(true);if(typeof currentPage!=='undefined'&&currentPage==='selection-queue')renderSelectionQueue(false);if(V21.detailAppId&&document.getElementById('candidateDetailContent'))simplifyCandidateDetail(V21.detailAppId);if(typeof currentPage!=='undefined'&&currentPage==='dashboard')decorateDashboard();},650);
  }

  function wrapAction(name){
    const orig=window[name];if(typeof orig!=='function'||orig.__v21wrapped)return;
    const wrapped=function(...args){const r=orig.apply(this,args);if(r&&typeof r.then==='function')return r.finally(refreshUxAfterAction);refreshUxAfterAction();return r;};wrapped.__v21wrapped=true;window[name]=wrapped;
  }

  function installHooks(){
    injectSelectionQueueUi();

    if(typeof window.renderPage==='function'&&!window.renderPage.__v21wrapped){const orig=window.renderPage;const wrapped=function(page){hideLegacyWorkflowNav();if(page==='selection-queue')return renderSelectionQueue(true);const r=orig(page);if(page==='pipeline')setTimeout(lockPipeline,0);if(page==='dashboard')setTimeout(async()=>{await loadQueueData(true);decorateDashboard();},0);return r;};wrapped.__v21wrapped=true;window.renderPage=wrapped;}

    if(typeof window.renderPipeline==='function'&&!window.renderPipeline.__v21wrapped){const orig=window.renderPipeline;const wrapped=function(...args){const r=orig.apply(this,args);setTimeout(lockPipeline,0);return r;};wrapped.__v21wrapped=true;window.renderPipeline=wrapped;}
    window.allowDrop=function(e){e?.preventDefault?.();};
    window.dropCard=function(e){e?.preventDefault?.();if(typeof showToast==='function')showToast('Pipeline hanya untuk melihat posisi kandidat. Gunakan Antrian Seleksi untuk memproses kandidat.','info');};

    if(typeof window.viewCandidateDetail==='function'&&!window.viewCandidateDetail.__v21wrapped){const orig=window.viewCandidateDetail;const wrapped=function(candidateId,appId){const r=orig.apply(this,arguments),id=appId||(DB?.applications||[]).find(a=>a.candidate_id===candidateId)?.application_id;if(id){V21.detailAppId=id;setTimeout(()=>simplifyCandidateDetail(id),80);}return r;};wrapped.__v21wrapped=true;window.viewCandidateDetail=wrapped;}

    ['saveScreenReviewV2','savePsychReviewV2','rerunScreeningV2','advanceToInterviewHrV2','saveNewInterview','saveScorecard','generatePortalLink','saveNewOffering','acceptOffer','rejectOffer'].forEach(wrapAction);

    const oldNav=window.navigate;if(typeof oldNav==='function'&&!oldNav.__v21wrapped){const nav=function(page,...rest){hideLegacyWorkflowNav();return oldNav.call(this,page,...rest);};nav.__v21wrapped=true;window.navigate=nav;}
  }

  Object.assign(window,{renderSelectionQueueV21:renderSelectionQueue,openSelectionTabV21:openSelectionTab,runNextActionV21:runNextAction,simplifyCandidateDetailV21:simplifyCandidateDetail,lockPipelineV21:lockPipeline});

  injectSelectionQueueUi();installHooks();
  document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{injectSelectionQueueUi();installHooks();await loadQueueData(true);hideLegacyWorkflowNav();if(typeof currentPage!=='undefined'&&currentPage==='pipeline')lockPipeline();if(typeof currentPage!=='undefined'&&currentPage==='dashboard')decorateDashboard();},1450));
  console.log('%cRecruitment ATS V2.1.1 UX Pipeline Lock active','color:#7c3aed;font-weight:bold');
})();

/* ========================================================================== 
   ATS V2.2 - WORKFLOW QUALITY PATCH
   - Psychotest invitation follows saved WhatsApp template
   - Professional interview report and print-ready PDF view
   - Explicit HR adjudication for Perlu Review HR interview results
   - Keeps Pipeline read-only and strict sequential workflow
   ========================================================================== */
(function(){
  'use strict';

  const e22=v=>typeof atsEsc==='function'?atsEsc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const app22=id=>typeof getApplication==='function'?getApplication(id):(DB?.applications||[]).find(x=>x.application_id===id);
  const cand22=id=>typeof getCandidate==='function'?getCandidate(id):(DB?.candidates||[]).find(x=>x.candidate_id===id);
  const pos22=id=>typeof getPosition==='function'?getPosition(id):(DB?.positions||[]).find(x=>x.position_id===id);
  const co22=id=>typeof getCompany==='function'?getCompany(id):(DB?.companies||[]).find(x=>x.company_id===id);
  const fmt22=d=>{if(!d)return'-';try{return typeof formatDate==='function'?formatDate(d):new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}catch(_){return String(d);}};

  function scorecards22(appId){
    let rows=[];
    try{if(typeof scorecardsFor==='function')rows=scorecardsFor(appId)||[];}catch(_){}
    if(!rows.length)rows=(DB?.scorecards||[]).filter(x=>x.application_id===appId);
    return [...rows].sort((a,b)=>new Date(b.created_at||b.assessed_at||0)-new Date(a.created_at||a.assessed_at||0));
  }
  function card22(appId,type){return scorecards22(appId).find(x=>x.interview_type===type)||null;}
  function decision22(v){
    const s=String(v||'').trim();
    if(['Lanjut','Sangat Direkomendasikan','Direkomendasikan'].includes(s))return'Lanjut';
    if(['Pertimbangkan','Perlu Review HR','Rekomendasikan Posisi Lain',''].includes(s))return'Perlu Review HR';
    if(s==='Talent Pool')return'Talent Pool';
    if(['Tidak Lanjut','Tidak Direkomendasikan'].includes(s))return'Tidak Lanjut';
    return'Perlu Review HR';
  }
  function pct22(r){
    const n=Number(r?.weighted_score??r?.score??0);
    if(!Number.isFinite(n))return 0;
    return Math.max(0,Math.min(100,n<=4.1?n*25:n));
  }
  function risk22(r){const n=(r?.red_flags||[]).length;return n>=3?'Tinggi':n>0?'Sedang':'Rendah';}
  function tone22(v){
    const s=decision22(v);
    if(s==='Lanjut')return'emerald';
    if(s==='Tidak Lanjut')return'red';
    if(s==='Talent Pool')return'blue';
    return'amber';
  }
  function badge22(v){
    const t=tone22(v),m={emerald:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-700 border-red-200',blue:'bg-blue-50 text-blue-700 border-blue-200',amber:'bg-amber-50 text-amber-700 border-amber-200'};
    return m[t]||m.amber;
  }
  function analysis22(r,c){
    if(!r)return null;
    let base=null;
    try{base=r.analysis_json||(typeof buildInterviewAnalysis==='function'?buildInterviewAnalysis(r,c||{}):null);}catch(_){}
    const items=Array.isArray(r.detail_json)?r.detail_json:[];
    const strengths=(base?.strengths?.length?base.strengths:items.filter(x=>Number(x.score)>=3).sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,5).map(x=>`${x.competency_name||'Kompetensi'}: ${x.score}/4${x.evidence?' - '+x.evidence:''}`));
    const gaps=(base?.gaps?.length?base.gaps:items.filter(x=>Number(x.score)<=2).sort((a,b)=>Number(a.score)-Number(b.score)).slice(0,5).map(x=>`${x.competency_name||'Kompetensi'}: ${x.score}/4${x.evidence?' - '+x.evidence:''}`));
    const flags=Array.isArray(r.red_flags)?r.red_flags:[];
    const score=pct22(r).toFixed(1),dec=decision22(r.workflow_decision||r.recommendation),risk=risk22(r);
    const topStrength=items.filter(x=>Number(x.score)>=3).sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,2).map(x=>x.competency_name).filter(Boolean);
    const topGap=items.filter(x=>Number(x.score)<=2).sort((a,b)=>Number(a.score)-Number(b.score)).slice(0,2).map(x=>x.competency_name).filter(Boolean);
    let narrative=`Hasil ${r.interview_type||'interview'} mencatat skor ${score}/100 dengan rekomendasi ${r.recommendation||'-'}. `;
    if(topStrength.length)narrative+=`Kekuatan yang paling terlihat berada pada ${topStrength.join(' dan ')}. `;
    if(topGap.length)narrative+=`Area yang masih perlu pendalaman adalah ${topGap.join(' dan ')}. `;
    if(flags.length)narrative+=`Terdapat ${flags.length} red flag sehingga klarifikasi dan bukti pendukung perlu menjadi perhatian. `;
    else narrative+='Tidak ada red flag yang dicentang pada scorecard ini. ';
    if(dec==='Perlu Review HR')narrative+='Keputusan workflow belum final dan memerlukan review HR sebelum kandidat dapat melanjutkan.';
    if(dec==='Lanjut')narrative+='Keputusan workflow saat ini adalah Lanjut sehingga kandidat dapat masuk ke tahap berikutnya sesuai gate sistem.';
    if(dec==='Talent Pool')narrative+='Kandidat diarahkan ke Talent Pool dan tidak dilanjutkan pada lowongan ini.';
    if(dec==='Tidak Lanjut')narrative+='Keputusan workflow saat ini adalah Tidak Lanjut.';
    return{
      summary:base?.summary||narrative,
      narrative,
      strengths:strengths.length?strengths:['Belum ada kekuatan yang cukup terdokumentasi dari scorecard.'],
      gaps:gaps.length?gaps:['Tidak ada kompetensi dengan skor 1-2 yang tercatat.'],
      flags,
      risk,
      decision:dec,
      score:Number(score),
      recommendation:r.recommendation||'-',
      cv:r.cv_background_notes||base?.cv_consistency||'Belum ada catatan verifikasi konsistensi CV.',
      notes:r.notes||r.conclusion||'',
      reviewNotes:r.workflow_review_notes||'',
      reviewedBy:r.workflow_reviewed_by||'',
      reviewedAt:r.workflow_reviewed_at||null
    };
  }

  function profileGrid22(c){
    const cells=[
      ['Pendidikan',c?.education],['Domisili',c?.city],['Pengalaman',c?.experience],['Posisi terakhir',c?.last_role],['Perusahaan terakhir',c?.last_company],['Alasan melamar',c?.apply_reason]
    ].filter(x=>x[1]);
    return cells.length?`<div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4">${cells.map(([k,v])=>`<div class="rounded-lg bg-slate-50 p-3"><div class="text-[10px] uppercase tracking-wide text-slate-400">${e22(k)}</div><div class="text-sm font-medium mt-1">${e22(v)}</div></div>`).join('')}</div>`:'';
  }

  function stageReport22(r,c){
    if(!r)return'';
    const a=analysis22(r,c),items=Array.isArray(r.detail_json)?r.detail_json:[],first=Array.isArray(r.first_impression)?r.first_impression:[];
    const review=a.reviewedAt?`<div class="mt-3 rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs"><b>Review workflow:</b> ${e22(a.decision)}${a.reviewedBy?' oleh '+e22(a.reviewedBy):''}${a.reviewedAt?' pada '+e22(fmt22(a.reviewedAt)):''}${a.reviewNotes?`<div class="mt-1">${e22(a.reviewNotes)}</div>`:''}</div>`:'';
    return `<section class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="p-5 border-b bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><div class="text-xs uppercase tracking-wider text-slate-400">Tahap Seleksi</div><h4 class="font-bold text-lg">${e22(r.interview_type||'Interview')}</h4><div class="text-xs text-slate-500 mt-1">Interviewer: ${e22(r.interviewer||'-')} | ${e22(fmt22(r.assessed_at||r.created_at))}</div></div>
        <div class="flex items-center gap-3"><div class="text-right"><div class="text-3xl font-black text-slate-900">${a.score.toFixed(1)}</div><div class="text-[10px] uppercase text-slate-400">Skor /100</div></div><span class="px-3 py-1.5 rounded-full border text-xs font-bold ${badge22(a.decision)}">${e22(a.decision)}</span></div>
      </div>
      <div class="p-5 space-y-5">
        <div class="rounded-xl bg-slate-900 text-white p-4"><div class="text-[10px] uppercase tracking-widest text-slate-300">Ringkasan Analisis</div><p class="text-sm leading-6 mt-2">${e22(a.narrative)}</p></div>
        <div class="grid md:grid-cols-3 gap-3">
          <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><div class="text-xs font-bold text-emerald-700">Kekuatan Utama</div><ul class="mt-2 space-y-1 text-xs text-emerald-900">${a.strengths.map(x=>`<li>- ${e22(x)}</li>`).join('')}</ul></div>
          <div class="rounded-xl border border-amber-100 bg-amber-50 p-4"><div class="text-xs font-bold text-amber-700">Gap / Pendalaman</div><ul class="mt-2 space-y-1 text-xs text-amber-900">${a.gaps.map(x=>`<li>- ${e22(x)}</li>`).join('')}</ul></div>
          <div class="rounded-xl border ${a.risk==='Tinggi'?'border-red-100 bg-red-50':a.risk==='Sedang'?'border-orange-100 bg-orange-50':'border-slate-200 bg-slate-50'} p-4"><div class="text-xs font-bold">Risk & Red Flag: ${e22(a.risk)}</div><ul class="mt-2 space-y-1 text-xs">${a.flags.length?a.flags.map(x=>`<li>- ${e22(x)}</li>`).join(''):'<li>- Tidak ada red flag dicentang</li>'}</ul>${r.red_flag_notes?`<div class="mt-2 text-xs"><b>Klarifikasi:</b> ${e22(r.red_flag_notes)}</div>`:''}</div>
        </div>
        <div class="grid md:grid-cols-2 gap-3">
          <div class="border rounded-xl p-4"><div class="text-xs font-bold text-slate-700">Verifikasi CV / Profil</div><p class="text-xs leading-5 text-slate-600 mt-2">${e22(a.cv)}</p></div>
          <div class="border rounded-xl p-4"><div class="text-xs font-bold text-slate-700">Catatan / Kesimpulan Interviewer</div><p class="text-xs leading-5 text-slate-600 mt-2">${e22(a.notes||'Belum ada catatan kesimpulan tambahan.')}</p></div>
        </div>
        ${first.length?`<div><div class="text-xs font-bold text-slate-700 mb-2">First Impression & Observation</div><div class="grid md:grid-cols-3 gap-2">${first.map(x=>`<div class="border rounded-lg p-3"><div class="text-xs font-semibold">${e22(x.name||'-')}</div><div class="text-lg font-bold mt-1">${e22(x.score||0)}/4</div>${x.note?`<div class="text-[11px] text-slate-500 mt-1">${e22(x.note)}</div>`:''}</div>`).join('')}</div></div>`:''}
        ${items.length?`<div><div class="text-xs font-bold text-slate-700 mb-2">Evidence Kompetensi</div><div class="overflow-x-auto border rounded-xl"><table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="text-left px-3 py-2">Kompetensi</th><th class="text-center px-3 py-2">Skor</th><th class="text-left px-3 py-2">Evidence</th></tr></thead><tbody>${items.map(x=>`<tr class="border-t"><td class="px-3 py-2 font-medium">${e22(x.competency_name||'-')}</td><td class="px-3 py-2 text-center font-bold">${e22(x.score||0)}/4</td><td class="px-3 py-2 text-slate-600">${e22(x.evidence||'-')}</td></tr>`).join('')}</tbody></table></div></div>`:''}
        ${review}
      </div>
    </section>`;
  }

  function reportData22(appId){
    const app=app22(appId),c=cand22(app?.candidate_id),p=pos22(app?.position_id),co=co22(app?.company_id),hr=card22(appId,'Interview HR'),user=card22(appId,'Interview User');
    if(!app||!c)return null;
    return{app,c,p,co,hr,user,hrA:hr?analysis22(hr,c):null,userA:user?analysis22(user,c):null};
  }

  function combinedNarrative22(d){
    if(!d.hr&&!d.user)return'Belum ada hasil interview yang tersimpan.';
    if(d.hr&&!d.user){
      return `Interview HR telah selesai dengan skor ${d.hrA.score.toFixed(1)}/100 dan keputusan ${d.hrA.decision}. Interview User belum tersedia. ${d.hrA.decision==='Perlu Review HR'?'HR perlu menetapkan keputusan workflow sebelum kandidat dapat dijadwalkan ke Interview User.':''}`;
    }
    const avg=((d.hrA.score+d.userA.score)/2).toFixed(1);
    return `Interview HR mencatat ${d.hrA.score.toFixed(1)}/100 (${d.hrA.decision}) dan Interview User ${d.userA.score.toFixed(1)}/100 (${d.userA.decision}). Rata-rata dua tahap ${avg}/100. Keputusan recruitment mengikuti hasil workflow tahap terbaru dan tetap harus mempertimbangkan evidence, red flag, serta catatan interviewer.`;
  }

  function reportBody22(appId){
    const d=reportData22(appId);if(!d)return'';
    return `<div id="v22InterviewReport" class="space-y-5">
      <div class="rounded-2xl overflow-hidden border border-slate-200 bg-white">
        <div class="bg-slate-900 text-white p-6"><div class="text-[10px] uppercase tracking-[.22em] text-slate-300">Recruitment Assessment Report</div><div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-2"><div><h2 class="text-2xl font-black">${e22(d.c.candidate_name||'-')}</h2><div class="text-sm text-slate-300 mt-1">${e22(d.p?.position_name||'-')} | ${e22(d.co?.brand||d.co?.company_name||'-')}</div></div><div class="text-xs text-slate-300">Application ${e22(d.app.application_id)}</div></div></div>
        <div class="p-5"><div class="grid grid-cols-1 md:grid-cols-3 gap-3"><div class="rounded-xl bg-slate-50 p-4"><div class="text-[10px] uppercase text-slate-400">Tahap Saat Ini</div><div class="font-bold mt-1">${e22(d.app.current_stage||'-')}</div></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-[10px] uppercase text-slate-400">Interview HR</div><div class="font-bold mt-1">${d.hr?`${d.hrA.score.toFixed(1)}/100 | ${e22(d.hrA.decision)}`:'Belum ada hasil'}</div></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-[10px] uppercase text-slate-400">Interview User</div><div class="font-bold mt-1">${d.user?`${d.userA.score.toFixed(1)}/100 | ${e22(d.userA.decision)}`:'Belum ada hasil'}</div></div></div>${profileGrid22(d.c)}</div>
      </div>
      <div class="rounded-xl border border-indigo-100 bg-indigo-50 p-5"><div class="text-xs font-bold text-indigo-700">Kesimpulan Terintegrasi</div><p class="text-sm leading-6 text-indigo-950 mt-2">${e22(combinedNarrative22(d))}</p><p class="text-[11px] text-indigo-600 mt-2">Analisa ini dirangkum dari skor, evidence, red flag, verifikasi CV, dan catatan scorecard yang tersimpan. Sistem tidak menambahkan fakta di luar data interview.</p></div>
      ${stageReport22(d.hr,d.c)}
      ${stageReport22(d.user,d.c)}
    </div>`;
  }

  function resetModal22(){const m=document.getElementById('modalContent');if(m)m.className='bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto';}
  function closeReport22(){if(typeof closeModal==='function')closeModal();resetModal22();}

  function viewInterviewResult22(appId){
    const d=reportData22(appId);if(!d)return showToast('Data kandidat tidak ditemukan','danger');
    if(!d.hr&&!d.user)return showToast('Belum ada hasil interview tersimpan','warning');
    const m=document.getElementById('modalContent');if(m)m.className='bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-y-auto';
    const hrReview=d.hr&&d.hrA.decision==='Perlu Review HR'&&d.app.current_stage==='Interview HR';
    const userReview=d.user&&d.userA.decision==='Perlu Review HR'&&d.app.current_stage==='Interview User';
    const nextHr=d.hr&&d.hrA.decision==='Lanjut'&&d.app.current_stage==='Interview HR';
    openModal(`<div class="p-5 md:p-6"><div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5"><div><h3 class="font-bold text-xl">Laporan Hasil Interview</h3><p class="text-xs text-slate-500 mt-1">Tampilan terintegrasi HR + User dan analisa berbasis evidence.</p></div><div class="flex flex-wrap gap-2"><button onclick="downloadInterviewReport('${e22(appId)}')" class="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm"><i class="fas fa-print mr-1"></i>Cetak / Simpan PDF</button>${hrReview?`<button onclick="openInterviewReviewV22('${e22(appId)}','Interview HR')" class="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm">Review Keputusan HR</button>`:''}${userReview?`<button onclick="openInterviewReviewV22('${e22(appId)}','Interview User')" class="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm">Review Keputusan User</button>`:''}${nextHr?`<button onclick="closeReportV22();openInterviewModal('${e22(appId)}','Interview User')" class="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm">Jadwalkan Interview User</button>`:''}<button onclick="closeReportV22()" class="px-3 py-2 border bg-white rounded-lg text-sm">Tutup</button></div></div>${reportBody22(appId)}</div>`);
  }

  function printCss22(){return `
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;font-size:11px;line-height:1.45}.page{max-width:900px;margin:0 auto}.head{background:#0f172a;color:white;padding:22px;border-radius:12px}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:9px;color:#cbd5e1}.title{font-size:24px;font-weight:800;margin:5px 0}.sub{color:#cbd5e1}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.card{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-top:10px}.soft{background:#f8fafc}.section{margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;page-break-inside:avoid}.section-head{padding:14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between}.score{font-size:26px;font-weight:800}.analysis{background:#0f172a;color:white;border-radius:9px;padding:12px;margin:12px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px 12px}.box{border:1px solid #e2e8f0;border-radius:9px;padding:10px}.green{background:#ecfdf5}.amber{background:#fffbeb}.red{background:#fef2f2}.blue{background:#eff6ff}.summary{background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px;margin-top:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:6px;text-align:left}th{background:#f8fafc}.small{font-size:9px;color:#64748b}.badge{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:4px 8px;font-weight:700}.footer{margin-top:16px;color:#64748b;font-size:9px}@media print{button{display:none!important}.section{break-inside:avoid}}`}
  function printStage22(r,c){
    if(!r)return'';const a=analysis22(r,c),items=Array.isArray(r.detail_json)?r.detail_json:[],first=Array.isArray(r.first_impression)?r.first_impression:[];
    return `<div class="section"><div class="section-head"><div><b>${e22(r.interview_type||'Interview')}</b><div class="small">${e22(r.interviewer||'-')} | ${e22(fmt22(r.assessed_at||r.created_at))}</div></div><div><span class="score">${a.score.toFixed(1)}</span> /100 <span class="badge">${e22(a.decision)}</span></div></div><div class="analysis"><b>Ringkasan Analisis</b><div style="margin-top:6px">${e22(a.narrative)}</div></div><div class="cols"><div class="box green"><b>Kekuatan</b><ul>${a.strengths.map(x=>`<li>${e22(x)}</li>`).join('')}</ul></div><div class="box amber"><b>Gap / Pendalaman</b><ul>${a.gaps.map(x=>`<li>${e22(x)}</li>`).join('')}</ul></div><div class="box"><b>Verifikasi CV / Profil</b><div>${e22(a.cv)}</div></div><div class="box ${a.flags.length?'red':''}"><b>Red Flag - Risiko ${e22(a.risk)}</b><ul>${a.flags.length?a.flags.map(x=>`<li>${e22(x)}</li>`).join(''):'<li>Tidak ada red flag dicentang</li>'}</ul></div></div>${first.length?`<div class="card"><b>First Impression</b><table style="margin-top:6px"><tr><th>Aspek</th><th>Skor</th><th>Catatan</th></tr>${first.map(x=>`<tr><td>${e22(x.name||'-')}</td><td>${e22(x.score||0)}/4</td><td>${e22(x.note||'-')}</td></tr>`).join('')}</table></div>`:''}${items.length?`<div class="card"><b>Evidence Kompetensi</b><table style="margin-top:6px"><tr><th>Kompetensi</th><th>Skor</th><th>Evidence</th></tr>${items.map(x=>`<tr><td>${e22(x.competency_name||'-')}</td><td>${e22(x.score||0)}/4</td><td>${e22(x.evidence||'-')}</td></tr>`).join('')}</table></div>`:''}${a.notes?`<div class="card"><b>Kesimpulan Interviewer</b><div style="margin-top:5px">${e22(a.notes)}</div></div>`:''}${a.reviewedAt?`<div class="card blue"><b>Review Workflow</b><div style="margin-top:5px">Keputusan: ${e22(a.decision)}${a.reviewedBy?' | Reviewer: '+e22(a.reviewedBy):''}${a.reviewNotes?' | Catatan: '+e22(a.reviewNotes):''}</div></div>`:''}</div>`;
  }
  function printInterviewReport22(appId){
    const d=reportData22(appId);if(!d||(!d.hr&&!d.user))return showToast('Belum ada hasil interview','warning');
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return showToast('Popup diblokir browser. Izinkan popup untuk mencetak laporan.','warning');
    const profile=[['Pendidikan',d.c.education],['Domisili',d.c.city],['Pengalaman',d.c.experience],['Posisi terakhir',d.c.last_role],['Perusahaan terakhir',d.c.last_company],['Alasan melamar',d.c.apply_reason]].filter(x=>x[1]);
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Laporan Interview - ${e22(d.c.candidate_name||'Kandidat')}</title><style>${printCss22()}</style></head><body><div class="page"><div class="head"><div class="eyebrow">Recruitment Assessment Report</div><div class="title">${e22(d.c.candidate_name||'-')}</div><div class="sub">${e22(d.p?.position_name||'-')} | ${e22(d.co?.brand||d.co?.company_name||'-')} | ${e22(d.app.application_id)}</div></div>${profile.length?`<div class="grid">${profile.map(([k,v])=>`<div class="card soft"><div class="small">${e22(k)}</div><b>${e22(v)}</b></div>`).join('')}</div>`:''}<div class="summary"><b>Kesimpulan Terintegrasi</b><div style="margin-top:5px">${e22(combinedNarrative22(d))}</div></div>${printStage22(d.hr,d.c)}${printStage22(d.user,d.c)}<div class="footer">Dokumen internal rekrutmen. Analisa dirangkum dari data scorecard yang tersimpan dan bukan fakta tambahan di luar hasil interview.</div></div><script>setTimeout(function(){window.print();},350);<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }

  function openInterviewReview22(appId,type){
    const d=reportData22(appId),r=type==='Interview User'?d?.user:d?.hr;if(!d||!r)return showToast('Hasil interview belum tersedia','warning');
    const a=analysis22(r,d.c),expectedStage=type;
    if(d.app.current_stage!==expectedStage)return showToast(`Review ${type} hanya dapat dilakukan saat kandidat berada di tahap ${expectedStage}.`,'warning');
    const m=document.getElementById('modalContent');if(m)m.className='bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto';
    openModal(`<div class="p-6"><div class="flex justify-between gap-3"><div><div class="text-[10px] uppercase tracking-wider text-slate-400">Adjudikasi Workflow</div><h3 class="font-bold text-xl">Review Keputusan ${e22(type)}</h3><p class="text-xs text-slate-500 mt-1">Rekomendasi scorecard: <b>${e22(r.recommendation||'-')}</b> | Skor <b>${a.score.toFixed(1)}/100</b></p></div><button onclick="closeInterviewReviewV22()" class="text-slate-400">X</button></div><div class="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-4"><div class="text-xs font-bold text-amber-800">Mengapa perlu review?</div><p class="text-xs leading-5 text-amber-900 mt-1">Hasil scorecard belum menghasilkan keputusan workflow final. HR harus menetapkan keputusan dengan catatan agar tahapan berikutnya dapat dibuka secara audit-friendly.</p></div><div class="grid md:grid-cols-2 gap-3 mt-4"><div class="border rounded-xl p-4"><div class="text-xs font-bold text-emerald-700">Kekuatan</div><ul class="text-xs mt-2 space-y-1">${a.strengths.map(x=>`<li>- ${e22(x)}</li>`).join('')}</ul></div><div class="border rounded-xl p-4"><div class="text-xs font-bold text-amber-700">Gap / Risiko</div><ul class="text-xs mt-2 space-y-1">${a.gaps.map(x=>`<li>- ${e22(x)}</li>`).join('')}</ul>${a.flags.length?`<div class="text-xs text-red-700 mt-2"><b>Red flag:</b> ${a.flags.map(e22).join(' | ')}</div>`:''}</div></div><label class="block text-xs font-semibold text-slate-600 mt-4">Catatan keputusan HR *</label><textarea id="v22InterviewReviewNotes" rows="4" class="w-full border rounded-xl p-3 text-sm mt-1" placeholder="Tuliskan alasan keputusan berdasarkan evidence, gap, red flag, atau hasil klarifikasi...">${e22(r.workflow_review_notes||'')}</textarea><div class="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-4"><button onclick="saveInterviewReviewV22('${e22(appId)}','${e22(type)}','Lanjut')" class="px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold">Lanjut</button><button onclick="saveInterviewReviewV22('${e22(appId)}','${e22(type)}','Perlu Review HR')" class="px-3 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold">Tetap Review</button><button onclick="saveInterviewReviewV22('${e22(appId)}','${e22(type)}','Talent Pool')" class="px-3 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold">Talent Pool</button><button onclick="saveInterviewReviewV22('${e22(appId)}','${e22(type)}','Tidak Lanjut')" class="px-3 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold">Tidak Lanjut</button></div><div class="mt-4 flex justify-between"><button onclick="viewInterviewResultV22('${e22(appId)}')" class="text-xs text-primary-700 font-semibold">Lihat laporan lengkap</button><button onclick="closeInterviewReviewV22()" class="px-3 py-2 border rounded-lg text-sm">Batal</button></div></div>`);
  }
  function closeInterviewReview22(){if(typeof closeModal==='function')closeModal();resetModal22();}
  async function saveInterviewReview22(appId,type,decision){
    const notes=document.getElementById('v22InterviewReviewNotes')?.value?.trim()||'';
    if(decision!=='Perlu Review HR'&&!notes)return showToast('Catatan keputusan wajib diisi untuk keputusan final.','warning');
    const {data,error}=await sb.rpc('review_interview_result',{p_application_id:appId,p_interview_type:type,p_decision:decision,p_notes:notes||null});
    if(error)return showToast('Gagal menyimpan review interview: '+error.message,'danger');
    if(typeof loadFromSupabase==='function')await loadFromSupabase();
    closeInterviewReview22();
    if(typeof renderSelectionQueueV21==='function'&&typeof currentPage!=='undefined'&&currentPage==='selection-queue')renderSelectionQueueV21(false);
    const app=app22(appId);if(typeof currentPage!=='undefined'&&currentPage==='candidate-detail'&&app&&typeof viewCandidateDetail==='function')setTimeout(()=>viewCandidateDetail(app.candidate_id,appId),50);
    const next=data?.next_action?` | Next: ${data.next_action}`:'';
    showToast(`Keputusan ${type}: ${decision}${next}`,'success');
  }

  Object.assign(window,{
    viewInterviewResult:viewInterviewResult22,
    viewInterviewResultV22:viewInterviewResult22,
    downloadInterviewReport:printInterviewReport22,
    printInterviewReportV22:printInterviewReport22,
    openInterviewReviewV22:openInterviewReview22,
    saveInterviewReviewV22:saveInterviewReview22,
    closeInterviewReviewV22:closeInterviewReview22,
    closeReportV22:closeReport22
  });

  console.log('%cRecruitment ATS V2.2 Workflow Quality active','color:#0f766e;font-weight:bold');
})();
