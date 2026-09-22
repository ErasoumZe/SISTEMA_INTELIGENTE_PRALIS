/**
 * Prepara somente o malote fake que permite testar a abertura do Caixa localmente.
 * Nunca grava direto no banco: usa a API e, portanto, exerce as mesmas permissões e invariantes
 * da operação. Rode após `npm run dev:local`.
 */
import "dotenv/config";
import pg from "pg";

if (!process.argv.includes("--confirmar-local")) {
  throw new Error("Uso: npm run fixture:caixa:local -- --confirmar-local");
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

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const { rows } = await pool.query<{
    empresa_id: string;
    conta_cofre_id: string;
    pdv_id: string;
    conta_pdv_id: string;
  }>(`
    select e.id as empresa_id, e.conta_cofre_id, p.id as pdv_id, p.conta_id as conta_pdv_id
    from empresas e join pdvs p on p.empresa_id = e.id
    where p.nome = 'PDV 01' and e.conta_cofre_id is not null
    limit 1
  `);
  const alvo = rows[0];
  if (!alvo) throw new Error("Seed local sem empresa/Cofre/PDV 01. Execute npm run dev:local primeiro.");
  const lacre = "TESTE-MALOTE-200";
  const existente = await pool.query(
    "select id from transferencias where empresa_id = $1 and n_lacre_doc = $2 and status = 'pendente' limit 1",
    [alvo.empresa_id, lacre]
  );
  if (existente.rowCount) {
    console.log("Fixture já existe: malote R$ 200,00 (R$ 150,00 espécie + R$ 50,00 moedas), lacre TESTE-MALOTE-200.");
    process.exit(0);
  }

  const login = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "tesouraria@email.com", password: "123456" })
  });
  if (!login.ok) throw new Error(`Não foi possível autenticar a Tesouraria local (${login.status}).`);
  const cookie = login.headers.get("set-cookie");
  if (!cookie) throw new Error("Login local não retornou sessão.");

  const criar = await fetch(`${apiUrl}/api/transferencias`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      empresaId: alvo.empresa_id,
      dataReferencia: new Date().toISOString().slice(0, 10),
      descricao: "Fixture local: malote para teste de abertura",
      observacao: "Fixture local idempotente — não usar em produção.",
      valorOriginal: 200,
      valorEspecieDeclarado: 150,
      valorMoedasDeclarado: 50,
      valorAcrescimo: 0,
      valorDesconto: 0,
      contaOrigemId: alvo.conta_cofre_id,
      contaDestinoId: alvo.conta_pdv_id,
      nLacreDoc: lacre,
      computar: true
    })
  });
  if (!criar.ok) throw new Error(`Falha ao criar malote local (${criar.status}): ${await criar.text()}`);
  console.log("Fixture criada: malote R$ 200,00 (R$ 150,00 espécie + R$ 50,00 moedas), lacre TESTE-MALOTE-200.");
} finally {
  await pool.end();
}
