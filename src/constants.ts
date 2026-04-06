import dotenv from 'dotenv';

dotenv.config();

export const GRAFANA_URL = process.env.GRAFANA_URL?.replace(/\/$/, '') || '';
export const GRAFANA_TOKEN = process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN || '';
export const PORT = parseInt(process.env.PORT || '3100', 10);
export const TRANSPORT = process.env.TRANSPORT || 'http';
export const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
export const MCP_SERVER_URL = process.env.MCP_SERVER_URL || '';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const DEFAULT_MAX_ROWS = 100;
export const MAX_ROWS = 1000;
