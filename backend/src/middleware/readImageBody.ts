import express, { type NextFunction, type Request, type Response } from 'express';
import { maxImageBytes } from '../services/image.service';

const rawImage = express.raw({ type: () => true, limit: maxImageBytes });

/** Reads an uploaded image's raw bytes, turning an oversized body into a clear IMAGE_TOO_LARGE answer. */
export function readImageBody(request: Request, response: Response, next: NextFunction) {
  rawImage(request, response, (error?: unknown) => {
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
      return response.status(413).json({ error: { code: 'IMAGE_TOO_LARGE', message: 'Images can be at most 2 MB.' } });
    }
    next(error);
  });
}
