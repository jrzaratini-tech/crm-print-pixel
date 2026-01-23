// server.js - SERVIDOR PRINCIPAL
const express = require('express');
const cors = require('cors');
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
        version: 'v5.2.2',
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

// Rota para SALVAR/ATUALIZAR eventos (ATUALIZADA)
app.post('/api/database/commit', async (req, res) => {
    try {
        console.log('📨 Recebendo requisição COMMIT:', {
            temId: !!req.body.id,
            id: req.body.id,
            schema: req.body.schema,
            pageId: req.body.pageId
        });
        
        // Validar dados obrigatórios
        if (!req.body.schema) {
            return res.status(400).json({ 
                success: false, 
                error: 'Schema é obrigatório' 
            });
        }
        
        // Preparar dados para salvar
        const eventData = {
            ...req.body,
            timestamp: new Date().toISOString()
        };
        
        // Tratamento consistente do ID
        if (req.body.id) {
            // Se já houver ID no nível superior, usá-lo e remover do payload se existir
            eventData.id = req.body.id;
            if (eventData.payload && eventData.payload.id) {
                delete eventData.payload.id;
            }
        } else if (eventData.payload && eventData.payload.id) {
            // Se não houver ID no nível superior, mas houver no payload, movê-lo para o nível superior
            eventData.id = eventData.payload.id;
            delete eventData.payload.id;
        }
        
        console.log('📤 Dados processados para salvar:', {
            id: eventData.id,
            schema: eventData.schema,
            temPayload: !!eventData.payload
        });
        
        const result = await saveEvent(eventData);
        
        res.json({
            success: true,
            message: result.action === 'updated' ? 'Dados atualizados com sucesso' : 'Dados salvos com sucesso',
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
});