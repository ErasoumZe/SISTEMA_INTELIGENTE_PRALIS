# Sincronizacao de vendas CREARE -> ERP

Agente que le o banco do PDV **CREARE/Compilart** (MySQL, na propria loja) e envia as vendas para a
API do ERP (`POST /api/integracoes`). Roda na maquina da loja, de forma continua ou agendada.

## Pre-requisitos

- **Node.js 22+** na maquina da loja.
- Acesso ao **MySQL do CREARE** (mesma maquina ou rede local).
- **Saida HTTPS** para a API do ERP (internet).
- Uma **chave de integracao** (ver abaixo).

## 1. Configurar o `.env.producao`

Copie `.env.producao.example` para `.env.producao` (que fica fora do git) e preencha:

| Variavel                                              | Descricao                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `SERVIDOR_CREARE_COMPILART`                           | host do MySQL do CREARE (ex.: `localhost`)                     |
| `PORTA_CREARE_COMPILART`                              | porta (default `3306`)                                         |
| `BANCO_CREARE_COMPILART`                              | nome do banco (ex.: `gerente`)                                 |
| `USUARIO_CREARE_COMPILART` / `SENHA_CREARE_COMPILART` | credenciais do MySQL                                           |
| `PADARIA_API_URL`                                     | `https://api-sistema.cicluzieai.com.br`                        |
| `PADARIA_INTEGRACAO_CODIGO`                           | a chave de integracao (passo 2)                                |
| `SYNC_INTERVALO_MINUTOS`                              | intervalo do loop (default `10`)                               |
| `SYNC_DIAS_INICIAIS`                                  | 1a execucao: dias para tras (default `1`)                      |
| `SYNC_LOCK_MAX_MINUTOS`                               | idade maxima do lock (default `30`)                            |
| `SYNC_RETRY_TENTATIVAS` / `SYNC_RETRY_BASE_MS`        | retry de rede por venda (default `4` / `500`)                  |
| `SYNC_ESTADO_DIR`                                     | pasta do estado de runtime (default `.estado`)                 |
| `SYNC_FUSO_OFFSET`                                    | offset da loja para UTC (padrao `-03:00`, horario de Brasilia) |

## 2. Gerar a chave de integracao

No ERP, logado como admin: **Integracoes -> criar chave "Vendas do PDV"** -> copie o codigo -> cole
em `PADARIA_INTEGRACAO_CODIGO`.

## 3. Instalar e testar

```bash
npm ci            # instala a unica dependencia (mysql2)
npm run sincronizar   # roda UM ciclo (bom para o primeiro teste)
```

Cada ciclo imprime um resumo:

```
[sincronizar] recebidas=.. fila_reprocessada=.. criadas=.. atualizadas=.. sem_novidade=.. erros=.. fila_pendente=.. cursor=..
```

## Como funciona

- **Cursor incremental** (`.estado/cursor.json`): guarda a ultima venda processada; cada ciclo
  busca so o que e novo desde o cursor.
- **Idempotente**: reenviar a mesma venda nao duplica (o servidor deduplica por `idVenda` + hash),
  entao reprocessar e sempre seguro.
- **Fila de falhas** (`.estado/fila-falhas.json`): vendas que falharam por erro de rede ficam nela e
  sao reenviadas no inicio do proximo ciclo. Erros de payload (4xx) sao logados e nao entram na fila.
- **Lock** (`.estado/agente.lock`): impede duas execucoes simultaneas (loop + tarefa agendada + run
  manual). Um lock de processo morto ou obsoleto (> `SYNC_LOCK_MAX_MINUTOS`) e roubado.

## Rodar como servico no Windows

### Opcao A — NSSM (recomendado): loop continuo

1. Baixe o **NSSM** em nssm.cc e extraia.
2. `nssm install CicluzSincronizacao`
3. Na janela do NSSM:
   - **Application Path**: caminho do `node.exe` (ex.: `C:\Program Files\nodejs\node.exe`).
   - **Startup directory**: a pasta `integracoes-scripts`.
   - **Arguments**: `--env-file-if-exists=.env.producao src/loop.js`
   - Aba **I/O**: aponte _Output (stdout)_ e _Error (stderr)_ para um arquivo (ex.:
     `logs\sincronizacao.log`) para ter historico.
