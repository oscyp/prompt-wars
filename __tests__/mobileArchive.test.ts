import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import ts from 'typescript';

const root = path.resolve(__dirname, '..');
const archive = ignore().add(
  fs.readFileSync(path.join(root, '.easignore'), 'utf8'),
);
const mobileRoots = [
  'app',
  'components',
  'hooks',
  'utils',
  'providers',
  'constants',
  'types',
];
const allowedShared = [
  'supabase/functions/_shared/composer-events.ts',
  'supabase/functions/_shared/prompt-affordances.ts',
  'supabase/functions/_shared/prompt-situations.ts',
];

function filesUnder(directory: string): string[] {
  return fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(relative) : [relative];
    });
}

function localImports(file: string): string[] {
  return ts
    .preProcessFile(fs.readFileSync(path.join(root, file), 'utf8'))
    .importedFiles.flatMap(({ fileName }) => {
      const base = fileName.startsWith('@/')
        ? fileName.slice(2)
        : fileName.startsWith('.')
          ? path.normalize(path.join(path.dirname(file), fileName))
          : null;
      if (!base) return [];
      const resolved = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
      ].find(
        (candidate) =>
          fs.existsSync(path.join(root, candidate)) &&
          fs.statSync(path.join(root, candidate)).isFile(),
      );
      return resolved ? [resolved] : [];
    });
}

test('EAS archive contains the complete shared composer import closure while excluding backend and fixture code', () => {
  const imported = mobileRoots
    .flatMap(filesUnder)
    .filter((file) => /\.[jt]sx?$/.test(file))
    .flatMap(localImports)
    .filter((file) => file.startsWith('supabase/'));
  const closure = new Set(imported);
  for (const file of closure) {
    for (const dependency of localImports(file)) closure.add(dependency);
  }
  expect([...closure].sort()).toEqual(allowedShared);
  // EAS's fs.cp filter checks directory names without a trailing slash.
  for (const directory of [
    'supabase',
    'supabase/functions',
    'supabase/functions/_shared',
  ]) {
    expect({ directory, excluded: archive.ignores(directory) }).toEqual({
      directory,
      excluded: false,
    });
  }
  for (const file of closure)
    expect({ file, excluded: archive.ignores(file) }).toEqual({
      file,
      excluded: false,
    });

  const includedBackend = filesUnder('supabase').filter(
    (file) => !archive.ignores(file),
  );
  expect(includedBackend.sort()).toEqual(allowedShared);
  for (const file of [
    '.env',
    '.env.production',
    'credentials.json',
    'test-support/fixtures/app/prompt-composer.tsx',
    'docs/SOCIAL_AUTH_RELEASE.md',
  ]) {
    expect({ file, excluded: archive.ignores(file) }).toEqual({
      file,
      excluded: true,
    });
  }
  expect(archive.ignores('app/(battle)/prompt-entry.tsx')).toBe(false);
});
