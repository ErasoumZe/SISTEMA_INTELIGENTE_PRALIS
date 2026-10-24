# E5 — campos do candidato e dos dependentes para o Questor

Data: 22/10/2026 · Contrato em código: `@padaria/shared` → `questor-candidato.ts` (exportado também
pela raiz `@padaria/shared`, como o web-vue exige). Testes: `tests/unit/conplus-questor-candidato.test.ts`.

**Não altera** `/admissao` (`web-vue/pages/admissao.vue`), `shared/src/admissoes/ficha.ts` nem
`dependentes.ts` — arquivos com alterações de outra frente. Nenhuma migration aplicada.

## 1. Os 17 campos pendentes do candidato — e o que existe hoje no `/admissao`

| #    | Campo Questor                                                | Registro | Hoje no `/admissao`                   | Grupo                | Situação                                                                 |
| ---- | ------------------------------------------------------------ | -------- | ------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| 1    | SIGLAESTADONASC                                              | B        | `naturalidade` em texto livre, sem UF | comum                | **implementável** (campo novo `naturalidadeUf`)                          |
| 2    | INDICATPRIMEMP                                               | B        | não existe                            | comum                | **implementável** (`primeiroEmprego`)                                    |
| 3    | RECEBSEGURODESEMPREGO                                        | B        | não existe                            | comum                | **implementável** (`recebeSeguroDesemprego`)                             |
| 4    | TIPOADMRAIS                                                  | B        | não existe                            | derivado             | **implementável**: 1/2 a partir de `primeiroEmprego`, só com TIPOADM = 1 |
| 5    | TIPOADMCAGED                                                 | B        | não existe                            | derivado             | **implementável**: 10/20, mesma regra                                    |
| 6–10 | DEFFISICA, DEFVISUAL, DEFAUDITIVA, DEFINTELECTUAL, DEFMENTAL | B        | não existe                            | **sensível (saúde)** | **bloqueado — Q11**                                                      |
| 11   | DEFREABILITADO                                               | B        | não existe                            | **sensível (saúde)** | **bloqueado — Q11**                                                      |
| 12   | SEXO (dependente)                                            | D        | não existe no dependente              | comum                | **implementável**                                                        |
| 13   | ESTADOCIVIL (dependente)                                     | D        | não existe no dependente              | comum                | **implementável** ("União estável" segue pendente — Q13)                 |
| 14   | GRAUINSTR (dependente)                                       | D        | não existe no dependente              | comum                | **implementável**                                                        |
| 15   | NACIONALIDADE (dependente)                                   | D        | não existe no dependente              | comum                | **implementável**                                                        |
| 16   | FUMANTE (dependente)                                         | D        | não existe                            | **sensível (saúde)** | **bloqueado — Q11**                                                      |
| 17   | CONSOMEALCOOL (dependente)                                   | D        | não existe                            | **sensível (saúde)** | **bloqueado — Q11**                                                      |

Fora dos 17, mas na mesma fronteira:

- **GRAUINSTR do titular**: a coluna `grau_instrucao` **já existe** na ficha, só não está no
  formulário. Entra sem migration; a E1 já converte.
- **CODIGOMUNIC / CODIGOMUNICNASC**: dá para **capturar** o código IBGE já (`municipioIbge` vem do
  ViaCEP, que o formulário já consulta e descarta; `naturalidadeMunicipioIbge` pelo seletor de
  município). A **conversão** para o Questor depende da Q5 e não é feita.
- **Nacionalidade "Estrangeira"**: resolvida pela documentação — a lista oficial tem 37
  nacionalidades com código (`nacionalidadeEspecifica`). Antes era pendência.

Resumo: **9 implementáveis já** (7 coletados + 2 derivados), **8 bloqueados pela Q11**. Com E2–E5
completos a prévia fica com 0 pendências de candidato, DP e empresa; sobram só as 8 da Conplus
(teste "com E2–E5 completos, sobra só o que depende da Conplus").

## 2. Contrato para o frontend

Todas as opções vêm de `OPCOES_E5_QUESTOR` — a tela **não** redeclara listas.

### Titular — comuns (`fichaE5ComunsSchema`)

| Campo                       | Tipo              | Regra                                        | Pergunta sugerida                                |
| --------------------------- | ----------------- | -------------------------------------------- | ------------------------------------------------ |
| `naturalidadeUf`            | `string \| null`  | UF, 2 letras (normaliza maiúscula)           | "UF onde nasceu"                                 |
| `naturalidadeMunicipioIbge` | `string \| null`  | 7 dígitos                                    | seletor de município da UF                       |
| `municipioIbge`             | `string \| null`  | 7 dígitos                                    | **não perguntar**: vem do campo `ibge` do ViaCEP |
| `grauInstrucao`             | `string \| null`  | um de `OPCOES_E5_QUESTOR.grauInstrucao` (13) | "Escolaridade"                                   |
| `nacionalidadeEspecifica`   | `string \| null`  | um de `OPCOES_E5_QUESTOR.nacionalidade` (37) | só quando nacionalidade = "Estrangeira"          |
| `primeiroEmprego`           | `boolean \| null` | —                                            | "É seu primeiro emprego com carteira assinada?"  |
| `recebeSeguroDesemprego`    | `boolean \| null` | —                                            | "Está recebendo seguro-desemprego?"              |

### Titular — sensíveis (`fichaE5SensiveisSchema`) — **não coletar antes da Q11**

