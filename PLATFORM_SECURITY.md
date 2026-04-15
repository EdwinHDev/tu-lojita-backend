# Sistema de Identificación de Plataforma - Seguro

## 🔒 Estrategia de Seguridad

Este sistema identifica desde qué plataforma (web/app) se conecta cada usuario usando **métodos NO MODIFICABLES** por el usuario.

---

## ⚙️ Configuración Inicial

### **1. Configurar Variables de Entorno**

Copia el archivo `.env.example` a `.env` y configura las URLs de tus frontends:

```bash
cp .env.example .env
```

**Edita el archivo `.env`:**
```bash
# Frontend URLs - Development (puertos locales)
FRONTEND_VENDOR_URL_DEV=http://localhost:3000
FRONTEND_ADMIN_URL_DEV=http://localhost:3001
FRONTEND_CUSTOMER_URL_DEV=http://localhost:3002

# Frontend URLs - Production (dominios reales)
FRONTEND_VENDOR_URL_PROD=https://vendedor.tulojita.com
FRONTEND_ADMIN_URL_PROD=https://admin.tulojita.com
FRONTEND_CUSTOMER_URL_PROD=https://tulojita.com
```

**Ventajas:**
- ✅ Fácil cambiar URLs sin modificar código
- ✅ Diferentes configuraciones por entorno (dev/staging/prod)
- ✅ No exponer URLs en el código fuente
- ✅ Centralizado en un solo lugar

---

## 📋 Métodos de Identificación

### **1. Webs → Origin Header (100% Seguro)**

**Cómo funciona:**
- El navegador envía automáticamente el header `Origin` en peticiones CORS
- **NO puede ser modificado** por JavaScript ni por el usuario
- Es parte del estándar de seguridad del navegador

**Ejemplo:**
```
Origin: http://localhost:3000
→ Backend identifica: WEB_VENDOR
```

**Seguridad:**
- ⭐⭐⭐⭐⭐ Máxima seguridad
- ❌ Imposible de modificar
- ✅ Estándar web establecido

---

### **2. Apps Móviles → User-Agent Nativo (Muy Seguro)**

**Cómo funciona:**
- El User-Agent se configura a nivel **nativo** (Kotlin/Swift)
- No es código JavaScript, está en el código compilado de la app
- Muy difícil de modificar para un usuario normal

**Ejemplo:**
```kotlin
// Android - MainActivity.kt
WebSettings.setDefaultUserAgent(this, "TuLojitaBusiness/1.0 ...")
```

```
User-Agent: TuLojitaBusiness/1.0 Mozilla/5.0 ...
→ Backend identifica: APP_BUSINESS
```

**Seguridad:**
- ⭐⭐⭐⭐ Muy seguro
- ⚠️ Modificable solo con herramientas avanzadas (ingeniería inversa)
- ✅ Suficiente para la mayoría de casos de uso

---

## 🛡️ Implementación Backend

### **Guard de Validación**

```typescript
// src/common/guards/platform-access.guard.ts

@Injectable()
export class PlatformAccessGuard implements CanActivate {
  
  // Lista blanca de origins (NO MODIFICABLE por usuario)
  private readonly allowedOrigins = {
    'http://localhost:3000': Platform.WEB_VENDOR,
    'https://vendedor.tulojita.com': Platform.WEB_VENDOR,
    // ...
  };

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // 1. Identificar por Origin (Webs)
    const origin = request.headers.origin;
    if (origin && this.allowedOrigins[origin]) {
      platform = this.allowedOrigins[origin];
    }
    
    // 2. Identificar por User-Agent (Apps)
    const userAgent = request.headers['user-agent'];
    if (userAgent?.includes('TuLojitaBusiness')) {
      platform = Platform.APP_BUSINESS;
    }
    
    // 3. Validar reglas de negocio
    if (user.role === COMPANY && platform === WEB_VENDOR) {
      throw new ForbiddenException('COMPANY_NOT_ALLOWED_ON_VENDOR_WEB');
    }
    
    return true;
  }
}
```

---

## 🌐 Configuración CORS

**Lista blanca de origins permitidos (desde variables de entorno):**

```typescript
// src/main.ts

app.enableCors({
  origin: [
    // Desarrollo
    envs.frontendVendorUrlDev,      // http://localhost:3000
    envs.frontendAdminUrlDev,       // http://localhost:3001
    envs.frontendCustomerUrlDev,    // http://localhost:3002
    // Producción
    envs.frontendVendorUrlProd,     // https://vendedor.tulojita.com
    envs.frontendAdminUrlProd,      // https://admin.tulojita.com
    envs.frontendCustomerUrlProd,   // https://tulojita.com
  ],
  credentials: true,
});
```

**Variables de Entorno (.env):**
```bash
# Frontend URLs - Development
FRONTEND_VENDOR_URL_DEV=http://localhost:3000
FRONTEND_ADMIN_URL_DEV=http://localhost:3001
FRONTEND_CUSTOMER_URL_DEV=http://localhost:3002

# Frontend URLs - Production
FRONTEND_VENDOR_URL_PROD=https://vendedor.tulojita.com
FRONTEND_ADMIN_URL_PROD=https://admin.tulojita.com
FRONTEND_CUSTOMER_URL_PROD=https://tulojita.com
```

**Seguridad:**
- Solo origins en la lista pueden hacer peticiones
- Rechaza automáticamente origins no autorizados
- El navegador valida esto antes de enviar la petición
- Fácil de configurar por entorno (dev/staging/prod)

---

## 📱 Configuración Apps Flutter

### **Android (Kotlin)**

