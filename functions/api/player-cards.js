/** QUIZFORCE v6.6 — read-only public player cards. Uses existing D1 tables.
 * Deploy to functions/api/player-cards.js. No keys, passwords, inbox hashes or private data are returned.
 * Player-reported progress is not independently verified.
 */
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const clamp=x=>Math.max(0,Math.floor(Number(x)||0));
const RANKS=[{at:1,name:'Space Cadet'},{at:5,name:'Star Explorer'},{at:10,name:'Star Pilot'},{at:20,name:'Galactic Champion'},{at:35,name:'Cosmic Legend'},{at:50,name:'QUIZFORCE Omega'}];
const levelStart=n=>200*(n-1)+25*(n-1)*(n-2);
function getLevel(xp){let n=1;while(n<100&&xp>=levelStart(n+1))n++;return {number:n,rank:RANKS.filter(r=>r.at<=n).at(-1).name};}
const titleNames={gold_name:'👑 Golden Name',captain_title:'🧑‍🚀 Space Captain',wizard_title:'🪄 Quiz Wizard',speedster_title:'⚡ Speedster',genius_title:'🧠 Cosmic Genius',legend_title:'🌠 Galactic Legend',secret_star_title:'🌟 Star Commander',secret_titan_title:'👑 Cosmic Titan',secret_omega_title:'🏆 QUIZFORCE Omega'};
const badgeNames={founder:'🌟 Founder',helper:'💡 Helpful Hero',star:'⭐ Star Player',champion:'🏆 HQ Champion',first:'🚀 First Launch',ten:'🎯 Ten Tests',perfect:'💯 Perfect Score',legend:'👑 Galactic Legend'};
export async function onRequestGet({env}){
 if(!env?.DB?.prepare)return reply({ok:false,error:'Database binding DB is missing'},503);
 try{
  const db=env.DB;
  // The profile endpoint creates these tables when players first open Profiles.
  const query=`SELECT cp.player_id AS playerId,COALESCE(ov.nickname_override,cp.nickname) AS nickname,
   cp.avatar,cp.color,cp.frame,cp.title,cp.favorite_badge AS favoriteBadge,
   ex.banner,ex.flair,ex.name_style AS nameStyle,ex.motto,
   st.profile_effect AS profileEffect,st.favourite_subject AS favouriteSubject,
   COALESCE(ov.xp_override,pl.xp,0) AS xp,
   COALESCE(pl.legacy_tests,0)+COALESCE(pl.tracked_tests,0) AS games,
   COALESCE(pl.perfect_runs,0) AS perfect,
   COALESCE((SELECT MAX(CASE WHEN r.total>0 THEN ROUND(100.0*r.correct/r.total) ELSE 0 END)
    FROM qfhq_runs r WHERE r.player_id=cp.player_id),0) AS bestPct
   FROM qfhq_cosmetic_profiles cp
   JOIN qfhq_players pl ON pl.player_id=cp.player_id
   LEFT JOIN qfhq_hq_overrides ov ON ov.player_id=cp.player_id
   LEFT JOIN qfhq_cosmetic_extras ex ON ex.player_id=cp.player_id
   LEFT JOIN qfhq_profile_settings st ON st.player_id=cp.player_id
   WHERE COALESCE(ov.hidden,0)=0
   ORDER BY COALESCE(ov.xp_override,pl.xp,0) DESC,cp.updated_at DESC LIMIT 200`;
  const rows=(await db.prepare(query).all()).results||[];
  let names={};try{const a=(await db.prepare('SELECT player_id,color_id,font_id FROM qf70_name_equipped').all()).results||[];names=Object.fromEntries(a.map(v=>[v.player_id,v]));}catch{}
  return reply({ok:true,cards:rows.map(r=>{
   const xp=clamp(r.xp),level=getLevel(xp);
   return {playerId:r.playerId,nickname:String(r.nickname||'Player').slice(0,18),avatar:r.avatar||'🚀',color:r.color||'cyan',frame:r.frame||'none',title:r.title||'none',titleName:titleNames[r.title]||level.rank,
    banner:r.banner||'none',flair:r.flair||'none',nameStyle:r.nameStyle||'none',motto:String(r.motto||'').slice(0,48),profileEffect:r.profileEffect||'none',favouriteSubject:r.favouriteSubject||'none',
    colorId:names[r.playerId]?.color_id||'default',fontId:names[r.playerId]?.font_id||'default',
    xp,games:clamp(r.games),perfect:clamp(r.perfect),bestPct:clamp(r.bestPct),level:level.number,rank:level.rank,badgeName:badgeNames[r.favoriteBadge]||''};
  })});
 }catch(err){console.error('Player cards endpoint error',err);return reply({ok:false,error:'Player cards are not ready. Open Profiles in QUIZFORCE and try again.'},503)}
}
