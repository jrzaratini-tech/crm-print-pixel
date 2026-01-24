/**
 * CONFIG.JS - Configurações do Sistema CORE v5.1
 */

class CoreConfig {
    constructor() {
        this.settings = {
            version: '5.1',
            mode: 'online',
            backup_interval: 300000, // 5 minutos
        };
    }

    async init() {
        console.log('⚙️ Configurações do CORE inicializando...');
        
        // Carregar configurações salvas
        await this.loadSettings();
        
        // Iniciar backup automático
        this.startAutoBackup();
        
        return this.settings;
    }

    async loadSettings() {
        try {
            // Carregar do localStorage
            const saved = localStorage.getItem('core_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            }
            
            console.log('✅ Configurações carregadas:', this.settings);
        } catch (error) {
            console.warn('⚠️ Não foi possível carregar configurações:', error);
        }
    }

    async saveSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            // Salvar no localStorage
            localStorage.setItem('core_settings', JSON.stringify(this.settings));
            
            console.log('✅ Configurações salvas:', this.settings);
            return true;
        } catch (error) {
            console.error('❌ Erro ao salvar configurações:', error);
            return false;
        }
    }

    startAutoBackup() {
        // Backup automático no Firebase é gerenciado pelo servidor
        console.log('💾 Backup automático configurado no Firebase');
    }

    async createBackup() {
        try {
            const backup = {
                settings: this.settings,
                timestamp: new Date().toISOString(),
                version: this.settings.version
            };
            
            console.log('✅ Backup criado:', backup);
            return backup;
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
            return null;
        }
    }

    // Métodos de utilidade
    getVersion() {
        return this.settings.version;
    }

    getMode() {
        return this.settings.mode;
    }

    updateVersion(newVersion) {
        this.settings.version = newVersion;
        this.saveSettings({});
    }
}

// Exportar para uso no sistema
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreConfig;
} else {
    window.CoreConfig = CoreConfig;
}
