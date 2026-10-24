param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$columns = @(
  'NOVO - NOME SOCIAL',
  'NOVO - RACA/COR',
  'NOVO - GRAU DE INSTRUCAO',
  'NOVO - RG NUMERO',
  'NOVO - RG ORGAO EMISSOR',
  'NOVO - RG UF',
  'NOVO - RG DATA DE EMISSAO',
  'NOVO - TITULO ELEITOR',
  'NOVO - TITULO ZONA',
  'NOVO - TITULO SECAO',
  'NOVO - DIGITO CONTA',
  'NOVO - COMPLEMENTO',
  'NOVO - POSSUI DEPENDENTES',
  'NOVO - DEPENDENTE NOME',
  'NOVO - DEPENDENTE NASCIMENTO',
  'NOVO - DEPENDENTE PARENTESCO',
  'NOVO - DEPENDENTE CPF',
  'NOVO - DEPENDENTE FINALIDADES',
  'NOVO - VERSAO AVISO PRIVACIDADE',
  'NOVO - DATA ACEITE LGPD',
  'NOVO - STATUS FICHA',
  'NOVO - PENDENCIAS FICHA'
)

function Get-EntryText($zip, $name) {
  $entry = $zip.GetEntry($name)
  if ($null -eq $entry) { throw "Entrada ausente no XLSX: $name" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Escape-Xml([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

function ColumnName([int]$index) {
  $n = $index
  $result = ''
  do {
    $result = [char][int](65 + ($n % 26)) + $result
    $n = [int]([math]::Floor($n / 26) - 1)
  } while ($n -ge 0)
  return $result
}

$inputFull = [IO.Path]::GetFullPath($InputPath)
$outputFull = [IO.Path]::GetFullPath($OutputPath)
if ($inputFull -eq $outputFull) { throw 'O arquivo original não será sobrescrito.' }
if (Test-Path -LiteralPath $outputFull) { Remove-Item -LiteralPath $outputFull -Force }

$source = [IO.Compression.ZipFile]::OpenRead($inputFull)
$temp = "$outputFull.tmp"
$sheetTemp = "$outputFull.sheet26.tmp"
try {
  $sheetXml = Get-EntryText $source 'xl/worksheets/sheet26.xml'
  $rowMatch = [regex]::Match($sheetXml, '<row r="5"[\s\S]*?</row>')
  if (-not $rowMatch.Success) { throw 'A linha 5 da aba colab.tnp (filter) não foi encontrada.' }
  $cells = New-Object Text.StringBuilder
  for ($i = 0; $i -lt $columns.Count; $i++) {
    $ref = "$(ColumnName (75 + $i))5"
    $escaped = Escape-Xml $columns[$i]
    [void]$cells.Append(('<c r="{0}" t="inlineStr"><is><t>{1}</t></is></c>' -f $ref, $escaped))
  }
  $replacement = $rowMatch.Value -replace '</row>$', ($cells.ToString() + '</row>')
  $sheetXml = $sheetXml.Substring(0, $rowMatch.Index) + $replacement + $sheetXml.Substring($rowMatch.Index + $rowMatch.Length)
  [IO.File]::WriteAllText($sheetTemp, $sheetXml, (New-Object Text.UTF8Encoding($false)))

  $dest = [IO.Compression.ZipFile]::Open($temp, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($entry in $source.Entries) {
      $newEntry = $dest.CreateEntry($entry.FullName, [IO.Compression.CompressionLevel]::Optimal)
      $outStream = $newEntry.Open()
      try {
        if ($entry.FullName -eq 'xl/worksheets/sheet26.xml') {
          $inStream = [IO.File]::OpenRead($sheetTemp)
          try { $inStream.CopyTo($outStream) } finally { $inStream.Dispose() }
        } else {
          $inStream = $entry.Open()
          try { $inStream.CopyTo($outStream) } finally { $inStream.Dispose() }
        }
      } finally { $outStream.Dispose() }
    }
  } finally { $dest.Dispose() }
} finally {
  $source.Dispose()
  if (Test-Path -LiteralPath $sheetTemp) { Remove-Item -LiteralPath $sheetTemp -Force -ErrorAction SilentlyContinue }
}

Move-Item -LiteralPath $temp -Destination $outputFull -Force
Write-Output "Criado: $outputFull"
Write-Output "Colunas adicionadas: $($columns.Count)"
