import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const preparoDev = process.env["DRIZZLE_DEV_SETUP"] === "1";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgresql://padaria:padaria@localhost:5543/padaria"
  },
  casing: "snake_case",
  strict: !preparoDev,
  verbose: !preparoDev
});
