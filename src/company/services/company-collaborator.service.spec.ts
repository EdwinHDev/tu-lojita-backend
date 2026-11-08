jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { CompanyCollaboratorService } from './company-collaborator.service';
import { CompanyPermission } from '../types/company-permission.enum';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';

describe('CompanyCollaboratorService - AI Branch Permissions', () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const storeActiveA = {
    id: '22222222-2222-4222-8222-222222222221',
    name: 'Sucursal Centro',
    isDeleted: false,
  };
  const storeInactiveB = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Sucursal Norte',
    isDeleted: false,
  };
  const storeActiveUnassignedC = {
    id: '22222222-2222-4222-8222-222222222223',
    name: 'Sucursal Sur',
    isDeleted: false,
  };

  const editorRole = {
    id: '33333333-3333-4333-8333-333333333331',
    name: 'Editor de Catálogo',
    permissions: [
      { permission: CompanyPermission.INVENTORY_VIEW },
      { permission: CompanyPermission.INVENTORY_EDIT },
    ],
  };

  const cashierRole = {
    id: '33333333-3333-4333-8333-333333333332',
    name: 'Cajero',
    permissions: [{ permission: CompanyPermission.ORDERS_VIEW }],
  };

  const setup = (globalAiEnabled = true) => {
    const savedCollaborators: any[] = [];
    const collaboratorRepo = {
      create: jest.fn((data: any) => ({
        id: '44444444-4444-4444-8444-444444444441',
        ...data,
      })),
      save: jest.fn(async (entity: any) => {
        const idx = savedCollaborators.findIndex((c) => c.id === entity.id);
        if (idx >= 0) savedCollaborators[idx] = entity;
        else savedCollaborators.push(entity);
        return entity;
      }),
      findOne: jest.fn(async (opts: any) => {
        return savedCollaborators.find((c) => c.id === opts.where.id) ?? null;
      }),
    };

    const companyRepo = {
      findOne: jest.fn(async () => ({ id: companyId, name: 'Empresa Demo' })),
    };

    const roleRepo = {
      findOne: jest.fn(async (opts: any) => {
        if (opts.where.id === editorRole.id) return editorRole;
        if (opts.where.id === cashierRole.id) return cashierRole;
        return null;
      }),
    };

    const allStores = [storeActiveA, storeInactiveB, storeActiveUnassignedC];
    const storeRepo = {
      find: jest.fn(async (opts: any) => {
        const ids: string[] = opts?.where?.id?._value ?? [];
        return allStores.filter((s) => ids.includes(s.id));
      }),
    };

    const storeAiSettingsRepo = {
      find: jest.fn(async () => [
        {
          storeId: storeActiveA.id,
          isEnabled: true,
          apiKeyHint: 'AIza••••1111',
        },
        {
          storeId: storeActiveUnassignedC.id,
          isEnabled: true,
          apiKeyHint: 'AIza••••3333',
        },
      ]),
    };

    const credentialService = {
      generateAccessId: jest.fn(async () => '12345678'),
      generateInitialPassword: jest.fn(() => 'Temp1234'),
    };

    const activityLogService = {
      log: jest.fn(),
    };

    const platformSettingsService = {
      isAiImageEnhancementEnabled: jest.fn(async () => globalAiEnabled),
    };

    const service = new CompanyCollaboratorService(
      collaboratorRepo as any,
      companyRepo as any,
      roleRepo as any,
      storeRepo as any,
      storeAiSettingsRepo as any,
      credentialService as any,
      activityLogService as any,
      platformSettingsService as any,
    );

    return { service, collaboratorRepo };
  };

  it('persiste únicamente sucursales asignadas con IA activa cuando el rol tiene inventory:edit', async () => {
    const { service } = setup(true);

    const res = await service.create(companyId, {
      firstName: 'Ana',
      lastName: 'Gómez',
      roleId: editorRole.id,
      hasFullBranchAccess: false,
      storeIds: [storeActiveA.id, storeInactiveB.id],
      aiAllowedStoreIds: [
        storeActiveA.id,
        storeInactiveB.id,
        storeActiveUnassignedC.id,
      ],
    });

    expect(res.collaborator.aiAllowedStoreIds).toEqual([storeActiveA.id]);
    expect(res.collaborator.aiEnabledStores.map((s) => s.id)).toEqual([
      storeActiveA.id,
    ]);
  });

  it('descarta sucursales de IA cuando el rol no posee inventory:edit al crear o actualizar', async () => {
    const { service } = setup(true);

    const created = await service.create(companyId, {
      firstName: 'Luis',
      lastName: 'Pérez',
      roleId: cashierRole.id,
      hasFullBranchAccess: true,
      aiAllowedStoreIds: [storeActiveA.id],
    });
    expect(created.collaborator.aiAllowedStoreIds).toEqual([]);

    const editorCreated = await service.create(companyId, {
      firstName: 'María',
      lastName: 'Rojas',
      roleId: editorRole.id,
      hasFullBranchAccess: true,
      aiAllowedStoreIds: [storeActiveA.id, storeActiveUnassignedC.id],
    });
    // Forzamos ID distinto en mock
    editorCreated.collaborator.id = '44444444-4444-4444-8444-444444444442';
    expect(editorCreated.collaborator.aiAllowedStoreIds).toEqual([
      storeActiveA.id,
      storeActiveUnassignedC.id,
    ]);

    // Al cambiar su rol a Cajero (sin inventory:edit), se limpia automáticamente
    const downgraded = await service.update(
      companyId,
      editorCreated.collaborator.id,
      { roleId: cashierRole.id },
    );
    expect(downgraded.aiAllowedStoreIds).toEqual([]);
    expect(downgraded.aiEnabledStores).toEqual([]);
  });

  it('JwtStrategy hidrata aiAllowedStoreIds solo si el colaborador mantiene inventory:edit y acceso a la sucursal', async () => {
    const collaboratorEntity = {
      id: 'collab-1',
      firstName: 'Carlos',
      lastName: 'Díaz',
      accessId: '87654321',
      isActive: true,
      tokenVersion: 1,
      hasFullBranchAccess: false,
      company: { id: companyId },
      role: editorRole,
      stores: [storeActiveA],
      aiEnabledStores: [storeActiveA, storeActiveUnassignedC],
    };

    const strategy = new JwtStrategy(
      {} as any,
      {} as any,
      {
        findOne: jest.fn(async () => collaboratorEntity),
      } as any,
    );

    const validated: any = await strategy.validate(
      {},
      { sub: 'collab-1', actorType: 'COLLABORATOR', tokenVersion: 1 },
    );

    expect(validated.aiAllowedStoreIds).toEqual([storeActiveA.id]);
  });
});
