# Fase 0 Diagnóstico Arquitetura e Backlog

## 1 Objetivo e decisão desta fase

Este documento cumpre o entregável previsto para a Fase 0 do Contrato de Desenvolvimento e Implementação do Ecossistema Inteligente PrintPixel. O objetivo é registar o estado real do CRM, separar o que já funciona do que ainda é parcial, identificar dependências externas e ordenar o trabalho das fases seguintes.

A decisão recomendada é preservar os módulos operacionais existentes e evoluir o sistema por incrementos testados. Funcionalidades já publicadas não serão consideradas concluídas apenas por existirem: cada fase terá de cumprir os critérios contratuais de rastreabilidade, permissões, prevenção de duplicações, testes e validação humana.

## 2 Inventário técnico atual

### 2.1 Aplicação e alojamento

- Aplicação Node.js e Express, atualmente publicada como serviço web no Render.
- Base de dados principal em Firebase Firestore; em desenvolvimento existe uma implementação temporária em memória.
- Interface web composta por páginas HTML e JavaScript, com áreas próprias para administração, produção, vendedor, dispositivos móveis e portal de rótulos.
- Repositório Git com histórico de versões e publicação a partir da branch `main`.
- Testes automatizados executados com o test runner nativo do Node.js.
- Estado verificado no diagnóstico: 13 ficheiros de teste e 122 casos automatizados aprovados.

### 2.2 Módulos funcionais identificados

- Clientes, fornecedores, produtos, materiais, despesas, pedidos e orçamentos.
- Motor determinístico de custeio para materiais, máquina, mão de obra e famílias prioritárias.
- Produção com ordens, atribuições, etapas, tempos, conversas e pagamentos a colaboradores.
- Gestão financeira, contas a receber, despesas, comissões, ponto de equilíbrio e painel de gestão.
- Integração Moloni com OAuth, pré-visualização, emissão controlada, consulta, PDF e prevenção de duplicações.
- Links de pagamento e webhook Stripe.
- Importação fiscal por QR, aplicação móvel autorizada e tratamento de comprovativos.
- Cálculo e reconciliação de IVA trimestral com regras determinísticas e testes de referência.
- Portal de rótulos com clientes, pedidos, pagamentos e geração de EPS.
- Gestor IA com política central, ligação planeada ao ChatGPT Pro, análise de imagem para orçamento e recolha de feedback.

### 2.3 Integrações externas

| Integração | Estado atual | Observação |
| --- | --- | --- |
| Firebase Firestore | Em produção | Credencial por segredo de ambiente; falta formalizar backup, retenção e teste de restauro. |
| Render | Em produção | Health check básico disponível; observabilidade e alertas ainda incompletos. |
| Moloni | Implementada | Requer validação contabilística final das regras e um período formal de reconciliação. |
| Stripe | Implementada | Modo real depende de segredos e webhook configurados; deve integrar a reconciliação global. |
| ChatGPT Pro | Infraestrutura implementada | A ligação oficial da conta ainda precisa de ser concluída e validada em produção. |
| Shopify | Não implementada | Não foram encontrados webhooks, mapeamentos, reconciliação ou fila de exceções Shopify. |
| Personalizador da loja | Não inventariado | É necessário identificar aplicação, campos, ficheiros, URLs e regras de aprovação. |

## 3 Arquitetura atual resumida

```text
Utilizadores internos e portais
        |
        v
Páginas web e aplicações responsivas
        |
        v
Servidor Express no Render
  |       |        |        |
  v       v        v        v
Firestore Moloni   Stripe   ChatGPT Pro
                    
Shopify e personalizador ainda não ligados
```

O servidor concentra autenticação, regras de negócio, integrações e persistência. Esta estrutura é adequada para a dimensão atual, mas o crescimento do ecossistema exige separar serviços internos por responsabilidade, criar uma fila persistente para integrações e registar auditoria de forma uniforme.

## 4 Mapeamento para as fases contratuais

