const fs = require('fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const config = { host: '/tmp/prompt-wars-db-runtime', port: 55439, user: 'postgres', database: 'postgres' };
const spec = fs.readFileSync('/Users/patdom/sources/prompt-wars/supabase/tests/combat_timeout_races.spec', 'utf8');
const setup = spec.match(/setup\s*\{([\s\S]*?)\n\}\s*teardown/)[1];
const teardown = spec.match(/teardown\s*\{([\s\S]*?)\n\}\s*session/)[1];
const steps = new Map();
for (const section of spec.split(/session\s+"/).slice(1)) {
  const session = section.slice(0, section.indexOf('"'));
  for (const match of section.matchAll(/step\s+"([^"]+)"\s*\{([\s\S]*?)\}\s*(?=step|session|permutation|$)/g)) steps.set(match[1], { session, sql: match[2] });
}
const permutations = [...spec.matchAll(/^permutation (.*)$/gm)].map(x => [...x[1].matchAll(/"([^"]+)"/g)].map(y => y[1]));
async function connected() { const c = new Client(config); await c.connect(); await c.query("SET statement_timeout = '10s'"); return c; }
async function main() {
 const observer = await connected();
 try {
  for (const sequence of permutations) {
   await observer.query(setup);
   const clients = new Map(); const pending = new Map(); let blocked = 0;
   try {
    for (const name of sequence) {
     const step = steps.get(name); assert(step, name);
     if (!clients.has(step.session)) clients.set(step.session, await connected());
     const c = clients.get(step.session);
     if (pending.has(step.session)) { await pending.get(step.session); pending.delete(step.session); }
     const query = c.query(step.sql);
     const state = await Promise.race([query.then(() => 'done'), new Promise(resolve => setTimeout(() => resolve('pending'), 80))]);
     if (state === 'pending') {
       const row = (await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [c.processID])).rows[0];
       assert.equal(row?.wait_event_type, 'Lock', name + ' must be blocked on a real DB lock');
       pending.set(step.session, query); blocked++;
     }
    }
    await Promise.all(pending.values());
    assert(blocked > 0, 'permutation must exercise blocking');
    console.log('PASS concurrent permutation (' + blocked + ' observed lock wait): ' + sequence.join(' → '));
   } finally {
    for (const c of clients.values()) { await c.query('ROLLBACK').catch(() => {}); await c.end(); }
    await observer.query(teardown);
   }
  }
 } finally { await observer.end(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
