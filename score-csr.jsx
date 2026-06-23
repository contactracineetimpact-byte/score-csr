import { useState, useEffect, useRef } from "react";

const AIRTABLE_TOKEN = "patCq9L0YOY4LnBq1.72b6c3d30282ca98012fafc4f93e5a6103e5e4303c3ad12bf67dd8ae099c9e1e";
const AIRTABLE_BASE  = "app9uUXCxNdjb0m9X";
const AIRTABLE_TABLE = "Score CSR";

const QUESTIONS = [
  { id: 1, text: "La semaine dernière, j'ai consacré du temps concret à avancer vers mon objectif principal.", dimension: "AO" },
  { id: 2, text: "Quand je me fixe un engagement envers moi-même, je le respecte la majorité du temps.", dimension: "CE" },
  { id: 3, text: "Je sais précisément quelle est la prochaine action à faire pour avancer — et je sais pourquoi.", dimension: "AO" },
  { id: 4, text: "Mes émotions me poussent à agir plutôt qu'à éviter ou procrastiner.", dimension: "AI" },
  { id: 5, text: "Mon environnement (lieu de travail, entourage, habitudes) soutient concrètement mes ambitions.", dimension: "AI" },
  { id: 6, text: "Cette semaine, j'ai accompli les tâches importantes même sans motivation particulière.", dimension: "CE" },
  { id: 7, text: "Je me reconnais dans la personne que je veux devenir — dans mes décisions et comportements quotidiens.", dimension: "AI" },
  { id: 8, text: "Je sais exactement ce qui me bloque et j'ai une stratégie claire pour le surmonter.", dimension: "AO" },
  { id: 9, text: "Je prends mes décisions plus facilement qu'il y a 6 mois — sans tourner en rond.", dimension: "CE" },
  { id: 10, text: "Mes croyances sur moi-même et mes capacités me soutiennent plutôt qu'elles ne me freinent.", dimension: "AI" },
  { id: 11, text: "Quand un obstacle apparaît, je trouve un moyen de contourner — je ne m'arrête pas.", dimension: "CE" },
  { id: 12, text: "Mon objectif actuel est vraiment le mien — pas celui que les autres attendent de moi.", dimension: "AO" },
];

const LABELS = ["Pas du tout", "Plutôt non", "Parfois", "Plutôt oui", "Totalement"];

const RAISONS = [
  "Je me sens bloqué et je ne comprends pas pourquoi",
  "Je veux mesurer où j'en suis dans ma progression",
  "Je cherche un accompagnement et je veux évaluer mon besoin",
  "Un proche me l'a recommandé",
];

function getProfile(score, answers) {
  const aoQ=[0,2,7,11], aiQ=[3,4,6,9], ceQ=[1,5,8,10];
  const avg=(idxs)=>idxs.reduce((s,i)=>s+(answers[i]||0),0)/idxs.length;
  const ao=avg(aoQ), ai=avg(aiQ), ce=avg(ceQ);
  const min=Math.min(ao,ai,ce);
  if (score<=28) return { emoji:"🚨", label:"Système Bloqué", color:"#c0392b",
    headline:"Ton système actuel produit plus de frustration que de progression.",
    desc:"Ce n'est pas un manque de volonté. C'est un système construit pour d'autres résultats — et ça se change." };
  if (score<=40) {
    if (ce===min) return { emoji:"⚡", label:"L'Inconstant", color:"#e67e22",
      headline:"Tu vois clairement où aller — mais tu n'arrives pas à tenir le cap.",
      desc:"La vision est là. L'énergie aussi, par moments. Ce qui manque, c'est un système d'exécution qui ne dépend pas de ta motivation du jour." };
    if (ai===min) return { emoji:"🔒", label:"Le Freiné", color:"#8e44ad",
      headline:"Tu sais quoi faire. Quelque chose t'empêche de le faire.",
      desc:"Ce n'est pas le plan qui manque. C'est une résistance invisible — souvent une croyance profonde sur ce que tu mérites ou ce qui est possible pour toi." };
    return { emoji:"🌀", label:"Le Dispersé", color:"#2980b9",
      headline:"Beaucoup d'énergie, beaucoup de directions — peu d'impact concentré.",
      desc:"Ton potentiel est réel. Ce qui manque, c'est un point focal. Quand tu concentres ton système sur une cible, les résultats arrivent vite." };
  }
  if (score<=52) {
    if (ce===min) return { emoji:"🔋", label:"L'Épuisé", color:"#c0392b",
      headline:"Tu avances — mais l'énergie ne suit plus.",
      desc:"Tu as construit beaucoup. Mais ton système consomme plus qu'il ne produit. Il est temps de réaligner l'effort sur ce qui compte vraiment." };
    return { emoji:"🏗", label:"Le Constructeur", color:"#27ae60",
      headline:"Ton système fonctionne — quelques ajustements précis te feront passer un cap.",
      desc:"Tu as les bases solides. Ce qui t'amène au niveau suivant, ce sont 2 ou 3 maillons spécifiques à renforcer." };
  }
  return { emoji:"✦", label:"Système Avancé", color:"#2D5016",
    headline:"Tu es déjà en mouvement — et tu sens qu'il reste un plafond à briser.",
    desc:"Ton système produit des résultats. La prochaine étape, c'est l'alignement profond entre qui tu es et ce que tu vises." };
}

