(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MATERIAIS_PADRAO = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const coresLed = ['Branco 3000K', 'Branco 4000K', 'Branco 6000K', 'Amarelo', 'Rosa', 'Roxo', 'Laranja', 'Verde', 'Azul claro', 'Azul escuro', 'Vermelho'];
    const coresAcabamento = ['Natural', 'Branco', 'Preto', 'Prata', 'Bronze', 'Ouro', 'Vermelho', 'Azul', 'Verde', 'Amarelo', 'Outro'];
    const question = (key, label, options = [], fixed = '') => ({ key, label, options, fixed });
    const supplierEntry = (presetKey, descricao, acabamento, espessura, larguraMm, alturaMm, precoTotal) => ({
        presetKey,
        descricao,
        acabamento,
        espessura,
        larguraMm,
        alturaMm,
        precoTotal
    });

    const tabelasFornecedor = {
        acrilico: [
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 2050x1525x3mm', 'Cristal', '3 mm', 2050, 1525, 83.16),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 3050x2050x3mm', 'Cristal', '3 mm', 3050, 2050, 166.32),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 2050x1525x4mm', 'Cristal', '4 mm', 2050, 1525, 110.67),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 3050x2050x4mm', 'Cristal', '4 mm', 3050, 2050, 221.34),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 2050x1525x5mm', 'Cristal', '5 mm', 2050, 1525, 139.12),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 3050x2050x5mm', 'Cristal', '5 mm', 3050, 2050, 278.24),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 2050x1525x6mm', 'Cristal', '6 mm', 2050, 1525, 166.63),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 3050x2050x6mm', 'Cristal', '6 mm', 3050, 2050, 333.26),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 2050x1525x8mm', 'Cristal', '8 mm', 2050, 1525, 221.96),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 3050x2050x8mm', 'Cristal', '8 mm', 3050, 2050, 443.93),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 2050x1525x10mm', 'Cristal', '10 mm', 2050, 1525, 276.99),
            supplierEntry('acrilico', 'GreenTick Crystal Clear 1000 Acrylic Sheet 3050x2050x10mm', 'Cristal', '10 mm', 3050, 2050, 553.97),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 2050x1525x3mm', 'Opalino', '3 mm', 2050, 1525, 50.08),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 2050x1525x4mm', 'Opalino', '4 mm', 2050, 1525, 66.40),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 2050x1525x8mm', 'Opalino', '8 mm', 2050, 1525, 133.55),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 2050x1525x10mm', 'Opalino', '10 mm', 2050, 1525, 166.75),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 3050x2050x3mm', 'Opalino', '3 mm', 3050, 2050, 100.16),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 3050x2050x4mm', 'Opalino', '4 mm', 3050, 2050, 132.80),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 3050x2050x8mm', 'Opalino', '8 mm', 3050, 2050, 267.11),
            supplierEntry('acrilico', 'CastLight Opal White 2425 Acrylic Sheet 3050x2050x10mm', 'Opalino', '10 mm', 3050, 2050, 333.51)
        ],
        pvc_expandido: [
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x1mm', 'Branco', '1 mm', 2440, 1220, 14.44),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x1mm', 'Branco', '1 mm', 3050, 2050, 30.32),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x2mm', 'Branco', '2 mm', 2440, 1220, 18.16),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x2mm', 'Branco', '2 mm', 3050, 1220, 22.70),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x2mm', 'Branco', '2 mm', 3050, 1560, 29.02),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x2mm', 'Branco', '2 mm', 3050, 2050, 38.14),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x3mm', 'Branco', '3 mm', 2440, 1220, 23.52),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x3mm', 'Branco', '3 mm', 3050, 1220, 29.40),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x3mm', 'Branco', '3 mm', 3050, 1560, 37.59),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x3mm', 'Branco', '3 mm', 3050, 2050, 49.39),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 4050x2050x3mm', 'Branco', '3 mm', 4050, 2050, 65.59),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x4mm', 'Branco', '4 mm', 2440, 1220, 30.66),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x4mm', 'Branco', '4 mm', 3050, 1220, 38.33),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x4mm', 'Branco', '4 mm', 3050, 1560, 49.01),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x4mm', 'Branco', '4 mm', 3050, 2050, 64.40),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x5mm', 'Branco', '5 mm', 2440, 1220, 36.61),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x5mm', 'Branco', '5 mm', 3050, 1220, 45.77),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x5mm', 'Branco', '5 mm', 3050, 1560, 58.52),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x5mm', 'Branco', '5 mm', 3050, 2050, 76.91),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 4050x2050x5mm', 'Branco', '5 mm', 4050, 2050, 102.12),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x6mm', 'Branco', '6 mm', 2440, 1220, 43.16),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x6mm', 'Branco', '6 mm', 3050, 1220, 53.95),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x6mm', 'Branco', '6 mm', 3050, 1560, 68.99),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x6mm', 'Branco', '6 mm', 3050, 2050, 90.66),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x8mm', 'Branco', '8 mm', 2440, 1220, 56.26),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x8mm', 'Branco', '8 mm', 3050, 1220, 70.33),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x8mm', 'Branco', '8 mm', 3050, 1560, 89.93),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x8mm', 'Branco', '8 mm', 3050, 2050, 118.17),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 4050x2050x8mm', 'Branco', '8 mm', 4050, 2050, 156.92),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x10mm', 'Branco', '10 mm', 2440, 1220, 69.95),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1220x10mm', 'Branco', '10 mm', 3050, 1220, 87.44),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x10mm', 'Branco', '10 mm', 3050, 1560, 111.81),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x2050x10mm', 'Branco', '10 mm', 3050, 2050, 146.93),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 4050x2050x10mm', 'Branco', '10 mm', 4050, 2050, 195.11),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x15mm', 'Branco', '15 mm', 2440, 1220, 135.74),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x15mm', 'Branco', '15 mm', 3050, 1560, 216.96),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x19mm', 'Branco', '19 mm', 2440, 1220, 165.21),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 3050x1560x19mm', 'Branco', '19 mm', 3050, 1560, 264.07),
            supplierEntry('pvc_expandido', 'Foamalux White PVC Foam Sheet 2440x1220x24mm', 'Branco', '24 mm', 2440, 1220, 202.42)
        ]
    };

    const materiais = [
        { key: 'fonte', nome: 'Fonte de alimentação', categoria: 'Fonte', formulaPadrao: 'unidade', unidade: 'un', questions: [
            question('tensao', 'Voltagem', ['12 V', '24 V']),
            question('potencia', 'Potência', ['40 W', '60 W', '100 W', '150 W', '200 W', '300 W', '400 W', '500 W'])
        ] },
        { key: 'acrilico', nome: 'Placa de acrílico', categoria: 'Placa', formulaPadrao: 'placa', unidade: 'placa', questions: [
            question('acabamento', 'Tipo / acabamento', ['Cristal', 'Opalino', 'Colorido', 'Espelho prata', 'Espelho bronze', 'Espelho ouro']),
            question('espessura', 'Espessura', ['2 mm', '3 mm', '4 mm', '5 mm', '6 mm', '8 mm', '10 mm'])
        ] },
        { key: 'acm', nome: 'Placa de ACM', categoria: 'Placa', formulaPadrao: 'placa', unidade: 'placa', questions: [
            question('espessura', 'Espessura', [], '3 mm'),
            question('cor', 'Cor', coresAcabamento)
        ] },
        { key: 'pvc_expandido', nome: 'PVC expandido', categoria: 'Placa', formulaPadrao: 'placa', unidade: 'placa', questions: [
            question('espessura', 'Espessura', ['1 mm', '2 mm', '3 mm', '4 mm', '5 mm', '6 mm', '8 mm', '10 mm', '15 mm', '19 mm', '24 mm']),
            question('cor', 'Cor', ['Branco', 'Preto', 'Outro'])
        ] },
        { key: 'metalon_aluminio', nome: 'Perfil metalon de alumínio', categoria: 'Perfil', formulaPadrao: 'barra', unidade: 'barra', comprimentoM: 3, questions: [
            question('medida', 'Medida', ['15 x 30 mm', '20 x 40 mm']),
            question('comprimentoBarra', 'Comprimento comercial', [], '3 m')
        ] },
        { key: 'perfil_caixa_slim', nome: 'Perfil para caixa slim', categoria: 'Perfil', formulaPadrao: 'barra', unidade: 'barra', comprimentoM: 3, questions: [
            question('cor', 'Cor', ['Natural', 'Branco']),
            question('comprimentoBarra', 'Comprimento comercial', [], '3 m')
        ] },
        { key: 'perfil_caixa_luz', nome: 'Perfil para caixa de luz', categoria: 'Perfil', formulaPadrao: 'barra', unidade: 'barra', comprimentoM: 3, questions: [
            question('larguraPerfil', 'Largura', [], '80 mm'),
            question('comprimentoBarra', 'Comprimento comercial', [], '3 m')
        ] },
        { key: 'canto_ligacao', nome: 'Canto de ligação', categoria: 'Estrutura', formulaPadrao: 'unidade', unidade: 'un', questions: [
            question('aplicacao', 'Aplicação', ['Caixa slim', 'Caixa de luz'])
        ] },
        { key: 'fita_led_zigzag', nome: 'Fita LED zig-zag', categoria: 'Iluminação', formulaPadrao: 'linear', unidade: 'm', questions: [
            question('cor', 'Cor / temperatura', coresLed)
        ] },
        { key: 'fita_led_vtec', nome: 'Fita LED V-Tec', categoria: 'Iluminação', formulaPadrao: 'linear', unidade: 'm', questions: [
            question('cor', 'Temperatura', ['Branco 3000K', 'Branco 4000K', 'Branco 6000K'])
        ] },
        { key: 'led_neon', nome: 'LED neon', categoria: 'Iluminação', formulaPadrao: 'linear', unidade: 'm', questions: [
            question('cor', 'Cor / temperatura', coresLed)
        ] },
        { key: 'modulo_led_1w', nome: 'Módulo LED 1 W', categoria: 'Iluminação', formulaPadrao: 'densidade_area', unidade: 'un', questions: [
            question('potencia', 'Potência', [], '1 W'),
            question('cor', 'Cor / temperatura', coresLed)
        ] },
        { key: 'filamento_petg', nome: 'Filamento PETG', categoria: 'Impressao 3D', formulaPadrao: 'unidade', unidade: 'kg', questions: [
            question('cor', 'Cor', ['Branco', 'Preto', 'Natural', 'Transparente', 'Outro']),
            question('diametro', 'Diametro', [], '1,75 mm')
        ] },
        { key: 'router_cnc', nome: 'Router CNC', categoria: 'Maquina', formulaPadrao: 'hora', unidade: 'h', questions: [
            question('tipo', 'Tipo', [], 'Corte / usinagem CNC')
        ] },
        { key: 'maquina_laser', nome: 'Maquina Laser', categoria: 'Maquina', formulaPadrao: 'hora', unidade: 'h', questions: [
            question('tipo', 'Tipo', [], 'Corte laser')
        ] },
        { key: 'mao_obra_acabamento', nome: 'Mao de obra de acabamento', categoria: 'Acabamento', formulaPadrao: 'hora', unidade: 'h', questions: [
            question('tipo', 'Tipo', ['Acabamento', 'Montagem', 'Solda', 'Pintura', 'Outro'])
        ] },
        { key: 'adesivo', nome: 'Adesivo', categoria: 'Adesivo', formulaPadrao: 'area', unidade: 'm²', questions: [
            question('tipo', 'Tipo', ['Brilho', 'Fosco', 'Transparente', 'Impressão digital', 'Outro'])
        ] },
        { key: 'outro', nome: 'Outro material', categoria: 'Outros', formulaPadrao: 'unidade', unidade: 'un', questions: [
            question('descricao', 'Descrição')
        ] }
    ];

    function get(key) {
        return materiais.find(material => material.key === key) || materiais[materiais.length - 1];
    }

    function labelVariantes(variantes = {}) {
        return Object.values(variantes).filter(Boolean).join(' | ');
    }

    function tabelaFornecedor(key) {
        return tabelasFornecedor[key] || [];
    }

    return { materiais, tabelasFornecedor, get, labelVariantes, tabelaFornecedor };
});
