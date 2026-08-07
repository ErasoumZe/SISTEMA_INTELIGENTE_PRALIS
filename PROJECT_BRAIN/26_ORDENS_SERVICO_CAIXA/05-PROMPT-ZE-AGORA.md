# Prompt imediato para José — CX-Z01 + CX-Z02

Este trabalho pode rodar enquanto Marco executa `CX-M01`, porque é somente-leitura e não altera os
arquivos de integração.

```text
Prioridade absoluta: finalizar o módulo Caixa do Sistema Pralis.

Execute somente as OS CX-Z01 e CX-Z02. Não altere código, banco, branch, arquivos, migrations ou
dados de produção nesta etapa.

Leia AGENTS.md e apenas as seções relevantes de:
- PROJECT_BRAIN/18_DIVIDAS_TECNICAS.md
- PROJECT_BRAIN/19_REGISTRO_DE_REGRAS.md
- PROJECT_BRAIN/21_DECISOES_04_08.md
- PROJECT_BRAIN/22_AUDITORIA_STACK_2026_08_05.md
- PROJECT_BRAIN/25_BACKLOG_2026_08_05.md

Use agentes paralelos somente-leitura para preparar consultas e revisar conclusões. O Claude
principal consolida. Encerre os agentes antes de acessar produção.

CX-Z01 — pré-voo de produção, estritamente SELECT/read-only:
1. duplicatas de vendas por empresa_id + identificador_externo: total, por dia e 10 amostras;
2. período e quantidade candidatos ao reprocesso de datas/hash;
3. lançamentos com juros/desconto e impacto potencial no Caixa;
4. lacres que colidem apenas por maiúscula/minúscula;
5. PDVs e contas suspeitos de teste, com FKs e uso histórico;
6. tamanho e número de linhas de integracoes_historico e integracoes_sem_novidade;
7. vendas com caixa_id nulo, por período e empresa;
8. caminhos reais que entregam valores com separador de milhar.

Mascarar e-mails, documentos, chaves, nomes pessoais e payloads. Não expor credenciais. Se não tiver
acesso a produção, não invente números: entregue as queries revisadas e marque a execução como
bloqueada por acesso.

CX-Z02 — entregar perguntas objetivas, com opções e impacto, para José/Rodrigo decidirem:
1. retorno quando o fechamento tem déficit ou sobra maior;
2. dinheiro físico versus cartão/PIX;
3. Gerência opera Caixa ou apenas supervisiona;
4. reabertura de Caixa existe ou não;
5. lacre bancário, prazo com múltiplos destinos e divergência no recebimento;
6. CREARE fornece operador;
7. PDVs não-CREARE desta versão;
8. PDV/conta desconhecidos são automáticos ou pendentes de aprovação;
9. destinatários da notificação de diferença/quebra.
10. qual fonte vence entre importar-pralis e seed-planilha;
11. qual evidencia de conciliacao/rastreabilidade Rodrigo exige para homologar o Caixa.
12. a Tesouraria pode editar transferencia e em quais estados.

Não tome nenhuma decisão por conta própria. Entregue:
- comandos/queries executados;
- confirmação de transação read-only quando aplicável;
- números e amostras mascaradas;
- riscos P0/P1 encontrados;
- as doze decisões ainda abertas;
- ordem recomendada das próximas OS de José;
- confirmação explícita de zero escrita, zero migration, zero commit, zero push e zero merge.
```
