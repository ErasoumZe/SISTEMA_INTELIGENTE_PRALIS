/**
 * Prepara um PDV isolado para o roteiro manual completo do Caixa.
 *
 * Nao fecha nem altera caixas existentes: cria somente a conta e o PDV de teste
 * caso ainda nao existam. A transferencia e os lacres ficam para o operador
 * criar pela interface, como no fluxo real.
 */
import "dotenv/config";
import pg from "pg";

if (!process.argv.includes("--confirmar-local")) {
  throw new Error("Uso: npm run fixture:caixa:fluxo-zero:local -- --confirmar-local");
}

const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://padaria:padaria@localhost:5543/padaria";
const urlBanco = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(urlBanco.hostname)) {
  throw new Error("Recusado: fixture de Caixa aceita somente DATABASE_URL local.");
}

const apiUrl = process.env["FIXTURE_API_URL"] ?? "http://localhost:4100";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(apiUrl)) {
  throw new Error("Recusado: FIXTURE_API_URL deve apontar para localhost.");
}

const nomeConta = "Caixa teste fluxo lacres";
const nomePdv = "PDV 02 - Fluxo Lacres";

type Criado = { ok: true; data: { id: string } };

async function iniciarSessao(email: string): Promise<string> {
  const resposta = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5174" },
    body: JSON.stringify({ email, password: "123456" })
  });
  if (!resposta.ok) throw new Error(`Nao foi possivel autenticar a fixture local (${resposta.status}).`);
  const cookie = resposta.headers.get("set-cookie");
  if (!cookie) throw new Error("Login local nao retornou sessao.");
  return cookie;
}

async function criarPorApi(caminho: string, cookie: string, corpo: object): Promise<string> {
  const resposta = await fetch(`${apiUrl}${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(corpo)
  });
  if (!resposta.ok) throw new Error(`Falha ao criar ${caminho} (${resposta.status}): ${await resposta.text()}`);
  const json = (await resposta.json()) as Criado;
  if (!json.ok || !json.data.id) throw new Error(`Resposta inesperada ao criar ${caminho}.`);
  return json.data.id;
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const { rows } = await pool.query<{
    empresa_id: string;
    diretor_id: string;
    tesouraria_id: string;
    conta_id: string | null;
    pdv_id: string | null;
    caixa_aberto: boolean;
  }>(
    `
      select e.id as empresa_id,
             diretor.usuario_id as diretor_id,
             tesouraria.usuario_id as tesouraria_id,
             conta.id as conta_id,
             pdv.id as pdv_id,
             exists(
               select 1 from fechamentos_caixa fc
               where fc.pdv_id = pdv.id and fc.status = 'aberto'
             ) as caixa_aberto
        from empresas e
        join perfis_usuarios diretor on diretor.empresa_id = e.id and diretor.email = 'diretor@email.com'
        join perfis_usuarios tesouraria on tesouraria.empresa_id = e.id and tesouraria.email = 'tesouraria@email.com'
        left join contas conta on conta.empresa_id = e.id and conta.nome = $1
        left join pdvs pdv on pdv.empresa_id = e.id and pdv.nome = $2
       where e.conta_cofre_id is not null
       limit 1
    `,
    [nomeConta, nomePdv]
  );
  const alvo = rows[0];
  if (!alvo) throw new Error("Seed local sem empresa, Diretor ou Tesouraria. Execute npm run dev:local primeiro.");
  if (alvo.caixa_aberto)
    throw new Error("O PDV de teste possui caixa aberto; a fixture nao altera fluxo em andamento.");
  if (alvo.conta_id && alvo.pdv_id) {
    console.log(`Fixture ja existe: ${nomePdv}, sem caixa aberto e sem transferencia criada.`);
    process.exit(0);
  }
  if (alvo.conta_id || alvo.pdv_id) {
    throw new Error("Fixture parcial encontrada; corrija manualmente para nao alterar dados existentes.");
  }

  const cookieDiretor = await iniciarSessao("diretor@email.com");
  const contaId = await criarPorApi("/api/contas", cookieDiretor, {
    empresaId: alvo.empresa_id,
    nome: nomeConta,
    saldoInicial: 0,
    usuariosIds: [alvo.diretor_id, alvo.tesouraria_id]
  });
  await criarPorApi("/api/pdvs", cookieDiretor, {
    empresaId: alvo.empresa_id,
    nome: nomePdv,
    contaId,
    ativo: true
  });
  console.log(
    `Fixture criada: ${nomePdv} esta zerado e sem caixa aberto. Crie o malote pela Tesouraria para iniciar o roteiro.`
  );
} finally {
  await pool.end();
}
