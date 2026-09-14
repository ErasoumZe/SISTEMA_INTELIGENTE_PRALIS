# 44 — Admissão direta, turno e ASO (ADM-003 V1B)

> Aberto em 28/08/2026, branch `feat/admissoes-testes-tnp`. Piloto na **TNP**.
> Terceira fatia do módulo de Admissões, sobre a `42` e a `43`. **Nada aqui cria colaborador
> operacional.**

## O que é, em uma linha

O DP faz o **pré-cadastro** de quem entra sem período de teste — nome, CPF, data, função e **turno do
catálogo** —, e o exame admissional passa a mandar no andamento: ASO não apto **pausa**, ASO apto
**retoma**.

## A fronteira, que continua a mesma

`admissoes_processos` segue **sem `colaborador_id`**, sem referência a `colaboradores` e sem efetivar
ninguém. CTPS, PIS/PASEP/NIT e exame são **exclusivos do DP** e não vão para o futuro link do
candidato.

---

## Decisões

### D-1 · Uma identidade, escolhida pela origem

A `43` dizia que o processo não teria nome nem CPF. **Mudou por decisão de Marco em 27/08/2026:** a
admissão direta precisa deles no ato, e o candidato não redigita o que o DP já preencheu.

O que **não** mudou é a regra que sustenta tudo: **uma fonte só**. O CHECK
`admissoes_processos_origem_coerencia_check` torna a coexistência impossível:

```
origem = 'teste_efetivado'  ->  teste_id NOT NULL  ·  nome, cpf, funcao_id, turno_id NULOS
origem = 'admissao_direta'  ->  teste_id NULL      ·  nome, cpf, funcao_id, turno_id OBRIGATÓRIOS
```

Não é disciplina de quem escreve: **duplicar não é representável**. A leitura resolve por `coalesce`,
num lugar só.

As **regras** também não se duplicam: mesmo `cpfTesteSchema` da ADM-001 (dígito verificador +
normalização), máscara constante na projeção, CPF fora de toda query string, e revelação como ato
auditado — `cpf_revelado` na trilha, na mesma transação da leitura.

### D-2 · CPF único entre teste e admissão — por lock, e não por índice

**Índice não cruza tabelas.** `admissoes_testes` tem o seu único parcial, `admissoes_processos` tem o
dele, e nenhum enxerga o outro. Alegar que o índice resolve seria mentira.

A garantia é `pg_advisory_xact_lock` sobre `(empresa, CPF)`, tomado como **primeira coisa da
transação**, nos **dois** caminhos — criar teste e criar admissão direta. Depois da leitura seria
tarde: em READ COMMITTED ler não trava nada, e as duas transações aprovariam uma à outra.

**Um lado só não resolveria nada.** É a corrida entre eles que o índice não alcança.

A recusa não diz de quem é o CPF nem onde ele está — quem pergunta já sabe o número que digitou, e
dizer mais entregaria a existência de um cadastro alheio.

### D-3 · Turno vem do catálogo, e o processo guarda o retrato

Jornada em texto livre **saiu do formulário**. O DP escolhe um turno da empresa, com **etiqueta
M/T/I, dias e horários**.

`turnos` ganhou `etiqueta` e `dias_semana`, as duas **anuláveis** — turno que já existe não tem
nenhuma das duas, e exigir de imediato quebraria o cadastro atual. Nenhum valor é deduzido do nome.

> **Turno incompleto não pode ser escolhido numa admissão.** Ele continua válido no cadastro, mas a
> tela precisa mostrar "M · seg a sex · 06:00–14:00", e metade disso não existiria. O seletor o mostra
> **desabilitado**, dizendo o que falta — esconder faria o DP procurar no cadastro um turno que
> existe e não entender por que sumiu. O servidor recusa com **400** quem tentar forçar.
>
> Essa garantia mora no **serviço e no teste**, não no banco: um CHECK não enxerga colunas de outra
> tabela, e FK não aponta para índice parcial. Só um trigger cruzaria as duas, e este sistema usa
> trigger para uma coisa só.

O processo guarda **retrato** do turno no ato: rótulo, etiqueta, horas e dias. Não é cópia — responde
outra pergunta. O catálogo diz *o que é o turno M hoje*; o retrato diz *o que foi combinado com esta
pessoa*, e precisa sobreviver a uma edição futura do turno. Mesma razão pela qual uma venda guarda o
preço praticado.

**Turno em uso não se apaga:** a FK é `on delete restrict`, e a rota de Turnos traduz o `23503` em
**409 `TURNO_EM_USO`** — pelo código do erro e pelo nome da constraint, nunca pelo texto, que muda
entre versões e locales. Sem a tradução, o DP veria 500. Turno livre continua excluível.

