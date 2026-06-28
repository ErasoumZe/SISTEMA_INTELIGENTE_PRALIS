export type PerfilComEmpresa = {
  empresaId?: string | null;
  empresaIds?: string[] | null;
};

export function empresasPermitidas(perfil: PerfilComEmpresa): string[] | null {
  const ids = perfil.empresaIds?.length ? perfil.empresaIds : perfil.empresaId ? [perfil.empresaId] : [];
  return Array.from(new Set(ids));
}

export function podeAcessarEmpresa(perfil: PerfilComEmpresa, empresaId: string): boolean {
  const permitidas = empresasPermitidas(perfil);
  return permitidas === null || permitidas.includes(empresaId);
}

export function filtrarPorEmpresas<T extends { empresaId?: string | null }>(
  itens: T[],
  permitidas: string[] | null
): T[] {
  if (permitidas === null) return itens;
  return itens.filter(
    (item) => item.empresaId !== null && item.empresaId !== undefined && permitidas.includes(item.empresaId)
  );
}

export function escopoEmpresaAtiva(permitidas: string[] | null, empresaId?: string): string[] | null {
  if (!empresaId) return permitidas;
  if (permitidas !== null && !permitidas.includes(empresaId)) {
    throw new Error("Empresa nao permitida");
  }
  return [empresaId];
}
