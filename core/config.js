/**
 * CONFIG.JS - Configurações do Sistema CORE Portátil
 */

class CoreConfig {
    constructor() {
        this.settings = {
            version: '4.0.1',
            mode: 'portable',
            data_file: 'core_data.json',
            backup_interval: 300000, // 5 minutos
            admin_pin: '3377'
        };
        
        // Verificar se está no modo pen drive
        this.isPortable = localStorage.getItem('core_portable_mode') === 'true' || 
                         window.location.protocol === 'file:';
    }

    async init() {
        console.log('⚙️ Configurações do CORE inicializando...');
        
        // Carregar configurações salvas
        await this.loadSettings();
        
        // Configurar ambiente portátil
        if (this.isPortable) {
            this.setupPortableEnvironment();
        }
        
        // Iniciar backup automático
        this.startAutoBackup();
        
        return this.settings;
    }

    async loadSettings() {
        try {
            // Primeiro, tentar carregar do localStorage (para compatibilidade)
            const saved = localStorage.getItem('core_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            }
            
            // Tentar carregar do arquivo JSON (modo portátil)
            if (this.isPortable) {
                const fileSettings = await this.loadFromFile();
                if (fileSettings) {
                    this.settings = { ...this.settings, ...fileSettings };
                }
            }
            
            console.log('✅ Configurações carregadas:', this.settings);
        } catch (error) {
            console.warn('⚠️ Não foi possível carregar configurações:', error);
        }
    }

    async saveSettings(newSettings) {
        try {
            this.settings = { ...this.settings, ...newSettings };
            
            // Salvar no localStorage (para sessão atual)
            localStorage.setItem('core_settings', JSON.stringify(this.settings));
            
            // Salvar no arquivo (modo portátil)
            if (this.isPortable) {
                await this.saveToFile();
            }
            
            console.log('✅ Configurações salvas:', this.settings);
            return true;
        } catch (error) {
            console.error('❌ Erro ao salvar configurações:', error);
            return false;
        }
    }

    async loadFromFile() {
        try {
            if (typeof window.showOpenFilePicker !== 'function') {
                return null;
            }
            
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Arquivos de Configuração',
                    accept: {'application/json': ['.json']}
                }],
                multiple: false
            });
            
            const file = await fileHandle.getFile();
            const content = await file.text();
            return JSON.parse(content);
        } catch (error) {
            console.warn('⚠️ Não foi possível carregar do arquivo:', error);
            return null;
        }
    }

    async saveToFile() {
        try {
            if (typeof window.showSaveFilePicker !== 'function') {
                return false;
            }
            
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: 'core_config.json',
                types: [{
                    description: 'Arquivos de Configuração',
                    accept: {'application/json': ['.json']}
                }]
            });
            
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(this.settings, null, 2));
            await writable.close();
            
            return true;
        } catch (error) {
            console.warn('⚠️ Não foi possível salvar no arquivo:', error);
            return false;
        }
    }

    setupPortableEnvironment() {
        console.log('💾 Modo Pen Drive ativado');
        
        // Substituir localStorage por um sistema de arquivos
        this.overrideLocalStorage();
        
        // Adicionar banner informativo
        this.addPortableBanner();
        
        // Configurar backup automático no pen drive
        this.setupFileSystemBackup();
    }

    overrideLocalStorage() {
        const originalSetItem = Storage.prototype.setItem;
        const originalGetItem = Storage.prototype.getItem;
        const originalRemoveItem = Storage.prototype.removeItem;
        const originalClear = Storage.prototype.clear;

        // Interceptar localStorage para fazer backup automático
        Storage.prototype.setItem = function(key, value) {
            originalSetItem.call(this, key, value);
            
            // Se for dado do sistema, fazer backup
            if (key.includes('system_') || key.includes('core_')) {
                window.dispatchEvent(new CustomEvent('coreDataChanged'));
            }
        };

        // Restaurar métodos originais
        Storage.prototype.getItem = originalGetItem;
        Storage.prototype.removeItem = originalRemoveItem;
        Storage.prototype.clear = originalClear;
    }

    addPortableBanner() {
        // Adicionar banner no canto inferior direito
        const banner = document.createElement('div');
        banner.id = 'core-portable-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: rgba(44, 62, 80, 0.9);
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 8px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        `;
        
        banner.innerHTML = `
            <i class="fas fa-usb-drive"></i>
            <span>Modo Pen Drive</span>
            <div id="core-save-status" style="display: none;">
                <i class="fas fa-save"></i>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Mostrar status de salvamento
        window.addEventListener('coreDataChanged', () => {
            const status = document.getElementById('core-save-status');
            if (status) {
                status.style.display = 'inline';
                status.style.color = '#27ae60';
                
                setTimeout(() => {
                    status.style.display = 'none';
                }, 1000);
            }
        });
    }

    setupFileSystemBackup() {
        // Criar pasta de backup se não existir
        const backupDir = 'core_backups';
        if (!localStorage.getItem('backup_dir_created')) {
            try {
                // Em um ambiente real, isso seria uma API de sistema de arquivos
                console.log('📂 Configurando sistema de backup...');
                localStorage.setItem('backup_dir_created', 'true');
                localStorage.setItem('backup_last_date', new Date().toISOString());
            } catch (error) {
                console.warn('⚠️ Não foi possível criar diretório de backup:', error);
            }
        }
    }

    startAutoBackup() {
        if (!this.isPortable) return;
        
        setInterval(async () => {
            await this.createBackup();
        }, this.settings.backup_interval);
        
        console.log('🔄 Backup automático configurado a cada 5 minutos');
    }

    async createBackup() {
        try {
            const backupData = {
                timestamp: new Date().toISOString(),
                system_events: localStorage.getItem('system_events') || '[]',
                system_settings: localStorage.getItem('system_settings') || '{}',
                core_settings: localStorage.getItem('core_settings') || '{}'
            };
            
            const backupKey = `core_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}`;
            localStorage.setItem(backupKey, JSON.stringify(backupData));
            
            // Manter apenas últimos 10 backups
            this.cleanOldBackups();
            
            console.log('💾 Backup criado:', backupKey);
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
            return false;
        }
    }

    cleanOldBackups() {
        const backupKeys = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('core_backup_')) {
                backupKeys.push(key);
            }
        }
        
        // Ordenar por timestamp (mais recente primeiro)
        backupKeys.sort((a, b) => {
            const aTime = new Date(a.split('_')[2]).getTime();
            const bTime = new Date(b.split('_')[2]).getTime();
            return bTime - aTime;
        });
        
        // Remover backups antigos (manter apenas últimos 10)
        if (backupKeys.length > 10) {
            for (let i = 10; i < backupKeys.length; i++) {
                localStorage.removeItem(backupKeys[i]);
            }
            console.log(`🧹 ${backupKeys.length - 10} backups antigos removidos`);
        }
    }

    async exportAllData() {
        try {
            const allData = {};
            
            // Coletar todos os dados do sistema
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.includes('system_') || key.includes('core_')) {
                    allData[key] = localStorage.getItem(key);
                }
            }
            
            // Adicionar metadados
            allData.metadata = {
                exported_at: new Date().toISOString(),
                system: 'SISTEMA CORE v4.0',
                version: this.settings.version,
                total_items: Object.keys(allData).length - 1 // menos metadata
            };
            
            return {
                success: true,
                data: allData,
                filename: `core_export_${new Date().toISOString().split('T')[0]}.json`
            };
        } catch (error) {
            console.error('❌ Erro ao exportar dados:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async importData(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            // Validar estrutura
            if (!data.metadata || !data.metadata.system.includes('CORE')) {
                throw new Error('Arquivo de importação inválido');
            }
            
            // Importar dados
            for (const [key, value] of Object.entries(data)) {
                if (key !== 'metadata') {
                    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                }
            }
            
            console.log('✅ Dados importados com sucesso');
            return {
                success: true,
                imported_items: Object.keys(data).length - 1
            };
        } catch (error) {
            console.error('❌ Erro ao importar dados:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getSystemInfo() {
        return {
            version: this.settings.version,
            mode: this.settings.mode,
            isPortable: this.isPortable,
            storage: {
                used: Math.round((JSON.stringify(localStorage).length / 1024) * 100) / 100,
                limit: 5 * 1024, // 5MB aproximado
                unit: 'KB'
            },
            lastBackup: localStorage.getItem('backup_last_date') || 'Nunca',
            backupsCount: Array.from({ length: localStorage.length }, (_, i) => 
                localStorage.key(i)).filter(key => key.startsWith('core_backup_')).length
        };
    }
}

// Exportar para uso global
window.CoreConfig = CoreConfig;