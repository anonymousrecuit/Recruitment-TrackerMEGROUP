/* ==========================================================================
   CANDIDATE DOSSIER V1 - PREVIEW FIRST
   Branch: feature/candidate-dossier-v1

   Design constraints:
   - Read-only collector. No database writes and no stage transitions.
   - Preview, future PDF, and future ZIP will share one normalized model.
   - Uses stored/engine data only; no invented assessment facts.
   - Does not average Interview HR + User to create a recruitment decision.
   - No reporting MutationObserver.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_DOSSIER_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_DOSSIER_V1_ACTIVE = true;

  const VERSION='1.0.1-preview';
  const state={lastModel:null,lastAppId:null};
  const TEST_LABELS={CIFT:'Tes Kognitif',PAPIKOSTIK:'PAPI Kostick',INTEGRITY:'Tes Integritas',MSDT:'MSDT',DISC:'DISC',OVERALL:'Kesimpulan'};

  const esc=v=>typeof window.atsEsc==='function'?window.atsEsc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const arr=v=>Array.isArray(v)?v:[];
  const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const fmtDate=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}};
  const fmtDateOnly=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}catch(_){return String(v);}};
  const money=v=>{if(!present(v))return'—';const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n):String(v);};
  const asJson=v=>{if(!v)return null;if(typeof v==='object')return v;try{return JSON.parse(v);}catch(_){return null;}};
  const appById=id=>typeof window.getApplication==='function'?window.getApplication(id):(window.DB?.applications||[]).find(x=>x.application_id===id);
  const candById=id=>typeof window.getCandidate==='function'?window.getCandidate(id):(window.DB?.candidates||[]).find(x=>x.candidate_id===id);
  const posById=id=>typeof window.getPosition==='function'?window.getPosition(id):(window.DB?.positions||[]).find(x=>x.position_id===id);
  const coById=id=>typeof window.getCompany==='function'?window.getCompany(id):(window.DB?.companies||[]).find(x=>x.company_id===id);

  function toast(msg,type='warning'){
    if(typeof window.showToast==='function')return window.showToast(msg,type);
    console.warn(msg);
  }

  function assertCompanyScope(app){
    if(!app)throw new Error('APPLICATION_NOT_FOUND');
    if(typeof window.scopeByCompany!=='function')return true;
    let scoped=[];
    try{scoped=window.scopeByCompany([app])||[];}catch(e){throw new Error('COMPANY_SCOPE_CHECK_FAILED');}
    if(!scoped.some(x=>x.application_id===app.application_id))throw new Error('ACCESS_DENIED_COMPANY_SCOPE');
    return true;
  }

  function latestBy(rows,dateFields){
    return [...arr(rows)].sort((a,b)=>{
      const ad=dateFields.map(k=>a?.[k]).find(Boolean)||0;
      const bd=dateFields.map(k=>b?.[k]).find(Boolean)||0;
      return new Date(bd||0)-new Date(ad||0);
    })[0]||null;
  }

  function scorecardsForApp(appId){
    let rows=[];
    try{if(typeof window.scorecardsFor==='function')rows=window.scorecardsFor(appId)||[];}catch(_){}
    if(!rows.length)rows=(window.DB?.scorecards||[]).filter(x=>x.application_id===appId);
    return rows;
  }

  function latestScorecard(appId,type){
    return latestBy(scorecardsForApp(appId).filter(x=>x.interview_type===type),['assessed_at','created_at']);
  }

  function latestOffering(appId){
    return latestBy((window.DB?.offerings||[]).filter(x=>x.application_id===appId),['offer_date','created_at']);
  }

  function latestJoin(appId){
    const candidates=[...(window.DB?.joins||[]),...(window.DB?.candidate_joins||[])];
    return latestBy(candidates.filter(x=>x.application_id===appId),['join_date','joined_at','created_at']);
  }

  async function readRpc(name,args){
    const client=window.sb;
    if(!client?.rpc)return{state:'error',data:null,error:{message:'SUPABASE_CLIENT_NOT_READY'}};
    try{
      const {data,error}=await client.rpc(name,args);
      if(error)return{state:'error',data:null,error};
      return{state:'available',data,error:null};
    }catch(error){return{state:'error',data:null,error};}
  }

  function interviewScore(card){
    if(!card)return null;
    const raw=card.weighted_score??card.score;
    const n=Number(raw);
    if(!Number.isFinite(n))return null;
    if(n<=4.1)return{value:n,scale:4,label:`${n.toFixed(1)}/4`};
    return{value:n,scale:100,label:`${n.toFixed(1)}/100`};
  }

  function normalizeInterview(card){
    if(!card)return{state:'not_available',data:null};
    const analysis=asJson(card.analysis_json)||{};
    return{state:'available',data:{
      id:card.scorecard_id||card.interview_scorecard_id||null,
      type:card.interview_type||null,
      interviewer:card.interviewer||card.interviewer_name||null,
      assessedAt:card.assessed_at||card.created_at||null,
      score:interviewScore(card),
      recommendation:card.recommendation||null,
      workflowDecision:card.workflow_decision||null,
      storedStrengths:arr(analysis.strengths),
      storedGaps:arr(analysis.gaps),
      storedSummary:analysis.summary||null,
      cvVerification:card.cv_background_notes||null,
      firstImpression:arr(asJson(card.first_impression)||card.first_impression),
      redFlags:arr(asJson(card.red_flags)||card.red_flags),
      redFlagNotes:card.red_flag_notes||null,
      evidence:arr(asJson(card.detail_json)||card.detail_json),
      conclusion:card.notes||card.conclusion||null,
      workflowReviewNotes:card.workflow_review_notes||null,
      workflowReviewedBy:card.workflow_reviewed_by||null,
      workflowReviewedAt:card.workflow_reviewed_at||null
    }};
  }

  function psychResultValue(r){
    const j=asJson(r?.result_json)||{};
    if(r?.test_code==='CIFT')return r.score==null?'—':`${Number(r.score).toFixed(0)}/30`;
    if(r?.test_code==='PAPIKOSTIK')return r.score==null?'—':`Avg ${Number(r.score).toFixed(2)}`;
    if(r?.test_code==='MSDT')return j.type||r.recommendation||'—';
    if(r?.test_code==='DISC'){
      const scores=j.scores||{};const top=Object.entries(scores).sort((a,b)=>Number(b[1])-Number(a[1]))[0];
      return top?`Dominan ${top[0]} (${top[1]})`:(r.recommendation||'—');
    }
    if(r?.test_code==='INTEGRITY')return`A ${j.total_a??'—'} · B ${j.total_b??'—'} · C ${j.total_c??'—'}`;
    if(present(r?.score))return String(r.score);
    return r?.recommendation||'—';
  }

  function normalizeScreening(rpc){
    if(rpc.state==='error')return{state:'error',error:rpc.error,data:null};
    if(!rpc.data?.exists)return{state:'not_available',error:null,data:null};
    const s=rpc.data.screening||{};
    return{state:'available',error:null,data:{
      screeningId:s.screening_id||null,
      evaluationMode:s.evaluation_mode||null,
      screenedAt:s.screened_at||null,
      screenedBy:s.screened_by||null,
      systemStatus:s.screening_status||null,
      matchScore:s.match_score,
      systemNotes:s.notes||null,
      reviewDecision:s.review_decision||null,
      reviewNotes:s.review_notes||null,
      reviewedBy:s.reviewed_by||null,
      reviewedAt:s.reviewed_at||null,
      details:arr(asJson(s.detail_json)||s.detail_json)
    }};
  }

  function normalizePsych(rpc){
    if(rpc.state==='error')return{state:'error',error:rpc.error,data:null};
    if(!rpc.data?.exists)return{state:'not_available',error:null,data:null};
    const s=rpc.data.session||{};
    return{state:'available',error:null,data:{
      sessionId:s.session_id||null,
      attemptNo:s.attempt_no||1,
      status:s.status||null,
      completedAt:s.completed_at||null,
      package:arr(asJson(s.test_package_snapshot)||s.test_package_snapshot),
      engineRecommendation:s.engine_recommendation||null,
      workflowDecision:s.workflow_decision||null,
      hrNotes:s.hr_notes||null,
      results:arr(rpc.data.results).map(r=>({
        code:r.test_code||null,
        label:TEST_LABELS[r.test_code]||r.test_code||'Tes',
        value:psychResultValue(r),
        score:r.score,
        interpretation:r.interpretation||null,
        recommendation:r.recommendation||null
      })),
      documents:arr(rpc.data.documents).map(d=>({fileName:d.file_name||'Dokumen Psikotes',storagePath:d.storage_path||null,mimeType:d.mime_type||null}))
    }};
  }

  function normalizeOffering(off){
    if(!off)return{state:'not_available',data:null};
    const detail=asJson(off.detail_json)||{};
    const allowedDetail=[
      ['Nomor Offering',off.ol_number||detail.ol_number],['Tipe Gaji',detail.salary_type],['Catatan Tunjangan',detail.allowance_note],
      ['Shift',detail.shift],['Jenis Hubungan Kerja',detail.employment_type],['Hari Kerja',detail.work_days],['Jam Kerja',detail.work_time||detail.work_hours],
      ['Probation',detail.probation],['Departemen',detail.department],['Atasan',detail.superior],['Penempatan',detail.placement],['Penandatangan',detail.signer_name]
    ].filter(([,v])=>present(v));
    return{state:'available',data:{
      offeringId:off.offering_id||null,status:off.status||null,salary:off.salary,allowance:off.allowance,benefit:off.benefit||null,
      offerDate:off.offer_date||null,deadline:off.deadline||null,expectedJoinDate:off.expected_join_date||null,details:allowedDetail
    }};
  }

  function buildTimeline(app,offering,join){
    const rows=[];
    const push=(date,event,actor,notes,source)=>{if(!date&&!event)return;rows.push({date:date||null,event:event||'Aktivitas',actor:actor||null,notes:notes||null,source});};
    push(app.application_date||app.applied_at||app.created_at,'Lamaran Masuk',null,null,'application');
    (window.DB?.history||[]).filter(x=>x.application_id===app.application_id).forEach(h=>push(h.date||h.created_at,h.stage||h.event||'Perubahan Tahap',h.user||h.actor,h.notes,'recruitment_history'));
    if(offering?.state==='available')push(offering.data.offerDate,'Offering',null,offering.data.status?`Status: ${offering.data.status}`:null,'offering');
    if(join){push(join.join_date||join.joined_at||join.created_at,'Join',join.confirmed_by||join.created_by,join.notes,'candidate_join');}
    const seen=new Set();
    return rows.sort((a,b)=>new Date(a.date||0)-new Date(b.date||0)).filter(x=>{const k=[x.date,x.event,x.actor,x.notes].join('|');if(seen.has(k))return false;seen.add(k);return true;});
  }

  function overallStatus(model){
    const app=model.application,off=model.offering.data,s=model.screening.data,p=model.psych.data,hr=model.hrInterview.data,u=model.userInterview.data;
    const status=String(app.status||'').trim(),stage=String(app.current_stage||'').trim();
    if(status==='Diterima'||stage==='Diterima'||off?.status==='Diterima')return{label:'DITERIMA',tone:'emerald'};
    if(status==='Tidak Lanjut'||stage==='Tidak Lanjut')return{label:'TIDAK LANJUT',tone:'red'};
    if(status==='Talent Pool'||stage==='Talent Pool')return{label:'TALENT POOL',tone:'blue'};

    if(['Lamaran Masuk','Screening CV','Screening HR'].includes(stage)){
      if(s?.reviewDecision==='Tidak Lanjut')return{label:'TIDAK LANJUT',tone:'red'};
      if(s?.reviewDecision==='Talent Pool')return{label:'TALENT POOL',tone:'blue'};
      if(s?.reviewDecision==='Lanjut')return{label:'LANJUT KE PSIKOTES',tone:'emerald'};
      if(s?.systemStatus==='Perlu Review HR')return{label:'PERLU REVIEW HR',tone:'amber'};
      if(s?.systemStatus==='Tidak Lolos Otomatis')return{label:'TIDAK LOLOS OTOMATIS',tone:'red'};
      if(s?.systemStatus==='Lolos Otomatis')return{label:'SCREENING LOLOS · MENUNGGU TINDAKAN HR',tone:'emerald'};
    }

    if(stage==='Psikotes'){
      const psychStatus=String(p?.status||'').trim();
      if(psychStatus==='Belum Dimulai')return{label:'PSIKOTES BELUM DIMULAI',tone:'slate'};
      if(psychStatus==='Dalam Proses')return{label:'PSIKOTES DALAM PROSES',tone:'blue'};
      if(['Kedaluwarsa','Dibatalkan'].includes(psychStatus))return{label:`PSIKOTES ${psychStatus.toUpperCase()}`,tone:'red'};
      if(psychStatus==='Selesai'){
        if(p?.workflowDecision==='Tidak Lanjut')return{label:'TIDAK LANJUT',tone:'red'};
        if(p?.workflowDecision==='Talent Pool')return{label:'TALENT POOL',tone:'blue'};
        if(p?.workflowDecision==='Lanjut')return{label:'LANJUT KE INTERVIEW HR',tone:'emerald'};
        return{label:'PERLU REVIEW HR',tone:'amber'};
      }
      return{label:'PSIKOTES · MENUNGGU STATUS',tone:'slate'};
    }

    const currentDecision=stage==='Interview User'?u?.workflowDecision:stage==='Interview HR'?hr?.workflowDecision:null;
    if(currentDecision==='Tidak Lanjut')return{label:'TIDAK LANJUT',tone:'red'};
    if(currentDecision==='Talent Pool')return{label:'TALENT POOL',tone:'blue'};
    if(currentDecision==='Perlu Review HR')return{label:'PERLU REVIEW HR',tone:'amber'};
    if(currentDecision==='Lanjut')return{label:`LANJUT · ${stage||'Workflow Aktif'}`,tone:'emerald'};
    if(off?.status)return{label:`OFFERING · ${off.status}`,tone:['Ditolak','Dibatalkan','Kadaluarsa'].includes(off.status)?'red':'amber'};
    return{label:`PROSES BERJALAN · ${stage||'Tahap belum tersedia'}`,tone:'slate'};
  }

  function synthesis(model){
    const lines=[];const concerns=[];
    const s=model.screening.data,p=model.psych.data,hr=model.hrInterview.data,u=model.userInterview.data,o=model.offering.data;
    if(s){lines.push(`Screening sistem: ${s.systemStatus||'belum ada status'}${s.reviewDecision?`; keputusan HR: ${s.reviewDecision}`:''}.`);if(s.reviewNotes)concerns.push(`Screening HR: ${s.reviewNotes}`);}
    if(p){
      const psychFinished=p.status==='Selesai';
      lines.push(`Psikotes: ${p.status||'status tidak tersedia'}${psychFinished&&p.engineRecommendation?`; rekomendasi engine: ${p.engineRecommendation}`:''}${psychFinished&&p.workflowDecision?`; keputusan HR: ${p.workflowDecision}`:''}.`);
      if(psychFinished&&p.hrNotes)concerns.push(`Catatan HR psikotes: ${p.hrNotes}`);
    }
    if(hr){lines.push(`Interview HR${hr.recommendation?` merekomendasikan ${hr.recommendation}`:''}${hr.workflowDecision?`; keputusan workflow: ${hr.workflowDecision}`:''}.`);hr.redFlags.forEach(x=>concerns.push(`Interview HR red flag: ${x}`));if(hr.workflowReviewNotes)concerns.push(`Review workflow HR: ${hr.workflowReviewNotes}`);}
    if(u){lines.push(`Interview User${u.recommendation?` merekomendasikan ${u.recommendation}`:''}${u.workflowDecision?`; keputusan workflow: ${u.workflowDecision}`:''}.`);u.redFlags.forEach(x=>concerns.push(`Interview User red flag: ${x}`));if(u.workflowReviewNotes)concerns.push(`Review workflow User: ${u.workflowReviewNotes}`);}
    if(o)lines.push(`Offering: ${o.status||'status tidak tersedia'}${o.expectedJoinDate?`; rencana join ${fmtDateOnly(o.expectedJoinDate)}`:''}.`);
    if(!lines.length)lines.push('Belum ada hasil assessment yang cukup untuk diringkas.');
    return{lines,concerns:[...new Set(concerns)].slice(0,12)};
  }

  async function collectCandidateDossierData(appId){
    const app=appById(appId);assertCompanyScope(app);
    const candidate=candById(app.candidate_id);if(!candidate)throw new Error('CANDIDATE_NOT_FOUND');
    const position=posById(app.position_id)||null,company=coById(app.company_id)||null;
    const [screenRpc,psychRpc]=await Promise.all([
      readRpc('get_screening_summary_for_application',{p_application_id:appId}),
      readRpc('get_psychotest_summary_for_application',{p_application_id:appId})
    ]);
    const offering=normalizeOffering(latestOffering(appId));
    const join=latestJoin(appId);
    const model={
      version:VERSION,generatedAt:new Date().toISOString(),
      application:app,candidate,position,company,
      screening:normalizeScreening(screenRpc),psych:normalizePsych(psychRpc),
      hrInterview:normalizeInterview(latestScorecard(appId,'Interview HR')),
      userInterview:normalizeInterview(latestScorecard(appId,'Interview User')),
      offering,join,
      timeline:buildTimeline(app,offering,join),
      attachments:{cvAvailable:!!candidate.cv_path,cvPath:candidate.cv_path||null,psychDocuments:[]}
    };
    model.attachments.psychDocuments=model.psych.data?.documents||[];
    model.overall=overallStatus(model);
    model.synthesis=synthesis(model);
    return model;
  }

  function toneClass(tone){return({emerald:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-700 border-red-200',blue:'bg-blue-50 text-blue-700 border-blue-200',amber:'bg-amber-50 text-amber-800 border-amber-200',slate:'bg-slate-50 text-slate-700 border-slate-200'})[tone]||'bg-slate-50 text-slate-700 border-slate-200';}
  function pill(text,tone='slate'){return`<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(tone)}">${esc(text||'—')}</span>`;}
  function section(letter,title,body,subtitle=''){return`<section class="bg-white border border-slate-200 rounded-2xl overflow-hidden"><div class="px-5 py-4 border-b bg-slate-50 flex gap-3"><div class="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black">${esc(letter)}</div><div><h4 class="font-bold text-slate-900">${esc(title)}</h4>${subtitle?`<p class="text-[11px] text-slate-500 mt-0.5">${esc(subtitle)}</p>`:''}</div></div><div class="p-5">${body}</div></section>`;}
  function emptyState(text){return`<div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">${esc(text)}</div>`;}
  function errorState(obj){return`<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Data tidak dapat dimuat.</b><div class="text-xs mt-1">${esc(obj?.error?.message||'Terjadi error saat membaca sumber data.')}</div></div>`;}
  function kv(label,value){if(!present(value))return'';return`<div class="rounded-xl bg-slate-50 p-3"><div class="text-[10px] uppercase tracking-wide text-slate-400">${esc(label)}</div><div class="text-sm font-semibold mt-1 break-words">${esc(value)}</div></div>`;}

  function statusCard(label,state,value,sub){
    let tone='slate',text=value||'Belum tersedia';
    if(state==='error'){tone='amber';text='Data tidak dapat dimuat';}
    else if(state==='not_available'){tone='slate';text='Belum dilakukan';}
    else if(/Tidak Lanjut|Tidak Lolos|Ditolak|Dibatalkan/i.test(text))tone='red';
    else if(/Lanjut|Lolos|Diterima/i.test(text))tone='emerald';
    else if(/Review|Menunggu|Offering/i.test(text))tone='amber';
    return`<div class="rounded-xl border p-4 ${toneClass(tone)}"><div class="text-[10px] uppercase tracking-wide opacity-70">${esc(label)}</div><div class="font-bold mt-1">${esc(text)}</div>${sub?`<div class="text-[11px] mt-1 opacity-80">${esc(sub)}</div>`:''}</div>`;
  }

  function renderScreening(model){
    const block=model.screening;if(block.state==='error')return errorState(block);if(block.state==='not_available')return emptyState('Screening belum dilakukan atau belum memiliki hasil tersimpan.');
    const s=block.data,detail=s.details;
    const header=`<div class="grid md:grid-cols-4 gap-2">${kv('Hasil Sistem',s.systemStatus)}${kv('Match Preference',s.matchScore==null?null:Number(s.matchScore).toFixed(1)+'%')}${kv('Keputusan HR',s.reviewDecision)}${kv('Tanggal Screening',fmtDate(s.screenedAt))}</div>${s.reviewNotes?`<div class="mt-3 rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm"><b>Catatan Review HR</b><div class="mt-1 text-slate-700">${esc(s.reviewNotes)}</div>${s.reviewedBy||s.reviewedAt?`<div class="text-[11px] text-slate-500 mt-2">${esc(s.reviewedBy||'Reviewer tidak tercatat')} · ${esc(fmtDate(s.reviewedAt))}</div>`:''}</div>`:''}`;
    if(!detail.length)return header+emptyState('Tidak ada detail rule screening tersimpan.');
    return header+`<div class="overflow-x-auto border rounded-xl mt-4"><table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="text-left p-3">Requirement</th><th class="text-left p-3">Rule</th><th class="text-left p-3">Aktual</th><th class="text-left p-3">Hasil</th></tr></thead><tbody>${detail.map(x=>`<tr class="border-t"><td class="p-3 font-medium">${esc(x.text||x.requirement_id||'—')}</td><td class="p-3">${esc(x.rule||'—')}</td><td class="p-3">${esc(present(x.actual)?x.actual:'—')}</td><td class="p-3">${esc(x.result||'—')}${present(x.score)?` <span class="text-slate-400">· Score ${esc(x.score)}</span>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderPsych(model){
    const block=model.psych;if(block.state==='error')return errorState(block);if(block.state==='not_available')return emptyState('Psikotes belum dilakukan atau belum memiliki sesi tersimpan.');
    const p=block.data,packageText=p.package.map(x=>TEST_LABELS[x.test_code]||x.test_code).filter(Boolean).join(' · ');
    return`<div class="grid md:grid-cols-4 gap-2">${kv('Status',p.status)}${kv('Attempt',p.attemptNo)}${kv('Selesai',fmtDate(p.completedAt))}${kv('Paket Tes',packageText||'—')}</div><div class="grid md:grid-cols-2 gap-3 mt-3"><div class="rounded-xl bg-slate-50 p-4"><div class="text-[10px] uppercase text-slate-400">Rekomendasi Engine</div><div class="font-semibold mt-1">${esc(p.engineRecommendation||'—')}</div></div><div class="rounded-xl bg-slate-50 p-4"><div class="text-[10px] uppercase text-slate-400">Keputusan HR</div><div class="font-semibold mt-1">${esc(p.workflowDecision||'—')}</div>${p.hrNotes?`<div class="text-xs text-slate-600 mt-2">${esc(p.hrNotes)}</div>`:''}</div></div>${p.results.length?`<div class="space-y-2 mt-4">${p.results.filter(x=>x.code!=='OVERALL').map(r=>`<div class="border rounded-xl p-4"><div class="flex justify-between gap-3"><b class="text-sm">${esc(r.label)}</b><span class="text-sm font-bold">${esc(r.value)}</span></div>${r.interpretation?`<p class="text-xs leading-5 text-slate-600 mt-2">${esc(r.interpretation)}</p>`:''}</div>`).join('')}</div>`:emptyState('Hasil per tes belum tersedia.')}`;
  }

  function renderInterview(block,label){
    if(block.state==='not_available')return emptyState(`${label} belum memiliki scorecard tersimpan.`);
    const d=block.data,analysisParts=[];
    if(d.storedSummary)analysisParts.push(`<div class="rounded-xl bg-slate-900 text-white p-4"><div class="text-[10px] uppercase tracking-wider text-slate-300">Analisis Tersimpan</div><p class="text-sm leading-6 mt-2">${esc(d.storedSummary)}</p></div>`);
    if(d.storedStrengths.length||d.storedGaps.length)analysisParts.push(`<div class="grid md:grid-cols-2 gap-3"><div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><div class="text-xs font-bold text-emerald-700">Kekuatan Tersimpan</div>${d.storedStrengths.length?`<ul class="text-xs mt-2 space-y-1">${d.storedStrengths.map(x=>`<li>• ${esc(x)}</li>`).join('')}</ul>`:'<div class="text-xs mt-2">Tidak ada strengths tersimpan.</div>'}</div><div class="rounded-xl border border-amber-100 bg-amber-50 p-4"><div class="text-xs font-bold text-amber-700">Gap Tersimpan</div>${d.storedGaps.length?`<ul class="text-xs mt-2 space-y-1">${d.storedGaps.map(x=>`<li>• ${esc(x)}</li>`).join('')}</ul>`:'<div class="text-xs mt-2">Tidak ada gaps tersimpan.</div>'}</div></div>`);
    return`<div class="flex flex-col md:flex-row md:justify-between gap-3"><div><div class="font-bold">${esc(label)}</div><div class="text-xs text-slate-500 mt-1">${esc(d.interviewer||'Interviewer tidak tercatat')} · ${esc(fmtDate(d.assessedAt))}</div></div><div class="flex flex-wrap items-start gap-2">${d.score?pill(d.score.label,'slate'):''}${d.recommendation?pill(`Rekomendasi: ${d.recommendation}`,'blue'):''}${d.workflowDecision?pill(`Workflow: ${d.workflowDecision}`,/Tidak Lanjut/i.test(d.workflowDecision)?'red':/Lanjut/i.test(d.workflowDecision)?'emerald':'amber'):''}</div></div><div class="space-y-3 mt-4">${analysisParts.join('')}${d.cvVerification?`<div class="border rounded-xl p-4"><b class="text-xs">Verifikasi CV / Profil</b><p class="text-xs leading-5 text-slate-600 mt-2">${esc(d.cvVerification)}</p></div>`:''}${d.firstImpression.length?`<div class="overflow-x-auto border rounded-xl"><table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="text-left p-3">First Impression</th><th class="text-center p-3">Skor</th><th class="text-left p-3">Catatan</th></tr></thead><tbody>${d.firstImpression.map(x=>`<tr class="border-t"><td class="p-3 font-medium">${esc(x.name||'—')}</td><td class="p-3 text-center">${esc(x.score||'—')}${x.score?'/4':''}</td><td class="p-3">${esc(x.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:''}${d.redFlags.length?`<div class="rounded-xl border border-red-100 bg-red-50 p-4"><div class="text-xs font-bold text-red-700">Red Flags Identified: ${d.redFlags.length}</div><ul class="text-xs mt-2 space-y-1">${d.redFlags.map(x=>`<li>• ${esc(x)}</li>`).join('')}</ul>${d.redFlagNotes?`<div class="mt-3 pt-3 border-t border-red-100 text-xs"><b>Klarifikasi:</b> ${esc(d.redFlagNotes)}</div>`:''}</div>`:`<div class="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Tidak ada red flag yang tercatat pada scorecard.</div>`}${d.evidence.length?`<div class="overflow-x-auto border rounded-xl"><table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="text-left p-3">Kompetensi</th><th class="text-center p-3">Skor</th><th class="text-left p-3">Evidence</th></tr></thead><tbody>${d.evidence.map(x=>`<tr class="border-t"><td class="p-3 font-medium">${esc(x.competency_name||'—')}</td><td class="p-3 text-center">${present(x.score)?esc(x.score)+'/4':'BT'}</td><td class="p-3 text-slate-600">${esc(x.evidence||'—')}</td></tr>`).join('')}</tbody></table></div>`:''}${d.conclusion?`<div class="border rounded-xl p-4"><b class="text-xs">Kesimpulan Interviewer</b><p class="text-xs leading-5 text-slate-600 mt-2">${esc(d.conclusion)}</p></div>`:''}${d.workflowReviewedAt||d.workflowReviewNotes?`<div class="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs"><b>Review Workflow</b>${d.workflowReviewedBy?` · ${esc(d.workflowReviewedBy)}`:''}${d.workflowReviewedAt?` · ${esc(fmtDate(d.workflowReviewedAt))}`:''}${d.workflowReviewNotes?`<div class="mt-2">${esc(d.workflowReviewNotes)}</div>`:''}</div>`:''}</div>`;
  }

  function renderOffering(model){
    const o=model.offering;if(o.state==='not_available')return emptyState('Offering belum dibuat untuk application ini.');const d=o.data;
    return`<div class="grid md:grid-cols-4 gap-2">${kv('Status',d.status)}${kv('Gaji',present(d.salary)?money(d.salary):null)}${kv('Tunjangan',present(d.allowance)?money(d.allowance):null)}${kv('Expected Join',fmtDateOnly(d.expectedJoinDate))}${kv('Tanggal Offer',fmtDateOnly(d.offerDate))}${kv('Deadline',fmtDateOnly(d.deadline))}${kv('Benefit',d.benefit)}</div>${d.details.length?`<div class="grid md:grid-cols-3 gap-2 mt-3">${d.details.map(([k,v])=>kv(k,v)).join('')}</div>`:''}`;
  }

  function renderTimeline(model){
    if(!model.timeline.length)return emptyState('Belum ada recruitment history tersimpan.');
    return`<div class="space-y-0">${model.timeline.map((x,i)=>`<div class="grid grid-cols-[18px_1fr] gap-3"><div class="relative flex justify-center"><div class="w-2.5 h-2.5 rounded-full bg-slate-700 mt-1.5 z-10"></div>${i<model.timeline.length-1?'<div class="absolute top-4 bottom-0 w-px bg-slate-200"></div>':''}</div><div class="pb-4"><div class="flex flex-wrap gap-x-2 items-center"><b class="text-sm">${esc(x.event)}</b><span class="text-[11px] text-slate-400">${esc(fmtDate(x.date))}</span></div>${x.actor?`<div class="text-xs text-slate-500 mt-1">Actor: ${esc(x.actor)}</div>`:''}${x.notes?`<div class="text-xs text-slate-600 mt-1">${esc(x.notes)}</div>`:''}</div></div>`).join('')}</div>`;
  }

  function renderDossier(model){
    const a=model.application,c=model.candidate,p=model.position,co=model.company,s=model.screening,psy=model.psych,hr=model.hrInterview,u=model.userInterview,o=model.offering;
    const profile=[['Pendidikan',c.education],['Jurusan',c.major],['Domisili',c.city],['Pengalaman',present(c.experience)?`${c.experience}${Number.isFinite(Number(c.experience))?' tahun':''}`:null],['Posisi Terakhir',c.last_role],['Perusahaan Terakhir',c.last_company],['Expected Salary',present(c.expected_salary)?money(c.expected_salary):null],['Notice Period',c.notice_period],['Bersedia Shift',c.willing_shift],['Alasan Melamar',c.apply_reason],['CV',c.cv_path?'Tersedia':'Belum tersedia']].filter(([,v])=>present(v));
    const overall=model.overall;
    const cover=`<div class="rounded-2xl overflow-hidden border border-slate-200 bg-white"><div class="bg-slate-950 text-white p-6"><div class="text-[10px] uppercase tracking-[.22em] text-slate-300">Candidate Dossier · Internal Recruitment</div><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mt-3"><div><h2 class="text-2xl md:text-3xl font-black">${esc(c.candidate_name||'—')}</h2><div class="text-sm text-slate-300 mt-1">${esc(p?.position_name||'—')} · ${esc(co?.brand||co?.company_name||'—')}</div></div>${pill(overall.label,overall.tone)}</div></div><div class="p-5 grid md:grid-cols-4 gap-2">${kv('Candidate ID',c.candidate_id)}${kv('Application ID',a.application_id)}${kv('Tahap Saat Ini',a.current_stage)}${kv('Status Application',a.status)}${kv('Source',c.source||a.source)}${kv('Tanggal Lamar',fmtDateOnly(a.application_date||a.applied_at||a.created_at))}</div></div>`;
    const exec=`<div class="grid md:grid-cols-2 xl:grid-cols-5 gap-2">${statusCard('Screening',s.state,s.data?.reviewDecision||s.data?.systemStatus)}${statusCard('Psikotes',psy.state,psy.data?.status==='Selesai'?(psy.data?.workflowDecision||'Perlu Review HR'):psy.data?.status,psy.data?.status==='Selesai'&&psy.data?.engineRecommendation?`Engine: ${psy.data.engineRecommendation}`:'')}${statusCard('Interview HR',hr.state,hr.data?.workflowDecision||hr.data?.recommendation,hr.data?.score?.label)}${statusCard('Interview User',u.state,u.data?.workflowDecision||u.data?.recommendation,u.data?.score?.label)}${statusCard('Offering',o.state,o.data?.status)}</div><div class="rounded-xl border ${toneClass(overall.tone)} p-4 mt-4"><div class="text-[10px] uppercase tracking-wide opacity-70">Overall Recruitment Recommendation</div><div class="text-lg font-black mt-1">${esc(overall.label)}</div><div class="text-xs mt-3 space-y-1">${model.synthesis.lines.map(x=>`<p>${esc(x)}</p>`).join('')}</div></div>`;
    const conclusion=`<div class="rounded-xl border ${toneClass(overall.tone)} p-5"><div class="text-[10px] uppercase tracking-wide opacity-70">Keputusan / Posisi Workflow Resmi</div><div class="text-xl font-black mt-1">${esc(overall.label)}</div><div class="mt-4"><div class="text-xs font-bold">Evidence Chain</div><ul class="text-sm mt-2 space-y-1">${model.synthesis.lines.map(x=>`<li>• ${esc(x)}</li>`).join('')}</ul></div>${model.synthesis.concerns.length?`<div class="mt-4 pt-4 border-t border-current/10"><div class="text-xs font-bold">Concern / Catatan Tersimpan</div><ul class="text-xs mt-2 space-y-1">${model.synthesis.concerns.map(x=>`<li>• ${esc(x)}</li>`).join('')}</ul></div>`:'<div class="text-xs mt-4 opacity-70">Tidak ada concern tambahan yang dapat ditarik langsung dari field tersimpan.</div>'}<p class="text-[10px] mt-4 opacity-70">Dossier tidak menghitung rata-rata Interview HR + User sebagai keputusan dan tidak menambahkan fakta assessment di luar data tersimpan.</p></div>`;
    const attachments=`<div class="grid md:grid-cols-2 gap-3"><div class="border rounded-xl p-4"><div class="text-xs font-bold">CV Kandidat</div><div class="text-sm mt-1">${model.attachments.cvAvailable?'Tersedia':'Belum tersedia'}</div>${model.attachments.cvAvailable?`<button onclick="openCandidateCV('${esc(c.candidate_id)}')" class="mt-3 px-3 py-2 border rounded-lg text-xs font-semibold">Buka CV</button>`:''}</div><div class="border rounded-xl p-4"><div class="text-xs font-bold">Dokumen Psikotes</div>${model.attachments.psychDocuments.length?`<div class="mt-2 space-y-2">${model.attachments.psychDocuments.map(d=>d.storagePath?`<button onclick="openPsychDocV2('${esc(d.storagePath)}')" class="block text-xs text-primary-700 underline">${esc(d.fileName)}</button>`:`<div class="text-xs">${esc(d.fileName)}</div>`).join('')}</div>`:'<div class="text-sm text-slate-500 mt-1">Belum ada dokumen tersimpan.</div>'}</div></div>`;
    return`<div id="candidateDossierPreviewV1" class="space-y-5">${cover}${section('B','Executive Recruitment Summary',exec,'Ringkasan status resmi tiap tahap; bukan rata-rata skor.')}${section('C','Candidate Profile',profile.length?`<div class="grid md:grid-cols-3 gap-2">${profile.map(([k,v])=>kv(k,v)).join('')}</div>`:emptyState('Profil terstruktur kandidat belum tersedia.'))}${section('D','Screening',renderScreening(model),'System result dipisahkan dari keputusan/review HR.')}${section('E','Psychotest',renderPsych(model),'Interpretasi hanya menggunakan hasil yang tersimpan dari SiPsiko.')}${section('F','Interview HR',renderInterview(hr,'Interview HR'),'Rekomendasi interviewer dipisahkan dari keputusan workflow.')}${section('G','Interview User',renderInterview(u,'Interview User'),'Evidence dan recommendation dari scorecard User.')}${section('H','Integrated Assessment Conclusion',conclusion,'Sintesis deterministik dari evidence chain yang tersedia.')}${section('I','Offering',renderOffering(model))}${section('J','Recruitment Timeline',renderTimeline(model),'Hanya event yang benar-benar tersimpan; stage yang tidak ada tidak diinferensikan.')}${section('K','CV & Attachments',attachments,'Dossier tidak bergantung pada keberhasilan fetch CV.')}</div>`;
  }

  function resetModal(){const m=document.getElementById('modalContent');if(m)m.className='bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto';}
  function backToCandidate(appId,candidateId){if(typeof window.closeModal==='function')window.closeModal();resetModal();setTimeout(()=>window.viewCandidateDetail?.(candidateId,appId),20);}

  async function openCandidateDossier(appId){
    const app=appById(appId);if(!app)return toast('Application tidak ditemukan.','danger');
    const m=document.getElementById('modalContent');if(m)m.className='bg-slate-50 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[96vh] overflow-y-auto';
    window.openModal?.(`<div class="p-6"><div class="flex items-center gap-3"><i class="fas fa-spinner fa-spin text-primary-600"></i><div><h3 class="font-bold">Menyiapkan Candidate Dossier</h3><p class="text-xs text-slate-500">Membaca Screening, Psikotes, Interview, Offering, dan Timeline...</p></div></div></div>`);
    try{
      const model=await collectCandidateDossierData(appId);state.lastModel=model;state.lastAppId=appId;
      const candidateId=model.candidate.candidate_id;
      if(m)m.className='bg-slate-50 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[96vh] overflow-y-auto';
      window.openModal?.(`<div class="p-5 md:p-6"><div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5"><div><h3 class="font-bold text-xl">Candidate Dossier</h3><p class="text-xs text-slate-500 mt-1">Preview V1 · Data contract A-K · ${esc(fmtDate(model.generatedAt))}</p></div><div class="flex flex-wrap gap-2"><button disabled title="Diaktifkan setelah preview tervalidasi" class="px-3 py-2 bg-slate-200 text-slate-500 rounded-lg text-xs cursor-not-allowed"><i class="fas fa-file-pdf mr-1"></i>Download Dossier PDF</button><button disabled title="Diaktifkan setelah preview tervalidasi" class="px-3 py-2 bg-slate-200 text-slate-500 rounded-lg text-xs cursor-not-allowed"><i class="fas fa-file-zipper mr-1"></i>Download Paket Dokumen</button><button onclick="backToCandidateDossierV1('${esc(appId)}','${esc(candidateId)}')" class="px-3 py-2 border bg-white rounded-lg text-xs">Kembali ke Candidate 360°</button></div></div><div class="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 mb-5"><b>Fase Preview:</b> tombol PDF dan Paket Dokumen sengaja belum diaktifkan sampai isi dossier ini divalidasi pada beberapa skenario kandidat.</div>${renderDossier(model)}</div>`);
    }catch(error){
      console.error('[Candidate Dossier V1] open failed',error);
      const message=error?.message==='ACCESS_DENIED_COMPANY_SCOPE'?'Anda tidak memiliki akses ke kandidat dari perusahaan ini.':error?.message==='COMPANY_SCOPE_CHECK_FAILED'?'Scope perusahaan belum siap. Muat ulang Tracker dan coba kembali.':(error?.message||'Candidate Dossier gagal dimuat.');
      window.openModal?.(`<div class="p-6"><h3 class="font-bold text-lg text-red-700">Candidate Dossier tidak dapat dimuat</h3><p class="text-sm text-slate-600 mt-2">${esc(message)}</p><div class="text-right mt-4"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Tutup</button></div></div>`);
    }
  }

  function injectDossierCard(appId){
    const root=document.getElementById('candidateDetailContent');if(!root||!appId)return;
    root.querySelector('#candidateDossierV1Card')?.remove();
    const app=appById(appId);if(!app)return;
    try{assertCompanyScope(app);}catch(_){return;}
    const card=document.createElement('div');card.id='candidateDossierV1Card';card.className='bg-white rounded-xl border border-slate-200 p-5 mb-4';
    card.innerHTML=`<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><div class="text-[10px] uppercase tracking-[.18em] text-indigo-500 font-bold">Interview / Assessment Terintegrasi</div><div class="font-bold text-lg mt-1">Candidate Dossier</div><p class="text-xs text-slate-500 mt-1">Satu preview untuk Screening, Psikotes, Interview HR, Interview User, Offering, Timeline, dan CV.</p></div><button onclick="openCandidateDossierV1('${esc(appId)}')" class="px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold whitespace-nowrap"><i class="fas fa-file-lines mr-2"></i>Lihat Dossier Kandidat</button></div>`;
    const next=root.querySelector('#v21NextActionCard');
    const screen=root.querySelector('#v2ScreenCard');
    if(next?.parentNode)next.insertAdjacentElement('afterend',card);
    else if(screen?.parentNode)screen.insertAdjacentElement('beforebegin',card);
    else root.appendChild(card);
  }

  function installDetailHook(){
    const current=window.viewCandidateDetail;
    if(typeof current!=='function'||current.__candidateDossierV1Wrapped)return;
    const wrapped=function(candidateId,appId){
      const result=current.apply(this,arguments);
      const resolved=appId||(window.DB?.applications||[]).find(a=>a.candidate_id===candidateId)?.application_id;
      if(resolved){
        setTimeout(()=>injectDossierCard(resolved),180);
        Promise.resolve(result).catch(()=>null).finally(()=>setTimeout(()=>injectDossierCard(resolved),260));
      }
      return result;
    };
    wrapped.__candidateDossierV1Wrapped=true;wrapped.__candidateDossierV1Original=current;window.viewCandidateDetail=wrapped;
  }

  Object.assign(window,{
    CandidateDossierV1:{version:VERSION,state,collect:collectCandidateDossierData,render:renderDossier,inject:injectDossierCard},
    openCandidateDossierV1:openCandidateDossier,
    collectCandidateDossierDataV1:collectCandidateDossierData,
    injectCandidateDossierV1:injectDossierCard,
    backToCandidateDossierV1:backToCandidate
  });

  installDetailHook();
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installDetailHook,1700));
  console.log('%cCandidate Dossier V1 Preview active','color:#4f46e5;font-weight:bold');
})();
