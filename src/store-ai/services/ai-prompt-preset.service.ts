import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPromptPreset } from '../entities/ai-prompt-preset.entity';
import {
  CreateAiPromptPresetDto,
  UpdateAiPromptPresetDto,
} from '../dto/ai-prompt-preset.dto';

export const DEFAULT_SYSTEM_AI_PRESETS: Array<{
  title: string;
  description: string;
  prompt: string;
  sortOrder: number;
}> = [
  {
    title: 'Estudio Fondo Blanco',
    description: 'Centra el artículo, mejora la calidad y deja fondo blanco puro.',
    prompt:
      'Centra este artículo de forma equilibrada, mejora la nitidez e iluminación a calidad de estudio comercial y deja el fondo completamente blanco puro con una sombra inferior muy sutil y natural.',
    sortOrder: 0,
  },
  {
    title: 'Mejorar Luz y Nitidez',
    description: 'Conserva el entorno original corrigiendo iluminación y claridad.',
    prompt:
      'Conserva el encuadre y escenario original, pero mejora notablemente la iluminación, el balance de blancos, la nitidez y la fidelidad de colores para que luzca como una fotografía profesional.',
    sortOrder: 1,
  },
  {
    title: 'Superficie Minimalista',
    description: 'Presentación limpia sobre mesa neutra con luz suave.',
    prompt:
      'Ubica el artículo centrado sobre una superficie minimalista limpia de tono neutro claro con iluminación lateral suave de estudio y fondo desenfocado limpio.',
    sortOrder: 2,
  },
];

@Injectable()
export class AiPromptPresetService implements OnModuleInit {
  constructor(
    @InjectRepository(AiPromptPreset)
    private readonly presetRepo: Repository<AiPromptPreset>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.presetRepo.count();
    if (count > 0) return;

    const entities = DEFAULT_SYSTEM_AI_PRESETS.map((preset) =>
      this.presetRepo.create({
        ...preset,
        isActive: true,
      }),
    );
    await this.presetRepo.save(entities);
  }

  async findAllAdmin(): Promise<AiPromptPreset[]> {
    return this.presetRepo.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findActive(): Promise<AiPromptPreset[]> {
    return this.presetRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findActiveById(id: string): Promise<AiPromptPreset> {
    const preset = await this.presetRepo.findOne({
      where: { id, isActive: true },
    });
    if (!preset) {
      throw new NotFoundException(
        'El preset oficial seleccionado no existe o está inactivo.',
      );
    }
    return preset;
  }

  async create(dto: CreateAiPromptPresetDto): Promise<AiPromptPreset> {
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const count = await this.presetRepo.count();
      sortOrder = count;
    }

    const entity = this.presetRepo.create({
      title: dto.title.trim(),
      prompt: dto.prompt.trim(),
      description: dto.description?.trim() || null,
      sortOrder,
      isActive: dto.isActive ?? true,
    });
    return this.presetRepo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateAiPromptPresetDto,
  ): Promise<AiPromptPreset> {
    const existing = await this.presetRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Preset oficial no encontrado.');
    }

    if (dto.title !== undefined) existing.title = dto.title.trim();
    if (dto.prompt !== undefined) existing.prompt = dto.prompt.trim();
    if (dto.description !== undefined) {
      existing.description = dto.description.trim() || null;
    }
    if (dto.sortOrder !== undefined) existing.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) existing.isActive = dto.isActive;

    return this.presetRepo.save(existing);
  }

  async reorder(orderedIds: string[]): Promise<AiPromptPreset[]> {
    const all = await this.presetRepo.find();
    const byId = new Map(all.map((p) => [p.id, p]));

    let nextOrder = 0;
    const toSave: AiPromptPreset[] = [];

    for (const id of orderedIds) {
      const item = byId.get(id);
      if (item) {
        item.sortOrder = nextOrder++;
        toSave.push(item);
        byId.delete(id);
      }
    }

    for (const remaining of byId.values()) {
      remaining.sortOrder = nextOrder++;
      toSave.push(remaining);
    }

    if (toSave.length > 0) {
      await this.presetRepo.save(toSave);
    }
    return this.findAllAdmin();
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.presetRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Preset oficial no encontrado.');
    }
    await this.presetRepo.remove(existing);
    return { deleted: true };
  }
}
