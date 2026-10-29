<script setup lang="ts">
import { computed } from "vue";
import { TELA_TEMA_RESUMO_CAIXA } from "@padaria/shared";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { dinheiro, itemPorTela } from "~/utils/domain";
import OperacaoLancamentoModal from "~/components/operacoes/OperacaoLancamentoModal.vue";
import TransferenciasHost from "~/components/operacoes/TransferenciasHost.vue";

const workspace = useWorkspaceContext();

const {
  opcoesEmpresa,
  modalCadastroAberto,
  cadastroEditandoId,
  cadastroTela,
  formCadastro,
  mascararCpf,
  mascararCnpj,
  atualizarDocumentoCadastro,
  documentoEhCpf,
  mascararWhatsapp,
  mascararCep,
  colaboradoresSelectUsuario,
  atualizarColaboradorUsuario,
  empresasDisponiveis,
  dadosCadastro,
  cadastroSalvando,
  bloqueioCadastro,
  ehAdministradorTotal,
  salvarCadastro,
  modalTemaAberto,
  temaTelaEdicao,
  telasTemaPermitidas,
  abrirTema,
  tema,
  temaSalvando,
  salvarTema,
  modalCopiaAberto,
  copiaModo,
  copiaNivel,
  copiaEmpresaOrigemId,
  copiaEmpresaDestinoId,
  copiaSalvando,
  executarCopia
} = workspace;

const editandoAcessoUsuario = computed(
  () => cadastroTela.value === "permissoes" && cadastroEditandoId.value.startsWith("usuario:")
);
const perfisAcessoUsuario = computed(() => [
  { title: "Usuário comum — acesso definido por setor e cargo", value: "usuario_comum" },
  { title: "Administrador total", value: "usuario_admin" },
  ...(cadastroEditandoId.value && formCadastro.value.role === "admin"
    ? [{ title: "Admin legado — mantenha apenas para contas antigas", value: "admin" }]
    : [])
]);
// R-229 · postos do Caixa: cada PDV ativo com os turnos do caixa marcados (PDV 1 · Manhã, PDV 1 · Tarde).
const postosCaixaOpcoes = computed(() =>
  opcoesEmpresa.value.pdvs
    .filter((pdv) => pdv.ativo !== false)
    .flatMap((pdv) =>
      (pdv.turnosCaixa ?? ["manha", "tarde"]).map((turno) => ({
        id: `${pdv.id}|${turno}`,
        nome: `${pdv.nome} · ${turno === "manha" ? "Manhã" : "Tarde"}`
      }))
    )
);
const pessoasParaSelectUsuario = computed(() =>
  colaboradoresSelectUsuario.value.map((pessoa) =>
    pessoa.id === "__novo__" ? { ...pessoa, nome: "Cadastrar novo colaborador" } : pessoa
  )
);

// --- Usuarios que operam a CONTA (D8) --------------------------------------------------------
// Os vinculos viajam no proprio formulario da conta (formCadastro.usuariosIds) e sao gravados na
// MESMA transacao do cadastro. Antes isso era um dialogo separado na tela de Usuarios, com POST/
// DELETE por clique: o vinculo salvava mesmo se o cadastro fosse cancelado. Agora e um ato so.
function usuariosDaConta(): string[] {
  return formCadastro.value.usuariosIds ?? [];
}
function contaTemUsuario(usuarioId: string | undefined) {
  return Boolean(usuarioId) && usuariosDaConta().includes(String(usuarioId));
}
function alternarUsuarioConta(usuarioId: string | undefined, marcar: boolean) {
  if (!usuarioId) return;
  const atuais = usuariosDaConta().filter((id) => id !== usuarioId);
  formCadastro.value.usuariosIds = marcar ? [...atuais, String(usuarioId)] : atuais;
}
import CadastroCamposTurno from "~/components/cadastros/CadastroCamposTurno.vue";
</script>

