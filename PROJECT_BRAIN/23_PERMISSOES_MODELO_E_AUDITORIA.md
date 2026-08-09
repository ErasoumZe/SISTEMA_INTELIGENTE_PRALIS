# 23 · Permissões — modelo vigente e auditoria

> Escrito em 05/08/2026, resgatando o que ainda valia dos 15 documentos de permissão da pasta
> `PROJECT_BRAIN - Copia/` (fase Luís, jun–jul/2026) **depois de conferir cada afirmação contra o
> código**. Aquela pasta foi para `_ARQUIVO_MORTO/`; este documento a substitui.
>
> Complementa `09_AUDITORIA_PERMISSOES.md`, cujo §4 (mapa alvo do ciclo de vida) continua válido.

---

## §1 · O modelo, como ele funciona de verdade hoje

**Dois eixos independentes:**

- **Permissões** (o que pode fazer) — catálogo de **240 strings** em
  `shared/src/autenticacao/index.ts:3-254`: 149 de ação + 91 de menu (`menu_*`).
- **Escopo de empresa** (onde pode) — `usuarios_empresas` + helpers em `api/src/auth/empresa.ts`
  (`empresasPermitidas`, `podeAcessarEmpresa`, `filtrarPorEmpresas`, `escopoEmpresaAtiva`).

**Resolução em 3 camadas** (`shared/src/autenticacao/index.ts:324-345`):

```
camada 1: setor      (permissoes_setores)
camada 2: cargos ATIVOS (permissoes_cargos, colaboradores_cargos.ativo = true)
camada 3: usuario    (permissoes_usuarios)
```

Dentro de uma camada, `false` explícito vence. Camada posterior sobrescreve a anterior:
**usuário > cargos > setor**. Nada definido = sem permissão (deny-by-default).

**Roles** (`api/src/auth/perfil.service.ts:11-18`):

- `usuario_admin` faz short-circuit para `permissoesAcessoTotal` — o catálogo inteiro **menos** as 7
  flags `_somente_caixa_aberto`. Decisão do José em 29/07: o dono do sistema não herda restrição,
  senão perderia Lançamentos e Entradas do menu quando não tivesse caixa aberto.
- `admin` **não tem efeito especial** (comentário explícito no código).
- `usuario_comum` resolve pelas três camadas.

**Restrições** — `menu_<tela>_somente_caixa_aberto` **restringe em vez de conceder**, e é enforçada no
servidor, não só no menu: `caixa.service.ts:200-213` prende a listagem ao próprio caixa aberto e
ignora o `caixaId` pedido pelo cliente; `:229-243` faz Entradas listar o dia contábil, não o caixa.

**Default-deny de rota** — hook `onRequest` em `api/src/app.ts:153-159`, allowlist de 6 entradas em
`:55-62`. **Rota nova nasce protegida.** Perfil só existe com colaborador vinculado; senão
`403 PROFILE_NOT_CONFIGURED`.

**Ciclo de vida do lançamento** (`api/src/lancamentos/lancamentos.dominio.ts:438-476`) — vale só para
despesas, mercadorias e retiradas:

- `podePagarLancamento` — `*_pagar` **ou** `caixas_gerenciar` (fallback legado, a remover).
- `exigirPermissaoPagar` — só dispara quando o payload define ou altera `dataPagamento`.
- `exigirPermissaoEditarPago` — editar registro já pago exige `*_editar_dpago`.
- `podeVerLancamentosPagos` — sem `*_visualizar_dpago`, a listagem esconde os pagos **no servidor**.

**Onde mora o catálogo por cargo:** `db/src/referencia-permissoes.ts:128-288` é a referência de
produção, consumida pelo bootstrap em modo **merge** (banco vence) e pelo endpoint
`POST /api/permissoes/cargo/:id/restaurar-padrao`, que faz **replace** do padrão. O seed de dev
(`db/seed.ts:251-400`) mantém paridade **manual** com essa referência — não há teste que a verifique.

> **O setor "Loja" hoje não concede nada** (`db/seed.ts:891-899`). Foi esvaziado de propósito, porque
> contaminava cargos estreitos (Tesouraria, DP, Fiscal). **Não restaurar.**

---

## §2 · Matriz cargo × ação — o mapa alvo e o que o código faz

