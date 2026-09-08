import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitAndPush } from '../git-commit.js';

test('commitAndPush skips commit when nothing is staged', () => {
  const calls = [];
  const execImpl = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (args[0] === 'status') return '';
    return '';
  };

  const result = commitAndPush('chore: test', { execImpl, cwd: '/repo' });

  assert.equal(result.committed, false);
  assert.deepEqual(calls, ['git add data/', 'git status --porcelain -- data/']);
});

test('commitAndPush commits and pushes when there are staged changes', () => {
  const calls = [];
  const execImpl = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (args[0] === 'status') return ' M data/facilities/JP.json\n';
    return '';
  };

  const result = commitAndPush('chore: test', { execImpl, cwd: '/repo' });

  assert.equal(result.committed, true);
  assert.deepEqual(calls, [
    'git add data/',
    'git status --porcelain -- data/',
    'git commit -m chore: test',
    'git push',
  ]);
});
