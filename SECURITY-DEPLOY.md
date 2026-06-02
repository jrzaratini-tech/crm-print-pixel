# Deploy seguro do CRM PrintPixel

## Variáveis obrigatórias no Render

- `NODE_ENV=production`
- `CRM_USERNAME`: utilizador administrativo do CRM.
- `CRM_PASSWORD`: senha longa e exclusiva.
- `CRM_ALLOWED_ORIGINS=https://crm-print-pixel.onrender.com`
- `FIREBASE_SERVICE_ACCOUNT`: JSON completo da conta de serviço Firebase.

O servidor interrompe a inicialização em produção quando utilizador ou senha não estiverem configurados. Isso evita publicar novamente a API sem autenticação.

## Rotação recomendada

1. Troque a senha do CRM sempre que houver suspeita de exposição.
2. Revogue e recrie a chave da conta de serviço Firebase se uma chave real já tiver sido publicada.
3. Atualize `CRM_ALLOWED_ORIGINS` se o domínio mudar.

## Publicação

O servidor expõe somente:

- `index.html`
- `upload-mobile.html`
- `pages/`
- `core/engine.js`, `core/config.js`, `core/security.js`, `core/custeio.js`, `core/materiais-padrao.js` e `core/financeiro.js`
- `menu/menu.config.js`

Arquivos como `server.js`, `firebase.js`, `package.json`, `DATA/` e `node_modules/` não devem responder publicamente.
