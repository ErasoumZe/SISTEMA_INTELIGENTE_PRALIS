# Plano — admissão do Pralís gerando TXT/CSV aceitos pelo Questor

Data: 22/10/2026 · Status: **PROPOSTA, aguardando autorização** · Nada foi implementado, migrado,
commitado ou publicado. Base: [AUDITORIA_COMPATIBILIDADE_OFICIAL.md](AUDITORIA_COMPATIBILIDADE_OFICIAL.md).

## 0. O que mudou em relação à auditoria (fatos novos lidos no código)

1. **Colunas já existem e não são usadas.** `admissoes_processos_ficha` tem `grau_instrucao`,
   `rg_*` (4), `titulo_*` (3) e `banco/agencia/conta/conta_digito/conta_tipo` desde a migration 0048,
   mas `shared/src/admissoes/ficha.ts` e o formulário `web-vue/pages/admissao.vue` não as leem nem
   gravam. Grau de instrução **não precisa de migration**, só de formulário e contrato.
2. **O formulário já tem listas fechadas** para sexo, raça/cor, estado civil e nacionalidade
   (`OPCOES_ENUM` em `admissao.vue`), mas grava o **rótulo** em texto, sem CHECK no banco.
3. **O formulário já consulta o ViaCEP** e descarta o campo `ibge` da resposta. Esse é o código do
   município de 7 dígitos (IBGE), candidato natural a `CODIGOMUNIC`. **Ainda não está confirmado**
   que o Questor usa o código IBGE (pergunta Q5).
4. `funcoes_operacionais` e `turnos` são **por empresa**. Portanto o de-para para cargo e escala do
   Questor cabe neles, sem criar um cadastro paralelo.
5. O "período de teste" do Pralís (`admissoes_testes`, brain 42) **não é** o contrato de
   experiência do Questor (`DIACONTREXP`). Não derivar um do outro.
6. `colaboradores_cargos.remuneracao_minuto` é uma remuneração por minuto de outro módulo. **Não é**
   o salário contratual (`VALORSAL`). Não derivar: é fórmula de dinheiro (AGENTS 4.6).

## 1. Os 85 campos requeridos, por situação e responsável

Legenda:

- **EX**: já existe no Pralís; só formata.
- **CV**: existe como rótulo; converte por tabela fixa da doc.
- **DV**: derivado sem nova pergunta.
- **CF**: configuração por empresa, preenchida uma vez.
- **DP**: o DP preenche na admissão.
- **CA**: pergunta nova ao candidato.

| Situação             | A (15) | B (56) | C (1) | D (13) | Total  |
| -------------------- | ------ | ------ | ----- | ------ | ------ |
| EX — já existe       | 4      | 10     | 0     | 2      | **16** |
| CV — rótulo → código | 0      | 4      | 0     | 1      | **5**  |
| DV — derivado        | 4      | 8      | 1     | 3      | **16** |
| CF — configuração    | 3      | 19     | 0     | 1      | **23** |
| DP — por admissão    | 4      | 4      | 0     | 0      | **8**  |
| CA — candidato novo  | 0      | 11     | 0     | 6      | **17** |

Leitura: **37 dos 85 saem do que já existe** (EX + CV + DV). Dos 53 que a auditoria marcou como
ausentes, **23 viram configuração da empresa** (preenchida uma vez, não por admissão), **8 viram
campo do DP** e **17 viram pergunta ao candidato**. Desses 17, os 5 de deficiência são uma única
pergunta com marcações, e 6 são dos dependentes.

### 1.1 Registro A — contrato preliminar

