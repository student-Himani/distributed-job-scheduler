# System Architecture Document

## Overview
The **Distributed Job Scheduler** is a production-grade, multi-tenant background execution platform engineered for high reliability, fault tolerance, and concurrency.

```
                  +-----------------------------------+
                  |   Web Monitoring Dashboard (web)  |
                  |     React + TypeScript + Vite     |
                  +-----------------+-----------------+
                                    |
                                    v HTTP / REST
                  +-----------------+-----------------+
                  |      Express REST API (api)       |
                  |    Node.js + Zod Validation       |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v Prisma ORM                                    v Prisma ORM
  +---------+---------+                           +---------+---------+
  | PostgreSQL DB     |                           | Standalone Worker |
  | (Job Datastore)   |                           | Process (worker)  |
  +-------------------+                           +-------------------+
```

## Monorepo Layout

| Path | Package Name | Role & Description |
| :--- | :--- | :--- |
| `apps/api` | `@job-scheduler/api` | Express REST API backend servicing dashboard & job submission |
| `apps/worker` | `@job-scheduler/worker` | Standalone Node.js daemon for atomic job claiming & execution |
| `apps/web` | `@job-scheduler/web` | Vite + React + Tailwind CSS monitoring control center |
| `packages/shared` | `@job-scheduler/shared` | Shared TypeScript types, schemas, logger, and system constants |
| `prisma/` | N/A | Prisma ORM schema & migration directory |
| `infra/` | N/A | Docker Compose & deployment infrastructure |

## Phase Roadmap

- **Phase 1 (Completed)**: Monorepo foundation, multi-service setup, TypeScript configs, Prisma ORM initialization, environment management, and health endpoint monitoring.
- **Phase 2**: Database Schema Design (User, Org, Project, Queue, Job, JobExecution, RetryPolicy, Worker, Heartbeat, JobLog, ScheduledJob, DLQ).
- **Phase 3**: Authentication & Organization/Project/Queue Management APIs.
- **Phase 4**: Atomic Job Ingestion, Queueing, Priority & Scheduling Engine.
- **Phase 5**: Worker Service Execution Engine (Atomic claiming, concurrency limits, heartbeats, graceful shutdown).
- **Phase 6**: Reliability, Backoff Retry Policies (Fixed, Linear, Exponential), and Dead Letter Queue (DLQ).
- **Phase 7**: Full Web Dashboard (Queue Control, Job Explorer, Worker Monitor, Live Metrics).
- **Phase 8**: Verification, Stress Testing, and Final Documentation (ER diagram, Architecture diagrams, API docs).
