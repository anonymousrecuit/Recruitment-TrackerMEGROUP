/* ==========================================================================
   ATS PSYCH QUEUE + HR REVIEW UX FIX V1.1.0
   Branch: feature/candidate-dossier-v1
   ========================================================================== */
(function(){
  'use strict';
  if(window.__ATS_PSYCH_REVIEW_FIX_V110_ACTIVE) return;
  window.__ATS_PSYCH_REVIEW_FIX_V110_ACTIVE = true;

  const VERSION = '1.1.0';
  const norm = v => String(v || '').replace(/\s+/g,' ').trim();
  const esc = v => typeof atsEsc === 'function'
    ? atsEsc(v)
    : String(v ?? '').replace(/[&<>"']/g, ch => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#039;'
      }[ch]));

  function fmtDate(v){
    if(!v) return '—';
    try{
      return typeof formatDate === 'function'
        ? formatDate(v)
        : new Date(v).toLocaleDateString('id-ID',{
            day:'2-digit',
            month:'short',
            year:'numeric'
          });
    }catch(_){
      return String(v);
    }
  }

  function plainText(v){
    const raw = String(v || '');
    if(!raw) return '';

    try{
      const doc = new DOMParser().parseFromString(raw,'text/html');
      return norm(doc.body?.textContent || raw);
    }catch(_){
      return norm(
        raw
          .replace(/<br\s*\/?>/gi,' ')
          .replace(/<[^>]+>/g,' ')
      );
    }
  }

  function sentences(v){
    const text = plainText(v);
    if(!text) return [];

    return text
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function shortText(v,count=2,max=260){
    const parts = sentences(v);
    let out = parts.slice(0,count).join(' ') || plainText(v);

    if(out.length > max){
      out = out.slice(0,max-1).trimEnd() + '…';
    }

    return out;
  }

  function testLabel(code){
    return ({
      CIFT:'Tes Kognitif',
      PAPIKOSTIK:'PAPI Kostick',
      DISC:'DISC',
      MSDT:'MSDT',
      INTEGRITY:'Tes Integritas',
      OVERALL:'Kesimpulan'
    })[code] || code || 'Tes';
  }

  function resultValue(r){
    const j = r?.result_json || {};

    if(r?.test_code === 'CIFT'){
      return r.score == null
        ? '—'
        : `${Number(r.score).toFixed(0)}/30`;
    }

    if(r?.test_code === 'PAPIKOSTIK'){
      return r.score == null
        ? '—'
        : `Avg ${Number(r.score).toFixed(2)}`;
    }

    if(r?.test_code === 'DISC'){
      const dominant = Object.entries(j.scores || {})
        .sort((a,b) => Number(b[1]) - Number(a[1]))[0];

      return dominant
        ? `Dominan ${dominant[0]} (${dominant[1]})`
        : '—';
    }

    if(r?.test_code === 'MSDT'){
      return j.type || '—';
    }

    if(r?.test_code === 'INTEGRITY'){
      return `A ${j.total_a ?? '—'} · B ${j.total_b ?? '—'} · C ${j.total_c ?? '—'}`;
    }

    return r?.recommendation ||
      (r?.score == null ? '—' : String(r.score));
  }

  function categoryFrom(text){
    const match = plainText(text).match(/kategori\s+([^.,;]+)/i);
    return match ? norm(match[1]) : '';
  }

  function papiGroups(text){
    const groups = [];
    const map = new Map();

    function add(label,sentence){
      if(!map.has(label)){
        const group = {label,items:[]};
        map.set(label,group);
        groups.push(group);
      }

      map.get(label).items.push(sentence);
    }

    sentences(text).forEach(sentence => {
      const s = sentence.toLowerCase();
      let label = 'Ringkasan';

      if(/leadership|kepemimpinan|memimpin|tanggung jawab/.test(s)){
        label = 'Leadership';
      }
      else if(/followership|arahan|mengikuti/.test(s)){
        label = 'Followership';
      }
      else if(/activity|aktivitas|inisiatif|proaktif/.test(s)){
        label = 'Activity';
      }
      else if(/work style|ketelitian|keteraturan|fleksibel|perubahan/.test(s)){
        label = 'Work Style';
      }
      else if(/social nature|pengakuan|relasi|interpersonal|sosial/.test(s)){
        label = 'Social Nature';
      }
      else if(/work direction|penyelesaian tugas|arah kerja|orientasi tugas/.test(s)){
        label = 'Work Direction';
      }

      add(label,sentence);
    });

    return groups;
  }

  function metricCard(r){
    const category = categoryFrom(r?.interpretation);

    return `
      <div class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="text-[10px] uppercase tracking-wide text-slate-400">
          ${esc(testLabel(r?.test_code))}
        </div>

        <div class="mt-1 text-sm font-bold text-slate-900">
          ${esc(resultValue(r))}
        </div>

        ${
          category
            ? `<div class="mt-1 text-[11px] text-slate-500">${esc(category)}</div>`
            : ''
        }
      </div>
    `;
  }

  function resultCard(r){
    const clean = plainText(r?.interpretation);
    const category = categoryFrom(clean);

    let body = '';

    if(r?.test_code === 'PAPIKOSTIK' && clean){

      const groups = papiGroups(clean);

      if(groups.length){

        body = `
          <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">

            ${
              groups.map(group => `
                <div class="rounded-lg border border-slate-100 bg-slate-50 p-3">

                  <div class="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                    ${esc(group.label)}
                  </div>

                  <div class="mt-1 text-xs leading-5 text-slate-700">
                    ${esc(shortText(group.items.join(' '),2,210))}
                  </div>

                </div>
              `).join('')
            }

          </div>
        `;
      }
    }
    else if(clean){

      body = `
        <p class="mt-3 text-sm leading-6 text-slate-600">
          ${esc(shortText(clean))}
        </p>
      `;
    }

    return `
      <section class="rounded-2xl border border-slate-200 bg-white p-4">

        <div class="text-[11px] uppercase tracking-wide text-slate-400">
          ${esc(testLabel(r?.test_code))}
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-2">

          <span class="text-base font-bold text-slate-900">
            ${esc(resultValue(r))}
          </span>

          ${
            category
              ? `
                <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                  ${esc(category)}
                </span>
              `
              : ''
          }

        </div>

        ${body}

        ${
          clean
            ? `
              <details class="mt-3">

                <summary class="cursor-pointer text-xs font-semibold text-blue-700">
                  Lihat interpretasi lengkap
                </summary>

                <div class="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
                  ${esc(clean)}
                </div>

              </details>
            `
            : ''
        }

      </section>
    `;
  }

  function appById(id){
    try{
      if(typeof getApplication === 'function'){
        return getApplication(id);
      }

      return (
        typeof DB !== 'undefined'
          ? DB?.applications
          : []
      )?.find(x => x.application_id === id) || null;

    }catch(_){
      return null;
    }
  }

  function candidateById(id){
    try{
      if(typeof getCandidate === 'function'){
        return getCandidate(id);
      }

      return (
        typeof DB !== 'undefined'
          ? DB?.candidates
          : []
      )?.find(x => x.candidate_id === id) || null;

    }catch(_){
      return null;
    }
  }

  function positionById(id){
    try{
      if(typeof getPosition === 'function'){
        return getPosition(id);
      }

      return (
        typeof DB !== 'undefined'
          ? DB?.positions
          : []
      )?.find(x => x.position_id === id) || null;

    }catch(_){
      return null;
    }
  }

  async function fetchSummary(appId){

    if(
      typeof sb === 'undefined' ||
      !sb?.rpc
    ){
      throw new Error(
        'Koneksi database psikotes tidak tersedia'
      );
    }

    const {data,error} =
      await sb.rpc(
        'get_psychotest_summary_for_application',
        {
          p_application_id:appId
        }
      );

    if(error){
      throw error;
    }

    return data;
  }

  async function openPsychReviewPanel(appId){

    try{

      const summary =
        await fetchSummary(appId);

      if(
        !summary?.exists ||
        summary.session?.status !== 'Selesai'
      ){
        return showToast(
          'Psikotes belum selesai',
          'warning'
        );
      }

      const session =
        summary.session || {};

      const app =
        appById(appId);

      const candidate =
        candidateById(app?.candidate_id);

      const position =
        positionById(app?.position_id);

      const rows =
        (summary.results || [])
          .filter(
            r => r.test_code !== 'OVERALL'
          );

      const overall =
        (summary.results || [])
          .find(
            r => r.test_code === 'OVERALL'
          );

      const currentStage =
        app?.current_stage || '—';

      const canDecide =
        currentStage === 'Psikotes';

      const currentDecision =
        session.workflow_decision ||
        'Belum Ada';

      const overallText =
        plainText(
          overall?.interpretation
        );

      const metrics =
        [
          'CIFT',
          'DISC',
          'PAPIKOSTIK'
        ]
        .map(
          code =>
            rows.find(
              r => r.test_code === code
            )
        )
        .filter(Boolean)
        .map(metricCard)
        .join('');

      const historyNotice =
        canDecide
          ? ''
          : `
            <div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">

              Kandidat sudah berada di tahap
              <b>${esc(currentStage)}</b>.

              Hasil psikotes ditampilkan sebagai riwayat.
              Keputusan psikotes tidak diubah lagi dari tahap ini.

            </div>
          `;

      const actionBar =
        canDecide
          ? `
            <div class="sticky bottom-0 z-20 -mx-5 mt-5 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">

              <div class="mb-2 text-[11px] font-semibold text-slate-500">
                Keputusan HR
              </div>

              <div class="grid grid-cols-3 gap-2">

                <button
                  onclick="savePsychReviewV2('${esc(appId)}','Tidak Lanjut')"
                  class="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                  Tidak Lanjut
                </button>

                <button
                  onclick="savePsychReviewV2('${esc(appId)}','Perlu Review HR')"
                  class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-700">
                  Perlu Review
                </button>

                <button
                  onclick="savePsychReviewV2('${esc(appId)}','Lanjut')"
                  class="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white">
                  Lanjut
                </button>

              </div>

            </div>
          `
          : `
            <div class="sticky bottom-0 z-20 -mx-5 mt-5 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">

              <div class="flex items-center justify-between gap-3">

                <div>

                  <div class="text-[10px] uppercase tracking-wide text-slate-400">
                    Keputusan Psikotes
                  </div>

                  <div class="mt-1 text-sm font-bold text-slate-800">
                    ${esc(currentDecision)}
                  </div>

                </div>

                <button
                  onclick="closeModal()"
                  class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Tutup
                </button>

              </div>

            </div>
          `;

      const html = `
        <div class="max-h-[88vh] overflow-y-auto bg-slate-50 p-5">

          <div class="rounded-2xl border border-slate-200 bg-white p-5">

            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">

              <div>

                <div class="text-[11px] uppercase tracking-wide font-semibold text-blue-600">
                  HR Decision Panel
                </div>

                <h3 class="mt-1 text-xl font-bold text-slate-900">
                  Review Hasil Psikotes
                </h3>

                <div class="mt-1 text-sm text-slate-500">
                  ${esc(candidate?.candidate_name || 'Kandidat')}
                  ·
                  ${esc(position?.position_name || '-')}
                </div>

                <div class="mt-1 text-xs text-slate-400">
                  Attempt ${esc(session.attempt_no || 1)}
                  ·
                  Selesai ${esc(fmtDate(session.completed_at))}
                </div>

              </div>

              <div class="rounded-xl bg-blue-50 px-4 py-3 md:text-right">

                <div class="text-[10px] uppercase tracking-wide text-blue-500">
                  Rekomendasi SiPsiko
                </div>

                <div class="mt-1 text-base font-bold text-blue-800">
                  ${esc(session.engine_recommendation || '—')}
                </div>

              </div>

            </div>

            ${historyNotice}

          </div>

          ${
            metrics
              ? `
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  ${metrics}
                </div>
              `
              : ''
          }

          ${
            overallText
              ? `
                <div class="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">

                  <div class="text-[10px] uppercase tracking-wide font-semibold text-blue-600">
                    Kesimpulan Psikotes
                  </div>

                  <div class="mt-2 text-sm leading-6 text-slate-700">
                    ${esc(shortText(overallText,3,400))}
                  </div>

                  ${
                    overallText.length > 400
                      ? `
                        <details class="mt-2">

                          <summary class="cursor-pointer text-xs font-semibold text-blue-700">
                            Baca kesimpulan lengkap
                          </summary>

                          <div class="mt-2 text-xs leading-6 text-slate-600">
                            ${esc(overallText)}
                          </div>

                        </details>
                      `
                      : ''
                  }

                </div>
              `
              : ''
          }

          <div class="mt-4">

            <div class="text-sm font-bold text-slate-800">
              Hasil per Tes
            </div>

            <div class="text-xs text-slate-400">
              Ringkasan cepat untuk keputusan HR.
              Detail lengkap dapat dibuka per tes.
            </div>

          </div>

          <div class="mt-3 space-y-3">

            ${
              rows.length
                ? rows.map(resultCard).join('')
                : `
                  <div class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
                    Detail hasil per tes belum tersedia.
                  </div>
                `
            }

          </div>

          <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">

            <label class="block text-xs font-semibold text-slate-600">
              Catatan Pertimbangan HR
            </label>

            <div class="mt-1 text-[11px] text-slate-400">
              Catatan tersimpan bersama keputusan psikotes.
            </div>

            <textarea
              id="v2PsychNotes"
              rows="4"
              ${canDecide ? '' : 'readonly'}
              class="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 ${
                canDecide
                  ? 'bg-white'
                  : 'bg-slate-50 text-slate-500'
              }"
              placeholder="Tuliskan pertimbangan HR sebelum menetapkan keputusan"
            >${esc(session.hr_notes || '')}</textarea>

          </div>

          ${actionBar}

        </div>
      `;

      openModal(html);

    }catch(error){

      console.error(
        '[ATS Psych Review UX]',
        error
      );

      showToast(
        'Gagal membuka hasil psikotes: ' +
        (error.message || error),
        'danger'
      );

    }
  }

  function patchQueueRows(){

    const page =
      document.getElementById(
        'page-selection-queue'
      );

    if(!page) return;

    page.querySelectorAll(
      'tbody tr'
    ).forEach(row => {

      const cells =
        row.querySelectorAll('td');

      if(cells.length < 4) return;

      const processText =
        norm(cells[2]?.textContent);

      if(
        !/Tahap:\s*Psikotes/i.test(
          processText
        ) ||
        !/Belum Dimulai|Dalam Proses/i.test(
          processText
        )
      ){
        return;
      }

      const decisionCell =
        cells[3];

      const badge =
        decisionCell?.querySelector('span') ||
        decisionCell;

      if(!badge) return;

      badge.textContent =
        'Belum Ada';

      if(badge !== decisionCell){

        badge.className =
          'inline-flex px-2 py-1 rounded-full border text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-100';

      }

    });
  }

  function schedulePatch(){

    [
      0,
      80,
      200,
      500,
      1000,
      1800,
      3000,
      5000
    ].forEach(ms => {

      setTimeout(() => {

        try{
          patchQueueRows();
        }
        catch(error){
          console.warn(
            '[ATS Psych Queue Fix]',
            error
          );
        }

      },ms);

    });
  }

  const originalShowPsychAccess =
    window.showPsychAccessV2;

  if(
    typeof originalShowPsychAccess === 'function' &&
    !originalShowPsychAccess.__psychQueueFixV110
  ){

    const wrapped =
      async function(appId){

        try{

          if(
            typeof window.renderPsychV2 === 'function'
          ){
            await window.renderPsychV2(true);
          }

        }catch(_){}

        return originalShowPsychAccess.call(
          this,
          appId
        );
      };

    wrapped.__psychQueueFixV110 =
      true;

    window.showPsychAccessV2 =
      wrapped;
  }

  if(
    typeof window.openPsychReviewV2 ===
    'function'
  ){
    window.openPsychReviewV2 =
      openPsychReviewPanel;
  }

  const originalRenderSelection =
    window.renderSelectionQueueV21;

  if(
    typeof originalRenderSelection === 'function' &&
    !originalRenderSelection.__psychQueueFixV110
  ){

    const wrapped =
      function(...args){

        const result =
          originalRenderSelection.apply(
            this,
            args
          );

        if(
          result &&
          typeof result.then === 'function'
        ){
          return result.finally(
            schedulePatch
          );
        }

        schedulePatch();

        return result;
      };

    wrapped.__psychQueueFixV110 =
      true;

    window.renderSelectionQueueV21 =
      wrapped;
  }

  const originalOpenSelectionTab =
    window.openSelectionTabV21;

  if(
    typeof originalOpenSelectionTab === 'function' &&
    !originalOpenSelectionTab.__psychQueueFixV110
  ){

    const wrapped =
      function(...args){

        const result =
          originalOpenSelectionTab.apply(
            this,
            args
          );

        schedulePatch();

        return result;
      };

    wrapped.__psychQueueFixV110 =
      true;

    window.openSelectionTabV21 =
      wrapped;
  }

  if(
    !document.__psychQueueFixV110ClickHook
  ){

    document.__psychQueueFixV110ClickHook =
      true;

    document.addEventListener(
      'click',
      function(event){

        const target =
          event.target?.closest?.(
            '#page-selection-queue .v21-tab-btn, ' +
            '#page-selection-queue button[onclick*="renderSelectionQueueV21"], ' +
            '.nav-item[data-page="selection-queue"]'
          );

        if(target){
          schedulePatch();
        }

      },
      true
    );

  }

  if(
    !window.__psychQueueFixV110HashHook
  ){

    window.__psychQueueFixV110HashHook =
      true;

    window.addEventListener(
      'hashchange',
      function(){

        if(
          /selection-queue/i.test(
            location.hash
          )
        ){
          schedulePatch();
        }

      }
    );

  }

  schedulePatch();

  console.log(
    `%cATS Psych Review UX V${VERSION} active`,
    'color:#2563eb;font-weight:bold'
  );

})();