function getInsight(answers) {
  const aoQ=[0,2,7,11], aiQ=[3,4,6,9], ceQ=[1,5,8,10];
  const avg=(idxs)=>idxs.reduce((s,i)=>s+(answers[i]||0),0)/idxs.length;
  const ao=avg(aoQ), ai=avg(aiQ), ce=avg(ceQ);
  const min=Math.min(ao,ai,ce);
  if (ce===min) return "Ton levier prioritaire : l'exécution constante. Pas besoin de tout changer — juste un système d'engagement qui ne dépend pas de ta motivation du moment.";
  if (ai===min) return "Ton levier prioritaire : l'identité. Ce que tu produis est le reflet direct de qui tu crois être. Changer l'identité change les comportements — pas l'inverse.";
  return "Ton levier prioritaire : la clarté stratégique. Tu as l'énergie. Il te manque un objectif suffisamment précis pour que ton système entier s'aligne dessus.";
}

async function sendToAirtable(data) {
  try {
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`, {
      method:"POST",
      headers:{ Authorization:`Bearer ${AIRTABLE_TOKEN}`, "Content-Type":"application/json" },
      body:JSON.stringify({ fields:{
        Prénom:data.prenom, Email:data.email,
        "Score Total":data.score, Profil:data.profile.label,
        "Raison du test":data.raison, Date:new Date().toISOString().slice(0,10),
      }}),
    });
  } catch(e){ console.warn("Airtable:",e); }
}

function ScoreRing({ score, max=60, color }) {
  const r=68, circ=2*Math.PI*r;
  const [anim,setAnim]=useState(0);
  useEffect(()=>{ const t=setTimeout(()=>setAnim(score/max),300); return()=>clearTimeout(t); },[]);
  return (
    <div style={{position:"relative",width:160,height:160}}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{transform:"rotate(-90deg)"}}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6"/>
        <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${anim*circ} ${circ}`} style={{transition:"stroke-dasharray 1.4s ease"}}/>
      </svg>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
        fontFamily:"'Cormorant Garamond',serif",fontSize:42,fontWeight:700,color:"#f0ede4",lineHeight:1,textAlign:"center"}}>
        {score}<span style={{fontSize:18,color:"#888880"}}>/{max}</span>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,400&family=Barlow:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Barlow',sans-serif;background:#0e1208;color:#f0ede4;min-height:100vh}

/* ── HERO ── */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:60px 24px;position:relative;overflow:hidden;background:#0e1208}
.hero-glow-1{position:absolute;top:-20%;left:-10%;width:60%;height:60%;
  background:radial-gradient(ellipse,rgba(45,80,22,0.38) 0%,transparent 65%);pointer-events:none}
.hero-glow-2{position:absolute;bottom:-10%;right:-5%;width:50%;height:50%;
  background:radial-gradient(ellipse,rgba(201,168,76,0.07) 0%,transparent 60%);pointer-events:none}
.hero-vline{position:absolute;top:0;left:50%;width:1px;height:80px;
  background:linear-gradient(to bottom,transparent,rgba(201,168,76,0.4))}
