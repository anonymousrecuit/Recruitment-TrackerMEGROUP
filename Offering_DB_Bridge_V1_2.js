/* Offering_DB_Bridge_V1_2.js
   Fixes Offering Workflow Patch V1.1 lookup when the ATS keeps DB as a global
   lexical variable (`let DB`) instead of `window.DB`.
*/
(function () {
  'use strict';

  const VERSION = '1.2.0';

  function syncDbReference() {
    try {
      if (typeof DB !== 'undefined' && DB) {
        window.DB = DB;
        return true;
      }
    } catch (_) {}
    return !!window.DB;
  }

  function wrapFunction(name) {
    const current = window[name];
    if (typeof current !== 'function' || current.__offeringDbBridgeV12) return;

    const wrapped = function (...args) {
      syncDbReference();
      return current.apply(this, args);
    };
    wrapped.__offeringDbBridgeV12 = true;
    window[name] = wrapped;
  }

  function install() {
    syncDbReference();

    // Queue action -> Offering management.
    wrapFunction('runNextActionV21');

    // Legacy/patch Offering entry point.
    wrapFunction('editOffering');

    // Exposed Offering Patch API.
    if (window.OfferingPatchV1 &&
        typeof window.OfferingPatchV1.openManage === 'function' &&
        !window.OfferingPatchV1.openManage.__offeringDbBridgeV12) {
      const originalOpenManage = window.OfferingPatchV1.openManage;
      const wrappedOpenManage = function (...args) {
        syncDbReference();
        return originalOpenManage.apply(this, args);
      };
      wrappedOpenManage.__offeringDbBridgeV12 = true;
      window.OfferingPatchV1.openManage = wrappedOpenManage;
    }

    // Keep reference fresh after the app finishes asynchronous boot/load.
    [0, 250, 750, 1500, 3000].forEach(ms => setTimeout(syncDbReference, ms));

    window.OfferingDbBridgeV12 = {
      VERSION,
      sync: syncDbReference,
      inspect(applicationId) {
        syncDbReference();
        return (window.DB?.offerings || []).filter(
          x => x.application_id === applicationId
        );
      }
    };

    console.log(
      `%cOffering DB Bridge V${VERSION} active`,
      'color:#059669;font-weight:bold'
    );
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (window.OfferingPatchV1 && typeof window.editOffering === 'function') {
        clearInterval(timer);
        install();
      } else if (tries >= 100) {
        clearInterval(timer);
        console.warn('[Offering DB Bridge] Offering patch not found.');
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
