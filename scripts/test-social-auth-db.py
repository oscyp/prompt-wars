"""Exercise pending migrations and auth SQL tests locally, in one rolled-back transaction.

Uses the existing local Supabase container only. Never connects to the linked project.
No migration-history changes, resets, or persistent schema writes.
"""
from pathlib import Path
import re
import subprocess
import sys

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
    parts.append(f'\\echo Applying {path.name}\n{source}')
for name in sys.argv[1:] or ['social_registration.sql', 'apple_authorization.sql', 'guest_registration.sql', 'adult_guest_registration.sql']:
    source = (root / 'supabase/tests' / name).read_text()
    parts.append(re.sub(r'^(BEGIN|ROLLBACK);', '', source, flags=re.M))
result = subprocess.run(command, input='BEGIN;\n' + '\n'.join(parts) + '\nROLLBACK;\n', text=True, capture_output=True)
log = Path('/tmp/prompt-wars-auth-db-test.log')
log.write_text(result.stdout + '\n' + result.stderr)
print(result.stdout[-2000:])
if result.returncode:
    print(result.stderr[-3500:])
print(f'Full output: {log}')
raise SystemExit(result.returncode)