| Fase | Avaliação | Evidência e lacuna principal |
| --- | --- | --- |
| 0 Diagnóstico | Em conclusão | Este documento cria o inventário e backlog; dependências externas ainda precisam de confirmação da Cliente. |
| 1 Fundação | Parcial | Existem autenticação, segredos, cadastros e testes. Faltam RBAC completo, auditoria uniforme, fila persistente, backup testado e observabilidade. |
| 2 Shopify | Não iniciada | Não existe integração oficial, idempotência Shopify, mapeamento de variantes ou reconciliação diária. |
| 3 Produção | Parcial avançada | Ordens, etapas, responsáveis e tempos existem. Faltam receitas versionadas completas, reservas, qualidade obrigatória e agenda de capacidade integrada. |
| 4 Fiscal | Parcial avançada | Moloni, despesas e IVA existem. Faltam fecho formal do período, dossier exportável e validação documentada pelo contabilista. |
| 5 Orçamentista IA | Parcial | Análise por texto e imagem e estimativa histórica existem. Faltam concluir OAuth, ampliar casos multimodais e validar tolerâncias por família. |
| 6 Gestor IA | Inicial | Existe o painel de política e ligação. Faltam resumo diário, perguntas sobre dados, fontes rastreáveis e alertas de risco. |
| 7 Aprendizagem | Parcial limitada | Há comparação e fatores em áreas específicas, sobretudo PETG. Falta mecanismo geral com amostra, confiança, aprovação, versão e reversão. |
| 8 Entrada em produção | Parcial informal | O CRM já opera em produção, mas faltam auto formal, formação, operação paralela documentada, contingência e suporte acordado. |

## 5 Riscos e não conformidades prioritárias

1. **Conta administrativa única.** O CRM administrativo utiliza uma credencial global; isso não permite atribuir de forma auditável cada ação a gestão, comercial, financeiro ou contabilista.
2. **Auditoria incompleta.** Os registos operacionais guardam datas e estados, mas não existe uma trilha uniforme com ator, origem, valor anterior, valor posterior e correlação.
3. **Ausência de fila persistente.** Webhooks e integrações não dispõem de um mecanismo comum de repetição, idempotência, limite de tentativas e intervenção humana.
4. **Backup não comprovado.** A configuração refere gestão pelo Firebase, mas não há política versionada, retenção, objetivo de recuperação nem evidência de restauro testado.
5. **Observabilidade básica.** Há logs de consola e endpoint de saúde, mas faltam correlação por pedido, métricas de integrações, alertas e painel de incidentes.
6. **Shopify ainda isolada.** As encomendas da loja não entram automaticamente no CRM, impedindo o objetivo de ecossistema central.
7. **Regras e receitas dispersas.** Parte dos cálculos está em módulos determinísticos, mas ainda não existe uma receita técnica versionada e administrável para todas as famílias.
8. **Validação externa pendente.** Regras de IVA, fecho trimestral, retenção de dados e procedimentos contabilísticos precisam de validação profissional documentada.
9. **Dependências vulneráveis.** O build do alojamento reporta dependências com vulnerabilidades conhecidas; devem ser analisadas individualmente antes de qualquer atualização que possa quebrar o sistema.

## 6 Dependências e decisões necessárias

### 6.1 Shopify e personalizador

- URL e identificação da loja Shopify.
- Tipo de acesso disponível para aplicação e webhooks.
- Lista de produtos, variantes, SKUs e campos de personalização.
- Identificação da aplicação de personalização e formato dos ficheiros produzidos.
- Estados de pagamento que autorizam a criação do pedido e da ordem de produção.
- Regras de cancelamento, reembolso, expedição e atualização de estado.

### 6.2 Operação e permissões

- Lista nominal dos perfis administrativos e respetivas responsabilidades.
- Matriz final de permissões para administração, gestão, comercial, produção, financeiro e contabilista.
- Máquinas, horários, indisponibilidades e capacidade de produção.
- Famílias prioritárias e receitas técnicas que serão normalizadas primeiro.

### 6.3 Fiscalidade e continuidade

- Aprovação do contabilista para taxas, isenções, percentagens dedutíveis, fecho e dossier trimestral.
- Política de retenção para imagens, artes, faturas e dados pessoais.
- Objetivos de recuperação, retenção de backups e responsável pelo teste de restauro.
- Contactos e tempos de resposta para incidentes críticos.

## 7 Backlog proposto por ordem contratual

### Fase 1 Fundação

