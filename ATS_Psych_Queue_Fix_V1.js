/* ==========================================================================
   ATS PSYCH QUEUE FIX V1.0.2
   Branch: feature/candidate-dossier-v1

   Purpose:
   1) Psychotest status "Belum Dimulai" / "Dalam Proses" must show
      decision "Belum Ada", not "Perlu Review HR".
   2) Refresh Psychotest cache before opening access/status.
   3) No database writes, no stage transitions, no MutationObserver.
   ========================================================================== */
(function(){
  'use strict';
  if(window.__ATS_PSYCH_QUEUE_FIX_V102_ACTIVE) return;
  window.__ATS_PSYCH_QUEUE_FIX_V102_ACTIVE = true;

  const VERSION = '1.0.2';

  function normalizeText(v){
    return String(v || '').replace(/\s+/g,' ').trim();
  }

  function patchQueueRows(){
    const page = document.getElementById('page-selection-queue');
    if(!page) return 0;

    let changed = 0;
    page.querySelectorAll('tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if(cells.length < 4) return;

      const processText = normalizeText(cells[2]?.textContent);
      const isPsych = /Tahap:\s*Psikotes/i.test(processText);
      const notFinished = /Belum Dimulai|Dalam Proses/i.test(processText);
      if(!isPsych || !notFinished) return;

      const decisionCell = cells[3];
      const badge = decisionCell?.querySelector('span') || decisionCell;
      if(!badge) return;

      if(normalizeText(badge.textContent) !== 'Belum Ada') changed += 1;
      badge.textContent = 'Belum Ada';
      if(badge !== decisionCell){
        badge.className = 'inline-flex px-2 py-1 rounded-full border text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-100';
      }
    });
    return changed;
  }

  function schedulePatch(){
    [0,80,200,500,1000,1800,3000,5000].forEach(ms => {
      setTimeout(() => {
        try{ patchQueueRows(); }
        catch(error){ console.warn('[ATS Psych Queue Fix] queue patch failed', error); }
      }, ms);
    });
  }

  const originalShowPsychAccess = window.showPsychAccessV2;
  if(typeof originalShowPsychAccess === 'function' && !originalShowPsychAccess.__psychQueueFixV102){
    const wrapped = async function(appId){
      try{
        if(typeof window.renderPsychV2 === 'function') await window.renderPsychV2(true);
      }catch(error){
        console.warn('[ATS Psych Queue Fix] refresh cache before access failed', error);
      }
      return originalShowPsychAccess.call(this, appId);
    };
    wrapped.__psychQueueFixV102 = true;
    window.showPsychAccessV2 = wrapped;
  }

  const originalRenderSelection = window.renderSelectionQueueV21;
  if(typeof originalRenderSelection === 'function' && !originalRenderSelection.__psychQueueFixV102){
    const wrapped = function(...args){
      const result = originalRenderSelection.apply(this, args);
      if(result && typeof result.then === 'function'){
        return result.finally(schedulePatch);
      }
      schedulePatch();
      return result;
    };
    wrapped.__psychQueueFixV102 = true;
    window.renderSelectionQueueV21 = wrapped;
  }

  const originalOpenSelectionTab = window.openSelectionTabV21;
  if(typeof originalOpenSelectionTab === 'function' && !originalOpenSelectionTab.__psychQueueFixV102){
    const wrapped = function(...args){
      const result = originalOpenSelectionTab.apply(this, args);
      schedulePatch();
      return result;
    };
    wrapped.__psychQueueFixV102 = true;
    window.openSelectionTabV21 = wrapped;
  }

  if(!document.__psychQueueFixV102ClickHook){
    document.__psychQueueFixV102ClickHook = true;
    document.addEventListener('click', function(event){
      const target = event.target?.closest?.(
        '#page-selection-queue .v21-tab-btn, #page-selection-queue button[onclick*="renderSelectionQueueV21"], .nav-item[data-page="selection-queue"]'
      );
      if(target) schedulePatch();
    }, true);
  }

  if(!window.__psychQueueFixV102HashHook){
    window.__psychQueueFixV102HashHook = true;
    window.addEventListener('hashchange', function(){
      if(/selection-queue/i.test(location.hash)) schedulePatch();
    });
  }

  schedulePatch();
  console.log(`%cATS Psych Queue Fix V${VERSION} active`, 'color:#7c3aed;font-weight:bold');
})();
