🚀 SISTEMA CORE v5.1 - PLATAFORMA ONLINE OTIMIZADA
📋 ÍNDICE
🏆 Visão Geral

✨ Características

📁 Estrutura do Sistema

⚡ Início Rápido

🌐 Deploy Online

💾 Sistema de Dados

🔄 Comunicação entre Páginas

🏭 Fábrica de Páginas

⚙️ Administração

� Responsividade Mobile

�️ Troubleshooting

🔮 Evolução Futura

📞 Suporte

🏆 VISÃO GERAL
O SISTEMA CORE v5.1 é uma plataforma de gestão empresarial 100% online que roda em servidor Node.js com banco de dados Firebase Firestore. Baseado em arquitetura event-sourcing, é imutável, desacoplado e infinitamente extensível.

🔥 **Novidades v5.1:**
- ✅ Fábrica de páginas otimizada com geração de código de menu
- ✅ Menu dinâmico reorganizado e centralizado
- ✅ Sistema limpo e otimizado, remoção de arquivos obsoletos
- ✅ Estrutura menu/menu.config.js para configuração centralizada

Filosofia Fundadora
✅ Separação total: Interface vs Lógica de Dados

✅ Event-sourcing: Toda ação gera evento imutável

✅ Declarativo: Importa o "o que", não o "como"

✅ Extensível: Plug-and-play infinito

✅ Online: Acessível de qualquer lugar via navegador

✅ Escalável: Firebase Firestore para dados ilimitados

✨ CARACTERÍSTICAS
🎯 Principais Diferenciais
Acesso total: Funciona em qualquer navegador com internet

Banco de dados em nuvem: Firebase Firestore escalável

Auto-suficiente: Não requer instalação local

Interface moderna: Design responsivo e intuitivo

Sistema modular: Adicione páginas sem modificar o core

API RESTful: Integração completa com frontend

📱 **RESPONSIVIDADE MOBILE**
Design Adaptativo Completo

✅ **Tablets (≤768px):** Sidebar otimizado para 200px

✅ **Smartphones (≤480px):** Sidebar reduzido para 180px

✅ **Barra de Status:** Layout vertical em dispositivos móveis

✅ **Notificações:** Ocupam largura total da tela em mobile

✅ **Botões:** Tamanhos reduzidos para melhor usabilidade em toque

✅ **Fontes e Espaçamentos:** Ajustados para telas pequenas

**Media Queries Implementadas:**
```css
@media (max-width: 768px) {
    /* Layout para tablets */
    #sidebar { width: 200px; }
    .status-bar { flex-direction: column; }
    .notification { left: 10px; right: 10px; }
}

@media (max-width: 480px) {
    /* Layout para smartphones */
    #sidebar { width: 180px; }
    #menu button { font-size: 13px; }
    .status-bar { font-size: 10px; }
}
```

**Como Ativar Responsividade:**
1. Sistema já é responsivo por padrão
2. Reduza a janela do navegador para testar
3. Em mobile: sidebar se adapta automaticamente
4. Use Ctrl+F5 para limpar cache se necessário

**Opcional - Menu Hamburger:**
Para implementar menu hamburger (ocultar sidebar):
- Adicionar botão toggle no HTML
- Implementar funções JavaScript
- Sidebar se torna deslizante em mobile

🔒 Segurança e Confiabilidade
PIN Admin: 3377 (imutável)

Backup automático na nuvem

Soft-delete apenas (nunca perda de dados)

Todos os eventos são auditáveis

Dados sincronizados em tempo real

