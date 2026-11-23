@echo off
rem Compile SuppressSpike (butuh Crystal SDK 13.0.4000 x64 di GAC, sama seperti ..\build.cmd). Hasil: bin\SuppressSpike.exe
setlocal enabledelayedexpansion
set G64=C:\Windows\Microsoft.NET\assembly\GAC_64
set GM=C:\Windows\Microsoft.NET\assembly\GAC_MSIL
set V=v4.0_13.0.4000.0__692fbea5521e1304
set R=
for %%n in (ReportAppServer.ReportDefModel ReportAppServer.Controllers ReportAppServer.ClientDoc ReportAppServer.DataDefModel ReportAppServer.CommonObjectModel) do set R=!R! -r:%G64%\CrystalDecisions.%%n\%V%\CrystalDecisions.%%n.dll
for %%n in (CrystalReports.Engine Shared) do set R=!R! -r:%GM%\CrystalDecisions.%%n\%V%\CrystalDecisions.%%n.dll
if not exist "%~dp0bin" mkdir "%~dp0bin"
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" -nologo -platform:x64 -target:exe -out:"%~dp0bin\SuppressSpike.exe" !R! "%~dp0SuppressSpike.cs"
