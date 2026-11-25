# Le mie buste

Budget a buste per telefono: ogni busta riceve una quota fissa ogni mese, le spese la scalano e il residuo
passa al mese dopo. Include spostamenti di denaro tra buste, pagamenti periodici (stipendio, abbonamenti, rate),
colori personalizzabili, tema chiaro e scuro, uso offline e backup su file.

**I dati restano sul dispositivo**: l'app non ha server, account né statistiche e non fa richieste a siti esterni.
Per questo il codice può stare anche in una pagina pubblica senza esporre le tue spese.

## Come si usa

1. Pubblica la cartella su un hosting statico (vedi sotto) e apri l'indirizzo dall'iPhone, in Safari.
2. Tocca Condividi, poi "Aggiungi alla schermata Home".
3. Apri l'app **sempre da quell'icona**: Safari e l'icona hanno dati separati.
4. Ogni tanto: Altro, poi "Scarica backup". Se cancelli i dati di Safari o cambi telefono, il backup è l'unico modo per recuperare tutto.

Ogni persona che apre l'indirizzo ha i propri dati, sul proprio telefono.

## Hosting statico gratuito

- **GitHub Pages**: Settings, Pages, "Deploy from a branch", branch `main`, cartella `/ (root)`. Su un account gratuito richiede un repository pubblico.
- **Cloudflare Pages** o **Netlify**: collegano anche repository privati. Come cartella da pubblicare indica la radice, senza comando di build.

## Sviluppo

Nessuna dipendenza e nessuna build: sono file statici (`index.html`, `style.css`, `app.js`).

    python3 -m http.server 8000     # poi apri http://localhost:8000
    node test/logic.test.js          # prova i calcoli (riporto, quote, pagamenti periodici)

Se modifichi un file, aumenta `CACHE` in `sw.js` (per esempio `buste-v2`) per forzare l'aggiornamento sui telefoni.