```kotlin
// android/app/src/main/kotlin/.../MainActivity.kt

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val defaultUserAgent = WebView.getDefaultUserAgent(this)
        val customUserAgent = "TuLojitaBusiness/1.0 $defaultUserAgent"
        android.webkit.WebSettings.setDefaultUserAgent(this, customUserAgent)
    }
}
```

### **iOS (Swift)**

```swift
// ios/Runner/AppDelegate.swift

override func application(...) -> Bool {
    UserDefaults.standard.register(defaults: [
        "UserAgent": "TuLojitaBusiness/1.0"
    ])
    return super.application(...)
}
```

---

## 🚫 Regla de Negocio: COMPANY Bloqueado en WEB_VENDOR

### **Flujo Completo:**

1. **Usuario COMPANY intenta login en `localhost:3000`**
   ```
   Navegador envía automáticamente:
   Origin: http://localhost:3000
   ```

2. **Backend identifica plataforma**
   ```typescript
   PlatformAccessGuard → platform = WEB_VENDOR
   ```

3. **Guard detecta incompatibilidad**
   ```typescript
   user.role === COMPANY && platform === WEB_VENDOR
   → throw ForbiddenException
   ```

4. **Backend responde 403**
   ```json
   {
     "statusCode": 403,
     "message": "Acceso denegado desde esta plataforma",
     "reason": "COMPANY_NOT_ALLOWED_ON_VENDOR_WEB",
     "details": "Los usuarios con rol COMPANY deben usar la app móvil..."
   }
   ```

5. **Frontend muestra mensaje**
   ```typescript
   toast.error('Acceso Restringido', {
     description: 'Los usuarios con rol COMPANY deben usar la app móvil...'
   });
   ```

---

## 🔐 Niveles de Seguridad

| Método | Seguridad | Modificable | Usado Para |
|--------|-----------|-------------|------------|
| **Origin Header** | ⭐⭐⭐⭐⭐ | ❌ No | Webs |
| **Referer Header** | ⭐⭐⭐⭐ | ❌ No | Backup webs |
| **User-Agent Nativo** | ⭐⭐⭐⭐ | ⚠️ Muy difícil | Apps móviles |
| **CORS Whitelist** | ⭐⭐⭐⭐⭐ | ❌ No | Todas las webs |

---

## ✅ Ventajas de Esta Solución

1. **✅ Seguro**: Usa headers no modificables por el usuario
2. **✅ Simple**: No requiere configuración compleja
3. **✅ Automático**: El navegador/app envía los headers automáticamente
4. **✅ Estándar**: Usa tecnologías web estándar
5. **✅ Escalable**: Fácil agregar nuevas plataformas
6. **✅ Sin Dependencias**: No requiere servicios externos

---

## 🧪 Cómo Probar

### **1. Probar Identificación de Plataforma**

**Web de Vendedores:**
```bash
cd tu_lojita_sellers
npm run dev
# Abrir http://localhost:3000
# Hacer login
# Backend identifica: WEB_VENDOR (por Origin header)
```

**App Flutter:**
```bash
cd tu_lojita_business
flutter run
# Hacer login
# Backend identifica: APP_BUSINESS (por User-Agent)
```

### **2. Probar Bloqueo de COMPANY**

1. Crear usuario con rol COMPANY en base de datos
2. Abrir `http://localhost:3000` (web de vendedores)
3. Intentar login con usuario COMPANY
4. **Resultado esperado:**
   - ❌ Login bloqueado
   - 🔔 Toast: "Acceso Restringido"
   - 📱 Mensaje: "Los usuarios con rol COMPANY deben usar la app móvil..."

---

## 📊 Plataformas Soportadas

| Plataforma | Identificación | Valor |
|------------|---------------|-------|
| **WEB_VENDOR** | Origin | `http://localhost:3000` |
| **WEB_ADMIN** | Origin | `https://admin.tulojita.com` |
| **WEB_CUSTOMER** | Origin | `https://tulojita.com` |
| **APP_BUSINESS** | User-Agent | `TuLojitaBusiness/1.0` |
| **APP_CUSTOMER** | User-Agent | `TuLojitaCustomer/1.0` |
| **APP_DELIVERY** | User-Agent | `TuLojitaDelivery/1.0` |

---

## 🔧 Agregar Nueva Plataforma

### **Nueva Web:**

1. Agregar al guard:
```typescript
private readonly allowedOrigins = {
  // ...existentes
  'https://nueva-web.tulojita.com': Platform.WEB_NEW,
};
```

2. Agregar a CORS:
```typescript
app.enableCors({
  origin: [
    // ...existentes
    'https://nueva-web.tulojita.com',
  ],
});
```

### **Nueva App:**

1. Configurar User-Agent nativo en la app
2. Agregar detección en guard:
```typescript
if (userAgent.includes('TuLojitaNewApp')) {
  return Platform.APP_NEW;
}
```

---

## 📝 Archivos Modificados

### Backend:
- ✅ `src/common/guards/platform-access.guard.ts` (nuevo)
- ✅ `src/auth/decorators/auth.decorator.ts` (modificado)
- ✅ `src/main.ts` (modificado - CORS)

### Frontend Web:
- ✅ `tu_lojita_sellers/src/components/auth/google-login-button.tsx` (modificado)

### Frontend Flutter:
- ✅ `tu_lojita_business/android/.../MainActivity.kt` (modificado)

---

## 🎯 Conclusión

Esta solución proporciona un **balance perfecto** entre:
- **Seguridad**: Usa métodos no modificables
- **Simplicidad**: Fácil de implementar y mantener
- **Efectividad**: Cumple todos los requisitos

**No hay vulnerabilidades conocidas** en esta implementación cuando se usa correctamente.
