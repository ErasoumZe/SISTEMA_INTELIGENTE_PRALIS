import { APP_NAME, type ApiHealth } from "@padaria/shared";

export function obterSaude(): ApiHealth & { app: string } {
  return {
    status: "ok",
    service: "api",
    app: APP_NAME
  };
}
