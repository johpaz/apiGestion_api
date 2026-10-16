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
