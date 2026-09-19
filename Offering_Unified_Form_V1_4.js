/* ==========================================================================
   Offering_Unified_Form_V1_4.js
   Recruitment Tracker MEGROUP

   Requires (load before this file):
   - Offering_Workflow_Patch_V1_1.js
   - Offering_DB_Bridge_V1_2.js
   - Offering_Delivery_Workflow_V1_3.js

   Purpose:
   - Create and Edit Offering use the SAME complete form.
   - Multi allowance and multi benefit/BPJS are editable in both modes.
   - Each allowance/benefit can have its own "mulai berlaku" note.
   - Salary/allowance inputs use Rupiah display.
   - Draft can be edited freely.
   - Editing an already-sent Offering creates a revision and returns it to Draft,
     so HR must review and resend.
   ========================================================================== */
(function () {
  'use strict';

  if (window.__OFFERING_UNIFIED_FORM_V140_ACTIVE) return;
  window.__OFFERING_UNIFIED_FORM_V140_ACTIVE = true;

  const VERSION = '1.4.0';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));

  function syncDb() {
    try { window.OfferingDbBridgeV12?.sync?.(); } catch (_) {}
    try {
      if (!window.DB && typeof DB !== 'undefined') window.DB = DB;
    } catch (_) {}
    return window.DB || null;
  }

  function db() { return syncDb(); }

  function getSb() {
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    return window.sb || null;
  }

  function obj(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return {}; }
  }

  function num(v) {
    const d = String(v ?? '').replace(/\D/g, '');
    return d ? Number(d) : 0;
  }

  function rp(v) {
    return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
  }

  function profileName() {
    try {
      if (typeof currentProfile !== 'undefined' && currentProfile?.full_name) {
        return currentProfile.full_name;
      }
    } catch (_) {}
    return window.currentProfile?.full_name || '';
  }

  function authName() {
    try {
      if (typeof currentAuthUser !== 'undefined' && currentAuthUser?.email) {
        return currentAuthUser.email;
      }
    } catch (_) {}
    return window.currentAuthUser?.email || profileName() || 'HR';
  }

  function getApplication(id) {
    try { if (typeof window.getApplication === 'function') return window.getApplication(id); } catch (_) {}
    return (db()?.applications || []).find(x => x.application_id === id) || null;
  }

  function getCandidate(id) {
    try { if (typeof window.getCandidate === 'function') return window.getCandidate(id); } catch (_) {}
    return (db()?.candidates || []).find(x => x.candidate_id === id) || null;
  }

  function getPosition(id) {
    try { if (typeof window.getPosition === 'function') return window.getPosition(id); } catch (_) {}
    return (db()?.positions || []).find(x => x.position_id === id) || null;
  }

  function getCompany(id) {
    try { if (typeof window.getCompany === 'function') return window.getCompany(id); } catch (_) {}
    return (db()?.companies || []).find(x => x.company_id === id) || null;
  }

  function getBranch(id) {
    try { if (typeof window.getBranch === 'function') return window.getBranch(id); } catch (_) {}
    return (db()?.branches || []).find(x => x.branch_id === id) || null;
  }

  function getOffer(id) {
    const rows = db()?.offerings || [];
    const direct = rows.find(x => x.offering_id === id);
    if (direct) return hydrateOffer(direct);

    const byApp = rows.filter(x => x.application_id === id);
    if (!byApp.length) return null;

    const active = byApp.filter(x => !['Ditolak', 'Kadaluarsa', 'Dibatalkan'].includes(x.status));
    const pool = active.length ? active : byApp;

    return hydrateOffer(
      pool.slice().sort((a, b) =>
        String(b.offering_id || '').localeCompare(String(a.offering_id || ''))
      )[0]
    );
  }

  function hydrateOffer(o) {
    if (!o) return o;
    const d = obj(o.detail_json);
    o.detail_json = d;

    [
      'ol_number',
      'salary_type',
      'allowance_note',
      'shift',
      'employment_type',
      'work_days',
      'work_time',
      'work_hours',
      'probation',
      'department',
      'superior',
      'placement',
      'signer_name'
    ].forEach(k => {
      if ((o[k] === undefined || o[k] === null || o[k] === '') && d[k] !== undefined) {
        o[k] = d[k];
      }
    });

    if (!Array.isArray(d.allowance_items) && Array.isArray(o.allowance_items)) {
      d.allowance_items = o.allowance_items;
    }
    if (!Array.isArray(d.benefit_items) && Array.isArray(o.benefit_items)) {
      d.benefit_items = o.benefit_items;
    }

    return o;
  }

  function hydrateAll() {
    const D = db();
    (D?.offerings || []).forEach(hydrateOffer);
  }

  function allowanceItems(o) {
    const d = obj(o?.detail_json);
    const arr = d.allowance_items || o?.allowance_items;
    if (Array.isArray(arr) && arr.length) {
      return arr.map(x => ({
        name: x.name || '',
        amount: Number(x.amount || 0),
        effective_note: x.effective_note || ''
      }));
    }

    const amount = Number(o?.allowance || 0);
    const note = String(o?.allowance_note || '').trim();
    if (!amount && !note) return [];

    return [{
      name: note || 'Tunjangan',
      amount,
      effective_note: ''
    }];
  }

  function benefitItems(o) {
    const d = obj(o?.detail_json);
    const arr = d.benefit_items || o?.benefit_items;
    if (Array.isArray(arr) && arr.length) {
      return arr.map(x => ({
        name: x.name || '',
        effective_note: x.effective_note || ''
      }));
    }

    const legacy = String(o?.benefit || '').trim();
    if (!legacy) {
      return [
        { name: 'BPJS Kesehatan', effective_note: '' },
        { name: 'BPJS Ketenagakerjaan', effective_note: '' }
      ];
    }

    if (/bpjs kesehatan/i.test(legacy) && /ketenagakerjaan/i.test(legacy)) {
      return [
        { name: 'BPJS Kesehatan', effective_note: '' },
        { name: 'BPJS Ketenagakerjaan', effective_note: '' }
      ];
    }

    return legacy
      .split('|')
      .map(x => ({ name: x.trim(), effective_note: '' }))
      .filter(x => x.name);
  }

  function rupiahInput(el) {
    if (!el || el.dataset.v14Rupiah === '1') return;
    el.dataset.v14Rupiah = '1';
    el.type = 'text';
    el.inputMode = 'numeric';

    const paint = () => {
      const n = num(el.value);
      el.dataset.raw = String(n);
      el.value = rp(n);
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
    };

    el.addEventListener('focus', () => {
      try { el.select(); } catch (_) {}
    });
    el.addEventListener('input', paint);
    el.addEventListener('blur', paint);
    paint();
  }

  function allowanceRow(x = {}) {
    const row = document.createElement('div');
    row.className = 'offv14-allow-row border border-slate-200 rounded-xl p-3 bg-white';
    row.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label class="text-[11px] text-slate-500">Nama tunjangan</label>
          <input class="offv14-allow-name w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Contoh: Tunjangan Transportasi"
            value="${esc(x.name || '')}">
        </div>
        <div>
          <label class="text-[11px] text-slate-500">Nominal</label>
          <input class="offv14-allow-amount w-full border rounded-lg px-3 py-2 text-sm"
            value="${esc(Number(x.amount || 0))}">
        </div>
      </div>
      <div class="mt-2">
        <label class="text-[11px] text-slate-500">Mulai berlaku / diterima</label>
        <input class="offv14-allow-effective w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Contoh: setelah 3 bulan bekerja"
          value="${esc(x.effective_note || '')}">
      </div>
      <div class="text-right mt-2">
        <button type="button" class="offv14-remove text-xs text-red-600">
          Hapus tunjangan
        </button>
      </div>
    `;
    rupiahInput(row.querySelector('.offv14-allow-amount'));
    row.querySelector('.offv14-remove').onclick = () => row.remove();
    return row;
  }

  function benefitRow(x = {}) {
    const row = document.createElement('div');
    row.className = 'offv14-benefit-row border border-slate-200 rounded-xl p-3 bg-white';
    row.innerHTML = `
      <div>
        <label class="text-[11px] text-slate-500">Nama benefit</label>
        <input class="offv14-benefit-name w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Contoh: BPJS Kesehatan"
          value="${esc(x.name || '')}">
      </div>
      <div class="mt-2">
        <label class="text-[11px] text-slate-500">Mulai berlaku</label>
        <input class="offv14-benefit-effective w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Contoh: setelah 1 bulan bekerja"
          value="${esc(x.effective_note || '')}">
      </div>
      <div class="text-right mt-2">
        <button type="button" class="offv14-remove text-xs text-red-600">
          Hapus benefit
        </button>
      </div>
    `;
    row.querySelector('.offv14-remove').onclick = () => row.remove();
    return row;
  }

  function eligibleApplications() {
    const D = db();
    let apps = D?.applications || [];

    try {
      if (typeof window.scopeByCompany === 'function') apps = window.scopeByCompany(apps);
    } catch (_) {}

    return apps.filter(a => {
      if (a.status === 'Diterima' || a.status === 'Tidak Lanjut') return false;
      const hasActiveOffer = (D?.offerings || []).some(o =>
        o.application_id === a.application_id &&
        !['Ditolak', 'Kadaluarsa', 'Dibatalkan'].includes(o.status)
      );
      if (hasActiveOffer) return false;
      return ['Offering', 'Interview Final', 'Interview User', 'Medical Check Up'].includes(a.current_stage);
    });
  }

  function defaultCreateValues(app) {
    const pos = getPosition(app?.position_id);
    const br = getBranch(app?.branch_id);
    return {
      application_id: app?.application_id || '',
      salary: 5000000,
      salary_type: 'Gross',
      shift: '',
      employment_type: 'PKWTT',
      work_days: '',
      work_time: '',
      work_hours: '',
      probation: '',
      department: pos?.division || pos?.department || '',
      superior: '',
      placement: br?.branch_name || '',
      signer_name: profileName(),
      offer_date: new Date().toISOString().slice(0, 10),
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      expected_join_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    };
  }

  function formDataFromOffer(o) {
    hydrateOffer(o);
    return {
      application_id: o.application_id,
      salary: Number(o.salary || 0),
      salary_type: o.salary_type || 'Gross',
      shift: o.shift || '',
      employment_type: o.employment_type || 'PKWTT',
      work_days: o.work_days || '',
      work_time: o.work_time || '',
      work_hours: o.work_hours || '',
      probation: o.probation || '',
      department: o.department || '',
      superior: o.superior || '',
      placement: o.placement || '',
      signer_name: o.signer_name || '',
      offer_date: o.offer_date || '',
      deadline: o.deadline || '',
      expected_join_date: o.expected_join_date || ''
    };
  }

  function renderForm(mode, oid = null) {
    syncDb();
    hydrateAll();

    const isEdit = mode === 'edit';
    const o = isEdit ? getOffer(oid) : null;

    if (isEdit && !o) {
      return window.showToast?.('Offering tidak ditemukan', 'danger');
    }

    if (isEdit && ['Diterima', 'Ditolak'].includes(o.status)) {
      return window.showToast?.(
        'Offering yang sudah memiliki jawaban kandidat tidak dapat diedit. Buat proses baru jika diperlukan.',
        'warning'
      );
    }

    let apps = [];
    let app = null;
    let values;

    if (isEdit) {
      app = getApplication(o.application_id);
      values = formDataFromOffer(o);
    } else {
      apps = eligibleApplications();
      if (!apps.length) {
        return window.showToast?.(
          'Tidak ada kandidat siap Offering atau kandidat sudah memiliki Offering aktif.',
          'warning'
        );
      }
      app = apps[0];
      values = defaultCreateValues(app);
    }

    const c = app ? getCandidate(app.candidate_id) : null;
    const p = app ? getPosition(app.position_id) : null;
    const co = app ? getCompany(app.company_id) : null;

    const d = isEdit ? obj(o.detail_json) : {};
    const alreadySent = !!d.sent_at;
    const waOpened = !!d.wa_opened_at;
    const revisionMode = isEdit && (alreadySent || waOpened);

    const candidateBlock = isEdit
      ? `
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="text-[10px] uppercase text-slate-400">Kandidat</div>
          <div class="font-semibold mt-1">${esc(c?.candidate_name || '—')}</div>
          <div class="text-xs text-slate-500 mt-1">
            ${esc(p?.position_name || '—')} · ${esc(co?.brand || co?.company_name || '—')}
          </div>
          <input id="offCand" type="hidden" value="${esc(o.application_id)}">
        </div>`
      : `
        <div>
          <label class="text-xs text-slate-500 font-medium">Pilih Kandidat *</label>
          <select id="offCand" class="w-full border rounded-lg px-3 py-2">
            ${apps.map(a => {
              const cc = getCandidate(a.candidate_id);
              const pp = getPosition(a.position_id);
              const coo = getCompany(a.company_id);
              return `<option value="${esc(a.application_id)}">${esc(cc?.candidate_name || '-')} — ${esc(pp?.position_name || '-')} (${esc(coo?.brand || '')})</option>`;
            }).join('')}
          </select>
        </div>`;

    const modal = document.getElementById('modalContent');
    if (modal) {
      modal.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto';
    }

    window.openModal?.(`
      <div class="p-6" id="offeringUnifiedV14">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-slate-400">
              ${isEdit ? (revisionMode ? 'REVISI OFFERING' : 'EDIT OFFERING') : 'BUAT OFFERING'} · V1.4
            </div>
            <h3 class="font-bold text-xl mt-1">
              ${isEdit ? 'Offering Kandidat' : 'Buat Offering'}
            </h3>
            <p class="text-xs text-slate-500 mt-1">
              Form Create dan Edit menggunakan struktur yang sama.
            </p>
          </div>
          <button onclick="closeModal()" class="text-slate-400 text-xl">×</button>
        </div>

        ${revisionMode ? `
          <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <b>Revisi setelah proses pengiriman.</b>
            Jika perubahan disimpan, Offering akan dikembalikan menjadi <b>Draft</b>.
            Link/pengiriman lama tidak dianggap final dan HR harus melakukan Review lalu Kirim Ulang.
          </div>` : ''}

        <div class="space-y-4 mt-5 text-sm">
          ${candidateBlock}

          ${isEdit ? `
            <div>
              <label class="text-xs text-slate-500">Nomor Offering</label>
              <input class="w-full border rounded-lg px-3 py-2 bg-slate-50 font-mono text-xs"
                value="${esc(o.ol_number || '')}" readonly>
            </div>` : ''}

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Departemen / Unit</label>
              <input id="offDept" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.department)}" placeholder="Operational Outlet">
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Atasan langsung</label>
              <input id="offSuperior" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.superior)}" placeholder="Jabatan / nama atasan">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Penempatan (cabang/kota)</label>
              <input id="offPlacement" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.placement)}">
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Shift penempatan</label>
              <select id="offShift" class="w-full border rounded-lg px-3 py-2">
                ${['', 'Shift 1', 'Shift 2', 'Pagi', 'Sore', 'Malam', 'Non-shift']
                  .map(x => `<option value="${esc(x)}" ${values.shift === x ? 'selected' : ''}>${x || 'Tidak ditentukan'}</option>`)
                  .join('')}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Status hubungan kerja</label>
              <select id="offEmpType" class="w-full border rounded-lg px-3 py-2">
                ${['PKWTT', 'PKWT', 'Kontrak', 'Magang']
                  .map(x => `<option ${values.employment_type === x ? 'selected' : ''}>${x}</option>`)
                  .join('')}
              </select>
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Hari kerja</label>
              <input id="offWorkDays" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.work_days)}" placeholder="Senin–Sabtu / 6 hari per minggu">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Jam kerja (waktu)</label>
              <input id="offWorkTime" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.work_time)}" placeholder="08.00–17.00 / 14.00–22.00">
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Keterangan jam kerja</label>
              <input id="offWorkHours" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.work_hours)}" placeholder="Istirahat 1 jam, dll.">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Gaji pokok *</label>
              <input id="offSalary" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.salary)}">
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Gaji Gross / Nett</label>
              <select id="offSalaryType" class="w-full border rounded-lg px-3 py-2">
                <option ${values.salary_type === 'Gross' ? 'selected' : ''}>Gross</option>
                <option ${values.salary_type === 'Nett' ? 'selected' : ''}>Nett</option>
              </select>
            </div>
          </div>

          <div class="border border-blue-100 bg-blue-50/40 rounded-xl p-4">
            <div class="flex justify-between gap-3 mb-3">
              <div>
                <div class="text-sm font-semibold">Tunjangan</div>
                <div class="text-[11px] text-slate-500">
                  Bisa lebih dari satu dan tetap dapat ditambah saat Edit Offering.
                </div>
              </div>
              <button type="button" id="offv14AddAllow"
                class="px-3 py-1.5 border rounded-lg text-xs font-semibold bg-white">
                + Tambah Tunjangan
              </button>
            </div>
            <div id="offv14AllowList" class="space-y-2"></div>
          </div>

          <div class="border border-emerald-100 bg-emerald-50/40 rounded-xl p-4">
            <div class="flex justify-between gap-3 mb-3">
              <div>
                <div class="text-sm font-semibold">Benefit / BPJS</div>
                <div class="text-[11px] text-slate-500">
                  Bisa ditambah/hapus saat Create maupun Edit. Masa berlaku diisi per benefit.
                </div>
              </div>
              <button type="button" id="offv14AddBenefit"
                class="px-3 py-1.5 border rounded-lg text-xs font-semibold bg-white">
                + Tambah Benefit
              </button>
            </div>
            <div id="offv14BenefitList" class="space-y-2"></div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Masa percobaan</label>
              <input id="offProbation" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.probation)}" placeholder="3 bulan (jika berlaku)">
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Tanggal mulai bekerja *</label>
              <input id="offJoin" type="date" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.expected_join_date)}">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-slate-500 font-medium">Tanggal Offering</label>
              <input id="offDate" type="date" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.offer_date)}">
            </div>
            <div>
              <label class="text-xs text-slate-500 font-medium">Deadline jawaban</label>
              <input id="offDeadline" type="date" class="w-full border rounded-lg px-3 py-2"
                value="${esc(values.deadline)}">
            </div>
          </div>

          <div>
            <label class="text-xs text-slate-500 font-medium">Nama penandatangan perusahaan</label>
            <input id="offSigner" class="w-full border rounded-lg px-3 py-2"
              value="${esc(values.signer_name)}" placeholder="Manager Human Resource">
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-6">
          <button onclick="closeModal()" class="px-4 py-2 text-sm border rounded-lg">
            Batal
          </button>
          <button onclick="OfferingUnifiedV14.save('${mode}', '${esc(oid || '')}')"
            class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg font-semibold">
            ${isEdit ? (revisionMode ? 'Simpan Revisi' : 'Simpan Perubahan') : 'Simpan Offering'}
          </button>
        </div>
      </div>
    `);

    const allowList = document.getElementById('offv14AllowList');
    const benefitList = document.getElementById('offv14BenefitList');

    const A = isEdit ? allowanceItems(o) : [];
    const B = isEdit ? benefitItems(o) : benefitItems(null);

    A.forEach(x => allowList?.appendChild(allowanceRow(x)));
    B.forEach(x => benefitList?.appendChild(benefitRow(x)));

    document.getElementById('offv14AddAllow')?.addEventListener('click', () => {
      allowList?.appendChild(allowanceRow());
    });

    document.getElementById('offv14AddBenefit')?.addEventListener('click', () => {
      benefitList?.appendChild(benefitRow());
    });

    rupiahInput(document.getElementById('offSalary'));

    if (!isEdit) {
      document.getElementById('offCand')?.addEventListener('change', function () {
        const a = getApplication(this.value);
        if (!a) return;
        const pos = getPosition(a.position_id);
        const br = getBranch(a.branch_id);
        const dept = document.getElementById('offDept');
        const placement = document.getElementById('offPlacement');
        if (dept) dept.value = pos?.division || pos?.department || '';
        if (placement) placement.value = br?.branch_name || '';
      });
    }
  }

  function collectLists() {
    const allowances = [...document.querySelectorAll('.offv14-allow-row')]
      .map(row => ({
        name: row.querySelector('.offv14-allow-name')?.value?.trim() || '',
        amount: num(row.querySelector('.offv14-allow-amount')?.value),
        effective_note: row.querySelector('.offv14-allow-effective')?.value?.trim() || ''
      }))
      .filter(x => x.name || x.amount || x.effective_note);

    const benefits = [...document.querySelectorAll('.offv14-benefit-row')]
      .map(row => ({
        name: row.querySelector('.offv14-benefit-name')?.value?.trim() || '',
        effective_note: row.querySelector('.offv14-benefit-effective')?.value?.trim() || ''
      }))
      .filter(x => x.name || x.effective_note);

    return { allowances, benefits };
  }

  function collectBase() {
    const salary = num(document.getElementById('offSalary')?.value);
    if (!salary) throw new Error('Gaji pokok wajib diisi.');

    const appId = document.getElementById('offCand')?.value;
    if (!appId) throw new Error('Kandidat belum dipilih.');

    const { allowances, benefits } = collectLists();

    return {
      application_id: appId,
      salary,
      salary_type: document.getElementById('offSalaryType')?.value || 'Gross',
      allowance: allowances.reduce((s, x) => s + Number(x.amount || 0), 0),
      allowance_note: allowances
        .map(x => [x.name, x.effective_note].filter(Boolean).join(' · '))
        .join(' | '),
      allowance_items: allowances,
      benefit: benefits.map(x => x.name).filter(Boolean).join(' | '),
      benefit_items: benefits,
      shift: document.getElementById('offShift')?.value || '',
      employment_type: document.getElementById('offEmpType')?.value || 'PKWTT',
      work_days: document.getElementById('offWorkDays')?.value || '',
      work_time: document.getElementById('offWorkTime')?.value || '',
      work_hours: document.getElementById('offWorkHours')?.value || '',
      probation: document.getElementById('offProbation')?.value || '',
      department: document.getElementById('offDept')?.value?.trim() || '',
      superior: document.getElementById('offSuperior')?.value?.trim() || '',
      placement: document.getElementById('offPlacement')?.value?.trim() || '',
      signer_name: document.getElementById('offSigner')?.value?.trim() || '',
      offer_date: document.getElementById('offDate')?.value || '',
      deadline: document.getElementById('offDeadline')?.value || '',
      expected_join_date: document.getElementById('offJoin')?.value || ''
    };
  }

  function nextOlNumber(offerDate) {
    try {
      if (typeof window.nextOlNumber === 'function') return window.nextOlNumber(offerDate);
    } catch (_) {}

    const year = String(offerDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
    let max = 0;
    (db()?.offerings || []).forEach(o => {
      const m = String(o.ol_number || '').match(/OL\/HR\/(\d+)\//i);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    });
    return `OL/HR/${String(max + 1).padStart(3, '0')}/${year}`;
  }

  async function persistOffer(o) {
    const client = getSb();
    if (!client?.from) return { error: null };

    const payload = {
      offering_id: o.offering_id,
      application_id: o.application_id,
      salary: Number(o.salary || 0),
      allowance: Number(o.allowance || 0),
      benefit: o.benefit || '',
      offer_date: o.offer_date || null,
      deadline: o.deadline || null,
      expected_join_date: o.expected_join_date || null,
      status: o.status || 'Draft',
      ol_number: o.ol_number || null,
      detail_json: obj(o.detail_json)
    };

    const { error } = await client
      .from('offerings')
      .upsert(payload, { onConflict: 'offering_id' });

    if (error) console.error('[Offering V1.4] Supabase sync failed', error);
    return { error };
  }

  async function persistApplication(a) {
    try {
      if (typeof window.syncApplicationToSb === 'function') {
        return await window.syncApplicationToSb(a);
      }
    } catch (_) {}
    return { error: null };
  }

  async function addHistory(appId, notes) {
    const D = db();
    if (!D) return;

    D.history = D.history || [];
    const row = {
      history_id: 'H' + Date.now(),
      application_id: appId,
      stage: 'Offering',
      date: new Date().toISOString().slice(0, 10),
      user: authName(),
      notes
    };

    D.history.push(row);

    try { window.saveDB?.(); } catch (_) {}
    try { await window.addHistoryToSb?.(row); } catch (_) {}
  }

  function snapshotForRevision(o) {
    return {
      revised_from_status: o.status || null,
      revised_at: new Date().toISOString(),
      revised_by: authName(),
      salary: Number(o.salary || 0),
      salary_type: o.salary_type || '',
      allowance_items: allowanceItems(o),
      benefit_items: benefitItems(o),
      department: o.department || '',
      superior: o.superior || '',
      placement: o.placement || '',
      shift: o.shift || '',
      employment_type: o.employment_type || '',
      work_days: o.work_days || '',
      work_time: o.work_time || '',
      work_hours: o.work_hours || '',
      probation: o.probation || '',
      offer_date: o.offer_date || '',
      deadline: o.deadline || '',
      expected_join_date: o.expected_join_date || '',
      signer_name: o.signer_name || ''
    };
  }

  async function save(mode, oid) {
    syncDb();

    let base;
    try {
      base = collectBase();
    } catch (err) {
      return window.showToast?.(err.message || String(err), 'warning');
    }

    const D = db();
    if (!D) return window.showToast?.('Database aplikasi tidak tersedia.', 'danger');

    if (mode === 'create') {
      const active = (D.offerings || []).find(o =>
        o.application_id === base.application_id &&
        !['Ditolak', 'Kadaluarsa', 'Dibatalkan'].includes(o.status)
      );

      if (active) {
        return window.showToast?.('Kandidat sudah memiliki Offering aktif.', 'warning');
      }

      let app = getApplication(base.application_id);
      if (!app) return window.showToast?.('Data kandidat tidak valid.', 'danger');

      if (['Interview User', 'Interview Final', 'Medical Check Up'].includes(app.current_stage)) {
        if (typeof window.transitionStageV2 === 'function') {
          const moved = await window.transitionStageV2(app.application_id, 'Offering');
          if (!moved) return;
          syncDb();
          app = getApplication(base.application_id) || app;
        }
      }

      const off = {
        offering_id: 'OF' + Date.now(),
        ...base,
        ol_number: nextOlNumber(base.offer_date),
        status: 'Draft'
      };

      off.detail_json = {
        ol_number: off.ol_number,
        salary_type: off.salary_type,
        allowance_note: off.allowance_note,
        shift: off.shift,
        employment_type: off.employment_type,
        work_days: off.work_days,
        work_time: off.work_time,
        work_hours: off.work_hours,
        probation: off.probation,
        department: off.department,
        superior: off.superior,
        placement: off.placement,
        signer_name: off.signer_name,
        allowance_items: off.allowance_items,
        benefit_items: off.benefit_items,
        delivery_status: 'Draft',
        created_at: new Date().toISOString(),
        created_by: authName()
      };

      D.offerings.push(off);

      app.current_stage = 'Offering';
      if (app.status !== 'Diterima' && app.status !== 'Tidak Lanjut') app.status = 'Aktif';
      app.last_activity = new Date().toISOString().slice(0, 10);

      try { window.saveDB?.(); } catch (_) {}

      const [syncResult] = await Promise.all([
        persistOffer(off),
        persistApplication(app),
        addHistory(app.application_id, 'Draft Offering dibuat melalui Unified Form V1.4; belum dikirim ke kandidat.')
      ]);

      window.closeModal?.();

      try { window.renderAll?.(); } catch (_) {}
      try { window.renderOfferings?.(); } catch (_) {}

      if (syncResult?.error) {
        window.showToast?.('Offering tersimpan lokal, tetapi sync Supabase gagal: ' + syncResult.error.message, 'warning');
      } else {
        window.showToast?.('Draft Offering berhasil dibuat. Belum dikirim ke kandidat.', 'success');
      }
      return;
    }

    const o = getOffer(oid);
    if (!o) return window.showToast?.('Offering tidak ditemukan.', 'danger');

    if (['Diterima', 'Ditolak'].includes(o.status)) {
      return window.showToast?.('Offering yang sudah dijawab kandidat tidak dapat diedit.', 'warning');
    }

    const d = obj(o.detail_json);
    const wasSent = !!d.sent_at;
    const wasOpened = !!d.wa_opened_at;

    if (wasSent || wasOpened) {
      d.revisions = Array.isArray(d.revisions) ? d.revisions : [];
      d.revisions.push(snapshotForRevision(o));
      d.revision_count = Number(d.revision_count || 0) + 1;
      d.revised_at = new Date().toISOString();
      d.revised_by = authName();

      delete d.sent_at;
      delete d.sent_by;
      delete d.wa_opened_at;
      delete d.pdf_path;
      delete d.pdf_signed_url;
      delete d.pdf_signed_url_created_at;
      delete d.pdf_signed_url_expires_at;
      delete d.candidate_response;
      delete d.responded_at;

      d.delivery_status = 'Draft';
      o.status = 'Draft';
    }

    Object.assign(o, base);

    o.detail_json = {
      ...d,
      ol_number: o.ol_number,
      salary_type: o.salary_type,
      allowance_note: o.allowance_note,
      shift: o.shift,
      employment_type: o.employment_type,
      work_days: o.work_days,
      work_time: o.work_time,
      work_hours: o.work_hours,
      probation: o.probation,
      department: o.department,
      superior: o.superior,
      placement: o.placement,
      signer_name: o.signer_name,
      allowance_items: o.allowance_items,
      benefit_items: o.benefit_items
    };

    try { window.saveDB?.(); } catch (_) {}

    const syncResult = await persistOffer(o);
    await addHistory(
      o.application_id,
      wasSent || wasOpened
        ? 'Offering direvisi setelah proses pengiriman dan dikembalikan ke Draft; wajib Review dan Kirim Ulang.'
        : 'Draft Offering diperbarui melalui Unified Form V1.4.'
    );

    window.closeModal?.();

    try { window.renderAll?.(); } catch (_) {}
    try { window.renderOfferings?.(); } catch (_) {}

    if (syncResult?.error) {
      window.showToast?.('Perubahan tersimpan lokal, tetapi sync Supabase gagal: ' + syncResult.error.message, 'warning');
    } else if (wasSent || wasOpened) {
      window.showToast?.('Revisi tersimpan. Status kembali Draft dan harus dikirim ulang.', 'success');
    } else {
      window.showToast?.('Draft Offering berhasil diperbarui.', 'success');
    }
  }

  function install() {
    syncDb();
    hydrateAll();

    // Create Offering now uses the same V1.4 form as Edit Offering.
    window.openOfferingModal = function () {
      return renderForm('create');
    };

    // Control Center remains owned by V1.3.
    // Only its "Edit Offering" button is redirected to the unified editor.
    if (window.OfferingPatchV1) {
      window.OfferingPatchV1.editLegacy = function (id) {
        window.closeModal?.();
        setTimeout(() => renderForm('edit', id), 0);
      };
    }

    // Hydrate Offering extended data again after Supabase reload.
    if (typeof window.loadFromSupabase === 'function' && !window.loadFromSupabase.__offeringV14Wrapped) {
      const originalLoad = window.loadFromSupabase;
      const wrapped = async function () {
        const result = await originalLoad.apply(this, arguments);
        syncDb();
        hydrateAll();
        return result;
      };
      wrapped.__offeringV14Wrapped = true;
      window.loadFromSupabase = wrapped;
    }

    window.OfferingUnifiedV14 = {
      VERSION,
      openCreate: () => renderForm('create'),
      openEdit: id => renderForm('edit', id),
      save,
      hydrateAll,
      inspect(id) {
        const o = getOffer(id);
        if (!o) return null;
        return {
          offering_id: o.offering_id,
          application_id: o.application_id,
          status: o.status,
          salary: o.salary,
          allowance_items: allowanceItems(o),
          benefit_items: benefitItems(o),
          detail_json: obj(o.detail_json)
        };
      }
    };

    console.log(
      `%cOffering Unified Form V${VERSION} active`,
      'color:#7c3aed;font-weight:bold'
    );
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (
        window.OfferingPatchV1 &&
        window.OfferingDbBridgeV12 &&
        window.OfferingDeliveryV13
      ) {
        clearInterval(timer);
        install();
      } else if (tries >= 120) {
        clearInterval(timer);
        console.warn('[Offering V1.4] prerequisite patches not found.');
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
