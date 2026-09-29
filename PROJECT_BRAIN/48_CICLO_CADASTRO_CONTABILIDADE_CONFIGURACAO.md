# 48 — Ciclo de cadastro, contabilidade e configuração do colaborador

**Data:** 29/09/2026  
**Estado:** decisão de fluxo confirmada; implementação aditiva ainda não iniciada.  
**Fonte:** orientação de Marco em 29/09/2026; aba `BASE LANCAMENTOS` e relatórios sanitizados do Cartógrafo; documentos 46 e 47.

## 1. Decisão que substitui a ordem anterior

O fluxo de admissão não termina ao criar a matrícula. A sequência operacional confirmada é:

```text
cadastro completo do colaborador
→ preparo e conferência do pacote para contabilidade
→ retorno da contabilidade
→ configuração operacional restante
→ colaborador configurado para a operação
```

`47_EFETIVACAO_COLABORADOR_E_VINCULOS.md` continua valendo para identidade por CPF, recontratação,
matrícula, vínculo e timeline. A sua ordem de dossiê posterior é substituída por este documento.

## 2. Separação obrigatória de conceitos

O vínculo trabalhista mantém somente a sua verdade histórica (`ativo` ou `desligado`). Ele não
receberá estados administrativos como “aguardando contabilidade”.

O andamento acima pertence a um onboarding 1:1 do vínculo, com estados próprios e auditáveis:

```text
cadastro_completo
→ aguardando_contabilidade
→ retorno_contabilidade
→ pendente_configuracao
→ configurado
```

Cada transição terá ator, data/hora, versão e evento append-only. Repetir uma requisição não pode
duplicar pacote, matrícula ou evento.

## 3. O que significa cada etapa

| Etapa | Fato real que a libera | Resultado |
| --- | --- | --- |
| Cadastro completo | Identidade, dados pessoais, endereço/contato, dados do vínculo, função/CBO, setor, jornada e dados bancários exigidos pela operação foram conferidos. | Gera uma prévia de cadastro, sem escrever em serviços externos. |
| Aguardando contabilidade | O DP confirmou a prévia e registrou o envio para conferência. | Pacote contábil identificável e rastreável. |
| Retorno da contabilidade | O DP registrou o retorno, com observação e pendências quando houver. | Não altera dados de folha automaticamente. |
| Pendente de configuração | O retorno foi tratado e há tarefas internas abertas. | Perfil passa a mostrar uma única próxima ação. |
| Configurado | Os fatos exigidos pela política operacional vigente foram registrados. | O perfil mostra a configuração concluída, sem apagar pendências históricas. |

O vínculo pode ser vigente enquanto o onboarding ainda está em andamento. A tela deve explicar essa
diferença; nunca usar `inativo` para uma pendência de DP.

## 4. Checklist por fatos, não por contador

Documentos, foto, ASO, contrato, uniforme/EPI, ponto, dependentes e confirmação de contabilidade
serão objetos/fatos ligados ao vínculo. A ficha deriva o checklist desses fatos e mostra pendente,
conferido, dispensado ou recusado conforme cada objeto.

Não haverá contador digitado, checklist solto sem prova, nem múltiplos caminhos para efetivar.
Regras legais condicionais, retenção de anexos e critérios definitivos de bloqueio serão aprovados
em suas verticais antes de virarem validação de banco.

## 5. Papel da BASE LANCAMENTOS

A planilha é evidência do processo atual, não código executável. Ela confirma que a base por
competência reúne cadastro/vínculo, regularidade cadastral e documental, uniforme, ASO,
escala/calendário e consolidados para folha/contabilidade.

Ela também mostra que a saída contábil é por competência e depende de horas, diferenças e DSR.
Portanto:

- o primeiro pacote de contabilidade será staging/prévia local e auditável;
- não haverá escrita automática na planilha ou no Conplus nesta entrega;
- fórmulas de folha, DSR, tolerâncias, adicionais, férias, rescisão e rubricas só entram após
  homologação contábil, fixtures e testes de cálculo;
- FE/FDS, feriados, férias, licença e acidente não serão inventados como enums do onboarding.

## 6. Entregas verticais na ordem

1. **Onboarding e pacote contábil local:** estado, timeline, perfil, permissões, prévia e testes.
2. **Dossiê documental e foto:** anexos privados, acesso, versão, status e auditoria.
3. **Contrato e uniforme/EPI:** fatos, recibos e histórico por vínculo.
4. **Escala, calendário e ponto:** turnos, FDS/feriados, batidas e ajustes auditáveis.
5. **Competência e folha:** eventos de ponto, cálculos homologados e bloqueio de competência.
6. **Integração externa:** exportação idempotente para ambiente de teste, somente após layout,
   credenciais, autorização de escrita e dry-run aprovados.

## 7. Limites desta decisão

Esta decisão não autoriza migration, backfill, mudança de fórmula financeira, escrita na planilha,
integração Conplus, deploy ou alteração histórica. Cada mudança de schema apresentará o SQL e terá
aprovação explícita antes de ser aplicada.
