@echo off
chcp 65001 >nul
cd /d "%~dp0"
title NOME DA SUA MARCA - Sorteios
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao esta instalado.
  echo Instale a versao LTS em https://nodejs.org/ e execute este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo.
echo  Iniciando o painel de sorteios da Nechio...
echo  O navegador abre sozinho em http://127.0.0.1:3214
echo  NAO FECHE ESTA JANELA enquanto estiver usando o painel.
echo.
start "" "http://127.0.0.1:3214"
node server.mjs
pause
