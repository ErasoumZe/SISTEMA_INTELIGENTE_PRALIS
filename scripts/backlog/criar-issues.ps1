<#
.SYNOPSIS
  Cria no GitHub todas as issues do backlog de 05/08/2026 e as adiciona ao Project.

.DESCRIPTION
  Le scripts/backlog/backlog-2026-08-05.json e cria labels, milestones e issues.
  E IDEMPOTENTE: rodar de novo nao duplica nada. Cada issue leva o id do backlog
  no titulo (ex.: "[D-02] UNIQUE em vendas..."), e e por ele que o script reconhece
  o que ja existe.

.EXAMPLE
  # Simulacao — nao cria nada, so mostra o que faria
  .\criar-issues.ps1 -Repo ErasoumZe/SISTEMA_CAIXA -ProjectOwner ErasoumZe -ProjectNumber 1 -DryRun

.EXAMPLE
  # Execucao real
  .\criar-issues.ps1 -Repo ErasoumZe/SISTEMA_CAIXA -ProjectOwner ErasoumZe -ProjectNumber 1

.NOTES
  Pre-requisitos:
    1. GitHub CLI instalado    -> https://cli.github.com
    2. Autenticado com escopo de project:
         gh auth login
         gh auth refresh -s project,read:project
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$ProjectOwner = "",
  [int]$ProjectNumber = 0,
  [ValidateSet("todos", "ze", "marco", "kaylane")][string]$Dono = "todos",
  [string]$Milestone = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
$arquivo = Join-Path $PSScriptRoot "backlog-2026-08-05.json"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) nao encontrado. Instale em https://cli.github.com e rode 'gh auth login'."
}
if (-not (Test-Path $arquivo)) { throw "Backlog nao encontrado em $arquivo" }

$tarefas = Get-Content $arquivo -Raw -Encoding utf8 | ConvertFrom-Json
if ($Dono -ne "todos") { $tarefas = $tarefas | Where-Object { $_.dono -eq $Dono } }
if ($Milestone -ne "") { $tarefas = $tarefas | Where-Object { $_.milestone -like "*$Milestone*" } }

Write-Host ""
Write-Host "  Backlog Pralis - 05/08/2026" -ForegroundColor Cyan
Write-Host "  repositorio : $Repo"
Write-Host "  tarefas     : $($tarefas.Count)"
if ($ProjectNumber -gt 0) { Write-Host "  project     : $ProjectOwner/$ProjectNumber" }
if ($DryRun) { Write-Host "  MODO SIMULACAO - nada sera criado" -ForegroundColor Yellow }
Write-Host ""

# ---------------------------------------------------------------- labels
$labels = @(
  @{ n = "dono: ze";        c = "0e8a16"; d = "Responsavel: Jose" },
  @{ n = "dono: marco";     c = "1d76db"; d = "Responsavel: Marco" },
  @{ n = "dono: kaylane";   c = "8b5cf6"; d = "Responsavel: Kaylane" },
  @{ n = "P0";              c = "b60205"; d = "Critico - dinheiro, seguranca ou operacao parada" },
  @{ n = "P1";              c = "d93f0b"; d = "Alto - entra na proxima rodada" },
  @{ n = "P2";              c = "fbca04"; d = "Medio" },
  @{ n = "P3";              c = "c2e0c6"; d = "Baixo - higiene" },
  @{ n = "area: dinheiro";  c = "5319e7"; d = "Toca formula, saldo ou movimentacao de dinheiro" },
  @{ n = "area: seguranca"; c = "b60205"; d = "Autenticacao, autorizacao, entrada nao confiavel" },
  @{ n = "area: permissoes";c = "d4c5f9"; d = "Catalogo, cargos, guards" },
  @{ n = "area: integracao";c = "006b75"; d = "Agente do CREARE e ingestao de venda" },
  @{ n = "area: front";     c = "1d76db"; d = "web-vue" },
  @{ n = "area: db";        c = "0052cc"; d = "Schema, migration, indice, retencao" },
  @{ n = "area: infra";     c = "5319e7"; d = "Docker, Coolify, observabilidade, backup" },
  @{ n = "area: ci";        c = "0e8a16"; d = "Pipeline e gates de qualidade" },
  @{ n = "area: teste";     c = "0e8a16"; d = "Cobertura e testes automatizados" },
  @{ n = "area: bug";       c = "e11d21"; d = "Defeito visto em uso real" },
  @{ n = "area: decisao";   c = "fef2c0"; d = "Depende de decisao do Jose ou do Rodrigo" },
  @{ n = "area: produtos";  c = "bfd4f2"; d = "Cadastro de produtos" },
  @{ n = "area: estoque";   c = "bfd4f2"; d = "Estoque e pedidos" },
  @{ n = "area: relatorios";c = "bfd4f2"; d = "Relatorios e BI" },
  @{ n = "area: docs";      c = "d4c5f9"; d = "PROJECT_BRAIN e documentacao" },
  @{ n = "area: higiene";   c = "c2e0c6"; d = "Limpeza de codigo morto" },
  @{ n = "area: limpeza";   c = "c2e0c6"; d = "Remocao de legado" }
)

