/**
 * ENGINE.JS v5.1 - MOTOR DE COMUNICAÇÃO ATUALIZADO
 * Localização: /core/engine.js
 * Responsável por: Data-binding, Commits, Queries e UI Updates.
 * Atualizado para salvar no Firebase via API Node.js
 * CORREÇÃO: Agora processa corretamente produtos de pedidos com data-bind "pedido.produtos.X.campo"
 * CORREÇÃO CRÍTICA: Proteção para não limpar tabelas dentro de modais
 */
document.addEventListener('DOMContentLoaded', () => {
    const pageId = document.body.getAttribute('data-page-id') || 'pagina-sem-id';
    const pageType = document.body.getAttribute('data-page-type') || 'NEUTRAL';

    console.log(`🚀 Engine v5.1 Ativa: ${pageId} [Tipo: ${pageType}]`);
    console.log(`💾 Modo: Salvamento no Firebase Online`);

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
                    // Salvar no Firebase via API
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
                        console.log('✅ Dados salvos no Firebase:', result);
                        
                        // Disparar evento de sucesso
                        window.dispatchEvent(new CustomEvent('coreCommitSuccess', {
                            detail: { schema: schema, payload: payload, result: result }
                        }));
                        
                        // Feedback visual
                        commitBtn.style.backgroundColor = "#27ae60";
                        commitBtn.textContent = "✓ Salvo Online!";
                        commitBtn.disabled = true;
                        
                        setTimeout(() => {
                            commitBtn.style.backgroundColor = "";
                            commitBtn.textContent = commitBtn.getAttribute('data-original-text') || "Salvar";
                            commitBtn.disabled = false;
                        }, 2000);
                        
                        // Disparar evento de mudança de dados
                        window.dispatchEvent(new CustomEvent('coreDataChanged'));
                        
                        // Limpar formulário se não estiver em modo de edição
                        if (!document.getElementById('pedidoId')?.value) {
                            limparFormulario(inputs);
                        }
                        
                    } else {
                        const errorText = await response.text();
                        throw new Error(`Falha ao salvar no Firebase: ${errorText}`);
                    }
                } catch (error) {
                    console.error('❌ Erro ao salvar no Firebase:', error);
                    
                    // Disparar evento de erro
                    window.dispatchEvent(new CustomEvent('coreCommitError', {
                        detail: { error: error.message, schema: schema }
                    }));
                    
                    alert('❌ Erro ao salvar dados online! Verifique o console.');
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
        console.log("📊 Página READ detectada - Configurando sistema de dados do Firebase");
        
        // CORREÇÃO CRÍTICA: Verificar se esta é a página de pedidos que já tem seu próprio sistema
        // Se for a página de pedidos, DESABILITAMOS o auto-refresh do engine.js
        // mas mantemos a compatibilidade com eventos
        const isPedidosPage = pageId === 'pedidos' || window.location.pathname.includes('pedidos');
        
        if (isPedidosPage) {
            console.log("🛡️ Página de pedidos detectada - Desativando auto-refresh do engine.js");
            console.log("ℹ️ A página já tem seu próprio sistema de atualização");
            
            // Ainda mantemos o listener para eventos, mas SEM auto-refresh
            document.addEventListener('coreDataChanged', () => {
                console.log('🔄 Evento coreDataChanged recebido (página de pedidos)');
                // A página de pedidos já tem seu próprio listener para este evento
                // Não precisamos fazer nada aqui
            });
            
            // NÃO configuramos setInterval para esta página
            // A página já tem seu próprio sistema de atualização
            
        } else {
            // Para outras páginas READ, mantemos o comportamento original
            console.log("📊 Página READ genérica - Mantendo comportamento padrão");
            
            // Função para solicitar dados
            const solicitarDados = async () => {
                console.log("🔄 Solicitando dados do Firebase...");
                try {
                    // Solicitar dados via API
                    const response = await fetch('/api/database/query', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            schema: pageId.includes('pedido') ? 'pedido' : 
                                   pageId.includes('despesa') ? 'despesa' : 'all',
                            filters: { deleted: false }
                        })
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        const events = result.events || [];
                        
                        // Atualizar interface com os dados
                        atualizarInterface(events);
                        
                        // Atualizar contadores via data-bind
                        atualizarContadoresDataBind(events);
                        
                        // Enviar dados para o dashboard via postMessage
                        if (pageId === 'dashboard') {
                            window.postMessage({
                                type: "QUERY_RESPONSE",
                                data: events
                            }, "*");
                        }
                    } else {
                        console.error('❌ Erro ao buscar dados do Firebase');
                    }
                } catch (error) {
                    console.error('❌ Erro ao carregar dados do Firebase:', error);
                }
            };

            // Handler para receber mensagens do dashboard
            window.addEventListener("message", function(event) {
                if (event.data.type === "QUERY_REQUEST") {
                    console.log('📨 QUERY_REQUEST recebido do dashboard');
                    solicitarDados();
                }
            });

            // Handler para receber dados (compatibilidade)
            window.addEventListener('coreDataChanged', () => {
                console.log('🔄 Evento coreDataChanged recebido');
                solicitarDados();
            });

            // Auto-refresh a cada 10 segundos APENAS para páginas não-pedidos
            setInterval(solicitarDados, 10000);
            
            // Carregar dados iniciais
            solicitarDados();
        }
    }

    // --- FUNÇÕES AUXILIARES ---
    
    function limparFormulario(inputs) {
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
            }
        });
    }

    function atualizarInterface(events) {
        // CORREÇÃO CRÍTICA: NÃO limpar tabelas que estão dentro de modais!
        // Identificar e proteger tabelas dentro de modais
        
        // Selecionar apenas tabelas que NÃO estão dentro de modais
        const tables = document.querySelectorAll('table tbody');
        const lists = document.querySelectorAll('.data-list');
        
        // Filtrar para excluir elementos dentro de modais
        const filteredTables = Array.from(tables).filter(table => {
            // Verificar se a tabela está dentro de um modal
            let parent = table;
            while (parent) {
                if (parent.classList && 
                    (parent.classList.contains('modal') || 
                     parent.classList.contains('modal-container') ||
                     parent.classList.contains('modal-content') ||
                     parent.id === 'modalContent' ||
                     parent.id === 'modalOverlay')) {
                    console.log('🛡️ Protegendo tabela dentro de modal da limpeza');
                    return false; // Não incluir esta tabela
                }
                parent = parent.parentElement;
            }
            return true; // Incluir esta tabela
        });
        
        const filteredLists = Array.from(lists).filter(list => {
            // Verificar se a lista está dentro de um modal
            let parent = list;
            while (parent) {
                if (parent.classList && 
                    (parent.classList.contains('modal') || 
                     parent.classList.contains('modal-container') ||
                     parent.classList.contains('modal-content') ||
                     parent.id === 'modalContent' ||
                     parent.id === 'modalOverlay')) {
                    console.log('🛡️ Protegendo lista dentro de modal da limpeza');
                    return false; // Não incluir esta lista
                }
                parent = parent.parentElement;
            }
            return true; // Incluir esta lista
        });
        
        // Limpar conteúdo atual APENAS de elementos fora de modais
        filteredTables.forEach(table => table.innerHTML = '');
        filteredLists.forEach(list => list.innerHTML = '');
        
        // Preencher com dados APENAS elementos fora de modais
        events.forEach(event => {
            const row = criarLinhaTabela(event);
            const listItem = criarListItem(event);
            
            filteredTables.forEach(table => {
                if (table.dataset.schema === event.schema || !table.dataset.schema) {
                    table.appendChild(row.cloneNode(true));
                }
            });
            
            filteredLists.forEach(list => {
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
        const data = new Date(event.timestamp || event.created_at).toLocaleString('pt-BR');
        
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
            const produtosCount = Array.isArray(event.payload.produtos) ? event.payload.produtos.length : 0;
            content = `
                <td>${data}</td>
                <td>${event.payload.cliente || '-'}</td>
                <td>${produtosCount} itens</td>
                <td>R$ ${(event.payload.total || 0).toFixed(2)}</td>
                <td><span class="status-badge ${event.payload.status || 'pending'}">${event.payload.status || 'Pendente'}</span></td>
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
        const data = new Date(event.timestamp || event.created_at).toLocaleString('pt-BR');
        
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
            const produtosCount = Array.isArray(event.payload.produtos) ? event.payload.produtos.length : 0;
            text = `Pedido: ${event.payload.cliente} - ${produtosCount} produtos - R$ ${event.payload.total}`;
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

    function atualizarContadoresDataBind(events) {
        // Atualizar contadores via data-bind (para páginas READ)
        const pedidos = events.filter(e => e.schema === 'pedido');
        const totalPedidos = pedidos.length;
        const pendentes = pedidos.filter(p => p.payload.status === 'pendente').length;
        const processamento = pedidos.filter(p => p.payload.status === 'processamento').length;
        const concluidos = pedidos.filter(p => p.payload.status === 'concluido').length;
        
        // Atualizar elementos com data-bind
        const totalElement = document.querySelector('[data-bind="pedidos.total"]');
        const pendentesElement = document.querySelector('[data-bind="pedidos.pendentes"]');
        const processamentoElement = document.querySelector('[data-bind="pedidos.processamento"]');
        const concluidosElement = document.querySelector('[data-bind="pedidos.concluidos"]');
        
        if (totalElement) totalElement.textContent = totalPedidos;
        if (pendentesElement) pendentesElement.textContent = pendentes;
        if (processamentoElement) processamentoElement.textContent = processamento;
        if (concluidosElement) concluidosElement.textContent = concluidos;
    }

    function processarPedidoCompleto(inputs) {
        const payload = {};
        const produtosMap = new Map(); // Para agrupar produtos por índice
        
        console.log(`🛠️ Processando ${inputs.length} inputs para pedido...`);
        
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind');
            if (!bindPath) return;
            
            const parts = bindPath.split('.');
            
            if (parts[0] === 'pedido') {
                if (parts[1] === 'produtos' && parts.length >= 3) {
                    // É um produto: pedido.produtos.X.campo
                    const index = parseInt(parts[2]);
                    const field = parts[3];
                    
                    if (!isNaN(index) && field) {
                        // Inicializar array se necessário
                        if (!payload.produtos) {
                            payload.produtos = [];
                        }
                        
                        // Garantir que existe objeto no índice
                        if (!payload.produtos[index]) {
                            payload.produtos[index] = {};
                        }
                        
                        // Coletar valor com base no tipo de input
                        let value;
                        if (input.type === 'checkbox') {
                            value = input.checked;
                        } else if (input.type === 'radio') {
                            value = input.checked ? input.value : undefined;
                        } else if (input.type === 'number') {
                            value = parseFloat(input.value) || 0;
                        } else if (input.type === 'date') {
                            value = input.value;
                        } else {
                            value = input.value;
                        }
                        
                        // Se for radio e não está checked, não adicionar
                        if (!(input.type === 'radio' && !input.checked)) {
                            payload.produtos[index][field] = value;
                        }
                        
                        console.log(`📦 Produto [${index}].${field} = ${value}`);
                    }
                } else if (parts.length === 2) {
                    // É um campo direto: pedido.campo
                    const field = parts[1];
                    
                    // Coletar valor com base no tipo de input
                    if (input.type === 'checkbox') {
                        payload[field] = input.checked;
                    } else if (input.type === 'radio') {
                        if (input.checked) payload[field] = input.value;
                    } else if (input.type === 'number') {
                        payload[field] = parseFloat(input.value) || 0;
                    } else if (input.type === 'date') {
                        payload[field] = input.value;
                    } else {
                        payload[field] = input.value;
                    }
                    
                    console.log(`📝 Campo ${field} = ${payload[field]}`);
                }
            }
        });
        
        // Remover produtos vazios (caso tenha linhas removidas)
        if (payload.produtos) {
            payload.produtos = payload.produtos.filter(prod => prod && Object.keys(prod).length > 0);
        }
        
        // Adicionar data de registro se não existir
        if (!payload.dataRegistro) {
            payload.dataRegistro = new Date().toISOString();
        }
        
        console.log(`✅ Payload final:`, payload);
        console.log(`✅ Produtos processados:`, payload.produtos ? payload.produtos.length : 0);
        
        return payload;
    }

    // Inicializar sistema de mensagens
    window.addEventListener('load', () => {
        console.log('🔧 Engine v5.1 inicializada com sucesso!');
        console.log('🔥 Pronta para salvar no Firebase Online');
        console.log('🛠️ Suporte completo para produtos estruturados de pedidos');
        console.log('🛡️ Sistema protegido contra limpeza de modais');
    });
});