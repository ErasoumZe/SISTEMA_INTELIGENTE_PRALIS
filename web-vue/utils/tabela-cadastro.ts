// #172 · A tabela de cadastro nao recebe a chave da coluna: ela DERIVA a chave do rotulo exibido.
// "Saldo atual" vira `saldo_atual`. Quem monta a linha (composables/useCadastroView.ts) precisa
// gravar exatamente essa chave, senao a celula cai no travessao e a tela mente sobre um dado que a
// API entregou certo — foi o que aconteceu com o saldo da conta.
//
// A derivacao mora aqui, e nao dentro do componente, para que os dois lados do contrato possam ser
// provados pelo mesmo teste. Um deles sozinho nunca acusa a divergencia.
export function chaveColuna(coluna: string) {
  return coluna
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(" ", "_");
}

export function valorLinha(linha: Record<string, string | undefined>, coluna: string) {
  return linha[chaveColuna(coluna)] || "-";
}
