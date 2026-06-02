# Deploy seguro do CRM PrintPixel

## Variaveis obrigatorias no Render

- `NODE_ENV=production`
- `CRM_USERNAME`: utilizador administrativo do CRM.
- `CRM_PASSWORD`: senha longa e exclusiva.
- `CRM_ALLOWED_ORIGINS=https://crm-print-pixel.onrender.com`
- `CRM_COMPANY_NIF`: NIF da empresa, usado para rejeitar faturas que nao pertencem a empresa.
- `CRM_MOBILE_ACCESS_KEY`: chave longa e exclusiva usada somente para ativar celulares no app fiscal permanente.
- `FIREBASE_SERVICE_ACCOUNT`: JSON completo da conta de servico Firebase.

O servidor interrompe a inicializacao em producao quando utilizador ou senha nao estiverem configurados. Isso evita publicar novamente a API administrativa sem autenticacao.

## Rotacao recomendada

1. Troque a senha do CRM sempre que houver suspeita de exposicao.
2. Revogue e recrie a chave da conta de servico Firebase se uma chave real ja tiver sido publicada.
3. Atualize `CRM_ALLOWED_ORIGINS` se o dominio mudar.
4. Troque `CRM_MOBILE_ACCESS_KEY` para impedir novas ativacoes quando houver suspeita de exposicao.

## Publicacao

O servidor expoe somente:

- `index.html`
- `upload-mobile.html`
- `scan-fatura.html`: leitor publico limitado por sessao fiscal aleatoria e temporaria.
- `mobile/`: PWA fiscal permanente. A tela e publica, mas toda leitura e consulta exige token individual de dispositivo.
- `pages/`
- Modulos JavaScript autorizados em `core/`
- `menu/menu.config.js`

Arquivos como `server.js`, `firebase.js`, `package.json`, `DATA/` e `node_modules/` nao devem responder publicamente.
