@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Quarentena Z - Gerador de Executavel PC (.exe)

echo =======================================================
echo   QUARENTENA Z - GERADOR DE EXECUTAVEL PC (.EXE)
echo =======================================================
echo Pasta do projeto: %cd%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js / npm nao encontrado no sistema.
  echo Instale o Node.js LTS em: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo [1/2] Instalando Electron e dependencias de compilacao...
  echo Isso pode levar alguns minutos na primeira vez.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar dependencias. Verifique sua conexao com a internet.
    pause
    exit /b 1
  )
) else (
  echo [1/2] Dependencias ja instaladas.
)

echo.
echo [2/2] Gerando instalador e executavel portatil (.exe)...
call npm run desktop:build
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao gerar o executavel. Veja a mensagem acima.
  pause
  exit /b 1
)

echo.
echo =======================================================
echo   CONCLUIDO! Executaveis gerados na pasta "dist".
echo =======================================================
if exist "dist" start "" "%~dp0dist"
pause
exit /b 0
