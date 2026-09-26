import { Logger, Provider } from '@nestjs/common';
import { initializeApp, cert, getApps, getApp, App } from 'firebase-admin/app';
import * as fs from 'fs';
import * as path from 'path';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

export const FirebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN,
  useFactory: (): App | null => {
    const logger = new Logger('FirebaseAdmin');

    if (getApps().length > 0) {
      return getApp();
    }

    const possiblePaths = [
      path.resolve(process.cwd(), 'src/config/firebase-service-account.json'),
      path.resolve(process.cwd(), 'dist/config/firebase-service-account.json'),
      path.resolve(__dirname, '../config/firebase-service-account.json'),
      path.resolve(__dirname, '../../config/firebase-service-account.json'),
    ];

    const credentialPath = possiblePaths.find((p) => fs.existsSync(p));

    if (!credentialPath && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        logger.log(
          'Initializing Firebase Admin SDK from FIREBASE_SERVICE_ACCOUNT env var',
        );
        return initializeApp({
          credential: cert(serviceAccount),
        });
      } catch (err) {
        logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var', err);
      }
    }

    if (!credentialPath) {
      logger.warn(
        'firebase-service-account.json not found in search paths. FCM push notifications will be disabled.',
      );
      return null;
    }

    try {
      const serviceAccount = JSON.parse(
        fs.readFileSync(credentialPath, 'utf8'),
      );
      logger.log(
        `Initializing Firebase Admin SDK using credential file: ${credentialPath}`,
      );
      return initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin SDK', error);
      return null;
    }
  },
};
