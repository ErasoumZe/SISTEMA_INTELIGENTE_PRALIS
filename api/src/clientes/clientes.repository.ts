import { and, asc, eq } from "drizzle-orm";
import { clientes } from "@padaria/db/schema/cadastro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export async function listarClientesRepository() {
  return banco
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
    .orderBy(asc(clientes.nome));
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