Mapa alvo confirmado pelo Rodrigo em 22/07 (`09` §4), com o veredito do código:

| Cargo      |    Lançar    | Efetuar | Pagar | Conferir |          Editar           | Editar D/Pago | Excluir | Excluir D/Pago |
| ---------- | :----------: | :-----: | :---: | :------: | :-----------------------: | :-----------: | :-----: | :------------: |
| Caixa      | ✔ (no caixa) |    —    |   —   |    —     | ✔ (saídas, próprio caixa) |       —       |    —    |       —        |
| Tesouraria | ✔ (transf.)  |    —    |   —   |    ✔     |             —             |       —       |    —    |       —        |
| Gerência   |      ✔       |    ✔    |   —   |    ✔     |             ✔             |       —       |    ✔    |       —        |
| Financeiro |      ✔       |    —    |   ✔   |    ✔     |             ✔             |       ✔       |    ✔    |       ✔        |
| Admin      |      ✔       |    ✔    |   ✔   |    ✔     |             ✔             |       ✔       |    ✔    |       ✔        |

Confirmado no código: Gerência **não** tem `_pagar`; Financeiro **não** tem `_efetuar`. Ambos travados
por `tests/integration/permissoes/orfaos-cargos.test.ts:55-69`.

**Divergências reais entre mapa e código:**

| #   | Divergência                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | O mapa diz que o Caixa "nunca edita"; o código dá `despesas_editar`/`mercadorias_editar`/`retiradas_editar`, limitados ao próprio caixa aberto e à conta do PDV. **O código venceu** — R-121/R-122 é posterior. Atualizar o mapa, não o código |
| M2  | O mapa dá "editar transferência" à Tesouraria; o código **não** dá `transferencias_editar`. Divergência aberta                                                                                                                                 |
| M3  | `*_excluir` e `*_excluir_dpago` estão distribuídos mas **não têm rota** — não existe DELETE de lançamento                                                                                                                                      |
| M4  | `*_efetuar` está distribuído e **não é enforçado em lugar nenhum**                                                                                                                                                                             |
| M5  | Só `transferencias_conferir` é enforçada. `despesas_conferir`, `mercadorias_conferir` e `retiradas_conferir` são **inertes**                                                                                                                   |
| M6  | `fechamento_com_diferenca_visualizar` é só gate de menu; a tela roda sob `caixa_operar`                                                                                                                                                        |

---

## §3 · Achados abertos, por gravidade

**P-01 · Escalada de privilégio por `cadastro_usuarios_editar` 🔴**
`PUT /api/usuarios/:id` aceita `role: "usuario_admin"` (`shared/src/usuarios/index.ts:22`,
`api/src/usuarios/usuarios.service.ts:90,168,200`) sob o guard `cadastro_usuarios_editar`
(`usuarios.controller.ts:40`). **Quem edita usuários promove qualquer um — inclusive a si mesmo — a
acesso total.** Achado novo, não estava em nenhum documento antigo. É o caminho mais curto para
acesso irrestrito e vale mais que todo o resto desta lista.

**P-02 · Auto-elevação por `cadastro_permissoes_criar` ⚠️**
Um não-admin concede qualquer permissão a si mesmo via `POST /api/permissoes` com
`tipoPermissao: "usuario"` e o próprio `usuarioId`. `permissoes.service.ts:241-252` só valida escopo
de empresa. **Foi homologado como aceitável em 01/07** — se a auditoria nova quiser rever, é decisão
de negócio do José, não bug.

**P-03 · Salvar permissão pela tela apaga as permissões ocultas 🔴**
Cadeia verificada: o backend faz **replace total** (`permissoes.repository.ts:52-86`) → a listagem
filtra as ocultas e reescreve o `regrasJson` só com as visíveis
(`web-vue/composables/useCadastroView.ts:172,305-320`) → o form é montado desse JSON
(`AppWorkspace.vue:1412`) → o save envia só o que está no form (`:1424`).
**Consequência real:** editar o cargo Gerência pela tela derruba `relatorio_dre_visualizar`,
`promocoes_visualizar`, `relatorio_faltas_visualizar`, `relatorio_advertencias_visualizar`,
`perdas_sobras_visualizar`, `estoque_produtos_visualizar` e os `menu_*` correspondentes — 13 telas
ocultas em `web-vue/utils/domain.ts:34-48`. Mitigado, **não resolvido**, pelo `restaurar-padrao`, que
exige alguém perceber a perda.

