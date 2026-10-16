import { sql, type Row } from '../src/db';
import { demoApiSession } from './demo-api-auth';

const userId = 'demo-visual-apicolmena-v1';
const prefix = 'demo-visual-v1-%';
const base = process.env.DEMO_API_URL?.replace(/\/$/, '');
if (!base || new URL(base).protocol !== 'https:' || !base.endsWith('/api/v1')) throw new Error('Define DEMO_API_URL=https://servidor/api/v1');
const apply = process.argv.includes('--apply');
const marker = (row: Row) => `[IMPORT:${row.id}]`;
const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.filter(key => row[key] != null).map(key => [key, row[key] instanceof Date ? row[key].toISOString() : row[key]]));
const ids = new Map<string,string>();
const remoteId = (id: string) => { const value = ids.get(id); if (!value) throw new Error(`Falta vínculo: ${id}`); return value; };
const created: Record<string,number> = {};
let token = '';
async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(base + path, {method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
  const result = await response.json() as any;
  if (!response.ok || !result.success) throw new Error(`${method} ${path}: ${response.status} ${result.error || 'Solicitud rechazada'} ${result.details ? JSON.stringify(result.details) : ''}`);
  return result;
}
async function list(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page=1; ; page++) {
    const result = await request(`${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`);
    if (!Array.isArray(result.data)) throw new Error(`Respuesta inesperada: ${path}`);
    rows.push(...result.data);
    if (!result.pagination || page >= result.pagination.totalPages) break;
  }
  return rows;
}
async function ensure(path: string, source: Row, existing: Row[], match: (row: Row) => boolean, body: Row) {
  let row = existing.find(match);
  if (!row) {
    row = (await request(path,'POST',body)).data;
    if (!row?.id) throw new Error(`Creación sin ID: ${path}`);
    existing.push(row!);
    created[path] = (created[path] || 0) + 1;
  }
  ids.set(source.id,row!.id);
  return row!;
}

