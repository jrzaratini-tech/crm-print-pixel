/**
 * DATABASE.JS - Sistema de dados compatível com v4.0
 * Mantém compatibilidade com eventos imutáveis
 */

const DB = {
    // Salvar um evento (compatível com engine.js)
    saveEvent: function(event) {
        try {
            const history = JSON.parse(localStorage.getItem('system_events') || '[]');
            history.push(event);
            localStorage.setItem('system_events', JSON.stringify(history));
            console.log("✅ Evento salvo no DB:", event.id);
            
            // Disparar evento de salvamento
            window.dispatchEvent(new CustomEvent('coreDataChanged'));
            
            return event;
        } catch (error) {
            console.error("❌ Erro ao salvar evento:", error);
            return null;
        }
    },

    // Buscar eventos por schema
    getEvents: function(schema = null) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            
            if (schema) {
                return events.filter(e => e.schema === schema && !e.deleted);
            }
            
            return events.filter(e => !e.deleted);
        } catch (error) {
            console.error("❌ Erro ao buscar eventos:", error);
            return [];
        }
    },

    // Buscar todos os eventos (incluindo deletados)
    getAllEvents: function() {
        try {
            return JSON.parse(localStorage.getItem('system_events') || '[]');
        } catch (error) {
            console.error("❌ Erro ao buscar todos eventos:", error);
            return [];
        }
    },

    // Soft delete de evento
    deleteEvent: function(eventId) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            const eventIndex = events.findIndex(e => e.id === eventId);
            
            if (eventIndex !== -1) {
                events[eventIndex].deleted = true;
                localStorage.setItem('system_events', JSON.stringify(events));
                
                // Disparar evento de salvamento
                window.dispatchEvent(new CustomEvent('coreDataChanged'));
                
                console.log("🗑️ Evento marcado como deletado:", eventId);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error("❌ Erro ao deletar evento:", error);
            return false;
        }
    },

    // Estatísticas
    getStats: function() {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            const active = events.filter(e => !e.deleted);
            
            return {
                total: events.length,
                active: active.length,
                deleted: events.length - active.length
            };
        } catch (error) {
            console.error("❌ Erro ao obter estatísticas:", error);
            return { total: 0, active: 0, deleted: 0 };
        }
    },

    // Configurações
    getSettings: function() {
        try {
            return JSON.parse(localStorage.getItem('system_settings') || '{}');
        } catch (error) {
            console.error("❌ Erro ao buscar configurações:", error);
            return {};
        }
    },

    saveSetting: function(key, value) {
        try {
            const settings = JSON.parse(localStorage.getItem('system_settings') || '{}');
            settings[key] = value;
            localStorage.setItem('system_settings', JSON.stringify(settings));
            
            // Disparar evento de salvamento
            window.dispatchEvent(new CustomEvent('coreDataChanged'));
            
            return true;
        } catch (error) {
            console.error("❌ Erro ao salvar configuração:", error);
            return false;
        }
    },

    // Exportar dados
    exportData: function() {
        try {
            const data = {
                system_events: JSON.parse(localStorage.getItem('system_events') || '[]'),
                system_settings: JSON.parse(localStorage.getItem('system_settings') || '{}'),
                export_date: new Date().toISOString(),
                version: '4.0'
            };
            
            return {
                data: JSON.stringify(data, null, 2),
                filename: `core_export_${new Date().toISOString().split('T')[0]}.json`
            };
        } catch (error) {
            console.error("❌ Erro ao exportar dados:", error);
            return {
                data: '{}',
                filename: 'error.json'
            };
        }
    },

    // Importar dados
    importData: function(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            if (!data.system_events || !data.system_settings) {
                throw new Error('Formato de arquivo inválido');
            }
            
            localStorage.setItem('system_events', JSON.stringify(data.system_events));
            localStorage.setItem('system_settings', JSON.stringify(data.system_settings));
            
            // Disparar evento de salvamento
            window.dispatchEvent(new CustomEvent('coreDataChanged'));
            
            return { success: true, message: 'Dados importados com sucesso!' };
        } catch (error) {
            console.error("❌ Erro ao importar dados:", error);
            return { success: false, message: 'Erro ao importar dados: ' + error.message };
        }
    },

    // Limpar todos os dados
    clearAll: function() {
        try {
            localStorage.removeItem('system_events');
            localStorage.removeItem('system_settings');
            
            // Re-inicializar
            localStorage.setItem('system_events', '[]');
            localStorage.setItem('system_settings', JSON.stringify({
                primary: '#2c3e50',
                accent: '#3498db',
                menu_config: []
            }));
            
            return true;
        } catch (error) {
            console.error("❌ Erro ao limpar dados:", error);
            return false;
        }
    },

    // Backup manual
    createBackup: function() {
        try {
            const backupData = {
                system_events: localStorage.getItem('system_events'),
                system_settings: localStorage.getItem('system_settings'),
                timestamp: new Date().toISOString(),
                backup_type: 'manual'
            };
            
            const backupKey = `backup_manual_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify(backupData));
            
            return {
                success: true,
                key: backupKey,
                timestamp: backupData.timestamp
            };
        } catch (error) {
            console.error("❌ Erro ao criar backup:", error);
            return { success: false, error: error.message };
        }
    },

    // Restaurar backup
    restoreBackup: function(backupKey) {
        try {
            const backupData = JSON.parse(localStorage.getItem(backupKey));
            
            if (!backupData) {
                throw new Error('Backup não encontrado');
            }
            
            if (backupData.system_events) {
                localStorage.setItem('system_events', backupData.system_events);
            }
            
            if (backupData.system_settings) {
                localStorage.setItem('system_settings', backupData.system_settings);
            }
            
            // Disparar evento de salvamento
            window.dispatchEvent(new CustomEvent('coreDataChanged'));
            
            return { success: true, message: 'Backup restaurado com sucesso!' };
        } catch (error) {
            console.error("❌ Erro ao restaurar backup:", error);
            return { success: false, message: 'Erro ao restaurar backup: ' + error.message };
        }
    },

    // Buscar por período
    getEventsByPeriod: function(startDate, endDate) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            const start = new Date(startDate).getTime();
            const end = new Date(endDate).getTime();
            
            return events.filter(event => {
                if (event.deleted) return false;
                
                const eventDate = new Date(event.created_at).getTime();
                return eventDate >= start && eventDate <= end;
            });
        } catch (error) {
            console.error("❌ Erro ao buscar eventos por período:", error);
            return [];
        }
    },

    // Contar por schema
    countBySchema: function(schema) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            return events.filter(e => e.schema === schema && !e.deleted).length;
        } catch (error) {
            console.error("❌ Erro ao contar eventos por schema:", error);
            return 0;
        }
    },

    // Buscar eventos recentes
    getRecentEvents: function(limit = 10) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            return events
                .filter(e => !e.deleted)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, limit);
        } catch (error) {
            console.error("❌ Erro ao buscar eventos recentes:", error);
            return [];
        }
    },

    // Buscar por source
    getEventsBySource: function(source) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            return events.filter(e => e.source === source && !e.deleted);
        } catch (error) {
            console.error("❌ Erro ao buscar eventos por source:", error);
            return [];
        }
    },

    // Atualizar evento
    updateEvent: function(eventId, updates) {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            const eventIndex = events.findIndex(e => e.id === eventId);
            
            if (eventIndex !== -1) {
                // Preservar dados imutáveis, criar novo evento
                const originalEvent = events[eventIndex];
                const updatedEvent = {
                    ...originalEvent,
                    ...updates,
                    updated_at: new Date().toISOString(),
                    original_id: originalEvent.id
                };
                
                // Marcar original como deletado
                events[eventIndex].deleted = true;
                
                // Adicionar novo evento
                events.push(updatedEvent);
                
                localStorage.setItem('system_events', JSON.stringify(events));
                
                // Disparar evento de salvamento
                window.dispatchEvent(new CustomEvent('coreDataChanged'));
                
                return updatedEvent;
            }
            
            return null;
        } catch (error) {
            console.error("❌ Erro ao atualizar evento:", error);
            return null;
        }
    },

    // Verificar integridade dos dados
    checkIntegrity: function() {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            const settings = JSON.parse(localStorage.getItem('system_settings') || '{}');
            
            let errors = [];
            
            // Verificar se events é array
            if (!Array.isArray(events)) {
                errors.push('system_events não é um array válido');
            }
            
            // Verificar se settings é objeto
            if (typeof settings !== 'object' || settings === null) {
                errors.push('system_settings não é um objeto válido');
            }
            
            // Verificar eventos individuais
            events.forEach((event, index) => {
                if (!event.id) errors.push(`Evento ${index} sem ID`);
                if (!event.schema) errors.push(`Evento ${index} sem schema`);
                if (!event.created_at) errors.push(`Evento ${index} sem created_at`);
            });
            
            return {
                valid: errors.length === 0,
                totalEvents: events.length,
                totalSettings: Object.keys(settings).length,
                errors: errors
            };
        } catch (error) {
            console.error("❌ Erro ao verificar integridade:", error);
            return {
                valid: false,
                totalEvents: 0,
                totalSettings: 0,
                errors: [error.message]
            };
        }
    },

    // Compactar dados (remover eventos deletados permanentemente)
    compactData: function() {
        try {
            const events = JSON.parse(localStorage.getItem('system_events') || '[]');
            const activeEvents = events.filter(e => !e.deleted);
            
            localStorage.setItem('system_events', JSON.stringify(activeEvents));
            
            // Disparar evento de salvamento
            window.dispatchEvent(new CustomEvent('coreDataChanged'));
            
            return {
                success: true,
                before: events.length,
                after: activeEvents.length,
                removed: events.length - activeEvents.length
            };
        } catch (error) {
            console.error("❌ Erro ao compactar dados:", error);
            return { success: false, error: error.message };
        }
    }
};

// Exportar para uso global
window.DB = DB;