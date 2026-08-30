/* ==========================================================================
   CANDIDATE DOSSIER PDF V1 - NATIVE A4
   Branch: feature/candidate-dossier-v1

   Design constraints:
   - Uses the exact normalized model from CandidateDossierV1.state.lastModel.
   - Native jsPDF A4 portrait; no window.print, iframe print, or HTML screenshot.
   - No database writes, no stage transitions, no MutationObserver.
   - Long tables paginate and repeat their headers.
   - Exposes a Blob builder for the future Candidate Document Package.
   ========================================================================== */
(function(){
  'use strict';

  if(window.__ATS_CANDIDATE_DOSSIER_PDF_V1_ACTIVE) return;
  window.__ATS_CANDIDATE_DOSSIER_PDF_V1_ACTIVE=true;

  const VERSION='1.1.0-pdf';
  const PAGE={w:210,h:297,left:14,right:14,top:23,bottom:281};
  const CONTENT_W=PAGE.w-PAGE.left-PAGE.right;
  const TEST_LABELS={CIFT:'Tes Kognitif',PAPIKOSTIK:'PAPI Kostick',INTEGRITY:'Tes Integritas',MSDT:'MSDT',DISC:'DISC',OVERALL:'Kesimpulan'};

  const arr=v=>Array.isArray(v)?v:[];
  const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const asText=v=>present(v)?String(v):'—';
  const fmtDate=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}};
  const fmtDateOnly=v=>{if(!v)return'—';try{return new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}catch(_){return String(v);}};
  const money=v=>{if(!present(v))return'—';const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n):String(v);};
  const safeName=v=>String(v||'Candidate').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'Candidate';
  const psychDecision=p=>{const status=String(p?.status||'').trim();if(status!=='Selesai')return'Belum Ada';return p?.workflowDecision||'Perlu Review HR';};

  function toast(msg,type='warning'){
    if(typeof window.showToast==='function')return window.showToast(msg,type);
    console.warn(msg);
  }

  function jsPDFCtor(){
    return window.jspdf?.jsPDF||window.jsPDF||null;
  }

  function createPdf(model){
    const Ctor=jsPDFCtor();
    if(!Ctor) throw new Error('JSPDF_NOT_AVAILABLE');
    const doc=new Ctor({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    const ctx={doc,model,y:PAGE.top,pageNo:1};
    doc.setProperties({
      title:`Laporan Kandidat Terintegrasi - ${model?.candidate?.candidate_name||'Candidate'}`,
      subject:`Laporan Kandidat Terintegrasi ${model?.application?.application_id||''}`,
      author:'MEGROUP Recruitment Tracker',
      creator:`Laporan Kandidat Terintegrasi PDF ${VERSION}`
    });
    return ctx;
  }

  function setFont(ctx,size=9,style='normal',color=[15,23,42]){
    ctx.doc.setFont('helvetica',style);
    ctx.doc.setFontSize(size);
    ctx.doc.setTextColor(...color);
  }

  function addPage(ctx){
    ctx.doc.addPage('a4','portrait');
    ctx.pageNo+=1;
    ctx.y=PAGE.top;
  }

  function ensure(ctx,height){
    if(ctx.y+height>PAGE.bottom) addPage(ctx);
  }

  function wrap(ctx,text,width,fontSize=9,style='normal'){
    setFont(ctx,fontSize,style);
    return ctx.doc.splitTextToSize(String(text??'—'),Math.max(5,width));
  }

  function textBlock(ctx,text,opts={}){
    const x=opts.x??PAGE.left;
    const width=opts.width??CONTENT_W;
    const fontSize=opts.fontSize??9;
    const style=opts.style??'normal';
    const color=opts.color??[51,65,85];
    const lineH=opts.lineH??4.4;
    const gapAfter=opts.gapAfter??2;
    const lines=wrap(ctx,text,width,fontSize,style);
    let i=0;
    while(i<lines.length){
      const available=Math.max(lineH,PAGE.bottom-ctx.y);
      const maxLines=Math.max(1,Math.floor(available/lineH));
      const chunk=lines.slice(i,i+maxLines);
      ensure(ctx,chunk.length*lineH);
      setFont(ctx,fontSize,style,color);
      ctx.doc.text(chunk,x,ctx.y,{baseline:'top'});
      ctx.y+=chunk.length*lineH;
      i+=chunk.length;
      if(i<lines.length)addPage(ctx);
    }
    ctx.y+=gapAfter;
    return ctx.y;
  }

  function bulletList(ctx,items,opts={}){
    const values=arr(items).filter(present);
    if(!values.length){textBlock(ctx,opts.emptyText||'Tidak ada data tersimpan.',{fontSize:8.5,color:[100,116,139]});return;}
    const x=opts.x??PAGE.left;
    const width=opts.width??CONTENT_W;
    values.forEach(item=>{
      ensure(ctx,5);
      setFont(ctx,9,'normal',[51,65,85]);
      ctx.doc.text('•',x,ctx.y,{baseline:'top'});
      textBlock(ctx,String(item),{x:x+4,width:width-4,fontSize:9,lineH:4.4,gapAfter:1});
    });
  }

  function sectionTitle(ctx,letter,title,subtitle=''){
    ensure(ctx,16+(subtitle?5:0));
    const y=ctx.y;
    ctx.doc.setFillColor(248,250,252);
    ctx.doc.setDrawColor(226,232,240);
    ctx.doc.roundedRect(PAGE.left,y,CONTENT_W,subtitle?17:13,2,2,'FD');
    ctx.doc.setFillColor(15,23,42);
    ctx.doc.roundedRect(PAGE.left+3,y+3,8,8,1.5,1.5,'F');
    setFont(ctx,8,'bold',[255,255,255]);
    ctx.doc.text(String(letter),PAGE.left+7,y+7.1,{align:'center',baseline:'middle'});
    setFont(ctx,12,'bold',[15,23,42]);
    ctx.doc.text(String(title),PAGE.left+15,y+4.2,{baseline:'top'});
    if(subtitle){setFont(ctx,7.5,'normal',[100,116,139]);ctx.doc.text(String(subtitle),PAGE.left+15,y+10,{baseline:'top'});}
    ctx.y+=subtitle?21:17;
  }

  function kvGrid(ctx,items,cols=2){
    const values=arr(items).filter(x=>present(x?.[1]));
    if(!values.length)return;
    const gap=3;
    const colW=(CONTENT_W-gap*(cols-1))/cols;
    for(let i=0;i<values.length;i+=cols){
      const row=values.slice(i,i+cols);
      const heights=row.map(([label,value])=>{
        const lines=wrap(ctx,asText(value),colW-6,9,'bold');
        return Math.max(15,9+lines.length*4.2);
      });
      const h=Math.max(...heights);
      ensure(ctx,h+3);
      row.forEach(([label,value],j)=>{
        const x=PAGE.left+j*(colW+gap);
        ctx.doc.setFillColor(248,250,252);
        ctx.doc.setDrawColor(241,245,249);
        ctx.doc.roundedRect(x,ctx.y,colW,h,2,2,'FD');
        setFont(ctx,6.8,'normal',[148,163,184]);
        ctx.doc.text(String(label).toUpperCase(),x+3,ctx.y+3,{baseline:'top'});
        setFont(ctx,9,'bold',[15,23,42]);
        const lines=ctx.doc.splitTextToSize(asText(value),colW-6);
        ctx.doc.text(lines,x+3,ctx.y+8,{baseline:'top'});
      });
      ctx.y+=h+3;
    }
  }

  function noteBox(ctx,title,body,opts={}){
    const lines=wrap(ctx,body,CONTENT_W-10,8.5,'normal');
    const fill=opts.fill||[248,250,252];
    const border=opts.border||[226,232,240];
    const titleColor=opts.titleColor||[51,65,85];
    const lineH=4.2;
    let offset=0,part=0;
    while(offset<lines.length||(!lines.length&&part===0)){
      if(PAGE.bottom-ctx.y<18)addPage(ctx);
      const maxLines=Math.max(1,Math.floor((PAGE.bottom-ctx.y-13)/lineH));
      const chunk=lines.slice(offset,offset+maxLines);
      const h=12+Math.max(1,chunk.length)*lineH;
      ctx.doc.setFillColor(...fill);ctx.doc.setDrawColor(...border);
      ctx.doc.roundedRect(PAGE.left,ctx.y,CONTENT_W,h,2,2,'FD');
      setFont(ctx,8,'bold',titleColor);ctx.doc.text(part?`${title} (lanjutan)`:title,PAGE.left+4,ctx.y+4,{baseline:'top'});
      setFont(ctx,8.5,'normal',[51,65,85]);ctx.doc.text(chunk.length?chunk:['—'],PAGE.left+4,ctx.y+9,{baseline:'top'});
      ctx.y+=h+3;
      offset+=chunk.length;part+=1;
      if(offset<lines.length)addPage(ctx);
      if(!lines.length)break;
    }
  }

  function table(ctx,columns,rows,opts={}){
    const widths=columns.map(c=>c.width);
    const total=widths.reduce((a,b)=>a+b,0);
    const scale=CONTENT_W/total;
    const colW=widths.map(w=>w*scale);
    const lineH=opts.lineH||3.8;
    const pad=2;
    const headerH=8;

    function drawHeader(){
      ensure(ctx,headerH+4);
      ctx.doc.setFillColor(248,250,252);ctx.doc.setDrawColor(226,232,240);
      ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,headerH,'FD');
      let x=PAGE.left;
      columns.forEach((c,i)=>{
        setFont(ctx,7,'bold',[51,65,85]);
        ctx.doc.text(String(c.label),x+pad,ctx.y+2.2,{baseline:'top'});
        if(i>0){ctx.doc.setDrawColor(226,232,240);ctx.doc.line(x,ctx.y,x,ctx.y+headerH);}
        x+=colW[i];
      });
      ctx.y+=headerH;
    }

    drawHeader();
    arr(rows).forEach(row=>{
      const cellLines=columns.map((c,i)=>wrap(ctx,present(row?.[c.key])?row[c.key]:'—',colW[i]-pad*2,opts.fontSize||7.5,'normal'));
      let offsets=cellLines.map(()=>0);
      while(offsets.some((off,i)=>off<cellLines[i].length)){
        const remainingH=PAGE.bottom-ctx.y;
        if(remainingH<lineH+pad*2+1){addPage(ctx);drawHeader();}
        const fit=Math.max(1,Math.floor((PAGE.bottom-ctx.y-pad*2)/lineH));
        const chunks=cellLines.map((lines,i)=>lines.slice(offsets[i],offsets[i]+fit));
        const maxLines=Math.max(1,...chunks.map(c=>c.length));
        const rowH=maxLines*lineH+pad*2;
        if(ctx.y+rowH>PAGE.bottom){addPage(ctx);drawHeader();continue;}
        ctx.doc.setDrawColor(226,232,240);ctx.doc.rect(PAGE.left,ctx.y,CONTENT_W,rowH);
        let x=PAGE.left;
        chunks.forEach((chunk,i)=>{
          if(i>0)ctx.doc.line(x,ctx.y,x,ctx.y+rowH);
          setFont(ctx,opts.fontSize||7.5,'normal',[51,65,85]);
          ctx.doc.text(chunk.length?chunk:[''],x+pad,ctx.y+pad,{baseline:'top'});
          x+=colW[i];
          offsets[i]+=chunk.length;
        });
        ctx.y+=rowH;
      }
    });
    ctx.y+=3;
  }

  function cover(ctx){
    const {model}=ctx,a=model.application,c=model.candidate,p=model.position,co=model.company;
    ensure(ctx,55);
    ctx.doc.setFillColor(2,6,23);ctx.doc.roundedRect(PAGE.left,ctx.y,CONTENT_W,38,3,3,'F');
    setFont(ctx,7,'normal',[203,213,225]);ctx.doc.text('LAPORAN KANDIDAT TERINTEGRASI · INTERNAL RECRUITMENT',PAGE.left+6,ctx.y+6,{baseline:'top'});
    setFont(ctx,19,'bold',[255,255,255]);
    const nameLines=ctx.doc.splitTextToSize(c.candidate_name||'—',120);
    ctx.doc.text(nameLines,PAGE.left+6,ctx.y+13,{baseline:'top'});
    setFont(ctx,9,'normal',[203,213,225]);ctx.doc.text(`${p?.position_name||'—'} · ${co?.brand||co?.company_name||'—'}`,PAGE.left+6,ctx.y+29,{baseline:'top'});
    setFont(ctx,8,'bold',[255,255,255]);ctx.doc.text(model.overall?.label||'—',PAGE.w-PAGE.right-6,ctx.y+18,{align:'right',baseline:'middle'});
    ctx.y+=43;
    kvGrid(ctx,[
      ['Candidate ID',c.candidate_id],['Application ID',a.application_id],['Tahap Saat Ini',a.current_stage],['Status Application',a.status],
      ['Source',c.source||a.source],['Tanggal Lamar',fmtDateOnly(a.application_date||a.applied_at||a.created_at)]
    ],2);
  }

  function executive(ctx){
    const m=ctx.model,s=m.screening,psy=m.psych,hr=m.hrInterview,u=m.userInterview,o=m.offering;
    sectionTitle(ctx,'B','Ringkasan Proses Rekrutmen','Status resmi tiap tahap; bukan rata-rata skor.');
    const stageRows=[
      ['Screening',s.state==='available'?(s.data?.reviewDecision||s.data?.systemStatus||'—'):s.state==='error'?'Data tidak dapat dimuat':'Data tidak ditemukan'],
      ['Psikotes',psy.state==='available'?(psy.data?.status==='Selesai'?(psy.data?.workflowDecision||'Perlu Review HR'):(psy.data?.status||'—')):psy.state==='error'?'Data tidak dapat dimuat':'Data tidak ditemukan'],
      ['Interview HR',hr.state==='available'?(hr.data?.workflowDecision||hr.data?.recommendation||'—'):'Belum ada scorecard'],
      ['Interview User',u.state==='available'?(u.data?.workflowDecision||u.data?.recommendation||'—'):'Belum ada scorecard'],
      ['Offering',o.state==='available'?(o.data?.status||'—'):'Belum dibuat']
    ];
    table(ctx,[{label:'Tahap',key:'stage',width:45},{label:'Status / Keputusan',key:'value',width:137}],stageRows.map(r=>({stage:r[0],value:r[1]})),{fontSize:8});
    noteBox(ctx,'Status / Rekomendasi Rekrutmen',m.overall?.label||'—',{fill:[255,251,235],border:[253,230,138],titleColor:[146,64,14]});
    bulletList(ctx,m.synthesis?.lines||[],{emptyText:'Belum ada evidence chain yang tersedia.'});
  }

  function profile(ctx){
    const c=ctx.model.candidate;
    sectionTitle(ctx,'C','Profil Kandidat');
    kvGrid(ctx,[
      ['Pendidikan',c.education],['Jurusan',c.major],['Domisili',c.city],['Pengalaman',present(c.experience)?`${c.experience}${Number.isFinite(Number(c.experience))?' tahun':''}`:null],
      ['Posisi Terakhir',c.last_role],['Perusahaan Terakhir',c.last_company],['Expected Salary',present(c.expected_salary)?money(c.expected_salary):null],['Notice Period',c.notice_period],
      ['Bersedia Shift',c.willing_shift],['Alasan Melamar',c.apply_reason],['CV',c.cv_path?'Tersedia':'Belum tersedia']
    ],2);
  }

  function cvExtraction(ctx){
    const x=ctx.model.cvExtraction||{state:'module_unavailable'};
    sectionTitle(ctx,'D','Informasi dari CV','Hasil Auto-Read bersifat read-only dan belum menggantikan data profil kandidat.');
    const statusMap={
      extracted:'Teks CV berhasil dibaca otomatis',text_unavailable:'Teks CV tidak dapat diekstrak',unsupported:'Format CV belum didukung',
      error:'Ekstraksi CV gagal',not_available:'CV belum tersedia',module_unavailable:'Modul CV Auto-Read belum tersedia'
    };
    kvGrid(ctx,[['Status Auto-Read',statusMap[x.state]||'Status tidak diketahui'],['Nama File',x.fileName],['Format',x.fileType?String(x.fileType).toUpperCase():null],['Verifikasi HR',x.verified===true?'Terverifikasi':'Belum diverifikasi']],2);
    if(x.state==='not_available'){noteBox(ctx,'CV Kandidat','CV kandidat belum tersedia.');return;}
    if(x.state==='module_unavailable'){noteBox(ctx,'CV Auto-Read','Modul pembaca CV belum termuat pada halaman ini.');return;}
    if(x.state==='unsupported'){
      noteBox(ctx,'CV Auto-Read',x.reason==='DOC_LEGACY_NOT_SUPPORTED'?'Format .DOC lama belum dapat dibaca otomatis. Gunakan PDF/DOCX atau verifikasi CV secara manual.':'Format file CV ini belum didukung untuk Auto-Read.',{fill:[255,251,235],border:[253,230,138],titleColor:[146,64,14]});return;
    }
    if(x.state==='text_unavailable'){noteBox(ctx,'CV Auto-Read','CV tersedia, tetapi tidak ditemukan text layer yang cukup. Kemungkinan CV berupa scan/gambar; verifikasi manual atau OCR diperlukan.',{fill:[255,251,235],border:[253,230,138],titleColor:[146,64,14]});return;}
    if(x.state==='error'){noteBox(ctx,'CV Auto-Read','CV tidak dapat dibaca otomatis saat laporan dibuat. File CV tetap dapat dibuka secara manual.',{fill:[254,242,242],border:[254,202,202],titleColor:[185,28,28]});return;}
    noteBox(ctx,'Status Verifikasi','Informasi berikut diekstrak otomatis dari teks CV dan belum menggantikan data profil kandidat. Gunakan sebagai bahan verifikasi HR.',{fill:[240,253,250],border:[153,246,228],titleColor:[15,118,110]});
    const sec=x.sections||{};
    const groups=[
      ['Profil / Ringkasan',sec.profile],['Pendidikan',sec.education],['Pengalaman Kerja',sec.experience],['Keahlian / Kompetensi',sec.skills],
      ['Sertifikasi / Pelatihan',sec.certifications],['Bahasa',sec.languages],['Organisasi',sec.organizations],['Prestasi / Penghargaan',sec.achievements]
    ].filter(([,items])=>arr(items).length);
    if(groups.length){
      groups.forEach(([label,items])=>{textBlock(ctx,label,{fontSize:9,style:'bold',color:[51,65,85],gapAfter:1});bulletList(ctx,arr(items).slice(0,12));});
    }else if(arr(x.previewLines).length){
      textBlock(ctx,'Cuplikan Teks CV',{fontSize:9,style:'bold',color:[51,65,85],gapAfter:1});bulletList(ctx,arr(x.previewLines).slice(0,12));
    }else noteBox(ctx,'Hasil Ekstraksi','Teks CV berhasil diekstrak, tetapi section yang dikenali belum tersedia.');
    const contact=[...(x.contacts?.emails||[]),...(x.contacts?.linkedin||[])];
    if(contact.length){textBlock(ctx,'Kontak yang Terdeteksi di CV',{fontSize:9,style:'bold',gapAfter:1});bulletList(ctx,contact.slice(0,6));}
  }

  function screening(ctx){
    const block=ctx.model.screening;
    sectionTitle(ctx,'E','Screening','System result dipisahkan dari keputusan/review HR.');
    if(block.state==='error'){noteBox(ctx,'Data tidak dapat dimuat',block.error?.message||'Terjadi error saat membaca Screening.',{fill:[255,247,237],border:[253,186,116],titleColor:[154,52,18]});return;}
    if(block.state!=='available'){noteBox(ctx,'Data Screening','Tidak ditemukan hasil Screening tersimpan untuk application ini.');return;}
    const s=block.data;
    kvGrid(ctx,[['Hasil Sistem',s.systemStatus],['Match Preference',s.matchScore==null?null:`${Number(s.matchScore).toFixed(1)}%`],['Keputusan HR',s.reviewDecision],['Tanggal Screening',fmtDate(s.screenedAt)]],2);
    if(s.reviewNotes)noteBox(ctx,'Catatan Review HR',`${s.reviewNotes}${s.reviewedBy||s.reviewedAt?`\n${s.reviewedBy||'Reviewer tidak tercatat'} · ${fmtDate(s.reviewedAt)}`:''}`,{fill:[238,242,255],border:[199,210,254],titleColor:[67,56,202]});
    if(arr(s.details).length){
      table(ctx,[
        {label:'Requirement',key:'req',width:72},{label:'Rule',key:'rule',width:32},{label:'Aktual',key:'actual',width:38},{label:'Hasil',key:'result',width:40}
      ],s.details.map(x=>({req:x.text||x.requirement_id||'—',rule:x.rule||'—',actual:present(x.actual)?String(x.actual):'—',result:`${x.result||'—'}${present(x.score)?` · Score ${x.score}`:''}`})),{fontSize:7});
    }else noteBox(ctx,'Detail Screening','Tidak ada detail rule Screening tersimpan.');
  }

  function psych(ctx){
    const block=ctx.model.psych;
    sectionTitle(ctx,'F','Psikotes','Interpretasi hanya menggunakan hasil yang tersimpan dari SiPsiko.');
    if(block.state==='error'){noteBox(ctx,'Data tidak dapat dimuat',block.error?.message||'Terjadi error saat membaca Psikotes.',{fill:[255,247,237],border:[253,186,116],titleColor:[154,52,18]});return;}
    if(block.state!=='available'){noteBox(ctx,'Data Psikotes','Tidak ditemukan sesi Psikotes tersimpan untuk application ini.');return;}
    const p=block.data;
    const packageText=arr(p.package).map(x=>TEST_LABELS[x?.test_code]||x?.test_code).filter(Boolean).join(' · ');
    kvGrid(ctx,[['Status',p.status],['Attempt',p.attemptNo],['Selesai',p.completedAt?fmtDate(p.completedAt):'—'],['Paket Tes',packageText||'—'],['Rekomendasi Engine',p.engineRecommendation||'—'],['Keputusan HR',psychDecision(p)]],2);
    if(p.hrNotes&&String(p.status)==='Selesai')noteBox(ctx,'Catatan HR Psikotes',p.hrNotes,{fill:[238,242,255],border:[199,210,254],titleColor:[67,56,202]});
    const results=arr(p.results).filter(r=>r.code!=='OVERALL');
    if(results.length){
      table(ctx,[
        {label:'Tes',key:'test',width:38},{label:'Hasil',key:'value',width:34},{label:'Interpretasi Tersimpan',key:'interpretation',width:110}
      ],results.map(r=>({test:r.label||r.code||'Tes',value:r.value||'—',interpretation:r.interpretation||r.recommendation||'—'})),{fontSize:7});
    }else noteBox(ctx,'Hasil per Tes','Hasil per tes belum tersedia.');
  }

  function interview(ctx,block,letter,label){
    sectionTitle(ctx,letter,label,label==='Interview HR'?'Rekomendasi interviewer dipisahkan dari keputusan workflow.':'Evidence dan recommendation dari scorecard User.');
    if(block.state!=='available'){noteBox(ctx,label,`${label} belum memiliki scorecard tersimpan.`);return;}
    const d=block.data;
    kvGrid(ctx,[['Interviewer',d.interviewer||'Interviewer tidak tercatat'],['Tanggal',fmtDate(d.assessedAt)],['Skor',d.score?.label],['Rekomendasi Interviewer',d.recommendation],['Keputusan Workflow',d.workflowDecision]],2);
    if(d.storedStrengths?.length){setFont(ctx,9,'bold',[4,120,87]);textBlock(ctx,'Kekuatan Tersimpan',{fontSize:9,style:'bold',color:[4,120,87],gapAfter:1});bulletList(ctx,d.storedStrengths);}
    if(d.storedGaps?.length){setFont(ctx,9,'bold',[180,83,9]);textBlock(ctx,'Gap Tersimpan',{fontSize:9,style:'bold',color:[180,83,9],gapAfter:1});bulletList(ctx,d.storedGaps);}
    if(d.cvVerification)noteBox(ctx,'Verifikasi CV / Profil',d.cvVerification);
    if(d.firstImpression?.length){
      table(ctx,[{label:'First Impression',key:'name',width:88},{label:'Skor',key:'score',width:22},{label:'Catatan',key:'note',width:72}],d.firstImpression.map(x=>({name:x.name||'—',score:present(x.score)?`${x.score}/4`:'—',note:x.note||'—'})),{fontSize:7.3});
    }
    if(d.redFlags?.length){
      noteBox(ctx,`Red Flags Tercatat: ${d.redFlags.length}`,d.redFlags.map(x=>`• ${x}`).join('\n')+(d.redFlagNotes?`\n\nKlarifikasi: ${d.redFlagNotes}`:''),{fill:[254,242,242],border:[254,202,202],titleColor:[185,28,28]});
    }
    if(d.evidence?.length){
      table(ctx,[{label:'Kompetensi',key:'comp',width:55},{label:'Skor',key:'score',width:20},{label:'Evidence',key:'evidence',width:107}],d.evidence.map(x=>({comp:x.competency_name||'—',score:present(x.score)?`${x.score}/4`:'BT',evidence:x.evidence||'—'})),{fontSize:7.2});
    }
    if(d.conclusion)noteBox(ctx,'Kesimpulan Interviewer',d.conclusion);
    if(d.workflowReviewedAt||d.workflowReviewNotes){
      noteBox(ctx,'Review Workflow',`${d.workflowReviewedBy||'Reviewer tidak tercatat'}${d.workflowReviewedAt?` · ${fmtDate(d.workflowReviewedAt)}`:''}${d.workflowReviewNotes?`\n${d.workflowReviewNotes}`:''}`,{fill:[238,242,255],border:[199,210,254],titleColor:[67,56,202]});
    }
  }

  function conclusion(ctx){
    const m=ctx.model;
    sectionTitle(ctx,'I','Kesimpulan Assessment','Sintesis deterministik dari evidence chain yang tersedia.');
    noteBox(ctx,'Keputusan / Posisi Workflow Resmi',m.overall?.label||'—',{fill:[255,251,235],border:[253,230,138],titleColor:[146,64,14]});
    setFont(ctx,9,'bold',[15,23,42]);textBlock(ctx,'Evidence Chain',{fontSize:9,style:'bold',gapAfter:1});
    bulletList(ctx,m.synthesis?.lines||[],{emptyText:'Belum ada evidence chain yang tersedia.'});
    if(m.historyNotes?.length){setFont(ctx,9,'bold',[51,65,85]);textBlock(ctx,'Kelengkapan Histori',{fontSize:9,style:'bold',gapAfter:1});bulletList(ctx,m.historyNotes);}
    if(m.synthesis?.concerns?.length){setFont(ctx,9,'bold',[51,65,85]);textBlock(ctx,'Concern / Catatan Tersimpan',{fontSize:9,style:'bold',gapAfter:1});bulletList(ctx,m.synthesis.concerns);}
    textBlock(ctx,'Laporan tidak menghitung rata-rata Interview HR + User sebagai keputusan dan tidak menambahkan fakta assessment di luar data tersimpan.',{fontSize:7.4,color:[100,116,139],gapAfter:3});
  }

  function offering(ctx){
    const block=ctx.model.offering;
    sectionTitle(ctx,'J','Offering');
    if(block.state!=='available'){noteBox(ctx,'Offering','Offering belum dibuat untuk application ini.');return;}
    const o=block.data;
    kvGrid(ctx,[['Status',o.status],['Gaji',money(o.salary)],['Tunjangan',money(o.allowance)],['Benefit',o.benefit],['Tanggal Offer',fmtDateOnly(o.offerDate)],['Deadline',fmtDateOnly(o.deadline)],['Expected Join',fmtDateOnly(o.expectedJoinDate)]],2);
    if(o.details?.length)table(ctx,[{label:'Detail',key:'key',width:60},{label:'Nilai',key:'value',width:122}],o.details.map(([k,v])=>({key:k,value:v})),{fontSize:7.5});
  }

  function timeline(ctx){
    const rows=arr(ctx.model.timeline);
    sectionTitle(ctx,'K','Riwayat Rekrutmen','Hanya event yang benar-benar tersimpan; stage yang tidak ada tidak diinferensikan.');
    if(!rows.length){noteBox(ctx,'Timeline','Belum ada event Recruitment History tersimpan.');return;}
    table(ctx,[{label:'Tanggal',key:'date',width:38},{label:'Event',key:'event',width:45},{label:'Aktor',key:'actor',width:38},{label:'Catatan',key:'notes',width:61}],rows.map(x=>({date:fmtDate(x.date),event:x.event||'Aktivitas',actor:x.actor||'—',notes:x.notes||'—'})),{fontSize:6.9});
  }

  function attachments(ctx){
    const m=ctx.model;
    sectionTitle(ctx,'L','Dokumen Pendukung','Laporan tetap dapat dibuat meskipun CV atau dokumen pendukung gagal di-fetch.');
    const cvName=m.attachments?.cvFileName||m.cvExtraction?.fileName||(m.attachments?.cvPath?String(m.attachments.cvPath).split('/').pop().split('?')[0]:null);
    kvGrid(ctx,[['CV Kandidat',m.attachments?.cvAvailable?'Tersedia':'Belum tersedia'],['Nama File CV',cvName||'—']],2);
    if(m.attachments?.cvAvailable)noteBox(ctx,'CV Asli','CV asli tidak ditempel ke PDF laporan pada fase ini. File CV akan disertakan terpisah di Paket Dokumen Kandidat.');
    const docs=arr(m.attachments?.psychDocuments);
    if(docs.length){table(ctx,[{label:'Dokumen Psikotes',key:'name',width:182}],docs.map(d=>({name:d.fileName||'Dokumen Psikotes'})),{fontSize:7.5});}
    else noteBox(ctx,'Dokumen Psikotes','Belum ada dokumen Psikotes tersimpan.');
  }

  function renderAll(ctx){
    cover(ctx);
    executive(ctx);
    profile(ctx);
    cvExtraction(ctx);
    screening(ctx);
    psych(ctx);
    interview(ctx,ctx.model.hrInterview,'G','Interview HR');
    interview(ctx,ctx.model.userInterview,'H','Interview User');
    conclusion(ctx);
    offering(ctx);
    timeline(ctx);
    attachments(ctx);
  }

  function addHeadersFooters(ctx){
    const doc=ctx.doc,total=doc.getNumberOfPages();
    const candidate=ctx.model?.candidate?.candidate_name||'Candidate';
    const appId=ctx.model?.application?.application_id||'—';
    for(let p=1;p<=total;p++){
      doc.setPage(p);
      doc.setDrawColor(226,232,240);doc.line(PAGE.left,16,PAGE.w-PAGE.right,16);
      setFont(ctx,6.8,'bold',[71,85,105]);doc.text('LAPORAN KANDIDAT TERINTEGRASI',PAGE.left,10,{baseline:'top'});
      setFont(ctx,6.8,'normal',[100,116,139]);doc.text(`${candidate} · ${appId}`,PAGE.w-PAGE.right,10,{align:'right',baseline:'top'});
      doc.setDrawColor(226,232,240);doc.line(PAGE.left,286,PAGE.w-PAGE.right,286);
      setFont(ctx,6.5,'normal',[100,116,139]);doc.text('Internal Recruitment · Confidential',PAGE.left,289,{baseline:'top'});
      doc.text(`Page ${p} of ${total}`,PAGE.w-PAGE.right,289,{align:'right',baseline:'top'});
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
      console.error('[Candidate Dossier PDF V1] download failed',error);
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
    const buttons=[...root.querySelectorAll('button')];
    const pdfButton=buttons.find(b=>/Download Laporan PDF/i.test(b.textContent||''));
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
    if(info && /Fase Laporan:/i.test(info.textContent||'')){
      info.innerHTML='<b>Fase PDF:</b> Laporan Kandidat Terintegrasi sudah tervalidasi. Download Laporan PDF A4 aktif; Paket Dokumen masih dinonaktifkan sampai PDF lolos regression.';
    }
  }

  function installOpenHook(){
    const current=window.openCandidateDossierV1;
    if(typeof current!=='function'||current.__candidateDossierPdfV1Wrapped)return;
    const wrapped=async function(...args){
      const result=await current.apply(this,args);
      setTimeout(activatePdfButton,0);
      setTimeout(activatePdfButton,120);
      return result;
    };
    wrapped.__candidateDossierPdfV1Wrapped=true;
    wrapped.__candidateDossierPdfV1Original=current;
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
  console.log('%cLaporan Kandidat PDF V1 active','color:#dc2626;font-weight:bold');
})();
