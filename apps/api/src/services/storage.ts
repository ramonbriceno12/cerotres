import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export type StoredObject = {
  key: string;
  url: string;
  contentType: string;
  size: number;
};

export interface StorageProvider {
  putObject(input: {
    buffer: Buffer;
    contentType: string;
    folder?: string;
    filename?: string;
  }): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root = path.resolve(process.cwd(), 'uploads')) {
    this.root = root;
  }

  async putObject(input: {
    buffer: Buffer;
    contentType: string;
    folder?: string;
    filename?: string;
  }): Promise<StoredObject> {
    const folder = input.folder ?? 'products';
    const ext = extensionFromContentType(input.contentType);
    const filename = input.filename ?? `${randomUUID()}${ext}`;
    const key = `${folder}/${filename}`;
    const absolute = path.join(this.root, key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.buffer);
    return {
      key,
      url: this.getPublicUrl(key),
      contentType: input.contentType,
      size: input.buffer.byteLength,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const absolute = path.join(this.root, key);
    await unlink(absolute).catch(() => undefined);
  }

  getPublicUrl(key: string): string {
    return `${env.publicBaseUrl}/uploads/${key.replace(/\\/g, '/')}`;
  }
}

/** Placeholder for later AWS SES/S3 phase — same interface. */
export class S3StorageProvider implements StorageProvider {
  async putObject(): Promise<StoredObject> {
    throw new Error('S3StorageProvider is not configured yet');
  }
  async deleteObject(): Promise<void> {
    throw new Error('S3StorageProvider is not configured yet');
  }
  getPublicUrl(key: string): string {
    return key;
  }
}

function extensionFromContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

export const storage: StorageProvider =
  env.STORAGE_DRIVER === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
