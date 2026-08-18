import * as content from '../../functions/lib/content.js';
import type { GitHubClient } from './github';
import { HttpError } from './http';

const ADMIN_MARKER = 'Flying-Intelligence-Admin: v1';
const STALE_PUBLISH = 'The website changed while you were preparing this update.\nPlease refresh and preview again.';
const STALE_ROLLBACK = 'The website has changed since this update was published.\nAutomatic rollback is unavailable.';

interface CommitState {
  sha: string;
  treeSha: string;
  parents: string[];
  message: string;
}

type Change =
  | { path: string; content: string; encoding: 'utf-8' }
  | { path: string; content: Uint8Array; encoding: 'base64' };

export interface RepositoryGateway {
  getHead(): Promise<CommitState>;
  getCommit(sha: string): Promise<CommitState>;
  readTextFile(path: string, commitSha: string): Promise<string>;
  listTreePaths(treeSha: string): Promise<Set<string>>;
  commitChanges(input: {
    baseCommitSha: string;
    baseTreeSha: string;
    message: string;
    changes: Change[];
  }): Promise<{ sha: string }>;
  commitTree(input: {
    baseCommitSha: string;
    treeSha: string;
    message: string;
  }): Promise<{ sha: string }>;
}

type PublishInput =
  | { baseCommitSha: string; kind: 'publication'; draft: unknown; image: content.ImageInput }
  | { baseCommitSha: string; kind: 'member'; draft: unknown; image: content.ImageInput }
  | { baseCommitSha: string; kind: 'member-status'; update: unknown };

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function isAdminPublish(message: string): boolean {
  return message.startsWith('admin: ') && !message.startsWith('admin: rollback ') &&
    message.split(/\r?\n/).includes(ADMIN_MARKER);
}

function asHttpError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof Error && (error as Error & { code?: string }).code === 'invalid-argument') {
    throw new HttpError(400, error.message);
  }
  throw error;
}

export class Publisher {
  readonly #repository: RepositoryGateway;

  constructor(repository: RepositoryGateway | GitHubClient) {
    this.#repository = repository;
  }

  async state() {
    const head = await this.#repository.getHead();
    const membersSource = await this.#repository.readTextFile('data/members.js', head.sha);
    const members = content.parseMemberRecords(membersSource);
    return {
      mainSha: head.sha,
      members,
      rollback: {
        available: isAdminPublish(head.message) && head.parents.length === 1,
        commitSha: isAdminPublish(head.message) && head.parents.length === 1 ? head.sha : null
      },
      latestPublish: isAdminPublish(head.message) ? {
        commitSha: head.sha,
        message: head.message.split(/\r?\n/, 1)[0]
      } : null,
      target: {
        environment: 'PREVIEW',
        owner: 'ChenYinuo-Enoch',
        repository: 'flying-intelligence-preview',
        branch: 'main'
      }
    };
  }

  async publish(input: PublishInput): Promise<{ commitSha: string }> {
    if (!input || !isSha(input.baseCommitSha)) throw new HttpError(400, 'Invalid publish request.');
    const head = await this.#repository.getHead();
    if (head.sha !== input.baseCommitSha) throw new HttpError(409, STALE_PUBLISH);
    try {
      if (input.kind === 'member-status') return await this.#publishMemberStatus(head, input.update);
      return await this.#publishNewRecord(head, input);
    } catch (error) {
      asHttpError(error);
    }
  }

  async rollback(input: { baseCommitSha: string }): Promise<{ commitSha: string }> {
    if (!input || !isSha(input.baseCommitSha)) throw new HttpError(400, 'Invalid rollback request.');
    const head = await this.#repository.getHead();
    if (head.sha !== input.baseCommitSha || !isAdminPublish(head.message) || head.parents.length !== 1) {
      throw new HttpError(409, STALE_ROLLBACK);
    }
    const parent = await this.#repository.getCommit(head.parents[0]);
    const result = await this.#repository.commitTree({
      baseCommitSha: head.sha,
      treeSha: parent.treeSha,
      message: `admin: rollback ${head.sha.slice(0, 7)}`
    });
    return { commitSha: result.sha };
  }

  async #publishMemberStatus(head: CommitState, input: unknown): Promise<{ commitSha: string }> {
    const update = content.validateMemberStatusUpdate(input);
    const source = await this.#repository.readTextFile('data/members.js', head.sha);
    const member = content.parseMemberRecords(source).find((record) => record.id === update.id);
    if (!member) throw new HttpError(400, 'Member record was not found.');
    const nextSource = content.updateMemberRecordSource(source, update);
    const result = await this.#repository.commitChanges({
      baseCommitSha: head.sha,
      baseTreeSha: head.treeSha,
      message: `admin: mark member ${JSON.stringify(member.name)} as ${update.status}\n\n${ADMIN_MARKER}`,
      changes: [{ path: 'data/members.js', content: nextSource, encoding: 'utf-8' }]
    });
    return { commitSha: result.sha };
  }

  async #publishNewRecord(
    head: CommitState,
    input: Extract<PublishInput, { kind: 'publication' | 'member' }>
  ): Promise<{ commitSha: string }> {
    const image = content.validateImage(input.image);
    const existingPaths = await this.#repository.listTreePaths(head.treeSha);
    if (input.kind === 'publication') {
      const draft = content.validatePublicationDraft(input.draft);
      const source = await this.#repository.readTextFile('papers-data.js', head.sha);
      if (content.checkPublicationDuplicate(content.parsePublicationRecords(source), draft)) {
        throw new HttpError(409, 'This publication already exists.');
      }
      const imagePath = content.uniquePath(existingPaths, 'files/images', content.slugify(draft.title, 'publication'), image.extension);
      const nextSource = content.appendArrayEntry(source, content.publicationEntry({ ...draft, img: imagePath }), 'papers');
      const result = await this.#repository.commitChanges({
        baseCommitSha: head.sha,
        baseTreeSha: head.treeSha,
        message: `admin: add publication ${JSON.stringify(content.shortSubject(draft.title))}\n\n${ADMIN_MARKER}`,
        changes: [
          { path: 'papers-data.js', content: nextSource, encoding: 'utf-8' },
          { path: imagePath, content: new Uint8Array(image.buffer), encoding: 'base64' }
        ]
      });
      return { commitSha: result.sha };
    }

    const draft = content.validateMemberDraft(input.draft);
    const source = await this.#repository.readTextFile('data/members.js', head.sha);
    if (content.checkMemberDuplicate(content.parseMemberRecords(source), draft)) {
      throw new HttpError(409, 'This member already exists.');
    }
    const imagePath = content.uniquePath(existingPaths, 'groups', content.slugify(draft.name, 'member'), image.extension);
    const nextSource = content.appendArrayEntry(source, content.memberEntry({ ...draft, image: `../${imagePath}` }), 'members');
    const result = await this.#repository.commitChanges({
      baseCommitSha: head.sha,
      baseTreeSha: head.treeSha,
      message: `admin: add member ${JSON.stringify(content.shortSubject(draft.name))}\n\n${ADMIN_MARKER}`,
      changes: [
        { path: 'data/members.js', content: nextSource, encoding: 'utf-8' },
        { path: imagePath, content: new Uint8Array(image.buffer), encoding: 'base64' }
      ]
    });
    return { commitSha: result.sha };
  }
}
