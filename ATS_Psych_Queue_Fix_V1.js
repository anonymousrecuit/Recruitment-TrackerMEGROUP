/* ==========================================================================
   ATS PSYCH QUEUE FIX V1
   Branch: feature/candidate-dossier-v1

   Purpose:
   1) Do not display an HR decision for Psychotest sessions that are only
      "Belum Dimulai" or "Dalam Proses".
   2) Refresh the Psychotest V2 session cache before opening access/status so
      Antrian Seleksi and the Psychotest module do not disagree after login.
   3) No database writes, no stage transitions, no MutationObserver.
   ========================================================================== */
(function(){
  'use strict';
  if(window.__ATS_PSYCH_QUEUE_FIX_V1_ACTIVE) return;
  window.__ATS_PSYCH_QUEUE_FIX_V1_ACTIVE=true;

  function patchQueueRows(){
    const page=document.getElementById('page-selection-queue');
    if(!page) return;
    page.querySelectorAll('tr.v21-task-row').forEach(row=>{
      const cells=row.querySelectorAll('td');
      if(cells.length<4) return;
      const processText=(cells[2]?.textContent||'').replace(/\s+/g,' ').trim();
      const isPsych=/Tahap:\s*Psikotes/i.test(processText);
      const notFinished=/\bBelum Dimulai\b|\bDalam Proses\b/i.test(processText);
      if(!isPsych||!notFinished) return;
      const badge=cells[3]?.querySelector('span');
      if(!badge) return;
      badge.textContent='Belum Ada';
      badge.className='inline-flex px-2 py-1 rounded-full border text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-100';
    });
  }

  function schedulePatch(){
    setTimeout(patchQueueRows,0);
    setTimeout(patchQueueRows,120);
    setTimeout(patchQueueRows,800);
  }

  const originalShowPsychAccess=window.showPsychAccessV2;
  if(typeof originalShowPsychAccess==='function'&&!originalShowPsychAccess.__psychQueueFixV1){
    const wrapped=async function(appId){
      try{
        if(typeof window.renderPsychV2==='function'){
          await window.renderPsychV2(true);
        }
      }catch(error){
        console.warn('[ATS Psych Queue Fix] refresh cache before access failed',error);
      }
      return originalShowPsychAccess.call(this,appId);
    };
    wrapped.__psychQueueFixV1=true;
    window.showPsychAccessV2=wrapped;
  }

  const originalRenderSelection=window.renderSelectionQueueV21;
  if(typeof originalRenderSelection==='function'&&!originalRenderSelection.__psychQueueFixV1){
    const wrapped=function(...args){
      const result=originalRenderSelection.apply(this,args);
      if(result&&typeof result.then==='function') return result.finally(schedulePatch);
      schedulePatch();
      return result;
    };
    wrapped.__psychQueueFixV1=true;
    window.renderSelectionQueueV21=wrapped;
  }

  const originalOpenSelectionTab=window.openSelectionTabV21;
  if(typeof originalOpenSelectionTab==='function'&&!originalOpenSelectionTab.__psychQueueFixV1){
    const wrapped=function(...args){
      const result=originalOpenSelectionTab.apply(this,args);
      schedulePatch();
      return result;
    };
    wrapped.__psychQueueFixV1=true;
    window.openSelectionTabV21=wrapped;
  }

  const originalRenderPage=window.renderPage;
  if(typeof originalRenderPage==='function'&&!originalRenderPage.__psychQueueFixV1){
    const wrapped=function(page,...rest){
      const result=originalRenderPage.call(this,page,...rest);
      if(page==='selection-queue'){
        if(result&&typeof result.then==='function') result.finally(schedulePatch);
        else schedulePatch();
      }
      return result;
    };
    wrapped.__psychQueueFixV1=true;
    window.renderPage=wrapped;
  }

  schedulePatch();
  console.log('%cATS Psych Queue Fix V1 active','color:#7c3aed;font-weight:bold');
})();
