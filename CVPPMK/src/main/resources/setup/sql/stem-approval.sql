-- Setup G · Addon Farm Breeding · @STEM_APPROVAL (Approval). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: STEM_APPROVAL (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_ApprovalLvl", "U_Active", "U_Approver"
FROM "@STEM_APPROVAL"
ORDER BY "Code"