.hero-content{position:relative;z-index:2;text-align:center;max-width:580px;width:100%}
.hero-eyebrow{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:32px}
.hero-eyebrow-line{width:32px;height:1px;background:#c9a84c;opacity:.45}
.hero-eyebrow-text{font-size:10px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#c9a84c}
.hero-title{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5.5vw,56px);font-weight:700;
  color:#f0ede4;line-height:1.08;margin-bottom:10px}
.hero-title em{font-style:italic;color:#c9a84c;display:block}
.hero-divider{width:40px;height:1px;background:rgba(201,168,76,0.35);margin:22px auto}
.hero-sub{font-size:16px;font-weight:300;color:#888880;line-height:1.75;margin-bottom:40px;
  max-width:420px;margin-left:auto;margin-right:auto}
.hero-pills{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:40px}
.pill{padding:6px 14px;border:1px solid rgba(255,255,255,0.08);border-radius:20px;
  font-size:11px;color:#666660;letter-spacing:.5px}

.btn-hero{position:relative;background:transparent;border:1px solid rgba(201,168,76,0.5);
  color:#c9a84c;padding:16px 48px;font-family:'Barlow',sans-serif;font-size:13px;
  font-weight:600;letter-spacing:2px;text-transform:uppercase;cursor:pointer;
  transition:all .3s;overflow:hidden;z-index:0}
.btn-hero::before{content:'';position:absolute;inset:0;background:#c9a84c;
  transform:scaleX(0);transform-origin:left;transition:transform .3s ease;z-index:-1}
.btn-hero:hover{color:#0e1208;border-color:#c9a84c}
.btn-hero:hover::before{transform:scaleX(1)}

.hero-proof{margin-top:44px;display:flex;align-items:center;justify-content:center;gap:24px}
.proof-item{text-align:center}
.proof-num{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:700;color:#f0ede4;line-height:1}
.proof-lbl{font-size:10px;color:#555550;letter-spacing:1px;margin-top:3px;text-transform:uppercase}
.proof-sep{width:1px;height:36px;background:rgba(255,255,255,0.07)}

/* ── QUAL ── */
.screen{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;background:#0e1208}
.card{max-width:500px;width:100%}
.section-label{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#c9a84c;margin-bottom:16px}
.card-title{font-family:'Cormorant Garamond',serif;font-size:29px;font-weight:700;color:#f0ede4;margin-bottom:8px;line-height:1.2}
.card-sub{font-size:14px;color:#888880;line-height:1.65;margin-bottom:30px}
.options{display:flex;flex-direction:column;gap:9px;margin-bottom:30px}
.option{padding:13px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
  color:#b0aда8;font-size:14px;font-family:'Barlow',sans-serif;cursor:pointer;
  transition:all .15s;border-radius:2px;text-align:left;width:100%;color:#b0ada8}
.option:hover,.option.sel{border-color:#c9a84c;color:#f0ede4;background:rgba(201,168,76,.08)}

/* ── TEST ── */
.test-screen{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:44px 24px 80px;background:#0e1208}
.prog-wrap{width:100%;max-width:600px;margin-bottom:48px}
.prog-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.prog-lbl{font-size:11px;color:#555550;letter-spacing:1.5px;text-transform:uppercase}
.prog-count{font-family:'Cormorant Garamond',serif;font-size:22px;color:#c9a84c}
.prog-track{height:2px;background:rgba(255,255,255,.07);border-radius:1px;overflow:hidden}
.prog-fill{height:100%;background:linear-gradient(90deg,#2D5016,#c9a84c);border-radius:1px;transition:width .4s ease}
.q-card{max-width:600px;width:100%}
.q-dim{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#2D5016;margin-bottom:18px}
.q-text{font-family:'Cormorant Garamond',serif;font-size:clamp(20px,3vw,27px);font-weight:600;color:#f0ede4;line-height:1.35;margin-bottom:36px}
.scale{display:flex;flex-direction:column;gap:9px}
.scale-btn{display:flex;align-items:center;gap:14px;padding:13px 17px;background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.06);color:#b0ada8;font-size:14px;font-family:'Barlow',sans-serif;
  cursor:pointer;transition:all .15s;border-radius:2px;text-align:left;width:100%}
.scale-btn:hover{border-color:rgba(201,168,76,.45);color:#f0ede4;background:rgba(201,168,76,.06)}
.scale-btn.sel{border-color:#c9a84c;background:rgba(201,168,76,.11);color:#f0ede4}
.scale-num{width:27px;height:27px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;
  align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#777770;
  flex-shrink:0;transition:all .15s}
.scale-btn.sel .scale-num{background:#c9a84c;color:#0e1208}
.nav-row{display:flex;justify-content:space-between;align-items:center;margin-top:32px;max-width:600px;width:100%}

/* ── GATE ── */
.gate-screen{min-height:100vh;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:60px 24px;position:relative;overflow:hidden;background:#0e1208}
.gate-glow{position:absolute;top:10%;left:50%;transform:translateX(-50%);width:80%;height:70%;
  background:radial-gradient(ellipse,rgba(45,80,22,0.22) 0%,transparent 65%);pointer-events:none}
.gate-card{position:relative;z-index:2;max-width:440px;width:100%}

.score-reveal{background:linear-gradient(135deg,rgba(45,80,22,0.28),rgba(201,168,76,0.07));
  border:1px solid rgba(201,168,76,0.22);border-radius:4px;padding:22px 24px;
  margin-bottom:30px;display:flex;align-items:center;gap:22px}
.score-big{font-family:'Cormorant Garamond',serif;font-size:62px;font-weight:700;
  color:#c9a84c;line-height:1;min-width:78px;flex-shrink:0}
.score-max{font-size:18px;color:#888880}
.score-bar-track{height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-bottom:10px}
.score-reveal-text{font-size:13px;color:#888880;line-height:1.65}
.score-reveal-text strong{color:#c9a84c;font-weight:600}

.field-lbl{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555550;margin-bottom:7px}
.field-input{width:100%;padding:14px 16px;background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);color:#f0ede4;font-family:'Barlow',sans-serif;
  font-size:14px;border-radius:2px;outline:none;transition:all .2s}
.field-input:focus{border-color:rgba(201,168,76,.55);background:rgba(201,168,76,.03)}
.field-input::placeholder{color:#333330}
.fields{display:flex;flex-direction:column;gap:13px;margin-bottom:16px}

.btn-gate{width:100%;background:#c9a84c;color:#0e1208;border:none;padding:17px;
  font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;
  text-transform:uppercase;cursor:pointer;transition:all .2s;display:flex;
  align-items:center;justify-content:center;gap:10px}
.btn-gate:hover{background:#d4b560}
.btn-gate:disabled{opacity:.35;cursor:not-allowed}
.btn-arrow{transition:transform .2s;display:inline-block}
.btn-gate:hover .btn-arrow{transform:translateX(4px)}

.gate-trust{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:14px;flex-wrap:wrap}
.trust-item{display:flex;align-items:center;gap:6px;font-size:11px;color:#444440}
.trust-dot{width:4px;height:4px;border-radius:50%;background:#2D5016;flex-shrink:0}
.trust-sep{width:1px;height:12px;background:rgba(255,255,255,.06)}

/* ── BUTTONS ── */
.btn{border:none;cursor:pointer;font-family:'Barlow',sans-serif;font-weight:600;
  letter-spacing:.8px;border-radius:2px;transition:all .2s}
.btn-gold{background:#c9a84c;color:#0e1208;padding:16px 42px;font-size:14px}
.btn-gold:hover{background:#d4b560;transform:translateY(-1px)}
.btn-gold:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-ghost{background:transparent;color:#c9a84c;border:1px solid rgba(201,168,76,.35);padding:13px 32px;font-size:13px}
.btn-ghost:hover{border-color:#c9a84c;background:rgba(201,168,76,.07)}
.btn-ghost:disabled{opacity:.3;cursor:not-allowed}

/* ── RESULTS ── */
.result-screen{width:100%;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:60px 24px 100px;background:#0e1208}
.result-wrap{max-width:600px;width:100%}
.result-header{text-align:center;margin-bottom:44px}
.result-emoji{font-size:44px;margin-bottom:14px}
.result-profile{font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}
.result-name{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;margin-bottom:14px}
.result-headline{font-family:'Cormorant Garamond',serif;font-size:clamp(21px,3.2vw,30px);font-weight:700;color:#f0ede4;line-height:1.25;margin-bottom:14px}
.result-desc{font-size:15px;color:#a0a098;line-height:1.7;max-width:440px;margin:0 auto}
.score-center{display:flex;flex-direction:column;align-items:center;margin-bottom:44px}
.score-lbl{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#555550;margin-top:12px}
.dims{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-bottom:44px}
.dim-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:4px;padding:16px;text-align:center}
.dim-code{font-size:22px;font-weight:700;margin-bottom:3px}
.dim-name{font-size:10px;color:#555550;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
.dim-track{height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.dim-fill{height:100%;border-radius:2px;transition:width 1.4s ease}
.dim-val{font-size:12px;color:#777770;margin-top:7px}
.insight{background:rgba(45,80,22,.18);border:1px solid rgba(45,80,22,.45);border-left:3px solid #c9a84c;padding:22px 24px;border-radius:2px;margin-bottom:44px}
.insight-lbl{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#c9a84c;margin-bottom:10px}
.insight-text{font-family:'Cormorant Garamond',serif;font-size:19px;font-style:italic;color:#d0cdc4;line-height:1.6}
.video-block{margin-bottom:44px}
.video-label{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#c9a84c;margin-bottom:10px}
.video-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:#f0ede4;line-height:1.3;margin-bottom:8px}
.video-sub{font-size:14px;color:#888880;line-height:1.6;margin-bottom:20px}
.video-portrait{position:relative;width:100%;max-width:320px;margin:0 auto;border-radius:10px;overflow:hidden;
  box-shadow:0 24px 64px rgba(0,0,0,.65);border:1px solid rgba(201,168,76,.18)}
.video-portrait::before{content:'';display:block;padding-top:177.78%}
.video-portrait iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}
.cta-block{background:linear-gradient(135deg,rgba(45,80,22,.28) 0%,rgba(14,18,8,.9) 100%);
  border:1px solid rgba(201,168,76,.22);border-radius:6px;padding:36px;text-align:center}
.cta-pre{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#c9a84c;margin-bottom:12px}
.cta-title{font-family:'Cormorant Garamond',serif;font-size:27px;font-weight:700;color:#f0ede4;line-height:1.25;margin-bottom:12px}
.cta-desc{font-size:14px;color:#a0a098;line-height:1.7;margin-bottom:28px;max-width:360px;margin-left:auto;margin-right:auto}
.cta-note{font-size:11px;color:#555550;margin-top:12px}
.brand-footer{text-align:center;margin-top:56px;padding-bottom:40px}
.brand-name{font-family:'Cormorant Garamond',serif;font-size:17px;color:#c9a84c;letter-spacing:1px}
.brand-tag{font-size:11px;color:#444440;margin-top:4px}
`;

export default function ScoreCSR() {
  const [screen,setScreen]=useState("hero");
  const [raison,setRaison]=useState("");
  const [current,setCurrent]=useState(0);
  const [answers,setAnswers]=useState({});
  const [prenom,setPrenom]=useState("");
  const [email,setEmail]=useState("");
  const [sending,setSending]=useState(false);
  const topRef=useRef(null);
  const scrollTop=()=>setTimeout(()=>topRef.current?.scrollIntoView({behavior:"smooth"}),50);

  const score=Object.values(answers).reduce((s,v)=>s+v,0);
  const profile=getProfile(score,answers);
  const aoQ=[0,2,7,11], aiQ=[3,4,6,9], ceQ=[1,5,8,10];
  const dimAvg=(idxs)=>Math.round((idxs.reduce((s,i)=>s+(answers[i]||0),0)/idxs.length)*10)/10;
  const dims=[
    {code:"AO",name:"Objectif",val:dimAvg(aoQ),color:"#2D5016"},
    {code:"AI",name:"Identité",val:dimAvg(aiQ),color:"#c9a84c"},
    {code:"CE",name:"Exécution",val:dimAvg(ceQ),color:"#8B6914"},
  ];

  const handleAnswer=(val)=>{
    const updated={...answers,[current]:val};
    setAnswers(updated);
    setTimeout(()=>{
      if(current<QUESTIONS.length-1){setCurrent(c=>c+1);scrollTop();}
      else{setScreen("gate");scrollTop();}
    },260);
  };

  const handleSubmit=async()=>{
    if(!prenom||!email)return;
    setSending(true);
    await sendToAirtable({prenom,email,score,profile,raison,answers});
    setSending(false);
    setScreen("result");
    scrollTop();
  };

  const pct=Math.round((score/60)*100);
  const VIDEO_ID="bVJFQlpRlHo";

  return(
    <>
      <style>{CSS}</style>
      <div ref={topRef} style={{width:"100%"}}>

        {/* ── HERO ── */}
        {screen==="hero"&&(
          <section className="hero">
            <div className="hero-glow-1"/>
            <div className="hero-glow-2"/>
            <div className="hero-vline"/>
            <div className="hero-content">
              <div className="hero-eyebrow">
                <div className="hero-eyebrow-line"/>
                <span className="hero-eyebrow-text">Racine &amp; Impact</span>
                <div className="hero-eyebrow-line"/>
              </div>
              <h1 className="hero-title">
                Tu sais quoi faire.
                <em>Alors pourquoi tu n'y arrives pas ?</em>
              </h1>
              <div className="hero-divider"/>
              <p className="hero-sub">
                En 3 minutes, le Score CSR révèle le mécanisme invisible qui maintient
                ton système là où il est — et les leviers exacts à activer pour changer ça.
              </p>
              <div className="hero-pills">
                <span className="pill">12 questions comportementales</span>
                <span className="pill">Profil personnalisé</span>
                <span className="pill">Analyse immédiate</span>
              </div>
              <button className="btn-hero" onClick={()=>{setScreen("qual");scrollTop();}}>
                Démarrer mon Score CSR
              </button>
              <div className="hero-proof">
                <div className="proof-item">
                  <div className="proof-num">3</div>
                  <div className="proof-lbl">minutes</div>
                </div>
                <div className="proof-sep"/>
                <div className="proof-item">
                  <div className="proof-num">5</div>
                  <div className="proof-lbl">profils</div>
                </div>
                <div className="proof-sep"/>
                <div className="proof-item">
                  <div className="proof-num">100%</div>
                  <div className="proof-lbl">gratuit</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── QUALIFICATION ── */}
        {screen==="qual"&&(
          <section className="screen">
            <div className="card">
              <div className="section-label">Avant de commencer</div>
              <h2 className="card-title">Pourquoi fais-tu ce test aujourd'hui ?</h2>
              <p className="card-sub">Cette réponse oriente la lecture de tes résultats.</p>
              <div className="options">
                {RAISONS.map(r=>(
                  <button key={r} className={`option${raison===r?" sel":""}`} onClick={()=>setRaison(r)}>{r}</button>
                ))}
              </div>
              <button className="btn btn-gold" style={{width:"100%",opacity:raison?1:.4}}
                disabled={!raison} onClick={()=>{setScreen("test");scrollTop();}}>COMMENCER →</button>
            </div>
          </section>
        )}

        {/* ── TEST ── */}
        {screen==="test"&&(
          <section className="test-screen">
            <div className="prog-wrap">
              <div className="prog-top">
                <span className="prog-lbl">Question</span>
                <span className="prog-count">{current+1} / {QUESTIONS.length}</span>
              </div>
              <div className="prog-track">
                <div className="prog-fill" style={{width:`${((current+1)/QUESTIONS.length)*100}%`}}/>
              </div>
            </div>
            <div className="q-card">
              <div className="q-dim">
                {QUESTIONS[current].dimension==="AO"&&"Avancement objectif"}
                {QUESTIONS[current].dimension==="AI"&&"Alignement identitaire"}
                {QUESTIONS[current].dimension==="CE"&&"Cohérence d'exécution"}
              </div>
              <h2 className="q-text">{QUESTIONS[current].text}</h2>
              <div className="scale">
                {LABELS.map((label,i)=>(
                  <button key={i} className={`scale-btn${answers[current]===i+1?" sel":""}`}
                    onClick={()=>handleAnswer(i+1)}>
                    <span className="scale-num">{i+1}</span>{label}
                  </button>
                ))}
              </div>
            </div>
            <div className="nav-row">
              <button className="btn btn-ghost" disabled={current===0}
                onClick={()=>{setCurrent(c=>c-1);scrollTop();}}>← Précédent</button>
              {answers[current]&&current<QUESTIONS.length-1&&(
                <button className="btn btn-gold" onClick={()=>{setCurrent(c=>c+1);scrollTop();}}>Suivant →</button>
              )}
              {answers[current]&&current===QUESTIONS.length-1&&(
                <button className="btn btn-gold" onClick={()=>{setScreen("gate");scrollTop();}}>Voir mes résultats →</button>
              )}
            </div>
          </section>
        )}

        {/* ── EMAIL GATE ── */}
        {screen==="gate"&&(
          <section className="gate-screen">
            <div className="gate-glow"/>
            <div className="gate-card">
              <div className="score-reveal">
                <div className="score-big">{score}<span className="score-max">/60</span></div>
                <div style={{flex:1}}>
                  <div className="score-bar-track">
                    <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#2D5016,#c9a84c)",borderRadius:2,transition:"width 1s ease"}}/>
                  </div>
                  <div className="score-reveal-text">
                    Ton score est calculé.<br/>
                    <strong>Ton profil t'attend</strong> — entre tes coordonnées pour le révéler.
                  </div>
                </div>
              </div>

              <div className="section-label">Dernière étape</div>
              <h2 className="card-title">Accède à ton analyse complète</h2>
              <p className="card-sub">Profil · 3 dimensions · Levier prioritaire · Vidéo personnalisée</p>

              <div className="fields">
                <div>
                  <div className="field-lbl">Prénom</div>
                  <input className="field-input" placeholder="Ton prénom" value={prenom} onChange={e=>setPrenom(e.target.value)}/>
                </div>
                <div>
                  <div className="field-lbl">Email</div>
                  <input className="field-input" type="email" placeholder="ton@email.com" value={email} onChange={e=>setEmail(e.target.value)}/>
                </div>
              </div>

              <button className="btn-gate" disabled={!prenom||!email||sending} onClick={handleSubmit}
                style={{opacity:prenom&&email?1:.35}}>
                {sending?"Chargement...":"Révéler mon profil"}
                {!sending&&<span className="btn-arrow">→</span>}
              </button>

              <div className="gate-trust">
                <div className="trust-item"><div className="trust-dot"/>Aucun spam</div>
                <div className="trust-sep"/>
                <div className="trust-item"><div className="trust-dot"/>Données confidentielles</div>
                <div className="trust-sep"/>
                <div className="trust-item"><div className="trust-dot"/>Sans engagement</div>
              </div>
            </div>
          </section>
        )}

        {/* ── RÉSULTATS ── */}
        {screen==="result"&&(
          <section className="result-screen">
            <div className="result-wrap">
              <div className="result-header">
                <div className="result-emoji">{profile.emoji}</div>
                <div className="result-profile" style={{color:profile.color}}>Ton profil</div>
                <div className="result-name" style={{color:profile.color}}>{profile.label}</div>
                <h2 className="result-headline">{profile.headline}</h2>
                <p className="result-desc">{profile.desc}</p>
              </div>
              <div className="score-center">
                <ScoreRing score={score} max={60} color={profile.color}/>
                <div className="score-lbl">Score du Système de Réussite</div>
              </div>
              <div className="dims">
                {dims.map(d=>(
                  <div className="dim-card" key={d.code}>
                    <div className="dim-code" style={{color:d.color}}>{d.code}</div>
                    <div className="dim-name">{d.name}</div>
                    <div className="dim-track"><div className="dim-fill" style={{width:`${(d.val/5)*100}%`,background:d.color}}/></div>
                    <div className="dim-val">{d.val.toFixed(1)} / 5</div>
                  </div>
                ))}
              </div>
              <div className="insight">
                <div className="insight-lbl">Levier prioritaire</div>
                <div className="insight-text">{getInsight(answers)}</div>
              </div>
              <div className="video-block">
                <div className="video-label">Message pour toi</div>
                <div className="video-title">Pourquoi ton score reflète un système — pas un manque de volonté</div>
                <div className="video-sub">Regarde cette vidéo avant de passer à la suite. Elle t'explique exactement ce que ton score révèle et ce que ça change concrètement.</div>
                <div className="video-portrait">
                  <iframe src={`https://www.youtube.com/embed/${VIDEO_ID}?rel=0&modestbranding=1&color=white`}
                    title="Analyse de ton Système de Réussite — Racine & Impact"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>
                </div>
              </div>
              <div className="cta-block">
                <div className="cta-pre">Prochaine étape</div>
                <h3 className="cta-title">Cartographie de ton<br/>Système de Réussite</h3>
                <p className="cta-desc">90 minutes pour rendre visible exactement ce qui te maintient là où tu es — et construire ensemble le plan des 30 prochains jours.</p>
                <a href="https://calendly.com/contact-racineetimpact/appel-decouverte--15min-offert"
                  target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
                  <button className="btn btn-gold" style={{fontSize:14,padding:"16px 36px"}}>
                    RÉSERVER MON APPEL OFFERT — 15 MIN →
                  </button>
                </a>
                <p className="cta-note">Appel découverte · 15 minutes · Sans engagement</p>
              </div>
              <div className="brand-footer">
                <div className="brand-name">Racine &amp; Impact</div>
                <div className="brand-tag">Coach en Alignement et Performance Humaine</div>
              </div>
            </div>
          </section>
        )}

      </div>
    </>
  );
}