| Campo               | Tipo                                                                  | Regra                                                        |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `possuiDeficiencia` | `boolean \| null`                                                     | —                                                            |
| `deficiencias`      | `("fisica" \| "visual" \| "auditiva" \| "intelectual" \| "mental")[]` | só com `possuiDeficiencia = true`; ao menos 1; sem repetição |
| `reabilitado`       | `boolean \| null`                                                     | pergunta própria (reabilitado pelo INSS); sem derivação      |

### Dependente — comuns (`dependenteE5ComunsSchema`)

`sexo` (`OPCOES_E5_QUESTOR.sexo`), `estadoCivil` (`.estadoCivil`), `grauInstrucao` (`.grauInstrucao`),
`nacionalidade` (`.nacionalidade`) — todos `string | null`.

### Dependente — sensíveis (`dependenteE5SensiveisSchema`) — **não coletar antes da Q11**

`fumante`, `consomeAlcool` — `boolean | null`.

Todos os schemas são `strict` (campo desconhecido → 400) e aceitam tudo nulo (rascunho). A
obrigatoriedade no envio é decisão de produto: pelo layout, todos os 17 são requeridos.

## 3. Mapeamento para o TXT (implementado: `aplicarCamposE5Questor`)

| Dado                                                      | Campo                          | Regra (da documentação)                                                                                                 |
| --------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `naturalidadeUf`                                          | B.SIGLAESTADONASC              | cópia                                                                                                                   |
| `primeiroEmprego`                                         | B.INDICATPRIMEMP               | Sim=1; Não=0                                                                                                            |
| `primeiroEmprego` + TIPOADM = 1                           | B.TIPOADMRAIS / B.TIPOADMCAGED | primeiro emprego = 1 / 10; reemprego = 2 / 20. Com TIPOADM ≠ 1 (transferência, reintegração…) fica vazio: decisão do DP |
| `recebeSeguroDesemprego`                                  | B.RECEBSEGURODESEMPREGO        | Sim=1; Não=0                                                                                                            |
| `possuiDeficiencia` + `deficiencias`                      | B.DEFFISICA…DEFMENTAL          | não possui → todos 0; possui → 1 nos marcados, 0 nos demais                                                             |
| `reabilitado`                                             | B.DEFREABILITADO               | Sim=1; Não=0                                                                                                            |
| `nacionalidadeEspecifica`                                 | B.NACIONALIDADE                | só quando a ficha diz "Estrangeira"; código da lista oficial                                                            |
| dependente `sexo/estadoCivil/grauInstrucao/nacionalidade` | D.\*                           | tabelas de de-para da E1                                                                                                |
| dependente `fumante/consomeAlcool`                        | D.FUMANTE / D.CONSOMEALCOOL    | Sim=1; Não=0                                                                                                            |
| `municipioIbge`, `naturalidadeMunicipioIbge`              | —                              | **não convertidos** (Q5)                                                                                                |

## 4. Persistência — migrations propostas (NÃO geradas, NÃO aplicadas)

Separadas para que a decisão jurídica não trave os campos comuns.

**M1a — ficha, campos comuns**

```sql
ALTER TABLE admissoes_processos_ficha
  ADD COLUMN naturalidade_uf text CHECK (naturalidade_uf IS NULL OR naturalidade_uf ~ '^[A-Z]{2}$'),
  ADD COLUMN naturalidade_municipio_ibge text CHECK (naturalidade_municipio_ibge IS NULL OR naturalidade_municipio_ibge ~ '^[0-9]{7}$'),
  ADD COLUMN municipio_ibge text CHECK (municipio_ibge IS NULL OR municipio_ibge ~ '^[0-9]{7}$'),
  ADD COLUMN nacionalidade_especifica text,
  ADD COLUMN primeiro_emprego boolean,
  ADD COLUMN recebe_seguro_desemprego boolean;
-- Mesmas colunas em colaboradores_dados_pessoais / colaboradores_enderecos (municipio_ibge), para a
-- efetivação não perder o dado.
```

**M2a — dependentes, campos comuns**

```sql
ALTER TABLE admissoes_processos_dependentes
  ADD COLUMN sexo text, ADD COLUMN estado_civil text,
  ADD COLUMN grau_instrucao text, ADD COLUMN nacionalidade text;
```

**M1b / M2b — sensíveis (só depois da Q11)**

```sql
ALTER TABLE admissoes_processos_ficha
  ADD COLUMN possui_deficiencia boolean,
  ADD COLUMN deficiencias text[] CHECK (deficiencias IS NULL OR deficiencias <@ ARRAY['fisica','visual','auditiva','intelectual','mental']),
  ADD COLUMN reabilitado boolean,
  ADD CONSTRAINT ficha_deficiencia_coerencia_check CHECK (possui_deficiencia IS NOT FALSE OR coalesce(cardinality(deficiencias), 0) = 0);
ALTER TABLE admissoes_processos_dependentes ADD COLUMN fumante boolean, ADD COLUMN consome_alcool boolean;
```

Valores de lista ficam validados no Zod (as opções vêm da documentação); CHECK de lista só depois
de contar os dados reais, como no restante da ficha.

## 5. Bloqueios

| Item                                                             | Depende de                   | Campos                           |
| ---------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| Base legal + texto do aviso de privacidade para dado de saúde    | jurídico / Rodrigo (**Q11**) | 6 do titular, 2 por dependente   |
| Município usa código IBGE?                                       | Conplus (**Q5**)             | CODIGOMUNIC, CODIGOMUNICNASC     |
| "União estável"                                                  | Conplus (**Q13**)            | ESTADOCIVIL titular e dependente |
| Tela `/admissao`, `ficha.ts`, `dependentes.ts`, serviço da ficha | coordenação com o Codex      | coleta e gravação                |
| M1a/M2a (e depois M1b/M2b)                                       | aprovação de Marco           | persistência                     |
