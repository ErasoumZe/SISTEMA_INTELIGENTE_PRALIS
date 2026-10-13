# +Novo — host único de transferências e retorno manual

Data: 02/10/2026. Branch: `feat/caixa-ux-clean`. Base da entrega: `ee7f522`.

## Entregue

- +Novo tem **Saídas** e **Transferências**. Entradas continua como consulta no menu.
- Saídas continua usando o modal existente de despesa, mercadoria e retirada.
- Transferências tem um único host com **Nova transferência** e **Retorno / sangria**. Criação comum exige `transferencias_criar`; edição mantém `transferencias_editar`. Retorno exige `caixa_operar` e Caixa aberto da empresa selecionada.
- Retorno reutiliza `criarAcoesCaixa.retornarSaldoOperacional` sem alterar sua implementação: confirmação, `POST /api/caixa/:id/transferencia-cofre`, saldo livre descontadas reservas, composição, lacre, responsável, chave da intenção e limpeza apenas após sucesso.
- CTA, diálogo e evento antigos removidos de `CaixaResumoPage.vue` e `pages/caixa.vue`. O formulário de retorno não tem `v-dialog`; o estado vive no host e sobrevive à troca de abas/retry.
- Formulário comum e seu script extraídos, preservando campos, validações, agendamento, múltiplos destinos e confirmação. A montagem lazy agora inicializa edição com prazo/múltiplos destinos.
- Cores de texto/fundo do formulário comum usam tokens do tema nas áreas antes fixas; retorno usa surface/on-surface. Novos componentes ficam abaixo de 400 linhas.
- R-204 registra a mudança visual explicitamente autorizada; regra financeira, backend, permissões, migrations, histórico e fechamento não foram alterados.

## Arquivos centrais

- `web-vue/components/operacoes/TransferenciasHost.vue`
- `web-vue/components/operacoes/OperacaoTransferenciaForm.vue`
- `web-vue/components/caixa/CaixaRetornoSangriaForm.vue`
- `web-vue/composables/useCaixaRetornoSangria.ts`
- `web-vue/composables/useTransferenciaFormulario.ts`
- Integração: `AppWorkspace.vue`, `WorkspaceDialogs.vue`, `workspace-context.ts`, `utils/domain.ts`.

## Validação

- `npm run check --workspace @padaria/web-vue`: terminou com exit 0.
- `npm run test --workspace @padaria/web-vue -- --pool=threads --maxWorkers=1 utils/menu.test.ts utils/caixa-acoes.test.ts composables/useCaixaRetornoSangria.test.ts composables/useTransferenciaModal.test.ts`: **66 testes passaram**, 4 arquivos.
- `npm run test --workspace @padaria/web-vue -- --pool=threads --maxWorkers=1 components/operacoes/TransferenciasHost.test.ts`: **4 testes passaram**, 1 arquivo.
- Total focado: **70 testes verdes**, incluindo permissões por aba, troca de empresa, saldo/composição/lacre/responsável, erro de carga, retry com mesma chave, limpeza no sucesso, duplo clique e montagem em edição.
- Primeira tentativa Vitest no pool padrão falhou antes de executar testes: timeout de inicialização de 3 workers. Reexecução com um worker em threads passou.
- ESLint focado apontou uma asserção desnecessária no teste; corrigida antes do commit. A configuração atual ignora arquivos `.vue`, que emitem aviso. Gate final de lint/check deve ser repetido no HEAD final da rodada.
- `git diff --check`: sem erros.

## Não realizado nesta fatia

Não houve validação visual em navegador nas larguras 1440/1024/768/390; necessária na revisão da rodada. Não houve build de aplicação, suíte completa do monorepo, push, PR, merge, deploy, migration ou execução financeira real. O typecheck concluído antecede o fechamento final dos arquivos de testes; repetir o check no HEAD final da rodada.

O segundo cérebro foi consultado para orientação; código/PROJECT_BRAIN e a solicitação atual prevaleceram sobre notas antigas de localização do retorno.
