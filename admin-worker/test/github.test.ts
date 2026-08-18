import { describe, expect, it } from 'vitest';
import { GitHubClient, TARGET } from '../src/github';

const headSha = '1111111111111111111111111111111111111111';
const treeSha = '2222222222222222222222222222222222222222';
const parentSha = '3333333333333333333333333333333333333333';
const newCommitSha = '4444444444444444444444444444444444444444';

describe('fixed GitHub target', () => {
  it('reads only the configured preview main ref and its commit', async () => {
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/git/ref/heads/main')) {
        return Response.json({ ref: 'refs/heads/main', object: { type: 'commit', sha: headSha, url: 'https://api.github.test/commit' } });
      }
      if (url.endsWith(`/git/commits/${headSha}`)) {
        return Response.json({ sha: headSha, tree: { sha: treeSha, url: 'https://api.github.test/tree' }, parents: [{ sha: parentSha, url: 'https://api.github.test/parent' }], message: 'baseline' });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    };
    const client = new GitHubClient('test-token', fetcher);
    await expect(client.getHead()).resolves.toEqual({
      sha: headSha,
      treeSha,
      parents: [parentSha],
      message: 'baseline'
    });
    expect(requested).toEqual([
      'https://api.github.com/repos/ChenYinuo-Enoch/flying-intelligence-preview/git/ref/heads/main',
      `https://api.github.com/repos/ChenYinuo-Enoch/flying-intelligence-preview/git/commits/${headSha}`
    ]);
    expect(TARGET).toEqual({ owner: 'ChenYinuo-Enoch', repository: 'flying-intelligence-preview', branch: 'main' });
  });

  it('creates blobs, one tree, one commit, then fast-forwards main without force', async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    let blobNumber = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      if (url.endsWith('/git/blobs')) {
        blobNumber += 1;
        return Response.json({ sha: `blob-${blobNumber}`, url: 'https://api.github.test/blob' }, { status: 201 });
      }
      if (url.endsWith('/git/trees')) return Response.json({ sha: 'new-tree', url: 'https://api.github.test/tree', tree: [], truncated: false }, { status: 201 });
      if (url.endsWith('/git/commits')) return Response.json({ sha: newCommitSha, tree: { sha: 'new-tree' }, parents: [{ sha: headSha }], message: 'admin: publish member' }, { status: 201 });
      if (url.endsWith('/git/refs/heads/main')) return Response.json({ ref: 'refs/heads/main', object: { type: 'commit', sha: newCommitSha } });
      return Response.json({ message: 'not found' }, { status: 404 });
    };
    const client = new GitHubClient('test-token', fetcher);
    const result = await client.commitChanges({
      baseCommitSha: headSha,
      baseTreeSha: treeSha,
      message: 'admin: publish member\n\nFlying-Intelligence-Admin: v1',
      changes: [
        { path: 'data/members.js', content: 'const members = [];', encoding: 'utf-8' },
        { path: 'groups/member.png', content: new Uint8Array([1, 2, 3]), encoding: 'base64' }
      ]
    });
    expect(result).toEqual({ sha: newCommitSha });
    expect(requests.map((request) => `${request.method} ${request.url.split('/repos/')[1]}`)).toEqual([
      'POST ChenYinuo-Enoch/flying-intelligence-preview/git/blobs',
      'POST ChenYinuo-Enoch/flying-intelligence-preview/git/blobs',
      'POST ChenYinuo-Enoch/flying-intelligence-preview/git/trees',
      'POST ChenYinuo-Enoch/flying-intelligence-preview/git/commits',
      'PATCH ChenYinuo-Enoch/flying-intelligence-preview/git/refs/heads/main'
    ]);
    expect(requests[2].body).toEqual({
      base_tree: treeSha,
      tree: [
        { path: 'data/members.js', mode: '100644', type: 'blob', sha: 'blob-1' },
        { path: 'groups/member.png', mode: '100644', type: 'blob', sha: 'blob-2' }
      ]
    });
    expect(requests[3].body).toEqual({ message: 'admin: publish member\n\nFlying-Intelligence-Admin: v1', tree: 'new-tree', parents: [headSha] });
    expect(requests[4].body).toEqual({ sha: newCommitSha, force: false });
  });

  it('does not expose GitHub response bodies or tokens in errors', async () => {
    const fetcher: typeof fetch = async () => Response.json({ message: 'Bad credentials: test-token' }, { status: 401 });
    const client = new GitHubClient('test-token', fetcher);
    await expect(client.getHead()).rejects.toMatchObject({ status: 502, message: 'GitHub request failed (401).' });
  });

  it('rejects a GitHub ref race without retrying or forcing the update', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, body });
      if (url.endsWith('/git/blobs')) return Response.json({ sha: 'blob-sha' }, { status: 201 });
      if (url.endsWith('/git/trees')) return Response.json({ sha: 'new-tree' }, { status: 201 });
      if (url.endsWith('/git/commits')) return Response.json({ sha: newCommitSha }, { status: 201 });
      if (url.endsWith('/git/refs/heads/main')) return Response.json({ message: 'Reference update failed' }, { status: 422 });
      return Response.json({ message: 'not found' }, { status: 404 });
    };
    const client = new GitHubClient('test-token', fetcher);
    await expect(client.commitChanges({
      baseCommitSha: headSha,
      baseTreeSha: treeSha,
      message: 'admin: publish',
      changes: [{ path: 'data/members.js', content: 'const members = [];', encoding: 'utf-8' }]
    })).rejects.toMatchObject({ status: 502, message: 'GitHub request failed (422).' });
    expect(requests.at(-1)?.body).toEqual({ sha: newCommitSha, force: false });
    expect(requests.filter((request) => request.url.endsWith('/git/refs/heads/main'))).toHaveLength(1);
  });

  it('reads bounded UTF-8 source files and repository tree paths at an exact commit', async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/contents/data%2Fmembers.js?ref=')) {
        const content = btoa('const members = [];\n');
        return Response.json({ type: 'file', encoding: 'base64', content, size: 20, sha: 'file-sha', name: 'members.js', path: 'data/members.js' });
      }
      if (url.includes(`/git/trees/${treeSha}?recursive=1`)) {
        return Response.json({ sha: treeSha, truncated: false, tree: [
          { path: 'data/members.js', mode: '100644', type: 'blob', sha: 'file-sha', size: 20, url: 'https://api.github.test/blob' },
          { path: 'groups/member.png', mode: '100644', type: 'blob', sha: 'image-sha', size: 3, url: 'https://api.github.test/blob' }
        ] });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    };
    const client = new GitHubClient('test-token', fetcher);
    await expect(client.readTextFile('data/members.js', headSha)).resolves.toBe('const members = [];\n');
    await expect(client.listTreePaths(treeSha)).resolves.toEqual(new Set(['data/members.js', 'groups/member.png']));
  });
});
