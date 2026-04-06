import { makeRequest } from '../services/grafanaClient.js';
import { FolderSummary, GrafanaError } from '../types.js';

function textResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

export const folderTools = [
  {
    name: 'grafana_list_folders',
    description: 'List all dashboard folders.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'grafana_create_folder',
    description: 'Create a new dashboard folder for organizing related dashboards.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Folder title' },
        uid: { type: 'string', description: 'Optional folder UID (Grafana generates one if omitted)' },
      },
      required: ['title'],
    },
    annotations: { destructiveHint: false },
  },
];

export async function handleFolderTool(name: string, args: any) {
  switch (name) {
    case 'grafana_list_folders': {
      try {
        const results = await makeRequest<any[]>('GET', '/api/folders', undefined, { limit: 100 });
        const simplified: FolderSummary[] = results.map(f => ({
          uid: f.uid,
          title: f.title,
          url: f.url,
        }));
        return textResult(simplified);
      } catch (err) {
        return errorResult(err instanceof GrafanaError ? err.message : String(err));
      }
    }

    case 'grafana_create_folder': {
      try {
        const body: Record<string, any> = { title: args.title };
        if (args.uid) body.uid = args.uid;
        const result = await makeRequest<FolderSummary>('POST', '/api/folders', body);
        return textResult(result);
      } catch (err) {
        return errorResult(err instanceof GrafanaError ? err.message : String(err));
      }
    }

    default:
      return undefined;
  }
}
