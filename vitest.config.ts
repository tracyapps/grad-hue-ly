import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/engine/**/*.test.ts", "src/sync/**/*.test.ts", "api/**/*.test.ts"],
    environment: "node",
  },
});
