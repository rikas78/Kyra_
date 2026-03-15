cat > src/kyra_main.js << 'ENDOFFILE'
require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const { exec } = require("child_process");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3002;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY mancante!"); }

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
memoria.ultima_accensione = new Date().toISOString();
saveMemory(memoria);

function buildSystem() {
    const fatti = memoria.fatti.slice(-20).map(f => "- " + f.fatto).join("\n") || "Nessuno ancora.";
    return "Ti chiami Kyra v4.8. Sei il robot fisico di Riccardo Asti su PiCar-X con Raspberry Pi 4. Sei sarcastica, brillante e diretta. Non iniziare mai con Certo o Ciao. Sempre in italiano. Frasi brevi perche sei TTS. Sessione numero " + memoria.sessioni + ". PROFILO: Ex campione italiano nuoto 5 titoli. Team Manager Team Lion Motorsport GT7. Purchasing Manager Carlsberg Italia. Fondatore Grid Masters Championship. Figli: Alessio e Alice. FATTI:\n" + fatti;
}

function speak(testo) {
    if (!testo) return;
    const clean = testo.replace(/['"]/g, "").replace(/\n/g, " ").substring(0, 400);
    try { exec("termux-tts-speak -l it \"" + clean + "\"", (err) => { if (err) exec("termux-tts-speak \"" + clean + "\""); }); } catch(e) {}
}

let messages = [];
let isBlocked = false;

async function kyraChat(message) {
    if (isBlocked) return "Sono in cooldown, aspetta.";
    if (!message || message.length < 2) return null;

    const useSonnet = message.toLowerCase().includes("ragiona bene");
    const modello = useSonnet ? "claude-sonnet-4-5" : "claude-haiku-4-5-20251001";

    messages.push({ role: "user", content: message });
    if (messages.length > 40) messages.splice(0, 2);

    try {
        const response = await anthropic.messages.create({ model: modello, max_tokens: useSonnet ? 800 : 300, system: buildSystem(), messages: messages.slice(-20) });
        const reply = response.content[0].text.trim();
        messages.push({ role: "assistant", content: reply });

        const lower = message.toLowerCase();
        if (["mi chiamo","lavoro","abito","mi piace","odio","ho comprato","mio figlio","mia figlia"].some(k => lower.includes(k))) {
            memoria.fatti.push({ data: new Date().toISOString(), fatto: message.substring(0, 200) });
            saveMemory(memoria);
        }
        return reply;
    } catch (error) {
        if (error.status === 429) { isBlocked = true; setTimeout(() => { isBlocked = false; }, 30000); return "Troppe richieste. Aspetto."; }
        if (error.status === 404) return "Errore 404: Modello AI non trovato.";
        return "Problema tecnico. Riprova.";
    }
}

const app = express();
app.use(cors(), express.json());

app.get("/", (req, res) => { res.send("<h1>Kyra v4.8 Online</h1>"); });

app.post("/api/command", async (req, res) => {
    const { message } = req.body;
    const resp = await kyraChat(message || "");
    if (resp) { console.log("Kyra: " + resp); speak(resp); }
    res.json({ success: true, kyra: resp });
});

app.post("/kyra", async (req, res) => { const resp = await kyraChat(req.body.text || ""); if (resp) speak(resp); res.json({ reply: resp }); });
app.get("/status", (req, res) => res.json({ status: "ONLINE", version: "4.8", sessioni: memoria.sessioni, fatti: memoria.fatti.length }));
app.get("/api/memoria", (req, res) => res.json(memoria));
app.use((req, res) => res.status(404).json({ error: "Non trovato" }));

app.listen(PORT, () => {
    console.log("\n============================================");
    console.log("  KYRA v4.8 - Claude Haiku + Sonnet");
    console.log("  Porta: " + PORT + " | Sessioni: " + memoria.sessioni);
    console.log("============================================\n");
});
ENDOFFILE

git add src/kyra_main.js
git commit -m "Kyra v4.8 Claude Haiku+Sonnet"
git push origin main