1. Criar identidade administrativa individual e perfis RBAC sem remover os acessos especializados já existentes.
2. Implementar serviço central de auditoria para ações críticas e alterações de dados.
3. Normalizar identificadores e vínculos entre cliente, orçamento, pedido, pagamento, produção e documento fiscal.
4. Criar modelo de receita técnica versionada e catálogo de mapeamentos externos.
5. Implementar fila persistente com idempotência, repetição, limite, estado e fila de exceções.
6. Criar painel técnico de integrações, logs correlacionados e alertas operacionais.
7. Formalizar backup, retenção e procedimento de restauro testado.
8. Rever dependências e corrigir vulnerabilidades sem atualizações destrutivas.

### Fase 2 Shopify

1. Criar conector oficial Shopify e armazenamento seguro dos segredos.
2. Receber e validar webhooks com assinatura oficial.
3. Registar eventos recebidos antes do processamento e impedir duplicações.
4. Mapear clientes, moradas, linhas, impostos, descontos, portes, pagamentos e ficheiros.
5. Criar pedido apenas quando as regras de pagamento forem satisfeitas.
6. Encaminhar casos incompletos para uma fila de exceções visível.
7. Criar ordem de produção somente quando produto, variante e arte estiverem validados.
8. Implementar reconciliação diária Shopify versus CRM.

### Fase 3 Produção

1. Associar receitas versionadas às famílias e variantes.
2. Completar dependências de etapas, capacidade, reservas e alertas de material.
3. Criar agenda unificada de produção, máquinas, instalação, entrega e aprovações.
4. Tornar verificações de qualidade obrigatórias antes da conclusão.
5. Registar desvios, falhas, retrabalho e fotografias de controlo.

### Fase 4 Fiscal

1. Consolidar reconciliação entre pedido, pagamento, Moloni e reembolso.
2. Implementar bloqueio e histórico do fecho trimestral.
3. Criar lista de exceções fiscais com evidência e responsável.
4. Exportar dossier do trimestre para validação do contabilista.
5. Executar período de teste e documentar aprovação contabilística.

### Fase 5 Orçamentista IA

1. Concluir e testar a ligação oficial ao plano ChatGPT Pro.
2. Validar saídas estruturadas, confiança, factos, inferências e perguntas em falta.
3. Criar conjunto de casos reais anonimizados por família prioritária.
4. Medir tolerância de classificação, extração e estimativa.
5. Integrar proposta, revisão humana e conversão controlada em orçamento.

### Fase 6 Gestor IA

1. Criar resumo diário rastreável.
2. Implementar perguntas em linguagem natural com referências aos registos.
3. Criar alertas de atraso, bloqueio, compra e faturação pendente.
4. Aplicar permissões do utilizador às respostas e ações sugeridas.
5. Registar utilização, erros e limites sem fallback pago silencioso.

### Fase 7 Aprendizagem

1. Generalizar previsto versus realizado para todas as famílias.
2. Definir amostra mínima, tratamento de anomalias e nível de confiança.
3. Gerar recomendações explicadas sem alterar preços automaticamente.
4. Implementar aprovação, versão, vigência e reversão.
5. Medir erro, aceitação e impacto na margem.

### Fase 8 Entrada em produção formal

1. Preparar migração e saneamento de dados.
2. Executar formação por perfil e operação paralela.
3. Testar contingência, restauro e reversão.
4. Assinar critérios de aceitação e auto de entrada em produção.
5. Iniciar período de estabilização, garantia e suporte.

## 8 Próxima execução recomendada

Após a aprovação deste diagnóstico, o primeiro incremento da Fase 1 deverá ser **Identidades administrativas e auditoria central**. Esta ordem é necessária porque todas as integrações seguintes, especialmente Shopify, Moloni, IA e fecho fiscal, precisam de saber quem executou ou aprovou cada ação.

O incremento deverá entregar:

- utilizadores administrativos individuais;
- perfis e permissões explícitas;
- sessão associada ao utilizador;
- auditoria de login, criação, alteração, exclusão, emissão fiscal e configuração;
- consulta administrativa da trilha sem exposição de segredos;
- testes de autorização e de integridade do registo.

## 9 Condição de conclusão da Fase 0

A Fase 0 será considerada concluída quando a Cliente:

1. confirmar este inventário e a ordem do backlog;
2. fornecer ou confirmar os acessos e decisões da secção 6;
3. indicar os responsáveis funcionais por Shopify, produção, fiscalidade e administração;
4. autorizar o início do primeiro incremento da Fase 1.

