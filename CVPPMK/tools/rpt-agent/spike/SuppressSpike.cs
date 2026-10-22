// Uji kecil Suppress (hanya membaca/menulis SALINAN .rpt, tidak butuh DB).
// Pakai: SuppressSpike.exe <salinan.rpt> <NamaObjek> "<rumus Crystal>"
// Contoh: SuppressSpike.exe C:\tmp\uji.rpt Text5 "IsNull({Command.Diskon}) Or {Command.Diskon}=0"
// Argumen ke-4 (opsional) = nama section, mis. DetailSection1: uji juga Suppress section (langkah F, hasil <salinan>_supsec.rpt).
// Hasil: <salinan>_sup.rpt + laporan A..E di layar. File asli tidak diubah.
using System;
using CE = CrystalDecisions.CrystalReports.Engine;
using CrystalDecisions.ReportAppServer.ReportDefModel;
using CrystalDecisions.ReportAppServer.DataDefModel;
using CrystalDecisions.ReportAppServer.Controllers;

static class P
{
    static ReportObject Find(CE.ReportDocument r, string name)
    {
        foreach (Area a in r.ReportClientDocument.ReportDefController.ReportDefinition.Areas)
            foreach (Section s in a.Sections)
                foreach (ReportObject o in s.ReportObjects)
                    if (string.Equals(o.Name, name, StringComparison.OrdinalIgnoreCase)) return o;
        return null;
    }

    static int Main(string[] a)
    {
        if (a.Length < 3) { Console.WriteLine("Pakai: SuppressSpike.exe <salinan.rpt> <NamaObjek> \"<rumus>\""); return 2; }
        string path = a[0], name = a[1], formula = a[2];
        string outp = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(path), System.IO.Path.GetFileNameWithoutExtension(path) + "_sup.rpt");
        try
        {
            var r = new CE.ReportDocument(); r.Load(path);
            var rdc = r.ReportClientDocument.ReportDefController;
            var o = Find(r, name);
            if (o == null) { Console.WriteLine("GAGAL: objek '" + name + "' tidak ditemukan."); return 1; }
            Console.WriteLine("A. objek ditemukan: " + o.Name + " (" + o.Kind + ")");

            // B. sembunyikan selalu
            var n = (ReportObject)o.Clone(true);
            n.Format.EnableSuppress = true;
            rdc.ReportObjectController.Modify(o, n);
            Console.WriteLine("B. EnableSuppress=true diterapkan lewat Clone+Modify: OK");

            // C. rumus kondisi + validasi sintaks
            o = Find(r, name); n = (ReportObject)o.Clone(true);
            var cf = new ConditionFormula { Text = formula, Syntax = CrFormulaSyntaxEnum.crFormulaSyntaxCrystal };
            n.Format.ConditionFormulas[CrObjectFormatConditionFormulaTypeEnum.crObjectFormatConditionFormulaTypeEnableSuppress] = cf;
            string err = "(tidak diperiksa)";
            try { err = ((ISCRReportDefController2)rdc).ConditionFormulaController.Check(cf); }
            catch (Exception e) { err = "Check tidak bisa dipanggil: " + e.Message; }
            Console.WriteLine("C. Check rumus valid -> [" + err + "]  (kosong = sintaks OK)");
            var bad = new ConditionFormula { Text = "{Command.TidakAda}=", Syntax = CrFormulaSyntaxEnum.crFormulaSyntaxCrystal };
            try { Console.WriteLine("   Check rumus SALAH -> [" + ((ISCRReportDefController2)rdc).ConditionFormulaController.Check(bad) + "]  (harus berisi pesan error)"); }
            catch (Exception e) { Console.WriteLine("   Check rumus salah: " + e.Message); }
            n.Format.EnableSuppress = false;   // kondisi diatur lewat rumus
            rdc.ReportObjectController.Modify(o, n);
            Console.WriteLine("   rumus diterapkan: OK");

            // D. simpan, muat ulang, baca kembali
            r.SaveAs(outp);
            var r2 = new CE.ReportDocument(); r2.Load(outp);
            var o2 = Find(r2, name);
            var back = o2.Format.ConditionFormulas[CrObjectFormatConditionFormulaTypeEnum.crObjectFormatConditionFormulaTypeEnableSuppress];
            Console.WriteLine("D. setelah simpan+muat ulang, rumus = [" + (back == null ? "(null)" : back.Text) + "]");
            Console.WriteLine("   sama dengan yang ditulis? " + (back != null && back.Text == formula));
            Console.WriteLine("E. Hasil: " + outp);
            Console.WriteLine("   Buka di Crystal Designer: klik kanan objek > Format > Common > tombol x+2 di samping Suppress harus berwarna (ada rumus).");
            if (a.Length > 3)
            {
                // F. section (argumen ke-4 = nama section, mis. DetailSection1): EnableSuppressIfBlank + rumus Suppress lewat SetProperty(Format)
                string secName = a[3], outp2 = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(path), System.IO.Path.GetFileNameWithoutExtension(path) + "_supsec.rpt");
                var rdc3 = r.ReportClientDocument.ReportDefController;
                Section s0 = null;
                foreach (Area ar in rdc3.ReportDefinition.Areas) foreach (Section s in ar.Sections) if (string.Equals(s.Name, secName, StringComparison.OrdinalIgnoreCase)) s0 = s;
                if (s0 == null) { Console.WriteLine("F. GAGAL: section '" + secName + "' tidak ditemukan."); return 1; }
                var ns = (Section)s0.Clone(true);
                ns.Format.EnableSuppressIfBlank = true;
                ns.Format.ConditionFormulas[CrSectionAreaFormatConditionFormulaTypeEnum.crSectionAreaConditionFormulaTypeEnableSuppress] = cf;
                rdc3.ReportSectionController.SetProperty(s0, CrReportSectionPropertyEnum.crReportSectionPropertyFormat, ns.Format);
                r.SaveAs(outp2);
                var r4 = new CE.ReportDocument(); r4.Load(outp2);
                foreach (Area ar in r4.ReportClientDocument.ReportDefController.ReportDefinition.Areas) foreach (Section s in ar.Sections)
                    if (string.Equals(s.Name, secName, StringComparison.OrdinalIgnoreCase))
                        Console.WriteLine("F. section " + s.Name + ": IfBlank=" + s.Format.EnableSuppressIfBlank + ", rumus=[" + s.Format.ConditionFormulas[CrSectionAreaFormatConditionFormulaTypeEnum.crSectionAreaConditionFormulaTypeEnableSuppress].Text + "] -> " + outp2);
            }
            return 0;
        }
        catch (Exception e) { Console.WriteLine("GAGAL: " + e.GetType().Name + ": " + e.Message); return 1; }
    }
}