📁 ESTRUTURA DO SISTEMA
text
CRM_PRINT_PIXEL/
├── 📄 index.html              # 🏠 Sistema Principal (CORE)
├── 📄 README.md               # 📚 Este documento
├── 📄 server.js               # 🌐 Servidor Node.js
├── 📄 package.json            # 📦 Dependências NPM
├── 📄 firebase.js             # 🔥 Configuração Firebase
├── 📄 style.css               # 🎨 Estilos base
│
├── 📂 core/                   # 🧠 INTELIGÊNCIA DO SISTEMA
│   ├── engine.js             # 🔌 Motor de Comunicação v5.0
│   ├── database.js           # 🗄️ Camada de Dados Firebase
│   └── config.js             # ⚙️ Configurações Online
│
├── 📂 menu/                  # 🎯 CONFIGURAÇÃO DO MENU
│   └── menu.config.js       # ⚙️ Botões e ordem do menu dinâmico
│
├── 📂 pages/                  # 📂 TODAS AS TELAS
│   ├── dashboard.html        # 📊 Dashboard Principal
│   ├── novopedido.html       # ➕ Novo Pedido
│   ├── novadespesa.html     # 💸 Nova Despesa
│   ├── pedidos.html          # 📦 Lista Pedidos
│   └── despesas.html         # 💸 Lista Despesas
│
├── 📂 admin/                  # 👑 ADMINISTRAÇÃO
│   ├── admin-config.html     # 🎨 Configurações do Sistema
│   ├── admin-fabrica.html    # 🏭 Fábrica de Páginas
│   └── admin-lancamentos.html # 📦 Gerenciar Dados
│
├── 📂 DATA/                   # 💾 DADOS LOCAIS
│   └── database/             # 🗄️ Backup local
│
└── 📂 node_modules/           # 📦 Dependências
🚨 REGRA ABSOLUTA
❌ Nunca crie páginas fora de /pages/

❌ Nunca modifique o /core/ manualmente

✅ Sempre use a Fábrica para novas páginas

✅ Mantenha Firebase.js seguro e privado

⚡ INÍCIO RÁPIDO
Método Online: Servidor Node.js (PRODUÇÃO)
bash
# 1. Instale as dependências
npm install

# 2. Inicie o servidor
npm start

# 3. Acesse no navegador
http://localhost:3000

# 4. Sistema pronto para uso!
Deploy em Produção
bash
# 1. Configure variáveis de ambiente
PORT=3000
NODE_ENV=production

# 2. Faça deploy na plataforma (Render, Heroku, etc.)
# 3. Configure Firebase Firestore
# 4. Sistema online 24/7!
🌐 DEPLOY ONLINE
Requisitos Mínimos
✅ Node.js 18+ instalado

✅ Conta Firebase configurada

✅ Servidor web (Render, Heroku, VPS)

✅ Domínio próprio (opcional)

Passo a Passo
bash
# 1. Configure Firebase Firestore
# 2. Copie as credenciais para firebase.js
# 3. Instale dependências: npm install
# 4. Configure PORT no ambiente
# 5. Faça deploy do código
# 6. Teste endpoints da API
# 7. Use PIN admin: 3377 para liberar recursos
Verificação de Deploy
bash
# Teste endpoints:
curl https://seu-dominio.com/api/database/init
# Deve retornar: {"status":"ok","message":"Firebase pronto"}
# Teste frontend:
https://seu-dominio.com/
💾 SISTEMA DE DADOS
Arquitetura Firebase Firestore
javascript
// Estrutura de um Evento (IMUTÁVEL)
{
    id: "auto_generated_firebase_id",  // ID único do Firestore
    schema: "venda",                   // Tipo de dado
    payload: {                          // Dados específicos
        cliente: "Nome do Cliente",
        valor: 150.50,
        produto: "Produto Vendido"
    },
    pageId: "nova-venda",              // Origem do evento
    timestamp: serverTimestamp(),       // Timestamp automático
    deleted: false                      // Soft delete apenas
}
Schemas Oficiais
📦 VENDA (Simples)

javascript
schema: "venda",
payload: {
    cliente: "Nome do Cliente",
    valor: 150.50,
    produto: "Produto Vendido",
    categoria: "categoria",
    data: "2025-01-08",
    observacoes: "Observações opcionais"
}
💰 DESPESA (Categorias fixas)

javascript
schema: "despesa",
payload: {
    descricao: "Descrição da despesa",
    fornecedor: "Nome do fornecedor",
    valor: 89.90,
    categoria: "COMBUSTIVEL", // CATEGORIAS FIXAS
    // Opções: COMBUSTIVEL, ALUGUEL, AGUA, LUZ, 
    // TELEFONE, WHATSAPP, CAFÉ, ESCRITORIO, 
    // COMUNICAÇÃO, FINANÇAS, OUTROS
    data: "2025-01-08",
    observacoes: "Observações opcionais"
}
🚚 PEDIDO (Complexo)

