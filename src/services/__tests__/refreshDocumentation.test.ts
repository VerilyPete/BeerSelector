import fs from 'fs';
import path from 'path';

describe('refresh documentation', () => {
  it('shows the ISO timestamp and boolean contract used by shouldRefreshData', () => {
    const guide = fs.readFileSync(path.resolve(__dirname, '../../../CLAUDE.md'), 'utf8');

    expect(guide).not.toContain('Date.now() - parseInt(lastCheck)');
    expect(guide).toContain('const lastCheckDate = new Date(lastCheck);');
    expect(guide).toContain('return hoursSinceLastCheck >= intervalHours;');
  });

  it('documents both abort timers that can produce TransportAbortedError', () => {
    const outcomeSource = fs.readFileSync(
      path.resolve(__dirname, '../../api/fetchOutcome.ts'),
      'utf8'
    );

    expect(outcomeSource).toContain('remaining budget or the per-attempt timeout fires');
  });
});
