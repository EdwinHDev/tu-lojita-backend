jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: (pkg: string) => require(pkg),
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { NotFoundException } from '@nestjs/common';
import {
  AiPromptPresetService,
  DEFAULT_SYSTEM_AI_PRESETS,
} from './ai-prompt-preset.service';

describe('AiPromptPresetService', () => {
  const createInMemoryRepo = () => {
    const items: any[] = [];
    let counter = 1;
    return {
      items,
      count: jest.fn(async () => items.length),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (input: any) => {
        if (Array.isArray(input)) {
          return input.map((entry) => {
            if (!entry.id) {
              entry.id = `00000000-0000-4000-8000-00000000000${counter++}`;
              items.push(entry);
            }
            return entry;
          });
        }
        if (!input.id) {
          input.id = `00000000-0000-4000-8000-00000000000${counter++}`;
          items.push(input);
        }
        return input;
      }),
      find: jest.fn(async (opts?: any) => {
        let list = [...items];
        if (opts?.where?.isActive !== undefined) {
          list = list.filter((i) => i.isActive === opts.where.isActive);
        }
        list.sort((a, b) => a.sortOrder - b.sortOrder);
        return list;
      }),
      findOne: jest.fn(async (opts: any) => {
        return (
          items.find((i) => {
            if (opts.where.id && i.id !== opts.where.id) return false;
            if (
              opts.where.isActive !== undefined &&
              i.isActive !== opts.where.isActive
            ) {
              return false;
            }
            return true;
          }) ?? null
        );
      }),
      remove: jest.fn(async (entity: any) => {
        const idx = items.findIndex((i) => i.id === entity.id);
        if (idx >= 0) items.splice(idx, 1);
      }),
    };
  };

  it('siembra los presets iniciales de e-commerce solo cuando la tabla está vacía', async () => {
    const repo = createInMemoryRepo();
    const service = new AiPromptPresetService(repo as any);

    await service.onModuleInit();
    expect(repo.items).toHaveLength(DEFAULT_SYSTEM_AI_PRESETS.length);
    expect(repo.items[0].title).toBe('Estudio Fondo Blanco');

    // Segunda ejecución no duplica registros
    await service.onModuleInit();
    expect(repo.items).toHaveLength(DEFAULT_SYSTEM_AI_PRESETS.length);
  });

  it('permite crear, desactivar, reordenar y eliminar presets oficiales', async () => {
    const repo = createInMemoryRepo();
    const service = new AiPromptPresetService(repo as any);

    const p1 = await service.create({
      title: 'Fondo Blanco',
      prompt: 'Deja el fondo blanco puro',
    });
    const p2 = await service.create({
      title: 'Luz Cálida',
      prompt: 'Aplica iluminación cálida',
    });

    expect((await service.findActive()).map((p) => p.id)).toEqual([
      p1.id,
      p2.id,
    ]);

    await service.reorder([p2.id, p1.id]);
    expect((await service.findActive()).map((p) => p.id)).toEqual([
      p2.id,
      p1.id,
    ]);

    await service.update(p2.id, { isActive: false });
    expect((await service.findActive()).map((p) => p.id)).toEqual([p1.id]);
    await expect(service.findActiveById(p2.id)).rejects.toThrow(
      NotFoundException,
    );

    await service.remove(p1.id);
    expect(await service.findAllAdmin()).toHaveLength(1);
  });
});
