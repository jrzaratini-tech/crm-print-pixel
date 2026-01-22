/**
 * ENGINE.JS v5.2.1 - MOTOR DE COMUNICAÇÃO UNIVERSAL
 * Localização: /core/engine.js
 * Responsável por: Data-binding, Commits, Queries e UI Updates.
 * ATUALIZAÇÃO v5.2.1: Correção de duplicação e suporte para campos adicionais
 * Agora processa: pedido, orcamento, venda, despesa e qualquer outro schema
 * Mantém compatibilidade total com versões anteriores
 */

document.addEventListener('DOMContentLoaded', () => {
    const pageId = document.body.getAttribute('data-page-id') || 'pagina-sem-id';
    const pageType = document.body.getAttribute('data-page-type') || 'NEUTRAL';

    console.log(`🚀 Engine v5.2.1 Ativa: ${pageId} [Tipo: ${pageType}]`);
    console.log(`💾 Modo: Salvamento no Firebase Online`);
    console.log(`🔄 Suporte universal para schemas com produtos`);

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
            
            // Verificar se há estrutura de produtos neste schema
            const temProdutos = Array.from(inputs).some(input => {
                const bindPath = input.getAttribute('data-bind');
                return bindPath && bindPath.startsWith(`${schema}.produtos.`);
            });
            
            // Processar dados com suporte universal para produtos
            if (temProdutos) {
                payload = processarSchemaComProdutos(inputs, schema);
                console.log(`📦 ${schema} com produtos processado:`, payload);
            } else {
                // Processamento padrão para schemas sem produtos
                payload = processarSchemaPadrao(inputs, schema);
                console.log(`📄 ${schema} padrão processado:`, payload);
            }

            if (schema && Object.keys(payload).length > 0) {
                try {
                    // Verificar se é uma atualização (tem ID)
                    const temId = document.getElementById(`${schema}Id`) || 
                                  document.querySelector(`[data-bind$="${schema}.id"]`);
                    const idPedido = temId ? temId.value : null;
                    
                    // Preparar dados para envio
                    const dadosEnvio = {
                        schema: schema,
                        payload: payload,
                        pageId: pageId,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Se tem ID, adicionar ao payload para identificar como atualização
                    if (idPedido && idPedido.trim() !== '') {
                        dadosEnvio.id = idPedido;
                        console.log(`🔄 Modo atualização detectado para ID: ${idPedido}`);
                    }
                    
                    // Salvar no Firebase via API
                    const response = await fetch('/api/database/commit', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(dadosEnvio)
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        console.log('✅ Dados salvos no Firebase:', result);
                        
                        // Disparar evento de sucesso
                        window.dispatchEvent(new CustomEvent('coreCommitSuccess', {
                            detail: { 
                                schema: schema, 
                                payload: payload, 
                                result: result,
                                isUpdate: !!idPedido
                            }
                        }));
                        
                        // Feedback visual
                        commitBtn.style.backgroundColor = "#27ae60";
                        commitBtn.textContent = idPedido ? "✓ Atualizado!" : "✓ Salvo Online!";
                        commitBtn.disabled = true;
                        
                        setTimeout(() => {
                            commitBtn.style.backgroundColor = "";
                            commitBtn.textContent = commitBtn.getAttribute('data-original-text') || "Salvar";
                            commitBtn.disabled = false;
                        }, 2000);
                        
                        // Disparar evento de mudança de dados
                        window.dispatchEvent(new CustomEvent('coreDataChanged'));
                        
                        // Limpar formulário apenas se não for atualização e não tiver ID
                        const temIdField = document.querySelector('[data-bind$=".id"]') || 
                                         document.getElementById(`${schema}Id`);
                        if (!temIdField || !temIdField.value) {
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
        
        // Verificar se esta página já tem seu próprio sistema de atualização
        const paginasComSistemaProprio = ['pedidos', 'orcamentos', 'vendas', 'despesas'];
        const temSistemaProprio = paginasComSistemaProprio.some(pagina => 
            pageId.includes(pagina) || window.location.pathname.includes(pagina)
        );
        
        if (temSistemaProprio) {
            console.log(`🛡️ Página ${pageId} detectada - Desativando auto-refresh do engine.js`);
            console.log("ℹ️ A página já tem seu próprio sistema de atualização");
            
            // Ainda mantemos o listener para eventos
            document.addEventListener('coreDataChanged', () => {
                console.log('🔄 Evento coreDataChanged recebido (página com sistema próprio)');
            });
            
        } else {
            // Para outras páginas READ, mantemos o comportamento original
            console.log("📊 Página READ genérica - Mantendo comportamento padrão");
            
            // Função para solicitar dados
            const solicitarDados = async () => {
                console.log("🔄 Solicitando dados do Firebase...");
                try {
                    // Determinar schema baseado no pageId
                    let schema = 'all';
                    if (pageId.includes('pedido')) schema = 'pedido';
                    else if (pageId.includes('orcamento')) schema = 'orcamento';
                    else if (pageId.includes('venda')) schema = 'venda';
                    else if (pageId.includes('despesa')) schema = 'despesa';
                    
                    // Solicitar dados via API
                    const response = await fetch('/api/database/query', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            schema: schema,
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
                        
                    } else {
                        console.error('❌ Erro ao buscar dados do Firebase');
                    }
                } catch (error) {
                    console.error('❌ Erro ao carregar dados do Firebase:', error);
                }
            };

            // Handler para receber dados (compatibilidade)
            window.addEventListener('coreDataChanged', () => {
                console.log('🔄 Evento coreDataChanged recebido');
                solicitarDados();
            });

            // Auto-refresh a cada 10 segundos APENAS para páginas genéricas
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
            } else if (input.hasAttribute('readonly')) {
                // Não limpar campos readonly (como códigos automáticos)
            } else {
                input.value = '';
            }
        });
    }

    function atualizarInterface(events) {
        // CORREÇÃO: NÃO limpar tabelas que estão dentro de modais!
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
                    return false;
                }
                parent = parent.parentElement;
            }
            return true;
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
                    return false;
                }
                parent = parent.parentElement;
            }
            return true;
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
        const schema = event.schema || 'desconhecido';
        
        switch(schema) {
            case 'venda':
                content = `
                    <td>${data}</td>
                    <td>${event.payload.cliente || '-'}</td>
                    <td>${event.payload.produto || '-'}</td>
                    <td>R$ ${(event.payload.valor || 0).toFixed(2)}</td>
                    <td><span class="status-badge success">Concluída</span></td>
                `;
                break;
                
            case 'despesa':
                content = `
                    <td>${data}</td>
                    <td>${event.payload.descricao || event.payload.categoria || '-'}</td>
                    <td>${event.payload.categoria || '-'}</td>
                    <td>R$ ${(event.payload.valor || 0).toFixed(2)}</td>
                    <td><span class="status-badge warning">Registrada</span></td>
                `;
                break;
                
            case 'pedido':
            case 'orcamento':
                const produtosCount = Array.isArray(event.payload.produtos) ? event.payload.produtos.length : 0;
                const codigo = event.payload.codigo || event.payload.numero || '-';
                const schemaLabel = schema === 'orcamento' ? 'Orçamento' : 'Pedido';
                
                content = `
                    <td>${data}</td>
                    <td>${event.payload.cliente || '-'}</td>
                    <td>${codigo}</td>
                    <td>${produtosCount} itens</td>
                    <td>R$ ${(event.payload.total || 0).toFixed(2)}</td>
                    <td><span class="status-badge ${event.payload.status || 'pending'}">${event.payload.status || 'Pendente'}</span></td>
                `;
                break;
                
            default:
                content = `
                    <td>${data}</td>
                    <td>${schema}</td>
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
        const schema = event.schema || 'desconhecido';
        
        switch(schema) {
            case 'venda':
                icon = '💰';
                text = `Venda: ${event.payload.cliente} - R$ ${event.payload.valor}`;
                break;
                
            case 'despesa':
                icon = '💸';
                text = `Despesa: ${event.payload.descricao || event.payload.categoria} - R$ ${event.payload.valor}`;
                break;
                
            case 'pedido':
                icon = '📦';
                const produtosCountPedido = Array.isArray(event.payload.produtos) ? event.payload.produtos.length : 0;
                text = `Pedido: ${event.payload.cliente} - ${produtosCountPedido} produtos - R$ ${event.payload.total}`;
                break;
                
            case 'orcamento':
                icon = '📋';
                const produtosCountOrcamento = Array.isArray(event.payload.produtos) ? event.payload.produtos.length : 0;
                text = `Orçamento: ${event.payload.cliente} - ${produtosCountOrcamento} produtos - R$ ${event.payload.total}`;
                break;
                
            default:
                icon = '📄';
                text = `${schema}: ${JSON.stringify(event.payload).substring(0, 30)}...`;
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
        const orcamentosCount = events.filter(e => e.schema === 'orcamento').length;
        
        // Atualizar elementos com contadores
        const vendasElement = document.querySelector('[data-counter="vendas"]');
        const despesasElement = document.querySelector('[data-counter="despesas"]');
        const pedidosElement = document.querySelector('[data-counter="pedidos"]');
        const orcamentosElement = document.querySelector('[data-counter="orcamentos"]');
        
        if (vendasElement) vendasElement.textContent = vendasCount;
        if (despesasElement) despesasElement.textContent = despesasCount;
        if (pedidosElement) pedidosElement.textContent = pedidosCount;
        if (orcamentosElement) orcamentosElement.textContent = orcamentosCount;
    }

    function atualizarContadoresDataBind(events) {
        // Atualizar contadores via data-bind (para páginas READ)
        const pedidos = events.filter(e => e.schema === 'pedido');
        const orcamentos = events.filter(e => e.schema === 'orcamento');
        
        const totalPedidos = pedidos.length;
        const pendentesPedidos = pedidos.filter(p => p.payload.status === 'pendente').length;
        const processamentoPedidos = pedidos.filter(p => p.payload.status === 'processamento').length;
        const concluidosPedidos = pedidos.filter(p => p.payload.status === 'concluido').length;
        
        const totalOrcamentos = orcamentos.length;
        const pendentesOrcamentos = orcamentos.filter(o => o.payload.status === 'pendente').length;
        const convertidosOrcamentos = orcamentos.filter(o => o.payload.status === 'convertido').length;
        
        // Atualizar elementos com data-bind para pedidos
        if (document.querySelector('[data-bind="pedidos.total"]')) {
            document.querySelector('[data-bind="pedidos.total"]').textContent = totalPedidos;
        }
        if (document.querySelector('[data-bind="pedidos.pendentes"]')) {
            document.querySelector('[data-bind="pedidos.pendentes"]').textContent = pendentesPedidos;
        }
        if (document.querySelector('[data-bind="pedidos.processamento"]')) {
            document.querySelector('[data-bind="pedidos.processamento"]').textContent = processamentoPedidos;
        }
        if (document.querySelector('[data-bind="pedidos.concluidos"]')) {
            document.querySelector('[data-bind="pedidos.concluidos"]').textContent = concluidosPedidos;
        }
        
        // Atualizar elementos com data-bind para orçamentos
        if (document.querySelector('[data-bind="orcamentos.total"]')) {
            document.querySelector('[data-bind="orcamentos.total"]').textContent = totalOrcamentos;
        }
        if (document.querySelector('[data-bind="orcamentos.pendentes"]')) {
            document.querySelector('[data-bind="orcamentos.pendentes"]').textContent = pendentesOrcamentos;
        }
        if (document.querySelector('[data-bind="orcamentos.convertidos"]')) {
            document.querySelector('[data-bind="orcamentos.convertidos"]').textContent = convertidosOrcamentos;
        }
    }

    // ============================================
    // FUNÇÕES DE PROCESSAMENTO UNIVERSAL
    // ============================================

    function processarSchemaComProdutos(inputs, schema) {
        const payload = {};
        
        console.log(`🛠️ Processando ${inputs.length} inputs para ${schema}...`);
        
        // Primeiro, processar campos diretos
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind');
            if (!bindPath) return;
            
            const parts = bindPath.split('.');
            
            if (parts[0] === schema && parts.length === 2) {
                // É um campo direto: schema.campo
                const field = parts[1];
                
                // Coletar valor baseado no tipo de input
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
        });
        
        // Segundo, processar produtos
        const produtosMap = new Map();
        
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind');
            if (!bindPath) return;
            
            const parts = bindPath.split('.');
            
            if (parts[0] === schema && parts[1] === 'produtos' && parts.length >= 3) {
                // É um produto: schema.produtos.X.campo
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
                    
                    // Coletar valor baseado no tipo de input
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
            }
        });
        
        // Remover produtos vazios (caso tenha linhas removidas)
        if (payload.produtos) {
            payload.produtos = payload.produtos.filter(prod => prod && Object.keys(prod).length > 0);
        }
        
        // Adicionar data de criação se não existir
        if (!payload.dataCriacao) {
            payload.dataCriacao = new Date().toISOString().split('T')[0];
        }
        
        console.log(`✅ Payload final para ${schema}:`, payload);
        console.log(`✅ Produtos processados:`, payload.produtos ? payload.produtos.length : 0);
        
        return payload;
    }

    function processarSchemaPadrao(inputs, schema) {
        const payload = {};
        
        console.log(`📄 Processando schema padrão: ${schema}`);
        
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
        
        // Adicionar data de registro se não existir
        if (!payload.dataRegistro) {
            payload.dataRegistro = new Date().toISOString();
        }
        
        return payload;
    }

    // Inicializar sistema de mensagens
    window.addEventListener('load', () => {
        console.log('🔧 Engine v5.2.1 inicializada com sucesso!');
        console.log('🔥 Pronta para salvar no Firebase Online');
        console.log('🔄 Suporte universal para todos os schemas');
        console.log('📦 Processamento de produtos para: pedido, orcamento, etc.');
        console.log('🛡️ Sistema protegido contra limpeza de modais');
        console.log('⚡ Modo atualização corrigido para evitar duplicação');
    });
});