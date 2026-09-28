# 47 — Efetivação, cadastro único e vínculos do colaborador

**Data:** 26/09/2026
**Estado:** E7 implementada em branch local, com migration candidata `0050` ainda não aplicada; depende de preflight
autorizado dos CPFs existentes e da validação final.
**Fontes:** decisão de Marco em 26/09/2026, documentos 35, 36, 39, 41 e 46, planilha `COLABORADORES (KAY)` analisada localmente e Manual do eSocial.

## 1. Decisão de identidade e recontratação

Há **uma pessoa/cadastro por CPF dentro da empresa**. O cadastro não é apagado quando o
colaborador sai: a interface o mostra como **inativo** e o DP continua podendo corrigir os seus dados
cadastrais.

Admissão e recontratação não são o mesmo que a pessoa. Cada uma cria um **vínculo histórico** próprio,
com matrícula própria, data de admissão, função, CBO, setor, turno, jornada, remuneração e contrato
daquele período. Um CPF não é duplicado para representar uma recontratação.

```text
Pessoa / colaborador (CPF único por empresa)
├── vínculo 2026-001 — desligado
└── vínculo 2027-014 — ativo (recontratação)
```

Isto preserva o passado e permite que a ficha de contato seja atualizada sem reescrever os termos de
um contrato encerrado. Também acompanha a orientação do eSocial: readmissão é novo vínculo e nova
matrícula. Reintegração judicial não é recontratação e terá ato próprio quando houver regra
operacional e jurídica para ela.

## 2. Um fluxo, uma tela principal

Não haverá cadastro direto paralelo. A única porta que cria um colaborador efetivo é a aprovação de
um processo de admissão:

```text
teste efetivado OU admissão direta
→ ASO apto
→ conferência dos dados básicos pelo DP
→ efetivar
→ pessoa + vínculo + primeira linha da timeline
→ dossiê documental manual no perfil
```

O botão **Efetivar** só aparece quando os fatos acima estiverem satisfeitos. Ele é idempotente: repetir
o clique devolve o mesmo resultado, nunca cria uma segunda pessoa ou vínculo.

O convite com link para o colaborador continua sendo uma coleta auxiliar já existente, mas **não bloqueia
a efetivação nesta fase** e não haverá envio automático por e-mail ou WhatsApp. Se o DP decidir usar o
convite, copia e entrega o link manualmente. O canal automático, consentimento, provedor, rastreio de
entrega e assinatura ficam para a vertical de contrato/assinatura.

Após efetivado, o DP trabalha na ficha única do colaborador. A tela mostra uma única ação principal de
acordo com o próximo item obrigatório, em vez de vários botões concorrentes.

## 3. Ficha do colaborador

### Visão geral

- nome e situação visível: **ativo** quando há vínculo vigente; **inativo** quando não há;
- função, setor, turno e matrícula do vínculo atual;
- indicador claro de pendências do dossiê;
- ação contextual: `Completar documentos`, `Gerar contrato`, `Entregar uniforme`, `Registrar ponto`,
  ou `Recontratar`.

### Abas da mesma ficha

| Aba                     | Responsabilidade                                                                             | Estado inicial                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Linha do tempo**      | fatos auditáveis da admissão, vínculo, checklist e alterações                                | entra na primeira entrega                                                          |
| **Dados cadastrais**    | pessoa: identificação, contato e endereço                                                    | entra na primeira entrega, com auditoria                                           |
| **Vínculos**            | admissão, desligamento, matrícula, função/CBO, setor, turno, jornada, remuneração e contrato | entra na primeira entrega                                                          |
| **Checklist**           | mostra o que é obrigatório, pendente, entregue, aprovado ou dispensado e quem fez cada ato   | entra como estrutura de fluxo; catálogo detalhado depende das regras de documentos |
| **Documentos e foto**   | dossiê, foto e anexos com versão e acesso restrito                                           | bloqueado até política LGPD/armazenamento/antimalware                              |
| **Contrato**            | modelo, geração, impressão, assinatura e envio                                               | bloqueado até modelo jurídico e provedor/forma de assinatura                       |
| **Uniforme/EPI**        | entrega, quantidade, recibo, devolução e baixa                                               | vertical posterior, ligada ao vínculo                                              |
| **Ponto e ocorrências** | batidas, ajustes, banco de horas e ausências                                                 | vertical posterior, após fonte oficial e regras de jornada                         |
| **Conplus**             | prévia, pendências e exportação auditável                                                    | vertical posterior, após layout/contrato homologado                                |

