import { and, asc, count, eq, inArray } from "drizzle-orm";
import { clientes } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import type { EmpresaQuery, ResultadoPaginado } from "@padaria/shared/api";

type ClienteLinha = {
  id: string;
  empresaId: string;
  nome: string;
  documento: string | null;
  dataNascimento: string | null;
  whatsapp: string | null;
  email: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export async function listarClientesRepository(
  query: EmpresaQuery,
  empresasPermitidasIds: string[]
): Promise<ResultadoPaginado<ClienteLinha>> {
  if (!empresasPermitidasIds.length) return { itens: [], total: 0, page: query.page, pageSize: query.pageSize };
  const filtros = [
    query.empresaId ? eq(clientes.empresaId, query.empresaId) : inArray(clientes.empresaId, empresasPermitidasIds)
  ];
  const where = and(...filtros);
  const [{ total } = { total: 0 }] = await banco.select({ total: count() }).from(clientes).where(where);
  const itens = await banco
    .select({
      id: clientes.id,
      empresaId: clientes.empresaId,
      nome: clientes.nome,
      documento: clientes.documento,
      dataNascimento: clientes.dataNascimento,
      whatsapp: clientes.whatsapp,
      email: clientes.email,
      cep: clientes.cep,
      rua: clientes.rua,
      numero: clientes.numero,
      complemento: clientes.complemento,
      bairro: clientes.bairro,
      cidade: clientes.cidade,
      estado: clientes.estado
    })
    .from(clientes)
    .where(where)
    .orderBy(asc(clientes.nome))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { itens, total, page: query.page, pageSize: query.pageSize };
}

export async function salvarClienteRepository(
  input: {
    id?: string;
    empresaId: string;
    nome: string;
    documento: string | null;
    dataNascimento: string | null;
    whatsapp: string | null;
    email: string | null;
    cep: string | null;
    rua: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
  },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(clientes)
      .set({
        nome: input.nome,
        documento: input.documento,
        dataNascimento: input.dataNascimento,
        whatsapp: input.whatsapp,
        email: input.email,
        cep: input.cep,
        rua: input.rua,
        numero: input.numero,
        complemento: input.complemento,
        bairro: input.bairro,
        cidade: input.cidade,
        estado: input.estado,
        atualizadoEm: new Date()
      })
      .where(and(eq(clientes.id, input.id), eq(clientes.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db.insert(clientes).values(input).returning({ id: clientes.id });
  return criado;
}
