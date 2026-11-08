jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));

import { InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { AiKeyVaultService } from './ai-key-vault.service';

describe('AiKeyVaultService', () => {
  const validMasterHex = crypto.randomBytes(32).toString('hex');
  const storeA = '11111111-1111-4111-8111-111111111111';
  const storeB = '22222222-2222-4222-8222-222222222222';
  const sampleGeminiKey = 'AIzaSyD-ExampleSecretKeyForTesting9x7Q';

  it('cifra y descifra correctamente la API Key para la misma tienda con IVs aleatorios', () => {
    const vault = new AiKeyVaultService(validMasterHex);

    const encrypted1 = vault.encryptForStore(storeA, sampleGeminiKey);
    const encrypted2 = vault.encryptForStore(storeA, sampleGeminiKey);

    expect(encrypted1.startsWith('v1:')).toBe(true);
    expect(encrypted1).not.toBe(encrypted2);
    expect(encrypted1).not.toContain(sampleGeminiKey);

    expect(vault.decryptForStore(storeA, encrypted1)).toBe(sampleGeminiKey);
    expect(vault.decryptForStore(storeA, encrypted2)).toBe(sampleGeminiKey);
  });

  it('falla criptográficamente si se intenta descifrar el payload de storeA usando storeB (aislamiento por tienda)', () => {
    const vault = new AiKeyVaultService(validMasterHex);
    const encryptedForStoreA = vault.encryptForStore(storeA, sampleGeminiKey);

    expect(() => vault.decryptForStore(storeB, encryptedForStoreA)).toThrow(
      InternalServerErrorException,
    );
  });

  it('falla criptográficamente ante alteración del authTag o texto cifrado y nunca expone la llave en el error', () => {
    const vault = new AiKeyVaultService(validMasterHex);
    const encrypted = vault.encryptForStore(storeA, sampleGeminiKey);
    const parts = encrypted.split(':');
    const tamperedCipher = Buffer.from(parts[3], 'base64');
    tamperedCipher[0] ^= 0xff;
    const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher.toString('base64')}`;

    try {
      vault.decryptForStore(storeA, tamperedPayload);
      fail('Debería haber fallado la autenticación GCM');
    } catch (err: any) {
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.message).not.toContain(sampleGeminiKey);
    }
  });

  it('acepta clave maestra en formato base64 de 32 bytes y rechaza claves de longitud inválida', () => {
    const validBase64 = crypto.randomBytes(32).toString('base64');
    const vault = new AiKeyVaultService(validBase64);
    const encrypted = vault.encryptForStore(storeA, sampleGeminiKey);
    expect(vault.decryptForStore(storeA, encrypted)).toBe(sampleGeminiKey);

    expect(() => new AiKeyVaultService('clave-demasiado-corta')).toThrow(
      InternalServerErrorException,
    );
  });

  it('construye una pista enmascarada segura sin revelar el cuerpo de la llave', () => {
    const vault = new AiKeyVaultService(validMasterHex);
    expect(vault.buildKeyHint(sampleGeminiKey)).toBe('AIza••••9x7Q');
    expect(vault.buildKeyHint('short12')).toBe('••••12');
  });
});
