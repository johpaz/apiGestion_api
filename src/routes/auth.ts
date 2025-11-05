import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';
import { ApiResponse, AuthResponse, LoginRequest, RegisterRequest, Usuario } from '../types/apicola';
import { auth as firebaseAuth } from '../firebase';
import logger from '../utils/logger';
import prisma from '../prisma/client';

// Función para hashear contraseñas usando Bun.password
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

// Función para comparar contraseñas usando Bun.password
async function comparePassword(password: string, storedHash: string): Promise<boolean> {
  return await Bun.password.verify(password, storedHash);
}

const authRoutes = new Elysia({ prefix: '/auth' });

// Login endpoint
authRoutes.post('/login', async ({ body }) => {
  try {
    const { email, password }: LoginRequest = body as LoginRequest;

    // Find user in database
    const user = await prisma.usuario.findUnique({
      where: {
        email: email,
        activo: true
      }
    });

    if (!user) {
      return {
        success: false,
        error: 'Credenciales inválidas'
      } as ApiResponse;
    }

    // Compare password with hashed password from database
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      return {
        success: false,
        error: 'Credenciales inválidas'
      } as ApiResponse;
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre,
      moneda: user.moneda
    }, jwtSecret);

    // Update last access in database
    await prisma.usuario.update({
      where: { id: user.id },
      data: { ultimoAcceso: new Date() }
    });

    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      data: {
        user: userWithoutPassword,
        token
      } as AuthResponse,
      message: 'Inicio de sesión exitoso'
    } as ApiResponse<AuthResponse>;

  } catch (error) {
    logger.error(`Login error: ${error}`);
    return {
      success: false,
      error: 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Register endpoint
authRoutes.post('/register', async ({ body }) => {
  try {
    const { nombre, email, password, rol = 'apicultor' }: RegisterRequest = body as RegisterRequest;

    // Check if user already exists
    const existingUser = await prisma.usuario.findUnique({
      where: { email }
    });
    if (existingUser) {
      return {
        success: false,
        error: 'El usuario ya existe'
      } as ApiResponse;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create new user in database
    const newUser = await prisma.usuario.create({
      data: {
        nombre,
        email,
        password: hashedPassword,
        rol,
        activo: true,
        moneda: 'COP',
        colmenasAsignadas: []
      }
    });

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
    const token = jwt.sign({
      id: newUser.id,
      email: newUser.email,
      rol: newUser.rol,
      nombre: newUser.nombre,
      moneda: newUser.moneda
    }, jwtSecret);

    const { password: _, ...userWithoutPassword } = newUser;

    return {
      success: true,
      data: {
        user: userWithoutPassword,
        token
      } as AuthResponse,
      message: 'Usuario registrado exitosamente'
    } as ApiResponse<AuthResponse>;

  } catch (error) {
    logger.error(`Register error: ${error}`);
    return {
      success: false,
      error: 'Error interno del servidor'
    } as ApiResponse;
  }
});

// Google OAuth initiation endpoint
authRoutes.get('/google-auth', () => {
  try {
    // In a real implementation, this would redirect to Google's OAuth URL
    // For now, return the OAuth URL that the frontend can use
    const clientId = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
    const redirectUri = encodeURIComponent(`${process.env.BASE_URL || 'http://localhost:5000'}/auth/google-callback`);
    const scope = encodeURIComponent('openid email profile');
    const responseType = 'code';

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=${responseType}&access_type=offline`;

    return {
      success: true,
      data: { oauthUrl },
      message: 'URL de OAuth generada'
    } as ApiResponse;
  } catch (error) {
    logger.error(`Google auth error: ${error}`);
    return {
      success: false,
      error: 'Error al generar URL de OAuth'
    } as ApiResponse;
  }
});

// Google OAuth callback endpoint
authRoutes.post('/google-callback', async ({ body, headers }) => {
  try {
    logger.info('Recibida solicitud POST /google-callback');
    logger.info({ body }, 'Body recibido');
    logger.info({ headers: Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase().includes('origin') || k.toLowerCase().includes('referer'))) }, 'Headers relevantes');

    const { idToken }: { idToken: string } = body as { idToken: string };

    logger.info({ idTokenPresente: !!idToken }, 'ID Token presente');

    if (!idToken) {
      logger.info('Token de ID no proporcionado');
      return {
        success: false,
        error: 'Token de ID requerido'
      } as ApiResponse;
    }

    // Verify the ID token with Firebase Admin
    logger.info({ firebaseAuthDisponible: !!firebaseAuth }, 'Verificando Firebase Auth disponible');
    if (!firebaseAuth) {
      logger.info('Firebase Auth no disponible');
      return {
        success: false,
        error: 'Firebase Auth no está disponible'
      } as ApiResponse;
    }

    logger.info('Verificando ID Token con Firebase');
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    logger.info({ uid: decodedToken.uid, email: decodedToken.email }, 'Token decodificado exitosamente');

    // Extract user information
    const { uid, email, name, picture } = decodedToken;

    // Check if user exists in our system
    let user = await prisma.usuario.findUnique({
      where: {
        email: email!
      }
    });
    logger.info({ userExists: !!user, email }, 'Verificando existencia de usuario en base de datos');

    if (!user) {
      // Create new user from Google OAuth
      user = await prisma.usuario.create({
        data: {
          id: uid,
          nombre: name || email!.split('@')[0],
          email: email!,
          password: '', // No password for OAuth users
          rol: 'apicultor',
          activo: true,
          moneda: 'COP',
          colmenasAsignadas: [],
          fechaRegistro: new Date(),
          ultimoAcceso: new Date()
        }
      });
      logger.info({ userId: user.id, email: user.email }, 'Usuario creado exitosamente en base de datos');
    } else {
      // Check if user is active
      if (!user.activo) {
        logger.info({ userId: user.id, email: user.email }, 'Usuario inactivo intentando acceder');
        return {
          success: false,
          error: 'Cuenta de usuario inactiva'
        } as ApiResponse;
      }

      // Update user data and last access for synchronization
      const updateData: any = { ultimoAcceso: new Date() };
      if (name && name !== user.nombre) {
        updateData.nombre = name;
      }
      user = await prisma.usuario.update({
        where: { id: user.id },
        data: updateData
      });
      logger.info({ userId: user.id, email: user.email }, 'Usuario existente actualizado en base de datos');
    }

    // Generate our own JWT token
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre,
      moneda: user.moneda
    }, jwtSecret);
    logger.info({ tokenGenerated: !!token, tokenLength: token.length }, 'JWT token generado exitosamente');

    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      data: {
        user: userWithoutPassword,
        token
      } as AuthResponse,
      message: 'Inicio de sesión con Google exitoso'
    } as ApiResponse<AuthResponse>;

  } catch (error) {
    logger.info({ error }, 'Error en Google callback');
    logger.error(`Google callback error: ${error}`);
    return {
      success: false,
      error: 'Error al procesar autenticación de Google'
    } as ApiResponse;
  }
});

// Verify token endpoint
authRoutes.get('/verify', async ({ headers }) => {
  const authHeader = headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return {
      success: false,
      error: 'Token requerido'
    } as ApiResponse;
  }

  try {
    // Decode token header to check algorithm
    const decodedHeader = jwt.decode(token, { complete: true });
    let decoded: any;

    if (decodedHeader?.header?.alg === 'RS256') {
      // RS256: Firebase token
      if (!firebaseAuth) {
        return {
          success: false,
          error: 'Firebase Auth no está disponible'
        } as ApiResponse;
      }

      const firebaseDecoded = await firebaseAuth.verifyIdToken(token);

      // Find user in database by email
      const user = await prisma.usuario.findUnique({
        where: {
          email: firebaseDecoded.email!,
          activo: true
        }
      });

      if (!user) {
        return {
          success: false,
          error: 'Usuario no encontrado'
        } as ApiResponse;
      }

      decoded = {
        id: user.id,
        email: user.email,
        rol: user.rol,
        nombre: user.nombre,
        moneda: user.moneda,
        activo: user.activo,
        fechaRegistro: user.fechaRegistro,
        ultimoAcceso: user.ultimoAcceso,
        colmenasAsignadas: user.colmenasAsignadas,
        alertasActivadas: user.alertasActivadas,
        notificacionesEmail: user.notificacionesEmail,
        idioma: user.idioma
      };

    } else {
      // HS256: Our own JWT
      const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
      decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    }

    return {
      success: true,
      data: decoded,
      message: 'Token válido'
    } as ApiResponse;
  } catch (err) {
    return {
      success: false,
      error: 'Token inválido'
    } as ApiResponse;
  }
});

export default authRoutes;