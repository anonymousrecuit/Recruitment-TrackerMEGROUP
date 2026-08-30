/* ==========================================================================
   CANDIDATE CV AUTO-READ V1 - CLIENT SIDE, READ ONLY
   Branch: feature/candidate-dossier-v1

   Purpose:
   - Read CV text on demand through the existing V2.4 signed URL flow.
   - PDF: pdf.js text extraction.
   - DOCX: Mammoth raw text extraction.
   - DOC / scanned-image PDF: reported as unsupported / text unavailable.
   - No database writes and no candidate-profile overwrite.
   - Extracted lines are factual text from the CV, not AI interpretation.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_CV_AUTOREAD_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_CV_AUTOREAD_V1_ACTIVE=true;

  const VERSION='1.0.0';
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
      if(!line) continue;
      const key=line.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);out.push(line);
      if(out.length>=limit) break;
    }
    return out;
  }

  function loadScript(src,globalCheck){
    if(globalCheck()) return Promise.resolve();
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){
      return new Promise((resolve,reject)=>{
        if(globalCheck()) return resolve();
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
    if(window.pdfjsLib?.GlobalWorkerOptions) window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
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
      text:cleanLine(x.str),
      x:Number(x.transform?.[4]||0),
      y:Number(x.transform?.[5]||0)
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

  async function extractPdf(arrayBuffer){
    const pdfjs=await ensurePdfJs();
    const task=pdfjs.getDocument({data:new Uint8Array(arrayBuffer)});
    const pdf=await task.promise;
    const pages=[];
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      const page=await pdf.getPage(pageNo);
      const text=await page.getTextContent();
      const lines=pdfItemsToLines(text.items);
      if(lines.length) pages.push(lines.join('\n'));
    }
    try{await pdf.destroy();}catch(_){}
    return pages.join('\n\n');
  }

  async function extractDocx(arrayBuffer){
    const mammoth=await ensureMammoth();
    const result=await mammoth.extractRawText({arrayBuffer});
    return String(result?.value||'');
  }

  function headingKey(line){
    const normalized=cleanLine(line).replace(/[:\-–—]+$/,'').trim();
    for(const [key,re] of SECTION_DEFS){if(re.test(normalized))return key;}
    return null;
  }

  function parseSections(text){
    const lines=String(text||'').split(/\r?\n/).map(cleanLine).filter(Boolean);
    const buckets={profile:[],education:[],experience:[],skills:[],certifications:[],languages:[],organizations:[],achievements:[]};
    let current=null;
    for(const line of lines){
      const key=headingKey(line);
      if(key){current=key;continue;}
      if(current) buckets[current].push(line);
    }
    Object.keys(buckets).forEach(k=>{buckets[k]=uniqueLines(buckets[k],25);});

    // Conservative fallback: only obvious degree / institution lines are surfaced as education.
    if(!buckets.education.length){
      buckets.education=uniqueLines(lines.filter(l=>/(\bSMA\b|\bSMK\b|\bD[1-4]\b|\bS[1-3]\b|bachelor|master|diploma|universitas|university|institut|politeknik|sekolah tinggi)/i.test(l)),12);
    }
    return{sections:buckets,previewLines:uniqueLines(lines,18),lineCount:lines.length};
  }

  function extractContacts(text){
    const s=String(text||'');
    const emails=uniqueLines((s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]),5);
    const linkedin=uniqueLines((s.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/gi)||[]),3);
    return{emails,linkedin};
  }

  function unsupportedResult(candidate,info,reason){
    return{
      version:VERSION,state:'unsupported',verified:false,candidateId:candidate?.candidate_id||null,
      fileName:info.name,fileType:info.ext||null,reason,extractedAt:new Date().toISOString(),
      sections:{profile:[],education:[],experience:[],skills:[],certifications:[],languages:[],organizations:[],achievements:[]},
      previewLines:[],contacts:{emails:[],linkedin:[]},textLength:0,lineCount:0
    };
  }

  async function extractForCandidate(candidate,{force=false}={}){
    const info=fileInfo(candidate);
    if(!candidate?.cv_path){
      return{version:VERSION,state:'not_available',verified:false,candidateId:candidate?.candidate_id||null,fileName:null,fileType:null,reason:'CV_NOT_AVAILABLE',sections:{},previewLines:[],contacts:{emails:[],linkedin:[]},textLength:0,lineCount:0};
    }
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
      let text='';
      if(info.ext==='pdf')text=await extractPdf(arrayBuffer);
      else if(info.ext==='docx')text=await extractDocx(arrayBuffer);
      text=String(text||'').replace(/\u0000/g,'').trim();
      const parsed=parseSections(text);
      const contacts=extractContacts(text);
      if(text.replace(/\s/g,'').length<40){
        return{
          version:VERSION,state:'text_unavailable',verified:false,candidateId:candidate.candidate_id,
          fileName:info.name,fileType:info.ext,reason:'TEXT_LAYER_NOT_FOUND',extractedAt:new Date().toISOString(),
          sections:parsed.sections,previewLines:parsed.previewLines,contacts,textLength:text.length,lineCount:parsed.lineCount
        };
      }
      return{
        version:VERSION,state:'extracted',verified:false,candidateId:candidate.candidate_id,
        fileName:info.name,fileType:info.ext,reason:null,extractedAt:new Date().toISOString(),
        sections:parsed.sections,previewLines:parsed.previewLines,contacts,textLength:text.length,lineCount:parsed.lineCount
      };
    })().catch(error=>({
      version:VERSION,state:'error',verified:false,candidateId:candidate?.candidate_id||null,fileName:info.name,fileType:info.ext||null,
      reason:error?.message||String(error),extractedAt:new Date().toISOString(),sections:{},previewLines:[],contacts:{emails:[],linkedin:[]},textLength:0,lineCount:0
    }));
    cache.set(key,promise);
    return promise;
  }

  function clear(candidateId){
    for(const key of [...cache.keys()]){if(!candidateId||key.startsWith(String(candidateId)+'|'))cache.delete(key);}
  }

  Object.assign(window,{
    CandidateCvAutoReadV1:{version:VERSION,extract:extractForCandidate,clear,cache},
    extractCandidateCvV1:extractForCandidate
  });
  console.log('%cCandidate CV Auto-Read V1 active','color:#0f766e;font-weight:bold');
})();
