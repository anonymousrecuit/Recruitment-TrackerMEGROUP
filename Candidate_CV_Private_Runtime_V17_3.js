
(function(){
  'use strict';

  const MARKER = 'CANDIDATE_CV_PRIVATE_RUNTIME_V17_3';
  if (window.__CANDIDATE_CV_PRIVATE_RUNTIME_V17_3__) return;
  window.__CANDIDATE_CV_PRIVATE_RUNTIME_V17_3__ = true;

  const cache = new Map();
  let patchTimer = null;

  function normalizePath(raw){
    let value = String(raw || '').trim();
    if(!value) return '';

    try{
      if(/^https?:\/\//i.test(value)){
        const u = new URL(value);
        let p = decodeURIComponent(u.pathname || '');
        const markers = [
          '/storage/v1/object/public/cv-uploads/',
          '/storage/v1/object/sign/cv-uploads/',
          '/storage/v1/object/authenticated/cv-uploads/'
        ];
        for(const marker of markers){
          const i = p.indexOf(marker);
          if(i >= 0) return p.slice(i + marker.length).replace(/^\/+/, '');
        }
      }
    }catch(_){}

    value = value.split('#')[0].split('?')[0];
    try{ value = decodeURIComponent(value); }catch(_){}
    value = value.replace(/^\/+/, '').replace(/^cv-uploads\//i, '');
    return value.replace(/^\/+/, '');
  }

  function absoluteUrl(raw){
    const s = String(raw || '').trim();
    if(!s) return '';
    if(/^https?:\/\//i.test(s)) return s;
    const base = String(window.SUPABASE_URL || '').replace(/\/+$/, '');
    return base + (s.startsWith('/') ? s : '/' + s);
  }

  async function signedUrlFor(raw){
    const path = normalizePath(raw);
    if(!path) throw new Error('CV_PATH_INVALID');

    if(cache.has(path)) return cache.get(path);

    const promise = (async()=>{
      if(!window.sb?.functions?.invoke) throw new Error('SUPABASE_CLIENT_NOT_READY');

      const { data: sessionData } = await window.sb.auth.getSession();
      if(!sessionData?.session?.access_token) throw new Error('LOGIN_SESSION_REQUIRED');

      const { data, error } = await window.sb.functions.invoke(
        'candidate-cv-signed-url',
        { body: { cv_path: path } }
      );

      if(error) throw error;
      if(data?.error) throw new Error(data.error);

      const url = absoluteUrl(data?.signed_url);
      if(!url) throw new Error('SIGNED_URL_EMPTY');

      setTimeout(()=>cache.delete(path), 12 * 60 * 1000);
      return url;
    })();

    cache.set(path, promise);

    try{
      return await promise;
    }catch(err){
      cache.delete(path);
      throw err;
    }
  }

  async function patchIframe(frame){
    if(!frame || frame.dataset.cvV173Busy === '1') return;

    const current = frame.getAttribute('src') || '';
    if(!current || !/cv-uploads/i.test(current)) return;
    if(/\/storage\/v1\/object\/sign\/cv-uploads\//i.test(current)) return;

    frame.dataset.cvV173Busy = '1';

    try{
      const signed = await signedUrlFor(current);
      frame.src = signed + '#toolbar=1&navpanes=0';
      frame.dataset.cvV173Signed = '1';
    }catch(err){
      console.error('[CV V17.3] preview signing failed', err);
    }finally{
      frame.dataset.cvV173Busy = '0';
    }
  }

  async function patchLink(anchor){
    if(!anchor || anchor.dataset.cvV173Busy === '1') return;

    const href = anchor.getAttribute('href') || '';
    const label = (anchor.textContent || '').trim();

    if(
      !/cv-uploads/i.test(href) &&
      !/buka penuh|unduh|download cv|buka cv/i.test(label)
    ) return;

    const source =
      /cv-uploads/i.test(href)
        ? href
        : document.querySelector('iframe[title="Preview CV"]')?.getAttribute('src') || '';

    if(!source || !/cv-uploads/i.test(source)) return;

    anchor.dataset.cvV173Busy = '1';

    try{
      const signed = await signedUrlFor(source);
      anchor.href = signed;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.dataset.cvV173Signed = '1';
    }catch(err){
      console.error('[CV V17.3] link signing failed', err);
    }finally{
      anchor.dataset.cvV173Busy = '0';
    }
  }

  async function patchAll(){
    const frames = Array.from(document.querySelectorAll('iframe[title="Preview CV"]'));
    for(const frame of frames) await patchIframe(frame);

    const links = Array.from(document.querySelectorAll('a[href]'));
    for(const a of links) await patchLink(a);
  }

  function schedulePatch(){
    clearTimeout(patchTimer);
    patchTimer = setTimeout(()=>patchAll().catch(()=>{}), 80);
  }

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src','href']
  });

  window.openCandidateCV = async function(candidateId){
    try{
      const candidate =
        (typeof window.getCandidate === 'function' && window.getCandidate(candidateId)) ||
        (window.DB?.candidates || []).find(x => x.candidate_id === candidateId);

      if(!candidate?.cv_path){
        if(typeof window.showToast === 'function') window.showToast('CV belum tersedia','warning');
        return;
      }

      const popup = window.open('about:blank','_blank');
      const signed = await signedUrlFor(candidate.cv_path);

      if(popup && !popup.closed){
        popup.opener = null;
        popup.location.replace(signed);
      }else{
        window.open(signed,'_blank','noopener');
      }
    }catch(err){
      console.error('[CV V17.3] openCandidateCV failed', err);
      if(typeof window.showToast === 'function'){
        window.showToast('CV tidak dapat dibuka. Silakan muat ulang lalu coba kembali.','danger');
      }
    }
  };

  window.CandidateCvV173 = { normalizePath, signedUrlFor, patchAll };

  schedulePatch();
  console.log('%c' + MARKER + ' active','color:#0f766e;font-weight:bold');
})();
