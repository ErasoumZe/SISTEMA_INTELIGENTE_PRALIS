#!/usr/bin/env bash
# post-create.sh — Fase A do ambiente Codespaces do Pralis.
#
# Roda UMA vez, na criacao do Codespace:
#   1. neutraliza segredo herdado e aborta se DATABASE_URL nao for local;
#   2. fuso horario America/Sao_Paulo;
#   3. Postgres 16 local ao Codespace, escutando so em 127.0.0.1:5543;
#   4. dependencias do monorepo (npm ci) + build das libs internas;
#   5. schema e seed SINTETICOS de desenvolvimento.
#
# O QUE ESTE SCRIPT NUNCA FAZ (regra dura; nao afrouxe sem decisao do Jose):
#   - nao copia .env, .env.producao, .env.desenvolvimento nem qualquer credencial;
#   - nao baixa dump, backup, planilha, storage/ nem dado real da operacao;
#   - nao roda seed:planilha, planilha:inspecionar, seed:referencia:prod,
#     bootstrap:prod, bootstrap:contas-usuarios, backfill:codigos, baseline,
#     db:backup, db:restore, db:prod:up, compose:prod;
#   - nao roda nada de integracoes-scripts/ (MySQL do CREARE e API de producao);
#   - nao conecta em banco, PDV, webhook ou servico de producao;
#   - nao instala Docker/Docker-in-Docker (Fase A) nem navegadores do Playwright;
#   - nao sobe API nem web (quem sobe e voce, no terminal);
#   - nao grava .env no repositorio: o ambiente vive em ~/.pralis-codespace.env.

set -euo pipefail

PG_VERSAO="16"
PG_CLUSTER="main"
PG_PORTA="5543"
PG_USUARIO="padaria"
PG_SENHA="padaria"
PG_BANCO="padaria"

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "${AQUI}/.." && pwd)"
ARQUIVO_ENV="${HOME}/.pralis-codespace.env"

info() { printf '\033[36m[post-create]\033[0m %s\n' "$*"; }
aviso() { printf '\033[33m[post-create] AVISO:\033[0m %s\n' "$*"; }
erro() { printf '\033[31m[post-create] ERRO:\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# 0. Trava: so roda dentro de container/Codespace.
#    Instala pacote com sudo e reconfigura um cluster Postgres. Numa maquina de
#    trabalho isso mexeria no ambiente de desenvolvimento real.
# ---------------------------------------------------------------------------
if [ -z "${CODESPACES:-}" ] && [ ! -f /.dockerenv ] && [ ! -f /run/.containerenv ]; then
  erro "fora de container/Codespace. Abortado de proposito."
  erro "Este script instala pacotes e prepara um Postgres local. Nao rode na sua maquina."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Guarda de dado real.
#    Segredo configurado em Codespaces (repo, organizacao ou conta) entra como
#    variavel de ambiente em TODO Codespace. Se vier uma DATABASE_URL de
#    producao, o seed de desenvolvimento escreveria usuarios de teste no banco
#    da padaria: db/seed.ts so barra NODE_ENV=production, e aqui e development.
#    Por isso: abortar, nao contornar.
# ---------------------------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ] \
   && ! printf '%s' "${DATABASE_URL}" | grep -Eq '@(localhost|127\.0\.0\.1|\[::1\]|db):'; then
  erro "DATABASE_URL nao aponta para o banco local do Codespace."
  erro "Host recebido: $(printf '%s' "${DATABASE_URL}" | sed -E 's#^(.*)://[^@]*@#\1://***@#')"
  erro "Provavel segredo de Codespaces herdado. Remova em:"
  erro "  repo    -> Settings > Secrets and variables > Codespaces"
  erro "  conta   -> https://github.com/settings/codespaces"
  erro "Abortado antes de instalar ou semear qualquer coisa."
  exit 1
fi

# Segredos de producao que nao tem uso nenhum nesta fase. Se algum estiver
# configurado, ele some do ambiente do post-create em vez de ser usado por engano.
for VARIAVEL in ADMIN_SENHA ADMIN_EMAIL RESEND_API_KEY EMAIL_FROM \
                NOTAS_FISCAIS_URL NOTAS_FISCAIS_TOKEN \
                PADARIA_INTEGRACAO_CODIGO SENHA_CREARE_COMPILART SENTRY_DSN; do
  if [ -n "${!VARIAVEL:-}" ]; then
    aviso "'${VARIAVEL}' veio do ambiente e foi descartada nesta fase."
    unset "${VARIAVEL}"
  fi
done

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------
# 2. Fuso horario America/Sao_Paulo (o TZ do devcontainer.json cobre o Node).
# ---------------------------------------------------------------------------
info "fuso horario -> America/Sao_Paulo"
sudo ln -snf /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime
echo "America/Sao_Paulo" | sudo tee /etc/timezone >/dev/null

# ---------------------------------------------------------------------------
# 3. Postgres 16 do repositorio oficial PGDG (o Debian bookworm so traz o 15).
#    Servidor nativo do Codespace: sem Docker nesta fase.
# ---------------------------------------------------------------------------
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  info "instalando Postgres ${PG_VERSAO} (PGDG)..."
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends postgresql-common
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  sudo apt-get install -y --no-install-recommends \
    "postgresql-${PG_VERSAO}" "postgresql-client-${PG_VERSAO}"
else
  info "Postgres ja instalado."
fi

# Porta 5543 e escuta so em loopback. A porta nunca e encaminhada
# (devcontainer.json: portsAttributes."5543".onAutoForward = ignore).
info "cluster ${PG_VERSAO}/${PG_CLUSTER} -> 127.0.0.1:${PG_PORTA}"
sudo pg_conftool "${PG_VERSAO}" "${PG_CLUSTER}" set port "${PG_PORTA}"
sudo pg_conftool "${PG_VERSAO}" "${PG_CLUSTER}" set listen_addresses "'localhost'"
# O fuso do BANCO fica em UTC de proposito: e o que o postgres:16-alpine do
# docker-compose usa hoje, em dev e em producao. Mudar so aqui criaria uma
# divergencia de fuso que nao existe fora do Codespace.
sudo pg_conftool "${PG_VERSAO}" "${PG_CLUSTER}" set timezone "'UTC'"

sudo pg_ctlcluster "${PG_VERSAO}" "${PG_CLUSTER}" restart \
  || sudo pg_ctlcluster "${PG_VERSAO}" "${PG_CLUSTER}" start \
  || true

for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p "${PG_PORTA}" -q && break
  sleep 1
done
if ! pg_isready -h 127.0.0.1 -p "${PG_PORTA}" -q; then
  erro "Postgres nao respondeu em 127.0.0.1:${PG_PORTA}. Diagnostique com: sudo pg_lsclusters"
  exit 1
fi

# Papel e banco de desenvolvimento. Credencial sintetica, a mesma do .env.example,
# valida so dentro deste Codespace e alcancavel so por 127.0.0.1.
# SUPERUSER porque db/setup-dev.mjs e as migrations criam extensao (pgcrypto) e a
# funcao uuid_generate_v7(). Banco descartavel, loopback, dado sintetico.
info "papel e banco '${PG_USUARIO}' (sinteticos)"
sudo -u postgres psql -p "${PG_PORTA}" -v ON_ERROR_STOP=1 -q -f - <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'padaria') THEN
    CREATE ROLE padaria LOGIN PASSWORD 'padaria' SUPERUSER;
  ELSE
    ALTER ROLE padaria LOGIN PASSWORD 'padaria' SUPERUSER;
  END IF;