**Editar turno com campo ausente não mexe** em etiqueta nem dias; limpar exige `null` explícito. Sem
essa distinção, um cliente que não conhece os campos novos apagaria os dois ao salvar qualquer outra
coisa.

### D-4 · `jornada_horario` permanece

Coluna e valor **ficam**. É histórico legado dos processos diretos da V1A, anteriores ao catálogo.
Não é escrita por caminho novo, não foi convertida e não foi apagada — converter "seg a sex, 08:00 as
17:00" em turno seria adivinhar qual turno da empresa aquilo era, e a empresa pode nem ter
equivalente.

A metade **teste** do CHECK segue exigindo que ela seja nula: é ela que impede a jornada do teste ser
recopiada. A metade **direta** deixou de exigi-la — e é por isso que a linha legada continua válida.

### D-5 · ASO manda no andamento

Cinco situações viraram seis: `pendente` · `guia_entregue` · `agendado` · **`aso_apto`** ·
**`aso_nao_apto`** · `exige_acao`.

`realizado` **saiu**: virou ambíguo quando o desfecho ganhou dois lados — não dizia se a pessoa podia
ser admitida. `exige_acao` ficou, para a clínica pedir exame complementar.

A guia é **física e preenchida à mão**; o sistema só registra que foi entregue. Nenhum anexo.

| Registro | Efeito | Trilha |
| --- | --- | --- |
| `aso_nao_apto` | `iniciado` → **`pausado`** | `exame_alterado` + `pausado` |
| `aso_apto` **estando pausado** | volta a `iniciado` | `exame_alterado` + `retomado` |
| `aso_apto` **já iniciado** | nada muda | só `exame_alterado` |

Tudo **na mesma transação**. **Não existe botão nem rota de retomar** — retomar é consequência de
registrar apto, como iniciar o processo é consequência de efetivar o teste.

> Detalhe que quase virou defeito: a guarda de edição recusava tudo que não fosse `iniciado`. Isso
> deixaria a pausa **sem saída** — o processo pausado nunca poderia registrar o apto que o retoma.
> Ela passou a recusar só `cancelado`.

Cancelar vale de `iniciado` **ou** `pausado`; `cancelado` continua terminal.

### D-6 · Situação derivada: três valores

| Status | Situação |
| --- | --- |
| `iniciado` | **Ativo** |
| `pausado` | **Pausado** |
| `cancelado` | **Inativo** |

Pausado **não** é Ativo: chamar de Ativo esconderia justamente o que o DP precisa ver na lista.
Continua **derivada** — não existe coluna, índice nem filtro paralelo.

### D-7 · Quem opera

**DP** e **Gerência** criam a admissão direta. **Só o DP** edita o bloco interno e o exame — ele
carrega CTPS, PIS/NIT e o ASO. A Gerência recebe **403**, e há teste provando.

`usuario_admin` herda tudo por role. **Nada é concedido ao cargo `Diretor Geral`**, que segue
`permissoesDoCargo({})`.

### D-8 · Um lugar para cada ato, na tela

- **"+ Novo cadastro"** continua a única entrada de admissão direta, em modal;
- empresa e CNPJ aparecem **só para conferência**, vindos do perfil — sem seletor;
- o detalhe do processo virou **só leitura**. Havia ali um formulário inline **e** uma fileira de
  botões de exame: dois caminhos para o mesmo ato dentro de uma tela de leitura;
- editar dados internos e exame acontece num **único modal**, que avisa a consequência **antes** do
  clique — escolher não apto diz que o processo será pausado;
- a tela de **Testes** deixou de editar o processo: abre em **leitura**, e só. Editar é na página
  "Processos de admissão", que é a dona e já tem **entrada de menu própria**.

> **O detalhe não é mais painel lateral: é modal central de leitura.** Atualizado em 31/08/2026.
>
> Ele era um `v-navigation-drawer` de 460px. Num celular de 390px isso é mais largo que a viewport,
> e o que sobrava sumia atrás do `overflow-x: hidden` global — sem barra, sem sinal, sem alcance. A
> gaveta também não prende o foco do teclado.
>
> O modal segue o desenho que o módulo já tinha (`ProcessoNovoDialog`, `ProcessoInternosDialog`), e
> **sem `persistent`**: os dois seguram formulário com dado não salvo, e leitura não tem o que
> segurar — X, Escape e clique fora fecham, e o foco volta para quem abriu. Nenhum campo, estado,
> permissão ou ação mudou.
>
> A gaveta era montada por **duas** telas, e na de Testes só pela tag, sem `import`: o auto-import
> do Nuxt registra `AdmissoesProcessoDetalhePainel`, não o nome curto, então ela nunca resolvia e o
> processo, visto dali, não aparecia. As duas telas agora importam o mesmo modal — um caminho só.

