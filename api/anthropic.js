/* ============================================================================
 *  Proxy Anthropic — versione serverless per Vercel
 *  ---------------------------------------------------------------------------
 *  Stesso contratto della rotta Express in server.js (usata da Railway):
 *  stesso body, stesso status di ritorno, stesso header opzionale x-user-key.
 *  Su Vercel questo file diventa automaticamente la funzione /api/anthropic;
 *  su Railway non viene nemmeno caricato, perché lì risponde server.js.
 *
 *  Nota sui limiti: una funzione serverless Vercel accetta richieste fino a
 *  ~4,5 MB. I PDF allegati in base64 pesano circa un terzo in più del file
 *  originale, quindi oltre i ~3 MB di PDF conviene il deploy su Railway, dove
 *  il limite è alzato a 60 MB in server.js.
 * ==========================================================================*/

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: { type: "invalid_request_error", message: "Metodo non consentito: usa POST." },
    });
  }

  /* La chiave dell'utente, se presente nell'header x-user-key, ha la precedenza
     e vale per la singola richiesta: viene usata e dimenticata, mai registrata.
     Altrimenti si usa ANTHROPIC_API_KEY dell'ambiente Vercel. */
  const chiave = req.headers["x-user-key"] || process.env.ANTHROPIC_API_KEY;
  if (!chiave) {
    return res.status(400).json({
      error: {
        type: "configuration_error",
        message:
          "Nessuna chiave Anthropic disponibile: imposta ANTHROPIC_API_KEY nelle Environment Variables del progetto Vercel, oppure inserisci la tua chiave nel pannello «Configurazione IA».",
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
    res.status(risposta.status).setHeader("content-type", "application/json");
    return res.send(testo);
  } catch (e) {
    return res.status(502).json({
      error: { type: "api_error", message: `Errore di rete verso Anthropic: ${e?.message || e}` },
    });
  }
}
