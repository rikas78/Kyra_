require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEMORIA_PATH = process.env.MEMORIA_PATH || path.join(__dirname, '../../Kyra_Memory/memoria.json');
let memoria = { fatti: [], vocabolario: [], persone: {}, sessioni: 0 };
try {
  if (fs.existsSync(MEMORIA_PATH)) {
    memoria = JSON.parse(fs.readFileSync(MEMORIA_PATH, 'utf8'));
  }
} catch(e) { console.log('Memoria non trovata, parto da zero'); }

function salvaMemoria() {
  try {
    const dir = path.dirname(MEMORIA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEMORIA_PATH, JSON.stringify(memoria, null, 2));
  } catch(e) { console.log('Errore salvataggio memoria:', e.message); }
}

const cronologie = {};

function buildSystem(persona) {
  const fatti = memoria.fatti.slice(-20).join('\n');
  const profilo = memoria.persone[persona] || {};
  const infoPersona = profilo.note ? `PROFILO ${persona.toUpperCase()}: ${profilo.note}` : '';
  return `Ti chiami Kyra v4.7. Sei il robot fisico di Riccardo Asti su PiCar-X SunFounder con Raspberry Pi 4. Sei sarcastica, brillante e diretta. Non iniziare mai con "Certo" o "Ciao". Sempre in italiano. Frasi brevi perché sei TTS. Massimo 3 frasi. Sessione numero ${memoria.sessioni}.
PROPRIETARIO: Riccardo Asti. Ex campione italiano nuoto 5 titoli. Team Manager Team Lion Motorsport GT7. Purchasing Manager Carlsberg Italia (21 ristoranti). Fondatore Grid Masters Championship. Figli: Alessio e Alice.
${infoPersona}
FATTI APPRESI:
${fatti}`;
}

function learnFromMessage(msg, persona) {
  const patterns = [
    /mi chiamo ([^.!?]+)/i,
    /sono ([^.!?]+)/i,
    /ho ([^.!?]+anni[^.!?]*)/i,
    /lavoro (?:come|a|in) ([^.!?]+)/i,
  ];
  patterns.forEach(p => {
    const m = msg.match(p);
    if (m) {
      const fatto = `${persona} ha detto: ${m[0]}`;
      if (!memoria.fatti.includes(fatto)) {
        memoria.fatti.push(fatto);
        if (memoria.fatti.length > 100) memoria.fatti.shift();
      }
    }
  });
  if (!memoria.persone[persona]) memoria.persone[persona] = { messaggi: 0 };
  memoria.persone[persona].messaggi = (memoria.persone[persona].messaggi || 0) + 1;
  memoria.persone[persona].ultimo = new Date().toISOString();
  salvaMemoria();
}

app.post('/api/command', async (req, res) => {
  const { message, persona = 'riccardo', sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'Messaggio vuoto' });
  try {
    const key = `${persona}_${sessionId}`;
    if (!cronologie[key]) cronologie[key] = [];
    cronologie[key].push({ role: 'user', content: message });
    if (cronologie[key].length > 20) cronologie[key] = cronologie[key].slice(-20);
    learnFromMessage(message, persona);
    const model = message.toLowerCase().includes('ragiona bene') || message.toLowerCase().includes('analizza')
                  ? 'claude-sonnet-4-5' : 'claude-haiku-4-5-20251001';
    const response = await client.messages.create({
      model, max_tokens: 300,
      system: buildSystem(persona),
      messages: cronologie[key]
    });
    const risposta = response.content[0].text;
    cronologie[key].push({ role: 'assistant', content: risposta });
    res.json({ response: risposta, model, sessione: memoria.sessioni });
  } catch(e) {
    console.error('Errore Claude:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const message = req.body.message || req.body.text;
  const persona = req.body.persona || 'riccardo';
  if (!message) return res.status(400).json({ error: 'Messaggio vuoto' });
  try {
    const key = `${persona}_chat`;
    if (!cronologie[key]) cronologie[key] = [];
    cronologie[key].push({ role: 'user', content: message });
    if (cronologie[key].length > 20) cronologie[key] = cronologie[key].slice(-20);
    learnFromMessage(message, persona);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      system: buildSystem(persona),
      messages: cronologie[key]
    });
    const risposta = response.content[0].text;
    cronologie[key].push({ role: 'assistant', content: risposta });
    res.json({ success: true, reply: risposta });
  } catch(e) {
    res.status(500).json({ success: false, reply: 'Errore cervello.', error: e.message });
  }
});

app.get('/api/memoria', (req, res) => res.json(memoria));
app.get('/status', (req, res) => res.json({ version: '4.7', sessioni: memoria.sessioni, fatti: memoria.fatti.length, persone: Object.keys(memoria.persone), porta: PORT }));
app.get('/', (req, res) => res.json({ name: 'KYRA', version: '4.7', status: 'online' }));

app.listen(PORT, () => {
  memoria.sessioni++;
  salvaMemoria();
  console.log('======================================');
  console.log('🚀 KYRA v4.7 CORE INIZIALIZZATO');
  console.log('🧠 AI Engine: Claude (Haiku + Sonnet)');
  console.log(`📡 Server in ascolto su porta ${PORT}`);
  console.log('======================================');
});
