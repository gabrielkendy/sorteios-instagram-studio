@echo off
chcp 65001 >nul
cd /d "%~dp0"
title NOME DA SUA MARCA - Token da API
echo.
echo  ============================================
echo   CONFIGURAR O TOKEN DA API (APIFY)
echo  ============================================
echo.
echo  Cole abaixo o seu token pessoal da Apify.
echo  Ele comeca com: apify_api_
echo.
echo  Onde pegar: https://console.apify.com/account/integrations
echo.
set /p TOKEN="Token: "
if "%TOKEN%"=="" (
  echo.
  echo Nenhum token informado. Nada foi alterado.
  pause
  exit /b 1
)
> ".env.local" echo APIFY_TOKEN=%TOKEN%
echo.
echo  Token salvo no arquivo privado .env.local
echo  Nao envie esse arquivo para ninguem.
echo.
pause
