jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiKeyVaultService } from './ai-key-vault.service';
import {
  ECOMMERCE_FIDELITY_SYSTEM_INSTRUCTION,
  StoreAiService,
} from './store-ai.service';
import { CompanyPermission } from 'src/company/types/company-permission.enum';

describe('StoreAiService', () => {
  const MASTER_HEX =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const companyId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '99999999-9999-4999-8999-999999999999';
  const storeAId = '22222222-2222-4222-8222-222222222221';
  const storeBId = '22222222-2222-4222-8222-222222222222';
  const independentStoreId = '22222222-2222-4222-8222-222222222299';
  const sampleApiKey = 'AIzaSyTestSecretKeyForStoreA_9876';

  const ownerActor = {
    id: ownerId,
    isCollaborator: false,
    company: { id: companyId },
    firstName: 'Dueño',
    lastName: 'Empresa',
  };

  const collaboratorAllowedOnA = {
    id: 'collab-1',
    isCollaborator: true,
    actorType: 'COLLABORATOR',
    company: { id: companyId },
    hasFullBranchAccess: true,
    allowedBranchIds: [],
    permissions: [CompanyPermission.INVENTORY_EDIT],
    aiAllowedStoreIds: [storeAId],
  };

  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const buildContext = (opts?: { globalEnabled?: boolean }) => {
    const vault = new AiKeyVaultService(MASTER_HEX);
    const settingsMap = new Map<string, any>();

    const stores: Record<string, any> = {
      [storeAId]: {
        id: storeAId,
        name: 'Empresa Demo',
        branchName: 'Sede Principal',
        isDeleted: false,
        timezone: 'America/Caracas',
        company: { id: companyId, owner: { id: ownerId } },
      },
      [storeBId]: {
        id: storeBId,
        name: 'Empresa Demo',
        branchName: 'Sucursal Este',
        isDeleted: false,
        timezone: 'America/Caracas',
        company: { id: companyId, owner: { id: ownerId } },
      },
      [independentStoreId]: {
        id: independentStoreId,
        name: 'Tienda Individual',
        isDeleted: false,
        company: null,
        owner: { id: ownerId },
      },
    };

    const storeRepo = {
      findOne: jest.fn(async ({ where }: any) => stores[where.id] ?? null),
    };

    const settingsRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        const row = settingsMap.get(where.storeId);
        if (!row) return null;
        // Simula @Column({ select: false }) en encryptedApiKey
        const { encryptedApiKey: _hidden, ...publicCols } = row;
        return { ...publicCols };
      }),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (data: any) => {
        const prev = settingsMap.get(data.storeId) || {};
        const merged = {
          ...prev,
          ...data,
          encryptedApiKey:
            data.encryptedApiKey !== undefined
              ? data.encryptedApiKey
              : prev.encryptedApiKey,
        };
        settingsMap.set(data.storeId, merged);
        return merged;
      }),
      update: jest.fn(async ({ storeId }: any, partial: any) => {
        const prev = settingsMap.get(storeId) || {};
        settingsMap.set(storeId, { ...prev, ...partial });
      }),
      createQueryBuilder: jest.fn(() => {
        let targetStoreId = '';
        return {
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn((_q: string, params: any) => {
            targetStoreId = params.storeId;
            return {
              getOne: jest.fn(
                async () => settingsMap.get(targetStoreId) ?? null,
              ),
            };
          }),
        };
      }),
    };

    const presetService = {
      findActive: jest.fn(async () => [
        {
          id: '55555555-5555-4555-8555-555555555551',
          title: 'Fondo Blanco',
          description: 'Fondo de estudio',
          prompt: 'Centra el producto sobre fondo blanco puro.',
        },
      ]),
      findActiveById: jest.fn(async (id: string) => ({
        id,
        title: 'Fondo Blanco',
        prompt: 'Centra el producto sobre fondo blanco puro.',
      })),
    };

    const platformSettings = {
      isAiImageEnhancementEnabled: jest.fn(
        async () => opts?.globalEnabled ?? true,
      ),
      getAiGeminiModel: jest.fn(async () => 'gemini-2.5-flash-image'),
    };

    const activityLogService = {
      log: jest.fn(async () => undefined),
    };

    const service = new StoreAiService(
      storeRepo as any,
      settingsRepo as any,
      vault,
      presetService as any,
      platformSettings as any,
      activityLogService as any,
    );

    return {
      service,
      vault,
      settingsMap,
      activityLogService,
      platformSettings,
    };
  };

  it('bloquea tiendas independientes sin empresa (store.company == null)', async () => {
    const { service } = buildContext();

    await expect(
      service.getSettings(independentStoreId, ownerActor),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.enhanceImage(
        independentStoreId,
        {
          buffer: Buffer.from('img'),
          mimetype: 'image/png',
          size: 3,
        },
        { customPrompt: 'Mejora luz' },
        ownerActor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prohíbe a cualquier colaborador leer, probar, editar o borrar la API Key de la tienda', async () => {
    const { service } = buildContext();

    await expect(
      service.getSettings(storeAId, collaboratorAllowedOnA),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.testKey(
        storeAId,
        { apiKey: sampleApiKey, saveIfValid: true },
        collaboratorAllowedOnA,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.updateSettings(
        storeAId,
        { isEnabled: false },
        collaboratorAllowedOnA,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.deleteKey(storeAId, collaboratorAllowedOnA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('valida y cifra la API Key sin exponer jamás encryptedApiKey y limita los prompts propios a máximo 3', async () => {
    const { service } = buildContext();

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'YWJj' } }],
            },
          },
        ],
      }),
    })) as any;

    const savedRes = await service.testKey(
      storeAId,
      { apiKey: sampleApiKey, saveIfValid: true },
      ownerActor,
    );

    expect(savedRes.valid).toBe(true);
    expect(savedRes.apiKeyHint).toBe('AIza••••9876');
    expect(JSON.stringify(savedRes)).not.toContain(sampleApiKey);
    expect((savedRes.settings as any).encryptedApiKey).toBeUndefined();

    // Guardar 3 prompts propios funciona
    const updated = await service.updateSettings(
      storeAId,
      {
        customPrompts: [
          { title: 'P1', prompt: 'Fondo mármol' },
          { title: 'P2', prompt: 'Luz natural' },
          { title: 'P3', prompt: 'Mesa madera' },
        ],
      },
      ownerActor,
    );
    expect(updated.customPrompts).toHaveLength(3);

    // Intentar guardar 4 prompts es rechazado
    await expect(
      service.updateSettings(
        storeAId,
        {
          customPrompts: [
            { title: 'P1', prompt: '1' },
            { title: 'P2', prompt: '2' },
            { title: 'P3', prompt: '3' },
            { title: 'P4', prompt: '4' },
          ],
        },
        ownerActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('bloquea /enhance, testKey y activación de tienda cuando el kill-switch global está apagado', async () => {
    const { service } = buildContext({ globalEnabled: false });

    await expect(
      service.enhanceImage(
        storeAId,
        { buffer: Buffer.from('abc'), mimetype: 'image/jpeg', size: 3 },
        { customPrompt: 'Fondo blanco' },
        ownerActor,
      ),
    ).rejects.toThrow(ServiceUnavailableException);

    await expect(
      service.testKey(storeAId, { apiKey: sampleApiKey }, ownerActor),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.updateSettings(storeAId, { isEnabled: true }, ownerActor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aplica autorización por sucursal en colaboradores, envía x-goog-api-key por header y registra auditoría', async () => {
    const { service, vault, settingsMap, activityLogService } = buildContext();

    settingsMap.set(storeAId, {
      storeId: storeAId,
      isEnabled: true,
      encryptedApiKey: vault.encryptForStore(storeAId, sampleApiKey),
      apiKeyHint: 'AIza••••9876',
      customPrompts: [],
      dailyLimit: 50,
      usageCountToday: 0,
    });
    settingsMap.set(storeBId, {
      storeId: storeBId,
      isEnabled: true,
      encryptedApiKey: vault.encryptForStore(storeBId, 'AIzaSyKeyStoreB_0002'),
      apiKeyHint: 'AIza••••0002',
      customPrompts: [],
      dailyLimit: 50,
      usageCountToday: 0,
    });

    let capturedUrl = '';
    let capturedInit: any = null;
    global.fetch = jest.fn(async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'ZW5oYW5jZWRfYmFzZTY0',
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    }) as any;

    // Sin imagen adjunta rechaza antes de llamar a Gemini
    await expect(
      service.enhanceImage(
        storeAId,
        undefined,
        { customPrompt: 'Fondo blanco' },
        collaboratorAllowedOnA,
      ),
    ).rejects.toThrow(BadRequestException);

    // En storeA (autorizada) funciona
    const result = await service.enhanceImage(
      storeAId,
      { buffer: Buffer.from('raw-photo'), mimetype: 'image/jpeg', size: 9 },
      { presetId: '55555555-5555-4555-8555-555555555551' },
      collaboratorAllowedOnA,
    );

    expect(result.imageBase64).toBe('ZW5oYW5jZWRfYmFzZTY0');
    expect(result.remainingDailyQuota).toBe(49);
    expect(capturedUrl).not.toContain(sampleApiKey);
    expect(capturedInit.headers['x-goog-api-key']).toBe(sampleApiKey);
    expect(capturedInit.body).toContain(
      JSON.stringify(ECOMMERCE_FIDELITY_SYSTEM_INSTRUCTION).slice(1, -1),
    );
    expect(activityLogService.log).toHaveBeenCalledTimes(1);

    // En storeB (no autorizada para este colaborador) rechaza con 403
    await expect(
      service.enhanceImage(
        storeBId,
        { buffer: Buffer.from('raw-photo'), mimetype: 'image/jpeg', size: 9 },
        { customPrompt: 'Fondo blanco' },
        collaboratorAllowedOnA,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('mapea errores 401/403 a INVALID_API_KEY y 429 a QUOTA_OR_BILLING_REQUIRED', async () => {
    const { service } = buildContext();

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: { status: 'PERMISSION_DENIED', message: 'API key not valid' },
      }),
    })) as any;

    await expect(
      service.testKey(storeAId, { apiKey: sampleApiKey }, ownerActor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_API_KEY' }),
    });

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
      }),
    })) as any;

    let caughtError: any;
    try {
      await service.testKey(storeAId, { apiKey: sampleApiKey }, ownerActor);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(HttpException);
    expect(caughtError.getStatus()).toBe(429);
    expect(caughtError.getResponse()).toMatchObject({
      code: 'QUOTA_OR_BILLING_REQUIRED',
    });
  });
});
