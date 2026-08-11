// api/telegram-webhook.js
//
// Route Vercel serverless — reçoit les messages envoyés au bot Telegram.
// Quand une cliente envoie son Code (ex. "MAGALI30") au bot pour la première fois,
// cette fonction retrouve automatiquement sa fiche dans SuiviCSR_Clients et y
// enregistre son Telegram Chat ID, sans aucune action manuelle de ta part.
//
// Variables d'environnement à configurer dans Vercel (Project Settings > Environment Variables) :
//   AIRTABLE_TOKEN        -> ton token Airtable (le même que tu utilises déjà côté serveur)
//   AIRTABLE_BASE_ID      -> app9uUXCxNdjb0m9X
//   TELEGRAM_BOT_TOKEN    -> le token donné par @BotFather lors de la création du bot

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TABLE_ID = 'tblqs1g7AhGeShbSh'; // SuiviCSR_Clients

const FIELD_CODE = 'fld7KsLwFMdsDBKYO';
const FIELD_CHAT_ID = 'fld4RMGq7j3yqy5Ej';
const FIELD_CANAL = 'fldnXCCPoR58aJrOc';

async function sendTelegramMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function findClientByCode(code) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(
    `UPPER({Code}) = "${code.toUpperCase().trim()}"`
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const data = await res.json();
  return data.records && data.records.length === 1 ? data.records[0] : null;
}

async function saveChatId(recordId, chatId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}/${recordId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        [FIELD_CHAT_ID]: String(chatId),
        [FIELD_CANAL]: 'Telegram',
      },
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK - webhook actif');
  }

  try {
    const update = req.body;
    const message = update.message;

    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    const client = await findClientByCode(text);

    if (!client) {
      await sendTelegramMessage(
        chatId,
        "Je ne retrouve pas ce code. Vérifie qu'il est bien écrit exactement comme reçu (ex. MAGALI30), sans espace ni autre texte."
      );
      return res.status(200).json({ ok: true });
    }

    await saveChatId(client.id, chatId);
    await sendTelegramMessage(
      chatId,
      "C'est bon, tu es connectée ✅ Tu recevras ton check-in ici, à l'heure que tu as choisie."
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erreur webhook Telegram:', err);
    return res.status(200).json({ ok: true }); // toujours 200 pour éviter que Telegram ne réessaie en boucle
  }
}
