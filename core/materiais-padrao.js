(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MATERIAIS_PADRAO = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const coresLed = ['Branco 3000K', 'Branco 4000K', 'Branco 6000K', 'Amarelo', 'Rosa', 'Roxo', 'Laranja', 'Verde', 'Azul claro', 'Azul escuro', 'Vermelho'];
    const coresAcabamento = ['Natural', 'Branco', 'Preto', 'Prata', 'Bronze', 'Ouro', 'Vermelho', 'Azul', 'Verde', 'Amarelo', 'Outro'];
    const question = (key, label, options = [], fixed = '') => ({ key, label, options, fixed });

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
            question('espessura', 'Espessura', ['1 mm', '2 mm', '3 mm', '5 mm', '10 mm', '15 mm', '19 mm']),
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

    return { materiais, get, labelVariantes };
});
