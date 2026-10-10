// Oracle Web Studio JavaScript Controller
let allTables = [];
let currentTableName = null;
let currentTableMetadata = null;
let currentRows = [];

// Initialize Bootstrap Modals and Toasts
let createTableModal, insertRowModal, dropTableModal, sqlConsoleModal, appToast;

document.addEventListener('DOMContentLoaded', () => {
    createTableModal = new bootstrap.Modal(document.getElementById('createTableModal'));
    insertRowModal = new bootstrap.Modal(document.getElementById('insertRowModal'));
    dropTableModal = new bootstrap.Modal(document.getElementById('dropTableModal'));
    sqlConsoleModal = new bootstrap.Modal(document.getElementById('sqlConsoleModal'));
    appToast = new bootstrap.Toast(document.getElementById('appToast'));

    initEventListeners();
    initCreateTableBuilder();
    loadTables();
});

function showToast(message, isError = false) {
    const toastEl = document.getElementById('appToast');
    const toastMsg = document.getElementById('toastMessage');
    toastEl.classList.remove('bg-success', 'bg-danger');
    toastEl.classList.add(isError ? 'bg-danger' : 'bg-success');
    toastMsg.textContent = message;
    appToast.show();
}

function initEventListeners() {
    // Refresh tables list
    document.getElementById('refreshTablesBtn').addEventListener('click', () => {
        const icon = document.getElementById('refreshTablesIcon');
        icon.classList.add('spin-animation');
        loadTables(() => icon.classList.remove('spin-animation'));
    });

    // Search tables
    document.getElementById('tableSearchInput').addEventListener('input', (e) => {
        filterTablesList(e.target.value.trim().toLowerCase());
    });

    // Refresh active table
    document.getElementById('refreshActiveTableBtn').addEventListener('click', () => {
        if (currentTableName) {
            loadTableData(currentTableName);
        }
    });

    // Filter current rows
    document.getElementById('rowDataFilterInput').addEventListener('input', (e) => {
        filterActiveRows(e.target.value.trim().toLowerCase());
    });

    // Open insert row modal
    document.getElementById('insertRowBtn').addEventListener('click', openInsertRowModal);

    // Execute insert row
    document.getElementById('executeInsertRowBtn').addEventListener('click', handleExecuteInsertRow);

    // Open drop table modal
    document.getElementById('dropTableBtn').addEventListener('click', () => {
        if (!currentTableName) return;
        document.getElementById('dropModalTableName').textContent = currentTableName;
        document.getElementById('dropTableError').classList.add('d-none');
        dropTableModal.show();
    });

    // Confirm drop table
    document.getElementById('confirmDropTableBtn').addEventListener('click', handleConfirmDropTable);

    // Exclude system tables toggle
    const excludeSwitch = document.getElementById('excludeSystemTablesSwitch');
    if (excludeSwitch) {
        excludeSwitch.addEventListener('change', () => {
            loadTables();
        });
    }

    // Init Library Schema button
    const initBtn = document.getElementById('initLibrarySchemaBtn');
    if (initBtn) {
        initBtn.addEventListener('click', handleInitLibrarySchema);
    }

    // SQL Console execution
    const runSqlBtn = document.getElementById('runSqlQueryBtn');
    if (runSqlBtn) {
        runSqlBtn.addEventListener('click', handleRunSqlQuery);
    }

    // SQL Console keyboard shortcut (Ctrl+Enter or Cmd+Enter)
    const sqlInput = document.getElementById('sqlConsoleInput');
    if (sqlInput) {
        sqlInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleRunSqlQuery();
            }
        });
    }
}

// =================== LIBRARY MANAGEMENT HELPERS ===================

async function handleInitLibrarySchema() {
    if (!confirm('This will create the core Library Management tables (LMS_BOOKS, LMS_MEMBERS, LMS_CATEGORIES, LMS_BOOK_ISSUES) and sample records if they do not already exist. Proceed?')) {
        return;
    }

    try {
        const res = await fetch('/api/init-library-schema', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Library Schema created successfully!');
            loadTables(() => {
                loadTableData('LMS_BOOKS');
            });
        } else {
            showToast(data.error || 'Failed to initialize Library schema', true);
        }
    } catch (err) {
        showToast('Connection error', true);
    }
}

