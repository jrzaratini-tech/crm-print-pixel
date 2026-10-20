# Fase 8 — Aceitação e entrada em produção

## 1. Estado técnico

O desenvolvimento local do ecossistema inteligente foi consolidado por incrementos e validado pela bateria automatizada do projeto. A aprovação técnica significa que o código cumpriu os testes automatizados; não substitui a aceitação operacional da PrintPixel, a validação do contabilista ou a ativação das contas externas.

| Fase | Entrega implementada | Estado técnico | Dependência para operação real |
| --- | --- | --- | --- |
| 0 | Diagnóstico, arquitetura e backlog | Concluído | Confirmação contínua das prioridades pela gestão |
| 1 | RBAC, auditoria, vínculos, receitas, fila, painel, backup e segurança | Aprovado em testes | Configurar bucket privado e executar restauro real |
| 2 | Webhooks Shopify, idempotência, mapeamento, exceções e reconciliação | Aprovado em testes | Credenciais da loja, webhook e inventário do personalizador |
| 3 | Receitas, reservas, capacidade e controlo de qualidade obrigatório | Aprovado em testes | Parametrizar horários, recursos e receitas reais restantes |
| 4 | Apuramento, bloqueios, fecho auditado e dossier trimestral | Aprovado em testes | Validação e confirmação de contabilista certificado |
| 5 | Orçamentista com catálogo real, estrutura, confiança e revisão humana | Aprovado em testes | Ligar a conta ChatGPT autorizada e validar casos reais anonimizados |
| 6 | Resumo diário, perguntas rastreáveis, alertas e permissões | Aprovado em testes | Ligar a conta ChatGPT para funções generativas; núcleo determinístico já opera sem custo variável |
| 7 | Aprendizagem por amostra, confiança, aprovação, versão e reversão | Aprovado em testes | Acumular pelo menos cinco trabalhos válidos por família |
| 8 | Matriz de aceitação, contingência, formação e plano de entrada | Preparado | Aceitação humana, operação paralela e ativação externa |

## 2. Critérios de aceitação operacional

Cada cenário deve ser executado por um utilizador real, com dados de teste identificados e sem misturar documentos fiscais reais enquanto a operação paralela estiver ativa.

1. **Loja para CRM:** encomenda Shopify paga e com arte cria um único pedido; reenvio do mesmo webhook não duplica; encomenda incompleta aparece em Integrações.
2. **Orçamento:** imagem e medidas geram proposta baseada apenas em produtos, materiais e receitas cadastrados; um humano confirma antes do envio.
3. **Produção:** pedido aprovado reserva material, entra na capacidade, percorre etapas e só termina após controlo de qualidade com evidência.
4. **Faturação:** pedido e pagamento conciliam com o documento Moloni sem duplicação; reembolso ou divergência fica visível.
5. **Fiscal:** trimestre mostra fontes e bloqueios; o dossier é revisto; apenas um utilizador autorizado regista a confirmação nominal do contabilista.
6. **Gestor IA:** resumo e perguntas respeitam o perfil do utilizador, apresentam fontes e não executam compras, preços, faturação ou comunicações sem confirmação.
7. **Aprendizagem:** recomendações sem amostra mínima não podem ser aprovadas; uma aprovação cria nova versão e a reversão preserva o histórico.
8. **Continuidade:** um backup real é restaurado num ambiente isolado e as contagens/checksum são comparados.

## 3. Operação paralela recomendada

- Duração mínima: cinco dias úteis ou vinte pedidos completos, prevalecendo o que ocorrer por último.
- Shopify: comparar diariamente total de encomendas, valores, pagamentos, cancelamentos e exceções.
- Produção: comparar prazo sugerido com agenda usada pela equipa e registar desvios.
- Fiscal: não fechar trimestre durante o piloto; exportar o dossier e obter parecer do contabilista.
- IA: manter revisão humana obrigatória e registar correções de produto, medida, material, tempo e preço.
- Critério de saída: zero duplicações críticas, zero perda de pedido, todas as exceções explicáveis e restauro comprovado.

## 4. Migração e saneamento

Antes da ativação:

- eliminar duplicações de SKU e confirmar uma receita ativa por produto/variante;
- completar NIF, morada fiscal e classificação dos fornecedores;
- confirmar produtos Shopify, variantes, SKUs, propriedades e ficheiros do personalizador;
- cadastrar recursos, capacidade diária e indisponibilidades da produção;
- resolver despesas por classificar e documentos fiscais pendentes;
- criar utilizadores individuais e desativar o uso diário da credencial administrativa partilhada.

Nenhum saneamento deve apagar histórico. Correções devem ser auditadas ou feitas por migração versionada e reversível.

## 5. Contingência e reversão

- Antes da publicação: criar backup, guardar checksum e marcar a versão Git.
- Se a integração Shopify falhar: manter o webhook registado, pausar o processamento e tratar a fila; não reenviar manualmente sem a mesma chave de idempotência.
- Se a IA ficar indisponível: continuar com o motor determinístico e revisão manual, sem trocar silenciosamente para uma API paga.
- Se Moloni ou Stripe ficar indisponível: conservar o pedido em estado pendente e repetir pela fila após confirmação do serviço.
- Se houver regressão crítica: reverter a aplicação para a versão anterior e preservar os eventos recebidos para reprocessamento.
- Restauro de dados: executar primeiro em ambiente isolado; a produção exige a confirmação `BACKUP_RESTORE_CONFIRM=RESTORE`.

## 6. Formação por perfil

| Perfil | Conteúdo mínimo |
| --- | --- |
| Gestão | Gestor IA, alertas, capacidade, aprovações de aprendizagem e auditoria |
| Comercial | Clientes, orçamento assistido, revisão humana e conversão em pedido |
| Produção | Agenda, etapas, consumos, desvios, fotografias e controlo de qualidade |
| Financeiro | Pagamentos, Moloni, reconciliação, exceções e dossier trimestral |
| Contabilista | Leitura do apuramento, fontes, bloqueios, exportação e fecho nominal |
| Técnico | Integrações, fila, repetições, backups, restauro, credenciais e incidentes |

## 7. Autorizações externas pendentes

Para concluir a ativação real são necessários:

1. domínio `*.myshopify.com`, segredo do webhook e token da aplicação Shopify;
2. lista de variantes/SKUs e exemplo real do payload do personalizador;
3. configuração de bucket privado de backup e credencial Firebase/Google;
4. ligação OAuth da conta ChatGPT autorizada pela PrintPixel;
5. nome e validação do contabilista certificado;
6. aceite da gestão após o período de operação paralela.

## 8. Auto de aceitação

O auto só deve ser assinado depois dos oito cenários da secção 2 e da operação paralela. Registar: versão publicada, data, ambiente, responsáveis, limitações aceites, incidentes pendentes e evidência do restauro. Até lá, o estado correto é **tecnicamente aprovado em testes, aguardando aceitação operacional e ativações externas**.
