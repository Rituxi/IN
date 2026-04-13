export interface AdminLogsPaginationMeta {
  pageSize: number;
  memoryWindow: number;
  maxStore: number;
  totalCount: number;
}

export const EMPTY_ADMIN_LOGS_PAGINATION: AdminLogsPaginationMeta = {
  pageSize: 1,
  memoryWindow: 1,
  maxStore: 1,
  totalCount: 0,
};

export function getAdminLogsTotalPages(pagination: AdminLogsPaginationMeta): number {
  return Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));
}

export function getAdminLogsCachedPageCount(pagination: AdminLogsPaginationMeta): number {
  return Math.max(1, Math.floor(pagination.memoryWindow / pagination.pageSize));
}

export function getAdminLogsEffectiveCachedPageCount(pagination: AdminLogsPaginationMeta): number {
  return Math.min(getAdminLogsCachedPageCount(pagination), getAdminLogsTotalPages(pagination));
}
