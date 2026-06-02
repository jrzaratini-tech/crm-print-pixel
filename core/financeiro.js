(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FINANCEIRO = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    function numero(value) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function temNumero(value) {
        return value !== '' && value !== null && value !== undefined && Number.isFinite(Number.parseFloat(value));
    }

    function faturamentoSemIva(payload = {}) {
        if (temNumero(payload.subtotal)) return Math.max(0, numero(payload.subtotal));
        if (temNumero(payload.total) && temNumero(payload.iva)) return Math.max(0, numero(payload.total) - numero(payload.iva));
        if (temNumero(payload.valorTotal) && temNumero(payload.iva)) return Math.max(0, numero(payload.valorTotal) - numero(payload.iva));

        const total = numero(payload.total || payload.valorTotal);
        return payload.comIVA === 'sim' ? total / 1.23 : total;
    }

    function totalComIva(payload = {}) {
        return Math.max(0, numero(payload.total || payload.valorTotal));
    }

    return { numero, faturamentoSemIva, totalComIva };
});
