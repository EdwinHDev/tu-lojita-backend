export enum Division {
  PUESTO_AMBULANTE = 'PUESTO_AMBULANTE',
  CARRITO_VENTAS = 'CARRITO_VENTAS',
  TIENDITA_BARRIO = 'TIENDITA_BARRIO',
  LOCAL_ESTABLECIDO = 'LOCAL_ESTABLECIDO',
  TIENDA_MARCA = 'TIENDA_MARCA',
  GRAN_DISTRIBUIDOR = 'GRAN_DISTRIBUIDOR',
  IMPERIO_COMERCIAL = 'IMPERIO_COMERCIAL',
  MAGNATE_MERCADO = 'MAGNATE_MERCADO',
  // Legacy aliases for backward compatibility with database records
  HIERRO = 'HIERRO',
  BRONCE = 'BRONCE',
  PLATA = 'PLATA',
  ORO = 'ORO',
  PLATINO = 'PLATINO',
  ESMERALDA = 'ESMERALDA',
  DIAMANTE = 'DIAMANTE',
  MAESTRO = 'MAESTRO',
}

export const DIVISION_TITLES: Record<Division, string> = {
  [Division.PUESTO_AMBULANTE]: 'Puesto Ambulante',
  [Division.CARRITO_VENTAS]: 'Carrito de Ventas',
  [Division.TIENDITA_BARRIO]: 'Tiendita de Barrio',
  [Division.LOCAL_ESTABLECIDO]: 'Local Establecido',
  [Division.TIENDA_MARCA]: 'Tienda de Marca',
  [Division.GRAN_DISTRIBUIDOR]: 'Gran Distribuidor',
  [Division.IMPERIO_COMERCIAL]: 'Imperio Comercial',
  [Division.MAGNATE_MERCADO]: 'Magnate del Mercado',
  // Legacy aliases
  [Division.HIERRO]: 'Puesto Ambulante',
  [Division.BRONCE]: 'Carrito de Ventas',
  [Division.PLATA]: 'Tiendita de Barrio',
  [Division.ORO]: 'Local Establecido',
  [Division.PLATINO]: 'Tienda de Marca',
  [Division.ESMERALDA]: 'Gran Distribuidor',
  [Division.DIAMANTE]: 'Imperio Comercial',
  [Division.MAESTRO]: 'Magnate del Mercado',
};

export function normalizeDivision(raw?: string | null): Division {
  if (!raw) return Division.PUESTO_AMBULANTE;
  const upper = raw.toUpperCase();
  const map: Record<string, Division> = {
    HIERRO: Division.PUESTO_AMBULANTE,
    BRONCE: Division.CARRITO_VENTAS,
    PLATA: Division.TIENDITA_BARRIO,
    ORO: Division.LOCAL_ESTABLECIDO,
    PLATINO: Division.TIENDA_MARCA,
    ESMERALDA: Division.GRAN_DISTRIBUIDOR,
    DIAMANTE: Division.IMPERIO_COMERCIAL,
    MAESTRO: Division.MAGNATE_MERCADO,
    PUESTO_AMBULANTE: Division.PUESTO_AMBULANTE,
    CARRITO_VENTAS: Division.CARRITO_VENTAS,
    TIENDITA_BARRIO: Division.TIENDITA_BARRIO,
    LOCAL_ESTABLECIDO: Division.LOCAL_ESTABLECIDO,
    TIENDA_MARCA: Division.TIENDA_MARCA,
    GRAN_DISTRIBUIDOR: Division.GRAN_DISTRIBUIDOR,
    IMPERIO_COMERCIAL: Division.IMPERIO_COMERCIAL,
    MAGNATE_MERCADO: Division.MAGNATE_MERCADO,
  };
  return map[upper] || Division.PUESTO_AMBULANTE;
}
