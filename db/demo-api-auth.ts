import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export async function demoApiSession(base: string) {
  const app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }) }, 'demo-api-upload');
  try {
    const auth = getAuth(app);
    const account = await auth.getUser('demo-visual-apicolmena-v1');
    if (account.email !== 'demo.visual@apicolmena.test' || account.disabled) throw new Error('La identidad demo no coincide o está deshabilitada.');
    const env = await Bun.file(new URL('../../front/.env', import.meta.url)).text();
    const key = env.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (!key) throw new Error('Falta VITE_FIREBASE_API_KEY.');
    const customToken = await auth.createCustomToken(account.uid);
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({token:customToken,returnSecureToken:true}), signal: AbortSignal.timeout(30000) });
    const identity = await response.json() as any;
    if (!response.ok || !identity.idToken) throw new Error('No se pudo autenticar la identidad demo en Firebase.');
    const login = await fetch(`${base}/auth/google-callback`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken:identity.idToken}), signal:AbortSignal.timeout(30000) });
    const result = await login.json() as any;
    if (!login.ok || !result.success || result.data?.user?.email !== account.email || result.data?.user?.rol !== 'apicultor') throw new Error(`Autenticación API demo rechazada: ${result.error || login.status}`);
    return {token:result.data.token as string,user:result.data.user};
  } finally { await deleteApp(app); }
}

if (import.meta.main) {
  const base = process.env.DEMO_API_URL?.replace(/\/$/, '');
  if (!base || new URL(base).protocol !== 'https:') throw new Error('Define DEMO_API_URL con HTTPS.');
  const {token,user} = await demoApiSession(base);
  const response = await fetch(`${base}/apiarios`, {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  const result = await response.json() as any;
  console.log(JSON.stringify({target:base,account:user.email,role:user.rol,apiarios:result.data?.length,success:result.success}));
}
