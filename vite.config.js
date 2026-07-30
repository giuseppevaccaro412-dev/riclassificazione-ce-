import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  /* La destinazione delle chiamate a Claude viaggia come costante di build e
     non come `import.meta.env`: il componente deve restare incollabile in un
     artifact di Claude o in un bundle non modulare, dove `import.meta` è un
     errore di sintassi. Stringa vuota = nessun override, decide il componente. */
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    build: { outDir: "dist" },
    define: {
      __CLAUDE_ENDPOINT__: JSON.stringify(env.VITE_CLAUDE_ENDPOINT || ""),
    },
    /* In sviluppo Vite serve il frontend sulla 5173 e inoltra /api al server
       Express sulla 3000: così `npm run dev` e la produzione si comportano
       allo stesso modo, incluso il provider Claude. */
    server: {
      proxy: {
        "/api": { target: "http://localhost:3000", changeOrigin: true },
      },
    },
  };
});
