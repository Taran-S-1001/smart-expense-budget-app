# Smart Expense and Budget Management (SEBM)

A web application for recording expenses and income, managing multiple accounts, setting budgets, receiving alerts and viewing reports. Built as a layered modular monolith: Node.js + Express REST API, React web client, PostgreSQL.

Project documents (SRS, SAD, Test Plan) are in `docs/`. The sprint plan is in `SPRINT_PLAN.md`.

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (LTS)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (runs PostgreSQL locally)

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/Taran-S-1001/smart-expense-budget-app.git
cd smart-expense-budget-app
```

### 2. Start PostgreSQL

Make sure Docker Desktop is running, then:

```bash
docker compose up -d
docker compose ps
```

Wait until the `db` service shows `healthy`. On first start two databases are created:

| Database | Purpose |
|---|---|
| `sebm` | Local development |
| `sebm_test` | Automated tests (Jest + Supertest) |

Default development connection (override with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` in your environment):

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| User | `sebm` |
| Password | `sebm_dev_password` |

These are local development defaults only. Never commit a `.env` file or real secrets.

### 3. Verify the databases

```bash
docker exec -it sebm-postgres psql -U sebm -c "\l"
```

Both `sebm` and `sebm_test` should be listed. Press `q` to leave the pager.

### 4. Backend and frontend

Backend setup (`npm install`, `.env`, migrations, `npm test`) will be documented here once the backend scaffold, migrations and test harness are merged (D-02, D-03, D-07).

## Useful Docker commands

```bash
docker compose stop        # stop the database, keep the data
docker compose down        # remove the container, keep the data
docker compose down -v     # remove the container AND all data (re-runs the init script on next start)
docker compose logs -f db  # follow database logs
```

## Troubleshooting

- **Port 5432 already in use:** another PostgreSQL is running on your machine. Stop it, or change the left side of the `ports` mapping in `docker-compose.yml` (for example `5433:5432`).
- **`sebm_test` is missing:** the init script only runs on a fresh volume. Run `docker compose down -v` and then `docker compose up -d`.
- **`docker` is not recognised:** start Docker Desktop, then open a new terminal.

## Team workflow

- One issue = one branch = one PR. Branch name: `feature/<issue-number>-<short-name>`, cut from `main`.
- No direct commits to `main`. The repo owner reviews and merges every PR, and CI must be green first.
- Commit format: `feat(module): description (#issue)`, also `test(...)`, `fix(...)`, `docs(...)`.
- Anything that differs from the SRS, SAD or Test Plan is logged in `docs/DEVIATIONS.md`.