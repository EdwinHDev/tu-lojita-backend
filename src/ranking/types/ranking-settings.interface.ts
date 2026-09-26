export interface LpValuesConfig {
  ORDER_COMPLETED: number;
  REVIEW_5_STAR: number;
  REVIEW_4_STAR: number;
  REVIEW_REPLY: number;
  ORDER_CANCELLED_BY_SELLER: number;
  REVIEW_1_2_STAR: number;
  DISPUTE_OPENED: number;
  DISPUTE_LOST: number;
  STRIKE: number;
  SUBSCRIPTION_DEBT_WEEKLY: number;
  INACTIVITY_WEEKLY: number;
  DISPUTE_WON: number;
  STREAK_10_ORDERS: number;
  MONTHLY_NO_DISPUTES: number;
  PROFILE_COMPLETE: number;
}

export interface DivisionThresholdsConfig {
  PUESTO_AMBULANTE?: number;
  CARRITO_VENTAS: number;
  TIENDITA_BARRIO: number;
  LOCAL_ESTABLECIDO: number;
  TIENDA_MARCA: number;
  GRAN_DISTRIBUIDOR: number;
  IMPERIO_COMERCIAL: number;
  // Legacy aliases
  HIERRO?: number;
  BRONCE?: number;
  PLATA?: number;
  ORO?: number;
  PLATINO?: number;
  ESMERALDA?: number;
  DIAMANTE?: number;
}

export interface CalibrationConfig {
  ordersRequired: number;
  lpMultiplier: number;
}

export interface AntiCheatConfig {
  accountMinAgeDays: number;
  buyerCooldownDays: number;
  clusterWindowDays: number;
  clusterMinAccounts: number;
  storeCreationWindowDays: number;
}

export interface InactivityConfig {
  daysBeforePenalty: number;
  ironFlagDays: number;
}

export interface MaestroConfig {
  maxStores: number;
}

export interface RetentionConfig {
  streakL1Days: number;
  streakL1Multiplier: number;
  streakL2Days: number;
  streakL2Multiplier: number;
  streakL3Days: number;
  streakL3Multiplier: number;
  rankShieldHours: number;
  dangerZoneHours: number;
  eliteDecayDays: number;
  eliteDecayPenalty: number;
}

export interface MissionsConfig {
  dailySaleReward: number;
  review5StarReward: number;
  volumeReward: number;
  volumeTargetOrders: number;
}

export interface DivisionEmblemsConfig {
  PUESTO_AMBULANTE: string;
  CARRITO_VENTAS: string;
  TIENDITA_BARRIO: string;
  LOCAL_ESTABLECIDO: string;
  TIENDA_MARCA: string;
  GRAN_DISTRIBUIDOR: string;
  IMPERIO_COMERCIAL: string;
  MAGNATE_MERCADO: string;
  // Legacy aliases
  HIERRO?: string;
  BRONCE?: string;
  PLATA?: string;
  ORO?: string;
  PLATINO?: string;
  ESMERALDA?: string;
  DIAMANTE?: string;
  MAESTRO?: string;
  [key: string]: string | undefined;
}

export interface RankingSettingsData {
  lpValues: LpValuesConfig;
  divisionThresholds: DivisionThresholdsConfig;
  calibration: CalibrationConfig;
  antiCheat: AntiCheatConfig;
  inactivity: InactivityConfig;
  maestro: MaestroConfig;
  divisionEmblems: DivisionEmblemsConfig;
  retention: RetentionConfig;
  missions: MissionsConfig;
}

export const DEFAULT_RANKING_SETTINGS: RankingSettingsData = {
  lpValues: {
    ORDER_COMPLETED: 15,
    REVIEW_5_STAR: 25,
    REVIEW_4_STAR: 10,
    REVIEW_REPLY: 5,
    ORDER_CANCELLED_BY_SELLER: -20,
    REVIEW_1_2_STAR: -30,
    DISPUTE_OPENED: -25,
    DISPUTE_LOST: -60,
    STRIKE: -100,
    SUBSCRIPTION_DEBT_WEEKLY: -15,
    INACTIVITY_WEEKLY: -20,
    DISPUTE_WON: 20,
    STREAK_10_ORDERS: 40,
    MONTHLY_NO_DISPUTES: 30,
    PROFILE_COMPLETE: 50,
  },
  divisionThresholds: {
    PUESTO_AMBULANTE: 0,
    CARRITO_VENTAS: 400,
    TIENDITA_BARRIO: 800,
    LOCAL_ESTABLECIDO: 1300,
    TIENDA_MARCA: 1900,
    GRAN_DISTRIBUIDOR: 2600,
    IMPERIO_COMERCIAL: 3400,
    // Legacy support
    HIERRO: 0,
    BRONCE: 400,
    PLATA: 800,
    ORO: 1300,
    PLATINO: 1900,
    ESMERALDA: 2600,
    DIAMANTE: 3400,
  },
  calibration: {
    ordersRequired: 5,
    lpMultiplier: 2.0,
  },
  antiCheat: {
    accountMinAgeDays: 7,
    buyerCooldownDays: 3,
    clusterWindowDays: 7,
    clusterMinAccounts: 5,
    storeCreationWindowDays: 3,
  },
  inactivity: {
    daysBeforePenalty: 30,
    ironFlagDays: 90,
  },
  maestro: {
    maxStores: 50,
  },
  retention: {
    streakL1Days: 3,
    streakL1Multiplier: 1.10,
    streakL2Days: 7,
    streakL2Multiplier: 1.25,
    streakL3Days: 15,
    streakL3Multiplier: 1.50,
    rankShieldHours: 48,
    dangerZoneHours: 24,
    eliteDecayDays: 5,
    eliteDecayPenalty: 10,
  },
  missions: {
    dailySaleReward: 15,
    review5StarReward: 25,
    volumeReward: 35,
    volumeTargetOrders: 3,
  },
  divisionEmblems: {
    PUESTO_AMBULANTE: '/assets/ranking/emblems/puesto_ambulante.png',
    CARRITO_VENTAS: '/assets/ranking/emblems/carrito_ventas.png',
    TIENDITA_BARRIO: '/assets/ranking/emblems/tiendita_barrio.png',
    LOCAL_ESTABLECIDO: '/assets/ranking/emblems/local_establecido.png',
    TIENDA_MARCA: '/assets/ranking/emblems/tienda_marca.png',
    GRAN_DISTRIBUIDOR: '/assets/ranking/emblems/gran_distribuidor.png',
    IMPERIO_COMERCIAL: '/assets/ranking/emblems/imperio_comercial.png',
    MAGNATE_MERCADO: '/assets/ranking/emblems/magnate_mercado.png',
    // Legacy aliases
    HIERRO: '/assets/ranking/emblems/puesto_ambulante.png',
    BRONCE: '/assets/ranking/emblems/carrito_ventas.png',
    PLATA: '/assets/ranking/emblems/tiendita_barrio.png',
    ORO: '/assets/ranking/emblems/local_establecido.png',
    PLATINO: '/assets/ranking/emblems/tienda_marca.png',
    ESMERALDA: '/assets/ranking/emblems/gran_distribuidor.png',
    DIAMANTE: '/assets/ranking/emblems/imperio_comercial.png',
    MAESTRO: '/assets/ranking/emblems/magnate_mercado.png',
  },
};
