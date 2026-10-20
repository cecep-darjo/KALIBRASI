# Reference Backend: Express + MSSQL Server 2019

This folder contains a **reference Node.js (Express) backend** that connects to
**Microsoft SQL Server 2019** using the `mssql` library. It is provided so you can
deploy the same data model to your own MSSQL infrastructure.

> **Note:** The running Bolt app uses Supabase (PostgreSQL) as its live backend.
> These files are reference / starter code for an on-premise MSSQL deployment and
> are NOT executed by the Bolt dev server.

## Files

- `config/db.js` — MSSQL connection pool configuration (connection string).
- `server.js` — Express API server with CRUD routes for all tables.
- `schema.sql` — SQL Server 2019 schema (Users, Equipment, Calibration_Tasks,
  Calibration_Results) mirroring the Supabase schema.
- `package.json` — Backend dependencies (express, mssql, pdfmake, qrcode, bcryptjs, jsonwebtoken, cors).

## Setup

```bash
cd mssql-backend
npm install
# Set your connection string in .env (see .env.example)
#   MSSQL_CONNECTION_STRING=Server=localhost,1433;Database=KalibrasiDB;User Id=sa;Password=your_password;Encrypt=true;TrustServerCertificate=true
#   JWT_SECRET=your-jwt-secret
# Apply the schema to your SQL Server:
#   sqlcmd -S localhost -U sa -P your_password -d KalibrasiDB -i schema.sql
npm run dev
```

The API runs on http://localhost:4000.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login (returns JWT) |
| GET | /api/equipment | List all equipment |
| POST | /api/equipment | Create equipment |
| PUT | /api/equipment/:id | Update equipment |
| DELETE | /api/equipment/:id | Delete equipment |
| GET | /api/tasks | List calibration tasks |
| POST | /api/tasks | Assign a task |
| PUT | /api/tasks/:id/status | Update task status |
| GET | /api/results/:taskId | Get calibration results |
| POST | /api/results | Submit calibration results |
| POST | /api/approvals | Submit an approval (SPV / Senior SPV) |
| GET | /api/reports/:taskId | Generate PDF report (pdfmake + QR) |
