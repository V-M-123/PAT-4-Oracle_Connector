import os
import datetime
from decimal import Decimal
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
import oracledb

app = Flask(__name__)
# Secure secret key for session storage
app.secret_key = os.urandom(24)

def sanitize_identifier(name: str) -> str:
    """Ensure identifier does not contain quotes or malicious characters."""
    if not name or not name.isidentifier():
        # Strip allowed chars or fallback
        clean = "".join(c for c in name if c.isalnum() or c in ("_", "$", "#"))
        if not clean:
            raise ValueError(f"Invalid identifier name: {name}")
        return clean
    return name

def get_db_connection():
    """Establish and return an Oracle DB connection using session credentials."""
    if 'db_user' not in session:
        return None
    
    user = session.get('db_user')
    password = session.get('db_password')
    host = session.get('db_host', 'localhost')
    port = session.get('db_port', 1521)
    service_name = session.get('db_service_name', 'xe')
    sid = session.get('db_sid')
    
    try:
        port = int(port)
    except (ValueError, TypeError):
        port = 1521

    if sid:
        dsn = oracledb.makedsn(host, port, sid=sid)
    else:
        dsn = oracledb.makedsn(host, port, service_name=service_name)
        
    return oracledb.connect(user=user, password=password, dsn=dsn)

def serialize_value(val):
    """Serialize Oracle values to JSON-friendly data types."""
    if val is None:
        return None
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return int(val) if val % 1 == 0 else float(val)
    if isinstance(val, oracledb.LOB):
        return val.read()
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='replace')
    return str(val) if not isinstance(val, (int, float, bool)) else val

