(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FINANCEIRO = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const arredondarCentimos = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

    function numero(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        let texto = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
        if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/\./g, '').replace(',', '.');
        else if (texto.includes(',')) texto = texto.replace(',', '.');
        const parsed = Number.parseFloat(texto);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function temNumero(value) {
        return value !== '' && value !== null && value !== undefined && Number.isFinite(numero(value));
    }

    function textoNormalizado(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function sinalDocumento(payload = {}) {
        const tipo = textoNormalizado(`${payload.tipoDocumento || ''} ${payload.numeroFatura || ''} ${payload.documentType || ''}`);
        return /(^|\s|\/)(nc|nota de credito)(\s|\/|$)/.test(tipo) ? -1 : 1;
    }

    function faturamentoSemIva(payload = {}) {
        if (temNumero(payload.subtotal)) return numero(payload.subtotal) * sinalDocumento(payload);
        if (temNumero(payload.total) && temNumero(payload.iva)) return (numero(payload.total) - Math.abs(numero(payload.iva))) * sinalDocumento(payload);
        if (temNumero(payload.valorTotal) && temNumero(payload.iva)) return (numero(payload.valorTotal) - Math.abs(numero(payload.iva))) * sinalDocumento(payload);

        const total = numero(payload.total || payload.valorTotal);
        return (payload.comIVA === 'sim' ? total / 1.23 : total) * sinalDocumento(payload);
    }

    function totalComIva(payload = {}) {
        return numero(payload.total || payload.valorTotal) * sinalDocumento(payload);
    }

    function ivaRegistado(payload = {}) {
        let valor = 0;
        if (temNumero(payload.iva)) valor = Math.abs(numero(payload.iva));
        else if (temNumero(payload.valorIVA)) valor = Math.abs(numero(payload.valorIVA));
        else {
            const total = Math.abs(numero(payload.total || payload.valorTotal));
            if (temNumero(payload.subtotal)) valor = Math.max(0, total - Math.abs(numero(payload.subtotal)));
            else if (temNumero(payload.valorBruto)) valor = Math.max(0, total - Math.abs(numero(payload.valorBruto)));
            else if (payload.comIVA === 'sim' || payload.comIVA === 'comIVA' || payload.comIVA === true) valor = Math.max(0, total - (total / 1.23));
        }
        return valor * sinalDocumento(payload);
    }

    function percentualIvaDedutivel(payload = {}) {
        const estadoClassificacao = textoNormalizado(`${payload.classificationStatus || ''} ${payload.categoria || ''}`);
        if (/pending|a classificar/.test(estadoClassificacao)) return 0;
        const explicito = payload.percentualIvaDedutivel ?? payload.ivaDedutivelPercentual ?? payload.percentagemIvaDedutivel;
        if (explicito !== undefined && explicito !== null && explicito !== '') return Math.min(100, Math.max(0, numero(explicito)));
        if (payload.ivaDedutivel === false || ['nao', 'não', 'false'].includes(textoNormalizado(payload.ivaDedutivel))) return 0;

        const classificacao = textoNormalizado(`${payload.categoria || ''} ${payload.tipoDespesa || ''}`);
        if (/combustivel|gasoleo|diesel/.test(classificacao)) return 50;
        if (/alimentacao|restaurante|refeicao|cafe/.test(classificacao)) return 0;
        return 100;
    }

    function ivaCompraDedutivel(payload = {}) {
        return arredondarCentimos(ivaRegistado(payload) * (percentualIvaDedutivel(payload) / 100));
    }

    function proximoDiaUtil(data) {
        const ajustada = new Date(data);
        while (ajustada.getDay() === 0 || ajustada.getDay() === 6) ajustada.setDate(ajustada.getDate() + 1);
        return ajustada;
    }

    function trimestreFiscal(referencia = new Date()) {
        const data = referencia instanceof Date ? referencia : new Date(referencia);
        const ano = data.getFullYear();
        const trimestre = Math.floor(data.getMonth() / 3) + 1;
        const mesInicial = (trimestre - 1) * 3;
        const mesPrazo = trimestre === 2 ? 8 : mesInicial + 4;

        return {
            ano,
            trimestre,
            inicio: new Date(ano, mesInicial, 1),
            fim: new Date(ano, mesInicial + 3, 0, 23, 59, 59, 999),
            entregaDeclaracao: proximoDiaUtil(new Date(ano, mesPrazo, 20)),
            pagamento: proximoDiaUtil(new Date(ano, mesPrazo, 25))
        };
    }

    function dataDoEvento(evento = {}) {
        return new Date(
            evento.payload?.dataFatura
            || evento.payload?.dataCompra
            || evento.payload?.dataDespesa
            || evento.payload?.dataPedido
            || evento.dataFiltragem
            || evento.created_at
            || evento.timestamp
        );
    }

    function pedidoFaturado(evento = {}) {
        if (evento.schema !== 'pedido') return false;
        const payload = evento.payload || {};
        const estado = textoNormalizado(payload.estadoFaturacao || payload.statusFaturacao || payload.statusFiscal);
        return Boolean(payload.numeroFatura || payload.faturado === true || payload.faturada === true || /faturad|emitid/.test(estado));
    }

    function chaveFiscal(evento = {}) {
        const payload = evento.payload || {};
        const numeroDocumento = textoNormalizado(payload.numeroFatura || payload.numeroDocumento);
        const nif = String(payload.nifEmitente || payload.nifFornecedor || '').replace(/\D/g, '');
        if (numeroDocumento) return `${evento.schema === 'despesa' ? 'c' : 'v'}|${nif}|${numeroDocumento}`;
        return evento.id ? `id|${evento.id}` : null;
    }

    function semDuplicados(eventos = []) {
        const vistos = new Set();
        return eventos.filter(evento => {
            const chave = chaveFiscal(evento);
            if (!chave) return true;
            if (vistos.has(chave)) return false;
            vistos.add(chave);
            return true;
        });
    }

    function resumoIvaTrimestral(eventos = [], referencia = new Date()) {
        const periodo = trimestreFiscal(referencia);
        const eventosDoPeriodo = eventos.filter(evento => {
            if (!evento || evento.deleted) return false;
            const data = dataDoEvento(evento);
            return !Number.isNaN(data.getTime()) && data >= periodo.inicio && data <= periodo.fim;
        });
        const faturasVenda = eventosDoPeriodo.filter(evento => evento.schema === 'fatura_venda');
        const pedidosComFatura = eventosDoPeriodo.filter(pedidoFaturado);
        const vendas = semDuplicados([...faturasVenda, ...pedidosComFatura]);
        const compras = semDuplicados(eventosDoPeriodo.filter(evento => evento.schema === 'despesa'));
        const ivaVendas = arredondarCentimos(vendas.reduce((soma, evento) => soma + ivaRegistado(evento.payload), 0));
        const ivaComprasDedutivel = arredondarCentimos(compras.reduce((soma, evento) => soma + ivaCompraDedutivel(evento.payload), 0));
        const saldo = arredondarCentimos(ivaVendas - ivaComprasDedutivel);
        const dataReferencia = referencia instanceof Date ? referencia : new Date(referencia);
        return {
            ...periodo,
            ivaVendas,
            ivaComprasDedutivel,
            saldo,
            fonteVendas: faturasVenda.length ? 'faturas' : pedidosComFatura.length ? 'pedidos_faturados' : 'sem_documentos_fiscais',
            documentosVenda: vendas.length,
            documentosCompra: compras.filter(evento => ivaRegistado(evento.payload) !== 0).length,
            comprasPorClassificar: compras.filter(evento => {
                const payload = evento.payload || {};
                return ivaRegistado(payload) !== 0 && /pending|a classificar/.test(textoNormalizado(`${payload.classificationStatus || ''} ${payload.categoria || ''}`));
            }).length,
            apuradoAte: dataReferencia < periodo.fim ? dataReferencia : periodo.fim,
            situacao: saldo > 0 ? 'pagar' : saldo < 0 ? 'receber' : 'equilibrado'
        };
    }

    return {
        numero,
        faturamentoSemIva,
        totalComIva,
        ivaRegistado,
        percentualIvaDedutivel,
        ivaCompraDedutivel,
        trimestreFiscal,
        resumoIvaTrimestral
    };
});
