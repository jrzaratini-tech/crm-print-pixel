/**
 * ENGINE.JS v5.2.2 - MOTOR DE COMUNICAÇÃO UNIVERSAL
 * Localização: /core/engine.js
 * Responsável por: Data-binding, Commits, Queries e UI Updates.
 * ATUALIZAÇÃO v5.2.2: Correção DEFINITIVA da duplicação na edição
 * Agora detecta corretamente se é atualização e envia ID para o backend
 */

document.addEventListener('DOMContentLoaded', () => {
    const pageId = document.body.getAttribute('data-page-id') || 'pagina-sem-id';
    const pageType = document.body.getAttribute('data-page-type') || 'NEUTRAL';

    console.log(`🚀 Engine v5.2.2 Ativa: ${pageId} [Tipo: ${pageType}]`);
    console.log(`💾 Modo: Salvamento/Atualização no Firebase`);
    console.log(`🔄 Suporte universal para todos os schemas`);

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
                    // CRÍTICO: Verificar se é uma atualização (tem ID no formulário)
                    const idInput = document.getElementById(`${schema}Id`) || 
                                   document.querySelector(`[data-bind$="${schema}.id"]`);
                    
                    const documentId = idInput ? idInput.value : null;
                    const isUpdate = documentId && documentId.trim() !== '';
                    
                    console.log(`🔍 Verificando modo: ${isUpdate ? 'ATUALIZAÇÃO' : 'CRIAÇÃO'}`);
                    console.log(`🔍 ID do documento: ${documentId || 'Nenhum (novo documento)'}`);
                    
                    // Preparar dados para envio
                    const dadosEnvio = {
                        schema: schema,
                        payload: { ...payload }, // Criar cópia do payload para não modificar o original
                        pageId: pageId,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Se for uma atualização, garantir que o ID esteja no nível superior
                    if (isUpdate) {
                        // Remover o ID do payload para evitar duplicação
                        if (dadosEnvio.payload.id) {
                            delete dadosEnvio.payload.id;
                        }
                        // Adicionar o ID no nível superior
                        dadosEnvio.id = documentId;
                        console.log(`🔄 Enviando em MODO ATUALIZAÇÃO com ID: ${dadosEnvio.id}`);
                    } else {
                        console.log(`🆕 Enviando em MODO CRIAÇÃO (sem ID)`);
                        
                        // Garantir que não há ID no payload para novos registros
                        if (dadosEnvio.payload.id) {
                            delete dadosEnvio.payload.id;
                        }
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
                        console.log('✅ Resposta do Firebase:', result);
                        
                        // Disparar evento de sucesso
                        window.dispatchEvent(new CustomEvent('coreCommitSuccess', {
                            detail: { 
                                schema: schema, 
                                payload: payload, 
                                result: result,
                                isUpdate: isUpdate,
                                documentId: result.id
                            }
                        }));
                        
                        // Feedback visual
                        commitBtn.style.backgroundColor = isUpdate ? "#3b82f6" : "#27ae60";
                        commitBtn.textContent = isUpdate ? "✓ Atualizado!" : "✓ Salvo!";
                        commitBtn.disabled = true;
                        
                        setTimeout(() => {
                            commitBtn.style.backgroundColor = "";
                            commitBtn.textContent = commitBtn.getAttribute('data-original-text') || "Salvar";
                            commitBtn.disabled = false;
                        }, 2000);
                        
                        // Disparar evento de mudança de dados
                        window.dispatchEvent(new CustomEvent('coreDataChanged'));
                        
                        // Se for criação, guardar o ID gerado no campo oculto
                        if (!isUpdate && result.id && idInput) {
                            idInput.value = result.id;
                            console.log(`💾 ID gerado armazenado: ${result.id}`);
                        }
                        
                        // NÃO limpar formulário se for atualização
                        if (!isUpdate) {
                            const temIdField = document.querySelector('[data-bind$=".id"]') || 
                                             document.getElementById(`${schema}Id`);
                            if (!temIdField || !temIdField.value) {
                                setTimeout(() => {
                                    if (confirm('Deseja criar um novo pedido?')) {
                                        limparFormulario(inputs);
                                    }
                                }, 1000);
                            }
                        }
                        
                    } else {
                        const errorText = await response.text();
                        throw new Error(`Falha na API: ${errorText}`);
                    }
                } catch (error) {
                    console.error('❌ Erro ao salvar no Firebase:', error);
                    
                    // Disparar evento de erro
                    window.dispatchEvent(new CustomEvent('coreCommitError', {
                        detail: { 
                            error: error.message, 
                            schema: schema,
                            isUpdate: isUpdate
                        }
                    }));
                    
                    // Feedback de erro
                    commitBtn.style.backgroundColor = "#ef4444";
                    commitBtn.textContent = "❌ Erro!";
                    
                    setTimeout(() => {
                        commitBtn.style.backgroundColor = "";
                        commitBtn.textContent = commitBtn.getAttribute('data-original-text') || "Salvar";
                        commitBtn.disabled = false;
                    }, 2000);
                    
                    alert('❌ Erro ao salvar dados! Verifique o console para detalhes.');
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
        console.log('🧹 Limpando formulário...');
        
        // Não limpar campos com data-bind que contém "id"
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind');
            
            // NUNCA limpar campos que têm .id no data-bind
            if (bindPath && bindPath.endsWith('.id')) {
                console.log(`🛡️ Protegendo campo ID: ${bindPath}`);
                return;
            }
            
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            } else if (input.hasAttribute('readonly') && !input.id.includes('numero')) {
                // Não limpar campos readonly (exceto número do pedido)
                return;
            } else {
                input.value = '';
            }
        });
        
        // Disparar evento de formulário limpo
        window.dispatchEvent(new CustomEvent('coreFormCleared'));
    }

    function atualizarInterface(events) {
        // CORREÇÃO: NÃO limpar tabelas que estão dentro de modais!
        const tables = document.querySelectorAll('table tbody');
        const lists = document.querySelectorAll('.data-list');
        
        // Filtrar para excluir elementos dentro de modais
        const filteredTables = Array.from(tables).filter(table => {
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
                const instalacao = event.payload.instalacao || 0;
                const temInstalacao = instalacao > 0;
                
                content = `
                    <td>${data}</td>
                    <td>${event.payload.cliente || '-'}</td>
                    <td>${codigo}</td>
                    <td>${produtosCount} itens ${temInstalacao ? '+ instalação' : ''}</td>
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
                const instalacaoPedido = event.payload.instalacao || 0;
                const extra = instalacaoPedido > 0 ? ` + R$ ${instalacaoPedido} instalação` : '';
                text = `Pedido: ${event.payload.cliente} - ${produtosCountPedido} produtos${extra} - R$ ${event.payload.total}`;
                break;
                
            case 'orcamento':
                icon = '📋';
                const produtosCountOrcamento = Array.isArray(event.payload.produtos) ? event.payload.produtos.length : 0;
                const instalacaoOrcamento = event.payload.instalacao || 0;
                const extraOrc = instalacaoOrcamento > 0 ? ` + R$ ${instalacaoOrcamento} instalação` : '';
                text = `Orçamento: ${event.payload.cliente} - ${produtosCountOrcamento} produtos${extraOrc} - R$ ${event.payload.total}`;
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
        const vendasCount = events.filter(e => e.schema === 'venda').length;
        const despesasCount = events.filter(e => e.schema === 'despesa').length;
        const pedidosCount = events.filter(e => e.schema === 'pedido').length;
        const orcamentosCount = events.filter(e => e.schema === 'orcamento').length;
        
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
        const pedidos = events.filter(e => e.schema === 'pedido');
        const orcamentos = events.filter(e => e.schema === 'orcamento');
        
        const totalPedidos = pedidos.length;
        const pendentesPedidos = pedidos.filter(p => p.payload.status === 'pendente').length;
        const processamentoPedidos = pedidos.filter(p => p.payload.status === 'processamento').length;
        const concluidosPedidos = pedidos.filter(p => p.payload.status === 'concluido').length;
        
        const totalOrcamentos = orcamentos.length;
        const pendentesOrcamentos = orcamentos.filter(o => o.payload.status === 'pendente').length;
        const convertidosOrcamentos = orcamentos.filter(o => o.payload.status === 'convertido').length;
        
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
        
        // Processar o campo ID primeiro, se existir
        const idInput = document.getElementById(`${schema}Id`) || 
                       document.querySelector(`[data-bind$="${schema}.id"]`);
        if (idInput && idInput.value) {
            payload.id = idInput.value;
            console.log(`🔑 ID do documento: ${payload.id}`);
        }
        
        // Primeiro, processar campos diretos
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind');
            if (!bindPath) return;
            
            const parts = bindPath.split('.');
            
            if (parts[0] === schema && parts.length === 2) {
                const field = parts[1];
                
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
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind');
            if (!bindPath) return;
            
            const parts = bindPath.split('.');
            
            if (parts[0] === schema && parts[1] === 'produtos' && parts.length >= 3) {
                const index = parseInt(parts[2]);
                const field = parts[3];
                
                if (!isNaN(index) && field) {
                    if (!payload.produtos) {
                        payload.produtos = [];
                    }
                    
                    if (!payload.produtos[index]) {
                        payload.produtos[index] = {};
                    }
                    
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
                    
                    if (!(input.type === 'radio' && !input.checked)) {
                        payload.produtos[index][field] = value;
                    }
                    
                    console.log(`📦 Produto [${index}].${field} = ${value}`);
                }
            }
        });
        
        // Remover produtos vazios
        if (payload.produtos) {
            payload.produtos = payload.produtos.filter(prod => prod && Object.keys(prod).length > 0);
        }
        
        // Adicionar data de criação se não existir
        if (!payload.dataCriacao) {
            payload.dataCriacao = new Date().toISOString().split('T')[0];
        }
        
        // Garantir que campos numéricos sejam números, não strings
        if (payload.instalacao) payload.instalacao = parseFloat(payload.instalacao) || 0;
        if (payload.subtotal) payload.subtotal = parseFloat(payload.subtotal) || 0;
        if (payload.iva) payload.iva = parseFloat(payload.iva) || 0;
        if (payload.total) payload.total = parseFloat(payload.total) || 0;
        if (payload.totalPago) payload.totalPago = parseFloat(payload.totalPago) || 0;
        if (payload.saldoPendente) payload.saldoPendente = parseFloat(payload.saldoPendente) || 0;
        
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
                if (input.type === 'checkbox') payload[field] = input.checked;
                else if (input.type === 'radio') {
                    if (input.checked) payload[field] = input.value;
                }
                else if (input.type === 'number') payload[field] = parseFloat(input.value) || 0;
                else if (input.type === 'date') payload[field] = input.value;
                else payload[field] = input.value;
            }
        });
        
        if (!payload.dataRegistro) {
            payload.dataRegistro = new Date().toISOString();
        }
        
        return payload;
    }

    // Inicializar sistema de mensagens
    window.addEventListener('load', () => {
        console.log('🔧 Engine v5.2.2 inicializada com sucesso!');
        console.log('🔥 Sistema de atualização corrigido');
        console.log('🔄 Agora detecta corretamente modo ATUALIZAÇÃO vs CRIAÇÃO');
        console.log('📦 Processamento de produtos otimizado');
        console.log('🛡️ Sistema protegido contra duplicação');
    });
});