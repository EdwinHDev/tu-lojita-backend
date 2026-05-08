import { PropertyType } from './property-type.enum';

export interface ItemProperty {
  templateId?: string;
  key: string;
  type: PropertyType;
  value: any; // Can be string, string[], number, boolean, etc.
}

export interface ItemAttributes {
  properties: ItemProperty[];
  legacy?: Record<string, any>; // To support old flat attributes if needed
}
