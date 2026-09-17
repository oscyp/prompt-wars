const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const configSource = fs.readFileSync(
  path.join(__dirname, '../app.config.js'),
  'utf8',
);
function config(env) {
  const sandbox = {
    process: { env },
    module: { exports: {} },
    require: () => ({ config() {} }),
  };
  vm.runInNewContext(configSource, sandbox);
  return sandbox.module.exports({ config: {} });
}
for (const env of [
  {},
  { NODE_ENV: 'development' },
  { NODE_ENV: 'production' },
  { EAS_BUILD: 'true' },
]) {
  assert.equal(
    config(env).extra.router.root,
    undefined,
    'Default app router must be unchanged',
  );
}
assert.equal(
  config({ NODE_ENV: 'development', PROMPT_WARS_NATIVE_FIXTURES: '1' }).extra
    .router.root,
  './test-support/fixtures/app',
);
for (const env of [
  {},
  { NODE_ENV: 'production' },
  { NODE_ENV: 'test' },
  { NODE_ENV: 'development', EAS_BUILD: 'true' },
]) {
  assert.throws(
    () => config({ ...env, PROMPT_WARS_NATIVE_FIXTURES: '1' }),
    /local development only/,
  );
}
const launcher = fs.readFileSync(
  path.join(__dirname, 'visual-fixtures.sh'),
  'utf8',
);
assert.match(
  launcher,
  /^export EXPO_NO_TYPESCRIPT_SETUP=1$/m,
  'The fixture Metro must not replace the real app route declarations',
);
const root = path.join(__dirname, '../test-support/fixtures');
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.tsx?$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(
        source,
        /\b(?:fetch|invokeAuthenticatedFunction|invokeFunctionResult|purchaseCosmetic|equipCosmetic|useCosmeticShop|useAuth)\s*\(/,
        file,
      );
      assert.doesNotMatch(
        source,
        /<(?:AuthProvider|RevenueCatProvider|BattleAudioProvider)\b/,
        file,
      );
      assert.doesNotMatch(source, /https?:\/\//, file);
    }
  }
}
inspect(root);
console.log(
  'Native fixture config isolation and direct-call checks passed. Transitive shared imports are not an egress audit.',
);
