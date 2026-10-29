/**
 * Estados de carga da Central que JA tem grupos para listar. Espelha a regra de
 * `listarGruposDaCarga` (api/src/produtos/produtos-central.service.ts).
 *
 * 29/10/2026: a tela pedia os grupos de uma carga ainda "recebida" logo depois de enviar o backup; o
 * servidor respondia "Valide as fontes da carga antes de consultar os grupos" e esse erro cobria o
 * "Arquivos enviados" — o envio tinha dado certo e a tela dizia que nao.
 */
const ESTADOS_COM_GRUPOS = new Set(["validada", "ativa", "substituida"]);

export function cargaTemGrupos(estado: string | null | undefined): boolean {
  return !!estado && ESTADOS_COM_GRUPOS.has(estado);
}
