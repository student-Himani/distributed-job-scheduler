
# Distributed Job Scheduler

🚀 Live Application: https://distributed-job-scheduler-five.vercel.app


# Distributed Job Scheduler Monorepo

An enterprise-grade, distributed background job processing engine built with Node.js, Express, TypeScript, Prisma ORM, PostgreSQL 16, and React (Vite, TailwindCSS, Lucide Icons).

---

## Architecture Overview

- **REST API Gateway (`apps/api`)**: Port `3001`
- **Worker Executor Daemon (`apps/worker`)**: Port `3002`
- **Web UI Dashboard (`apps/web`)**: Port `5173`
- **PostgreSQL Database (`prisma`)**: Port `5432`

---

## Step-by-Step Developer Setup & Execution Guide

### Prerequisites

- Node.js `v20.x` or higher
- PostgreSQL `16.x` installed and running on `localhost:5432`

---

### Step 1: Install Dependencies

Open a PowerShell terminal in the repository root and run:

```powershell
npm install
```

---

### Step 2: Configure Environment Variables

Copy or create `.env` in both repository root and `apps/api/.env`:

**File: `apps/api/.env` and `.env`**

```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/jobscheduler?schema=public"
JWT_SECRET="super-secret-jwt-key-distributed-job-scheduler-2026"
JWT_EXPIRES_IN="7d"
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL="http://localhost:3001/api/v1/auth/google/callback"
```

---

### Step 3: Run Prisma Database Setup

Sync your local PostgreSQL database with Prisma schema:

```powershell
npx prisma format
npx prisma validate
npx prisma db push
```

---

### Step 4: Run Monorepo Services (Open 3 Terminals)

#### **Terminal 1: Express REST API (Port 3001)**

```powershell
npm run dev:api
```

#### **Terminal 2: Worker Daemon (Port 3002)**

```powershell
npm run dev:worker
```

#### **Terminal 3: Vite React Web UI (Port 5173)**

```powershell
npm run dev:web
```

---

### Step 5: Run Automated Integration Tests & Verification

To execute all 79 Jest integration test suites across Modules 3–13:

```powershell
npm run type-check
npm run build
npm test -w @job-scheduler/api
```

---

### System Health Verification Endpoints

1. **API Gateway Health**: `http://localhost:3001/api/v1/metrics/health`
2. **Worker Daemon Health**: `http://localhost:3002/health`
3. **Web Dashboard**: `http://localhost:5173`

---

## Manual End-to-End User Verification Checklist

1. Open `http://localhost:5173`.
2. Click **"Continue with Google"** or **Register Account** with `email`, `password` (8+ chars), `name`, `organizationName`.
3. In the Sidebar, click **"+ Create Project"** to create a project (e.g. `Payment Engine`).
4. Navigate to **Queues** and click **"+ Create Queue"** (Priority: `HIGH`, Concurrency Limit: `10`).
5. Navigate to **Jobs & Logs** and click **"Enqueue New Job"**.
6. Check **Worker Fleet** page to verify worker telemetry & concurrency load.
7. Open **Cron Schedules** to create a recurring task (e.g., `0 0 * * *`).
8. View **Dead-Letter Queue (DLQ)** to inspect or re-enqueue failed jobs.
9. View **Subsystem Health** for system telemetry.
10. Click **Logout** to safely clear JWT session.
