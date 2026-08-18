/// <reference types="node" />

export interface PublicationDraft {
  title: string;
  authors: string;
  date: string;
  venue: string;
  url: string;
  tags: string[];
  coverPosition: string;
  mediaFitMode: 'contain' | 'cover';
  video: string;
  img?: string;
}

export interface MemberDraft {
  id: string;
  type: 'member' | 'advisor';
  year: number | null;
  name: string;
  time: string;
  institution: string;
  research: string;
  email: string;
  profileUrl: string;
  scholarUrl: string;
  image?: string;
}

export interface ImageInput {
  name: string;
  type: string;
  size: number;
  base64: string;
}

export interface ValidatedImage {
  name: string;
  type: string;
  extension: string;
  buffer: Buffer;
}

export interface MemberRecord {
  id: string;
  name: string;
  status: 'current' | 'former';
  time: string;
}

export function appendArrayEntry(source: string, entry: string, variableName: string): string;
export function checkMemberDuplicate(records: MemberRecord[], draft: MemberDraft): boolean;
export function checkPublicationDuplicate(records: Array<{ title: string; url: string; date: string }>, draft: PublicationDraft): boolean;
export function memberEntry(draft: MemberDraft & { image: string }): string;
export function parseMemberRecords(source: string): MemberRecord[];
export function parsePublicationRecords(source: string): Array<{ title: string; url: string; date: string }>;
export function publicationEntry(draft: PublicationDraft & { img: string }): string;
export function shortSubject(value: string): string;
export function slugify(value: string, fallback: string): string;
export function uniquePath(existing: Set<string>, directory: string, stem: string, extension: string): string;
export function validateImage(input: ImageInput): ValidatedImage;
export function validateMemberDraft(input: unknown): MemberDraft;
export function validateMemberStatusUpdate(input: unknown): { id: string; status: 'current' | 'former'; time: string };
export function validatePublicationDraft(input: unknown): PublicationDraft;
export function updateMemberRecordSource(source: string, input: unknown): string;
