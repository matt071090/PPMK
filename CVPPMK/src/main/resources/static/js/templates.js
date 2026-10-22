// Template Excel upload via Service Layer, dibuat di browser saat diklik (tidak disimpan di server).
// Konvensi template master data STEM: baris 1 = label (* = wajib), baris 2 = nama field SL, baris 3 = contoh.
// Dropdown diambil dari SAP saat itu (section "template-ref"), kolom UDF mengikuti CUFD project ini.
// Nama field & nilai enum di bawah sudah dicocokkan ke $metadata SL (2026-10-16).
import { xlsxBlob, download, S, excelDate } from "./xlsx.js";

const ACCT = "Pilih dari daftar (kode - nama akun posting).";
const YN = { Y: "tYES", N: "tNO" };
const F = (label, field, o = {}) => ({ label, field, ...o });  // o: req, sample, note, enum, ref, kind ("num" | "date"), parent
const VALUATION = { "Moving Average": "bis_MovingAverage", Standard: "bis_Standard", FIFO: "bis_FIFO", "Serial/Batch": "bis_SNB" };
const UDF_TYPES = { A: "teks", N: "angka", B: "angka desimal", D: "tanggal (YYYY-MM-DD)", M: "teks panjang" };

export const TEMPLATES = [
  { no: "01", title: "Posting Period", entity: "CompanyService_CreatePeriodWithFinanceParams",
    note: "Akun G/L default (G/L Account Determination) disalin dari posting period terakhir saat upload.",
    sheets: [{ name: "Posting Period", fields: [
      F("Kode Period", "PeriodCategory", { req: 1, sample: "2041", note: "Kode kategori periode, biasanya tahun buku. Maks 10 karakter." }),
      F("Nama Period", "PeriodName", { req: 1, sample: "2041", note: "Nama yang tampil di layar Posting Period." }),
      F("Indicator", "PeriodIndicator", { req: 1, ref: "indicators", last: 1, note: "Period indicator untuk semua sub period. Harus sudah terdaftar di SAP (Financials > Period Indicators)." }),
      F("Awal Tahun Buku", "BeginningofFinancialYear", { req: 1, sample: "2041-01-01", kind: "date", note: "Tanggal mulai tahun buku." }),
      F("Jenis Sub Period", "SubPeriodType", { req: 1, sample: "Months", enum: { Months: "spt_Months", Quarters: "spt_Quarters", Year: "spt_Year", Days: "spt_Days" },
        note: "Months = bulanan, Quarters = per kuartal, Year = tahunan, Days = harian." }),
      F("Jumlah Sub Period", "NumberOfPeriods", { req: 1, sample: 12, kind: "num", note: "Jumlah sub period dalam setahun, mis. 12 untuk bulanan." })] }] },

  { no: "02", title: "Cost Center", entity: "ProfitCenters", sheets: [{ name: "Cost Center", fields: [
      F("Kode Cost Center", "CenterCode", { req: 1, sample: "ADMIN", note: "Kode unik, maks 8 karakter." }),
      F("Nama Cost Center", "CenterName", { req: 1, sample: "ADMIN", note: "Nama yang tampil di dokumen dan laporan." }),
      F("Dimension", "InWhichDimension", { req: 1, ref: "dims", note: "Dimension tempat cost center ini (nama dimension di SAP)." }),
      F("Berlaku Dari", "EffectiveFrom", { req: 1, sample: "2023-01-01", kind: "date", note: "Tanggal mulai cost center bisa dipakai." }),
      F("Aktif", "Active", { sample: "Y", enum: YN, note: "Y = aktif, N = nonaktif. Kosong = Y." })] }] },

  { no: "03", title: "Payment Terms", entity: "PaymentTermsTypes", sheets: [{ name: "Payment Terms", fields: [
      F("Nama Payment Term", "PaymentTermsGroupName", { req: 1, sample: "TT 30 days", note: "Nama syarat pembayaran, harus unik." }),
      F("Jatuh Tempo Dihitung Dari", "BaselineDate", { sample: "Posting Date", note: "Tanggal dasar perhitungan jatuh tempo. Kosong = Posting Date.",
        enum: { "Posting Date": "bld_PostingDate", "System Date": "bld_SystemDate", "Tax Date": "bld_TaxDate", "Closing Date": "bld_ClosingDate" } }),
      F("Mulai Dari", "StartFrom", { sample: "None", note: "Titik awal hitung: None, Month Start, Half Month, Month End.",
        enum: { None: "pdt_None", "Month Start": "pdt_MonthStart", "Half Month": "pdt_HalfMonth", "Month End": "pdt_MonthEnd" } }),
      F("Tambahan Bulan", "NumberOfAdditionalMonths", { sample: 0, kind: "num", note: "Jumlah bulan ditambahkan." }),
      F("Tambahan Hari", "NumberOfAdditionalDays", { sample: 30, kind: "num", note: "Jumlah hari ditambahkan." }),
      F("Toleransi (hari)", "NumberOfToleranceDays", { sample: 0, kind: "num", note: "Hari toleransi setelah jatuh tempo." }),
      F("Price List", "PriceListNo", { ref: "pricelists", noSample: 1, note: "Price list default untuk BP dengan payment term ini." }),
      F("Credit Limit", "CreditLimit", { sample: 0, kind: "num", note: "Batas kredit default." })] }] },

  { no: "04", title: "Price List", entity: "PriceLists", sheets: [{ name: "Price List", fields: [
      F("Nama Price List", "PriceListName", { req: 1, sample: "HARGA JUAL RETAIL", note: "Nama price list, harus unik." }),
      F("Base Price List", "BasePriceList", { ref: "pricelists", note: "Price list dasar (harga = base x faktor)." }),
      F("Faktor", "Factor", { sample: 1, kind: "num", note: "Pengali dari base price list. Kosong = 1." }),
      F("Mata Uang", "DefaultPrimeCurrency", { sample: "IDR", ref: "currency", note: "Mata uang utama price list." }),
      F("Harga Termasuk Pajak", "IsGrossPrice", { sample: "N", enum: YN, note: "Y = harga sudah termasuk pajak (gross)." }),
      F("Aktif", "Active", { sample: "Y", enum: YN, note: "Y = aktif." })] }] },

  { no: "05", title: "Item Group", entity: "ItemGroups",
    note: "Akun yang dikosongkan diisi default SAP. Karena Set G/L by Item Group, sebaiknya akun utama diisi semua.",
    sheets: [{ name: "Item Group", fields: [
      F("Nama Item Group", "GroupName", { req: 1, sample: "TELUR HE", note: "Nama item group, harus unik." }),
      F("Valuation Method", "InventorySystem", { sample: "Moving Average", enum: VALUATION, note: "Metode valuasi default item baru di group ini." }),
      ...[["Inventory Account", "InventoryAccount", 1, "Akun persediaan. "], ["Cost of Goods Sold", "CostAccount", 1, "Akun HPP. "],
        ["Revenue Account", "RevenuesAccount", 1, "Akun penjualan. "], ["Sales Returns Account", "ReturningAccount", 0, "Akun retur penjualan. "],
        ["Expense Account", "ExpensesAccount", 0, "Akun biaya (pembelian non-stok). "], ["Allocation Account", "TransfersAccount", 0, "Akun alokasi (GR/IR). "],
        ["Variance Account", "VarianceAccount", 0, ""], ["Price Difference Account", "PriceDifferencesAccount", 0, ""],
        ["Inventory Offset - Decrease", "DecreasingAccount", 0, ""], ["Inventory Offset - Increase", "IncreasingAccount", 0, ""],
        ["Goods Clearing Account", "GoodsClearingAccount", 0, ""], ["Stock in Transit Account", "StockInTransitAccount", 0, ""],
        ["WIP Inventory Account", "WIPMaterialAccount", 0, ""]].map(([l, f, req, n]) => F(l, f, { req, ref: "accounts", noSample: !req, note: n + ACCT }))] }] },

  { no: "06", title: "Item", entity: "Items", note: "Kolom setelah 'Asset Class' adalah UDF item (mengikuti SAP). Dropdown UDF = valid values, lihat sheet UDF.",
    sheets: [{ name: "Item", udf: "OITM", fields: [
      F("Kode Item", "ItemCode", { req: 1, sample: "01303002300002", note: "Kode item, maks 50 karakter, harus unik." }),
      F("Nama Item", "ItemName", { req: 1, sample: "ASAM SITRAT", note: "Deskripsi item, maks 200 karakter." }),
      F("Nama Asing", "ForeignName", { note: "Nama alternatif (opsional)." }),
      F("Tipe Item", "ItemType", { sample: "Items", enum: { Items: "itItems", Labor: "itLabor", Travel: "itTravel", "Fixed Assets": "itFixedAssets" },
        note: "Items = barang, Labor = jasa, Travel, Fixed Assets = aset tetap. Kosong = Items." }),
      F("Item Group", "ItemsGroupCode", { req: 1, ref: "itemgroups", note: "Pilih dari daftar item group SAP." }),
      F("Inventory Item", "InventoryItem", { req: 1, sample: "Y", enum: YN, note: "Y = barang stok." }),
      F("Sales Item", "SalesItem", { req: 1, sample: "Y", enum: YN, note: "Y = bisa dijual." }),
      F("Purchasing Item", "PurchaseItem", { req: 1, sample: "Y", enum: YN, note: "Y = bisa dibeli." }),
      F("Satuan Stok", "InventoryUOM", { sample: "KG", note: "Satuan persediaan (UoM Group Manual: ketik bebas)." }),
      F("Satuan Beli", "PurchaseUnit", { sample: "KG", note: "Satuan pembelian." }),
      F("Isi per Satuan Beli", "PurchaseItemsPerUnit", { sample: 1, kind: "num", note: "Jumlah satuan stok per 1 satuan beli." }),
      F("Satuan Jual", "SalesUnit", { sample: "KG", note: "Satuan penjualan." }),
      F("Isi per Satuan Jual", "SalesItemsPerUnit", { sample: 1, kind: "num", note: "Jumlah satuan stok per 1 satuan jual." }),
      F("Kelola Batch", "ManageBatchNumbers", { sample: "N", enum: YN, note: "Y = item dikelola per batch." }),
      F("Kelola Serial", "ManageSerialNumbers", { sample: "N", enum: YN, note: "Y = item dikelola per serial number." }),
      F("Tax Group Beli", "PurchaseVATGroup", { ref: "vat_in", last: 1, note: "Pajak masukan default. Rate otomatis mengikuti tax group." }),
      F("Tax Group Jual", "SalesVATGroup", { ref: "vat_out", last: 1, note: "Pajak keluaran default. Rate otomatis mengikuti tax group." }),
      F("Valuation Method", "CostAccountingMethod", { sample: "Moving Average", enum: VALUATION, note: "Kosong = ikut item group." }),
      F("Set G/L Accounts By", "GLMethod", { sample: "Item Group", enum: { "Item Group": "glm_ItemClass", Warehouse: "glm_WH", "Item Level": "glm_ItemLevel" },
        note: "Sumber akun G/L item. Kosong = Item Group." }),
      F("Asset Class", "AssetClass", { ref: "assetclasses", noSample: 1, note: "Wajib untuk Tipe Item = Fixed Assets. Prefix T- = CV-TRADING, K- = CV-KOMERSIAL." })] }] },

  { no: "07", title: "Unit of Measure", entity: "UnitOfMeasurements", sheets: [{ name: "UoM", udf: "OUOM", fields: [
      F("Kode UoM", "Code", { req: 1, sample: "KG", note: "Kode satuan, maks 20 karakter." }),
      F("Nama UoM", "Name", { req: 1, sample: "KILOGRAM", note: "Nama satuan." })] }] },

  { no: "08", title: "UoM Group", entity: "UnitOfMeasurementGroups", note: "Satu baris di sheet Detail = satu konversi. Baris base (1 PCS = 1 PCS) tidak perlu ditulis.",
    sheets: [{ name: "Header", fields: [
      F("Kode UoM Group", "Code", { req: 1, sample: "BOX12", note: "Kode grup satuan." }),
      F("Nama UoM Group", "Name", { req: 1, sample: "BOX ISI 12", note: "Nama grup satuan." }),
      F("Base UoM", "BaseUoM", { req: 1, sample: "PCS", note: "Satuan dasar (kode UoM, harus sudah ada di template 07)." })] },
    { name: "Detail", fields: [
      F("Kode UoM Group", "Code", { req: 1, sample: "BOX12", parent: 1, note: "Sama dengan Kode UoM Group di sheet Header." }),
      F("Satuan Alternatif", "AlternateUoM", { req: 1, sample: "BOX", note: "Kode UoM alternatif." }),
      F("Qty Alternatif", "AlternateQuantity", { req: 1, sample: 1, kind: "num", note: "Contoh: 1 BOX ..." }),
      F("Qty Base", "BaseQuantity", { req: 1, sample: 12, kind: "num", note: "... = 12 PCS." })] }] },

  { no: "09", title: "Warehouse", entity: "Warehouses", note: "Kolom setelah 'Bin Location' adalah UDF warehouse (mengikuti SAP). Akun persediaan tidak diisi di sini karena Set G/L by Item Group.",
    sheets: [{ name: "Warehouse", udf: "OWHS", fields: [
      F("Kode Warehouse", "WarehouseCode", { req: 1, sample: "T-GDG01", note: "Kode gudang, maks 8 karakter." }),
      F("Nama Warehouse", "WarehouseName", { req: 1, sample: "GUDANG UTAMA", note: "Nama gudang." }),
      F("Branch", "BusinessPlaceID", { req: 1, ref: "branches", note: "Setiap warehouse terikat ke satu branch." }),
      F("Alamat", "Street", { note: "Jalan / alamat gudang." }),
      F("Kota", "City", { note: "Kota." }),
      F("Bin Location", "EnableBinLocations", { sample: "N", enum: YN, note: "Y = gudang memakai bin location." })] }] },

  { no: "10", title: "BP Group", entity: "BusinessPartnerGroups", sheets: [{ name: "BP Group", fields: [
      F("Nama Group", "Name", { req: 1, sample: "C - EKSTERNAL", note: "Nama grup BP." }),
      F("Tipe", "Type", { req: 1, sample: "Customer", enum: { Customer: "bbpgt_CustomerGroup", Vendor: "bbpgt_VendorGroup" }, note: "Customer atau Vendor." })] }] },

  { no: "11", title: "Business Partner", entity: "BusinessPartners",
    note: "BP bisa punya banyak alamat dan branch: satu baris per alamat / branch. Kolom setelah 'Credit Limit' adalah UDF BP.",
    sheets: [{ name: "BP", udf: "OCRD", fields: [
      F("Kode BP", "CardCode", { req: 1, sample: "C000001", note: "Kode customer / vendor, maks 15 karakter." }),
      F("Nama BP", "CardName", { req: 1, sample: "PT CONTOH JAYA", note: "Nama customer / vendor." }),
      F("Nama Asing", "CardForeignName", { note: "Nama alternatif (opsional)." }),
      F("Tipe BP", "CardType", { req: 1, sample: "Customer", enum: { Customer: "cCustomer", Vendor: "cSupplier", Lead: "cLid" }, note: "Customer, Vendor, atau Lead." }),
      F("BP Group", "GroupCode", { req: 1, ref: "bpgroups", note: "Harus sesuai tipe: group C - untuk Customer, V - untuk Vendor." }),
      F("Mata Uang", "Currency", { sample: "IDR", ref: "currency_all", note: "IDR, atau ## = semua mata uang." }),
      F("NPWP", "FederalTaxID", { note: "NPWP / NIK untuk faktur pajak." }),
      F("Payment Terms", "PayTermsGrpCode", { ref: "payterms", note: "Syarat pembayaran default." }),
      F("Price List", "PriceListNum", { ref: "pricelists", noSample: 1, note: "Price list default." }),
      F("Sales Employee", "SalesPersonCode", { ref: "slp", noSample: 1, note: "Sales / buyer default." }),
      F("Telepon", "Phone1", { note: "Nomor telepon." }),
      F("Email", "EmailAddress", { note: "Email." }),
      F("Credit Limit", "CreditLimit", { sample: 0, kind: "num", note: "Batas kredit." })] },
    { name: "Alamat", fields: [
      F("Kode BP", "CardCode", { req: 1, sample: "C000001", parent: 1, note: "Sama dengan Kode BP di sheet BP." }),
      F("Tipe Alamat", "AddressType", { req: 1, sample: "Bill To", enum: { "Bill To": "bo_BillTo", "Ship To": "bo_ShipTo" }, note: "Bill To = alamat tagihan, Ship To = alamat kirim." }),
      F("Nama Alamat", "AddressName", { req: 1, sample: "KANTOR", note: "ID alamat, unik per BP & tipe alamat." }),
      F("Jalan", "Street", { sample: "JL. CONTOH NO. 1", note: "Alamat jalan." }),
      F("Kota", "City", { sample: "KEDIRI", note: "Kota." }),
      F("Kode Pos", "ZipCode", { note: "Kode pos." }),
      F("Negara", "Country", { sample: "ID - Indonesia", ref: "country", note: "Negara." })] },
    { name: "Branch", fields: [
      F("Kode BP", "CardCode", { req: 1, sample: "C000001", parent: 1, note: "Sama dengan Kode BP di sheet BP." }),
      F("Branch", "BPLID", { req: 1, ref: "branches", note: "Satu baris per branch yang boleh memakai BP ini." })] }] },

  { no: "12", title: "Chart of Accounts", entity: "ChartOfAccounts", note: "Kolom setelah 'Control Account' adalah UDF akun (mengikuti SAP).",
    sheets: [{ name: "COA", udf: "OACT", fields: [
      F("Kode Akun", "Code", { req: 1, sample: "101010199", note: "Kode akun, harus unik." }),
      F("Nama Akun", "Name", { req: 1, sample: "KAS KECIL CABANG", note: "Nama akun." }),
      F("Akun Induk", "FatherAccountKey", { req: 1, ref: "titles", note: "Akun judul (title) tempat akun ini berada." }),
      F("Akun Posting", "ActiveAccount", { req: 1, sample: "Y", enum: YN, note: "Y = akun posting (bisa dijurnal), N = akun judul." }),
      F("Tipe Akun", "AccountType", { sample: "Other", enum: { Revenues: "at_Revenues", Expenses: "at_Expenses", Other: "at_Other" }, note: "Revenues / Expenses / Other. Kosong = Other." }),
      F("Mata Uang", "AcctCurrency", { sample: "IDR", ref: "currency_all", note: "IDR, atau ## = semua mata uang." }),
      F("Akun Kas", "CashAccount", { sample: "N", enum: YN, note: "Y = akun kas (masuk laporan cash flow)." }),
      F("Control Account", "LockManualTransaction", { sample: "N", enum: YN, note: "Y = control account (tidak bisa dijurnal manual)." })] }] },

  { no: "13", title: "Tax Group", entity: "VatGroups", sheets: [{ name: "Tax Group", fields: [
      F("Kode Tax", "Code", { req: 1, sample: "PPN-12", note: "Kode tax group, maks 8 karakter." }),
      F("Nama Tax", "Name", { req: 1, sample: "PPN Keluaran 12% General", note: "Nama tax group." }),
      F("Kategori", "Category", { req: 1, sample: "Output", enum: { Input: "bovcInputTax", Output: "bovcOutputTax" }, note: "Input = pajak masukan (beli), Output = pajak keluaran (jual)." }),
      F("Rate %", "Rate", { req: 1, sample: 12, kind: "num", note: "Tarif pajak dalam persen." }),
      F("Berlaku Dari", "Effectivefrom", { req: 1, sample: "2025-01-01", kind: "date", note: "Tanggal mulai tarif berlaku." }),
      F("Akun Pajak", "TaxAccount", { req: 1, ref: "accounts", note: ACCT })] }] },

  { no: "14", title: "FA Account Determination", entity: "FAAccountDeterminations", note: "Untuk aset tanpa penyusutan (mis. tanah), akun depreciation boleh dikosongkan.",
    sheets: [{ name: "Account Determination", fields: [
      F("Kode", "Code", { req: 1, sample: "INV-MESIN", note: "Kode account determination, maks 15 karakter." }),
      F("Deskripsi", "Description", { req: 1, sample: "INVENTARIS MESIN", note: "Deskripsi." }),
      ...[["Asset Balance Sheet", "AssetBalanceSheetAccount", 1], ["Clearing Acquisition", "ClearingAccountAcquisition", 1],
        ["Ordinary Depreciation", "OrdinaryDepreciation"], ["Accumulated Ordinary Depr.", "AccumulatedOrdinaryDepr"],
        ["Unplanned Depreciation", "UnplannedDepreciation"], ["Accumulated Unplanned Depr.", "AccumulatedUnplannedDepr"],
        ["Special Depreciation", "SpecialDepreciation"], ["Accumulated Special Depr.", "AccumulatedSpecialDepr"],
        ["Revaluation Reserve", "RevaluationReserveAccount"], ["Revaluation Reserve Clearing", "RevaluationReserveClearing"],
        ["Revaluation Account", "RevaluationAccount"], ["Revenue from Asset Sales (Net)", "RevenuefromAssetSalesNet"],
        ["Retirement with Expense (Net)", "RetirementwithExpenseNet"], ["Retirement with Revenue (Net)", "RetirementwithRevenueNet"],
        ["Leave with Expense NBV (Gross)", "LeavewithExpenseNBVGross"], ["Leave with Revenue NBV (Gross)", "LeavewithRevenueNBVGross"],
        ["Revenue Account for Retirement", "RevenueAccountforRetirement"], ["Revenue Clearing Account", "RevenueClearingAccount"]]
        .map(([l, f, req]) => F(l, f, { req, ref: "accounts", noSample: !req, note: ACCT }))] }] },

  { no: "15", title: "Asset Class", entity: "AssetClasses", sheets: [{ name: "Header", fields: [
      F("Kode Asset Class", "Code", { req: 1, sample: "T-INV-MESIN", note: "Kode class, maks 20 karakter. Prefix T- / K- sesuai branch." }),
      F("Deskripsi", "Description", { req: 1, sample: "INVENTARIS MESIN", note: "Deskripsi." }),
      F("Asset Type", "AssetType", { sample: "General", enum: { General: "atAssetTypeGeneral", "Low-Value Asset": "atAssetTypeLowValueAsset" }, note: "General atau Low-Value Asset. Kosong = General." }),
      F("Branch", "BPLID", { req: 1, ref: "branches", note: "Asset class wajib terikat ke satu branch." })] },
    { name: "Depreciation Area", fields: [
      F("Kode Asset Class", "Code", { req: 1, sample: "T-INV-MESIN", parent: 1, note: "Sama dengan Kode Asset Class di sheet Header." }),
      F("Depreciation Area", "DepreciationAreaID", { req: 1, sample: "Main Area", ref: "dprareas", note: "Satu baris per area (umumnya Main Area dan Derived Area)." }),
      F("Account Determination", "AccountDetermination", { ref: "fadet", note: "Wajib untuk Main Area, kosong untuk Derived Area." }),
      F("Depreciation Type", "DepreciationTypeID", { req: 1, sample: "Straight Line", ref: "dprtypes", note: "Metode penyusutan." }),
      F("Masa Manfaat (bulan)", "UseLife", { req: 1, sample: 48, kind: "num", note: "Umur ekonomis dalam bulan." }),
      F("Aktif", "ActiveStatus", { sample: "Y", enum: YN, note: "Y = area aktif." })] }] },

  { no: "16", title: "Sales Employee", entity: "SalesPersons", sheets: [{ name: "Sales Employee", fields: [
      F("Nama", "SalesEmployeeName", { req: 1, sample: "BUDI", note: "Nama sales / buyer, harus unik." }),
      F("Keterangan", "Remarks", { note: "Catatan." }),
      F("Komisi %", "CommissionForSalesEmployee", { sample: 0, kind: "num", note: "Persen komisi." }),
      F("Telepon", "Telephone", { note: "Telepon." }),
      F("HP", "Mobile", { note: "Nomor HP." }),
      F("Email", "Email", { note: "Email." }),
      F("Aktif", "Active", { sample: "Y", enum: YN, note: "Y = aktif." })] }] },

  { no: "17", title: "Bank", entity: "Banks", sheets: [{ name: "Bank", fields: [
      F("Kode Bank", "BankCode", { req: 1, sample: "BRI", note: "Kode bank, maks 30 karakter." }),
      F("Nama Bank", "BankName", { req: 1, sample: "Bank Rakyat Indonesia", note: "Nama bank." }),
      F("Negara", "CountryCode", { req: 1, sample: "ID - Indonesia", ref: "country", note: "Negara bank." }),
      F("SWIFT Code", "SwiftNo", { note: "Kode SWIFT / BIC." })] }] },

  { no: "18", title: "House Bank Account", entity: "HouseBankAccounts", sheets: [{ name: "House Bank", fields: [
      F("Bank", "BankCode", { req: 1, ref: "banks", note: "Bank (harus sudah ada di template 17)." }),
      F("Negara", "Country", { req: 1, sample: "ID - Indonesia", ref: "country", note: "Negara rekening." }),
      F("No. Rekening", "AccNo", { req: 1, sample: "1234567890", note: "Nomor rekening perusahaan." }),
      F("Cabang Bank", "Branch", { sample: "KEDIRI", note: "Cabang bank." }),
      F("Nama Rekening", "AccountName", { sample: "CV PUTRA PRIMA MANDIRI", note: "Nama pemilik rekening." }),
      F("Akun G/L", "GLAccount", { req: 1, ref: "accounts", note: "Akun bank di COA. " + ACCT }),
      F("SWIFT Code", "BICSwiftCode", { note: "Kode SWIFT / BIC." })] }] },

  { no: "19", title: "Shipping Type", entity: "ShippingTypes", sheets: [{ name: "Shipping Type", fields: [
      F("Nama", "Name", { req: 1, sample: "TRUK SENDIRI", note: "Nama jenis pengiriman." }),
      F("Website", "Website", { note: "Website ekspedisi (opsional)." })] }] },

  { no: "20", title: "Freight", entity: "AdditionalExpenses", sheets: [{ name: "Freight", fields: [
      F("Nama", "Name", { req: 1, sample: "ONGKOS KIRIM", note: "Nama biaya tambahan di dokumen." }),
      F("Akun Pendapatan", "RevenuesAccount", { req: 1, ref: "accounts", note: "Dipakai di dokumen penjualan. " + ACCT }),
      F("Akun Biaya", "ExpenseAccount", { req: 1, ref: "accounts", note: "Dipakai di dokumen pembelian. " + ACCT }),
      F("Tax Group Jual", "OutputVATGroup", { ref: "vat_out", noSample: 1, note: "Pajak keluaran." }),
      F("Tax Group Beli", "InputVATGroup", { ref: "vat_in", noSample: 1, note: "Pajak masukan." }),
      F("Metode Distribusi", "DistributionMethod", { sample: "None", note: "Cara membagi freight ke baris dokumen.",
        enum: { None: "aed_None", Quantity: "aed_Quantity", Volume: "aed_Volume", Weight: "aed_Weight", Equally: "aed_Equally", "Row Total": "aed_LineTotal" } })] }] },

  { no: "21", title: "Landed Cost", entity: "LandedCostsCodes", sheets: [{ name: "Landed Cost", fields: [
      F("Kode", "Code", { req: 1, sample: "BM", note: "Kode landed cost, maks 20 karakter." }),
      F("Nama", "Name", { req: 1, sample: "BEA MASUK", note: "Nama." }),
      F("Alokasi Berdasarkan", "AllocationBy", { sample: "Cash Value Before Customs", note: "Dasar alokasi biaya ke item.",
        enum: { "Cash Value Before Customs": "ab_CashValueBeforeCustoms", "Cash Value After Customs": "ab_CashValueAfterCustoms",
          Quantity: "ab_Quantity", Weight: "ab_Weight", Volume: "ab_Volume", Equal: "ab_Equal" } }),
      F("Akun Alokasi", "LandedCostsAllocationAccount", { req: 1, ref: "accounts", note: ACCT })] }] },

  { no: "22", title: "UDF Valid Values", entity: "UserFieldsMD", note: "Satu baris = satu valid value baru. Nilai yang sudah ada tidak perlu ditulis (upload hanya menambah).",
    sheets: [{ name: "Valid Values", fields: [
      F("UDF (Tabel.Field)", "TableName.Name", { req: 1, ref: "udf_fields", note: "UDF yang ditambah valid value-nya. Pilih dari daftar UDF master data." }),
      F("Kode", "Value", { req: 1, sample: "PAKAN JADI INTERNAL BEBEK COMMERCIAL", note: "Nilai yang tersimpan di UDF." }),
      F("Deskripsi", "Description", { req: 1, sample: "PAKAN JADI INTERNAL BEBEK COMMERCIAL", note: "Label yang tampil di dropdown SAP." })] }] },

  // Field dicocokkan ke $metadata SL entity Users (2026-10-18). Sheet Branch / Authorization Group / Authorization = koleksi
  // UserBranchAssignment, UserGroupByUser, UserPermission di dalam user yang sama.
  { no: "23", title: "User & Authorization", entity: "Users",
    note: "Satu user per baris di sheet User. Branch, authorization group, dan izin per menu bisa lebih dari satu: satu baris per item. "
      + "File ini berisi password awal, jangan disebar; minta user mengganti password saat login pertama.",
    sheets: [{ name: "User", fields: [
      F("Kode User", "UserCode", { req: 1, sample: "BUDI", note: "Kode untuk login SAP, maks 25 karakter. Tidak bisa diubah setelah dibuat." }),
      F("Nama User", "UserName", { req: 1, sample: "BUDI SANTOSO", note: "Nama lengkap user." }),
      F("Password Awal", "UserPassword", { req: 1, sample: "Ganti123!", note: "Password awal, ikuti aturan password SAP (panjang & karakter). User sebaiknya menggantinya saat login pertama." }),
      F("Superuser", "Superuser", { sample: "N", enum: YN, note: "Y = akses penuh ke semua menu, authorization per menu diabaikan. Untuk go-live sebaiknya N kecuali admin." }),
      F("Email", "eMail", { note: "Email user (opsional)." }),
      F("HP", "MobilePhoneNumber", { note: "Nomor HP (opsional)." }),
      F("Dikunci", "Locked", { sample: "N", enum: YN, note: "Y = user tidak bisa login." })] },
    { name: "Branch", fields: [
      F("Kode User", "UserCode", { req: 1, sample: "BUDI", parent: 1, note: "Sama dengan Kode User di sheet User." }),
      F("Branch", "BPLID", { req: 1, ref: "branches", note: "Koleksi UserBranchAssignment. Satu baris per branch yang boleh diakses user; tanpa branch user tidak bisa membuat dokumen." })] },
    { name: "Authorization Group", fields: [
      F("Kode User", "UserCode", { req: 1, sample: "BUDI", parent: 1, note: "Sama dengan Kode User di sheet User." }),
      F("Authorization Group", "GroupId", { req: 1, ref: "authgroups", note: "Koleksi UserGroupByUser. Grup otorisasi dari Administration › Authorizations › Authorization Groups; satu baris per grup." })] },
    { name: "Authorization", fields: [
      F("Kode User", "UserCode", { req: 1, sample: "BUDI", parent: 1, note: "Sama dengan Kode User di sheet User." }),
      F("ID Izin", "PermissionID", { req: 1, noSample: 1, note: "Koleksi UserPermission. ID izin per menu / dokumen dari General Authorizations. Opsional: isi hanya untuk izin yang tidak cukup diatur lewat authorization group." }),
      F("Izin", "Permission", { req: 1, sample: "Read Only", enum: { Full: "boper_Full", "Read Only": "boper_ReadOnly", "No Authorization": "boper_None" },
        note: "Full, Read Only, atau No Authorization." })] }] },
  // Field dicocokkan ke aksi SeriesService_AddSeries / UpdateSeries (entity Series). Nama kolom sama dengan query langkah
  // setup "Document Numbering" (setup/sql/document-numbering.sql), jadi template dan cara "copy dari database" saling cocok.
  { no: "24", title: "Document Numbering", entity: "SeriesService",
    note: "Satu baris = satu series. Document diisi kode objek SAP: 13 A/R Invoice, 14 A/R Credit Memo, 15 Delivery, 16 Returns, 17 Sales Order, "
      + "18 A/P Invoice, 19 A/P Credit Memo, 20 Goods Receipt PO, 21 Goods Return, 22 Purchase Order, 23 Sales Quotation, 24 Incoming Payment, "
      + "30 Journal Entry, 46 Outgoing Payment, 59 Goods Receipt, 60 Goods Issue, 67 Inventory Transfer, 1250000001 Inventory Transfer Request, "
      + "1470000113 Purchase Request, 202 Production Order. Series addon (UDO) memakai kode UDO, mis. STEM_MPLAN atau STEM_MSTATISTIC.",
    sheets: [{ name: "Document Numbering", fields: [
      F("Document (kode objek)", "Document", { req: 1, sample: "13", note: "Kode objek dokumen, lihat daftar di atas. Untuk UDO addon isi kode UDO-nya." }),
      F("Sub Type", "DocumentSubType", { sample: "--", note: "Biasanya -- (tanpa sub tipe). Nilai lain mengikuti kolom DocSubType di tabel NNM1, mis. DN untuk Down Payment. Kosong = --." }),
      F("Nama Series", "Name", { req: 1, sample: "KOM-IN26", note: "Nama series, maks 8 karakter. Pola yang dipakai: kode branch + dokumen + tahun." }),
      F("Period Indicator", "PeriodIndicator", { req: 1, ref: "indicators", note: "Indicator periode (biasanya tahun). Harus sama dengan Indicator di Posting Period." }),
      F("Branch", "BPLID", { ref: "branches", note: "Branch pemilik series. Kosong = berlaku untuk semua branch. Pada DB berbranch, addon hanya memakai series yang BPLId-nya cocok." }),
      F("Prefix", "Prefix", { note: "Teks di depan nomor, mis. INV/. Opsional." }),
      F("Suffix", "Suffix", { note: "Teks di belakang nomor. Opsional." }),
      F("Nomor Awal", "InitialNumber", { req: 1, sample: 1, kind: "num", note: "Nomor pertama series. Wajib berbeda antar series pada dokumen yang sama." }),
      F("Nomor Terakhir", "LastNumber", { sample: 999999, kind: "num", note: "Batas atas nomor. Kosong = tanpa batas." }),
      F("Manual", "IsManual", { sample: "N", enum: YN, note: "Y = nomor diketik manual, bukan otomatis. Kosong = N." }),
      F("Dikunci", "Locked", { sample: "N", enum: YN, note: "Y = series tidak bisa dipakai membuat dokumen baru. Kosong = N." }),
      F("Catatan (Remark)", "Remarks", { note: "Remark series. Addon Farm Breeding membaca 2 huruf awal Remark untuk series IT (TO atau TI), jadi isi sesuai konvensi: TO-Transfer OUT, TI-Transfer IN." })] }] },

  // Aset tetap: Items (ItemType Fixed Assets) + satu baris parameter penyusutan per aset (koleksi ItemDepreciationParameters),
  // dibuat dari kolom berawalan "_" di sheet yang sama. Nama field koleksi belum dicocokkan ke $metadata SL: uji satu baris dulu.
  { no: "25", title: "Fixed Asset Master Data", entity: "Items",
    note: "Satu baris = satu aset. Kolom berawalan _ (area, tanggal mulai, umur, tipe penyusutan) dikirim sebagai baris parameter penyusutan aset. "
      + "Parameter penyusutan hanya dikirim untuk aset BARU; aset yang sudah ada tidak diubah. Nilai perolehan TIDAK masuk di sini: lanjut ke template 26 (Asset Capitalization).",
    sheets: [{ name: "Asset", fields: [
      F("Kode Aset", "ItemCode", { req: 1, sample: "F0223060917001", note: "Nomor aset, format FXX_TH_PT_DIVISI_LOKASI_URUT. Harus unik, tanpa spasi." }),
      F("Nama Aset", "ItemName", { req: 1, sample: "BANGUNAN NGINO LAMA", note: "Deskripsi aset." }),
      F("Item Group", "ItemsGroupCode", { req: 1, ref: "itemgroups", note: "Item group untuk aset tetap (nama group di SAP)." }),
      F("Asset Class", "AssetClass", { req: 1, ref: "assetclasses", note: "Kode asset class (harus sudah ada, lihat Setup Asset Class)." }),
      F("Tipe Item", "ItemType", { req: 1, sample: "Fixed Assets", enum: { "Fixed Assets": "itFixedAssets" }, note: "Selalu Fixed Assets." }),
      F("Inventory Item", "InventoryItem", { sample: "N", enum: YN, note: "Aset bukan barang stok: N." }),
      F("Sales Item", "SalesItem", { sample: "N", enum: YN, note: "N." }),
      F("Purchasing Item", "PurchaseItem", { sample: "N", enum: YN, note: "N." }),
      F("Serial Number Aset", "AssetSerialNumber", { note: "Nomor seri / MAC / plat. Boleh kosong." }),
      F("Location", "Location", { ref: "locations", note: "Lokasi aset (Administration > Setup > General > Locations). Pilih dari daftar (kode - nama)." }),
      F("Area Penyusutan", "_DepreciationArea", { req: 1, sample: "Main Area", ref: "dprareas", note: "Depreciation area, umumnya Main Area." }),
      F("Mulai Penyusutan", "_DepreciationStartDate", { req: 1, sample: "2023-01-01", kind: "date", note: "Tanggal mulai penyusutan (YYYY-MM-DD)." }),
      F("Masa Manfaat (bulan)", "_UsefulLife", { req: 1, sample: 96, kind: "num", note: "Umur ekonomis dalam bulan." }),
      F("Tipe Penyusutan", "_DepreciationType", { req: 1, sample: "Straight Line", ref: "dprtypes", note: "Metode penyusutan." }),
      F("Tahun Fiskal Parameter", "_FiscalYear", { kind: "num", noSample: 1, note: "Kosong = tidak dikirim. Template DTW teman memakai tahun fiskal 2026 untuk semua aset; untuk aset lama kemungkinan harus tahun mulai penyusutan. Uji di DB QA." }),
      F("Cost Center Berlaku Dari", "_ValidFrom", { kind: "date", noSample: 1, note: "Opsional. Kosong = sama dengan Mulai Penyusutan. Hanya dipakai kalau salah satu kolom Dimension di kanan diisi." }),
      F("Cost Center Berlaku Sampai", "_ValidTo", { kind: "date", noSample: 1, note: "Opsional. Kosong = 2099-12-31." }),
      F("Dimension 1", "_DistributionRule", { ref: "ocr1", noSample: 1, note: "Opsional: kode distribution rule dimension 1 (cost center). Pilih dari daftar SAP." }),
      F("Dimension 2", "_DistributionRule2", { ref: "ocr2", noSample: 1, note: "Opsional: dimension 2." }),
      F("Dimension 3", "_DistributionRule3", { ref: "ocr3", noSample: 1, note: "Opsional: dimension 3." }),
      F("Dimension 4", "_DistributionRule4", { ref: "ocr4", noSample: 1, note: "Opsional: dimension 4 (di PAS = lokasi)." }),
      F("Dimension 5", "_DistributionRule5", { ref: "ocr5", noSample: 1, note: "Opsional: dimension 5." })] }] },

  // Capitalization = nilai perolehan (APC) aset. Satu baris = satu dokumen berisi satu aset, supaya bisa dicocokkan dan diulang per aset.
  { no: "26", title: "Asset Capitalization", entity: "AssetCapitalization",
    note: "Satu baris = satu dokumen Capitalization dengan satu aset. Kolom Remarks dipakai untuk mencocokkan dokumen yang sudah ada, jadi isi unik per aset "
      + "(mis. Opening Balance - <kode aset>). Opsi A: tanggal = tanggal perolehan asli (periode lama harus terbuka). Opsi B: semua baris memakai tanggal cutoff. "
      + "Aset harus sudah dibuat lewat template 25. Cek juga SP Notif PAS: di URECEL ada aturan yang memblok Capitalization di bawah Rp 5.000.000.",
    sheets: [{ name: "Capitalization", fields: [
      F("Series", "Series", { kind: "num", noSample: 1, note: "Kode series nomor dokumen (Administration > Setup > Document Numbering, objek 1470000049). PAS: FACP26 = 624 untuk dokumen 2026. Kosong = series default SAP." }),
      F("Posting Date", "PostingDate", { req: 1, sample: "2026-09-30", kind: "date", note: "Tanggal posting. Periode harus terbuka." }),
      F("Document Date", "DocumentDate", { req: 1, sample: "2026-09-30", kind: "date", note: "Biasanya sama dengan Posting Date." }),
      F("Asset Value Date", "AssetValueDate", { req: 1, sample: "2026-09-30", kind: "date", note: "Tanggal nilai aset; menentukan mulai penyusutan di dokumen." }),
      F("Remarks", "Remarks", { req: 1, sample: "Opening Balance - F0223060917001", note: "Unik per aset. Dipakai sebagai pembanding dokumen yang sudah ada." }),
      F("Kode Aset", "_AssetNumber", { req: 1, sample: "F0223060917001", note: "Kode aset (Item Code) yang sudah dibuat di template 25." }),
      F("Quantity", "_Quantity", { req: 1, sample: 1, kind: "num", note: "Jumlah unit aset (umumnya 1)." }),
      F("Nilai Perolehan (APC)", "_TotalLC", { req: 1, sample: 237376190, kind: "num", note: "Total nilai perolehan dokumen ini dalam mata uang lokal (bukan per unit)." })] }] },

  // Manual Depreciation = akumulasi penyusutan aset lama (saldo awal). Satu baris = satu dokumen berisi satu aset, seperti Capitalization.
  { no: "27", title: "Asset Manual Depreciation", entity: "AssetManualDepreciation",
    note: "Satu baris = satu dokumen Penyusutan Manual dengan satu aset. Kolom Remarks dipakai untuk mencocokkan dokumen yang sudah ada, jadi isi unik per aset "
      + "(mis. Penyusutan Manual - <kode aset>). Aset harus sudah dibuat (template 25) dan sudah di-Capitalization (template 26), dan posting period harus terbuka. "
      + "SAP menolak bila nilai buku akhir tahun di bawah nol (NBV of asset ... cannot fall below zero), termasuk penyusutan terencana tahun berjalan: jumlah tidak boleh melebihi sisa nilai buku. "
      + "Dokumen ini mencatat beban penyusutan, jadi finance perlu jurnal koreksi ke akun saldo awal. Isi dokumen belum pernah diposting dari web: uji satu baris dulu.",
    sheets: [{ name: "Manual Depreciation", fields: [
      F("Series", "Series", { kind: "num", noSample: 1, note: "Kode series nomor dokumen (mis. FADP26). Kosong = series default SAP." }),
      F("Posting Date", "PostingDate", { req: 1, sample: "2026-10-01", kind: "date", note: "Tanggal posting. Periode harus terbuka." }),
      F("Document Date", "DocumentDate", { req: 1, sample: "2026-10-01", kind: "date", note: "Biasanya sama dengan Posting Date." }),
      F("Asset Value Date", "AssetValueDate", { req: 1, sample: "2026-10-01", kind: "date", note: "Tanggal nilai aset." }),
      F("Depreciation Area", "DepreciationArea", { req: 1, sample: "Main Area", note: "Area penyusutan, mis. Main Area." }),
      F("Remarks", "Remarks", { req: 1, sample: "Penyusutan Manual - F0223060917001", note: "Unik per aset. Dipakai sebagai pembanding dokumen yang sudah ada." }),
      F("Kode Aset", "_AssetNumber", { req: 1, sample: "F0223060917001", note: "Kode aset (Item Code) yang sudah di-Capitalization." }),
      F("Jumlah Penyusutan", "_TotalLC", { req: 1, sample: 12352536, kind: "num", note: "Akumulasi penyusutan dokumen ini dalam mata uang lokal. Tidak boleh membuat nilai buku di bawah nol." })] }] },

  // Mapping series Rework -> series GI/GR. Semua kolom berisi NOMOR series (NNM1.Series), bukan nama series, jadi diisi setelah Document Numbering selesai.
  { no: "28", title: "Series Rework Mapping", entity: "U_STEM_SERIESRWK",
    note: "Satu baris = satu series Post Rework (STEM_MPREWORK) dan pasangan series Goods Issue (objek 60) dan Goods Receipt (objek 59) untuk branch dan tahun yang sama. "
      + "Isi dengan NOMOR series (kolom Series di Document Numbering), bukan nama series. Addon STEM mencari baris ini lewat Series Post Rework yang dipilih user (PostRework.vb), "
      + "jadi tiap series Post Rework per branch per tahun butuh satu baris. Document Numbering harus sudah selesai sebelum template ini diisi.",
    sheets: [{ name: "Series Rework Mapping", fields: [
      F("Code", "Code", { req: 1, sample: "923", note: "Kode unik baris. Disarankan sama dengan nomor series Post Rework." }),
      F("Name", "Name", { req: 1, sample: "923", note: "Nama baris, boleh sama dengan Code." }),
      F("Series Post Rework", "U_SeriesRework", { req: 1, sample: "923", note: "Nomor series Post Rework (objek STEM_MPREWORK), mis. T-INRP26. Angka, bukan nama." }),
      F("Series Good Issue", "U_SeriesGI", { req: 1, sample: "3057", note: "Nomor series Goods Issue (objek 60) untuk branch dan tahun yang sama." }),
      F("Series Good Receipt", "U_SeriesGR", { req: 1, sample: "3102", note: "Nomor series Goods Receipt (objek 59) untuk branch dan tahun yang sama." }),
      F("Deskripsi", "U_Description", { sample: "Rework Trading 2026", note: "Keterangan bebas, mis. branch dan tahun." })] }] },
];

