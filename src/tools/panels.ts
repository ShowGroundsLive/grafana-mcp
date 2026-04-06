import { makeRequest } from '../services/grafanaClient.js';
import { DashboardGetResponse, PanelSummary, GrafanaError } from '../types.js';

function textResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

function extractPanels(dashboard: Record<string, any>): any[] {
  const panels: any[] = [];
  for (const panel of dashboard.panels || []) {
    panels.push(panel);
    if (panel.panels) {
      panels.push(...panel.panels);
    }
  }
  return panels;
}

export const panelTools = [
  {
    name: 'grafana_list_panels',
    description: "List all panels in a dashboard with their IDs, titles, types, and grid positions. Use this to understand a dashboard's structure before modifying it.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        dashboard_uid: { type: 'string', description: 'Dashboard UID' },
      },
      required: ['dashboard_uid'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'grafana_get_panel',
    description: 'Get the full JSON definition of a specific panel within a dashboard, including its query targets, field config, and display options.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dashboard_uid: { type: 'string', description: 'Dashboard UID' },
        panel_id: { type: 'number', description: 'Panel ID within the dashboard' },
      },
      required: ['dashboard_uid', 'panel_id'],
    },
    annotations: { readOnlyHint: true },
  },
];

export async function handlePanelTool(name: string, args: any) {
  switch (name) {
    case 'grafana_list_panels': {
      try {
        const result = await makeRequest<DashboardGetResponse>('GET', `/api/dashboards/uid/${args.dashboard_uid}`);
        const panels = extractPanels(result.dashboard);
        const summaries: PanelSummary[] = panels.map(p => ({
          id: p.id,
          title: p.title || '(untitled)',
          type: p.type,
          gridPos: p.gridPos,
          datasource: p.datasource || null,
        }));
        return textResult(summaries);
      } catch (err) {
        if (err instanceof GrafanaError && err.status === 404) {
          return errorResult(`Dashboard with UID '${args.dashboard_uid}' not found. Use grafana_list_dashboards to find valid UIDs.`);
        }
        return errorResult(err instanceof GrafanaError ? err.message : String(err));
      }
    }

    case 'grafana_get_panel': {
      try {
        const result = await makeRequest<DashboardGetResponse>('GET', `/api/dashboards/uid/${args.dashboard_uid}`);
        const panels = extractPanels(result.dashboard);
        const panel = panels.find(p => p.id === args.panel_id);
        if (!panel) {
          return errorResult(`Panel with ID ${args.panel_id} not found in dashboard '${args.dashboard_uid}'. Use grafana_list_panels to see available panel IDs.`);
        }
        return textResult(panel);
      } catch (err) {
        if (err instanceof GrafanaError && err.status === 404) {
          return errorResult(`Dashboard with UID '${args.dashboard_uid}' not found. Use grafana_list_dashboards to find valid UIDs.`);
        }
        return errorResult(err instanceof GrafanaError ? err.message : String(err));
      }
    }

    default:
      return undefined;
  }
}
