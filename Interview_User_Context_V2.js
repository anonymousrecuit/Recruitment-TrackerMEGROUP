/* ==========================================================================
   INTERVIEW USER CONTEXT V2
   Profil kandidat + Psikotes + Interview HR untuk pertimbangan Interview User
   Catatan internal HR tidak ditampilkan.
   ========================================================================== */

(function () {
  'use strict';

  if (window.__INTERVIEW_USER_CONTEXT_V2_ACTIVE) return;
  window.__INTERVIEW_USER_CONTEXT_V2_ACTIVE = true;

  const VERSION = '2.0.0';

  const safe = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const textOrDash = (v) => {
    if (v === null || v === undefined || v === '') {
      return 'Belum tersedia';
    }
    return String(v);
  };

  const pretty = (v) => {
    if (v === null || v === undefined || v === '') return '';

    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      return String(v);
    }

    if (Array.isArray(v)) {
      return v
        .map(pretty)
        .filter(Boolean)
        .join(' · ');
    }

    if (typeof v === 'object') {
      const preferred = [
        'recommendation',
        'rekomendasi',
        'label',
        'decision',
        'status',
        'summary',
        'text',
        'result'
      ];

      for (const key of preferred) {
        if (
          v[key] !== undefined &&
          v[key] !== null &&
          v[key] !== ''
        ) {
          return pretty(v[key]);
        }
      }

      try {
        return Object.entries(v)
          .filter(
            ([, value]) =>
              value !== null &&
              value !== undefined &&
              value !== ''
          )
          .slice(0, 6)
          .map(
            ([key, value]) =>
              `${key}: ${pretty(value)}`
          )
          .join(' · ');
      } catch (_) {
        return '';
      }
    }

    return String(v);
  };

  const score100 = (score) => {
    const n = Number(score);

    if (!Number.isFinite(n)) return null;

    if (n <= 4) {
      return Math.round(n * 25 * 10) / 10;
    }

    return Math.round(n * 10) / 10;
  };

  function profileRows(candidate) {
    const c = candidate || {};

    return [
      ['Domisili', c.city],
      ['Pendidikan', c.education],
      ['Jurusan', c.major],
      [
        'Pengalaman',
        c.experience !== null &&
        c.experience !== undefined &&
        c.experience !== ''
          ? `${c.experience} tahun`
          : null
      ],
      ['Jabatan Terakhir', c.last_role],
      ['Perusahaan Terakhir', c.last_company],
      ['Notice Period', c.notice_period],
      ['Bersedia Shift', c.willing_shift],
      ['Alasan Melamar', c.apply_reason]
    ];
  }

  function renderProfileDetail(candidate) {
    return `
      <div id="iuProfileDetailV2" class="mt-4">

        <div class="grid md:grid-cols-2 gap-2">

          ${profileRows(candidate)
            .map(([label, value]) => {

              return `
                <div
                  class="
                    rounded-lg
                    border
                    border-slate-200
                    bg-slate-50
                    p-3
                  "
                >

                  <div
                    class="
                      text-[11px]
                      uppercase
                      tracking-wide
                      text-slate-500
                    "
                  >
                    ${safe(label)}
                  </div>

                  <div
                    class="
                      text-sm
                      font-medium
                      text-slate-800
                      mt-1
                    "
                  >
                    ${safe(textOrDash(value))}
                  </div>

                </div>
              `;
            })
            .join('')}

        </div>

      </div>
    `;
  }

  function renderPsychotest(context) {

    const results =
      Array.isArray(context?.psychotest_results)
        ? context.psychotest_results
        : [];

    const summary =
      context?.psychotest_summary || {};

    const engine =
      pretty(summary.engine_recommendation);

    if (!results.length && !engine) {

      return `
        <div
          id="iuPsychV2"
          class="card p-5"
        >

          <div
            class="
              flex
              items-center
              justify-between
              gap-3
            "
          >

            <h3 class="font-bold">
              B. Ringkasan Psikotes
            </h3>

            <span
              class="
                text-xs
                px-2
                py-1
                rounded-full
                bg-slate-100
                text-slate-500
              "
            >
              Belum tersedia
            </span>

          </div>

          <p class="text-sm muted mt-2">
            Belum ada hasil psikotes yang dapat
            ditampilkan untuk kandidat ini.
          </p>

        </div>
      `;
    }

    return `
      <div
        id="iuPsychV2"
        class="card p-5"
      >

        <div
          class="
            flex
            flex-col
            md:flex-row
            md:items-center
            md:justify-between
            gap-2
          "
        >

          <div>

            <h3 class="font-bold">
              B. Ringkasan Psikotes
            </h3>

            <p class="text-xs muted mt-1">
              Gunakan sebagai konteks tambahan.
              Keputusan interview tetap berdasarkan
              evidence aktual.
            </p>

          </div>

          ${
            engine
              ? `
                <div
                  class="
                    text-xs
                    px-3
                    py-2
                    rounded-lg
                    bg-indigo-50
                    text-indigo-700
                  "
                >
                  <b>Rekomendasi SiPsiko:</b>
                  ${safe(engine)}
                </div>
              `
              : ''
          }

        </div>

        <div
          class="
            grid
            md:grid-cols-2
            gap-3
            mt-4
          "
        >

          ${results
            .map((r) => {

              const name =
                r.test_code || 'Tes';

              const score =
                r.score !== null &&
                r.score !== undefined &&
                r.score !== ''
                  ? String(r.score)
                  : null;

              const interpretation =
                r.interpretation || '';

              const recommendation =
                r.recommendation || '';

              return `
                <div
                  class="
                    border
                    border-slate-200
                    rounded-xl
                    p-4
                  "
                >

                  <div
                    class="
                      flex
                      items-start
                      justify-between
                      gap-3
                    "
                  >

                    <div class="font-semibold">
                      ${safe(name)}
                    </div>

                    ${
                      score
                        ? `
                          <div
                            class="
                              text-sm
                              font-semibold
                              text-indigo-700
                            "
                          >
                            ${safe(score)}
                          </div>
                        `
                        : ''
                    }

                  </div>

                  ${
                    interpretation
                      ? `
                        <div
                          class="
                            text-sm
                            text-slate-700
                            mt-2
                            leading-relaxed
                          "
                        >
                          ${safe(interpretation)}
                        </div>
                      `
                      : ''
                  }

                  ${
                    recommendation
                      ? `
                        <div
                          class="
                            text-xs
                            text-slate-500
                            mt-2
                          "
                        >
                          <b>Rekomendasi:</b>
                          ${safe(recommendation)}
                        </div>
                      `
                      : ''
                  }

                </div>
              `;
            })
            .join('')}

        </div>

      </div>
    `;
  }

  function renderInterviewHr(context) {

    const hr =
      context?.interview_hr;

    if (!hr) {

      return `
        <div
          id="iuHrV2"
          class="card p-5"
        >

          <div
            class="
              flex
              items-center
              justify-between
              gap-3
            "
          >

            <h3 class="font-bold">
              C. Hasil Interview HR
            </h3>

            <span
              class="
                text-xs
                px-2
                py-1
                rounded-full
                bg-slate-100
                text-slate-500
              "
            >
              Belum tersedia
            </span>

          </div>

          <p class="text-sm muted mt-2">
            Belum ada hasil Interview HR yang tersedia.
          </p>

        </div>
      `;
    }

    const s100 =
      score100(hr.score);

    const rawScore =
      Number(hr.score);

    const recommendation =
      textOrDash(hr.recommendation);

    const flags =
      Array.isArray(hr.red_flags)
        ? hr.red_flags.filter(Boolean)
        : [];

    const competencies =
      Array.isArray(hr.competency_scores)
        ? hr.competency_scores
        : [];

    return `
      <div
        id="iuHrV2"
        class="card p-5"
      >

        <div
          class="
            flex
            flex-col
            md:flex-row
            md:items-start
            md:justify-between
            gap-3
          "
        >

          <div>

            <h3 class="font-bold">
              C. Hasil Interview HR
            </h3>

            <p class="text-xs muted mt-1">
              Ringkasan tahap sebelumnya untuk
              bahan pertimbangan User.
            </p>

          </div>

          <div class="md:text-right">

            ${
              s100 !== null
                ? `
                  <div
                    class="
                      text-2xl
                      font-bold
                      text-slate-900
                    "
                  >
                    ${safe(s100)}
                    <span
                      class="
                        text-sm
                        font-normal
                        text-slate-500
                      "
                    >
                      /100
                    </span>
                  </div>
                `
                : ''
            }

            ${
              Number.isFinite(rawScore) &&
              rawScore <= 4
                ? `
                  <div class="text-xs muted">
                    Skor kompetensi
                    ${safe(rawScore)}/4
                  </div>
                `
                : ''
            }

          </div>

        </div>

        <div
          class="
            grid
            md:grid-cols-2
            gap-3
            mt-4
          "
        >

          <div
            class="
              rounded-xl
              border
              border-slate-200
              p-4
            "
          >

            <div
              class="
                text-xs
                uppercase
                tracking-wide
                text-slate-500
              "
            >
              Rekomendasi HR
            </div>

            <div class="font-semibold mt-1">
              ${safe(recommendation)}
            </div>

          </div>

          <div
            class="
              rounded-xl
              border
              border-slate-200
              p-4
            "
          >

            <div
              class="
                text-xs
                uppercase
                tracking-wide
                text-slate-500
              "
            >
              Red Flag / Concern
            </div>

            <div class="text-sm mt-1">

              ${
                flags.length
                  ? safe(flags.join(' · '))
                  : 'Tidak ada red flag tercatat'
              }

            </div>

          </div>

        </div>

        ${
          competencies.length
            ? `
              <div class="mt-4">

                <div
                  class="
                    text-sm
                    font-semibold
                    mb-2
                  "
                >
                  Ringkasan Kompetensi HR
                </div>

                <div
                  class="
                    grid
                    md:grid-cols-2
                    gap-2
                  "
                >

                  ${competencies
                    .map(
                      (item, index) => {

                        const name =
                          item.competency_name ||
                          item.name ||
                          item.competency ||
                          `Kompetensi ${index + 1}`;

                        const score =
                          item.score ??
                          item.value ??
                          item.rating;

                        return `
                          <div
                            class="
                              flex
                              items-center
                              justify-between
                              gap-3
                              rounded-lg
                              bg-slate-50
                              border
                              border-slate-200
                              px-3
                              py-2
                              text-sm
                            "
                          >

                            <span>
                              ${safe(name)}
                            </span>

                            <b>
                              ${
                                score !== undefined &&
                                score !== null &&
                                score !== ''
                                  ? safe(score)
                                  : '-'
                              }
                            </b>

                          </div>
                        `;
                      }
                    )
                    .join('')}

                </div>

              </div>
            `
            : ''
        }

        <div
          class="
            mt-4
            rounded-lg
            bg-amber-50
            border
            border-amber-200
            p-3
            text-xs
            text-amber-800
          "
        >
          Ringkasan ini adalah bahan pertimbangan.
          User tetap wajib melakukan penilaian berdasarkan
          hasil interview dan evidence yang diperoleh sendiri.
        </div>

      </div>
    `;
  }

  function relabelUserForm() {

    const cards =
      [
        ...document.querySelectorAll(
          '#app .card'
        )
      ];

    cards.forEach((card) => {

      const h =
        card.querySelector('h3');

      if (!h) return;

      const txt =
        h.textContent.trim();

      if (
        txt ===
        'B. Competency-Based Interview'
      ) {

        h.textContent =
          'D. Competency-Based Interview';

      } else if (
        txt ===
        'C. Red Flag / Concern'
      ) {

        h.textContent =
          'E. Red Flag / Concern';

      } else if (
        txt ===
        'D. Kesimpulan & Rekomendasi'
      ) {

        h.textContent =
          'F. Kesimpulan & Rekomendasi';

      }

    });

    const profileHeading =
      [
        ...document.querySelectorAll(
          '#app h3'
        )
      ].find(
        (h) =>
          h.textContent.trim() ===
          'Latar Belakang CV / Profil'
      );

    if (profileHeading) {

      profileHeading.textContent =
        'A. Profil & Riwayat Kandidat';

    }
  }

  function forceRecommendationChoice() {

    const rec =
      document.getElementById('rec');

    if (
      !rec ||
      rec.dataset.userContextV2 === '1'
    ) {
      return;
    }

    rec.dataset.userContextV2 = '1';

    const placeholder =
      document.createElement('option');

    placeholder.value = '';

    placeholder.textContent =
      'Pilih rekomendasi...';

    placeholder.disabled = true;
    placeholder.selected = true;

    rec.insertBefore(
      placeholder,
      rec.firstChild
    );

    rec.value = '';
  }

  function installSubmitGuard() {

    if (
      window.__INTERVIEW_USER_CONTEXT_V2_SUBMIT_GUARD
    ) {
      return;
    }

    if (
      typeof window.submitScorecard !==
      'function'
    ) {
      return;
    }

    const original =
      window.submitScorecard;

    window.submitScorecard =
      async function () {

        try {

          if (
            typeof DATA !== 'undefined' &&
            DATA?.link?.interview_type ===
            'Interview User'
          ) {

            const rec =
              document.getElementById('rec');

            const notes =
              document.getElementById('notes');

            if (
              !rec ||
              !rec.value
            ) {

              alert(
                'Pilih rekomendasi Interview User terlebih dahulu.'
              );

              rec?.focus();

              return;
            }

            if (
              notes &&
              !notes.value.trim()
            ) {

              alert(
                'Isi kesimpulan Interview User terlebih dahulu.'
              );

              notes.focus();

              return;
            }

          }

        } catch (err) {

          console.warn(
            '[Interview User Context V2] submit guard warning',
            err
          );

        }

        return original.apply(
          this,
          arguments
        );
      };

    window.__INTERVIEW_USER_CONTEXT_V2_SUBMIT_GUARD =
      true;
  }

  function enhanceProfile() {

    if (
      typeof DATA === 'undefined' ||
      !DATA?.candidate
    ) {
      return;
    }

    const profileHeading =
      [
        ...document.querySelectorAll(
          '#app h3'
        )
      ].find(
        (h) =>
          /Latar Belakang CV|Profil & Riwayat Kandidat/i
            .test(h.textContent)
      );

    const card =
      profileHeading?.closest('.card');

    if (
      !card ||
      card.querySelector(
        '#iuProfileDetailV2'
      )
    ) {
      return;
    }

    const existingGrid =
      card.querySelector('.grid');

    if (existingGrid) {
      existingGrid.style.display = 'none';
    }

    const textarea =
      card.querySelector('textarea');

    if (textarea) {

      textarea.insertAdjacentHTML(
        'beforebegin',
        renderProfileDetail(
          DATA.candidate
        )
      );

    } else {

      card.insertAdjacentHTML(
        'beforeend',
        renderProfileDetail(
          DATA.candidate
        )
      );

    }
  }

  async function loadContextAndRender() {

    if (
      typeof DATA === 'undefined' ||
      DATA?.link?.interview_type !==
      'Interview User'
    ) {
      return;
    }

    if (
      document.getElementById(
        'iuPsychV2'
      )
    ) {
      return;
    }

    let context = null;

    try {

      const response =
        await sb.rpc(
          'get_interview_portal_context_v2',
          {
            p_token: token
          }
        );

      if (response.error) {

        console.error(
          '[Interview User Context V2] context RPC failed',
          response.error
        );

      } else {

        context =
          response.data || {};

      }

    } catch (err) {

      console.error(
        '[Interview User Context V2] context load failed',
        err
      );

    }

    const profileHeading =
      [
        ...document.querySelectorAll(
          '#app h3'
        )
      ].find(
        (h) =>
          /Latar Belakang CV|Profil & Riwayat Kandidat/i
            .test(h.textContent)
      );

    const profileCard =
      profileHeading?.closest('.card');

    if (!profileCard) return;

    enhanceProfile();

    relabelUserForm();

    const psychHtml =
      renderPsychotest(
        context || {}
      );

    const hrHtml =
      renderInterviewHr(
        context || {}
      );

    profileCard.insertAdjacentHTML(
      'afterend',
      psychHtml + hrHtml
    );

    forceRecommendationChoice();

    installSubmitGuard();

    console.log(
      `%cInterview User Context V${VERSION} active`,
      'color:#4f46e5;font-weight:bold'
    );
  }

  function waitForPortal(
    attempt = 0
  ) {

    const app =
      document.getElementById('app');

    const ready =
      app &&
      !app.classList.contains(
        'hidden'
      ) &&
      typeof DATA !== 'undefined' &&
      DATA?.link;

    if (ready) {

      loadContextAndRender();

      return;
    }

    if (attempt < 100) {

      setTimeout(
        () =>
          waitForPortal(
            attempt + 1
          ),
        120
      );

    }
  }

  waitForPortal();

})();