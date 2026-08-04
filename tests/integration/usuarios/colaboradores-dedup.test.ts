import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, json } from "../../setup/integracao.js";

// Bug do QA de 15/07: cadastrar a mesma pessoa mais de uma vez (tela de colaboradores + "novo
// colaborador" na criacao de usuario) gerava colaboradores DUPLICADOS. Agora a criacao de usuario
// deduplica por CPF: se ja existe colaborador com o mesmo CPF na empresa, reutiliza em vez de copiar.
describe("usuarios: dedup de colaborador por CPF na criacao", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("reutiliza colaborador solto de mesmo CPF em vez de criar outro", async () => {
    const cpf = "39053344705";
    // Colaborador ja cadastrado (solto, sem usuario) com esse CPF.
    const solto = await consultarUm<{ id: string }>(
      "insert into colaboradores (empresa_id, nome, cpf, setor_id) values ($1, $2, $3, $4) returning id",
      [idsTeste.empresaA, "Pessoa Solta", cpf, idsTeste.setorA]
    );

    // Cria usuario com "novo colaborador" do mesmo CPF (mascarado — o backend normaliza para digitos).
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "Pessoa Solta",
        email: "pessoa.solta.dedup@padaria.local",
        role: "usuario_comum",
        senha: "Teste#2026!dedup",
        novoColaborador: {
          empresaId: idsTeste.empresaA,
          nome: "Pessoa Solta",
          cpf: "390.533.447-05",
          setorId: idsTeste.setorA,
          cargoId: idsTeste.cargoGerente
        }
      }
    });
    expect(criado.statusCode, criado.body).toBe(201);
    const usuarioId = json<{ data: { id: string } }>(criado).data.id;

    // Nao criou copia: continua havendo UM colaborador com esse CPF, e e o que ja existia — agora
    // vinculado ao usuario e com um cargo ativo (para as permissoes funcionarem).
    const total = await consultarUm<{ total: number }>(
      "select count(*)::int as total from colaboradores where empresa_id = $1 and cpf = $2",
      [idsTeste.empresaA, cpf]
    );
    expect(total?.total).toBe(1);

    const vinculado = await consultarUm<{ id: string; usuario_id: string | null }>(
      "select id, usuario_id from colaboradores where empresa_id = $1 and cpf = $2",
      [idsTeste.empresaA, cpf]
    );
    expect(vinculado?.id).toBe(solto?.id);
    expect(vinculado?.usuario_id).toBe(usuarioId);

    const temCargo = await consultarUm<{ total: number }>(
      "select count(*)::int as total from colaboradores_cargos where colaborador_id = $1 and ativo = true",
      [solto?.id]
    );
    expect(temCargo?.total).toBeGreaterThan(0);
  });

  it("barra quando o CPF ja pertence a outro usuario", async () => {
    const cpf = "11144477735";
    const primeiro = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "Primeiro Titular",
        email: "primeiro.titular.dedup@padaria.local",
        role: "usuario_comum",
        senha: "Teste#2026!dedup1",
        novoColaborador: {
          empresaId: idsTeste.empresaA,
          nome: "Primeiro Titular",
          cpf,
          setorId: idsTeste.setorA,
          cargoId: idsTeste.cargoGerente
        }
      }
    });
    expect(primeiro.statusCode, primeiro.body).toBe(201);

    const segundo = await contexto.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaIds: [idsTeste.empresaA],
        nome: "Segundo Titular",
        email: "segundo.titular.dedup@padaria.local",
        role: "usuario_comum",
        senha: "Teste#2026!dedup2",
        novoColaborador: {
          empresaId: idsTeste.empresaA,
          nome: "Segundo Titular",
          cpf,
          setorId: idsTeste.setorA,
          cargoId: idsTeste.cargoGerente
        }
      }
    });
    expect(segundo.statusCode).toBe(400);
    expect(JSON.stringify(segundo.json())).toContain("vinculado a outro usuário");

    // Continua havendo apenas UM colaborador com esse CPF.
    const total = await consultarUm<{ total: number }>(
      "select count(*)::int as total from colaboradores where empresa_id = $1 and cpf = $2",
      [idsTeste.empresaA, cpf]
    );
    expect(total?.total).toBe(1);
  });
});
