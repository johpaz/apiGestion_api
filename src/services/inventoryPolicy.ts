export interface InventorySourceInput {
  esPersonalizado?: boolean;
  catalogoItemId?: string;
  nombre?: string;
  unidad?: string;
}

export const validateInventorySource = (input: InventorySourceInput): string | null => {
  if (input.esPersonalizado) {
    if (input.catalogoItemId?.trim()) return 'Un artículo personalizado no debe usar un elemento del catálogo';
    if (!input.nombre?.trim() || input.nombre.trim().length < 2) return 'Escribe el nombre del artículo personalizado';
    if (!input.unidad?.trim()) return 'Selecciona la unidad del artículo personalizado';
    return null;
  }

  return input.catalogoItemId?.trim() ? null : 'Selecciona un artículo del catálogo o crea uno personalizado';
};