| Campo                               | Sit.  | Origem / regra proposta                                                                                         |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| TERMOCONSENTIMENTO                  | DV    | `ficha.aviso_aceito_em` preenchido → `2` (Assinado). **Equivalência a confirmar (Q2)**; sem confirmação vira CF |
| GERARPRELIMINAR                     | CF    | padrão da empresa (Q3)                                                                                          |
| CODIGOEMPRESA                       | DV    | `empresas.cnpj` com máscara; exportação bloqueada se nulo                                                       |
| CODIGOTIPOCONTR                     | CF+DP | padrão da empresa; DP pode trocar pelo catálogo Questor                                                         |
| CPFFUNC                             | EX    | `admissoes_processos.cpf` → `999.999.999-99`                                                                    |
| NOMEFUNC                            | EX    | `admissoes_processos.nome_completo`; acima de 70 caracteres **bloqueia** (sem truncar)                          |
| DATANASC                            | EX    | `ficha.nascimento` ISO → DD/MM/AAAA                                                                             |
| DATAADM                             | EX    | `internos.data_admissao`                                                                                        |
| CATEGESOCIAL                        | DV    | da **modalidade de contratação** escolhida pelo DP (tabela 4.2; Q4)                                             |
| CATEGORIA                           | DV    | idem (01 empregado · 04 prazo determinado · 07 aprendiz)                                                        |
| CODIGOSIND                          | CF+DP | sindicato padrão da empresa; DP pode trocar                                                                     |
| DIACONTREXP / DIAPRORROGCONTREXP    | DP    | pré-preenchidos com o padrão da empresa; `0/0` quando não houver experiência (Q6)                               |
| TIPOSALARIO                         | DP    | lista fechada 1, 2, 5, 6, 7                                                                                     |
| VALORSAL                            | DP    | salário em centavos → `1518,00`                                                                                 |
| _DESCRSAL_ (condicional)            | DP    | obrigatório se TIPOSALARIO ∈ {2, 6}                                                                             |
| _CODIGOTIPOFATO_ (condicional)      | DP    | só aparece se CATEGESOCIAL = 105                                                                                |
| _DATACONTREXP1/2_ (opcionais)       | —     | **enviar vazio**: a regra de contagem (inclusive ou não) não está documentada                                   |
| _CODIGOCARGO_ (opcional, essencial) | CF    | `funcoes_operacionais.questor_codigo_cargo`                                                                     |

### 1.2 Registro B — dados obrigatórios

| Grupo             | Campos                                                                                                          | Sit. | Origem / regra proposta                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| Empresa           | CODIGOEMPRESA                                                                                                   | DV   | `empresas.cnpj`                                                                                                                  |
| Documentos (DP)   | PISFUNC, NUMEROCTPS, SERIECTPS, SIGLAESTADOCTPS                                                                 | EX   | `internos`; PIS → `999.99999.99.9`; tamanhos 11/5 validados                                                                      |
| Endereço          | CEPFUNC, ENDERFUNC, NUMEROENDER, BAIRROFUNC, SIGLAESTADO                                                        | EX   | ficha; CEP → `99.999-999`; ENDERFUNC ≤ 40 e BAIRRO ≤ 30 **bloqueiam** acima (DP abrevia na revisão); NUMEROENDER "S/N" → Q7      |
| Endereço          | CODIGOMUNIC                                                                                                     | DV   | `ibge` do ViaCEP gravado em `municipio_ibge` (Q5)                                                                                |
| Endereço          | CODIGOTIPOLOGRAD                                                                                                | DV   | 1ª palavra do logradouro (Rua, Avenida…) → catálogo Questor `tipo_logradouro` da empresa; sem par → pendência para o DP escolher |
| Filiação          | MAE                                                                                                             | EX   | `ficha.nome_mae` (≤ 70)                                                                                                          |
| Pessoais          | SEXO, RACACOR, ESTADOCIVIL, NACIONALIDADE                                                                       | CV   | de-para fixo (seção 4.1)                                                                                                         |
| Naturalidade      | SIGLAESTADONASC, CODIGOMUNICNASC                                                                                | CA   | troca o texto livre `naturalidade` por UF + município (IBGE)                                                                     |
| Escolaridade      | GRAUINSTR                                                                                                       | CA   | coluna **já existe**; entra no formulário com as 13 opções da doc                                                                |
| Deficiência       | DEFFISICA, DEFVISUAL, DEFAUDITIVA, DEFINTELECTUAL, DEFMENTAL                                                    | CA   | uma pergunta "possui deficiência?" + marcações; "não" → todos `0`                                                                |
| Deficiência       | DEFREABILITADO                                                                                                  | CA   | "é reabilitado pelo INSS?" (só se respondeu "sim" acima; senão `0`)                                                              |
| Deficiência       | DEFCOTA                                                                                                         | DP   | cota PCD é decisão da empresa, não declaração do candidato                                                                       |
| Histórico         | INDICATPRIMEMP                                                                                                  | CA   | "é seu primeiro emprego com carteira assinada?"                                                                                  |
| Histórico         | RECEBSEGURODESEMPREGO                                                                                           | CA   | "está recebendo seguro-desemprego?"                                                                                              |
| Histórico         | TIPOADMRAIS, TIPOADMCAGED                                                                                       | DV   | primeiro emprego → `1`/`10`; senão `2`/`20`; DP sobrescreve para transferência/reintegração                                      |
| Contrato          | TIPOVINCULO                                                                                                     | DV   | da modalidade (tabela 4.2)                                                                                                       |
| Contrato          | TIPOADM                                                                                                         | DP   | padrão `1` (Admissão); DP muda para transferência                                                                                |
| Contrato          | UTILIZACARTEIRADIGITAL, POSSUIALVARA                                                                            | DP   | CTPS é do DP (brain 44 D-7); alvará só para menor (padrão `0`)                                                                   |
| Pagamento         | MODOPGTO                                                                                                        | DV   | dados bancários completos → `3`; senão padrão da empresa                                                                         |
| Estrutura         | CODIGOESTAB, CLASSIFORGAN                                                                                       | CF   | configuração da empresa (Q8: uma filial por empresa Pralís?)                                                                     |
| Jornada           | CODIGOESCALA, TIPOJORNADA, TEMPOPARCIAL, REGIMEJOR                                                              | CF   | colunas novas em `turnos` (o turno da admissão já existe)                                                                        |
| Saúde ocupacional | AGENTENOCIVO                                                                                                    | CF   | coluna nova em `funcoes_operacionais` (padrão `00`)                                                                              |
| Saúde ocupacional | JAEXPOSTO                                                                                                       | DV   | `0` se agente `00`; senão o DP informa (condicional)                                                                             |
| Sindicato         | SINDICALIZADO, DESCMENSSIND, DESCCUSTCONFED, DESCTAXAASSIST, DESCONTAREVSAL, DESCANOADMISSAO, CLAUSULAASSEGRESC | CF   | padrões da empresa; DP pode sobrescrever na admissão                                                                             |
| Política          | OPTANTEFGTS, RECEBEADTO, RECEBE13SAL, PARTICPAT, UTILIZAQCOLABORE                                               | CF   | padrões da empresa (Q9)                                                                                                          |