function loadLibraryTemplate(type) {
    const nameInput = document.getElementById('newTableName');
    if (type === 'BOOKS') {
        nameInput.value = 'BOOKS';
        builderColumns = [
            { name: 'BOOK_ID', type: 'NUMBER', length: '10', nullable: false, isPk: true },
            { name: 'TITLE', type: 'VARCHAR2', length: '150', nullable: false, isPk: false },
            { name: 'AUTHOR', type: 'VARCHAR2', length: '100', nullable: false, isPk: false },
            { name: 'ISBN', type: 'VARCHAR2', length: '20', nullable: true, isPk: false },
            { name: 'PUBLISHED_YEAR', type: 'NUMBER', length: '4', nullable: true, isPk: false },
            { name: 'TOTAL_COPIES', type: 'NUMBER', length: '4', nullable: true, isPk: false },
            { name: 'AVAILABLE_COPIES', type: 'NUMBER', length: '4', nullable: true, isPk: false }
        ];
    } else if (type === 'MEMBERS') {
        nameInput.value = 'MEMBERS';
        builderColumns = [
            { name: 'MEMBER_ID', type: 'NUMBER', length: '10', nullable: false, isPk: true },
            { name: 'FULL_NAME', type: 'VARCHAR2', length: '100', nullable: false, isPk: false },
            { name: 'EMAIL', type: 'VARCHAR2', length: '100', nullable: true, isPk: false },
            { name: 'PHONE', type: 'VARCHAR2', length: '20', nullable: true, isPk: false },
            { name: 'MEMBERSHIP_DATE', type: 'DATE', length: '', nullable: true, isPk: false },
            { name: 'STATUS', type: 'VARCHAR2', length: '20', nullable: true, isPk: false }
        ];
    } else if (type === 'ISSUES') {
        nameInput.value = 'BOOK_ISSUES';
        builderColumns = [
            { name: 'ISSUE_ID', type: 'NUMBER', length: '10', nullable: false, isPk: true },
            { name: 'BOOK_ID', type: 'NUMBER', length: '10', nullable: false, isPk: false },
            { name: 'MEMBER_ID', type: 'NUMBER', length: '10', nullable: false, isPk: false },
            { name: 'ISSUE_DATE', type: 'DATE', length: '', nullable: false, isPk: false },
            { name: 'DUE_DATE', type: 'DATE', length: '', nullable: true, isPk: false },
            { name: 'RETURN_DATE', type: 'DATE', length: '', nullable: true, isPk: false },
            { name: 'FINE_AMOUNT', type: 'NUMBER', length: '8,2', nullable: true, isPk: false },
            { name: 'STATUS', type: 'VARCHAR2', length: '20', nullable: true, isPk: false }
        ];
    } else if (type === 'AUTHORS') {
        nameInput.value = 'AUTHORS';
        builderColumns = [
            { name: 'AUTHOR_ID', type: 'NUMBER', length: '10', nullable: false, isPk: true },
            { name: 'AUTHOR_NAME', type: 'VARCHAR2', length: '100', nullable: false, isPk: false },
            { name: 'NATIONALITY', type: 'VARCHAR2', length: '50', nullable: true, isPk: false }
        ];
    }
    renderColumnsBuilder();
    updateCreateTableSqlPreview();
}

// =================== TABLES LIST ===================

async function loadTables(callback) {
    const excludeSwitch = document.getElementById('excludeSystemTablesSwitch');
    const excludeSystem = excludeSwitch ? excludeSwitch.checked : true;

    try {
        const res = await fetch(`/api/tables?exclude_system=${excludeSystem}`);
        const data = await res.json();
        if (res.ok) {
            allTables = data.tables || [];
            document.getElementById('tableCountBadge').textContent = allTables.length;
            renderTablesList(allTables);
        } else {
            showToast(data.error || 'Failed to fetch tables', true);
        }
    } catch (err) {
        showToast('Error connecting to server', true);
    } finally {
        if (callback) callback();
    }
}

