-- Setup D · Payment Methods (bandingkan saja; upload menyusul setelah field SL WizardPaymentMethods dicocokkan)
SELECT P."PayMethCod" AS "_key", P."PayMethCod" AS "Code", P."Descript" AS "Description", P."Type", P."BnkDflt" AS "DefaultBank",
       P."DflAccount" AS "DefaultAccount", P."GLAccount", P."Active"
FROM OPYM P
ORDER BY P."Type", P."PayMethCod"
