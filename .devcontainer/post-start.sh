#!/usr/bin/env bash
# post-start.sh — Fase A do ambiente Codespaces do Pralis.
#
# Roda a cada start do Codespace (e uma vez, chamado pelo post-create.sh).
# Faz duas coisas, so:
#   1. garante o Postgres 16 local de pe em 127.0.0.1:5543;
#   2. deriva as URLs privadas do Codespace e grava ~/.pralis-codespace.env.
#
# NAO sobe API, NAO sobe web, NAO roda migration, NAO roda seed, NAO roda build
# nem teste. NAO grava .env no repositorio: o arquivo de ambiente vive em $HOME,
# fora da arvore git.

set -euo pipefail

PG_VERSAO="16"
PG_CLUSTER="main"
PG_PORTA="5543"
PORTA_WEB="5174"
PORTA_API="4100"
ARQUIVO_ENV="${HOME}/.pralis-codespace.env"

info() { printf '\033[36m[post-start]\033[0m %s\n' "$*"; }
aviso() { printf '\033[33m[post-start] AVISO:\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 0. Guarda de dado real: DATABASE_URL herdada de segredo de Codespaces.
#    Aqui e aviso, nao aborto — o arquivo gerado abaixo sobrescreve o valor em
#    todo terminal. O aborto duro fica no post-create.sh.
# ---------------------------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ] \
   && ! printf '%s' "${DATABASE_URL}" | grep -Eq '@(localhost|127\.0\.0\.1|\[::1\]|db):'; then
  aviso "DATABASE_URL do ambiente NAO e local — provavel segredo de Codespaces."
  aviso "Sera sobrescrita pelo banco local. Remova o segredo antes de rodar qualquer seed."
fi

# ---------------------------------------------------------------------------
# 1. Postgres local ao Codespace (127.0.0.1:5543). Nunca encaminhado.
# ---------------------------------------------------------------------------
if command -v pg_ctlcluster >/dev/null 2>&1; then
  if pg_isready -h 127.0.0.1 -p "${PG_PORTA}" -q; then
    info "Postgres ${PG_VERSAO} ja de pe em 127.0.0.1:${PG_PORTA}."
  else
    info "subindo Postgres ${PG_VERSAO}/${PG_CLUSTER} em 127.0.0.1:${PG_PORTA}..."
    sudo pg_ctlcluster "${PG_VERSAO}" "${PG_CLUSTER}" start || true
    for _ in $(seq 1 30); do
      pg_isready -h 127.0.0.1 -p "${PG_PORTA}" -q && break
      sleep 1
    done
    if pg_isready -h 127.0.0.1 -p "${PG_PORTA}" -q; then
      info "Postgres pronto."
    else
      aviso "Postgres nao subiu na ${PG_PORTA}. Diagnostique com: sudo pg_lsclusters"
    fi
  fi
else
  aviso "pg_ctlcluster ausente — o post-create.sh ainda nao instalou o Postgres."
fi

# ---------------------------------------------------------------------------
# 2. URLs privadas do Codespace.
#    Padrao do GitHub: https://<CODESPACE_NAME>-<PORTA>.<DOMINIO_DE_ENCAMINHAMENTO>
#    Fora do Codespace (devcontainer local), cai para localhost.
# ---------------------------------------------------------------------------
DOMINIO="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"

if [ -n "${CODESPACE_NAME:-}" ]; then
  URL_WEB="https://${CODESPACE_NAME}-${PORTA_WEB}.${DOMINIO}"
  URL_API="https://${CODESPACE_NAME}-${PORTA_API}.${DOMINIO}"
  info "Codespace detectado: ${CODESPACE_NAME}"
else
  URL_WEB="http://localhost:${PORTA_WEB}"
  URL_API="http://localhost:${PORTA_API}"
  aviso "CODESPACE_NAME vazio — usando localhost (devcontainer local)."
fi

# ---------------------------------------------------------------------------
# 3. Arquivo de ambiente, regravado a cada start.
#    O nome do Codespace nao muda, mas o dominio de encaminhamento pode.
#    Tudo aqui e sintetico: nenhuma credencial real entra neste arquivo.
# ---------------------------------------------------------------------------
cat > "${ARQUIVO_ENV}" <<EOF
# Gerado por .devcontainer/post-start.sh — NAO EDITE A MAO, NAO COMMITE.
# Ambiente de desenvolvimento do Codespace. Todo valor aqui e sintetico.
export TZ="America/Sao_Paulo"
export NODE_ENV="development"

# Postgres local ao Codespace — so 127.0.0.1, porta nunca encaminhada.
export POSTGRES_USER="padaria"
export POSTGRES_PASSWORD="padaria"
export POSTGRES_DB="padaria"
export POSTGRES_PORT="${PG_PORTA}"
export PGPORT="${PG_PORTA}"
export DATABASE_URL="postgresql://padaria:padaria@127.0.0.1:${PG_PORTA}/padaria"

# Segredo de DEV sintetico, o mesmo default de scripts/dev.mjs. Producao usa outro.
export BETTER_AUTH_SECRET="dev-secret-change-me-dev-secret-change-me"

# A API escuta em todas as interfaces do container para o tunel do Codespace alcancar.
export HOST="0.0.0.0"
export PORT="${PORTA_API}"
export API_PORT="${PORTA_API}"
export WEB_PORT="${PORTA_WEB}"

# URLs privadas do Codespace, derivadas de CODESPACE_NAME.
export WEB_ORIGIN="${URL_WEB}"
export AUTH_BASE_URL="${URL_API}"
export NUXT_PUBLIC_API_URL="${URL_API}"
export PUBLIC_API_URL="${URL_API}"
EOF

info "ambiente gravado em ${ARQUIVO_ENV}"
printf '  WEB_ORIGIN          = %s\n' "${URL_WEB}"
printf '  AUTH_BASE_URL       = %s\n' "${URL_API}"
printf '  NUXT_PUBLIC_API_URL = %s\n' "${URL_API}"
printf '  DATABASE_URL        = postgresql://padaria:***@127.0.0.1:%s/padaria\n' "${PG_PORTA}"

cat <<'FIM'

[post-start] Para subir, dois terminais, nesta ordem:

  1) API : source ~/.pralis-codespace.env \
             && npm run dev --workspace @padaria/api

  2) Web : source ~/.pralis-codespace.env \
             && npm run dev --workspace @padaria/web-vue -- --host 0.0.0.0 --port 5174

  NAO use "npm run dev", "npm run dev:local" nem "npm run dev:vue":
    - dev e dev:local dependem de Docker (scripts/dev.mjs), ausente nesta fase;
    - dev:vue forca NUXT_PUBLIC_API_URL=http://localhost:4100 via cross-env e
      sobrescreve a URL do Codespace (package.json).

  As portas 5174 e 4100 sao PRIVADAS. Nao troque para "Public" na aba Ports:
  o seed cria diretor@email.com com senha 123456 e o cadastro publico esta aberto.

FIM