@app.route('/')
def index():
    if 'db_user' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        if 'db_user' in session:
            return redirect(url_for('dashboard'))
        return render_template('login.html')
    
    # POST login request
    user = request.form.get('username', '').strip()
    password = request.form.get('password', '')
    host = request.form.get('host', 'localhost').strip() or 'localhost'
    port = request.form.get('port', '1521').strip() or '1521'
    conn_type = request.form.get('conn_type', 'service')
    service_name = request.form.get('service_name', 'xe').strip()
    sid = request.form.get('sid', '').strip()

    if not user or not password:
        flash('Username and Password are required.', 'danger')
        return render_template('login.html', host=host, port=port, service_name=service_name, sid=sid, user=user)

    try:
        port_num = int(port)
    except ValueError:
        flash('Invalid port number.', 'danger')
        return render_template('login.html', host=host, port=port, service_name=service_name, sid=sid, user=user)

    try:
        if conn_type == 'sid' and sid:
            dsn = oracledb.makedsn(host, port_num, sid=sid)
        else:
            dsn = oracledb.makedsn(host, port_num, service_name=service_name or 'xe')

        # Test connection
        with oracledb.connect(user=user, password=password, dsn=dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM DUAL")

        # Save to session
        session['db_user'] = user
        session['db_password'] = password
        session['db_host'] = host
        session['db_port'] = port_num
        if conn_type == 'sid' and sid:
            session['db_sid'] = sid
            session.pop('db_service_name', None)
        else:
            session['db_service_name'] = service_name or 'xe'
            session.pop('db_sid', None)

        flash(f'Successfully connected as {user.upper()}!', 'success')
        return redirect(url_for('dashboard'))
    except Exception as e:
        flash(f'Connection failed: {str(e)}', 'danger')
        return render_template('login.html', host=host, port=port, service_name=service_name, sid=sid, user=user, conn_type=conn_type)

@app.route('/logout', methods=['GET', 'POST'])
def logout():
    session.clear()
    flash('You have been disconnected and logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if 'db_user' not in session:
        return redirect(url_for('login'))
    return render_template('dashboard.html', 
                           username=session.get('db_user'), 
                           host=session.get('db_host'), 
                           port=session.get('db_port'),
                           service=session.get('db_service_name') or session.get('db_sid'))

# ========================= API ROUTES =========================

SYSTEM_TABLE_PATTERNS = [
    r'[$]',
    r'^(AQ|DEF|LOGMNR|LOGSTDBY|SCHEDULER|SQLPLUS|PRODUCT|HELP|SYS|KU|STREAMS|WRI|WRH|WRM|HS|XDB|DR|SDO|GSM|MGW|AW|PS|ROLLING|REDO|APPLY|CDC|CMP|DATAPUMP|EXU|IMP|MLOG|RUPD|SLND|ALERT|AUDIT|AV_|BDSQL|CATALOG|CLUSTER|CQN|DBA_|DBMS_|DDL_|DUAL|FOREIGN_|HANG_|IMPDP|INC|LTXID|MAP_|METASTYLESHEET|OBJECT_USAGE|OPATCH_|PSTUB|PTSHD_|RESOURCE_MAP|SAM_|SHARD_|SMON_|SPD_|STMT_|SYSTEM_|TABLE_PRIVILEGE|UNIFIED_|USER_.*_MAP|UTL_|_DEFAULT_)',
]

@app.route('/api/tables', methods=['GET'])
def get_tables():
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    exclude_system = request.args.get('exclude_system', 'true').lower() == 'true'
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if exclude_system:
                    cur.execute("""
                        SELECT table_name, num_rows 
                        FROM user_tables 
                        WHERE table_name NOT LIKE '%$%'
                          AND NOT REGEXP_LIKE(table_name, '^(AQ|DEF|LOGMNR|LOGSTDBY|SCHEDULER|SQLPLUS|PRODUCT|HELP|SYS|KU|STREAMS|WRI|WRH|WRM|HS|XDB|DR|SDO|GSM|MGW|AW|PS|ROLLING|REDO|APPLY|CDC|CMP|DATAPUMP|EXU|IMP|MLOG|RUPD|SLND|ALERT|AUDIT|AV_|BDSQL|CATALOG|CLUSTER|CQN|DBA_|DBMS_|DDL_|DUAL|FOREIGN_|HANG_|IMPDP|INC|LTXID|MAP_|METASTYLESHEET|OBJECT_USAGE|OPATCH_|PSTUB|PTSHD_|RESOURCE_MAP|SAM_|SHARD_|SMON_|SPD_|STMT_|SYSTEM_|TABLE_PRIVILEGE|UNIFIED_|USER_.*_MAP|UTL_|_DEFAULT_)', 'i')
                        ORDER BY table_name ASC
                    """)
                else:
                    cur.execute("""
                        SELECT table_name, num_rows 
                        FROM user_tables 
                        ORDER BY table_name ASC
                    """)
                tables = [{'name': row[0], 'num_rows': row[1] if row[1] is not None else '-'} for row in cur.fetchall()]
                return jsonify({'tables': tables})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/init-library-schema', methods=['POST'])
def init_library_schema():
    """Create sample Library Management System tables and initial data."""
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    ddl_statements = [
        """
        CREATE TABLE LMS_CATEGORIES (
            CATEGORY_ID NUMBER(5) PRIMARY KEY,
            CATEGORY_NAME VARCHAR2(100) NOT NULL,
            DESCRIPTION VARCHAR2(255)
        )
        """,
        """
        CREATE TABLE LMS_BOOKS (
            BOOK_ID NUMBER(10) PRIMARY KEY,
            TITLE VARCHAR2(150) NOT NULL,
            AUTHOR VARCHAR2(100) NOT NULL,
            ISBN VARCHAR2(20),
            CATEGORY_ID NUMBER(5),
            PUBLISHED_YEAR NUMBER(4),
            TOTAL_COPIES NUMBER(4) DEFAULT 1,
            AVAILABLE_COPIES NUMBER(4) DEFAULT 1
        )
        """,
        """
        CREATE TABLE LMS_MEMBERS (
            MEMBER_ID NUMBER(10) PRIMARY KEY,
            FULL_NAME VARCHAR2(100) NOT NULL,
            EMAIL VARCHAR2(100),
            PHONE VARCHAR2(20),
            MEMBERSHIP_DATE DATE DEFAULT SYSDATE,
            STATUS VARCHAR2(20) DEFAULT 'ACTIVE'
        )
        """,
        """
        CREATE TABLE LMS_BOOK_ISSUES (
            ISSUE_ID NUMBER(10) PRIMARY KEY,
            BOOK_ID NUMBER(10) NOT NULL,
            MEMBER_ID NUMBER(10) NOT NULL,
            ISSUE_DATE DATE DEFAULT SYSDATE,
            DUE_DATE DATE,
            RETURN_DATE DATE,
            FINE_AMOUNT NUMBER(8,2) DEFAULT 0,
            STATUS VARCHAR2(20) DEFAULT 'ISSUED'
        )
        """
    ]

    sample_inserts = [
        "INSERT INTO LMS_CATEGORIES VALUES (1, 'Computer Science', 'Technical & Programming books')",
        "INSERT INTO LMS_CATEGORIES VALUES (2, 'Fiction', 'Novels and stories')",
        "INSERT INTO LMS_CATEGORIES VALUES (3, 'Science & Nature', 'Physics, Chemistry, Biology')",
        
        "INSERT INTO LMS_BOOKS VALUES (101, 'Introduction to Algorithms', 'Thomas H. Cormen', '9780262033848', 1, 2009, 5, 4)",
        "INSERT INTO LMS_BOOKS VALUES (102, 'Clean Code', 'Robert C. Martin', '9780132350884', 1, 2008, 3, 3)",
        "INSERT INTO LMS_BOOKS VALUES (103, 'To Kill a Mockingbird', 'Harper Lee', '9780061120084', 2, 1960, 4, 2)",
        "INSERT INTO LMS_BOOKS VALUES (104, 'A Brief History of Time', 'Stephen Hawking', '9780553380163', 3, 1988, 2, 2)",
        
        "INSERT INTO LMS_MEMBERS (MEMBER_ID, FULL_NAME, EMAIL, PHONE, STATUS) VALUES (1, 'Alice Johnson', 'alice@example.com', '555-0199', 'ACTIVE')",
        "INSERT INTO LMS_MEMBERS (MEMBER_ID, FULL_NAME, EMAIL, PHONE, STATUS) VALUES (2, 'Bob Smith', 'bob@example.com', '555-0144', 'ACTIVE')",
        "INSERT INTO LMS_MEMBERS (MEMBER_ID, FULL_NAME, EMAIL, PHONE, STATUS) VALUES (3, 'Charlie Brown', 'charlie@example.com', '555-0182', 'ACTIVE')",

        "INSERT INTO LMS_BOOK_ISSUES (ISSUE_ID, BOOK_ID, MEMBER_ID, ISSUE_DATE, DUE_DATE, FINE_AMOUNT, STATUS) VALUES (1001, 101, 1, SYSDATE - 5, SYSDATE + 9, 0, 'ISSUED')",
        "INSERT INTO LMS_BOOK_ISSUES (ISSUE_ID, BOOK_ID, MEMBER_ID, ISSUE_DATE, DUE_DATE, FINE_AMOUNT, STATUS) VALUES (1002, 103, 2, SYSDATE - 10, SYSDATE + 4, 0, 'ISSUED')"
    ]

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                created = []
                for ddl in ddl_statements:
                    tname = ddl.strip().split()[2].upper()
                    # Check if already exists
                    cur.execute("SELECT COUNT(*) FROM user_tables WHERE table_name = :tname", tname=tname)
                    if cur.fetchone()[0] == 0:
                        cur.execute(ddl.strip())
                        created.append(tname)
                
                # Insert initial sample data if tables were just created
                if created:
                    for ins in sample_inserts:
                        try:
                            cur.execute(ins)
                        except Exception:
                            pass
                    conn.commit()

        return jsonify({'message': f'Library Schema Initialized! Created tables: {", ".join(created) if created else "Tables already existed"}.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/table/<table_name>', methods=['GET'])
def get_table_details(table_name):
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        table_name = sanitize_identifier(table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. Fetch Primary Keys
                cur.execute("""
                    SELECT cols.column_name
                    FROM user_constraints cons
                    JOIN user_cons_columns cols ON cons.constraint_name = cols.constraint_name
                    WHERE cons.constraint_type = 'P' 
                      AND cons.table_name = :tname
                """, tname=table_name)
                primary_keys = [r[0] for r in cur.fetchall()]

                # 2. Fetch Columns Metadata
                cur.execute("""
                    SELECT column_name, data_type, data_length, data_precision, data_scale, nullable
                    FROM user_tab_columns
                    WHERE table_name = :tname
                    ORDER BY column_id ASC
                """, tname=table_name)
                columns = []
                for r in cur.fetchall():
                    col_name = r[0]
                    dtype = r[1]
                    dlen = r[2]
                    dprec = r[3]
                    dscale = r[4]
                    nullable = r[5] == 'Y'

                    type_display = dtype
                    if dtype in ('VARCHAR2', 'CHAR') and dlen:
                        type_display = f"{dtype}({dlen})"
                    elif dtype == 'NUMBER' and dprec is not None:
                        type_display = f"NUMBER({dprec},{dscale or 0})" if dscale else f"NUMBER({dprec})"

                    columns.append({
                        'name': col_name,
                        'type': dtype,
                        'display_type': type_display,
                        'nullable': nullable,
                        'is_pk': col_name in primary_keys
                    })

                # 3. Fetch Rows (Using ROWIDTOCHAR for guaranteed distinct row identification)
                # Fetch up to 500 rows for smooth UI rendering
                query = f'SELECT ROWIDTOCHAR(ROWID) AS "_ROWID_", t.* FROM "{table_name}" t FETCH FIRST 500 ROWS ONLY'
                cur.execute(query)
                col_names = [d[0] for d in cur.description] # first is _ROWID_
                raw_rows = cur.fetchall()

                data = []
                for r in raw_rows:
                    row_dict = {}
                    for idx, cname in enumerate(col_names):
                        row_dict[cname] = serialize_value(r[idx])
                    data.append(row_dict)

                # Total count
                cur.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                total_count = cur.fetchone()[0]

                return jsonify({
                    'table_name': table_name,
                    'columns': columns,
                    'primary_keys': primary_keys,
                    'total_count': total_count,
                    'rows': data
                })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/table/create', methods=['POST'])
def create_table():
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    payload = request.get_json(force=True)
    custom_sql = payload.get('sql')

    if not custom_sql or not custom_sql.strip():
        return jsonify({'error': 'No SQL provided for table creation'}), 400

    sql_statement = custom_sql.strip().rstrip(';')

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_statement)
                conn.commit()
        return jsonify({'message': 'Table created successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/table/<table_name>/drop', methods=['POST'])
def drop_table(table_name):
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        table_name = sanitize_identifier(table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    payload = request.get_json(silent=True) or {}
    cascade = payload.get('cascade', True)

    cascade_clause = " CASCADE CONSTRAINTS" if cascade else ""
    drop_sql = f'DROP TABLE "{table_name}"{cascade_clause}'

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(drop_sql)
                conn.commit()
        return jsonify({'message': f'Table "{table_name}" dropped successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/table/<table_name>/insert', methods=['POST'])
def insert_row(table_name):
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        table_name = sanitize_identifier(table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    payload = request.get_json(force=True)
    row_data = payload.get('data', {})

    if not row_data:
        return jsonify({'error': 'No column values provided.'}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Retrieve column data types
                cur.execute("""
                    SELECT column_name, data_type 
                    FROM user_tab_columns 
                    WHERE table_name = :tname
                """, tname=table_name)
                type_map = {r[0]: r[1] for r in cur.fetchall()}

                col_keys = []
                bind_keys = []
                bind_values = {}

                for idx, (col, val) in enumerate(row_data.items()):
                    sanitized_col = sanitize_identifier(col.upper())
                    col_keys.append(f'"{sanitized_col}"')
                    param_name = f"val_{idx}"
                    bind_keys.append(f":{param_name}")

                    # Type conversion
                    target_type = type_map.get(sanitized_col, 'VARCHAR2')
                    if val is None or val == '':
                        converted_val = None
                    elif target_type in ('NUMBER', 'FLOAT', 'INTEGER'):
                        try:
                            converted_val = float(val) if '.' in str(val) else int(val)
                        except ValueError:
                            converted_val = val
                    elif target_type == 'DATE':
                        # Try parsing ISO or YYYY-MM-DD
                        try:
                            if 'T' in str(val):
                                converted_val = datetime.datetime.fromisoformat(str(val))
                            else:
                                converted_val = datetime.datetime.strptime(str(val), '%Y-%m-%d')
                        except Exception:
                            converted_val = str(val)
                    else:
                        converted_val = str(val)

                    bind_values[param_name] = converted_val

                cols_part = ", ".join(col_keys)
                vals_part = ", ".join(bind_keys)
                insert_sql = f'INSERT INTO "{table_name}" ({cols_part}) VALUES ({vals_part})'

                cur.execute(insert_sql, bind_values)
                conn.commit()

        return jsonify({'message': 'Row inserted successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/table/<table_name>/delete', methods=['POST'])
def delete_row(table_name):
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        table_name = sanitize_identifier(table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    payload = request.get_json(force=True)
    rowid = payload.get('rowid')

    if not rowid:
        return jsonify({'error': 'Missing row identifier (ROWID).'}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                delete_sql = f'DELETE FROM "{table_name}" WHERE ROWID = CHARTOROWID(:rid)'
                cur.execute(delete_sql, rid=rowid)
                conn.commit()

        return jsonify({'message': 'Row deleted successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/query', methods=['POST'])
def execute_query():
    """Execute raw SQL statements entered in the SQL Console."""
    if 'db_user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    payload = request.get_json(force=True)
    raw_sql = payload.get('sql', '').strip().rstrip(';')

    if not raw_sql:
        return jsonify({'error': 'No query provided.'}), 400

    is_select = raw_sql.lstrip().upper().startswith('SELECT') or raw_sql.lstrip().upper().startswith('WITH')

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(raw_sql)
                if is_select:
                    col_names = [d[0] for d in cur.description] if cur.description else []
                    rows = cur.fetchmany(500)
                    serialized_rows = []
                    for r in rows:
                        serialized_rows.append([serialize_value(c) for c in r])
                    return jsonify({
                        'type': 'select',
                        'columns': col_names,
                        'rows': serialized_rows,
                        'count': len(serialized_rows)
                    })
                else:
                    conn.commit()
                    rowcount = cur.rowcount
                    return jsonify({
                        'type': 'dml',
                        'message': f'Statement executed successfully. Rows affected: {rowcount if rowcount >= 0 else 0}'
                    })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Oracle Web Manager on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
