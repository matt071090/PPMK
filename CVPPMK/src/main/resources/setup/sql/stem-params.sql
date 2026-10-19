-- Setup F · Parameter STEM Addon -> @ST_PARAM via entity U_ST_PARAM. Hanya key yang dibaca kode STEM Addon 1.04.
-- Code dan Name = U_Key (sama di sumber dan tujuan, jadi tidak bentrok); _key = Code asli, dipakai untuk update.
-- SAPPWDINT (password Service Layer) sengaja tidak dibawa: isi manual di tujuan.
SELECT "Code" AS "_key", "U_Key" AS "Code", "U_Key" AS "Name", "U_Key", "U_Value", "U_Desc"
FROM "@ST_PARAM"
WHERE "U_Key" IN ('INSERTPARAMAUTO', 'SLHOST', 'SAPUSERINT', 'ITBRACCI', 'ITBRACCR', 'ITBRANCHGITYPE', 'ITBRANCHGRTYPE', 'ITBRANCHTOLERANCE',
  'ITB_CR_NAME', 'FILTERITEMBYPROP', 'WHTRS', 'WHSCODEREJ', 'BINCODEREJ', 'SRIN', 'SROUT', 'STRWKACCI', 'STRWKACCR', 'OVERGRTOL', 'GRREFPO',
  'ITMGRPAFKHDP', 'RACKENABLED', 'VATOUTPATH', 'VATINPATH', 'VATINIMPORTPATH', 'XMLPATHVATOUT')
ORDER BY "U_Key"
