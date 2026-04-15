# 📊 Dashboard Endpoints - Tu Lojita Business

## ✅ Endpoints Implementados

### **1. Dashboard Stats (Métricas Generales)**

```
GET /api/v1/companies/:companyId/dashboard/stats
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Respuesta (200):**
```json
{
  "salesToday": {
    "amount": 12450.00,
    "percentage": 12.5,
    "currency": "USD"
  },
  "totalStores": {
    "count": 8,
    "newThisMonth": 2
  },
  "totalProducts": {
    "count": 342,
    "addedThisWeek": 28
  },
  "totalCustomers": {
    "count": 1234,
    "newThisMonth": 45
  }
}
```

**Qué calcula:**
- ✅ Ventas del día actual (desde las 00:00)
- ✅ Porcentaje de crecimiento vs día anterior
- ✅ Total de tiendas de la empresa
- ✅ Tiendas nuevas este mes
- ✅ Total de productos de todas las tiendas
- ✅ Productos agregados esta semana
- ✅ Total de clientes únicos (usuarios que han comprado)
- ✅ Clientes nuevos este mes

---

### **2. Recent Sales (Ventas Recientes)**

```
GET /api/v1/companies/:companyId/dashboard/recent-sales?limit=5
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Query Parameters:**
- `limit` (opcional, default: 5) - Cantidad de ventas a retornar

**Respuesta (200):**
```json
{
  "recentSales": [
    {
      "id": "uuid-1",
      "storeName": "Tienda Centro",
      "amount": 450.00,
      "currency": "USD",
      "time": "10:30 AM",
      "orderId": "#12345678",
      "status": "FULLY_PAID"
    },
    {
      "id": "uuid-2",
      "storeName": "Tienda Norte",
      "amount": 320.00,
      "currency": "USD",
      "time": "9:15 AM",
      "orderId": "#87654321",
      "status": "FULLY_PAID"
    }
  ],
  "total": 2
}
```

**Qué retorna:**
- ✅ Últimas N ventas completadas (FULLY_PAID)
- ✅ Ordenadas por fecha descendente (más recientes primero)
- ✅ Nombre de la tienda
- ✅ Hora formateada (12h AM/PM)
- ✅ ID de orden corto

---

### **3. Stores Summary (Resumen de Tiendas)**

```
GET /api/v1/companies/:companyId/dashboard/stores-summary
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Respuesta (200):**
```json
{
  "stores": [
    {
      "id": "uuid-1",
      "name": "Tienda Centro",
      "productsCount": 45,
      "address": "Av. Principal #123",
      "logo": "https://..."
    },
    {
      "id": "uuid-2",
      "name": "Tienda Norte",
      "productsCount": 32,
      "address": "Calle Norte #456",
      "logo": "https://..."
    }
  ],
  "total": 2
}
```

**Qué retorna:**
- ✅ Todas las tiendas de la empresa
- ✅ Cantidad de productos por tienda
- ✅ Dirección principal (primera dirección)
- ✅ Logo de la tienda
- ✅ Ordenadas por fecha de creación (más recientes primero)

---

## 🔒 Seguridad

### **Validación Automática:**

Todos los endpoints validan que:
1. ✅ El usuario está autenticado (JWT)
2. ✅ El usuario pertenece a la empresa solicitada
3. ✅ Solo se retornan datos de la empresa del usuario

**Si el usuario no pertenece a la empresa:**
```json
{
  "statusCode": 403,
  "message": "No tienes acceso a esta empresa"
}
```

---

## 📊 Entidades Utilizadas

- `Company` - Empresa
- `Store` - Tiendas de la empresa
- `Order` - Órdenes/Ventas
- `Item` - Productos
- `User` - Usuarios/Clientes

**Relaciones:**
```
Company (1) → (N) Store
Store (1) → (N) Item (productos)
Store (1) → (N) Order (ventas)
Order (N) → (1) User (cliente)
```

---

## 🧪 Ejemplos de Uso

### **Desde Flutter (Dart):**

```dart
// 1. Obtener estadísticas
final response = await http.get(
  Uri.parse('$baseUrl/companies/$companyId/dashboard/stats'),
  headers: {
    'Authorization': 'Bearer $accessToken',
    'X-App-Platform': 'TuLojitaBusiness/1.0',
  },
);

final stats = DashboardStatsDto.fromJson(jsonDecode(response.body));

// 2. Obtener ventas recientes
final salesResponse = await http.get(
  Uri.parse('$baseUrl/companies/$companyId/dashboard/recent-sales?limit=5'),
  headers: {
    'Authorization': 'Bearer $accessToken',
    'X-App-Platform': 'TuLojitaBusiness/1.0',
  },
);

// 3. Obtener resumen de tiendas
final storesResponse = await http.get(
  Uri.parse('$baseUrl/companies/$companyId/dashboard/stores-summary'),
  headers: {
    'Authorization': 'Bearer $accessToken',
    'X-App-Platform': 'TuLojitaBusiness/1.0',
  },
);
```

---

## 🚀 Performance

### **Optimizaciones Implementadas:**

1. ✅ **Queries optimizadas** con QueryBuilder
2. ✅ **Agregaciones en BD** (SUM, COUNT)
3. ✅ **Relaciones cargadas selectivamente** (solo las necesarias)
4. ✅ **Cálculos en memoria** minimizados
5. ✅ **Índices recomendados:**
   - `stores.companyId`
   - `orders.storeId`
   - `orders.status`
   - `orders.createdAt`
   - `items.storeId`

---

## 📝 Notas Importantes

1. **Moneda:** Actualmente hardcodeado a USD, pero el campo está preparado para múltiples monedas
2. **Timezone:** Todas las fechas en UTC, el frontend debe convertir a timezone local
3. **Status de Órdenes:** Solo se cuentan órdenes con status `FULLY_PAID` para ventas
4. **Clientes:** Se cuentan usuarios únicos que han realizado al menos una orden
5. **Productos:** Se cuentan todos los items activos de todas las tiendas

---

## 🔄 Próximas Mejoras Sugeridas

1. **Caché:** Implementar Redis para cachear stats (TTL: 5 minutos)
2. **Paginación:** Agregar paginación a stores-summary si hay muchas tiendas
3. **Filtros:** Agregar filtros por fecha en recent-sales
4. **Gráficas:** Endpoint para datos de gráficas (ventas por día/semana/mes)
5. **Comparativas:** Comparar con periodos anteriores (mes pasado, año pasado)

---

## ✅ Checklist de Implementación

- [x] DTOs creados
- [x] Servicio implementado
- [x] Controlador creado
- [x] Rutas registradas en módulo
- [x] Validación de seguridad
- [x] Queries optimizadas
- [ ] Tests unitarios
- [ ] Tests de integración
- [ ] Documentación Swagger
- [ ] Probar con datos reales

---

## 🎯 Cómo Probar

1. **Crear datos de prueba:**
   - 1 empresa
   - 2-3 tiendas
   - 10-15 productos
   - 5-10 órdenes completadas

2. **Obtener token JWT:**
   ```bash
   POST /api/v1/auth/google
   ```

3. **Probar endpoints:**
   ```bash
   # Stats
   GET /api/v1/companies/{companyId}/dashboard/stats
   
   # Recent Sales
   GET /api/v1/companies/{companyId}/dashboard/recent-sales?limit=5
   
   # Stores Summary
   GET /api/v1/companies/{companyId}/dashboard/stores-summary
   ```

---

**¡Endpoints listos para usar! 🚀**
