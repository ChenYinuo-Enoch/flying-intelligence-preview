import { HttpError } from './http';

export const TARGET = Object.freeze({
  owner: 'ChenYinuo-Enoch',
  repository: 'flying-intelligence-preview',
  branch: 'main'
});

const API_ROOT = `https://api.github.com/repos/${TARGET.owner}/${TARGET.repository}`;

function assertPreviewTarget(): void {
  if (TARGET.owner === 'Flying-Intelligence' || TARGET.owner !== 'ChenYinuo-Enoch' ||
      TARGET.repository !== 'flying-intelligence-preview' || TARGET.branch !== 'main') {
    throw new HttpError(503, 'Preview repository target lock failed.');
  }
}

interface GitCommitState {
  sha: string;
  treeSha: string;
  parents: string[];
  message: string;
}

type Change =
  | { path: string; content: string; encoding: 'utf-8' }
  | { path: string; content: Uint8Array; encoding: 'base64' };

interface CommitChangesInput {
  baseCommitSha: string;
  baseTreeSha: string;
  message: string;
  changes: Change[];
}

interface CommitTreeInput {
  baseCommitSha: string;
  treeSha: string;
  message: string;
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validRepositoryPath(path: string): boolean {
  return Boolean(path) && path.length <= 300 && !path.startsWith('/') &&
    !path.split('/').includes('..') && /^[A-Za-z0-9 _.()+@/-]+$/.test(path);
}

export class GitHubClient {
  readonly #token: string;
  readonly #fetcher: typeof fetch;

  constructor(token: string, fetcher: typeof fetch = fetch) {
    assertPreviewTarget();
    if (!token) throw new HttpError(503, 'GitHub service is not configured.');
    this.#token = token;
    this.#fetcher = fetcher;
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${this.#token}`);
    headers.set('X-GitHub-Api-Version', '2026-03-10');
    if (init.body) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await this.#fetcher(`${API_ROOT}${path}`, { ...init, headers });
    } catch {
      throw new HttpError(502, 'GitHub request failed.');
    }
    if (!response.ok) throw new HttpError(502, `GitHub request failed (${response.status}).`);
    try {
      return await response.json();
    } catch {
      throw new HttpError(502, 'GitHub returned an invalid response.');
    }
  }

  async getCommit(sha: string): Promise<GitCommitState> {
    if (!isSha(sha)) throw new HttpError(502, 'GitHub returned an invalid commit.');
    const value = await this.#request(`/git/commits/${sha}`);
    if (!value || typeof value !== 'object') throw new HttpError(502, 'GitHub returned an invalid commit.');
    const record = value as Record<string, unknown>;
    const tree = record.tree as Record<string, unknown> | undefined;
    const parents = Array.isArray(record.parents) ? record.parents : [];
    if (!isSha(record.sha) || !tree || !isSha(tree.sha) || typeof record.message !== 'string' ||
        parents.some((parent) => !parent || typeof parent !== 'object' || !isSha((parent as Record<string, unknown>).sha))) {
      throw new HttpError(502, 'GitHub returned an invalid commit.');
    }
    return {
      sha: record.sha,
      treeSha: tree.sha,
      parents: parents.map((parent) => (parent as { sha: string }).sha),
      message: record.message
    };
  }

  async getHead(): Promise<GitCommitState> {
    const value = await this.#request(`/git/ref/heads/${TARGET.branch}`);
    if (!value || typeof value !== 'object') throw new HttpError(502, 'GitHub returned an invalid reference.');
    const object = (value as Record<string, unknown>).object as Record<string, unknown> | undefined;
    if (!object || !isSha(object.sha)) throw new HttpError(502, 'GitHub returned an invalid reference.');
    return this.getCommit(object.sha);
  }

  async readTextFile(path: string, commitSha: string): Promise<string> {
    if (!validRepositoryPath(path) || !isSha(commitSha)) throw new HttpError(500, 'Invalid repository read.');
    const value = await this.#request(`/contents/${encodeURIComponent(path)}?ref=${commitSha}`);
    if (!value || typeof value !== 'object') throw new HttpError(502, 'GitHub returned an invalid file.');
    const record = value as Record<string, unknown>;
    if (record.type !== 'file' || record.encoding !== 'base64' || typeof record.content !== 'string' ||
        typeof record.size !== 'number' || record.size < 0 || record.size > 1_000_000) {
      throw new HttpError(502, 'GitHub returned an invalid file.');
    }
    try {
      const binary = atob(record.content.replace(/\s/g, ''));
      if (binary.length !== record.size) throw new Error('size-mismatch');
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new HttpError(502, 'GitHub returned an invalid file.');
    }
  }

