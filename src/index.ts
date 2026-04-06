import express, { RequestHandler } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GRAFANA_URL, GRAFANA_TOKEN, PORT, TRANSPORT, MCP_AUTH_TOKEN, MCP_SERVER_URL } from './constants.js';
import { SimpleOAuthProvider } from './oauth.js';
import { dashboardTools, handleDashboardTool } from './tools/dashboards.js';
import { panelTools, handlePanelTool } from './tools/panels.js';
import { datasourceTools, handleDatasourceTool } from './tools/datasources.js';
import { folderTools, handleFolderTool } from './tools/folders.js';
import { queryTools, handleQueryTool } from './tools/query.js';

if (!GRAFANA_URL) {
  console.error('GRAFANA_URL environment variable is required');
  process.exit(1);
}
if (!GRAFANA_TOKEN) {
  console.error('GRAFANA_SERVICE_ACCOUNT_TOKEN environment variable is required');
  process.exit(1);
}

const allTools = [
  ...dashboardTools,
  ...panelTools,
  ...datasourceTools,
  ...folderTools,
  ...queryTools,
];

const handlers = [
  handleDashboardTool,
  handlePanelTool,
  handleDatasourceTool,
  handleFolderTool,
  handleQueryTool,
];

function createServer(): Server {
  const server = new Server(
    { name: 'grafana-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    for (const handler of handlers) {
      const result = await handler(name, args ?? {});
      if (result !== undefined) return result;
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  return server;
}

if (TRANSPORT === 'stdio') {
  // stdio mode — used by Claude Desktop (local)
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error('Failed to start stdio transport:', err);
    process.exit(1);
  });
} else {
  // HTTP mode — used by Claude Code / Claude Desktop (remote via OAuth)
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const mcpHandlers: RequestHandler[] = [];

  if (MCP_AUTH_TOKEN) {
    if (!MCP_SERVER_URL) {
      console.error(
        'Warning: MCP_SERVER_URL not set — OAuth flow for Claude Desktop will not work correctly. ' +
          'Set MCP_SERVER_URL to the public HTTPS URL of this server.'
      );
    }

    const issuerUrl = new URL(MCP_SERVER_URL || `http://localhost:${PORT}`);
    const mcpServerUrl = new URL(`${issuerUrl.origin}/mcp`);
    const persistPath = process.env.OAUTH_STATE_PATH || '/data/oauth-state.json';
    const provider = new SimpleOAuthProvider(MCP_AUTH_TOKEN, 'Grafana MCP', persistPath);

    // Auto-register unknown clients from the /authorize request so cached
    // client_ids from Claude Desktop survive server restarts.
    app.get('/authorize', (req, res, next) => {
      const clientId = req.query['client_id'] as string | undefined;
      const redirectUri = req.query['redirect_uri'] as string | undefined;
      if (clientId && redirectUri) {
        provider.ensureClient(clientId, redirectUri);
      }
      next();
    });

    app.use(
      mcpAuthRouter({
        provider,
        issuerUrl,
        resourceServerUrl: mcpServerUrl,
        scopesSupported: ['mcp'],
        resourceName: 'Grafana MCP',
      })
    );

    app.post('/oauth/login', async (req, res) => {
      const { session_id, token } = req.body as {
        session_id?: string;
        token?: string;
      };
      if (!session_id || !token) {
        res.status(400).send('Missing session_id or token');
        return;
      }
      const result = await provider.handleLogin(session_id, token);
      if (result.success) {
        res.redirect(result.redirectUrl);
      } else {
        res.status(401).send(
          `<html><body style="font-family:system-ui;max-width:400px;margin:80px auto;padding:0 20px">` +
            `<p style="color:red">${result.error}</p>` +
            `<a href="javascript:history.back()">Try again</a></body></html>`
        );
      }
    });

    mcpHandlers.push(
      requireBearerAuth({
        verifier: provider,
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
      })
    );

    console.error(
      'Auth configured — /mcp requires Bearer token (Claude Code) or OAuth flow (Claude Desktop)'
    );
  }

  app.post('/mcp', ...mcpHandlers, async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', grafana: GRAFANA_URL });
  });

  const host = process.env.HOST || '0.0.0.0';
  app.listen(PORT, host, () => {
    console.log(`Grafana MCP server running on http://${host}:${PORT}/mcp`);
    console.log(`  Grafana URL: ${GRAFANA_URL}`);
  });
}
