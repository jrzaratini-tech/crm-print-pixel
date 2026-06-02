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

    function ivaRegistado(payload = {}) {
        if (temNumero(payload.iva)) return Math.max(0, numero(payload.iva));
        if (temNumero(payload.valorIVA)) return Math.max(0, numero(payload.valorIVA));

        const total = totalComIva(payload);
        if (temNumero(payload.subtotal)) return Math.max(0, total - numero(payload.subtotal));
        if (temNumero(payload.valorBruto)) return Math.max(0, total - numero(payload.valorBruto));

        return payload.comIVA === 'sim' || payload.comIVA === 'comIVA' || payload.comIVA === true
            ? Math.max(0, total - (total / 1.23))
            : 0;
    }

    function ivaCompraDedutivel(payload = {}) {
        if (payload.ivaDedutivel === false || payload.ivaDedutivel === 'nao') return 0;
        return ivaRegistado(payload);
    }

    function trimestreFiscal(referencia = new Date()) {
        const data = referencia instanceof Date ? referencia : new Date(referencia);
        const ano = data.getFullYear();
        const trimestre = Math.floor(data.getMonth() / 3) + 1;
        const mesInicial = (trimestre - 1) * 3;

        return {
            ano,
            trimestre,
            inicio: new Date(ano, mesInicial, 1),
            fim: new Date(ano, mesInicial + 3, 0, 23, 59, 59, 999),
            entregaDeclaracao: new Date(ano, mesInicial + 4, 20),
            pagamento: new Date(ano, mesInicial + 4, 25)
        };
    }

    function dataDoEvento(evento = {}) {
        return new Date(
            evento.dataFiltragem
            || evento.payload?.dataPedido
            || evento.payload?.dataCompra
            || evento.payload?.dataDespesa
            || evento.created_at
            || evento.timestamp
        );
    }

    function resumoIvaTrimestral(eventos = [], referencia = new Date()) {
        const periodo = trimestreFiscal(referencia);
        let ivaVendas = 0;
        let ivaComprasDedutivel = 0;

        eventos.forEach(evento => {
            if (!evento || evento.deleted) return;
            const data = dataDoEvento(evento);
            if (Number.isNaN(data.getTime()) || data < periodo.inicio || data > periodo.fim) return;

            if (evento.schema === 'pedido') ivaVendas += ivaRegistado(evento.payload);
            if (evento.schema === 'despesa') ivaComprasDedutivel += ivaCompraDedutivel(evento.payload);
        });

        const saldo = ivaVendas - ivaComprasDedutivel;
        return {
            ...periodo,
            ivaVendas,
            ivaComprasDedutivel,
            saldo,
            situacao: saldo > 0 ? 'pagar' : saldo < 0 ? 'receber' : 'equilibrado'
        };
    }

    return {
        numero,
        faturamentoSemIva,
        totalComIva,
        ivaRegistado,
        ivaCompraDedutivel,
        trimestreFiscal,
        resumoIvaTrimestral
    };
});