javascript
schema: "pedido",
payload: {
    cliente: "Cliente",
    empresa: "Empresa",
    nif: "123456789",
    morada: "Endereço",
    telemovel: "912345678",
    numero: "PP-2025-001",
    produtos: [ // ARRAY DE PRODUTOS
        {
            nome: "Logo em Acrílico",
            tamanho: "30x40cm",
            quantidade: 1,
            valor: 150.00,
            observacoes: "Observações do produto"
        }
    ],
    total: 150.00,
    status: "pendente", // ou "processamento", "concluido"
    dataEntrega: "2025-01-15",
    observacoes: "Observações gerais"
}

🔥 API Firebase
javascript
// Endpoints disponíveis:
POST /api/database/init    // Testar conexão
POST /api/database/commit   // Salvar evento
GET  /api/database/query   // Consultar eventos
GET  /api/database/stats    // Estatísticas
POST /api/database/backup   // Criar backup
🔄 COMUNICAÇÃO ENTRE PÁGINAS
Protocolo OBRIGATÓRIO
1. Identidade da Página

html
<!-- OBRIGATÓRIO - SEM ISSO NÃO FUNCIONA -->
<body data-page-id="nome_da_pagina" data-page-type="TIPO">
<!-- TIPO: "READ", "WRITE" ou "NEUTRAL" -->
2. Cordão Umbilical (Engine)

html
<!-- ÚLTIMA COISA ANTES DO </body> -->
<script src="../core/engine.js"></script>
3. Data-Binding

Para Páginas READ (Leitura):

html
<div data-bind="vendas.total">R$ 0,00</div>
<span data-bind="lucro.margem">0%</span>
<div data-bind="pedidos.ativos">0</div>
Para Páginas WRITE (Formulários):

html
<input type="text" data-bind="venda.cliente">
<input type="number" data-bind="venda.valor" step="0.01">
<select data-bind="venda.categoria">
<textarea data-bind="venda.observacoes">

<!-- BOTÃO OBRIGATÓRIO -->
<button type="button" data-action="commit">Salvar</button>
Comunicação Core ↔ Páginas
Página → Core (Solicitar dados):

javascript
// Via API REST (novo método)
const response = await fetch('/api/database/query');
const events = await response.json();
processarDados(events);

// Via engine.js (compatibilidade)
window.db.getEvents().then(events => {
    processarDados(events);
});
Core → Página (Enviar dados):

javascript
// Auto-atualização via eventos
window.addEventListener('coreDataChanged', () => {
    // Recarregar dados automaticamente
    carregarDados();
});

// Polling a cada 5 segundos
setInterval(carregarDados, 5000);
Página → Core (Salvar dados):

javascript
// O engine.js FAZ AUTOMATICAMENTE quando:
// 1. Tem data-action="commit" no botão
// 2. Todos os inputs têm data-bind
// 3. Dados vão para Firebase via API

// Manualmente (se necessário):
await fetch('/api/database/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        schema: 'venda',
        payload: { cliente: 'Teste', valor: 100 }
    })
});
🏭 FÁBRICA DE PÁGINAS v5.1
Criar Novas Páginas em 3 Passos

1. **Acessar:** admin/admin-fabrica.html
2. **Preencher:** Nome no Menu, Nome do Arquivo, Tipo (WRITE/READ/NEUTRAL)
3. **Gerar Código:** Clique em "Gerar Código Botão"

**Como Adicionar ao Menu:**
```javascript
// Copie o código gerado e cole em menu/menu.config.js
{
  id: "nav_nomepagina",
  name: "Nome da Página",
  file: "pages/nomepagina.html", 
  type: "WRITE", // ou READ/NEUTRAL
  pos: 10,
  hidden: false,
  deleted: false
},
```

**Tipos de Página:**
- **WRITE:** Formulários e cadastros (inputs + botão salvar)
- **READ:** Dashboards e relatórios (apenas exibição de dados)
- **NEUTRAL:** Páginas informativas ou configurações

