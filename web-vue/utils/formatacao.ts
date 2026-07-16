export function dataHoraLocal(valor: Date | string = new Date()) {
  const data = new Date(valor);
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
}

export function dataHoraParaUtc(valor: Date | string) {
  return new Date(valor).toISOString();
}

export function formatarDataHora(valor: Date | string) {
  return new Date(valor).toLocaleString("pt-BR");
}

// Data pura vinda do banco (YYYY-MM-DD, ex.: data_movimento). NAO passa por Date de proposito:
// new Date("2026-06-30") e lido como meia-noite UTC e, em fuso negativo (BRT), voltaria um dia.
export function formatarDataIso(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

export function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export function mascararCpf(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 11);
  return digitos
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function mascararCnpj(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function mascararDocumento(valor: string) {
  return apenasDigitos(valor).length > 11 ? mascararCnpj(valor) : mascararCpf(valor);
}

export function documentoEhCpf(valor: string) {
  const digitos = apenasDigitos(valor);
  return digitos.length > 0 && digitos.length <= 11;
}

export function mascararWhatsapp(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 11);
  if (digitos.length <= 2) return digitos;
  const prefixo = digitos.length > 10 ? digitos.slice(2, 7) : digitos.slice(2, 6);
  const sufixo = digitos.length > 10 ? digitos.slice(7) : digitos.slice(6);
  return `(${digitos.slice(0, 2)}) ${prefixo}${sufixo ? `-${sufixo}` : ""}`;
}

export function mascararCep(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}
