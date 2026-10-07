/**
 * Fixture local de dois turnos no mesmo PDV e na mesma maquininha.
 *
 * npm run fixture:caixa:pdv1-turnos:local -- --manha --confirmar-local
 * Feche a manha na interface no mesmo dia e depois execute:
 * npm run fixture:caixa:pdv1-turnos:local -- --tarde --confirmar-local
 */
import "dotenv/config";
import pg from "pg";

const etapa = process.argv.includes("--manha") ? "manha" : process.argv.includes("--tarde") ? "tarde" : null;
if (!etapa || !process.argv.includes("--confirmar-local")) {
  throw new Error("Use --manha ou --tarde junto de --confirmar-local.");
}
const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://padaria:padaria@localhost:5543/padaria";
const apiUrl = process.env["FIXTURE_API_URL"] ?? "http://localhost:4100";
if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) throw new Error("Banco nao local.");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(apiUrl)) throw new Error("API nao local.");

const senha = "QaCaixa#2026";
const data = new Date().toISOString().slice(0, 10);
const emailManha = "qa.pdv01.manha@local.test";
const emailTarde = "qa.pdv01.tarde@local.test";
const nomeConta = "QA Caixa PDV 01 - Turnos";
const nomePdv = "QA PDV 01 - Turnos";
const serieMaquininha = "QA-MAQ-PDV01-UNICA";
const caixaExterno = "QA-PDV01-TURNOS-20261006";
const pool = new pg.Pool({ connectionString: databaseUrl });

type Id = { id: string };
type Criado = { ok: true; data: Id };

async function login(email: string, password: string) {
  const resposta = await fetch(apiUrl + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5174" },
    body: JSON.stringify({ email, password })
  });
  if (!resposta.ok) throw new Error("Login falhou para " + email + ": " + resposta.status);
  const cookie = resposta.headers.get("set-cookie");
  if (!cookie) throw new Error("Sessao local ausente.");
  return cookie;
}

async function post(caminho: string, cookie: string, body: object) {
  const resposta = await fetch(apiUrl + caminho, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body)
  });
  if (!resposta.ok) throw new Error(caminho + " falhou: " + (await resposta.text()));
  const json = (await resposta.json()) as Criado;
  if (!json.ok || !json.data?.id) throw new Error(caminho + " sem id.");
  return json.data.id;
}

async function idExistente(sql: string, valores: string[]) {
  const resultado = await pool.query<Id>(sql, valores);
  return resultado.rows[0]?.id ?? null;
}

async function usuario(cookie: string, empresaId: string, email: string, nome: string) {
  const id = await idExistente("select usuario_id as id from perfis_usuarios where email = $1", [email]);
  if (id) return id;
  return post("/api/usuarios", cookie, { empresaId, nome, email, role: "usuario_admin", senha });
}

function venda(sufixo: string, forma: string, valor: number) {
  const agora = new Date().toISOString();
  const idVenda = "QA-PDV01-" + sufixo;
  return {
    DadosIntegracao: { origem: "fixture-qa-pdv01-turnos" },
    Venda: { idVenda, idCaixa: caixaExterno, nomeCaixa: nomePdv, dataHoraVenda: agora, valorOriginal: valor, desconto: 0, acrescimo: 0, valorTotal: valor, statusVenda: "aprovado" },
    ItensVenda: [{ idRegistro: idVenda + "-ITEM", idProduto: "QA-PRODUTO", descricaoProduto: "Venda QA " + etapa, dataHoraItem: agora, quantidade: 1, valorUnitario: valor, total: valor, itemCancelado: false }],
    PagamentosVenda: [{ idVenda, idFormaPagamento: forma, descricaoFormaPagamento: forma, valor }]
  };
}

