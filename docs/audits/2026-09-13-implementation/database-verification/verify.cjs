const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const root = '/Users/patdom/sources/prompt-wars';
const client = new Client({ host: '/tmp/prompt-wars-db-runtime', port: 55439, user: 'postgres', database: 'postgres' });
async function main() {
  await client.connect();
  const mode = process.argv[2];
  if (mode === 'bootstrap') {
    await client.query(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public, storage TO anon, authenticated, service_role, supabase_auth_admin;
      GRANT SELECT ON auth.users TO service_role, supabase_auth_admin;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false, file_size_limit bigint);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text NOT NULL);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1] $$;
      CREATE PUBLICATION supabase_realtime;
      CREATE TABLE public.local_verification_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now());
    `);
    console.log('BOOTSTRAP: minimal local auth/storage schemas, API roles and publication; no Supabase services or scheduler.');
  } else if (mode === 'migrate') {
    const applied = new Set((await client.query('SELECT name FROM public.local_verification_migrations')).rows.map(x => x.name));
    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
      if (applied.has(name)) continue;
      if (name === '20260526120000_schedule_background_workers.sql') { console.log('SKIP scheduler extensions: ' + name); continue; }
      if (process.argv[3] && name > process.argv[3]) continue;
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
        await client.query('INSERT INTO public.local_verification_migrations(name) VALUES($1)', [name]);
        await client.query('COMMIT');
        console.log('PASS migration ' + name);
      } catch (error) { await client.query('ROLLBACK'); throw new Error(name + ': ' + error.message + ' [SQLSTATE ' + error.code + ']'); }
    }
  } else if (mode === 'fixture') {
    const name = process.argv[3];
    await client.query(fs.readFileSync(path.resolve(root, name), 'utf8'));
    console.log('PASS fixture ' + name);
  } else if (mode === 'sql') {
    console.log(JSON.stringify((await client.query(fs.readFileSync(process.argv[3], 'utf8'))).rows, null, 2));
  } else { console.log((await client.query('SELECT version()')).rows[0].version); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => client.end());