  async listTreePaths(treeSha: string): Promise<Set<string>> {
    if (!isSha(treeSha)) throw new HttpError(500, 'Invalid repository read.');
    const value = await this.#request(`/git/trees/${treeSha}?recursive=1`);
    if (!value || typeof value !== 'object') throw new HttpError(502, 'GitHub returned an invalid tree.');
    const record = value as Record<string, unknown>;
    if (record.truncated !== false || !Array.isArray(record.tree) || record.tree.length > 5_000) {
      throw new HttpError(502, 'GitHub returned an invalid tree.');
    }
    const paths = new Set<string>();
    for (const entry of record.tree) {
      if (!entry || typeof entry !== 'object') throw new HttpError(502, 'GitHub returned an invalid tree.');
      const path = (entry as Record<string, unknown>).path;
      if (typeof path !== 'string' || !validRepositoryPath(path)) throw new HttpError(502, 'GitHub returned an invalid tree.');
      paths.add(path);
    }
    return paths;
  }

  async commitChanges(input: CommitChangesInput): Promise<{ sha: string }> {
    if (!isSha(input.baseCommitSha) || !isSha(input.baseTreeSha) ||
        typeof input.message !== 'string' || !input.message || input.message.length > 2_000 ||
        !Array.isArray(input.changes) || !input.changes.length || input.changes.length > 10) {
      throw new HttpError(500, 'Invalid repository update.');
    }
    const seen = new Set<string>();
    for (const change of input.changes) {
      if (!validRepositoryPath(change.path) || seen.has(change.path)) {
        throw new HttpError(500, 'Invalid repository update.');
      }
      seen.add(change.path);
    }

    const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
    for (const change of input.changes) {
      const blobValue = await this.#request('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({
          content: change.encoding === 'base64' ? toBase64(change.content) : change.content,
          encoding: change.encoding
        })
      });
      const blobSha = blobValue && typeof blobValue === 'object' ? (blobValue as Record<string, unknown>).sha : null;
      if (typeof blobSha !== 'string' || !blobSha) throw new HttpError(502, 'GitHub returned an invalid blob.');
      treeEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: blobSha });
    }

    const treeValue = await this.#request('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: input.baseTreeSha, tree: treeEntries })
    });
    const newTreeSha = treeValue && typeof treeValue === 'object' ? (treeValue as Record<string, unknown>).sha : null;
    if (typeof newTreeSha !== 'string' || !newTreeSha) throw new HttpError(502, 'GitHub returned an invalid tree.');

    const commitValue = await this.#request('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: input.message, tree: newTreeSha, parents: [input.baseCommitSha] })
    });
    const commitSha = commitValue && typeof commitValue === 'object' ? (commitValue as Record<string, unknown>).sha : null;
    if (!isSha(commitSha)) throw new HttpError(502, 'GitHub returned an invalid commit.');

    await this.#request(`/git/refs/heads/${TARGET.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitSha, force: false })
    });
    return { sha: commitSha };
  }

  async commitTree(input: CommitTreeInput): Promise<{ sha: string }> {
    if (!isSha(input.baseCommitSha) || !isSha(input.treeSha) ||
        typeof input.message !== 'string' || !input.message || input.message.length > 2_000) {
      throw new HttpError(500, 'Invalid repository update.');
    }
    const commitValue = await this.#request('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: input.message, tree: input.treeSha, parents: [input.baseCommitSha] })
    });
    const commitSha = commitValue && typeof commitValue === 'object' ? (commitValue as Record<string, unknown>).sha : null;
    if (!isSha(commitSha)) throw new HttpError(502, 'GitHub returned an invalid commit.');
    await this.#request(`/git/refs/heads/${TARGET.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitSha, force: false })
    });
    return { sha: commitSha };
  }
}