### 1.3 Registro C — dados não obrigatórios

Só CODIGOEMPRESA é requerido (DV). Opcionais que o Pralís **já tem ou terá sem pergunta nova**:

- NOMESOCIAL e ENDERELETR (e-mail);
- DDD/telefone/celular, derivados de `telefone`: 11 dígitos com 9 na 3ª posição → celular; 10 → fixo;
- RG (4 colunas existentes) e título de eleitor (3 colunas existentes), quando a ficha passar a coletá-los (Q10).

Ficam **bloqueados até a Conplus responder**: `INDAPREND` e `ORGAOEMISSORRNE`. O gerador já recusa
qualquer valor neles.

### 1.4 Registro D — dependentes

| Campo                                       | Sit. | Origem / regra                                                   |
| ------------------------------------------- | ---- | ---------------------------------------------------------------- |
| CODIGOEMPRESA, CPFFUNC, DATAADM             | DV   | do titular (mesmos valores do A, exigência do índice do NLI)     |
| NOMEDEPEND (≤ 70), DATANASC                 | EX   | `admissoes_processos_dependentes`                                |
| PARENTESCO                                  | CV   | lista fechada com os 22 códigos da doc (substitui o texto livre) |
| SEXO, ESTADOCIVIL, GRAUINSTR, NACIONALIDADE | CA   | colunas novas no dependente                                      |
| FUMANTE, CONSOMEALCOOL                      | CA   | colunas novas — **dado de saúde (LGPD art. 5º II)**, Q11         |
| FORMACONTROLEIR                             | CF   | padrão da empresa (1 = por mês)                                  |
| ENTREGACERT                                 | —    | **bloqueado** até a Conplus responder                            |

## 2. Separação por responsável

### Candidato — 17 campos novos, todos pessoais

**Formulário do titular:**

- naturalidade como UF + município;
- grau de instrução;
- deficiência (pergunta "sim/não" + 5 marcações + reabilitado);
- primeiro emprego;
- seguro-desemprego.

**Formulário do dependente:**

- sexo, estado civil, grau de instrução e nacionalidade;
- fumante e consome álcool.

O candidato **não** vê: salário, tipo de contrato, sindicato, experiência, cota PCD, CTPS digital,
escala, estabelecimento, FGTS, adiantamento nem nenhum código do Questor.

### Departamento Pessoal — por admissão (bloco "Contrato" no processo)

- modalidade de contratação;
- tipo de salário, salário e descrição do salário (condicional);
- dias de experiência e de prorrogação;
- tipo de contrato e sindicato (pré-preenchidos);
- tipo de admissão e cota PCD;
- CTPS digital e alvará;
- exceções aos padrões sindicais e de RAIS/CAGED.

A data de admissão, a CTPS e o PIS **já são do DP** e continuam no mesmo bloco.

### Configuração do sistema — uma vez por empresa

- CNPJ da empresa (já existe; passa a ser exigido para exportar);
- estabelecimento e organograma;
- catálogo de códigos Questor (tipo de contrato, sindicato, cargo, escala, tipo de logradouro, eventos);
- padrões de contrato, sindicais e de política;
- função → cargo/agente nocivo;
- turno → escala/jornada;
- "Utiliza Hora Centesimal" (para Eventos Variáveis).

