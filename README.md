# Universal Library Studio - Database Portal

A modern web application built with Python Flask supporting **Dual-Mode database connectivity**:
- **Oracle Database** (Local SQL*Plus, Oracle 19c/21c/23ai, Oracle XE)
- **Supabase Cloud** (Managed PostgreSQL)

---

## Features

- **Dual-Mode Login**:
  - **Oracle Tab**: Enter username, password, host, port `1521`, Service Name/SID (`xe`, `xepdb1`). Powered by `python-oracledb` thin mode (zero client installation).
  - **Supabase Tab**: Connect to your Supabase project in 1-click by pasting your **Connection URI** (from *Project Settings &rarr; Database &rarr; Connection string &rarr; URI*) or typing host, port `5432`/`6543`, user, and password. Powered by `psycopg2` with automatic SSL.
- **Library Management System Domain**:
  - **1-Click Init Library Tables**: Automatically provisions `LMS_BOOKS`, `LMS_MEMBERS`, `LMS_CATEGORIES`, and `LMS_BOOK_ISSUES` with sample records on either Oracle or Supabase.
  - **Pre-built Library Templates**: In the "New Table" modal, choose presets for **Books**, **Members**, **Issues**, or **Authors** to auto-generate the schema and SQL DDL.
- **Table Browser & Viewer**:
  - Clean table browser that automatically filters out internal system tables (e.g. `USER_TABLES` catalog tables, system schemas).
  - Inspect column names, data types, primary key badges.
  - Formatted data grid with in-table search and row counts.
- **Row Operations**:
  - **Insert Row**: Dynamically adapts to column types and nullability.
  - **Delete Row**: Row-level deletion using physical row pointers (`ROWID` for Oracle, `ctid` for Supabase/PostgreSQL).
- **Table Operations**:
  - **Create Table Builder**: Visual column editor with live SQL DDL preview tailored to Oracle or PostgreSQL.
  - **Drop Table**: Safe confirmation dialog with `CASCADE` options.
- **SQL Console**:
  - Run arbitrary queries (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`).
  - Supports keyboard shortcuts (`Ctrl + Enter`) and quick query buttons.

---

## How to Run

### Option 1: 1-Click Startup (Windows)
Double-click `run.bat` in this folder. It will:
1. Verify the virtual environment `.venv` and install dependencies.
2. Launch your browser at `http://localhost:5000`.
3. Start the Flask server.

### Option 2: Command Line
```powershell
cd C:\Users\Lenovo\Downloads\PAT4
.\.venv\Scripts\activate
python app.py
```
Open **[http://localhost:5000](http://localhost:5000)** in your browser.

---

## Connecting to Supabase

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Project Settings** &rarr; **Database**.
3. Under **Connection string**, select **URI** and copy the URI (e.g. `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`).
4. Replace `[YOUR-PASSWORD]` with your Supabase database password.
5. On the Library Studio login page, select the **Supabase (Cloud)** tab, paste the URI, and click **Connect to Supabase**!
