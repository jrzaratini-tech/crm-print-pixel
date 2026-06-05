(function (root, factory) {
    const deps = {};
    if (typeof module === 'object' && module.exports) {
        deps.CUSTEIO = require('./custeio.js');
        deps.FINANCEIRO = require('./financeiro.js');
    } else if (root) {
        deps.CUSTEIO = root.CUSTEIO;
        deps.FINANCEIRO = root.FINANCEIRO;
    }
    const api = factory(deps);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.GESTAO = api;
})(typeof window !== 'undefined' ? window : globalThis, function (deps) {
    'use strict';

    const { CUSTEIO, FINANCEIRO } = deps;

    const DEFAULT_MARGIN = 50;
    const DEFAULT_VAT = 0.23;

    function numero(value) {
        const parsed = Number.parseFloat(String(value ?? 0).replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function dinheiro(value) {
        return Math.max(0, Math.round(numero(value) * 100) / 100);
    }

    function texto(value, fallback = '') {
        return String(value ?? fallback).trim();
    }

    function produtoId(index) {
        return `item_${index}`;
    }

    function dataEvento(evento = {}) {
        return new Date(
            evento.dataFiltragem
            || evento.payload?.dataPedido
            || evento.payload?.dataFatura
            || evento.payload?.dataCompra
            || evento.payload?.dataDespesa
            || evento.created_at
            || evento.timestamp
            || 0
        );
    }

    function materialMap(materiais = []) {
        return new Map(materiais.map(material => [material.id || material.key, material]));
    }

    function calcularFichaProduto(produto = {}, materiais = []) {
        const catalogo = materialMap(materiais);
        const itens = Array.isArray(produto.materiais) ? produto.materiais : [];
        const detalhes = itens.map(item => {
            const material = catalogo.get(item.materialId) || catalogo.get(String(item.materialId || '').replace(/^preset:/, '')) || {};
            const calculo = CUSTEIO.calcular(item, material);
            return { ...item, material, calculo };
        });
        const custoFicha = detalhes.reduce((total, item) => total + item.calculo.custo, 0);
        const quantidade = Math.max(1, numero(produto.quantidade) || 1);
        const custoUnitarioInformado = dinheiro(produto.custo || produto.custoUnitario);
        const custoUnitario = custoFicha > 0 ? custoFicha : custoUnitarioInformado;
        const valorUnitario = dinheiro(produto.valor || produto.preco);
        const maoObra = Array.isArray(produto.maoObraPrevista) ? produto.maoObraPrevista : [];
        const custoMaoObra = maoObra.reduce((total, item) => total + (numero(item.horas) * numero(item.custoHora)), 0);

        return {
            produto: texto(produto.nome, 'Produto'),
            quantidade,
            valorUnitario,
            vendaLiquida: dinheiro(valorUnitario * quantidade),
            custoMateriaisUnitario: dinheiro(custoUnitario),
            custoMateriaisTotal: dinheiro(custoUnitario * quantidade),
            custoMaoObra: dinheiro(custoMaoObra * quantidade),
            custoTotal: dinheiro((custoUnitario + custoMaoObra) * quantidade),
            detalhes
        };
    }

    function margemSobreVenda(vendaLiquida, custo) {
        const venda = numero(vendaLiquida);
        if (venda <= 0) return 0;
        return ((venda - numero(custo)) / venda) * 100;
    }

    function precoMinimo(custo, margemMinima = DEFAULT_MARGIN) {
        const margem = Math.min(95, Math.max(0, numero(margemMinima))) / 100;
        return dinheiro(numero(custo) / Math.max(0.01, 1 - margem));
    }

    function resumoOrcamentoProfissional(payload = {}, materiais = [], config = {}) {
        const produtos = Array.isArray(payload.produtos) ? payload.produtos : [];
        const fichas = produtos.map(produto => calcularFichaProduto(produto, materiais));
        const subtotalLiquido = produtos.reduce((total, produto) => {
            const quantidade = Math.max(1, numero(produto.quantidade) || 1);
            return total + dinheiro(produto.valor || produto.preco) * quantidade;
        }, 0);
        const custoPrevisto = fichas.reduce((total, ficha) => total + ficha.custoTotal, 0);
        const margemMinima = numero(config.margemMinima || config.margemMinimaOrcamento || DEFAULT_MARGIN);
        const minimo = precoMinimo(custoPrevisto, margemMinima);
        const precoSugerido = Math.max(subtotalLiquido, minimo);
        const iva = payload.comIVA === 'nao' ? 0 : dinheiro(precoSugerido * DEFAULT_VAT);

        return {
            fichas,
            subtotalLiquido: dinheiro(subtotalLiquido),
            custoPrevisto: dinheiro(custoPrevisto),
            lucroPrevisto: dinheiro(subtotalLiquido - custoPrevisto),
            margemPrevista: margemSobreVenda(subtotalLiquido, custoPrevisto),
            margemMinima,
            precoMinimo: minimo,
            precoSugerido: dinheiro(precoSugerido),
            iva,
            totalSugerido: dinheiro(precoSugerido + iva),
            abaixoMargem: subtotalLiquido > 0 && margemSobreVenda(subtotalLiquido, custoPrevisto) < margemMinima
        };
    }

    function roteiroPadraoProduto(produto = {}) {
        const nome = texto(produto.nome).toLowerCase();
        const etapas = ['Arte / projeto'];
        if (/neon|led|fita|modulo|m[oó]dulo/.test(nome)) etapas.push('LED / solda');
        if (/acm|acr[ií]lico|placa|pvc|laser|router|cnc/.test(nome)) etapas.push('Usinagem CNC');
        if (/caixa|metalon|perfil|estrutura/.test(nome)) etapas.push('Montagem da estrutura');
        if (/pint/.test(nome)) etapas.push('Pintura externa');
        etapas.push('Acabamento');
        if (/instala/.test(nome)) etapas.push('Instalacao');
        return etapas.map((label, index) => ({
            id: label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase(),
            label,
            ordem: index + 1,
            tempoPrevistoMin: index === 0 ? 20 : 30
        }));
    }

    function roteiroPedido(payload = {}) {
        const produtos = Array.isArray(payload.produtos) ? payload.produtos : [];
        return produtos.map((produto, index) => ({
            productId: produtoId(index),
            produto: texto(produto.nome, `Produto ${index + 1}`),
            etapas: roteiroPadraoProduto(produto)
        }));
    }

    function minutosRealizados(assignment = {}) {
        if (Array.isArray(assignment.timeLogs)) {
            return assignment.timeLogs.reduce((total, log) => total + numero(log.minutes), 0);
        }
        if (Array.isArray(assignment.steps)) {
            return assignment.steps.reduce((total, step) => total + numero(step.actualMinutes || step.tempoRealMin), 0);
        }
        return 0;
    }

    function previstoRealizadoPedido(order = {}, assignments = [], materiais = [], config = {}) {
        const payload = order.payload || order;
        const orcamento = resumoOrcamentoProfissional(payload, materiais, config);
        const relacionados = assignments.filter(item => item.orderId === order.id || item.orderId === payload.id);
        const comissoes = relacionados.reduce((total, item) => total + numero(item.commission), 0);
        const minutos = relacionados.reduce((total, item) => total + minutosRealizados(item), 0);
        const custoHoraPadrao = numero(config.custoHoraMedio || config.custoHoraProducao || 30);
        const custoMaoObraReal = dinheiro((minutos / 60) * custoHoraPadrao);
        const custoReal = dinheiro(orcamento.custoPrevisto + custoMaoObraReal + comissoes);
        const vendaLiquida = FINANCEIRO.faturamentoSemIva(payload);

        return {
            orderId: order.id || payload.id,
            numero: payload.numero || order.numero || '',
            cliente: payload.cliente || order.cliente || '',
            vendaLiquida: dinheiro(vendaLiquida),
            custoPrevisto: orcamento.custoPrevisto,
            custoReal,
            diferenca: dinheiro(custoReal - orcamento.custoPrevisto),
            lucroPrevisto: dinheiro(vendaLiquida - orcamento.custoPrevisto),
            lucroReal: dinheiro(vendaLiquida - custoReal),
            margemPrevista: margemSobreVenda(vendaLiquida, orcamento.custoPrevisto),
            margemReal: margemSobreVenda(vendaLiquida, custoReal),
            minutosRealizados: minutos,
            comissoes: dinheiro(comissoes),
            status: custoReal > orcamento.custoPrevisto ? 'acima_do_previsto' : 'dentro_do_previsto'
        };
    }

    function estoqueInteligente(materiais = [], eventos = []) {
        const movimentos = eventos.filter(evento => evento.schema === 'estoque_movimento' && !evento.deleted);
        return materiais.map(material => {
            const id = material.id || material.key;
            const saldoMovimentos = movimentos
                .filter(evento => evento.payload?.materialId === id)
                .reduce((total, evento) => total + numero(evento.payload?.quantidade), 0);
            const estoqueAtual = dinheiro(numero(material.estoqueAtual) + saldoMovimentos);
            const minimo = dinheiro(material.estoqueMinimo);
            const sugestaoCompra = Math.max(0, minimo - estoqueAtual);
            return {
                id,
                nome: material.nome || material.key,
                unidade: material.unidade || 'un',
                estoqueAtual,
                estoqueMinimo: minimo,
                sugestaoCompra: dinheiro(sugestaoCompra),
                status: sugestaoCompra > 0 ? 'comprar' : 'ok'
            };
        });
    }

    function dreGerencial(eventos = [], assignments = [], config = {}) {
        const ativos = eventos.filter(evento => !evento.deleted);
        const eventosPeriodo = ativos.filter(evento => {
            const data = dataEvento(evento);
            return !Number.isNaN(data.getTime());
        });
        const temFaturasVenda = eventosPeriodo.some(evento => evento.schema === 'fatura_venda');
        const vendas = eventosPeriodo
            .filter(evento => evento.schema === 'fatura_venda' || (!temFaturasVenda && evento.schema === 'pedido'))
            .reduce((total, evento) => total + FINANCEIRO.faturamentoSemIva(evento.payload), 0);
        const despesas = eventosPeriodo
            .filter(evento => evento.schema === 'despesa')
            .reduce((total, evento) => total + dinheiro(evento.payload?.valorBruto || evento.payload?.valorTotal || evento.payload?.total || evento.payload?.valor), 0);
        const custoProdutos = eventosPeriodo
            .filter(evento => evento.schema === 'pedido')
            .reduce((total, evento) => total + (Array.isArray(evento.payload?.produtos)
                ? evento.payload.produtos.reduce((sum, produto) => sum + dinheiro(produto.custo) * Math.max(1, numero(produto.quantidade) || 1), 0)
                : 0), 0);
        const comissoes = assignments.reduce((total, item) => total + numero(item.commission), 0);
        const margemBruta = vendas - custoProdutos;
        const resultadoOperacional = margemBruta - despesas - comissoes;
        const resumoIva = FINANCEIRO.resumoIvaTrimestral(eventosPeriodo, new Date());
        const margemContribuicao = Math.max(1, numero(config.margemContribuicao || DEFAULT_MARGIN)) / 100;
        const pontoEquilibrio = dinheiro(numero(config.custosFixos) / margemContribuicao);

        return {
            vendasLiquidas: dinheiro(vendas),
            custoProdutos: dinheiro(custoProdutos),
            margemBruta: dinheiro(margemBruta),
            despesas: dinheiro(despesas),
            comissoes: dinheiro(comissoes),
            resultadoOperacional: Math.round(resultadoOperacional * 100) / 100,
            iva: resumoIva,
            pontoEquilibrio,
            fluxoCaixaProjetado: dinheiro(vendas - despesas - comissoes)
        };
    }

    function painelGestao({ eventos = [], assignments = [], materiais = [], config = {} } = {}) {
        const pedidos = eventos.filter(evento => evento.schema === 'pedido' && !evento.deleted);
        return {
            dre: dreGerencial(eventos, assignments, config),
            estoque: estoqueInteligente(materiais, eventos),
            previstoRealizado: pedidos.map(pedido => previstoRealizadoPedido(pedido, assignments, materiais, config)),
            roteiros: pedidos.map(pedido => ({ orderId: pedido.id, roteiro: roteiroPedido(pedido.payload || {}) }))
        };
    }

    return {
        numero,
        calcularFichaProduto,
        resumoOrcamentoProfissional,
        roteiroPadraoProduto,
        roteiroPedido,
        previstoRealizadoPedido,
        estoqueInteligente,
        dreGerencial,
        painelGestao
    };
});
