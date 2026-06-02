(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QR_FISCAL = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    function texto(value, maxLength = 200) {
        return String(value || '').trim().slice(0, maxLength);
    }

    function digitos(value) {
        return texto(value).replace(/\D/g, '');
    }

    function numero(value) {
        const parsed = Number.parseFloat(String(value || '0').replace(',', '.'));
        return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
    }

    function primeiroNumero(...values) {
        for (const value of values) {
            const parsed = numero(value);
            if (parsed) return parsed;
        }
        return 0;
    }

    function normalizarData(value) {
        const clean = texto(value, 10);
        if (/^\d{8}$/.test(clean)) return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
        return '';
    }

    function interpretar(rawValue) {
        const rawQr = texto(rawValue, 4000);
        const pares = {};
        rawQr.split('*').forEach(part => {
            const index = part.indexOf(':');
            if (index > 0) pares[part.slice(0, index).trim().toUpperCase()] = part.slice(index + 1).trim();
        });

        const nifEmitente = digitos(pares.A || pares.NIFEMITENTE);
        const nifAdquirente = digitos(pares.B || pares.NIFADQUIRENTE);
        const total = primeiroNumero(pares.O, pares.P, pares.Q, pares.TOTAL, pares.TOTALIVA);
        const camposIva = Object.keys(pares).filter(key => /^[IJKL]\d+$/.test(key) || key.startsWith('IVA'));
        const iva = primeiroNumero(pares.N, pares.IVA, pares.IVATOTAL)
            || Math.round(camposIva.reduce((sum, key) => sum + numero(pares[key]), 0) * 100) / 100;
        const subtotal = total && iva ? Math.round((total - iva) * 100) / 100 : primeiroNumero(pares.BASE, pares.TOTALSEMIVA);

        return {
            rawQr,
            nifEmitente,
            nifAdquirente,
            tipoDocumento: texto(pares.D || pares.TIPODOCUMENTO, 30).toUpperCase(),
            numeroFatura: texto(pares.G || pares.NUMDOC || pares.NUMERODOCUMENTO, 120),
            dataCompra: normalizarData(pares.F || pares.DATA),
            valorTotal: total,
            valorIVA: iva,
            valorBruto: subtotal
        };
    }

    function validar(documento, nifEmpresa = '') {
        const erros = [];
        if (!documento.rawQr || !documento.rawQr.includes('*')) erros.push('QR fiscal inválido.');
        if (!/^\d{9}$/.test(documento.nifEmitente)) erros.push('NIF do emitente inválido.');
        if (!documento.numeroFatura) erros.push('Número da fatura ausente.');
        if (!documento.dataCompra) erros.push('Data da fatura inválida.');
        if (!(documento.valorTotal > 0)) erros.push('Total da fatura inválido.');
        if (documento.valorIVA < 0 || documento.valorBruto < 0) erros.push('Valores fiscais inválidos.');
        if (nifEmpresa && documento.nifAdquirente !== digitos(nifEmpresa)) erros.push('A fatura não pertence ao NIF configurado para a empresa.');
        return erros;
    }

    return { interpretar, validar };
});
