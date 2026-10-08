"""Existing LOCAL DB only; all pending prerequisite SQL and tests roll back."""
from pathlib import Path
import subprocess
import re
import sys

root = Path(__file__).resolve().parent.parent
cmd = ['docker', 'exec', '-i', 'supabase_db_prompt-wars', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
latest = subprocess.check_output(cmd + ['-Atc', 'select max(version) from supabase_migrations.schema_migrations'], text=True).strip()
parts = []
for path in sorted((root / 'supabase/migrations').glob('*.sql')):
    version = path.name.split('_')[0]
    if version <= latest or (version > '20260930235959' and not any(tag in path.name for tag in ['composer_suggestion_operations','composer_delivery_safety'])):
        continue
    if '--baseline' in sys.argv and 'composer_suggestion_operations' in path.name:
        continue
    source = path.read_text()
    if re.search(r'^\s*(COMMIT|ROLLBACK)\s*;', source, re.M | re.I):
        raise RuntimeError(f'Refusing migration with transaction control: {path.name}')
    parts.append(source)
parts.append(re.sub(r'^(BEGIN|ROLLBACK);', '', (root / 'supabase/tests/composer_suggestions.sql').read_text(), flags=re.M))
result = subprocess.run(cmd, input='BEGIN;\n' + '\n'.join(parts) + '\nROLLBACK;\n', text=True, capture_output=True)
log = Path('/tmp/prompt-wars-suggestion-db-test.log')
log.write_text(result.stdout + '\n' + result.stderr)
print(result.stdout[-1000:])
print(result.stderr[-3000:] if result.returncode else 'Suggestion SQL suite passed; all writes rolled back.')
print(f'Full output: {log}')
raise SystemExit(result.returncode)
