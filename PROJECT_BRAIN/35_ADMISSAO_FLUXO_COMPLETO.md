# 35 — Admissão: o fluxo completo, ponta a ponta (mapa e proposta)

> Aberto em 31/08/2026, branch `feat/admissoes-testes-tnp`, sobre o HEAD `683ab97`. Piloto na **TNP**.
> **Documento de mapeamento e proposta.** Sucede a `31` (ADM-001), a `33` (ADM-002 V0) e a `34`
> (ADM-003 V1A/V1B), e não revoga nenhuma decisão delas.
>
> **Do mapa saiu uma correção, e só ela.** O achado A-1 (seção 12) virou a migration **0036** e a
> mudança em `revelarCpfDoProcesso`, aprovadas por Marco em 31/08/2026. **Nada mais deste documento
> foi implementado**: o SQL da seção 6 segue proposta, e **nenhuma migration foi aplicada em banco
> nenhum** — nem a 0036.

## 0. Como ler

Cada afirmação deste documento está marcada:

| Marca | Significa |
| --- | --- |
| **FATO** | Li no código desta branch. Vem com caminho e, quando útil, linha. |
| **PROPOSTA** | Desenho meu, aguardando aprovação. Não existe no código. |
| **A CONFIRMAR** | Depende de resposta do DP. Não invento a resposta. |
| **BLOQUEIO** | Depende de decisão fora do código (jurídico, política, produção). |

Duas coisas **não** são inventadas aqui, em nenhuma seção: o **texto do aviso de privacidade** e a
**política de documentos/storage/retenção**. Onde elas fazem falta, o documento para e diz que para.

---

## 1. O fluxo em uma linha

> DP registra a pessoa → o exame manda no andamento → **ASO apto** libera o convite → link de **14
> dias** → candidato preenche → DP revisa → vira **colaborador** → Conplus.

Das oito estações, **três existem** hoje e **cinco não existem** — e duas das cinco estão bloqueadas
por decisão que não é técnica.

---

## 2. Estado real hoje

**FATO.** O que está implementado nesta branch:

| Peça | Onde | Situação |
| --- | --- | --- |
| Período de teste (ADM-001) | `db` `admissoes_testes` · `api/src/admissoes/admissoes.service.ts` | completo |
| Processo, origem `teste_efetivado` | `admissoes_processos` · nasce na efetivação, mesma transação | completo |
| Processo, origem `admissao_direta` | `POST /api/admissoes/processos` | completo |
| Bloco interno do DP (CTPS, PIS, observações) | `admissoes_processos_internos` | completo |
| Exame admissional, 6 situações | `PUT /api/admissoes/processos/:id/exame` | completo |
| Pausa/retomada por ASO | consequência do exame, sem rota própria | completo |
| Turno do catálogo + retrato | `turnos.etiqueta`/`dias_semana` · retrato no processo | completo |
| CPF mascarado + revelação auditada | `POST .../:id/cpf` · trilha `cpf_revelado` | completo |
| Trilha append-only | `admissoes_*_historico`, só nomes de campo | completo |
| Lista e detalhe (modal central) | `web-vue/components/admissoes/` | completo |
| **Convite ao candidato** | placeholder desabilitado em `ProcessoDetalheDialog.vue:291` | **não existe** |
| **Formulário do candidato** | — | **não existe** |
| **Documentos e anexos** | — | **não existe** (BLOQUEIO) |
| **Dependentes** | — | **não existe** |
| **Vínculo com `colaboradores`** | não há `colaborador_id` no processo | **não existe** |
| **Conplus** | zero ocorrências no repositório inteiro | **não especificado** |

Estados gravados hoje, e só eles: `iniciado` · `pausado` · `cancelado`.
Situações derivadas: Ativo · Pausado · Inativo (`situacaoDoProcesso`, em `shared`).

> **FATO relevante para qualquer plano:** a migration **0035 não foi aplicada em banco nenhum** — nem
> em `padaria_adm001`, nem em produção (`PROJECT_BRAIN/34`). O código desta branch pressupõe um schema
> que ainda não existe em lugar nenhum.

---

## 3. As oito estações

| # | Estação | Quem age | Gatilho | Efeito no processo | Hoje |
| --- | --- | --- | --- | --- | --- |
| E0 | Pré-cadastro | DP / Gerência | efetivar teste **ou** "+ Novo cadastro" | nasce `iniciado` | **existe** |
| E1 | Exame admissional | DP | registrar situação | `aso_nao_apto` → `pausado`; `aso_apto` → retoma | **existe** |
| E2 | Liberação do convite | sistema | `exame = aso_apto` **e** `status = iniciado` | nenhum (é uma guarda) | **falta** |
| E3 | Convite | DP | gerar link | passa a existir convite ativo | **falta** (BLOQUEIO 1) |
| E4 | Formulário | **candidato** | abrir o link | rascunho → enviado | **falta** |
| E5 | Documentos | candidato | anexar | — | **falta** (BLOQUEIO 2) |
| E6 | Revisão | DP | aprovar ou devolver | devolver reabre o link | **falta** |
| E7 | Efetivação | DP | criar/vincular colaborador | `colaborador_id` preenchido | **falta** (BLOQUEIO 3) |
| E8 | Conplus | ? | ? | ? | **não especificado** (BLOQUEIO 4) |

### O que a E2 significa, e por que é uma estação e não um detalhe

**FATO** (`PROJECT_BRAIN/34`, Pendências): o ASO apto é o **terceiro pré-requisito** do link, ao lado
do aviso de privacidade e da política de documentos.

**PROPOSTA.** A guarda é do **servidor**, não do botão. Gerar convite com processo `pausado`,
`cancelado` ou com exame diferente de `aso_apto` responde **409**, com o motivo. O botão desabilitado
na tela é conveniência; a regra mora na rota — o mesmo desenho do turno incompleto na D-3 da `34`.

### E4/E6 — o vaivém

