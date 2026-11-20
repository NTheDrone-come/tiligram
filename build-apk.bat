@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
title Сборка Тилиграм для Android (.apk)

echo ============================================================
echo   Тилиграм — Сборка мобильного приложения Android (.APK)
echo ============================================================
echo.

:: 1. Проверка Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [1/6] Node.js не найден. Устанавливаю Node.js LTS через winget...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo [ОШИБКА] Node.js и winget не найдены! Установите Node.js с https://nodejs.org/
        pause
        exit /b 1
    )
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось автоматически установить Node.js.
        pause
        exit /b 1
    )
    set "PATH=!ProgramFiles!\nodejs;!LocalAppData!\Programs\nodejs;!PATH!"
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ИНФО] Node.js установлен! Перезапустите build-apk.bat, чтобы обновился PATH.
    pause
    exit /b 0
)

for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [1/6] Node.js найден: !NODE_VER!

:: 2. Проверка Java (JDK 17+) и Android SDK
where java >nul 2>&1
if errorlevel 1 (
    echo [2/6] Java JDK не найдена. Пробую установить Microsoft OpenJDK 17 через winget...
    where winget >nul 2>&1
    if not errorlevel 1 (
        winget install -e --id Microsoft.OpenJDK.17 --accept-package-agreements --accept-source-agreements
    )
)

if "!ANDROID_HOME!"=="" (
    if exist "!LocalAppData!\Android\Sdk" (
        set "ANDROID_HOME=!LocalAppData!\Android\Sdk"
        set "ANDROID_SDK_ROOT=!LocalAppData!\Android\Sdk"
    )
)

if "!ANDROID_HOME!"=="" (
    echo.
    echo [ВАЖНО] Android SDK не найден на этом ПК.
    echo Для сборки .APK установите Android Studio: https://developer.android.com/studio
    echo (достаточно установить Android SDK Platform 34+ в SDK Manager).
    echo.
    echo Подсказка: Тилиграм уже работает как PWA на Android и iPhone без сборки APK —
    echo просто откройте адрес сервера в Chrome/Safari и нажмите «Установить на телефон»!
    echo.
    pause
    exit /b 1
)
echo [2/6] Android SDK найден: !ANDROID_HOME!

:: 3. Адрес сервера Тилиграм для Android-приложения
set "DEFAULT_URL=https://ais-pre-xbrzbdq5utfj3blqixdqnh-881905019921.europe-west2.run.app"
echo.
echo [3/6] Укажите URL вашего сервера Тилиграм (Enter — адрес по умолчанию):
echo       По умолчанию: !DEFAULT_URL!
set "USER_URL="
set /p "USER_URL=URL сервера: "
if "!USER_URL!"=="" set "USER_URL=!DEFAULT_URL!"

node -e "const fs=require('fs'); const url=process.argv[1].replace(/\/+$/,''); const cfg={appId:'app.tiligram.messenger',appName:'Тилиграм',webDir:'dist',server:{url,cleartext:url.startsWith('http://')},android:{allowMixedContent:true}}; fs.writeFileSync('capacitor.config.json', JSON.stringify(cfg,null,2)+'\n');" "!USER_URL!"
if errorlevel 1 (
    echo [ОШИБКА] Не удалось создать capacitor.config.json
    pause
    exit /b 1
)
echo       Конфигурация сохранена в capacitor.config.json

:: 4. Установка зависимостей проекта и Capacitor
echo.
echo [4/6] Устанавливаю зависимости npm и Capacitor Android...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ОШИБКА] npm install завершился с ошибкой!
    pause
    exit /b 1
)

if not exist "node_modules\@capacitor\android" (
    call npm install @capacitor/core @capacitor/cli @capacitor/android --no-audit --no-fund
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить @capacitor/android!
        pause
        exit /b 1
    )
)

:: 5. Сборка веб-интерфейса и синхронизация Android-проекта
echo.
echo [5/6] Собираю интерфейс (npm run build) и синхронизирую Android...
call npm run build
if errorlevel 1 (
    echo [ОШИБКА] Ошибка сборки Vite!
    pause
    exit /b 1
)

if not exist "android" (
    call npx cap add android
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось инициализировать Android-проект!
        pause
        exit /b 1
    )
)

call npx cap sync android
if errorlevel 1 (
    echo [ОШИБКА] Ошибка синхронизации Capacitor!
    pause
    exit /b 1
)

:: 6. Компиляция APK через Gradle
echo.
echo [6/6] Компилирую Android .APK (Gradle assembleDebug)...
pushd android
call gradlew.bat assembleDebug
set "GRADLE_ERR=!errorlevel!"
popd

if not "!GRADLE_ERR!"=="0" (
    echo.
    echo [ОШИБКА] Gradle не смог собрать APK. Проверьте наличие JDK 17 и Android SDK.
    pause
    exit /b 1
)

if not exist "release" mkdir "release"
set "APK_SRC=android\app\build\outputs\apk\debug\app-debug.apk"
if exist "!APK_SRC!" (
    copy /y "!APK_SRC!" "release\Tiligram-Android.apk" >nul
    echo.
    echo ============================================================
    echo   ГОТОВО! Android-приложение собрано:
    echo   %~dp0release\Tiligram-Android.apk
    echo ============================================================
    echo.
    start "" explorer "%~dp0release"
) else (
    echo [ОШИБКА] APK файл не найден по пути !APK_SRC!
    pause
    exit /b 1
)

pause
exit /b 0
