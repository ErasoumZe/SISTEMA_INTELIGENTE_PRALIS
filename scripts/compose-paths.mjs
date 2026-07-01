export const docker = "docker";

export const composeDbDev = [
  "compose",
  "-p",
  "padaria-db-dev",
  "-f",
  "db/docker-compose-db.yml",
  "-f",
  "db/docker-compose-db.dev.yml"
];

export const composeDbProd = [
  "compose",
  "-p",
  "padaria-prod-db",
  "-f",
  "db/docker-compose-db.yml",
  "-f",
  "db/docker-compose-db.prod.yml"
];

export const composeAppDev = [
  "compose",
  "-p",
  "padaria-dev",
  "-f",
  "infra/docker-compose.yml",
  "-f",
  "infra/docker-compose.dev.yml"
];

export const composeCoolify = ["compose", "-p", "padaria-coolify", "-f", "infra/docker-compose.coolify.yml"];
