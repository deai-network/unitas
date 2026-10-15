import { describe, it, expect } from 'vitest';
import * as vultusAntd from '../index.js';

describe('vultus-antd exports', () => {
  it('the request-hook family is public: useFieldRequest and sameMembers beside the kind-specific hooks', () => {
    expect(typeof vultusAntd.useFieldRequest).toBe('function');
    expect(typeof vultusAntd.useManyOfRequest).toBe('function');
    expect(typeof vultusAntd.useNumericRequest).toBe('function');
    expect(typeof vultusAntd.useManyOfTreeRequest).toBe('function');
    expect(vultusAntd.sameMembers(['a', 'b', 'a'], ['b', 'a'])).toBe(true);
    expect(vultusAntd.sameMembers(['a'], ['a', 'b'])).toBe(false);
  });
});
