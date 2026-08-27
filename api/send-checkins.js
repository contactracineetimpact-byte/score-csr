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
// NOUVEAU (24/08/2026) : le message envoyé dépend maintenant du Moteur (ANCRAGE ou
// RUPTURE) de l'expérience active du client, lu via le lien "Expérience active" ->
// table CSR_Expériences. Si aucune expérience n'est liée (client pas encore migré
// vers le nouveau système), le message générique d'origine est utilisé.
//
// Variables d'environnement nécessaires (les mêmes que telegram-webhook.js, plus une) :
//   AIRTABLE_TOKEN
//   AIRTABLE_BASE_ID
//   TELEGRAM_BOT_TOKEN
//   SEND_CHECKINS_SECRET   -> une chaîne longue et aléatoire que tu choisis toi-même
//   CHECKIN_FORM_URL       -> N'EST PLUS UTILISÉ depuis le 27/08/2026 (le message
//                             pointe désormais directement vers l'app SuiviCSR,
//                             pas vers un formulaire Airtable séparé)

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SEND_CHECKINS_SECRET = process.env.SEND_CHECKINS_SECRET;
// Note : CHECKIN_FORM_URL n'est plus lu — remplacé par APP_URL, fixe, ci-dessous.

const TABLE_ID = 'tblqs1g7AhGeShbSh'; // SuiviCSR_Clients
const EXPERIENCES_TABLE_ID = 'tbl2PYkTaFNT05eDU'; // CSR_Expériences

const FIELD_ACTIF = 'fldCwOOxw0pV2Nr8B';
const FIELD_CHECKIN_PREVU = 'fld3OC7M7Heod64Mr';
const FIELD_CANAL = 'fldnXCCPoR58aJrOc';
const FIELD_HEURE = 'fldyx8iZ3crqS1Npv';
const FIELD_CHAT_ID = 'fld4RMGq7j3yqy5Ej';
const FIELD_DERNIER_ENVOI = 'fld5fPRWA4aPBvUnQ';
const FIELD_PRENOM = 'fldOKuUJQGFYouAlg';
const FIELD_EXPERIENCE_ACTIVE = 'fldJbkV01X1SfqUUa'; // NOUVEAU

const FIELD_MOTEUR = 'fldLdS5On5GP2ob7c'; // NOUVEAU — sur CSR_Expériences

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
  // Note : on ne filtre ici que sur {Actif}, un champ sans caractère spécial.
  // Le filtre "Check-in prévu aujourd'hui" est volontairement appliqué plus bas,
  // côté JS, sur le champ FIELD_CHECKIN_PREVU (identifié par son ID, pas son nom).
  // Filtrer par nom de champ contenant une apostrophe dans une formule Airtable
  // s'est révélé peu fiable (le filtre échouait silencieusement, sans erreur).
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}?returnFieldsByFieldId=true&filterByFormula=${encodeURIComponent(
    '{Actif}=1'
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const data = await res.json();
  return data.records || [];
}

// NOUVEAU — récupère le Moteur (ANCRAGE / RUPTURE) d'une expérience donnée.
// Retourne null si le lookup échoue ou si le champ est vide, pour rester
// silencieux et retomber sur le message générique plutôt que de faire planter l'envoi.
async function fetchMoteur(experienceRecordId) {
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${EXPERIENCES_TABLE_ID}/${experienceRecordId}?returnFieldsByFieldId=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const moteurField = data.fields ? data.fields[FIELD_MOTEUR] : null;
    // Les champs singleSelect renvoient soit une chaîne, soit un objet { name }.
    if (!moteurField) return null;
    return typeof moteurField === 'string' ? moteurField : moteurField.name || null;
  } catch (err) {
    return null;
  }
}

// NOUVEAU — construit le texte du message selon le moteur.
const APP_URL = 'https://suivicsr.vercel.app/';

function buildMessageText(prenom, moteur) {
  const nom = prenom || '';
  if (moteur === 'ANCRAGE') {
    return `Bonjour ${nom} 👋\n\nAs-tu fait ton action aujourd'hui ? Retrouve ton point du jour ici, moins d'une minute :\n${APP_URL}`;
  }
  if (moteur === 'RUPTURE') {
    return `Bonjour ${nom} 👋\n\nAs-tu repéré le signal aujourd'hui, et as-tu réussi à ne pas le faire ? Retrouve ton point du jour ici, moins d'une minute :\n${APP_URL}`;
  }
  // Message générique d'origine, pour les clients sans expérience liée pour l'instant.
  return `Bonjour ${nom} 👋\n\nC'est l'heure de ton point du jour. Retrouve-le ici, moins d'une minute :\n${APP_URL}`;
}

async function sendTelegramMessage(chatId, text) {
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
    const checkinPrevu = f[FIELD_CHECKIN_PREVU];
    const experienceLinks = f[FIELD_EXPERIENCE_ACTIVE]; // NOUVEAU

    if (checkinPrevu !== 1) {
      continue; // pas dans la fenêtre du programme aujourd'hui
    }

    if (dernierEnvoi === today) {
      continue; // déjà envoyé aujourd'hui
    }

    if (!heureMatchesWindow(heurePref, hour, minute)) {
      continue; // pas la bonne fenêtre horaire
    }

    if (canal === 'Telegram' && chatId) {
      // NOUVEAU — lookup du moteur si une expérience active est liée.
      let moteur = null;
      if (Array.isArray(experienceLinks) && experienceLinks.length > 0) {
        moteur = await fetchMoteur(experienceLinks[0]);
      }
      const text = buildMessageText(prenom, moteur);
      const ok = await sendTelegramMessage(chatId, text);
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