## 3. Alterações propostas no PostgreSQL

**Nenhuma é executada nesta etapa.** Cada uma vira uma migration Drizzle própria, com o SQL mostrado
para aprovação antes (AGENTS 4.6). Os campos existentes são preservados. Nenhum valor histórico é
alterado sem contagem e amostra aprovadas.

### M1 — ficha do candidato (`admissoes_processos_ficha`) e espelho em `colaboradores_dados_pessoais` / `colaboradores_enderecos`

```sql
-- PROPOSTA — não gerada, não aplicada
ALTER TABLE admissoes_processos_ficha
  ADD COLUMN municipio_ibge text,               -- 7 dígitos, vindo do ViaCEP
  ADD COLUMN naturalidade_uf text,
  ADD COLUMN naturalidade_municipio_ibge text,
  ADD COLUMN nacionalidade_pais text,           -- só quando estrangeira: código de nacionalidade da doc
  ADD COLUMN possui_deficiencia boolean,
  ADD COLUMN deficiencias text[],               -- subconjunto de {fisica,visual,auditiva,intelectual,mental}
  ADD COLUMN reabilitado boolean,
  ADD COLUMN primeiro_emprego boolean,
  ADD COLUMN recebe_seguro_desemprego boolean,
  ADD CONSTRAINT ficha_municipio_ibge_check CHECK (municipio_ibge IS NULL OR municipio_ibge ~ '^[0-9]{7}$'),
  ADD CONSTRAINT ficha_naturalidade_ibge_check CHECK (naturalidade_municipio_ibge IS NULL OR naturalidade_municipio_ibge ~ '^[0-9]{7}$'),
  ADD CONSTRAINT ficha_naturalidade_uf_check CHECK (naturalidade_uf IS NULL OR naturalidade_uf ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT ficha_deficiencias_check CHECK (deficiencias IS NULL OR deficiencias <@ ARRAY['fisica','visual','auditiva','intelectual','mental']::text[]),
  ADD CONSTRAINT ficha_deficiencia_coerencia_check CHECK (possui_deficiencia IS NOT FALSE OR coalesce(cardinality(deficiencias), 0) = 0);
-- As mesmas colunas pessoais em colaboradores_dados_pessoais; municipio_ibge em colaboradores_enderecos.
-- A efetivação (efetivacao.service.ts) passa a copiar os campos novos.
```

O texto livre `naturalidade` **não é removido** nesta migration: ele guarda o histórico das fichas já
enviadas. Ele sai do formulário e passa a ser só leitura.

**CHECK de valores** em `sexo`, `estado_civil`, `raca_cor`, `grau_instrucao` e `nacionalidade`: só
depois de contar e amostrar os valores gravados hoje (AGENTS 4.6). Até lá, a validação fica no Zod e
no de-para.

### M2 — dependentes (`admissoes_processos_dependentes`)

```sql
-- PROPOSTA
ALTER TABLE admissoes_processos_dependentes
  ADD COLUMN sexo text, ADD COLUMN estado_civil text, ADD COLUMN grau_instrucao text,
  ADD COLUMN nacionalidade text, ADD COLUMN fumante boolean, ADD COLUMN consome_alcool boolean;
```

O `parentesco` continua `text`. Passa a ser lista fechada no Zod. Os valores atuais (lista sugerida

- texto livre) precisam de **contagem e amostra** antes de qualquer de-para em massa. Registro que
  não casar vira pendência de revisão, nunca chute.

### M3 — bloco do DP (estende `admissoes_processos_internos`, não cria tabela paralela)

`internos` já é o bloco do DP, 1:1 com o processo e com `versao`. Criar outra tabela seria um segundo
lugar para o mesmo ato.

```sql
-- PROPOSTA
ALTER TABLE admissoes_processos_internos
  ADD COLUMN modalidade_contratacao text,       -- CHECK com a lista aprovada (Q4)
  ADD COLUMN tipo_salario smallint CHECK (tipo_salario IN (1,2,5,6,7)),
  ADD COLUMN salario_centavos bigint CHECK (salario_centavos > 0),
  ADD COLUMN descricao_salario text,
  ADD COLUMN dias_experiencia integer CHECK (dias_experiencia >= 0),
  ADD COLUMN dias_prorrogacao integer CHECK (dias_prorrogacao >= 0),
  ADD COLUMN questor_tipo_contrato text,        -- código do catálogo da empresa
  ADD COLUMN questor_sindicato text,
  ADD COLUMN tipo_admissao smallint DEFAULT 1 CHECK (tipo_admissao BETWEEN 1 AND 7),
  ADD COLUMN pcd_cotista boolean,
  ADD COLUMN utiliza_ctps_digital boolean,
  ADD COLUMN possui_alvara boolean,
  ADD COLUMN sobrescritas_questor jsonb,        -- exceções aos padrões (sindicais, RAIS/CAGED), por nome de campo do layout
  ADD CONSTRAINT internos_descricao_salario_check CHECK (tipo_salario NOT IN (2,6) OR descricao_salario IS NOT NULL);
```

