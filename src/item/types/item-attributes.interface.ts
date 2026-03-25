export interface BaseAttributes {
  brand?: string;
  tags?: string[];
}

export interface FoodAttributes extends BaseAttributes {
  isVegan?: boolean;
  calories?: number;
  allergens?: string[];
  ingredients?: string[];
}

export interface ServiceAttributes extends BaseAttributes {
  durationMinutes?: number;
  modality?: 'IN_PERSON' | 'ONLINE' | 'AT_HOME';
  includesMaterials?: boolean;
}

export interface PhysicalProductAttributes extends BaseAttributes {
  color?: string;
  size?: string;
  material?: string;
  weightKg?: number;
}

export type ItemAttributes = 
  | FoodAttributes 
  | ServiceAttributes 
  | PhysicalProductAttributes 
  | Record<string, any>; 
