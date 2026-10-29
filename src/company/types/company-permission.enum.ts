export enum CompanyPermission {
  // Sucursales y Clientes
  BRANCHES_VIEW = 'branches:view',
  BRANCHES_MANAGE = 'branches:manage',
  CUSTOMERS_BLOCK = 'customers:block',

  // Pedidos
  ORDERS_VIEW = 'orders:view',
  ORDERS_PROCESS = 'orders:process',
  ORDERS_CANCEL = 'orders:cancel',
  ORDERS_CHAT = 'orders:chat',
  ORDERS_VIEW_CUSTOMER_DATA = 'orders:view_customer_data',

  // Inventario y Catálogo
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_MANAGE_STOCK = 'inventory:manage_stock',
  INVENTORY_CHANGE_PRICE = 'inventory:change_price',
  INVENTORY_EDIT = 'inventory:edit',
  INVENTORY_MANAGE_SLOTS = 'inventory:manage_slots',

  // Métricas y Analítica
  METRICS_VIEW_FINANCIAL = 'metrics:view_financial',
  METRICS_VIEW_SALES_HISTORY = 'metrics:view_sales_history',
  FINANCES_VIEW_SUMMARY = 'finances:view_summary',
  FINANCES_VIEW_SENSITIVE = 'finances:view_sensitive',

  // Cuotas y Cuentas por Cobrar
  INSTALLMENTS_VIEW = 'installments:view',
  INSTALLMENTS_APPROVE = 'installments:approve_payment',
  INSTALLMENTS_REJECT = 'installments:reject_payment',

  // Reclamos y Disputas
  DISPUTES_VIEW = 'disputes:view',
  DISPUTES_RESPOND = 'disputes:respond',
  DISPUTES_RESOLVE = 'disputes:resolve',

  // Equipo y Roles
  COLLABORATORS_VIEW = 'team:view',
  COLLABORATORS_MANAGE = 'collaborators:manage',
  ROLES_MANAGE = 'roles:manage',
}

export const ALL_COMPANY_PERMISSIONS = Object.values(CompanyPermission);

