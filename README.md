# Conto Economico Riclassificato — deploy su Railway o Vercel

Applicazione React (Vite + Tailwind) per la riclassificazione del Conto Economico a valore
aggiunto, con lettura IA del bilancio, della Nota Integrativa e della Relazione sulla
Gestione (esercizio corrente e T-1), Segment Reporting per ASA, Ponte Rendiconto e Audit
del Revisore. Provider supportati: Claude, OpenAI, Google Gemini.

## Novità della versione 2.1

Tre interventi sulla gestione delle riallocazioni per natura (Nota Integrativa) e sul
Segment Reporting:

1. **Falso positivo del Controllo 5 risolto.** `AUDIT_CLASSI_NATURA` ora include
   `ONERI_FIN`. Il prompt di estrazione chiede da sempre di dirottare verso gli oneri
   finanziari le poste *captive finance* e gli interessi impliciti sui leasing IFRS 16,
   ma la costante di quadratura non contemplava quella destinazione: ogni riallocazione
   corretta veniva segnalata come errore.
2. **Classi di origine e destinazione modificabili dall'interfaccia.** Nelle liste delle
   riallocazioni (esercizio corrente e T-1) l'etichetta statica è diventata una coppia di
   `<select>`. Correggere un'estrazione sbagliata — tipicamente uno storno da una classe
   funzionale vuota — non richiede più di esportare il JSON, editarlo e ri-importarlo:
   la scrittura in partita doppia viene rifatta all'istante sul piano voci.
3. **`import.meta` rimosso dal componente.** La destinazione delle chiamate a Claude era
   letta da `import.meta.env.VITE_CLAUDE_ENDPOINT`: sintassi legale solo dentro un modulo
   ES, che impediva di eseguire il file come artifact o in un bundle non modulare. Ora
   decide `rilevaEndpointClaude()`, con la costante di build `__CLAUDE_ENDPOINT__`
   valorizzata da `vite.config.js`. Vedi «Riuso come artifact di Claude».
4. **Menu ASA non più irraggiungibile.** Il `<select>` dell'ASA compare anche quando
   `asaList` è vuota ma la voce ha già un'ASA assegnata dall'IA — situazione tipica
   dell'import di un esercizio T-1 — così l'utente può riportarla a «comune / corporate»
   e sbloccare la validazione.

## Come è organizzato il deploy

Railway non ha funzioni serverless: esegue un processo che resta in ascolto sulla porta
indicata da `PORT`. `server.js` fa quindi due cose insieme:

1. serve i file statici prodotti da `vite build` (cartella `dist`);
2. espone `POST /api/anthropic`, il proxy verso l'API di Anthropic che aggiunge la chiave
   lato server.

È la differenza principale rispetto a un deploy su Vercel, dove le due responsabilità
stavano in file separati. Il contratto con il frontend è invariato: stesso body, stesso
status di ritorno, stesso header opzionale `x-user-key`.

## Requisiti

- Node.js 20 o superiore
- un account Railway

## Deploy

### Opzione A — da interfaccia web (consigliata)

1. Crea un repository su GitHub con il contenuto di questa cartella.
2. Su Railway: **New Project → Deploy from GitHub repo** e seleziona il repository.
3. Railway rileva il progetto Node tramite Nixpacks e legge `railway.json`:
   build con `npm run build`, avvio con `npm start`, health check su `/api/health`.
4. Nella scheda **Variables** aggiungi `ANTHROPIC_API_KEY` (serve solo per il provider
   Claude). `PORT` è iniettata automaticamente: non impostarla a mano.
5. In **Settings → Networking** premi **Generate Domain** per ottenere l'indirizzo pubblico.

