# Prompt M1 — Malote com valor + lacre + abertura de caixa com déficit

> Cole isto no Claude Code (Opus), sessão nova, branch sem acento. É a fundação do fluxo real de
> caixa (regra R8 do PROJECT_BRAIN). **Tem migration e mexe na fórmula de saldo — o agente PARA e
> mostra o SQL e a fórmula antes de aplicar.** Não rodar em paralelo com nada que toque `caixa`,
> `transferencias`, `malotes` ou `fechamentos_caixa`.

---

Leia, antes de escrever qualquer código:
- `PROJECT_BRAIN/02_REGRAS_DE_NEGOCIO_PLANILHA.md` — regras **R8** (malote = empréstimo do cofre,
  caixa nasce em déficit), **R3/R4** (fechamento/retorno), R1 (só dinheiro no caixa físico).
- `PROJECT_BRAIN/06_GAPS_E_DECISOES.md` — decisões **D1** (lacre obrigatório ida e volta; lacre
  inicial = número do malote), **D3** (não existe "código do malote"; a identidade é o lacre),
  **D4** (seguir a planilha), **D5** (lacre opcional por enquanto, mas o campo existe).
- Código atual: `db/src/schema/app.schema.ts` (tabelas `malotes`, `lacres_malotes`,
  `transferencias`, `fechamentos_caixa`), `shared/src/caixa/index.ts`
  (`abrirCaixaPayloadSchema`), `shared/src/caixa/regras.ts` (`saldoCaixaCentavos`, ADR-001),
  `api/src/caixa/caixa.service.ts` (`abrirCaixa` / `abrirCaixaEmTransacao`).

## Objetivo

O tesoureiro/admin prepara **malotes** (saco de dinheiro) com **valor** e um **lacre** que é a
sua identidade. Ao **abrir o caixa**, o operador **seleciona um malote disponível**; isso gera
**automaticamente** uma transferência **cofre → caixa** pelo valor do malote, e o caixa **passa a
dever esse valor ao cofre** (déficit). As vendas em dinheiro quitam a dívida ao longo do turno.

## Regras inegociáveis

1. **A identidade do malote é o LACRE, não um código** (D3). Onde hoje há `malotes.codigo`, o
   valor guardado É o número do lacre. (O hotfix `fix/malotes-excluir-e-codigo-lacre` já caminha
   nessa direção — alinhar, não duplicar.)
2. **Lacre obrigatório conceitualmente na ida e na volta** (D1), mas **preenchimento opcional no
   sistema por enquanto** (D5): o campo existe e é aceito; a obrigatoriedade fica atrás de uma
   flag por empresa, default desligada.
3. **O malote tem `valor` e `status`** (`disponivel → em_uso → devolvido`). Só malote
   `disponivel` pode ser selecionado na abertura. Ao selecionar, vira `em_uso`.
4. **A transferência de abertura é criada pelo servidor**, `tipo = abertura`, origem = conta do
   **cofre** da empresa, destino = conta do **caixa** (PDV/turno), valor = valor do malote,
   vinculada ao `fechamentos_caixa` recém-criado, ao `malote_id` e ao `lacre`.
5. **NÃO inventar conta de cofre/caixa.** Se a empresa não tiver as contas contábeis necessárias
   mapeadas, **PARE e pergunte** como resolver (não criar conta silenciosamente).
6. Retrocompatível: abrir caixa **sem** informar malote continua funcionando (o malote é
   opcional na abertura nesta fase). Nenhum caixa hoje aberto pode quebrar.

## O ponto crítico — fórmula de saldo (PARE aqui)

A fórmula atual (`saldoCaixaCentavos`) soma `transferenciasEntrada` e subtrai
`transferenciasSaida`. Se a transferência de abertura (cofre → caixa) entrar como
`transferenciasEntrada`, o saldo do caixa **começa em +valor do malote** — o **oposto** do
déficit que a regra R8 pede.

**Antes de tocar em qualquer fórmula, PARE e me apresente:**
- (a) como a planilha calcula o **SALDO** na aba `TRANSFERÊNCIAS GRUPO CONTAS`
  (`SALDO = TOTAL ENTRADA − TOTAL SAÍDA`) e como isso se traduz para o caixa ao vivo;
- (b) duas opções de modelagem, com prós/contras:
  - **Opção A** — a dívida do malote é uma linha separada (`divida_cofre`), e o "resultado do
    caixa" = caixa físico − dívida (nasce em 0, sobe com as vendas);
  - **Opção B** — a transferência de abertura conta como **saída** na perspectiva do caixa
    (déficit direto no saldo), ajustando a semântica de `transferenciasSaida/Entrada`;
- (c) a recomendação sênior de qual seguir **preservando o ADR-001** e sem quebrar os totais já
  persistidos de caixas fechados.

Só implemente a fórmula depois que eu escolher A ou B.

## Entregas (após aprovar SQL e fórmula)

1. **Migration (PARE e mostre o SQL primeiro — AGENTS.md):**
   - `malotes`: adicionar `valor` (valorMonetario, notNull default '0') e `status`
     (`disponivel|em_uso|devolvido`, default 'disponivel', com check).
   - `fechamentos_caixa`: adicionar `malote_abertura_id`, `lacre_abertura` (text) e o(s)
     campo(s) que a fórmula escolhida exigir (ex.: `troco_inicial`/`divida_cofre`).
   - `transferencias`: adicionar `tipo` (`abertura|suprimento|sangria|retorno`, com check),
     default derivado para linhas existentes (ex.: `suprimento`), **sem backfill destrutivo**.
   - Nenhuma coluna removida. Migration puramente aditiva.
2. **shared:** `abrirCaixaPayloadSchema` aceita `maloteId?` e `lacreAbertura?` (opcionais);
   contrato do malote passa a ter `valor` e `status`; `saldoCaixaCentavos` ajustado conforme a
   opção escolhida (com testes unitários da fórmula nova cobrindo o déficit).
3. **api:** `abrirCaixaEmTransacao` — se `maloteId` vier: validar que o malote é `disponivel` e
   da empresa; marcá-lo `em_uso`; consumir/registrar o lacre; criar a transferência `abertura`
   (cofre → caixa) atômica na mesma transação; iniciar o caixa em déficit conforme a fórmula.
   Módulo `malotes`: CRUD com `valor` e `status`.
4. **Testes de integração (Testcontainers):**
   - abrir caixa com malote de R$490 → caixa nasce em déficit −490 (ou saldo/dívida conforme a
     opção); transferência `abertura` criada; malote vira `em_uso`; lacre registrado.
   - após R$490 em vendas dinheiro → dívida quitada (saldo próprio = 0).
   - abrir caixa **sem** malote → comportamento atual intacto (retrocompat).
   - malote já `em_uso` não pode ser selecionado de novo.

## Fora de escopo deste M1 (não fazer agora)

- Transferência de retorno automática no fechamento (é o **M2**).
- Agrupamento 1ª/2ª/3ª transferência por caixa+dia (M2).
- Tela nova de transferência/malote (é o **V4**, e depende de M1+M2).
- Ciclo de vida do lançamento / conferência (M3/Fase C).

## Encerramento

Branch sem acento. `npm run lint && npm run check && npm test` verdes. Push + PR pequeno.
Lembrete: nenhuma mudança em auth/permissões/rotas além do necessário para o malote na abertura.
