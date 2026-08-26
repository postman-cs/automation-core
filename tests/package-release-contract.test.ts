import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json')) as { name: string };
const packageLock = JSON.parse(read('package-lock.json')) as {
  name: string;
  packages: Record<string, { name?: string }>;
};

describe('package and release identity', () => {
  it('uses the @postman-cs package name across package-owned contracts', () => {
    expect(packageJson.name).toBe('@postman-cs/automation-core');
    expect(packageLock.name).toBe('@postman-cs/automation-core');
    expect(packageLock.packages['']?.name).toBe('@postman-cs/automation-core');

    for (const file of [
      'README.md',
      'AGENTS.md',
      'RELEASE_POLICY.md',
      'scripts/verify-package-exports.mjs',
      '.github/workflows/release.yml'
    ]) {
      const source = read(file);
      expect(source, file).toContain('@postman-cs/automation-core');
      expect(source, file).not.toContain('@postman/automation-core');
      expect(source, file).not.toContain('@postman-cse/automation-core');
    }
  });

  it('publishes only through OIDC and has no token backfill path', () => {
    const release = read('.github/workflows/release.yml');
    expect(release).toContain('id-token: write');
    expect(release).toContain("sed -i '/_authToken/d'");
    expect(release).toContain('npm publish ./release-artifacts/release.tgz --provenance --access public');
    expect(release).not.toContain('NPM_TOKEN');
    expect(release).not.toContain('NODE_AUTH_TOKEN');
    expect(release).not.toContain('backfill-npm');
    expect(existsSync(path.join(root, '.github/workflows/backfill-npm.yml'))).toBe(false);
  });
});
