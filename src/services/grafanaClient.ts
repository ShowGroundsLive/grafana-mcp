import axios, { AxiosInstance, AxiosError, Method } from 'axios';
import { GRAFANA_URL, GRAFANA_TOKEN } from '../constants.js';
import { GrafanaError } from '../types.js';

const client: AxiosInstance = axios.create({
  baseURL: GRAFANA_URL,
  timeout: 30000,
  headers: {
    'Authorization': `Bearer ${GRAFANA_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export async function makeRequest<T>(
  method: Method,
  path: string,
  body?: any,
  params?: Record<string, any>,
): Promise<T> {
  try {
    const response = await client.request<T>({
      method,
      url: path,
      data: body,
      params,
    });
    return response.data;
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      const status = err.response.status;
      const msg = err.response.data?.message || err.response.statusText || 'Unknown error';

      if (status === 404) {
        throw new GrafanaError(status, `Not found: ${msg}. Verify the UID/name is correct using the corresponding list tool.`);
      }
      if (status === 403) {
        throw new GrafanaError(status, `Permission denied: ${msg}. Ensure the service account token has Admin role.`);
      }
      throw new GrafanaError(status, msg);
    }
    throw err;
  }
}
