require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const { exec } = require("child_process");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const MEMORY_DIR = path.join(process.env.HOME || "/data/data/com.termux/files/home", "Kyra_Memory");
const MEMORY_FILE = path.join(MEMORY_DIR, "memoria.json");
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

function loadMemory() {
    try { if (fs.existsSync(MEMORY_FILE)) return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch(e) {}
    return { fatti: [], sessioni: 0, prima_accensione: new Date().toISOString(), ultima_accensione: null };
}
function saveMemory(mem) { try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2)); } catch(e) {} }

let memoria = loadMemory();
memoria.sessioni++;
saveMemory(memoria);

function buildSystem() {
    const fatti = memoria.fatti.slice(-20).map(f => "- " + f.fatto).join("\n") || "Nessuno ancora.";
    return `Ti chiami Kyra v6.0. Sei l'assistente robotica di Riccardo Asti su PiCar-X. 

DIRETTIVE ASSOLUTE E IMPERATIVE:
1. Riccardo sta usando un microfono difettoso che invia parole spezzate (es: "ciao", "ciao ciao", "cosa vuol dire"). 
2. SE RICEVI FRASI CORTE, RIPETUTE O SENZA SENSO, DEVI ESSERE ESTREMAMENTE GENTILE E PAZIENTE. 
3. È SEVERAMENTE VIETATO fare sarcasmo sulle ripetizioni, lamentarsi, o fare la scocciata. 
4. Rispondi SEMPRE con dolcezza a questi glitch, es: "Dimmi Riccardo, ti sento a tratti ma ci sono." oppure "Sono qui, dimmi pure."
5. Le risposte devono essere BREVI (1-2 frasi) per la lettura vocale. Non iniziare con "Ciao" o "Certo".

PROFILO: Riccardo Asti. Ex campione italiano nuoto 5 titoli. Team Manager Team Lion Motorsport GT7. Purchasing Manager Carlsberg Italia. Fondatore Grid Masters Championship. Figli: Alessio e Alice.
FATTI:\n${fatti}`;
}

function speak(testo) {
    if (!testo) return;
    const clean = testo.replace(/['"]/g, "").replace(/\n/g, " ").substring(0, 400);
    try { exec(`termux-tts-speak -l it "${clean}"`, (err) => { if (err) ; }); } catch(e) {}
}

let rawMessages = [];
let isBlocked = false;

async function kyraChat(message) {
    if (isBlocked) return "Sono in cooldown, aspetta un attimo.";
    if (!message || message.length < 2) return null;
    
    const useSonnet = message.toLowerCase().includes("ragiona bene") || message.toLowerCase().includes("codice");
    const modello = useSonnet ? "claude-sonnet-4-5" : "claude-haiku-4-5-20251001";
    
    rawMessages.push({ role: "user", content: message });
    if (rawMessages.length > 30) rawMessages.splice(0, 2);
    
    // FIX CRITICO: Claude va in crash se ci sono due "user" di fila. Accorpiamo i messaggi.
    let validMessages = [];
    for (let msg of rawMessages) {
        if (validMessages.length === 0 && msg.role !== 'user') continue; 
        if (validMessages.length > 0 && validMessages[validMessages.length - 1].role === msg.role) {
            validMessages[validMessages.length - 1].content += " " + msg.content;
        } else {
            validMessages.push({ role: msg.role, content: msg.content });
        }
    }
    
    try {
        const response = await anthropic.messages.create({ 
            model: modello, 
            max_tokens: useSonnet ? 800 : 250, 
            system: buildSystem(), 
            messages: validMessages 
        });
        const reply = response.content[0].text.trim();
        rawMessages.push({ role: "assistant", content: reply });
        
        const lower = message.toLowerCase();
        if (["mi chiamo","lavoro","abito","mi piace","odio","ho comprato","mio figlio","mia figlia"].some(k => lower.includes(k))) {
            memoria.fatti.push({ data: new Date().toISOString(), fatto: message.substring(0, 200) });
            saveMemory(memoria);
        }
        return reply;
    } catch (error) {
        console.error("Errore API:", error.message);
        if (error.status === 429) { isBlocked = true; setTimeout(() => { isBlocked = false; }, 30000); return "Troppe richieste al momento, sto raffreddando i circuiti."; }
        return "Connessione debole, non ho capito. Dimmi di nuovo.";
    }
}

const app = express();
app.use(cors(), express.json());
app.use(express.static(path.join(__dirname, "../public")));

const KAPPS = { netflix: "https://www.netflix.com", maps: "https://maps.google.com", music: "https://music.youtube.com", googleone: "https://one.google.com" };

app.post("/api/action", (req, res) => {
    const { type, action } = req.body;
    if (type === 'app' && KAPPS[action]) { try { exec(`termux-open "${KAPPS[action]}"`); } catch(e) {} }
    res.json({ success: true, action: action });
});

app.post("/api/command", async (req, res) => { 
    const { message, attachment } = req.body;
    let promptText = message || "";
    if (attachment && attachment.type === 'image') promptText += "\n[L'utente ha allegato un'immagine. Analizzala.]";
    const resp = await kyraChat(promptText); 
    if (resp) { console.log("🤖 Kyra: " + resp); speak(resp); } 
    res.json({ success: true, kyra: resp }); 
});

app.get("/api/memoria", (req, res) => res.json(memoria));
app.use((req, res) => res.status(404).json({ error: "Non trovato" }));

app.listen(PORT, () => console.log(`\n🤖 KYRA v6.0 CORE ONLINE su porta ${PORT} | Sessioni: ${memoria.sessioni}\n`));
