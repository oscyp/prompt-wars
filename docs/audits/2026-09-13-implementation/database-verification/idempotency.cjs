const { Client } = require('pg');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const config = { host:'/tmp/prompt-wars-db-runtime', port:55439, user:'postgres', database:'postgres' };
async function connection() { const c=new Client(config); await c.connect(); await c.query("SET statement_timeout='10s'"); return c; }
async function main() {
 const admin=await connection(), a=await connection(), b=await connection();
 const users=[randomUUID(),randomUUID()];
 async function race(label,lock,params,sql,queries) {
  await admin.query('BEGIN'); await admin.query(lock,params);
  const calls=[a,b].map((c,i)=>c.query(sql,queries[i])); calls.forEach(p=>p.catch(()=>{}));
  let waits=0;
  for(let i=0;i<25;i++) { await new Promise(r=>setTimeout(r,20)); waits=Number((await admin.query("SELECT count(*) FROM pg_stat_activity WHERE pid=ANY($1) AND wait_event_type='Lock'",[[a.processID,b.processID]])).rows[0].count); if(waits===2)break; }
  await admin.query('COMMIT'); const result=await Promise.all(calls); assert.equal(waits,2,label+' concurrent lock barrier');
  console.log('PASS simultaneous lock barrier: '+label); return result.map(r=>r.rows[0]);
 }
 try {
  for(const u of users) await admin.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,'{\"age_confirmed\":true}')",[u,u+'@concurrency.invalid']);
  const starters=await race('starter duplicates','SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[users[0]],'SELECT create_starter_fighter($1) AS result',[[users[0]],[users[0]]]);
  assert.equal(starters[0].result.id,starters[1].result.id); const c1=starters[0].result.id;
  assert.equal((await admin.query('SELECT count(*) FROM characters WHERE profile_id=$1',[users[0]])).rows[0].count,'1');
  assert.equal(Number((await admin.query('SELECT sum(amount) AS total FROM wallet_transactions WHERE profile_id=$1',[users[0]])).rows[0].total),10);
  const tutorial=await race('tutorial duplicates','SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[users[0]],'SELECT prepare_tutorial($1) AS result',[[users[0]],[users[0]]]);
  assert.equal(tutorial[0].result.request_id,tutorial[1].result.request_id);
  await admin.query('INSERT INTO character_respecs(character_id,profile_id) VALUES($1,$2)',[c1,users[0]]);
  const respec=randomUUID(), stats={strength:6,stamina:5,agility:4,focus:5};
  const respecs=await race('respec duplicate request','SELECT id FROM characters WHERE id=$1 FOR UPDATE',[c1],'SELECT apply_character_respec($1,$2,$3,$4) AS result',[[users[0],c1,respec,stats],[users[0],c1,respec,stats]]);
  assert.deepEqual(respecs[0].result,respecs[1].result);
  const request=randomUUID();
  const portraits=await race('portrait duplicate claim','SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[users[0]],'SELECT claim_initial_portrait($1,$2,$3,true) AS result',[[users[0],c1,request],[users[0],c1,request]]);
  assert.equal(portraits.filter(x=>x.result.worker).length,1);
  assert.equal((await admin.query('SELECT draft_portrait_renders FROM characters WHERE id=$1',[c1])).rows[0].draft_portrait_renders,1);
  const token=portraits.find(x=>x.result.worker).result.lease_token;
  await race('portrait duplicate refund','SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[users[0]],'SELECT fail_initial_portrait($1,$2,$3,$4)',[[users[0],c1,request,token],[users[0],c1,request,token]]);
  assert.equal((await admin.query('SELECT draft_portrait_renders FROM characters WHERE id=$1',[c1])).rows[0].draft_portrait_renders,0);
  const c2=(await admin.query('SELECT create_starter_fighter($1) AS result',[users[1]])).rows[0].result.id;
  async function battle(delta) {
   const id=(await admin.query("INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id) VALUES('ranked','resolving','single',1,$1,$2,$3,$4) RETURNING id",[...users,c1,c2])).rows[0].id;
   await admin.query("SELECT resolve_battle($1,$2,false,'{}',$3,'v1','primary',1)",[id,users[0],{[users[0]]:{delta},[users[1]]:{delta:-delta}}]); return id;
  }
  const original=await battle(20), later=await battle(7);
  const submissions=await race('duplicate eligible appeal submissions','SELECT id FROM battles WHERE id=$1 FOR UPDATE',[original],'SELECT submit_independent_appeal($1,$2) AS id',[[original,users[1]],[original,users[1]]]);
  assert.equal(submissions[0].id,submissions[1].id); const appeal=submissions[0].id;
  assert.equal((await admin.query('SELECT count(*) FROM appeals WHERE battle_id=$1',[original])).rows[0].count,'1');
  const tokens=[randomUUID(),randomUUID()];
  const claims=await race('duplicate appeal processors','SELECT id FROM appeals WHERE id=$1 FOR UPDATE',[appeal],'SELECT claim_independent_appeal($1,$2) AS result',[[appeal,tokens[0]],[appeal,tokens[1]]]);
  const winner=claims.findIndex(x=>x.result!==null); assert.equal(claims.filter(x=>x.result!==null).length,1);
  const review={status:'no_contest',winner:null,isDraw:false,rounds:[]};
  const finals=await race('duplicate appeal finalization','SELECT id FROM battles WHERE id=$1 FOR UPDATE',[original],'SELECT finalize_independent_appeal($1,$2,$3) AS applied',[[appeal,tokens[winner],review],[appeal,tokens[winner],review]]);
  assert.equal(finals.filter(x=>x.applied).length,1);
  assert.equal((await admin.query('SELECT count(*) FROM appeal_rating_corrections WHERE appeal_id=$1',[appeal])).rows[0].count,'2');
  assert.equal(Number((await admin.query('SELECT rating FROM profiles WHERE id=$1',[users[0]])).rows[0].rating),1507);
  console.log('PASS concurrency invariants: one fighter/grant/tutorial/respec/reservation/refund/appeal, one correction per player, later rating retained.');
 } catch(error) { console.error('ASSERTION FAILURE:',error.stack); throw error; } finally {
  await admin.query('ROLLBACK').catch(()=>{});
  await a.end(); await b.end();
  try { await admin.query('DELETE FROM appeal_rating_corrections WHERE profile_id=ANY($1)',[users]); await admin.query('DELETE FROM initial_portrait_requests WHERE profile_id=ANY($1)',[users]); await admin.query('DELETE FROM auth.users WHERE id=ANY($1)',[users]); } finally { await admin.end(); }
 }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
