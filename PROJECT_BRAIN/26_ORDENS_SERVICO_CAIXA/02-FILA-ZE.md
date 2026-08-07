# Fila de José — Caixa

José atua nas decisões de negócio, produção, dinheiro, banco, integração, transferências e deploy.
`CX-Z01` e `CX-Z02` podem começar agora porque não alteram os arquivos da `CX-M01`.

## CX-Z01 · Pré-voo de produção somente-leitura — PRONTA AGORA

Sem branch e sem escrita em produção. Entregar números e amostras mascaradas para:

- D-01: duplicatas por `(empresa_id, identificador_externo)`;
- D-05: período candidato ao reprocesso por correção de datas;
- D-08: lançamentos com juros/desconto e impacto potencial;
- S-03: lacres que colidem apenas por maiúscula/minúscula;
- B-06: PDVs e contas de teste em produção;
- O-02: tamanho/linhas de `integracoes_historico` e `integracoes_sem_novidade`;
- D-10: vendas órfãs (`caixa_id` nulo);
- D-12: caminhos reais que entregam separador de milhar.

Não executar `UPDATE`, `DELETE`, migration, seed ou reprocesso.

## CX-Z02 · Pacote de decisões do fechamento — PRONTA AGORA

Registrar no `PROJECT_BRAIN`, após resposta de José/Rodrigo:

1. C-01/C-09: retorno quando há déficit ou sobra maior que o previsto;
2. D-09/R-007: dinheiro físico versus cartão/PIX no fechamento;
3. C-02: Gerência opera Caixa ou só supervisiona;
4. C-03: reabertura existe ou não;
5. R-137/R-138/R-139: lacre bancário, prazo com múltiplos destinos e divergência física;
6. C-07: o CREARE entrega operador;
7. C-08: quais PDVs não-CREARE precisam entrar nesta versão;
8. S-14: PDV/conta novos são automáticos ou exigem aprovação;
9. C-11/R-125: quem recebe notificação de diferença/quebra.
10. C-09: qual fonte vence entre `importar-pralis` e `seed-planilha`;
11. C-05: qual evidencia de conciliacao/rastreabilidade Rodrigo aceita no go-live.
12. S-16: a Tesouraria pode editar transferencia e em quais estados.

Sem decisão, a OS dependente não começa.

## CX-Z03 · Backup agendado e restauração provada

**Origem:** O-01/A-18.
**Dependência:** nenhuma.
**Branch sugerida:** `chore/caixa-backup-restore`.

Agendar o backup no ambiente real, manter retenção e executar uma restauração em banco isolado. Não
usar o banco de produção como destino do restore.

## CX-Z04 · Caminho seguro de migrations

**Origem:** O-07/D-01 técnica.
**Dependência:** `CX-Z03`.
**Branch sugerida:** `ci/caixa-migrations-seguras`.

Fechar os passos pendentes do baseline e provar migrations sobre dump anonimizado. Pré-requisito para
índices únicos de venda e lacre. Mostrar todo SQL antes.

## CX-Z05 · Idempotência concorrente da venda

**Origem:** D-01, D-02 e D-03 / A-01.
**Dependências:** `CX-M01`, `CX-Z01`, `CX-Z04` e decisão sobre duplicatas existentes.
**Branch sugerida:** `fix/caixa-venda-idempotencia-concorrente`.

Índice único por empresa/identificador externo, ingestão atômica e teste com N requisições simultâneas.
Uma venda, um conjunto de itens/pagamentos e ledger consistente. Migration exige aprovação do SQL.

## CX-Z06 · Hash inclui datas

**Origem:** D-04/A-02.
**Dependência:** `CX-Z05`.
**Branch sugerida:** `fix/caixa-hash-datas-integracao`.

Serializar `Date` canonicamente em ISO e provar que mudança de horário altera o hash. Antes de
publicar, dimensionar o primeiro ciclo, pois hashes existentes serão invalidados.

## CX-Z07 · Reprocesso controlado do período afetado

**Origem:** D-05.
**Dependência:** `CX-Z06` implantada e `CX-Z01` dimensionada.
**Execução operacional, não branch de código.**

Dry-run, contagem, amostra, orçamento de rate limit e conciliação antes/depois. Nunca rodar junto com
o agente enquanto `CX-Z15` não estiver resolvida.

## CX-Z08 · Venda tardia atualiza o fechamento

**Origem:** D-07/A-04.
**Dependência:** `CX-Z06`.
**Branch sugerida:** `fix/caixa-venda-tardia-totais`.

Histórico e detalhe devem mostrar o mesmo total após venda tardia. Definir uma única fonte ou
recalcular os campos congelados; mudança de fórmula exige decisão.

## CX-Z09 · Juros e desconto entram no total correto

**Origem:** D-08/D-09 técnica.
**Dependência:** impacto medido em `CX-Z01`.
**Branch sugerida:** `fix/caixa-juros-desconto-total`.

Usar `valorTotalCentavos` conforme spec, provar Caixa e conta com os mesmos filtros e decidir o efeito
no histórico antes de qualquer correção de dados.
Na mesma fronteira monetaria, mapear as chamadas de `paraCentavos` e provar separadores de
milhar sem ambiguidade entre locales; nao adivinhar o formato de entrada.

## CX-Z10 · Dinheiro físico, cartão e PIX no fechamento

