# RETOMAR P0 — saldo insuficiente + destino financeiro futuro do CREARE

Retome o Caixa principal do ponto real preservado. Execute **somente** esta vertical até ela ficar
publicável; não comece as próximas issues da fila.

## Identificação obrigatória

- Repositório: `D:\Sistema Pralis - ago`
- Branch esperada: `fix/caixa-saldo-insuficiente`
- HEAD inicial documentado: `0e83497596228a5546c8c2242fe40a3d2fca64ba`
- Base local documentada: `origin/main` em `5127525071d655d31cf316324d3549fc24c69c45`
- Relatório anterior: `D:\Conteudo Sistema Pralis -ago\RELATORIO-FINAL-P0-SALDO-INSUFICIENTE-2026-08-13.md`
- Plano atual: `PROJECT_BRAIN/30_RETOMADA_CAIXA_TESTAVEL_2026_08_24.md`
- Regras: R-165 a R-170 em `PROJECT_BRAIN/19_REGISTRO_DE_REGRAS.md`

## Gate Zero

1. Leia integralmente `AGENTS.md`, `PROJECT_BRAIN/00_INDICE.md`, `16`, `17`, `19`, `20` e `30`.
2. Confirme branch, HEAD, árvore, stash e commits. Não descarte nem reescreva trabalho existente.
3. Autentique o GitHub e rode `git fetch origin --prune`. Se a base/HEAD divergir, relate o delta;
   não faça rebase automático nem merge antes de ler o conflito real.
4. Confirme que o código da R-165 e os testes/fixtures relatados realmente existem no HEAD.
5. Leia o schema, migrations, journal e snapshots antes de propor qualquer coluna/tabela.
6. Não acesse produção, CREARE real, segredos ou planilhas. Não faça deploy nem backfill.

## Regra de negócio fechada

- Preservar todos os históricos negativos; zero UPDATE/backfill/regularização automática.
- Venda futura guarda empresa + forma + adquirente/provedor + conta de recebível + conta final.
- Sem mapeamento: preservar a venda, abrir pendência financeira, saldo disponível não aumenta.
- Proibido fallback para Dinheiro, Outro ou conta do PDV.
- Disponibilidade por evento real da R-169; não antecipar cartão, voucher ou cliente.
- Divergência tem tolerância zero e abre conciliação auditável.
- Contas/adquirentes/taxas são cadastro administrativo, nunca hardcoded.

## Entrega vertical

1. Reproduza o P0 existente pelo fio real: venda CREARE sem `conta_origem_id` não alimenta saldo e
   a porta recusa uma saída legítima.
2. Desenhe o menor contrato único para roteamento futuro e estado pendente. Procure estruturas já
   existentes antes de criar tabelas, endpoints ou telas.
3. Se migration for necessária, gere localmente o próximo número realmente livre após conferir
   remoto/journal/snapshots/branches; apresente SQL completo, rollback, compatibilidade e testes e
   **PARE antes de aplicar**. Aguarde autorização específica para prosseguir.
4. Implemente depois de autorizado, em commits pequenos e completos. Um único caminho de gravação;
   nenhuma segunda API e nenhuma fórmula financeira duplicada.
5. Cobertura mínima:
   - Dinheiro no PDV/turno aberto;
   - débito, crédito, Pix de maquininha, Pix direto, voucher e cliente como recebíveis apropriados;
   - sem mapeamento preserva venda e cria uma única pendência idempotente;
   - nenhum recebível futuro entra no saldo gastável antes do evento;
   - isolamento entre empresas;
   - reenvio CREARE idempotente e concorrente;
   - histórico anterior byte-a-byte inalterado;
   - saldo insuficiente e corrida continuam verdes.
6. Mutations proporcionais: remover lock; ler saldo pré-lock; ignorar delta no PUT; liberar saldo de
   recebível antes do evento; fallback silencioso; duplicar pendência no reenvio.
7. Três revisores read-only: finanças/dados; concorrência/idempotência; regressão Caixa/CREARE.
8. Gates finais em série: `git diff --check`, Prettier nos alterados, `lint`, `lint:deps`, `check`,
   build afetado, suítes focadas e `npm test` completo uma vez, com exit code real.
9. Playwright local focado: venda em dinheiro disponível; cartão apenas recebível; ausência de mapa
   gera pendência clara; saída legítima depois de saldo disponível; 1440/1024/768/390.
10. Atualize Brain, relatório e corpo da PR. Push e PR só com autorização vigente; merge/deploy nunca
    são implícitos. Se o HEAD mudar após revisão, revise o delta e repita gates proporcionais.

## Proibições de escopo

Não implemente nesta branch: transferência pendente × fechamento, discriminação CT-05/06/08,
Retorno/Sangria, empresa que desaparece, seed de senha, D-02/#41, correção pós-fechamento ou DRE.

## Saída esperada

Entregue relatório autônomo com HEAD/base, commits, arquivos, migrations (se houver), RED/GREEN,
mutations, revisores, gates e o que não foi feito. Pare no primeiro bloqueio que exija regra nova,
migration não autorizada, histórico, produção ou fórmula financeira.
