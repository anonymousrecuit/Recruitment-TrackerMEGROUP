/* ==========================================================================
   Offering_Delivery_Workflow_V1_3.js
   Recruitment Tracker MEGROUP
   Requires:
   - Offering_Workflow_Patch_V1_1.js
   - Offering_DB_Bridge_V1_2.js
   ========================================================================== */
(function () {
  'use strict';

  if (window.__OFFERING_DELIVERY_WORKFLOW_V130_ACTIVE) return;
  window.__OFFERING_DELIVERY_WORKFLOW_V130_ACTIVE = true;

  const VERSION = '1.3.0';
  const BUCKET = 'offering-letters';

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

  function getSb() {
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    return window.sb || null;
  }

  function db() { return syncDb(); }

  function getOffer(id) {
    const rows = db()?.offerings || [];
    return rows.find(x => x.offering_id === id) ||
      rows.filter(x => x.application_id === id)
        .slice()
        .sort((a, b) => String(b.offering_id || '').localeCompare(String(a.offering_id || '')))[0] ||
      null;
  }

  function getApp(id) {
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

  function asObject(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return {}; }
  }

  function detailOf(o) {
    const d = asObject(o?.detail_json);
    if (o) o.detail_json = d;
    return d;
  }

  function rupiah(v) { return 'Rp ' + Number(v || 0).toLocaleString('id-ID'); }
  function rawNumber(v) {
    const n = String(v ?? '').replace(/\D/g, '');
    return n ? Number(n) : 0;
  }

  function dateId(v) {
    if (!v) return '—';
    try {
      return new Date(v + (String(v).length === 10 ? 'T00:00:00' : ''))
        .toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return String(v); }
  }

  function normalizePhone(phone) {
    let p = String(phone || '').replace(/\D/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    if (p.startsWith('8')) p = '62' + p;
    return p;
  }

  function allowanceItems(o) {
    const d = detailOf(o);
    if (Array.isArray(d.allowance_items) && d.allowance_items.length) return d.allowance_items;
    if (Array.isArray(o?.allowance_items) && o.allowance_items.length) return o.allowance_items;
    const amount = Number(o?.allowance || 0);
    const note = String(o?.allowance_note || '').trim();
    return amount || note ? [{ name: note || 'Tunjangan', amount, effective_note: '' }] : [];
  }

  function benefitItems(o) {
    const d = detailOf(o);
    if (Array.isArray(d.benefit_items) && d.benefit_items.length) return d.benefit_items;
    if (Array.isArray(o?.benefit_items) && o.benefit_items.length) return o.benefit_items;
    const legacy = String(o?.benefit || '').trim();
    if (!legacy) return [];
    if (/bpjs kesehatan/i.test(legacy) && /ketenagakerjaan/i.test(legacy)) {
      return [
        { name: 'BPJS Kesehatan', effective_note: '' },
        { name: 'BPJS Ketenagakerjaan', effective_note: '' }
      ];
    }
    return legacy.split('|').map(x => ({ name: x.trim(), effective_note: '' })).filter(x => x.name);
  }

  function collectFormLists() {
    const allowances = [...document.querySelectorAll('.offpatch-allowance-row')].map(row => ({
      name: row.querySelector('.offpatch-allow-name')?.value?.trim() || '',
      amount: rawNumber(row.querySelector('.offpatch-allow-amount')?.value),
      effective_note: row.querySelector('.offpatch-allow-effective')?.value?.trim() || ''
    })).filter(x => x.name || x.amount || x.effective_note);

    const benefits = [...document.querySelectorAll('.offpatch-benefit-row')].map(row => ({
      name: row.querySelector('.offpatch-benefit-name')?.value?.trim() || '',
      effective_note: row.querySelector('.offpatch-benefit-effective')?.value?.trim() || ''
    })).filter(x => x.name || x.effective_note);

    return { allowances, benefits };
  }

  function localSave() {
    try { if (typeof window.saveDB === 'function') window.saveDB(); } catch (_) {}
  }

  async function addHistory(appId, stage, notes) {
    const D = db();
    if (!D) return;
    D.history = D.history || [];
    const row = {
      history_id: 'H' + Date.now(),
      application_id: appId,
      stage,
      date: new Date().toISOString().slice(0, 10),
      user: window.currentProfile?.full_name || window.currentAuthUser?.email || 'HR',
      notes
    };
    D.history.push(row);
    localSave();
    try { if (typeof window.addHistoryToSb === 'function') await window.addHistoryToSb(row); } catch (_) {}
  }

  async function persistOffer(o) {
    localSave();
    const client = getSb();
    if (!client?.from || !o) return { error: null };

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
      detail_json: detailOf(o)
    };

    let result = await client.from('offerings').upsert(payload, { onConflict: 'offering_id' });
    if (result.error && /detail_json/i.test(result.error.message || '')) {
      const p = { ...payload };
      delete p.detail_json;
      result = await client.from('offerings').upsert(p, { onConflict: 'offering_id' });
    }
    if (result.error && /ol_number/i.test(result.error.message || '')) {
      const p = { ...payload };
      delete p.detail_json;
      delete p.ol_number;
      result = await client.from('offerings').upsert(p, { onConflict: 'offering_id' });
    }
    if (result.error) console.error('[Offering V1.3] sync failed', result.error);
    return result;
  }

  async function persistApp(a) {
    try {
      if (typeof window.syncApplicationToSb === 'function') return await window.syncApplicationToSb(a);
    } catch (_) {}
    return null;
  }

  function nextOlNumber(offerDate) {
    try { if (typeof window.nextOlNumber === 'function') return window.nextOlNumber(offerDate); } catch (_) {}
    const year = String(offerDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
    let max = 0;
    for (const o of db()?.offerings || []) {
      const m = String(o.ol_number || '').match(/OL\/HR\/(\d+)\//i);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return `OL/HR/${String(max + 1).padStart(3, '0')}/${year}`;
  }

  async function saveNewOfferingV13() {
    syncDb();
    const appId = document.getElementById('offCand')?.value;
    let app = getApp(appId);
    if (!app) return window.showToast?.('Kandidat tidak valid', 'danger');

    if (['Interview User', 'Interview Final', 'Medical Check Up'].includes(app.current_stage)) {
      if (typeof window.transitionStageV2 === 'function') {
        const moved = await window.transitionStageV2(appId, 'Offering');
        if (!moved) return;
        syncDb();
        app = getApp(appId) || app;
      }
    }

    const D = db();
    const active = (D?.offerings || []).find(o =>
      o.application_id === appId &&
      !['Ditolak', 'Kadaluarsa', 'Dibatalkan'].includes(o.status)
    );
    if (active) return window.showToast?.('Offering aktif untuk kandidat ini sudah ada.', 'warning');

    const salary = rawNumber(document.getElementById('offSalary')?.value);
    if (!salary) return window.showToast?.('Gaji wajib diisi', 'danger');

    const { allowances, benefits } = collectFormLists();
    const allowanceTotal = allowances.reduce((s, x) => s + Number(x.amount || 0), 0);
    const offerDate = document.getElementById('offDate')?.value || new Date().toISOString().slice(0, 10);

    const off = {
      offering_id: 'OF' + Date.now(),
      application_id: appId,
      ol_number: nextOlNumber(offerDate),
      salary,
      salary_type: document.getElementById('offSalaryType')?.value || 'Gross',
      allowance: allowanceTotal,
      allowance_note: allowances.map(x => [x.name, x.effective_note].filter(Boolean).join(' · ')).join(' | '),
      shift: document.getElementById('offShift')?.value || '',
      employment_type: document.getElementById('offEmpType')?.value || 'PKWTT',
      work_days: document.getElementById('offWorkDays')?.value || '',
      work_time: document.getElementById('offWorkTime')?.value || '',
      work_hours: document.getElementById('offWorkHours')?.value || '',
      probation: document.getElementById('offProbation')?.value || '',
      benefit: benefits.map(x => x.name).filter(Boolean).join(' | '),
      department: document.getElementById('offDept')?.value || '',
      superior: document.getElementById('offSuperior')?.value || '',
      placement: document.getElementById('offPlacement')?.value || '',
      signer_name: document.getElementById('offSigner')?.value || '',
      offer_date: offerDate,
      deadline: document.getElementById('offDeadline')?.value || '',
      expected_join_date: document.getElementById('offJoin')?.value || '',
      status: 'Draft',
      detail_json: {
        allowance_items: allowances,
        benefit_items: benefits,
        delivery_status: 'Draft',
        created_at: new Date().toISOString(),
        created_by: window.currentProfile?.full_name || window.currentAuthUser?.email || 'HR'
      }
    };

    D.offerings.push(off);
    app.current_stage = 'Offering';
    if (app.status !== 'Diterima' && app.status !== 'Tidak Lanjut') app.status = 'Aktif';
    app.last_activity = new Date().toISOString().slice(0, 10);

    localSave();
    try { window.closeModal?.(); } catch (_) {}

    const [offerSync] = await Promise.all([
      persistOffer(off),
      persistApp(app),
      addHistory(appId, 'Offering', 'Draft Offering dibuat; belum dikirim ke kandidat.')
    ]);

    if (offerSync?.error) {
      window.showToast?.('Draft tersimpan lokal, tetapi sync server perlu diperiksa: ' + offerSync.error.message, 'warning');
    } else {
      window.showToast?.('Draft Offering tersimpan. Belum dikirim ke kandidat.', 'success');
    }

    try { window.renderAll?.(); } catch (_) {}
    try { window.renderOfferings?.(); } catch (_) {}
  }

  function offerContext(id) {
    const o = getOffer(id);
    if (!o) return {};
    const a = getApp(o.application_id);
    const c = a ? getCandidate(a.candidate_id) : null;
    const p = a ? getPosition(a.position_id) : null;
    const co = a ? getCompany(a.company_id) : null;
    const br = a ? getBranch(a.branch_id) : null;
    return { o, a, c, p, co, br };
  }

  function deliveryState(o) {
    const d = detailOf(o);
    if (o.status === 'Diterima') return 'Diterima Kandidat';
    if (o.status === 'Ditolak') return 'Ditolak Kandidat';
    if (d.sent_at) return 'Menunggu Jawaban';
    if (d.wa_opened_at) return 'Menunggu Konfirmasi Kirim';
    if (o.status === 'Draft') return 'Draft';
    if (['Menunggu Jawaban', 'Dikirim'].includes(o.status) && !d.sent_at) return 'Legacy · Belum Ada Bukti Kirim';
    return o.status || 'Draft';
  }

  function toneForState(state) {
    if (/Diterima/i.test(state)) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (/Ditolak/i.test(state)) return 'border-red-200 bg-red-50 text-red-800';
    if (/Menunggu Jawaban/i.test(state)) return 'border-amber-200 bg-amber-50 text-amber-800';
    if (/Konfirmasi/i.test(state)) return 'border-blue-200 bg-blue-50 text-blue-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
  }

  function openControl(id) {
    syncDb();
    const { o, c, p, co } = offerContext(id);
    if (!o) return window.showToast?.('Offering tidak ditemukan', 'danger');

    const state = deliveryState(o);
    const d = detailOf(o);
    const allowances = allowanceItems(o);
    const benefits = benefitItems(o);
    const sent = !!d.sent_at;
    const legacyUnverified = ['Menunggu Jawaban', 'Dikirim'].includes(o.status) && !d.sent_at;
    const canRespond = sent && !['Diterima', 'Ditolak'].includes(o.status);

    const modal = document.getElementById('modalContent');
    if (modal) modal.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto';

    window.openModal?.(`
      <div class="p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-slate-400">Offering Control Center · V1.3</div>
            <h3 class="font-bold text-xl mt-1">${esc(c?.candidate_name || 'Kandidat')}</h3>
            <div class="text-xs text-slate-500 mt-1">${esc(p?.position_name || '—')} · ${esc(co?.brand || co?.company_name || '—')}</div>
          </div>
          <button onclick="closeModal()" class="text-slate-400 text-xl">×</button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          <div class="border rounded-xl p-3">
            <div class="text-[10px] uppercase text-slate-400">Status Pengiriman</div>
            <div class="font-semibold mt-1">${esc(state)}</div>
          </div>
          <div class="border rounded-xl p-3">
            <div class="text-[10px] uppercase text-slate-400">Gaji Pokok</div>
            <div class="font-semibold mt-1">${esc(rupiah(o.salary || 0))}</div>
          </div>
        </div>

        <div class="mt-3 rounded-xl border p-3 text-xs ${toneForState(state)}">
          ${
            state === 'Draft'
              ? '<b>Draft.</b> Surat sudah dibuat tetapi belum dikirim ke kandidat.'
              : state === 'Menunggu Konfirmasi Kirim'
                ? '<b>WhatsApp sudah dibuka.</b> Klik “Konfirmasi Sudah Dikirim” hanya setelah HR benar-benar menekan Send di WhatsApp.'
                : state === 'Menunggu Jawaban'
                  ? `<b>Sudah dikirim.</b> Menunggu jawaban kandidat.${d.sent_at ? ' Dikirim: ' + esc(new Date(d.sent_at).toLocaleString('id-ID')) : ''}`
                  : legacyUnverified
                    ? '<b>Data lama.</b> Status sebelumnya “Menunggu Jawaban”, tetapi sistem belum memiliki bukti waktu pengiriman.'
                    : `<b>${esc(state)}</b>`
          }
        </div>

        <div class="mt-4 border rounded-xl p-4">
          <div class="text-xs font-semibold text-slate-700">Tunjangan</div>
          <div class="mt-2 space-y-1 text-xs text-slate-600">
            ${allowances.length
              ? allowances.map(x => `<div>• ${esc(x.name || 'Tunjangan')} — <b>${esc(rupiah(x.amount || 0))}</b>${x.effective_note ? ` · ${esc(x.effective_note)}` : ''}</div>`).join('')
              : '<div class="text-slate-400">Tidak ada tunjangan.</div>'}
          </div>
        </div>

        <div class="mt-3 border rounded-xl p-4">
          <div class="text-xs font-semibold text-slate-700">Benefit / BPJS</div>
          <div class="mt-2 space-y-1 text-xs text-slate-600">
            ${benefits.length
              ? benefits.map(x => `<div>• ${esc(x.name || 'Benefit')}${x.effective_note ? ` · ${esc(x.effective_note)}` : ' · <span class="text-amber-600">mulai berlaku belum diisi</span>'}</div>`).join('')
              : '<div class="text-slate-400">Tidak ada benefit.</div>'}
          </div>
        </div>

        ${d.pdf_signed_url ? `
          <div class="mt-3 border rounded-xl p-3 text-xs">
            <div class="font-semibold">Dokumen pengiriman</div>
            <a href="${esc(d.pdf_signed_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline break-all">Buka link PDF sementara</a>
          </div>` : ''}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
          <button onclick="generateOfferingLetter('${esc(o.offering_id)}')" class="px-3 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold">
            Review Surat Offering
          </button>
          <button onclick="OfferingPatchV1.editLegacy('${esc(o.offering_id)}')" class="px-3 py-2.5 border rounded-lg text-sm font-semibold">
            Edit Offering
          </button>

          ${!sent && !d.wa_opened_at ? `
            <button onclick="OfferingDeliveryV13.prepareWhatsApp('${esc(o.offering_id)}')" class="sm:col-span-2 px-3 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold">
              Kirim Surat via WhatsApp
            </button>` : ''}

          ${!sent && d.wa_opened_at ? `
            <button onclick="OfferingDeliveryV13.confirmSent('${esc(o.offering_id)}')" class="sm:col-span-2 px-3 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold">
              Konfirmasi Sudah Dikirim
            </button>
            <button onclick="OfferingDeliveryV13.prepareWhatsApp('${esc(o.offering_id)}')" class="px-3 py-2.5 border rounded-lg text-sm">
              Buka WhatsApp Lagi
            </button>` : ''}

          ${legacyUnverified ? `
            <button onclick="OfferingDeliveryV13.markDraft('${esc(o.offering_id)}')" class="px-3 py-2.5 border border-slate-300 rounded-lg text-sm">
              Tandai Belum Dikirim (Draft)
            </button>` : ''}

          ${canRespond ? `
            <button onclick="OfferingDeliveryV13.markAccepted('${esc(o.offering_id)}')" class="px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold">
              Tandai Diterima Kandidat
            </button>
            <button onclick="OfferingDeliveryV13.markRejected('${esc(o.offering_id)}')" class="px-3 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold">
              Tandai Ditolak Kandidat
            </button>` : ''}
        </div>

        ${o.status === 'Diterima' ? `
          <div class="mt-4 border border-emerald-200 bg-emerald-50 rounded-xl p-3 text-xs text-emerald-800">
            Kandidat tercatat menerima Offering. <b>Belum otomatis di-Hire dan belum mengubah manpower.</b>
          </div>` : ''}

        <div class="text-right mt-4">
          <button onclick="closeModal()" class="px-3 py-2 border rounded-lg text-sm">Tutup</button>
        </div>
      </div>
    `);
  }

  function pdfLine(doc, text, x, y, width, size = 10, bold = false) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text || '—'), width);
    doc.text(lines, x, y);
    return y + Math.max(1, lines.length) * (size * 0.42 + 1.6);
  }

  function buildPdfBlob(id) {
    const { o, c, p, co, br } = offerContext(id);
    if (!o || !window.jspdf?.jsPDF) throw new Error('Library PDF belum tersedia.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const W = 210, M = 16, CW = W - M * 2;
    let y = 16;

    const ensure = (need = 18) => {
      if (y + need > 282) { doc.addPage(); y = 16; }
    };

    const section = (title) => {
      ensure(15);
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(title, M, y);
      y += 2.5;
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.6);
      doc.line(M, y, W - M, y);
      y += 6;
    };

    const boxRow = (label, value) => {
      ensure(13);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(M, y, CW, 11, 1.5, 1.5, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), M + 3, y + 3.7);
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value || '—'), M + 3, y + 8.2);
      y += 13;
    };

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(M, y, CW, 31, 3, 3, 'F');
    doc.setTextColor(203, 213, 225);
    doc.setFontSize(8);
    doc.text('RECRUITMENT ASSESSMENT REPORT', M + 6, y + 7);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('SURAT PENAWARAN KERJA', M + 6, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${co?.brand || co?.company_name || 'Perusahaan'} · ${o.ol_number || 'Offering Letter'}`, M + 6, y + 24);
    y += 39;

    doc.setTextColor(15, 23, 42);
    y = pdfLine(doc, `Yth. ${c?.candidate_name || 'Kandidat'},`, M, y, CW, 10, true);
    y += 2;
    y = pdfLine(doc, `Kami menyampaikan penawaran kerja untuk posisi ${p?.position_name || '—'} dengan rincian berikut.`, M, y, CW, 10, false);
    y += 4;

    boxRow('Posisi', p?.position_name || '—');
    boxRow('Departemen / Unit', o.department || p?.division || p?.department || '—');
    boxRow('Penempatan', o.placement || br?.branch_name || '—');
    boxRow('Atasan Langsung', o.superior || '—');
    boxRow('Status Kerja', o.employment_type || '—');
    boxRow('Mulai Bekerja', dateId(o.expected_join_date));

    section('Kompensasi');
    boxRow(`Gaji Pokok (${o.salary_type || 'Gross'})`, rupiah(o.salary || 0));

    const allowances = allowanceItems(o);
    if (allowances.length) {
      for (const x of allowances) {
        ensure(18);
        y = pdfLine(doc, `${x.name || 'Tunjangan'} — ${rupiah(x.amount || 0)}`, M, y, CW, 10, true);
        y = pdfLine(doc, `Mulai berlaku / diterima: ${x.effective_note || 'Sesuai ketentuan perusahaan'}`, M + 3, y, CW - 3, 9, false);
        y += 3;
      }
    } else {
      y = pdfLine(doc, 'Tidak ada tunjangan yang dicantumkan.', M, y, CW, 9, false);
      y += 3;
    }

    section('Benefit / BPJS');
    const benefits = benefitItems(o);
    if (benefits.length) {
      for (const x of benefits) {
        ensure(15);
        y = pdfLine(doc, x.name || 'Benefit', M, y, CW, 10, true);
        y = pdfLine(doc, `Mulai berlaku: ${x.effective_note || 'Sesuai ketentuan perusahaan'}`, M + 3, y, CW - 3, 9, false);
        y += 3;
      }
    } else {
      y = pdfLine(doc, 'Tidak ada benefit yang dicantumkan.', M, y, CW, 9, false);
      y += 3;
    }

    section('Ketentuan');
    boxRow('Hari / Jam Kerja', [o.work_days, o.work_time, o.work_hours].filter(Boolean).join(' · ') || '—');
    boxRow('Masa Percobaan', o.probation || 'Sesuai ketentuan');
    boxRow('Tanggal Offering', dateId(o.offer_date));
    boxRow('Deadline Jawaban', dateId(o.deadline));

    ensure(35);
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Hormat kami,', M, y);
    doc.text('Menyetujui penawaran,', 120, y);
    y += 18;
    doc.setDrawColor(148, 163, 184);
    doc.line(M, y, M + 55, y);
    doc.line(120, y, 175, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(o.signer_name || 'Manager Human Resource', M, y);
    doc.text(c?.candidate_name || 'Kandidat', 120, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(co?.company_name || co?.brand || 'Perusahaan', M, y);
    doc.text('Tanggal: __________________', 120, y);

    return doc.output('blob');
  }

  function signedExpirySeconds(o) {
    const now = Date.now();
    const deadline = o?.deadline ? new Date(o.deadline + 'T23:59:59').getTime() : 0;
    const desired = deadline > now ? Math.ceil((deadline - now) / 1000) : 7 * 24 * 3600;
    return Math.max(3600, Math.min(desired, 14 * 24 * 3600));
  }

  async function prepareWhatsApp(id) {
    syncDb();
    const { o, c, p, co } = offerContext(id);
    if (!o || !c) return window.showToast?.('Data Offering/kandidat tidak ditemukan', 'danger');

    const phone = normalizePhone(c.phone);
    if (!phone || phone.length < 10) return window.showToast?.('Nomor WhatsApp kandidat tidak valid', 'danger');

    const client = getSb();
    if (!client?.storage?.from) return window.showToast?.('Supabase Storage belum tersedia pada sesi ini.', 'danger');

    const popup = window.open('about:blank', '_blank');
    try {
      window.showToast?.('Menyiapkan PDF Offering dan link aman...', 'info');

      const blob = buildPdfBlob(o.offering_id);
      const safe = String(c.candidate_name || 'Kandidat').replace(/[^a-z0-9]+/gi, '_');
      const path = `${o.application_id}/${o.offering_id}/Offering_Letter_${safe}.pdf`;

      const bucket = client.storage.from(BUCKET);
      const upload = await bucket.upload(path, blob, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '3600'
      });
      if (upload.error) throw new Error(
        `Upload PDF gagal: ${upload.error.message}. Pastikan SQL Offering_Storage_Setup_V1.sql sudah dijalankan.`
      );

      const expiresIn = signedExpirySeconds(o);
      const signed = await bucket.createSignedUrl(path, expiresIn);
      if (signed.error || !signed.data?.signedUrl) {
        throw new Error('Gagal membuat link PDF sementara: ' + (signed.error?.message || 'unknown error'));
      }

      const d = detailOf(o);
      d.pdf_path = path;
      d.pdf_signed_url = signed.data.signedUrl;
      d.pdf_signed_url_created_at = new Date().toISOString();
      d.pdf_signed_url_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
      d.wa_opened_at = new Date().toISOString();
      d.delivery_status = 'Menunggu Konfirmasi Kirim';

      await persistOffer(o);

      const deadlineText = o.deadline ? dateId(o.deadline) : 'sesuai informasi dari HR';
      const text =
`Halo ${c.candidate_name || 'Kandidat'},

Terima kasih telah mengikuti proses rekrutmen untuk posisi ${p?.position_name || '-'} di ${co?.brand || co?.company_name || '-'}.

Kami menyampaikan Surat Penawaran Kerja untuk Anda.

Silakan membaca dokumen melalui link berikut:
${signed.data.signedUrl}

Mohon memberikan konfirmasi paling lambat ${deadlineText}.

Terima kasih,
Tim Rekrutmen ${co?.brand || co?.company_name || ''}`;

      const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);

      if (popup) popup.location.href = url;
      else window.open(url, '_blank');

      openControl(o.offering_id);
      window.showToast?.('WhatsApp dibuka. Setelah benar-benar dikirim, klik “Konfirmasi Sudah Dikirim”.', 'success');
    } catch (err) {
      try { popup?.close(); } catch (_) {}
      console.error('[Offering V1.3] WhatsApp preparation failed', err);
      window.showToast?.(err.message || String(err), 'danger');
    }
  }

  async function confirmSent(id) {
    const o = getOffer(id);
    if (!o) return window.showToast?.('Offering tidak ditemukan', 'danger');
    const d = detailOf(o);
    if (!d.wa_opened_at) return window.showToast?.('Buka WhatsApp dari sistem terlebih dahulu.', 'warning');

    o.status = 'Menunggu Jawaban';
    d.sent_at = new Date().toISOString();
    d.sent_by = window.currentProfile?.full_name || window.currentAuthUser?.email || 'HR';
    d.delivery_status = 'Menunggu Jawaban';

    const r = await persistOffer(o);
    await addHistory(o.application_id, 'Offering', 'Surat Offering dikonfirmasi sudah dikirim ke kandidat via WhatsApp.');

    if (r?.error) window.showToast?.('Status lokal berubah, tetapi sync server gagal: ' + r.error.message, 'warning');
    else window.showToast?.('Pengiriman dikonfirmasi. Status: Menunggu Jawaban.', 'success');

    try { window.renderAll?.(); } catch (_) {}
    openControl(o.offering_id);
  }

  async function markDraft(id) {
    const o = getOffer(id);
    if (!o) return;
    const d = detailOf(o);
    o.status = 'Draft';
    delete d.sent_at;
    delete d.sent_by;
    delete d.wa_opened_at;
    d.delivery_status = 'Draft';
    await persistOffer(o);
    await addHistory(o.application_id, 'Offering', 'Status Offering dikoreksi menjadi Draft / belum dikirim.');
    try { window.renderAll?.(); } catch (_) {}
    openControl(o.offering_id);
  }

  async function markAccepted(id) {
    const o = getOffer(id);
    if (!o) return;
    const d = detailOf(o);
    if (!d.sent_at) return window.showToast?.('Offering belum dikonfirmasi terkirim.', 'warning');

    const proceed = window.confirm(
      'Konfirmasi bahwa KANDIDAT menyatakan menerima Offering?\n\n' +
      'Tindakan ini hanya mencatat jawaban kandidat. Kandidat belum otomatis di-Hire dan manpower belum berubah.'
    );
    if (!proceed) return;

    o.status = 'Diterima';
    d.candidate_response = 'Diterima';
    d.responded_at = new Date().toISOString();
    d.delivery_status = 'Diterima Kandidat';

    await persistOffer(o);
    await addHistory(o.application_id, 'Offering', 'Kandidat menyatakan menerima Offering. Belum diproses Hire/Join.');
    try { window.renderAll?.(); } catch (_) {}
    openControl(o.offering_id);
    window.showToast?.('Jawaban kandidat dicatat: Diterima. Belum otomatis Hire.', 'success');
  }

  async function markRejected(id) {
    const o = getOffer(id);
    if (!o) return;
    const d = detailOf(o);
    if (!d.sent_at) return window.showToast?.('Offering belum dikonfirmasi terkirim.', 'warning');

    const proceed = window.confirm(
      'Konfirmasi bahwa KANDIDAT menyatakan menolak Offering?\n\n' +
      'Tindakan ini tidak otomatis menggugurkan application agar HR dapat menentukan tindak lanjut.'
    );
    if (!proceed) return;

    o.status = 'Ditolak';
    d.candidate_response = 'Ditolak';
    d.responded_at = new Date().toISOString();
    d.delivery_status = 'Ditolak Kandidat';

    await persistOffer(o);
    await addHistory(o.application_id, 'Offering', 'Kandidat menyatakan menolak Offering. Tindak lanjut application menunggu keputusan HR.');
    try { window.renderAll?.(); } catch (_) {}
    openControl(o.offering_id);
    window.showToast?.('Jawaban kandidat dicatat: Ditolak. Application belum otomatis digugurkan.', 'info');
  }

  function polishOfferingTable() {
    syncDb();
    document.querySelectorAll('#offeringTableBody tr').forEach(tr => {
      const edit = [...tr.querySelectorAll('button')].find(b => /editOffering\('/.test(b.getAttribute('onclick') || ''));
      if (!edit) return;
      const m = (edit.getAttribute('onclick') || '').match(/editOffering\('([^']+)'\)/);
      if (!m) return;

      const o = getOffer(m[1]);
      if (!o) return;
      const d = detailOf(o);

      const accept = [...tr.querySelectorAll('button')].find(b => /acceptOffer\('/.test(b.getAttribute('onclick') || ''));
      const reject = [...tr.querySelectorAll('button')].find(b => /rejectOffer\('/.test(b.getAttribute('onclick') || ''));

      if (!d.sent_at) {
        if (accept) accept.style.display = 'none';
        if (reject) reject.style.display = 'none';
      } else {
        if (accept) accept.textContent = 'Diterima Kandidat';
        if (reject) reject.textContent = 'Ditolak Kandidat';
      }

      if (!d.sent_at && ['Menunggu Jawaban', 'Dikirim'].includes(o.status)) {
        const cells = tr.querySelectorAll('td');
        if (cells[6]) cells[6].innerHTML = '<span class="status-badge bg-slate-100 text-slate-600">Draft · belum terverifikasi terkirim</span>';
      }
    });
  }

  function install() {
    syncDb();

    window.saveNewOffering = saveNewOfferingV13;
    window.editOffering = function (id) { syncDb(); return openControl(id); };
    window.acceptOffer = markAccepted;
    window.rejectOffer = markRejected;

    if (window.OfferingPatchV1) window.OfferingPatchV1.openManage = openControl;

    if (typeof window.renderOfferings === 'function') {
      const prevRender = window.renderOfferings;
      if (!prevRender.__deliveryV13Wrapped) {
        const wrapped = function () {
          const r = prevRender.apply(this, arguments);
          setTimeout(polishOfferingTable, 0);
          return r;
        };
        wrapped.__deliveryV13Wrapped = true;
        window.renderOfferings = wrapped;
      }
    }

    window.OfferingDeliveryV13 = {
      VERSION,
      openControl,
      prepareWhatsApp,
      confirmSent,
      markDraft,
      markAccepted,
      markRejected,
      buildPdfBlob,
      inspect(id) {
        const o = getOffer(id);
        return o ? {
          offering_id: o.offering_id,
          application_id: o.application_id,
          status: o.status,
          delivery_state: deliveryState(o),
          detail_json: detailOf(o)
        } : null;
      }
    };

    console.log(
      `%cOffering Delivery Workflow V${VERSION} active`,
      'color:#16a34a;font-weight:bold'
    );
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (
        window.OfferingPatchV1 &&
        window.OfferingDbBridgeV12 &&
        typeof window.generateOfferingLetter === 'function'
      ) {
        clearInterval(timer);
        install();
      } else if (tries >= 120) {
        clearInterval(timer);
        console.warn('[Offering V1.3] prerequisite patches not found.');
      }
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
