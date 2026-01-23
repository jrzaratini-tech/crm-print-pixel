/**
 * ENGINE.JS v5.3.1 – CORE LIMPO E ESTÁVEL
 * - Commit manual controlado
 * - Auto-save SOMENTE local (NUNCA Firebase)
 * - Nenhuma função duplicada
 * - Nenhum código fora de escopo
 * - WRITE nunca auto-salva
 */

// ==================================================
// 1️⃣ UTILITÁRIOS
// ==================================================

function isWritePage() {
    return document.body?.getAttribute('data-page-type') === 'WRITE';
}

function hasValidId(schema) {
    const el = document.getElementById(`${schema}Id`) ||
               document.querySelector(`[data-bind="${schema}.id"]`);
    return el && el.value && el.value.trim() !== '';
}

function salvarRascunhoLocal() {
    const inputs = document.querySelectorAll('[data-bind]');
    const draft = {};

    inputs.forEach(input => {
        const key = input.getAttribute('data-bind');
        if (!key) return;

        if (input.type === 'checkbox') draft[key] = input.checked;
        else if (input.type === 'radio') {
            if (input.checked) draft[key] = input.value;
        } else draft[key] = input.value;
    });

    localStorage.setItem('coreDraft', JSON.stringify(draft));
    console.log('📝 Auto-save LOCAL executado');
}

// ==================================================
// 2️⃣ AUTO-SAVE (APENAS LOCAL)
// ==================================================

let autoSaveInterval = null;

function setupAutoSave() {
    if (isWritePage()) {
        console.log('🛑 Auto-save desativado (WRITE)');
        return;
    }

    if (autoSaveInterval) clearInterval(autoSaveInterval);

    autoSaveInterval = setInterval(salvarRascunhoLocal, 30000);
    window.addEventListener('blur', salvarRascunhoLocal);

    console.log('⏱️ Auto-save LOCAL ativado (30s)');
}

// ==================================================
// 3️⃣ PROCESSAMENTO DE FORMULÁRIO
// ==================================================

function processarSchemaPadrao(inputs, schema) {
    const payload = {};

    inputs.forEach(input => {
        const [sc, field] = input.getAttribute('data-bind').split('.');
        if (sc !== schema) return;

        if (input.type === 'checkbox') payload[field] = input.checked;
        else if (input.type === 'radio') {
            if (input.checked) payload[field] = input.value;
        } else if (input.type === 'number') payload[field] = parseFloat(input.value) || 0;
        else payload[field] = input.value;
    });

    return payload;
}

function processarSchemaComProdutos(inputs, schema) {
    const payload = { produtos: [] };

    inputs.forEach(input => {
        const parts = input.getAttribute('data-bind').split('.');
        if (parts[0] !== schema) return;

        if (parts[1] === 'produtos') {
            const i = parseInt(parts[2]);
            const field = parts[3];
            if (!payload.produtos[i]) payload.produtos[i] = {};

            payload.produtos[i][field] =
                input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
        } else {
            const field = parts[1];
            payload[field] =
                input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
        }
    });

    payload.produtos = payload.produtos.filter(p => p && Object.keys(p).length);
    return payload;
}

// ==================================================
// 4️⃣ COMMIT (ÚNICO PONTO DE SALVAMENTO)
// ==================================================

document.addEventListener('DOMContentLoaded', () => {
    const commitBtn = document.querySelector('[data-action="commit"]');
    if (!commitBtn) return;

    commitBtn.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('[data-bind]');
        let schema = null;

        inputs.forEach(i => {
            if (!schema) schema = i.getAttribute('data-bind').split('.')[0];
        });

        if (!schema) {
            alert('Schema não identificado');
            return;
        }

        const temProdutos = [...inputs].some(i =>
            i.getAttribute('data-bind').startsWith(`${schema}.produtos.`)
        );

        const payload = temProdutos
            ? processarSchemaComProdutos(inputs, schema)
            : processarSchemaPadrao(inputs, schema);

        const idField =
            document.getElementById(`${schema}Id`) ||
            document.querySelector(`[data-bind="${schema}.id"]`);

        const isUpdate = idField && idField.value;

        const dadosEnvio = {
            schema,
            payload,
            timestamp: new Date().toISOString()
        };

        if (isUpdate) {
            dadosEnvio.id = idField.value;
            delete dadosEnvio.payload.id;
        }

        console.log(`🚀 Commit ${isUpdate ? 'UPDATE' : 'CREATE'}`, dadosEnvio);

        const res = await fetch('/api/database/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosEnvio)
        });

        if (!res.ok) {
            alert('Erro ao salvar');
            return;
        }

        const result = await res.json();

        if (!isUpdate && result.id && idField) {
            idField.value = result.id;
        }

        console.log('✅ Commit concluído:', result);
        window.dispatchEvent(new CustomEvent('coreDataChanged'));
    });

    setupAutoSave();
});

// ==================================================
// 5️⃣ LIMPEZA
// ==================================================

window.addEventListener('unload', () => {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
});
