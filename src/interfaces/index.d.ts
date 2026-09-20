import express, { Application } from 'express';
import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
      userSubscription?: {
        plan: string;
        verified: boolean;
      };
    }

    namespace Multer {
      // Set by the streaming object-storage engine in helpers/fileUploader.
      // `path`/`buffer` stay undefined for these uploads because the bytes go
      // straight from the socket to Spaces.
      interface File {
        bucket?: string;
        key?: string;
        location?: string;
        headerBuffer?: Buffer;
        // Set once a database row references these bytes, so failure-path
        // cleanup stops treating the object as an orphan.
        claimed?: boolean;
      }
    }
  }
}