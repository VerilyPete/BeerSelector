import fs from 'fs';
import path from 'path';

describe('refresh documentation', () => {
  it('shows the ISO timestamp and boolean contract used by shouldRefreshData', () => {
    const guide = fs.readFileSync(path.resolve(__dirname, '../../../CLAUDE.md'), 'utf8');
    const refreshSection = guide.match(
      /### Data Refresh Strategy([\s\S]*?)### Navigation Structure/
    )?.[1];

    expect(refreshSection).toBeDefined();
    expect(refreshSection).toMatch(/ISO timestamp/i);
    expect(refreshSection).toMatch(/shouldRefreshData[\s\S]*returns? a boolean/i);
    expect(refreshSection).not.toContain('Date.now() - parseInt(lastCheck)');
  });
});
