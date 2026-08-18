import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http';
import { Publisher, type RepositoryGateway } from '../src/publisher';

const HEAD = '1111111111111111111111111111111111111111';
const TREE = '2222222222222222222222222222222222222222';
const PARENT = '3333333333333333333333333333333333333333';
const PARENT_TREE = '4444444444444444444444444444444444444444';
const CREATED = '5555555555555555555555555555555555555555';

function memberSource(status = 'current', time = '(Fall 2025 - Present) ') {
  return `const members = [\n    {\n        id: "test-member",\n        type: "member",\n        status: "${status}",\n        year: 2025,\n        name: "Test Member",\n        image: "../groups/Test Member.png",\n        alt: "Test Member",\n        profileUrl: "",\n        time: "${time}",\n        institution: "Institute",\n        research: "Robotics",\n        email: "test@example.com",\n        links: []\n    },\n];\n`;
}

function repository(overrides: Partial<RepositoryGateway> = {}) {
  const calls: Array<{ name: string; value: unknown }> = [];
  const gateway: RepositoryGateway = {
    async getHead() {
      calls.push({ name: 'getHead', value: null });
      return { sha: HEAD, treeSha: TREE, parents: [PARENT], message: 'baseline' };
    },
    async getCommit(sha) {
      calls.push({ name: 'getCommit', value: sha });
      return { sha: PARENT, treeSha: PARENT_TREE, parents: [], message: 'baseline' };
    },
    async readTextFile(path) {
      calls.push({ name: 'readTextFile', value: path });
      if (path === 'papers-data.js') return 'const papers = [\n];\n';
      return memberSource();
    },
    async listTreePaths() {
      return new Set(['data/members.js', 'papers-data.js']);
    },
    async commitChanges(input) {
      calls.push({ name: 'commitChanges', value: input });
      return { sha: CREATED };
    },
    async commitTree(input) {
      calls.push({ name: 'commitTree', value: input });
      return { sha: CREATED };
    },
    ...overrides
  };
  return { gateway, calls };
}

