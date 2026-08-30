# NPC Token Replacer

[English](README.md) · **Italiano**

Un modulo per Foundry VTT che sostituisce automaticamente i token PNG della scena con le versioni ufficiali dei compendi D&D, preservandone posizione, elevazione, dimensioni e visibilità.

## ✨ Caratteristiche

- **Sostituzione in un clic**: aggiunge un pulsante alla barra dei Controlli Token
- **Rilevamento automatico dei compendi**: trova ogni sorgente D&D ufficiale installata partendo dai segnali del pacchetto — l'SRD di sistema, i moduli pubblicati da Wizards of the Coast e i contenuti D&D premium. Non c'è una lista da mantenere, quindi anche i manuali usciti dopo questo modulo vengono riconosciuti.
- **Supporto multi-compendio**: cerca in più compendi ufficiali contemporaneamente
- **Sistema di priorità intelligente**: preferisce le creature di avventure ed espansioni al Monster Manual, e il Monster Manual all'SRD
- **Selezione dei compendi configurabile**: leggi tutte le sorgenti ufficiali (predefinito), limitati ai manuali base, includi contenuti premium di terze parti, oppure scegli i compendi uno per uno
- **Progettato per durare**: le API di Foundry vengono rilevate per funzionalità, mai per numero di versione, così il modulo continua a funzionare tra una generazione e l'altra — minimo v13, verificato su v14
- **Preserva le proprietà del token**: posizione, elevazione, dimensioni, visibilità, rotazione e disposizione
- **Finestra di conferma**: mostra l'elenco dei token che verranno sostituiti prima di procedere
- **Log dettagliati**: tracciamento completo in console per diagnosi
- **Confronto nomi intelligente**: gestisce le varianti dei nomi (es. "Goblin Warrior" corrisponde a "Goblin")
- **Modalità variazione token**: scegli come gestire più varianti grafiche dello stesso token (Nessuna/Sequenziale/Casuale)
- **Organizzazione in cartelle**: i mostri importati vengono ordinati automaticamente in cartelle

## 📚 Contenuti D&D ufficiali supportati