<template>
  <!-- Abertura de caixa vive num unico fluxo: o form inline da CaixaResumoPage (/caixa). O modal
       antigo daqui foi removido (Definition of Done: nada e pronto enquanto o caminho antigo existir). -->

  <!-- Lancamento (despesa/mercadoria/retirada) e Transferencia tem modais proprios fieis ao desenho
       do Rodrigo (FOTO 2 / FOTO 1). Eles LEEM `modalOperacaoAberto` do contexto e decidem sozinhos
       se aparecem (ver TransferenciasHost.vue:19 e useOperacaoLancamento.ts:52).
       NAO REMOVER: sem estas duas tags o "+ Novo > Transferencias/Saidas" abre o estado e nada
       renderiza — falha 100% silenciosa (import sem uso nao quebra lint, check nem teste).
       Perdidas por engano no 9c35fae, restauradas em 31/07. -->
  <OperacaoLancamentoModal />
  <TransferenciasHost />

  <v-dialog v-model="modalCadastroAberto" max-width="820" scrollable persistent no-click-animation>
    <v-card>
      <v-card-title>{{
        editandoAcessoUsuario ? "Configurar acessos" : cadastroEditandoId ? "Editar cadastro" : "Novo cadastro"
      }}</v-card-title>
      <v-card-subtitle>{{
        editandoAcessoUsuario
          ? "Confira o acesso efetivo e ajuste somente as exceções necessárias."
          : (itemPorTela[cadastroTela]?.titulo ?? "Cadastro operacional")
      }}</v-card-subtitle>
      <v-card-text>
        <v-row dense>
          <v-col v-if="cadastroTela === 'grupos'" cols="12">
            <v-select
              v-model="formCadastro.tipoGrupo"
              :items="['despesa', 'mercadoria', 'retirada', 'vendas']"
              label="Tipo de grupo"
              :disabled="Boolean(cadastroEditandoId)"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'grupos'" cols="12">
            <v-switch v-model="formCadastro.ativo" color="primary" label="Ativo nos lançamentos" />
          </v-col>
          <v-col v-if="cadastroTela === 'areas_setores'" cols="12">
            <v-select
              v-model="formCadastro.tipoAreaSetor"
              :items="['area', 'setor']"
              label="Tipo"
              :disabled="Boolean(cadastroEditandoId)"
            />
          </v-col>
          <!-- Patrimonio (D2): grupo (sigla + nome) ou item (nome + marca + grupo + setor). -->
          <v-col v-if="cadastroTela === 'patrimonio'" cols="12" md="6">
            <v-select
              v-model="formCadastro.tipoPatrimonio"
              :items="['grupo', 'item']"
              label="Tipo"
              :disabled="Boolean(cadastroEditandoId)"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'patrimonio' && formCadastro.tipoPatrimonio === 'grupo'" cols="12" md="6">
            <v-text-field
              v-model="formCadastro.sig"
              label="Sigla"
              hint="2 a 4 letras maiusculas (FIS, MAT, UTS, MAQ, MOB, EMB)"
              persistent-hint
            />
          </v-col>
          <v-col v-if="cadastroTela === 'patrimonio' && formCadastro.tipoPatrimonio === 'item'" cols="12" md="6">
            <v-select
              v-model="formCadastro.grupoPatrimonioId"
              :items="opcoesEmpresa.gruposPatrimonio"
              item-title="nome"
              item-value="id"
              label="Grupo de patrimonio"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'patrimonio' && formCadastro.tipoPatrimonio === 'item'" cols="12" md="6">
            <v-text-field v-model="formCadastro.marca" label="Marca" />
          </v-col>
          <v-col v-if="cadastroTela === 'patrimonio' && formCadastro.tipoPatrimonio === 'item'" cols="12" md="6">
            <v-select
              v-model="formCadastro.setorId"
              :items="opcoesEmpresa.setores"
              item-title="nome"
              item-value="id"
              label="Setor"
              clearable
            />
          </v-col>
          <v-col
            v-if="cadastroTela !== 'permissoes'"
            cols="12"
            :md="
              ['unidades', 'pdv', 'empresas', 'fornecedores', 'clientes', 'contas', 'maquininhas'].includes(
                cadastroTela
              )
                ? 6
                : 12
            "
            ><v-text-field v-model="formCadastro.nome" :label="cadastroTela === 'maquininhas' ? 'Apelido *' : 'Nome'"
          /></v-col>
          <!-- Conta com FUNDO (D8). O fundo e o PONTO DE PARTIDA do saldo, nao o saldo: quem move o
               saldo sao os lancamentos. Por isso o campo fica editavel e o saldo atual, ao lado,
               so leitura — deixar os dois editaveis convidaria a "acertar" o saldo na mao. -->
          <v-col v-if="cadastroTela === 'contas'" cols="12" md="6">
            <v-text-field
              v-model="formCadastro.saldoInicial"
              type="number"
              min="0"
              step="0.01"
              label="Fundo (saldo inicial)"
              hint="Ponto de partida da conta. Ex.: CONTA COFRE = 10.000,00"
              persistent-hint
            />
          </v-col>
          <v-col v-if="cadastroTela === 'contas'" cols="12">
            <div class="text-caption text-medium-emphasis mb-1">
              Quem pode movimentar esta conta (origem/destino de transferência e conta dos lançamentos). Sem ninguém
              marcado, a conta não aparece para nenhum operador.
            </div>
            <v-alert v-if="!opcoesEmpresa.usuarios.length" type="info" variant="tonal" density="compact">
              Nenhum usuário nesta empresa.
            </v-alert>
            <v-list v-else density="compact" class="py-0 lc-usuarios-conta">
              <v-list-item
                v-for="usuario in opcoesEmpresa.usuarios"
                :key="usuario.usuarioId ?? usuario.id"
                class="px-1"
              >
                <template #prepend>
                  <v-checkbox-btn
                    :model-value="contaTemUsuario(usuario.usuarioId ?? usuario.id)"
                    color="primary"
                    @update:model-value="alternarUsuarioConta(usuario.usuarioId ?? usuario.id, Boolean($event))"
                  />
                </template>
                <v-list-item-title>{{ usuario.nome ?? usuario.email ?? usuario.id }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-col>
          <v-col v-if="cadastroTela === 'empresas'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.cnpj"
              label="CNPJ"
              maxlength="18"
              @update:model-value="formCadastro.cnpj = mascararCnpj(String($event || ''))"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'empresas'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.matriculaPrefixo"
              label="Prefixo da matrícula"
              hint="Ex.: TNP ou LISB. A numeração é automática por empresa."
              maxlength="8"
              persistent-hint
              @update:model-value="
                formCadastro.matriculaPrefixo = String($event || '')
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
              "
            />
          </v-col>
          <v-col v-if="cadastroTela === 'fornecedores' || cadastroTela === 'clientes'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.documento"
              label="Documento"
              maxlength="18"
              @update:model-value="atualizarDocumentoCadastro(String($event || ''))"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'fornecedores'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.whatsapp"
              label="WhatsApp"
              maxlength="15"
              hint="Opcional no cadastro; obrigatório só para convidar o fornecedor para uma cotação."
              persistent-hint
              @update:model-value="formCadastro.whatsapp = mascararWhatsapp(String($event || ''))"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'fornecedores'" cols="12" md="6">
            <v-switch
              v-model="formCadastro.ativo"
              color="primary"
              label="Fornecedor ativo"
              hint="Fornecedor inativo não aparece no seletor de cotação."
              persistent-hint
            />
          </v-col>
          <template v-if="cadastroTela === 'empresas'">
            <v-col cols="12" md="6">
              <v-text-field v-model="formCadastro.fusoHorario" label="Fuso horário" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="formCadastro.comprasPrazoRespostaHoras"
                type="number"
                min="1"
                label="Prazo padrão de cotação"
                suffix="horas"
                hint="Pode ser alterado em cada rodada."
                persistent-hint
              />
            </v-col>
          </template>
          <template v-if="cadastroTela === 'clientes'">
            <v-col v-if="documentoEhCpf(formCadastro.documento)" cols="12" md="6">
              <v-text-field v-model="formCadastro.dataNascimento" type="date" label="Data de nascimento" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                :model-value="formCadastro.whatsapp"
                label="WhatsApp"
                maxlength="15"
                @update:model-value="formCadastro.whatsapp = mascararWhatsapp(String($event || ''))"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="formCadastro.email" type="email" label="Email" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                :model-value="formCadastro.cep"
                label="CEP"
                maxlength="9"
                @update:model-value="formCadastro.cep = mascararCep(String($event || ''))"
              />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="formCadastro.rua" label="Rua" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="formCadastro.numero" label="Número" />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="formCadastro.complemento" label="Complemento" />
            </v-col>
            <v-col cols="12" md="5">
              <v-text-field v-model="formCadastro.bairro" label="Bairro" />
            </v-col>
            <v-col cols="12" md="5">
              <v-text-field v-model="formCadastro.cidade" label="Cidade" />
            </v-col>
            <v-col cols="12" md="2">
              <v-text-field
                :model-value="formCadastro.estado"
                label="Estado"
                maxlength="2"
                @update:model-value="
                  formCadastro.estado = String($event || '')
                    .toUpperCase()
                    .slice(0, 2)
                "
              />
            </v-col>
          </template>
          <v-col v-if="cadastroTela === 'pdv'" cols="12" md="8">
            <v-select
              v-model="formCadastro.contaId"
              :items="opcoesEmpresa.contas"
              item-title="nome"
              item-value="id"
              label="Conta do PDV"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'pdv'" cols="12" md="4">
            <v-switch v-model="formCadastro.ativo" color="primary" label="Ativo" />
          </v-col>
          <v-col v-if="cadastroTela === 'pdv'" cols="12">
            <fieldset class="pdv-turnos-caixa" data-teste="pdv-turnos-caixa">
              <legend>Turnos do caixa</legend>
              <p>Cada turno marcado vira um posto (ex.: PDV 1 · Manhã) para criar o login em Usuários.</p>
              <v-checkbox
                v-model="formCadastro.turnosCaixa"
                value="manha"
                label="Manhã"
                hide-details
                density="compact"
              />
              <v-checkbox
                v-model="formCadastro.turnosCaixa"
                value="tarde"
                label="Tarde"
                hide-details
                density="compact"
              />
            </fieldset>
          </v-col>
          <v-col v-if="cadastroTela === 'socios_gestores'" cols="12" md="4">
            <v-switch v-model="formCadastro.ativo" color="primary" label="Ativo" />
          </v-col>
          <template v-if="cadastroTela === 'maquininhas'">
            <v-col cols="12" md="4">
              <v-text-field v-model="formCadastro.numeroSerie" label="Número de série *" />
            </v-col>
            <v-col cols="12" md="2">
              <v-switch v-model="formCadastro.ativo" color="primary" label="Ativa" />
            </v-col>
          </template>
          <v-col v-if="cadastroTela === 'unidades'" cols="12" md="4"
            ><v-text-field v-model="formCadastro.sigla" label="Sigla"
          /></v-col>
          <CadastroCamposTurno v-if="cadastroTela === 'turnos'" v-model="formCadastro" />
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12" md="6"
            ><v-text-field
              :model-value="formCadastro.cpf"
              label="CPF"
              maxlength="14"
              @update:model-value="formCadastro.cpf = mascararCpf(String($event || ''))"
          /></v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6"
            ><v-text-field v-model="formCadastro.email" type="email" label="Email"
          /></v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.whatsapp"
              label="WhatsApp para alertas"
              maxlength="15"
              @update:model-value="formCadastro.whatsapp = mascararWhatsapp(String($event || ''))"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6">
            <v-select
              v-model="formCadastro.role"
              :items="perfisAcessoUsuario"
              item-title="title"
              item-value="value"
              label="Perfil de acesso"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6">
            <v-select
              :model-value="formCadastro.novoColaborador ? '__novo__' : formCadastro.colaboradorId"
              :items="pessoasParaSelectUsuario"
              item-title="nome"
              item-value="id"
              label="Pessoa vinculada"
              @update:model-value="atualizarColaboradorUsuario(String($event || ''))"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'usuarios' && (formCadastro.novoColaborador || cadastroEditandoId)" cols="12">
            <v-select
              v-model="formCadastro.postoCaixa"
              :items="postosCaixaOpcoes"
              item-title="nome"
              item-value="id"
              label="Posto do caixa"
              clearable
              data-teste="usuario-posto-caixa"
              hint="Login de PDV: escolha o posto (ex.: PDV 1 · Manhã). Gerência e tesouraria deixam vazio."
              persistent-hint
            />
          </v-col>
          <template v-if="cadastroTela === 'usuarios' && formCadastro.novoColaborador && !formCadastro.postoCaixa">
            <v-col cols="12">
              <v-alert type="info" variant="tonal" density="compact">
                O login e o colaborador serão criados juntos. Setor e cargo definem os acessos herdados; depois você
                poderá ajustar exceções individuais.
              </v-alert>
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCadastro.novoColaboradorSetorId"
                :items="opcoesEmpresa.setores"
                item-title="nome"
                item-value="id"
                label="Setor *"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCadastro.novoColaboradorCargoId"
                :items="opcoesEmpresa.cargos"
                item-title="nome"
                item-value="id"
                label="Cargo inicial *"
              />
            </v-col>
          </template>
          <v-col v-if="cadastroTela === 'usuarios' && (!cadastroEditandoId || ehAdministradorTotal)" cols="12">
            <v-text-field
              v-model="formCadastro.senha"
              type="password"
              :label="cadastroEditandoId ? 'Nova senha (opcional)' : 'Senha'"
              autocomplete="new-password"
              :hint="
                cadastroEditandoId
                  ? 'A senha atual não pode ser visualizada. Preencha somente para redefini-la.'
                  : undefined
              "
              :persistent-hint="Boolean(cadastroEditandoId)"
            />
          </v-col>
          <v-col
            v-if="cadastroTela === 'usuarios' && cadastroEditandoId && ehAdministradorTotal"
            cols="12"
            class="pt-0"
          >
            <v-alert type="info" variant="tonal" density="compact">
              A redefinição será registrada para o Administrador Geral. Por segurança, a senha atual nunca é exibida.
            </v-alert>
          </v-col>
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
            <v-select
              v-model="formCadastro.setorId"
              :items="opcoesEmpresa.setores"
              item-title="nome"
              item-value="id"
              label="Setor"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
            <v-select
              v-model="formCadastro.cargoId"
              :items="opcoesEmpresa.cargos"
              item-title="nome"
              item-value="id"
              label="Cargo"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
            <v-select
              v-model="formCadastro.turnoPadraoId"
              :items="opcoesEmpresa.turnos"
              item-title="nome"
              item-value="id"
              label="Turno padrão"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'areas_setores' && formCadastro.tipoAreaSetor === 'setor'" cols="12" md="6">
            <v-select
              v-model="formCadastro.areaId"
              :items="opcoesEmpresa.areas"
              item-title="nome"
              item-value="id"
              label="Area"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'areas_setores' && formCadastro.tipoAreaSetor === 'setor'" cols="12" md="6">
            <v-select
              v-model="formCadastro.setorPaiId"
              :items="opcoesEmpresa.setores"
              item-title="nome"
              item-value="id"
              label="Setor pai"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'grupos'" cols="12">
            <v-select
              v-model="formCadastro.grupoPaiId"
              :items="
                dadosCadastro('grupos').filter(
                  (grupo) => grupo.tipoGrupo === formCadastro.tipoGrupo && grupo.id !== cadastroEditandoId
                )
              "
              item-title="nome"
              item-value="id"
              label="Grupo pai"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12">
            <div class="text-body-2 font-weight-bold mb-2">Empresas</div>
            <!-- Na EDICAO os chips nascem DESLIGADOS e vazios, e isso e proposital: esta tela nao
                 conhece as empresas reais do usuario (a listagem e recortada ao escopo da tela). Um
                 clique aqui SUBSTITUI a lista inteira, inclusive vinculos que a tela nunca mostrou —
                 entao ele exige opt-in explicito. Sem opt-in, o payload omite `empresaIds` e o
                 servidor preserva o que esta gravado. -->
            <v-checkbox
              v-if="cadastroEditandoId"
              v-model="formCadastro.empresaIdsTocado"
              density="compact"
              hide-details
              label="Substituir as empresas deste usuário"
            />
            <v-alert
              v-if="cadastroEditandoId && formCadastro.empresaIdsTocado"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-2"
            >
              As empresas marcadas abaixo passam a ser as ÚNICAS deste usuário. Vínculos com empresas que não aparecem
              aqui serão removidos.
            </v-alert>
            <div v-else-if="cadastroEditandoId" class="text-caption text-medium-emphasis mb-2">
              As empresas deste usuário serão mantidas exatamente como estão.
            </div>
            <v-chip-group
              v-model="formCadastro.empresaIds"
              multiple
              column
              :disabled="Boolean(cadastroEditandoId) && !formCadastro.empresaIdsTocado"
            >
              <v-chip v-for="empresa in empresasDisponiveis" :key="empresa.id" :value="empresa.id" filter>{{
                empresa.nome
              }}</v-chip>
            </v-chip-group>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <!-- Papel do usuario desconhecido: salvar aqui rebaixaria o alvo em silencio. Recarregar e o
             que repovoa a linha da listagem, entao a mensagem pede exatamente isso. -->
        <v-alert v-if="bloqueioCadastro" type="warning" variant="tonal" density="compact" class="flex-grow-1 mr-2">
          {{ bloqueioCadastro }}
        </v-alert>
        <v-spacer v-else />
        <v-btn variant="outlined" :disabled="cadastroSalvando" @click="modalCadastroAberto = false">Cancelar</v-btn>
        <v-btn
          color="primary"
          :loading="cadastroSalvando"
          :disabled="Boolean(bloqueioCadastro)"
          @click="salvarCadastro"
        >
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalTemaAberto" max-width="560" persistent no-click-animation>
    <v-card>
      <v-card-title>Aparência</v-card-title>
      <v-card-subtitle>Padrão vale para todas as telas; escolha uma tela para personalizar só ela.</v-card-subtitle>
      <v-card-text>
        <v-select
          v-model="temaTelaEdicao"
          :items="telasTemaPermitidas"
          item-title="titulo"
          item-value="id"
          label="Aplicar em"
          @update:model-value="abrirTema(String($event))"
        />
        <v-row dense>
          <template v-if="temaTelaEdicao === TELA_TEMA_RESUMO_CAIXA">
            <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Entradas" /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="tema.corSecundaria" type="color" label="Transferencias"
            /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Despesas" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Retiradas" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Saldo" /></v-col>
          </template>
          <template v-else>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Primaria" /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="tema.corSecundaria" type="color" label="Secundaria"
            /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corFundo" type="color" label="Fundo" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corCartao" type="color" label="Cartao" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Sucesso" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Aviso" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Erro" /></v-col>
          </template>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="temaSalvando" @click="modalTemaAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="temaSalvando" @click="salvarTema">Salvar tema</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalCopiaAberto" max-width="560" persistent no-click-animation>
    <v-card>
      <v-card-title>{{ copiaModo === "importar" ? "Importar dados" : "Exportar registro" }}</v-card-title>
      <v-card-text>
        <v-select v-model="copiaNivel" :items="['simples', 'completo']" label="Modo" />
        <v-select
          v-if="copiaModo === 'importar'"
          v-model="copiaEmpresaOrigemId"
          :items="empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaDestinoId)"
          item-title="nome"
          item-value="id"
          label="Empresa origem"
        />
        <v-select
          v-model="copiaEmpresaDestinoId"
          :items="empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaOrigemId)"
          item-title="nome"
          item-value="id"
          label="Empresa destino"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="copiaSalvando" @click="modalCopiaAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="copiaSalvando" @click="executarCopia">{{
          copiaModo === "importar" ? "Importar" : "Exportar"
        }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* R-229 · turnos do caixa no cadastro do PDV. */
.pdv-turnos-caixa {
  padding: 8px 12px 4px;
  border: 1px solid var(--cx-line, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
}
.pdv-turnos-caixa legend {
  padding: 0 4px;
  font-weight: 700;
}
.pdv-turnos-caixa p {
  margin: 0 0 4px;
  font-size: 0.8rem;
  opacity: 0.75;
}
</style>
