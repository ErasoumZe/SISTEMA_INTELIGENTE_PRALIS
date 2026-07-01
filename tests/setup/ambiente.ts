import { inject } from "vitest";

process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] = inject("databaseUrl");
process.env["BETTER_AUTH_SECRET"] = "integration-secret-change-me-integration-secret";
process.env["AUTH_BASE_URL"] = "http://127.0.0.1:4100";
process.env["WEB_ORIGIN"] = "http://127.0.0.1:5174";
process.env["HOST"] = "127.0.0.1";
process.env["PORT"] = "4100";
