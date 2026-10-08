"""Apply pending migrations and composer SQL suites in one LOCAL rolled-back transaction.
Never uses linked Supabase credentials, resets, or changes migration history.
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
for name in (sys.argv[1:] or ['prompt_composer_context.sql', 'composer_suggestions.sql', 'composer_judge_calibration.sql', 'composer_authoring_origin.sql', 'private_bot_policy.sql', 'composer_completions.sql']):
    source = (root / 'supabase/tests' / name).read_text()
    parts.append(re.sub(r'^(BEGIN|ROLLBACK);', '', source, flags=re.M))
result = subprocess.run(command, input='BEGIN;\n' + '\n'.join(parts) + '\nROLLBACK;\n', text=True, capture_output=True)
log = Path('/tmp/prompt-wars-composer-db-test.log')
log.write_text(result.stdout + '\n' + result.stderr)
print(result.stdout[-2500:])
if result.returncode:
    print(result.stderr[-3500:])
print(f'Full output: {log}')
raise SystemExit(result.returncode or (1 if re.search(r'^\s*not ok\b', result.stdout, re.M) else 0))
