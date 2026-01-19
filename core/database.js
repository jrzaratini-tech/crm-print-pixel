/**
 * DATABASE.JS v5.0 - SISTEMA DE DADOS PARA PEN DRIVE
 * Atualização do CRM INTELIGENTE para salvar exclusivamente no Pen Drive
 * Responsável por: Operações SQLite no Pen Drive via API Node.js
 */

class DatabaseManager {
    constructor() {
        this.dbPath = './DATA/database/core.db';
        this.initialized = false;
    }

    async init() {
        try {
            // Inicializar banco via API Node.js
            const response = await fetch('/api/database/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.initialized = true;
                console.log('✅ Banco de dados SQLite inicializado no Pen Drive');
                return true;
            } else {
                throw new Error('Falha ao inicializar banco');
            }
        } catch (error) {
            console.error('❌ Erro ao inicializar banco:', error);
            return false;
        }
    }

    // Salvar um evento (compatível com engine.js)
    async saveEvent(event) {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const response = await fetch('/api/database/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schema: event.schema,
                    payload: event.payload,
                    pageId: event.page_id || event.source,
                    timestamp: event.created_at || new Date().toISOString()
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Evento salvo no Pen Drive:', result);
                
                // Disparar evento de salvamento
                window.dispatchEvent(new CustomEvent('coreDataChanged'));
                
                return { ...event, id: result.eventId };
            } else {
                throw new Error('Falha ao salvar evento');
            }
        } catch (error) {
            console.error('❌ Erro ao salvar evento:', error);
            return null;
        }
    }

    // Buscar eventos por schema
    async getEvents(schema = null) {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const params = new URLSearchParams();
            if (schema) params.append('schema', schema);
            params.append('limit', '1000');

            const response = await fetch(`/api/database/query?${params}`);
            
            if (response.ok) {
                const events = await response.json();
                console.log(`📊 ${events.length} eventos carregados do Pen Drive`);
                return events;
            } else {
                throw new Error('Falha ao consultar eventos');
            }
        } catch (error) {
            console.error('❌ Erro ao consultar eventos:', error);
            return [];
        }
    }

    // Estatísticas
    async getStats() {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const response = await fetch('/api/database/stats');
            
            if (response.ok) {
                const stats = await response.json();
                return stats;
            } else {
                throw new Error('Falha ao obter estatísticas');
            }
        } catch (error) {
            console.error('❌ Erro ao obter estatísticas:', error);
            return {
                totalEvents: 0,
                totalSales: 0,
                totalExpenses: 0,
                pendingOrders: 0,
                storageUsed: '0 KB'
            };
        }
    }

    // Configurações
    async getSettings() {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const response = await fetch('/api/database/getSettings');
            
            if (response.ok) {
                const settings = await response.json();
                return settings;
            } else {
                throw new Error('Falha ao carregar configurações');
            }
        } catch (error) {
            console.error('❌ Erro ao buscar configurações:', error);
            return {};
        }
    }

    async saveSetting(key, value) {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const response = await fetch('/api/database/saveSetting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });

            if (response.ok) {
                console.log("✅ Configuração salva:", key);
                
                // Disparar evento de salvamento
                window.dispatchEvent(new CustomEvent('coreDataChanged'));
                
                return true;
            } else {
                throw new Error('Falha ao salvar configuração');
            }
        } catch (error) {
            console.error("❌ Erro ao salvar configuração:", error);
            return false;
        }
    }

    // Backup
    async createBackup() {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const response = await fetch('/api/database/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                console.log("✅ Backup criado no Pen Drive:", result);
                return {
                    success: true,
                    key: result.backupPath,
                    timestamp: result.timestamp
                };
            } else {
                throw new Error('Falha ao criar backup');
            }
        } catch (error) {
            console.error("❌ Erro ao criar backup:", error);
            return { success: false, error: error.message };
        }
    }
}

// Compatibilidade com API antiga
const DB = {
    saveEvent: async (event) => {
        return await window.db.saveEvent(event);
    },
    
    getEvents: async (schema = null) => {
        return await window.db.getEvents(schema);
    },
    
    getStats: async () => {
        return await window.db.getStats();
    },
    
    getSettings: async () => {
        return await window.db.getSettings();
    },
    
    saveSetting: async (key, value) => {
        return await window.db.saveSetting(key, value);
    },
    
    createBackup: async () => {
        return await window.db.createBackup();
    }
};

// Exportar instâncias globais
window.DatabaseManager = DatabaseManager;
window.db = new DatabaseManager();
window.DB = DB;

console.log('💾 Database Manager v5.0 carregado - Modo Pen Drive exclusivo (SQLite)');
