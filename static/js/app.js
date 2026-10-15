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

    // Init SQL Console & Command Studio
    initSqlConsoleStudio();
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
    const activeEngine = document.body.dataset.engine || 'oracle';
    const isSb = activeEngine === 'supabase';
    const nameInput = document.getElementById('newTableName');

    if (type === 'BOOKS') {
        nameInput.value = isSb ? 'lms_books' : 'BOOKS';
        builderColumns = [
            { name: isSb ? 'book_id' : 'BOOK_ID', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '10', nullable: false, isPk: true },
            { name: isSb ? 'title' : 'TITLE', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '150', nullable: false, isPk: false },
            { name: isSb ? 'author' : 'AUTHOR', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '100', nullable: false, isPk: false },
            { name: isSb ? 'isbn' : 'ISBN', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '20', nullable: true, isPk: false },
            { name: isSb ? 'published_year' : 'PUBLISHED_YEAR', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '4', nullable: true, isPk: false },
            { name: isSb ? 'total_copies' : 'TOTAL_COPIES', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '4', nullable: true, isPk: false },
            { name: isSb ? 'available_copies' : 'AVAILABLE_COPIES', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '4', nullable: true, isPk: false }
        ];
    } else if (type === 'MEMBERS') {
        nameInput.value = isSb ? 'lms_members' : 'MEMBERS';
        builderColumns = [
            { name: isSb ? 'member_id' : 'MEMBER_ID', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '10', nullable: false, isPk: true },
            { name: isSb ? 'full_name' : 'FULL_NAME', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '100', nullable: false, isPk: false },
            { name: isSb ? 'email' : 'EMAIL', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '100', nullable: true, isPk: false },
            { name: isSb ? 'phone' : 'PHONE', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '20', nullable: true, isPk: false },
            { name: isSb ? 'membership_date' : 'MEMBERSHIP_DATE', type: isSb ? 'TIMESTAMP' : 'DATE', length: '', nullable: true, isPk: false },
            { name: isSb ? 'status' : 'STATUS', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '20', nullable: true, isPk: false }
        ];
    } else if (type === 'ISSUES') {
        nameInput.value = isSb ? 'lms_book_issues' : 'BOOK_ISSUES';
        builderColumns = [
            { name: isSb ? 'issue_id' : 'ISSUE_ID', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '10', nullable: false, isPk: true },
            { name: isSb ? 'book_id' : 'BOOK_ID', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '10', nullable: false, isPk: false },
            { name: isSb ? 'member_id' : 'MEMBER_ID', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '10', nullable: false, isPk: false },
            { name: isSb ? 'issue_date' : 'ISSUE_DATE', type: isSb ? 'TIMESTAMP' : 'DATE', length: '', nullable: false, isPk: false },
            { name: isSb ? 'due_date' : 'DUE_DATE', type: isSb ? 'TIMESTAMP' : 'DATE', length: '', nullable: true, isPk: false },
            { name: isSb ? 'return_date' : 'RETURN_DATE', type: isSb ? 'TIMESTAMP' : 'DATE', length: '', nullable: true, isPk: false },
            { name: isSb ? 'fine_amount' : 'FINE_AMOUNT', type: isSb ? 'NUMERIC' : 'NUMBER', length: '8,2', nullable: true, isPk: false },
            { name: isSb ? 'status' : 'STATUS', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '20', nullable: true, isPk: false }
        ];
    } else if (type === 'AUTHORS') {
        nameInput.value = isSb ? 'lms_authors' : 'AUTHORS';
        builderColumns = [
            { name: isSb ? 'author_id' : 'AUTHOR_ID', type: isSb ? 'INT' : 'NUMBER', length: isSb ? '' : '10', nullable: false, isPk: true },
            { name: isSb ? 'author_name' : 'AUTHOR_NAME', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '100', nullable: false, isPk: false },
            { name: isSb ? 'nationality' : 'NATIONALITY', type: isSb ? 'VARCHAR' : 'VARCHAR2', length: '50', nullable: true, isPk: false }
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
            populateSqlConsoleTableSelectors();
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
    const activeEngine = document.body.dataset.engine || 'oracle';
    const isSb = activeEngine === 'supabase';
    const tbody = document.getElementById('columnsBuilderBody');

    const sbTypes = ['VARCHAR', 'INT', 'BIGINT', 'NUMERIC', 'TEXT', 'BOOLEAN', 'TIMESTAMP', 'DATE'];
    const oraTypes = ['VARCHAR2', 'NUMBER', 'DATE', 'CHAR', 'CLOB', 'TIMESTAMP', 'FLOAT'];
    const typesToRender = isSb ? sbTypes : oraTypes;

    tbody.innerHTML = builderColumns.map((col, idx) => `
        <tr>
            <td>
                <input type="text" class="form-control form-control-sm font-monospace" 
                       value="${col.name}" placeholder="COLUMN_NAME" 
                       oninput="updateBuilderCol(${idx}, 'name', this.value)">
            </td>
            <td>
                <select class="form-select form-select-sm" onchange="updateBuilderCol(${idx}, 'type', this.value)">
                    ${typesToRender.map(t => `<option value="${t}" ${col.type.toUpperCase() === t ? 'selected' : ''}>${t}</option>`).join('')}
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
    const activeEngine = document.body.dataset.engine || 'oracle';
    const isSb = activeEngine === 'supabase';
    const rawTname = document.getElementById('newTableName').value.trim() || (isSb ? 'my_new_table' : 'MY_NEW_TABLE');
    const tname = isSb ? rawTname.toLowerCase() : rawTname.toUpperCase();
    const lines = [];
    const pkCols = [];

    builderColumns.forEach(col => {
        if (!col.name.trim()) return;
        const colName = isSb ? col.name.trim().toLowerCase() : col.name.trim().toUpperCase();
        let colDef = `  ${colName} ${col.type}`;
        if (col.length && (col.type === 'VARCHAR2' || col.type === 'VARCHAR' || col.type === 'CHAR' || col.type === 'NUMBER' || col.type === 'NUMERIC' || col.type === 'FLOAT')) {
            colDef += `(${col.length.trim()})`;
        }
        if (!col.nullable) {
            colDef += ' NOT NULL';
        }
        lines.push(colDef);

        if (col.isPk) {
            pkCols.push(colName);
        }
    });

    if (pkCols.length) {
        lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }

    const ddl = `CREATE TABLE ${tname} (\n${lines.join(',\n')}\n);`;
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

// =================== SQL CONSOLE STUDIO (DQL / DML / DDL) ===================

function getActiveCategory() {
    if (document.getElementById('tab-dml')?.classList.contains('active')) return 'dml';
    if (document.getElementById('tab-ddl')?.classList.contains('active')) return 'ddl';
    return 'dql';
}

function getActiveConsoleInput() {
    const cat = getActiveCategory();
    return document.getElementById(`${cat}ConsoleInput`);
}

function getSelectedTableForCategory(category) {
    const select = document.getElementById(`${category}TableSelect`);
    if (select && select.value) return select.value;
    if (currentTableName) return currentTableName;
    return (allTables.length > 0) ? allTables[0].name : 'MY_TABLE';
}

function populateSqlConsoleTableSelectors() {
    const selects = ['dqlTableSelect', 'dmlTableSelect', 'ddlTableSelect'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = '<option value="">-- Choose Table --</option>' + 
            allTables.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        if (currentVal && allTables.some(t => t.name === currentVal)) {
            el.value = currentVal;
        } else if (currentTableName && allTables.some(t => t.name === currentTableName)) {
            el.value = currentTableName;
        }
    });
}

function setSqlQuery(sql, category = null) {
    if (category) {
        const tabBtn = document.getElementById(`tab-${category}`);
        if (tabBtn && typeof bootstrap !== 'undefined') {
            bootstrap.Tab.getOrCreateInstance(tabBtn).show();
        }
    }
    const cat = category || getActiveCategory();
    const input = document.getElementById(`${cat}ConsoleInput`);
    if (input) {
        input.value = sql;
        input.focus();
    }
}

function appendToConsoleInput(category, text) {
    const input = document.getElementById(`${category}ConsoleInput`);
    if (input) {
        let val = input.value.trim();
        if (val.endsWith(';')) val = val.slice(0, -1).trim();
        input.value = (val ? val + text : text.trim()) + ';';
        input.focus();
    }
}

function initSqlConsoleStudio() {
    const modalEl = document.getElementById('sqlConsoleModal');
    if (modalEl) {
        modalEl.addEventListener('show.bs.modal', () => {
            populateSqlConsoleTableSelectors();
        });
    }

    // Run SQL button
    const runSqlBtn = document.getElementById('runSqlQueryBtn');
    if (runSqlBtn) {
        runSqlBtn.addEventListener('click', handleRunSqlQuery);
    }

    // Ctrl+Enter on all console inputs
    document.querySelectorAll('.sql-console-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleRunSqlQuery();
            }
        });
    });

    // Clear button
    const clearBtn = document.getElementById('clearSqlConsoleBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const activeInput = getActiveConsoleInput();
            if (activeInput) activeInput.value = '';
            const resultWrapper = document.getElementById('sqlQueryResultWrapper');
            if (resultWrapper) resultWrapper.classList.add('d-none');
            const statusEl = document.getElementById('sqlExecutionStatus');
            if (statusEl) statusEl.innerHTML = '<i class="bi bi-info-circle me-1"></i>Cleared. Press <kbd>Ctrl+Enter</kbd> to execute';
        });
    }

    // DQL Builders
    const btnDqlSelectAll = document.getElementById('btnDqlSelectAll');
    if (btnDqlSelectAll) {
        btnDqlSelectAll.addEventListener('click', () => {
            const t = getSelectedTableForCategory('dql');
            setSqlQuery(`SELECT * FROM ${t};`, 'dql');
        });
    }

    const btnDqlCount = document.getElementById('btnDqlCount');
    if (btnDqlCount) {
        btnDqlCount.addEventListener('click', () => {
            const t = getSelectedTableForCategory('dql');
            setSqlQuery(`SELECT COUNT(*) AS TOTAL_COUNT FROM ${t};`, 'dql');
        });
    }

    const btnDqlWhere = document.getElementById('btnDqlWhere');
    if (btnDqlWhere) {
        btnDqlWhere.addEventListener('click', () => {
            appendToConsoleInput('dql', '\nWHERE 1=1');
        });
    }

    const btnDqlOrderBy = document.getElementById('btnDqlOrderBy');
    if (btnDqlOrderBy) {
        btnDqlOrderBy.addEventListener('click', () => {
            appendToConsoleInput('dql', '\nORDER BY 1 ASC');
        });
    }

    const btnDqlLimit = document.getElementById('btnDqlLimit');
    if (btnDqlLimit) {
        btnDqlLimit.addEventListener('click', () => {
            appendToConsoleInput('dql', '\nFETCH FIRST 50 ROWS ONLY');
        });
    }

    // DML Templates
    const btnDmlInsert = document.getElementById('btnDmlInsert');
    if (btnDmlInsert) {
        btnDmlInsert.addEventListener('click', () => {
            const t = getSelectedTableForCategory('dml');
            setSqlQuery(`INSERT INTO ${t} (\n    -- col1, col2\n) VALUES (\n    -- val1, val2\n);`, 'dml');
        });
    }

    const btnDmlUpdate = document.getElementById('btnDmlUpdate');
    if (btnDmlUpdate) {
        btnDmlUpdate.addEventListener('click', () => {
            const t = getSelectedTableForCategory('dml');
            setSqlQuery(`UPDATE ${t}\nSET COLUMN_NAME = 'new_value'\nWHERE ID = 1;`, 'dml');
        });
    }

    const btnDmlDelete = document.getElementById('btnDmlDelete');
    if (btnDmlDelete) {
        btnDmlDelete.addEventListener('click', () => {
            const t = getSelectedTableForCategory('dml');
            setSqlQuery(`DELETE FROM ${t}\nWHERE ID = 1;`, 'dml');
        });
    }

    // DDL Templates
    const btnDdlCreate = document.getElementById('btnDdlCreate');
    if (btnDdlCreate) {
        btnDdlCreate.addEventListener('click', () => {
            setSqlQuery(`CREATE TABLE NEW_TABLE (\n    ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    NAME VARCHAR2(100) NOT NULL,\n    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`, 'ddl');
        });
    }

    const btnDdlAddCol = document.getElementById('btnDdlAddCol');
    if (btnDdlAddCol) {
        btnDdlAddCol.addEventListener('click', () => {
            const t = getSelectedTableForCategory('ddl');
            setSqlQuery(`ALTER TABLE ${t} ADD (NEW_COLUMN VARCHAR2(100));`, 'ddl');
        });
    }

    const btnDdlDropCol = document.getElementById('btnDdlDropCol');
    if (btnDdlDropCol) {
        btnDdlDropCol.addEventListener('click', () => {
            const t = getSelectedTableForCategory('ddl');
            setSqlQuery(`ALTER TABLE ${t} DROP COLUMN COLUMN_NAME;`, 'ddl');
        });
    }

    const btnDdlTruncate = document.getElementById('btnDdlTruncate');
    if (btnDdlTruncate) {
        btnDdlTruncate.addEventListener('click', () => {
            const t = getSelectedTableForCategory('ddl');
            setSqlQuery(`TRUNCATE TABLE ${t};`, 'ddl');
        });
    }

    const btnDdlDrop = document.getElementById('btnDdlDrop');
    if (btnDdlDrop) {
        btnDdlDrop.addEventListener('click', () => {
            const t = getSelectedTableForCategory('ddl');
            setSqlQuery(`DROP TABLE ${t} CASCADE CONSTRAINTS;`, 'ddl');
        });
    }

    // Table Selectors change handler
    ['dql', 'dml', 'ddl'].forEach(cat => {
        const select = document.getElementById(`${cat}TableSelect`);
        if (select) {
            select.addEventListener('change', (e) => {
                const tableName = e.target.value;
                if (!tableName) return;
                const input = document.getElementById(`${cat}ConsoleInput`);
                if (input && (!input.value.trim() || input.value.includes('SELECT * FROM') || input.value.includes('MY_TABLE'))) {
                    if (cat === 'dql') input.value = `SELECT * FROM ${tableName};`;
                }
            });
        }
    });
}

async function handleRunSqlQuery() {
    const category = getActiveCategory();
    const input = document.getElementById(`${category}ConsoleInput`);
    const sql = input ? input.value.trim() : '';

    const statusEl = document.getElementById('sqlExecutionStatus');
    const resultWrapper = document.getElementById('sqlQueryResultWrapper');
    const msgEl = document.getElementById('sqlQueryMessage');
    const thead = document.getElementById('sqlQueryTableHead');
    const tbody = document.getElementById('sqlQueryTableBody');

    if (!sql) {
        statusEl.innerHTML = '<span class="text-danger">Please enter a query or choose a template.</span>';
        return;
    }

    // Safety checks
    const upperSql = sql.toUpperCase();
    if (category === 'dml') {
        const isUpdateOrDelete = upperSql.includes('UPDATE') || upperSql.includes('DELETE');
        if (isUpdateOrDelete && !upperSql.includes('WHERE')) {
            if (!confirm('⚠️ WARNING: Your UPDATE or DELETE command does NOT contain a WHERE clause.\n\nThis will modify or delete ALL rows in the table.\n\nAre you sure you want to proceed?')) {
                return;
            }
        }
    } else if (category === 'ddl') {
        if (upperSql.includes('DROP') || upperSql.includes('TRUNCATE')) {
            if (!confirm(`⚠️ CAUTION: Executing this DDL command will immediately alter or drop table schema in Oracle (auto-committed).\n\nAre you sure you want to proceed?`)) {
                return;
            }
        }
    }

    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1 text-primary"></span>Executing...';
    resultWrapper.classList.remove('d-none');
    msgEl.classList.add('d-none');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    try {
        const res = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql, category: category })
        });
        const data = await res.json();

        if (res.ok) {
            statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Finished successfully</span>';
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

                if (data.type === 'ddl') {
                    loadTables();
                } else if (data.type === 'dml' && currentTableName) {
                    loadTableData(currentTableName);
                }
            }
        } else {
            statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>Execution error</span>';
            msgEl.className = 'alert alert-danger py-2 small';
            msgEl.textContent = data.error || 'Error executing SQL';
            msgEl.classList.remove('d-none');
        }
    } catch (err) {
        statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i>Connection error</span>';
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
