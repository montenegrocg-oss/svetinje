export interface AdvancedCatalogueFilters {
  areaId?: string;
  eparchyId?: string;
  municipalityId?: string;
}

export const activeAdvancedFilterCount = ({
  areaId = "",
  eparchyId = "",
  municipalityId = "",
}: AdvancedCatalogueFilters) => [areaId, eparchyId, municipalityId].filter(Boolean).length;