describe('Publisher', () => {
  it('rejects a stale preview before any repository write', async () => {
    const { gateway, calls } = repository();
    const publisher = new Publisher(gateway);
    await expect(publisher.publish({
      baseCommitSha: PARENT,
      kind: 'member-status',
      update: { id: 'test-member', status: 'current', time: '(Fall 2025 - Present) ' }
    })).rejects.toEqual(new HttpError(409,
      'The website changed while you were preparing this update.\nPlease refresh and preview again.'));
    expect(calls.some((call) => call.name === 'commitChanges')).toBe(false);
  });

  it('publishes a valid member status update as one non-force repository commit', async () => {
    const { gateway, calls } = repository({
      async readTextFile() { return memberSource('current', '(Fall 2025 - Present) '); }
    });
    const publisher = new Publisher(gateway);
    await expect(publisher.publish({
      baseCommitSha: HEAD,
      kind: 'member-status',
      update: { id: 'test-member', status: 'former', time: '(Fall 2025 - Aug 2026) ' }
    })).resolves.toEqual({ commitSha: CREATED });
    const commit = calls.find((call) => call.name === 'commitChanges')?.value as {
      message: string;
      changes: Array<{ path: string; content: string }>;
    };
    expect(commit.message).toBe('admin: mark member "Test Member" as former\n\nFlying-Intelligence-Admin: v1');
    expect(commit.changes).toHaveLength(1);
    expect(commit.changes[0].path).toBe('data/members.js');
    expect(commit.changes[0].content).toContain('status: "former"');
    expect(commit.changes[0].content).toContain('time: "(Fall 2025 - Aug 2026) "');
  });

  it('rejects Former Members status while time still contains present', async () => {
    const { gateway } = repository();
    const publisher = new Publisher(gateway);
    await expect(publisher.publish({
      baseCommitSha: HEAD,
      kind: 'member-status',
      update: { id: 'test-member', status: 'former', time: '(Fall 2025 - Present) ' }
    })).rejects.toThrow('Remove “present” from the time text before moving this member to Former Members.');
  });

  it('publishes a new publication data record and image in one commit', async () => {
    const { gateway, calls } = repository();
    const publisher = new Publisher(gateway);
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await publisher.publish({
      baseCommitSha: HEAD,
      kind: 'publication',
      draft: {
        title: 'New Publication',
        authors: 'Researcher',
        date: 'Aug. 2026',
        venue: 'Venue',
        url: 'https://example.org/publication',
        tags: ['Low-altitude Perception'],
        coverPosition: '50% 50%',
        mediaFitMode: 'contain',
        video: ''
      },
      image: { name: 'publication.png', type: 'image/png', size: imageBytes.length, base64: btoa(String.fromCharCode(...imageBytes)) }
    });
    const commit = calls.find((call) => call.name === 'commitChanges')?.value as {
      message: string;
      changes: Array<{ path: string }>;
    };
    expect(commit.message).toContain('admin: add publication "New Publication"');
    expect(commit.changes.map((change) => change.path)).toEqual([
      'papers-data.js',
      'files/images/new-publication.png'
    ]);
  });

  it('publishes a new current member data record and image in one commit', async () => {
    const { gateway, calls } = repository();
    const publisher = new Publisher(gateway);
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await publisher.publish({
      baseCommitSha: HEAD,
      kind: 'member',
      draft: {
        type: 'member',
        year: 2026,
        name: 'New Member',
        time: '(Aug. 2026 - Present)',
        institution: 'Institute',
        research: 'Robotics',
        email: 'member@example.org',
        profileUrl: '',
        scholarUrl: ''
      },
      image: { name: 'member.png', type: 'image/png', size: imageBytes.length, base64: btoa(String.fromCharCode(...imageBytes)) }
    });
    const commit = calls.find((call) => call.name === 'commitChanges')?.value as {
      changes: Array<{ path: string; content: string | Uint8Array }>;
    };
    expect(commit.changes.map((change) => change.path)).toEqual(['data/members.js', 'groups/new-member.png']);
    expect(String(commit.changes[0].content)).toContain('status: "current"');
    expect(String(commit.changes[0].content)).toContain('image: "../groups/new-member.png"');
  });

  it('reports rollback only for the current marked Admin publish', async () => {
    const { gateway } = repository({
      async getHead() {
        return {
          sha: HEAD,
          treeSha: TREE,
          parents: [PARENT],
          message: 'admin: add member "Example"\n\nFlying-Intelligence-Admin: v1'
        };
      }
    });
    const publisher = new Publisher(gateway);
    await expect(publisher.state()).resolves.toMatchObject({
      mainSha: HEAD,
      rollback: { available: true, commitSha: HEAD }
    });
  });

  it('rolls back by creating a child commit with the publish parent tree', async () => {
    const { gateway, calls } = repository({
      async getHead() {
        return {
          sha: HEAD,
          treeSha: TREE,
          parents: [PARENT],
          message: 'admin: add publication "Example"\n\nFlying-Intelligence-Admin: v1'
        };
      }
    });
    const publisher = new Publisher(gateway);
    await expect(publisher.rollback({ baseCommitSha: HEAD })).resolves.toEqual({ commitSha: CREATED });
    expect(calls.find((call) => call.name === 'commitTree')?.value).toEqual({
      baseCommitSha: HEAD,
      treeSha: PARENT_TREE,
      message: `admin: rollback ${HEAD.slice(0, 7)}`
    });
  });

  it('rejects rollback after main moves or when HEAD is not an Admin publish', async () => {
    const { gateway } = repository();
    const publisher = new Publisher(gateway);
    await expect(publisher.rollback({ baseCommitSha: PARENT })).rejects.toEqual(new HttpError(409,
      'The website has changed since this update was published.\nAutomatic rollback is unavailable.'));
    await expect(publisher.rollback({ baseCommitSha: HEAD })).rejects.toMatchObject({ status: 409 });
  });
});