`sobrescritas_questor` aceita só chaves do layout oficial, validadas no serviço contra
`LAYOUT_ADMISSAO_QUESTOR`. É o único jeito de não criar 15 colunas que quase sempre repetem o
padrão. Alternativa, se Marco preferir tipagem forte: colunas explícitas para os 9 campos
sobrescrevíveis.

### M4 — configuração Questor por empresa

```sql
-- PROPOSTA
CREATE TABLE questor_configuracoes (
  empresa_id uuid PRIMARY KEY REFERENCES empresas(id),
  codigo_estabelecimento integer NOT NULL,
  classificacao_organograma text NOT NULL,
  padroes jsonb NOT NULL,          -- valores-padrão por campo do layout (GERARPRELIMINAR, OPTANTEFGTS, RECEBEADTO…)
  utiliza_hora_centesimal boolean NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  atualizado_por text, atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE questor_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  tabela text NOT NULL CHECK (tabela IN ('tipo_contrato','sindicato','cargo','escala','tipo_logradouro')),
  codigo text NOT NULL CHECK (codigo ~ '^[0-9]+$'),
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (empresa_id, tabela, codigo)
);
```

`padroes` é validado no serviço: a chave tem de existir no layout e o valor no `dominio` do campo.

### M5 — de-para nos cadastros auxiliares existentes

```sql
-- PROPOSTA
ALTER TABLE funcoes_operacionais ADD COLUMN questor_codigo_cargo text, ADD COLUMN agente_nocivo text DEFAULT '00'
  CHECK (agente_nocivo IN ('00','15','20','25'));
ALTER TABLE turnos ADD COLUMN questor_codigo_escala text,
  ADD COLUMN tipo_jornada smallint CHECK (tipo_jornada IN (2,3,4,5,6,7,9)),
  ADD COLUMN tempo_parcial smallint DEFAULT 0 CHECK (tempo_parcial IN (0,1,2,3)),
  ADD COLUMN regime_jornada smallint DEFAULT 1 CHECK (regime_jornada IN (1,2,3,4));
```

### M6 — exportações (rastro, não duplicidade)

```sql
-- PROPOSTA
CREATE TABLE questor_exportacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  tipo text NOT NULL CHECK (tipo IN ('admissao','eventos_variaveis')),
  competencia date,                       -- só eventos variáveis
  sha256 text NOT NULL,
  caminho_arquivo text NOT NULL,          -- storage, mesmo padrão dos anexos (dado pessoal fora do banco)
  diagnosticos jsonb NOT NULL,
  gerado_por text NOT NULL, gerado_em timestamptz NOT NULL DEFAULT now(),
  motivo_regeracao text
);
CREATE TABLE questor_exportacoes_admissoes (
  exportacao_id uuid NOT NULL REFERENCES questor_exportacoes(id),
  processo_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  PRIMARY KEY (exportacao_id, processo_id)
);
```

Reexportar o mesmo processo exige `motivo_regeracao`. O Questor duplica na reimportação (doc de
Eventos Variáveis), então o aviso tem de estar na tela.

### M7 — Eventos Variáveis (depende de Q12 e do modelo CSV)

- `questor_eventos (empresa_id, codigo, descricao, unidades text[] ⊂ {H,R,V}, ativo, UNIQUE(empresa_id, codigo))`;
- `colaboradores_vinculos.questor_codigo_contrato integer`: o código do empregado no Questor, para a coluna 1 do CSV;
- `eventos_variaveis_lancamentos (empresa_id, competencia, vinculo_id, evento_codigo, unidade, minutos | centavos | referencia, origem, criado_por)`.

## 4. Validações, listas e conversões

### 4.1 De-para fixo (igual para todas as empresas: vem da doc oficial)

Fica num módulo puro, `shared/src/conplus/questor-de-para.ts`. Um teste garante que **todo** valor de
lista do formulário cai no `dominio` do campo em `LAYOUT_ADMISSAO_QUESTOR`.