**PROPOSTA.** Devolver para correção **não** cria um segundo convite: reabre o mesmo, com prazo
recontado ou mantido (**A CONFIRMAR** com o DP — recomendo **recontar**, porque quem devolve espera
resposta a partir de agora). O candidato nunca vê "reprovado": vê o que falta.

---

## 4. A decisão mais cara: estado gravado × etapa derivada

O fluxo completo tem etapas que hoje não têm nome: *aguardando candidato*, *em revisão*, *efetivado*.
A `33` (C-3) **recusou reservá-las** — e recusou pelo motivo certo: nome gravado antes da regra vira
vocabulário que ninguém confirmou. Agora a regra existe, e a escolha volta à mesa. São dois caminhos.

### Caminho A — três status novos (`aguardando_candidato`, `em_revisao_dp`, `efetivado`)

Barato de ler (`where status = ...`), e é o que a maioria dos sistemas faz. O preço: o status passa a
poder **mentir**. Um `aguardando_candidato` sem convite ativo, ou um `efetivado` sem colaborador, são
representáveis — e só aparecem meses depois, num relatório. Cada transição vira código que precisa
lembrar de atualizar duas coisas.

### Caminho B — etapa DERIVADA dos fatos · **recomendado**

`status` continua com os três valores que guardam **decisão humana** (`iniciado`, `pausado`,
`cancelado`). A etapa é calculada em `shared`, a partir do que **aconteceu**:

```
etapaDoProcesso(status, convite, submissao, colaboradorId):
  cancelado                          -> "Cancelado"
  pausado                            -> "Pausado (ASO não apto)"
  colaboradorId != null              -> "Efetivado"
  submissao?.enviadoEm && !revisada  -> "Em revisão do DP"
  convite ativo                      -> "Aguardando candidato"
  exame == aso_apto                  -> "Pronto para convidar"
  senão                              -> "Em pré-cadastro"
```

É a mesma disciplina que o módulo já aplica três vezes — situação Ativo/Inativo (`31` D-2), alerta de
exame (`34` D-5) e alerta de prazo (`31` D-5): **derivar, nunca gravar em paralelo**. Estado incoerente
deixa de ser representável porque não há o que ficar incoerente.

**O preço, dito na cara:** a listagem passa a precisar de um `left join` no convite e um `exists` na
submissão. Hoje ela já faz join com `internos` para trazer `exameSituacao`
(`api/src/admissoes/processos.repository.ts`), então o padrão existe e o índice por
`(empresa_id, status, criado_em, id)` continua servindo. Se um dia a lista pesar, a resposta é índice
— não coluna de etapa.

**Uma coisa precisa ser gravada de qualquer jeito:** o vínculo com o colaborador. Ele é o fato, e
`colaborador_id is not null` já responde "efetivado" sem status novo. Ver **P-4**.

---
## 5. Matriz de campos

Legenda da coluna **Situação**: **EXISTE** (implementado) · **PROPOSTO** (desenho meu) ·
**A CONFIRMAR** (depende do DP) · **BLOQUEADO** (depende de decisão fora do código).

> **Aviso de procedência, para ninguém confundir depois:** a planilha do RH **ainda não foi
> extraída**. A `32` é o *plano* do Cartógrafo, e nada foi executado — não há robô, não há credencial,
> não há corpus. Portanto **nenhuma linha desta matriz vem da planilha real**. As marcadas
> "A CONFIRMAR" nascem de exigência corrente de admissão CLT/folha, e o DP é quem diz se valem aqui.

### 5.1 O que o candidato **não** preenche

**FATO.** Estes já existem e têm dono. O formulário os mostra em **leitura**, para conferência.

| Campo | Onde vive hoje | Quem preenche | Por que não vai para o link |
| --- | --- | --- | --- |
| Nome completo | processo (direta) ou teste (origem teste) | DP | já confirmado; redigitar cria a segunda fonte que o CHECK proíbe |
| CPF | idem | DP | idem, e é a chave do bloqueio de duplicidade |
| Função operacional | `funcao_id` | DP | é decisão da empresa, não do candidato |
| Turno + retrato | `turno_id` + `turno_*` | DP | idem |
| Data de admissão | `internos.data_admissao` | DP | idem |
| CTPS nº/série/UF | `internos.ctps_*` | **só DP** | `34` D-7: bloco interno é exclusivo do DP |
| PIS/PASEP/NIT | `internos.pis_pasep_nit` | **só DP** | idem |
| Exame/ASO | `internos.exame_situacao` | **só DP** | idem |
| Observações RH | `internos.observacoes_rh` | **só DP** | idem |

> **PROPOSTA.** Se o candidato disser que o nome ou o CPF está errado, ele **não corrige** — aponta.
> Um campo "há algo errado nestes dados" grava observação e marca a ficha para revisão. Deixar o
> candidato sobrescrever o CPF derrubaria o índice de duplicidade e o lock de `(empresa, CPF)` da
> `34` D-2, que são a única garantia de que a mesma pessoa não está em dois processos.
>
> **A CONFIRMAR:** o DP quer que a CTPS digital seja informada pelo candidato? Hoje a decisão vigente
> (`34` D-7) é que CTPS é do DP. Se mudar, muda a fronteira do link, não só um campo.

### 5.2 Identificação civil — o candidato preenche

| Campo | Obrigatório | Validação | Situação |
| --- | --- | --- | --- |
| Nome social | não | texto ≤ 200 | PROPOSTO |
| Data de nascimento | sim | data, idade ≥ 16 (menor exige regra própria) | PROPOSTO |
| Sexo/gênero | sim | lista fechada | A CONFIRMAR (valores do DP) |
| Estado civil | sim | lista fechada | A CONFIRMAR |
| Nacionalidade | sim | lista ou texto | A CONFIRMAR |
| Naturalidade (município/UF) | sim | UF `^[A-Z]{2}$` | PROPOSTO |
| Nome da mãe | sim | texto ≤ 200 | PROPOSTO |
| Nome do pai | não | texto ≤ 200 | PROPOSTO |
| Raça/cor | sim | lista fechada | A CONFIRMAR (exigência de folha) |
| Grau de instrução | sim | lista fechada | A CONFIRMAR (exigência de folha) |
| Primeiro emprego | sim | booleano | A CONFIRMAR |