export interface PermissionMetadata {
  key: CompanyPermission;
  module: string;
  name: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionMetadata[] = [
  // Módulo: Sucursales y Clientes
  {
    key: CompanyPermission.BRANCHES_VIEW,
    module: 'Sucursales',
    name: 'Ver Sucursales',
    description: 'Permite visualizar la lista y detalles de las sucursales asignadas.',
  },
  {
    key: CompanyPermission.BRANCHES_MANAGE,
    module: 'Sucursales',
    name: 'Gestionar Sucursales',
    description: 'Permite editar horarios, teléfonos y configuración de las sucursales asignadas.',
  },
  {
    key: CompanyPermission.CUSTOMERS_BLOCK,
    module: 'Sucursales',
    name: 'Bloquear Clientes',
    description: 'Permite restringir o desbloquear compradores conflictivos en la sucursal.',
  },

  // Módulo: Pedidos
  {
    key: CompanyPermission.ORDERS_VIEW,
    module: 'Pedidos',
    name: 'Ver Pedidos',
    description: 'Permite visualizar los pedidos entrantes e historial en sus sucursales.',
  },
  {
    key: CompanyPermission.ORDERS_PROCESS,
    module: 'Pedidos',
    name: 'Procesar Pedidos',
    description: 'Permite cambiar estados de preparación, confirmación y despacho de pedidos.',
  },
  {
    key: CompanyPermission.ORDERS_CANCEL,
    module: 'Pedidos',
    name: 'Cancelar Pedidos',
    description: 'Permite cancelar pedidos o rechazar pagos con justificación formal.',
  },
  {
    key: CompanyPermission.ORDERS_CHAT,
    module: 'Pedidos',
    name: 'Chatear con Clientes',
    description: 'Permite comunicarse por mensajería con el cliente de un pedido activo.',
  },
  {
    key: CompanyPermission.ORDERS_VIEW_CUSTOMER_DATA,
    module: 'Pedidos',
    name: 'Ver Datos Sensibles de Clientes',
    description: 'Permite visualizar la cédula, teléfono directo y dirección completa del comprador.',
  },

  // Módulo: Inventario y Catálogo
  {
    key: CompanyPermission.INVENTORY_VIEW,
    module: 'Inventario',
    name: 'Ver Inventario',
    description: 'Permite consultar productos, variantes, precios y existencias.',
  },
  {
    key: CompanyPermission.INVENTORY_MANAGE_STOCK,
    module: 'Inventario',
    name: 'Ajustar Existencias',
    description: 'Permite modificar el stock de productos y variantes de forma rápida sin alterar precios.',
  },
  {
    key: CompanyPermission.INVENTORY_CHANGE_PRICE,
    module: 'Inventario',
    name: 'Modificar Precios',
    description: 'Permite cambiar el precio en moneda de los productos y variantes del catálogo.',
  },
  {
    key: CompanyPermission.INVENTORY_EDIT,
    module: 'Inventario',
    name: 'Crear y Editar Productos',
    description: 'Permite crear nuevos artículos, modificar descripciones, fotos y características.',
  },
  {
    key: CompanyPermission.INVENTORY_MANAGE_SLOTS,
    module: 'Inventario',
    name: 'Gestionar Reservas y Turnos',
    description: 'Permite configurar franjas horarias y turnos para productos con reservaciones.',
  },

  // Módulo: Métricas y Finanzas
  {
    key: CompanyPermission.METRICS_VIEW_FINANCIAL,
    module: 'Métricas',
    name: 'Ver Ingresos y Gráficas de Ventas',
    description: 'Permite visualizar ingresos monetarios ($), ticket promedio, conversión y gráficas financieras.',
  },
  {
    key: CompanyPermission.METRICS_VIEW_SALES_HISTORY,
    module: 'Métricas',
    name: 'Ver Historial de Ventas',
    description: 'Permite consultar el registro de ventas recientes de las sucursales asignadas.',
  },
  {
    key: CompanyPermission.FINANCES_VIEW_SUMMARY,
    module: 'Métricas',
    name: 'Ver Resumen Operativo',
    description: 'Permite ver el balance operacional básico de la jornada.',
  },
  {
    key: CompanyPermission.FINANCES_VIEW_SENSITIVE,
    module: 'Métricas',
    name: 'Ver Finanzas Avanzadas',
    description: 'Permite ver comisiones de la plataforma, márgenes y reportes contables consolidados.',
  },

  // Módulo: Cuotas y Deudas
  {
    key: CompanyPermission.INSTALLMENTS_VIEW,
    module: 'Cuotas',
    name: 'Ver Cuentas por Cobrar',
    description: 'Permite consultar cuotas pendientes, deudas activas y balances de crédito.',
  },
  {
    key: CompanyPermission.INSTALLMENTS_APPROVE,
    module: 'Cuotas',
    name: 'Aprobar Pagos de Cuotas',
    description: 'Permite validar comprobantes y aprobar abonos a cuotas de clientes.',
  },
  {
    key: CompanyPermission.INSTALLMENTS_REJECT,
    module: 'Cuotas',
    name: 'Rechazar Pagos de Cuotas',
    description: 'Permite rechazar comprobantes de cuotas con justificación.',
  },

  // Módulo: Reclamos y Mediaciones
  {
    key: CompanyPermission.DISPUTES_VIEW,
    module: 'Reclamos',
    name: 'Ver Disputas',
    description: 'Permite visualizar reclamos abiertos y mediaciones de compradores.',
  },
  {
    key: CompanyPermission.DISPUTES_RESPOND,
    module: 'Reclamos',
    name: 'Responder y Enviar Pruebas',
    description: 'Permite enviar evidencias, fotos y responder a disputas de clientes.',
  },
  {
    key: CompanyPermission.DISPUTES_RESOLVE,
    module: 'Reclamos',
    name: 'Resolver y Acordar Disputas',
    description: 'Permite aceptar acuerdos mutuos de solución y reembolsos en mediación.',
  },

  // Módulo: Equipo y Roles
  {
    key: CompanyPermission.COLLABORATORS_VIEW,
    module: 'Equipo',
    name: 'Ver Colaboradores',
    description: 'Permite consultar la lista del personal y sus sucursales asignadas.',
  },
  {
    key: CompanyPermission.COLLABORATORS_MANAGE,
    module: 'Equipo',
    name: 'Gestionar Colaboradores',
    description: 'Permite crear colaboradores, regenerar contraseñas y asignar sucursales.',
  },
  {
    key: CompanyPermission.ROLES_MANAGE,
    module: 'Equipo',
    name: 'Gestionar Roles',
    description: 'Permite crear, editar y eliminar roles y su matriz de permisos.',
  },
];

export interface RolePreset {
  name: string;
  description: string;
  permissions: CompanyPermission[];
}

export const DEFAULT_ROLE_PRESETS: RolePreset[] = [
  {
    name: 'Administrador',
    description: 'Acceso total sin restricciones a todas las funciones y métricas de la empresa.',
    permissions: ALL_COMPANY_PERMISSIONS,
  },
  {
    name: 'Encargado / Gerente',
    description: 'Gestión completa de operaciones, métricas de venta, inventario, precios y reclamos.',
    permissions: [
      CompanyPermission.BRANCHES_VIEW,
      CompanyPermission.BRANCHES_MANAGE,
      CompanyPermission.CUSTOMERS_BLOCK,
      CompanyPermission.ORDERS_VIEW,
      CompanyPermission.ORDERS_PROCESS,
      CompanyPermission.ORDERS_CANCEL,
      CompanyPermission.ORDERS_CHAT,
      CompanyPermission.ORDERS_VIEW_CUSTOMER_DATA,
      CompanyPermission.INVENTORY_VIEW,
      CompanyPermission.INVENTORY_MANAGE_STOCK,
      CompanyPermission.INVENTORY_CHANGE_PRICE,
      CompanyPermission.INVENTORY_EDIT,
      CompanyPermission.INVENTORY_MANAGE_SLOTS,
      CompanyPermission.METRICS_VIEW_FINANCIAL,
      CompanyPermission.METRICS_VIEW_SALES_HISTORY,
      CompanyPermission.FINANCES_VIEW_SUMMARY,
      CompanyPermission.INSTALLMENTS_VIEW,
      CompanyPermission.INSTALLMENTS_APPROVE,
      CompanyPermission.INSTALLMENTS_REJECT,
      CompanyPermission.DISPUTES_VIEW,
      CompanyPermission.DISPUTES_RESPOND,
      CompanyPermission.DISPUTES_RESOLVE,
      CompanyPermission.COLLABORATORS_VIEW,
    ],
  },
  {
    name: 'Cajero / Ventas',
    description: 'Atención a clientes, despacho de pedidos y cobro de cuotas. Sin acceso a modificar precios ni ver ingresos totales.',
    permissions: [
      CompanyPermission.BRANCHES_VIEW,
      CompanyPermission.ORDERS_VIEW,
      CompanyPermission.ORDERS_PROCESS,
      CompanyPermission.ORDERS_CHAT,
      CompanyPermission.ORDERS_VIEW_CUSTOMER_DATA,
      CompanyPermission.INVENTORY_VIEW,
      CompanyPermission.INVENTORY_MANAGE_STOCK,
      CompanyPermission.FINANCES_VIEW_SUMMARY,
      CompanyPermission.INSTALLMENTS_VIEW,
      CompanyPermission.INSTALLMENTS_APPROVE,
    ],
  },
  {
    name: 'Almacén / Despacho',
    description: 'Control de existencias y preparación de paquetes sin acceso a cobros ni métricas monetarias.',
    permissions: [
      CompanyPermission.BRANCHES_VIEW,
      CompanyPermission.ORDERS_VIEW,
      CompanyPermission.ORDERS_PROCESS,
      CompanyPermission.INVENTORY_VIEW,
      CompanyPermission.INVENTORY_MANAGE_STOCK,
    ],
  },
];