| Campo Pralís  | Rótulos atuais/propostos → código Questor                                                                                                                                | Pendência                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| sexo          | Masculino → 1 · Feminino → 2                                                                                                                                             | —                                                                               |
| racaCor       | Indígena 1 · Branca 2 · Preta 4 · Amarela 6 · Parda 8 · Não declarado 9                                                                                                  | —                                                                               |
| estadoCivil   | Solteiro(a) 1 · Casado(a) 2 · Divorciado(a) 3 · Separado(a) judicialmente 3 · Viúvo(a) 4 · **União estável → ?**                                                         | Q13: "Concubinato = 5" ou "Outros = 6"; regimes de bens 7/8/9 não são coletados |
| nacionalidade | Brasileira 10 · Brasileira naturalizada 20 · **Brasileira nascida no exterior 15 (opção nova)** · Estrangeira → lista de países da doc (21–70)                           | lista do estrangeiro aparece só quando escolhido                                |
| grauInstrucao | 13 opções com os textos da doc → 1..13                                                                                                                                   | —                                                                               |
| parentesco    | 22 opções da doc com os mesmos textos → códigos; sugestões atuais: Filho(a) 01 · Enteado(a) 11 · Cônjuge 02 · Companheiro(a) 16 · Tutelado(a) 15 · Pai/Mãe 03 · Outro 14 | registros antigos em texto livre: contagem antes                                |

### 4.2 Modalidade de contratação (DP) → códigos derivados — **precisa de Q4**

| Modalidade (proposta)            | CATEGESOCIAL | CATEGORIA | TIPOVINCULO |
| -------------------------------- | ------------ | --------- | ----------- |
| CLT prazo indeterminado          | 101          | 01        | 10          |
| Aprendiz                         | 103          | 07        | 55          |
| Prazo determinado (Lei 9.601/98) | 105          | 04        | 90          |

Os códigos de CATEGESOCIAL são da tabela 01 do eSocial, que **não veio** nos arquivos oficiais. A
tabela acima é hipótese para a Conplus confirmar, não regra. Até lá, a modalidade fica **sem**
derivação e o DP escolhe os três códigos manualmente.

### 4.3 Conversões de formato (no exportador, nunca no banco)

| Dado Pralís         | Questor                                                   |
| ------------------- | --------------------------------------------------------- |
| CPF 11 dígitos      | `999.999.999-99` no A (o D aceita os dois; Q1)            |
| CNPJ                | `99.999.999/9999-99`                                      |
| PIS 11 dígitos      | `999.99999.99.9`                                          |
| CEP 8 dígitos       | `99.999-999`                                              |
| Data ISO            | DD/MM/AAAA                                                |
| Salário em centavos | `1518,00` (vírgula, sem milhar)                           |
| Telefone            | DDD + número; celular quando 11 dígitos                   |
| Horas (Eventos)     | `formatarHorasEventoVariavel(min, utilizaHoraCentesimal)` |

**Nada é truncado em silêncio.** Texto maior que o layout bloqueia a linha e aponta o campo ao DP.

### 4.4 Regras de bloqueio da exportação

- Ficha **aprovada** + bloco do DP completo + configuração da empresa completa.
- `montarArquivoAdmissaoQuestor` sem diagnósticos.
- Os três campos ambíguos (`C.INDAPREND`, `C.ORGAOEMISSORRNE`, `D.ENTREGACERT`) **sempre vazios**: o
  gerador já recusa valor neles e a configuração não aceita padrão para eles.

## 5. Telas

### 5.1 Formulário do candidato (`web-vue/pages/admissao.vue`, hoje com 1.720 linhas)

Antes de acrescentar campos, **quebrar o arquivo** (AGENTS 4.5): uma etapa por componente em
`web-vue/components/admissoes/ficha-publica/`.

Mudanças nas etapas:

1. **Dados pessoais:** grau de instrução, naturalidade (UF → município) e país, quando estrangeiro.
2. **Endereço e contato:** captura `ibge` do ViaCEP.
3. **Nova etapa "Trabalho e saúde":** primeiro emprego, seguro-desemprego, deficiência e reabilitado.
4. **Dependentes:** parentesco em lista fechada, mais sexo, estado civil, grau de instrução,
   nacionalidade, fumante e álcool.

A **nova versão do aviso de privacidade** precisa citar deficiência, raça/cor e os dados de saúde
dos dependentes (dado sensível). O texto é do jurídico ou do Rodrigo, não do código (Q11).

Revisão do DP (`FichaRevisaoCampos.vue`, `FichaRevisaoDependentes.vue`): mostra os campos novos em
leitura. Não há segundo formulário de edição.

### 5.2 Painel do DP — processo (`ProcessoInternosDialog.vue`)

