// server.js - SERVIDOR PRINCIPAL CORRIGIDO
const express = require('express');
const cors = require('cors');
const path = require('path');
const { saveEvent, getEvents, updatePedidoStatus } = require('./core/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Rota de teste
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        version: 'v5.2.2-FIXED',
        message: 'Sistema Core PrintPixel Online - DUPLICAÇÃO CORRIGIDA',
        timestamp: new Date().toISOString()
    });
});

// Rota de inicialização do Firebase
app.get('/api/database/init', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Firebase pronto',
        timestamp: new Date().toISOString()
    });
});

// Rota para SALVAR/ATUALIZAR eventos (CORRIGIDA)
app.post('/api/database/commit', async (req, res) => {
    try {
        console.log('📨 [SERVER] Recebendo requisição COMMIT:', {
            bodyId: req.body.id || 'NENHUM',
            payloadId: req.body.payload?.id || 'NENHUM',
            schema: req.body.schema,
            pageId: req.body.pageId,
            isUpdate: !!(req.body.id || req.body.payload?.id)
        });
        
        // Validar dados obrigatórios
        if (!req.body.schema) {
            return res.status(400).json({ 
                success: false, 
                error: 'Schema é obrigatório' 
            });
        }
        
        // Preparar dados para salvar - CORREÇÃO CRÍTICA
        const eventData = {
            schema: req.body.schema,
            payload: req.body.payload || {},
            pageId: req.body.pageId || 'unknown',
            timestamp: new Date().toISOString()
        };
        
        // CORREÇÃO: ID deve vir NO TOPO do objeto, não dentro do payload
        if (req.body.id && req.body.id.trim() !== '') {
            // ID no nível superior (vindo do engine.js)
            eventData.id = req.body.id.trim();
            console.log(`🔄 [SERVER] ID do nível superior para ATUALIZAÇÃO: ${eventData.id}`);
            
            // Remover ID do payload se existir para evitar conflito
            if (eventData.payload.id) {
                delete eventData.payload.id;
            }
        } else if (req.body.payload && req.body.payload.id && req.body.payload.id.trim() !== '') {
            // ID dentro do payload (compatibilidade)
            eventData.id = req.body.payload.id.trim();
            console.log(`🔄 [SERVER] ID do payload para ATUALIZAÇÃO: ${eventData.id}`);
            delete eventData.payload.id;
        }
        
        // Log detalhado
        console.log('📤 [SERVER] Dados processados para salvar:', {
            id: eventData.id || 'NOVO (sem ID)',
            schema: eventData.schema,
            temPayload: !!eventData.payload,
            isUpdate: !!eventData.id
        });
        
        const result = await saveEvent(eventData);
        
        res.json({
            success: true,
            message: result.action === 'updated' ? 'Dados atualizados com sucesso' : 'Dados salvos com sucesso',
            ...result
        });
        
    } catch (error) {
        console.error('❌ [SERVER] Erro na rota /commit:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: 'Erro ao salvar/atualizar dados no Firebase'
        });
    }
});

// Rota para BUSCAR eventos
app.post('/api/database/query', async (req, res) => {
    try {
        const { schema = 'all', filters = {} } = req.body;
        
        console.log('🔍 [SERVER] Buscando eventos:', { schema, filters });
        
        const events = await getEvents(schema, filters);
        
        res.json({
            success: true,
            events: events,
            count: events.length,
            schema: schema
        });
        
    } catch (error) {
        console.error('❌ [SERVER] Erro na rota /query:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            events: []
        });
    }
});

// Rota para ATUALIZAR STATUS do pedido
app.post('/api/database/update-status', async (req, res) => {
    try {
        const { pedidoId, status } = req.body;
        
        if (!pedidoId || !status) {
            return res.status(400).json({ 
                success: false, 
                error: 'pedidoId e status são obrigatórios' 
            });
        }
        
        const result = await updatePedidoStatus(pedidoId, status);
        
        res.json({
            success: true,
            message: 'Status atualizado com sucesso',
            ...result
        });
        
    } catch (error) {
        console.error('❌ [SERVER] Erro ao atualizar status:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message
        });
    }
});

// Rota para backup (opcional)
app.post('/api/database/backup', async (req, res) => {
    try {
        const events = await getEvents('all', {});
        
        res.json({
            success: true,
            backup_date: new Date().toISOString(),
            event_count: events.length,
            events: events
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Rota para estatísticas
app.get('/api/database/stats', async (req, res) => {
    try {
        const pedidos = await getEvents('pedido', {});
        const vendas = await getEvents('venda', {});
        const despesas = await getEvents('despesa', {});
        const orcamentos = await getEvents('orcamento', {});
        
        res.json({
            success: true,
            stats: {
                pedidos: pedidos.length,
                vendas: vendas.length,
                despesas: despesas.length,
                orcamentos: orcamentos.length,
                total: pedidos.length + vendas.length + despesas.length + orcamentos.length
            }
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Servir arquivos estáticos
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Rota API não encontrada' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Sistema Core PrintPixel Online na porta ${PORT}`);
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔥 Firebase: Conectado`);
    console.log(`🛠️  MODIFICAÇÃO: Duplicação em edição CORRIGIDA`);
    console.log(`🔧 Versão: v5.2.2-FIXED`);
});