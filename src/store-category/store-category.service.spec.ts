import { Test, TestingModule } from '@nestjs/testing';
import { StoreCategoryService } from './store-category.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StoreCategory } from './entities/store-category.entity';
import { Store } from 'src/store/entities/store.entity';
import { ItemPropertyTemplate } from 'src/item/entities/item-property-template.entity';
import { DataSource } from 'typeorm';

describe('StoreCategoryService', () => {
  let service: StoreCategoryService;

  const mockEntityManager = {
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((cb) => cb(mockEntityManager)),
  };

  const mockStoreCategoryRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    remove: jest.fn(),
  };

  const mockStoreRepository = {
    findOneBy: jest.fn(),
  };

  const mockTemplateRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreCategoryService,
        {
          provide: getRepositoryToken(StoreCategory),
          useValue: mockStoreCategoryRepository,
        },
        {
          provide: getRepositoryToken(Store),
          useValue: mockStoreRepository,
        },
        {
          provide: getRepositoryToken(ItemPropertyTemplate),
          useValue: mockTemplateRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<StoreCategoryService>(StoreCategoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    it('should update category and synchronize templates correctly', async () => {
      const categoryId = 'cat-1';
      const existingCategory = { id: categoryId, name: 'Old Name' };
      const existingTemplates = [
        { id: 't1', name: 'Color' },
        { id: 't2', name: 'Size' },
      ];

      mockStoreCategoryRepository.findOne.mockResolvedValue(existingCategory);
      mockEntityManager.save.mockImplementation(async (entity) => entity);
      mockEntityManager.find.mockResolvedValue(existingTemplates);

      const updateDto = {
        name: 'New Name',
        propertyTemplates: [
          { id: 't1', name: 'Color Updated' }, // update
          { name: 'Material' }, // add
          // t2 is removed
        ],
      };

      mockEntityManager.merge.mockImplementation((entityCls, obj, data) =>
        Object.assign(obj, data),
      );
      mockEntityManager.create.mockImplementation((entityCls, data) => data);

      await service.update(categoryId, updateDto);

      // Verify category name updated
      expect(mockEntityManager.merge).toHaveBeenCalledWith(
        StoreCategory,
        existingCategory,
        { name: 'New Name' },
      );

      // Verify t2 is removed
      expect(mockEntityManager.remove).toHaveBeenCalledWith([
        { id: 't2', name: 'Size' },
      ]);

      // Verify templates to save
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2); // once for category, once for templates

      const savedTemplatesArgs = mockEntityManager.save.mock.calls[1][0];
      expect(savedTemplatesArgs).toHaveLength(2);
      expect(savedTemplatesArgs[0].name).toBe('Color Updated');
      expect(savedTemplatesArgs[1].name).toBe('Material');
    });
  });
});
