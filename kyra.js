require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const readline = require('readline');
const { exec } = require('child_process'); // Aggiunto per gestire la voce su Termux

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function avviaKyra() {
  console.log("🌟 Inizializzazione di Kyra in corso...");
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "Ti chiami Kyra. Sei un'assistente virtuale amichevole, sarcastica e brillante. Rispondi in italiano. Le tue risposte devono essere concise e discorsive, perfette per essere lette ad alta voce da un sintetizzatore vocale."
    });
    
    const chat = model.startChat({ history: [] });
    console.log("\n🤖 Kyra: Ciao! Sono online e i miei sistemi sono operativi. Dimmi tutto (o scrivi 'esci' per chiudere).");

    function faiDomanda() {
      rl.question('\nTu: ', async (input) => {
        if (input.toLowerCase() === 'esci') {
          console.log("🤖 Kyra: Disconnessione in corso. A presto!");
          rl.close();
          return;
        }
        
        try {
          process.stdout.write("🤖 Kyra sta elaborando... ");
          const result = await chat.sendMessage(input);
          const risposta = result.response.text();
          
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          console.log(`🤖 Kyra: ${risposta}`);

          // --- COMANDO VOCALE PER TERMUX (HONOR) ---
          // Pulisce il testo da virgolette e ritorni a capo per non rompere il comando di Termux
          const testoPulito = risposta.replace(/"/g, '\\"').replace(/\n/g, ' ');
          
          // Esegue il comando vocale (se siamo sul Mac darà un errore invisibile senza crashare)
          exec(`termux-tts-speak "${testoPulito}"`, (error) => {
             // Nessun blocco se termux-tts-speak non viene trovato (es. su Mac)
          });

          faiDomanda();
        } catch (error) {
          console.error("\n❌ Errore di comunicazione:", error.message);
          faiDomanda();
        }
      });
    }
    
    faiDomanda();
  } catch (error) {
    console.error("❌ Errore critico in fase di avvio:", error);
  }
}

avviaKyra();
