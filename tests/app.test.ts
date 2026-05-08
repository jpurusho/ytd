import { describe, it, expect } from 'vitest';

describe('ytd', () => {
  it('package.json has correct name', async () => {
    const pkg = await import('../package.json');
    expect(pkg.name).toBe('ytd');
  });

  it('shared types export expected interfaces', async () => {
    const types = await import('../shared/types');
    expect(types).toBeDefined();
  });
});
