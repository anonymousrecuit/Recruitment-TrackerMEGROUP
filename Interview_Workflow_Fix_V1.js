/* ========================================================================== 
   INTERVIEW WORKFLOW FIX V1.0.0
   Batch 1 - UX Interview HR + link Interview User.
   ========================================================================== */
(function () {
  'use strict';

  if (window.__INTERVIEW_WORKFLOW_FIX_V100_ACTIVE) return;
  window.__INTERVIEW_WORKFLOW_FIX_V100_ACTIVE = true;

  const VERSION = '1.0.0';
  const PUBLIC_PORTAL_BASE =
    'https://anonymousrecuit.github.io/Recruitment-TrackerMEGROUP/interview-scorecard.html';

  const appById = id =>
    typeof window.getApplication === 'function'
      ? window.getApplication(id)
      : (window.DB?.applications || []).find(x => x.application_id === id);

  const candById = id =>
    typeof window.getCandidate === 'function'
      ? window.getCandidate(id)
      : (window.DB?.candidates || []).find(x => x.candidate_id === id);

  function cleanWaTemplate() {
    try {
      if (
        typeof window.getWaTemplates !== 'function' ||
        typeof window.saveWaTemplates !== 'function'
      ) return;

      const list = window.getWaTemplates() || [];

      const body = `Halo {nama_user},

Mohon bantuan untuk melakukan penilaian *Interview User* kandidat berikut:

Kandidat: *{nama_kandidat}*
Posisi: *{posisi}*
Perusahaan/Brand: *{brand}*
Jadwal Interview: {tanggal}

Link Scorecard:
{link}

Silakan isi scorecard setelah proses interview selesai. Link ini hanya ditujukan untuk interviewer/User terkait.

Terima kasih.
{rekruter}
Tim Rekrutmen {brand}`;

      const next = {
        id: 'interview_user_scorecard',
        name: 'Permintaan Penilaian Interview User',
        stages: ['Interview User'],
        fields: ['nama_user', 'nama_kandidat', 'tanggal', 'link'],
        body
      };

      const idx = list.findIndex(
        t => t.id === 'interview_user_scorecard'
      );

      if (idx >= 0) {
        list[idx] = next;
      } else {
        list.push(next);
      }

      window.saveWaTemplates(list);

    } catch (err) {
      console.warn(
        '[Interview Workflow Fix] template WhatsApp gagal diperbarui',
        err
      );
    }
  }

  // Selalu menghasilkan link publik HTTPS,
  // walaupun Recruitment Tracker sedang dibuka dari file:// lokal.
  window.portalBaseUrl = function () {
    return PUBLIC_PORTAL_BASE;
  };

  function addBlankOption(select, label) {
    if (!select) return;

    let blank = [...select.options].find(
      o => o.value === ''
    );

    if (!blank) {
      blank = document.createElement('option');
      blank.value = '';
      blank.textContent = label;
      select.insertBefore(
        blank,
        select.firstChild
      );
    }

    select.value = '';
  }

  function addInfoBox(beforeEl, id, html, tone = 'blue') {
    if (
      !beforeEl ||
      document.getElementById(id)
    ) return;

    const box = document.createElement('div');
    box.id = id;

    box.className =
      tone === 'indigo'
        ? 'rounded-xl border border-indigo-100 bg-indigo-50 p-3 mb-3 text-xs text-slate-700 leading-5'
        : 'rounded-xl border border-blue-100 bg-blue-50 p-3 mb-3 text-xs text-slate-700 leading-5';

    box.innerHTML = html;

    beforeEl.parentNode.insertBefore(
      box,
      beforeEl
    );
  }

  function updateProgress() {
    const rows = [
      ...document.querySelectorAll(
        '.scorecard-row'
      )
    ];

    const done = rows.filter(r =>
      r.querySelector('.score-item')?.value
    ).length;

    const evidenceDone = rows.filter(r => {
      const score =
        r.querySelector('.score-item')?.value;

      if (!score) return true;
      if (r.dataset.evidence !== '1') {
        return true;
      }

      return !!r
        .querySelector('.score-evidence')
        ?.value.trim();
    }).length;

    const el =
      document.getElementById(
        'interviewProgressV1'
      );

    if (el) {
      el.textContent =
        `${done}/${rows.length} kompetensi dinilai · ` +
        `${evidenceDone}/${rows.length} evidence lengkap`;
    }
  }

  function enhanceHrScorecard(appId) {
    const a = appById(appId);
    const c = candById(a?.candidate_id);

    if (!a || !c) return;

    const modal =
      document.getElementById(
        'modalContent'
      );

    if (modal) {
      modal.className =
        'bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto';
    }

    // =====================================================
    // HAPUS NESTED SCROLL KOMPETENSI
    // =====================================================
    const items =
      document.getElementById(
        'scorecardItems'
      );

    if (items) {
      items.classList.remove(
        'max-h-[42vh]',
        'overflow-y-auto'
      );

      items.style.maxHeight = 'none';
      items.style.overflow = 'visible';
    }

    // =====================================================
    // PETUNJUK FIRST IMPRESSION
    // =====================================================
    const firstBlock =
      document.getElementById(
        'firstImpressionBlock'
      );

    if (firstBlock) {
      const firstContent =
        firstBlock.querySelector(
          '.space-y-2'
        );

      addInfoBox(
        firstContent,
        'interviewFirstLegendV1',
        '<b>Cara Penilaian:</b> BT = belum terobservasi / belum cukup informasi, bukan nilai 0.' +
        '<div class="mt-1">1 = Kurang · 2 = Cukup · 3 = Baik · 4 = Sangat Baik</div>'
      );
    }

    document
      .querySelectorAll(
        '.impression-score'
      )
      .forEach(s => {
        if (s.options[0]) {
          s.options[0].textContent =
            'BT · Belum Terobservasi';
        }
      });

    // =====================================================
    // PETUNJUK KOMPETENSI
    // =====================================================
    if (items) {
      addInfoBox(
        items,
        'interviewCompetencyLegendV1',
        '<b>Skala Kompetensi:</b> BT = belum cukup evidence.' +
        '<div class="mt-1">1 = Dasar / Perlu Arahan · 2 = Cukup Mandiri · 3 = Mahir / Mandiri · 4 = Ahli / Pengembang Sistem</div>' +
        '<div class="mt-1"><b>Evidence wajib</b> harus berisi contoh konkret dari jawaban kandidat.</div>',
        'indigo'
      );

      if (
        !document.getElementById(
          'interviewProgressV1'
        )
      ) {
        const p =
          document.createElement(
            'div'
          );

        p.id =
          'interviewProgressV1';

        p.className =
          'text-[11px] text-slate-500 mb-2 text-right';

        items.parentNode.insertBefore(
          p,
          items
        );
      }
    }

    document
      .querySelectorAll(
        '.score-item'
      )
      .forEach(s => {

        if (s.options[0]) {
          s.options[0].textContent =
            'BT · Belum Cukup Evidence';
        }

        s.addEventListener(
          'change',
          updateProgress
        );
      });

    document
      .querySelectorAll(
        '.score-evidence'
      )
      .forEach(t =>
        t.addEventListener(
          'input',
          updateProgress
        )
      );

    // =====================================================
    // TAMBAHAN EKSPEKTASI GAJI
    // =====================================================
    if (
      !document.getElementById(
        'scoreExpectedSalaryV1'
      )
    ) {
      const redNotes =
        document.getElementById(
          'redFlagNotes'
        );

      const redHeading =
        redNotes?.previousElementSibling;

      if (redHeading) {

        const wrap =
          document.createElement(
            'div'
          );

        wrap.id =
          'salaryInterviewBlockV1';

        wrap.className =
          'mt-4 mb-4 rounded-xl border border-slate-200 p-4';

        wrap.innerHTML = `
          <div class="font-semibold text-sm">
            Ekspektasi Gaji
          </div>

          <p class="text-xs text-slate-500 mt-1">
            Konfirmasi kembali nominal dengan kandidat pada saat interview.
          </p>

          <div class="mt-3">

            <label class="text-xs text-slate-500">
              Ekspektasi Gaji Kandidat
            </label>

            <input
              id="scoreExpectedSalaryV1"
              type="number"
              min="0"
              step="50000"
              value="${Number(c.expected_salary || 0) || ''}"
              class="w-full border rounded-lg px-3 py-2 mt-1"
              placeholder="Contoh: 3500000"
            >

            <div class="text-[10px] text-slate-400 mt-1">
              Nominal diperbarui ke profil kandidat hanya setelah hasil Interview HR berhasil tersimpan.
            </div>

          </div>
        `;

        redHeading.parentNode.insertBefore(
          wrap,
          redHeading
        );
      }
    }

    // =====================================================
    // REKOMENDASI TIDAK BOLEH OTOMATIS TERPILIH
    // =====================================================
    addBlankOption(
      document.getElementById(
        'scoreRec'
      ),
      'Pilih rekomendasi...'
    );

    const notes =
      document.getElementById(
        'scoreNotes'
      );

    if (notes) {
      notes.placeholder =
        'Kesimpulan interviewer HR — wajib';
    }

    updateProgress();
  }

  function markValidationError(
    el,
    message
  ) {
    if (!el) return;

    el.classList.add(
      'border-red-500'
    );

    let msg =
      el.parentElement?.querySelector(
        '.interview-fix-error'
      );

    if (!msg) {
      msg =
        document.createElement(
          'div'
        );

      msg.className =
        'interview-fix-error text-[10px] text-red-600 mt-1';

      el.parentElement?.appendChild(
        msg
      );
    }

    msg.textContent = message;
  }

  function clearValidationErrors() {
    document
      .querySelectorAll(
        '.interview-fix-error'
      )
      .forEach(x => x.remove());

    document
      .querySelectorAll(
        '.border-red-500'
      )
      .forEach(x =>
        x.classList.remove(
          'border-red-500'
        )
      );
  }

  // =====================================================
  // WRAP OPEN INTERVIEW HR
  // =====================================================
  const originalOpenInterviewScorecard =
    window.openInterviewScorecard;

  if (
    typeof originalOpenInterviewScorecard ===
    'function'
  ) {
    window.openInterviewScorecard =
      function (
        appId,
        typeOverride
      ) {

        const result =
          originalOpenInterviewScorecard.apply(
            this,
            arguments
          );

        setTimeout(
          () =>
            enhanceHrScorecard(
              appId
            ),
          80
        );

        return result;
      };
  }

  // =====================================================
  // WRAP SAVE INTERVIEW HR
  // =====================================================
  const originalSaveScorecard =
    window.saveScorecard;

  if (
    typeof originalSaveScorecard ===
    'function'
  ) {
    window.saveScorecard =
      async function (appId) {

        clearValidationErrors();

        const rows = [
          ...document.querySelectorAll(
            '.scorecard-row'
          )
        ];

        const missingMandatory = [];
        const missingEvidence = [];

        rows.forEach(r => {

          const name =
            r.dataset.name ||
            'Kompetensi';

          const scoreEl =
            r.querySelector(
              '.score-item'
            );

          const evEl =
            r.querySelector(
              '.score-evidence'
            );

          const score =
            scoreEl?.value || '';

          const evidence =
            evEl?.value.trim() || '';

          if (
            r.dataset.mandatory ===
              '1' &&
            !score
          ) {
            missingMandatory.push(
              name
            );

            markValidationError(
              scoreEl,
              'Kompetensi mandatory wajib dinilai.'
            );
          }

          if (
            score &&
            r.dataset.evidence ===
              '1' &&
            !evidence
          ) {
            missingEvidence.push(
              name
            );

            markValidationError(
              evEl,
              'Evidence wajib diisi.'
            );
          }
        });

        if (
          missingMandatory.length
        ) {
          document
            .querySelector(
              '.border-red-500'
            )
            ?.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });

          return window.showToast?.(
            `Belum dinilai: ${missingMandatory.join(', ')}`,
            'danger'
          );
        }

        if (
          missingEvidence.length
        ) {
          document
            .querySelector(
              '.border-red-500'
            )
            ?.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });

          return window.showToast?.(
            `Evidence belum lengkap: ${missingEvidence.join(', ')}`,
            'danger'
          );
        }

        const rec =
          document.getElementById(
            'scoreRec'
          );

        if (
          rec &&
          !rec.value
        ) {
          markValidationError(
            rec,
            'Pilih rekomendasi HR.'
          );

          rec.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          return window.showToast?.(
            'Pilih rekomendasi HR terlebih dahulu.',
            'warning'
          );
        }

        const notes =
          document.getElementById(
            'scoreNotes'
          );

        if (
          notes &&
          !notes.value.trim()
        ) {
          markValidationError(
            notes,
            'Kesimpulan Interview HR wajib diisi.'
          );

          notes.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          return window.showToast?.(
            'Kesimpulan Interview HR wajib diisi.',
            'warning'
          );
        }

        const flags = [
          ...document.querySelectorAll(
            '.redflag-check:checked'
          )
        ];

        const redFlagNotes =
          document.getElementById(
            'redFlagNotes'
          );

        if (
          flags.length &&
          redFlagNotes &&
          !redFlagNotes.value.trim()
        ) {
          markValidationError(
            redFlagNotes,
            'Jelaskan red flag yang dipilih.'
          );

          redFlagNotes.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          return window.showToast?.(
            'Isi klarifikasi untuk red flag yang dipilih.',
            'warning'
          );
        }

        const a =
          appById(appId);

        const c =
          candById(
            a?.candidate_id
          );

        const salary =
          Number(
            document.getElementById(
              'scoreExpectedSalaryV1'
            )?.value || 0
          );

        await originalSaveScorecard.apply(
          this,
          arguments
        );

        // Update gaji hanya jika hasil Interview HR
        // benar-benar berhasil tersimpan.
        try {

          const saved =
            typeof window.latestScorecard ===
            'function'
              ? window.latestScorecard(
                  appId,
                  'Interview HR'
                )
              : null;

          if (
            saved &&
            salary &&
            c?.candidate_id &&
            window.sb?.from
          ) {

            const { error } =
              await window.sb
                .from('candidates')
                .update({
                  expected_salary:
                    salary
                })
                .eq(
                  'candidate_id',
                  c.candidate_id
                );

            if (error) {
              console.warn(
                '[Interview Workflow Fix] expected salary update failed',
                error
              );
            } else if (
              typeof window.loadFromSupabase ===
              'function'
            ) {
              await window.loadFromSupabase();
            }
          }

        } catch (err) {
          console.warn(
            '[Interview Workflow Fix] salary post-save update failed',
            err
          );
        }
      };
  }

  cleanWaTemplate();

  console.log(
    `%cInterview Workflow Fix V${VERSION} active`,
    'color:#4f46e5;font-weight:bold'
  );

})();

