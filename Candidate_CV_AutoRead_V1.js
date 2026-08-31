/* ==========================================================================
   CANDIDATE CV AUTO-READ V1.1 - CLIENT SIDE, READ ONLY
   Branch: feature/candidate-dossier-v1

   Purpose:
   - Read CV text on demand through the existing V2.4 signed URL flow.
   - PDF: pdf.js text extraction + conservative scan/blank detection.
   - DOCX: Mammoth raw text extraction.
   - DOC remains unsupported.
   - No database writes and no candidate-profile overwrite.
   - Extracted lines are factual text from the CV, not AI interpretation.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_CV_AUTOREAD_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_CV_AUTOREAD_V1_ACTIVE=true;

  const VERSION='1.1.0';
  const cache=new Map();
  const PDFJS_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const MAMMOTH_SRC='https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

  const SECTION_DEFS=[
    ['profile',/^(profil|profile|ringkasan|summary|professional summary|tentang saya|about me|objective|career objective)$/i],
    ['education',/^(pendidikan|riwayat pendidikan|education|educational background|academic background|academic history)$/i],
    ['experience',/^(pengalaman kerja|riwayat pekerjaan|pengalaman profesional|work experience|professional experience|employment history|experience)$/i],
    ['skills',/^(keahlian|kemampuan|kompetensi|skills?|technical skills?|core competencies|expertise)$/i],
    ['certifications',/^(sertifikasi|pelatihan|kursus|certifications?|training|courses?|licenses?)$/i],
    ['languages',/^(bahasa|kemampuan bahasa|languages?|language proficiency)$/i],
    ['organizations',/^(organisasi|pengalaman organisasi|organizations?|organizational experience|activities)$/i],
    ['achievements',/^(prestasi|penghargaan|achievements?|awards?|honors?)$/i]
  ];

  function present(v){return v!==null&&v!==undefined&&String(v).trim()!=='';}
  function cleanLine(v){return String(v||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();}
  function uniqueLines(lines,limit=30){
    const out=[],seen=new Set();
    for(const raw of lines||[]){
      const line=cleanLine(raw);
      if(!line)continue;
      const key=line.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);out.push(line);
      if(out.length>=limit)break;
    }
    return out;
  }

  function emptySections(){
    return{profile:[],education:[],experience:[],skills:[],certifications:[],languages:[],organizations:[],achievements:[]};
  }

  function loadScript(src,globalCheck){
    if(globalCheck())return Promise.resolve();
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){
      return new Promise((resolve,reject)=>{
        if(globalCheck())return resolve();
        existing.addEventListener('load',()=>globalCheck()?resolve():reject(new Error('LIBRARY_GLOBAL_MISSING')),{once:true});
        existing.addEventListener('error',()=>reject(new Error('LIBRARY_LOAD_FAILED')),{once:true});
      });
    }
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=src;s.async=true;
      s.onload=()=>globalCheck()?resolve():reject(new Error('LIBRARY_GLOBAL_MISSING'));
      s.onerror=()=>reject(new Error('LIBRARY_LOAD_FAILED'));
      document.head.appendChild(s);
    });
  }

  async function ensurePdfJs(){
    await loadScript(PDFJS_SRC,()=>!!window.pdfjsLib?.getDocument);
    if(window.pdfjsLib?.GlobalWorkerOptions)window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
    return window.pdfjsLib;
  }

  async function ensureMammoth(){
    await loadScript(MAMMOTH_SRC,()=>!!window.mammoth?.extractRawText);
    return window.mammoth;
  }

  function fileInfo(candidate){
    const raw=String(candidate?.cv_path||'').trim();
    let objectPath='';
    try{objectPath=typeof window.normalizeCvObjectPathV24==='function'?window.normalizeCvObjectPathV24(raw):raw;}catch(_){objectPath=raw;}
    let name=(objectPath.split('/').pop()||'CV').split('?')[0].split('#')[0];
    try{name=decodeURIComponent(name);}catch(_){}
    const match=name.match(/\.([a-z0-9]{1,6})$/i);
    return{rawPath:raw,objectPath,name,ext:(match?.[1]||'').toLowerCase()};
  }

  function pdfItemsToLines(items){
    const positioned=(items||[]).filter(x=>present(x?.str)).map(x=>({
      text:cleanLine(x.str),x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0)
    })).filter(x=>x.text);
    positioned.sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
    const rows=[];
    for(const item of positioned){
      let row=rows.find(r=>Math.abs(r.y-item.y)<=2.2);
      if(!row){row={y:item.y,items:[]};rows.push(row);}
      row.items.push(item);
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ')).map(cleanLine).filter(Boolean);
  }

  function imageOpSet(pdfjs){
    const ops=pdfjs?.OPS||{};
    return new Set([
      ops.paintImageXObject,ops.paintJpegXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject
    ].filter(v=>Number.isFinite(Number(v))).map(Number));
  }

  async function extractPdf(arrayBuffer){
    const pdfjs=await ensurePdfJs();
    const task=pdfjs.getDocument({data:new Uint8Array(arrayBuffer)});
    const pdf=await task.promise;
    const pages=[];
    let imageCount=0;
    const imageOps=imageOpSet(pdfjs);
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      const page=await pdf.getPage(pageNo);
      const text=await page.getTextContent();
      const lines=pdfItemsToLines(text.items);
      if(lines.length)pages.push(lines.join('\n'));
      if(imageOps.size){
        try{
          const opList=await page.getOperatorList();
          imageCount+=(opList?.fnArray||[]).filter(fn=>imageOps.has(Number(fn))).length;
        }catch(_){}
      }
      try{page.cleanup?.();}catch(_){}
    }
    const pageCount=pdf.numPages;
    try{await pdf.destroy();}catch(_){}
    return{text:pages.join('\n\n'),pageCount,imageCount};
  }

  async function extractDocx(arrayBuffer){
    const mammoth=await ensureMammoth();
    const result=await mammoth.extractRawText({arrayBuffer});
    return{text:String(result?.value||''),pageCount:null,imageCount:null};
  }

  function headingKey(line){
    const normalized=cleanLine(line).replace(/[:\-–—]+$/,'').trim();
    for(const [key,re] of SECTION_DEFS){if(re.test(normalized))return key;}
    return null;
  }

  function parseSections(text){
    const lines=String(text||'').split(/\r?\n/).map(cleanLine).filter(Boolean);
    const buckets=emptySections();
    let current=null;
    for(const line of lines){
      const key=headingKey(line);
      if(key){current=key;continue;}
      if(current)buckets[current].push(line);
    }
    Object.keys(buckets).forEach(k=>{buckets[k]=uniqueLines(buckets[k],25);});
    if(!buckets.education.length){
      buckets.education=uniqueLines(lines.filter(l=>/(\bSMA\b|\bSMK\b|\bD[1-4]\b|\bS[1-3]\b|bachelor|master|diploma|universitas|university|institut|politeknik|sekolah tinggi)/i.test(l)),12);
    }
    return{sections:buckets,previewLines:uniqueLines(lines,24),lineCount:lines.length};
  }

  function extractContacts(text){
    const s=String(text||'');
    const emails=uniqueLines((s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]),5);
    const linkedin=uniqueLines((s.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/gi)||[]),3);
    return{emails,linkedin};
  }

  function resultBase(candidate,info,state,reason,extra={}){
    return{
      version:VERSION,state,verified:false,candidateId:candidate?.candidate_id||null,
      fileName:info?.name||null,fileType:info?.ext||null,reason:reason||null,extractedAt:new Date().toISOString(),
      sections:extra.sections||emptySections(),previewLines:extra.previewLines||[],contacts:extra.contacts||{emails:[],linkedin:[]},
      textLength:Number(extra.textLength||0),lineCount:Number(extra.lineCount||0),byteLength:Number(extra.byteLength||0),
      pageCount:extra.pageCount??null,imageCount:extra.imageCount??null
    };
  }

  function unsupportedResult(candidate,info,reason){return resultBase(candidate,info,'unsupported',reason);}

  async function extractForCandidate(candidate,{force=false}={}){
    const info=fileInfo(candidate);
    if(!candidate?.cv_path)return resultBase(candidate,info,'not_available','CV_NOT_AVAILABLE');
    const key=[candidate.candidate_id||'',info.rawPath].join('|');
    if(!force&&cache.has(key))return cache.get(key);

    const promise=(async()=>{
      if(info.ext==='doc')return unsupportedResult(candidate,info,'DOC_LEGACY_NOT_SUPPORTED');
      if(!['pdf','docx'].includes(info.ext))return unsupportedResult(candidate,info,'FILE_TYPE_NOT_SUPPORTED');
      if(typeof window.getCandidateSignedCvUrlV24!=='function')throw new Error('SIGNED_CV_HELPER_NOT_READY');
      const signedUrl=await window.getCandidateSignedCvUrlV24(candidate.candidate_id);
      const response=await fetch(signedUrl,{method:'GET'});
      if(!response.ok)throw new Error('CV_FETCH_HTTP_'+response.status);
      const arrayBuffer=await response.arrayBuffer();
      const byteLength=arrayBuffer.byteLength||0;
      if(byteLength===0)return resultBase(candidate,info,'text_unavailable','FILE_EMPTY',{byteLength});

      const extracted=info.ext==='pdf'?await extractPdf(arrayBuffer):await extractDocx(arrayBuffer);
      const text=String(extracted.text||'').replace(/\u0000/g,'').trim();
      const parsed=parseSections(text);
      const contacts=extractContacts(text);
      const compactLength=text.replace(/\s/g,'').length;
      const extra={sections:parsed.sections,previewLines:parsed.previewLines,contacts,textLength:text.length,lineCount:parsed.lineCount,byteLength,pageCount:extracted.pageCount,imageCount:extracted.imageCount};

      if(compactLength===0){
        if(info.ext==='pdf'&&Number(extracted.imageCount||0)>0)return resultBase(candidate,info,'text_unavailable','PDF_SCAN_IMAGE_ONLY',extra);
        return resultBase(candidate,info,'text_unavailable',info.ext==='pdf'?'PDF_EMPTY_OR_NO_TEXT':'DOCX_EMPTY_OR_NO_TEXT',extra);
      }
      if(compactLength<40){
        if(info.ext==='pdf'&&Number(extracted.imageCount||0)>0)return resultBase(candidate,info,'text_unavailable','PDF_SCAN_OR_TEXT_TOO_SHORT',extra);
        return resultBase(candidate,info,'text_unavailable','TEXT_CONTENT_TOO_SHORT',extra);
      }
      return resultBase(candidate,info,'extracted',null,extra);
    })().catch(error=>resultBase(candidate,info,'error',error?.message||String(error)));
    cache.set(key,promise);
    return promise;
  }

  function clear(candidateId){
    for(const key of [...cache.keys()])if(!candidateId||key.startsWith(String(candidateId)+'|'))cache.delete(key);
  }

  Object.assign(window,{
    CandidateCvAutoReadV1:{version:VERSION,extract:extractForCandidate,clear,cache},
    extractCandidateCvV1:extractForCandidate
  });
  console.log('%cCandidate CV Auto-Read V1.1 active','color:#0f766e;font-weight:bold');
})();
