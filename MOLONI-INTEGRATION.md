# Integração Moloni

O CRM suporta dois modos:

- `MOLONI_MODE=mock`: modo seguro para testar o fluxo sem criar documentos fiscais reais.
- `MOLONI_MODE=live`: ligação real à API Moloni, com OAuth, séries, artigos, impostos e métodos de pagamento sincronizados da conta.

## O que já está implementado

- Fatura para pedido ainda não liquidado.
- Fatura-Recibo quando o pedido está totalmente pago.
- Recibo parcial ou final associado à fatura já emitida.
- Um recibo por pagamento registado no pedido.
- Rascunho ou documento fechado.
- Histórico por pedido, bloqueio de duplicados e consulta de PDF em modo real.
- Tokens OAuth cifrados antes de guardar no Firestore.
- Criação/reutilização automática de artigos Moloni por linha do pedido.
- Classificação fiscal por linha: produtos como `Produto` e instalação/deslocação/serviços como `Serviço`.

## Ativar em modo real

1. No Moloni, confirmar que o plano Flex/API está ativo.
2. Na área Developer/API do Moloni, criar/confirmar:
   - Developer ID;
   - Client Secret;
   - Redirect URI.
3. A Redirect URI deve ser exatamente a rota pública do CRM:

   ```text
   https://SEU-DOMINIO/api/moloni/oauth/callback
   ```

4. No servidor/hosting do CRM, configurar:

   ```env
   MOLONI_MODE=live
   MOLONI_CLIENT_ID=developer-id-do-moloni
   MOLONI_CLIENT_SECRET=client-secret-do-moloni
   MOLONI_REDIRECT_URI=https://SEU-DOMINIO/api/moloni/oauth/callback
   MOLONI_ENCRYPTION_KEY=uma-chave-longa-aleatoria-e-exclusiva
   ```

   Em desenvolvimento local, o `server.js` também carrega um ficheiro `.env` na raiz do projeto. Esse ficheiro está ignorado pelo Git.

5. Reiniciar o CRM.
6. Abrir `Faturação Moloni`.
7. Clicar em `Ligar Moloni` e autorizar a conta no ecrã do Moloni.
8. Abrir `Configuração` e sincronizar opções.
9. Selecionar:
   - empresa;
   - série de Faturas;
   - série de Faturas-Recibo;
   - série de Recibos;
   - artigo genérico;
   - categoria padrão dos artigos;
   - unidade padrão;
   - IVA normal;
   - método de pagamento predefinido;
   - criação/reutilização automática de artigos, se desejar separar produtos e serviços no Moloni;
   - mapeamento de pagamentos do CRM para métodos Moloni, se necessário.

## Primeiro teste recomendado

Antes de fechar qualquer documento real:

1. Escolher um pedido simples.
2. Criar `Rascunho`.
3. Abrir o Moloni e confirmar cliente, NIF, linhas, IVA, série e total.
4. Só depois usar `Emitir e fechar`.

Documento fechado (`status=1`) pode comunicar/conciliar fiscalmente e não deve ser usado como teste visual.

## Segurança e controlo

- O navegador nunca recebe o `Client Secret` nem os tokens.
- O access token é renovado automaticamente com refresh token.
- Se o refresh token expirar, é necessário voltar a ligar a conta Moloni.
- O CRM bloqueia emissão live se faltar empresa, séries, artigo ou método de pagamento.
- Cada pedido só pode originar uma Fatura ou Fatura-Recibo válida.
- Cada pagamento possui uma chave única para impedir recibos duplicados.
- Um recibo não pode ultrapassar o saldo ainda não conciliado.
- O fecho exige confirmação explícita na interface.

Confirme com o contabilista qual o documento correto para adiantamentos no enquadramento fiscal da empresa.
