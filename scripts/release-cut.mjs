#!/usr/bin/env node
/** Automatic immutable release cutter for the plain TypeScript library. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const PACKAGE_LOCK = path.join(ROOT, 'package-lock.json');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG = /^v(\d+)\.(\d+)(?:\.(\d+))?$/;
const NON_SHIPPING_TYPES = new Set(['chore', 'ci', 'build', 'test', 'style']);

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', options.quiet ? 'ignore' : 'pipe'] }).trim();
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
}

export function parseConventionalBump(messages) {
  let bump = null;
  const rank = { patch: 1, minor: 2, major: 3 };
  const raise = (next) => { if (!bump || rank[next] > rank[bump]) bump = next; };
  for (const message of messages.filter((entry) => typeof entry === 'string' && entry.trim())) {
    const subject = message.split('\n', 1)[0];
    const header = /^([a-zA-Z]+)(\([^)]*\))?(!)?:/.exec(subject);
    const type = header?.[1]?.toLowerCase() ?? '';
    if ((header && header[3]) || /^BREAKING[ -]CHANGE:/m.test(message)) raise('major');
    else if (type === 'feat') raise('minor');
    else if (!header || !NON_SHIPPING_TYPES.has(type)) raise('patch');
  }
  return bump;
}

export function applyBump(version, bump) {
  const parsed = SEMVER.exec(version);
  if (!parsed) throw new Error(`current version ${version} is not plain semver`);
  const [major, minor, patch] = parsed.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function normalizeReleaseVersion(tag) {
  const parsed = TAG.exec(String(tag));
  return parsed ? `${Number(parsed[1])}.${Number(parsed[2])}.${Number(parsed[3] ?? 0)}` : null;
}

function compareVersions(left, right) {
  return left.split('.').map(Number).reduce((result, value, index) => result || value - Number(right.split('.')[index]), 0);
}

function allTags() {
  const local = git(['tag', '--list', 'v*']).split('\n').filter(Boolean);
  let remote;
  try {
    remote = git(['ls-remote', '--tags', 'origin']).split('\n').map((line) => (line.split('\t')[1] ?? '').replace('refs/tags/', '').replace(/\^\{\}$/, '')).filter((tag) => tag.startsWith('v'));
  } catch {
    throw new Error('could not list remote tags; refusing to cut release blind to burnt versions');
  }
  return new Set([...local, ...remote]);
}

export function latestReleaseTag(tags) {
  return [...tags].map((tag) => ({ tag, version: normalizeReleaseVersion(tag) })).filter((entry) => entry.version).sort((a, b) => compareVersions(a.version, b.version)).at(-1)?.tag ?? null;
}

export function selectNextVersion({ current, bump, takenTags }) {
  const taken = new Set([...takenTags].map(normalizeReleaseVersion).filter(Boolean));
  let version = applyBump(current, bump);
  const skipped = [];
  while (taken.has(version)) {
    skipped.push(version);
    version = applyBump(version, 'patch');
  }
  return { version, skipped };
}

function commitsSince(tag, version) {
  let range = tag ? `${tag}..HEAD` : 'HEAD';
  if (!tag) {
    const versionCommit = git(['log', '-G', `"version": "${version}"`, '-1', '--format=%H', '--', 'package.json']);
    if (versionCommit) range = `${versionCommit}..HEAD`;
  }
  return git(['log', range, '--no-merges', '--format=%B%x00']).split('\0').map((entry) => entry.trim()).filter(Boolean);
}

export function planRelease() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const taken = allTags();
  const previous = latestReleaseTag(taken);
  const taggedVersion = previous ? normalizeReleaseVersion(previous) : null;
  // Historical tags remain burnt, while a manually advanced manifest is never
  // rewound by an older tag (the current 1.7.0 lineage predates v0.3.0).
  const current = taggedVersion && compareVersions(taggedVersion, pkg.version) > 0 ? taggedVersion : pkg.version;
  const activeTag = taggedVersion && compareVersions(taggedVersion, pkg.version) >= 0 ? previous : null;
  const bump = parseConventionalBump(commitsSince(activeTag, pkg.version));
  if (!bump) return { release: false, reason: 'no shippable commits since the release baseline', previous };
  const { version, skipped } = selectNextVersion({ current, bump, takenTags: taken });
  return { release: true, previous, bump, version, skipped };
}

function writeVersion(version) {
  for (const file of [PACKAGE_JSON, PACKAGE_LOCK]) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.version = version;
    if (json.packages?.['']) json.packages[''].version = version;
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  }
}

function executeRelease(plan) {
  if (git(['status', '--porcelain'])) throw new Error('refusing to cut a release from a dirty tree');
  writeVersion(plan.version);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'verify:package']);
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'lint']);
  run('npm', ['test']);
  run('git', ['add', 'package.json', 'package-lock.json']);
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (staged.some((file) => !['package.json', 'package-lock.json'].includes(file))) throw new Error('release commit touched non-release paths');
  run('git', ['commit', '-m', `chore(release): v${plan.version}`]);
  const releaseCommit = git(['rev-parse', 'HEAD']);
  if (JSON.parse(git(['show', `${releaseCommit}:package.json`])).version !== plan.version) throw new Error('release commit version does not match plan');
  run('git', ['tag', '-a', `v${plan.version}`, '-m', `v${plan.version}`, releaseCommit]);
  return { version: plan.version, releaseCommit };
}

function main() {
  const mode = process.argv[2] ?? '--plan';
  if (!['--plan', '--execute'].includes(mode)) throw new Error('Usage: node scripts/release-cut.mjs --plan|--execute');
  const plan = planRelease();
  const result = plan.release && mode === '--execute' ? executeRelease(plan) : {};
  process.stdout.write(`${JSON.stringify({ ...plan, ...result, mode }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
