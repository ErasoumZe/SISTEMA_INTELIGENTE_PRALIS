/**
 * Cenário isolado para validar o fechamento do Caixa no localhost.
 *
 * Cria tudo pela API (conta, PDV, maquininha, malote, abertura e vendas do CREARE), sem alterar
 * registros existentes. O Caixa fica ABERTO para a pessoa percorrer na interface o corte,
 * relatório de vendas, maquininha, movimentações e fechamento final.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

if (!process.argv.includes("--confirmar-local")) {
  throw new Error("Uso: npm run fixture:caixa:fechamento:local -- --confirmar-local");
}

const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://padaria:padaria@localhost:5543/padaria";
const urlBanco = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(urlBanco.hostname)) {
  throw new Error("Recusado: fixture de fechamento aceita somente DATABASE_URL local.");
}
const apiUrl = process.env["FIXTURE_API_URL"] ?? "http://localhost:4100";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(apiUrl)) {
  throw new Error("Recusado: FIXTURE_API_URL deve apontar para localhost.");
}

type Criado = { ok: true; data: { id: string } };
type ContextoLocal = {
  empresaId: string;
  contaCofreId: string;
  usuarioDiretorId: string;
};
type Pagamento = { id: string; descricao: string; valor: number };

const marcador = `SIM-FECH-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
const idCaixaExterno = `PDV-${marcador}`;
const hoje = new Date().toISOString().slice(0, 10);

function payloadVenda(
  idVenda: string,
  descricao: string,
  pagamentos: Pagamento[],
  statusVenda: "aprovado" | "cancelado" = "aprovado"
) {
  const valorTotal = pagamentos.reduce((total, pagamento) => total + pagamento.valor, 0);
  const dataHoraVenda = new Date().toISOString();
  return {
    DadosIntegracao: { origem: "fixture-local-fechamento" },
    Venda: {
      idVenda,
      idCaixa: idCaixaExterno,
      nomeCaixa: `PDV ${marcador}`,
      idCliente: null,
      nomeCliente: null,
      documentoCliente: null,
      dataHoraVenda,
      valorOriginal: valorTotal,
      desconto: 0,
      acrescimo: 0,
      valorTotal,
      statusVenda,
      numeroNotaFiscal: null,
      ...(statusVenda === "cancelado"
        ? {
            cancelamento: {
              usuarioId: "GERENTE-LOCAL-01",
              usuarioNome: "Gerente Simulado",
              motivo: "Pedido registrado em duplicidade",
              justificativa: "Cliente desistiu antes da finalização da compra."
            }
          }
        : {})
    },
    ItensVenda: [
      {
        idRegistro: `${idVenda}-ITEM-1`,
        idProduto: "PRODUTO-SIMULADO",
        descricaoProduto: descricao,
        dataHoraItem: dataHoraVenda,
        quantidade: 1,
        valorUnitario: valorTotal,
        total: valorTotal,
        itemCancelado: statusVenda === "cancelado"
      }
    ],
    PagamentosVenda: pagamentos.map((pagamento) => ({
      idVenda,
      idFormaPagamento: pagamento.id,
      descricaoFormaPagamento: pagamento.descricao,
      valor: pagamento.valor
    }))
  };
}

async function iniciarSessao(email: string) {
  const resposta = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5174" },
    body: JSON.stringify({ email, password: "123456" })
  });
  if (!resposta.ok) throw new Error(`Não foi possível autenticar o diretor local (${resposta.status}).`);
  const cookie = resposta.headers.get("set-cookie");
  if (!cookie) throw new Error("Login local não retornou sessão.");
  return cookie;
}

async function criar(caminho: string, cookie: string, corpo: object) {
  const resposta = await fetch(`${apiUrl}${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(corpo)
  });
  if (!resposta.ok) throw new Error(`${caminho} falhou (${resposta.status}): ${await resposta.text()}`);
  const json = (await resposta.json()) as Criado;
  if (!json.ok || !json.data?.id) throw new Error(`${caminho} retornou uma resposta inesperada.`);
  return json.data.id;
}

async function enviarVenda(codigo: string, corpo: object) {
  const resposta = await fetch(`${apiUrl}/api/integracoes`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": codigo },
    body: JSON.stringify(corpo)
  });
  if (!resposta.ok) throw new Error(`Ingestão CREARE simulada falhou (${resposta.status}): ${await resposta.text()}`);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const { rows } = await pool.query<ContextoLocal & { caixa_aberto: boolean }>(`
    select e.id as "empresaId",
           e.conta_cofre_id as "contaCofreId",
           diretor.usuario_id as "usuarioDiretorId",
           exists (
             select 1 from fechamentos_caixa fc
              where fc.empresa_id = e.id
                and fc.usuario_caixa_id = diretor.usuario_id
                and fc.status in ('aberto', 'em_fechamento')
           ) as caixa_aberto
      from empresas e
      join perfis_usuarios diretor on diretor.empresa_id = e.id and diretor.email = 'diretor@email.com'
     where e.conta_cofre_id is not null
     limit 1
  `);
  const contexto = rows[0];
  if (!contexto) throw new Error("Seed local incompleto: empresa, cofre ou diretor não encontrados.");
  if (contexto.caixa_aberto) {
    throw new Error(
      "O diretor local já tem caixa aberto/em fechamento; conclua-o antes de criar este cenário isolado."
    );
  }

  const cookieDiretor = await iniciarSessao("diretor@email.com");
  const cookieTesouraria = await iniciarSessao("tesouraria@email.com");
  const contaId = await criar("/api/contas", cookieDiretor, {
    empresaId: contexto.empresaId,
    nome: `Conta ${marcador}`,
    saldoInicial: 0,
    usuariosIds: [contexto.usuarioDiretorId]
  });
  const pdvId = await criar("/api/pdvs", cookieDiretor, {
    empresaId: contexto.empresaId,
    nome: `PDV ${marcador}`,
    contaId,
    ativo: true
  });
  const maquininhaId = await criar("/api/maquininhas", cookieDiretor, {
    empresaId: contexto.empresaId,
    numeroSerie: `MAQ-${marcador}`,
    apelido: `Maquininha ${marcador}`,
    ativo: true
  });
  const vinculo = await fetch(`${apiUrl}/api/integracoes/vinculos`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: cookieDiretor },
    body: JSON.stringify({
      empresaId: contexto.empresaId,
      tipo: "vendas",
      tipoRegistro: "pdv",
      identificadorExterno: idCaixaExterno,
      descricaoExterna: `PDV ${marcador}`,
      registroSistemaId: pdvId
    })
  });
  if (!vinculo.ok) throw new Error(`Vínculo CREARE local falhou (${vinculo.status}): ${await vinculo.text()}`);
  const chaveIntegracaoId = await criar("/api/integracoes/chaves", cookieDiretor, {
    empresaId: contexto.empresaId,
    tipo: "vendas"
  });
  const codigoResult = await pool.query<{ codigo: string }>("select codigo from integracoes_chaves where id = $1", [
    chaveIntegracaoId
  ]);
  const codigoIntegracao = codigoResult.rows[0]?.codigo;
  if (!codigoIntegracao) throw new Error("Chave de integração local foi criada sem código disponível.");

  const lacreAbertura = `${marcador}-ABERTURA`;
  const lacreFechamento = `${marcador}-FECHAMENTO`;
  await criar("/api/transferencias", cookieTesouraria, {
    empresaId: contexto.empresaId,
    dataReferencia: hoje,
    descricao: `Fixture local: fundo de troco ${marcador}`,
    observacao: "Cenário de desenvolvimento para testar o fechamento; não usar em produção.",
    valorOriginal: 100,
    valorEspecieDeclarado: 100,
    valorMoedasDeclarado: 0,
    valorAcrescimo: 0,
    valorDesconto: 0,
    contaOrigemId: contexto.contaCofreId,
    contaDestinoId: contaId,
    nLacreDoc: lacreAbertura,
    lacreFechamentoPlanejado: lacreFechamento,
    computar: true
  });
  const caixaId = await criar("/api/caixa/abrir", cookieDiretor, {
    empresaId: contexto.empresaId,
    pdvId,
    usuarioCaixaId: contexto.usuarioDiretorId,
    maquininhaId,
    lacreAbertura,
    caixaResponsavelNome: "Operador Simulado",
    supervisorResponsavelNome: "Supervisor Simulado",
    valorEspecieContado: 100,
    valorMoedasContado: 0,
    observacao: `Cenário local ${marcador}`
  });

  await Promise.all([
    enviarVenda(
      codigoIntegracao,
      payloadVenda(`${marcador}-DIN`, "Venda em dinheiro", [{ id: "DIN", descricao: "Dinheiro", valor: 50 }])
    ),
    enviarVenda(
      codigoIntegracao,
      payloadVenda(`${marcador}-PIX`, "Venda por Pix", [{ id: "PIX", descricao: "Pix", valor: 22 }])
    ),
    enviarVenda(
      codigoIntegracao,
      payloadVenda(`${marcador}-CRE`, "Venda no crédito", [{ id: "CRE", descricao: "Cartão Crédito", valor: 31.5 }])
    ),
    enviarVenda(
      codigoIntegracao,
      payloadVenda(`${marcador}-DEB`, "Venda no débito", [{ id: "DEB", descricao: "Cartão Débito", valor: 18.5 }])
    ),
    enviarVenda(
      codigoIntegracao,
      payloadVenda(`${marcador}-VOU`, "Venda em voucher", [{ id: "VOU", descricao: "Voucher", valor: 14 }])
    ),
    enviarVenda(
      codigoIntegracao,
      payloadVenda(
        `${marcador}-CAN`,
        "Venda cancelada simulada",
        [{ id: "PIX", descricao: "Pix", valor: 17 }],
        "cancelado"
      )
    )
  ]);

  console.log(`\nCenário local criado: ${marcador}`);
  console.log(`Caixa aberto: ${caixaId}`);
  console.log(`Lacre reservado para o fechamento: ${lacreFechamento}`);
  console.log("Acesse http://localhost:5174/caixa com diretor@email.com / 123456.");
  console.log(
    "Vendas aprovadas: Dinheiro R$ 50,00 · Pix R$ 22,00 · Crédito R$ 31,50 · Débito R$ 18,50 · Voucher R$ 14,00."
  );
  console.log("Cancelada: R$ 17,00 · Gerente Simulado · Pedido registrado em duplicidade.");
  console.log("Para testar a IA local, defina GEMINI_MAQUININHA_SIMULADA=true em .env.local e reinicie a API.");
  console.log("A leitura simulada gera líquido: Crédito R$ 31,50 · Débito R$ 18,50 · Pix R$ 22,00 · Voucher R$ 14,00.");
} finally {
  await pool.end();
}
