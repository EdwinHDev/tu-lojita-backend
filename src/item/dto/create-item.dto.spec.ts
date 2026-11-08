import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from './create-item.dto';
import { ItemType } from '../types/item-type.enum';

describe('CreateItemDto Validation', () => {
  const getBaseDto = (): Record<string, any> => ({
    title: 'Hamburguesa Especial de la Casa',
    storeId: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description: 'Deliciosa hamburguesa artesanal con queso cheddar fundido y tocineta ahumada.',
    mainImage: 'https://images.tulojita.com/sample.webp',
    images: ['https://images.tulojita.com/sample.webp'],
    itemType: ItemType.PRODUCT,
    price: 9.5,
  });

  it('debe validar exitosamente un título válido de 3 a 60 caracteres', async () => {
    const raw = getBaseDto();
    raw.title = 'Camiseta Básica de Algodón'; // 26 chars
    const dto = plainToInstance(CreateItemDto, raw);
    const errors = await validate(dto);
    const titleError = errors.find((e) => e.property === 'title');
    expect(titleError).toBeUndefined();
    expect(dto.title).toBe('Camiseta Básica de Algodón');
  });

  it('debe aplicar .trim() y pasar si tras trim tiene longitud válida', async () => {
    const raw = getBaseDto();
    raw.title = '   Pantalón Deportivo Slim Fit   ';
    const dto = plainToInstance(CreateItemDto, raw);
    const errors = await validate(dto);
    const titleError = errors.find((e) => e.property === 'title');
    expect(titleError).toBeUndefined();
    expect(dto.title).toBe('Pantalón Deportivo Slim Fit');
  });

  it('debe rechazar títulos con más de 60 caracteres', async () => {
    const raw = getBaseDto();
    raw.title = 'Este es un título excesivamente largo que sobrepasa el límite máximo permitido de sesenta caracteres'; // 101 chars
    const dto = plainToInstance(CreateItemDto, raw);
    const errors = await validate(dto);
    const titleError = errors.find((e) => e.property === 'title');
    expect(titleError).toBeDefined();
    expect(titleError?.constraints?.maxLength).toContain('60');
  });

  it('debe rechazar títulos con menos de 3 caracteres', async () => {
    const raw = getBaseDto();
    raw.title = 'AB';
    const dto = plainToInstance(CreateItemDto, raw);
    const errors = await validate(dto);
    const titleError = errors.find((e) => e.property === 'title');
    expect(titleError).toBeDefined();
    expect(titleError?.constraints?.minLength).toBeDefined();
  });
});
