@echo off
echo ========================================
echo CRM PRINT PIXEL - Atualizar Index Automatico
echo ========================================
echo.

:: Criar arquivo Node.js para atualizar index.html
echo const fs = require('fs'); > temp_update.js
echo const path = require('path'); >> temp_update.js
echo. >> temp_update.js
echo // Ler os botões do localStorage simulado >> temp_update.js
echo // NOTA: Você precisa primeiro acessar o sistema e criar as páginas >> temp_update.js
echo const buttonsHTML = ` >> temp_update.js
echo                 ^<button id="nav_cust_example" onclick="nav('pages/exemplo.html')"^> >> temp_update.js
echo                     ^<i class="fas fa-file"^>^<span^>Página Exemplo^</span^> >> temp_update.js
echo                 ^</button^> >> temp_update.js
echo `; >> temp_update.js
echo. >> temp_update.js
echo // Ler index.html atual >> temp_update.js
echo let html = fs.readFileSync('index.html', 'utf8'); >> temp_update.js
echo. >> temp_update.js
echo // Encontrar e substituir a área de botões >> temp_update.js
echo const startMarker = '^!-- CUSTOM PAGES WILL APPEAR HERE --^>'; >> temp_update.js
echo const endMarker = '^!-- ADMIN ZONE --^>'; >> temp_update.js
echo. >> temp_update.js
echo const startIndex = html.indexOf(startMarker); >> temp_update.js
echo const endIndex = html.indexOf(endMarker); >> temp_update.js
echo. >> temp_update.js
echo if (startIndex !== -1 ^&^& endIndex !== -1) { >> temp_update.js
echo     const before = html.substring(0, startIndex + startMarker.length); >> temp_update.js
echo     const after = html.substring(endIndex); >> temp_update.js
echo     const newHTML = before + '\n' + buttonsHTML + '\n                ' + after; >> temp_update.js
echo     fs.writeFileSync('index.html', newHTML); >> temp_update.js
echo     console.log('✅ Index.html atualizado com sucesso!'); >> temp_update.js
echo } else { >> temp_update.js
echo     console.log('❌ Marcadores não encontrados no index.html'); >> temp_update.js
echo } >> temp_update.js

:: Executar o Node.js
where node >nul 2>nul
if %ERRORLEVEL% == 0 (
    echo [1/2] Atualizando index.html automaticamente...
    node temp_update.js
    echo [2/2] ✅ Index.html atualizado!
    echo.
    echo Execute: git push.bat para enviar ao Git
) else (
    echo ❌ Node.js não encontrado.
    echo.
    echo Instale Node.js de https://nodejs.org
    echo ou edite o index.html manualmente
)

:: Limpar arquivo temporário
if exist temp_update.js del temp_update.js

echo.
echo ========================================
echo Concluido!
echo ========================================
pause
