@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" (
  echo ERRO: index.html nao encontrado. Extraia a pasta completa do ZIP.
  pause
  exit /b 1
)
start "Quarentena Z" "%~dp0index.html"
exit /b 0
