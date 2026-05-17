# IT Helpdesk Automation System

> **Production-ready REST API backend for a Microsoft Copilot Studio IT helpdesk chatbot.**  
> Handles ticket lifecycle management, knowledge base search, conversation logging, and escalation notifications.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Quick Start](#quick-start)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [Copilot Studio Integration](#copilot-studio-integration)
9. [Dashboard](#dashboard)
10. [Docker Deployment](#docker-deployment)
11. [Project Structure](#project-structure)

---

## Project Overview

This system provides the backend infrastructure for an AI-powered IT helpdesk bot built with Microsoft Copilot Studio. The bot calls this REST API to:

- **Create and track support tickets** stored in SQL Server
- **Search the knowledge base** for self-service solutions
- **Escalate tickets** to human agents with email notifications
- **Log all conversations** in MongoDB for analytics and auditing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER (Employee)                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Chat
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│             Microsoft Copilot Studio Bot                        │
│  (Topics, Triggers, Responses — configured manually)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP Actions (REST API calls)
                           │ JWT in Authorization header
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Express.js API  (:3000)                        │
│                                                                 │
│   ┌───────────────┐   ┌───────────────┐   ┌─────────────────┐  │
│   │  /api/v1/     │   │  /api/v1/kb/  │   │  /webhooks/     │  │
│   │  tickets      │   │  search       │   │  escalation     │  │
│   │  (JWT auth)   │   │  (public)     │   │  (JWT auth)     │  │
│   └───────┬───────┘   └───────┬───────┘   └────────┬────────┘  │
│           │                   │                     │           │
│   ┌───────▼───────────────────▼─────────────────────▼────────┐  │
│   │               Business Logic Layer                        │  │
│   │   ticketController  kbController  webhookController       │  │
│   └──────────┬──────────────────────────────────┬────────────┘  │
│              │                                  │               │
└──────────────┼──────────────────────────────────┼───────────────┘
               │                                  │
       ┌───────▼───────┐                 ┌─────────▼──────────┐
       │  SQL Server   │                 │     MongoDB         │
       │  helpdesk_db  │                 │  helpdesk_logs      │
       │               │                 │  conversation_logs  │
       │  • tickets    │                 └────────────────────┘
       │  • knowledge  │
       │    _base      │                 ┌────────────────────┐
       └───────────────┘                 │  SMTP (Nodemailer) │
                                         │  Escalation emails │
                                         └────────────────────┘
                                         
┌─────────────────────────────────────────────────────────────────┐
│             Power Automate Flow                                 │
│  Calls POST /webhooks/escalation with ticketId                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│             Ops Dashboard  (/dashboard)                         │
│  Static HTML + Vanilla JS — auto-refreshes every 30s           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 |
| Primary DB | Microsoft SQL Server (via `mssql`) |
| Secondary DB | MongoDB 7 (via `mongoose`) |
| Auth | JWT (`jsonwebtoken`) |
| Email | Nodemailer |
| Containers | Docker + Docker Compose |
| Dashboard | Plain HTML5 + Vanilla JS |

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Microsoft SQL Server** (local instance or Azure SQL Free Tier)
- **MongoDB** (local instance, Docker, or MongoDB Atlas)
- An **SMTP provider** (Mailtrap for dev, SendGrid / AWS SES for production)

---

## Quick Start

### 1. Clone and install dependencies

```bash
cd d:\Copilot_Studio_Project
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Open `.env` and fill in all required values (see [Environment Variables](#environment-variables)).

### 3. Set up the SQL Server database

Create the database first:

```sql
-- Run in SSMS or sqlcmd
CREATE DATABASE helpdesk_db;
```

Then run the schema:

```bash
# Using sqlcmd (adjust credentials)
sqlcmd -S localhost -U sa -P <your_password> -i sql/schema.sql

# Or using sqlcmd inside Docker (if using the optional SQL Server container)
docker exec -i helpdesk-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P <your_password> -C -i /dev/stdin < sql/schema.sql
```

### 4. Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Paste the output into `JWT_SECRET` in your `.env`.

### 5. Start the server

```bash
# Development (with hot-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000`.  
The dashboard will be at `http://localhost:3000/dashboard`.

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `JWT_SECRET` | 64-byte hex secret for JWT signing | *(generate with crypto)* |
| `MSSQL_HOST` | SQL Server hostname | `localhost` |
| `MSSQL_PORT` | SQL Server port | `1433` |
| `MSSQL_USER` | SQL Server username | `sa` |
| `MSSQL_PASSWORD` | SQL Server password | |
| `MSSQL_DATABASE` | Database name | `helpdesk_db` |
| `MSSQL_ENCRYPT` | Enable SSL encryption | `false` (local) / `true` (Azure) |
| `MSSQL_TRUST_SERVER_CERT` | Trust self-signed cert | `true` (dev only) |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/helpdesk_logs` |
| `ESCALATION_EMAIL` | Escalation alert recipient | `it-escalations@company.com` |
| `SMTP_HOST` | SMTP server hostname | `smtp.mailtrap.io` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | |
| `SMTP_PASS` | SMTP password | |
| `SMTP_FROM_NAME` | From display name | `IT Helpdesk Bot` |
| `SMTP_FROM_EMAIL` | From email address | `helpdesk-bot@company.com` |

---

## API Reference

### Base URL: `/api/v1`

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

### `GET /api/v1/health` — public

Returns health status of the API, SQL Server, and MongoDB.

**Response `200`:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "services": {
    "sql": "connected",
    "mongo": "connected"
  }
}
```

---

### `GET /api/v1/tickets` — 🔒 JWT required

List all tickets. Supports filtering and pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | string | *(all)* | Filter: `OPEN`, `IN_PROGRESS`, `ESCALATED`, `RESOLVED` |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Results per page (max 100) |

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "userId": "john.doe",
      "issueType": "PASSWORD_RESET",
      "description": "I cannot log in to my account.",
      "priority": "HIGH",
      "status": "OPEN",
      "createdAt": "2025-01-15T09:00:00.000Z",
      "updatedAt": "2025-01-15T09:00:00.000Z",
      "resolvedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### `POST /api/v1/tickets` — 🔒 JWT required

Create a new helpdesk ticket.

**Request Body:**
```json
{
  "userId": "john.doe",
  "issueType": "PASSWORD_RESET",
  "description": "I cannot log in. My account may be locked.",
  "priority": "HIGH"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `userId` | string | ✅ | Non-empty, max 128 chars |
| `issueType` | string | ✅ | `PASSWORD_RESET`, `SOFTWARE_ACCESS`, `HARDWARE_ISSUE`, `NETWORK_ISSUE`, `OTHER` |
| `description` | string | ✅ | Non-empty, max 2000 chars |
| `priority` | string | No | `LOW`, `MEDIUM` *(default)*, `HIGH`, `CRITICAL` |

**Response `201`:**
```json
{
  "data": {
    "id": 42,
    "userId": "john.doe",
    "issueType": "PASSWORD_RESET",
    "description": "I cannot log in. My account may be locked.",
    "priority": "HIGH",
    "status": "OPEN",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "resolvedAt": null
  }
}
```

---

### `GET /api/v1/tickets/:id` — 🔒 JWT required

Get a single ticket by ID.

**Response `200`:** Same as single ticket object above.  
**Response `404`:** Ticket not found.

---

### `PATCH /api/v1/tickets/:id/resolve` — 🔒 JWT required

Mark a ticket as resolved. Sets `status = RESOLVED` and stamps `resolvedAt`.

**Response `200`:** Updated ticket object.  
**Response `409`:** Ticket is already resolved.

---

### `PATCH /api/v1/tickets/:id/escalate` — 🔒 JWT required

Mark a ticket as escalated (`status = ESCALATED`). **Does not send email** — use the webhook for that.

**Response `200`:** Updated ticket object.  
**Response `409`:** Ticket is already escalated or resolved.

---

### `POST /api/v1/kb/search` — 🌐 Public

Search the knowledge base. Returns up to 3 articles ranked by keyword match count.

**Request Body:**
```json
{
  "keyword": "vpn connect"
}
```

**Response `200`:**
```json
{
  "data": [
    {
      "id": 1,
      "issueType": "NETWORK_ISSUE",
      "title": "How to Connect to the Corporate VPN",
      "solution": "Step 1: Download and install GlobalProtect...",
      "keywords": "vpn,globalprotect,remote access,...",
      "matchCount": 2
    }
  ],
  "count": 1,
  "query": "vpn connect"
}
```

---

### `POST /webhooks/escalation` — 🔒 JWT required

Called by Power Automate. Escalates the ticket in SQL, logs to MongoDB, and sends an email.

**Request Body:**
```json
{
  "ticketId": 42,
  "userId": "john.doe",
  "note": "User has been waiting over 4 hours — escalating to L2 support."
}
```

**Response `200`:**
```json
{
  "success": true,
  "ticketId": 42,
  "message": "Ticket #42 has been escalated. Notification sent to it-escalations@company.com."
}
```

---

### `GET /api/v1/auth/demo-token` — Dev only

Returns a signed JWT for dashboard / testing purposes.  
**Disabled in production** (`NODE_ENV=production` returns `404`).

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h"
}
```

---

## Copilot Studio Integration

### How to call `POST /tickets` from a Copilot Studio HTTP Action

In your Copilot Studio topic, add an **HTTP Request** action with the following configuration:

```json
{
  "name": "Create IT Helpdesk Ticket",
  "method": "POST",
  "url": "https://<your-api-host>/api/v1/tickets",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer <your_service_jwt_token>"
  },
  "body": {
    "userId": "<System.User.PrincipalName>",
    "issueType": "<Topic.IssueType>",
    "description": "<Topic.UserDescription>",
    "priority": "<Topic.Priority>"
  },
  "responseSchema": {
    "type": "object",
    "properties": {
      "data": {
        "type": "object",
        "properties": {
          "id":          { "type": "integer" },
          "status":      { "type": "string" },
          "issueType":   { "type": "string" },
          "createdAt":   { "type": "string" }
        }
      }
    }
  }
}
```

**Generating a long-lived service JWT for Copilot Studio:**

```bash
node -e "
  require('dotenv').config();
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: 'copilot-studio-service', role: 'bot' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '365d' }
  );
  console.log(token);
"
```

Store this token as a secret in your Power Platform environment.

### How to call `POST /kb/search`

This endpoint is **public** — no JWT required:

```json
{
  "name": "Search Knowledge Base",
  "method": "POST",
  "url": "https://<your-api-host>/api/v1/kb/search",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "keyword": "<Topic.UserQuery>"
  }
}
```

---

## Dashboard

The ops dashboard is served at `/dashboard` as static HTML + vanilla JS.

**Features:**
- 4 metric cards showing live counts per status
- Filterable, paginated ticket table
- Per-row **Resolve** button
- Auto-refreshes every 30 seconds
- Dark mode UI

**In development**, the dashboard auto-fetches a JWT from `/api/v1/auth/demo-token`.  
**In production**, implement your own auth flow and replace the token acquisition logic in `client/dashboard/app.js`.

---

## Docker Deployment

### Start with Docker Compose (app + MongoDB)

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f app

# Stop
docker compose down
```

### Enable SQL Server container (optional, dev only)

Uncomment the `sqlserver` service in `docker-compose.yml`, then:

```bash
docker compose up -d sqlserver
# Wait ~30 seconds for SQL Server to start
docker exec -i helpdesk-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P <your_password> -C -i /dev/stdin < sql/schema.sql
docker compose up -d app
```

---

## Project Structure

```
Copilot_Studio_Project/
├── server/
│   ├── index.js                    # Express entry point
│   ├── routes/
│   │   ├── tickets.js              # GET, POST /tickets; PATCH resolve/escalate
│   │   ├── kb.js                   # POST /kb/search (public)
│   │   ├── health.js               # GET /health
│   │   ├── webhooks.js             # POST /webhooks/escalation
│   │   └── auth.js                 # GET /auth/demo-token (dev only)
│   ├── controllers/
│   │   ├── ticketController.js     # All ticket CRUD business logic
│   │   ├── kbController.js         # KB search controller
│   │   └── webhookController.js    # Escalation webhook logic
│   ├── middleware/
│   │   └── auth.js                 # JWT verification middleware
│   ├── db/
│   │   ├── sql.js                  # mssql singleton connection pool
│   │   └── mongo.js                # Mongoose connection + ConversationLog model
│   └── services/
│       ├── mailer.js               # Nodemailer escalation email service
│       └── knowledgeBase.js        # KB search with JS-side ranking
├── client/
│   └── dashboard/
│       ├── index.html              # Dark-mode ops dashboard UI
│       └── app.js                  # Vanilla JS dashboard logic
├── sql/
│   └── schema.sql                  # CREATE TABLE + trigger + 10 seed KB articles
├── .env.example                    # Environment variable template
├── package.json
├── Dockerfile                      # Multi-stage, non-root, dumb-init
├── docker-compose.yml              # app + mongo; optional SQL Server
└── README.md
```

---

## Security Notes

- **Never commit `.env`** — it is in `.gitignore` by default.
- The `/api/v1/auth/demo-token` endpoint **returns `404` in production** (`NODE_ENV=production`).
- Use a dedicated service account JWT (not the demo token) for Copilot Studio HTTP Actions.
- Enable `MSSQL_ENCRYPT=true` and `MSSQL_TRUST_SERVER_CERT=false` when connecting to Azure SQL.
- The `Dockerfile` runs as a **non-root user** (`appuser`) for container security.
