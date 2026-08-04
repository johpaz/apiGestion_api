export type HealthActionPolicyInput = {
  tipo: string;
  referenciaIca?: string;
  productoNombre?: string;
  productoRegistroIca?: string;
  responsable?: string;
  metodo?: string;
  disposicionFinal?: string;
  evidencias: string[];
  objetivoIds: string[];
};

export const validateHealthAction = (data: HealthActionPolicyInput, caseObjectiveIds: string[]): string | null => {
  if (data.tipo === 'notificacion_ica' && !data.referenciaIca) return 'La referencia ICA es obligatoria';
  if (data.tipo === 'control_autorizado_ica' && (!data.productoNombre || !data.productoRegistroIca)) {
    return 'El producto y su registro ICA son obligatorios; la aplicación no prescribe dosis';
  }
  if (data.tipo !== 'sacrificio_destruccion') return null;
  if (!data.responsable || !data.metodo || !data.disposicionFinal || data.evidencias.length === 0) {
    return 'El sacrificio requiere responsable, método, disposición final y al menos una foto';
  }
  const expected = new Set(caseObjectiveIds);
  if (data.objetivoIds.length !== expected.size || data.objetivoIds.some((id) => !expected.has(id))) {
    return 'El cierre por sacrificio debe identificar todos los objetivos del caso';
  }
  return null;
};

export const validateNucleusFinalization = (status: string, hasOpenHealthCase: boolean): string | null => {
  if (status !== 'listo') return 'Solo un núcleo listo puede finalizar su ciclo';
  if (hasOpenHealthCase) return 'Existe un caso sanitario abierto; debe cerrarse como recuperado';
  return null;
};