O diálogo atual (exame, data, CTPS, PIS, observações) ganha a seção **Contrato**. Ela vem
pré-preenchida com os padrões da empresa e mostra campos condicionais: descrição do salário com
tipo 2/6; CODIGOTIPOFATO com categoria 105; "já exposto" quando o agente é diferente de 00.

**O diálogo atual tem 229 linhas** e passaria de 400. A seção vira componente próprio
(`ProcessoContratoBloco.vue`).

### 5.3 Configuração Questor — nova tela no grupo "Cadastros base" do DP

- Estabelecimento, organograma, padrões, hora centesimal.
- Catálogo de códigos por tabela: CRUD + importação CSV vinda da Conplus.
- Função → cargo e agente nocivo: **coluna nova na tela de Funções operacionais**, não em tela nova.
- Turno → escala, tipo de jornada, tempo parcial e regime: **coluna nova na tela de Turnos**.

### 5.4 Exportação — dentro da página `/conplus` existente

A página `/conplus` hoje só importa. Para não abrir um segundo lugar "Conplus", ela ganha abas:
**Importar** (atual) · **Exportar admissões** · **Exportar eventos variáveis**.

**Exportar admissões:**

- empresa → lista de processos com ficha aprovada;
- coluna "Pronto / N pendências", com cada pendência apontando onde corrigir (ficha → devolver ao
  candidato; contrato → bloco do DP; configuração → tela de configuração);
- seleção → prévia das linhas, com CPF mascarado na tela;
- "Gerar TXT": download CRLF na codificação confirmada (Q1) e registro em `questor_exportacoes`;
- aviso fixo: "o Pralís não envia ao Questor; reimportar duplica".

**Exportar eventos variáveis:**

- empresa + competência → grade vínculo × evento do catálogo da empresa;
- validação H/R/V e hora centesimal;
- "Gerar CSV".

**Permissões novas:** `conplus_exportar_admissoes`, `conplus_exportar_eventos` e
`questor_configurar`, seguindo o modelo do brain 23.

Responsivo em 1440 / 1024 / 768 / 390: em telas estreitas, a tabela de processos vira cartões e a
grade de eventos rola por empregado.

## 6. Ordem de implementação (cada item é uma entrega vertical completa)

| #   | Entrega                                                                                         | Migration | Depende de             |
| --- | ----------------------------------------------------------------------------------------------- | --------- | ---------------------- |
| E0  | Respostas da seção 8 registradas no PROJECT_BRAIN                                               | —         | Conplus, Rodrigo       |
| E1  | De-para fixo + `montarContratoQuestor(snapshot, configuracao)` puro, com testes contra o layout | nenhuma   | — (pode começar já)    |
| E2  | Configuração Questor da empresa + catálogo de códigos (tela + API + testes)                     | M4        | Q3, Q8, Q9             |
| E3  | De-para em Funções e Turnos (colunas + telas existentes + testes)                               | M5        | E2                     |
| E4  | Bloco Contrato do DP                                                                            | M3        | E2, Q4, Q6             |
| E5a | Quebra de `admissao.vue` sem mudança de comportamento (refatoração)                             | nenhuma   | —                      |
| E5b | Ficha: campos novos do candidato + ViaCEP IBGE + efetivação copiando + aviso v-nova             | M1        | E5a, Q5, Q10, Q11, Q13 |
| E5c | Dependentes: campos novos + parentesco fechado (+ contagem e de-para dos antigos)               | M2        | E5b, Q11               |
| E6  | Exportação TXT de admissão (aba, endpoint, storage, rastro, golden test)                        | M6        | E1–E5c, Q1             |
| E7  | Eventos Variáveis (catálogo, código do empregado, lançamento, CSV)                              | M7        | Q12, modelo CSV        |

### Arquivos previstos

- **shared:**
  - novos: `conplus/questor-de-para.ts`, `conplus/questor-contrato.ts` (snapshot → registros A/B/C/D);
  - alterados: `admissoes/ficha.ts`, `admissoes/dependentes.ts`, `admissoes/processos.ts`.
- **db:**
  - `src/schema/app.schema.ts` (tabelas M1–M7), `src/referencia-permissoes.ts`;
  - migrations geradas pelo Drizzle, **uma por entrega**.
- **api:**
  - alterados: `admissoes/ficha.*`, `admissoes/dependentes.*`, `admissoes/processos.*` (internos), `admissoes/efetivacao.*`;
  - novos: `conplus/questor-configuracao.{controller,service,repository}.ts`, `conplus/questor-exportacao.{controller,service,repository}.ts`;
  - alterados: `funcoes`/`turnos` (de-para).
