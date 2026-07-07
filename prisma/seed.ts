import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Ejecutando seed...');

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
  const hashedPassword = await hashPassword(adminPassword);

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
