import { makeRequest } from '../services/grafanaClient.js';
import { QueryResult, GrafanaError } from '../types.js';
import { DEFAULT_MAX_ROWS, MAX_ROWS } from '../constants.js';

function textResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

function parseDataFrame(frame: any, maxRows: number): QueryResult {
  const fields = frame?.schema?.fields || [];
  const values = frame?.data?.values || [];

  const columns = fields.map((f: any) => f.name);
  const numCols = values.length;
  const numRows = numCols > 0 ? values[0].length : 0;
  const truncated = numRows > maxRows;
  const rowLimit = Math.min(numRows, maxRows);

  const rows: any[][] = [];
  for (let r = 0; r < rowLimit; r++) {
    const row: any[] = [];
    for (let c = 0; c < numCols; c++) {
      row.push(values[c][r]);
    }
    rows.push(row);
  }

  return { columns, rows, rowCount: rows.length, truncated };
}

export const queryTools = [
  {
    name: 'grafana_query_datasource',
    description: 'Execute a raw SQL query against a named datasource and return results. Use this to explore data, verify query syntax, and preview results before embedding a query into a panel. For MySQL datasources, pass standard SQL. Results are returned as a table with column names and rows.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasource_uid: { type: 'string', description: 'UID of the datasource (get from grafana_list_datasources)' },
        raw_sql: { type: 'string', description: 'SQL query string' },
        max_rows: { type: 'number', description: `Limit result rows (1-${MAX_ROWS}, default ${DEFAULT_MAX_ROWS})` },
      },
      required: ['datasource_uid', 'raw_sql'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

export async function handleQueryTool(name: string, args: any) {
  if (name !== 'grafana_query_datasource') return undefined;

  try {
    const maxRows = Math.min(Math.max(args.max_rows ?? DEFAULT_MAX_ROWS, 1), MAX_ROWS);

    const body = {
      queries: [{
        refId: 'A',
        datasource: { uid: args.datasource_uid },
        rawSql: args.raw_sql,
        format: 'table',
        maxDataPoints: 1000,
      }],
      from: 'now-1y',
      to: 'now',
    };

    const response = await makeRequest<any>('POST', '/api/ds/query', body);

    const refResult = response?.results?.A;
    if (refResult?.error) {
      return errorResult(`SQL error: ${refResult.error}`);
    }

    const frames = refResult?.frames;
    if (!frames || frames.length === 0) {
      return textResult({ columns: [], rows: [], rowCount: 0, truncated: false });
    }

    const result = parseDataFrame(frames[0], maxRows);

    if (result.truncated) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2) +
            `\n\nNote: Results truncated to ${maxRows} rows. Set max_rows up to ${MAX_ROWS} to see more.`,
        }],
      };
    }

    return textResult(result);
  } catch (err) {
    return errorResult(err instanceof GrafanaError ? err.message : String(err));
  }
}
