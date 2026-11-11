@echo off
chcp 65001 >nul
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
title Quarentena Z - Modo Desktop

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js / npm nao encontrado no sistema.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Instalando dependencias do Desktop pela primeira vez...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run desktop:dev
if errorlevel 1 pause
exit /b 0
