// Montagem dos payloads de CONFERENCIA de transferencia (confirmar / recusar).
//
// Vive fora do componente porque foi exatamente aqui que nasceu um bug silencioso: o cockpit
// mandava `nLacreDoc: ""` quando o campo estava vazio, e o schema (`.min(1)`) recusava — entao um
// movimento SEM lacre, que a R-026 permite, era impossivel de conferir pela tela. String vazia nao
// e "sem lacre": e um lacre invalido.
//
// Regras que estas funcoes garantem:
//   - campo vazio vira `null` (ausencia), nunca string vazia;
//   - valor e enviado como numero, inclusive `0` — que e um valor legitimo de conferencia e nao
//     pode ser confundido com "nao informado" por um `if (valor)`;
//   - nada de residuo entre conferencias: quem limpa e `camposConferenciaVazios()`.

export type CamposConferencia = {
  contaDestinoId: string;
  lacre: string;
  valorRecebido: string;
  motivo: string;
};

export function camposConferenciaVazios(): CamposConferencia {
  return { contaDestinoId: "", lacre: "", valorRecebido: "", motivo: "" };
}

// `0` e valor valido. Por isso o teste e sobre a string ser vazia, e nao sobre o numero ser
// falsy — `Number("0")` e 0, e um `if (numero)` descartaria a conferencia de um envelope vazio.
export function valorConferenciaValido(valorRecebido: string): boolean {
  const texto = valorRecebido.trim();
  if (!texto) return false;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0;
}

function lacreOuNulo(lacre: string): string | null {
  return lacre.trim() || null;
}

export type PayloadConfirmacao = {
  contaDestinoId: string;
  nLacreDoc: string | null;
  // Ausente na transferencia GENERICA quando nao informado. Ver abaixo por que nao vira 0.
  valorRecebido?: number;
};

// Decisao 5, com o recorte que importa: o valor so e obrigatorio no fluxo Caixa -> Cofre.
//
// Na transferencia GENERICA o campo continua opcional, e vazio significa "nao informei" — nao
// "recebi zero". Mandar 0 ali mudaria o comportamento vigente: o servidor entenderia divergencia
// de valor, confirmaria assim mesmo e dispararia notificacao de divergencia numa conferencia que
// bateu. Por isso o campo e OMITIDO, e nao convertido.
export function montarPayloadConfirmacao(
  campos: CamposConferencia,
  contaDestinoPadrao: string,
  ehCaixaParaCofre: boolean
): PayloadConfirmacao {
  const base = {
    contaDestinoId: campos.contaDestinoId.trim() || contaDestinoPadrao,
    nLacreDoc: lacreOuNulo(campos.lacre)
  };
  const informou = valorConferenciaValido(campos.valorRecebido);
  // No Caixa -> Cofre a tela ja bloqueia o envio sem valor valido, entao aqui ele sempre existe.
  if (!ehCaixaParaCofre && !informou) return base;
  return { ...base, valorRecebido: Number(campos.valorRecebido) };
}

export type PayloadRecusa = PayloadConfirmacao & { motivo: string; valorRecebido?: number };

// Decisao 8: a recusa exige motivo e SO existe no fluxo Caixa -> Cofre (na generica a rota responde
// 404). Ela nao confirma nem cancela — o movimento segue `pendente`, e o registro auditavel e
// commitado do outro lado.
export function montarPayloadRecusa(campos: CamposConferencia, contaDestinoPadrao: string): PayloadRecusa {
  return { ...montarPayloadConfirmacao(campos, contaDestinoPadrao, true), motivo: campos.motivo.trim() };
}