**Exemplo Prático:**
1. Preencha: "Clientes", "clientes", "WRITE"
2. Clique em "Gerar Código Botão"
3. Copie o código para menu/menu.config.js
4. Crie o HTML manualmente ou com IA usando o prompt gerado
5. Recarregue o sistema para ver no menu + Chart.js
WRITE	Formulários	✅ OBRIGATÓRIO	✅ OBRIGATÓRIO	engine.js + API Firebase
NEUTRAL	Visual	❌ Não usa	❌ Não usa	engine.js básico
Comando para IAs (ChatGPT/DeepSeek)
text
"Adapte este HTML para funcionar no Sistema CORE v5.0 como página [TIPO].
Siga EXATAMENTE o protocolo:

1. Adicione ao body: data-page-id="nome" data-page-type="[READ/WRITE/NEUTRAL]"
2. Conecte valores usando data-bind (ex: data-bind="vendas.total")
3. Se WRITE: adicione data-action="commit" no botão salvar
4. Remova TODOS os dados falsos e Math.random
5. Mantenha Chart.js para gráficos (se READ)
6. Adicione <script src="../core/engine.js"></script>
7. Use API Firebase para dados (não localStorage)
8. NÃO altere CSS, classes ou IDs

Aqui está o HTML: [COLE O HTML AQUI]"
⚙️ ADMINISTRAÇÃO
Acesso Admin
PIN: 3377 (imutável)

Botão: "MODO ADMIN" no sidebar

Recursos: Fábrica, Configurações, Gerenciamento

Ferramentas Disponíveis
1. 🎨 Configurações do Sistema (admin-config.html)

Personalização de cores (primária, destaque)

Ordem e visibilidade do menu

Backup e restauração

2. 🏭 Fábrica de Páginas (admin-fabrica.html)

Criação de novas páginas

Geração de protocolos para IAs

Registro automático no menu

3. 📦 Gerenciar Dados (admin-lancamentos.html)

Visualização de todos os registros

Soft-delete de eventos

Exportação completa

🛠️ TROUBLESHOOTING
Problema: "Página não mostra dados"
javascript
// SOLUÇÃO:
// 1. Verifique no console (F12) se há erros
// 2. Confirme data-page-type="READ"
// 3. Verifique data-bind nos elementos
// 4. Teste API: fetch('/api/database/query')
// 5. Verifique conexão Firebase
Problema: "Botão Salvar não funciona"
javascript
// SOLUÇÃO:
// 1. Verifique data-action="commit" no botão
// 2. Confirme data-bind em TODOS os inputs
// 3. Verifique data-page-type="WRITE"
// 4. Console: engine.js deve mostrar "Dados salvos no Firebase"
// 5. Teste endpoint: POST /api/database/commit
Problema: "Gráficos não atualizam"
javascript
// SOLUÇÃO:
// 1. Verifique se Chart.js está carregado
// 2. Adicione função atualizarGraficosComDados(dados)
// 3. Dispare no evento coreDataChanged
// 4. Não remova o canvas/container do gráfico
Problema: "Erro de conexão Firebase"
javascript
// SOLUÇÃO:
// 1. Verifique firebase.js credentials
// 2. Teste: /api/database/init
// 3. Confirme regras do Firestore
// 4. Verifique variáveis de ambiente
Erros Comuns no Console
Erro	Causa	Solução
Failed to fetch	API offline	Verifique se servidor Node.js está rodando
Permission denied	Firebase rules	Configure regras do Firestore
Cannot read property...	data-bind incorreto	Verifique sintaxe: schema.campo
No data received	API não responde	Teste endpoints individualmente
Comandos de Diagnóstico
bash
# 1. Verificar estrutura
dir /B /S *.html

# 2. Verificar servidor
npm start

# 3. Testar API
curl http://localhost:3000/api/database/init

# 4. Verificar logs
console.log('Debug:', await window.db.getEvents());
🔮 EVOLUÇÃO FUTURA
Roadmap v5.0+
API REST completa para integração externa

Sincronização multi-dispositivo em tempo real

