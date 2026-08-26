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
  function showAccessModal(appId,row){const app=appById(appId),c=candById(app?.candidate_id),p=posById(app?.position_id),co=coById(app?.company_id),code=row?.access_code||latestPsych(appId)?.access_code||'';const url=psychBaseUrl();const msg=`Halo ${c?.candidate_name||'Kandidat'},\\n\\nAnda diundang mengikuti Psikotes untuk posisi ${p?.position_name||'-'} di ${co?.brand||co?.company_name||'-'}.\\n\\nLink: ${url}\\nKode Akses: ${code}\\n\\nKode berlaku sampai ${fmt(row?.expires_at||latestPsych(appId)?.expires_at)}. Mohon selesaikan psikotes sesuai petunjuk.\\n\\nTerima kasih.
`;openModal(`<div class="p-6"><h3 class="font-bold text-lg">Akses Psikotes Kandidat</h3><p class="text-xs text-slate-500 mt-1">Link tetap + kode 8 karakter. Jangan kirim hasil psikotes kepada kandidat.</p><div class="mt-4 bg-slate-50 border rounded-xl p-4"><div class="text-xs text-slate-500">Link SiPsiko</div><div class="font-mono text-sm break-all mt-1">${esc(url)}</div><div class="text-xs text-slate-500 mt-4">Kode Akses</div><div class="font-mono text-3xl font-bold tracking-[.25em] mt-1">${esc(code)}</div><div class="text-xs text-slate-400 mt-2">Berlaku s.d. ${esc(fmt(row?.expires_at||latestPsych(appId)?.expires_at))}</div></div><textarea id="v2PsychWaText" class="w-full border rounded-lg p-3 text-xs mt-4" rows="8">${esc(msg)}</textarea><div class="grid grid-cols-2 gap-2 mt-4"><button onclick="copyTextV2('${esc(url)}','Link disalin')" class="px-3 py-2 border rounded-lg text-sm">Salin Link</button><button onclick="copyTextV2('${esc(code)}','Kode disalin')" class="px-3 py-2 border rounded-lg text-sm">Salin Kode</button><button onclick="copyPsychMessageV2()" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm">Salin Pesan</button><button onclick="openPsychWhatsAppV2('${appId}')" class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm"><i class="fab fa-whatsapp mr-1"></i>WhatsApp</button></div><div class="text-right mt-3"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Tutup</button></div></div>`);}
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
