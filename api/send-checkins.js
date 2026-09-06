// api/send-checkins.js
//
// Route Vercel serverless — appelée toutes les 15 minutes par un scheduler externe
// gratuit (ex. cron-job.org).
//
// MIS À JOUR (Chantier C — Bot Telegram) — Passage à une logique en DEUX
// messages par jour, plus un contexte réel (get-bot-context.js sur
// suivi-csr) plutôt qu'un simple lookup du Moteur :
//
//   MESSAGE 1 (à "Heure préférée") — rappelle le petit pas actif, sans
//   demander de validation. Ton adapté si plusieurs jours sans point du
//   jour (CSR_Checkins), mais SANS JAMAIS affirmer une absence d'action —
//   on ne connaît que l'absence de point du jour, pas ce qui s'est
//   réellement passé.
//
//   MESSAGE 2 (à "Heure préférée" + DECALAGE_HEURES_MESSAGE_2) — vérifie si
//   le petit pas a été fait. Un point du jour déjà effectué dans la journée
//   NE bloque PAS ce message (check-in quotidien ≠ validation du petit
//   pas, ce sont deux événements distincts). En revanche, si le petit pas
//   n'est plus Actif au moment de ce second passage (terminé entre-temps,
//   ou expérience mise en pause), AUCUN message n'est envoyé — mais le
//   créneau est quand même marqué comme traité pour ne pas le réévaluer
//   inutilement plus tard dans la journée (bien que la fenêtre horaire
//   elle-même ne se représente de toute façon qu'une fois par jour).
//
// Deux nouveaux champs sur SuiviCSR_Clients, à créer manuellement dans
// Airtable avant déploiement :
//   "Dernier envoi (message 1)"  — Date
//   "Dernier envoi (message 2)"  — Date
// L'ancien champ "Dernier envoi" n'est plus lu ni écrit par ce fichier —
// laissé tel quel en base, pour ne rien casser côté historique.
//
// Variables d'environnement nécessaires :
//   AIRTABLE_TOKEN, AIRTABLE_BASE_ID, TELEGRAM_BOT_TOKEN,
//   SEND_CHECKINS_SECRET, BOT_CONTEXT_SECRET (nouveau — doit correspondre à
//   la même valeur que sur le projet suivi-csr)

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SEND_CHECKINS_SECRET = process.env.SEND_CHECKINS_SECRET;
const BOT_CONTEXT_SECRET = process.env.BOT_CONTEXT_SECRET;

const TABLE_ID = 'tblqs1g7AhGeShbSh'; // SuiviCSR_Clients

const FIELD_ACTIF = 'fldCwOOxw0pV2Nr8B';
const FIELD_CHECKIN_PREVU = 'fld3OC7M7Heod64Mr';
const FIELD_CANAL = 'fldnXCCPoR58aJrOc';
const FIELD_HEURE = 'fldyx8iZ3crqS1Npv';
const FIELD_CHAT_ID = 'fld4RMGq7j3yqy5Ej';
const FIELD_PRENOM = 'fldOKuUJQGFYouAlg';
const FIELD_CODE = 'fld7KsLwFMdsDBKYO';

// NOUVEAU — Champs texte, PAS des IDs techniques : à créer dans Airtable
// avec exactement ces noms, puis à écrire/lire par leur NOM (pas leur ID),
// pour rester simples à retrouver et modifier sans dépendre d'un ID interne.
// Deux constantes chacun : le NOM (utilisé pour écrire, car markSent() fait
// un PATCH sans returnFieldsByFieldId, donc Airtable y attend des noms) et
// l'IDENTIFIANT technique (utilisé pour lire, car fetchActiveClients() lit
// avec returnFieldsByFieldId=true, donc les champs y sont indexés par ID,
// pas par nom — confondre les deux a été la cause exacte du bug qui
// empêchait le Message 2 de jamais se déclencher).
const FIELD_DERNIER_ENVOI_1_NOM = 'Dernier envoi (message 1)';
const FIELD_DERNIER_ENVOI_2_NOM = 'Dernier envoi (message 2)';
const FIELD_DERNIER_ENVOI_1_ID = 'fldrt24R99v8ZdTMf';
const FIELD_DERNIER_ENVOI_2_ID = 'fldMeCQoH9xwQqWik';

