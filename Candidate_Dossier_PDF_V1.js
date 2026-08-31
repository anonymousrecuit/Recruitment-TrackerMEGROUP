/* ========================================================================== 
   LAPORAN KANDIDAT TERINTEGRASI PDF V1.4 - EXECUTIVE A4
   Branch: feature/candidate-dossier-v1

   Design constraints:
   - Uses CandidateDossierV1.state.lastModel as the canonical normalized model.
   - Native jsPDF A4 portrait; no window.print, iframe print, or screenshots.
   - No database writes, no stage transitions, no MutationObserver.
   - Keeps the public API used by Candidate_Document_Package_V1.js.
   - Renders only evidence already present in the canonical model.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_DOSSIER_PDF_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_DOSSIER_PDF_V1_ACTIVE=true;

  const VERSION='1.4.0-pdf';
  const PAGE={w:210,h:297,left:15,right:15,top:20,bottom:282};
  const CONTENT_W=PAGE.w-PAGE.left-PAGE.right;
  const NAVY=[15,23,42], SLATE=[71,85,105], MUTED=[100,116,139], LINE=[226,232,240], SOFT=[248,250,252], BLUE=[37,99,235];
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

  function sectionHeading(ctx,title,subtitle='',minFollowing=6){
    const subtitleLines=subtitle?wrap(ctx,subtitle,CONTENT_W-9,6.8,'normal'):[];
    const headingH=subtitle?Math.max(10,6+subtitleLines.length*3.2):7.5;
    ensure(ctx,headingH+minFollowing);
    ctx.doc.setFillColor(...BLUE);
    ctx.doc.roundedRect(PAGE.left,ctx.y,1.6,headingH-1,0.8,0.8,'F');
    setFont(ctx,10.4,'bold',NAVY);
    ctx.doc.text(title,PAGE.left+5,ctx.y,{baseline:'top'});
    if(subtitle){
      setFont(ctx,6.8,'normal',MUTED);
      ctx.doc.text(subtitleLines,PAGE.left+5,ctx.y+4.8,{baseline:'top'});
    }
    ctx.y+=headingH;
  }

  function microLabel(ctx,label,x,y,color=MUTED){
    setFont(ctx,6.1,'bold',color);
    ctx.doc.text(String(label||'').toUpperCase(),x,y,{baseline:'top'});
  }

  function statusTone(label){
    const s=String(label||'').toLowerCase();
    if(/tolak|reject|gagal|tidak sesuai|berbeda/.test(s)) return {fill:[254,242,242],border:[254,202,202],text:[153,27,27]};
    if(/error/.test(s)) return {fill:[254,242,242],border:[254,202,202],text:[153,27,27]};
    if(/lulus|lanjut|diterima|selesai|valid|sesuai/.test(s)) return {fill:[236,253,245],border:[167,243,208],text:[6,95,70]};
    if(/review|menunggu|proses|klarifikasi|belum/.test(s)) return {fill:[255,251,235],border:[253,230,138],text:[146,64,14]};
    return {fill:[241,245,249],border:[203,213,225],text:[51,65,85]};
  }

  function pill(ctx,label,x,y,maxW=52){
    const value=clean(label)||'—';
    const tone=statusTone(value);
    setFont(ctx,6.8,'bold',tone.text);
    const lines=ctx.doc.splitTextToSize(value,Math.max(14,maxW-7));
    const h=Math.max(6.5,3.4+lines.length*3);
    ctx.doc.setFillColor(...tone.fill);ctx.doc.setDrawColor(...tone.border);
    ctx.doc.roundedRect(x,y,maxW,h,2.5,2.5,'FD');
    ctx.doc.text(lines,x+3.5,y+1.8,{baseline:'top'});
    return h;
  }

  function compactGrid(ctx,items,cols=2,opts={}){
    const values=arr(items).filter(([,v])=>present(v));
    if(!values.length)return;
    const gap=opts.gap??7;
    const colW=(CONTENT_W-gap*(cols-1))/cols;
    const valueSize=opts.valueSize??8.1;
    const rowGap=opts.rowGap??1.2;
    for(let i=0;i<values.length;i+=cols){
      const row=values.slice(i,i+cols);
      const heights=row.map(([,value])=>Math.max(8.2,4.1+wrap(ctx,asText(value),colW,valueSize,'bold').length*3.5));
      const h=Math.max(...heights);
      ensure(ctx,h+rowGap);
      row.forEach(([label,value],j)=>{
        const x=PAGE.left+j*(colW+gap);
        microLabel(ctx,label,x,ctx.y);
        setFont(ctx,valueSize,'bold',NAVY);
        ctx.doc.text(ctx.doc.splitTextToSize(asText(value),colW),x,ctx.y+3.7,{baseline:'top'});
      });
      ctx.y+=h+rowGap;
    }
  }

  function calloutMetrics(ctx,title,body,width=CONTENT_W,opts={}){
    const titleSize=opts.titleSize??6.8, bodySize=opts.bodySize??7.7;
    const titleLines=wrap(ctx,title,width-8,titleSize,'bold');
    const bodyLines=wrap(ctx,body,width-8,bodySize,'normal');
    return {titleLines,bodyLines,h:4+titleLines.length*3.1+bodyLines.length*3.55+3.3};
  }

  function callout(ctx,title,body,kind='neutral',opts={}){
    const palette={
      neutral:{fill:[248,250,252],border:[226,232,240],title:[51,65,85]},
      info:{fill:[239,246,255],border:[191,219,254],title:[29,78,216]},
      warn:{fill:[255,251,235],border:[253,230,138],title:[146,64,14]},
      good:{fill:[236,253,245],border:[167,243,208],title:[6,95,70]},
      danger:{fill:[254,242,242],border:[254,202,202],title:[153,27,27]}
    }[kind]||{fill:SOFT,border:LINE,title:SLATE};
    const width=opts.width??CONTENT_W, x=opts.x??PAGE.left;
    const metrics=calloutMetrics(ctx,title,body,width,opts);
    ensure(ctx,metrics.h+1.5);
    ctx.doc.setFillColor(...palette.fill);ctx.doc.setDrawColor(...palette.border);
    ctx.doc.roundedRect(x,ctx.y,width,metrics.h,2,2,'FD');
    setFont(ctx,opts.titleSize??6.8,'bold',palette.title);ctx.doc.text(metrics.titleLines,x+4,ctx.y+2.6,{baseline:'top'});
    setFont(ctx,opts.bodySize??7.7,'normal',SLATE);ctx.doc.text(metrics.bodyLines,x+4,ctx.y+3+metrics.titleLines.length*3.1,{baseline:'top'});
    ctx.y+=metrics.h+(opts.gap??2.2);
    return metrics.h;
  }

  function bullets(ctx,items,opts={}){
    const values=arr(items).filter(present);
    if(!values.length)return;
    const size=opts.size??7.6, lineH=opts.lineH??3.7;
    values.forEach(item=>{
      const lines=wrap(ctx,clean(item),CONTENT_W-7,size,'normal');
      const h=Math.max(4.2,lines.length*lineH);
      ensure(ctx,h+0.8);
      setFont(ctx,size,'bold',BLUE);ctx.doc.text('•',PAGE.left+0.5,ctx.y,{baseline:'top'});
      setFont(ctx,size,'normal',SLATE);ctx.doc.text(lines,PAGE.left+4.2,ctx.y,{baseline:'top'});
      ctx.y+=h+0.8;
    });
    ctx.y+=opts.gap??0.5;
  }

  function humanResult(v){
    const s=String(v||'').trim().toUpperCase();
    const map={
      PASS:'Sesuai',MATCH:'Sesuai',OK:'Sesuai',FAIL:'Tidak Sesuai',REJECT:'Tidak Sesuai',
      AMBIGUOUS:'Perlu Klarifikasi',REVIEW:'Perlu Review HR',WAJIB_REVIEW:'Perlu Review HR',MUST_REVIEW:'Perlu Review HR',
      AUTO_PASS:'Sesuai',AUTO_REJECT:'Tidak Sesuai'
    };
    return map[s]||clean(v)||'—';
  }

  function table(ctx,columns,rows,opts={}){
    const list=arr(rows);
    if(!list.length)return;
    const total=columns.reduce((s,c)=>s+c.width,0);
    const widths=columns.map(c=>c.width/total*CONTENT_W);
    const padX=opts.padX??1.8, padY=opts.padY??1.7, lineH=opts.lineH??3.25, fontSize=opts.fontSize??6.8, headerH=opts.headerH??6.3;
    function header(){
      ensure(ctx,headerH+4);
      ctx.doc.setFillColor(241,245,249);
      ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,headerH,'F');
      let x=PAGE.left;
      columns.forEach((c,i)=>{
        setFont(ctx,6.2,'bold',SLATE);
        ctx.doc.text(c.label,x+padX,ctx.y+1.8,{baseline:'top'});
        x+=widths[i];
      });
      ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y+headerH,PAGE.left+CONTENT_W,ctx.y+headerH);
      ctx.y+=headerH;
    }
    header();
    list.forEach(row=>{
      const cells=columns.map((c,i)=>wrap(ctx,present(row[c.key])?row[c.key]:'—',widths[i]-padX*2,fontSize,'normal'));
      const rowH=Math.max(1,...cells.map(x=>x.length))*lineH+padY*2;
      if(ctx.y+rowH>PAGE.bottom){addPage(ctx);header();}
      let x=PAGE.left;
      cells.forEach((lines,i)=>{
        setFont(ctx,fontSize,i===0&&opts.boldFirst?'bold':'normal',i===0&&opts.boldFirst?NAVY:SLATE);
        ctx.doc.text(lines,x+padX,ctx.y+padY,{baseline:'top'});
        x+=widths[i];
      });
      ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y+rowH,PAGE.left+CONTENT_W,ctx.y+rowH);
      ctx.y+=rowH;
    });
    ctx.y+=2;
  }

  function stageState(block,kind){
    if(kind==='screening'){
      if(block?.state==='error')return'Error Sistem';
      if(block?.state!=='available')return'Belum Ada';
      return humanResult(block.data?.reviewDecision||block.data?.systemStatus||'Tersedia');
    }
    if(kind==='psych'){
      if(block?.state==='error')return'Error Sistem';
      if(block?.state!=='available')return'Belum Ada';
      if(String(block.data?.status||'')==='Selesai')return humanResult(block.data?.workflowDecision||block.data?.engineRecommendation||'Selesai');
      return clean(block.data?.status)||'Tersedia';
    }
    if(kind==='interview'){
      if(block?.state!=='available')return'Belum Ada';
      return humanResult(block.data?.workflowDecision||block.data?.recommendation||'Tersedia');
    }
    if(kind==='offering'){
      if(block?.state!=='available')return'Belum Dibuat';
      return clean(block.data?.status)||'Tersedia';
    }
    return'—';
  }

  function stageIndex(stage){
    const s=clean(stage).toLowerCase();
    if(/diterima|joined|join/.test(s))return 6;
    if(/offer|penawaran/.test(s))return 5;
    if(/interview user|wawancara user/.test(s))return 4;
    if(/interview hr|wawancara hr/.test(s))return 3;
    if(/psiko/.test(s))return 2;
    if(/screen/.test(s))return 1;
    return 0;
  }

  function recruitmentProgress(ctx){
    const labels=['Lamaran','Screening','Psikotes','Interview HR','Interview User','Offering'];
    const current=Math.min(5,Math.max(0,stageIndex(ctx.model?.application?.current_stage)));
    const start=PAGE.left+6, end=PAGE.w-PAGE.right-6, width=end-start, y=ctx.y+3.2;
    ensure(ctx,12);
    ctx.doc.setLineWidth(0.5);
    ctx.doc.setDrawColor(...LINE);ctx.doc.line(start,y,end,y);
    labels.forEach((label,i)=>{
      const x=start+(width/(labels.length-1))*i;
      const completed=i<current, active=i===current;
      ctx.doc.setFillColor(...(completed||active?BLUE:[226,232,240]));
      ctx.doc.circle(x,y,active?2.1:1.6,'F');
      setFont(ctx,5.5,active?'bold':'normal',active?NAVY:MUTED);
      const parts=ctx.doc.splitTextToSize(label,25);
      ctx.doc.text(parts,x,y+3.2,{align:'center',baseline:'top'});
    });
    ctx.y+=11.5;
  }

  function cvSummary(model){
    const x=model?.cvExtraction||{state:'module_unavailable'};
    if(x.state==='not_available')return {title:'CV Belum Tersedia',body:'Belum ada CV kandidat yang dapat diverifikasi. Keputusan screening tidak boleh didasarkan pada asumsi data CV.',kind:'warn'};
    if(x.state==='module_unavailable')return {title:'Review Manual Diperlukan',body:'Modul pembacaan CV tidak tersedia saat laporan dibuat. Verifikasi file asli secara manual; kondisi sistem ini tidak memengaruhi keputusan kandidat.',kind:'warn'};
    if(x.state==='unsupported')return {title:'Format CV Perlu Review',body:x.reason==='DOC_LEGACY_NOT_SUPPORTED'?'Format .DOC lama belum dapat dibaca otomatis. Verifikasi file asli secara manual atau gunakan format PDF/DOCX bila diperlukan.':'Format CV belum didukung untuk pembacaan otomatis. Verifikasi file asli secara manual.',kind:'warn'};
    if(x.state==='text_unavailable')return {title:'Review Manual Diperlukan',body:'CV tersedia, namun isi dokumen belum dapat dibaca otomatis karena file terindikasi berupa scan/gambar. HR perlu memverifikasi CV asli. OCR dapat digunakan bila diperlukan; kondisi ini tidak memengaruhi keputusan kandidat secara otomatis.',kind:'warn'};
    if(x.state==='error')return {title:'Error Sistem CV',body:'CV tidak dapat dibaca otomatis saat laporan dibuat. File tetap dapat diverifikasi manual dan error sistem tidak boleh memengaruhi keputusan kandidat.',kind:'danger'};
    return {title:x.verified===true?'CV Terverifikasi':'CV Berhasil Dibaca',body:x.verified===true?'Isi CV telah dibaca otomatis dan berstatus terverifikasi oleh HR.':'Isi CV berhasil dibaca otomatis, namun hasil pembacaan tetap merupakan data pendukung sampai diverifikasi HR.',kind:x.verified===true?'good':'info'};
  }

  function nextAction(model){
    const stage=clean(model?.application?.current_stage).toLowerCase();
    const cv=model?.cvExtraction||{};
    if(/screen/.test(stage)){
      if(['text_unavailable','unsupported','module_unavailable','error','not_available'].includes(cv.state))return'Review CV asli, verifikasi persyaratan Screening HR, lalu tetapkan keputusan screening.';
      return'Verifikasi hasil Screening HR dan tetapkan keputusan untuk tahap berikutnya.';
    }
    if(/psiko/.test(stage))return'Tinjau hasil psikotes yang tersimpan dan tetapkan keputusan workflow sesuai hasil yang telah diverifikasi.';
    if(/interview hr|wawancara hr/.test(stage))return'Laksanakan atau review Wawancara HR berdasarkan evidence yang tersimpan sebelum memindahkan tahap.';
    if(/interview user|wawancara user/.test(stage))return'Laksanakan atau review Wawancara User, kemudian tetapkan keputusan workflow berdasarkan evidence yang tersimpan.';
    if(/offer|penawaran/.test(stage))return'Tinjau status penawaran dan tindak lanjuti keputusan kandidat sesuai data offering yang tersimpan.';
    if(/diterima|join/.test(stage))return'Pastikan administrasi join dan dokumen pendukung telah lengkap sesuai workflow.';
    return'Tinjau data kandidat dan lanjutkan proses sesuai tahap workflow yang aktif.';
  }

  function currentAttention(model){
    const cv=model?.cvExtraction||{};
    const screening=model?.screening;
    if(cv.state==='text_unavailable')return'Isi CV belum dapat dibaca otomatis; verifikasi manual diperlukan.';
    if(cv.state==='error')return'Terdapat error sistem saat membaca CV; jangan gunakan error tersebut sebagai dasar keputusan kandidat.';
    if(cv.state==='unsupported')return'Format CV memerlukan review manual.';
    if(cv.state==='module_unavailable')return'Modul pembacaan CV tidak tersedia saat laporan dibuat; verifikasi file asli secara manual.';
    if(cv.state==='not_available')return'CV belum tersedia untuk diverifikasi.';
    if(screening?.state==='error')return'Data Screening tidak dapat dimuat saat laporan dibuat.';
    if(screening?.state==='available'&&!present(screening.data?.reviewDecision))return'Keputusan HR pada Screening belum tersimpan.';
    const concerns=arr(model?.synthesis?.concerns).filter(present);
    return concerns[0]?clean(concerns[0]):'Tidak ada catatan khusus tambahan pada evidence yang tersedia.';
  }

  function cover(ctx){
    const m=ctx.model,a=m.application||{},c=m.candidate||{},p=m.position||{},co=m.company||{};
    ensure(ctx,31);
    setFont(ctx,7.1,'bold',NAVY);ctx.doc.text('LAPORAN KANDIDAT TERINTEGRASI',PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=4.2;
    setFont(ctx,6.1,'normal',MUTED);ctx.doc.text('Executive Recruitment Assessment Report',PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=5.2;
    const status=humanResult(clean(m.overall?.label)||clean(a.current_stage)||'Dalam Proses');
    const statusW=48;
    const nameW=CONTENT_W-statusW-6;
    setFont(ctx,16.5,'bold',NAVY);
    const nameLines=ctx.doc.splitTextToSize(c.candidate_name||'—',nameW);
    ctx.doc.text(nameLines,PAGE.left,ctx.y,{baseline:'top'});
    pill(ctx,status,PAGE.w-PAGE.right-statusW,ctx.y-0.5,statusW);
    ctx.y+=Math.max(8.5,nameLines.length*6.2);
    setFont(ctx,8.2,'normal',SLATE);
    ctx.doc.text(`${p.position_name||'Posisi tidak tercatat'} · ${co.brand||co.company_name||'Perusahaan tidak tercatat'}`,PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=5;
    const meta=[
      `Tahap: ${a.current_stage||'—'}`,
      `Lamaran: ${fmtDateOnly(a.application_date||a.applied_at||a.created_at)}`,
      `Status: ${a.status||'—'}`
    ];
    if(present(c.source||a.source))meta.push(`Sumber: ${c.source||a.source}`);
    setFont(ctx,6.5,'normal',MUTED);
    ctx.doc.text(meta.join('   ·   '),PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=5.2;
    ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y,PAGE.w-PAGE.right,ctx.y);
    ctx.y+=4;
  }

  function executive(ctx){
    const m=ctx.model,a=m.application||{};
    sectionHeading(ctx,'Ringkasan Eksekutif','Status proses dan tindakan yang perlu dilakukan HR.',22);
    const overall=humanResult(clean(m.overall?.label)||a.current_stage||'Dalam Proses');
    const action=nextAction(m);
    const attention=currentAttention(m);
    const gap=3, leftW=55, rightW=CONTENT_W-leftW-gap, top=ctx.y;
    const statusLines=wrap(ctx,a.current_stage||'—',leftW-7,8.1,'bold');
    const actionLines=wrap(ctx,action,rightW-7,7.4,'normal');
    const h=Math.max(17,8+statusLines.length*3.8,7+actionLines.length*3.55);
    ensure(ctx,h+18);

    ctx.doc.setFillColor(...SOFT);ctx.doc.setDrawColor(...LINE);ctx.doc.roundedRect(PAGE.left,top,leftW,h,1.8,1.8,'FD');
    microLabel(ctx,'Status Saat Ini',PAGE.left+3.2,top+2.5);
    setFont(ctx,8.1,'bold',NAVY);ctx.doc.text(statusLines,PAGE.left+3.2,top+6.2,{baseline:'top'});
    setFont(ctx,6.7,'bold',statusTone(overall).text);
    ctx.doc.text(ctx.doc.splitTextToSize(overall,leftW-7),PAGE.left+3.2,top+6.5+statusLines.length*3.8,{baseline:'top'});

    const rx=PAGE.left+leftW+gap;
    ctx.doc.setFillColor(255,255,255);ctx.doc.setDrawColor(...LINE);ctx.doc.roundedRect(rx,top,rightW,h,1.8,1.8,'FD');
    microLabel(ctx,'Tindakan HR',rx+3.2,top+2.5);
    setFont(ctx,7.4,'normal',SLATE);ctx.doc.text(actionLines,rx+3.2,top+6.2,{baseline:'top'});
    ctx.y+=h+2.4;

    const attentionLines=wrap(ctx,attention,CONTENT_W-10,6.9,'normal');
    const noteH=Math.max(8,4.5+attentionLines.length*3.25);
    ensure(ctx,noteH+12);
    ctx.doc.setFillColor(255,251,235);ctx.doc.setDrawColor(253,230,138);
    ctx.doc.roundedRect(PAGE.left,ctx.y,CONTENT_W,noteH,1.5,1.5,'FD');
    microLabel(ctx,'Catatan Perhatian',PAGE.left+3.2,ctx.y+2,[146,64,14]);
    setFont(ctx,6.9,'normal',SLATE);ctx.doc.text(attentionLines,PAGE.left+34,ctx.y+2,{baseline:'top'});
    ctx.y+=noteH+2.5;
    recruitmentProgress(ctx);
  }

  function profile(ctx){
    const c=ctx.model.candidate||{};
    sectionHeading(ctx,'Profil Kandidat','Data profil yang tersimpan pada aplikasi kandidat.',16);
    compactGrid(ctx,[
      ['Pendidikan',c.education],['Jurusan',c.major],['Domisili',c.city],
      ['Pengalaman yang Dilaporkan',present(c.experience)?`${c.experience}${Number.isFinite(Number(c.experience))?' tahun':''}`:null],
      ['Posisi Terakhir',c.last_role],['Perusahaan Terakhir',c.last_company],
      ['Ekspektasi Gaji',present(c.expected_salary)?money(c.expected_salary):null],['Notice Period',c.notice_period],
      ['Bersedia Shift',c.willing_shift],['Alasan Melamar',c.apply_reason]
    ],2,{valueSize:7.8,rowGap:0.5});
    ctx.y+=1;
  }

  function cvSection(ctx){
    const x=ctx.model.cvExtraction||{state:'module_unavailable'};
    const summary=cvSummary(ctx.model);
    const metrics=calloutMetrics(ctx,summary.title,summary.body,CONTENT_W,{titleSize:6.7,bodySize:7.4});
    sectionHeading(ctx,'Validasi CV','Pembacaan otomatis bersifat pendukung dan tidak menggantikan verifikasi HR.',metrics.h+2);
    callout(ctx,summary.title,summary.body,summary.kind,{titleSize:6.7,bodySize:7.4,gap:1.8});

    if(!['available','success','ok'].includes(String(x.state||'').toLowerCase()))return;
    const sec=x.sections||{};
    const groups=[['Pendidikan',sec.education],['Pengalaman Kerja',sec.experience],['Keahlian / Kompetensi',sec.skills],['Sertifikasi / Pelatihan',sec.certifications],['Bahasa',sec.languages]].filter(([,items])=>arr(items).length);
    if(groups.length){
      groups.forEach(([label,items])=>{
        microLabel(ctx,label,PAGE.left,ctx.y);ctx.y+=3.5;
        bullets(ctx,arr(items).slice(0,6),{size:7.2,lineH:3.45,gap:0});
      });
    }else if(arr(x.previewLines).length){
      microLabel(ctx,'Cuplikan CV',PAGE.left,ctx.y);ctx.y+=3.5;
      bullets(ctx,arr(x.previewLines).slice(0,6),{size:7.2,lineH:3.45,gap:0});
    }
  }

  function screeningAspect(text){
    const s=clean(text).toLowerCase();
    if(/\b(sma|smk|d1|d2|d3|d4|s1|s2|s3)\b|pendidikan|sarjana|diploma/.test(s))return'Pendidikan';
    if(/pengalaman|\btahun\b/.test(s))return'Pengalaman';
    if(/usia|umur/.test(s))return'Usia';
    if(/domisili|berdomisili|tinggal|lokasi/.test(s))return'Domisili';
    if(/excel|google sheets|ketenagakerjaan|alat tes|psikotes|rekrutmen|software|sistem|teknis/.test(s))return'Kompetensi Teknis';
    if(/teliti|kerahasiaan|komunikasi|mengelola data|kerja sama|disiplin|inisiatif/.test(s))return'Kompetensi Kerja';
    return'Kompetensi';
  }

  function screeningRequirement(text){
    const raw=String(text||'').replace(/\s*;\s*/g,'; ').trim();
    const parts=raw.split(';').map(x=>clean(x)).filter(Boolean);
    return parts.length>1?`• ${parts.join('\n• ')}`:(clean(raw)||'—');
  }

  function screeningDetailResult(raw,actual){
    const result=humanResult(raw);
    if(!present(actual)&&/perlu klarifikasi|perlu review/i.test(result))return'Perlu Verifikasi';
    return result;
  }

  function screening(ctx){
    const block=ctx.model.screening;
    sectionHeading(ctx,'Screening','Hasil sistem, keputusan HR, dan evidence persyaratan ditampilkan terpisah.',18);
    if(block?.state==='error'){
      callout(ctx,'Data Screening Tidak Dapat Dimuat','Terjadi error saat membaca data Screening. Kondisi sistem tidak boleh digunakan sebagai dasar keputusan kandidat.','danger',{bodySize:7.4});return;
    }
    if(block?.state!=='available'){
      callout(ctx,'Belum Ada Data Screening','Belum ditemukan hasil Screening tersimpan untuk kandidat ini.','neutral',{bodySize:7.4});return;
    }
    const s=block.data||{};
    compactGrid(ctx,[
      ['Hasil Sistem',humanResult(s.systemStatus)],['Keputusan HR',s.reviewDecision?humanResult(s.reviewDecision):null],
      ['Match Preference',s.matchScore==null?null:`${Number(s.matchScore).toFixed(1)}%`],['Tanggal Screening',fmtDate(s.screenedAt)]
    ],2,{valueSize:7.6,rowGap:0.4});
    if(s.reviewNotes) callout(ctx,'Catatan Review HR',`${s.reviewNotes}${s.reviewedBy||s.reviewedAt?`\n${s.reviewedBy||'Reviewer tidak tercatat'} · ${fmtDate(s.reviewedAt)}`:''}`,'info',{bodySize:7.3,gap:1.5});
    const details=arr(s.details);
    if(details.length){
      table(ctx,[
        {label:'Aspek',key:'aspect',width:25},
        {label:'Persyaratan Posisi',key:'requirement',width:78},
        {label:'Evidence Kandidat',key:'actual',width:45},
        {label:'Status',key:'result',width:32}
      ],details.map(x=>{
        const rawRequirement=clean(x.text||x.requirement_id)||'—';
        return{
          aspect:screeningAspect(rawRequirement),
          requirement:screeningRequirement(rawRequirement),
          actual:present(x.actual)?clean(x.actual):'Belum dapat diverifikasi',
          result:screeningDetailResult(x.result||x.rule,x.actual)
        };
      }),{fontSize:6.6,lineH:3.15,padY:1.6,boldFirst:true});
    }
  }

  function psych(ctx){
    const block=ctx.model.psych;
    if(block?.state!=='available')return;
    const p=block.data||{};
    sectionHeading(ctx,'Psikotes','Hanya menggunakan hasil dan interpretasi yang benar-benar tersimpan dari SiPsiko.',18);
    const packageText=arr(p.package).map(x=>TEST_LABELS[x?.test_code]||x?.test_code).filter(Boolean).join(' · ');
    compactGrid(ctx,[
      ['Status',p.status],['Paket Tes',packageText],['Rekomendasi Engine',humanResult(p.engineRecommendation)],
      ['Keputusan HR',String(p.status||'')==='Selesai'?(p.workflowDecision?humanResult(p.workflowDecision):'Belum Ada'):null]
    ],2,{valueSize:7.6});
    if(p.hrNotes&&String(p.status)==='Selesai')callout(ctx,'Catatan HR Psikotes',p.hrNotes,'info',{bodySize:7.3});
    const results=arr(p.results).filter(r=>r.code!=='OVERALL');
    if(results.length)table(ctx,[
      {label:'Tes',key:'test',width:42},{label:'Hasil',key:'value',width:34},{label:'Interpretasi Tersimpan',key:'interpretation',width:104}
    ],results.map(r=>({test:r.label||r.code||'Tes',value:r.value||'—',interpretation:r.interpretation||r.recommendation||'—'})),{fontSize:6.6});
  }

  function interview(ctx,block,label){
    if(block?.state!=='available')return;
    const d=block.data||{};
    sectionHeading(ctx,label,'Evidence interviewer dipisahkan dari keputusan workflow resmi.',18);
    compactGrid(ctx,[
      ['Interviewer',d.interviewer||'Tidak tercatat'],['Tanggal',fmtDate(d.assessedAt)],['Skor',d.score?.label],
      ['Rekomendasi Interviewer',humanResult(d.recommendation)],['Keputusan Workflow',humanResult(d.workflowDecision)]
    ],2,{valueSize:7.6});
    if(arr(d.storedStrengths).length){microLabel(ctx,'Kekuatan Tersimpan',PAGE.left,ctx.y,[6,95,70]);ctx.y+=3.5;bullets(ctx,d.storedStrengths,{size:7.2,lineH:3.45,gap:0});}
    if(arr(d.storedGaps).length){microLabel(ctx,'Area Perhatian Tersimpan',PAGE.left,ctx.y,[146,64,14]);ctx.y+=3.5;bullets(ctx,d.storedGaps,{size:7.2,lineH:3.45,gap:0});}
    if(d.cvVerification)callout(ctx,'Verifikasi CV / Profil',d.cvVerification,'neutral',{bodySize:7.3});
    if(arr(d.redFlags).length)callout(ctx,`Red Flags Tercatat (${d.redFlags.length})`,d.redFlags.map(x=>`• ${x}`).join('\n')+(d.redFlagNotes?`\n\nKlarifikasi: ${d.redFlagNotes}`:''),'danger',{bodySize:7.2});
    if(arr(d.evidence).length)table(ctx,[
      {label:'Kompetensi',key:'comp',width:50},{label:'Skor',key:'score',width:22},{label:'Evidence',key:'evidence',width:108}
    ],d.evidence.map(x=>({comp:x.competency_name||'—',score:present(x.score)?`${x.score}/4`:'Belum Dinilai',evidence:x.evidence||'—'})),{fontSize:6.55});
    if(d.conclusion)callout(ctx,'Kesimpulan Interviewer',d.conclusion,'neutral',{bodySize:7.3});
    if(d.workflowReviewedAt||d.workflowReviewNotes)callout(ctx,'Review Workflow',`${d.workflowReviewedBy||'Reviewer tidak tercatat'}${d.workflowReviewedAt?` · ${fmtDate(d.workflowReviewedAt)}`:''}${d.workflowReviewNotes?`\n${d.workflowReviewNotes}`:''}`,'info',{bodySize:7.3});
  }

  function offering(ctx){
    const block=ctx.model.offering;
    if(block?.state!=='available')return;
    const o=block.data||{};
    sectionHeading(ctx,'Penawaran Kerja','Data penawaran yang tersimpan pada workflow kandidat.',14);
    compactGrid(ctx,[['Status',o.status],['Gaji',money(o.salary)],['Tunjangan',money(o.allowance)],['Benefit',o.benefit],['Tanggal Offer',fmtDateOnly(o.offerDate)],['Deadline',fmtDateOnly(o.deadline)],['Rencana Join',fmtDateOnly(o.expectedJoinDate)]],2,{valueSize:7.6});
  }

  function hasSubstantiveAssessment(model){
    const psych=model?.psych;
    const hr=model?.hrInterview;
    const user=model?.userInterview;
    const psychReady=psych?.state==='available'&&(String(psych.data?.status||'')==='Selesai'||arr(psych.data?.results).length>0);
    return psychReady||hr?.state==='available'||user?.state==='available';
  }

  function conclusion(ctx){
    const m=ctx.model;
    if(!hasSubstantiveAssessment(m)){
      if(arr(m.historyNotes).length){
        sectionHeading(ctx,'Catatan Kelengkapan Data','Catatan ini berasal dari histori/data yang tersedia pada sistem.',8);
        bullets(ctx,m.historyNotes,{size:7.1,lineH:3.4,gap:0});
      }
      return;
    }
    sectionHeading(ctx,'Kesimpulan Assessment & Rekomendasi','Sintesis hanya berdasarkan evidence yang tersedia dan keputusan workflow yang tersimpan.',16);
    const label=humanResult(m.overall?.label||'—');
    callout(ctx,'Posisi Workflow Resmi',label,/review|menunggu|proses|belum/i.test(label)?'warn':/tolak|gagal/i.test(label)?'danger':'good',{bodySize:7.6,gap:1.5});
    if(arr(m.synthesis?.lines).length){microLabel(ctx,'Dasar Kesimpulan',PAGE.left,ctx.y);ctx.y+=3.5;bullets(ctx,m.synthesis.lines,{size:7.2,lineH:3.45,gap:0});}
    if(arr(m.synthesis?.concerns).length){microLabel(ctx,'Catatan / Concern',PAGE.left,ctx.y,[146,64,14]);ctx.y+=3.5;bullets(ctx,m.synthesis.concerns,{size:7.2,lineH:3.45,gap:0});}
    if(arr(m.historyNotes).length){microLabel(ctx,'Kelengkapan Histori',PAGE.left,ctx.y);ctx.y+=3.5;bullets(ctx,m.historyNotes,{size:7.1,lineH:3.4,gap:0});}
  }

  function timeline(ctx){
    const rows=arr(ctx.model.timeline);
    if(!rows.length)return;
    sectionHeading(ctx,'Riwayat Rekrutmen','Hanya event yang benar-benar tersimpan di recruitment history.',rows.length<=3?7:14);
    if(rows.length<=3){
      rows.forEach(x=>{
        const date=fmtDate(x.date), event=clean(x.event||'Aktivitas');
        const meta=[x.actor?`Aktor: ${x.actor}`:null,x.notes?clean(x.notes):null].filter(Boolean).join(' · ');
        const eventLines=wrap(ctx,event,CONTENT_W-43,7.3,'bold');
        const metaLines=meta?wrap(ctx,meta,CONTENT_W-43,6.5,'normal'):[];
        const h=Math.max(6.2,eventLines.length*3.5+(metaLines.length?metaLines.length*3+1:0));
        ensure(ctx,h+1);
        setFont(ctx,6.5,'normal',MUTED);ctx.doc.text(date,PAGE.left,ctx.y,{baseline:'top'});
        setFont(ctx,7.3,'bold',NAVY);ctx.doc.text(eventLines,PAGE.left+43,ctx.y,{baseline:'top'});
        if(metaLines.length){setFont(ctx,6.5,'normal',SLATE);ctx.doc.text(metaLines,PAGE.left+43,ctx.y+eventLines.length*3.5+0.6,{baseline:'top'});}
        ctx.y+=h;
        ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y,PAGE.left+CONTENT_W,ctx.y);ctx.y+=1.2;
      });
      ctx.y+=0.5;
      return;
    }
    table(ctx,[
      {label:'Tanggal',key:'date',width:38},{label:'Event',key:'event',width:48},{label:'Aktor',key:'actor',width:38},{label:'Catatan',key:'notes',width:56}
    ],rows.map(x=>({date:fmtDate(x.date),event:x.event||'Aktivitas',actor:x.actor||'—',notes:x.notes||'—'})),{fontSize:6.4});
  }

  function attachments(ctx){
    const m=ctx.model, docs=arr(m.attachments?.psychDocuments);
    ensure(ctx,11);
    microLabel(ctx,'Dokumen Pendukung',PAGE.left,ctx.y);
    ctx.y+=3.7;
    const cvText=m.attachments?.cvAvailable?'CV: tersedia, file asli disertakan terpisah':'CV: belum tersedia';
    const psychText=docs.length?`Psikotes: ${docs.length} dokumen tersimpan`:'Psikotes: belum tersedia';
    const lines=wrap(ctx,`${cvText}   ·   ${psychText}`,CONTENT_W,7.1,'normal');
    setFont(ctx,7.1,'normal',SLATE);ctx.doc.text(lines,PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=Math.max(4.2,lines.length*3.45)+1;
  }

  function renderAll(ctx){
    cover(ctx);
    executive(ctx);
    profile(ctx);
    cvSection(ctx);
    screening(ctx);
    psych(ctx);
    interview(ctx,ctx.model.hrInterview,'Wawancara HR');
    interview(ctx,ctx.model.userInterview,'Wawancara User');
    offering(ctx);
    conclusion(ctx);
    timeline(ctx);
    attachments(ctx);
  }

  function addHeadersFooters(ctx){
    const doc=ctx.doc,total=doc.getNumberOfPages();
    const candidate=ctx.model?.candidate?.candidate_name||'Kandidat';
    const appId=ctx.model?.application?.application_id||'—';
    for(let p=1;p<=total;p++){
      doc.setPage(p);
      doc.setDrawColor(...LINE);doc.line(PAGE.left,14.5,PAGE.w-PAGE.right,14.5);
      setFont(ctx,6.1,'bold',SLATE);doc.text(p===1?'MEGROUP · RECRUITMENT':'LAPORAN KANDIDAT TERINTEGRASI',PAGE.left,8.5,{baseline:'top'});
      setFont(ctx,6,'normal',MUTED);doc.text(candidate,PAGE.w-PAGE.right,8.5,{align:'right',baseline:'top'});
      doc.setDrawColor(...LINE);doc.line(PAGE.left,286,PAGE.w-PAGE.right,286);
      setFont(ctx,5.8,'normal',MUTED);doc.text(`Internal HR · Rahasia · ${appId}`,PAGE.left,289,{baseline:'top'});
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
      console.error('[Laporan Kandidat PDF V1.4] download failed',error);
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
      info.innerHTML='<b>Laporan PDF V1.4:</b> final visual polish Executive Recruitment Assessment Report. Paket Dokumen tetap menggunakan PDF dan model canonical yang sama.';
    }
  }

  function installOpenHook(){
    const current=window.openCandidateDossierV1;
    if(typeof current!=='function'||current.__candidateDossierPdfV14Wrapped)return;
    const wrapped=async function(...args){
      const result=await current.apply(this,args);
      setTimeout(activatePdfButton,0);
      setTimeout(activatePdfButton,120);
      return result;
    };
    wrapped.__candidateDossierPdfV14Wrapped=true;
    wrapped.__candidateDossierPdfV14Original=current;
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
  console.log('%cLaporan Kandidat PDF V1.4 active','color:#2563eb;font-weight:bold');
})();
