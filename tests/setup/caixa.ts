import { expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { idsTeste } from "./contexto.js";
import { consultarUm, json } from "./integracao.js";

// Fixture de caixa PROPRIO por caso, extraida do padrao que ja vivia copiado em quatro arquivos
// (caixa-edicao-concorrente, retaguarda-sem-caixa, retaguarda-pos-fechamento, caixa-venda-integrada).
//
// Por que a fixture propria e OBRIGATORIA nos testes de corrida:
//  - `idsTeste.caixaAberto` e patrimonio de varios testes; fechar um caixa compartilhado dentro de
//    um caso quebra todos os arquivos que dependem dele;
//  - `fechamentos_caixa_pdv_aberto_unico_idx` proibe segundo caixa aberto no mesmo PDV, entao cada
//    caso cria conta + PDV proprios (o `pdvLivre` e reservado aos testes que ABREM caixa nele);
//  - `buscarCaixaAbertoUsuarioRepository` pega o caixa aberto MAIS NOVO do usuario — o caixa criado
//    aqui vence o do seed para o mesmo operador, o que e o comportamento desejado.
export async function abrirCaixaDoOperador(
  app: FastifyInstance,
  entrada: {
    cookieAdmin: string;
    cookieOperador: string;
    emailOperador: string;
    nome: string;
    dataHoraAbertura?: string;
    empresaId?: string;
  }
): Promise<{ caixaId: string; contaId: string; pdvId: string; usuarioId: string }> {
  const empresaId = entrada.empresaId ?? idsTeste.empresaA;
  const usuario = await consultarUm<{ id: string }>('select id from "user" where lower(email) = lower($1)', [
    entrada.emailOperador
  ]);
  if (!usuario) throw new Error(`Usuario ${entrada.emailOperador} nao encontrado`);

  const conta = await app.inject({
    method: "POST",
    url: "/api/contas",
    headers: { cookie: entrada.cookieAdmin },
    payload: { empresaId, nome: `Conta ${entrada.nome}` }
  });
  expect(conta.statusCode, conta.body).toBe(201);
  const contaId = json<{ data: { id: string } }>(conta).data.id;

  const pdv = await app.inject({
    method: "POST",
    url: "/api/pdvs",
    headers: { cookie: entrada.cookieAdmin },
    payload: { empresaId, nome: `PDV ${entrada.nome}`, contaId, ativo: true }
  });
  expect(pdv.statusCode, pdv.body).toBe(201);
  const pdvId = json<{ data: { id: string } }>(pdv).data.id;

  const abertura = await app.inject({
    method: "POST",
    url: "/api/caixa/abrir",
    headers: { cookie: entrada.cookieOperador },
    payload: {
      empresaId,
      pdvId,
      usuarioCaixaId: usuario.id,
      dataHoraAbertura: entrada.dataHoraAbertura ?? "2026-07-31T08:00"
    }
  });
  expect(abertura.statusCode, abertura.body).toBe(201);
  const caixaId = json<{ data: { id: string } }>(abertura).data.id;

  return { caixaId, contaId, pdvId, usuarioId: usuario.id };
}

/**
 * Prova de "nao escreveu" especifica do caixa: os sete totais congelados + a contagem de filhos por
 * `caixa_id`. Um unico SELECT, com os numericos em texto para a comparacao ser estavel.
 */
export async function universoDoCaixa(caixaId: string) {
  return consultarUm<Record<string, string | number | null>>(
    `select
       f.status,
       f.saldo::text                         as saldo,
       f.total_entradas::text                as total_entradas,
       f.total_transferencias::text          as total_transferencias,
       f.total_transferencias_entrada::text  as total_transferencias_entrada,
       f.total_transferencias_saida::text    as total_transferencias_saida,
       f.total_despesas::text                as total_despesas,
       f.total_retiradas::text               as total_retiradas,
       f.total_mercadorias::text             as total_mercadorias,
       (select count(*)::int from vendas v         where v.caixa_id = f.id) as vendas,
       (select count(*)::int from despesas d       where d.caixa_id = f.id) as despesas,
       (select count(*)::int from mercadorias m    where m.caixa_id = f.id) as mercadorias,
       (select count(*)::int from retiradas r      where r.caixa_id = f.id) as retiradas,
       (select count(*)::int from transferencias t where t.caixa_id = f.id) as transferencias,
       (select count(*)::int from alteracoes_pos_fechamento_caixa a where a.fechamento_caixa_id = f.id) as trilha_pos_fechamento,
       (select count(*)::int from quebras_caixa q  where q.fechamento_caixa_id = f.id) as quebras
     from fechamentos_caixa f
     where f.id = $1`,
    [caixaId]
  );
}