Write-Host "==> labels" -ForegroundColor Cyan
foreach ($l in $labels) {
  if ($DryRun) { Write-Host "     [simulado] $($l.n)"; continue }
  gh label create $l.n --repo $Repo --color $l.c --description $l.d --force 2>$null | Out-Null
  Write-Host "     ok  $($l.n)" -ForegroundColor DarkGray
}

# ------------------------------------------------------------ milestones
$descricoes = @{
  "M0 - Gates e higiene"        = "Barato e de alto retorno. Cinco checagens ja escritas nao rodam em gate nenhum. Cabe em uma tarde."
  "M1 - Dinheiro"               = "Ingestao de venda e formula de caixa. Fazer ANTES de qualquer modulo novo."
  "M2 - Seguranca e permissoes" = "Escalada de privilegio, injecao em ILIKE, trilha de auditoria e a auditoria de permissoes."
  "M3 - Bugs da reuniao"        = "Defeitos vistos ao vivo em 04/08. Tres deles impedem criar usuario e dar acesso a alguem."
  "M4 - Continuidade e operacao"= "Backup, retencao, lock do agente, rate limit e observabilidade."
  "M5 - Front"                  = "Poder mexer no front sem medo: unificar as cascas, quebrar o god-component, E2E e responsividade."
  "M6 - Decisoes"               = "Depende do Jose ou do Rodrigo. Cada uma trava trabalho a jusante."
  "M7 - Compras"                = "Segunda prioridade do Rodrigo: cadastro de produtos com estoque, pedidos e Curva ABC."
  "M8 - Higiene documental"     = "Ambiguidade e defasagem no PROJECT_BRAIN."
}

Write-Host ""
Write-Host "==> milestones" -ForegroundColor Cyan
$milestonesExistentes = @{}
if (-not $DryRun) {
  $json = gh api "repos/$Repo/milestones?state=all&per_page=100" 2>$null
  if ($LASTEXITCODE -eq 0 -and $json) {
    foreach ($m in ($json | ConvertFrom-Json)) { $milestonesExistentes[$m.title] = $m.number }
  }
}
foreach ($titulo in ($tarefas.milestone | Sort-Object -Unique)) {
  if ($milestonesExistentes.ContainsKey($titulo)) {
    Write-Host "     ja existe  $titulo" -ForegroundColor DarkGray
    continue
  }
  if ($DryRun) { Write-Host "     [simulado] $titulo"; continue }
  $d = $descricoes[$titulo]
  $r = gh api "repos/$Repo/milestones" -f title="$titulo" -f description="$d" 2>$null | ConvertFrom-Json
  $milestonesExistentes[$titulo] = $r.number
  Write-Host "     criado     $titulo" -ForegroundColor Green
}

# ---------------------------------------------------------------- issues
Write-Host ""
Write-Host "==> issues" -ForegroundColor Cyan

