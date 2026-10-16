-- Dropdown template upload: UDF tabel master (kolom UDF template mengikuti CUFD project ini)
SELECT F."TableID", F."FieldID", F."AliasID", F."Descr", F."TypeID", F."EditSize", F."NotNull"
FROM CUFD F
WHERE F."TableID" IN ('OITM', 'OCRD', 'OWHS', 'OACT', 'OUOM', 'OITB', 'OCRG', 'OPLN', 'OPRC', 'OSLP', 'ODSC', 'OCRN', 'OVTG', 'OCTG')
ORDER BY F."TableID", F."FieldID"
