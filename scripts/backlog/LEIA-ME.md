# Backlog de 05/08/2026 — como subir para o GitHub

98 tarefas cobrindo todos os achados das auditorias. Divididas entre José, Marco e Kaylane.

| Arquivo                     | O que é                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `backlog-2026-08-05.json`   | a fonte de verdade — edite aqui se quiser mudar algo            |
| `criar-issues.ps1`          | cria labels, milestones e issues, e adiciona ao Project         |
| `PROJECT_BRAIN/25_BACKLOG_2026_08_05.md` | a versão legível, para consulta e para o time     |

## Pré-requisitos

```powershell
winget install GitHub.cli      # se ainda não tiver
gh auth login
gh auth refresh -s project,read:project   # necessário para adicionar ao Project
```

## Uso

**Sempre rode a simulação primeiro.** Ela não cria nada.

```powershell
cd scripts\backlog
.\criar-issues.ps1 -Repo ErasoumZe/SISTEMA_CAIXA -ProjectOwner ErasoumZe -ProjectNumber 1 -DryRun
```

Conferido, rode de verdade:

```powershell
.\criar-issues.ps1 -Repo ErasoumZe/SISTEMA_CAIXA -ProjectOwner ErasoumZe -ProjectNumber 1
```

**Ajuste `-Repo`** se o nome do repositório for outro — o `ErasoumZe/SISTEMA_CAIXA` é um palpite pelo
nome da pasta. `-ProjectNumber 1` veio da URL `github.com/users/ErasoumZe/projects/1`.

### Subir por partes

Se 98 issues de uma vez for demais, filtre:

```powershell
.\criar-issues.ps1 -Repo ... -Dono kaylane                    # só as da Kaylane
.\criar-issues.ps1 -Repo ... -Milestone "M1"                  # só o milestone de dinheiro
.\criar-issues.ps1 -Repo ... -Dono ze -Milestone "M6"         # só as decisões do José
```

Os filtros combinam. Rodar o script de novo **não duplica nada** — ele reconhece as issues já criadas
pelo id no título (`[D-02] ...`) e pula.

## O que é criado

**24 labels:** `dono: ze` · `dono: marco` · `dono: kaylane` · `P0` a `P3` · e 16 de área
(`area: dinheiro`, `area: seguranca`, `area: integracao`, `area: front`, `area: db`, `area: infra`,
`area: ci`, `area: teste`, `area: bug`, `area: decisao`, `area: permissoes`, `area: produtos`,
`area: estoque`, `area: relatorios`, `area: docs`, `area: higiene`, `area: limpeza`).

**9 milestones**, na ordem em que fazem sentido ser atacados:

| Milestone                     | Tarefas | Do que se trata                                          |
| ----------------------------- | ------: | -------------------------------------------------------- |
| M0 — Gates e higiene          |      10 | cinco checagens já escritas que não rodam em gate nenhum   |
| M1 — Dinheiro                 |      12 | ingestão de venda e fórmula de caixa                       |
| M2 — Segurança e permissões   |      18 | escalada de privilégio, injeção em `ILIKE`, auditoria      |
| M3 — Bugs da reunião          |       7 | defeitos vistos ao vivo em 04/08                           |
| M4 — Continuidade e operação  |       7 | backup, retenção, lock do agente, rate limit               |
| M5 — Front                    |      17 | unificar cascas, quebrar o god-component, E2E              |
| M6 — Decisões                 |      13 | dependem do José ou do Rodrigo                             |
| M7 — Compras                  |      10 | produtos com estoque, pedidos, Curva ABC                   |
| M8 — Higiene documental       |       4 | ambiguidade e defasagem no brain                           |

Cada issue leva contexto com `arquivo:linha`, o que fazer, critério de aceite, e um bloco recolhido
com as regras do projeto (regra-mãe, Definition of Done, quando parar e perguntar, e o lembrete de
que push na `main` publica sozinho no Coolify).

## Sem assignee, de propósito

As issues saem com **label de dono**, não com assignee — assim Marco e Kaylane não precisam já estar
no repositório. Para atribuir de verdade depois:

```powershell
gh issue list --repo ErasoumZe/SISTEMA_CAIXA --label "dono: marco" --json number `
  | ConvertFrom-Json | ForEach-Object { gh issue edit $_.number --repo ErasoumZe/SISTEMA_CAIXA --add-assignee USUARIO }
```

## Se algo der errado

- **`gh: command not found`** — instale o GitHub CLI e reabra o terminal.
- **falha ao adicionar ao Project** — falta escopo: `gh auth refresh -s project,read:project`.
- **`could not add label`** — a label não foi criada; rode o script inteiro, não só a parte de issues.
- **quer recomeçar** — feche ou apague as issues no GitHub e rode de novo; o script recria só o que faltar.
