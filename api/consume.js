// api/consume.js
// Fonction serverless Vercel — Node.js (CommonJS)
// Rôle : garantir qu'un message ne peut être lu qu'une seule fois au monde.
//
// Fonctionnement :
//   POST /api/consume  { id: "uuid", ttl: 30 }
//   → { allowed: true }   si le message n'a jamais été lu  (première fois)
//   → { allowed: false }  si le message a déjà été lu      (détruit)
//
// Stockage : Vercel KV (Redis géré), clé "msg:<uuid>" avec TTL automatique.

const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {

  // ----- En-têtes CORS (obligatoire pour que le frontend puisse appeler l'API) -----
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Pré-vérification OPTIONS (navigateurs modernes l'envoient avant chaque POST)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Seul POST est accepté
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { id, ttl } = req.body;

  // Validation basique des paramètres
  if (!id || typeof id !== 'string' || id.length < 8) {
    return res.status(400).json({ error: 'Paramètre "id" manquant ou invalide' });
  }
  if (!ttl || isNaN(Number(ttl)) || Number(ttl) < 1) {
    return res.status(400).json({ error: 'Paramètre "ttl" manquant ou invalide' });
  }

  const ttlSeconds = Math.min(Number(ttl), 86400); // max 24 h par sécurité

  try {
    // kv.set avec NX (Only if Not eXists) et EX (expiration en secondes)
    // Retourne "OK" si la clé a été créée, null si elle existait déjà
    const result = await kv.set(`msg:${id}`, '1', {
      ex: ttlSeconds, // expiration automatique côté Redis
      nx: true        // n'écrire QUE si la clé n'existe pas encore
    });

    if (result === 'OK') {
      // Première lecture : autorisée, clé enregistrée
      return res.status(200).json({ allowed: true });
    } else {
      // Clé déjà présente : message déjà lu → détruit
      return res.status(200).json({ allowed: false });
    }

  } catch (err) {
    console.error('[consume] Erreur KV :', err);
    return res.status(500).json({ error: 'Erreur serveur, réessayez.' });
  }
};