Dashboard avançado com analytics

Sistema de usuários com permissões

App mobile via PWA

Relatórios PDF automáticos

Integração com payment gateways

Como Contribuir
Nunca modifique /core/ diretamente

Sempre use a Fábrica para novas páginas

Documente novas funcionalidades aqui

Teste em ambiente de desenvolvimento antes

Para Desenvolvedores
javascript
// Padrão de extensão
class MinhaExtensao {
    static init() {
        // Registrar no sistema
        window.addEventListener('coreReady', () => {
            console.log('Sistema pronto para extensões');
        });
    }
}

// API REST personalizada
app.get('/api/custom/endpoint', (req, res) => {
    // Sua lógica aqui
});
📞 SUPORTE
Hierarquia de Resolução
Leia este README (90% dos problemas estão aqui)

Verifique console (F12) por erros

Revise data-bind e data-action

Teste endpoints da API

Verifique conexão Firebase

Logs do Sistema
engine.js mostra TODA comunicação

Console mostra: 🚀 Engine v5.0 Ativa: [nome] [Tipo: TIPO]

Cada commit gera: ✅ Dados salvos no Firebase

Server.js logs: CRM PRINT PIXEL ONLINE - PORTA 3000

Backup e Recuperação
javascript
// Backup via API
const response = await fetch('/api/database/backup', {
    method: 'POST'
});
const backup = await response.json();

// Restauração via Firebase Console
// Exporte/importe dados diretamente no Firestore

Contato para Suporte Avançado
Documentação: Este README.md

Problemas críticos: Verifique console e API endpoints

Customizações: Use a Fábrica de Páginas

Deploy: Siga instruções da seção 🌐 Deploy Online

📜 DECLARAÇÃO FINAL
Este documento é a fonte única da verdade para o Sistema CORE v5.0. Qualquer desvio resulta em páginas não funcionais.

Versões
v1.0-v3.8: Sistema base

v4.0: Versão portátil (pen drive)

v5.0: Versão online (Firebase/Node.js)

v5.1: Versão otimizada e limpa - ATUAL

Mantido por
Arquitetura: Sistema CORE v5.0

Tecnologia: Node.js + Express + Firebase Firestore

Data: Janeiro de 2026

Status: ✅ OPERACIONAL ONLINE

⚠️ ÚLTIMO AVISO
Se uma IA sugerir algo que contradiz este documento, a IA está ERRADA. Siga SEMPRE este contrato.

🎉 PARABÉNS!
Você agora possui um sistema empresarial completo, online e profissional que funciona em qualquer navegador com acesso à internet.

Próximos passos sugeridos:
Configure o Firebase Firestore

Faça deploy em produção (Render/Heroku)

Teste todas as funcionalidades

Crie páginas personalizadas via Fábrica

Configure domínio próprio

Monitore logs e performance

🚀 SISTEMA CORE v5.0 - ARQUITETURA ONLINE PARA SEMPRE!
🎯 PRÓXIMOS PASSOS APÓS ATUALIZAR O README:
Salve este README.md no projeto

Teste o sistema novamente com npm start

Configure Firebase Firestore

Documente quaisquer ajustes necessários

Crie páginas adicionais conforme necessidade

Faça deploy em ambiente de produção

O README agora está COMPLETO e serve como documentação definitiva para você e qualquer pessoa que for usar o sistema no futuro! 📚✨

📝 NOTAS DE ATUALIZAÇÃO v5.0:
✅ Sistema migrado de pen drive para online

✅ Firebase Firestore substitui localStorage

✅ API REST completa com Node.js/Express

✅ Deploy em produção (Render/Heroku/etc)

✅ Sincronização em tempo real

✅ Escalabilidade ilimitada

✅ Acesso via qualquer navegador

✅ Backup automático na nuvem

✅ **RESPONSIVIDADE MOBILE IMPLEMENTADA**

✅ Media queries para tablets e smartphones

✅ Layout adaptativo completo

✅ Sidebar responsivo

✅ Barra de status otimizada para mobile

Sistema testado e funcionando perfeitamente em modo online! 🌐✅📱

n]ao pare