import { execFileSync } from 'node:child_process';

export function commitAndPush(message, options = {}) {
  const { execImpl = execFileSync, cwd = process.cwd() } = options;

  execImpl('git', ['add', 'data/'], { cwd });

  const status = execImpl('git', ['status', '--porcelain', '--', 'data/'], { cwd }).toString();
  if (!status.trim()) {
    return { committed: false };
  }

  execImpl('git', ['commit', '-m', message], { cwd });
  execImpl('git', ['push'], { cwd });
  return { committed: true };
}
