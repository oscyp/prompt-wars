"""Test private bot policy in one rolled-back LOCAL database transaction.

Does not reset a database or persist migrations, fixtures, or history.
"""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parent.parent
command = ['docker', 'exec', '-i', 'supabase_db_prompt-wars', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
latest = subprocess.check_output(command + ['-Atc', 'select max(version) from supabase_migrations.schema_migrations'], text=True).strip()
parts = []
for path in sorted((root / 'supabase/migrations').glob('*.sql')):
    if path.name.split('_')[0] <= latest:
        continue
    source = path.read_text()
    if re.search(r'^\s*(COMMIT|ROLLBACK)\s*;', source, re.M | re.I):
        raise RuntimeError(f'Refusing migration with transaction control: {path.name}')
    parts.append(source)
parts.append(re.sub(r'^(BEGIN|ROLLBACK);', '', (root / 'supabase/tests/private_bot_policy.sql').read_text(), flags=re.M))
result = subprocess.run(command, input='BEGIN;\n' + '\n'.join(parts) + '\nROLLBACK;\n', text=True, capture_output=True)
log = Path('/tmp/prompt-wars-private-bot-db-test.log')
log.write_text(result.stdout + '\n' + result.stderr)
print(result.stdout[-4000:])
if result.returncode:
    print(result.stderr[-4000:])
print(f'Full output: {log}')
raise SystemExit(result.returncode)