> Toda lista fechada acima vira **CHECK no banco**, e é por isso que os valores precisam vir do DP
> **antes** e não depois: renomear valor já gravado é caro, e a `33` (C-4) já pagou essa lição.

### 5.3 Endereço

| Campo | Obrigatório | Validação | Situação |
| --- | --- | --- | --- |
| CEP | sim | `^[0-9]{8}$` | PROPOSTO |
| Logradouro · Número · Complemento | sim / sim / não | texto | PROPOSTO |
| Bairro · Município · UF | sim | UF `^[A-Z]{2}$` | PROPOSTO |

**PROPOSTA.** Sem consulta automática de CEP na V2: seria dependência externa nova numa rota
**pública**, e rota pública que chama serviço de terceiro é superfície de abuso. Digitação primeiro.

### 5.4 Contato

| Campo | Obrigatório | Validação | Situação |
| --- | --- | --- | --- |
| Telefone (celular) | sim | dígitos, 10–11 | PROPOSTO |
| E-mail | A CONFIRMAR | e-mail | PROPOSTO |
| Contato de emergência (nome, telefone, parentesco) | sim | — | A CONFIRMAR |

### 5.5 Documentos — **números**, não arquivos

| Campo | Obrigatório | Validação | Situação |
| --- | --- | --- | --- |
| RG: número, órgão emissor, UF, data de emissão | sim | UF `^[A-Z]{2}$` | PROPOSTO |
| Título de eleitor: número, zona, seção | A CONFIRMAR | dígitos | A CONFIRMAR |
| Certificado de reservista | só homens 18–45 | texto | A CONFIRMAR |
| CNH: número, categoria, validade | não | — | A CONFIRMAR (relevante para entregador/motorista) |

> **Os arquivos** (foto do RG, comprovante de residência, certidões) são a **estação E5** e estão
> inteiros no **BLOQUEIO 2**. Nada de upload entra na mesma fatia dos números.

### 5.6 Dependentes — lista, tabela própria

| Campo | Obrigatório | Validação | Situação |
| --- | --- | --- | --- |
| Nome completo | sim | texto ≤ 200 | PROPOSTO |
| Data de nascimento | sim | data | PROPOSTO |
| Parentesco | sim | lista fechada | A CONFIRMAR |
| CPF do dependente | A CONFIRMAR | mesmo validador de `shared/src/admissoes/cpf.ts` | PROPOSTO |
| Finalidade (salário-família · IRRF · plano) | sim | lista fechada, múltipla | A CONFIRMAR |

