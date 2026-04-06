import { makeRequest } from '../services/grafanaClient.js';
import { DashboardSearchResult, DashboardGetResponse, DashboardSaveResponse, GrafanaError } from '../types.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';

function textResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

function formatError(err: unknown): string {
  return err instanceof GrafanaError ? err.message : String(err);
}

export const dashboardTools = [
  {
    name: 'grafana_list_dashboards',
    description: 'List all dashboards, optionally filtered by folder or search query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search string matched against dashboard title' },
        folder_uid: { type: 'string', description: 'Filter to a specific folder by UID' },
        limit: { type: 'number', description: 'Max results (1-200, default 50)' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'grafana_get_dashboard',
    description: 'Get the full JSON model of a dashboard by UID. Returns the complete dashboard definition including all panels, variables, and layout. Use this before modifying a dashboard.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        uid: { type: 'string', description: 'Dashboard UID' },
      },
      required: ['uid'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'grafana_create_dashboard',
    description: 'Create a new dashboard. Pass a complete Grafana dashboard JSON object. The dashboard will be created in the specified folder (or General if omitted). Set overwrite: false to prevent accidentally overwriting existing dashboards.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dashboard: { type: 'object', description: 'Full Grafana dashboard JSON (title, panels, templating, time, etc.). Set id to null for new dashboards.' },
        folder_uid: { type: 'string', description: 'Target folder UID (leave empty for General folder)' },
        message: { type: 'string', description: 'Version commit message (default: "Created via MCP")' },
        overwrite: { type: 'boolean', description: 'Whether to overwrite an existing dashboard with the same UID (default: false)' },
      },
      required: ['dashboard'],
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'grafana_update_dashboard',
    description: 'Update an existing dashboard. ALWAYS call grafana_get_dashboard first to retrieve the current JSON, then modify it and pass the full modified object here. Include the current version number to prevent conflicting updates.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        uid: { type: 'string', description: 'Dashboard UID to update' },
        dashboard: { type: 'object', description: 'Complete updated dashboard JSON (must include uid and version)' },
        folder_uid: { type: 'string', description: 'Move dashboard to this folder' },
        message: { type: 'string', description: 'Version commit message describing what changed' },
        overwrite: { type: 'boolean', description: 'Overwrite even if version conflicts (default: true)' },
      },
      required: ['uid', 'dashboard'],
    },
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'grafana_delete_dashboard',
    description: 'Permanently delete a dashboard by UID. This cannot be undone.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        uid: { type: 'string', description: 'Dashboard UID to delete' },
      },
      required: ['uid'],
    },
    annotations: { destructiveHint: true, idempotentHint: false },
  },
];

export async function handleDashboardTool(name: string, args: any) {
  switch (name) {
    case 'grafana_list_dashboards': {
      try {
        const params: Record<string, any> = { type: 'dash-db' };
        if (args.query) params.query = args.query;
        if (args.folder_uid) params.folderUIDs = args.folder_uid;
        params.limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

        const results = await makeRequest<DashboardSearchResult[]>('GET', '/api/search', undefined, params);
        return textResult(results.map(d => ({
          uid: d.uid,
          title: d.title,
          folderTitle: d.folderTitle,
          url: d.url,
          tags: d.tags,
        })));
      } catch (err) {
        return errorResult(formatError(err));
      }
    }

    case 'grafana_get_dashboard': {
      try {
        const result = await makeRequest<DashboardGetResponse>('GET', `/api/dashboards/uid/${args.uid}`);
        return textResult(result);
      } catch (err) {
        if (err instanceof GrafanaError && err.status === 404) {
          return errorResult(`Dashboard with UID '${args.uid}' not found. Use grafana_list_dashboards to find valid UIDs.`);
        }
        return errorResult(formatError(err));
      }
    }

    case 'grafana_create_dashboard': {
      try {
        const body: Record<string, any> = {
          dashboard: { ...args.dashboard, id: null },
          message: args.message ?? 'Created via MCP',
          overwrite: args.overwrite ?? false,
        };
        if (args.folder_uid) body.folderUid = args.folder_uid;

        const result = await makeRequest<DashboardSaveResponse>('POST', '/api/dashboards/db', body);
        return textResult(result);
      } catch (err) {
        return errorResult(formatError(err));
      }
    }

    case 'grafana_update_dashboard': {
      try {
        const body: Record<string, any> = {
          dashboard: { ...args.dashboard, uid: args.uid },
          message: args.message ?? 'Updated via MCP',
          overwrite: args.overwrite ?? true,
        };
        if (args.folder_uid) body.folderUid = args.folder_uid;

        const result = await makeRequest<DashboardSaveResponse>('POST', '/api/dashboards/db', body);
        return textResult(result);
      } catch (err) {
        return errorResult(formatError(err));
      }
    }

    case 'grafana_delete_dashboard': {
      try {
        const result = await makeRequest<{ message: string; title: string }>('DELETE', `/api/dashboards/uid/${args.uid}`);
        return textResult(result);
      } catch (err) {
        if (err instanceof GrafanaError && err.status === 404) {
          return errorResult(`Dashboard with UID '${args.uid}' not found. Use grafana_list_dashboards to find valid UIDs.`);
        }
        return errorResult(formatError(err));
      }
    }

    default:
      return undefined;
  }
}
