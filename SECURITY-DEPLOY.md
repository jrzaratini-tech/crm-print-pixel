# Deploy seguro do CRM PrintPixel

## Variaveis obrigatorias no Render

- `NODE_ENV=production`
- `CRM_USERNAME`: utilizador administrativo do CRM.
- `CRM_PASSWORD`: senha longa e exclusiva.
- `CRM_ALLOWED_ORIGINS=https://crm-print-pixel.onrender.com`
- `CRM_COMPANY_NIF`: NIF da empresa, usado para rejeitar faturas que nao pertencem a empresa.
- `CRM_MOBILE_ACCESS_KEY`: chave longa e exclusiva usada somente para ativar celulares no app fiscal permanente.
- `FIREBASE_SERVICE_ACCOUNT`: JSON completo da conta de servico Firebase.
- `MOLONI_MODE=live`: ativa a API real do Moloni.
- `MOLONI_CLIENT_ID`: Developer ID gerado no Moloni.
- `MOLONI_CLIENT_SECRET`: Client Secret gerado no Moloni. Nunca colocar no Git.
- `MOLONI_REDIRECT_URI=https://crm-print-pixel.onrender.com/api/moloni/oauth/callback`: deve ser exatamente igual ao callback configurado no Moloni.
- `MOLONI_ENCRYPTION_KEY`: chave aleatoria longa usada para cifrar tokens OAuth no Firestore.

O servidor interrompe a inicializacao em producao quando utilizador ou senha nao estiverem configurados. Isso evita publicar novamente a API administrativa sem autenticacao.

## Checklist Moloni

Antes de ligar o CRM ao Moloni em producao:

1. Confirmar plano Flex/API ativo no Moloni.
2. Criar/confirmar Developer ID, Client Secret e Redirect URI na area Developer do Moloni.
3. Configurar as variaveis acima no hosting.
4. Executar localmente, quando existir `.env`:

   ```bash
   npm run moloni:check
   ```

5. Reiniciar o servico.
6. Abrir `Faturacao Moloni`, clicar `Ligar Moloni`, autorizar e selecionar empresa/series/artigo/imposto/pagamento.
7. Emitir primeiro um rascunho e conferir diretamente no Moloni antes de fechar documentos fiscais.

## Rotacao recomendada

1. Troque a senha do CRM sempre que houver suspeita de exposicao.
2. Revogue e recrie a chave da conta de servico Firebase se uma chave real ja tiver sido publicada.
3. Atualize `CRM_ALLOWED_ORIGINS` se o dominio mudar.
4. Troque `CRM_MOBILE_ACCESS_KEY` para impedir novas ativacoes quando houver suspeita de exposicao.
5. Revogue o Client Secret Moloni e apague os tokens guardados se houver suspeita de exposicao da integracao.

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
