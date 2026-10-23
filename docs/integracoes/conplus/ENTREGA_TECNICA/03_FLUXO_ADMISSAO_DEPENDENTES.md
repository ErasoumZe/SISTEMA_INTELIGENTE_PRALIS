# 3. Fluxo de admissão e dependentes

```
DP abre processo ─▶ exame admissional (ASO) ─▶ convite por link ─▶ candidato preenche ficha
   (nome, CPF,          (apto)                   (token único,       + dependentes
    função, turno,                                expira)            + documentos (upload)
    admissão)                                                              │
                                                                            ▼
     prévia de prontidão Questor ◀── DP completa contrato ◀── DP revisa e aprova (ou devolve)
       (campo a campo)                (E4: salário, experiência,
            │                          tipo de contrato…)
            ▼
     TXT A/B/C/D (gerado só sem pendências) ─▶ Questor
```

## Quem informa o quê

| Responsável           | Dados                                                                                                                                                                                                            | Etapa no Pralís                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Candidato** (link)  | Dados pessoais, endereço, contato, documentos, escolaridade, naturalidade (UF), primeiro emprego, seguro-desemprego, dependentes (nome, nascimento, parentesco, sexo, estado civil, escolaridade, nacionalidade) | Ficha pública                  |
| **DP** (por admissão) | CPF, função, turno, data de admissão, CTPS, PIS, salário, tipo de salário, experiência, tipo de contrato, sindicato, tipo de admissão, cota PCD, CTPS digital                                                    | Processo + bloco Contrato (E4) |
| **Empresa** (uma vez) | Estabelecimento, organograma, padrões (FGTS, adiantamento, 13º, sindicais…), catálogo de códigos Questor, vínculo função→cargo e turno→escala                                                                    | Configuração Questor (E2/E3)   |
| **Conplus**           | Tabelas de códigos por empresa e respostas do documento 7                                                                                                                                                        | Fora do Pralís                 |

## Prévia de prontidão

Para cada processo, o DP vê os 85 campos obrigatórios do layout (com 1 dependente) com situação
(pronto, pendente, inválido, bloqueado) e **origem da pendência** (candidato, DP, empresa, código
Questor ou externo/Conplus). A resposta não traz nenhum valor pessoal — só situação e motivo.

Com todos os dados do Pralís preenchidos, restam **8 pendências, todas externas** (documento 7).

## Dados de saúde

Deficiência, reabilitação, fumo e álcool são exigidos pelo layout, mas são **dados sensíveis**
(LGPD art. 5º, II). O contrato e o mapeamento estão prontos; a **coleta não existe** até haver base
legal e aviso de privacidade aprovados. A prévia mostra esses campos como bloqueados.
