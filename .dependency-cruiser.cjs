module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true }
    },
    {
      name: "not-to-node-modules-by-path",
      severity: "error",
      from: {},
      to: { path: "node_modules" }
    },
    {
      name: "api-controllers-do-not-import-db-directly",
      severity: "error",
      from: { path: "^api/src/.+\\.controller\\.ts$" },
      to: { path: "^api/src/(db|banco)/" }
    },
    {
      name: "api-controllers-do-not-import-repositories-directly",
      severity: "error",
      from: { path: "^api/src/.+\\.controller\\.ts$" },
      to: { path: "\\.repository\\.ts$" }
    },
    {
      name: "api-repositories-do-not-import-services",
      severity: "error",
      from: { path: "^api/src/.+\\.repository\\.ts$" },
      to: { path: "\\.service\\.ts$" }
    },
    {
      name: "api-repositories-do-not-import-controllers",
      severity: "error",
      from: { path: "^api/src/.+\\.repository\\.ts$" },
      to: { path: "\\.controller\\.ts$" }
    },
    {
      name: "api-services-do-not-import-controllers",
      severity: "error",
      from: { path: "^api/src/.+\\.service\\.ts$" },
      to: { path: "\\.controller\\.ts$" }
    },
    {
      name: "db-does-not-import-api-or-web",
      severity: "error",
      from: { path: "^db/src/" },
      to: { path: "^(api|web|web-vue)/" }
    },
    {
      name: "shared-does-not-import-app-layers",
      severity: "error",
      from: { path: "^shared/src/" },
      to: { path: "^(api|db|web|web-vue)/" }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(dist|build|\\.nuxt|\\.output|node_modules|web/build)(/|$)",
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "types", "default"],
      mainFields: ["module", "main", "types"]
    }
  }
};
