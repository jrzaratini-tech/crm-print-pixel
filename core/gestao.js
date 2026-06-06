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
    const PETG_DENSITY_G_CM3 = 1.27;
    const NEPTUNE_4_MAX = {
        nome: 'ELEGOO Neptune 4 Max',
        larguraMm: 420,
        profundidadeMm: 420,
        alturaMm: 480,
        velocidadeMaxMmS: 500,
        temperaturaMaxC: 300,
        gramasPorHora: 75,
        custoHoraImpressora: 2,
        energiaKw: 0.35,
        custoKwh: 0.25
    };
    const PETG_PRINT_PROFILE = {
        nome: 'Extra Draft 0.28',
        alturaCamadaMm: 0.28,
        larguraLinhaMm: 0.42,
        espessuraParedeMm: 0.8,
        espessuraTopoBaseMm: 1,
        densidadePreenchimento: 0.9,
        velocidadeImpressaoMmS: 100,
        velocidadeParedeMmS: 50,
        aceleracaoMmS2: 2000,
        temperaturaBicoC: 240,
        temperaturaMesaC: 70
    };
    const LETTER_FACTORS = {
        A: 4.3, B: 4.8, C: 3.8, D: 4.4, E: 4.1, F: 3.7, G: 4.6, H: 4.2, I: 2.4, J: 3.1,
        K: 4.2, L: 3.0, M: 5.3, N: 4.5, O: 4.4, P: 4.0, Q: 4.8, R: 4.7, S: 4.2, T: 3.5,
        U: 4.0, V: 3.7, W: 5.5, X: 4.1, Y: 3.8, Z: 3.8,
        0: 4.4, 1: 2.5, 2: 4.0, 3: 4.1, 4: 4.0, 5: 4.0, 6: 4.4, 7: 3.4, 8: 4.8, 9: 4.4
    };

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

    function normalizeLetter(value) {
        return texto(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
    }

    function lettersFromWord(word = '') {
        const counts = {};
        normalizeLetter(word).split('').forEach(letter => {
            counts[letter] = (counts[letter] || 0) + 1;
        });
        return Object.entries(counts).map(([letter, quantidade]) => ({ letter, quantidade }));
    }

    function larguraTextoLetreiroCm(textoEntrada = '', alturaCm = 0) {
        const textoNormalizado = texto(textoEntrada)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
        const largura = textoNormalizado.split('').reduce((total, char) => {
            if (char === ' ') return total + (alturaCm * 0.35);
            if (char === 'I' || char === '1') return total + (alturaCm * 0.28);
            if (char === 'M' || char === 'W') return total + (alturaCm * 0.95);
            if (char === 'J' || char === 'T' || char === 'L') return total + (alturaCm * 0.48);
            if (/[A-Z0-9]/.test(char)) return total + (alturaCm * 0.68);
            return total;
        }, 0);
        return Math.round(largura * 100) / 100;
    }

    function calcularFatorAprendizadoPETG(historico = [], campoPrevisto, campoReal) {
        const fatores = (Array.isArray(historico) ? historico : [])
            .map(item => {
                const previsto = numero(item[campoPrevisto]);
                const real = numero(item[campoReal]);
                if (previsto <= 0 || real <= 0) return 0;
                return real / previsto;
            })
            .filter(fator => fator >= 0.5 && fator <= 2);
        if (!fatores.length) return 1;
        const media = fatores.reduce((total, fator) => total + fator, 0) / fatores.length;
        return Math.round(media * 1000) / 1000;
    }

    function calcularLetraCaixaPETG(config = {}) {
        const alturaCm = Math.max(0, numero(config.alturaCm));
        const profundidadeCm = Math.max(0, numero(config.profundidadeCm || config.espessuraCm));
        const paredeMm = Math.max(0.1, numero(config.paredeMm || PETG_PRINT_PROFILE.espessuraParedeMm));
        const paredeCm = paredeMm / 10;
        const topoBaseMm = Math.max(0, numero(config.espessuraTopoBaseMm ?? PETG_PRINT_PROFILE.espessuraTopoBaseMm));
        const topoBaseCm = topoBaseMm / 10;
        const preenchimento = Math.max(0, Math.min(1, numero(config.preenchimentoPercentual ?? (PETG_PRINT_PROFILE.densidadePreenchimento * 100)) / 100));
        const areaFaceCoeficiente = Math.max(0, numero(config.areaFaceCoeficiente ?? 0.42));
        const perda = Math.max(0, numero(config.perdaPercentual ?? 10)) / 100;
        const precoKg = dinheiro(config.precoKgFilamento || config.precoKg || 0);
        const gramasPorHora = Math.max(1, numero(config.gramasPorHora || NEPTUNE_4_MAX.gramasPorHora));
        const custoHoraImpressora = Math.max(0, numero(config.custoHoraImpressora ?? NEPTUNE_4_MAX.custoHoraImpressora));
        const energiaKw = Math.max(0, numero(config.energiaKw ?? NEPTUNE_4_MAX.energiaKw));
        const custoKwh = Math.max(0, numero(config.custoKwh ?? NEPTUNE_4_MAX.custoKwh));
        const letras = Array.isArray(config.letras) && config.letras.length
            ? config.letras
            : lettersFromWord(config.palavra || '');

        const detalhes = letras
            .map(item => {
                const letter = normalizeLetter(item.letter || item.letra).charAt(0);
                const quantidade = Math.max(0, Math.round(numero(item.quantidade) || 0));
                if (!letter || !quantidade) return null;
                const fator = LETTER_FACTORS[letter] || 4.2;
                const contornoCm = alturaCm * fator;
                const volumeParedeCm3 = contornoCm * profundidadeCm * paredeCm;
                const areaFaceCm2 = Math.pow(alturaCm, 2) * areaFaceCoeficiente;
                const volumeFaceCm3 = areaFaceCm2 * topoBaseCm * preenchimento;
                const volumeCm3 = (volumeParedeCm3 + volumeFaceCm3) * quantidade;
                const gramas = volumeCm3 * PETG_DENSITY_G_CM3 * (1 + perda);
                const horas = gramas / gramasPorHora;
                return {
                    letter,
                    quantidade,
                    fator,
                    contornoCm: Math.round(contornoCm * 100) / 100,
                    areaFaceCm2: Math.round(areaFaceCm2 * 100) / 100,
                    volumeParedeCm3: Math.round(volumeParedeCm3 * quantidade * 100) / 100,
                    volumeFaceCm3: Math.round(volumeFaceCm3 * quantidade * 100) / 100,
                    volumeCm3: Math.round(volumeCm3 * 100) / 100,
                    gramas: Math.round(gramas * 100) / 100,
                    horas: Math.round(horas * 100) / 100
                };
            })
            .filter(Boolean);

        const gramasBaseTotal = detalhes.reduce((total, item) => total + item.gramas, 0);
        const horasBaseTotal = detalhes.reduce((total, item) => total + item.horas, 0);
        const fatorMaterial = calcularFatorAprendizadoPETG(config.historicoReal, 'gramasEstimadas', 'gramasReais');
        const fatorTempo = calcularFatorAprendizadoPETG(config.historicoReal, 'horasEstimadas', 'horasReais');
        const gramasTotal = gramasBaseTotal * fatorMaterial;
        const horasTotal = horasBaseTotal * fatorTempo;
        const custoFilamento = (gramasTotal / 1000) * precoKg;
        const custoMaquina = horasTotal * custoHoraImpressora;
        const custoEnergia = horasTotal * energiaKw * custoKwh;
        const segmentacaoRecomendada = alturaCm * 10 > NEPTUNE_4_MAX.alturaMm
            || profundidadeCm * 10 > Math.min(NEPTUNE_4_MAX.larguraMm, NEPTUNE_4_MAX.profundidadeMm);

        return {
            tipo: 'letra_caixa_petg_3d',
            impressora: NEPTUNE_4_MAX.nome,
            volumeUtilMm: `${NEPTUNE_4_MAX.larguraMm} x ${NEPTUNE_4_MAX.profundidadeMm} x ${NEPTUNE_4_MAX.alturaMm}`,
            perfilImpressao: PETG_PRINT_PROFILE,
            paredeMm,
            larguraLinhaMm: PETG_PRINT_PROFILE.larguraLinhaMm,
            alturaCamadaMm: PETG_PRINT_PROFILE.alturaCamadaMm,
            espessuraTopoBaseMm: topoBaseMm,
            preenchimentoPercentual: Math.round(preenchimento * 10000) / 100,
            areaFaceCoeficiente,
            alturaCm,
            profundidadeCm,
            precoKgFilamento: precoKg,
            gramasPorHora,
            detalhes,
            gramasBaseTotal: Math.round(gramasBaseTotal * 100) / 100,
            horasBaseTotal: Math.round(horasBaseTotal * 100) / 100,
            gramasTotal: Math.round(gramasTotal * 100) / 100,
            horasTotal: Math.round(horasTotal * 100) / 100,
            aprendizado: {
                amostras: Array.isArray(config.historicoReal) ? config.historicoReal.length : 0,
                fatorMaterial,
                fatorTempo
            },
            custoFilamento: dinheiro(custoFilamento),
            custoMaquina: dinheiro(custoMaquina),
            custoEnergia: dinheiro(custoEnergia),
            custoTotal: dinheiro(custoFilamento + custoMaquina + custoEnergia),
            cabeNaMaquina: true,
            segmentacaoRecomendada,
            alerta: segmentacaoRecomendada ? 'Peca grande: calcular normalmente e imprimir em partes quando necessario.' : ''
        };
    }

    function calcularLetreiroPETG(config = {}) {
        const entradas = Array.isArray(config.entradas) && config.entradas.length
            ? config.entradas
            : [{
                palavra: config.palavra,
                alturaCm: config.alturaCm || (numero(config.alturaMm) / 10),
                profundidadeCm: config.profundidadeCm || config.espessuraCm || (numero(config.profundidadeMm) / 10)
            }];
        const precoKgFilamento = config.precoKgFilamento || config.precoKg || 0;
        const perdaPercentual = config.perdaPercentual ?? 10;
        const gramasPorHora = config.gramasPorHora || NEPTUNE_4_MAX.gramasPorHora;
        const historicoReal = config.historicoReal || [];
        const partes = entradas
            .map((entrada, index) => {
                const calculo = calcularLetraCaixaPETG({
                    ...config,
                    palavra: entrada.palavra || entrada.texto || '',
                    letras: entrada.letras,
                    alturaCm: entrada.alturaCm || (numero(entrada.alturaMm) / 10),
                    profundidadeCm: entrada.profundidadeCm || entrada.espessuraCm || (numero(entrada.profundidadeMm) / 10) || config.profundidadeCm || (numero(config.profundidadeMm) / 10),
                    precoKgFilamento,
                    perdaPercentual,
                    gramasPorHora,
                    historicoReal
                });
                return {
                    id: entrada.id || `entrada_${index + 1}`,
                texto: entrada.palavra || entrada.texto || '',
                alturaCm: calculo.alturaCm,
                alturaMm: Math.round(calculo.alturaCm * 10 * 100) / 100,
                profundidadeCm: calculo.profundidadeCm,
                profundidadeMm: Math.round(calculo.profundidadeCm * 10 * 100) / 100,
                larguraEstimadaCm: larguraTextoLetreiroCm(entrada.palavra || entrada.texto || '', calculo.alturaCm),
                calculo
            };
            })
            .filter(parte => parte.texto || parte.calculo.detalhes.length);
        const gramasTotal = partes.reduce((total, parte) => total + parte.calculo.gramasTotal, 0);
        const horasTotal = partes.reduce((total, parte) => total + parte.calculo.horasTotal, 0);
        const custoFilamento = partes.reduce((total, parte) => total + parte.calculo.custoFilamento, 0);
        const custoMaquina = partes.reduce((total, parte) => total + parte.calculo.custoMaquina, 0);
        const custoEnergia = partes.reduce((total, parte) => total + parte.calculo.custoEnergia, 0);
        const contornoTotalM = partes.reduce((total, parte) => {
            return total + parte.calculo.detalhes.reduce((soma, detalhe) => soma + ((detalhe.contornoCm * detalhe.quantidade) / 100), 0);
        }, 0);
        const fatorLed = Math.max(0, numero(config.fatorLed ?? 1.2));
        const ledEstimadoM = Math.round(contornoTotalM * fatorLed * 100) / 100;
        const ledManualM = numero(config.ledManualM);
        const ledFinalM = ledManualM > 0 ? ledManualM : ledEstimadoM;
        const larguraEstimadaCm = partes.reduce((maior, parte) => Math.max(maior, parte.larguraEstimadaCm || 0), 0);

        return {
            tipo: 'letreiro_petg_led',
            partes,
            entradas: partes.map(parte => ({
                id: parte.id,
                texto: parte.texto,
                alturaCm: parte.alturaCm,
                alturaMm: parte.alturaMm,
                profundidadeCm: parte.profundidadeCm,
                profundidadeMm: parte.profundidadeMm,
                larguraEstimadaCm: parte.larguraEstimadaCm,
                larguraEstimadaMm: Math.round((parte.larguraEstimadaCm * 10) * 100) / 100,
                gramas: parte.calculo.gramasTotal,
                horas: parte.calculo.horasTotal
            })),
            gramasTotal: Math.round(gramasTotal * 100) / 100,
            horasTotal: Math.round(horasTotal * 100) / 100,
            custoFilamento: dinheiro(custoFilamento),
            custoMaquina: dinheiro(custoMaquina),
            custoEnergia: dinheiro(custoEnergia),
            custoTotal: dinheiro(custoFilamento + custoMaquina + custoEnergia),
            contornoTotalM: Math.round(contornoTotalM * 100) / 100,
            contornoTotalMm: Math.round(contornoTotalM * 1000 * 100) / 100,
            larguraEstimadaCm,
            larguraEstimadaM: Math.round((larguraEstimadaCm / 100) * 100) / 100,
            larguraEstimadaMm: Math.round(larguraEstimadaCm * 10 * 100) / 100,
            fatorLed,
            ledEstimadoM,
            ledEstimadoMm: Math.round(ledEstimadoM * 1000 * 100) / 100,
            ledFinalM,
            ledFinalMm: Math.round(ledFinalM * 1000 * 100) / 100,
            segmentacaoRecomendada: partes.some(parte => parte.calculo.segmentacaoRecomendada),
            alerta: partes.some(parte => parte.calculo.segmentacaoRecomendada)
                ? 'Uma ou mais partes podem precisar de impressao segmentada.'
                : ''
        };
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
        lettersFromWord,
        larguraTextoLetreiroCm,
        calcularLetraCaixaPETG,
        calcularLetreiroPETG,
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
