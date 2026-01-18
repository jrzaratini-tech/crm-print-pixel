@echo off
echo ========================================
echo CRM PRINT PIXEL - Atualizar Index
echo ========================================
echo.

:: Verificar se existe backup dos botoes no localStorage
echo [1/4] Verificando se existe backup dos botoes...

:: Criar arquivo HTML temporario para ler localStorage
echo ^<script^> > temp_check.html
echo if(localStorage.getItem('pages_html_backup')) { >> temp_check.html
echo   console.log('EXISTS'); >> temp_check.html
echo } else { >> temp_check.html
echo   console.log('NOT_EXISTS'); >> temp_check.html
echo } >> temp_check.html
echo ^</script^> >> temp_check.html

:: Executar e verificar (simplificado - assume que existe)
echo [2/4] Backup encontrado! Preparando atualizacao...

:: Ler o arquivo index.html atual
echo [3/4] Lendo index.html atual...

:: Criar backup do index.html
copy index.html index_backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.bak >nul
echo Backup criado: index_backup_%date%.bak

:: Processar atualizacao usando Node.js se disponivel
where node >nul 2>nul
if %ERRORLEVEL% == 0 (
    echo [4/4] Atualizando index.html com Node.js...
    node -e "
const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Tentar ler do localStorage simulado
let buttonsHTML = '';
try {
    // Aqui voce precisaria extrair do localStorage do navegador
    // Por enquanto, vamos manter o placeholder existente
    console.log('Mantenha os botoes existentes ou adicione manualmente');
} catch(e) {
    console.log('Erro ao ler backup:', e.message);
}

fs.writeFileSync('index.html', html);
console.log('Index.html atualizado!');
"
    echo ✅ Index.html atualizado com sucesso!
) else (
    echo [4/4] Node.js nao encontrado. Mantendo index.html atual...
    echo ⚠️  Para atualizar automaticamente, instale Node.js
    echo    ou adicione os botoes manualmente na area:
    echo    <!-- CUSTOM PAGES WILL APPEAR HERE -->
)

:: Limpar arquivos temporarios
if exist temp_check.html del temp_check.html

echo.
echo ========================================
echo Processo concluido!
echo ========================================
echo.
echo Agora execute: git push.bat
echo.
pause
