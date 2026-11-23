-- Setup F · Addon STEM · @STEM_SPECCRITERIA (Specification Criteria). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: STEM_SPECCRITERIA (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_IsActive"
FROM "@STEM_SPECCRITERIA"
ORDER BY "Code"
