(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CUSTEIO = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const formulas = {
        area: 'Área aplicada (m²)',
        perimetro: 'Contorno / perímetro (m)',
        linear: 'Comprimento informado (m)',
        densidade_area: 'Densidade por área (un.)',
        unidade: 'Quantidade informada (un.)',
        hora: 'Hora de maquina / mao de obra',
        placa: 'Aproveitamento por placa',
        barra: 'Aproveitamento por barra'
    };

    function numero(value) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function fatorPerda(item, material) {
        const perda = item.perdaPercentual === '' || item.perdaPercentual === undefined
            ? numero(material.perdaPercentual)
            : numero(item.perdaPercentual);
        return 1 + Math.max(0, perda) / 100;
    }

    function calcular(item = {}, material = {}) {
        const formula = item.formula || material.formulaPadrao || 'unidade';
        const larguraM = numero(item.larguraCm) / 100;
        const alturaM = numero(item.alturaCm) / 100;
        const quantidade = Math.max(0, numero(item.quantidade) || 1);
        const area = larguraM * alturaM * quantidade;
        const perimetro = 2 * (larguraM + alturaM) * quantidade;
        const linear = numero(item.comprimentoM) * quantidade;
        const horas = numero(item.horas) * quantidade;
        const perda = fatorPerda(item, material);
        let consumo = 0;
        let unidade = material.unidade || 'un';
        let precoUnitario = numero(material.precoCusto);
        const precoTotal = numero(material.precoTotal || material.precoCompraTotal || material.precoUnitarioComercial);
        const areaComercial = (numero(material.larguraCm) / 100) * (numero(material.alturaCm) / 100);
        const comprimentoComercial = numero(material.comprimentoM);

        if (['area', 'perimetro', 'linear'].includes(formula) && precoTotal > 0) {
            if (formula === 'area' && areaComercial > 0) precoUnitario = precoTotal / areaComercial;
            if ((formula === 'linear' || formula === 'perimetro') && comprimentoComercial > 0) precoUnitario = precoTotal / comprimentoComercial;
        }

        if (formula === 'area') consumo = area * perda;
        if (formula === 'perimetro') consumo = perimetro * perda;
        if (formula === 'linear') consumo = linear * perda;
        if (formula === 'densidade_area') consumo = Math.ceil(area * numero(material.densidadePorM2) * perda);
        if (formula === 'unidade') consumo = Math.ceil(quantidade * perda);
        if (formula === 'hora') {
            consumo = horas;
            unidade = material.unidade || 'h';
        }
        if (formula === 'placa') {
            const areaPlaca = (numero(material.larguraCm) / 100) * (numero(material.alturaCm) / 100);
            consumo = areaPlaca > 0 ? Math.ceil((area * perda) / areaPlaca) : 0;
            unidade = 'placa';
        }
        if (formula === 'barra') {
            const comprimentoBarra = numero(material.comprimentoM);
            consumo = comprimentoBarra > 0 ? Math.ceil((linear * perda) / comprimentoBarra) : 0;
            unidade = 'barra';
        }

        const custo = consumo * precoUnitario;
        return { formula, consumo, custo, unidade, area, perimetro, linear, horas, precoUnitario };
    }

    function calcularFicha(itens = [], materiais = []) {
        const porId = new Map(materiais.map(material => [material.id, material]));
        const detalhes = itens.map(item => {
            const material = porId.get(item.materialId) || {};
            return { ...item, material, calculo: calcular(item, material) };
        });
        return {
            detalhes,
            custoTotal: detalhes.reduce((total, detalhe) => total + detalhe.calculo.custo, 0)
        };
    }

    return { formulas, numero, calcular, calcularFicha };
});
