# Smart Expense and Budget Management (SEBM)

A web application for recording expenses and income, managing multiple accounts, setting budgets, receiving alerts and viewing reports. Built as a layered modular monolith: Node.js + Express REST API, React web client, PostgreSQL.

Project documents (SRS, SAD, Test Plan) are in `docs/`. The sprint plan is in `SPRINT_PLAN.md`.

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (20)
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
docker compose up -d --wait
docker compose ps
```

Compose reads overrides from shell environment variables or a `.env` file in the project folder. On first start two databases are created:

| Database | Purpose |
|---|---|
| `sebm` | Local development |
| `sebm_test` | Automated tests (Jest + Supertest) |

Default development connection (override with `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in your shell environment or project `.env` file):

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| User | `sebm` |
| Password | `sebm_dev_password` |

These are local development defaults only. Never commit a `.env` file or real secrets.
Changing `POSTGRES_PASSWORD` after the database has been initialized does not change the existing database password. Applying a new password requires recreating the database volume with `docker compose down -v`, which deletes all local database data.

### 3. Verify the databases

```bash
docker exec -it sebm-postgres psql -U sebm -c "\l"
```

Replace `sebm` after `-U` with your configured `POSTGRES_USER` if you changed the default. Both `sebm` and `sebm_test` should be listed.

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

- **Port 5432 already in use:** another PostgreSQL is running on your machine. Stop it, or change the left side of the `ports` mapping in `docker-compose.yml` (for example `127.0.0.1:5433:5432`).
- **`sebm_test` is missing:** create it in the running container with `docker exec -it sebm-postgres psql -U sebm -c "CREATE DATABASE sebm_test;"` (replace `sebm` if you changed `POSTGRES_USER`). The init script only runs on a fresh volume. `docker compose down -v` also recreates it, but permanently deletes your local development data.
- **`docker` is not recognised:** start Docker Desktop, then open a new terminal.

### Clear demo data for one user

To reset a demo run without deleting other users or the databases, remove only the demo user from the development database (`sebm`). This also removes that user's accounts, transactions, budgets, notifications, and custom categories through the configured foreign-key cascades. It does not remove shared predefined categories.

Open a PostgreSQL prompt in the running container:

```bash
docker exec -it sebm-postgres psql -U sebm -d sebm
```

At the `sebm` prompt, replace `YOUR_DEMO_EMAIL` with the exact email used for the demo. First inspect the matching user, then delete their transactions and user row inside a transaction:

```sql
BEGIN;

SELECT user_id, name, email
FROM users
WHERE lower(email) = lower('YOUR_DEMO_EMAIL');

DELETE FROM transactions t
USING accounts a
WHERE t.account_id = a.account_id
  AND a.user_id = (
    SELECT user_id
    FROM users
    WHERE lower(email) = lower('YOUR_DEMO_EMAIL')
  );

DELETE FROM users
WHERE lower(email) = lower('YOUR_DEMO_EMAIL')
RETURNING user_id, name, email;
```

Check the returned email before committing. If it is the intended demo user, run `COMMIT;`. If it is not, or you are unsure, run `ROLLBACK;` instead. Exit `psql` with `\q`, then register the demo user again. Do not use `docker compose down -v` to clear one user's data; that deletes the entire local database volume.

## Team workflow

- One issue = one branch = one PR, cut from `main`. Feature branches use `feature/<module>/<issue>-<short-name>`; independent test branches use `test/<module>/<issue>-<short-name>`; bug fixes use `feature/<module>/<bug-issue>-fix-<short-name>`.
- No direct commits to `main`. Dev A reviews and merges; Dev D reviews Dev A's PRs. Nobody merges their own PR, and CI must be green first.
- Use the commit-style convention for PR titles (for example, `docs(setup): fix database setup (#15)`) and include `Closes #<issue>` in the PR description.
- Before merging, rebase on the latest `main` with `git fetch origin` and `git rebase origin/main`. If the branch was already pushed, update it with `git push --force-with-lease`.
- Commit format: `feat(module): description (#issue)`, also `test(...)`, `fix(...)`, `docs(...)`.
- Anything that differs from the SRS, SAD or Test Plan is logged in `docs/DEVIATIONS.md`.