### D-8.1 · "Ver o teste" só existe onde há para onde ir

O botão de voltar ao teste de origem **não é do processo, é do contexto**. Ele aparecia sempre que
`testeId` existia, nas duas telas — e na de "Processos de admissão" emitia para o vazio: clicar não
fazia nada, e nada explicava por quê. Não há rota de processo para um teste específico, e mandar
para a lista de Testes seria inventar navegação que ninguém pediu.

Quem monta o modal declara se sabe abrir um teste, por prop **obrigatória** (`podeVerTeste`):
**Testes** passa `true` — é de lá que se chega ao processo, e é para lá que se volta; **Processos**
passa `false`, e o botão não renderiza. Obrigatória, e não opcional com default: com default o
defeito voltaria calado no dia em que uma terceira tela montasse o modal.

Não é permissão — `podeCancelar` e `podeEditarInternos` são. É a existência do caminho.

### D-8.2 · O espelho do botão morto: listener sem botão

Corrigido em 31/08/2026, na revisão que a D-8.1 provocou.

A tela de Testes escutava `@editar-internos` e navegava para "Processos de admissão". Só que ela
passa `pode-editar-internos="false"`, então o botão "Editar" **nunca renderizava ali** — o listener
era inalcançável, e a função de navegação, código morto. É o mesmo defeito da D-8.1 pelo avesso:
lá, botão sem destino; aqui, destino sem botão.

Os dois saíram. **Nada foi criado no lugar**: a tela de Testes continua só leitura do processo, e
editar segue na página dona, alcançada pelo menu que já existe. Trocar o listener por um botão de
atalho seria criar o segundo lugar para o mesmo ato — exatamente o que a `AGENTS.md` §4.1 proíbe, e
o que a própria D-8 já tinha decidido.

---

## Banco

Migration **0035**. Altera `turnos` (aditivo), `admissoes_processos`, `_internos` e `_historico`.
Nenhum `INSERT`, `UPDATE`, `DELETE`, `DROP COLUMN` ou carga.

O CHECK entra **estrito**. `NOT VALID` foi recusado por Marco, e a razão de recusar é melhor que a de
usar: ele aceitaria a linha legada na criação, **barraria qualquer UPDATE futuro dela** com erro que
ninguém entenderia, e deixaria dado inválido atrás de uma constraint que se declara satisfeita.

> **A migration falha, de propósito, se encontrar processo direto legado sem identidade.** É o
> comportamento desejado: o legado se resolve **antes**, por preflight que para e reporta — nunca
> afrouxando a regra. Em `padaria_adm001` existe **1** linha assim, criada no teste visual da V1A.
>
> **Não aplicada em banco nenhum.**

O Caixa não é afetado: `colaboradores.turno_padrao_id` e `fechamentos_caixa.turno_id` continuam
`on delete set null`, e nenhuma leitura de `turnos` no sistema usa `select *`.

---

## Fora desta vertical

Convite, link público, formulário do candidato, documentos, anexos, dependentes, upload do ASO,
storage · área, setor, CBO digitado, salário, dados bancários · vínculo com `colaboradores`.

---

## Pendências

- **Texto jurídico do aviso de privacidade** e **política de documentos** — os dois pré-requisitos do
  link do candidato. Agora há um terceiro: **ASO apto**.
- **`admissoes_testes.jornada_horario`** segue texto livre. Alinhar a ADM-001 ao catálogo de turnos é
  vertical própria.
- **Nenhum turno cadastrado** em `padaria_adm001`. Antes de qualquer teste visual, alguém precisa
  cadastrar turnos com etiqueta e dias — é pré-requisito operacional, não da migration.
- **Divergência de precedente:** o `TURNO_EM_USO` responde **409** por decisão. O padrão que já
  existia no sistema para "em uso" é pré-checagem com **400** (`GRUPO_EM_USO`, em Patrimônio). Os dois
  convivem hoje.
- **Fragilidade pré-existente no Caixa**, achada na revisão de impacto e **não corrigida** aqui:
  `fechamentos_caixa.turno_id` é gravado sem validar a empresa do turno, e o join do histórico não
  casa `empresa_id`. A 0035 cria o `unique (id, empresa_id)` que permitiria fechar isso com FK
  composta — e não usa.
