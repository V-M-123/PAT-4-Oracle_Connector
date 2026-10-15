import os
import re
import datetime
from decimal import Decimal
from urllib.parse import urlparse, unquote
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
import oracledb
import psycopg2
import psycopg2.extras

app = Flask(__name__)
app.secret_key = os.urandom(24)

# ========================= UTILITIES & SERIALIZATION =========================

def sanitize_identifier(name: str) -> str:
    """Ensure identifier does not contain quotes or illegal characters."""
    if not name:
        raise ValueError("Identifier cannot be empty")
    clean = "".join(c for c in name if c.isalnum() or c in ("_", "$", "#"))
    if not clean:
        raise ValueError(f"Invalid identifier name: {name}")
    return clean

def serialize_value(val):
    """Serialize values to JSON-friendly data types."""
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

# ========================= CONNECTION MANAGERS =========================

def get_oracle_connection():
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

def get_supabase_connection():
    uri = session.get('db_uri')
    if uri:
        return psycopg2.connect(uri)
    
    host = session.get('db_host')
    port = session.get('db_port', 5432)
    database = session.get('db_name', 'postgres')
    user = session.get('db_user', 'postgres')
    password = session.get('db_password')
    
    return psycopg2.connect(
        host=host,
        port=port,
        dbname=database,
        user=user,
        password=password,
        sslmode='require'
    )

def get_db_connection():
    engine = session.get('db_engine', 'oracle')
    if engine == 'supabase':
        return get_supabase_connection()
    return get_oracle_connection()

# ========================= ROUTES: AUTHENTICATION =========================

