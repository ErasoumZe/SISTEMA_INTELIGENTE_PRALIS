# 31 — Admissão: período de teste (ADM-001)

> Aberto em 25/08/2026. Issue #161, branch `feat/admissoes-testes-tnp`. Piloto na **TNP**.
> Primeira fatia do módulo de Admissões. **Nada aqui cria colaborador operacional.**

## O que é, em uma linha

O DP registra um período de teste combinado com uma pessoa — nome, CPF, cargo, jornada, início e fim
— e decide o desfecho na mão. O sistema mostra o prazo passar e **nunca** age sozinho.

## A fronteira que sustenta o módulo

> **Admissão não é cadastro de colaborador.**

`admissoes_testes` não tem `colaborador_id`, não escreve em `colaboradores` e não efetiva ninguém —
nem quando o resultado é `aprovado_para_admissao`. Aprovar registra a **decisão do DP**; abrir a
admissão e criar/vincular o colaborador são verticais próprias, ainda não feitas.

As permissões seguem a mesma fronteira, nos dois sentidos: `cadastro_colaboradores_*` não abre nada
em Admissões, e `admissoes_testes_*` não abre nada no cadastro operacional.

## Decisões

### D-1 · Empresa é derivada, nunca escolhida

A empresa vem de `perfis_usuarios.empresa_id` e **só vale** se estiver dentro de
`empresasPermitidas`. Não há `empresaId` na query, no corpo, no path nem seletor na tela — os
contratos Zod deste módulo sequer têm o campo. É o único módulo do sistema assim.

Três recusas, todas **403** e todas fail-closed: sem perfil; perfil sem empresa; empresa do perfil
fora do escopo. **Nunca cair para `empresaIds[0]`** — seria adivinhar em qual empresa uma pessoa está
sendo avaliada.

O terceiro caso não é teórico: `perfis_usuarios.empresa_id` é gravado por caminho independente de
`usuarios_empresas` e **pode apontar para fora do escopo** — está documentado no próprio código, em
`api/src/usuarios/usuarios.service.ts`.

### D-2 · Ativo/Inativo é derivado, não é estado

Os estados técnicos são **três**: `em_teste`, `encerrado`, `cancelado`. A situação exibida é
derivada por `situacaoDoTeste`, em `shared`:

| Estado técnico | Situação |
| -------------- | -------- |
| `em_teste`     | Ativo    |
| `encerrado`    | Inativo  |
| `cancelado`    | Inativo  |

**Não existe coluna, enum, índice nem filtro paralelo de ativo/inativo.** Criar um seria a segunda
fonte de status que o `06_GAPS_E_DECISOES` já registrou como **SUPERADA** ("status Ativo/Inativo como
workflow"). A regra mora em `shared` porque a tela e o repositório precisam da mesma resposta.

Não há reabertura. `encerrado` e `cancelado` são terminais.

### D-3 · "Excluir" é cancelar e arquivar

O botão **Excluir** da tela chama `POST /api/admissoes/testes/:id/cancelar`. Exige um motivo da lista
fechada, sai da listagem padrão (que abre em Ativo) e **preserva o histórico inteiro**.

**Não existe exclusão física nesta vertical**, e não é só escolha de produto: o histórico referencia
a raiz com `on delete cascade`, então apagar a linha apagaria a própria auditoria junto.

Motivos fechados: `nao_aprovado_no_teste` · `sem_continuidade_apos_dia_de_teste`. Fechados de
propósito — motivo livre sobre pessoa em avaliação atrai justamente a PII que o módulo evita.

### D-4 · CPF: existe, é validado, e nunca circula

O DP preenche o CPF no pré-cadastro. Ele é normalizado para dígitos e validado por dígito
verificador — o **primeiro validador de CPF do monorepo**, em `shared/src/admissoes/cpf.ts`.

- **Nunca** em URL, query string, filtro ou busca GET. A busca da listagem localiza **só por nome**, e
  o campo se chama `buscaNome` para ninguém "melhorar" a busca aceitando documento depois.
- Localizar por CPF é `POST /api/admissoes/testes/verificar-cpf`, que responde **dois booleanos** —
  sem id, sem nome, sem vínculo.
- **Totalmente mascarado** na listagem. Nenhum dígito.
- No detalhe, revelar é um **ato explícito** que grava o evento `cpf_revelado` na trilha, na mesma
  transação da leitura: auditoria falhou, CPF não sai.
- Segundo teste `em_teste` com o mesmo CPF na mesma empresa é **bloqueado no banco**, por índice
  único parcial. Encerrado ou cancelado libera o CPF de volta.
- CPF que já existe em `colaboradores` **apenas avisa**, sem identificar ninguém.

### D-5 · O prazo avisa; quem decide é o DP

Alerta visual em **dois** casos apenas: *vence hoje* e *vencido*. Derivado no dia de negócio
(`America/Sao_Paulo`), nunca gravado em coluna. O sistema **não** encerra, não efetiva, não envia
convite e não notifica ninguém por conta do prazo.

### D-6 · Jornada/horário é texto livre — por ora

O Pralis **não tem** catálogo de jornada. `turnos` é turno (nome + hora início/fim) e
`colaboradores_jornadas` exige um colaborador que ainda não existe neste fluxo. A diferença entre
turno, jornada, escala e horário segue **em aberto com o DP**. Até fechar, texto livre — e não se
reutiliza `turnos` nem se inventa catálogo.

### D-7 · Quem opera

**DP** e **Gerência** recebem as cinco permissões. O administrador é o *role* `usuario_admin`, que já
recebe qualquer permissão nova do catálogo por `permissoesAcessoTotal` — não há o que conceder.

**Não existe cargo "ADM" no Pralis.** Os dez cargos reais são Caixa, Tesouraria, Gerencia, Compras,
DP, RH, Fiscal, Diretor de Operacoes, Diretor Geral e Financeiro.

`encerrar` é permissão **própria**, e não um caso de `editar`: encerrar exige resultado e é terminal.
Quem corrige um erro de digitação não é necessariamente quem decide o desfecho.

## Fora desta vertical

Convite e rota pública, formulário do candidato, documentos e anexos, dependentes, dados bancários e
contratuais, planilha, contabilidade, efetivação e qualquer escrita em `colaboradores`.

## Pendências

- **Documento de identidade com foto** (opcional e recomendado, JPEG/JPG, galeria ou câmera): falta
  fechar tamanho máximo, quem acessa, retenção, descarte e antivírus. **Nada foi implementado** — nem
  campo, nem upload, nem storage. A infraestrutura de arquivo já existe (`@fastify/multipart` e o
  padrão de `vendas_comprovantes`), mas **antimalware não existe no sistema hoje**.
- Catálogo de jornada (D-6).
- Momento e regra da efetivação, recontratação e CPF já existente como colaborador.