**P-04 · Salvar `regras: {}` apaga a linha inteira**
`permissoes.repository.ts:59,71,83` — `delete` sempre, `insert` só se houver chave. Um save vazio
zera o alvo sem aviso.

**P-05 · `PUT /api/permissoes/:id` ignora o `:id`**
`permissoes.controller.ts:69-81` chama `salvarPermissao(request.body, ...)` sem parsear
`request.params`. PUT e POST fazem a mesma coisa; o alvo é sempre o do corpo. Não vaza nada — mas o
contrato mente.

**P-06 · 54 permissões de ação inertes**
Nunca citadas no backend. Ciclo de vida sem rota (`*_efetuar`, `*_excluir_dpago`, 3 `_conferir`,
3 de transferência), 13 `cadastro_*_excluir` sem DELETE, `cadastro_lacres_editar`,
`cadastro_contas_usuarios_editar`, `integracoes_excluir` e 12 `*_visualizar` de módulos placeholder.
Não é falha de segurança — é ruído que faz a tela de permissões prometer o que não existe.

**P-07 · Permissão de cargo/setor vale cross-empresa** — `perfil.repository.ts` busca regras sem
filtrar pela empresa **ativa/de escopo**; o escopo limita só os dados. **Homologado como decisão**,
não é bug. Um colaborador da empresa A com cargo Gerência (de A) mantém as permissões de Gerência ao
operar sobre a empresa B do escopo dele.

> ⚠️ **Atualizado em 09/08/2026 (CX-M05).** A redação anterior dizia que a busca era feita "sem
> filtrar por empresa", e isso **deixou de ser verdade**: o resolvedor passou a exigir que cargo e
> setor pertençam à **empresa real do colaborador** (`colaboradores.empresa_id`).
>
> **A decisão homologada continua intacta** — as duas coisas são distintas:
>
> - o que a P-07 homologa é o **conjunto de permissões de um vínculo legítimo** valendo em todo o
>   escopo do usuário. Isso não mudou;
> - o que passou a ser recusado é o **link corrompido**: vínculo cujo `empresa_id` diverge do
>   colaborador, ou que aponta para cargo/setor de outra empresa. Nunca foi decisão de negócio — é
>   estado que o banco permite representar porque as FKs não compõem `empresa_id`, e que a rota de
>   colaboradores conseguia gravar antes da CX-M05.
>
> Foi medido: com uma linha dessas, um usuário de **zero permissões** recebia `200` numa rota
> protegida, e o nome de um cargo de outra empresa chegava ao browser. Provado e travado em
> `tests/integration/permissoes/perfil-fronteira-empresa.test.ts`.
>
> **Não "restaure" o comportamento antigo achando que respeita esta decisão.**

**P-08 · `permitir` do usuário anula `negar` de cargo/setor** — não existe "deny global".
**Homologado como decisão.**

**P-09 · Front não bloqueia rota por permissão** — `middleware/auth.global.ts` fecha o buraco de
**sessão**, não de permissão: navegar direto para `/produtos` sem `cadastro_produtos_visualizar`
renderiza a tela e quem barra é a API. Defesa em profundidade pendente, não falha.

**P-10 · Cargo "Operador de caixa" nasce órfão** — existe em `db/seed.ts:487` e **não tem padrão** em
`referencia-permissoes.ts`: o `restaurar-padrao` rejeita e o bootstrap não o sincroniza. Ou cria
referência, ou remove do seed.

---

## §4 · O que JÁ foi resolvido — não volte a "consertar"

- **`usuario_admin` não concedia nada** (era o achado central da auditoria antiga). Resolvido, e
  melhorado depois com `permissoesAcessoTotal`. Coberto por `hierarquia.test.ts:138-159`.
- **Diretor Geral dependia de um cargo com `todas:true`.** Hoje o cargo é vazio e o acesso vem do role.
- **Gerência sem `caixas_gerenciar`** (o "gap do seed", repetido em 5 documentos). Resolvido e testado.
- **Editor de permissões não renderizava as seções.** Resolvido.
- **Ausência das ações `pagar`/`conferir`/`D-Pago` no catálogo.** Existem, distribuídas, e `pagar`,
  `editar_dpago` e `visualizar_dpago` **já são enforçadas**, com teste.
