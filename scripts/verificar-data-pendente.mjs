import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const pastaWeb = path.join(raiz, "web-vue");
const configuracao = JSON.parse(readFileSync(path.join(raiz, "scripts", "data-pendente-limite.json"), "utf8"));

function arquivos(diretorio) {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    if (
      entrada.isDirectory() &&
      (entrada.name.startsWith(".") || entrada.name === "node_modules" || entrada.name === "dist")
    )
      return [];
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return arquivos(caminho);
    return statSync(caminho).isFile() ? [caminho] : [];
  });
}

const total = arquivos(pastaWeb).reduce((soma, arquivo) => {
  if (!/\.(?:ts|vue|css|js|mjs)$/u.test(arquivo)) return soma;
  return soma + (readFileSync(arquivo, "utf8").match(/data-pendente/gu)?.length ?? 0);
}, 0);

if (total > configuracao.limite) {
  console.error(
    `data-pendente subiu de ${configuracao.limite} para ${total}. O alvo final e ${configuracao.alvoFinal}.`
  );
  process.exit(1);
}

console.log(`data-pendente: ${total}/${configuracao.limite}; alvo final: ${configuracao.alvoFinal}.`);