END
$$;
SQL

if ! sudo -u postgres psql -p "${PG_PORTA}" -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '${PG_BANCO}'" | grep -q 1; then
  sudo -u postgres createdb -p "${PG_PORTA}" -O "${PG_USUARIO}" "${PG_BANCO}"
  info "banco '${PG_BANCO}' criado."
else
  info "banco '${PG_BANCO}' ja existia."
fi

# ---------------------------------------------------------------------------
# 4. Dependencias do monorepo.
#    npm ci (nunca npm install) respeita o package-lock.json e cobre os 6
#    workspaces. Dispara "prepare" (husky) na raiz e "postinstall" (nuxt prepare)
#    no web-vue. NAO roda "npx playwright install": e2e nao entra na Fase A.
# ---------------------------------------------------------------------------
cd "${RAIZ}"
info "npm ci (pode levar alguns minutos)"
npm ci --no-audit --no-fund

# shared e db compilados: o ESLint tipado e o nuxt typecheck resolvem
# @padaria/shared e @padaria/db pelo dist/.
info "build das libs internas (shared + db)"
npm run build:libs

# ---------------------------------------------------------------------------
# 5. Ambiente do Codespace.
#    post-start.sh e a unica fonte das URLs derivadas — nao duplicamos a regra.
# ---------------------------------------------------------------------------
info "gerando ambiente do Codespace"
bash "${AQUI}/post-start.sh"

# shellcheck source=/dev/null
. "${ARQUIVO_ENV}"

# Ambiente pronto em todo terminal novo, sem gravar .env no repositorio.
if ! grep -qF ".pralis-codespace.env" "${HOME}/.bashrc" 2>/dev/null; then
  {
    echo ""
    echo "# Ambiente do Codespace do Pralis (.devcontainer/post-start.sh)"
    echo '[ -f "${HOME}/.pralis-codespace.env" ] && . "${HOME}/.pralis-codespace.env"'
  } >> "${HOME}/.bashrc"
  info "~/.bashrc passa a carregar ~/.pralis-codespace.env"
fi

# ---------------------------------------------------------------------------
# 6. Schema e seed SINTETICOS.
#    setup:dev -> db/setup-dev.mjs (drizzle-kit push --force): DDL, sem dado.
#    seed:dev  -> db/seed.ts: usuarios e movimento de desenvolvimento, sinteticos.
#    Nenhum dos dois le planilha, dump ou banco remoto.
# ---------------------------------------------------------------------------
info "schema de desenvolvimento"
if npm run setup:dev --workspace @padaria/db; then
  info "seed sintetico de desenvolvimento"
  if npm run seed:dev --workspace @padaria/db; then
    info "banco de desenvolvimento pronto."
  else
    aviso "seed falhou. Refaca com: source ~/.pralis-codespace.env"
    aviso "  && npm run seed:dev --workspace @padaria/db"
  fi
else
  aviso "schema falhou. Refaca com: source ~/.pralis-codespace.env"
  aviso "  && npm run setup:dev --workspace @padaria/db"
fi

cat <<'FIM'

[post-create] Fase A concluida.

  Postgres 16  : 127.0.0.1:5543  (local ao Codespace, porta NUNCA encaminhada)
  Portas       : 5174 (web) e 4100 (API), ambas privadas
  Ambiente     : ~/.pralis-codespace.env (carregado pelo ~/.bashrc)

  Sem Docker. Sem dado real. Nenhum .env do projeto foi copiado.

FIM