// NOUVEAU — constante clairement identifiable, comme demandé : le Message 2
// part cette durée après l'Heure préférée du client. Modifiable ici
// uniquement, sans toucher au reste de la logique.
const DECALAGE_HEURES_MESSAGE_2 = 6;

const APP_URL = 'https://suivicsr.vercel.app/';

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

// NOUVEAU (correctif) — les deux champs "Dernier envoi" sont des dateTime
// Airtable, renvoyés par l'API en UTC (suffixe Z). Autour de minuit à
// Paris, l'heure UTC est encore la veille : une simple troncature des 10
// premiers caractères comparait alors une date UTC à une date Paris,
// désynchronisées de plusieurs heures. Cette fonction convertit d'abord la
// date lue vers le fuseau Paris, exactement comme todayParisDateString(),
// avant toute comparaison.
function toParisDateString(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const parisString = d.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const parisDate = new Date(parisString);
  const y = parisDate.getFullYear();
  const mo = String(parisDate.getMonth() + 1).padStart(2, '0');
  const day = String(parisDate.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

// Compare l'heure courante (arrondie au quart d'heure) à une heure de
// référence ("HH:MM"), à laquelle on ajoute éventuellement un décalage en
// heures — utilisé tel quel pour le Message 1 (décalage 0) et le Message 2
// (décalage = DECALAGE_HEURES_MESSAGE_2). Comme cette comparaison ne
// correspond qu'à une seule fenêtre de 15 minutes par jour, le cron
// (appelé toutes les 15 minutes) ne la fait matcher qu'une fois par jour
// par construction — aucun champ supplémentaire n'est nécessaire pour
// empêcher une réévaluation répétée du même créneau.
function heureMatchesWindow(heurePref, windowHour, windowMinute, decalageHeures) {
  if (!heurePref) return false;
  const parts = heurePref.trim().split(':');
  if (parts.length !== 2) return false;
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  h = (h + (decalageHeures || 0)) % 24;
  const prefWindowMinute = Math.floor(m / 15) * 15;
  return h === windowHour && prefWindowMinute === windowMinute;
}

async function fetchActiveClients() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}?returnFieldsByFieldId=true&filterByFormula=${encodeURIComponent('{Actif}=1')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
  const data = await res.json();
  return data.records || [];
}

// NOUVEAU — remplace fetchMoteur() : interroge le contexte réel du bot côté
// suivi-csr (Option C), une seule route dédiée plutôt qu'un lookup direct
// du Moteur seul.
async function fetchBotContext(clientCode) {
  try {
    const url = `https://suivicsr.vercel.app/api/get-bot-context?code=${encodeURIComponent(clientCode)}&secret=${encodeURIComponent(BOT_CONTEXT_SECRET)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

function buildMessage1(prenom, context) {
  const nom = prenom || '';
  if (!context || !context.hasExperience) {
    return `Bonjour ${nom} 👋\n\nC'est l'heure de ton point du jour. Retrouve-le ici, moins d'une minute :\n${APP_URL}`;
  }
  if (context.statut === 'En pause') return null;

  const petitPasTexte = context.petitPas && context.petitPas.reponse;

  // Ton adapté si plusieurs jours sans point du jour — factuel uniquement,
  // jamais une affirmation sur ce qui a été fait ou non.
  let joursSansCheckin = null;
  if (context.lastCheckinDate) {
    const dernier = new Date(context.lastCheckinDate);
    const aujourdHui = new Date(todayParisDateString());
    joursSansCheckin = Math.round((aujourdHui - dernier) / 86400000);
  }
  // NOUVEAU (correction) — "aucun point du jour n'existe encore" (cycle
  // tout juste démarré) n'est PAS la même chose que "plusieurs jours de
  // silence" : seul un vrai écart mesuré (au moins un point du jour déjà
  // existant, mais ancien) déclenche le ton neutre. L'absence totale de
  // donnée retombe sur le rappel de mission classique.
  const plusieursJoursSansContact = joursSansCheckin !== null && joursSansCheckin >= 3;

  if (!petitPasTexte) {
    return `Bonjour ${nom} 👋\n\n✓ Ton petit pas est terminé.\n\nLa suite t'attend sur SuiviCSR :\n${APP_URL}`;
  }

  if (plusieursJoursSansContact) {
    return `Bonjour ${nom} 👋\n\nÇa fait quelques jours qu'on ne s'est pas retrouvé.\n\nSi tu veux reprendre, ton petit pas t'attend sur SuiviCSR :\n${APP_URL}`;
  }

  return `🌱 Bonjour ${nom}\n\nTa mission en cours :\n${petitPasTexte}\n\nGarde cette action en tête aujourd'hui.`;
}

function buildMessage2(prenom, context) {
  if (!context || !context.hasExperience) return null;
  if (context.statut === 'En pause') return null;
  const petitPasTexte = context.petitPas && context.petitPas.reponse;
  if (!petitPasTexte) return null; // petit pas terminé entre-temps : pas de relance sur du vide

  const nom = prenom || '';
  return `👀 Petit point, ${nom}\n\nEst-ce que tu as fait ton petit pas aujourd'hui ?\n${petitPasTexte}\n\nRéponds-toi sur SuiviCSR :\n${APP_URL}`;
}

async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.ok;
}