4. `nssm start CicluzSincronizacao`. O NSSM reinicia o processo se ele cair.
5. Para parar: `nssm stop CicluzSincronizacao` — envia sinal e o agente encerra com seguranca
   (termina o ciclo atual e libera o lock).

### Opcao B — Agendador de Tarefas: um ciclo periodico

1. Crie uma tarefa que executa, na pasta `integracoes-scripts`:
   `node.exe --env-file-if-exists=.env.producao src/sincronizar.js`
2. Gatilho: repetir a cada `SYNC_INTERVALO_MINUTOS`.
3. Marque **"Nao iniciar uma nova instancia"** se a anterior ainda estiver rodando (o lock ja cobre
   isso, mas some as duas protecoes).

## Reprocesso manual (recuperacao)

Ferramenta para **reenviar vendas que ficaram de fora** da ingestao (ex.: falharam durante um deploy).
Re-le do CREARE e reenvia para a API. E **idempotente**: vendas que ja existem voltam _sem novidade_ e
as que faltavam sao **criadas**. **Nao mexe** no cursor, na fila nem no lock — pode rodar com o
`agente`/`sincronizar` no ar.

```bash
# Reprocessa o dia inteiro (todas as vendas daquela data no CREARE)
npm run reprocessar -- --dia 2026-07-15

# Reprocessa apenas vendas especificas (por ID_VENDA_BALCAO do CREARE)
npm run reprocessar -- --ids 522987,523147,523369
```

Informe **exatamente um** alvo (`--dia` **ou** `--ids`). O comando loga o resultado **de cada venda** e
um resumo no fim:

```
[reprocessar] ids=522987,523147,523369: 3 venda(s) lida(s) no CREARE.
[reprocessar] CREARE:522987 -> CRIADA (estava faltando)
[reprocessar] CREARE:523147 -> sem novidade (ja existia igual)
[reprocessar] CREARE:523369 -> CRIADA (estava faltando)
[reprocessar] ids=522987,523147,523369 concluido: total=3 criadas=2 atualizadas=0 sem_novidade=1 erros=0
```

No modo `--ids`, um ID que nao existir no CREARE e avisado (`NAO ENCONTRADA`) e ignorado. Se alguma
venda falhar no envio, o comando sai com codigo != 0.

## Backfill inicial (opcional)

Para importar dias anteriores na primeira vez, rode uma vez com mais dias:

```bash
# Windows (cmd): set e npm em duas linhas
set SYNC_DIAS_INICIAIS=7
npm run sincronizar
```

Depois, o cursor assume e os ciclos seguintes so pegam o novo. Para reenviar dias/vendas pontuais
depois que o agente ja esta rodando, use o **reprocesso manual** acima (nao mexe no cursor).

## Estado (nao apagar)

A pasta `.estado/` guarda `cursor.json`, `fila-falhas.json` e `agente.lock`. Nao vai para o git.
Apagar o `cursor.json` faz o proximo ciclo reprocessar desde `SYNC_DIAS_INICIAIS` (seguro, mas gera
trafego). Nao apague com o agente rodando.

## Problemas comuns

- **`Chave de integracao invalida`**: `PADARIA_INTEGRACAO_CODIGO` errado ou inativado no ERP.
- **Erro de conexao MySQL**: confira `SERVIDOR/PORTA/USUARIO/SENHA_CREARE_COMPILART`.
- **`Nao foi possivel conectar na API`**: `PADARIA_API_URL` errada ou sem internet.
- **`fila_pendente` crescendo**: a API esta recusando (veja `erros` e as linhas de erro no log) ou a
  rede esta instavel; o agente segue reenviando a cada ciclo.

## Observacao sobre fuso horario

O CREARE guarda a hora **local**. O agente usa `SYNC_FUSO_OFFSET="-03:00"` por padrao para converter
o horario de Brasilia no instante UTC real, a mesma convencao usada pela abertura e pelo fechamento
do caixa. Altere a variavel apenas se a loja estiver em outro fuso. **Valide no primeiro dia real**
que as vendas caem no caixa certo.

## Modo desenvolvimento

`npm run dev:teste_integracao` (usa `.env.desenvolvimento`) reenvia as vendas do ultimo dia com a
data reescrita para hoje e prefixo `TESTE` no `idVenda` — util para testar a integracao sem sujar os
dados reais. Nao use em producao (para isso e o `sincronizar`/`agente`).