@app.route('/')
def index():
    if 'db_user' in session or 'db_uri' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        if 'db_user' in session or 'db_uri' in session:
            return redirect(url_for('dashboard'))
        return render_template('login.html')

    engine = request.form.get('engine', 'oracle')

    # -------- SUPABASE / POSTGRESQL LOGIN --------
    if engine == 'supabase':
        auth_mode = request.form.get('supabase_auth_mode', 'uri')
        if auth_mode == 'uri':
            conn_uri = request.form.get('connection_uri', '').strip()
            if not conn_uri:
                flash('Please provide a Supabase Connection URI.', 'danger')
                return render_template('login.html', active_tab='supabase')

            # Fix postgres:// to postgresql:// if needed for psycopg2
            if conn_uri.startswith('postgres://'):
                conn_uri = 'postgresql://' + conn_uri[len('postgres://'):]

            try:
                # Test connection
                with psycopg2.connect(conn_uri) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1;")
                
                parsed = urlparse(conn_uri)
                session['db_engine'] = 'supabase'
                session['db_uri'] = conn_uri
                session['db_user'] = unquote(parsed.username or 'postgres')
                session['db_host'] = parsed.hostname or 'supabase.co'
                session['db_port'] = parsed.port or 5432
                session['db_name'] = parsed.path.lstrip('/') or 'postgres'

                flash('Successfully connected to Supabase Database!', 'success')
                return redirect(url_for('dashboard'))
            except Exception as e:
                err_msg = str(e)
                if 'could not translate host name' in err_msg and 'db.' in conn_uri:
                    err_msg += (
                        " — HINT: Supabase direct hosts (db.<ref>.supabase.co) only support IPv6. "
                        "Because your network is on IPv4, please use the Connection Pooler URI: "
                        "Go to Supabase Dashboard -> Database -> Connection String -> Mode: Transaction (port 6543) or Session (port 5432) "
                        "and copy the pooler URI (e.g. aws-0-ap-south-1.pooler.supabase.com:6543)."
                    )
                flash(f'Supabase Connection Failed: {err_msg}', 'danger')
                return render_template('login.html', active_tab='supabase', connection_uri=conn_uri)

        else:
            # Separate fields for Supabase
            host = request.form.get('sb_host', '').strip()
            port = request.form.get('sb_port', '5432').strip() or '5432'
            db_name = request.form.get('sb_database', 'postgres').strip() or 'postgres'
            user = request.form.get('sb_user', 'postgres').strip()
            password = request.form.get('sb_password', '')

            try:
                port_num = int(port)
            except ValueError:
                port_num = 5432

            try:
                with psycopg2.connect(host=host, port=port_num, dbname=db_name, user=user, password=password, sslmode='require') as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1;")

                session['db_engine'] = 'supabase'
                session.pop('db_uri', None)
                session['db_host'] = host
                session['db_port'] = port_num
                session['db_name'] = db_name
                session['db_user'] = user
                session['db_password'] = password

                flash('Successfully connected to Supabase!', 'success')
                return redirect(url_for('dashboard'))
            except Exception as e:
                flash(f'Supabase Connection Failed: {str(e)}', 'danger')
                return render_template('login.html', active_tab='supabase', sb_host=host, sb_port=port, sb_database=db_name, sb_user=user)

    # -------- ORACLE LOGIN --------
    user = request.form.get('username', '').strip()
    password = request.form.get('password', '')
    host = request.form.get('host', 'localhost').strip() or 'localhost'
    port = request.form.get('port', '1521').strip() or '1521'
    conn_type = request.form.get('conn_type', 'service')
    service_name = request.form.get('service_name', 'xe').strip()
    sid = request.form.get('sid', '').strip()

    if not user or not password:
        flash('Username and Password are required.', 'danger')
        return render_template('login.html', active_tab='oracle', host=host, port=port, service_name=service_name, sid=sid, user=user)

    try:
        port_num = int(port)
    except ValueError:
        flash('Invalid port number.', 'danger')
        return render_template('login.html', active_tab='oracle', host=host, port=port, service_name=service_name, sid=sid, user=user)

    try:
        if conn_type == 'sid' and sid:
            dsn = oracledb.makedsn(host, port_num, sid=sid)
        else:
            dsn = oracledb.makedsn(host, port_num, service_name=service_name or 'xe')

        with oracledb.connect(user=user, password=password, dsn=dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM DUAL")

        session['db_engine'] = 'oracle'
        session.pop('db_uri', None)
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

        flash(f'Successfully connected to Oracle Database as {user.upper()}!', 'success')
        return redirect(url_for('dashboard'))
    except Exception as e:
        flash(f'Oracle Connection failed: {str(e)}', 'danger')
        return render_template('login.html', active_tab='oracle', host=host, port=port, service_name=service_name, sid=sid, user=user, conn_type=conn_type)

@app.route('/logout', methods=['GET', 'POST'])
def logout():
    session.clear()
    flash('You have been disconnected and logged out.', 'info')
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if 'db_user' not in session and 'db_uri' not in session:
        return redirect(url_for('login'))
    return render_template('dashboard.html', 
                           engine=session.get('db_engine', 'oracle'),
                           username=session.get('db_user', 'user'), 
                           host=session.get('db_host', 'localhost'), 
                           port=session.get('db_port', 1521),
                           service=session.get('db_service_name') or session.get('db_sid') or session.get('db_name', 'postgres'))

# ========================= API ROUTES: TABLES & METADATA =========================

@app.route('/api/tables', methods=['GET'])
def get_tables():
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    engine = session.get('db_engine', 'oracle')
    exclude_system = request.args.get('exclude_system', 'true').lower() == 'true'

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if engine == 'supabase':
                    # Supabase (PostgreSQL) tables
                    if exclude_system:
                        cur.execute("""
                            SELECT table_name 
                            FROM information_schema.tables 
                            WHERE table_schema = 'public' 
                              AND table_type = 'BASE TABLE'
                            ORDER BY table_name ASC;
                        """)
                    else:
                        cur.execute("""
                            SELECT table_name 
                            FROM information_schema.tables 
                            WHERE table_type = 'BASE TABLE'
                            ORDER BY table_name ASC;
                        """)
                    tables = [{'name': row[0], 'num_rows': '-'} for row in cur.fetchall()]
                    return jsonify({'tables': tables, 'engine': 'supabase'})

                else:
                    # Oracle tables
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
                    return jsonify({'tables': tables, 'engine': 'oracle'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/table/<table_name>', methods=['GET'])
def get_table_details(table_name):
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    engine = session.get('db_engine', 'oracle')
    try:
        table_name = sanitize_identifier(table_name)
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if engine == 'supabase':
                    # 1. Fetch Primary Keys
                    cur.execute("""
                        SELECT kcu.column_name
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                          ON tc.constraint_name = kcu.constraint_name
                         AND tc.table_schema = kcu.table_schema
                        WHERE tc.constraint_type = 'PRIMARY KEY'
                          AND tc.table_schema = 'public'
                          AND lower(tc.table_name) = lower(%s);
                    """, (table_name,))
                    primary_keys = [r[0] for r in cur.fetchall()]

                    # 2. Fetch Columns
                    cur.execute("""
                        SELECT 
                            column_name, 
                            data_type, 
                            character_maximum_length, 
                            numeric_precision, 
                            numeric_scale, 
                            is_nullable
                        FROM information_schema.columns
                        WHERE table_schema = 'public' 
                          AND lower(table_name) = lower(%s)
                        ORDER BY ordinal_position ASC;
                    """, (table_name,))
                    columns = []
                    for r in cur.fetchall():
                        col_name, dtype, dlen, dprec, dscale, nullable_str = r
                        type_display = dtype.upper()
                        if dlen:
                            type_display = f"{type_display}({dlen})"
                        elif dprec is not None and dtype in ('numeric', 'decimal'):
                            type_display = f"NUMERIC({dprec},{dscale or 0})"

                        columns.append({
                            'name': col_name,
                            'type': dtype.upper(),
                            'display_type': type_display,
                            'nullable': nullable_str == 'YES',
                            'is_pk': col_name in primary_keys
                        })

                    # 3. Fetch Rows using ctid as unique row identifier
                    cur.execute(f'SELECT ctid::text AS "_ROWID_", * FROM "{table_name}" LIMIT 500;')
                    col_names = [d[0] for d in cur.description]
                    raw_rows = cur.fetchall()

                    data = []
                    for r in raw_rows:
                        row_dict = {}
                        for idx, cname in enumerate(col_names):
                            row_dict[cname] = serialize_value(r[idx])
                        data.append(row_dict)

                    cur.execute(f'SELECT COUNT(*) FROM "{table_name}";')
                    total_count = cur.fetchone()[0]

                    return jsonify({
                        'table_name': table_name,
                        'columns': columns,
                        'primary_keys': primary_keys,
                        'total_count': total_count,
                        'rows': data,
                        'engine': 'supabase'
                    })

                else:
                    # Oracle
                    table_name_upper = table_name.upper()
                    cur.execute("""
                        SELECT cols.column_name
                        FROM user_constraints cons
                        JOIN user_cons_columns cols ON cons.constraint_name = cols.constraint_name
                        WHERE cons.constraint_type = 'P' 
                          AND cons.table_name = :tname
                    """, tname=table_name_upper)
                    primary_keys = [r[0] for r in cur.fetchall()]

                    cur.execute("""
                        SELECT column_name, data_type, data_length, data_precision, data_scale, nullable
                        FROM user_tab_columns
                        WHERE table_name = :tname
                        ORDER BY column_id ASC
                    """, tname=table_name_upper)
                    columns = []
                    for r in cur.fetchall():
                        col_name, dtype, dlen, dprec, dscale, nullable = r
                        type_display = dtype
                        if dtype in ('VARCHAR2', 'CHAR') and dlen:
                            type_display = f"{dtype}({dlen})"
                        elif dtype == 'NUMBER' and dprec is not None:
                            type_display = f"NUMBER({dprec},{dscale or 0})" if dscale else f"NUMBER({dprec})"

                        columns.append({
                            'name': col_name,
                            'type': dtype,
                            'display_type': type_display,
                            'nullable': nullable == 'Y',
                            'is_pk': col_name in primary_keys
                        })

                    query = f'SELECT ROWIDTOCHAR(ROWID) AS "_ROWID_", t.* FROM "{table_name_upper}" t FETCH FIRST 500 ROWS ONLY'
                    cur.execute(query)
                    col_names = [d[0] for d in cur.description]
                    raw_rows = cur.fetchall()

                    data = []
                    for r in raw_rows:
                        row_dict = {}
                        for idx, cname in enumerate(col_names):
                            row_dict[cname] = serialize_value(r[idx])
                        data.append(row_dict)

                    cur.execute(f'SELECT COUNT(*) FROM "{table_name_upper}"')
                    total_count = cur.fetchone()[0]

                    return jsonify({
                        'table_name': table_name_upper,
                        'columns': columns,
                        'primary_keys': primary_keys,
                        'total_count': total_count,
                        'rows': data,
                        'engine': 'oracle'
                    })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========================= ROW OPERATIONS: INSERT & DELETE =========================

@app.route('/api/table/<table_name>/insert', methods=['POST'])
def insert_row(table_name):
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    engine = session.get('db_engine', 'oracle')
    try:
        table_name = sanitize_identifier(table_name if engine == 'supabase' else table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    payload = request.get_json(force=True)
    row_data = payload.get('data', {})

    if not row_data:
        return jsonify({'error': 'No column values provided.'}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if engine == 'supabase':
                    col_names = []
                    placeholders = []
                    values = []
                    for col, val in row_data.items():
                        sanitized_col = sanitize_identifier(col)
                        col_names.append(f'"{sanitized_col}"')
                        placeholders.append("%s")
                        values.append(val if val != '' else None)

                    cols_str = ", ".join(col_names)
                    placeholders_str = ", ".join(placeholders)
                    insert_sql = f'INSERT INTO "{table_name}" ({cols_str}) VALUES ({placeholders_str});'
                    cur.execute(insert_sql, tuple(values))
                    conn.commit()

                else:
                    # Oracle
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

                        target_type = type_map.get(sanitized_col, 'VARCHAR2')
                        if val is None or val == '':
                            converted_val = None
                        elif target_type in ('NUMBER', 'FLOAT', 'INTEGER'):
                            try:
                                converted_val = float(val) if '.' in str(val) else int(val)
                            except ValueError:
                                converted_val = val
                        elif target_type == 'DATE':
                            try:
                                converted_val = datetime.datetime.fromisoformat(str(val)) if 'T' in str(val) else datetime.datetime.strptime(str(val), '%Y-%m-%d')
                            except Exception:
                                converted_val = str(val)
                        else:
                            converted_val = str(val)

                        bind_values[param_name] = converted_val

                    insert_sql = f'INSERT INTO "{table_name}" ({", ".join(col_keys)}) VALUES ({", ".join(bind_keys)})'
                    cur.execute(insert_sql, bind_values)
                    conn.commit()

        return jsonify({'message': 'Row inserted successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/table/<table_name>/delete', methods=['POST'])
def delete_row(table_name):
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    engine = session.get('db_engine', 'oracle')
    try:
        table_name = sanitize_identifier(table_name if engine == 'supabase' else table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    payload = request.get_json(force=True)
    rowid = payload.get('rowid')

    if not rowid:
        return jsonify({'error': 'Missing row identifier.'}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if engine == 'supabase':
                    # PostgreSQL ctid deletion
                    delete_sql = f'DELETE FROM "{table_name}" WHERE ctid = %s::tid;'
                    cur.execute(delete_sql, (rowid,))
                    conn.commit()
                else:
                    # Oracle ROWID deletion
                    delete_sql = f'DELETE FROM "{table_name}" WHERE ROWID = CHARTOROWID(:rid)'
                    cur.execute(delete_sql, rid=rowid)
                    conn.commit()

        return jsonify({'message': 'Row deleted successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ========================= TABLE OPERATIONS: CREATE & DROP =========================

@app.route('/api/table/create', methods=['POST'])
def create_table():
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    payload = request.get_json(force=True)
    custom_sql = payload.get('sql', '').strip()

    if not custom_sql:
        return jsonify({'error': 'No SQL provided for table creation'}), 400

    clean_sql = custom_sql.rstrip(';')

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(clean_sql)
                conn.commit()
        return jsonify({'message': 'Table created successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/table/<table_name>/drop', methods=['POST'])
def drop_table(table_name):
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    engine = session.get('db_engine', 'oracle')
    try:
        table_name = sanitize_identifier(table_name if engine == 'supabase' else table_name.upper())
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400

    payload = request.get_json(silent=True) or {}
    cascade = payload.get('cascade', True)

    cascade_clause = " CASCADE" if cascade else ""
    drop_sql = f'DROP TABLE "{table_name}"{cascade_clause}'

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(drop_sql)
                conn.commit()
        return jsonify({'message': f'Table "{table_name}" dropped successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ========================= SCHEMA INIT & SQL CONSOLE =========================

@app.route('/api/init-library-schema', methods=['POST'])
def init_library_schema():
    """Create sample Library Management System tables and sample rows."""
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    engine = session.get('db_engine', 'oracle')

    if engine == 'supabase':
        # PostgreSQL / Supabase DDL
        ddls = [
            """
            CREATE TABLE IF NOT EXISTS lms_categories (
                category_id INT PRIMARY KEY,
                category_name VARCHAR(100) NOT NULL,
                description TEXT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS lms_books (
                book_id INT PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                author VARCHAR(100) NOT NULL,
                isbn VARCHAR(20),
                category_id INT,
                published_year INT,
                total_copies INT DEFAULT 1,
                available_copies INT DEFAULT 1
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS lms_members (
                member_id INT PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(20),
                membership_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'ACTIVE'
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS lms_book_issues (
                issue_id INT PRIMARY KEY,
                book_id INT NOT NULL,
                member_id INT NOT NULL,
                issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                due_date TIMESTAMP,
                return_date TIMESTAMP,
                fine_amount NUMERIC(8,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'ISSUED'
            );
            """
        ]
        sample_inserts = [
            "INSERT INTO lms_categories VALUES (1, 'Computer Science', 'Technical & Programming books') ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_categories VALUES (2, 'Fiction', 'Novels and stories') ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_categories VALUES (3, 'Science & Nature', 'Physics, Chemistry, Biology') ON CONFLICT DO NOTHING;",
            
            "INSERT INTO lms_books VALUES (101, 'Introduction to Algorithms', 'Thomas H. Cormen', '9780262033848', 1, 2009, 5, 4) ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_books VALUES (102, 'Clean Code', 'Robert C. Martin', '9780132350884', 1, 2008, 3, 3) ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_books VALUES (103, 'To Kill a Mockingbird', 'Harper Lee', '9780061120084', 2, 1960, 4, 2) ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_books VALUES (104, 'A Brief History of Time', 'Stephen Hawking', '9780553380163', 3, 1988, 2, 2) ON CONFLICT DO NOTHING;",
            
            "INSERT INTO lms_members (member_id, full_name, email, phone, status) VALUES (1, 'Alice Johnson', 'alice@example.com', '555-0199', 'ACTIVE') ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_members (member_id, full_name, email, phone, status) VALUES (2, 'Bob Smith', 'bob@example.com', '555-0144', 'ACTIVE') ON CONFLICT DO NOTHING;",
            
            "INSERT INTO lms_book_issues (issue_id, book_id, member_id, issue_date, due_date, fine_amount, status) VALUES (1001, 101, 1, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '9 days', 0, 'ISSUED') ON CONFLICT DO NOTHING;",
            "INSERT INTO lms_book_issues (issue_id, book_id, member_id, issue_date, due_date, fine_amount, status) VALUES (1002, 103, 2, CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '4 days', 0, 'ISSUED') ON CONFLICT DO NOTHING;"
        ]
    else:
        # Oracle DDL
        ddls = [
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
            "INSERT INTO LMS_MEMBERS (MEMBER_ID, FULL_NAME, EMAIL, PHONE, STATUS) VALUES (1, 'Alice Johnson', 'alice@example.com', '555-0199', 'ACTIVE')",
            "INSERT INTO LMS_MEMBERS (MEMBER_ID, FULL_NAME, EMAIL, PHONE, STATUS) VALUES (2, 'Bob Smith', 'bob@example.com', '555-0144', 'ACTIVE')",
            "INSERT INTO LMS_BOOK_ISSUES (ISSUE_ID, BOOK_ID, MEMBER_ID, ISSUE_DATE, DUE_DATE, FINE_AMOUNT, STATUS) VALUES (1001, 101, 1, SYSDATE - 5, SYSDATE + 9, 0, 'ISSUED')",
            "INSERT INTO LMS_BOOK_ISSUES (ISSUE_ID, BOOK_ID, MEMBER_ID, ISSUE_DATE, DUE_DATE, FINE_AMOUNT, STATUS) VALUES (1002, 103, 2, SYSDATE - 10, SYSDATE + 4, 0, 'ISSUED')"
        ]

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                created = []
                for ddl in ddls:
                    try:
                        cur.execute(ddl.strip().rstrip(';'))
                        created.append("table")
                    except Exception:
                        pass
                for ins in sample_inserts:
                    try:
                        cur.execute(ins.strip().rstrip(';'))
                    except Exception:
                        pass
                conn.commit()

        return jsonify({'message': f'Library Schema Initialized successfully for {engine.upper()}!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/query', methods=['POST'])
def execute_query():
    """Execute raw SQL statements entered in the SQL Console."""
    if 'db_user' not in session and 'db_uri' not in session:
        return jsonify({'error': 'Unauthorized. Please log in.'}), 401

    payload = request.get_json(force=True)
    raw_sql = payload.get('sql', '').strip()

    if not raw_sql:
        return jsonify({'error': 'No query provided.'}), 400

    # Strip trailing semicolons or slashes for driver compatibility
    clean_sql = raw_sql.strip()
    while clean_sql.endswith(';') or clean_sql.endswith('/'):
        clean_sql = clean_sql[:-1].strip()

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(clean_sql)
                
                # Check if statement returned rows
                if cur.description is not None:
                    col_names = [d[0] for d in cur.description]
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
    print(f"Starting Multi-Database Library Studio on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
