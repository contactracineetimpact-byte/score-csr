// api/submit-score.js
// Fonction serverless Vercel — s'exécute côté serveur uniquement.
// Le token Airtable n'est JAMAIS envoyé au navigateur.

export default async function handler(req, res) {
  // On n'accepte que les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { prenom, email, score, profil, raison } = req.body;

    // Validation minimale côté serveur (ne jamais faire confiance au client)
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    if (!prenom || typeof prenom !== 'string') {
      return res.status(400).json({ error: 'Prénom manquant' });
    }

    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    const AIRTABLE_BASE = 'app9uUXCxNdjb0m9X';
    const AIRTABLE_TABLE = 'Score%20CSR'; // nom encodé pour l'URL

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Prénom': prenom,
            'Email': email,
            'Score totale': score,
            'profil': profil,
            'Raison du test': raison || '',
            'Date': new Date().toISOString().split('T')[0],
          },
        }),
      }
    );

    if (!airtableRes.ok) {
      const errText = await airtableRes.text();
      console.error('Erreur Airtable:', errText);
      return res.status(502).json({ error: 'Erreur lors de l\'enregistrement' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erreur serveur:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
