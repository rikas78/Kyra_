require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');

// 1. Configurazione Iniziale
const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());

// 2. Inizializzazione Gemini 2.5 Flash
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERRORE: GEMINI_API_KEY mancante nel file .env!");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "Ti chiami Kyra. Sei un'assistente robotica, sarcastica, brillante e diretta. Il tuo owner è Riccardo Asti. Rispondi sempre in italiano, in modo conciso per la sintesi vocale."
});

let chat = model.startChat({ history: [] });

// 3. Funzione di Parola (Termux TTS Fallback Base)
function speak(testo) {
    console.log(`🗣️ Kyra dice: ${testo}`);
    // Pulisce il testo da virgolette singole o doppie che romperebbero il comando bash
    const cleanText = testo.replace(/['"]/g, '');
    exec(`termux-tts-speak "${cleanText}"`, (error) => {
        if (error) {
            console.error(`⚠️ Errore TTS: ${error.message}`);
        }
    });
}

// 4. Endpoint API (Per ricevere comandi dalla dashboard o dal modulo vocale)
app.post('/api/command', async (req, res) => {
    try {
        const userMessage = req.body.message;
        console.log(`👤 Riccardo: ${userMessage}`);
        
        const result = await chat.sendMessage(userMessage);
        const responseText = result.response.text();
        
        // Fai parlare Kyra sul Redmi
        speak(responseText);
        
        res.json({ success: true, kyra: responseText });
    } catch (error) {
        console.error("Errore elaborazione comando:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint di stato (Per verificare se Kyra è online)
app.get('/api/status', (req, res) => {
    res.json({ status: 'ONLINE', version: '3.0', ai: 'Gemini 2.5 Flash' });
});

// 5. Avvio Server
app.listen(PORT, () => {
    console.log(`\n======================================`);
    console.log(`🚀 KYRA v3.0 CORE INIZIALIZZATO`);
    console.log(`🧠 AI Engine: Gemini 2.5 Flash`);
    console.log(`📡 Server in ascolto su porta ${PORT}`);
    console.log(`======================================\n`);
    
    // Frase di avvio (suonerà appena lanci il server)
    speak("Sistemi operativi. Kyra versione 3 online e in ascolto.");
});
