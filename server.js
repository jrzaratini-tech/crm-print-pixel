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

// API para salvar dados
app.post('/api/database/commit', async (req, res) => {
  try {
    const { schema, payload, pageId } = req.body;
    
    if (!schema || !payload) {
      return res.status(400).json({ error: 'schema e payload são obrigatórios' });
    }
    
    const event = {
      schema,
      payload,
      pageId: pageId || 'unknown',
      timestamp: new Date().toISOString(),
      deleted: false
    };
    
    const result = await db.collection('events').add(event);
    
    res.json({
      status: 'success',
      message: 'Evento salvo no Firebase',
      id: result.id,
      event: event
    });
  } catch (error) {
    console.error('Erro ao salvar:', error);
    res.status(500).json({ error: error.message });
  }
});

// API para consultar dados
app.get('/api/database/query', async (req, res) => {
  try {
    const { schema, limit = 100 } = req.query;
    
    let query = db.collection('events').where('deleted', '==', false);
    
    if (schema) {
      query = query.where('schema', '==', schema);
    }
    
    const snapshot = await query.orderBy('timestamp', 'desc').limit(parseInt(limit)).get();
    
    const events = [];
    snapshot.forEach(doc => {
      events.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      status: 'success',
      count: events.length,
      events: events
    });
  } catch (error) {
    console.error('Erro na consulta:', error);
    res.status(500).json({ error: error.message });
  }
});

// Servir o index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 CRM PRINT PIXEL ONLINE - PORTA ${PORT}`);
  console.log(`📅 ${new Date().toLocaleString()}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
});