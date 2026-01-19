@echo off
cd /d "%~dp0"
echo 🚀 Git Push - CRM Print Pixel
set /p mensagem=Digite a mensagem do commit: 
if "%mensagem%"=="" (
    echo ❌ Erro: Mensagem nao pode ser vazia!
    pause
    exit
)
git add .
git commit -m "%mensagem%"
if %errorlevel% neq 0 (
    echo ❌ Erro no commit!
    pause
    exit
)
git push origin main
if %errorlevel% equ 0 (
    echo ✅ Push realizado com sucesso!
) else (
    echo ❌ Erro no push!
)
pause