async function markSent(recordId, fieldName) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}/${recordId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [fieldName]: todayParisDateString() } }),
  });
}

export default async function handler(req, res) {
  if (req.query.secret !== SEND_CHECKINS_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { hour, minute } = currentParisTimeWindow();
  const today = todayParisDateString();

  const clients = await fetchActiveClients();
  const sent1 = [];
  const sent2 = [];
  const skipped = [];

  for (const record of clients) {
    const f = record.fields;
    const heurePref = f[FIELD_HEURE];
    const canal = f[FIELD_CANAL];
    const chatId = f[FIELD_CHAT_ID];
    const prenom = f[FIELD_PRENOM];
    const clientCode = f[FIELD_CODE];
    const checkinPrevu = f[FIELD_CHECKIN_PREVU];
    const dernierEnvoi1 = f[FIELD_DERNIER_ENVOI_1_ID];
    const dernierEnvoi2 = f[FIELD_DERNIER_ENVOI_2_ID];

    if (checkinPrevu !== 1) continue;
    if (canal !== 'Telegram' || !chatId) {
      skipped.push({ prenom, reason: 'canal non pris en charge' });
      continue;
    }

    // Les deux champs "Dernier envoi" sont en type Date+Heure dans Airtable
    // — on ne compare que la partie date (10 premiers caractères ISO),
    // jamais la chaîne complète, sinon la comparaison ne correspond jamais.
    const dernierEnvoi1Date = toParisDateString(dernierEnvoi1);
    const dernierEnvoi2Date = toParisDateString(dernierEnvoi2);

    // Fenêtre Message 1.
    if (dernierEnvoi1Date !== today && heureMatchesWindow(heurePref, hour, minute, 0)) {
      const context = await fetchBotContext(clientCode);
      const text = buildMessage1(prenom, context);
      if (text) {
        const ok = await sendTelegramMessage(chatId, text);
        if (ok) {
          await markSent(record.id, FIELD_DERNIER_ENVOI_1_NOM);
          sent1.push(prenom || record.id);
        }
      } else {
        // Rien à envoyer (ex. expérience en pause) — on marque quand même
        // le créneau comme traité pour rester cohérent avec Message 2.
        await markSent(record.id, FIELD_DERNIER_ENVOI_1_NOM);
      }
      continue; // un seul type d'envoi par passage de cron pour ce client
    }

    // Fenêtre Message 2 — seulement si le Message 1 a bien eu lieu aujourd'hui.
    if (dernierEnvoi1Date === today && dernierEnvoi2Date !== today && heureMatchesWindow(heurePref, hour, minute, DECALAGE_HEURES_MESSAGE_2)) {
      const context = await fetchBotContext(clientCode);
      const text = buildMessage2(prenom, context);
      if (text) {
        const ok = await sendTelegramMessage(chatId, text);
        if (ok) {
          await markSent(record.id, FIELD_DERNIER_ENVOI_2_NOM);
          sent2.push(prenom || record.id);
        }
      } else {
        // Petit pas terminé entre-temps, ou en pause : pas de message, mais
        // le créneau est marqué traité pour ne pas le réévaluer plus tard
        // dans la journée (cf. commentaire de heureMatchesWindow).
        await markSent(record.id, FIELD_DERNIER_ENVOI_2_NOM);
      }
    }
  }

  return res.status(200).json({ ok: true, fenetre: `${hour}:${minute}`, message1: sent1, message2: sent2, ignores: skipped });
}
