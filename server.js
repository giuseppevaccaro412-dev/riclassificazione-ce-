/* ============================================================================
 *  Server unico per Railway
 *  ---------------------------------------------------------------------------
 *  Railway non ha funzioni serverless: esegue un processo che resta in ascolto
 *  su process.env.PORT. Questo file fa quindi due cose che su Vercel erano
 *  separate:
 *    1. serve i file statici prodotti da `vite build` (cartella dist);
 *    2. espone POST /api/anthropic, il proxy verso l'API di Anthropic che
 *       aggiunge la chiave lato server.
 *  Il contratto con il client è invariato: stesso body, stesso status di
 *  ritorno, stesso header opzionale x-user-key.
 * ==========================================================================*/

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* I PDF allegati come base64 producono richieste di parecchi MB: il limite di
   default di express (100 kB) le rifiuterebbe con un 413. */
app.use(express.json({ limit: "60mb" }));

/* ---------------------------------------------------------------- health ---
   Railway usa questa rotta per verificare che il servizio sia sano. */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, chiaveServer: !!process.env.ANTHROPIC_API_KEY });
});

/* --------------------------------------------------------------- proxy -----
   La chiave dell'utente, se presente nell'header x-user-key, ha la precedenza
   e vale per la singola richiesta: viene usata e dimenticata, mai registrata.
   Altrimenti si usa ANTHROPIC_API_KEY dell'ambiente Railway. */
app.post("/api/anthropic", async (req, res) => {
  const chiave = req.get("x-user-key") || process.env.ANTHROPIC_API_KEY;
  if (!chiave) {
    return res.status(400).json({
      error: {
        type: "configuration_error",
        message:
          "Nessuna chiave Anthropic disponibile: imposta ANTHROPIC_API_KEY nelle variabili del servizio Railway, oppure inserisci la tua chiave nel pannello «Configurazione IA».",
      },
    });
  }

  try {
    const risposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chiave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    /* Il corpo viene rimandato così com'è, status compreso: il retry
       esponenziale del client deve poter riconoscere 429 e 529. */
    const testo = await risposta.text();
    res.status(risposta.status).type("application/json").send(testo);
  } catch (e) {
    res.status(502).json({
      error: { type: "api_error", message: `Errore di rete verso Anthropic: ${e?.message || e}` },
    });
  }
});

/* ------------------------------------------------------------- statici -----
   Cache lunga sugli asset con hash nel nome, nessuna cache su index.html:
   così un nuovo deploy viene visto subito, senza svuotare la cache a mano. */
const dist = path.join(__dirname, "dist");
app.use(
  express.static(dist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
      else if (filePath.includes(`${path.sep}assets${path.sep}`))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

/* Applicazione a pagina singola: qualunque altra rotta restituisce index.html,
   così un refresh su un percorso profondo non produce un 404. */
app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

const porta = process.env.PORT || 3000;
app.listen(porta, "0.0.0.0", () => {
  console.log(`Conto Economico Riclassificato in ascolto sulla porta ${porta}`);
  if (!process.env.ANTHROPIC_API_KEY)
    console.warn("ANTHROPIC_API_KEY non impostata: il provider Claude funzionerà solo con la chiave inserita a schermo.");
});
