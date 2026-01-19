@echo off
cd /d "%~dp0"
echo 🔄 Git Pull - CRM Print Pixel
git pull origin main
if %errorlevel% equ 0 (
    echo ✅ Pull realizado com sucesso!
) else (
    echo ❌ Erro no pull!
)
pause