/* ========================================================================== 
   INTERVIEW WORKFLOW POLISH V1.0.1
   ========================================================================== */
(function () {
  'use strict';

  if (window.__INTERVIEW_WORKFLOW_POLISH_V101_ACTIVE) return;
  window.__INTERVIEW_WORKFLOW_POLISH_V101_ACTIVE = true;

  const digits = value =>
    String(value ?? '').replace(/\D/g, '');

  const rupiah = value => {
    const raw = digits(value);
    if (!raw) return '';

    return 'Rp ' +
      Number(raw).toLocaleString('id-ID');
  };

  function polishInterviewHr() {

    /* FORMAT RUPIAH */
    const salary =
      document.getElementById(
        'scoreExpectedSalaryV1'
      );

    if (
      salary &&
      !salary.dataset.rupiahReady
    ) {
      salary.dataset.rupiahReady = '1';

      salary.type = 'text';
      salary.inputMode = 'numeric';
      salary.value =
        rupiah(salary.value);

      salary.addEventListener(
        'input',
        function () {
          this.value =
            rupiah(this.value);
        }
      );
    }

    /* LEBARKAN DROPDOWN BT */
    document
      .querySelectorAll(
        '.impression-score'
      )
      .forEach(el => {
        el.style.minWidth = '230px';
      });

    /* HILANGKAN MASTER SCORECARD DARI FORM OPERASIONAL */
    [
      ...document.querySelectorAll(
        'button'
      )
    ]
      .filter(
        b =>
          b.textContent
            .trim() ===
          'Kelola Master Scorecard'
      )
      .forEach(
        b =>
          b.style.display = 'none'
      );

    /* RAPikan PENOMORAN SECTION */
    const salaryBlock =
      document.getElementById(
        'salaryInterviewBlockV1'
      );

    const redHeading =
      [
        ...document.querySelectorAll(
          'h3,h4'
        )
      ].find(
        el =>
          el.textContent
            .trim() ===
          'C. Red Flag / Concern'
      );

    if (
      salaryBlock &&
      redHeading
    ) {

      if (
        !document.getElementById(
          'salarySectionTitleV1'
        )
      ) {
        const title =
          document.createElement(
            'h4'
          );

        title.id =
          'salarySectionTitleV1';

        title.className =
          'font-semibold text-sm mt-5 mb-2';

        title.textContent =
          'C. Kompensasi & Kesiapan';

        salaryBlock.parentNode
          .insertBefore(
            title,
            salaryBlock
          );
      }

      redHeading.textContent =
        'D. Red Flag / Concern';

      salaryBlock.insertAdjacentElement(
        'afterend',
        redHeading
      );
    }

    /* HEADING KESIMPULAN */
    const recommendation =
      document.getElementById(
        'scoreRec'
      );

    if (
      recommendation &&
      !document.getElementById(
        'recommendationTitleV1'
      )
    ) {

      const label =
        [
          ...document.querySelectorAll(
            'label'
          )
        ].find(
          el =>
            el.textContent
              .trim() ===
            'Rekomendasi HR'
        );

      if (label) {
        const title =
          document.createElement(
            'h4'
          );

        title.id =
          'recommendationTitleV1';

        title.className =
          'font-semibold text-sm mt-5 mb-2';

        title.textContent =
          'E. Kesimpulan & Rekomendasi HR';

        label.parentNode.insertBefore(
          title,
          label
        );
      }
    }
  }

  /* JALANKAN SETELAH MODAL INTERVIEW DIBUKA */
  const previousOpen =
    window.openInterviewScorecard;

  if (
    typeof previousOpen ===
    'function'
  ) {
    window.openInterviewScorecard =
      function () {

        const result =
          previousOpen.apply(
            this,
            arguments
          );

        setTimeout(
          polishInterviewHr,
          180
        );

        return result;
      };
  }

  /*
    Saat disimpan:
    "Rp 2.700.000" sementara diubah menjadi 2700000
    agar fungsi lama tetap bisa menyimpan angka.
  */
  const previousSave =
    window.saveScorecard;

  if (
    typeof previousSave ===
    'function'
  ) {
    window.saveScorecard =
      async function () {

        const salary =
          document.getElementById(
            'scoreExpectedSalaryV1'
          );

        let displayValue = '';

        if (salary) {
          displayValue =
            salary.value;

          salary.value =
            digits(
              salary.value
            );
        }

        try {
          return await previousSave.apply(
            this,
            arguments
          );

        } finally {

          if (
            salary &&
            document.contains(
              salary
            )
          ) {
            salary.value =
              rupiah(
                salary.value ||
                displayValue
              );
          }
        }
      };
  }

})();