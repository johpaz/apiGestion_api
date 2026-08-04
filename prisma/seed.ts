import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

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
    await prisma.patologiaSanitaria.upsert({
      where: { codigo },
      create: { codigo, nombre, agente, declaracionObligatoria },
      update: { nombre, agente, declaracionObligatoria, activa: true },
    });
  }
  console.log('✅ Catálogo sanitario actualizado');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@apicolmena.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const adminName = process.env.ADMIN_NAME || 'Administrador';

  // Verificar si ya existe un administrador
  const existingAdmin = await prisma.usuario.findFirst({
    where: { rol: 'administrador' }
  });

  if (existingAdmin) {
    console.log('✅ Ya existe un administrador en el sistema');
    console.log(`   Email: ${existingAdmin.email}`);
    await prisma.$disconnect();
    return;
  }

  // Crear el primer administrador
  const hashedPassword = await Bun.password.hash(adminPassword);

  const admin = await prisma.usuario.create({
    data: {
      nombre: adminName,
      email: adminEmail,
      password: hashedPassword,
      rol: 'administrador',
      activo: true,
      moneda: 'COP',
      colmenasAsignadas: []
    }
  });

  console.log('✅ Administrador creado exitosamente');
  console.log(`   Email: ${admin.email}`);
  console.log(`   Nombre: ${admin.nombre}`);
  console.log(`   Rol: ${admin.rol}`);
  console.log('');
  console.log('⚠️  Cambia la contraseña por defecto después del primer login');

  await prisma.$disconnect();
}

seed().catch((error) => {
  console.error('❌ Error en seed:', error);
  process.exit(1);
});