$existentes = @{}
if (-not $DryRun) {
  $lista = gh issue list --repo $Repo --state all --limit 500 --json number,title 2>$null
  if ($LASTEXITCODE -eq 0 -and $lista) {
    foreach ($i in ($lista | ConvertFrom-Json)) {
      if ($i.title -match '^\[([A-Z]+-\d+)\]') { $existentes[$Matches[1]] = $i.number }
    }
  }
}

$criadas = 0; $puladas = 0; $urls = @()

foreach ($t in $tarefas) {
  if ($existentes.ContainsKey($t.id)) {
    Write-Host ("     pulado   [{0}] ja existe como #{1}" -f $t.id, $existentes[$t.id]) -ForegroundColor DarkGray
    $puladas++
    continue
  }

  $titulo = "[$($t.id)] $($t.titulo)"
  $corpo = @"
> **$($t.milestone)**  ·  prioridade **$($t.prioridade)**  ·  dono **$($t.dono)**
> Referencia: $($t.referencia)

## Contexto

$($t.contexto)

## O que fazer

$($t.fazer)

## Criterio de aceite

$($t.aceite)

---

<details>
<summary>Regras do projeto que valem para esta tarefa</summary>

- **Regra-mae (R-114):** nada e "pronto" enquanto o caminho antigo ainda existir. Removido, nao escondido.
- **Definition of Done:** caminho antigo removido · zero duplicidade · responsivo em 1440/1024/768/390 · ``lint`` + ``check`` + testes verdes · resumo honesto do que fez e do que nao fez.
- **Entrega vertical:** tela + backend + teste + remocao do antigo. Se nao couber, quebre em duas entregas completas, nunca em duas metades.
- **PARE e pergunte** antes de: aplicar migration (mostre o SQL - R-111) · mudar formula de dinheiro · ``UPDATE`` em dado historico (mostre contagem e amostra - R-112) · quando a instrucao conflitar com o codigo.
- **NAO MERGEIE (R-110).** O Jose testa local e decide o deploy. Lembre que o push na ``main`` publica sozinho no Coolify.
- **Commite cada passo** (R-113), mesmo incompleto.
- Contexto completo: ``AGENTS.md``, ``PROJECT_BRAIN/00_INDICE.md`` e os agentes em ``.claude/agents/pralis-*.md``.

</details>
"@

  $labelsIssue = @("dono: $($t.dono)", $t.prioridade, "area: $($t.area)")

  if ($DryRun) {
    Write-Host ("     [simulado] {0}" -f $titulo)
    $criadas++
    continue
  }

  $tmp = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $tmp -Value $corpo -Encoding utf8
  try {
    $args = @("issue", "create", "--repo", $Repo, "--title", $titulo, "--body-file", $tmp, "--milestone", $t.milestone)
    foreach ($l in $labelsIssue) { $args += @("--label", $l) }
    $url = & gh @args 2>&1 | Select-Object -Last 1
    if ($LASTEXITCODE -ne 0) { throw "$url" }
    Write-Host ("     criada   {0}" -f $titulo) -ForegroundColor Green
    $urls += $url
    $criadas++
  }
  catch {
    Write-Host ("     FALHOU   {0}`n              {1}" -f $titulo, $_) -ForegroundColor Red
  }
  finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

# --------------------------------------------------------------- project
if ($ProjectNumber -gt 0 -and $urls.Count -gt 0 -and -not $DryRun) {
  Write-Host ""
  Write-Host "==> adicionando ao project $ProjectOwner/$ProjectNumber" -ForegroundColor Cyan
  foreach ($u in $urls) {
    gh project item-add $ProjectNumber --owner $ProjectOwner --url $u 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "     ok  $u" -ForegroundColor DarkGray }
    else { Write-Host "     falhou (rode: gh auth refresh -s project) $u" -ForegroundColor Yellow }
  }
}

Write-Host ""
Write-Host "  criadas: $criadas   ja existiam: $puladas" -ForegroundColor Cyan
if ($DryRun) { Write-Host "  Simulacao. Rode de novo sem -DryRun para criar de verdade." -ForegroundColor Yellow }
Write-Host ""
