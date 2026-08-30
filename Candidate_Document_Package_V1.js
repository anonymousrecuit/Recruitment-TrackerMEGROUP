/* ==========================================================================
   CANDIDATE DOCUMENT PACKAGE V1 - ZIP
   Branch: feature/candidate-dossier-v1

   Design constraints:
   - Uses the same normalized model and native PDF Blob as Laporan Kandidat.
   - Includes CV original only when it can be fetched through the existing
     V2.4 signed URL flow.
   - Includes stored psychotest documents only when available.
   - No database writes, no stage transitions, no MutationObserver.
   - Failure of an attachment must never block the Laporan Kandidat PDF.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_DOCUMENT_PACKAGE_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_DOCUMENT_PACKAGE_V1_ACTIVE=true;

  const VERSION='1.0.0-package';
  const PSYCH_BUCKET='psychotest-results';

  const arr=v=>Array.isArray(v)?v:[];
  const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const safeName=v=>String(v||'Kandidat')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .slice(0,100)||'Kandidat';

  function toast(msg,type='warning'){
    if(typeof window.showToast==='function')return window.showToast(msg,type);
    console.warn(msg);
  }

  function fileNameFromPath(path,fallback='Dokumen'){
    const raw=String(path||'').split('#')[0].split('?')[0];
    try{
      const decoded=decodeURIComponent(raw);
      return decoded.split('/').filter(Boolean).pop()||fallback;
    }catch(_){
      return raw.split('/').filter(Boolean).pop()||fallback;
    }
  }

  function extensionFromName(name,fallback='pdf'){
    const m=String(name||'').match(/\.([a-z0-9]{1,8})$/i);
    return (m?.[1]||fallback).toLowerCase();
  }

  function contentTypeFromExt(ext){
    return ({
      pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'
    })[String(ext||'').toLowerCase()]||'application/octet-stream';
  }

  async function resolveModel(appId){
    const state=window.CandidateDossierV1?.state;
    if(!appId&&state?.lastModel)return state.lastModel;
    if(appId&&state?.lastModel?.application?.application_id===appId)return state.lastModel;
    if(typeof window.collectCandidateDossierDataV1==='function')return await window.collectCandidateDossierDataV1(appId);
    throw new Error('LAPORAN_COLLECTOR_NOT_AVAILABLE');
  }

  async function fetchBlob(url,label){
    if(!url)throw new Error((label||'FILE')+'_URL_EMPTY');
    const response=await fetch(url,{method:'GET'});
    if(!response.ok)throw new Error((label||'FILE')+'_HTTP_'+response.status);
    return await response.blob();
  }

  async function dossierPdfBlob(model){
    if(typeof window.CandidateDossierPdfV1?.blob==='function'){
      return await window.CandidateDossierPdfV1.blob(model);
    }
    if(typeof window.candidateDossierPdfBlobV1==='function'){
      return await window.candidateDossierPdfBlobV1(model);
    }
    throw new Error('LAPORAN_PDF_BUILDER_NOT_AVAILABLE');
  }

  async function addCv(folder,model,index,warnings){
    if(!model?.attachments?.cvAvailable||!model?.candidate?.candidate_id)return index;
    if(typeof window.getCandidateSignedCvUrlV24!=='function'){
      warnings.push('CV tersedia tetapi helper signed URL belum siap.');
      return index;
    }
    try{
      const signedUrl=await window.getCandidateSignedCvUrlV24(model.candidate.candidate_id);
      const blob=await fetchBlob(signedUrl,'CV');
      const originalName=model.attachments?.cvFileName||model.cvExtraction?.fileName||fileNameFromPath(model.attachments?.cvPath,'CV');
      const ext=extensionFromName(originalName,extensionFromName(model.attachments?.cvPath,'pdf'));
      const finalName=`${String(index).padStart(2,'0')}_CV_${safeName(model.candidate.candidate_name)}.${safeName(ext)}`;
      folder.file(finalName,blob,{binary:true,createFolders:false});
      return index+1;
    }catch(error){
      console.error('[Candidate Document Package V1] CV fetch failed',error);
      warnings.push('CV asli tidak dapat dimasukkan ke ZIP: '+(error?.message||String(error)));
      return index;
    }
  }

  async function signedPsychUrl(path){
    const client=window.sb;
    if(!client?.storage?.from)throw new Error('SUPABASE_STORAGE_NOT_READY');
    const {data,error}=await client.storage.from(PSYCH_BUCKET).createSignedUrl(path,180);
    if(error)throw error;
    const url=data?.signedUrl;
    if(!url)throw new Error('PSYCH_SIGNED_URL_EMPTY');
    return url;
  }

  async function addPsychDocuments(folder,model,startIndex,warnings){
    let index=startIndex;
    const docs=arr(model?.attachments?.psychDocuments).filter(d=>present(d?.storagePath));
    for(let i=0;i<docs.length;i++){
      const doc=docs[i];
      try{
        const signedUrl=await signedPsychUrl(doc.storagePath);
        const blob=await fetchBlob(signedUrl,'PSYCH_DOC');
        const originalName=doc.fileName||fileNameFromPath(doc.storagePath,'Hasil_Psikotes.pdf');
        const ext=extensionFromName(originalName,extensionFromName(doc.storagePath,'pdf'));
        const base=originalName.replace(/\.[^.]+$/,'')||`Hasil_Psikotes_${i+1}`;
        const finalName=`${String(index).padStart(2,'0')}_Psikotes_${safeName(base)}.${safeName(ext)}`;
        folder.file(finalName,blob,{binary:true,createFolders:false});
        index+=1;
      }catch(error){
        console.error('[Candidate Document Package V1] psych document fetch failed',doc,error);
        warnings.push(`Dokumen Psikotes ${doc.fileName||i+1} tidak dapat dimasukkan: ${error?.message||String(error)}`);
      }
    }
    return index;
  }

  async function buildCandidateDocumentPackage(modelOrAppId){
    if(!window.JSZip)throw new Error('JSZIP_NOT_AVAILABLE');
    const model=typeof modelOrAppId==='object'&&modelOrAppId?.application
      ? modelOrAppId
      : await resolveModel(modelOrAppId);

    const candidateName=safeName(model?.candidate?.candidate_name);
    const appId=safeName(model?.application?.application_id);
    const rootName=`Paket_Kandidat_${candidateName}_${appId}`;
    const zip=new window.JSZip();
    const folder=zip.folder(rootName);
    if(!folder)throw new Error('ZIP_FOLDER_CREATE_FAILED');

    const warnings=[];
    const pdfResult=await dossierPdfBlob(model);
    folder.file(`01_${safeName(pdfResult.filename||`Laporan_Kandidat_${candidateName}_${appId}.pdf`)}`,pdfResult.blob,{binary:true,createFolders:false});

    let nextIndex=2;
    nextIndex=await addCv(folder,model,nextIndex,warnings);
    nextIndex=await addPsychDocuments(folder,model,nextIndex,warnings);

    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    return{
      version:VERSION,
      blob,
      filename:`Paket_Dokumen_Kandidat_${candidateName}_${appId}.zip`,
      model,
      warnings,
      filesIncluded:nextIndex-1
    };
  }

  async function downloadCandidateDocumentPackage(modelOrAppId){
    let busyButton=null;
    try{
      const root=document.getElementById('modalContent');
      busyButton=[...(root?.querySelectorAll('button')||[])].find(b=>/Download Paket Dokumen/i.test(b.textContent||''))||null;
      if(busyButton){
        busyButton.disabled=true;
        busyButton.dataset.originalHtml=busyButton.innerHTML;
        busyButton.innerHTML='<i class="fas fa-spinner fa-spin mr-1"></i>Menyiapkan Paket...';
      }

      const result=await buildCandidateDocumentPackage(modelOrAppId);
      const url=URL.createObjectURL(result.blob);
      const a=document.createElement('a');
      a.href=url;a.download=result.filename;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);

      if(result.warnings.length){
        toast(`Paket Dokumen berhasil dibuat, tetapi ${result.warnings.length} lampiran tidak dapat disertakan. Laporan PDF tetap lengkap.`,'warning');
      }else{
        toast('Paket Dokumen Kandidat berhasil dibuat.','success');
      }
      return result;
    }catch(error){
      console.error('[Candidate Document Package V1] download failed',error);
      const message=error?.message==='JSZIP_NOT_AVAILABLE'?'Library ZIP belum tersedia.':(error?.message||'Paket dokumen gagal dibuat.');
      toast('Paket Dokumen gagal dibuat: '+message,'danger');
      return null;
    }finally{
      if(busyButton){
        busyButton.disabled=false;
        busyButton.innerHTML=busyButton.dataset.originalHtml||'<i class="fas fa-file-zipper mr-1"></i>Download Paket Dokumen';
        delete busyButton.dataset.originalHtml;
      }
    }
  }

  function activatePackageButton(){
    const root=document.getElementById('modalContent');
    if(!root)return;
    const buttons=[...root.querySelectorAll('button')];
    const packageButton=buttons.find(b=>/Download Paket Dokumen/i.test(b.textContent||''));
    if(packageButton){
      packageButton.disabled=false;
      packageButton.removeAttribute('disabled');
      packageButton.title='Download Laporan Kandidat, CV asli, dan dokumen Psikotes yang tersedia';
      packageButton.className='px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800';
      packageButton.innerHTML='<i class="fas fa-file-zipper mr-1"></i>Download Paket Dokumen';
      packageButton.onclick=()=>downloadCandidateDocumentPackage(window.CandidateDossierV1?.state?.lastAppId||null);
    }

    const previewRoot=root.querySelector('#candidateDossierPreviewV1');
    const info=previewRoot?.previousElementSibling;
    if(info && /(Fase PDF|Fase Laporan|Fase Paket)/i.test(info.textContent||'')){
      info.innerHTML='<b>Fase Paket Dokumen:</b> Laporan PDF dan Paket Dokumen Kandidat aktif. Paket berisi Laporan Kandidat, CV asli bila tersedia, dan dokumen Psikotes tersimpan bila tersedia.';
    }
  }

  function installOpenHook(){
    const current=window.openCandidateDossierV1;
    if(typeof current!=='function'||current.__candidateDocumentPackageV1Wrapped)return;
    const wrapped=async function(...args){
      const result=await current.apply(this,args);
      setTimeout(activatePackageButton,0);
      setTimeout(activatePackageButton,160);
      return result;
    };
    wrapped.__candidateDocumentPackageV1Wrapped=true;
    wrapped.__candidateDocumentPackageV1Original=current;
    window.openCandidateDossierV1=wrapped;
  }

  Object.assign(window,{
    CandidateDocumentPackageV1:{version:VERSION,build:buildCandidateDocumentPackage,download:downloadCandidateDocumentPackage,activate:activatePackageButton},
    buildCandidateDocumentPackageV1:buildCandidateDocumentPackage,
    downloadCandidateDocumentPackageV1:downloadCandidateDocumentPackage
  });

  installOpenHook();
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installOpenHook,1900));
  console.log('%cCandidate Document Package V1 active','color:#0f172a;font-weight:bold');
})();
