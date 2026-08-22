# Entity-Relationship (ER) Diagram

The following Mermaid ER diagram documents the normalized PostgreSQL database schema designed in Prisma for the **Distributed Job Scheduler** platform.

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "owns"
    ORGANIZATION ||--o{ PROJECT : "owns"

    PROJECT ||--o{ QUEUE : "owns"
    PROJECT ||--o{ JOB : "owns"
    PROJECT ||--o{ WORKER : "registers"

    RETRY_POLICY ||--o{ QUEUE : "configures (optional)"
    RETRY_POLICY ||--o{ JOB : "configures (optional)"

    USER ||--o{ JOB : "creates (optional)"

    QUEUE ||--o{ JOB : "contains"

    WORKER ||--o{ WORKER_HEARTBEAT : "emits"
    WORKER ||--o{ JOB : "executes (assigned)"
    WORKER ||--o{ JOB_EXECUTION : "runs"

    JOB ||--o| SCHEDULED_JOB : "schedules (1-to-1)"
    JOB ||--o{ JOB_EXECUTION : "records history"
    JOB ||--o{ JOB_LOG : "emits logs"
    JOB ||--o| DEAD_LETTER_QUEUE_ENTRY : "moves to DLQ (1-to-1)"

    ORGANIZATION {
        string id PK
        string name
        string slug UK
        datetime createdAt
        datetime updatedAt
    }

    USER {
        string id PK
        string email UK
        string name
        string passwordHash
        enum role
        string organizationId FK
        datetime createdAt
        datetime updatedAt
    }

    PROJECT {
        string id PK
        string name
        string slug
        string apiKey UK
        string organizationId FK
        datetime createdAt
        datetime updatedAt
    }

    RETRY_POLICY {
        string id PK
        string name
        int maxRetries
        enum strategy
        int initialIntervalMs
        int maxIntervalMs
        float backoffFactor
        datetime createdAt
        datetime updatedAt
    }

    QUEUE {
        string id PK
        string name
        enum priority
        int concurrencyLimit
        boolean isPaused
        string projectId FK
        string retryPolicyId FK
        datetime createdAt
        datetime updatedAt
    }

    JOB {
        string id PK
        string name
        enum type
        enum status
        int priority
        json payload
        json result
        json errorDetails
        int retryCount
        int maxRetries
        string projectId FK
        string queueId FK
        string createdById FK
        string retryPolicyId FK
        string assignedWorkerId FK
        datetime scheduledAt
        datetime claimedAt
        datetime startedAt
        datetime completedAt
        datetime failedAt
        datetime createdAt
        datetime updatedAt
    }

    SCHEDULED_JOB {
        string id PK
        string jobId FK, UK
        string cronExpression
        string timezone
        datetime nextRunAt
        datetime lastRunAt
        boolean isRecurring
        int totalRuns
        datetime createdAt
        datetime updatedAt
    }

    WORKER {
        string id PK
        string name
        string hostname
        int pid
        enum status
        int currentConcurrency
        int maxConcurrency
        string projectId FK
        datetime lastHeartbeatAt
        datetime createdAt
        datetime updatedAt
    }

    WORKER_HEARTBEAT {
        string id PK
        string workerId FK
        float cpuUsage
        float memoryUsageMb
        int activeJobs
        json systemMetrics
        datetime timestamp
    }

    JOB_EXECUTION {
        string id PK
        string jobId FK
        string workerId FK
        int attempt
        enum status
        datetime startedAt
        datetime finishedAt
        int durationMs
        json output
        string error
        string stackTrace
        json metrics
        datetime createdAt
    }

    JOB_LOG {
        string id PK
        string jobId FK
        string executionId
        enum level
        string message
        json metadata
        datetime timestamp
    }

    DEAD_LETTER_QUEUE_ENTRY {
        string id PK
        string jobId FK, UK
        string reason
        int failedAtAttempts
        string lastError
        string errorStack
        enum status
        string reviewedById
        datetime reviewedAt
        string resolutionNotes
        datetime createdAt
        datetime updatedAt
    }
```

---

## Entity Descriptions

| Entity | Primary Key | Key Foreign Keys & Indexes | Role in Platform |
| :--- | :--- | :--- | :--- |
| **Organization** | `id` (UUID) | `slug` (Unique) | Top-level tenant boundary |
| **User** | `id` (UUID) | `organizationId`, `email` (Unique) | User identity & authentication |
| **Project** | `id` (UUID) | `organizationId`, `(organizationId, slug)` (Unique) | Project workspace owning queues and jobs |
| **RetryPolicy** | `id` (UUID) | Configures fixed, linear, or exponential retry backoff | Reusable retry policy template |
| **Queue** | `id` (UUID) | `projectId`, `(projectId, name)` (Unique) | Queue container supporting priority and concurrency limits |
| **Job** | `id` (UUID) | `projectId`, `queueId`, `assignedWorkerId`, `status` | Core background job model |
| **ScheduledJob** | `id` (UUID) | `jobId` (1-to-1 Unique), `nextRunAt` (Indexed) | Extensions for delayed and cron recurring jobs |
| **Worker** | `id` (UUID) | `projectId`, `status`, `lastHeartbeatAt` (Indexed) | Active worker process node tracking concurrency |
| **WorkerHeartbeat**| `id` (UUID) | `workerId`, `timestamp` (Indexed) | High-frequency telemetry pulse logs |
| **JobExecution** | `id` (UUID) | `jobId`, `workerId`, `(jobId, attempt)` (Indexed) | Historical log of every execution attempt |
| **JobLog** | `id` (UUID) | `jobId`, `timestamp` (Indexed) | Application execution stdout/stderr logs |
| **DeadLetterQueueEntry**| `id` (UUID) | `jobId` (1-to-1 Unique), `status` (Indexed) | Terminal failure records requiring human review/retry |
