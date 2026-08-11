// api/send-checkins.js
//
// Route Vercel serverless — appelée toutes les 15 minutes par un scheduler externe
// gratuit (ex. cron-job.org). Elle vérifie, pour chaque cliente active, si c'est
// l'heure de lui envoyer son rappel de check-in aujourd'hui, et envoie le message
// via Telegram si c'est le cas.
//
// SÉCURITÉ : cette route n'est pas protégée par le CRON_SECRET automatique de Vercel
// (celui-ci n'existe que pour les cron jobs natifs Vercel). On utilise ici un secret
// maison à passer en query param, pour empêcher que n'importe qui déclenche des envois
// en appelant l'URL au hasard.
//
// Variables d'environnement nécessaires (les mêmes que telegram-webhook.js, plus une) :
//   AIRTABLE_TOKEN
//   AIRTABLE_BASE_ID
//   TELEGRAM_BOT_TOKEN
//   SEND_CHECKINS_SECRET   -> une chaîne longue et aléatoire que tu choisis toi-même
//   CHECKIN_FORM_URL       -> le lien public du formulaire Airtable de check-in

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SEND_CHECKINS_SECRET = process.env.SEND_CHECKINS_SECRET;
const CHECKIN_FORM_URL = process.env.CHECKIN_FORM_URL;

const TABLE_ID = 'tblqs1g7AhGeShbSh'; // SuiviCSR_Clients

const FIELD_ACTIF = 'fldCwOOxw0pV2Nr8B';
const FIELD_CHECKIN_PREVU = 'fld3OC7M7Heod64Mr';
const FIELD_CANAL = 'fldnXCCPoR58aJrOc';
const FIELD_HEURE = 'fldyx8iZ3crqS1Npv';
const FIELD_CHAT_ID = 'fld4RMGq7j3yqy5Ej';
const FIELD_DERNIER_ENVOI = 'fld5fPRWA4aPBvUnQ';
const FIELD_PRENOM = 'fldOKuUJQGFYouAlg';

// Renvoie l'heure actuelle à Paris, arrondie au quart d'heure précédent, format "HH:MM".
function currentParisTimeWindow() {
  const now = new Date();
  const parisString = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const parisDate = new Date(parisString);
  const h = parisDate.getHours();
  const m = Math.floor(parisDate.getMinutes() / 15) * 15;
  return { hour: h, minute: m };
}

function todayParisDateString() {
  const now = new Date();
  const parisString = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const parisDate = new Date(parisString);
  const y = parisDate.getFullYear();
  const mo = String(parisDate.getMonth() + 1).padStart(2, '0');
  const d = String(parisDate.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function heureMatchesWindow(heurePref, windowHour, windowMinute) {
  if (!heurePref) return false;
  const parts = heurePref.trim().split(':');
  if (parts.length !== 2) return false;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const prefWindowMinute = Math.floor(m / 15) * 15;
  return h === windowHour && prefWindowMinute === windowMinute;
}

async function fetchActiveClients() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(
    'AND({Actif}=1, {Check-in prévu aujourd\'hui}=1)'
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const data = await res.json();
  return data.records || [];
}

async function sendTelegramMessage(chatId, prenom) {
  const text = `Bonjour ${prenom || ''} 👋\n\nC'est l'heure de ton check-in du jour. Deux questions, moins d'une minute :\n${CHECKIN_FORM_URL}`;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.ok;
}

async function markSent(recordId) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}/${recordId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: { [FIELD_DERNIER_ENVOI]: todayParisDateString() },
    }),
  });
}

export default async function handler(req, res) {
  if (req.query.secret !== SEND_CHECKINS_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { hour, minute } = currentParisTimeWindow();
  const today = todayParisDateString();

  const clients = await fetchActiveClients();
  const sent = [];
  const skipped = [];

  for (const record of clients) {
    const f = record.fields;
    const heurePref = f[FIELD_HEURE];
    const canal = f[FIELD_CANAL];
    const chatId = f[FIELD_CHAT_ID];
    const dernierEnvoi = f[FIELD_DERNIER_ENVOI];
    const prenom = f[FIELD_PRENOM];

    if (dernierEnvoi === today) {
      continue; // déjà envoyé aujourd'hui
    }

    if (!heureMatchesWindow(heurePref, hour, minute)) {
      continue; // pas la bonne fenêtre horaire
    }

    if (canal === 'Telegram' && chatId) {
      const ok = await sendTelegramMessage(chatId, prenom);
      if (ok) {
        await markSent(record.id);
        sent.push(prenom || record.id);
      }
    } else {
      // Canal Email pas encore implémenté dans cette version.
      skipped.push({ prenom, reason: 'canal email non implémenté' });
    }
  }

  return res.status(200).json({ ok: true, fenetre: `${hour}:${minute}`, envoyes: sent, ignores: skipped });
}