**PROPOSTA.** Zero dependentes é resposta válida e precisa ser **explícita** ("não tenho
dependentes") — sem isso, lista vazia e formulário não respondido ficam indistinguíveis, e o DP não
sabe se pode revisar.

### 5.7 Dados bancários

A `34` os deixou de fora com um argumento específico: *dado sensível sem finalidade antes de haver
candidato*. Na E4 a finalidade passa a existir (pagar salário). **PROPOSTA**, com a ressalva abaixo.

| Campo | Obrigatório | Situação |
| --- | --- | --- |
| Banco · agência · conta · dígito · tipo | A CONFIRMAR | A CONFIRMAR |
| Chave PIX | não | A CONFIRMAR |
| Recebe vale-transporte? · itinerário | A CONFIRMAR | A CONFIRMAR |

> **A CONFIRMAR, e é pergunta de negócio, não de código:** a conta é aberta **pela empresa** depois da
> admissão? Se for, pedir conta ao candidato é pedir o que ele ainda não tem, e o campo vive vazio —
> pior do que não existir.

### 5.8 Consentimento e aviso de privacidade

| Campo | Situação |
| --- | --- |
| Versão do aviso aceita | PROPOSTO — a **estrutura**; o texto é BLOQUEIO 1 |
| Data/hora do aceite | PROPOSTO |
| IP e user-agent do aceite | **não recomendo** — é dado pessoal novo, coletado para provar coleta de dado pessoal. Só se o jurídico exigir por escrito |

**PROPOSTA.** A versão é **gravada por extenso** na ficha (ex.: `2026-09-v1`), nunca por FK para uma
tabela editável: o que precisa sobreviver é *o que a pessoa leu*, e um texto que pode ser corrigido no
lugar apaga exatamente isso.

### 5.9 O que fica **fora** do formulário, de propósito

Área · setor · CBO digitado · salário — mesma razão da `34`: dependem de `unique (id, empresa_id)` em
`areas`/`setores`, que **não existe**, e sem ele não há FK composta. Salário não é dado do candidato.

---
## 6. Proposta de schema — SQL para aprovação

> **Nada abaixo foi gerado como migration, nada foi aplicado e nada foi rodado.** É SQL para leitura
> e aprovação. Quando aprovado, o caminho é o de sempre: alterar o schema Drizzle, gerar a migration,
> conferir o SQL gerado linha a linha e só então decidir onde aplicar.
>
> Tudo é **aditivo**, com **uma** exceção declarada: o **P-4** acrescenta um `unique` em
> `colaboradores`. Está isolado de propósito, na última fatia.

### P-1 · `admissoes_convites` — o link do candidato

```sql
create table "admissoes_convites" (
  "id"                 uuid primary key default uuid_generate_v7(),
  "empresa_id"         uuid not null references "empresas"("id") on delete cascade,
  "processo_id"        uuid not null,
  -- NUNCA o token. Só o SHA-256 dele, como em `caixa_autorizacoes.token_hash`. Quem tem o banco
  -- não consegue abrir o link de ninguém.
  "token_hash"         text not null,
  -- GRAVADO, não derivado de `criado_em + 14 dias`: se a política mudar para 7 ou 21 dias, o link
  -- já emitido tem de manter o prazo que foi prometido a uma pessoa.
  "expira_em"          timestamptz not null,
  "criado_por"         text not null references "perfis_usuarios"("usuario_id"),
  "criado_em"          timestamptz not null default now(),
  "primeiro_acesso_em" timestamptz,
  "ultimo_acesso_em"   timestamptz,
  "revogado_em"        timestamptz,
  "revogado_por"       text references "perfis_usuarios"("usuario_id"),
  constraint "admissoes_convites_processo_empresa_fk"
    foreign key ("processo_id", "empresa_id")
    references "admissoes_processos"("id", "empresa_id") on delete cascade,
  constraint "admissoes_convites_token_hash_check"
    check ("token_hash" ~ '^[a-f0-9]{64}$'),
  constraint "admissoes_convites_prazo_check"
    check ("expira_em" > "criado_em"),
  constraint "admissoes_convites_revogacao_check"
    check (("revogado_em" is null) = ("revogado_por" is null)),
  constraint "admissoes_convites_acesso_check"
    check (
      ("primeiro_acesso_em" is null and "ultimo_acesso_em" is null)
      or ("primeiro_acesso_em" is not null and "ultimo_acesso_em" >= "primeiro_acesso_em")
    )
);

create unique index "admissoes_convites_token_unico"
  on "admissoes_convites" ("token_hash");

-- UM convite não revogado por processo. `now()` não entra em índice (não é imutável), então a
-- validade é checada na leitura; o índice garante que reemitir exige revogar o anterior — na mesma
-- transação, o que impede dois links vivos para a mesma pessoa.
create unique index "admissoes_convites_processo_ativo_unico"
  on "admissoes_convites" ("processo_id")
  where "revogado_em" is null;

create index "admissoes_convites_empresa_processo_idx"
  on "admissoes_convites" ("empresa_id", "processo_id", "criado_em");
```

**Sem `atualizado_em` e sem trigger:** o convite não é editado. Ele é criado, acessado, revogado ou
expira — e cada uma dessas é uma coluna própria.

**O token aparece uma vez.** É gerado, mostrado ao DP para copiar e **não é recuperável** — precedente
literal do `caixa_autorizacoes`. Perdeu, reemite (o que revoga o anterior).

**A CONFIRMAR:** como o link chega ao candidato — WhatsApp copiado pelo DP (é o que suponho) ou e-mail
enviado pelo sistema. Se for e-mail, é preciso um e-mail do candidato que hoje ninguém tem.

### P-2 · `admissoes_processos_ficha` — o que o candidato responde

Uma por processo, como `admissoes_processos_internos`, e com a mesma disciplina: **nasce vazia**,
preenchida ao longo do tempo, com versão própria para concorrência otimista.

```sql
create table "admissoes_processos_ficha" (
  "id"          uuid primary key default uuid_generate_v7(),
  "empresa_id"  uuid not null references "empresas"("id") on delete cascade,
  "processo_id" uuid not null,

  -- Ciclo da FICHA. NÃO é status do processo: o processo continua com `iniciado/pausado/cancelado`,
  -- e a etapa do fluxo é derivada (seção 4). Este ciclo é do documento, e existe porque uma
  -- devolução precisa ser distinguível de um rascunho — e comparar timestamps para isso é frágil.
  "situacao"    text not null default 'rascunho',

  "nome_social"            text,
  "data_nascimento"        date,
  "sexo"                   text,   -- lista fechada A CONFIRMAR com o DP
  "estado_civil"           text,   -- lista fechada A CONFIRMAR
  "nacionalidade"          text,
  "naturalidade_municipio" text,
  "naturalidade_uf"        text,
  "nome_mae"               text,
  "nome_pai"               text,
  "raca_cor"               text,   -- lista fechada A CONFIRMAR
  "grau_instrucao"         text,   -- lista fechada A CONFIRMAR
  "primeiro_emprego"       boolean,

  "cep"         text,
  "logradouro"  text,
  "numero"      text,
  "complemento" text,
  "bairro"      text,
  "municipio"   text,
  "uf"          text,

  "telefone"              text,
  "email"                 text,
  "emergencia_nome"       text,
  "emergencia_telefone"   text,
  "emergencia_parentesco" text,

  "rg_numero"     text,
  "rg_orgao"      text,
  "rg_uf"         text,
  "rg_emitido_em" date,

  -- Declaração EXPLÍCITA. Sem ela, "não tenho dependentes" e "ainda não respondi" são a mesma
  -- linha vazia, e o DP não sabe se pode revisar.
  "sem_dependentes" boolean,

  -- Aviso de privacidade: a VERSÃO por extenso, nunca FK para texto editável. O que precisa
  -- sobreviver é o que a pessoa leu, e um texto corrigido no lugar apaga exatamente isso.
  "aviso_privacidade_versao" text,
  "aviso_aceito_em"          timestamptz,

  "enviado_em"         timestamptz,
  "revisado_em"        timestamptz,
  "revisado_por"       text references "perfis_usuarios"("usuario_id"),
  "revisao_pendencias" text,

  "versao"        integer not null default 1,
  "criado_em"     timestamptz not null default now(),
  "atualizado_em" timestamptz not null default now(),

  constraint "admissoes_processos_ficha_processo_empresa_fk"
    foreign key ("processo_id", "empresa_id")
    references "admissoes_processos"("id", "empresa_id") on delete cascade,
  constraint "admissoes_processos_ficha_processo_unico" unique ("processo_id"),
  constraint "admissoes_processos_ficha_versao_check" check ("versao" > 0),
  constraint "admissoes_processos_ficha_situacao_check"
    check ("situacao" in ('rascunho', 'enviada', 'devolvida', 'aprovada')),
  constraint "admissoes_processos_ficha_uf_check"
    check ("uf" is null or "uf" ~ '^[A-Z]{2}$'),
  constraint "admissoes_processos_ficha_rg_uf_check"
    check ("rg_uf" is null or "rg_uf" ~ '^[A-Z]{2}$'),
  constraint "admissoes_processos_ficha_naturalidade_uf_check"
    check ("naturalidade_uf" is null or "naturalidade_uf" ~ '^[A-Z]{2}$'),
  constraint "admissoes_processos_ficha_cep_check"
    check ("cep" is null or "cep" ~ '^[0-9]{8}$'),
  constraint "admissoes_processos_ficha_telefone_check"
    check ("telefone" is null or "telefone" ~ '^[0-9]{10,11}$'),
  constraint "admissoes_processos_ficha_aviso_check"
    check (("aviso_privacidade_versao" is null) = ("aviso_aceito_em" is null)),
  -- Um CHECK único para o ciclo, como o da `31`: ficha em estado pela metade deixa de ser
  -- representável. Devolver sem dizer o que falta é o defeito mais provável, e fica impedido aqui.
  constraint "admissoes_processos_ficha_coerencia_check"
    check (
      ("situacao" = 'rascunho'
        and "enviado_em" is null and "revisado_em" is null and "revisado_por" is null)
      or ("situacao" = 'enviada'
        and "enviado_em" is not null and "revisado_em" is null and "revisado_por" is null)
      or ("situacao" = 'devolvida'
        and "enviado_em" is not null and "revisado_em" is not null and "revisado_por" is not null
        and length(btrim(coalesce("revisao_pendencias", ''))) > 0)
      or ("situacao" = 'aprovada'
        and "enviado_em" is not null and "revisado_em" is not null and "revisado_por" is not null
        and "aviso_privacidade_versao" is not null)
    )
);

create index "admissoes_processos_ficha_empresa_situacao_idx"
  on "admissoes_processos_ficha" ("empresa_id", "situacao");

create trigger "admissoes_processos_ficha_set_atualizado_em"
  before update on "admissoes_processos_ficha"
  for each row execute function set_atualizado_em();
```

> A trigger vai **escrita à mão**, como a da `0033`: a `0002` instala percorrendo um array literal
> que não conhece tabelas novas, e editar a `0002` criaria divergência produção × dev.

**Enviar exige o aceite do aviso.** `aprovada` já o exige por CHECK; a exigência no envio mora no
serviço, porque um CHECK em `enviada` travaria uma devolução legítima cujo aceite foi anterior.

### P-3 · `admissoes_processos_dependentes`

```sql
create table "admissoes_processos_dependentes" (
  "id"              uuid primary key default uuid_generate_v7(),
  "empresa_id"      uuid not null references "empresas"("id") on delete cascade,
  "processo_id"     uuid not null,
  "nome_completo"   text not null,
  "data_nascimento" date not null,
  "parentesco"      text not null,                 -- lista fechada A CONFIRMAR
  "cpf"             text,
  "finalidades"     text[] not null default '{}',  -- lista fechada A CONFIRMAR
  "criado_em"       timestamptz not null default now(),
  "atualizado_em"   timestamptz not null default now(),
  constraint "admissoes_processos_dependentes_processo_empresa_fk"
    foreign key ("processo_id", "empresa_id")
    references "admissoes_processos"("id", "empresa_id") on delete cascade,
  constraint "admissoes_processos_dependentes_nome_check"
    check (length(btrim("nome_completo")) > 0),
  constraint "admissoes_processos_dependentes_cpf_check"
    check ("cpf" is null or "cpf" ~ '^[0-9]{11}$')
);

-- O mesmo dependente não entra duas vezes. Parcial porque o CPF é opcional (recém-nascido).
create unique index "admissoes_processos_dependentes_cpf_unico"
  on "admissoes_processos_dependentes" ("processo_id", "cpf")
  where "cpf" is not null;

create index "admissoes_processos_dependentes_processo_idx"
  on "admissoes_processos_dependentes" ("empresa_id", "processo_id");

create trigger "admissoes_processos_dependentes_set_atualizado_em"
  before update on "admissoes_processos_dependentes"
  for each row execute function set_atualizado_em();
```

> **Data de nascimento futura fica no Zod, não em CHECK.** `current_date` é função *estável*, não
> imutável: um CHECK com ela é avaliado só na escrita e daria a impressão de uma garantia que o banco
> não mantém. Melhor não prometer.

### P-4 · O vínculo com `colaboradores` — **a única alteração em tabela existente**

```sql
-- Alvo da FK COMPOSTA. `id` já é PK, então este unique não pode falhar por dado existente: ele é
-- puramente o alvo que permite ao banco recusar colaborador de outra empresa por conta própria.
alter table "colaboradores"
  add constraint "colaboradores_id_empresa_unica" unique ("id", "empresa_id");

alter table "admissoes_processos" add column "colaborador_id" uuid;

alter table "admissoes_processos"
  add constraint "admissoes_processos_colaborador_empresa_fk"
  foreign key ("colaborador_id", "empresa_id")
  references "colaboradores"("id", "empresa_id") on delete restrict;

-- Um colaborador nasce de UM processo. Sem isto, dois processos poderiam apontar para a mesma
-- pessoa e a pergunta "de onde veio este colaborador" passaria a ter duas respostas.
create unique index "admissoes_processos_colaborador_unico"
  on "admissoes_processos" ("colaborador_id")
  where "colaborador_id" is not null;

-- Quem já virou colaborador não se cancela. `cancelado` continua terminal; efetivado também.
alter table "admissoes_processos"
  add constraint "admissoes_processos_efetivacao_check"
  check ("colaborador_id" is null or "status" <> 'cancelado');
```

**`colaborador_id is not null` é o fato "efetivado".** Não há status novo, não há coluna de etapa e
não há como o processo dizer que efetivou sem ter para quem apontar.

> **BLOQUEIO 3, e ele é anterior a este SQL:** `colaboradores.cpf` é `text`, **anulável, sem UNIQUE e
> sem CHECK de formato** ([app.schema.ts:335](db/src/schema/app.schema.ts#L335)). Efetivar sem
> resolver isso cria o segundo cadastro da mesma pessoa no primeiro mês. Resolver exige **ler
> produção** — quantos nulos, quantos duplicados, quantos fora do formato — e essa leitura **não foi
> feita**: ela precisa de autorização própria, e não é objeto deste documento.

### P-5 · Documentos e anexos — **BLOQUEADO, esboço apenas**

Não proponho DDL aprovável aqui. Antes de existir tabela, seis coisas precisam de resposta escrita, e
nenhuma delas é técnica: **tipos aceitos**, **tamanho máximo**, **quem pode baixar**, **retenção**,
**descarte** e **antimalware** — que, como a `31` já registrava, **não existe no sistema hoje**.

O que existe e serve de base quando destravar: `@fastify/multipart` limitado a 10 MB e 1 arquivo
([app.ts:153](api/src/app.ts#L153)) e o padrão de `vendas_comprovantes` — `nome_original`,
`nome_arquivo`, `caminho`, `mime_type`, `tamanho_bytes` no banco, arquivo em `storage/<domínio>/<id>/`.

**Duas diferenças serão obrigatórias em relação a esse padrão.** `vendas_comprovantes` confia no MIME
**declarado pelo cliente** ([comprovantes.service.ts:56](api/src/vendas/comprovantes.service.ts#L56)),
o que é aceitável para um funcionário logado e não é para alguém de fora; e documento de admissão não
pode ser servido por caminho previsível, porque ali estão RG e comprovante de residência de um
terceiro que não é usuário do sistema.

---
## 7. Rotas e contratos propostos

### 7.1 As rotas do DP (autenticadas, como todas as de hoje)

| Rota | Permissão | Resposta | Guarda |
| --- | --- | --- | --- |
| `POST /api/admissoes/processos/:id/convite` | `admissoes_processos_convidar` | **201** `{ link, expiraEm }` | exige `exame = aso_apto` e `status = iniciado` |
| `POST /api/admissoes/processos/:id/convite/revogar` | `admissoes_processos_convidar` | 204 | — |
| `GET /api/admissoes/processos/:id/ficha` | `admissoes_processos_visualizar` | 200 | CPF **mascarado**, como no resto do módulo |
| `POST /api/admissoes/processos/:id/ficha/aprovar` | `admissoes_processos_revisar` | 204 | só de `enviada` |
| `POST /api/admissoes/processos/:id/ficha/devolver` | `admissoes_processos_revisar` | 204 | pendências **obrigatórias** |
| `POST /api/admissoes/processos/:id/efetivar` | `admissoes_processos_efetivar` | **201** `{ colaboradorId }` | só de `ficha = aprovada` |

O `POST .../convite` é a **única** rota que devolve o link, e devolve **uma vez** — reler o processo
nunca traz o token. É o mesmo desenho do `{ processoId }` devolvido pelo encerramento do teste
(`33` C-1): a única escrita que tem o que devolver.

**PROPOSTA de permissões**, no mesmo mecanismo do catálogo, em `extras` e nunca em `ativas` (`ativas`
mapeia chave de **menu**, e nenhuma destas é menu):

| Permissão | DP | Gerência | Por quê |
| --- | --- | --- | --- |
| `admissoes_processos_convidar` | ✔ | **A CONFIRMAR** | quem segura o ASO decide quando convidar |
| `admissoes_processos_revisar` | ✔ | ✘ | mesma fronteira do bloco interno (`34` D-7) |
| `admissoes_processos_efetivar` | ✔ | **A CONFIRMAR** | é o ato que cria cadastro operacional |

`usuario_admin` herda tudo por `permissoesAcessoTotal` — não há o que conceder.

### 7.2 As rotas do candidato — **públicas**, e é aqui que mora o risco

Duas allowlists precisam ser tocadas, as duas *default-deny*:
`rotasComAutenticacaoPropria` ([api/src/app.ts:57](api/src/app.ts#L57)) e `ROTAS_PUBLICAS`
([web-vue/utils/rotas-publicas.ts](web-vue/utils/rotas-publicas.ts)). Rota nova nasce protegida nos
dois lados — abrir é ato deliberado, e deve ser revisado como tal.

| Rota | O que devolve/faz |
| --- | --- |
| `GET /api/admissoes/convite` | nome, empresa, **CPF mascarado**, o que falta preencher, versão do aviso |
| `PUT /api/admissoes/convite/ficha` | salva rascunho (idempotente, com `versao`) |
| `POST /api/admissoes/convite/dependentes` · `PUT`/`DELETE .../:id` | lista de dependentes |
| `POST /api/admissoes/convite/enviar` | fecha a ficha: `rascunho`/`devolvida` → `enviada` |

**PROPOSTA — o token não vai no caminho da rota, e não vai na query.** Ele viaja em header
(`x-admissao-convite`). A razão está escrita no próprio repositório: o `api/src/auth/email.ts:9-12`
registra que a URL do reset **carrega o token no caminho**, e que por isso guardar ou logar a URL
equivale a guardar ou logar o token. Repetir esse desenho num link que vive **14 dias** (o do reset
vive minutos) coloca segredo de longa duração no log de acesso do Nginx, no log do Fastify e no
`Referer` de qualquer recurso externo que a página venha a carregar.

**PROPOSTA — o link entregue ao candidato leva o token no fragmento:**
`https://…/admissao#t=<token>`. O fragmento **não é enviado ao servidor** por nenhum cliente HTTP; a
página lê `location.hash`, guarda em memória e manda no header. Como o `web-vue` é SPA (`ssr:false`),
não se perde nada que já não dependa de JavaScript.
**Alternativa:** `?token=` no estilo do `/reset-password`. Funciona e é o precedente da casa — mas
aceita o token no log. Se for a escolha, que seja escolha registrada, não herança automática.

**PROPOSTA — respostas que não viram oráculo:** token desconhecido → **404** genérico; token válido
porém expirado ou revogado → **410**, com texto que manda procurar o DP. Distinguir os dois não vaza
nada (quem pergunta já tem o token na mão) e evita o candidato ficar sem saber por que o link morreu.

**PROPOSTA — limite próprio.** O `rate-limit` global é 300 req/min ([api/src/app.ts:150](api/src/app.ts#L150))
e foi calibrado para operador logado. Rota pública precisa de teto próprio por IP, bem mais baixo, e
de um limite por token — o link é de uma pessoa, não de uma população.

### 7.3 Trilha — decisão tomada em 31/08/2026

As ações novas (`convite_gerado`, `convite_revogado`, `ficha_enviada`, `ficha_devolvida`,
`ficha_aprovada`, `efetivado`) ampliam o CHECK de `admissoes_processos_historico_acao_check`. Aditivo,
barato.

**O que não era barato já foi resolvido.** `admissoes_processos_historico_evento_unico` nasceu único em
`(processo_id, versao)` **sem cláusula parcial** ([0033](db/migrations/0033_blue_trauma.sql#L48)),
diferente do histórico do teste. Isso obrigava **toda** ação a consumir uma versão — e consumir versão
é UPDATE na linha raiz.

> **Decisão de Marco, 31/08/2026: o índice vira parcial** (migration **0036**), excluindo apenas
> `cpf_revelado`, sem tabela separada e sem tocar na 0033. É a mesma resposta que a ADM-001 deu na
> 0032 — o processo convergiu para o teste, e não o contrário.
>
> As alternativas foram descartadas com o motivo escrito: manter o status quo deixaria a autoria
> contaminada de pé; uma tabela separada de acessos reabriria a decisão da ADM-001 registrada em
> [shared/src/admissoes/index.ts:70-71](shared/src/admissoes/index.ts#L70-L71) — *"`cpf_revelado` esta
> aqui, e nao numa tabela separada, porque revelar CPF e um ato sobre ESTE teste e o DP precisa ler
> tudo numa linha do tempo so."*

**O que isso libera para a V3:** ação do candidato não precisa consumir versão do processo — ele não
está editando o processo. Quando `ficha_enviada` e as demais chegarem, a mesma pergunta já está
respondida, e a regra é a que vale para `cpf_revelado`.

> **Achado de gate, aberto:** [migracoes.test.ts:188-192](tests/integration/migracoes/migracoes.test.ts#L188-L192)
> compara `indexname` entre `migrate` e `push`, **não `indexdef`**. Um índice parcial num caminho e
> total no outro passaria despercebido, porque o nome é o mesmo. A 0036 fecha esse buraco só para o
> índice que ela toca; ampliar a comparação para todos é vertical própria — e pode revelar drift
> preexistente em outros índices, que é justamente por que não entrou de carona aqui.

---

## 8. Segurança e LGPD — o resumo do que este fluxo cria de novo

O módulo hoje é fechado: só gente logada, empresa derivada do perfil, CPF fora de toda query string,
revelação auditada. **A E3 muda a natureza disso** — pela primeira vez o sistema aceita escrita de
alguém que não tem conta, e passa a guardar dado de pessoa que ainda não é funcionária.

| Ponto | Decisão proposta |
| --- | --- |
| Prazo do link | 14 dias, **gravado** na linha, não calculado na leitura |
| Segredo | só SHA-256 no banco; token exibido uma vez |
| Link vivo por processo | no máximo **um**, garantido por índice parcial |
| Escopo do token | um processo, uma empresa. Nunca lista, nunca busca, nunca outro processo |
| CPF no lado público | **mascarado sempre**. Não há revelação fora da sessão autenticada |
| Retenção da ficha de quem **não** foi admitido | **A CONFIRMAR** — hoje não existe regra de descarte no sistema |
| Aviso de privacidade | versão gravada por extenso na ficha; texto é **BLOQUEIO 1** |
| Base legal do tratamento | **A CONFIRMAR** com o jurídico. Não é o consentimento que resolve tudo |

> **A pergunta que ninguém fez ainda e que vai voltar:** o que acontece com a ficha completa — RG,
> endereço, dependentes — de um candidato **cujo processo foi cancelado**? Guardar para sempre é a
> resposta que o sistema dá por omissão hoje, e é a pior delas. Isso é política, não código.

---

## 9. Os quatro bloqueios

| # | Bloqueio | Trava | Quem destrava |
| --- | --- | --- | --- |
| 1 | **Texto do aviso de privacidade**, aprovado e versionado | E3, E4 — o link não pode ir ao ar | jurídico + Marco |
| 2 | **Política de documentos**: tipos, tamanho, quem baixa, retenção, descarte, **antimalware** | E5 inteira | Marco + DP |
| 3 | **Unicidade de CPF em `colaboradores`** (hoje sem UNIQUE, sem CHECK, anulável) — exige leitura de produção | E7 | Marco (autorizar a leitura) |
| 4 | **Especificação do Conplus** | E8 | DP / quem opera o Conplus |

**O que NÃO está bloqueado:** a estrutura de dados da ficha, dos dependentes e do convite. Elas podem
ser construídas e testadas com o aviso vazio — o que **não** pode é emitir link para uma pessoa real
antes do BLOQUEIO 1 cair. Construir a estrutura não é inventar o texto.

---

## 10. Ordem de execução sugerida

| Fatia | Conteúdo | Depende de |
| --- | --- | --- |
| **V2** | Convite: tabela, geração, revogação, guarda de ASO apto, tela do DP | BLOQUEIO 1 para **publicar** |
| **V3** | Ficha do candidato + **revisão do DP**, juntas | V2 |
| **V4** | Dependentes | V3 |
| **V5** | Documentos e anexos | BLOQUEIO 2 |
| **V6** | Efetivação → `colaboradores` | BLOQUEIO 3 |
| **V7** | Conplus | BLOQUEIO 4 |

**V3 e a revisão vão na mesma fatia, e não em duas.** Formulário que o candidato preenche e ninguém
lê é meia entrega — a `AGENTS.md` §4.3 chama isso pelo nome. Se não couber, o corte é por **bloco de
campos** (identificação primeiro, endereço depois), nunca por metade do caminho.

---

## 11. Conplus — o que não dá para desenhar ainda

**FATO:** `conplus` tem **zero** ocorrências no repositório inteiro — código, testes, docs e
`PROJECT_BRAIN` — fora deste documento. Não há integração, não há contrato, não há sequer menção.

Não desenho tabela, rota nem campo para ele. Seis perguntas precisam de resposta antes de qualquer
linha:

1. O que o Conplus é: folha de pagamento, contabilidade, ponto, ou o caminho até o eSocial?
2. A integração é **API**, arquivo (qual layout?), planilha ou digitação manual?
3. A direção é só **envio**, ou o Conplus devolve algo (matrícula, número de registro)?
4. **Quais campos exatos** ele exige — é essa lista que decide metade das linhas "A CONFIRMAR" da
   seção 5, e sem ela a matriz é chute educado.
5. O envio acontece na efetivação, ou é lote periódico do DP?
6. Quem opera: o sistema envia, ou o DP exporta e cola?

Sem a **4**, especificamente, a seção 5 não fecha: pode faltar campo obrigatório e pode sobrar campo
que ninguém usa — e campo que ninguém usa também custa, porque é dado pessoal guardado sem finalidade.

---

## 12. Achados da leitura

Dois foram **corrigidos** em 31/08/2026 (A-1 e A-2, abaixo). Dois seguem **abertos** (A-3 e A-4).

### A-1 · Uma leitura auditada escrevia na linha do processo — **RESOLVIDO**

> **Duas correções, na ordem em que aconteceram.**
>
> **A primeira foi minha, no texto.** A redação original dizia que a tela não recarrega o processo e
> que revelar → cancelar dava 409 numa sessão só. **Estava errado:** a tela recarrega desde o commit
> `d6d677c`, com comentário dizendo exatamente por quê.
>
> **A segunda foi no código**, depois de Marco recusar o defeito como estava descrito: o 409 dependia
> de concorrência que ninguém observou, e por isso **não sustentava sozinho** o P0. O que sustentava
> era outra coisa, verificável com um usuário e um clique — e é ela que foi corrigida.

**O defeito.** `revelarCpfDoProcesso` chamava `avancarVersaoProcessoRepository`, que faz
`set({ versao: versaoAtual + 1, atualizadoPor: ator })`
([processos.repository.ts:328](api/src/admissoes/processos.repository.ts#L328)), e o UPDATE disparava a
trigger `admissoes_processos_set_atualizado_em` da `0033`. **Revelar um CPF era a única leitura do
módulo que escrevia na tabela raiz** — `versao`, `atualizado_por` e `atualizado_em`.

O sintoma direto: o rodapé do detalhe mostrava como **"Alterado por … · data"** quem apenas *leu* o
documento. A trilha registrava `cpf_revelado` corretamente; o cabeçalho, não. E não existia variante
que resolvesse só a autoria — a trigger é `BEFORE UPDATE` em qualquer coluna, então enquanto houvesse
UPDATE, `atualizado_em` mudaria.

O sintoma derivado, que existia mas não foi observado: em concorrência real (duas abas, dois DPs, ou a
tela de Testes — que cancela o processo e nem oferece o botão de revelar), a versão mudava sem
alteração de negócio e o cancelamento seguinte levava 409.

**A correção.** Migration **0036** torna o índice do histórico parcial, e o serviço grava o evento com
a versão vigente lida sob o lock, sem tocar na linha. O lock ficou — não para escrever, mas para a
versão ser estável na transação e para manter a ordem de aquisição das demais escritas.

O bloco interno nunca foi afetado: ele tem versão própria (`admissoes_processos_internos.versao`), que
a revelação não tocava. Por isso o 409 de "salvar internos/exame" nunca veio daqui.

### A-2 · As duas trilhas divergiam no mesmo ato — **RESOLVIDO**

**Era o seguinte.** No teste, `cpf_revelado` não incrementa versão e o índice do histórico é parcial
desde a 0032. No processo, a mesma ação incrementava a versão, e o índice era simples. Duas respostas
para a mesma pergunta dentro do mesmo módulo — o que a `AGENTS.md` §4.1 proíbe — e era a segunda que
produzia o A-1.

**Resolvido pela 0036**, com o processo convergindo para o teste. As duas trilhas agora respondem
igual, e a decisão está registrada na seção 7.3.

### A-3 · Comentário desatualizado em `shared`

**FATO.** [processos.ts:225](shared/src/admissoes/processos.ts#L225) ainda diz que `nomeCompleto` "é
NULO no processo direto até o candidato responder". Desde a V1B o nome é **obrigatório** na admissão
direta (CHECK `admissoes_processos_origem_coerencia_check`), e o repositório resolve as duas origens
por `coalesce` ([processos.repository.ts:438](api/src/admissoes/processos.repository.ts#L438)) — o
campo, na prática, nunca vem nulo. Cosmético, mas é comentário que descreve uma regra que não existe
mais, e é exatamente o tipo de coisa que a próxima pessoa lê como verdade.

### A-4 · A base ainda não existe em lugar nenhum

**FATO** (`PROJECT_BRAIN/34`): a migration **0035 não foi aplicada em banco nenhum**, e `padaria_adm001`
tem **1 linha legada** que a fará falhar de propósito. Qualquer plano que comece pela V2 precisa
resolver isso antes — e é uma decisão de Marco, não uma etapa técnica.

---

## 13. O que este documento **não** fez

- Não aplicou migration em banco nenhum — **inclusive a 0036**, que existe em arquivo e nunca rodou.
- Não gerou nenhuma outra migration: o SQL da seção 6 (convite, ficha, dependentes, vínculo) segue proposta.
- Não leu o banco de produção — a checagem de CPF duplicado em `colaboradores` (BLOQUEIO 3) continua **não feita**.
- Não escreveu, sugeriu ou parafraseou o texto do aviso de privacidade.
- Não definiu a política de documentos, retenção ou descarte.
- Não inventou nada sobre o Conplus: listou as seis perguntas e parou.
- Não tocou em `web-vue/components/admissoes/TesteFormDialog.vue`, em `PROJECT_BRAIN/32_ROBO_CARTOGRAFO_PLANILHAS.md` nem em `PROJECT_BRAIN/panilhas/`.
- Não corrigiu os achados **A-3** e **A-4** da seção 12: eles seguem abertos. A-1 e A-2 foram corrigidos, e é a única mudança de código que saiu daqui.
- Não ampliou a comparação `migrate` × `push` para todos os índices (achado de gate na seção 7.3): a 0036 fecha só o índice que ela toca.
