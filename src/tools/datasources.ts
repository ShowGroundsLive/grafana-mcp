import { makeRequest } from '../services/grafanaClient.js';
import { DatasourceSummary, GrafanaError } from '../types.js';

function textResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

export const datasourceTools = [
  {
    name: 'grafana_list_datasources',
    description: 'List all configured data sources with their UIDs, names, and types. Use this to find the correct datasource UID when building panel queries.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'grafana_get_datasource',
    description: 'Get details of a specific datasource by UID or name. Provide either uid or name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        uid: { type: 'string', description: 'Datasource UID' },
        name: { type: 'string', description: 'Datasource name' },
      },
    },
    annotations: { readOnlyHint: true },
  },
];

export async function handleDatasourceTool(name: string, args: any) {
  switch (name) {
    case 'grafana_list_datasources': {
      try {
        const results = await makeRequest<any[]>('GET', '/api/datasources');
        const simplified: DatasourceSummary[] = results.map(ds => ({
          uid: ds.uid,
          name: ds.name,
          type: ds.type,
          url: ds.url,
          isDefault: ds.isDefault,
        }));
        return textResult(simplified);
      } catch (err) {
        return errorResult(err instanceof GrafanaError ? err.message : String(err));
      }
    }

    case 'grafana_get_datasource': {
      try {
        if (!args.uid && !args.name) {
          return errorResult('Either uid or name must be provided.');
        }
        const path = args.uid
          ? `/api/datasources/uid/${args.uid}`
          : `/api/datasources/name/${args.name}`;
        const result = await makeRequest<any>('GET', path);
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof GrafanaError ? err.message : String(err));
      }
    }

    default:
      return undefined;
  }
}
