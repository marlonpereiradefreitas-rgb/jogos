@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo Iniciando Servidor Seguro Node.js (Quarentena Z)...
  start "Quarentena Z Servidor" /min cmd /c "node server.js"
  timeout /t 2 >nul
  start "Quarentena Z" "http://localhost:8080"
  exit /b 0
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "Quarentena Z Servidor" /min cmd /c "py -m http.server 8000"
  timeout /t 2 >nul
  start "Quarentena Z" "http://localhost:8000"
  exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "Quarentena Z Servidor" /min cmd /c "python -m http.server 8000"
  timeout /t 2 >nul
  start "Quarentena Z" "http://localhost:8000"
  exit /b 0
)

echo Nem Node.js nem Python foram encontrados.
echo Abrindo o jogo diretamente no navegador...
timeout /t 2 >nul
start "Quarentena Z" "%~dp0index.html"
exit /b 0