function renderTablesList(tables) {
    const container = document.getElementById('tablesListGroup');
    if (!tables.length) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted small">
                <i class="bi bi-inbox display-6 d-block mb-1 opacity-50"></i>
                No tables found in this schema.
            </div>`;
        return;
    }

    container.innerHTML = tables.map(t => `
        <button type="button" 
                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-3 ${currentTableName === t.name ? 'active' : ''}" 
                onclick="loadTableData('${t.name}')">
            <div class="d-flex align-items-center text-truncate">
                <i class="bi bi-table me-2 ${currentTableName === t.name ? 'text-primary' : 'text-secondary'}"></i>
                <span class="font-monospace small text-truncate">${t.name}</span>
            </div>
            <span class="badge bg-light text-dark border small">${t.num_rows !== '-' ? t.num_rows : ''}</span>
        </button>
    `).join('');
}

function filterTablesList(query) {
    const filtered = allTables.filter(t => t.name.toLowerCase().includes(query));
    renderTablesList(filtered);
}

// =================== TABLE DETAILS & DATA ===================

async function loadTableData(tableName) {
    currentTableName = tableName;
    renderTablesList(allTables); // Update active highlighting

    document.getElementById('emptyStateCard').classList.add('d-none');
    document.getElementById('tableContentCard').classList.remove('d-none');
    document.getElementById('activeTableName').textContent = tableName;
    document.getElementById('activeTableRowCount').textContent = 'Loading...';
    document.getElementById('activeDataTableHead').innerHTML = '';
    document.getElementById('activeDataTableBody').innerHTML = `
        <tr><td colspan="100" class="text-center py-5">
            <div class="spinner-border text-primary spinner-border-sm me-2"></div>Loading table rows...
        </td></tr>`;

    try {
        const res = await fetch(`/api/table/${encodeURIComponent(tableName)}`);
        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Failed to load table details', true);
            return;
        }

        currentTableMetadata = data;
        currentRows = data.rows || [];

        document.getElementById('activeTableRowCount').textContent = `${data.total_count} total rows`;
        document.getElementById('tableRowsInfo').textContent = `Displaying ${currentRows.length} of ${data.total_count} rows`;

        // Render Column Badges
        renderColumnBadges(data.columns, data.primary_keys);

        // Render Data Table
        renderDataTable(data.columns, currentRows);
    } catch (err) {
        showToast('Error loading table data', true);
    }
}

function renderColumnBadges(columns, primaryKeys) {
    const container = document.getElementById('columnsBadgeContainer');
    container.innerHTML = columns.map(c => `
        <span class="badge ${c.is_pk ? 'bg-primary' : 'bg-secondary-subtle text-dark border'} p-1 px-2 font-monospace" title="${c.nullable ? 'Nullable' : 'NOT NULL'}">
            ${c.is_pk ? '<i class="bi bi-key-fill text-warning me-1"></i>' : ''}
            ${c.name} <span class="opacity-75 font-weight-normal small">(${c.display_type})</span>
        </span>
    `).join('');
}

function renderDataTable(columns, rows) {
    const thead = document.getElementById('activeDataTableHead');
    const tbody = document.getElementById('activeDataTableBody');

    // Headers
    let headerHtml = '<tr><th style="width: 50px;" class="text-center">#</th>';
    columns.forEach(col => {
        headerHtml += `
            <th>
                ${col.is_pk ? '<i class="bi bi-key-fill text-warning me-1" title="Primary Key"></i>' : ''}
                ${col.name}
            </th>`;
    });
    headerHtml += '<th style="width: 80px;" class="text-center">Actions</th></tr>';
    thead.innerHTML = headerHtml;

    // Body
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${columns.length + 2}" class="text-center py-4 text-muted">Table is currently empty (0 rows).</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((row, idx) => {
        let rowHtml = `<tr><td class="text-center text-muted small">${idx + 1}</td>`;
        columns.forEach(col => {
            const val = row[col.name];
            if (val === null || val === undefined) {
                rowHtml += `<td><span class="null-badge">NULL</span></td>`;
            } else {
                rowHtml += `<td class="text-truncate" style="max-width: 250px;" title="${escapeHtml(String(val))}">${escapeHtml(String(val))}</td>`;
            }
        });
        
        const rowIdVal = row['_ROWID_'];
        rowHtml += `
            <td class="text-center">
                <button class="btn btn-sm btn-outline-danger py-0 px-1" title="Delete Row" onclick="handleDeleteRow('${rowIdVal}')">
                    <i class="bi bi-trash3"></i>
                </button>
            </td>
        </tr>`;
        return rowHtml;
    }).join('');
}

function filterActiveRows(query) {
    if (!currentTableMetadata) return;
    if (!query) {
        renderDataTable(currentTableMetadata.columns, currentRows);
        return;
    }

    const filtered = currentRows.filter(row => {
        return Object.values(row).some(val => val !== null && String(val).toLowerCase().includes(query));
    });
    renderDataTable(currentTableMetadata.columns, filtered);
}

// =================== INSERT ROW ===================

function openInsertRowModal() {
    if (!currentTableMetadata) return;
    document.getElementById('insertModalTableName').textContent = currentTableName;
    const formFields = document.getElementById('insertRowFormFields');
    document.getElementById('insertRowError').classList.add('d-none');

    formFields.innerHTML = currentTableMetadata.columns.map(col => {
        let inputType = 'text';
        let placeholder = `Enter ${col.name} (${col.display_type})`;

        if (col.type === 'NUMBER' || col.type === 'FLOAT' || col.type === 'INTEGER') {
            inputType = 'number';
            stepAttr = 'step="any"';
        } else if (col.type === 'DATE') {
            inputType = 'date';
        }

        return `
            <div class="mb-3">
                <label class="form-label small fw-bold mb-1">
                    ${col.name}
                    ${col.is_pk ? '<span class="badge bg-primary ms-1">PK</span>' : ''}
                    ${!col.nullable ? '<span class="text-danger">*</span>' : '<span class="text-muted fw-normal">(Optional)</span>'}
                    <span class="text-muted fw-normal small"> - ${col.display_type}</span>
                </label>
                <input type="${inputType}" class="form-control form-control-sm font-monospace" 
                       name="${col.name}" ${col.type === 'NUMBER' ? 'step="any"' : ''} 
                       placeholder="${placeholder}" ${!col.nullable ? 'required' : ''}>
            </div>
        `;
    }).join('');

    insertRowModal.show();
}

async function handleExecuteInsertRow() {
    const form = document.getElementById('insertRowForm');
    const errBox = document.getElementById('insertRowError');
    errBox.classList.add('d-none');

    const formData = new FormData(form);
    const rowData = {};
    for (const [key, val] of formData.entries()) {
        if (val.trim() !== '') {
            rowData[key] = val;
        }
    }

    try {
        const res = await fetch(`/api/table/${encodeURIComponent(currentTableName)}/insert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: rowData })
        });
        const result = await res.json();

        if (res.ok) {
            insertRowModal.hide();
            showToast('Row inserted successfully!');
            loadTableData(currentTableName);
        } else {
            errBox.textContent = result.error || 'Failed to insert row';
            errBox.classList.remove('d-none');
        }
    } catch (err) {
        errBox.textContent = 'Server connection error';
        errBox.classList.remove('d-none');
    }
}

