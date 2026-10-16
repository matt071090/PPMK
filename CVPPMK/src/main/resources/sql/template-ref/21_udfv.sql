-- Dropdown template upload: valid values UDF tabel master
SELECT V."TableID", V."FieldID", V."FldValue", V."Descr"
FROM UFD1 V
WHERE V."TableID" IN ('OITM', 'OCRD', 'OWHS', 'OACT', 'OUOM', 'OITB', 'OCRG', 'OPLN', 'OPRC', 'OSLP', 'ODSC', 'OCRN', 'OVTG', 'OCTG')
ORDER BY V."TableID", V."FieldID", V."IndexID"
