OFFERING UNIFIED FORM V1.4
============================

Tujuan
------
Menyamakan form Buat Offering dan Edit Offering.

Perubahan
---------
- Edit Offering sekarang memiliki field yang sama dengan Buat Offering.
- Bisa tambah/hapus lebih dari satu tunjangan saat Create maupun Edit.
- Bisa tambah/hapus BPJS/benefit saat Create maupun Edit.
- Masing-masing tunjangan/benefit punya keterangan "mulai berlaku".
- Gaji dan nominal tunjangan tampil sebagai Rupiah.
- Data lama otomatis dimuat ke form Edit.
- Offering Draft bebas diedit.
- Jika Offering sudah pernah dibuka/dikirim via WhatsApp lalu direvisi:
  status kembali Draft, bukti pengiriman lama dibersihkan,
  revisi dicatat, dan HR wajib Review + Kirim Ulang.
- Offering yang sudah dijawab kandidat (Diterima/Ditolak) tidak dapat diedit.
- V1.4 juga memperbaiki konsistensi penyimpanan multi-tunjangan dan multi-benefit
  pada proses Buat Offering.

Prasyarat
----------
Tetap gunakan:
1. Offering_Workflow_Patch_V1_1.js
2. Offering_DB_Bridge_V1_2.js
3. Offering_Delivery_Workflow_V1_3.js

Instalasi
---------
Copy Offering_Unified_Form_V1_4.js ke folder WORK.

Tambahkan SETELAH V1.3:
<script src="Offering_Workflow_Patch_V1_1.js"></script>
<script src="Offering_DB_Bridge_V1_2.js"></script>
<script src="Offering_Delivery_Workflow_V1_3.js"></script>
<script src="Offering_Unified_Form_V1_4.js"></script>

Setelah Ctrl+Shift+R, Console harus menampilkan:
Offering Unified Form V1.4.0 active

Tidak perlu SQL baru.
