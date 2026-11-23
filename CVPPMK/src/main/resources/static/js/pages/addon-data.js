// Daftar yang DIHARAPKAN addon STEM dan Farm Breeding, diambil dari kodenya (STEM 1.04 + Farm Breeding 1.03).
// Dibandingkan dengan isi DB oleh addon-sections.js. Ubah di sini kalau addon berubah, bukan di halaman.
// level: w = dibaca langsung di jalur utama, o = opsional / fitur tertentu. Format baris sama dengan breeding-data.js.
import * as B from "./breeding-data.js";

const STEM = {
  PARAMS: [
    ["INSERTPARAMAUTO", "Otomatis", "w", "Isi 1 supaya key interbranch dibuat otomatis saat addon start"],
    ["SLHOST", "Interbranch", "o", "Host Service Layer bila beda dengan server SLD (kosong = server SLD)"],
    ["SAPUSERINT", "Interbranch", "w", "User SAP untuk login Service Layer (ITR dan GI/GR TI Branch)"],
    ["SAPPWDINT", "Interbranch", "w", "Password user itu. Isi manual, tidak ikut disalin antar DB"],
    ["ITBRACCI", "Interbranch", "w", "Akun GL clearing Goods Issue TI Branch"],
    ["ITBRACCR", "Interbranch", "w", "Akun GL clearing Goods Receipt TI Branch"],
    ["ITBRANCHGITYPE", "Interbranch", "w", "Isi U_STEM_ISSUETYPE di GI hasil TI Branch"],
    ["ITBRANCHGRTYPE", "Interbranch", "w", "Isi U_STEM_RECEIPTTYPE di GR hasil TI Branch"],
    ["ITBRANCHTOLERANCE", "Interbranch", "w", "Toleransi pembulatan TI Branch (kosong menolak validasi)"],
    ["ITB_CR_NAME", "Interbranch", "o", "Nama layout Crystal cetak TI Branch (kosong = cetak nonaktif)"],
    ["FILTERITEMBYPROP", "Branch", "o", "Y = filter item per branch lewat Item Properties"],
    ["WHTRS", "Gudang", "w", "Kode gudang transit standar"],
    ["WHSCODEREJ", "Gudang", "o", "Kode gudang reject (Shopfloor/reject)"],
    ["BINCODEREJ", "Gudang", "o", "Kode bin reject"],
    ["SRIN", "Series", "o", "Series stok masuk"],
    ["SROUT", "Series", "o", "Series stok keluar"],
    ["STRWKACCI", "Rework", "o", "Akun stok keluar Post Rework"],
    ["STRWKACCR", "Rework", "o", "Akun stok masuk Post Rework"],
    ["OVERGRTOL", "Dokumen", "o", "Toleransi over Goods Receipt"],
    ["GRREFPO", "Dokumen", "o", "Referensi PO pada Goods Receipt"],
    ["ITMGRPAFKHDP", "Dokumen", "o", "Item group afkir hidup"],
    ["RACKENABLED", "Dokumen", "o", "0 mematikan fitur rack"],
    ["VATOUTPATH", "Faktur Pajak", "o", "Folder ekspor faktur pajak keluaran"],
    ["VATINPATH", "Faktur Pajak", "o", "Folder ekspor faktur pajak masukan"],
    ["VATINIMPORTPATH", "Faktur Pajak", "o", "Folder faktur pajak masukan impor"],
    ["XMLPATHVATOUT", "Faktur Pajak", "o", "Folder XML CoreTax VAT Out"]
  ],
  // [tabel tanpa @, dibuat oleh, perlu isi data?, dibaca oleh, catatan]
  TABLES: [
    ["ST_PARAM", "DBCreator STEM", true, "Semua modul (GetParameter)", ""],
    ["STEM_SERIESMAP", "DBCreator STEM", true, "Production Order dan Shopfloor (series per tipe dokumen dan group)", ""],
    ["STEM_SERIESRWK", "DBCreator STEM", true, "Post Rework (series Rework ke series GI dan GR)", "Hanya bila Rework dipakai"],
    ["STEM_SERIESJE", "DBCreator STEM", true, "Export Journal Entry (series basis ke target)", "Hanya bila JE Export dipakai"],
    ["STEM_ACCGIGRMAP", "DBCreator STEM", true, "Mapping akun GI/GR (FindGroup)", ""],
    ["STEM_FPCONFIG", "DBCreator STEM", true, "Penomoran faktur pajak", "Hanya bila Faktur Pajak dipakai"],
    ["STEM_FACILITYREF", "DBCreator STEM", true, "CoreTax (referensi fasilitas)", "Hanya bila CoreTax dipakai"],
    ["ST_RTYPE", "DBCreator STEM", true, "Rework (tipe rework)", "Hanya bila Rework dipakai"],
    ["ST_SHIFT", "DBCreator STEM", true, "Shopfloor (shift)", ""],
    ["ST_UDWC", "DBCreator STEM", true, "Production Order (work center)", ""],
    ["ST_UDRTH", "DBCreator STEM", true, "Production Order (route)", ""],
    ["ST_WCWHS_MAP", "DBCreator STEM", true, "Mapping gudang work center", ""],
    ["STEM_STDSPEC", "DBCreator STEM", true, "Shopfloor (standar spesifikasi)", ""],
    ["STEM_SPECCRITERIA", "DBCreator STEM", true, "Shopfloor (kriteria)", ""],
    ["STEM_REJECT", "DBCreator STEM", true, "Shopfloor (master reject)", ""],
    ["STEM_MODULEIFLOCS", "DBCreator STEM", true, "Daftar modul iFlocs", ""],
    ["STEM_WHSASGNIFLOCSH", "DBCreator STEM", true, "Warehouse Assignment (web)", ""],
    ["STEM_TIBRANCHH", "DBCreator STEM (hanya DB berbranch)", false, "TI Branch (interbranch)", "Ada hanya bila DB memakai branch"]
  ],
  // [nama, jenis SP|FN, dibaca oleh, file definisi, level]
  PROCS: [
    ["SBO_SP_TransactionNotification", "SP", "Semua dokumen SAP", "SP_Reference\\PPMK_Gabungan", "w"],
    ["SBO_SP_PostTransactionNotice", "SP", "IT/TO/TI (OpenQty, status TO, interbranch)", "SP_Reference\\PPMK_Gabungan", "w"],
    ["GetItemResourceCost", "FN", "Post Rework (kolom Item Before)", "Query\\STEM_BRANCH\\01 GetItemResourceCost.sql", "w"],
    ["STEM_RWK_GET_RESOURCETABLE", "SP", "Post Rework", "cek definisinya (tidak ada di folder Query)", "o"],
    ["ST_VAT_OUT", "SP", "Faktur Pajak keluaran", "cek definisinya (tidak ada di folder Query)", "o"],
    ["ST_VATIN", "SP", "Faktur Pajak masukan", "cek definisinya (tidak ada di folder Query)", "o"],
    ["ST_VATINIMP", "SP", "Faktur Pajak masukan impor", "cek definisinya (tidak ada di folder Query)", "o"],
    ["ST_CORETAX_VAT_OUT", "SP", "CoreTax VAT Out", "cek definisinya (tidak ada di folder Query)", "o"]
  ],
  // [tabel (TableID CUFD), alias tanpa U_, fungsi]
  UDFS: [
    ["OWHS", "STEM_Type", "Tipe gudang: WAREHOUSE / TRANSIT / TRANSIT BRANCH"],
    ["OWTQ", "STEM_ITTYPE", "Tipe ITR: DIRECT / INTERNAL TRANSIT / INTERBRANCH"],
    ["OWTR", "STEM_ITTYPE", "Tipe IT"],
    ["OWTQ", "STEM_FRBRWHS", "Gudang branch sumber (ITR interbranch)"],
    ["OWTQ", "STEM_TOBR", "Branch tujuan (ITR interbranch)"],
    ["OWTQ", "STEM_TOBRWHS", "Gudang branch tujuan (ITR interbranch)"],
    ["OWTR", "STEM_TOBR", "Branch tujuan (IT interbranch)"],
    ["OWTR", "STEM_DOCSTATUS", "Status IT interbranch (O/C)"],
    ["OWTR", "STEM_ITBGUID", "Kunci pasangan GI/GR interbranch"],
    ["WTR1", "STEM_OPENQTY", "Sisa qty IT interbranch yang belum diterima"],
    ["OIGE", "STEM_ITBGUID", "Kunci GI hasil TI Branch"],
    ["OIGN", "STEM_ITBGUID", "Kunci GR hasil TI Branch"]
  ]
};

export const ADDONS = [
  { id: "stem", name: "Addon STEM", ...STEM },
  { id: "breeding", name: "Addon Farm Breeding", PARAMS: B.PARAMS, TABLES: B.TABLES, PROCS: B.PROCS, UDFS: B.UDFS }
];
