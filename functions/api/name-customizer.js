import {requireClaim} from './nickname.js';
const H={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const ITEMS={
 color_cyan:{label:'Electric Cyan',cost:100,type:'color',css:'#35e5d0'},
 color_pink:{label:'Hot Pink',cost:100,type:'color',css:'#ff77b7'},
 color_orange:{label:'Sunset Orange',cost:100,type:'color',css:'#ff9c50'},
 color_green:{label:'Emerald Green',cost:100,type:'color',css:'#6ff7a2'},
 color_purple:{label:'Royal Purple',cost:100,type:'color',css:'#bd9cff'},
 color_neon:{label:'Neon Lime',cost:300,type:'color',css:'#d1ff42'},
 color_neonblue:{label:'Neon Blue',cost:300,type:'color',css:'#51a8ff'},
 color_gold:{label:'Golden Name',cost:500,type:'color',css:'#ffce5c'},
 color_rainbow:{label:'Rainbow Name',cost:900,type:'color',css:'rainbow'},
 font_classic:{label:'Classic Bold',cost:100,type:'font',css:'system-ui'},
 font_gaming:{label:'Gaming Mono',cost:250,type:'font',css:'monospace'},
 font_royal:{label:'Royal Serif',cost:450,type:'font',css:'Georgia,serif'},
 font_handwritten:{label:'Handwritten',cost:600,type:'font',css:'cursive'},
 font_cosmic:{label:'Legendary Cosmic',cost:1500,type:'font',css:'Impact,Arial Black,sans-serif'}
};
async function ensure(db){await db.prepare(`CREATE TABLE IF NOT EXISTS qf70_name_equipped (player_id TEXT PRIMARY KEY, color_id TEXT NOT NULL DEFAULT 'default', font_id TEXT NOT NULL DEFAULT 'default', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();}
async function state(db,id){
 const [p,spent,owned,eq]=await Promise.all([
 db.prepare(`SELECT COALESCE(o.xp_override,p.xp,0) xp FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id WHERE p.player_id=?`).bind(id).first(),
 db.prepare(`SELECT COALESCE(SUM(cost),0) spent FROM qfhq_shop_purchases WHERE player_id=?`).bind(id).first(),
 db.prepare(`SELECT item_id FROM qfhq_shop_purchases WHERE player_id=?`).bind(id).all(),
 db.prepare(`SELECT color_id colorId,font_id fontId FROM qf70_name_equipped WHERE player_id=?`).bind(id).first()
 ]);
 return {xp:Math.max(0,Number(p?.xp)||0),balance:Math.max(0,(Number(p?.xp)||0)-(Number(spent?.spent)||0)),owned:(owned.results||[]).map(r=>r.item_id).filter(x=>x in ITEMS),colorId:eq?.colorId||'default',fontId:eq?.fontId||'default',items:ITEMS};
}
export async function onRequest({request,env}){
 try{
 if(!env?.DB?.prepare)return reply({ok:false,error:'Database unavailable'},503);
 const db=env.DB;await ensure(db);
 if(request.method==='GET')return reply({ok:true,items:ITEMS});
 if(request.method!=='POST')return reply({ok:false,error:'Method not allowed'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({ok:false,error:'Origin mismatch'},403);
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({ok:false,error:'JSON required'},415);
 const raw=await request.text();if(raw.length>2500)return reply({ok:false,error:'Request too large'},413);
 let x;try{x=JSON.parse(raw)}catch{return reply({ok:false,error:'Bad JSON'},400)}
 if(!x||!['load','buy','equip'].includes(x.action))return reply({ok:false,error:'Invalid action'},400);
 const claim=await requireClaim(db,x.nickname,x.playerId,x.inboxKey);
 if(!claim.ok)return reply({ok:false,error:claim.error},claim.status);
 if(x.action==='buy'){
 const item=ITEMS[x.itemId];if(!item)return reply({ok:false,error:'Unknown item'},400);
 const result=await db.prepare(`INSERT OR IGNORE INTO qfhq_shop_purchases(player_id,item_id,cost)
 SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id WHERE p.player_id=?
 AND MAX(0,COALESCE(o.xp_override,p.xp,0))-COALESCE((SELECT SUM(cost) FROM qfhq_shop_purchases WHERE player_id=?),0)>=?)`)
 .bind(x.playerId,x.itemId,item.cost,x.playerId,x.playerId,item.cost).run();
 if(!result.meta?.changes)return reply({ok:false,error:'Already owned or not enough spendable XP'},409);
 }
 if(x.action==='equip'){
 const item=x.itemId==='default'?null:ITEMS[x.itemId];
 if(x.itemId!=='default'&&!item)return reply({ok:false,error:'Unknown item'},400);
 const type=x.type;if(!['font','color'].includes(type)||item&&item.type!==type)return reply({ok:false,error:'Invalid choice'},400);
 if(item){const owned=await db.prepare('SELECT 1 FROM qfhq_shop_purchases WHERE player_id=? AND item_id=?').bind(x.playerId,x.itemId).first();if(!owned)return reply({ok:false,error:'Buy this upgrade first'},403);}
 await db.prepare('INSERT OR IGNORE INTO qf70_name_equipped(player_id) VALUES (?)').bind(x.playerId).run();
 const col=type==='font'?'font_id':'color_id';await db.prepare(`UPDATE qf70_name_equipped SET ${col}=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(x.itemId,x.playerId).run();
 }
 return reply({ok:true,data:await state(db,x.playerId)});
 }catch(e){console.error('name customizer error',e);return reply({ok:false,error:'Name customizer unavailable'},503)}
}
