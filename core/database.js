// database.js - CAMADA DE DADOS FIREBASE (SERVIDOR)
const admin = require('firebase-admin');

// Certifique-se de que o Firebase está inicializado
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
            })
        });
        console.log('✅ Firebase Admin inicializado com sucesso');
    } catch (error) {
        console.error('❌ Erro ao inicializar Firebase Admin:', error);
    }
}

const db = admin.firestore();

// Função para salvar/atualizar eventos
async function saveEvent(eventData) {
    try {
        console.log('📤 Recebendo evento para salvar:', {
            temId: !!eventData.id,
            id: eventData.id,
            schema: eventData.schema,
            pageId: eventData.pageId
        });

        const eventsCollection = db.collection('events');
        
        // SE TEM ID: Atualizar documento existente
        if (eventData.id && eventData.id.trim() !== '') {
            console.log(`🔄 Modo ATUALIZAÇÃO detectado para ID: ${eventData.id}`);
            
            const docRef = eventsCollection.doc(eventData.id);
            const docSnap = await docRef.get();
            
            // Preparar dados para atualização
            const updateData = {
                ...eventData.payload, // Usar apenas o payload para atualização
                schema: eventData.schema, // Garantir que o schema está atualizado
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
                updated: true
            };
            
            // Preservar a data de criação se existir
            if (docSnap.exists) {
                // Documento existe, vamos atualizar
                console.log(`📝 Atualizando documento existente: ${eventData.id}`);
                
                // Manter dados importantes que não devem ser sobrescritos
                const existingData = docSnap.data();
                updateData.created_at = existingData.created_at || admin.firestore.FieldValue.serverTimestamp();
                
                // Se o documento existente tiver um número, mantê-lo
                if (existingData.numero) {
                    updateData.numero = existingData.numero;
                }
                
                // Se o documento existente tiver um status, mantê-lo a menos que seja explicitamente atualizado
                if (existingData.status && !updateData.status) {
                    updateData.status = existingData.status;
                }
                
                // Atualizar o documento existente
                await docRef.update(updateData);
                
                console.log(`✅ Documento ATUALIZADO com sucesso: ${eventData.id}`);
                return { 
                    success: true, 
                    id: eventData.id, 
                    action: 'updated',
                    exists: true 
                };
            } else {
                // Documento não existe, mas temos um ID - criar novo documento com o ID fornecido
                console.log(`⚠️ Documento não encontrado, criando novo com ID fornecido: ${eventData.id}`);
                
                await docRef.set({
                    ...eventData.payload,
                    schema: eventData.schema,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    deleted: false
                });
                
                return { 
                    success: true, 
                    id: eventData.id, 
                    action: 'created',
                    exists: false
                };
            }
        } 
        // SE NÃO TEM ID: Criar novo documento
        else {
            console.log('🆕 Modo CRIAÇÃO detectado - Gerando novo ID');
            
            // Criar novo documento com ID automático
            const docRef = await eventsCollection.add({
                ...eventData.payload,
                schema: eventData.schema,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                deleted: false
            });
            
            console.log(`✅ Novo documento CRIADO com ID: ${docRef.id}`);
            return { 
                success: true, 
                id: docRef.id, 
                action: 'created', 
                exists: false 
            };
        }
    } catch (error) {
        console.error('❌ Erro ao salvar evento no Firebase:', error);
        throw error;
    }
}

// Função para buscar eventos
async function getEvents(schema = 'all', filters = {}) {
    try {
        let query = db.collection('events');
        
        // Filtrar por schema se não for 'all'
        if (schema !== 'all') {
            query = query.where('schema', '==', schema);
        }
        
        // Aplicar outros filtros
        Object.keys(filters).forEach(key => {
            if (filters[key] !== undefined) {
                query = query.where(key, '==', filters[key]);
            }
        });
        
        // Filtrar apenas não deletados
        query = query.where('deleted', '==', false);
        
        const snapshot = await query.orderBy('created_at', 'desc').get();
        const events = [];
        
        snapshot.forEach(doc => {
            events.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`📊 ${events.length} eventos encontrados para schema: ${schema}`);
        return events;
    } catch (error) {
        console.error('❌ Erro ao buscar eventos:', error);
        throw error;
    }
}

// Função para atualizar status de pedido (exemplo)
async function updatePedidoStatus(pedidoId, novoStatus) {
    try {
        const docRef = db.collection('events').doc(pedidoId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
            throw new Error('Pedido não encontrado');
        }
        
        const pedidoData = docSnap.data();
        
        // Atualizar apenas o status mantendo outros dados
        await docRef.update({
            'payload.status': novoStatus,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            updated: true
        });
        
        console.log(`✅ Status do pedido ${pedidoId} atualizado para: ${novoStatus}`);
        return { success: true, id: pedidoId };
    } catch (error) {
        console.error('❌ Erro ao atualizar status do pedido:', error);
        throw error;
    }
}

module.exports = {
    saveEvent,
    getEvents,
    updatePedidoStatus
};