- **`discriminar` "não existe".** Existe e é enforçada em despesas e mercadorias.
- **Rota nova nascendo pública.** Resolvido pelo default-deny global, com teste.

---

## §5 · Cenários de teste que faltam, por ordem de risco

Já cobertos em `tests/integration/permissoes/`: hierarquia de 3 camadas, short-circuit do admin,
matriz de caixa por cargo, ciclo de vida pagar/D-Pago, órfãos por cargo, restaurar padrão, gates de
opções de formulário, CRUD de regra e R-121.

**Faltam:**

1. **Escalada por `cadastro_usuarios_editar` → `role: usuario_admin`** (P-01). Prioridade máxima.
2. **Auto-elevação via `cadastro_permissoes_criar`** (P-02) — de caracterização ou de trava, conforme
   a decisão do José.
3. **Perda de permissões ocultas ao salvar cargo pela tela** (P-03): reproduzir o payload que a UI
   monta e assertar que as 6 permissões de telas ocultas continuam.
4. **`usuario_admin` NÃO recebe as flags `_somente_caixa_aberto`** — hoje só há prova no front
   (`web-vue/utils/menu.test.ts:101-120`), nenhuma no backend. É exatamente o ponto que já quebrou.
5. **Restrição `_somente_caixa_aberto` no servidor**: sem caixa aberto → listagem vazia; com caixa
   aberto → `caixaId` de outro caixa é ignorado.
6. **Cargo inativo não concede** (`colaboradores_cargos.ativo = false`).
7. **`PROFILE_NOT_CONFIGURED`** — autenticado sem colaborador vinculado → 403 com esse código.
8. **Paridade `db/seed.ts` × `db/src/referencia-permissoes.ts`** — teste unitário comparando os dois
   mapas. Barato, e hoje a paridade é só um comentário.
9. **Permissão de cargo/setor cross-empresa** (P-07) — a fixture `multiempresa` já existe.
10. **`PUT /api/permissoes/:id` com `:id` divergente do corpo** deve rejeitar (P-05).
11. **`regras: {}` apagando a linha** (P-04).
12. **`DELETE /api/permissoes/regras`** com alvo de outra empresa deve falhar.

---

## §6 · A regra que vale copiar palavra por palavra

Do doc 34 da pasta arquivada, §0 — o **princípio de reutilização**, que continua sendo a regra certa:

> Todo módulo novo define suas permissões no catálogo existente, com o padrão
> `<modulo>_{visualizar,criar,editar,excluir}` mais `menu_<tela>_*`; registra a tela em `itemPorTela`;
> protege a rota com guard **e** escopo de empresa; e **não cria outro sistema de permissões**.

---

## §7 · O que foi descartado da pasta antiga

- **Matriz de permissão dos docs 35/36/38 e o doc 61** — descrevem um estado morto: coluna "Malote"
  (extinta pela R-040), setor Loja como fonte (hoje vazio), Diretor com `todas:true` (hoje cargo
  vazio), Gerência sem `caixas_gerenciar` (hoje tem). Só o **formato** cargo × tela × ação × fonte
  merecia sobreviver, e está no §2 acima.
- **Doc 37 e todos os números dos validadores** — `permission-doctor.mjs`, `validar-permissoes.mjs`,
  `runtime-qa.mjs` e `db/seed-teste-permissoes.ts` **não existem neste repositório**. Os resultados
  citados ("196 permissões", "42 telas", "65 guards", 0/0/0, 50/50, 84/84) são inauditáveis e
  numericamente errados hoje. O papel do doctor foi absorvido pelos testes de integração.
- **Docs 29, 30, 31** (plano P0–P4, pauta e log de decisões) — as decisões F1–F7 já estão no código; as
  fases foram atropeladas. Único item vivo era o P0.5 (trava de auto-elevação), que virou P-02.
- **Docs 39, 40, 55** — narrativa de uma branch nunca mergeada, com senhas de seed e a saga do
  `npm install` no Windows.
- **Doc 08 §6** (mapa cargo→permissões em Markdown) — substituído por
  `db/src/referencia-permissoes.ts`, que é código executável. Documentar cargo em Markdown é dívida
  garantida.