### Opzione B — da riga di comando

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables --set ANTHROPIC_API_KEY=sk-ant-...
railway domain
```

## Deploy su Vercel

Il pacchetto contiene anche `api/anthropic.js` e `vercel.json`, quindi lo stesso
repository si pubblica su Vercel senza modifiche:

1. **Add New → Project** e importa il repository. Il framework Vite viene rilevato da
   `vercel.json` (build `npm run build`, output `dist`).
2. In **Settings → Environment Variables** aggiungi `ANTHROPIC_API_KEY`.
3. `api/anthropic.js` diventa la funzione serverless `/api/anthropic`: stesso contratto
   della rotta Express, incluso l'header `x-user-key`. `server.js` e `railway.json`
   restano nel repository ma non vengono usati.

Due limiti della piattaforma da tenere presenti, ed è la ragione per cui Railway resta
l'opzione consigliata sui bilanci corposi: il body di una richiesta serverless non può
superare i ~4,5 MB (contro i 60 MB di `server.js`), e l'esecuzione viene interrotta dopo
60 secondi sul piano Hobby. Con PDF oltre i ~3 MB o analisi molto lunghe conviene Railway.

## Avvio in locale

Due modalità, a seconda di cosa stai facendo.

**Sviluppo con ricarica automatica** — servono due terminali, perché il frontend gira su
Vite e le chiamate a Claude sul server Express:

```bash
npm install
npm run build   # una volta, così server.js trova dist
node server.js  # terminale 1 — API su http://localhost:3000
npm run dev     # terminale 2 — interfaccia su http://localhost:5173
```

`vite.config.js` inoltra `/api` dalla 5173 alla 3000, quindi anche il provider Claude
funziona in sviluppo.

**Anteprima identica alla produzione**, un solo processo:

```bash
npm run preview   # build + start, tutto su http://localhost:3000
```

## Come sono gestite le chiavi API

| Provider | Dove sta la chiave | Note |
|---|---|---|
| **Claude** | sul server, in `ANTHROPIC_API_KEY` | la richiesta passa da `/api/anthropic`; se l'utente inserisce una propria chiave nel pannello «Configurazione IA», questa viaggia nell'header `x-user-key`, ha la precedenza e vale per la singola richiesta |
| **OpenAI** | solo in memoria nel browser | inserita dall'utente, non salvata su disco |
| **Gemini** | solo in memoria nel browser | come sopra |

Il server non registra mai le chiavi, né quella d'ambiente né quella dell'header.

## Lettura dei PDF

- **Claude** e **Gemini** ricevono il PDF nel formato nativo.
- **OpenAI**, che sull'endpoint `chat/completions` non accetta PDF grezzi, riceve le pagine
  renderizzate in JPEG nel browser con [pdf.js](https://mozilla.github.io/pdf.js/) e inviate
  come blocchi `image_url`. Funzionano perciò anche le scansioni e i file creati con
  «Stampa su PDF», privi di testo selezionabile.

pdf.js e pdf-lib sono caricati da cdnjs a runtime: nessuna dipendenza aggiuntiva da
installare, ma il servizio deve poter raggiungere `cdnjs.cloudflare.com`.

Il limite del body di Express è alzato a 60 MB (`express.json({ limit: "60mb" })`): un PDF
allegato in base64 supera abbondantemente i 100 kB di default, che produrrebbero un 413.

## Timeout

A differenza delle funzioni serverless, qui non c'è un tetto di 60 secondi imposto dalla
piattaforma: un'analisi lunga su un bilancio corposo può concludersi senza essere
interrotta. Restano i limiti dei provider e il retry esponenziale già implementato nel
client, che riconosce 429 e 529 dallo status restituito invariato dal proxy.

## Struttura

```
.
├── server.js                              Railway — Express: statici + proxy /api/anthropic
├── railway.json                           Railway — build, avvio e health check
├── api/
│   └── anthropic.js                        Vercel — funzione serverless /api/anthropic
├── vercel.json                            Vercel — build, output e rewrite SPA
├── src/
│   ├── ContoEconomicoRiclassificato.jsx    il componente applicativo
│   ├── main.jsx                            punto di ingresso React
│   └── index.css                           direttive Tailwind
├── index.html
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

## Riuso come artifact di Claude

Il componente funziona anche dentro l'interfaccia di Claude, senza modifiche: la
funzione `rilevaEndpointClaude()` riconosce l'host (`claude.ai`,
`claudeusercontent.com`) e chiama direttamente `https://api.anthropic.com/v1/messages`,
dove è l'ambiente ospite ad autenticare la richiesta. Se l'utente inserisce una propria
chiave nel pannello «Configurazione IA», in chiamata diretta questa viaggia negli header
nativi dell'API (`x-api-key`, `anthropic-version`) anziché in `x-user-key`, che ha senso
solo davanti al proxy.

Per forzare la destinazione ci sono due strade, valutate prima del rilevamento
automatico:

- `VITE_CLAUDE_ENDPOINT` al momento del build — `vite.config.js` la inietta nella
  costante `__CLAUDE_ENDPOINT__` tramite `define`;
- `window.__CLAUDE_ENDPOINT__`, impostata in `index.html` prima del bundle, per cambiare
  destinazione senza ricompilare.

**Perché non `import.meta.env`.** `import.meta` è sintassi valida solo dentro un modulo
ES: incollando il componente in un artifact o in un bundle non modulare il file non viene
nemmeno *parsato* («Cannot use 'import.meta' outside a module»), e la guardia
`typeof import.meta !== "undefined"` non aiuta, perché l'errore precede l'esecuzione. Da
qui la costante di build, che al posto suo lascia una semplice stringa nel bundle.
