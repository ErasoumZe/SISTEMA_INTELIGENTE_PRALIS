import { listarCatalogoBaseRepository } from "./produtos-catalogo-base.repository.js";

export function listarCatalogoBase(input: {
  busca?: string | undefined;
  status?: "ativo" | "inativo" | undefined;
  page: number;
  pageSize: number;
}) {
  return listarCatalogoBaseRepository(input);
}
