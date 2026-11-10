# 60 — WhatsApp do Compras pela Evolution API (R-235) — 10/11/2026

**Decisão do José (10/11/2026):** o WhatsApp do Compras deixa a **Meta WhatsApp Cloud API** e passa a sair pela **Evolution API**. A Meta foi **removida** do sistema; não ficam dois caminhos. Vale só para o S1 (este repositório); o S2 fica de fora por enquanto.

## 1. O que o sistema faz (não mudou)

O Compras manda pelo WhatsApp, por uma fila processada no tick de Compras (doc 57 §3):

- **convite:** o link da cotação para o fornecedor. Cada envio gera um token novo, e o link antigo deixa de valer;
- **pedido confirmado:** o "pode entregar", com o resumo dos itens.

Sem provedor configurado, nada sai: a fila espera e a tela avisa ("WhatsApp não conectado"). A fila tenta 5 vezes por mensagem; depois fica "Falhou" e o comprador reenvia.

## 2. O que mudou no código

| Antes (Meta)                                                                                       | Agora (Evolution)                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WHATSAPP_PROVEDOR=meta`, modelos aprovados (`cotacao_compra`, `pedido_confirmado`) com parâmetros | `WHATSAPP_PROVEDOR=evolution`: o **texto pronto** sai como está (`POST {URL}/message/sendText/{INSTANCIA}`, cabeçalho `apikey`, corpo `{ number, text }`) |
| 8 variáveis `WHATSAPP_META_*`                                                                      | 4 variáveis `WHATSAPP_EVOLUTION_*` (seção 4)                                                                                                              |
| Callback `GET/POST /api/whatsapp/meta/webhook` (HMAC da Meta)                                      | Callback `POST /api/whatsapp/evolution/webhook`, autenticado por `Authorization: Bearer <segredo>`                                                        |
| `parametroDeModelo` (regras de texto da Meta)                                                      | removido                                                                                                                                                  |

**O que continua igual:**

- o provedor `webhook` (gateway genérico: n8n, Z-API) e o `teste`;
- a fila;
- o banco: não há migration;
- a tela.

**Arquivos:**

- `api/src/whatsapp/whatsapp-provedor.ts`;
- `api/src/whatsapp/evolution-webhook.controller.ts` (o `meta-webhook.controller.ts` foi apagado);
- `api/src/env.ts`;
- `api/src/app.ts`;
- os 3 `infra/docker-compose.*.yml`;
- `web-vue/public/politica-de-privacidade.html`;
- os testes `tests/unit/evolution-webhook.test.ts`, `whatsapp-provedor-evolution.test.ts`, `compose-env-whatsapp.test.ts`, `whatsapp-texto.test.ts`, `tests/integration/compras/fluxo-jose.test.ts` e `tests/integration/seguranca/default-deny.test.ts`.

**Segurança no boot:** um ambiente que ainda tenha `WHATSAPP_PROVEDOR=meta` **sobe com o envio desligado** e escreve um aviso no log, em vez de derrubar a API (o Caixa roda todo dia). As variáveis `WHATSAPP_META_*` que sobrarem no Coolify são ignoradas.

**Privacidade no log:** o callback grava só o id e o status da mensagem. Nunca grava o telefone (o `remoteJid` é o número), o conteúdo nem o `apikey` que a Evolution manda no corpo. No erro de envio gravado na fila, "número sem WhatsApp" aparece como **"Número sem WhatsApp"**, sem o telefone.

## 3. Roteiro para ligar (José / Marco executam; nada disso é automático)

> Os passos 3.1 e 3.2 mexem em servidor e em conta de WhatsApp: são do José/Marco. O Claude não digita chave, token ou senha.

### 3.1 Subir a Evolution API v2 no Coolify

1. Criar o serviço pela **imagem oficial da Evolution API v2**. Conferir no repositório oficial (`EvolutionAPI/evolution-api`) o nome e a versão atuais da imagem; não usar `latest`.
2. Ela precisa de um **Postgres** (e, de preferência, Redis) próprio. Não usar o banco do S1.
3. Variáveis principais da Evolution, conforme a documentação oficial:
   - a chave global de administração (`AUTHENTICATION_API_KEY`): segredo forte, só no Coolify;
   - a URL pública do serviço (`SERVER_URL`);
   - a conexão com o banco dela.
4. Expor com **HTTPS** num domínio próprio (ex.: `evolution.<domínio>`). Conferir que `GET /` responde.

### 3.2 Criar a instância e conectar o número

1. **Usar um número dedicado** da empresa, não um pessoal (ver riscos, seção 5).
2. Criar a instância (ex.: `compras-tnp`) pelo painel (Manager) ou por `POST /instance/create` com a chave global (`integration: WHATSAPP-BAILEYS`, `qrcode: true`).
3. Ler o **QR code** pelo celular desse número: WhatsApp → Aparelhos conectados → Conectar aparelho.
4. Guardar o **token da instância** (`apikey` dela): é o que o S1 usa para enviar.

### 3.3 Configurar o callback de status

`POST /webhook/set/{instancia}`, com:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://<API pública do S1>/api/whatsapp/evolution/webhook",
    "headers": { "authorization": "Bearer <WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO>" },
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPDATE"]
  }
}
```