**Origem:** D-09/R-007 + D-11/C-02.
**Dependência:** decisão `CX-Z02`.
**Branch sugerida:** `fix/caixa-fechamento-formas-pagamento`.

Separar conferência física das formas eletrônicas e alinhar conta × Caixa para os perfis decididos.
Teste com dinheiro, cartão, PIX, misto, diferença e fechamento sem diferença falsa.

## CX-Z11 · Integridade de lacres e buscas externas

**Origem:** S-02, S-03 e A-03/A-06.
**Dependências:** `CX-Z01`, `CX-Z04`.
**Branch sugerida:** `fix/caixa-lacres-normalizacao`.

Escapar curingas nas cinco buscas, normalizar número e criar unicidade case-insensitive após resolver
colisões reais. Testar `%`, `_`, `\\`, `AB123` e `ab123`.

## CX-Z12 · Edição de transferência mantém lacre coerente

**Origem:** S-04/A-07.
**Dependência:** `CX-Z11`.
**Branch sugerida:** `fix/caixa-transferencia-edicao-lacre`.

Aplicar na edição a mesma validação da criação e manter a tabela de lacres sincronizada.

## CX-Z13 · Retorno e regras finais de transferência

**Origem:** C-01/C-09, R-137, R-138, R-139, R-140 e R-143.
**Dependência:** decisões `CX-Z02`, `CX-Z10`, `CX-Z12`.
**Branch sugerida:** `feat/caixa-retorno-fechamento-final`.

Entregar retorno para fechamento normal, déficit e sobra maior; obrigatoriedade condicional de lacre e
prazo; divergência registrada/notificada; nenhuma transferência sem fundo. Teste vertical completo.

## CX-Z14 · Venda integrada não é editável silenciosamente

**Origem:** S-05/A-08.
**Dependência:** `CX-Z05`.
**Branch sugerida:** `fix/caixa-bloqueia-edicao-venda-integrada`.

Bloquear edição manual ou exigir permissão dedicada e trilha, conforme decisão. O próximo ciclo da
integração não pode mascarar adulteração.

## CX-Z15 · Lock e rate limit do agente

**Origem:** O-03 e O-04 / A-11 e A-12.
**Dependência:** `CX-Z05`.
**Branch sugerida:** `fix/caixa-agente-lock-rate-limit`.

Heartbeat durante ciclos longos e orçamento único entre agente/reprocesso, ou exclusão mútua. Teste
de ciclo longo e documentação corrigida.

## CX-Z16 · Reenvio preserva revinculação humana

**Origem:** O-05/A-13.
**Dependência:** `CX-Z06` e decisão sobre precedência.
**Branch sugerida:** `fix/caixa-reenvio-revinculacao`.

Preservar `caixa_id` decidido por gerente ou auditar explicitamente a sobrescrita.

## CX-Z17 · Vendas órfãs e retenção de logs

**Origem:** D-10/O-02/A-05/A-14.
**Dependência:** números de `CX-Z01`.
**Branch sugerida:** `feat/caixa-alerta-vendas-orfas`.

Relatório/alerta de vendas sem Caixa; listagem paginada por período; índices e política de retenção.
Migration e expurgo exigem SQL, contagem e aprovação.

## CX-Z18 · PDV e conta não nascem sem aprovação

**Origem:** S-14/A-15.
**Dependência:** decisão `CX-Z02`.
**Branch sugerida:** `fix/caixa-pdv-aprovacao`.

ID de dispositivo desconhecido vira pendência ou segue a regra aprovada; não cria estrutura contábil
silenciosamente.

## CX-Z19 · Configuração e gate do agente

**Origem:** G-06, G-09 e A-10.
**Dependência:** `CX-Z15`.
**Branch sugerida:** `ci/caixa-agente-gates-fuso`.

Alinhar documentação de fuso, rodar o check de `integracoes-scripts` no CI e testar o pacote do agente.

## CX-Z20 · Limpeza controlada de PDVs/contas de teste

**Origem:** B-06.
**Dependência:** inventário `CX-Z01`, backup `CX-Z03` e decisão explícita.
**Execução operacional.**

Mostrar contagem, amostra e FKs; preferir inativar quando houver histórico. Registrar exatamente o que
mudou e como reverter.

## CX-Z21 · Runtime e rastreabilidade operacional

**Origem:** O-06 e S-17 / A-17 e A-19.
**Dependencia:** `CX-Z15`.
**Branch sugerida:** `fix/caixa-runtime-rastreabilidade`.

Garantir instancia unica e resiliencia do agendador de transferencias fora do ciclo fragil da API, ou
provar a estrategia equivalente. Propagar `request-id` para logs e Sentry sem segredos ou dados
pessoais. Testar reinicio, concorrencia e correlacao ponta a ponta.

## CX-Z22 · Gates finais do repositorio e do agente

**Origem:** G-01, G-02, G-05, G-08 e F-14.
**Dependencia:** `CX-Z19`; precisa terminar antes de `CX-T01`.
**Branch sugerida:** `ci/caixa-gates-finais`.

Fazer o front ter gate inequivoco; levar `lint:deps`, `format:check` e `audit:deps` ao CI
com tratamento explicito da divida CRLF; declarar engines; sanear `.env.example`; alinhar o fuso
e validar `integracoes-scripts`. Nao mascarar falha com pipe ou aumento arbitrario de timeout.