- **web-vue:**
  - `pages/admissao.vue` → `components/admissoes/ficha-publica/*`;
  - `FichaRevisaoCampos.vue`, `FichaRevisaoDependentes.vue`, `ProcessoInternosDialog.vue` + `ProcessoContratoBloco.vue`;
  - `components/conplus/ConplusImportacaoPage.vue` → página com abas + `ConplusExportarAdmissoes.vue` + `ConplusExportarEventos.vue`;
  - tela de configuração Questor; telas de Funções e Turnos.

### Testes necessários

- **Unitários:**
  - todo valor de lista do formulário mapeia para o `dominio` oficial (falha se alguém acrescentar opção sem código);
  - `montarContratoQuestor` com snapshot fictício completo → zero diagnósticos e comparação com o golden;
  - cada condicional (DESCRSAL, CODIGOTIPOFATO, JAEXPOSTO, deficiência);
  - texto acima do limite bloqueia, não trunca;
  - campos bloqueados nunca saem preenchidos.
- **Integração (Testcontainers):**
  - cada migration aplica sobre a base atual sem perder dados;
  - isolamento: configuração e catálogo da empresa X nunca entram no arquivo da empresa Y;
  - permissão: candidato pelo link não lê nem grava campo do DP; DP sem `conplus_exportar_admissoes` recebe 403;
  - reexportação exige motivo;
  - efetivação copia os campos novos.
- **Componentes (Vitest):** etapas do formulário, seção Contrato, abas da `/conplus`.
- **Navegador (Playwright):** fluxo candidato → revisão → contrato → exportar, em 1440/1024/768/390, sem scroll horizontal.

## 7. O que este plano deliberadamente NÃO faz

- **Não pede ao candidato:** salário, contrato, sindicato, cota PCD, CTPS digital, escala ou código Questor.
- **Não deriva o salário** de `remuneracao_minuto`, nem a experiência do período de teste.
- **Não preenche** DATACONTREXP1/2 (regra de contagem não documentada).
- **Não envia nada** à Conplus. A API SYN ("JSON String") fica para quando houver contrato e credenciais.
- **Não remove** `naturalidade` em texto nem dados antigos. Só deixam de ser editáveis.
- **Não toca** Google Sheets/Drive.

## 8. Decisões pendentes (bloqueiam as entregas indicadas)

| #   | Pergunta                                                                                                           | Para quem          | Bloqueia                |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------- |
| Q1  | Codificação do TXT (UTF-8 ou ANSI)? CPF do registro D com ou sem máscara? CRLF na última linha?                    | Conplus            | E6                      |
| Q2  | "Termo de Consentimento" do Questor = aceite do aviso de privacidade do Pralís?                                    | Conplus + jurídico | E1 (TERMOCONSENTIMENTO) |
| Q3  | GERARPRELIMINAR: 0 ou 1 para a TNP?                                                                                | Conplus            | E2                      |
| Q4  | Quais modalidades a TNP usa e seus CATEGESOCIAL/CATEGORIA/TIPOVINCULO?                                             | Rodrigo + Conplus  | E4                      |
| Q5  | CODIGOMUNIC/CODIGOMUNICNASC usam código IBGE?                                                                      | Conplus            | E5b                     |
| Q6  | Experiência padrão (ex.: 45 + 45) por empresa ou por função?                                                       | Rodrigo            | E4                      |
| Q7  | Endereço "S/N": que número enviar em NUMEROENDER (inteiro)?                                                        | Conplus            | E6                      |
| Q8  | Cada empresa Pralís = um CNPJ + um estabelecimento Questor? E o organograma?                                       | Rodrigo + Conplus  | E2                      |
| Q9  | Padrões de FGTS, adiantamento, 13º, PAT, Q-Colabore e sindicais por empresa                                        | Conplus            | E2                      |
| Q10 | RG e título passam a ser coletados na ficha (colunas já existem)?                                                  | Rodrigo            | E5b                     |
| Q11 | Deficiência, fumante e álcool: base legal e texto do aviso; o DP pode enviar "0" quando o dependente não declarar? | jurídico + Rodrigo | E5b, E5c                |
| Q12 | De onde vêm os valores dos eventos variáveis (ponto, digitação do DP)? Quais eventos por empresa?                  | Rodrigo + Conplus  | E7                      |
| Q13 | "União estável" mapeia para Concubinato (5) ou Outros (6)?                                                         | Conplus            | E5b                     |
| Q14 | Respostas sobre as divergências da auditoria (C coluna 64, D coluna 4, exemplo D)                                  | Conplus            | mantém bloqueio         |

Ao aprovar, cada resposta é registrada no PROJECT_BRAIN (novo `52_ADMISSAO_QUESTOR_DECISOES.md`)
antes da entrega que ela destrava.
