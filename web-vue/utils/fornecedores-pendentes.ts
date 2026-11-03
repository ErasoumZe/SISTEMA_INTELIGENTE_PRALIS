/**
 * Doc 59 (Rodrigo, 29/10/2026): o pedido só vai sozinho para fornecedor com WhatsApp. Fornecedor sem WhatsApp é
 * cadastro pendente; a lista deles é por onde quem compra começa a completar o cadastro.
 */
export function fornecedorPendente(linha: Record<string, string | undefined>): boolean {
  return !linha.whatsapp?.trim();
}

export function soPendentes<T extends Record<string, string | undefined>>(linhas: T[], ativo: boolean): T[] {
  return ativo ? linhas.filter(fornecedorPendente) : linhas;
}
