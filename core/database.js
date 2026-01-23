// database.js - CAMADA DE DADOS FIREBASE CORRIGIDA
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

// Função para salvar/atualizar eventos - CORRIGIDA
async function saveEvent(eventData) {
    try {
        console.log('📤 [DATABASE] Recebendo evento para salvar:', {
            temId: !!eventData.id,
            id: eventData.id || 'NENHUM',
            schema: eventData.schema,
            pageId: eventData.pageId,
            payloadKeys: Object.keys(eventData.payload || {}).length
        });

        const eventsCollection = db.collection('events');
        
        // CORREÇÃO CRÍTICA: SE TEM ID - ATUALIZAR documento existente
        if (eventData.id && eventData.id.trim() !== '') {
            const documentId = eventData.id.trim();
            console.log(`🔄 [DATABASE] Modo ATUALIZAÇÃO detectado para ID: ${documentId}`);
            
            const docRef = eventsCollection.doc(documentId);
            const docSnap = await docRef.get();
            
            if (docSnap.exists) {
                // ✅ DOCUMENTO EXISTE - ATUALIZAR
                console.log(`📝 [DATABASE] Documento EXISTE, ATUALIZANDO: ${documentId}`);
                
                // Preparar dados para atualização
                const updateData = {
                    ...eventData.payload,
                    schema: eventData.schema,
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    updated: true
                };
                
                // Manter dados importantes do documento original
                const existingData = docSnap.data();
                
                // Preservar campos críticos que não devem ser perdidos
                if (existingData.created_at) {
                    updateData.created_at = existingData.created_at;
                }
                
                // Preservar número do pedido se já existir e não for enviado novo
                if (existingData.numero && !updateData.numero) {
                    updateData.numero = existingData.numero;
                }
                
                // Atualizar o documento
                await docRef.update(updateData);
                
                console.log(`✅ [DATABASE] Documento ATUALIZADO com sucesso: ${documentId}`);
                return { 
                    success: true, 
                    id: documentId, 
                    action: 'updated',
                    exists: true,
                    message: 'Documento atualizado'
                };
            } else {
                // ⚠️ Documento NÃO existe, mas temos ID - CRIAR com o ID fornecido
                console.log(`⚠️ [DATABASE] Documento NÃO existe, CRIANDO com ID fornecido: ${documentId}`);
                
                // Garantir que não há ID duplicado no payload
                const payload = { ...eventData.payload };
                if (payload.id) delete payload.id;
                
                await docRef.set({
                    ...payload,
                    schema: eventData.schema,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                    deleted: false
                });
                
                console.log(`✅ [DATABASE] Novo documento CRIADO com ID fornecido: ${documentId}`);
                return { 
                    success: true, 
                    id: documentId, 
                    action: 'created_with_id',
                    exists: false,
                    message: 'Novo documento criado com ID fornecido'
                };
            }
        } 
        // SE NÃO TEM ID: Criar novo documento com ID automático
        else {
            console.log('🆕 [DATABASE] Modo CRIAÇÃO detectado - Gerando novo ID automático');
            
            // Criar novo documento com ID automático
            const docRef = await eventsCollection.add({
                ...eventData.payload,
                schema: eventData.schema,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                deleted: false
            });
            
            console.log(`✅ [DATABASE] Novo documento CRIADO com ID automático: ${docRef.id}`);
            return { 
                success: true, 
                id: docRef.id, 
                action: 'created_auto', 
                exists: false,
                message: 'Novo documento criado com ID automático'
            };
        }
    } catch (error) {
        console.error('❌ [DATABASE] Erro ao salvar evento no Firebase:', error);
        console.error('❌ [DATABASE] Detalhes do erro:', error.message);
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
            const data = doc.data();
            events.push({
                id: doc.id,
                ...data,
                // Garantir que o payload tenha estrutura consistente
                payload: typeof data === 'object' ? data : { data }
            });
        });
        
        console.log(`📊 [DATABASE] ${events.length} eventos encontrados para schema: ${schema}`);
        return events;
    } catch (error) {
        console.error('❌ [DATABASE] Erro ao buscar eventos:', error);
        throw error;
    }
}

// Função para atualizar status de pedido
async function updatePedidoStatus(pedidoId, novoStatus) {
    try {
        const docRef = db.collection('events').doc(pedidoId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
            throw new Error('Pedido não encontrado');
        }
        
        // Atualizar apenas o status mantendo outros dados
        await docRef.update({
            status: novoStatus,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            updated: true
        });
        
        console.log(`✅ [DATABASE] Status do pedido ${pedidoId} atualizado para: ${novoStatus}`);
        return { success: true, id: pedidoId };
    } catch (error) {
        console.error('❌ [DATABASE] Erro ao atualizar status do pedido:', error);
        throw error;
    }
}

module.exports = {
    saveEvent,
    getEvents,
    updatePedidoStatus
};