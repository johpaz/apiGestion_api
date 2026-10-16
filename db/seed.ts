import { sql, insert, upsert } from '../src/db';

async function seed() {
  console.log('🌱 Ejecutando seed...');

  const patologias = [
    ['loque-americana', 'Loque americana', 'Paenibacillus larvae', true],
    ['loque-europea', 'Loque europea', 'Melissococcus plutonius', true],
    ['tropilaelaps', 'Infestación por Tropilaelaps', 'Tropilaelaps spp.', true],
    ['acarapidosis', 'Acarapidosis', 'Acarapis woodi', true],
    ['varroosis', 'Varroosis', 'Varroa destructor', true],
    ['aethiniosis', 'Aethiniosis', 'Aethina tumida', true],
    ['nosemosis', 'Nosemosis', 'Nosema spp.', false],
    ['ascosferosis', 'Ascosferosis', 'Ascosphaera apis', false],
    ['sindrome-colapso', 'Síndrome de colapso de colonias', null, false],
    ['otra', 'Otra sospecha sanitaria', null, false],
  ] as const;

  for (const [codigo, nombre, agente, declaracionObligatoria] of patologias) {
    await upsert(
      'patologias_sanitarias',
      ['codigo'],
      { codigo, nombre, agente, declaracionObligatoria },
      { nombre, agente, declaracionObligatoria, activa: true },
    );
  }
  console.log('✅ Catálogo sanitario actualizado');

  // En producción el administrador solo se crea si defines su contraseña (nunca con la de ejemplo)
  if (process.env.NODE_ENV === 'production' && !(process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD)) {
    console.log('ℹ️  SUPER_ADMIN_PASSWORD no definida: se omite la creación del administrador');
    await sql.close();
    return;
  }

  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@apicolmena.com').trim();
  const adminPassword = (process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'Admin123!').trim();
  const adminName = process.env.ADMIN_NAME || 'Administrador';

  // Verificar si ya existe un administrador
  const [existingAdmin] = await sql`SELECT email FROM usuarios WHERE rol = 'administrador' LIMIT 1`;

  if (existingAdmin) {
    console.log('✅ Ya existe un administrador en el sistema');
    console.log(`   Email: ${existingAdmin.email}`);
    await sql.close();
    return;
  }

  // Crear el primer administrador
  const hashedPassword = await Bun.password.hash(adminPassword);

  const admin = await insert('usuarios', {
    nombre: adminName,
    email: adminEmail,
    password: hashedPassword,
    rol: 'administrador',
    activo: true,
    moneda: 'COP',
    colmenasAsignadas: [],
  });

  console.log('✅ Administrador creado exitosamente');
  console.log(`   Email: ${admin.email}`);
  console.log(`   Nombre: ${admin.nombre}`);
  console.log(`   Rol: ${admin.rol}`);
  console.log('');
  console.log('⚠️  Cambia la contraseña por defecto después del primer login');

  await sql.close();
}

seed().catch((error) => {
  console.error('❌ Error en seed:', error);
  process.exit(1);
});
