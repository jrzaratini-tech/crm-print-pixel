// ===============================
// CRM PRINT PIXEL - SERVER FINAL
// ===============================

const express = require("express");
const path = require("path");
const app = express();

// -------- CONFIG BÁSICA --------
app.use(express.json());

// -------- FRONTEND (HTML) --------
// Serve index.html, style.css, pages/, admin/, core/
app.use(express.static(__dirname));

// Rota principal (/)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// -------- FIREBASE --------
const { db } = require("./firebase");
const { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy } = require("firebase/firestore");

// -------- API --------

// Teste de vida (GET – navegador)
app.get("/api/database/init", (req, res) => {
  res.json({
    status: "ok",
    message: "Firebase pronto",
    env: "online"
  });
});

// Teste de vida (POST – sistema)
app.post("/api/database/init", (req, res) => {
  res.json({
    status: "ok",
    message: "Firebase pronto (POST)"
  });
});

// Gravar evento no Firestore
app.post("/api/database/commit", async (req, res) => {
  try {
    const data = req.body;

    const docRef = await addDoc(collection(db, "events"), {
      schema: data.schema || "default",
      payload: data.payload || {},
      pageId: data.pageId || "unknown",
      timestamp: serverTimestamp()
    });

    res.json({
      success: true,
      eventId: docRef.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Consultar eventos no Firestore
app.post("/api/database/query", async (req, res) => {
  try {
    const { schema } = req.body;
    
    let q;
    if (schema && schema !== 'all') {
      q = query(collection(db, "events"), where("schema", "==", schema));
    } else {
      q = query(collection(db, "events"));
    }
    
    const querySnapshot = await getDocs(q);
    const events = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Garantir que o payload seja um objeto válido
      let payload = data.payload;
      
      // Se o payload for um objeto, processar cada campo
      if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
        // Processar o campo produtos para garantir que seja um array
        if (payload.produtos && !Array.isArray(payload.produtos)) {
          payload.produtos = [];
        }
        
        // Converter todos os valores para tipos primitivos
        const cleanPayload = {};
        for (const key in payload) {
          if (payload.hasOwnProperty(key)) {
            const value = payload[key];
            if (typeof value === 'object' && value !== null && value.toString && value.toString().includes('System.Object')) {
              // Ignorar objetos do sistema
              continue;
            }
            cleanPayload[key] = value;
          }
        }
        payload = cleanPayload;
      } else if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          payload = {};
        }
      } else {
        payload = {};
      }
      
      events.push({
        id: doc.id,
        schema: data.schema,
        payload: payload,
        pageId: data.pageId,
        created_at: data.timestamp?.toDate?.() || new Date()
      });
    });
    
    // Ordenar no cliente (temporarily fix for index issue)
    events.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateB - dateA; // descending order
    });
    
    res.json({
      success: true,
      events: events
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Gerar página dinamicamente (versão avançada)
app.post("/api/pages/generate", async (req, res) => {
  try {
    const { name, type, icon, description, content, fields } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: "Nome e tipo são obrigatórios"
      });
    }
    
    // Ler template
    const fs = require('fs');
    const path = require('path');
    const templatePath = path.join(__dirname, 'pages', 'page_template.html');
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // Substituir placeholders
    const pageId = `page_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    template = template.replace(/\{\{PAGE_NAME\}\}/g, name);
    template = template.replace(/\{\{PAGE_ID\}\}/g, pageId);
    template = template.replace(/\{\{PAGE_TYPE\}\}/g, type);
    template = template.replace(/\{\{PAGE_ICON\}\}/g, icon || 'fas fa-file');
    template = template.replace(/\{\{PAGE_DESCRIPTION\}\}/g, description || `Página ${type} criada dinamicamente`);
    
    // Gerar conteúdo baseado nos campos personalizados
    let pageContent = '';
    
    if (fields && fields.length > 0) {
      // Usar campos personalizados
      let formFields = '';
      
      fields.forEach(field => {
        let input = '';
        
        switch(field.type) {
          case 'text':
          case 'email':
            input = `<input type="${field.type}" data-bind="${pageId}.${field.name}" placeholder="${field.label}">`;
            break;
          case 'number':
            input = `<input type="number" data-bind="${pageId}.${field.name}" placeholder="${field.label}">`;
            break;
          case 'date':
            input = `<input type="date" data-bind="${pageId}.${field.name}">`;
            break;
          case 'textarea':
            input = `<textarea data-bind="${pageId}.${field.name}" placeholder="${field.label}" rows="3"></textarea>`;
            break;
          case 'checkbox':
            input = `<label><input type="checkbox" data-bind="${pageId}.${field.name}"> ${field.label}</label>`;
            break;
          case 'select':
            input = `
              <select data-bind="${pageId}.${field.name}">
                <option value="">Selecione...</option>
                <option value="op1">Opção 1</option>
                <option value="op2">Opção 2</option>
              </select>
            `;
            break;
        }
        
        formFields += `
          <div class="form-group">
            <label>${field.label}</label>
            ${input}
          </div>
        `;
      });
      
      if (type === 'WRITE') {
        pageContent = `
          <form id="dynamicForm">
            <div class="form-section">
              <h3>Informações</h3>
              ${formFields}
            </div>
            <div style="margin-top: 24px;">
              <button type="button" class="btn btn-primary" data-action="commit">
                <i class="fas fa-save"></i>
                Salvar
              </button>
            </div>
          </form>
        `;
      } else if (type === 'READ') {
        pageContent = `
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  ${fields.map(field => `<th>${field.label}</th>`).join('')}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <!-- Dados serão carregados dinamicamente -->
              </tbody>
            </table>
          </div>
          <div class="empty-state" id="emptyState">
            <i class="fas fa-inbox"></i>
            <h3>Nenhum registro encontrado</h3>
            <p>Os dados aparecerão aqui quando forem adicionados.</p>
          </div>
        `;
      } else {
        pageContent = `
          <div style="text-align: center; padding: 40px;">
            <h2>${name}</h2>
            <p>${description || 'Página informativa'}</p>
          </div>
        `;
      }
    } else {
      // Usar conteúdo padrão (sem campos personalizados)
      if (type === 'WRITE') {
        pageContent = `
          <form id="dynamicForm">
            <div class="form-section">
              <h3>Informações Básicas</h3>
              <div class="form-grid">
                <div class="form-group">
                  <label>Campo 1</label>
                  <input type="text" data-bind="${pageId}.campo1" placeholder="Digite aqui...">
                </div>
                <div class="form-group">
                  <label>Campo 2</label>
                  <input type="text" data-bind="${pageId}.campo2" placeholder="Digite aqui...">
                </div>
              </div>
            </div>
            <div style="margin-top: 24px;">
              <button type="button" class="btn btn-primary" data-action="commit">
                <i class="fas fa-save"></i>
                Salvar
              </button>
            </div>
          </form>
        `;
      } else if (type === 'READ') {
        pageContent = `
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Campo 1</th>
                  <th>Campo 2</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <!-- Dados serão carregados dinamicamente -->
              </tbody>
            </table>
          </div>
          <div class="empty-state" id="emptyState">
            <i class="fas fa-inbox"></i>
            <h3>Nenhum registro encontrado</h3>
            <p>Os dados aparecerão aqui quando forem adicionados.</p>
          </div>
        `;
      } else {
        pageContent = `
          <div style="text-align: center; padding: 40px;">
            <h2>Página Neutra</h2>
            <p>Esta é uma página estática sem funcionalidades específicas.</p>
          </div>
        `;
      }
    }
    
    template = template.replace('{{PAGE_CONTENT}}', pageContent || content || '');
    
    // Salvar página gerada
    const fileName = `${pageId}.html`;
    const filePath = path.join(__dirname, 'pages', fileName);
    fs.writeFileSync(filePath, template);
    
    res.json({
      success: true,
      page: {
        id: `nav_${pageId}`,
        name: name,
        file: `pages/${fileName}`,
        type: type,
        pos: Date.now(),
        hidden: false,
        deleted: false
      },
      message: "Página personalizada gerada com sucesso"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// -------- PORTA (RENDER) --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("CRM PRINT PIXEL ONLINE - PORTA " + PORT);
});
