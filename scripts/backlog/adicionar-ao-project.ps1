<#
.SYNOPSIS
  Adiciona ao GitHub Project as issues do backlog que JA FORAM CRIADAS.

.DESCRIPTION
  Use este script quando o `criar-issues.ps1` criou as issues mas falhou no passo
  do Project com "your authentication token is missing required scopes [read:project]".
  Ele NAO cria issue nenhuma - so pega as que ja existem e joga no board.

  Antes de rodar:
      gh auth refresh -s project,read:project
  (abre o navegador e pede confirmacao - o token atual e ampliado, voce nao perde a sessao)

.EXAMPLE
  .\adicionar-ao-project.ps1 -Repo ErasoumZe/SISTEMA_CAIXA -ProjectOwner ErasoumZe -ProjectNumber 1
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [Parameter(Mandatory = $true)][string]$ProjectOwner,
  [Parameter(Mandatory = $true)][int]$ProjectNumber
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) nao encontrado no PATH."
}

# Confere o escopo antes de tentar 98 vezes e falhar 98 vezes
$status = gh auth status 2>&1 | Out-String
if ($status -notmatch "project") {
  Write-Host ""
  Write-Host "  O token nao tem o escopo de project." -ForegroundColor Yellow
  Write-Host "  Rode isto primeiro e depois execute este script de novo:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "      gh auth refresh -s project,read:project" -ForegroundColor Cyan
  Write-Host ""
  exit 1
}

Write-Host ""
Write-Host "  Adicionando issues do backlog ao project $ProjectOwner/$ProjectNumber" -ForegroundColor Cyan

$lista = gh issue list --repo $Repo --state all --limit 500 --json number,title,url | ConvertFrom-Json
$doBacklog = $lista | Where-Object { $_.title -match '^\[[A-Z]+-\d+\]' } | Sort-Object number

Write-Host "  encontradas: $($doBacklog.Count) issues do backlog"
Write-Host ""

$ok = 0; $falhou = 0
foreach ($i in $doBacklog) {
  gh project item-add $ProjectNumber --owner $ProjectOwner --url $i.url 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host ("     ok      #{0} {1}" -f $i.number, $i.title) -ForegroundColor DarkGray
    $ok++
  }
  else {
    Write-Host ("     falhou  #{0} {1}" -f $i.number, $i.title) -ForegroundColor Red
    $falhou++
  }
}

Write-Host ""
Write-Host "  adicionadas: $ok   falharam: $falhou" -ForegroundColor Cyan
Write-Host ""
if ($ok -gt 0) {
  Write-Host "  Elas entram na coluna Todo. Abra o board:" -ForegroundColor DarkGray
  Write-Host "  https://github.com/users/$ProjectOwner/projects/$ProjectNumber" -ForegroundColor DarkGray
  Write-Host ""
}
