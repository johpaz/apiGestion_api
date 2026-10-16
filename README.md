# ApiGestión Pro - Backend API

Backend API en TypeScript con Express para la plataforma de gestión apícola profesional.

## 🚀 Características

- **TypeScript**: Tipado fuerte y desarrollo moderno
- **Express.js**: Framework web rápido y minimalista
- **JWT Authentication**: Autenticación segura con tokens
- **Validación de datos**: Validación robusta con express-validator
- **Middleware de seguridad**: Helmet, CORS, rate limiting
- **Estructura modular**: Código organizado y mantenible
- **Mock data**: Datos de prueba para desarrollo

## 📁 Estructura del proyecto

```
Api/
├── src/
│   ├── db/              # Conexión Bun.SQL, helpers, enums y migrador
│   ├── middleware/      # Middleware personalizado
│   ├── routes/          # Rutas de la API
│   ├── types/           # Definiciones de tipos TypeScript
│   ├── utils/           # Utilidades y datos mock
│   └── server.ts        # Servidor principal
├── db/
│   ├── migrations/      # Migraciones SQL (<fecha>_<nombre>/migration.sql)
│   └── seed.ts          # Catálogo sanitario + primer administrador
├── dist/                # Código compilado
├── package.json
├── tsconfig.json
└── README.md
```

## 🛠️ Instalación

1. **Instalar dependencias:**
```bash
cd Api
npm install
```

2. **Configurar variables de entorno:**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

3. **Levantar la base de datos (contenedor Postgres) y migrar:**
```bash
docker compose -f docker-compose.local.yml up -d db   # Postgres en localhost:5433
bun run db:migrate                                     # aplica db/migrations
bun run db:seed                                        # opcional: catálogo y admin inicial
```

4. **Ejecutar en desarrollo:**
```bash
bun run dev
```

5. **Compilar para producción:**
```bash
npm run build
npm start
```

### Migraciones

Sin ORM: la base se maneja con `Bun.SQL` y migraciones SQL propias. `bun run db:migrate`
aplica en orden las carpetas de `db/migrations` y registra cada una en `_prisma_migrations`
(misma tabla que usaba Prisma, por lo que las bases existentes no se re-migran). El contenedor
ejecuta este paso automáticamente en `entrypoint.sh` antes de iniciar la API.

### Despliegue con Docker

La imagen se publica en Docker Hub como `johpaz/apigestion-api:<tag>` (el tag `latest` es la versión anterior; no se sobrescribe).

```bash
# 1. Construir y publicar (formato docker para conservar el HEALTHCHECK)
podman build --format docker -t johpaz/apigestion-api:<tag> .
podman push johpaz/apigestion-api:<tag>

# 2. En el servidor: definir .env (ver .env.example) y levantar
API_TAG=<tag> docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` levanta Postgres (red interna `backend`, sin puertos publicados) y la API
(publicada por Traefik en `APICOLMENA_DOMAIN` vía la red externa `n8n_evoapi`). Al arrancar, el
contenedor migra la base, siembra el catálogo y crea el administrador inicial
(`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`). Para actualizar: cambia `API_TAG` y repite el `up -d`.
Para desarrollo local usa `docker-compose.local.yml`.

Para un cambio de esquema, crea `db/migrations/<AAAAMMDDHHMMSS>_<nombre>/migration.sql`; nunca
edites una migración ya aplicada (el migrador avisa si su contenido cambió).

## 📚 Endpoints de la API

### Autenticación
- `POST /api/v1/auth/login` - Iniciar sesión
- `POST /api/v1/auth/register` - Registrar usuario
- `GET /api/v1/auth/verify` - Verificar token

### Colmenas
- `GET /api/v1/colmenas` - Obtener colmenas del usuario
- `GET /api/v1/colmenas/:id` - Obtener colmena específica
- `POST /api/v1/colmenas` - Crear nueva colmena
- `PUT /api/v1/colmenas/:id` - Actualizar colmena
- `DELETE /api/v1/colmenas/:id` - Eliminar colmena

### Inspecciones Sanitarias
- `GET /api/v1/inspecciones` - Obtener inspecciones
- `GET /api/v1/inspecciones/colmena/:id` - Inspecciones por colmena
- `POST /api/v1/inspecciones` - Crear inspección
- `PUT /api/v1/inspecciones/:id` - Actualizar inspección

