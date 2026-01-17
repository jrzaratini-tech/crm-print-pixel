/**
 * ENGINE.JS v3.9 - MOTOR DE COMUNICAÇÃO OTIMIZADO
 * Localização: /core/engine.js
 * Responsável por: Data-binding, Commits, Queries e UI Updates.
 */
document.addEventListener('DOMContentLoaded', () => {
    const pageId = document.body.getAttribute('data-page-id') || 'pagina-sem-id';
    const pageType = document.body.getAttribute('data-page-type') || 'NEUTRAL';

    console.log(`🚀 Engine Ativa: ${pageId} [Tipo: ${pageType}]`);

    // --- MODO ESCRITA (WRITE) ---
    const commitBtn = document.querySelector('[data-action="commit"]');
    if (commitBtn) {
        commitBtn.addEventListener('click', () => {
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
                // Enviar para o Core
                window.parent.postMessage({ 
                    type: "COMMIT", 
                    schema: schema, 
                    payload: payload, 
                    source: pageId 
                }, "*");
                
                // Feedback visual
                commitBtn.style.backgroundColor = "#27ae60";
                commitBtn.textContent = "✓ Salvo!";
                commitBtn.disabled = true;
                
                setTimeout(() => {
                    commitBtn.style.backgroundColor = "";
                    commitBtn.textContent = commitBtn.getAttribute('data-original-text') || "Salvar";
                    commitBtn.disabled = false;
                }, 1500);
                
                console.log('✅ Dados enviados para o Core:', { schema, payload });
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
        console.log("📊 Página READ detectada - Configurando sistema de dados");
        
        // Função para solicitar dados
        const solicitarDados = () => {
            console.log("🔄 Solicitando dados ao Core...");
            window.parent.postMessage({ 
                type: "QUERY_REQUEST",
                source: pageId 
            }, "*");
        };

        // Handler para receber dados
        window.addEventListener("message", (e) => {
            if (e.data.type === "QUERY_RESPONSE") {
                console.log("✅ Dados recebidos do Core:", e.data.data.length, "registros");
                const data = e.data.data;
                
                // Processar dados para uso geral
                const dadosProcessados = processarDadosCore(data);
                
                // Disparar evento personalizado para scripts na página
                const renderEvent = new CustomEvent('dadosRecebidos', { 
                    detail: { 
                        raw: data,
                        processados: dadosProcessados
                    } 
                });
                document.dispatchEvent(renderEvent);
                
                // Tentar atualizar elementos com data-bind automaticamente
                atualizarElementosComDataBind(dadosProcessados);
                
                // Atualizar gráficos se existirem
                atualizarGraficosComDados(dadosProcessados);
            }
        });

        // Solicitar dados imediatamente e a cada 15 segundos
        solicitarDados();
        setInterval(solicitarDados, 15000);
    }

    // Função auxiliar para processar pedidos complexos
    function processarPedidoCompleto(inputs) {
        const pedido = {
            produtos: [],
            timestamp: new Date().toISOString()
        };
        
        // Estrutura para agrupar dados por tipo
        const dadosAgrupados = {};
        
        inputs.forEach(input => {
            const bindPath = input.getAttribute('data-bind').split('.');
            const schema = bindPath[0];
            const caminho = bindPath.slice(1);
            
            if (schema === 'pedido') {
                if (caminho[0] === 'produtos') {
                    // Processar produtos (ex: pedido.produtos.0.nome)
                    const indice = parseInt(caminho[1]);
                    const campo = caminho[2];
                    
                    if (!isNaN(indice)) {
                        if (!dadosAgrupados.produtos) dadosAgrupados.produtos = {};
                        if (!dadosAgrupados.produtos[indice]) dadosAgrupados.produtos[indice] = {};
                        
                        // Obter valor baseado no tipo de input
                        let valor;
                        if (input.type === 'checkbox') valor = input.checked;
                        else if (input.type === 'number') valor = parseFloat(input.value) || 0;
                        else if (input.type === 'radio') valor = input.checked ? input.value : dadosAgrupados.produtos[indice][campo];
                        else valor = input.value || '';
                        
                        dadosAgrupados.produtos[indice][campo] = valor;
                    }
                } else {
                    // Processar campos simples (ex: pedido.cliente)
                    const campo = caminho[0];
                    
                    // Obter valor baseado no tipo de input
                    let valor;
                    if (input.type === 'checkbox') valor = input.checked;
                    else if (input.type === 'radio') {
                        if (input.checked) valor = input.value;
                    }
                    else if (input.type === 'number') valor = parseFloat(input.value) || 0;
                    else if (input.type === 'date') valor = input.value;
                    else valor = input.value || '';
                    
                    if (valor !== undefined) {
                        pedido[campo] = valor;
                    }
                }
            }
        });
        
        // Processar produtos agrupados
        if (dadosAgrupados.produtos) {
            Object.values(dadosAgrupados.produtos).forEach(produto => {
                if (produto.nome && produto.nome.trim() !== '') {
                    pedido.produtos.push({
                        nome: produto.nome || '',
                        tamanho: produto.tamanho || '',
                        quantidade: parseInt(produto.quantidade) || 1,
                        valor: parseFloat(produto.valor) || 0,
                        observacoes: produto.obs || ''
                    });
                }
            });
        }
        
        // Calcular totais automaticamente se necessário
        if (pedido.produtos.length > 0 && !pedido.total) {
            let subtotalProdutos = 0;
            pedido.produtos.forEach(p => {
                subtotalProdutos += (p.valor * p.quantidade);
            });
            
            const instalacao = parseFloat(pedido.instalacao) || 0;
            const subtotal = subtotalProdutos + instalacao;
            
            if (pedido.comIVA === 'sim' || pedido.comIVA === true) {
                pedido.iva = subtotal * 0.23;
                pedido.total = subtotal + pedido.iva;
            } else {
                pedido.iva = 0;
                pedido.total = subtotal;
            }
            
            pedido.subtotal = subtotal;
        }
        
        return pedido;
    }

    // Função para processar dados do Core
    function processarDadosCore(eventos) {
        let totalVendas = 0;
        let totalDespesas = 0;
        let totalPedidos = 0;
        let vendasCount = 0;
        let despesasCount = 0;
        let pedidosCount = 0;
        let ultimosPedidos = [];
        
        if (!eventos || !Array.isArray(eventos)) {
            return { 
                totalVendas: 0, 
                totalDespesas: 0, 
                totalPedidos: 0,
                lucro: 0, 
                margem: 0,
                vendasCount: 0,
                despesasCount: 0,
                pedidosCount: 0,
                ultimosPedidos: []
            };
        }
        
        eventos.forEach(e => {
            if (e.deleted) return;
            
            const valor = parseFloat(e.payload?.total || e.payload?.valor || e.payload?.val || 0);
            
            if (e.schema === 'venda') {
                totalVendas += valor;
                vendasCount++;
            }
            else if (e.schema === 'despesa') {
                totalDespesas += valor;
                despesasCount++;
            }
            else if (e.schema === 'pedido') {
                totalPedidos += valor;
                pedidosCount++;
                
                // Manter últimos 5 pedidos para exibição
                if (ultimosPedidos.length < 5) {
                    ultimosPedidos.push({
                        id: e.id,
                        cliente: e.payload.cliente || 'Sem nome',
                        numero: e.payload.numero || 'N/A',
                        total: valor,
                        data: new Date(e.created_at).toLocaleDateString('pt-BR'),
                        status: e.payload.status || 'pendente'
                    });
                }
            }
        });
        
        const totalVendasComPedidos = totalVendas + totalPedidos;
        const lucro = totalVendasComPedidos - totalDespesas;
        const margem = totalVendasComPedidos > 0 ? ((lucro / totalVendasComPedidos) * 100).toFixed(1) : 0;
        
        return {
            totalVendas: totalVendasComPedidos,
            totalDespesas,
            totalPedidos,
            lucro,
            margem,
            vendasCount: vendasCount + pedidosCount,
            despesasCount,
            pedidosCount,
            ultimosPedidos: ultimosPedidos.reverse(),
            totalRegistros: eventos.filter(e => !e.deleted).length
        };
    }

    // Função para atualizar elementos com data-bind automaticamente
    function atualizarElementosComDataBind(dados) {
        const elementos = document.querySelectorAll('[data-bind]');
        
        elementos.forEach(el => {
            const bindPath = el.getAttribute('data-bind');
            const [schema, campo] = bindPath.split('.');
            
            if (schema === 'vendas') {
                if (campo === 'total') {
                    el.textContent = `€${dados.totalVendas.toFixed(2)}`;
                } else if (campo === 'variacao') {
                    el.textContent = dados.vendasCount > 0 ? '+12.5%' : '+0.0%';
                } else if (campo === 'quantidade') {
                    el.textContent = dados.vendasCount;
                }
            } else if (schema === 'despesas') {
                if (campo === 'total') {
                    el.textContent = `€${dados.totalDespesas.toFixed(2)}`;
                } else if (campo === 'variacao') {
                    el.textContent = dados.despesasCount > 0 ? '+5.2%' : '+0.0%';
                }
            } else if (schema === 'lucro') {
                if (campo === 'total') {
                    el.textContent = `€${dados.lucro.toFixed(2)}`;
                } else if (campo === 'margem') {
                    el.textContent = `${dados.margem}%`;
                }
            } else if (schema === 'pedidos') {
                if (campo === 'ativos') {
                    el.textContent = dados.pedidosCount;
                } else if (campo === 'concluidos') {
                    el.textContent = `${dados.vendasCount}/${dados.vendasCount + dados.despesasCount}`;
                } else if (campo === 'total') {
                    el.textContent = `€${dados.totalPedidos.toFixed(2)}`;
                }
            } else if (schema === 'indicadores') {
                if (campo === 'eficiencia') {
                    el.textContent = dados.vendasCount > 0 ? '92%' : '0%';
                } else if (campo === 'prazos') {
                    el.textContent = dados.pedidosCount > 0 ? '87%' : '0%';
                } else if (campo === 'satisfacao') {
                    el.textContent = dados.vendasCount > 0 ? '94%' : '0%';
                }
            }
        });
        
        // Atualizar lista de pedidos recentes se existir
        if (dados.ultimosPedidos.length > 0) {
            const pedidosContainer = document.getElementById('ultimos-pedidos');
            if (pedidosContainer) {
                const html = dados.ultimosPedidos.map(p => `
                    <div class="pedido-item">
                        <strong>${p.cliente}</strong>
                        <span>${p.numero} - €${p.total.toFixed(2)}</span>
                        <small>${p.data} • ${p.status}</small>
                    </div>
                `).join('');
                pedidosContainer.innerHTML = html;
            }
        }
    }

    // Função para atualizar gráficos com dados
    function atualizarGraficosComDados(dados) {
        // Verificar se Chart.js está disponível
        if (typeof Chart === 'undefined') return;
        
        // Atualizar gráfico de produção se existir
        const productionChart = Chart.getChart('productionChart');
        if (productionChart) {
            const vendasPercent = dados.totalVendas > 0 ? 
                (dados.totalVendas / (dados.totalVendas + dados.totalDespesas)) * 100 : 50;
            const despesasPercent = 100 - vendasPercent;
            
            productionChart.data.datasets[0].data = [vendasPercent, despesasPercent];
            productionChart.update();
        }
        
        // Atualizar gráfico de ponto de equilíbrio
        const breakEvenChart = Chart.getChart('breakEvenChart');
        if (breakEvenChart) {
            const meta = 10000; // Meta de vendas
            const atingido = Math.min(100, (dados.totalVendas / meta) * 100);
            breakEvenChart.data.datasets[0].data = [atingido, 100 - atingido];
            breakEvenChart.update();
        }
    }

    // Atualizar data atual se houver elemento
    const dateDisplay = document.querySelector('.current-date');
    if (dateDisplay) {
        const updateTime = () => {
            const now = new Date();
            dateDisplay.textContent = now.toLocaleDateString('pt-BR') + " " + now.toLocaleTimeString('pt-BR');
        };
        updateTime();
        setInterval(updateTime, 1000);
    }
    
    // Inicializar variável global para gráficos
    window.dadosCore = {};
});