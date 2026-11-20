import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareSemver,
  formatCallElapsed,
  isNewerVersion,
  normalizeGitHubRepoSlug,
  shouldInitiateOffer,
} from './callLogic.ts';

test('shouldInitiateOffer is deterministic and asymmetric to avoid glare', () => {
  assert.equal(shouldInitiateOffer('user-a', 'user-b'), true);
  assert.equal(shouldInitiateOffer('user-b', 'user-a'), false);
  assert.notEqual(
    shouldInitiateOffer('u-100', 'u-200'),
    shouldInitiateOffer('u-200', 'u-100'),
  );
});

test('normalizeGitHubRepoSlug handles owner/repo, HTTPS URL, and SSH URL', () => {
  assert.equal(normalizeGitHubRepoSlug('ivan/tiligram'), 'ivan/tiligram');
  assert.equal(
    normalizeGitHubRepoSlug('https://github.com/ivan/tiligram.git'),
    'ivan/tiligram',
  );
  assert.equal(
    normalizeGitHubRepoSlug('https://github.com/ivan/tiligram/releases'),
    'ivan/tiligram',
  );
  assert.equal(
    normalizeGitHubRepoSlug('git@github.com:ivan/tiligram.git'),
    'ivan/tiligram',
  );
  assert.equal(normalizeGitHubRepoSlug('not-a-repo'), null);
  assert.equal(normalizeGitHubRepoSlug('evil/repo?query=1'), null);
});

test('compareSemver and isNewerVersion compare release tags accurately', () => {
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('v1.2.0', '1.1.9'), 1);
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('0.9.9', '1.0.0'), -1);
  assert.equal(isNewerVersion('v2.0.0', '1.0.0'), true);
  assert.equal(isNewerVersion('1.0.0', '1.0.0'), false);
});

test('formatCallElapsed formats mm:ss and hh:mm:ss cleanly', () => {
  assert.equal(formatCallElapsed(0), '00:00');
  assert.equal(formatCallElapsed(65), '01:05');
  assert.equal(formatCallElapsed(3661), '1:01:01');
});
