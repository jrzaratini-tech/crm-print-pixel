// server.js - SERVIDOR PRINCIPAL v1.3
const express = require('express');
const cors = require('cors');
const { saveEvent, getEvents, updatePedidoStatus } = require('./database');

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
        version: 'v5.2.3',
        message: 'Sistema Core PrintPixel Online',
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
        console.log('📨 Recebendo requisição COMMIT:', {
            temId: !!req.body.id,
            id: req.body.id,
            schema: req.body.schema,
            pageId: req.body.pageId
        });
        
        const eventData = {
            ...req.body,
            timestamp: new Date().toISOString()
        };
        
        // Validar dados obrigatórios
        if (!eventData.schema) {
            return res.status(400).json({ 
                success: false, 
                error: 'Schema é obrigatório' 
            });
        }
        
        console.log('📤 Enviando para database.saveEvent...');
        const result = await saveEvent(eventData);
        
        console.log('✅ Resultado do saveEvent:', result);
        
        // CRÍTICO: Garantir que retorna o ID correto
        const documentId = result.documentId || result.id;
        const isUpdate = result.action === 'updated' || result.action === 'created_new';
        
        res.json({
            success: true,
            message: isUpdate ? 'Dados atualizados com sucesso' : 'Dados salvos com sucesso',
            id: documentId,                    // ID do documento no Firestore
            eventId: documentId,               // Para compatibilidade com engine.js
            action: result.action || 'unknown',
            ...result
        });
        
    } catch (error) {
        console.error('❌ Erro na rota /commit:', error);
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
        
        console.log('🔍 Buscando eventos:', { schema, filters });
        
        const events = await getEvents(schema, filters);
        
        res.json({
            success: true,
            events: events,
            count: events.length,
            schema: schema
        });
        
    } catch (error) {
        console.error('❌ Erro na rota /query:', error);
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
        console.error('❌ Erro ao atualizar status:', error);
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
const path = require('path');
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Sistema Core PrintPixel Online na porta ${PORT}`);
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`🔥 Firebase: Conectado`);
    console.log(`💾 Modo: Atualização corrigida (não duplica mais)`);
    console.log(`🔄 Engine v5.2.3 compatível`);
});