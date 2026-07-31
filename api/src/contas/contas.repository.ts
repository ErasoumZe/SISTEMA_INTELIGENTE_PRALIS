import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { contas, contasUsuarios } from "@padaria/db/schema/cadastro";
import { despesas } from "@padaria/db/schema/despesa";
import { mercadorias } from "@padaria/db/schema/mercadoria";
import { retiradas } from "@padaria/db/schema/retirada";
import { transferencias } from "@padaria/db/schema/transferencia";
import { vendas } from "@padaria/db/schema/venda";
import {
  saldoContaCentavos,
  saldoPendenteContaCentavos,
  transferenciaContaComoEntrada,
  transferenciaContaComoSaida,
  type TotaisContaCentavos
} from "@padaria/shared";
import { centavosParaDecimalBanco, deCentavos, liquidoCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import { banco, executarComTransacaoOpcional, type ExecutorBanco } from "../banco/conexao.js";
import {
  filtrarOrigemEntidade,
  jaImportado,
  type FiltroOrigemEntidade,
  type ModoImportacaoEntidade,
  type ResultadoImportacaoEntidade
} from "../utils.js";

export async function listarContasRepository() {
  return banco
    .select({ id: contas.id, empresaId: contas.empresaId, nome: contas.nome })
    .from(contas)
    .orderBy(asc(contas.nome));
}

// Saldo ATUAL de cada conta (D8), DERIVADO dos movimentos — nunca lido de coluna.
//
// Convencoes iguais as do saldo do caixa (ADR-001, decisao do Jose em 30/07): so movimento com
// `computar = true` e `status <> 'cancelado'`; venda entra pelo liquido (original - desconto +
// acrescimo), o resto por valor_original puro. Se um dia essa convencao mudar, muda nos dois.
//
// Uma consulta por tabela (5 no total) e a soma em memoria, no mesmo formato do caixa: o volume
// aqui e o de lancamentos da empresa, e o agrupamento em JS evita cinco SUB-SELECTs correlacionados
// por conta (que seria N+1 disfarcado de uma query so).
export async function saldosDasContasRepository(
  empresasPermitidasIds: string[] | null,
  db: ExecutorBanco = banco
): Promise<Map<string, number>> {
  const linhasContas = await db
    .select({ id: contas.id, empresaId: contas.empresaId, saldoInicial: contas.saldoInicial })
    .from(contas)
    .where(empresasPermitidasIds ? inArray(contas.empresaId, empresasPermitidasIds) : undefined);
  if (!linhasContas.length) return new Map();

  const contaIds = linhasContas.map((conta) => conta.id);

  // O filtro "computar = true AND status <> 'cancelado'" e escrito tabela a tabela (e nao num
  // helper generico) porque as colunas do Drizzle sao tipadas pela tabela de origem — e porque e
  // exatamente assim que o saldo do caixa faz, o que deixa a comparacao entre os dois obvia.
  const [linhasVendas, linhasTransferencias, linhasDespesas, linhasRetiradas, linhasMercadorias] = await Promise.all([
    db
      .select({
        contaOrigemId: vendas.contaOrigemId,
        valorOriginal: vendas.valorOriginal,
        valorDesconto: vendas.valorDesconto,
        valorAcrescimo: vendas.valorAcrescimo
      })
      .from(vendas)
      .where(and(inArray(vendas.contaOrigemId, contaIds), eq(vendas.computar, true), ne(vendas.status, "cancelado"))),
    // Transferencia nao filtra por contaIds: ela toca DUAS contas e a origem pode estar fora do
    // escopo (cofre de outra empresa mandando para esta). O acumulador ignora conta desconhecida.
    db
      .select({
        contaOrigemId: transferencias.contaOrigemId,
        contaDestinoId: transferencias.contaDestinoId,
        valorOriginal: transferencias.valorOriginal,
        status: transferencias.status
      })
      .from(transferencias)
      .where(eq(transferencias.computar, true)),
    db
      .select({ contaOrigemId: despesas.contaOrigemId, valorOriginal: despesas.valorOriginal })
      .from(despesas)
      .where(
        and(inArray(despesas.contaOrigemId, contaIds), eq(despesas.computar, true), ne(despesas.status, "cancelado"))
      ),
    db
      .select({ contaOrigemId: retiradas.contaOrigemId, valorOriginal: retiradas.valorOriginal })
      .from(retiradas)
      .where(
        and(inArray(retiradas.contaOrigemId, contaIds), eq(retiradas.computar, true), ne(retiradas.status, "cancelado"))
      ),
    db
      .select({ contaOrigemId: mercadorias.contaOrigemId, valorOriginal: mercadorias.valorOriginal })
      .from(mercadorias)
      .where(
        and(
          inArray(mercadorias.contaOrigemId, contaIds),
          eq(mercadorias.computar, true),
          ne(mercadorias.status, "cancelado")
        )
      )
  ]);

  const totaisPorConta = new Map<string, TotaisContaCentavos>(
    contaIds.map((id) => [
      id,
      {
        vendas: 0,
        transferenciasEntrada: 0,
        transferenciasSaida: 0,
        transferenciasPendentes: 0,
        despesas: 0,
        retiradas: 0,
        mercadorias: 0
      }
    ])
  );
  const acumular = (contaId: string | null, campo: keyof TotaisContaCentavos, centavos: number) => {
    if (!contaId) return;
    const totais = totaisPorConta.get(contaId);
    if (totais) totais[campo] += centavos;
  };

  for (const linha of linhasVendas) acumular(linha.contaOrigemId, "vendas", liquidoCentavos(linha));
  for (const linha of linhasTransferencias) {
    const valor = paraCentavos(linha.valorOriginal);
    if (transferenciaContaComoEntrada(linha.status)) acumular(linha.contaDestinoId, "transferenciasEntrada", valor);
    if (transferenciaContaComoSaida(linha.status)) acumular(linha.contaOrigemId, "transferenciasSaida", valor);
    if (linha.status === "pendente") acumular(linha.contaOrigemId, "transferenciasPendentes", valor);
  }
  for (const linha of linhasDespesas) acumular(linha.contaOrigemId, "despesas", paraCentavos(linha.valorOriginal));
  for (const linha of linhasRetiradas) acumular(linha.contaOrigemId, "retiradas", paraCentavos(linha.valorOriginal));
  for (const linha of linhasMercadorias)
    acumular(linha.contaOrigemId, "mercadorias", paraCentavos(linha.valorOriginal));

  return new Map(
    linhasContas.map((conta) => {
      const totais = totaisPorConta.get(conta.id);
      const saldo = totais
        ? saldoContaCentavos(paraCentavos(conta.saldoInicial), totais)
        : paraCentavos(conta.saldoInicial);
      return [conta.id, deCentavos(saldo)];
    })
  );
}

// Contas da empresa com fundo, saldo derivado e os usuarios vinculados — a tela de Contas (D8).
export async function listarContasComSaldoRepository(empresasPermitidasIds: string[] | null) {
  const linhas = await banco
    .select({
      id: contas.id,
      empresaId: contas.empresaId,
      nome: contas.nome,
      saldoInicial: contas.saldoInicial
    })
    .from(contas)
    .where(empresasPermitidasIds ? inArray(contas.empresaId, empresasPermitidasIds) : undefined)
    .orderBy(asc(contas.nome));
  if (!linhas.length) return [];

  const [saldos, vinculos] = await Promise.all([
    saldosComPendenciaDasContasRepository(empresasPermitidasIds),
    banco
      .select({ contaId: contasUsuarios.contaId, usuarioId: contasUsuarios.usuarioId })
      .from(contasUsuarios)
      .where(
        inArray(
          contasUsuarios.contaId,
          linhas.map((linha) => linha.id)
        )
      )
  ]);

  const usuariosPorConta = new Map<string, string[]>();
  for (const vinculo of vinculos) {
    const lista = usuariosPorConta.get(vinculo.contaId) ?? [];
    lista.push(vinculo.usuarioId);
    usuariosPorConta.set(vinculo.contaId, lista);
  }

  return linhas.map((linha) => ({
    id: linha.id,
    empresaId: linha.empresaId,
    nome: linha.nome,
    saldoInicial: deCentavos(paraCentavos(linha.saldoInicial)),
    saldoAtual: saldos.get(linha.id)?.disponivel ?? deCentavos(paraCentavos(linha.saldoInicial)),
    saldoPendente: saldos.get(linha.id)?.pendente ?? 0,
    usuariosIds: usuariosPorConta.get(linha.id) ?? []
  }));
}

async function saldosComPendenciaDasContasRepository(empresasPermitidasIds: string[] | null) {
  const disponiveis = await saldosDasContasRepository(empresasPermitidasIds);
  const linhas = await banco
    .select({ contaOrigemId: transferencias.contaOrigemId, valor: transferencias.valorOriginal })
    .from(transferencias)
    .where(and(eq(transferencias.computar, true), eq(transferencias.status, "pendente")));
  const pendentes = new Map<string, number>();
  for (const linha of linhas) {
    pendentes.set(linha.contaOrigemId, (pendentes.get(linha.contaOrigemId) ?? 0) + paraCentavos(linha.valor));
  }
  return new Map(
    [...disponiveis].map(([id, disponivel]) => [
      id,
      {
        disponivel,
        pendente: deCentavos(
          saldoPendenteContaCentavos({
            vendas: 0,
            transferenciasEntrada: 0,
            transferenciasSaida: pendentes.get(id) ?? 0,
            transferenciasPendentes: pendentes.get(id) ?? 0,
            despesas: 0,
            retiradas: 0,
            mercadorias: 0
          })
        )
      }
    ])
  );
}

export async function salvarContaRepository(
  input: { id?: string; empresaId: string; nome: string; saldoInicial?: number; usuariosIds?: string[] },
  db?: ExecutorBanco
) {
  return executarComTransacaoOpcional(db, async (tx) => {
    // saldoInicial ausente = nao mexer no fundo (edicao parcial nao pode zerar o fundo do cofre).
    const fundo =
      input.saldoInicial === undefined ? undefined : centavosParaDecimalBanco(paraCentavos(input.saldoInicial));

    let contaId = input.id;
    if (contaId) {
      await tx
        .update(contas)
        .set({ nome: input.nome, ...(fundo === undefined ? {} : { saldoInicial: fundo }) })
        .where(and(eq(contas.id, contaId), eq(contas.empresaId, input.empresaId)));
    } else {
      const [criada] = await tx
        .insert(contas)
        .values({
          empresaId: input.empresaId,
          nome: input.nome,
          ...(fundo === undefined ? {} : { saldoInicial: fundo })
        })
        .returning({ id: contas.id });
      if (!criada) throw new Error("Conta nao criada");
      contaId = criada.id;
    }

    // usuariosIds ausente = nao mexer nos vinculos. Presente (mesmo vazio) = a lista passa a ser
    // exatamente essa: apaga os que sairam e insere os que entraram, na mesma transacao do cadastro.
    if (input.usuariosIds) {
      const desejados = new Set(input.usuariosIds);
      const atuais = await tx
        .select({ id: contasUsuarios.id, usuarioId: contasUsuarios.usuarioId })
        .from(contasUsuarios)
        .where(eq(contasUsuarios.contaId, contaId));
      const remover = atuais.filter((vinculo) => !desejados.has(vinculo.usuarioId)).map((vinculo) => vinculo.id);
      if (remover.length) await tx.delete(contasUsuarios).where(inArray(contasUsuarios.id, remover));

      const jaVinculados = new Set(atuais.map((vinculo) => vinculo.usuarioId));
      const novos = [...desejados].filter((usuarioId) => !jaVinculados.has(usuarioId));
      if (novos.length) {
        await tx
          .insert(contasUsuarios)
          .values(novos.map((usuarioId) => ({ empresaId: input.empresaId, contaId, usuarioId })));
      }
    }

    return { id: contaId, empresaId: input.empresaId, nome: input.nome };
  });
}

export async function buscarContaEmpresaRepository(contaId: string, db: ExecutorBanco = banco) {
  const [conta] = await db
    .select({ id: contas.id, empresaId: contas.empresaId })
    .from(contas)
    .where(eq(contas.id, contaId))
    .limit(1);
  return conta ?? null;
}

export async function copiarContasRepository(
  filtro: FiltroOrigemEntidade,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  _modo: ModoImportacaoEntidade = "simples",
  db?: ExecutorBanco
): Promise<ResultadoImportacaoEntidade> {
  return executarComTransacaoOpcional(db, async (db) => {
    const origem = filtrarOrigemEntidade(await db.select().from(contas), filtro, empresasPermitidasIds);
    const destinos = await db.select().from(contas).where(eq(contas.empresaId, empresaDestinoId));
    let inseridos = 0;
    for (const conta of origem) {
      if (jaImportado(destinos, conta.empresaId, conta.id)) continue;
      await db
        .insert(contas)
        .values({ empresaId: empresaDestinoId, nome: conta.nome, importadoDe: conta.empresaId, idImportado: conta.id });
      inseridos += 1;
    }
    return { tipo: "contas", inseridos };
  });
}