Nenhuma aba bloqueada terá botão que simula salvamento. Ela aparece apenas quando sua estrutura e
regras estiverem prontas para funcionar de ponta a ponta.

## 4. Linha do tempo e checklist

A timeline é append-only: ela não é um campo de observação solto. Cada fato registra ator, data/hora,
vínculo quando aplicável e referência ao objeto que o produziu. A primeira entrega cobre:

- processo aprovado e efetivação;
- criação, edição cadastral e alteração de situação do vínculo;
- recontratação e desligamento;
- mudanças de função/CBO, setor, turno, jornada e remuneração;
- mudança de item do checklist.

O checklist é o guia de trabalho do DP, não uma segunda máquina de status. Seu estado é derivado dos
fatos reais: por exemplo, um contrato só fica `concluído` depois de existir contrato gerado/assinado;
um documento só fica `concluído` depois de um dossiê válido. Não haverá contador digitado como
`05/12 documentos`.

## 5. Limites de dados e histórico

- Função de trabalho é `funcoes_operacionais`, nunca `cargos`/permissões de acesso.
- Nome e CBO da função, turno, jornada e termos de remuneração são retratos do vínculo; editar o
  catálogo ou o cadastro atual não reescreve o vínculo encerrado.
- Dados pessoais editáveis pertencem à pessoa. Alterações relevantes entram na timeline.
- Saúde não guarda diagnóstico. ASO informa aptidão no processo; atestado/afastamento exigem desenho
  separado de minimização, acesso e retenção.
- Não haverá migração que imponha CPF único antes de preflight autorizado: a tabela atual permite CPF
  nulo, duplicado ou fora de formato. Primeiro contar e revisar os casos reais; depois definir a
  constraint sem inventar correção histórica.

## 6. Pacotes de entrega

1. **E7 — Efetivação e vínculos:** retrato função/CBO, pessoa/cadastro, vínculos, status derivado,
   timeline, tela e permissão. É a primeira migration candidata e depende de preflight de CPF.
2. **E8 — Dossiê e checklist documental:** tipos, requisitos por vínculo, armazenamento privado,
   antivírus, retenção, descarte e logs de acesso.
3. **E9 — Contrato e assinatura:** modelos aprovados, campos de mesclagem, PDF, impressão, envio e
   assinatura; sem enviar por e-mail/WhatsApp antes de definir provedor, consentimento e evidência.
4. **E10 — Uniforme/EPI:** catálogo, entrega/devolução, recibo e histórico por vínculo.
5. **E11 — Ponto:** fonte oficial, batidas, ajustes auditados, jornada, ocorrências e regras de
   fechamento; não reutiliza a tabela legada como se fosse ponto oficial.
6. **E12 — Conplus:** staging revisável, mapeamento de catálogos, exportação idempotente e retorno de
   erro; nunca carga direta.

## 7. Próximo ato técnico

Antes de aplicar a migration `0050`, executar e revisar o preflight somente leitura de CPF existente e definir a
estratégia para não quebrar os cadastros operacionais atuais que ainda usam `colaboradores` em Caixa, despesas e
retiradas. Nenhum dado histórico será corrigido automaticamente.

### Correção técnica registrada em 27/09/2026

O CPF na tabela legada pode estar formatado ou apenas com dígitos. A unicidade e a busca da E7 devem usar a versão
normalizada (somente os 11 dígitos), nunca o texto cru; caso contrário, `123.456.789-09` e `12345678909` poderiam
virar dois cadastros da mesma pessoa. A migration candidata passou a criar índice único de CPF normalizado somente
para valores com 11 dígitos, e o serviço localiza o legado pela mesma normalização.

O preflight obrigatório passa a revisar, por empresa:

- duplicidades de CPF normalizado com 11 dígitos;
- valores não vazios que não resultam em 11 dígitos;
- CPF ausente;
- cadastros sem vínculo, que devem ser marcados na interface como **histórico a conciliar**, não como inativos.
