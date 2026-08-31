/* ========================================================================== 
   LAPORAN KANDIDAT TERINTEGRASI PDF V1.6 - CLEAN GRID A4
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

  const VERSION='1.6.1-pdf';
  const PAGE={w:210,h:297,left:16,right:16,top:20,bottom:282};
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
    const subtitleLines=subtitle?wrap(ctx,subtitle,CONTENT_W,7.4,'normal'):[];
    const headingH=subtitleLines.length?10.8+subtitleLines.length*3.6:8.2;
    ensure(ctx,headingH+minFollowing);
    setFont(ctx,11.2,'bold',NAVY);
    ctx.doc.text(title,PAGE.left,ctx.y,{baseline:'top'});
    const titleW=Math.min(CONTENT_W-16,ctx.doc.getTextWidth(title));
    ctx.doc.setDrawColor(...BLUE);ctx.doc.setLineWidth(0.5);
    ctx.doc.line(PAGE.left+titleW+4,ctx.y+2.8,PAGE.w-PAGE.right,ctx.y+2.8);
    if(subtitleLines.length){
      setFont(ctx,7.4,'normal',MUTED);
      ctx.doc.text(subtitleLines,PAGE.left,ctx.y+5.7,{baseline:'top'});
    }
    ctx.y+=headingH;
  }

  function microLabel(ctx,label,x,y,color=MUTED){
    setFont(ctx,7.0,'bold',color);
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
    setFont(ctx,7.3,'bold',tone.text);
    const lines=ctx.doc.splitTextToSize(value,Math.max(14,maxW-8));
    const h=Math.max(7.2,3.8+lines.length*3.2);
    ctx.doc.setFillColor(...tone.fill);ctx.doc.setDrawColor(...tone.border);
    ctx.doc.roundedRect(x,y,maxW,h,2.4,2.4,'FD');
    ctx.doc.text(lines,x+4,y+2.0,{baseline:'top'});
    return h;
  }

  function compactGrid(ctx,items,cols=2,opts={}){
    const values=arr(items).filter(([,v])=>present(v));
    if(!values.length)return;
    const gap=opts.gap??7;
    const colW=(CONTENT_W-gap*(cols-1))/cols;
    const valueSize=opts.valueSize??8.5;
    const rowGap=opts.rowGap??1.5;
    for(let i=0;i<values.length;i+=cols){
      const row=values.slice(i,i+cols);
      const heights=row.map(([,value])=>Math.max(9,4.6+wrap(ctx,asText(value),colW,valueSize,'bold').length*3.8));
      const h=Math.max(...heights);
      ensure(ctx,h+rowGap);
      row.forEach(([label,value],j)=>{
        const x=PAGE.left+j*(colW+gap);
        microLabel(ctx,label,x,ctx.y);
        setFont(ctx,valueSize,'bold',NAVY);
        ctx.doc.text(ctx.doc.splitTextToSize(asText(value),colW),x,ctx.y+4.2,{baseline:'top'});
      });
      ctx.y+=h+rowGap;
    }
  }

  function calloutMetrics(ctx,title,body,width=CONTENT_W,opts={}){
    const titleSize=opts.titleSize??8.0, bodySize=opts.bodySize??8.3;
    const titleLines=wrap(ctx,title,width-8,titleSize,'bold');
    const bodyLines=wrap(ctx,body,width-8,bodySize,'normal');
    return {titleLines,bodyLines,h:4.6+titleLines.length*3.65+bodyLines.length*3.9+3.8};
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
    ctx.doc.roundedRect(x,ctx.y,width,metrics.h,1.6,1.6,'FD');
    setFont(ctx,opts.titleSize??7.6,'bold',palette.title);
    ctx.doc.text(metrics.titleLines,x+4,ctx.y+2.7,{baseline:'top'});
    setFont(ctx,opts.bodySize??8.0,'normal',SLATE);
    ctx.doc.text(metrics.bodyLines,x+4,ctx.y+3.3+metrics.titleLines.length*3.5,{baseline:'top'});
    ctx.y+=metrics.h+(opts.gap??2.2);
    return metrics.h;
  }

  function bullets(ctx,items,opts={}){
    const values=arr(items).filter(present);
    if(!values.length)return;
    const size=opts.size??7.9, lineH=opts.lineH??3.8;
    values.forEach(item=>{
      const lines=wrap(ctx,clean(item),CONTENT_W-7,size,'normal');
      const h=Math.max(4.4,lines.length*lineH);
      ensure(ctx,h+0.8);
      setFont(ctx,size,'bold',BLUE);ctx.doc.text('•',PAGE.left+0.5,ctx.y,{baseline:'top'});
      setFont(ctx,size,'normal',SLATE);ctx.doc.text(lines,PAGE.left+4.2,ctx.y,{baseline:'top'});
      ctx.y+=h+0.8;
    });
    ctx.y+=opts.gap??0.6;
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
    const padX=opts.padX??2.1, padY=opts.padY??1.8, lineH=opts.lineH??3.45;
    const fontSize=Math.max(7.15,opts.fontSize??7.25), headerH=opts.headerH??7.2;
    function header(){
      ensure(ctx,headerH+4);
      ctx.doc.setFillColor(241,245,249);ctx.doc.setDrawColor(...LINE);
      ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,headerH,'FD');
      let x=PAGE.left;
      columns.forEach((c,i)=>{
        if(i>0)ctx.doc.line(x,ctx.y,x,ctx.y+headerH);
        setFont(ctx,7.0,'bold',SLATE);
        ctx.doc.text(c.label,x+padX,ctx.y+2.1,{baseline:'top'});
        x+=widths[i];
      });
      ctx.y+=headerH;
    }
    header();
    list.forEach(row=>{
      const cells=columns.map((c,i)=>wrap(ctx,present(row[c.key])?row[c.key]:'—',widths[i]-padX*2,fontSize,'normal'));
      const rowH=Math.max(1,...cells.map(x=>x.length))*lineH+padY*2;
      if(ctx.y+rowH>PAGE.bottom){addPage(ctx);header();}
      ctx.doc.setDrawColor(...LINE);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,rowH);
      let x=PAGE.left;
      cells.forEach((lines,i)=>{
        if(i>0)ctx.doc.line(x,ctx.y,x,ctx.y+rowH);
        setFont(ctx,fontSize,i===0&&opts.boldFirst?'bold':'normal',i===0&&opts.boldFirst?NAVY:SLATE);
        ctx.doc.text(lines,x+padX,ctx.y+padY,{baseline:'top'});
        x+=widths[i];
      });
      ctx.y+=rowH;
    });
    ctx.y+=2.4;
  }

  function infoRow(ctx,label,value,opts={}){
    if(!present(value))return;
    const labelW=opts.labelW??41;
    const bodyX=PAGE.left+labelW;
    const bodyW=CONTENT_W-labelW;
    const bodySize=opts.bodySize??8.3;
    const lines=wrap(ctx,value,bodyW-4,bodySize,opts.bold?'bold':'normal');
    const h=Math.max(8.8,4.2+lines.length*3.85);
    ensure(ctx,h);
    if(opts.fill){ctx.doc.setFillColor(...opts.fill);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,h,'F');}
    microLabel(ctx,label,PAGE.left+2.5,ctx.y+2.4,opts.labelColor||MUTED);
    setFont(ctx,bodySize,opts.bold?'bold':'normal',opts.color||SLATE);
    ctx.doc.text(lines,bodyX,ctx.y+2.2,{baseline:'top'});
    ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y+h,PAGE.w-PAGE.right,ctx.y+h);
    ctx.y+=h;
  }

  function profileRows(ctx,rows){
    const gap=4;
    const colW=(CONTENT_W-gap)/2;
    const xs=[PAGE.left,PAGE.left+colW+gap];
    arr(rows).forEach((row,rowIndex)=>{
      const cells=[row[0]||[],row[1]||[]];
      const metrics=cells.map(([label,value])=>{
        const labelLines=present(label)?wrap(ctx,String(label).toUpperCase(),colW-5,7.0,'bold'):[];
        const valueLines=present(value)?wrap(ctx,value,colW-5,8.45,'bold'):[];
        return {labelLines,valueLines,h:Math.max(10.6,2.2+labelLines.length*3.05+1.0+valueLines.length*3.75+2.0)};
      });
      const h=Math.max(metrics[0].h,metrics[1].h);
      ensure(ctx,h);
      cells.forEach(([label,value],i)=>{
        const x=xs[i];
        if(rowIndex%2===1){ctx.doc.setFillColor(250,251,253);ctx.doc.rect(x,ctx.y,colW,h,'F');}
        if(present(label)){
          setFont(ctx,7.0,'bold',MUTED);
          ctx.doc.text(metrics[i].labelLines,x+2.5,ctx.y+2.1,{baseline:'top'});
        }
        if(present(value)){
          const valueY=ctx.y+2.1+metrics[i].labelLines.length*3.05+1.0;
          setFont(ctx,8.45,'bold',NAVY);
          ctx.doc.text(metrics[i].valueLines,x+2.5,valueY,{baseline:'top'});
        }
      });
      ctx.doc.setDrawColor(...LINE);
      ctx.doc.line(PAGE.left,ctx.y+h,PAGE.w-PAGE.right,ctx.y+h);
      ctx.y+=h;
    });
    ctx.y+=2.3;
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
    const start=PAGE.left+6, end=PAGE.w-PAGE.right-6, width=end-start, y=ctx.y+2.5;
    ensure(ctx,10.2);
    ctx.doc.setLineWidth(0.4);ctx.doc.setDrawColor(...LINE);ctx.doc.line(start,y,end,y);
    labels.forEach((label,i)=>{
      const x=start+(width/(labels.length-1))*i;
      const completed=i<current, active=i===current;
      ctx.doc.setFillColor(...(completed||active?BLUE:[226,232,240]));
      ctx.doc.circle(x,y,active?1.85:1.4,'F');
      setFont(ctx,6.05,active?'bold':'normal',active?NAVY:MUTED);
      ctx.doc.text(ctx.doc.splitTextToSize(label,28),x,y+2.9,{align:'center',baseline:'top'});
    });
    ctx.y+=9.7;
  }

  function cvValidationScoreText(v){
    return Number.isFinite(Number(v?.nameScore))?`${Math.round(Number(v.nameScore)*100)}%`:null;
  }

  function cvValidationIdentityText(v){
    if(!v)return'';
    const parts=[];
    if(present(v.candidateName))parts.push(`Nama form: ${clean(v.candidateName)}`);
    if(present(v.cvName))parts.push(`Nama CV: ${clean(v.cvName)}`);
    const score=cvValidationScoreText(v);if(score)parts.push(`Kecocokan: ${score}`);
    return parts.join(' · ');
  }

  function cvSummary(model){
    const v=model?.cvValidation||null;
    const x=model?.cvExtraction||{state:'module_unavailable'};
    if(v){
      const identity=cvValidationIdentityText(v);
      const suffix=identity?` ${identity}.`:'';
      if(v.gate==='allow'||String(v.label||'').toUpperCase()==='VALID')return {title:'CV Valid',body:`CV berhasil dibaca, terindikasi sebagai CV, dan identitas kandidat konsisten.${suffix}`,kind:'good'};
      if(v.label==='NAMA PERLU KONFIRMASI')return {title:'Nama CV Perlu Konfirmasi',body:`CV terbaca, tetapi nama pada CV tidak identik dengan nama form.${suffix} Verifikasi HR diperlukan sebelum keputusan Screening. Kandidat tidak ditolak otomatis.`,kind:'warn'};
      if(v.label==='IDENTITAS TERINDIKASI BERBEDA')return {title:'Identitas Terindikasi Berbeda',body:`Nama pada CV terindikasi berbeda signifikan dari data lamaran.${suffix} Klarifikasi kandidat sebelum keputusan; kondisi ini tidak melakukan auto-reject.`,kind:'danger'};
      if(v.label==='CV SCAN / TEKS TIDAK TERBACA')return {title:'Review Manual Diperlukan',body:'CV terindikasi berupa scan/gambar sehingga identitas dan isi dokumen belum dapat diverifikasi otomatis. HR perlu membuka CV asli secara manual sebelum keputusan Screening.',kind:'warn'};
      if(v.label==='CV BELUM TERSEDIA')return {title:'CV Belum Tersedia',body:'Belum ada CV kandidat yang dapat diverifikasi. Minta kandidat melengkapi CV sebelum keputusan Screening.',kind:'warn'};
      if(v.gate==='system_error'||v.label==='ERROR SISTEM CV')return {title:'Error Sistem CV',body:'Validasi CV mengalami kendala sistem. Coba ulang atau verifikasi file asli secara manual; error sistem tidak boleh digunakan sebagai alasan menolak kandidat.',kind:'danger'};
      if(v.label==='FORMAT CV PERLU REVIEW')return {title:'Dokumen CV Perlu Review',body:clean(v.recommendation)||'Dokumen belum dapat dipastikan sebagai CV yang valid. Verifikasi file asli secara manual sebelum keputusan Screening.',kind:'warn'};
      return {title:clean(v.label)||'CV Perlu Review',body:clean(v.recommendation)||'Verifikasi CV secara manual sebelum keputusan Screening.',kind:v.tone==='red'?'danger':v.tone==='emerald'?'good':'warn'};
    }
    if(x.state==='not_available')return {title:'CV Belum Tersedia',body:'Belum ada CV kandidat yang dapat diverifikasi. Keputusan screening tidak boleh didasarkan pada asumsi data CV.',kind:'warn'};
    if(x.state==='module_unavailable')return {title:'Review Manual Diperlukan',body:'Pembacaan CV otomatis tidak tersedia saat laporan dibuat. Verifikasi file asli secara manual; kondisi sistem ini tidak memengaruhi keputusan kandidat.',kind:'warn'};
    if(x.state==='unsupported')return {title:'Format CV Perlu Review',body:x.reason==='DOC_LEGACY_NOT_SUPPORTED'?'Format .DOC lama belum dapat dibaca otomatis. Verifikasi file asli secara manual atau gunakan PDF/DOCX bila diperlukan.':'Format CV belum didukung untuk pembacaan otomatis. Verifikasi file asli secara manual.',kind:'warn'};
    if(x.state==='text_unavailable'||x.state==='empty')return {title:'Review Manual Diperlukan',body:'CV tersedia, namun isi dokumen belum dapat diverifikasi otomatis. HR perlu memverifikasi CV asli secara manual. Kondisi ini tidak memengaruhi keputusan kandidat secara otomatis.',kind:'warn'};
    if(x.state==='error')return {title:'CV Tidak Dapat Diproses',body:'CV tidak dapat dibaca otomatis saat laporan dibuat. Verifikasi file asli secara manual; kegagalan pemrosesan tidak boleh memengaruhi keputusan kandidat secara otomatis.',kind:'danger'};
    return {title:x.verified===true?'CV Terverifikasi':'CV Berhasil Dibaca',body:x.verified===true?'Isi CV telah dibaca otomatis dan berstatus terverifikasi oleh HR.':'Isi CV berhasil dibaca otomatis, namun hasil pembacaan tetap merupakan data pendukung sampai diverifikasi HR.',kind:x.verified===true?'good':'info'};
  }

  function nextAction(model){
    const stage=clean(model?.application?.current_stage).toLowerCase();
    const cv=model?.cvExtraction||{},v=model?.cvValidation||null;
    if(/screen/.test(stage)){
      if(v&&v.gate!=='allow'){
        if(v.gate==='system_error')return'Coba ulang validasi CV atau verifikasi file asli secara manual; jangan gunakan error sistem sebagai dasar keputusan kandidat.';
        if(v.candidateAction==='clarify')return'Verifikasi identitas/nama pada CV, lalu review persyaratan Screening HR dan tetapkan keputusan.';
        if(v.candidateAction==='reupload')return'Verifikasi dokumen CV; bila diperlukan minta kandidat mengunggah CV yang benar/lengkap sebelum keputusan Screening.';
        return'Review CV asli secara manual, lalu verifikasi persyaratan Screening HR dan tetapkan keputusan.';
      }
      if(v?.gate==='allow')return'Review persyaratan Screening HR dan tetapkan keputusan untuk tahap berikutnya.';
      if(['text_unavailable','unsupported','module_unavailable','error','not_available','empty'].includes(cv.state))return'Review CV asli, verifikasi persyaratan Screening HR, lalu tetapkan keputusan screening.';
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
    const cv=model?.cvExtraction||{},v=model?.cvValidation||null;
    const screening=model?.screening;
    if(v&&v.gate!=='allow'){
      if(v.gate==='system_error')return'Validasi CV mengalami error sistem; kandidat tidak boleh dirugikan karena kendala sistem.';
      if(v.label==='NAMA PERLU KONFIRMASI')return'Nama pada CV mirip tetapi tidak identik dengan nama form; verifikasi HR diperlukan.';
      if(v.label==='IDENTITAS TERINDIKASI BERBEDA')return'Identitas pada CV terindikasi berbeda dari data lamaran; klarifikasi diperlukan sebelum keputusan.';
      if(v.label==='CV SCAN / TEKS TIDAK TERBACA')return'CV berupa scan/gambar; identitas dan isi CV perlu diverifikasi manual.';
      if(v.label==='FORMAT CV PERLU REVIEW')return'Dokumen belum dapat dipastikan sebagai CV yang valid; review manual diperlukan.';
      if(v.label==='CV BELUM TERSEDIA')return'CV kandidat belum tersedia untuk diverifikasi.';
      return clean(v.recommendation)||'CV memerlukan review HR sebelum keputusan.';
    }
    if(cv.state==='text_unavailable')return'Isi CV belum dapat dibaca otomatis; verifikasi manual diperlukan.';
    if(cv.state==='error')return'Terdapat kendala saat membaca CV; jangan gunakan kegagalan pemrosesan sebagai dasar keputusan kandidat.';
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
    ensure(ctx,35);
    setFont(ctx,12.4,'bold',NAVY);
    ctx.doc.text('LAPORAN KANDIDAT TERINTEGRASI',PAGE.left,ctx.y,{baseline:'top'});
    setFont(ctx,7.6,'normal',MUTED);
    ctx.doc.text('Executive Recruitment Assessment Report',PAGE.left,ctx.y+5.3,{baseline:'top'});
    ctx.y+=12.2;

    const status=humanResult(clean(m.overall?.label)||clean(a.current_stage)||'Dalam Proses');
    const statusW=51;
    const nameW=CONTENT_W-statusW-8;
    setFont(ctx,19.5,'bold',NAVY);
    const nameLines=ctx.doc.splitTextToSize(c.candidate_name||'—',nameW);
    ctx.doc.text(nameLines,PAGE.left,ctx.y,{baseline:'top'});
    pill(ctx,status,PAGE.w-PAGE.right-statusW,ctx.y+0.4,statusW);
    ctx.y+=Math.max(10.2,nameLines.length*7.1);

    setFont(ctx,9.4,'normal',SLATE);
    ctx.doc.text(`${p.position_name||'Posisi tidak tercatat'} · ${co.brand||co.company_name||'Perusahaan tidak tercatat'}`,PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=5.6;
    const meta=[`Tahap: ${a.current_stage||'—'}`,`Lamaran: ${fmtDateOnly(a.application_date||a.applied_at||a.created_at)}`,`Status: ${a.status||'—'}`];
    if(present(c.source||a.source))meta.push(`Sumber: ${c.source||a.source}`);
    setFont(ctx,7.35,'normal',MUTED);
    ctx.doc.text(meta.join('   ·   '),PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=5.8;
    ctx.doc.setDrawColor(...LINE);ctx.doc.setLineWidth(0.35);ctx.doc.line(PAGE.left,ctx.y,PAGE.w-PAGE.right,ctx.y);
    ctx.y+=4.2;
  }

  function executive(ctx){
    const m=ctx.model,a=m.application||{};
    sectionHeading(ctx,'Ringkasan Eksekutif','',22);
    const overall=humanResult(clean(m.overall?.label)||a.current_stage||'Dalam Proses');
    const gap=4, leftW=56, rightW=CONTENT_W-leftW-gap;
    const statusLines=wrap(ctx,a.current_stage||'—',leftW-7,8.8,'bold');
    const decisionLines=wrap(ctx,overall,leftW-7,7.8,'bold');
    const actionLines=wrap(ctx,nextAction(m),rightW-7,8.0,'normal');
    const topH=Math.max(15.5,6.5+statusLines.length*3.8+decisionLines.length*3.35,6.5+actionLines.length*3.65);
    ensure(ctx,topH+10);

    ctx.doc.setFillColor(248,250,252);ctx.doc.setDrawColor(...LINE);
    ctx.doc.rect(PAGE.left,ctx.y,leftW,topH,'FD');
    ctx.doc.rect(PAGE.left+leftW+gap,ctx.y,rightW,topH,'FD');
    microLabel(ctx,'Status Saat Ini',PAGE.left+3,ctx.y+2.2);
    setFont(ctx,8.8,'bold',NAVY);ctx.doc.text(statusLines,PAGE.left+3,ctx.y+6.0,{baseline:'top'});
    setFont(ctx,7.8,'bold',statusTone(overall).text);
    ctx.doc.text(decisionLines,PAGE.left+3,ctx.y+6.0+statusLines.length*3.8+0.6,{baseline:'top'});

    microLabel(ctx,'Tindakan HR',PAGE.left+leftW+gap+3,ctx.y+2.2);
    setFont(ctx,8.0,'normal',SLATE);
    ctx.doc.text(actionLines,PAGE.left+leftW+gap+3,ctx.y+6.0,{baseline:'top'});
    ctx.y+=topH+2.0;

    const attention=currentAttention(m);
    const attentionLines=wrap(ctx,attention,CONTENT_W-39,7.9,'normal');
    const noteH=Math.max(8.0,3.8+attentionLines.length*3.55);
    ensure(ctx,noteH);
    ctx.doc.setFillColor(255,251,235);ctx.doc.setDrawColor(253,230,138);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,noteH,'FD');
    microLabel(ctx,'Catatan Perhatian',PAGE.left+3,ctx.y+2.1,[146,64,14]);
    setFont(ctx,7.9,'normal',SLATE);ctx.doc.text(attentionLines,PAGE.left+37,ctx.y+2.0,{baseline:'top'});
    ctx.y+=noteH+1.8;
    recruitmentProgress(ctx);
  }

  function profile(ctx){
    const c=ctx.model.candidate||{};
    sectionHeading(ctx,'Profil Kandidat','',15);
    const colW=CONTENT_W/3;
    const rows=[
      [
        {label:'Pendidikan',value:c.education,span:1},
        {label:'Jurusan',value:c.major,span:1},
        {label:'Domisili',value:c.city,span:1}
      ],
      [
        {label:'Pengalaman yang Dilaporkan',value:present(c.experience)?`${c.experience}${Number.isFinite(Number(c.experience))?' tahun':''}`:null,span:1},
        {label:'Ekspektasi Gaji',value:present(c.expected_salary)?money(c.expected_salary):null,span:1},
        {label:'Notice Period',value:c.notice_period,span:1}
      ],
      [
        {label:'Posisi Terakhir',value:c.last_role,span:1},
        {label:'Perusahaan Terakhir',value:c.last_company,span:2}
      ],
      [
        {label:'Bersedia Shift',value:c.willing_shift,span:1},
        {label:'Alasan Melamar',value:c.apply_reason,span:2}
      ]
    ];
    rows.forEach((cells,rowIndex)=>{
      let cursor=0;
      const metrics=cells.map(cell=>{
        const w=colW*cell.span;
        const labelLines=present(cell.label)?wrap(ctx,String(cell.label).toUpperCase(),w-5,6.85,'bold'):[];
        const valueLines=present(cell.value)?wrap(ctx,cell.value,w-5,8.25,'bold'):[];
        return {w,labelLines,valueLines,h:Math.max(10.0,2.0+labelLines.length*2.9+0.8+valueLines.length*3.55+1.7)};
      });
      const h=Math.max(...metrics.map(m=>m.h));
      ensure(ctx,h);
      if(rowIndex%2===1){ctx.doc.setFillColor(250,251,253);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,h,'F');}
      cells.forEach((cell,i)=>{
        const x=PAGE.left+cursor*colW;
        const m=metrics[i];
        setFont(ctx,6.85,'bold',MUTED);ctx.doc.text(m.labelLines,x+2.4,ctx.y+1.9,{baseline:'top'});
        const valueY=ctx.y+1.9+m.labelLines.length*2.9+0.8;
        setFont(ctx,8.25,'bold',NAVY);ctx.doc.text(m.valueLines,x+2.4,valueY,{baseline:'top'});
        cursor+=cell.span;
        if(cursor<3){ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left+cursor*colW,ctx.y,PAGE.left+cursor*colW,ctx.y+h);}
      });
      ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y+h,PAGE.w-PAGE.right,ctx.y+h);
      ctx.y+=h;
    });
    ctx.y+=2.0;
  }

  function cvSection(ctx){
    const x=ctx.model.cvExtraction||{state:'module_unavailable'};
    const summary=cvSummary(ctx.model);
    const tone={warn:[217,119,6],danger:[185,28,28],good:[5,150,105],info:[37,99,235],neutral:[100,116,139]}[summary.kind]||[100,116,139];
    const titleLines=wrap(ctx,summary.title,CONTENT_W-8,8.2,'bold');
    const bodyLines=wrap(ctx,summary.body,CONTENT_W-8,8.15,'normal');
    const h=3+titleLines.length*3.7+bodyLines.length*3.8+3.2;
    sectionHeading(ctx,'Validasi CV','',h+2);
    ensure(ctx,h);
    ctx.doc.setFillColor(250,251,253);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,h,'F');
    ctx.doc.setFillColor(...tone);ctx.doc.rect(PAGE.left,ctx.y,2.2,h,'F');
    setFont(ctx,8.2,'bold',tone);ctx.doc.text(titleLines,PAGE.left+5,ctx.y+2.4,{baseline:'top'});
    setFont(ctx,8.15,'normal',SLATE);ctx.doc.text(bodyLines,PAGE.left+5,ctx.y+2.8+titleLines.length*3.7,{baseline:'top'});
    ctx.y+=h+1.4;

    const validation=ctx.model?.cvValidation||null;
    if(validation){
      const identity=cvValidationIdentityText(validation);
      if(identity){
        const lines=wrap(ctx,identity,CONTENT_W-4,7.25,'normal');
        const metaH=Math.max(4.8,lines.length*3.35+1.5);
        ensure(ctx,metaH);
        setFont(ctx,7.25,'normal',MUTED);ctx.doc.text(lines,PAGE.left+2,ctx.y+0.8,{baseline:'top'});
        ctx.y+=metaH;
      }
    }
    ctx.y+=0.8;

    if(!['available','success','ok','extracted'].includes(String(x.state||'').toLowerCase()))return;
    const sec=x.sections||{};
    const groups=[['Pendidikan',sec.education],['Pengalaman Kerja',sec.experience],['Keahlian / Kompetensi',sec.skills],['Sertifikasi / Pelatihan',sec.certifications],['Bahasa',sec.languages]].filter(([,items])=>arr(items).length);
    if(groups.length){
      groups.forEach(([label,items])=>{
        microLabel(ctx,label,PAGE.left,ctx.y);ctx.y+=3.8;
        bullets(ctx,arr(items).slice(0,6),{size:7.9,lineH:3.8,gap:0});
      });
    }else if(arr(x.previewLines).length){
      microLabel(ctx,'Cuplikan CV',PAGE.left,ctx.y);ctx.y+=3.8;
      bullets(ctx,arr(x.previewLines).slice(0,6),{size:7.9,lineH:3.8,gap:0});
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
    const parts=raw.split(';').map(x=>clean(x)).filter(Boolean).map(x=>x.charAt(0).toUpperCase()+x.slice(1));
    return parts.length>1?parts.join(' · '):(clean(raw)||'—');
  }

  function screeningDetailResult(raw,actual){
    const result=humanResult(raw);
    if(!present(actual)&&/perlu klarifikasi|perlu review/i.test(result))return'Perlu Verifikasi';
    return result;
  }

  function screening(ctx){
    const block=ctx.model.screening;
    sectionHeading(ctx,'Screening','',20);
    if(block?.state==='error'){
      callout(ctx,'Data Screening Tidak Dapat Dimuat','Terjadi error saat membaca data Screening. Kondisi sistem tidak boleh digunakan sebagai dasar keputusan kandidat.','danger',{bodySize:8.2});return;
    }
    if(block?.state!=='available'){
      callout(ctx,'Belum Ada Data Screening','Belum ditemukan hasil Screening tersimpan untuk kandidat ini.','neutral',{bodySize:8.2});return;
    }
    const s=block.data||{};
    const summaryParts=[
      `Hasil Sistem: ${humanResult(s.systemStatus)}`,
      s.reviewDecision?`Keputusan HR: ${humanResult(s.reviewDecision)}`:null,
      s.matchScore==null?null:`Match: ${Number(s.matchScore).toFixed(1)}%`,
      `Tanggal: ${fmtDate(s.screenedAt)}`
    ].filter(Boolean);
    infoRow(ctx,'Ringkasan Screening',summaryParts.join('   ·   '),{bodySize:8.0,fill:[248,250,252],labelW:42});
    if(s.reviewNotes) callout(ctx,'Catatan Review HR',`${s.reviewNotes}${s.reviewedBy||s.reviewedAt?`\n${s.reviewedBy||'Reviewer tidak tercatat'} · ${fmtDate(s.reviewedAt)}`:''}`,'info',{bodySize:8.1,gap:1.7});
    const details=arr(s.details);
    if(details.length){
      table(ctx,[
        {label:'Aspek',key:'aspect',width:27},
        {label:'Persyaratan Posisi',key:'requirement',width:77},
        {label:'Evidence Kandidat',key:'actual',width:45},
        {label:'Status',key:'result',width:31}
      ],details.map(x=>{
        const rawRequirement=clean(x.text||x.requirement_id)||'—';
        return{
          aspect:screeningAspect(rawRequirement),
          requirement:screeningRequirement(rawRequirement),
          actual:present(x.actual)?clean(x.actual):'Belum diverifikasi',
          result:screeningDetailResult(x.result||x.rule,x.actual)
        };
      }),{fontSize:7.2,lineH:3.45,padY:1.7,boldFirst:true,headerH:7.2});
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
    const inlineDocs=rows.length<=3;
    sectionHeading(ctx,'Riwayat Rekrutmen','',inlineDocs?14:16);
    if(inlineDocs){
      rows.forEach(x=>{
        const date=fmtDate(x.date), event=clean(x.event||'Aktivitas');
        const meta=[x.actor?`Aktor: ${x.actor}`:null,x.notes?clean(x.notes):null].filter(Boolean).join(' · ');
        const dateW=44;
        const eventLines=wrap(ctx,event,CONTENT_W-dateW-3,8.0,'bold');
        const metaLines=meta?wrap(ctx,meta,CONTENT_W-dateW-3,7.2,'normal'):[];
        const h=Math.max(7,eventLines.length*3.8+(metaLines.length?metaLines.length*3.4+1:0));
        ensure(ctx,h+1);
        setFont(ctx,7.2,'normal',MUTED);ctx.doc.text(date,PAGE.left,ctx.y,{baseline:'top'});
        setFont(ctx,8.0,'bold',NAVY);ctx.doc.text(eventLines,PAGE.left+dateW,ctx.y,{baseline:'top'});
        if(metaLines.length){setFont(ctx,7.2,'normal',SLATE);ctx.doc.text(metaLines,PAGE.left+dateW,ctx.y+eventLines.length*3.8+0.7,{baseline:'top'});}
        ctx.y+=h;
        ctx.doc.setDrawColor(...LINE);ctx.doc.line(PAGE.left,ctx.y,PAGE.w-PAGE.right,ctx.y);ctx.y+=1.2;
      });
      const m=ctx.model, docs=arr(m.attachments?.psychDocuments);
      const cvText=m.attachments?.cvAvailable?'CV tersedia; file asli disertakan terpisah':'CV belum tersedia';
      const psychText=docs.length?`Psikotes: ${docs.length} dokumen tersimpan`:'Psikotes belum tersedia';
      const docLines=wrap(ctx,`${cvText}   ·   ${psychText}`,CONTENT_W-38,7.8,'normal');
      const docH=Math.max(7.2,3.5+docLines.length*3.6);
      ensure(ctx,docH);
      microLabel(ctx,'Dokumen Pendukung',PAGE.left,ctx.y+1.6);
      setFont(ctx,7.8,'normal',SLATE);ctx.doc.text(docLines,PAGE.left+38,ctx.y+1.5,{baseline:'top'});
      ctx.y+=docH;
      ctx.__attachmentsInline=true;
      return;
    }
    table(ctx,[
      {label:'Tanggal',key:'date',width:38},{label:'Event',key:'event',width:48},{label:'Aktor',key:'actor',width:38},{label:'Catatan',key:'notes',width:56}
    ],rows.map(x=>({date:fmtDate(x.date),event:x.event||'Aktivitas',actor:x.actor||'—',notes:x.notes||'—'})),{fontSize:7.2});
  }

  function attachments(ctx){
    if(ctx.__attachmentsInline)return;
    const m=ctx.model, docs=arr(m.attachments?.psychDocuments);
    const cvText=m.attachments?.cvAvailable?'CV tersedia; file asli disertakan terpisah':'CV belum tersedia';
    const psychText=docs.length?`Psikotes: ${docs.length} dokumen tersimpan`:'Psikotes belum tersedia';
    sectionHeading(ctx,'Dokumen Pendukung','',8);
    const lines=wrap(ctx,`${cvText}   ·   ${psychText}`,CONTENT_W,8.0,'normal');
    ensure(ctx,Math.max(5.5,lines.length*3.7));
    setFont(ctx,8.0,'normal',SLATE);
    ctx.doc.text(lines,PAGE.left,ctx.y,{baseline:'top'});
    ctx.y+=Math.max(5.5,lines.length*3.7);
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
      doc.setDrawColor(...LINE);doc.setLineWidth(0.3);
      doc.line(PAGE.left,14.5,PAGE.w-PAGE.right,14.5);
      setFont(ctx,6.2,'bold',SLATE);
      doc.text(p===1?'MEGROUP · RECRUITMENT':'LAPORAN KANDIDAT TERINTEGRASI',PAGE.left,8.5,{baseline:'top'});
      setFont(ctx,6.1,'normal',MUTED);
      doc.text(candidate,PAGE.w-PAGE.right,8.5,{align:'right',baseline:'top'});
      doc.line(PAGE.left,286,PAGE.w-PAGE.right,286);
      setFont(ctx,6.0,'normal',MUTED);
      doc.text(`Internal HR · Rahasia · ${appId}`,PAGE.left,289,{baseline:'top'});
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

  async function ensureCvValidation(model,appId){
    if(!model)return model;
    const id=appId||model?.application?.application_id||null;
    if(!id)return model;
    if(model.cvValidation?.applicationId===id)return model;
    const validator=window.CandidateCvValidationGateV1?.validate||window.validateCandidateCvV1;
    if(typeof validator!=='function')return model;
    try{model.cvValidation=await validator(id);}
    catch(error){
      model.cvValidation={applicationId:id,gate:'system_error',label:'ERROR SISTEM CV',tone:'red',candidateAction:'none',recommendation:'Validasi CV tidak dapat dijalankan. Verifikasi file asli secara manual; jangan gunakan error sistem sebagai dasar keputusan kandidat.',cvReason:error?.message||String(error)};
    }
    return model;
  }

  async function resolveModel(appId){
    const state=window.CandidateDossierV1?.state;
    let model=null;
    if(!appId&&state?.lastModel)model=state.lastModel;
    else if(appId&&state?.lastModel?.application?.application_id===appId)model=state.lastModel;
    else if(typeof window.collectCandidateDossierDataV1==='function')model=await window.collectCandidateDossierDataV1(appId);
    else throw new Error('DOSSIER_COLLECTOR_NOT_AVAILABLE');
    return await ensureCvValidation(model,appId);
  }

  async function downloadCandidateDossierPdf(appId){
    try{
      const model=await resolveModel(appId);
      const doc=buildCandidateDossierPdf(model);
      doc.save(filenameFor(model));
      toast('Laporan Kandidat PDF berhasil dibuat.','success');
      return doc;
    }catch(error){
      console.error('[Laporan Kandidat PDF V1.6.1] download failed',error);
      const message=error?.message==='JSPDF_NOT_AVAILABLE'?'Library jsPDF tidak tersedia pada halaman ini.':(error?.message||'PDF gagal dibuat.');
      toast('Laporan Kandidat PDF gagal dibuat: '+message,'danger');
      return null;
    }
  }

  async function candidateDossierPdfBlob(modelOrAppId){
    let model=typeof modelOrAppId==='object'&&modelOrAppId?.application?modelOrAppId:await resolveModel(modelOrAppId);
    model=await ensureCvValidation(model,model?.application?.application_id||modelOrAppId);
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
      info.innerHTML='<b>Laporan PDF V1.6.1:</b> clean-grid Executive Recruitment Assessment Report. Paket Dokumen tetap menggunakan PDF dan model canonical yang sama.';
    }
  }

  function installOpenHook(){
    const current=window.openCandidateDossierV1;
    if(typeof current!=='function'||current.__candidateDossierPdfV16Wrapped)return;
    const wrapped=async function(...args){
      const result=await current.apply(this,args);
      setTimeout(activatePdfButton,0);
      setTimeout(activatePdfButton,120);
      return result;
    };
    wrapped.__candidateDossierPdfV16Wrapped=true;
    wrapped.__candidateDossierPdfV16Original=current;
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
  console.log('%cLaporan Kandidat PDF V1.6.1 active','color:#2563eb;font-weight:bold');
})();
