import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { decodeAiMasterKey, envs } from 'src/config/envs';

const VAULT_VERSION = 'v1';
const HKDF_INFO = Buffer.from('tu-lojita-store-gemini-key-v1', 'utf8');
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

@Injectable()
export class AiKeyVaultService {
  private readonly masterKey: Buffer;

  constructor(@Optional() masterKeyOverride?: string) {
    const rawKey = masterKeyOverride ?? envs.aiEncryptionMasterKey;
    const decoded = decodeAiMasterKey(rawKey);
    if (!decoded) {
      throw new InternalServerErrorException(
        'Configuración criptográfica del servidor inválida para la bóveda de IA.',
      );
    }
    this.masterKey = decoded;
  }

  private deriveStoreKey(storeId: string): Buffer {
    const normalizedStoreId = storeId?.trim();
    if (!normalizedStoreId) {
      throw new BadRequestException('Identificador de tienda inválido.');
    }

    const derived = crypto.hkdfSync(
      'sha256',
      this.masterKey,
      Buffer.from(normalizedStoreId, 'utf8'),
      HKDF_INFO,
      32,
    );
    return Buffer.from(derived);
  }

  encryptForStore(storeId: string, rawApiKey: string): string {
    const trimmedKey = rawApiKey?.trim();
    if (!trimmedKey) {
      throw new BadRequestException('La API Key no puede estar vacía.');
    }

    const storeKey = this.deriveStoreKey(storeId);
    const iv = crypto.randomBytes(IV_BYTE_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', storeKey, iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });

    cipher.setAAD(Buffer.from(storeId.trim(), 'utf8'));
    const encrypted = Buffer.concat([
      cipher.update(trimmedKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      VAULT_VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decryptForStore(storeId: string, encryptedPayload: string): string {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
      throw new InternalServerErrorException(
        'No se encontró una credencial cifrada válida para esta tienda.',
      );
    }

    const parts = encryptedPayload.split(':');
    if (parts.length !== 4 || parts[0] !== VAULT_VERSION) {
      throw new InternalServerErrorException(
        'Formato de credencial cifrada no soportado.',
      );
    }

    try {
      const iv = Buffer.from(parts[1], 'base64');
      const authTag = Buffer.from(parts[2], 'base64');
      const ciphertext = Buffer.from(parts[3], 'base64');

      if (
        iv.length !== IV_BYTE_LENGTH ||
        authTag.length !== AUTH_TAG_BYTE_LENGTH ||
        ciphertext.length === 0
      ) {
        throw new Error('Invalid cipher buffer lengths');
      }

      const storeKey = this.deriveStoreKey(storeId);
      const decipher = crypto.createDecipheriv('aes-256-gcm', storeKey, iv, {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      });
      decipher.setAAD(Buffer.from(storeId.trim(), 'utf8'));
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'No fue posible autenticar ni descifrar la credencial de IA de esta tienda.',
      );
    }
  }

  buildKeyHint(rawApiKey: string): string {
    const trimmed = rawApiKey?.trim() ?? '';
    if (trimmed.length <= 8) {
      return `••••${trimmed.slice(-2)}`;
    }
    return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
  }
}