- Só o evento **MESSAGES_UPDATE**. Outros eventos são aceitos e ignorados, mas geram tráfego à toa; `MESSAGES_UPSERT` com base64 manda mídia inteira.
- Se a versão instalada **não** aceitar `headers` no webhook, a rota responde 403 e só se perde o log de status. O envio funciona igual. Nesse caso, atualizar a Evolution.

### 3.4 Variáveis do S1 no Coolify (serviço `api`)

| Variável                             | Valor                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `WHATSAPP_PROVEDOR`                  | `evolution`                                                                    |
| `WHATSAPP_EVOLUTION_URL`             | URL da Evolution, sem rota (ex.: `https://evolution.<domínio>`)                |
| `WHATSAPP_EVOLUTION_API_KEY`         | token da instância (**segredo**)                                               |
| `WHATSAPP_EVOLUTION_INSTANCIA`       | nome da instância (ex.: `compras-tnp`)                                         |
| `WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO` | segredo aleatório longo, de 32+ caracteres (**segredo**); o mesmo do passo 3.3 |

Depois: **apagar** as `WHATSAPP_META_*` do Coolify (já não são lidas) e **desligar o app/webhook no painel da Meta**.

### 3.5 Conferir

1. Cadastrar um fornecedor de teste com o **seu** WhatsApp e mandar uma cotação.
2. Ver a mensagem chegar com o link; abrir o link (a rodada pública deve abrir).
3. No sistema, o convite deve ficar **Enviado**.
4. No log da API, ver as linhas `whatsapp evolution status` (SERVER_ACK, DELIVERY_ACK, READ).

## 4. Variáveis (resumo)

`WHATSAPP_PROVEDOR` (`desligado` | `evolution` | `webhook` | `teste`), `WHATSAPP_EVOLUTION_URL`, `WHATSAPP_EVOLUTION_API_KEY`, `WHATSAPP_EVOLUTION_INSTANCIA`, `WHATSAPP_EVOLUTION_WEBHOOK_SEGREDO`, e, só para o gateway genérico, `WHATSAPP_WEBHOOK_URL` e `WHATSAPP_WEBHOOK_TOKEN`. O teste `compose-env-whatsapp` trava que toda variável `WHATSAPP_` lida pelo `env.ts` esteja nos três compose.

## 5. Riscos (para o José saber)

1. **Não é a API oficial.** A Evolution conecta pelo protocolo do WhatsApp Web. O WhatsApp pode **bloquear o número**, principalmente com muitas mensagens para quem não tem o número salvo. Por isso: número dedicado, volume baixo (o envio é de cotação a fornecedores conhecidos) e nada de disparo em massa.
2. **O número precisa ficar conectado.** Se o celular sair, o aparelho for desconectado ou a sessão cair, os envios falham (a fila marca "Falhou" e o comprador reenvia). Hoje a tela diz "conectado" pela **configuração**, não pelo estado real da instância. Um aviso de "instância desconectada" é melhoria futura (`GET /instance/connectionState/{instancia}`).
3. **Sem modelo aprovado:** o texto sai como está. Mudança de texto é mudança de código (`compras-whatsapp.service.ts`), sem aprovação da Meta.
4. **Política de privacidade:** atualizada para dizer que as mensagens saem por um serviço de integração hospedado pela própria empresa e são entregues pelo WhatsApp.
