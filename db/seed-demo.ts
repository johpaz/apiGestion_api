import { initializeApp, cert, deleteApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { sql, insert, type Executor, type Row } from '../src/db';

const PREFIX = 'demo-visual-v1';
const USER_ID = 'demo-visual-apicolmena-v1';
const EMAIL = 'demo.visual@apicolmena.test';
const NAME = 'Demo · Apiario Altoandino';
const password = process.env.DEMO_PASSWORD;
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const monthDate = (monthsAgo: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, Math.min(now.getUTCDate(), 12), 15));
const id = (kind: string, index: string | number) => `${PREFIX}-${kind}-${String(index).padStart(3, '0')}`;
const demoNote = 'DEMOSTRACIÓN: datos ficticios para explorar la plataforma; no corresponde a una operación real.';

async function main() {
  if (!password || password.length < 12) throw new Error('Define DEMO_PASSWORD con al menos 12 caracteres.');
  const database = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]', 'db'].includes(database.hostname)) {
    throw new Error('Este seed demo está limitado a bases de desarrollo locales.');
  }
  const [existing] = await sql`SELECT id, rol FROM usuarios WHERE email = ${EMAIL}`;
  if (existing && (existing.id !== USER_ID || existing.rol !== 'apicultor')) throw new Error('El correo demo ya pertenece a otra cuenta. No se modificó.');

  let firebase: App | undefined;
  try {
    firebase = initializeApp({credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })}, 'apicolmena-demo-seed');
    const auth = getAuth(firebase);
    try {
      const account = await auth.getUserByEmail(EMAIL);
      if (account.uid !== USER_ID) throw new Error('El correo demo pertenece a otra cuenta de Firebase. No se modificó.');
      if (account.disabled) throw new Error('La cuenta demo está deshabilitada en Firebase.');
    } catch (error) {
      if ((error as {code?: string}).code !== 'auth/user-not-found') throw error;
      await auth.createUser({uid: USER_ID, email: EMAIL, password, displayName: NAME, emailVerified: false});
      console.log('Cuenta demo creada en Firebase; no se enviaron correos.');
    }
    const hash = await Bun.password.hash(password);
    const created: Record<string, number> = {};
    await sql.begin(async transaction => {
      const db = transaction as unknown as Executor;
      await db`SELECT pg_advisory_xact_lock(hashtext(${PREFIX}))`;
      const ensure = async (table: string, row: Row) => {
        const [found] = await db`SELECT id FROM ${db(table)} WHERE id = ${row.id}`;
        if (found) return found;
        const result = await insert(table, row, db);
        created[table] = (created[table] || 0) + 1;
        return result;
      };
      await ensure('usuarios', {id: USER_ID, email: EMAIL, nombre: NAME, password: hash, rol: 'apicultor', activo: true, moneda: 'COP', colmenasAsignadas: [], alertasActivadas: true, notificacionesEmail: false, idioma: 'es', fechaRegistro: daysAgo(400)});

      const locations = [
        {nombre:'DEMO · El Arrayán', ciudad:'Usme', direccion:'Vereda Los Arrayanes · Bogotá rural', comoLlegar:'Ubicación ficticia de demostración: vía rural a Los Arrayanes.'},
        {nombre:'DEMO · Bosque de Niebla', ciudad:'La Calera', direccion:'Vereda El Hato · Cundinamarca', comoLlegar:'Ubicación ficticia de demostración: corredor de bosque altoandino.'},
        {nombre:'DEMO · Alto de Pasquilla', ciudad:'Ciudad Bolívar', direccion:'Vereda Pasquilla · Bogotá rural', comoLlegar:'Ubicación ficticia de demostración: vía Pasquilla, acceso por camino veredal.'},
        {nombre:'DEMO · Las Flores', ciudad:'Sumapaz', direccion:'Sector rural de Nazareth · Bogotá', comoLlegar:'Ubicación ficticia de demostración: entorno agrícola, fuera de áreas de conservación.'},
      ];
      for (const [index, location] of locations.entries()) await ensure('apiarios', {id:id('apiario',index),...location,pais:'Colombia',usuarioId:USER_ID,imagenApiario:null,fechaCreacion:daysAgo(400-index*20)});
      for (let index=0;index<32;index++) {
        await ensure('colmenas', {id:id('colmena',index),nombre:`DEMO-${String(index+1).padStart(2,'0')}`,apiarioId:id('apiario',Math.floor(index/8)),usuarioId:USER_ID,estado:index===30?'inactiva':index===29?'abandonada':index===28?'destruida':'activa',cuadros:8+index%3,reyna:index!==29&&index!==28,tipoReyna:['italiana','carniola','local'][index%3],fechaReyna:daysAgo(75+index*5),fechaInstalacion:daysAgo(index===31?45:380-index*3),alertasRecurrentesActivadas:false});
      }
      const nucleusStates = ['en_formacion','en_formacion','en_desarrollo','en_desarrollo','listo','listo','convertido','vendido'];
      for (let index=0;index<8;index++) {
        await ensure('nucleos', {id:id('nucleo',index),numero:index+1,codigo:`DEMO-NUC-${String(index+1).padStart(3,'0')}`,tipo:['division','cria_reinas','captura'][index%3],estado:nucleusStates[index],apiarioId:id('apiario',index%4),colmenaOrigenId:id('colmena',(index%4)*8),origenReina:index%2?'comprada':'criada',detalleOrigenReina:'Registro simulado de origen de reina.',proveedorReina:index%2?'Criadero DEMO Altoandino':null,fechaFormacion:daysAgo(90-index*7),fechaInstalacion:daysAgo(90-index*7),alertasRecurrentesActivadas:false});
        for(let donor=0;donor<2;donor++) await ensure('nucleos_donantes',{id:id('donante',`${index}-${donor}`),nucleoId:id('nucleo',index),colmenaId:id('colmena',(index%4)*8+donor),descripcion:'DEMO · Aporte de marco y abejas documentado.',fecha:daysAgo(90-index*7)});
        await ensure('eventos_nucleo',{id:id('evento',`${index}-creado`),nucleoId:id('nucleo',index),tipo:'creado',detalle:'DEMO · Núcleo formado y origen de reina registrado.',registradoPorId:USER_ID,fecha:daysAgo(90-index*7)});
        if(index>1) await ensure('eventos_nucleo',{id:id('evento',`${index}-estado`),nucleoId:id('nucleo',index),tipo:index===6?'convertido':index===7?'vendido':'cambio_estado',detalle:`DEMO · Estado documentado: ${nucleusStates[index]}.`,registradoPorId:USER_ID,fecha:daysAgo(index===6?45:12)});
      }
      await ensure('conversiones_nucleo',{id:id('conversion',0),nucleoId:id('nucleo',6),colmenaId:id('colmena',31),fecha:daysAgo(45),observaciones:'DEMO · Conversión documentada a colmena; no es un duplicado del núcleo.',creadoPorId:USER_ID});
      await ensure('transacciones',{id:id('venta-nucleo',0),usuarioId:USER_ID,tipo:'ingreso',descripcion:'DEMO · Venta de núcleo NUC-008',monto:380000,fecha:daysAgo(12),categoria:'Venta de núcleos',referencia:'DEMO-VNU-001',esVenta:true,producto:'Núcleo apícola',cantidad:1,unidad:'unidades',compradorNombre:'Asociación DEMO del Campo',valorTotal:380000,estadoPago:'pagado',medioPago:'Transferencia',observaciones:demoNote,origen:'venta_nucleo'});
      await ensure('ventas_nucleo',{id:id('venta-traza',0),nucleoId:id('nucleo',7),compradorNombre:'Asociación DEMO del Campo',destinoApiario:'Apiario DEMO de destino',destinoCiudad:'Choachí',fecha:daysAgo(12),monto:380000,moneda:'COP',transaccionId:id('venta-nucleo',0),creadoPorId:USER_ID});

      for(let index=0;index<6;index++) await ensure('enjambres',{id:id('enjambre',index),nombre:`DEMO · Enjambre ${['Sauce','Tilo','Arrayán','Roble','Chilco','Acacia'][index]}`,estado:['activo','activo','inactivo','dividido','fusionado','activo'][index],colmenaId:id('colmena',index+8),notas:`Captura y seguimiento simulados. ${demoNote}`,fechaCreacion:daysAgo(80-index*7),alertasRecurrentesActivadas:false});
      for(let hive=0;hive<32;hive++) for(let visit=0;visit<3;visit++) {
        const inspectionId=id('inspeccion',`${hive}-${visit}`);
        const health=visit<2?'saludable':hive===0?'enferma':hive===1?'cuarentena':hive===2?'tratada':'saludable';
        const date=daysAgo(visit===2?(hive===28?15:3+hive%6):visit===1?35+hive%7:70+hive%8);
        await ensure('inspecciones',{id:inspectionId,usuarioId:USER_ID,fecha:date,estadoSanidad:health,observaciones:`DEMO · Visita ${visit+1}: ${health==='saludable'?'población estable, postura y reservas registradas':'hallazgo simulado con seguimiento documentado'}.`,numColmenasAfectadas:health==='saludable'?0:1,posiblesEnfermedades:health==='saludable'?[]:['Sospecha simulada pendiente de confirmación'],patologiasApicolas:health==='saludable'?[]:['otra'],signosClinicos:health==='saludable'?[]:['Variación de actividad observada en escenario demo'],nucleoIds:[],proximaRevision:daysAgo(-7-hive%7)});
        await db`INSERT INTO "_ColmenaToInspeccion" ("A","B") VALUES (${id('colmena',hive)},${inspectionId}) ON CONFLICT DO NOTHING`;
      }
      for(let nucleus=0;nucleus<8;nucleus++) {
        const inspectionId=id('inspeccion-nucleo',nucleus);
        await ensure('inspecciones',{id:inspectionId,usuarioId:USER_ID,fecha:daysAgo(14+nucleus),estadoSanidad:'saludable',observaciones:'DEMO · Revisión del núcleo: postura y reservas registradas.',nucleoIds:[id('nucleo',nucleus)],posiblesEnfermedades:[],patologiasApicolas:[],signosClinicos:[],proximaRevision:daysAgo(-8)});
        await db`INSERT INTO "_NucleoToInspeccion" ("A","B") VALUES (${inspectionId},${id('nucleo',nucleus)}) ON CONFLICT DO NOTHING`;
      }
      for(let swarm=0;swarm<6;swarm++) await db`INSERT INTO "_EnjambreToInspeccion" ("A","B") VALUES (${id('enjambre',swarm)},${id('inspeccion',`${swarm+8}-2`)}) ON CONFLICT DO NOTHING`;

      const [pathology] = await db`SELECT id FROM patologias_sanitarias WHERE codigo = 'otra'`;
      if(!pathology) throw new Error('Falta el catálogo sanitario; ejecuta db:seed primero.');
      const caseStates=['abierto','en_seguimiento','cerrado_recuperado','cerrado_sacrificio','anulado'];
      const caseHives=[0,1,2,28,3];
      for(let index=0;index<caseStates.length;index++) {
        const hive=caseHives[index], target=id('objetivo',index);
        await ensure('casos_sanitarios',{id:id('caso',index),codigo:`DEMO-SAN-${String(index+1).padStart(3,'0')}`,titulo:`DEMO · ${['Observación por confirmar','Seguimiento de colonia','Recuperación documentada','Cierre histórico simulado','Registro anulado con motivo'][index]}`,descripcion:demoNote,estado:caseStates[index],gravedad:['baja','alta','media','critica','baja'][index],fechaApertura:daysAgo(index<2?2:25+index*3),proximaRevision:index<2?daysAgo(-4-index):null,fechaCierre:index===2||index===3?daysAgo(10):null,requiereNotificacionIca:false,apiarioId:id('apiario',Math.floor(hive/8)),usuarioId:USER_ID,inspeccionOrigenId:id('inspeccion',`${hive}-${index<2?2:index===4?0:1}`),patologiaId:pathology.id,anuladoAt:index===4?daysAgo(12):null,anuladoPorId:index===4?USER_ID:null,motivoAnulacion:index===4?'DEMO · Duplicado de observación en una simulación.':null});
        await ensure('casos_sanitarios_objetivos',{id:target,casoId:id('caso',index),colmenaId:id('colmena',hive)});
        await ensure('acciones_sanitarias',{id:id('accion',`${index}-observacion`),casoId:id('caso',index),tipo:'seguimiento',fecha:daysAgo(index<2?1:20),descripcion:'DEMO · Registro de observaciones y evidencia del escenario; sin prescripciones.',objetivoIds:[target],responsable:NAME,evidencias:[],registradoPorId:USER_ID});
        if(index===2||index===3) await ensure('acciones_sanitarias',{id:id('accion',`${index}-cierre`),casoId:id('caso',index),tipo:index===2?'recuperacion':'sacrificio_destruccion',fecha:daysAgo(10),descripcion:'DEMO · Cierre histórico ficticio para visualizar la trazabilidad. Ninguna acción real ejecutada.',objetivoIds:[target],responsable:NAME,evidencias:[],registradoPorId:USER_ID,metodo:index===3?'Escenario ficticio; sin ejecución real':null,disposicionFinal:index===3?'Ejemplo documental sin disposición real':null});
      }

      const season=[.62,.7,.85,1.05,1.2,1.36,1.12,.94,.8,1.02,1.28,1.43];
      for(let month=0;month<12;month++) {
        const date=monthDate(11-month);
        const harvests: Array<{kind:string;quantity:number;apiary:number}> = [];
        for(let apiary=0;apiary<4;apiary++) harvests.push({kind:'miel',quantity:Math.round((30+apiary*9)*season[month]),apiary});
        harvests.push({kind:'cera',quantity:3+month%4,apiary:month%4},{kind:'polen',quantity:5+month%5,apiary:(month+1)%4},{kind:'propoleo',quantity:1+month%3,apiary:(month+2)%4});
        for(const [index,harvest] of harvests.entries()) {
          const key=`${month}-${index}`,lot=`DEMO-${date.toISOString().slice(0,7)}-${index+1}`,unitPrice=harvest.kind==='miel'?28000:harvest.kind==='polen'?45000:harvest.kind==='cera'?32000:90000;
          await ensure('producciones',{id:id('produccion',key),usuarioId:USER_ID,apiarioId:id('apiario',harvest.apiary),colmenaId:id('colmena',harvest.apiary*8+month%6),fecha:date,tipoProducto:harvest.kind,cantidad:harvest.quantity,unidad:'kg',calidad:['Primera','Premium','Estándar'][month%3],lote:lot,destino:month%3?'Venta local':'Asociación DEMO',observaciones:demoNote});
          await ensure('productos',{id:id('producto',key),usuarioId:USER_ID,nombre:`DEMO · ${harvest.kind} ${locations[harvest.apiary].ciudad}`,tipo:harvest.kind,cantidad:harvest.quantity,unidad:'kg',precioUnitario:unitPrice,fechaProduccion:date,fechaVencimiento:new Date(date.getTime()+730*86400000),lote:lot,notas:demoNote});
          const quantity=Math.max(1,Math.round(harvest.quantity*.65)),total=quantity*unitPrice;
          const status=month<10?'pagado':index%3===0?'pendiente':index%3===1?'parcial':'pagado';
          await ensure('transacciones',{id:id('venta',key),usuarioId:USER_ID,tipo:'ingreso',descripcion:`DEMO · Venta de ${harvest.kind} · Lote ${lot}`,monto:status==='pendiente'?0:status==='parcial'?total*.5:total,fecha:date,categoria:'Venta de productos',referencia:lot,esVenta:true,producto:harvest.kind,cantidad:quantity,unidad:'kg',compradorNombre:['Tienda DEMO Campesina','Cooperativa DEMO Altoandina','Mercado DEMO de la Vereda'][index%3],valorTotal:total,estadoPago:status,medioPago:status==='pendiente'?null:month%2?'Transferencia':'Efectivo',observaciones:demoNote,origen:'manual'});
        }
        for(let expense=0;expense<2;expense++) await ensure('transacciones',{id:id('gasto',`${month}-${expense}`),usuarioId:USER_ID,tipo:'egreso',descripcion:expense?'DEMO · Transporte y mantenimiento de equipos':'DEMO · Alimentación e insumos de temporada',monto:expense?125000+month*9000:190000+month*14000,fecha:date,categoria:expense?'Operación':'Insumos',referencia:`DEMO-EG-${month}-${expense}`,esVenta:false,medioPago:'Transferencia',observaciones:demoNote});
      }

      const inventory = [
        ['cat_caja_colmena',24,8,115000],['cat_marco',120,40,8500],['cat_alza',12,6,68000],['cat_ahumador',4,2,95000],['cat_traje',4,2,180000],['cat_extractor',1,1,1850000],['cat_guantes',5,2,45000],['cat_bascula',2,1,210000],
        ['cat_envase',36,100,2200],['cat_alimento',8,20,8500],['cat_cera_estampada',0,30,5500],['cat_azucar',45,15,4200],['cat_desinfectante',8,3,22000],['cat_detergente',3,4,18000],['cat_celda_real',24,10,3500],['cat_alambre',3,2,18000],
      ] as const;
      for(const [index,[catalogId,stock,minimum,price]] of inventory.entries()) {
        const [catalog] = await db`SELECT * FROM catalogo_items_inventario WHERE id = ${catalogId}`;
        if(!catalog) throw new Error(`Falta el ítem de catálogo ${catalogId}.`);
        await ensure('insumos_apicola',{id:id('inventario',index),usuarioId:USER_ID,nombre:`DEMO · ${catalog.nombre}`,catalogoItemId:catalogId,categoria:catalog.categoria,tipoItem:catalog.tipoItem,estadoActivo:catalog.tipoItem==='activo'?(index===5?'mantenimiento':index%2?'en_uso':'disponible'):null,cantidadActual:stock,cantidadMinima:minimum,unidad:catalog.unidad,precioUnitario:price,valorMercado:price,codigoInterno:`DEMO-INV-${String(index+1).padStart(3,'0')}`,estadoStock:stock===0?'agotado':stock<minimum?'stock_bajo':stock<minimum*2?'stock_medio':'stock_bueno',porcentajeStock:Math.round(stock/minimum*100),ubicacion:locations[index%4].nombre,proveedor:'Proveedor DEMO · Datos ficticios',descripcion:demoNote,notas:demoNote});
        await ensure('movimientos_inventario',{id:id('movimiento',`${index}-entrada`),insumoId:id('inventario',index),tipo:'entrada',cantidad:stock+2,cantidadAnterior:0,cantidadNueva:stock+2,motivo:'DEMO · Entrada inicial para visualizar el historial.',registradoPorId:USER_ID,fecha:daysAgo(40)});
        await ensure('movimientos_inventario',{id:id('movimiento',`${index}-salida`),insumoId:id('inventario',index),tipo:'salida',cantidad:2,cantidadAnterior:stock+2,cantidadNueva:stock,motivo:'DEMO · Uso documentado durante jornada de campo.',registradoPorId:USER_ID,fecha:daysAgo(8)});
      }
      const notices=[
        ['sanidad','alta','Seguimiento sanitario programado','DEMO · Revisar la evolución del caso SAN-002 en la próxima visita.'],
        ['inspeccion','media','Inspección de El Arrayán','DEMO · Próxima revisión del apiario y registro de postura y reservas.'],
        ['mantenimiento','media','Extractor en mantenimiento','DEMO · Revisar el equipo antes de la siguiente jornada de cosecha.'],
        ['produccion','baja','Lotes listos para consulta','DEMO · Producción y trazabilidad de los lotes registradas.'],
        ['otros','alta','Existencias de cera agotadas','DEMO · El inventario contiene ejemplos de stock bajo y agotado.'],
        ['otros','media','Ventas por cobrar','DEMO · Hay pagos parciales y pendientes para explorar el resumen financiero.'],
        ['control_rutinario','baja','Control de núcleos','DEMO · Revisar los núcleos en formación en la siguiente jornada.'],
        ['produccion','baja','Cosecha anterior registrada','DEMO · Registro histórico de cosecha completado.'],
      ];
      for(const [index,[tipo,prioridad,titulo,mensaje]] of notices.entries()) await ensure('alertas',{id:id('alerta',index),usuarioId:USER_ID,titulo:`DEMO · ${titulo}`,mensaje,tipo,prioridad,leida:index>5,activa:true,esRecurrente:false,fechaCreacion:daysAgo(index)});
      for(let index=0;index<16;index++) await ensure('actividades',{id:id('actividad',index),usuarioId:USER_ID,tipo:['inspeccion','produccion','mantenimiento','control_rutinario'][index%4],titulo:`DEMO · ${['Visita de campo registrada','Cosecha documentada','Movimiento de inventario','Seguimiento de núcleo'][index%4]}`,descripcion:`${locations[index%4].nombre} · ${demoNote}`,entidadTipo:index%4===1?'produccion':'apiario',entidadId:index%4===1?id('produccion',`${11-index%3}-0`):id('apiario',index%4),entidadNombre:locations[index%4].nombre,estado:'success',fechaCreacion:new Date(now.getTime()-index*6*3600000)});
    });
    const [summary] = await sql`SELECT
      (SELECT count(*)::int FROM apiarios WHERE "usuarioId"=${USER_ID}) AS apiarios,
      (SELECT count(*)::int FROM colmenas WHERE "usuarioId"=${USER_ID}) AS colmenas,
      (SELECT count(*)::int FROM inspecciones WHERE "usuarioId"=${USER_ID}) AS inspecciones,
      (SELECT count(*)::int FROM nucleos WHERE "apiarioId" IN (SELECT id FROM apiarios WHERE "usuarioId"=${USER_ID})) AS nucleos,
      (SELECT count(*)::int FROM enjambres WHERE "colmenaId" IN (SELECT id FROM colmenas WHERE "usuarioId"=${USER_ID})) AS enjambres,
      (SELECT count(*)::int FROM producciones WHERE "usuarioId"=${USER_ID}) AS producciones,
      (SELECT count(*)::int FROM transacciones WHERE "usuarioId"=${USER_ID}) AS transacciones,
      (SELECT count(*)::int FROM insumos_apicola WHERE "usuarioId"=${USER_ID}) AS inventario,
      (SELECT count(*)::int FROM casos_sanitarios WHERE "usuarioId"=${USER_ID}) AS casosSanitarios,
      (SELECT count(*)::int FROM alertas WHERE "usuarioId"=${USER_ID}) AS alertas`;
    console.log(JSON.stringify({email:EMAIL,rol:'apicultor',created,summary},null,2));
  } finally {
    if(firebase) await deleteApp(firebase);
    await sql.close();
  }
}

main().catch(error=>{console.error('No se completó el seed demo:',error.message);process.exitCode=1;});
