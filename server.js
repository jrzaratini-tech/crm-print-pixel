const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('./firebase.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API Endpoint para testar Firebase
app.get('/api/database/init', async (req, res) => {
  try {
    // Teste simples do Firebase
    const testRef = db.collection('_system_test');
    await testRef.doc('test').set({
      test: true,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      status: 'ok',
      message: 'Firebase pronto e conectado',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro Firebase:', error);
    res.status(500).json({
      status: 'error',
      message: `Erro no Firebase: ${error.message}`
    });
  }
});

// API para salvar/atualizar dados (CORRIGIDA)
app.post('/api/database/commit', async (req, res) => {
  try {
    const { schema, payload, pageId, id } = req.body;
    
    if (!schema || !payload) {
      return res.status(400).json({ error: 'schema e payload são obrigatórios' });
    }
    
    const event = {
      schema,
      payload,
      pageId: pageId || 'unknown',
      timestamp: new Date().toISOString(),
      deleted: false,
      updated_at: new Date().toISOString()
    };
    
    let result;
    
    // SE TEM ID: Atualizar documento existente
    if (id && id.trim() !== '') {
      console.log(`🔄 Modo ATUALIZAÇÃO detectado para ID: "${id}"`);
      
      const docRef = db.collection('events').doc(id);
      const docSnap = await docRef.get();
      
      if (docSnap.exists) {
        console.log(`📊 Documento encontrado no Firestore, ATUALIZANDO...`);
        // Atualizar mantendo dados originais
        const existingData = docSnap.data();
        await docRef.set({
          ...existingData,
          ...event,
          updated: true
        }, { merge: true });
        
        result = { id: id, action: 'updated', exists: true };
      } else {
        console.log(`⚠️ Documento não encontrado com ID: "${id}", CRIANDO NOVO...`);
        // Criar novo com o ID fornecido
        await docRef.set({
          ...event,
          created_at: new Date().toISOString()
        });
        
        result = { id: id, action: 'created_new', exists: false };
      }
    } 
    // SE NÃO TEM ID: Criar novo documento
    else {
      console.log('🆕 Modo CRIAÇÃO detectado - Gerando novo ID');
      
      const docRef = await db.collection('events').add({
        ...event,
        created_at: new Date().toISOString()
      });
      
      result = { id: docRef.id, action: 'created', exists: false };
    }
    
    console.log(`✅ Evento salvo: ${result.action} com ID: ${result.id}`);
    
    res.json({
      status: 'success',
      message: 'Evento salvo no Firebase',
      ...result,
      event: event
    });
  } catch (error) {
    console.error('❌ Erro ao salvar:', error);
    res.status(500).json({ error: error.message });
  }
});

// API para consultar dados (MUDADO PARA POST)
app.post('/api/database/query', async (req, res) => {
  try {
    const { schema, limit = 100, filters = {} } = req.body;
    
    console.log(`🔍 Query recebida: schema=${schema}, limit=${limit}, filters=`, filters);
    
    let query = db.collection('events').where('deleted', '==', false);
    
    if (schema && schema !== 'all') {
      console.log(`🎯 Filtrando por schema: ${schema}`);
      query = query.where('schema', '==', schema);
    }
    
    // Aplicar filtros adicionais (exceto schema que já foi tratado)
    if (filters && typeof filters === 'object') {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && key !== 'schema' && key !== 'deleted') {
          console.log(`🎯 Aplicando filtro: ${key}=${filters[key]}`);
          query = query.where(key, '==', filters[key]);
        }
      });
    }
    
    const snapshot = await query.orderBy('timestamp', 'desc').limit(parseInt(limit)).get();
    
    const events = [];
    snapshot.forEach(doc => {
      events.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`📊 ${events.length} eventos encontrados`);
    
    res.json({
      status: 'success',
      success: true,
      count: events.length,
      events: events
    });
  } catch (error) {
    console.error('❌ Erro na consulta:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      status: 'error',
      success: false,
      error: error.message 
    });
  }
});

// API para deletar (soft delete)
app.post('/api/database/delete', async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }
    
    const docRef = db.collection('events').doc(id);
    await docRef.update({
      deleted: true,
      deleted_at: new Date().toISOString()
    });
    
    res.json({
      status: 'success',
      message: 'Evento marcado como deletado',
      id: id
    });
  } catch (error) {
    console.error('Erro ao deletar:', error);
    res.status(500).json({ error: error.message });
  }
});

// API para estatísticas
app.get('/api/database/stats', async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Total de eventos
    const totalSnapshot = await db.collection('events')
      .where('deleted', '==', false)
      .get();
    
    // Eventos hoje
    const todaySnapshot = await db.collection('events')
      .where('deleted', '==', false)
      .where('timestamp', '>=', startOfDay.toISOString())
      .get();
    
    // Eventos este mês
    const monthSnapshot = await db.collection('events')
      .where('deleted', '==', false)
      .where('timestamp', '>=', startOfMonth.toISOString())
      .get();
    
    res.json({
      status: 'success',
      stats: {
        total: totalSnapshot.size,
        today: todaySnapshot.size,
        thisMonth: monthSnapshot.size,
        schemas: {
          pedidos: totalSnapshot.docs.filter(doc => doc.data().schema === 'pedido').length,
          despesas: totalSnapshot.docs.filter(doc => doc.data().schema === 'despesa').length,
          vendas: totalSnapshot.docs.filter(doc => doc.data().schema === 'venda').length
        }
      }
    });
  } catch (error) {
    console.error('Erro nas estatísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Servir o index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para servir qualquer página HTML
app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 CRM PRINT PIXEL ONLINE - PORTA ${PORT}`);
  console.log(`📅 ${new Date().toLocaleString()}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
  console.log(`🔧 Endpoints disponíveis:`);
  console.log(`   GET  /api/database/init     - Testar Firebase`);
  console.log(`   POST /api/database/commit   - Salvar/Atualizar dados`);
  console.log(`   POST /api/database/query    - Consultar dados (AGORA É POST!)`);
  console.log(`   POST /api/database/delete   - Soft delete`);
  console.log(`   GET  /api/database/stats    - Estatísticas`);
});