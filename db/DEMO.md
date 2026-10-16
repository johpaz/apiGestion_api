# Cuenta de demostración visual

Desde `Api`, con la base de desarrollo y Firebase configurados:

```bash
DEMO_PASSWORD='elige-una-clave-de-al-menos-12-caracteres' bun run db:seed:demo
```

Crea `demo.visual@apicolmena.test` con rol `apicultor` en Firebase y en PostgreSQL local. La contraseña se toma de `DEMO_PASSWORD` al crear la cuenta. Si ya existe, conserva su contraseña y sus registros: volver a ejecutar el comando agrega únicamente los datos que falten.

Incluye cuatro apiarios, 32 colmenas, ocho núcleos con donantes, conversión y venta trazables, seis enjambres, inspecciones, casos sanitarios, doce meses de producción y ventas, inventario con movimientos, alertas y actividad reciente. Los nombres y observaciones identifican los registros como ficticios. Las notificaciones por correo y las alertas recurrentes de estas entidades están desactivadas.

El script utiliza una transacción para los registros de PostgreSQL, no borra datos y rechaza bases remotas o entornos de producción. La cuenta de Firebase se crea antes de esa transacción; si falla la carga, corrige el error y vuelve a ejecutar el comando con la misma contraseña.

Para recorrer el panel administrativo, usa tu cuenta de administrador existente: sus indicadores globales también incluyen los datos demo.

### Vista pública `/demo`

Desde `Api/`, ejecuta `bun db/export-demo.ts` para actualizar `front/src/data/demo-snapshot.json` después de modificar la cuenta demo. La exportación incluye únicamente campos operativos de la cuenta ficticia `demo-visual-apicolmena-v1`, sin credenciales, contactos ni identificadores de usuario. La página indica la fecha de corte y funciona sin sesión ni conexión al backend.

### Carga mediante la API de producción

Configura la URL de destino sin cambiar `DATABASE_URL` local:

```bash
DEMO_API_URL=https://apicolmena.srv991465.hstgr.cloud/api/v1 bun db/upload-demo-api.ts
DEMO_API_URL=https://apicolmena.srv991465.hstgr.cloud/api/v1 bun db/upload-demo-api.ts --apply
```

El primer comando muestra el plan. El segundo autentica únicamente la identidad Firebase de la cuenta demo, vincula las nuevas entidades con sus IDs remotos y omite registros existentes mediante nombres, códigos, lotes o marcas de importación. No reintenta automáticamente escrituras que fallen: se puede volver a ejecutar para consultar qué registros llegaron antes de continuar. El origen se limita a la cuenta y al prefijo del seed, excluyendo pruebas manuales posteriores.

La API genera la actividad y algunos avisos recurrentes al crear entidades. Las alertas manuales altas se importan con prioridad media para evitar enviar correos desde esos endpoints; las preferencias de correo de la cuenta demo se desactivan. Los registros anulados se excluyen. La API no permite cargar el catálogo privado de productos ni los campos de reina/cuadros, y establece las fechas de casos y movimientos al crearlos. El caso histórico de sacrificio se omite porque exige evidencia fotográfica que no está disponible. Las conversiones y ventas de núcleos se ejecutan mediante sus endpoints para conservar trazabilidad y evitar duplicar colmenas o ingresos.

El frontend usa `front/.env.production` con `VITE_API_URL` para apuntar a este servidor al compilar en modo producción. El entorno de desarrollo conserva la API local.
