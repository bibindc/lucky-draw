import type { Request, Response } from 'express';
import { z } from 'zod';
import { ImageError } from '../services/image.service';

function readId(request: Request, response: Response) {
  const parsed = z.uuid().safeParse(request.params.id);
  if (parsed.success) return parsed.data;
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid id is required.' } });
  return null;
}

function reportError(error: unknown, response: Response) {
  if (error instanceof ImageError) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
  throw error;
}

type ImageHandlers = {
  save: (id: string, data: Buffer) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  load: (id: string) => Promise<{ mimeType: string; data: Uint8Array; size: number } | null>;
  resultKey: string;
};

/** Upload/remove/serve handlers for any entity with one image (prizes, complimentary options). */
export function imageHandlers({ save, remove, load, resultKey }: ImageHandlers) {
  return {
    upload: async (request: Request, response: Response) => {
      const id = readId(request, response);
      if (!id) return;
      try {
        const result = await save(id, Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0));
        return response.json({ [resultKey]: result });
      } catch (error) {
        return reportError(error, response);
      }
    },
    remove: async (request: Request, response: Response) => {
      const id = readId(request, response);
      if (!id) return;
      try {
        const result = await remove(id);
        return response.json({ [resultKey]: result });
      } catch (error) {
        return reportError(error, response);
      }
    },
    serve: async (request: Request, response: Response) => {
      const id = readId(request, response);
      if (!id) return;
      const image = await load(id);
      if (!image) return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'There is no image.' } });
      // URLs carry ?v=<imageUpdatedAt>, so a cached copy is never stale; private because images need a session.
      response.set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.size), 'Cache-Control': 'private, max-age=86400' });
      return response.send(Buffer.from(image.data));
    },
  };
}
