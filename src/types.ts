export interface DashboardSearchResult {
  uid: string;
  title: string;
  folderTitle?: string;
  url: string;
  tags: string[];
  type: string;
  uri: string;
}

export interface DashboardMeta {
  folderUid: string;
  folderTitle: string;
  canEdit: boolean;
  canSave: boolean;
  canAdmin: boolean;
  slug: string;
  url: string;
  version: number;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

export interface DashboardGetResponse {
  dashboard: Record<string, any>;
  meta: DashboardMeta;
}

export interface DashboardSaveResponse {
  uid: string;
  url: string;
  version: number;
  status: string;
  slug: string;
}

export interface PanelSummary {
  id: number;
  title: string;
  type: string;
  gridPos: { h: number; w: number; x: number; y: number };
  datasource?: { type?: string; uid?: string } | null;
}

export interface DatasourceSummary {
  uid: string;
  name: string;
  type: string;
  url: string;
  isDefault: boolean;
}

export interface FolderSummary {
  uid: string;
  title: string;
  url: string;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  truncated: boolean;
}

export class GrafanaError extends Error {
  constructor(
    public readonly status: number,
    public readonly grafanaMessage: string,
  ) {
    super(`Grafana API error (${status}): ${grafanaMessage}`);
    this.name = 'GrafanaError';
  }
}
