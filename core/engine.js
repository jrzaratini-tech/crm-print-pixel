/**
 * ENGINE.JS v5.0 - MOTOR DE COMUNICAÇÃO ATUALIZADO
 * Localização: /core/engine.js
 * Responsável por: Data-binding, Commits, Queries e UI Updates.
 * Atualizado para salvar no Pen Drive via API Node.js
 */
document.addEventListener('DOMContentLoaded', () => {
    const pageId = document.body.getAttribute('data-page-id') || 'pagina-sem-id';
    const pageType = document.body.getAttribute('data-page-type') || 'NEUTRAL';

    console.log(`🚀 Engine v5.0 Ativa: ${pageId} [Tipo: ${pageType}]`);
    console.log(`💾 Modo: Salvamento exclusivo no Pen Drive`);

    // --- MODO ESCRITA (WRITE) ---
    const commitBtn = document.querySelector('[data-action="commit"]');
    if (commitBtn) {
        commitBtn.addEventListener('click', async () => {
            console.log('📝 Botão de commit detectado, coletando dados...');
            
            // Coletar todos os elementos com data-bind
            const inputs = document.querySelectorAll('[data-bind]');
            let payload = {};
            let schema = "";
            
            // Primeiro, identificar o schema principal
            inputs.forEach(input => {
                const bindPath = input.getAttribute('data-bind').split('.');
                if (bindPath[0] && !schema) {
                    schema = bindPath[0];
                }
            });
            
            // Processar dados estruturados (especial para pedidos)
            if (schema === 'pedido') {
                payload = processarPedidoCompleto(inputs);
                console.log('📦 Pedido processado:', payload);
            } else {
                // Processamento padrão para outros schemas
                inputs.forEach(input => {
                    const bindPath = input.getAttribute('data-bind').split('.');
                    const currentSchema = bindPath[0];
                    const field = bindPath[1];
                    
                    if (currentSchema === schema) {
                        // Suporte para diferentes tipos de input
                        if (input.type === 'checkbox') payload[field] = input.checked;
                        else if (input.type === 'radio') {
                            if (input.checked) payload[field] = input.value;
                        }
                        else if (input.type === 'number') payload[field] = parseFloat(input.value) || 0;
                        else if (input.type === 'date') payload[field] = input.value;
                        else payload[field] = input.value;
                    }
                });
            }

            if (schema && Object.keys(payload).length > 0) {
                try {
                    // Salvar no Pen Drive via API
                    const response = await fetch('/api/database/commit', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            schema: schema,
                            payload: payload,
                            pageId: pageId,
                            timestamp: new Date().toISOString()
                        })
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        console.log('✅ Dados salvos no Pen Drive:', result);
                        
                        // Feedback visual
                        commitBtn.style.backgroundColor = "#27ae60";
                        commitBtn.textContent = "✓ Salvo no Pen Drive!";
                        commitBtn.disabled = true;
                        
                        setTimeout(() => {
                            commitBtn.style.backgroundColor = "";
                            commitBtn.textContent = commitBtn.getAttribute('data-original-text') || "Salvar";
                            commitBtn.disabled = false;
                        }, 2000);
                        
                        // Disparar evento de mudança de dados
                        window.dispatchEvent(new CustomEvent('coreDataChanged'));
                        
                        // Limpar formulário
                        limparFormulario(inputs);
                        
                    } else {
                        throw new Error('Falha ao salvar no Pen Drive');
                    }
                } catch (error) {
                    console.error('❌ Erro ao salvar no Pen Drive:', error);
                    alert('❌ Erro ao salvar dados no Pen Drive!');
                }
            } else {
                console.error('❌ Erro: Schema não identificado ou payload vazio');
                alert("Erro: Verifique os campos do formulário.");
            }
        });
        
        // Salvar texto original do botão
        commitBtn.setAttribute('data-original-text', commitBtn.textContent);
    }

    // --- MODO LEITURA (READ) ---
    if (pageType === "READ") {
        console.log("📊 Página READ detectada - Configurando sistema de dados do Pen Drive");
        
        // Função para solicitar dados
        const solicitarDados = async () => {
            console.log("🔄 Solicitando dados do Pen Drive...");
            try {
                const events = await window.db.getEvents();
                atualizarInterface(events);
            } catch (error) {
                console.error('❌ Erro ao carregar dados do Pen Drive:', error);
            }
        };

        // Handler para receber dados (compatibilidade)
        window.addEventListener('coreDataChanged', () => {
            solicitarDados();
        });

        // Auto-refresh a cada 5 segundos
        setInterval(solicizarDados, 5000);
        
        // Carregar dados iniciais
        solicitarDados();
    }

    // --- FUNÇÕES AUXILIARES ---
    
    function limparFormulario(inputs) {
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else {
                input.value = '';
            }
        });
    }

    function atualizarInterface(events) {
        // Atualizar tabelas, listas, etc. baseado no tipo de página
        const tables = document.querySelectorAll('table tbody');
        const lists = document.querySelectorAll('.data-list');
        
        // Limpar conteúdo atual
        tables.forEach(table => table.innerHTML = '');
        lists.forEach(list => list.innerHTML = '');
        
        // Preencher com dados
        events.forEach(event => {
            const row = criarLinhaTabela(event);
            const listItem = criarListItem(event);
            
            tables.forEach(table => {
                if (table.dataset.schema === event.schema || !table.dataset.schema) {
                    table.appendChild(row.cloneNode(true));
                }
            });
            
            lists.forEach(list => {
                if (list.dataset.schema === event.schema || !list.dataset.schema) {
                    list.appendChild(listItem.cloneNode(true));
                }
            });
        });
        
        // Atualizar contadores
        atualizarContadores(events);
    }

    function criarLinhaTabela(event) {
        const tr = document.createElement('tr');
        const data = new Date(event.created_at).toLocaleString('pt-BR');
        
        let content = '';
        if (event.schema === 'venda') {
            content = `
                <td>${data}</td>
                <td>${event.payload.cliente || '-'}</td>
                <td>${event.payload.produto || '-'}</td>
                <td>R$ ${(event.payload.valor || 0).toFixed(2)}</td>
                <td><span class="status-badge success">Concluída</span></td>
            `;
        } else if (event.schema === 'despesa') {
            content = `
                <td>${data}</td>
                <td>${event.payload.descricao || event.payload.categoria || '-'}</td>
                <td>${event.payload.categoria || '-'}</td>
                <td>R$ ${(event.payload.valor || 0).toFixed(2)}</td>
                <td><span class="status-badge warning">Registrada</span></td>
            `;
        } else if (event.schema === 'pedido') {
            content = `
                <td>${data}</td>
                <td>${event.payload.cliente || '-'}</td>
                <td>${event.payload.produtos?.length || 0} itens</td>
                <td>R$ ${(event.payload.total || 0).toFixed(2)}</td>
                <td><span class="status-badge pending">Pendente</span></td>
            `;
        } else {
            content = `
                <td>${data}</td>
                <td>${event.schema}</td>
                <td>${JSON.stringify(event.payload).substring(0, 50)}...</td>
                <td>-</td>
                <td><span class="status-badge info">Registro</span></td>
            `;
        }
        
        tr.innerHTML = content;
        return tr;
    }

    function criarListItem(event) {
        const li = document.createElement('li');
        const data = new Date(event.created_at).toLocaleString('pt-BR');
        
        let icon = '';
        let text = '';
        
        if (event.schema === 'venda') {
            icon = '💰';
            text = `Venda: ${event.payload.cliente} - R$ ${event.payload.valor}`;
        } else if (event.schema === 'despesa') {
            icon = '💸';
            text = `Despesa: ${event.payload.descricao || event.payload.categoria} - R$ ${event.payload.valor}`;
        } else if (event.schema === 'pedido') {
            icon = '📦';
            text = `Pedido: ${event.payload.cliente}`;
        } else {
            icon = '📄';
            text = `${event.schema}: ${JSON.stringify(event.payload).substring(0, 30)}...`;
        }
        
        li.innerHTML = `
            <span class="activity-icon">${icon}</span>
            <span class="activity-time">${data}</span>
            <span class="activity-text">${text}</span>
        `;
        
        li.className = 'activity-item';
        return li;
    }

    function atualizarContadores(events) {
        // Atualizar contadores de estatísticas
        const vendasCount = events.filter(e => e.schema === 'venda').length;
        const despesasCount = events.filter(e => e.schema === 'despesa').length;
        const pedidosCount = events.filter(e => e.schema === 'pedido').length;
        
        // Atualizar elementos com contadores
        const vendasElement = document.querySelector('[data-counter="vendas"]');
        const despesasElement = document.querySelector('[data-counter="despesas"]');
        const pedidosElement = document.querySelector('[data-counter="pedidos"]');
        
        if (vendasElement) vendasElement.textContent = vendasCount;
        if (despesasElement) despesasElement.textContent = despesasCount;
        if (pedidosElement) pedidosElement.textContent = pedidosCount;
    }

    function processarPedidoCompleto(inputs) {
        const payload = {
            cliente: '',
            produtos: [],
            total: 0,
            observacoes: ''
        };
        
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind').split('.');
            
            if (bindPath[0] === 'pedido') {
                if (bindPath[1] === 'cliente') {
                    payload.cliente = input.value;
                } else if (bindPath[1] === 'observacoes') {
                    payload.observacoes = input.value;
                } else if (bindPath[1] === 'total') {
                    payload.total = parseFloat(input.value) || 0;
                }
            } else if (bindPath[0] === 'produto') {
                const index = bindPath[1];
                if (!payload.produtos[index]) {
                    payload.produtos[index] = {};
                }
                payload.produtos[index][bindPath[2]] = input.value;
            }
        });
        
        return payload;
    }

    // Inicializar sistema de mensagens
    window.addEventListener('load', () => {
        console.log('🔧 Engine v5.0 inicializada com sucesso!');
        console.log('💾 Pronta para salvar no Pen Drive');
    });
});