try {
  const contexto = await pool.query<{ empresaId: string; cofreId: string }>("select id as \"empresaId\", conta_cofre_id as \"cofreId\" from empresas where conta_cofre_id is not null limit 1");
  const empresa = contexto.rows[0];
  if (!empresa) throw new Error("Seed local sem empresa e cofre.");
  const diretor = await login("diretor@email.com", "123456");
  const usuarioManha = await usuario(diretor, empresa.empresaId, emailManha, "QA Operador PDV 01 - Manha");
  const usuarioTarde = await usuario(diretor, empresa.empresaId, emailTarde, "QA Operador PDV 01 - Tarde");
  const contaId =
    (await idExistente("select id from contas where empresa_id = $1 and nome = $2", [empresa.empresaId, nomeConta])) ??
    (await post("/api/contas", diretor, { empresaId: empresa.empresaId, nome: nomeConta, saldoInicial: 0, usuariosIds: [usuarioManha, usuarioTarde] }));
  const pdvId =
    (await idExistente("select id from pdvs where empresa_id = $1 and nome = $2", [empresa.empresaId, nomePdv])) ??
    (await post("/api/pdvs", diretor, { empresaId: empresa.empresaId, nome: nomePdv, contaId, ativo: true }));
  const maquininhaId =
    (await idExistente("select id from maquininhas where empresa_id = $1 and numero_serie = $2", [empresa.empresaId, serieMaquininha])) ??
    (await post("/api/maquininhas", diretor, { empresaId: empresa.empresaId, numeroSerie: serieMaquininha, apelido: "QA Maquininha exclusiva PDV 01", ativo: true }));
  const nomeTurno = etapa === "manha" ? "QA Manha PDV 01" : "QA Tarde PDV 01";
  const turnoId =
    (await idExistente("select id from turnos where empresa_id = $1 and nome = $2", [empresa.empresaId, nomeTurno])) ??
    (await post("/api/turnos", diretor, {
      empresaId: empresa.empresaId,
      nome: nomeTurno,
      horaInicio: etapa === "manha" ? "08:00" : "13:00",
      horaFim: etapa === "manha" ? "12:00" : "18:00",
      ativo: true,
      etiqueta: etapa === "manha" ? "M" : "T",
      diasSemana: ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"]
    }));
  const usuarioId = etapa === "manha" ? usuarioManha : usuarioTarde;
  const caixaExistente = await idExistente("select id from fechamentos_caixa where usuario_caixa_id = $1 and pdv_id = $2 and data_movimento = $3", [usuarioId, pdvId, data]);
  if (caixaExistente) throw new Error("O turno QA " + etapa + " ja existe; nada foi alterado.");

  if (etapa === "tarde") {
    const statusManha = await pool.query<{ status: string }>("select status from fechamentos_caixa where usuario_caixa_id = $1 and pdv_id = $2 and data_movimento = $3", [usuarioManha, pdvId, data]);
    if (statusManha.rows[0]?.status !== "fechado") throw new Error("Feche a manha QA antes de criar a tarde.");
  }

  const lacreAbertura = etapa === "manha" ? "QA-PDV01-M-ABERTURA" : "QA-PDV01-T-ABERTURA";
  const lacreFechamento = etapa === "manha" ? "QA-PDV01-M-FECHAMENTO" : "QA-PDV01-T-FECHAMENTO";
  await post("/api/transferencias", diretor, {
    empresaId: empresa.empresaId,
    dataReferencia: data,
    descricao: "QA PDV 01: fundo de troco " + etapa,
    observacao: "Fixture local isolada de homologacao.",
    valorOriginal: 200,
    valorEspecieDeclarado: 200,
    valorMoedasDeclarado: 0,
    valorAcrescimo: 0,
    valorDesconto: 0,
    contaOrigemId: empresa.cofreId,
    contaDestinoId: contaId,
    nLacreDoc: lacreAbertura,
    lacreFechamentoPlanejado: lacreFechamento,
    computar: true
  });
  const operador = await login(etapa === "manha" ? emailManha : emailTarde, senha);
  const caixaId = await post("/api/caixa/abrir", operador, {
    empresaId: empresa.empresaId,
    pdvId,
    usuarioCaixaId: usuarioId,
    turnoId,
    maquininhaId,
    lacreAbertura,
    caixaResponsavelNome: etapa === "manha" ? "QA Operador Manha" : "QA Operador Tarde",
    supervisorResponsavelNome: "QA Supervisor",
    valorEspecieContado: 200,
    valorMoedasContado: 0,
    observacao: "Fixture QA " + etapa
  });
  const vinculo = await fetch(apiUrl + "/api/integracoes/vinculos", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: diretor },
    body: JSON.stringify({ empresaId: empresa.empresaId, tipo: "vendas", tipoRegistro: "pdv", identificadorExterno: caixaExterno, descricaoExterna: nomePdv, registroSistemaId: pdvId })
  });
  if (!vinculo.ok) throw new Error("Vinculo CREARE falhou.");
  const chaveId = await post("/api/integracoes/chaves", diretor, { empresaId: empresa.empresaId, tipo: "vendas" });
  const chave = await idExistente("select codigo as id from integracoes_chaves where id = $1", [chaveId]);
  if (!chave) throw new Error("Chave CREARE ausente.");
  const valores = etapa === "manha" ? [["M-DIN", "Dinheiro", 50], ["M-CRE", "Cartao Credito", 31.5], ["M-DEB", "Cartao Debito", 18.5], ["M-PIX", "Pix", 22], ["M-VOU", "Voucher", 14]] : [["T-DIN", "Dinheiro", 120], ["T-CRE", "Cartao Credito", 45], ["T-DEB", "Cartao Debito", 20], ["T-PIX", "Pix", 30], ["T-VOU", "Voucher", 10]];
  await Promise.all(
    valores.map(async ([sufixo, forma, valor]) => {
      const resposta = await fetch(apiUrl + "/api/integracoes", { method: "POST", headers: { "content-type": "application/json", "x-api-key": chave }, body: JSON.stringify(venda(sufixo as string, forma as string, valor as number)) });
      if (!resposta.ok) throw new Error("Venda simulada falhou: " + (await resposta.text()));
    })
  );
  console.log("Caixa QA aberto: " + caixaId);
  console.log("Login: " + (etapa === "manha" ? emailManha : emailTarde) + " / " + senha);
  console.log("Lacre de fechamento reservado: " + lacreFechamento);
  console.log(etapa === "manha" ? "CREARE R$ 136,00; maquininha R$ 86,00; fisico antes de saidas R$ 250,00." : "CREARE R$ 225,00; maquininha acumulada R$ 191,00; liquido da tarde R$ 105,00.");
} finally {
  await pool.end();
}
