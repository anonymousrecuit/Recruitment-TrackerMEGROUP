/* ========================================================================== 
   LAPORAN KANDIDAT TERINTEGRASI PDF V1.2 - NATIVE A4
   Branch: feature/candidate-dossier-v1

   Design constraints:
   - Uses CandidateDossierV1.state.lastModel as the canonical normalized model.
   - Native jsPDF A4 portrait; no window.print, iframe print, or screenshots.
   - No database writes, no stage transitions, no MutationObserver.
   - Keeps the public API used by Candidate_Document_Package_V1.js.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_DOSSIER_PDF_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_DOSSIER_PDF_V1_ACTIVE=true;

  const VERSION='1.2.0-pdf';
  const PAGE={w:210,h:297,left:15,right:15,top:22,bottom:281};
  const CONTENT_W=PAGE.w-PAGE.left-PAGE.right;
  const NAVY=[15,23,42], SLATE=[71,85,105], MUTED=[100,116,139], LINE=[226,232,240], SOFT=[248,250,252];
  const TEST_LABELS={CIFT:'Tes Kognitif',PAPIKOSTIK:'PAPI Kostick',INTEGRITY:'Tes Integritas',MSDT:'MSDT',DISC:'DISC',OVERALL:'Kesimpulan'};

  const arr=v=>Array.isArray(v)?v:[];
  const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const asText=v=>present(v)?String(v):'—';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const fmtDate=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}};
  const fmtDateOnly=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}catch(_){return String(v);}};
  const money=v=>{if(!present(v))return'—';const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n):String(v);};
  const safeName=v=>String(v||'Kandidat').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'Kandidat';

  function toast(msg,type='warning'){
    if(typeof window.showToast==='function') return window.showToast(msg,type);
    console.warn(msg);
  }

  function jsPDFCtor(){ return window.jspdf?.jsPDF||window.jsPDF||null; }

  function createPdf(model){
    const Ctor=jsPDFCtor();
    if(!Ctor) throw new Error('JSPDF_NOT_AVAILABLE');
    const doc=new Ctor({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    doc.setProperties({
      title:`Laporan Kandidat Terintegrasi - ${model?.candidate?.candidate_name||'Kandidat'}`,
      subject:`Laporan Rekrutmen ${model?.application?.application_id||''}`,
      author:'MEGROUP Recruitment Tracker',
      creator:`Laporan Kandidat PDF ${VERSION}`
    });
    return {doc,model,y:PAGE.top,pageNo:1};
  }

  function setFont(ctx,size=9,style='normal',color=NAVY){
    ctx.doc.setFont('helvetica',style);
    ctx.doc.setFontSize(size);
    ctx.doc.setTextColor(...color);
  }

  function addPage(ctx){
    ctx.doc.addPage('a4','portrait');
    ctx.pageNo+=1;
    ctx.y=PAGE.top;
  }

  function ensure(ctx,height){ if(ctx.y+height>PAGE.bottom) addPage(ctx); }

  function wrap(ctx,text,width,size=9,style='normal'){
    setFont(ctx,size,style);
    return ctx.doc.splitTextToSize(String(text??'—'),Math.max(8,width));
  }

  function textBlock(ctx,text,opts={}){
    const x=opts.x??PAGE.left, width=opts.width??CONTENT_W;
    const size=opts.size??8.6, style=opts.style??'normal', color=opts.color??SLATE;
    const lineH=opts.lineH??4.25, gap=opts.gap??1.8;
    const lines=wrap(ctx,text,width,size,style);
    let i=0;
    while(i<lines.length){
      const fit=Math.max(1,Math.floor((PAGE.bottom-ctx.y)/lineH));
      const chunk=lines.slice(i,i+fit);
      ensure(ctx,chunk.length*lineH);
      setFont(ctx,size,style,color);
      ctx.doc.text(chunk,x,ctx.y,{baseline:'top'});
      ctx.y+=chunk.length*lineH;
      i+=chunk.length;
      if(i<lines.length) addPage(ctx);
    }
    ctx.y+=gap;
  }

  function divider(ctx,gap=3){
    ctx.y+=gap;
    ctx.doc.setDrawColor(...LINE);
    ctx.doc.line(PAGE.left,ctx.y,PAGE.w-PAGE.right,ctx.y);
    ctx.y+=gap;
  }

  function sectionHeading(ctx,title,subtitle=''){
    ensure(ctx,subtitle?16:12);
    ctx.doc.setFillColor(37,99,235);
    ctx.doc.roundedRect(PAGE.left,ctx.y,2.2,subtitle?12:8.5,1,1,'F');
    setFont(ctx,11.5,'bold',NAVY);
    ctx.doc.text(title,PAGE.left+6,ctx.y,{baseline:'top'});
    if(subtitle){
      setFont(ctx,7.2,'normal',MUTED);
      const lines=ctx.doc.splitTextToSize(subtitle,CONTENT_W-10);
      ctx.doc.text(lines,PAGE.left+6,ctx.y+6,{baseline:'top'});
      ctx.y+=Math.max(14,7+lines.length*3.4);
    }else ctx.y+=11;
  }

  function statusTone(label){
    const s=String(label||'').toLowerCase();
    if(/lulus|lanjut|diterima|selesai|valid|sesuai/.test(s)) return {fill:[236,253,245],border:[167,243,208],text:[6,95,70]};
    if(/tolak|reject|gagal|tidak sesuai|berbeda|error/.test(s)) return {fill:[254,242,242],border:[254,202,202],text:[153,27,27]};
    if(/review|menunggu|proses|klarifikasi|belum/.test(s)) return {fill:[255,251,235],border:[253,230,138],text:[146,64,14]};
    return {fill:[241,245,249],border:[203,213,225],text:[51,65,85]};
  }

  function pill(ctx,label,x,y,maxW=60){
    const value=clean(label)||'—';
    const tone=statusTone(value);
    setFont(ctx,7.2,'bold',tone.text);
    const lines=ctx.doc.splitTextToSize(value,Math.max(15,maxW-8));
    const h=Math.max(7,4+lines.length*3.2);
    ctx.doc.setFillColor(...tone.fill);ctx.doc.setDrawColor(...tone.border);
    ctx.doc.roundedRect(x,y,maxW,h,3,3,'FD');
    ctx.doc.text(lines,x+4,y+2.2,{baseline:'top'});
    return h;
  }

  function labelValueGrid(ctx,items,cols=2){
    const values=arr(items).filter(([k,v])=>present(v));
    if(!values.length)return;
    const gap=8, colW=(CONTENT_W-gap*(cols-1))/cols;
    for(let i=0;i<values.length;i+=cols){
      const row=values.slice(i,i+cols);
      const heights=row.map(([,value])=>Math.max(11,5+wrap(ctx,asText(value),colW,8.7,'bold').length*4));
      const h=Math.max(...heights);
      ensure(ctx,h+2);
      row.forEach(([label,value],j)=>{
        const x=PAGE.left+j*(colW+gap);
        setFont(ctx,6.5,'normal',MUTED);
        ctx.doc.text(String(label).toUpperCase(),x,ctx.y,{baseline:'top'});
        setFont(ctx,8.7,'bold',NAVY);
        ctx.doc.text(ctx.doc.splitTextToSize(asText(value),colW),x,ctx.y+4.2,{baseline:'top'});
      });
      ctx.y+=h+2;
    }
  }

  function callout(ctx,title,body,kind='neutral'){
    const palette={
      neutral:{fill:[248,250,252],border:[226,232,240],title:[51,65,85]},
      info:{fill:[239,246,255],border:[191,219,254],title:[29,78,216]},
      warn:{fill:[255,251,235],border:[253,230,138],title:[146,64,14]},
      good:{fill:[236,253,245],border:[167,243,208],title:[6,95,70]},
      danger:{fill:[254,242,242],border:[254,202,202],title:[153,27,27]}
    }[kind]||null;
    const p=palette||{fill:SOFT,border:LINE,title:SLATE};
    const bodyLines=wrap(ctx,body,CONTENT_W-10,8.2,'normal');
    const titleLines=wrap(ctx,title,CONTENT_W-10,7.5,'bold');
    const h=6+titleLines.length*3.6+bodyLines.length*4+4;
    ensure(ctx,h+2);
    ctx.doc.setFillColor(...p.fill);ctx.doc.setDrawColor(...p.border);
    ctx.doc.roundedRect(PAGE.left,ctx.y,CONTENT_W,h,2,2,'FD');
    setFont(ctx,7.5,'bold',p.title);ctx.doc.text(titleLines,PAGE.left+4,ctx.y+3,{baseline:'top'});
    setFont(ctx,8.2,'normal',SLATE);ctx.doc.text(bodyLines,PAGE.left+4,ctx.y+4+titleLines.length*3.6,{baseline:'top'});
    ctx.y+=h+3;
  }

  function bullets(ctx,items,opts={}){
    const values=arr(items).filter(present);
    if(!values.length)return;
    values.forEach(item=>{
      const lines=wrap(ctx,clean(item),CONTENT_W-8,8.3,'normal');
      const h=Math.max(5,lines.length*4.1);
      ensure(ctx,h+1);
      setFont(ctx,8.3,'bold',[37,99,235]);ctx.doc.text('•',PAGE.left+1,ctx.y,{baseline:'top'});
      setFont(ctx,8.3,'normal',SLATE);ctx.doc.text(lines,PAGE.left+5,ctx.y,{baseline:'top'});
      ctx.y+=h+1;
    });
    ctx.y+=opts.gap??1;
  }

  function humanResult(v){
    const s=String(v||'').trim().toUpperCase();
    const map={PASS:'Sesuai',MATCH:'Sesuai',OK:'Sesuai',FAIL:'Tidak Sesuai',REJECT:'Tidak Sesuai',AMBIGUOUS:'Perlu Klarifikasi',REVIEW:'Perlu Review',WAJIB_REVIEW:'Perlu Review',MUST_REVIEW:'Perlu Review',AUTO_PASS:'Sesuai Otomatis',AUTO_REJECT:'Tidak Sesuai'};
    return map[s]||clean(v)||'—';
  }

  function table(ctx,columns,rows,opts={}){
    const list=arr(rows);
    if(!list.length)return;
    const total=columns.reduce((s,c)=>s+c.width,0);
    const widths=columns.map(c=>c.width/total*CONTENT_W);
    const pad=2.2, lineH=opts.lineH||3.7, fontSize=opts.fontSize||7.4, headerH=7.5;
    function header(){
      ensure(ctx,headerH+4);
      ctx.doc.setFillColor(241,245,249);ctx.doc.setDrawColor(...LINE);
      ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,headerH,'FD');
      let x=PAGE.left;
      columns.forEach((c,i)=>{
        if(i>0)ctx.doc.line(x,ctx.y,x,ctx.y+headerH);
        setFont(ctx,6.7,'bold',SLATE);ctx.doc.text(c.label,x+pad,ctx.y+2,{baseline:'top'});
        x+=widths[i];
      });
      ctx.y+=headerH;
    }
    header();
    list.forEach(row=>{
      const cells=columns.map((c,i)=>wrap(ctx,present(row[c.key])?row[c.key]:'—',widths[i]-pad*2,fontSize,'normal'));
      const rowH=Math.max(1,...cells.map(x=>x.length))*lineH+pad*2;
      if(ctx.y+rowH>PAGE.bottom){addPage(ctx);header();}
      ctx.doc.setDrawColor(...LINE);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,rowH);
      let x=PAGE.left;
      cells.forEach((lines,i)=>{
        if(i>0)ctx.doc.line(x,ctx.y,x,ctx.y+rowH);
        setFont(ctx,fontSize,'normal',SLATE);ctx.doc.text(lines,x+pad,ctx.y+pad,{baseline:'top'});
        x+=widths[i];
      });
      ctx.y+=rowH;
    });
    ctx.y+=3;
  }

  function stageState(block,kind){
    if(kind==='screening'){
      if(block?.state==='error')return'Error Sistem';
      if(block?.state!=='available')return'Belum Ada';
      return block.data?.reviewDecision||block.data?.systemStatus||'Tersedia';
    }
    if(kind==='psych'){
      if(block?.state==='error')return'Error Sistem';
      if(block?.state!=='available')return'Belum Ada';
      if(String(block.data?.status||'')==='Selesai')return block.data?.workflowDecision||block.data?.engineRecommendation||'Selesai';
      return block.data?.status||'Tersedia';
    }
    if(kind==='interview'){
      if(block?.state!=='available')return'Belum Ada';
      return block.data?.workflowDecision||block.data?.recommendation||'Tersedia';
    }
    if(kind==='offering'){
      if(block?.state!=='available')return'Belum Dibuat';
      return block.data?.status||'Tersedia';
    }
    return'—';
  }

  function cover(ctx){
    const m=ctx.model,a=m.application||{},c=m.candidate||{},p=m.position||{},co=m.company||{};
    const y=ctx.y;
    ctx.doc.setFillColor(...NAVY);
    ctx.doc.roundedRect(PAGE.left,y,CONTENT_W,36,3,3,'F');
    setFont(ctx,6.6,'bold',[191,219,254]);ctx.doc.text('LAPORAN KANDIDAT TERINTEGRASI',PAGE.left+6,y+5,{baseline:'top'});
    setFont(ctx,18,'bold',[255,255,255]);
    const nameLines=ctx.doc.splitTextToSize(c.candidate_name||'—',117);
    ctx.doc.text(nameLines,PAGE.left+6,y+12,{baseline:'top'});
    setFont(ctx,8.4,'normal',[203,213,225]);
    ctx.doc.text(`${p.position_name||'Posisi tidak tercatat'} · ${co.brand||co.company_name||'Perusahaan tidak tercatat'}`,PAGE.left+6,y+27,{baseline:'top'});
    const status=clean(m.overall?.label)||clean(a.current_stage)||'Dalam Proses';
    const tone=statusTone(status);
    ctx.doc.setFillColor(...tone.fill);ctx.doc.roundedRect(PAGE.w-PAGE.right-55,y+10,49,11,4,4,'F');
    setFont(ctx,7.2,'bold',tone.text);ctx.doc.text(ctx.doc.splitTextToSize(status,43),PAGE.w-PAGE.right-30.5,y+13,{align:'center',baseline:'top'});
    ctx.y+=42;
    labelValueGrid(ctx,[
      ['Tahap Saat Ini',a.current_stage],['Tanggal Lamar',fmtDateOnly(a.application_date||a.applied_at||a.created_at)],
      ['Status Lamaran',a.status],['Sumber Kandidat',c.source||a.source]
    ],2);
    setFont(ctx,6.4,'normal',MUTED);
    ctx.doc.text(`Application ID: ${a.application_id||'—'}`,PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=7;
  }

  function executive(ctx){
    const m=ctx.model;
    sectionHeading(ctx,'Ringkasan Rekrutmen','Gambaran cepat status kandidat pada seluruh tahap seleksi.');
    const stages=[
      ['Screening',stageState(m.screening,'screening')],['Psikotes',stageState(m.psych,'psych')],['Wawancara HR',stageState(m.hrInterview,'interview')],
      ['Wawancara User',stageState(m.userInterview,'interview')],['Penawaran',stageState(m.offering,'offering')]
    ];
    const gap=2, w=(CONTENT_W-gap*4)/5, top=ctx.y;
    let maxH=18;
    stages.forEach(([label,status],i)=>{
      const x=PAGE.left+i*(w+gap);
      const tone=statusTone(status);
      ctx.doc.setDrawColor(...LINE);ctx.doc.setFillColor(255,255,255);ctx.doc.roundedRect(x,top,w,18,2,2,'FD');
      setFont(ctx,6.1,'bold',MUTED);ctx.doc.text(ctx.doc.splitTextToSize(label,w-4),x+2,top+2,{baseline:'top'});
      setFont(ctx,6.6,'bold',tone.text);ctx.doc.text(ctx.doc.splitTextToSize(status,w-4),x+2,top+9,{baseline:'top'});
    });
    ctx.y+=maxH+4;
    const status=clean(m.overall?.label)||'—';
    callout(ctx,'POSISI / KEPUTUSAN WORKFLOW SAAT INI',status,/review|menunggu|proses|belum/i.test(status)?'warn':/tolak|gagal/i.test(status)?'danger':'good');
    if(arr(m.synthesis?.lines).length){
      setFont(ctx,7,'bold',MUTED);ctx.doc.text('DASAR RINGKAS',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=5;
      bullets(ctx,m.synthesis.lines.slice(0,5));
    }
  }

  function profile(ctx){
    const c=ctx.model.candidate||{};
    sectionHeading(ctx,'Profil Kandidat');
    labelValueGrid(ctx,[
      ['Pendidikan',c.education],['Jurusan',c.major],['Domisili',c.city],
      ['Pengalaman',present(c.experience)?`${c.experience}${Number.isFinite(Number(c.experience))?' tahun':''}`:null],
      ['Posisi Terakhir',c.last_role],['Perusahaan Terakhir',c.last_company],
      ['Ekspektasi Gaji',present(c.expected_salary)?money(c.expected_salary):null],['Notice Period',c.notice_period],
      ['Bersedia Shift',c.willing_shift],['Alasan Melamar',c.apply_reason]
    ],2);
  }

  function cvSection(ctx){
    const x=ctx.model.cvExtraction||{state:'module_unavailable'};
    sectionHeading(ctx,'Validasi CV','Hasil pembacaan otomatis bersifat pendukung dan tidak menggantikan verifikasi HR.');
    if(x.state==='not_available'){callout(ctx,'CV BELUM TERSEDIA','Belum ada CV kandidat yang dapat divalidasi.','warn');return;}
    if(x.state==='module_unavailable'){callout(ctx,'AUTO-READ TIDAK TERSEDIA','Modul pembaca CV belum termuat pada halaman ini.','warn');return;}
    if(x.state==='unsupported'){
      callout(ctx,'FORMAT MEMERLUKAN REVIEW',x.reason==='DOC_LEGACY_NOT_SUPPORTED'?'Format .DOC lama belum didukung untuk pembacaan otomatis. Verifikasi file secara manual.':'Format CV belum didukung untuk pembacaan otomatis.','warn');return;
    }
    if(x.state==='text_unavailable'){
      callout(ctx,'CV TERSEDIA · TEKS TIDAK TERBACA','File CV tersedia, tetapi text layer tidak cukup untuk diekstrak. Kemungkinan CV berupa scan/gambar. Lakukan review manual atau OCR; kondisi ini bukan alasan auto-reject.','warn');return;
    }
    if(x.state==='error'){
      callout(ctx,'GAGAL MEMBACA CV','CV tidak dapat dibaca otomatis saat laporan dibuat. File tetap dapat diverifikasi manual dan error sistem tidak boleh memengaruhi keputusan kandidat.','danger');return;
    }
    const sec=x.sections||{};
    labelValueGrid(ctx,[['Status Auto-Read','Berhasil'],['Verifikasi HR',x.verified===true?'Terverifikasi':'Belum diverifikasi']],2);
    const groups=[['Pendidikan',sec.education],['Pengalaman Kerja',sec.experience],['Keahlian / Kompetensi',sec.skills],['Sertifikasi / Pelatihan',sec.certifications],['Bahasa',sec.languages]];
    const active=groups.filter(([,items])=>arr(items).length);
    if(active.length){
      active.forEach(([label,items])=>{
        setFont(ctx,7,'bold',MUTED);ctx.doc.text(label.toUpperCase(),PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;
        bullets(ctx,arr(items).slice(0,8));
      });
    }else if(arr(x.previewLines).length){
      setFont(ctx,7,'bold',MUTED);ctx.doc.text('CUPLIKAN CV',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;
      bullets(ctx,arr(x.previewLines).slice(0,8));
    }else callout(ctx,'HASIL AUTO-READ','Teks CV berhasil dibaca, tetapi belum ada section terstruktur yang dikenali.','info');
  }

  function screening(ctx){
    const block=ctx.model.screening;
    sectionHeading(ctx,'Screening','Hasil sistem dan keputusan HR ditampilkan terpisah.');
    if(block?.state==='error'){callout(ctx,'DATA SCREENING TIDAK DAPAT DIMUAT',block.error?.message||'Terjadi error saat membaca data Screening.','danger');return;}
    if(block?.state!=='available'){callout(ctx,'BELUM ADA DATA SCREENING','Tidak ditemukan hasil Screening tersimpan untuk application ini.','neutral');return;}
    const s=block.data||{};
    labelValueGrid(ctx,[
      ['Hasil Sistem',humanResult(s.systemStatus)],['Keputusan HR',s.reviewDecision],
      ['Match Preference',s.matchScore==null?null:`${Number(s.matchScore).toFixed(1)}%`],['Tanggal Screening',fmtDate(s.screenedAt)]
    ],2);
    if(s.reviewNotes) callout(ctx,'CATATAN REVIEW HR',`${s.reviewNotes}${s.reviewedBy||s.reviewedAt?`\n${s.reviewedBy||'Reviewer tidak tercatat'} · ${fmtDate(s.reviewedAt)}`:''}`,'info');
    const details=arr(s.details);
    if(details.length){
      table(ctx,[
        {label:'Persyaratan',key:'requirement',width:92},
        {label:'Aktual Kandidat',key:'actual',width:48},
        {label:'Hasil',key:'result',width:40}
      ],details.map(x=>({
        requirement:clean(x.text||x.requirement_id)||'—',
        actual:present(x.actual)?clean(x.actual):'Belum terbaca',
        result:humanResult(x.result||x.rule)
      })),{fontSize:7.1});
    }
  }

  function psych(ctx){
    const block=ctx.model.psych;
    if(block?.state!=='available')return;
    const p=block.data||{};
    sectionHeading(ctx,'Psikotes','Interpretasi hanya menggunakan hasil yang tersimpan dari SiPsiko.');
    const packageText=arr(p.package).map(x=>TEST_LABELS[x?.test_code]||x?.test_code).filter(Boolean).join(' · ');
    labelValueGrid(ctx,[
      ['Status',p.status],['Paket Tes',packageText],['Rekomendasi Engine',p.engineRecommendation],['Keputusan HR',String(p.status||'')==='Selesai'?(p.workflowDecision||'Perlu Review HR'):'Belum Ada']
    ],2);
    if(p.hrNotes&&String(p.status)==='Selesai')callout(ctx,'CATATAN HR PSIKOTES',p.hrNotes,'info');
    const results=arr(p.results).filter(r=>r.code!=='OVERALL');
    if(results.length)table(ctx,[
      {label:'Tes',key:'test',width:45},{label:'Hasil',key:'value',width:35},{label:'Interpretasi Tersimpan',key:'interpretation',width:100}
    ],results.map(r=>({test:r.label||r.code||'Tes',value:r.value||'—',interpretation:r.interpretation||r.recommendation||'—'})),{fontSize:7});
  }

  function interview(ctx,block,label){
    if(block?.state!=='available')return;
    const d=block.data||{};
    sectionHeading(ctx,label,'Rekomendasi interviewer dibedakan dari keputusan workflow resmi.');
    labelValueGrid(ctx,[
      ['Interviewer',d.interviewer||'Tidak tercatat'],['Tanggal',fmtDate(d.assessedAt)],['Skor',d.score?.label],
      ['Rekomendasi Interviewer',d.recommendation],['Keputusan Workflow',d.workflowDecision]
    ],2);
    if(arr(d.storedStrengths).length){setFont(ctx,7,'bold',[6,95,70]);ctx.doc.text('KEKUATAN TERSIMPAN',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;bullets(ctx,d.storedStrengths);}
    if(arr(d.storedGaps).length){setFont(ctx,7,'bold',[146,64,14]);ctx.doc.text('AREA PERHATIAN TERSIMPAN',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;bullets(ctx,d.storedGaps);}
    if(d.cvVerification)callout(ctx,'VERIFIKASI CV / PROFIL',d.cvVerification,'neutral');
    if(arr(d.redFlags).length)callout(ctx,`RED FLAGS TERCATAT (${d.redFlags.length})`,d.redFlags.map(x=>`• ${x}`).join('\n')+(d.redFlagNotes?`\n\nKlarifikasi: ${d.redFlagNotes}`:''),'danger');
    if(arr(d.evidence).length)table(ctx,[
      {label:'Kompetensi',key:'comp',width:52},{label:'Skor',key:'score',width:22},{label:'Evidence',key:'evidence',width:106}
    ],d.evidence.map(x=>({comp:x.competency_name||'—',score:present(x.score)?`${x.score}/4`:'BT',evidence:x.evidence||'—'})),{fontSize:7});
    if(d.conclusion)callout(ctx,'KESIMPULAN INTERVIEWER',d.conclusion,'neutral');
    if(d.workflowReviewedAt||d.workflowReviewNotes)callout(ctx,'REVIEW WORKFLOW',`${d.workflowReviewedBy||'Reviewer tidak tercatat'}${d.workflowReviewedAt?` · ${fmtDate(d.workflowReviewedAt)}`:''}${d.workflowReviewNotes?`\n${d.workflowReviewNotes}`:''}`,'info');
  }

  function conclusion(ctx){
    const m=ctx.model;
    sectionHeading(ctx,'Kesimpulan Assessment','Sintesis berbasis evidence yang tersedia; bukan rata-rata sederhana antar interviewer.');
    const label=m.overall?.label||'—';
    callout(ctx,'POSISI WORKFLOW RESMI',label,/review|menunggu|proses|belum/i.test(label)?'warn':/tolak|gagal/i.test(label)?'danger':'good');
    if(arr(m.synthesis?.lines).length){setFont(ctx,7,'bold',MUTED);ctx.doc.text('DASAR KESIMPULAN',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;bullets(ctx,m.synthesis.lines);}
    if(arr(m.historyNotes).length){setFont(ctx,7,'bold',MUTED);ctx.doc.text('KELENGKAPAN HISTORI',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;bullets(ctx,m.historyNotes);}
    if(arr(m.synthesis?.concerns).length){setFont(ctx,7,'bold',[146,64,14]);ctx.doc.text('CATATAN / CONCERN',PAGE.left,ctx.y,{baseline:'top'});ctx.y+=4.5;bullets(ctx,m.synthesis.concerns);}
  }

  function offering(ctx){
    const block=ctx.model.offering;
    if(block?.state!=='available')return;
    const o=block.data||{};
    sectionHeading(ctx,'Penawaran Kerja');
    labelValueGrid(ctx,[['Status',o.status],['Gaji',money(o.salary)],['Tunjangan',money(o.allowance)],['Benefit',o.benefit],['Tanggal Offer',fmtDateOnly(o.offerDate)],['Deadline',fmtDateOnly(o.deadline)],['Rencana Join',fmtDateOnly(o.expectedJoinDate)]],2);
  }

  function timeline(ctx){
    const rows=arr(ctx.model.timeline);
    if(!rows.length)return;
    sectionHeading(ctx,'Riwayat Rekrutmen','Hanya event yang benar-benar tersimpan di recruitment history.');
    table(ctx,[
      {label:'Tanggal',key:'date',width:38},{label:'Event',key:'event',width:48},{label:'Aktor',key:'actor',width:38},{label:'Catatan',key:'notes',width:56}
    ],rows.map(x=>({date:fmtDate(x.date),event:x.event||'Aktivitas',actor:x.actor||'—',notes:x.notes||'—'})),{fontSize:6.8});
  }

  function attachments(ctx){
    const m=ctx.model, docs=arr(m.attachments?.psychDocuments);
    sectionHeading(ctx,'Dokumen Pendukung');
    const parts=[];
    if(m.attachments?.cvAvailable)parts.push('CV kandidat tersedia dan disertakan sebagai file terpisah pada Paket Dokumen.');
    else parts.push('CV kandidat belum tersedia.');
    if(docs.length)parts.push(`${docs.length} dokumen Psikotes tersimpan tersedia pada Paket Dokumen.`);
    else parts.push('Belum ada dokumen Psikotes tersimpan.');
    callout(ctx,'KETERSEDIAAN DOKUMEN',parts.join(' '),'neutral');
  }

  function renderAll(ctx){
    cover(ctx);
    executive(ctx);
    divider(ctx,2);
    profile(ctx);
    cvSection(ctx);
    divider(ctx,2);
    screening(ctx);
    psych(ctx);
    interview(ctx,ctx.model.hrInterview,'Wawancara HR');
    interview(ctx,ctx.model.userInterview,'Wawancara User');
    conclusion(ctx);
    offering(ctx);
    timeline(ctx);
    attachments(ctx);
  }

  function addHeadersFooters(ctx){
    const doc=ctx.doc,total=doc.getNumberOfPages();
    const candidate=ctx.model?.candidate?.candidate_name||'Kandidat';
    const appId=ctx.model?.application?.application_id||'—';
    for(let p=1;p<=total;p++){
      doc.setPage(p);
      doc.setDrawColor(...LINE);doc.line(PAGE.left,15,PAGE.w-PAGE.right,15);
      setFont(ctx,6.5,'bold',SLATE);doc.text('LAPORAN KANDIDAT TERINTEGRASI',PAGE.left,9,{baseline:'top'});
      setFont(ctx,6.3,'normal',MUTED);doc.text(`${candidate} · ${appId}`,PAGE.w-PAGE.right,9,{align:'right',baseline:'top'});
      doc.setDrawColor(...LINE);doc.line(PAGE.left,286,PAGE.w-PAGE.right,286);
      setFont(ctx,6.2,'normal',MUTED);doc.text('Internal HR · Rahasia',PAGE.left,289,{baseline:'top'});
      doc.text(`Halaman ${p} dari ${total}`,PAGE.w-PAGE.right,289,{align:'right',baseline:'top'});
    }
  }

  function buildCandidateDossierPdf(model){
    if(!model)throw new Error('DOSSIER_MODEL_NOT_AVAILABLE');
    const ctx=createPdf(model);
    renderAll(ctx);
    addHeadersFooters(ctx);
    return ctx.doc;
  }

  function filenameFor(model){
    return `Laporan_Kandidat_${safeName(model?.candidate?.candidate_name)}_${safeName(model?.application?.application_id)}.pdf`;
  }

  async function resolveModel(appId){
    const state=window.CandidateDossierV1?.state;
    if(!appId&&state?.lastModel)return state.lastModel;
    if(appId&&state?.lastModel?.application?.application_id===appId)return state.lastModel;
    if(typeof window.collectCandidateDossierDataV1==='function')return await window.collectCandidateDossierDataV1(appId);
    throw new Error('DOSSIER_COLLECTOR_NOT_AVAILABLE');
  }

  async function downloadCandidateDossierPdf(appId){
    try{
      const model=await resolveModel(appId);
      const doc=buildCandidateDossierPdf(model);
      doc.save(filenameFor(model));
      toast('Laporan Kandidat PDF berhasil dibuat.','success');
      return doc;
    }catch(error){
      console.error('[Laporan Kandidat PDF V1.2] download failed',error);
      const message=error?.message==='JSPDF_NOT_AVAILABLE'?'Library jsPDF tidak tersedia pada halaman ini.':(error?.message||'PDF gagal dibuat.');
      toast('Laporan Kandidat PDF gagal dibuat: '+message,'danger');
      return null;
    }
  }

  async function candidateDossierPdfBlob(modelOrAppId){
    const model=typeof modelOrAppId==='object'&&modelOrAppId?.application?modelOrAppId:await resolveModel(modelOrAppId);
    const doc=buildCandidateDossierPdf(model);
    return {blob:doc.output('blob'),filename:filenameFor(model),doc,model};
  }

  function activatePdfButton(){
    const root=document.getElementById('modalContent');
    if(!root)return;
    const pdfButton=[...root.querySelectorAll('button')].find(b=>/Download Laporan PDF/i.test(b.textContent||''));
    if(pdfButton){
      pdfButton.disabled=false;
      pdfButton.removeAttribute('disabled');
      pdfButton.title='Download Laporan Kandidat Terintegrasi sebagai PDF A4';
      pdfButton.className='px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700';
      pdfButton.innerHTML='<i class="fas fa-file-pdf mr-1"></i>Download Laporan PDF';
      pdfButton.onclick=()=>downloadCandidateDossierPdf(window.CandidateDossierV1?.state?.lastAppId||null);
    }
    const previewRoot=root.querySelector('#candidateDossierPreviewV1');
    const info=previewRoot?.previousElementSibling;
    if(info && /(Fase PDF|Fase Laporan|Fase Paket Dokumen|Fase Paket)/i.test(info.textContent||'')){
      info.innerHTML='<b>Laporan PDF V1.2:</b> layout laporan HR diperbarui menjadi lebih ringkas dan profesional. Paket Dokumen tetap menggunakan PDF yang sama.';
    }
  }

  function installOpenHook(){
    const current=window.openCandidateDossierV1;
    if(typeof current!=='function'||current.__candidateDossierPdfV12Wrapped)return;
    const wrapped=async function(...args){
      const result=await current.apply(this,args);
      setTimeout(activatePdfButton,0);
      setTimeout(activatePdfButton,120);
      return result;
    };
    wrapped.__candidateDossierPdfV12Wrapped=true;
    wrapped.__candidateDossierPdfV12Original=current;
    window.openCandidateDossierV1=wrapped;
  }

  Object.assign(window,{
    CandidateDossierPdfV1:{version:VERSION,build:buildCandidateDossierPdf,blob:candidateDossierPdfBlob,download:downloadCandidateDossierPdf,activate:activatePdfButton},
    buildCandidateDossierPdfV1:buildCandidateDossierPdf,
    candidateDossierPdfBlobV1:candidateDossierPdfBlob,
    downloadCandidateDossierPdfV1:downloadCandidateDossierPdf
  });

  installOpenHook();
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installOpenHook,1800));
  console.log('%cLaporan Kandidat PDF V1.2 active','color:#2563eb;font-weight:bold');
})();
