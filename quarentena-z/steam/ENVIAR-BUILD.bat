@echo off
REM 1) Edite app_build.vdf e depot_build.vdf com seu App ID e Depot ID.
REM 2) Rode "npm run dist" antes. 3) Ajuste o caminho do steamcmd e o login abaixo.
set STEAMCMD=C:\steamcmd\steamcmd.exe
%STEAMCMD% +login SEU_USUARIO_STEAMWORKS +run_app_build "%~dp0app_build.vdf" +quit