Per impostazione predefinita il modulo si fida **esattamente degli 11 pacchetti
ufficiali di Wizards of the Coast pubblicati su Foundry VTT** (vedi la
[pagina creator di Foundry VTT](https://foundryvtt.com/creators/wizards-of-the-coast/)).
Il prefisso dell'id di un pacchetto non basta mai da solo: `dnd-` e `ddb-` sono
usati anche da importatori, homebrew e avventure della community.

Oltre a questa whitelist il modulo tiene d'occhio i **contenuti che non conosce**
e te li segnala, invece di ignorarli in silenzio:

| Come viene riconosciuta una sorgente | Esempio | Categoria | Usata di default |
|---------------------------------------|---------|-----------|------------------|
| I compendi del sistema di gioco attivo | mostri SRD di `dnd5e` | SRD | ✅ |
| Presente nell'elenco ufficiale WotC | `dnd-monster-manual` | Ufficiale | ✅ |
| Firmata Wizards of the Coast / Foundry Gaming | un manuale uscito dopo questa versione | Sembra ufficiale | ⚙️ opzionale |
| Contenuto premium che dichiara il sistema dnd5e | bestiari a pagamento di terzi | Premium | ⚙️ opzionale |
| Id aggiunto in **Sorgenti compendio aggiuntive** | qualsiasi altra cosa | Manuale | ⚙️ opzionale |

Quando installi un nuovo manuale ufficiale, viene rilevato come **"Sembra
ufficiale"**, registrato nel log con un avviso che ne indica il nome e mostrato
nel selettore dei compendi: passa a **Tutto ciò che viene rilevato** per usarlo
subito, senza aspettare un aggiornamento del modulo.

I contenuti di terze parti — DDB-Importer (`ddb-*`), moduli homebrew della
community e i manuali storici mai portati su Foundry da WotC (Volo's, MToF,
MPMM, Fizban's, Curse of Strahd, Icewind Dale, Descent into Avernus, ecc.) —
sono deliberatamente esclusi dalla whitelist.

Gli 11 pacchetti fidati, e la priorità a cui corrispondono:

### Priorità 4 — AVVENTURA (massima: si preferiscono i token specifici dell'avventura)

| ID modulo | Contenuto |
|-----------|-----------|
| `dnd-phandelver-below` | Phandelver and Below: The Shattered Obelisk |
| `dnd-tomb-annihilation` | Tomb of Annihilation |
| `dnd-adventures-faerun` | Forgotten Realms: Adventures in Faerûn |
| `dnd-heroes-faerun` | Forgotten Realms: Heroes of Faerûn |
| `dnd-heroes-borderlands` | Heroes of the Borderlands |

### Priorità 3 — ESPANSIONE

| ID modulo | Contenuto |
|-----------|-----------|
| `dnd-forge-artificer` | Eberron: Forge of the Artificer |

### Priorità 2 — BASE (edizioni 2024)

| ID modulo | Contenuto |
|-----------|-----------|
| `dnd-monster-manual` | Monster Manual (2024) |
| `dnd-players-handbook` | Player's Handbook (2024) |
| `dnd-dungeon-masters-guide` | Dungeon Master's Guide (2024) |

### Priorità 1 — RIPIEGO (SRD e opzioni)

| ID modulo | Contenuto |
|-----------|-----------|
| `dnd5e` | Mostri dell'SRD del sistema D&D 5e (gratuito) |
| `dnd-tashas-cauldron` | Tasha's Cauldron of Everything |

### 📚 Sistema di priorità dei compendi

Quando la stessa creatura esiste in più compendi, il modulo usa un sistema a 4
livelli per scegliere la versione migliore:

1. **Priorità 4 – AVVENTURA**: si preferiscono le creature dei moduli avventura, perché portano illustrazioni e statistiche specifiche di quell'avventura.
2. **Priorità 3 – ESPANSIONE**: manuali di espansione con creature nuove o varianti.
3. **Priorità 2 – BASE**: manuali base 2024 (Monster Manual, PHB, DMG).
4. **Priorità 1 – RIPIEGO**: SRD e opzioni (Tasha's), usati come ultima risorsa.

Così ottieni sempre la migliore grafica e i migliori dati disponibili.

Un pacchetto fuori dalla whitelist non riceve mai una priorità implicita. Se
viene raccolto da uno dei segnali opzionali, viene classificato in base a cosa
contiene davvero: un compendio Adventure significa avventura (4), i compendi
Scene un manuale di ambientazione (3), nessuno dei due un manuale di regole (2).

Vengono indicizzate solo le voci Actor che possono sostituire un PNG: personaggi
giocanti, gruppi e veicoli presenti in quei compendi vengono ignorati.

## 🛡️ Requisiti

- **Foundry VTT**: versione 13 o superiore (verificato su v14)
- **Sistema**: D&D 5th Edition (dnd5e) v4.0.0+
- **Contenuti D&D ufficiali**: almeno un modulo ufficiale D&D con compendi Actor (es. Monster Manual 2024)

## 📦 Installazione

> **Non ancora nel catalogo di Foundry.** Questo modulo non è stato sottomesso al
> registro ufficiale dei pacchetti Foundry, quindi cercandolo nella finestra
> **Installa Modulo** di Foundry non lo troverai. Usa l'URL del manifest qui
> sotto (Metodo 2): è la via consigliata, e Foundry terrà il modulo aggiornato
> automaticamente esattamente come farebbe per un pacchetto in elenco.

### 📦 Metodo 1: installazione manuale

1. Scarica l'ultima release da questo repository
2. Estrai il contenuto nella cartella dei moduli di Foundry VTT:
   - Windows: `%localappdata%/FoundryVTT/Data/modules/`
   - macOS: `~/Library/Application Support/FoundryVTT/Data/modules/`
   - Linux: `~/.local/share/FoundryVTT/Data/modules/`
3. Rinomina la cartella estratta in `npc-token-replacer`
4. Riavvia Foundry VTT
5. Abilita il modulo nelle impostazioni del tuo mondo

### 📦 Metodo 2: URL del manifest (consigliato)

1. In Foundry VTT vai alla scheda **Moduli Aggiuntivi**
2. Clicca **Installa Modulo**
3. Incolla l'URL del manifest nel campo **Manifest URL**:
   ```
   https://github.com/Aiacos/npc-token-replacer/releases/latest/download/module.json
   ```
4. Clicca **Installa**
5. Abilita il modulo nelle impostazioni del tuo mondo

## 🎯 Utilizzo

1. Apri una scena con dei token PNG posizionati
2. Seleziona il livello **Controlli Token** (l'icona della persona nella barra a sinistra)
3. **Facoltativo**: seleziona dei token specifici per sostituire solo quelli (senza selezione vengono elaborati tutti i PNG della scena)
4. Clicca il pulsante **Sostituisci Token PNG** (icona di sincronizzazione)
5. Compare una finestra di conferma con l'elenco dei token che verranno sostituiti
6. Clicca **Sostituisci Token** per procedere o **Annulla** per interrompere
7. Il modulo:
   - cerca le creature corrispondenti in tutti i compendi abilitati
   - elimina i token originali
   - crea i nuovi token dal compendio mantenendo posizione, elevazione, dimensioni e visibilità originali
8. Una notifica riporta il risultato

### 🎯 Modalità di selezione

- **Con token selezionati**: vengono sostituiti solo i PNG selezionati
- **Senza selezione**: vengono sostituiti tutti i PNG della scena

## 🎯 Proprietà del token preservate

Durante la sostituzione queste proprietà vengono mantenute dal token originale:

| Proprietà | Descrizione |
|-----------|-------------|
| Posizione (x, y) | Posizione esatta sulla griglia |
| Elevazione | Valore di elevazione verticale |
| Dimensioni (larghezza, altezza) | Dimensione del token in celle |
| Nascosto | Stato di visibilità (nascosto/visibile) |
| Rotazione | Angolo di rotazione |
| Disposizione | Ostile, Neutrale o Amichevole |
| Bloccato | Se il token è bloccato |
| Alpha | Opacità del token |

## ⚙️ Impostazioni del modulo

Raggiungibili da **Impostazioni di Gioco** > **Configura Impostazioni** > **Impostazioni Modulo** > **NPC Token Replacer**.

| Impostazione | Opzioni | Descrizione |
|--------------|---------|-------------|
| Modalità variazione token | Nessuna, Sequenziale, Casuale | Come scegliere la grafica quando esistono più varianti |
| Timeout finestra di anteprima | 1-30 minuti (default: 5) | Quanto attendere prima di chiudere automaticamente l'anteprima |
| Timeout HTTP | 1-30 secondi (default: 5) | Timeout delle richieste di rete per risolvere i percorsi wildcard |
| Sorgenti compendio aggiuntive | Id separati da virgola | Id di pacchetti o compendi da trattare come sorgenti ufficiali. Serve solo per contenuti che il modulo non riesce a riconoscere da solo. |
| Configura compendi | Pulsante | Apre la finestra per scegliere quali compendi usare |

### ⚙️ Modalità variazione token

Alcune creature hanno più varianti grafiche. Questa impostazione decide quale usare:

- **Nessuna**: usa sempre la prima variante disponibile
- **Sequenziale** (predefinita): scorre le varianti in ordine. Con 5 Goblin nella scena otterrai le varianti 1, 2, 3, 4, 5 (ricominciando da capo se le varianti sono meno)
- **Casuale**: sceglie una variante a caso per ogni token

### ⚙️ Selezione dei compendi

Il modulo offre quattro modalità:

| Modalità | Descrizione |
|----------|-------------|
| **Tutto il contenuto D&D ufficiale** (predefinita) | Legge ogni sorgente ufficiale rilevata nel mondo: l'SRD di sistema più tutti i moduli Wizards of the Coast. I manuali installati in seguito vengono riconosciuti da soli. |
| **Solo manuali base + SRD** | Limita la ricerca all'SRD e ai manuali base (Monster Manual, PHB, DMG). Avventure ed espansioni vengono ignorate. |
| **Tutto ciò che viene rilevato** | Include anche i contenuti D&D premium di altri editori e tutto ciò aggiunto in **Sorgenti compendio aggiuntive**. |
| **Selezione personalizzata** | Scegli manualmente quali compendi usare. |

> Vieni dalla 1.4.x? La modalità predefinita è cambiata: i mondi che non hanno
> mai toccato questa impostazione ora leggono **tutto** il contenuto ufficiale
> invece dei soli manuali base. Scegli **Solo manuali base + SRD** per tornare
> al comportamento precedente.

Per configurarla:
1. Apri le Impostazioni Modulo
2. Clicca **Configura compendi**
3. Scegli la modalità preferita
4. Con la Selezione personalizzata, spunta i compendi che vuoi
5. Clicca Salva

## 🔍 Confronto dei nomi

Il modulo usa un confronto in tre fasi per trovare le creature nei compendi:

1. **Corrispondenza esatta**: prima cerca il nome identico
2. **Corrispondenza per varianti**: rimuove prefissi e suffissi comuni
   - Prefissi: "Young", "Adult", "Ancient", "Elder", "Greater", "Lesser"
   - Suffissi: "Warrior", "Guard", "Scout", "Champion", "Leader", "Chief", "Captain", "Shaman", "Berserker"
3. **Corrispondenza parziale**: verifica se i nomi condividono parole significative (4+ caratteri)

### 🔍 Esempi

| Token nella scena | Corrispondenza nel compendio |
|-------------------|------------------------------|
| "Goblin" | "Goblin" |
| "Goblin Warrior" | "Goblin" |
| "Young Red Dragon" | "Red Dragon" |
| "Orc War Chief" | "Orc" |

## 🐛 Comandi da console

Per diagnosi o controllo manuale, dalla console del browser (F12):

```javascript
// Esegue la sostituzione manualmente
NPCTokenReplacer.replaceNPCTokens();

// Elenca i compendi WotC rilevati
NPCTokenReplacer.detectWOTCCompendiums();

// Elenca i compendi attualmente abilitati
NPCTokenReplacer.getEnabledCompendiums();

// Elenca i token PNG della scena corrente
NPCTokenReplacer.getNPCTokensFromScene();

// Svuota l'indice dei mostri in cache (forza il ricaricamento)
NPCTokenReplacer.clearCache();

// Log dettagliati, categoria di rilevamento inclusa
NPCTokenReplacer.debugEnabled = true;
```

## 🐛 Risoluzione dei problemi

### 🐛 "Nessun compendio D&D ufficiale trovato"

Assicurati di aver installato e abilitato almeno un modulo D&D ufficiale con compendi Actor (es. Monster Manual 2024, Phandelver and Below, ecc.).

### 🐛 "Nessun compendio disponibile per la sostituzione"

Il modulo non ha trovato compendi abilitati. Verifica che:
1. hai contenuti D&D ufficiali installati
2. i compendi sono abilitati nelle impostazioni del modulo
3. la console (F12) mostri i compendi rilevati

### 🐛 Token non riconosciuti

Controlla il log della console per sapere quali creature non sono state trovate. L'algoritmo è flessibile, ma alcune creature custom o homebrew non hanno un equivalente nei compendi ufficiali.

Se una creatura esiste in un manuale ufficiale appena uscito, cerca nel log
l'avviso su un pacchetto che **"sembra ufficiale"**: passando alla modalità
**Tutto ciò che viene rilevato** lo userai subito.

### 🐛 Alcuni token danno errore

Se token specifici non vengono sostituiti, controlla i dettagli in console. Cause comuni:
- dati del token corrotti
- riferimenti all'attore mancanti
- problemi di permessi

## 🛡️ Compatibilità

| Foundry | Stato | Note |
|---------|-------|------|
| v12 | Non supportata dalla 1.6.0 | Il livello di compatibilità contiene ancora i ripieghi AppV1, ma il manifest richiede la 13 |
| v13 | Supportata (minimo) | Controlli scena a oggetto, barra di avanzamento via notifiche |
| v14 | Verificata | Stabile attuale; le classi AppV1 esistono ancora ma sono deprecate |
| v15+ | Dovrebbe funzionare | Non è dichiarato alcun `compatibility.maximum` e ogni API spostata viene rilevata per funzionalità, quindi le generazioni future non sono bloccate |

Il modulo risolve le API di Foundry controllando cosa esiste, mai confrontando
numeri di versione: usa `DialogV2` e `ApplicationV2` quando ci sono, con le
classi AppV1 come ripiego. Un job settimanale della CI sorveglia le nuove
release di Foundry e apre una pull request che aggiorna la generazione
verificata.

**Sistema D&D 5e**: richiesto. Nemmeno per il sistema è dichiarata una versione massima.

## 🛡️ Limitazioni note

- Funziona solo con attori di tipo PNG (personaggi giocanti, gruppi e veicoli vengono ignorati)
- Richiede almeno un modulo D&D ufficiale con compendi Actor
- Le creature custom o homebrew senza equivalente ufficiale vengono saltate
- La grafica del compendio sostituisce qualsiasi grafica personalizzata del token

## 🧩 Architettura

Per il diagramma delle classi, le responsabilità dei componenti e i pattern di
progettazione fai riferimento al [README in inglese](README.md#-architecture),
che resta il riferimento tecnico principale ed è quello aggiornato per primo.

Documentazione tecnica di supporto:

- [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) — politica di supporto delle versioni Foundry e livello di compatibilità
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — ambiente di sviluppo, controlli di qualità, CI/CD e procedura di rilascio

## 🔄 Sviluppo e rilasci

| Comando | Scopo |
|---------|-------|
| `npm test` | Esegue la suite di test (232 test) |
| `npm run lint` | ESLint su `scripts/`, `tools/` e `tests/` |
| `npm run validate` | Verifica `module.json`, i file referenziati, le chiavi i18n e i percorsi dei template |
| `npm run check` | Tutti e tre, in ordine |
| `bash build.sh` | Costruisce lo ZIP distribuibile in `releases/` |

I rilasci sono prodotti dal workflow GitHub Actions **Release** con un solo
trigger: incrementa la versione, crea il tag, costruisce e verifica il
pacchetto, pubblica la release su GitHub e la annuncia al registro dei pacchetti
Foundry.

### 🔄 Pubblicare il modulo su foundryvtt.com

Il modulo è distribuito tramite URL del manifest e **non** è presente nel
catalogo integrato di Foundry. Metterlo in elenco è una procedura una tantum, e
deve avvenire prima che la pipeline possa annunciare le nuove versioni a
Foundry: il `FOUNDRY_PACKAGE_TOKEN` usato per farlo viene emesso per singolo
pacchetto ed esiste solo dopo l'approvazione.

**1. Sottometti il pacchetto** — serve un account con una licenza Foundry VTT
attiva. Accedi a [foundryvtt.com](https://foundryvtt.com/) e apri
`https://foundryvtt.com/packages/submit`.

**2. Attendi la revisione** — le sottomissioni sono riviste manualmente. La
revisione verifica se l'autore ha i diritti su tutto ciò che il pacchetto
contiene, se include contenuti di altre aziende e in tal caso se rispetta le
loro licenze, e se include grafica non realizzata dall'autore.

Questo modulo **non spedisce alcun contenuto D&D**: niente testi, niente
statistiche, niente grafica. Legge soltanto i compendi che l'utente possiede
già, provenienti da moduli che ha acquistato.

**3. Copia il token di rilascio** — dopo l'approvazione apri la pagina di
modifica del pacchetto da **Profilo → Packages → Edit**. Appena sopra il
pulsante **Save Package** c'è un campo chiamato **Package Release Token**:
cliccalo per copiarlo. Non c'è nulla da generare, il token esiste già.

**4. Salvalo come secret del repository** — esegui questo comando nel tuo
terminale, così il valore non finisce mai nella cronologia della shell né in una
trascrizione:

```bash
gh secret set FOUNDRY_PACKAGE_TOKEN
```

Finché non lo fai non si rompe nulla: lo step del registro nel workflow di
rilascio registra uno skip ed esce pulito, le release arrivano comunque su
GitHub e l'URL del manifest continua a servire gli aggiornamenti a chiunque
abbia installato da lì.

I dettagli completi, compreso cosa fare se il token trapela e come validarlo con
una richiesta di prova, sono in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## 🧪 Contribuire

I contributi sono benvenuti. Apri pure issue o pull request.

## 📜 Licenza

Questo modulo è rilasciato sotto licenza MIT.

## 📜 Crediti

Creato per la comunità di Foundry VTT.
