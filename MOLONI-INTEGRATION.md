# Integração Moloni

O CRM inicia com `MOLONI_MODE=mock`. Neste modo é possível testar a página de
faturação, validações, pagamentos parciais, histórico e bloqueio de duplicados
sem criar documentos fiscais reais.

## Fluxos implementados

- Fatura para um pedido ainda não liquidado.
- Fatura-Recibo quando o pedido está totalmente pago.
- Recibos parciais ou finais associados à fatura.
- Um recibo por pagamento registado no pedido.
- Rascunho ou documento fechado.
- Histórico por pedido, estado de erro e consulta de PDF em modo real.

## Ativação real

1. Alterar a subscrição Moloni para um plano com acesso à API.
2. Ativar a conta Developer e criar o `Developer ID`, `Client Secret` e a URI
   de resposta.
3. Configurar no servidor:

   - `MOLONI_MODE=live`
   - `MOLONI_CLIENT_ID`
   - `MOLONI_CLIENT_SECRET`
   - `MOLONI_REDIRECT_URI`
   - `MOLONI_ENCRYPTION_KEY`

4. Reiniciar o CRM e abrir **Faturação > Ligar Moloni**.
5. Em **Configuração**, selecionar a empresa, as três séries, o artigo
   genérico, o imposto e os métodos de pagamento.
6. Criar primeiro um documento em rascunho e confirmar os dados diretamente no
   Moloni. Só depois usar **Emitir e fechar**.

## Segurança e controlo

- Tokens OAuth são cifrados antes de serem guardados.
- O navegador nunca recebe o `Client Secret` nem os tokens.
- Cada pedido só pode originar uma Fatura ou Fatura-Recibo válida.
- Cada pagamento possui uma chave única para impedir recibos duplicados.
- Um recibo não pode ultrapassar o saldo ainda não conciliado.
- O fecho exige confirmação explícita na interface.

Antes da ativação real, confirme com o contabilista qual o documento a usar
para adiantamentos no enquadramento fiscal da empresa.
