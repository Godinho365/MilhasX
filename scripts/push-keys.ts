// Gera o par de chaves do push (VAPID). Rode uma vez e cole no .env; trocar as chaves desliga
// o push de todos os aparelhos (cada um precisa ativar de novo).
// Uso: npm run push:keys
import { generatePushKeys } from "../src/server/push";

const k = generatePushKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
