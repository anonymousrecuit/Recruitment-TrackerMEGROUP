/* ==========================================================================
   CANDIDATE CV VALIDATION GATE V1 - READ ONLY / HR REVIEW GATE
   Branch: feature/candidate-dossier-v1

   Purpose:
   - Validate CV availability/readability before manual screening rerun.
   - Compare candidate form name against the most plausible name line in CV text.
   - Distinguish candidate-document issues from system/parser errors.
   - No database writes, no stage transitions, no automatic rejection.
   - No MutationObserver. Uses explicit function wrappers only.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CV_VALIDATION_GATE_V1_ACTIVE) return;
  window.__ATS_CV_VALIDATION_GATE_V1_ACTIVE=true;

  const VERSION='1.0.0';
  const cache=new Map();

  const esc=v=>typeof window.atsEsc==='function'?window.atsEsc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const appById=id=>typeof window.getApplication==='function'?window.getApplication(id):(window.DB?.applications||[]).find(x=>x.application_id===id);
  const candById=id=>typeof window.getCandidate==='function'?window.getCandidate(id):(window.DB?.candidates||[]).find(x=>x.candidate_id===id);

  const STOP_WORDS=new Set([
    'curriculum','vitae','resume','cv','profile','profil','summary','ringkasan','about','tentang','saya',
    'experience','pengalaman','education','pendidikan','skill','skills','keahlian','contact','kontak',
    'human','resource','resources','manager','staff','supervisor','officer','admin','administrator','specialist',
    'accounting','finance','marketing','sales','customer','service','operational','operation','operations',
    'university','universitas','college','school','sekolah','institute','institut','academy','akademi'
  ]);
  const TITLE_WORDS=new Set(['dr','dra','drs','ir','h','hj','prof','mr','mrs','ms','bapak','ibu']);
  const SUFFIX_WORDS=new Set(['se','sh','sp','spd','spsi','skom','ssi','st','mm','mba','msc','ma','mpd','mpsi','ak','ca','cpa']);

  function toast(msg,type='warning'){
    if(typeof window.showToast==='function')return window.showToast(msg,type);
    console.warn(msg);
  }

  function normalizeTokens(name){
    return String(name||'')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z\s]/g,' ')
      .split(/\s+/).filter(Boolean)
      .filter(t=>!TITLE_WORDS.has(t)&&!SUFFIX_WORDS.has(t));
  }

  function compactName(name){return normalizeTokens(name).join(' ');}

  function plausibleNameLine(line,index){
    const raw=String(line||'').trim();
    if(!raw||raw.length<4||raw.length>72) return false;
    if(/@|https?:|www\.|linkedin|\+?\d[\d\s().-]{5,}/i.test(raw)) return false;
    if((raw.match(/\d/g)||[]).length>0) return false;
    const tokens=normalizeTokens(raw);
    if(tokens.length<2||tokens.length>6) return false;
    const stop=tokens.filter(t=>STOP_WORDS.has(t)).length;
    if(stop>=Math.max(1,Math.ceil(tokens.length/2))) return false;
    const letters=(raw.match(/[A-Za-zÀ-ÿ]/g)||[]).length;
    if(letters/Math.max(1,raw.length)<0.65) return false;
    return index<12;
  }

  function nameScore(formName,cvLine){
    const a=normalizeTokens(formName),b=normalizeTokens(cvLine);
    if(!a.length||!b.length)return 0;
    const ca=a.join(' '),cb=b.join(' ');
    if(ca===cb)return 1;
    const setB=new Set(b);
    const common=a.filter(t=>setB.has(t));
    const recall=common.length/a.length;
    const precision=common.length/b.length;
    const first=a[0]&&setB.has(a[0]);
    const last=a.length>1&&setB.has(a[a.length-1]);
    let score=0.72*recall+0.28*precision;
    if(first&&last)score=Math.max(score,0.88);
    if(recall===1)score=Math.max(score,0.94);
    return Math.min(1,score);
  }

  function detectCvName(formName,previewLines){
    const candidates=(previewLines||[]).map((line,index)=>({line:String(line||'').trim(),index})).filter(x=>plausibleNameLine(x.line,x.index));
    if(!candidates.length)return{detected:null,score:null,status:'unknown',confidence:'low'};
    candidates.forEach(x=>{x.score=nameScore(formName,x.line);});
    candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
    const best=candidates[0];
    if(best.score>=0.82)return{detected:best.line,score:best.score,status:'match',confidence:'high'};
    if(best.score>=0.50)return{detected:best.line,score:best.score,status:'partial',confidence:'medium'};

    // A low-similarity line is only treated as a mismatch indication when it is
    // located very early in the CV and looks strongly like a personal name.
    const early=candidates.filter(x=>x.index<=3).sort((a,b)=>a.index-b.index)[0];
    if(early&&early.score<0.35)return{detected:early.line,score:early.score,status:'possible_mismatch',confidence:'medium'};
    return{detected:best.line,score:best.score,status:'unknown',confidence:'low'};
  }

  function classifyError(reason){
    const r=String(reason||'');
    if(/SIGNED_CV_HELPER_NOT_READY|CV_AUTOREAD_NOT_AVAILABLE|CV_FETCH_HTTP_|LIBRARY_|JSPDF|SUPABASE|NETWORK|FAILED_TO_FETCH|LOAD_FAILED/i.test(r))return'system_error';
    return'error';
  }

  function buildResult(app,candidate,x){
    const identity=detectCvName(candidate?.candidate_name,x?.previewLines||[]);
    const base={
      version:VERSION,applicationId:app?.application_id||null,candidateId:candidate?.candidate_id||null,
      candidateName:candidate?.candidate_name||null,cvName:identity.detected,nameScore:identity.score,
      nameStatus:identity.status,nameConfidence:identity.confidence,
      cvState:x?.state||'module_unavailable',cvReason:x?.reason||null,cvFileName:x?.fileName||null,cvFileType:x?.fileType||null,
      checkedAt:new Date().toISOString(),gate:'review',label:'PERLU REVIEW DOKUMEN',tone:'amber',recommendation:'Review HR sebelum melanjutkan screening.'
    };

    if(!candidate?.cv_path||x?.state==='not_available')return{...base,gate:'review',label:'CV BELUM TERSEDIA',tone:'amber',recommendation:'Minta kandidat melengkapi CV.'};
    if(x?.state==='error'){
      const type=classifyError(x?.reason);
      return{...base,gate:type,label:type==='system_error'?'ERROR SISTEM CV':'CV TIDAK DAPAT DIPROSES',tone:'red',recommendation:type==='system_error'?'Coba ulang. Jangan jadikan error sistem sebagai alasan menolak kandidat.':'Review file secara manual; bila file rusak, minta upload ulang.'};
    }
    if(x?.state==='unsupported')return{...base,gate:'review',label:'FORMAT CV PERLU REVIEW',tone:'amber',recommendation:'Format belum didukung Auto-Read. Buka CV manual atau minta PDF/DOCX.'};
    if(x?.state==='text_unavailable')return{...base,gate:'review',label:'CV SCAN / TEKS TIDAK TERBACA',tone:'amber',recommendation:'Jangan auto-reject. Buka CV manual atau proses OCR.'};
    if(x?.state!=='extracted')return base;

    if(identity.status==='match')return{...base,gate:'allow',label:'VALID',tone:'emerald',recommendation:'CV terbaca dan nama konsisten. Dapat dilanjutkan ke screening.'};
    if(identity.status==='partial')return{...base,gate:'review',label:'NAMA PERLU KONFIRMASI',tone:'amber',recommendation:'Nama cukup mirip tetapi tidak identik. Verifikasi HR sebelum screening.'};
    if(identity.status==='possible_mismatch')return{...base,gate:'review',label:'IDENTITAS TERINDIKASI BERBEDA',tone:'red',recommendation:'Nama pada CV terindikasi berbeda signifikan. Klarifikasi kandidat sebelum keputusan.'};
    return{...base,gate:'review',label:'NAMA CV TIDAK DAPAT DIPASTIKAN',tone:'amber',recommendation:'CV terbaca, tetapi nama tidak dapat dicocokkan dengan yakin. Review manual.'};
  }

  function latestAppForCandidate(candidateId){
    return [...(window.DB?.applications||[])].filter(x=>x.candidate_id===candidateId).sort((a,b)=>new Date(b.application_date||b.applied_at||b.created_at||0)-new Date(a.application_date||a.applied_at||a.created_at||0))[0]||null;
  }

  async function validate(appId,{force=false}={}){
    const app=appById(appId);if(!app)throw new Error('APPLICATION_NOT_FOUND');
    const candidate=candById(app.candidate_id);if(!candidate)throw new Error('CANDIDATE_NOT_FOUND');
    const key=[appId,candidate.cv_path||''].join('|');
    if(!force&&cache.has(key))return cache.get(key);
    const promise=(async()=>{
      let x={state:'module_unavailable',reason:'CV_AUTOREAD_NOT_AVAILABLE',previewLines:[]};
      if(typeof window.CandidateCvAutoReadV1?.extract==='function')x=await window.CandidateCvAutoReadV1.extract(candidate,{force});
      return buildResult(app,candidate,x);
    })().catch(error=>({version:VERSION,applicationId:appId,candidateId:candidate.candidate_id,candidateName:candidate.candidate_name,cvName:null,nameScore:null,nameStatus:'unknown',nameConfidence:'low',cvState:'error',cvReason:error?.message||String(error),cvFileName:null,cvFileType:null,checkedAt:new Date().toISOString(),gate:'system_error',label:'ERROR SISTEM CV',tone:'red',recommendation:'Coba ulang. Jangan jadikan error sistem sebagai alasan menolak kandidat.'}));
    cache.set(key,promise);return promise;
  }

  function toneClasses(tone){
    return tone==='emerald'?'bg-emerald-50 border-emerald-200 text-emerald-900':tone==='red'?'bg-red-50 border-red-200 text-red-900':'bg-amber-50 border-amber-200 text-amber-900';
  }
  function badgeClasses(tone){
    return tone==='emerald'?'bg-emerald-100 text-emerald-700':tone==='red'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700';
  }
  function pct(v){return Number.isFinite(Number(v))?`${Math.round(Number(v)*100)}%`:'—';}

  function reuploadMessage(result){
    const name=result?.candidateName||'Kandidat';
    if(result?.nameStatus==='possible_mismatch'||result?.nameStatus==='partial'){
      return `Halo ${name}, kami sedang memverifikasi dokumen lamaran Anda. Nama pada data lamaran belum dapat dicocokkan dengan nama pada CV yang diunggah. Mohon konfirmasi nama lengkap sesuai identitas dan kirim CV terbaru dengan nama yang sesuai. Terima kasih.`;
    }
    return `Halo ${name}, kami sedang memverifikasi dokumen lamaran Anda. CV yang diunggah belum dapat diproses dengan baik. Mohon kirim ulang CV terbaru dalam format PDF atau DOCX yang dapat dibuka dan memiliki teks yang terbaca. Terima kasih.`;
  }

  async function copyReuploadMessage(appId){
    const result=await validate(appId);
    const text=reuploadMessage(result);
    try{await navigator.clipboard.writeText(text);toast('Template pesan sudah disalin.','success');}
    catch(_){window.prompt('Salin pesan berikut:',text);}
  }

  function openCv(candidateId){
    if(typeof window.openCandidateCV==='function')return window.openCandidateCV(candidateId);
    toast('Fungsi buka CV belum tersedia.','warning');
  }

  async function refreshCard(appId,candidateId){
    try{window.CandidateCvAutoReadV1?.clear?.(candidateId);for(const k of [...cache.keys()])if(k.startsWith(String(appId)+'|'))cache.delete(k);await injectCard(appId,candidateId,true);toast('Validasi CV diperbarui.','success');}
    catch(e){toast('Validasi ulang gagal: '+(e.message||e),'danger');}
  }

  async function injectCard(appId,candidateId,force=false){
    const root=document.getElementById('candidateDetailContent');if(!root)return;
    const app=appById(appId)||latestAppForCandidate(candidateId);if(!app)return;
    const candidate=candById(candidateId||app.candidate_id);if(!candidate)return;
    root.querySelector('#cvValidationGateV1Card')?.remove();

    const card=document.createElement('div');card.id='cvValidationGateV1Card';card.className='bg-white rounded-xl border border-slate-200 p-5 mb-4';
    card.innerHTML='<div class="flex items-center gap-2 text-sm"><i class="fas fa-spinner fa-spin text-primary-600"></i><b>Memvalidasi dokumen lamaran...</b></div>';
    const dossier=root.querySelector('#candidateDossierV1Card');
    const screen=root.querySelector('#v2ScreenCard');
    if(dossier?.parentNode)dossier.insertAdjacentElement('beforebegin',card);
    else if(screen?.parentNode)screen.insertAdjacentElement('beforebegin',card);
    else root.prepend(card);

    const result=await validate(app.application_id,{force});
    if(!document.body.contains(card))return;
    const nameDisplay=result.cvName||'Tidak dapat dipastikan';
    const scoreText=result.nameScore==null?'—':pct(result.nameScore);
    const autoRead=result.cvState==='extracted'?'Berhasil':result.cvState==='text_unavailable'?'Teks tidak tersedia':result.cvState==='unsupported'?'Format belum didukung':result.cvState==='error'?'Gagal':'Belum tersedia';
    card.innerHTML=`
      <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div class="text-[10px] uppercase tracking-[.18em] text-slate-500 font-bold">Validasi Dokumen Lamaran</div>
          <div class="flex flex-wrap items-center gap-2 mt-1"><div class="font-bold text-lg">CV Validation Gate</div><span class="px-2 py-1 rounded-full text-[10px] font-bold ${badgeClasses(result.tone)}">${esc(result.label)}</span></div>
          <p class="text-xs text-slate-500 mt-1">Validasi ini tidak melakukan auto-reject dan tidak mengubah tahap kandidat.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${candidate.cv_path?`<button onclick="openCvValidationGateV1('${esc(candidate.candidate_id)}')" class="px-3 py-2 border rounded-lg text-xs font-semibold">Buka CV</button>`:''}
          <button onclick="refreshCvValidationGateV1('${esc(app.application_id)}','${esc(candidate.candidate_id)}')" class="px-3 py-2 border rounded-lg text-xs font-semibold"><i class="fas fa-rotate mr-1"></i>Validasi Ulang</button>
          ${result.gate!=='allow'?`<button onclick="copyCvReuploadMessageV1('${esc(app.application_id)}')" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"><i class="fas fa-copy mr-1"></i>Salin Pesan Kandidat</button>`:''}
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 mt-4">
        <div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Nama Form Lamaran</div><b class="text-slate-800">${esc(candidate.candidate_name||'—')}</b></div>
        <div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Nama Terdeteksi di CV</div><b class="text-slate-800">${esc(nameDisplay)}</b><div class="text-[10px] text-slate-400 mt-1">Kecocokan ${esc(scoreText)}</div></div>
        <div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">CV / Format</div><b class="text-slate-800">${esc(result.cvFileName||'—')}</b><div class="text-[10px] text-slate-400 mt-1">${esc((result.cvFileType||'—').toUpperCase())}</div></div>
        <div class="bg-slate-50 rounded-lg p-3 text-xs"><div class="text-slate-400">Auto-Read</div><b class="text-slate-800">${esc(autoRead)}</b></div>
      </div>
      <div class="mt-3 rounded-lg border p-3 text-xs ${toneClasses(result.tone)}"><b>Rekomendasi:</b> ${esc(result.recommendation)}${result.cvReason?`<div class="mt-1 opacity-75">Kode: ${esc(result.cvReason)}</div>`:''}</div>`;
  }

  function showGateConfirm(appId,result,proceed){
    const html=`<div class="p-6"><div class="flex items-start gap-3"><div class="w-10 h-10 rounded-full ${result.tone==='red'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'} flex items-center justify-center"><i class="fas fa-file-circle-exclamation"></i></div><div><h3 class="font-bold text-lg">Dokumen perlu diperiksa</h3><p class="text-sm text-slate-600 mt-1">${esc(result.label)}</p></div></div><div class="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><b>Rekomendasi:</b> ${esc(result.recommendation)}</div><p class="text-xs text-slate-500 mt-3">Sistem tidak akan menolak kandidat otomatis. HR tetap dapat melanjutkan evaluasi Screening bila sudah melakukan verifikasi manual.</p><div class="flex justify-end gap-2 mt-5"><button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Batal</button><button id="cvGateProceedBtn" class="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold">Tetap Evaluasi Screening</button></div></div>`;
    if(typeof window.openModal!=='function'){if(confirm(result.recommendation+'\n\nTetap lanjut evaluasi screening?'))proceed();return;}
    window.openModal(html);
    setTimeout(()=>{const b=document.getElementById('cvGateProceedBtn');if(b)b.onclick=()=>{window.closeModal?.();proceed();};},0);
  }

  function installScreeningHook(){
    const current=window.rerunScreeningV2;
    if(typeof current!=='function'||current.__cvValidationGateV1Wrapped)return;
    const wrapped=async function(appId,...args){
      const result=await validate(appId);
      if(result.gate==='allow')return current.call(this,appId,...args);
      return showGateConfirm(appId,result,()=>current.call(this,appId,...args));
    };
    wrapped.__cvValidationGateV1Wrapped=true;wrapped.__cvValidationGateV1Original=current;window.rerunScreeningV2=wrapped;
  }

  function installDetailHook(){
    const current=window.viewCandidateDetail;
    if(typeof current!=='function'||current.__cvValidationGateV1Wrapped)return;
    const wrapped=function(candidateId,appId,...args){
      const result=current.call(this,candidateId,appId,...args);
      const resolvedApp=appId||latestAppForCandidate(candidateId)?.application_id||null;
      Promise.resolve(result).catch(()=>null).finally(()=>{
        if(resolvedApp){setTimeout(()=>injectCard(resolvedApp,candidateId),180);setTimeout(()=>injectCard(resolvedApp,candidateId),650);}
      });
      return result;
    };
    wrapped.__cvValidationGateV1Wrapped=true;wrapped.__cvValidationGateV1Original=current;window.viewCandidateDetail=wrapped;
  }

  Object.assign(window,{
    CandidateCvValidationGateV1:{version:VERSION,validate,inject:injectCard,cache},
    validateCandidateCvV1:validate,
    injectCvValidationGateV1:injectCard,
    refreshCvValidationGateV1:refreshCard,
    copyCvReuploadMessageV1:copyReuploadMessage,
    openCvValidationGateV1:openCv
  });

  installDetailHook();installScreeningHook();
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{installDetailHook();installScreeningHook();},2100));
  console.log('%cCandidate CV Validation Gate V1 active','color:#b45309;font-weight:bold');
})();
