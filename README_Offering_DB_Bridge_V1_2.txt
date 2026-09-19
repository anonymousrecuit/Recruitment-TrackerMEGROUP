Offering DB Bridge V1.2
========================

Tujuan:
Memperbaiki error "Offering tidak ditemukan" pada Offering Workflow Patch V1.1.

Penyebab:
Recruitment Tracker menyimpan data ATS pada global lexical variable `DB`,
sedangkan patch V1.1 membaca `window.DB`. Bridge ini menyinkronkan keduanya
tepat sebelum aksi Offering dijalankan.

Pemasangan:
1. Pertahankan Offering_Workflow_Patch_V1_1.js.
2. Copy Offering_DB_Bridge_V1_2.js ke folder WORK.
3. Tambahkan script ini SETELAH Offering_Workflow_Patch_V1_1.js:
   <script src="Offering_DB_Bridge_V1_2.js"></script>
4. Ctrl + Shift + R.
5. Pastikan Console menampilkan:
   Offering DB Bridge V1.2.0 active

Tidak mengubah data kandidat maupun Offering.
