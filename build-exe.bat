@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
title Сборка Тилиграм (.exe)

echo ============================================================
echo   Тилиграм — Автоматическая установка зависимостей и сборка .EXE
echo ============================================================
echo.

:: 1. Проверка Node.js и npm
where node >nul 2>&1
if errorlevel 1 (
    echo [1/6] Node.js не найден. Пробую установить Node.js LTS через winget...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo [ОШИБКА] Node.js и winget не найдены!
        echo Скачайте и установите Node.js LTS с https://nodejs.org/ и запустите скрипт снова.
        pause
        exit /b 1
    )
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось автоматически установить Node.js.
        echo Установите вручную с https://nodejs.org/ и перезапустите этот .bat файл.
        pause
        exit /b 1
    )
    set "PATH=!ProgramFiles!\nodejs;!LocalAppData!\Programs\nodejs;!PATH!"
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ИНФО] Node.js установлен! Перезапустите этот .bat файл, чтобы обновился PATH.
    pause
    exit /b 0
)

for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [1/6] Node.js найден: !NODE_VER!

:: 2. Настройка адреса сервера Тилиграм для десктопного .exe
set "DEFAULT_URL=https://ais-pre-xbrzbdq5utfj3blqixdqnh-881905019921.europe-west2.run.app"
echo.
echo [2/6] Укажите URL вашего сервера Тилиграм (нажмите Enter для адреса по умолчанию):
echo       По умолчанию: !DEFAULT_URL!
set "USER_URL="
set /p "USER_URL=URL сервера: "
if "!USER_URL!"=="" set "USER_URL=!DEFAULT_URL!"

if not exist "electron" mkdir "electron"
node -e "const fs=require('fs'); fs.writeFileSync('electron/config.json', JSON.stringify({ serverUrl: process.argv[1] }, null, 2) + '\n');" "!USER_URL!"
if errorlevel 1 (
    echo [ОШИБКА] Не удалось сохранить electron\config.json
    pause
    exit /b 1
)
echo       Сервер сохранён в electron\config.json: !USER_URL!

:: 3. Установка всех зависимостей проекта
echo.
echo [3/6] Скачиваю и устанавливаю зависимости проекта (npm install)...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ОШИБКА] npm install завершился с ошибкой!
    pause
    exit /b 1
)

:: 4. Установка Electron, electron-builder и electron-updater (если ещё не установлены)
echo.
echo [4/6] Проверяю и скачиваю зависимости Electron (electron, electron-builder, electron-updater)...
if not exist "node_modules\electron-updater" (
    call npm install electron-updater --save --no-audit --no-fund
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить electron-updater!
        pause
        exit /b 1
    )
)
if not exist "node_modules\electron" (
    call npm install electron electron-builder --save-dev --no-audit --no-fund
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить electron и electron-builder!
        pause
        exit /b 1
    )
) else if not exist "node_modules\electron-builder" (
    call npm install electron-builder --save-dev --no-audit --no-fund
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить electron-builder!
        pause
        exit /b 1
    )
)

:: 5. Сборка фронтенда (Vite production build)
echo.
echo [5/6] Компилирую интерфейс Тилиграм (npm run build)...
call npm run build
if errorlevel 1 (
    echo [ОШИБКА] Ошибка сборки Vite (npm run build)!
    pause
    exit /b 1
)

:: 6. Компиляция Windows установщика (.exe)
echo.
echo [6/6] Собираю Windows .EXE установщик (electron-builder)...
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
call npx electron-builder --win nsis --config electron-builder.yml --publish never
if errorlevel 1 (
    echo.
    echo [ОШИБКА] Не удалось собрать .exe! Проверьте текст ошибки выше.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   ГОТОВО! Установщик .EXE успешно собран в папке:
echo   %~dp0release\
echo ============================================================
echo.
dir /b "%~dp0release\*.exe" 2>nul
echo.
start "" explorer "%~dp0release"
pause
exit /b 0