// =================== DELETE ROW ===================

async function handleDeleteRow(rowid) {
    if (!confirm('Are you sure you want to delete this row? This action cannot be undone.')) {
        return;
    }

    try {
        const res = await fetch(`/api/table/${encodeURIComponent(currentTableName)}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowid: rowid })
        });
        const result = await res.json();

        if (res.ok) {
            showToast('Row deleted successfully!');
            loadTableData(currentTableName);
        } else {
            showToast(result.error || 'Failed to delete row', true);
        }
    } catch (err) {
        showToast('Error deleting row', true);
    }
}

// =================== DROP TABLE ===================

async function handleConfirmDropTable() {
    const errBox = document.getElementById('dropTableError');
    errBox.classList.add('d-none');
    const cascade = document.getElementById('dropCascadeConstraints').checked;

    try {
        const res = await fetch(`/api/table/${encodeURIComponent(currentTableName)}/drop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cascade: cascade })
        });
        const result = await res.json();

        if (res.ok) {
            dropTableModal.hide();
            showToast(result.message || 'Table dropped successfully!');
            currentTableName = null;
            document.getElementById('tableContentCard').classList.add('d-none');
            document.getElementById('emptyStateCard').classList.remove('d-none');
            loadTables();
        } else {
            errBox.textContent = result.error || 'Failed to drop table';
            errBox.classList.remove('d-none');
        }
    } catch (err) {
        errBox.textContent = 'Server connection error';
        errBox.classList.remove('d-none');
    }
}

