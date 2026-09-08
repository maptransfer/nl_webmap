@echo off
REM Launches tools/verify.py with the OSGeo4W-bundled Python (the only real
REM interpreter on this machine - the `python` on PATH is the Microsoft Store
REM stub and does not run anything). Mirrors serve.bat's approach.
REM
REM Usage (all args are passed through to verify.py):
REM   verify.bat                          all checks vs http://localhost:8000/
REM   verify.bat --list
REM   verify.bat wie_popup_opens console_clean
REM   verify.bat --url https://maptransfer.github.io/nl_webmap/
setlocal
set "PYEXE=C:\OSGeo4W\apps\Python312\python.exe"
set "PYTHONHOME=C:\OSGeo4W\apps\Python312"
set "PYTHONPATH="
if not exist "%PYEXE%" (
  echo ERROR: Python not found at %PYEXE%
  echo Edit verify.bat to point at your Python, or run:  python tools\verify.py
  exit /b 1
)
"%PYEXE%" "%~dp0verify.py" %*