// ---------- data dropdown dari SAP (api/section/template-ref) ----------
const vals = r => (r && r.rows || []).map(x => x[0]);
const rowsObj = r => (r && r.rows || []).map(x => Object.fromEntries(r.columns.map((c, i) => [c, x[i]])));
export function refLists(res) {
  const L = Object.fromEntries(Object.entries(res).map(([k, r]) => [k, vals(r)]));
  L.currency_all = ["## - Semua mata uang", ...L.currency];
  L.udf = rowsObj(res.udf);
  L.udfv = {};
  rowsObj(res.udfv).forEach(v => (L.udfv[`${v.TableID}|${v.FieldID}`] ||= []).push([v.FldValue, v.Descr]));
  L.udf_fields = L.udf.map(u => `${u.TableID}.U_${u.AliasID}`);
  return L;
}

// ---------- susun workbook ----------
const colName = i => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const ROWS = 1000;   // baris yang diberi dropdown

export function buildTemplate(t, L, prefix) {
  const refCols = [], refIndex = {}, slMap = [], udfBlocks = [], notes = [];
  const refRange = (key, values) => {
    if (!(key in refIndex)) { refIndex[key] = refCols.length; refCols.push([key, ...(values.length ? values : [""])]); }
    const c = colName(refIndex[key]);
    return `'Referensi'!$${c}$2:$${c}$${Math.max(values.length, 1) + 1}`;
  };
  const sheets = t.sheets.map(sh => {
    const fields = [...sh.fields];
    if (sh.udf) L.udf.filter(u => u.TableID === sh.udf).forEach(u => {
      const vv = L.udfv[`${u.TableID}|${u.FieldID}`] || [];
      fields.push(F(u.Descr, "U_" + u.AliasID, { req: u.NotNull === "Y", kind: { N: "num", B: "num", D: "date" }[u.TypeID],
        udfValues: vv.map(([v]) => v), note: `UDF ${UDF_TYPES[u.TypeID] || "teks"}, maks ${u.EditSize} karakter.` + (vv.length ? " Pilih dari valid values (lihat sheet UDF)." : "") }));
      if (vv.length) udfBlocks.push({ field: "U_" + u.AliasID, values: vv });
    });
    const sample = f => {
      const list = f.ref ? L[f.ref] || [] : null;
      const v = f.sample !== undefined ? f.sample : list && !f.noSample && list.length ? list[f.last ? list.length - 1 : 0] : "";
      if (v === "" || v === undefined) return { v: "", s: f.kind === "date" ? S.SAMPLE_DATE : f.kind === "num" ? S.SAMPLE : S.SAMPLE_TEXT };
      if (f.kind === "date") return { v: excelDate(v), s: S.SAMPLE_DATE };
      return { v, s: f.kind === "num" ? S.SAMPLE : S.SAMPLE_TEXT };
    };
    const validations = [];
    fields.forEach((f, i) => {
      const choices = f.enum ? Object.keys(f.enum) : f.ref ? L[f.ref] || [] : f.udfValues && f.udfValues.length ? f.udfValues : null;
      if (!choices) return;
      const key = f.enum ? `pilihan: ${f.field}` : f.ref || `udf: ${f.field}`;
      validations.push({ sqref: `${colName(i)}3:${colName(i)}${ROWS + 2}`, formula: refRange(key, choices) });
      if (f.enum && f.enum !== YN) Object.entries(f.enum).forEach(([k, v]) => slMap.push([sh.name, f.field, k, v]));
    });
    fields.forEach(f => notes.push([sh.name, f.label, f.field, f.req ? "Ya" : "", f.note || ""]));
    return { name: sh.name, template: true, freeze: { row: 2, col: 1 },
      cols: fields.map(f => ({ style: f.kind === "date" ? S.DATE : f.kind === "num" ? 0 : S.TEXT })),
      rows: [fields.map(f => ({ v: f.label + (f.req ? " *" : ""), s: S.LABEL })), fields.map(f => ({ v: f.field, s: S.FIELD })), fields.map(sample)],
      validations };
  });
  // sheet Keterangan (legend) dipisah dari data supaya baris data user tidak bertabrakan dengan teks keterangan
  const ket = [["Sheet", "Kolom", "Field SL", "Wajib", "Cara isi"].map(v => ({ v, s: S.LABEL })),
    ...notes.map(r => r.map((v, i) => ({ v, s: i === 2 ? S.SAMPLE_TEXT : S.SAMPLE }))), [],
    [{ v: `Template ${t.title} untuk upload via Service Layer (${t.entity}). Dibuat ${new Date().toISOString().slice(0, 10)} dari data SAP saat itu.`, s: S.NOTE }],
    [{ v: "Baris 1 = label (tanda * = wajib), baris 2 = nama field Service Layer (jangan diubah), isi data mulai baris 3. Hapus baris contoh sebelum upload.", s: S.NOTE }],
    [{ v: "Kolom berdropdown: pilih dari daftar. Isi dropdown diambil dari SAP saat template di-download; download ulang kalau ada data baru di SAP.", s: S.NOTE }],
    ...(t.note ? [[{ v: `Catatan: ${t.note}`, s: S.NOTE }]] : [])];
  const out = [...sheets, { name: "Keterangan", template: true, freeze: { row: 1, col: 0 }, rows: ket,
    cols: [{ width: 18 }, { width: 30 }, { width: 30 }, { width: 8 }, { width: 90 }] }];
  if (udfBlocks.length) {
    // layout sheet UDF mengikuti template STEM: per UDF satu blok FldValue / Descr, dipisah satu kolom kosong
    const rows = [[], [], []], cols = [{ width: 4 }];
    udfBlocks.forEach((b, k) => {
      const c = 1 + k * 3;
      rows[1][c] = { v: b.field, s: S.LABEL }; rows[2][c] = { v: "FldValue", s: S.FIELD }; rows[2][c + 1] = { v: "Descr", s: S.FIELD };
      b.values.forEach(([v, d], i) => { (rows[3 + i] ||= [])[c] = { v, s: S.SAMPLE_TEXT }; rows[3 + i][c + 1] = { v: d, s: S.SAMPLE_TEXT }; });
      cols[c] = { width: 24 }; cols[c + 1] = { width: 40 }; cols[c + 2] = { width: 3 };
    });
    out.push({ name: "UDF", template: true, rows: rows.map(r => Array.from({ length: r.length }, (_, i) => r[i] ?? "")), cols });
  }
  if (refCols.length) {
    const n = Math.max(...refCols.map(c => c.length));
    out.push({ name: "Referensi", template: true, hidden: true, cols: refCols.map(() => ({ width: 34, style: S.TEXT })),
      rows: Array.from({ length: n }, (_, r) => refCols.map(c => r === 0 ? { v: c[0], s: S.BOLD } : c[r] ?? "")) });
  }
  if (slMap.length) out.push({ name: "_SL", template: true, hidden: true,
    rows: [["Sheet", "Field", "Pilihan di template", "Nilai enum SL"].map(v => ({ v, s: S.BOLD })), ...slMap] });
  return { blob: xlsxBlob(out), filename: `${prefix} - ${t.no} - ${t.title}.xlsx` };
}

export const downloadTemplate = (t, L, prefix) => { const { blob, filename } = buildTemplate(t, L, prefix); download(blob, filename); };
