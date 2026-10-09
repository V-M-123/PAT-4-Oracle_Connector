# Oracle Studio - Web Database Manager

A modern web application built with Python Flask and `python-oracledb` that connects to a local Oracle Database (e.g. Oracle XE, Oracle 19c/21c/23ai, SQL*Plus schemas).

## Features

- **Direct Oracle Authentication**: Login page that connects directly with your Oracle Database schema user (e.g., `SYSTEM`, `SCOTT`, `HR`), host, port (`1521`), and Service Name or SID (`xe`, `orcl`, `xepdb1`).
- **Thin Mode Connectivity**: Powered by `python-oracledb` thin mode — runs with zero Oracle Instant Client or C-library installations required.
- **Table Explorer**: Lists all tables in your current Oracle schema (`USER_TABLES`), with real-time search/filter and row count indicators.
- **Table Content Viewer**:
  - View column names, data types, and primary key badges.
  - View table rows with formatted dates, numbers, and strings.
  - Search/filter across rows on the fly.
- **Row Insert & Delete**:
  - **Insert Row**: Dynamic modal adapting to the table's schema and column types (VARCHAR2, NUMBER, DATE, etc.).
  - **Delete Row**: Row-level deletion using Oracle's unique `ROWID` (guaranteeing exact row deletion even on tables without primary keys).
- **Create & Drop Tables**:
  - **Create Table Builder**: Visual column editor (column name, data type, length/precision, nullability, primary key) with real-time editable SQL DDL preview.
  - **Drop Table**: Safe confirmation dialog with optional `CASCADE CONSTRAINTS`.
- **Integrated SQL Console**: Execute arbitrary queries (SELECT, DDL, DML) with instant tabular output and affected row reporting.

## Getting Started

### 1-Click Launch (Windows)
Double-click `run.bat` in this folder. It will:
1. Verify the virtual environment `.venv`
2. Launch your browser at `http://localhost:5000`
3. Start the Flask application

### Manual Launch (Command Line)
1. Open PowerShell / Command Prompt in this folder:
```powershell
.\.venv\Scripts\activate
python app.py
```
2. Navigate to `http://localhost:5000` in your web browser.

### Login Details
Enter your local Oracle Database credentials:
- **Username**: e.g., `SYSTEM` or your local schema name
- **Password**: Your Oracle user password
- **Host**: `localhost` (default)
- **Port**: `1521` (default)
- **Service Name**: `xe` (default for Oracle XE) or `xepdb1`, `orcl`
