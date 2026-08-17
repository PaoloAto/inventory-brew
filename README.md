# Inventory Brew

Restaurant inventory and recipe management app (MERN) with a Material-style React UI.

## Current Status

The project is now backend-integrated and running end-to-end locally:

- Ingredients: CRUD, stock adjust, archive/restore
- Recipes: CRUD, archive/restore, recipe details, cook flow
- Cook flow: subtracts ingredient stock and writes inventory transactions
- Transactions: filterable history endpoint + frontend page
- Dashboard: backend-driven summary and recent activity

## Tech Stack

- Frontend: React + TypeScript + Vite + MUI
- Backend: Node.js + Express + Mongoose
- Database: MongoDB (local or Atlas)

## Project Structure

```text
inventory/
  client/
  server/
  package.json          # root scripts for local orchestration
```

## Local Deployment (Simple)

### 1. Prerequisites

- Node.js 22
- npm 10+
- MongoDB running locally (or Atlas URI)

### 2. Environment Files

Create `.env` files from examples:

```bash
# from repo root
copy server\\.env.example server\\.env
copy client\\.env.example client\\.env
```

Set values as needed.

`server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/inventory-brew
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

`client/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 3. Install Dependencies

```bash
# root
npm install

# server
cd server && npm install

# client
cd ../client && npm install
```

### 4. Run Both Apps

From repo root:

```bash
npm run dev
```

This starts:

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

If you prefer separate terminals:

```bash
npm run dev:server
npm run dev:client
```

## Hardening Included (Local-friendly)

Backend now includes:

- Configurable CORS allowlist via `CORS_ORIGIN`
- `/api/health` and `/api/ready` endpoints
- Graceful shutdown for `SIGINT` / `SIGTERM`
- Unhandled error fallback middleware
- JSON body size limit (`1mb`)

## API Quick Checks

Use browser/Postman/curl:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/ready
curl http://localhost:5000/api/ingredients?page=1&limit=5
curl http://localhost:5000/api/recipes?page=1&limit=5
curl http://localhost:5000/api/transactions?page=1&limit=10
curl http://localhost:5000/api/dashboard/summary
```

## Useful Commands

From repo root:

```bash
npm run dev        # run client + server
npm run test       # run backend integration tests
npm run build      # build frontend
npm run seed       # seed sample data (server/scripts/seed.js)
```

From `server/`:

```bash
npm run test
npm run seed
npm run seed:dry
```

## Testing and CI

The CI workflow uses Node.js 22 for both client and server verification. This stable major satisfies the current Mongoose and Vite dependency requirements.

Run the client checks locally from the repository root:

```bash
npm run lint --prefix client
npm run build --prefix client
```

Run the server integration suite locally:

```bash
npm test --prefix server
```

The server tests use the real Express app, Mongoose, and a temporary MongoDB replica set so transaction behavior is exercised. The local environment must permit `mongodb-memory-server` to download and launch `mongod`.

GitHub Actions automatically runs separate client quality and server integration jobs for pushes and pull requests to `main`. CI is the authoritative clean Linux validation environment.

## Notes

- Client lint may show an informational Baseline dataset age notice; it does not block build.
- Keep `.env` files local (already ignored by `.gitignore`).
