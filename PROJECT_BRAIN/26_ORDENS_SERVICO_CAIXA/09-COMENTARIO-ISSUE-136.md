# Comentario para a issue-mestra #136

## Atualizacao da fila do Caixa — 07/08/2026

Base confirmada: `origin/main = bd4909c`.

Concluidos: PRs #137, #138, #139, #140 e #141. A base de reset de senha do commit `467f081`
ja existe e nao deve ser recriada.

### Em execucao agora

- **Marco — CX-M03A — `fix/caixa-recuperacao-senha`:** caracterizar o link real e completar
  apenas as lacunas de recuperacao do proprio usuario.
- **Ze — CX-Z101 — `101-c-01-fechamento-retorno-sangria`:** concluir/revisar a issue #101,
  atualizar a base, validar migrations e publicar PR com gates.

### Trava de conflito atual

- Marco e dono de auth/e-mail/paginas e testes de reset.
- Ze e dono de Caixa, transferencias, cofre, migrations 0030/0031 e testes desses fluxos.
- `shared/src/autenticacao/index.ts` e `tests/setup/seed.ts` ficam congelados para a branch
  #101.
- Nenhuma segunda migration enquanto #101 estiver aberta.

### Proxima ordem

1. Marco: CX-M04A — alvo/role de usuario e takeover cross-tenant.
2. Ze: CX-ZA1 — Coolify/Resend/AUTH_BASE_URL/orfaos, somente leitura.
3. Marco: CX-M03B — troca administrativa de senha, somente depois da CX-M04A.
4. Ze: CX-ZA2 — bootstrap nao redefine admin e cadastro publico fechado.
5. Marco: CX-M05 — colaboradores GET/POST/PUT cross-tenant.
6. Ze: CX-ZD1 — D-01/D-02/D-03, duplicatas + UNIQUE + concorrencia, com backup e SQL aprovados.
7. Marco: campos operacionais, descontos, pendencias/quebra e E2E.
8. Ze: hash/data/reprocesso, venda tardia, juros/desconto, formas de pagamento e operacao.
9. Ambos: homologacao, restore, logs, piloto e checklist CX-T01.

Detalhes, arquivos exclusivos, gates e dependencias:
`PROJECT_BRAIN/26_ORDENS_SERVICO_CAIXA/08-FILA-GITHUB-ATUAL.md` na branch
`docs/plano-finalizacao-caixa`.

Cada Codex deve consultar a fila, `origin/main` e as branches do outro dono antes de preparar
nova demanda. Nada e recriado sem verificar commits anteriores.