// =================== CREATE TABLE BUILDER ===================

let builderColumns = [];

function initCreateTableBuilder() {
    builderColumns = [
        { name: 'ID', type: 'NUMBER', length: '10', nullable: false, isPk: true },
        { name: 'NAME', type: 'VARCHAR2', length: '100', nullable: false, isPk: false },
        { name: 'CREATED_AT', type: 'DATE', length: '', nullable: true, isPk: false }
    ];

    document.getElementById('addColumnBtn').addEventListener('click', () => {
        builderColumns.push({ name: '', type: 'VARCHAR2', length: '100', nullable: true, isPk: false });
        renderColumnsBuilder();
        updateCreateTableSqlPreview();
    });

    document.getElementById('newTableName').addEventListener('input', updateCreateTableSqlPreview);
    document.getElementById('executeCreateTableBtn').addEventListener('click', handleExecuteCreateTable);

    renderColumnsBuilder();
    updateCreateTableSqlPreview();
}

function renderColumnsBuilder() {
    const tbody = document.getElementById('columnsBuilderBody');
    tbody.innerHTML = builderColumns.map((col, idx) => `
        <tr>
            <td>
                <input type="text" class="form-control form-control-sm font-monospace" 
                       value="${col.name}" placeholder="COLUMN_NAME" 
                       oninput="updateBuilderCol(${idx}, 'name', this.value)">
            </td>
            <td>
                <select class="form-select form-select-sm" onchange="updateBuilderCol(${idx}, 'type', this.value)">
                    <option value="VARCHAR2" ${col.type === 'VARCHAR2' ? 'selected' : ''}>VARCHAR2</option>
                    <option value="NUMBER" ${col.type === 'NUMBER' ? 'selected' : ''}>NUMBER</option>
                    <option value="DATE" ${col.type === 'DATE' ? 'selected' : ''}>DATE</option>
                    <option value="CHAR" ${col.type === 'CHAR' ? 'selected' : ''}>CHAR</option>
                    <option value="CLOB" ${col.type === 'CLOB' ? 'selected' : ''}>CLOB</option>
                    <option value="TIMESTAMP" ${col.type === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                    <option value="FLOAT" ${col.type === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                </select>
            </td>
            <td>
                <input type="text" class="form-control form-control-sm font-monospace" 
                       value="${col.length}" placeholder="e.g. 50 or 10,2" 
                       oninput="updateBuilderCol(${idx}, 'length', this.value)"
                       ${col.type === 'DATE' || col.type === 'CLOB' ? 'disabled' : ''}>
            </td>
            <td class="text-center">
                <input type="checkbox" class="form-check-input" 
                       ${col.nullable ? 'checked' : ''} 
                       onchange="updateBuilderCol(${idx}, 'nullable', this.checked)">
            </td>
            <td class="text-center">
                <input type="checkbox" class="form-check-input" 
                       ${col.isPk ? 'checked' : ''} 
                       onchange="updateBuilderCol(${idx}, 'isPk', this.checked)">
            </td>
            <td class="text-center">
                <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1" onclick="removeBuilderCol(${idx})">
                    <i class="bi bi-x"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateBuilderCol(index, key, val) {
    builderColumns[index][key] = val;
    updateCreateTableSqlPreview();
}

function removeBuilderCol(index) {
    builderColumns.splice(index, 1);
    renderColumnsBuilder();
    updateCreateTableSqlPreview();
}

function updateCreateTableSqlPreview() {
    const tname = document.getElementById('newTableName').value.trim() || 'MY_NEW_TABLE';
    const lines = [];
    const pkCols = [];

    builderColumns.forEach(col => {
        if (!col.name.trim()) return;
        let colDef = `  ${col.name.trim().toUpperCase()} ${col.type}`;
        if (col.length && (col.type === 'VARCHAR2' || col.type === 'CHAR' || col.type === 'NUMBER' || col.type === 'FLOAT')) {
            colDef += `(${col.length.trim()})`;
        }
        if (!col.nullable) {
            colDef += ' NOT NULL';
        }
        lines.push(colDef);

        if (col.isPk) {
            pkCols.push(col.name.trim().toUpperCase());
        }
    });

    if (pkCols.length) {
        lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }

    const ddl = `CREATE TABLE ${tname.toUpperCase()} (\n${lines.join(',\n')}\n);`;
    document.getElementById('createTableSqlPreview').value = ddl;
}

async function handleExecuteCreateTable() {
    const errBox = document.getElementById('createTableError');
    errBox.classList.add('d-none');
    const sql = document.getElementById('createTableSqlPreview').value.trim();

    if (!sql) {
        errBox.textContent = 'Please enter or build a CREATE TABLE statement.';
        errBox.classList.remove('d-none');
        return;
    }

    try {
        const res = await fetch('/api/table/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql })
        });
        const result = await res.json();

        if (res.ok) {
            createTableModal.hide();
            showToast('Table created successfully!');
            const tname = document.getElementById('newTableName').value.trim().toUpperCase();
            loadTables(() => {
                if (tname) loadTableData(tname);
            });
        } else {
            errBox.textContent = result.error || 'Failed to create table';
            errBox.classList.remove('d-none');
        }
    } catch (err) {
        errBox.textContent = 'Server connection error';
        errBox.classList.remove('d-none');
    }
}

// =================== SQL CONSOLE ===================

function setSqlQuery(sql) {
    const input = document.getElementById('sqlConsoleInput');
    if (input) {
        input.value = sql;
        input.focus();
    }
}

async function handleRunSqlQuery() {
    const sql = document.getElementById('sqlConsoleInput').value.trim();
    const statusEl = document.getElementById('sqlExecutionStatus');
    const resultWrapper = document.getElementById('sqlQueryResultWrapper');
    const msgEl = document.getElementById('sqlQueryMessage');
    const thead = document.getElementById('sqlQueryTableHead');
    const tbody = document.getElementById('sqlQueryTableBody');

    if (!sql) {
        statusEl.textContent = 'Please enter a query.';
        return;
    }

    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Running...';
    resultWrapper.classList.remove('d-none');
    msgEl.classList.add('d-none');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    try {
        const res = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql })
        });
        const data = await res.json();

        if (res.ok) {
            statusEl.textContent = 'Execution finished successfully.';
            if (data.type === 'select') {
                msgEl.className = 'alert alert-info py-2 small';
                msgEl.textContent = `Query returned ${data.count} row(s).`;
                msgEl.classList.remove('d-none');

                thead.innerHTML = '<tr>' + data.columns.map(c => `<th>${c}</th>`).join('') + '</tr>';
                if (!data.rows || data.rows.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="${Math.max(data.columns.length, 1)}" class="text-center py-3 text-muted">0 rows returned.</td></tr>`;
                } else {
                    tbody.innerHTML = data.rows.map(r => '<tr>' + r.map(c => `<td>${c === null ? '<span class="null-badge">NULL</span>' : escapeHtml(String(c))}</td>`).join('') + '</tr>').join('');
                }
            } else {
                msgEl.className = 'alert alert-success py-2 small';
                msgEl.textContent = data.message || 'Executed successfully.';
                msgEl.classList.remove('d-none');
                // Refresh tables in background in case of DDL
                loadTables();
            }
        } else {
            statusEl.textContent = 'Execution failed.';
            msgEl.className = 'alert alert-danger py-2 small';
            msgEl.textContent = data.error || 'Error executing SQL';
            msgEl.classList.remove('d-none');
        }
    } catch (err) {
        statusEl.textContent = 'Connection error.';
        msgEl.className = 'alert alert-danger py-2 small';
        msgEl.textContent = 'Network or server error';
        msgEl.classList.remove('d-none');
    }
}

// Utility: HTML escaping
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
