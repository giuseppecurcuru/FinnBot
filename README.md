# Finn - Expense Tracker Conversazionale 💸🤖

Finn è una piattaforma web per la gestione delle spese quotidiane che unisce una dashboard visuale tradizionale e un'interazione conversazionale basata su Intelligenza Artificiale. 

Il progetto è stato pensato come prototipo di **chatbot applicato alla finanza personale**, con un focus specifico sulla raccolta, organizzazione, modifica e lettura delle spese giornaliere. Permette all'utente di tenere traccia delle proprie finanze sia tramite una normale interfaccia grafica, sia attraverso un assistente capace di interpretare richieste in linguaggio naturale e tradurle in azioni concrete.

---

## 🎯 Obiettivo del Progetto

L'obiettivo di Finn è mostrare come un chatbot possa essere integrato in un'applicazione reale non solo per "rispondere a domande", ma per:
- Comprendere richieste dell'utente in linguaggio naturale.
- Tradurle in operazioni strutturate sui dati.
- Gestire conferme prima di azioni sensibili (Human-in-the-loop).
- Convivere e aggiornare in tempo reale una dashboard tradizionale fatta di grafici e tabelle.

Dal punto di vista didattico, il progetto illustra un modello ibrido tra un **frontend interattivo classico**, la **persistenza locale dei dati** e l'**orchestrazione di un LLM** orientata all'azione.

---

## ✨ Funzionalità Principali

Finn funziona come un vero e proprio *expense tracker conversazionale*, consentendo di:
- **Registrare spese quotidiane** assegnando importo, categoria, data e descrizione.
- **Gestire categorie personalizzate**, assegnando colori esadecimali ed emoji.
- **Pianificare pagamenti futuri**, distinguendo le spese già avvenute da quelle imminenti.
- **Consultare statistiche** tramite dashboard visive.
- **Modificare o eliminare record** sia da interfaccia grafica (UI) che tramite richieste testuali al bot.

---

## 🤖 Il Ruolo del Chatbot (Logica Conversazionale)

Finn non è un generico "coach finanziario", ma un assistente operativo per la gestione dei dati. La sua architettura conversazionale si basa su due livelli:

1. **Interpretazione linguistica:** Il modello riceve la richiesta in linguaggio naturale contestualizzata con i dati attuali dell'utente.
2. **Azioni strutturate (Prompt Engineering):** Il modello non restituisce testo libero, ma è forzato tramite un rigoroso System Prompt a generare un **oggetto JSON** che rappresenta un'intenzione (es. `add_expense`, `delete_expense`, `chat`). Il frontend intercetta questo JSON ed esegue l'azione sul database.

**Sicurezza (Human-in-the-loop):**
Le azioni distruttive o di salvataggio non avvengono mai in automatico. Finn prepara sempre un riepilogo testuale e attende una conferma esplicita ("Sì", "Procedi", "Ok") o un annullamento ("No", "Annulla") da parte dell'utente.

---

## 📊 Dashboard e Visualizzazione Dati

La piattaforma offre una lettura immediata delle abitudini di spesa attraverso l'integrazione con **Chart.js**:
- **Istogramma Giornaliero:** Mostra l'andamento delle spese nei singoli giorni del mese corrente.
- **Grafico a Torta:** Evidenzia la distribuzione percentuale delle spese suddivise per categoria personalizzata.
- **Line Chart Mensile:** Traccia i totali spesi nei 12 mesi, confrontandoli con una linea di media generale.
- **Card Pagamenti Futuri:** Una lista cronologica dei promemoria imminenti.

---

## 🛠️ Architettura Tecnica

Il progetto è interamente Frontend (Client-side) e non richiede un backend remoto per funzionare. 

### Stack Tecnologico
- **HTML5 / CSS3** (UI moderna)
- **JavaScript Vanilla** (Logica dell'applicazione)
- **Chart.js** (Data visualization)
- **API Google Gemini** (NLU e logica conversazionale)
- **Web Storage API (`localStorage`)** (Persistenza dei dati)

### Struttura dei File
- `index.html`: Pagina principale con Chatbot e Dashboard visiva.
- `operations.html`: Pagina dedicata all'archivio storico, filtraggio e modifica dei record.
- `style.css`: Foglio di stile globale.
- `script.js`: Logica core (Integrazione Gemini, rendering Chart.js, gestione LocalStorage).
- `operations.js`: Logica specifica per la gestione della tabella archivio.
- `images/`: Cartella contenente asset grafici (logo, favicon).

---

## 💾 Persistenza dei Dati

Per garantire un'esecuzione rapida e immediata in fase di prototipazione, i dati vengono salvati localmente nel browser dell'utente tramite `localStorage` utilizzando chiavi specifiche (`finn_expenses`, `finn_categories`, `finn_payments`). 
Questo approccio garantisce che i dati non vengano dispersi alla chiusura della pagina, mantenendo al contempo un'infrastruttura "serverless" ideale per demo e presentazioni.

---

## ⚠️ Limiti e Sviluppi Futuri

Trattandosi di un MVP didattico, il progetto presenta limitazioni progettate:
- L'API Key di Gemini risiede lato client (in produzione necessiterebbe di un proxy backend).
- I dati sono salvati in locale, senza sincronizzazione cloud o multi-device.
- Assenza di un sistema di autenticazione multi-utente.