try {
  const apiarios = await sql`SELECT * FROM apiarios WHERE "usuarioId"=${userId} AND id LIKE ${prefix} ORDER BY id`;
  const colmenas = await sql`SELECT * FROM colmenas WHERE "usuarioId"=${userId} AND id LIKE ${prefix} ORDER BY id`;
  const inspecciones = await sql`SELECT * FROM inspecciones WHERE "usuarioId"=${userId} AND id LIKE ${prefix} ORDER BY fecha`;
  const producciones = await sql`SELECT * FROM producciones WHERE "usuarioId"=${userId} AND id LIKE ${prefix} ORDER BY fecha`;
  const inventory = await sql`SELECT * FROM insumos_apicola WHERE "usuarioId"=${userId} AND id LIKE ${prefix} ORDER BY id`;
  const finances = await sql`SELECT * FROM transacciones WHERE "usuarioId"=${userId} AND id LIKE ${prefix} AND "anuladoAt" IS NULL AND (origen IS NULL OR origen <> 'venta_nucleo') ORDER BY fecha`;
  const nucleos = await sql`SELECT n.* FROM nucleos n JOIN apiarios a ON a.id=n."apiarioId" WHERE a."usuarioId"=${userId} AND n.id LIKE ${prefix} ORDER BY n.id`;
  const swarms = await sql`SELECT e.* FROM enjambres e JOIN colmenas c ON c.id=e."colmenaId" WHERE c."usuarioId"=${userId} AND e.id LIKE ${prefix} ORDER BY e.id`;
  const cases = await sql`SELECT * FROM casos_sanitarios WHERE "usuarioId"=${userId} AND id LIKE ${prefix} AND "anuladoAt" IS NULL ORDER BY id`;
  const alerts = await sql`SELECT * FROM alertas WHERE "usuarioId"=${userId} AND id LIKE ${prefix} ORDER BY id`;
  if (apiarios.length!==4 || colmenas.length!==32) throw new Error('El origen no contiene el conjunto demo esperado.');
  console.log(JSON.stringify({target:base,mode:apply?'apply':'plan',apiarios:apiarios.length,colmenas:colmenas.length,inspecciones:inspecciones.length,producciones:producciones.length,inventario:inventory.length,finanzas:finances.length,nucleos:nucleos.length,enjambres:swarms.length,casos:cases.length,alertas:alerts.length}));
  if (apply) {
    const session = await demoApiSession(base); token=session.token;
    if (session.user.email!=='demo.visual@apicolmena.test' || session.user.rol!=='apicultor') throw new Error('Cuenta de destino inválida');
    await request('/usuarios/profile','PUT',{notificacionesEmail:false,alertasActivadas:false});
    // Check all necessary read endpoints before creating any operational records.
    const paths=['/apiarios','/colmenas','/nucleos','/enjambres','/inspecciones','/produccion','/insumos','/finanzas','/casos-sanitarios','/alertas'];
    const remote: Record<string,Row[]> = {};
    for (const path of paths) remote[path]=await list(path);
    for (const row of apiarios) await ensure('/apiarios',row,remote['/apiarios'],r=>r.nombre===row.nombre,pick(row,['nombre','ciudad','pais','direccion','comoLlegar']));
    const conversions = await sql`SELECT v.* FROM conversiones_nucleo v JOIN nucleos n ON n.id=v."nucleoId" JOIN apiarios a ON a.id=n."apiarioId" WHERE a."usuarioId"=${userId} AND v.id LIKE ${prefix} AND v."anuladoAt" IS NULL`;
    const convertedHiveIds = new Set(conversions.map(r=>r.colmenaId));
    for (const row of colmenas.filter(r=>!convertedHiveIds.has(r.id))) await ensure('/colmenas',row,remote['/colmenas'],r=>r.nombre===row.nombre,{...pick(row,['nombre','estado','fechaInstalacion']),apiarioId:remoteId(row.apiarioId)});
    console.log('Apiarios y colmenas principales preparados.');
    for (const row of nucleos) {
      const donors = await sql`SELECT "colmenaId" FROM nucleos_donantes WHERE "nucleoId"=${row.id}`;
      const payload={...pick(row,['numero','codigo','tipo','fechaFormacion','origenReina','detalleOrigenReina','proveedorReina']),estado:['convertido','vendido'].includes(row.estado)?'listo':row.estado,apiarioId:remoteId(row.apiarioId),colmenaOrigenId:row.colmenaOrigenId?remoteId(row.colmenaOrigenId):undefined,donanteIds:donors.map(r=>remoteId(r.colmenaId))};
      const nucleus=await ensure('/nucleos',row,remote['/nucleos'],r=>r.codigo===row.codigo,payload);
      for (const conversion of conversions.filter(r=>r.nucleoId===row.id)) {
        const hive=colmenas.find(r=>r.id===conversion.colmenaId)!;
        let existing=remote['/colmenas'].find(r=>r.nombre===hive.nombre);
        if (!existing) { existing=(await request(`/nucleos/${nucleus.id}/conversiones`,'POST',{nombreColmena:hive.nombre,apiarioId:remoteId(hive.apiarioId),fecha:conversion.fecha.toISOString(),observaciones:conversion.observaciones})).data.colmena; if (!existing?.id) throw new Error('Conversión sin colmena');remote['/colmenas'].push(existing!);created.conversiones=(created.conversiones||0)+1; }
        ids.set(hive.id,existing!.id);
      }
      if (row.estado==='vendido' && nucleus.estado!=='vendido') {
        const [sale]=await sql`SELECT * FROM ventas_nucleo WHERE "nucleoId"=${row.id} AND "anuladoAt" IS NULL`;
        await request(`/nucleos/${nucleus.id}/ventas`,'POST',pick(sale,['compradorNombre','destinoApiario','destinoCiudad','fecha','monto','moneda']));created.ventasNucleo=(created.ventasNucleo||0)+1;
      }
    }
    for (const row of swarms) {
      const createdSwarm=await ensure('/enjambres',row,remote['/enjambres'],r=>r.nombre===row.nombre,{...pick(row,['nombre','notas']),colmenaId:remoteId(row.colmenaId)});
      if (createdSwarm.estado!==row.estado) await request(`/enjambres/${createdSwarm.id}`,'PUT',pick(row,['nombre','estado','notas']));
    }
    for (const row of inspecciones) {
      const hives=await sql`SELECT "A" AS id FROM "_ColmenaToInspeccion" WHERE "B"=${row.id}`;
      const nuclei=await sql`SELECT "B" AS id FROM "_NucleoToInspeccion" WHERE "A"=${row.id}`;
      const swarmsForInspection=await sql`SELECT "A" AS id FROM "_EnjambreToInspeccion" WHERE "B"=${row.id}`;
      await ensure('/inspecciones',row,remote['/inspecciones'],r=>r.observaciones?.includes(marker(row)),{...pick(row,['fecha','estadoSanidad','posiblesEnfermedades','patologiasApicolas','numColmenasAfectadas','signosClinicos','proximaRevision']),observaciones:`${row.observaciones||'DEMO'} ${marker(row)}`,colmenaIds:hives.map(r=>remoteId(r.id)),nucleoIds:nuclei.map(r=>remoteId(r.id)),enjambreIds:swarmsForInspection.map(r=>remoteId(r.id))});
    }
    console.log('Núcleos, enjambres e inspecciones cargados.');
    for (const row of producciones) await ensure('/produccion',row,remote['/produccion'],r=>r.lote===row.lote,{...pick(row,['fecha','tipoProducto','cantidad','unidad','calidad','lote','destino','observaciones']),apiarioId:remoteId(row.apiarioId),colmenaId:remoteId(row.colmenaId)});
    for (const row of inventory) {
      const item=await ensure('/insumos',row,remote['/insumos'],r=>r.codigoInterno===row.codigoInterno,{...pick(row,['nombre','categoria','catalogoItemId','tipoItem','estadoActivo','codigoInterno','descripcion','cantidadMinima','unidad','precioUnitario','valorMercado','ubicacion','proveedor','notas']),cantidadActual:row.cantidadActual+2,registrarCompra:false});
      const movements=await list(`/insumos/${item.id}/movimientos`);
      const reason=`DEMO · Uso en jornada de campo ${marker(row)}`;
      if (!movements.some(r=>r.motivo===reason)) await request(`/insumos/${item.id}/movimientos`,'POST',{tipo:'salida',cantidad:2,motivo:reason,registrarCompra:false});
    }
    for (const row of finances) await ensure('/finanzas',row,remote['/finanzas'],r=>r.referencia===row.referencia && r.descripcion===row.descripcion,pick(row,['tipo','descripcion','monto','fecha','categoria','referencia','esVenta','producto','cantidad','unidad','compradorNombre','valorTotal','medioPago','observaciones']));
    console.log('Producción, inventario y finanzas cargados.');
    for (const row of cases.filter(row => row.estado !== 'cerrado_sacrificio')) {
      const objectives=await sql`SELECT * FROM casos_sanitarios_objetivos WHERE "casoId"=${row.id}`;
      const healthCase=await ensure('/casos-sanitarios',row,remote['/casos-sanitarios'],r=>r.descripcion?.includes(marker(row)),{...pick(row,['titulo','gravedad','proximaRevision']),descripcion:`${row.descripcion} ${marker(row)}`,inspeccionOrigenId:row.inspeccionOrigenId?remoteId(row.inspeccionOrigenId):undefined,objetivos:objectives.map(r=>({tipo:'colmena',id:remoteId(r.colmenaId)}))});
      const actions=await sql`SELECT * FROM acciones_sanitarias WHERE "casoId"=${row.id} AND "anuladoAt" IS NULL ORDER BY fecha`;
      for (const action of actions) {
        if ((healthCase.acciones||[]).some((r:Row)=>r.descripcion?.includes(marker(action)))) continue;
        const payload={...pick(action,['tipo','fecha','responsable','metodo','disposicionFinal']),descripcion:`${action.descripcion} ${marker(action)}`,objetivoIds:healthCase.objetivos.map((r:Row)=>r.id),evidencias:[]};
        await request(`/casos-sanitarios/${healthCase.id}/acciones`,'POST',payload);
      }
    }
    for (const row of alerts) {
      const alert=await ensure('/alertas',row,remote['/alertas'],r=>r.titulo===row.titulo,{...pick(row,['titulo','mensaje']),tipo:row.tipo==='control_rutinario'?'otros':row.tipo,prioridad:['alta','critica'].includes(row.prioridad)?'media':row.prioridad});
      if (row.leida&&!alert.leida) await request(`/alertas/${alert.id}/leida`,'PUT');
    }
    const summary: Record<string,number> = {};
    for (const path of paths) summary[path]=(await list(path)).length;
    console.log(JSON.stringify({target:base,account:session.user.email,created,summary,finanzas:(await request('/finanzas/resumen')).data},null,2));
    console.log('Limitaciones de los endpoints: no hay alta de productos; los campos de reina/cuadros no se aceptan por HTTP; las fechas de movimientos y casos se generan en el servidor.');
  }
} finally { await sql.close(); }
