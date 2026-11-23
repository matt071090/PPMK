@echo off
rem Compile StemRptAgent. Butuh Crystal SDK 13.0.4000 64-bit di GAC (tidak ada DLL yang disalin). Hasil: bin\StemRptAgent.exe
setlocal enabledelayedexpansion
set G64=C:\Windows\Microsoft.NET\assembly\GAC_64
set GM=C:\Windows\Microsoft.NET\assembly\GAC_MSIL
set V=v4.0_13.0.4000.0__692fbea5521e1304
set R=
for %%n in (ReportAppServer.ReportDefModel ReportAppServer.Controllers ReportAppServer.ClientDoc ReportAppServer.DataDefModel ReportAppServer.CommonObjectModel) do set R=!R! -r:%G64%\CrystalDecisions.%%n\%V%\CrystalDecisions.%%n.dll
for %%n in (CrystalReports.Engine Shared) do set R=!R! -r:%GM%\CrystalDecisions.%%n\%V%\CrystalDecisions.%%n.dll
if not exist "%~dp0bin" mkdir "%~dp0bin"
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" -nologo -platform:x64 -target:winexe -out:"%~dp0bin\StemRptAgent.exe" -r:System.Web.Extensions.dll -r:System.Windows.Forms.dll -r:System.Drawing.dll !R! "%~dp0Agent.cs"
rem Jalankan: bin\StemRptAgent.exe [origin1,origin2]   (default http://localhost:8080,http://127.0.0.1:8080)
