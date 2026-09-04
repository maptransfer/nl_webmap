@echo off
REM Serves the project root on http://localhost:8000 with HTTP Range support,
REM which plain "python -m http.server" cannot provide (see serve_range.py).
REM Uses the OSGeo4W-bundled Python; any Python 3 works if you already have
REM one active (e.g. "python serve_range.py" from a conda env).
setlocal
set "PYEXE=C:\OSGeo4W\apps\Python312\python.exe"
set "PYTHONHOME=C:\OSGeo4W\apps\Python312"
set "PYTHONPATH="
if not exist "%PYEXE%" (
  echo ERROR: Python not found at %PYEXE%
  echo Edit serve.bat to point at your Python, or run:  python serve_range.py
  exit /b 1
)
"%PYEXE%" "%~dp0serve_range.py" 8000