### Enjambres
- `GET /api/v1/enjambres` - Obtener enjambres
- `POST /api/v1/enjambres` - Registrar enjambre
- `PUT /api/v1/enjambres/:id` - Actualizar enjambre

### Núcleos
- `GET /api/v1/nucleos` - Obtener núcleos
- `POST /api/v1/nucleos` - Registrar núcleo

### Producción
- `GET /api/v1/produccion` - Obtener registros de producción
- `GET /api/v1/produccion/colmena/:id` - Producción por colmena
- `POST /api/v1/produccion` - Registrar producción

### Finanzas
- `GET /api/v1/finanzas` - Obtener registros financieros
- `GET /api/v1/finanzas/resumen` - Resumen financiero
- `POST /api/v1/finanzas` - Crear registro financiero

### Dashboard
- `GET /api/v1/dashboard/stats` - Estadísticas del dashboard
- `GET /api/v1/dashboard/activities` - Actividades recientes

### Usuarios (Admin)
- `GET /api/v1/usuarios` - Obtener todos los usuarios
- `GET /api/v1/usuarios/profile` - Perfil del usuario actual
- `PATCH /api/v1/usuarios/:id/status` - Actualizar estado de usuario

## 🔐 Autenticación

La API utiliza JWT (JSON Web Tokens) para autenticación. Incluye el token en el header:

```
Authorization: Bearer <tu-jwt-token>
```

### Credenciales de prueba:
- **Email**: `juan@apicultor.com`
- **Password**: `password123`
- **Rol**: apicultor

- **Email**: `maria@admin.com`
- **Password**: `password123`
- **Rol**: administrador

## 📝 Validación de datos

La API incluye validación robusta para todos los endpoints:

- **Colmenas**: Número, fechas, estado válido
- **Inspecciones**: Datos sanitarios, patologías
- **Enjambres**: Código único, ubicación, estado de reina
- **Núcleos**: Números de cuadros, fechas de trasliego
- **Producción**: Kg de miel, calidad, temporada

## 🛡️ Seguridad

- **Helmet**: Headers de seguridad HTTP
- **CORS**: Control de acceso entre dominios
- **Rate Limiting**: Límite de solicitudes por IP
- **JWT**: Tokens seguros con expiración
- **Validación**: Sanitización de datos de entrada

## 🔧 Configuración

Variables de entorno importantes:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=tu-clave-secreta-jwt
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
```

## 🚀 Próximas funcionalidades

- [ ] Integración con base de datos (PostgreSQL/MongoDB)
- [ ] Upload de archivos (imágenes de colmenas)
- [ ] Notificaciones push
- [ ] Exportación de reportes (PDF/Excel)
- [ ] API de geolocalización
- [ ] Integración con servicios meteorológicos
- [ ] Sistema de backup automático

## 🧪 Testing

```bash
npm test
```

## 📊 Health Check

Verifica que la API esté funcionando:

```bash
curl http://localhost:3001/health
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles.
## 🐝 Asistente de IA (Hive SDK + Gemini + A2UI + MCP v2)

- **Enjambres por rol** (`src/ai/swarm.ts`): cada usuario tiene su propia colmena de agentes en HiveDB (un inquilino por usuario).
  Apicultor: Maestra + Campo, Sanidad y Negocio. Administrador: Coordinadora + Usuarios y Vigilancia. No se instalan los agentes de fábrica del SDK.
- **Modelo**: `gemini/gemini-3.8-flash` con la API key de **cada** apicultor (`PUT /api/v1/ai/api-key`, cifrada con AES-256-GCM en `HIVE_HOME`).
- **Herramientas** (`src/ai/tools.ts`): solo lectura, filtradas por el usuario del token. Las `admin_*` exigen rol administrador.
- **UI rica**: el agente llama `ui_mostrar` y el servidor emite superficies **A2UI v0.8** (SSE `event: a2ui`) con métricas, tablas y gráficas.
- **MCP v2**: `POST /api/v1/mcp/v2` (Streamable HTTP, `Authorization: Bearer <JWT>`): tools de tu rol + skills como prompts.
- **Chat**: `POST /api/v1/ai/chat` (SSE; `Accept: application/json` para respuesta única). Estado: `GET /api/v1/ai/estado`.
- **Despliegue**: `HIVE_HOME` debe ser un volumen persistente (ya configurado en los compose). Requiere Bun ≥ 1.4.2. No funciona en Vercel serverless.
- **Pruebas**: `bun test` (la integración simula Gemini y Postgres).
