# Grafana MCP Server

MCP server that gives LLMs live read/write access to a self-hosted Grafana instance. Built for use with Claude Code.

## Prerequisites

- Node.js 18+
- A Grafana instance with a service account token (Admin role recommended)

## Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

   ```
   GRAFANA_URL=https://grafana.showgroundslive.com
   GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_xxxx
   PORT=3100
   ```

3. Build and start:
   ```bash
   npm run build
   npm start
   ```

## Creating a Grafana Service Account Token

1. Log into your Grafana instance as an admin
2. Go to **Administration → Service Accounts**
3. Click **Add service account**
4. Name it (e.g., "MCP Server") and set the role to **Admin**
5. Click **Create**
6. On the service account page, click **Add service account token**
7. Give it a name and click **Generate token**
8. Copy the token (starts with `glsa_`) — you won't see it again
9. Set it as `GRAFANA_SERVICE_ACCOUNT_TOKEN` in your `.env`

## Available Tools (14 total)

### Dashboards
- `grafana_list_dashboards` — Search/list dashboards by query or folder
- `grafana_get_dashboard` — Get full dashboard JSON by UID
- `grafana_create_dashboard` — Create a new dashboard
- `grafana_update_dashboard` — Update an existing dashboard
- `grafana_delete_dashboard` — Delete a dashboard (destructive)

### Panels
- `grafana_list_panels` — List panels in a dashboard with IDs and types
- `grafana_get_panel` — Get full panel JSON including queries and config

### Datasources
- `grafana_list_datasources` — List all configured datasources
- `grafana_get_datasource` — Get datasource details by UID or name

### Folders
- `grafana_list_folders` — List all dashboard folders
- `grafana_create_folder` — Create a new folder

### Query
- `grafana_query_datasource` — Execute raw SQL against a datasource

## Example: Create a Dashboard with a Panel

```json
// 1. Find your datasource UID
grafana_list_datasources → [{ "uid": "abc123", "name": "MySQL", "type": "mysql" }]

// 2. Create a dashboard with a table panel
grafana_create_dashboard({
  "dashboard": {
    "title": "Show Entries",
    "panels": [{
      "id": 1,
      "title": "Recent Entries",
      "type": "table",
      "gridPos": { "h": 12, "w": 24, "x": 0, "y": 0 },
      "targets": [{
        "datasource": { "type": "mysql", "uid": "abc123" },
        "rawSql": "SELECT * FROM entries ORDER BY created_at DESC LIMIT 50",
        "format": "table",
        "refId": "A"
      }],
      "fieldConfig": { "defaults": {}, "overrides": [] },
      "options": {}
    }]
  },
  "folder_uid": "my-folder",
  "message": "Initial dashboard"
})
```

## Deployment Options

### Local (primary)
Run on any machine with network access to your Grafana instance:
```bash
npm run build && npm start
```

### Via Pangolin Reverse Proxy (optional)
To expose for remote MCP access, add a Pangolin site:
- Subdomain: `grafana-mcp.showgroundslive.com`
- Target: `http://localhost:3100`
- The public URL becomes the MCP server URL in Claude's connector settings

### As a systemd service
```ini
[Unit]
Description=Grafana MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/grafana-mcp-server
ExecStart=/usr/bin/node dist/index.js
Environment=GRAFANA_URL=https://grafana.showgroundslive.com
Environment=GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_xxxx
Environment=PORT=3100
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### 401 Unauthorized
Your service account token is invalid or expired. Generate a new one in Grafana → Administration → Service Accounts.

### 403 Forbidden
The service account doesn't have sufficient permissions. Ensure it has the **Admin** role.

### 404 Not Found
The dashboard/datasource/folder UID doesn't exist. Use the corresponding `list` tool to find valid UIDs.

### SQL errors in query results
The `grafana_query_datasource` tool surfaces SQL errors from Grafana. Check your SQL syntax and ensure the table/column names exist in the datasource.

### Empty query results
Ensure `from`/`to` time range covers your data. The default range is `now-1y` to `now`. For time-series data, verify the time column is within range.
