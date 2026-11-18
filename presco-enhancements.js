(function () {
  'use strict';

  const PANELS = {
    'p-revenue': { root: 'revenueDashboard', title: 'Revenue dashboard' },
    'p-payers': { root: 'payerDashboard', title: 'Payer dashboard' },
    'p-consultants': { root: 'consultantDashboard', title: 'Consultant dashboard' },
    'p-marketing': { root: 'marketingDashboard', title: 'Marketing dashboard' },
    'p-ipbill': { root: 'ipBillingDashboard', title: 'IP billing' },
    'p-erbill': { root: 'erBillingDashboard', title: 'ER module billing' },
    'p-pharmbill': { root: 'pharmacyBillingDashboard', title: 'Pharmacy billing' }
  };
  const GROUPS = Object.keys(PANELS);
  const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 56"><circle cx="27" cy="28" r="17" fill="#22c7c9"/><path d="M27 18v20M17 28h20" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="4"/><text x="50" y="30" fill="#0f1731" font-family="Arial,sans-serif" font-size="25" font-weight="700">Presco</text><text x="51" y="42" fill="#0f766e" font-family="Arial,sans-serif" font-size="7" font-weight="700" letter-spacing="1">HOSPITAL OPERATING SYSTEM</text></svg>';
  const logoSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSvg);
  document.querySelectorAll('img[alt="Srikara Hospitals"]').forEach(img => {
    img.src = logoSrc;
    img.alt = 'Presco - Hospital Operating System';
  });
  const FILTERS = {};
  const GRAINS = { 'p-revenue': 'day' };
  let runtime = { data: null, store: null, getBillRows: null };
  const money = n => Number.isFinite(n)
    ? '₹' + Math.round(n).toLocaleString('en-IN')
    : '—';
  const integer = n => Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—';
  const number = n => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const text = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const norm = value => text(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const unique = values => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const uniqueLabels = values => {
    const labels = new Map();
    values.map(text).filter(Boolean).forEach(value => {
      const key = norm(value);
      if (key && !labels.has(key)) labels.set(key, value);
    });
    return Array.from(labels.values()).sort((a, b) => a.localeCompare(b));
  };
  const iso = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const addDays = (date, amount) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + amount);
    return d.toISOString().slice(0, 10);
  };

  function allBillRows() {
    return typeof runtime.getBillRows === 'function' ? runtime.getBillRows() : [];
  }

  function latestDate() {
    const store = runtime.store || {};
    const dates = [runtime.data && runtime.data.asOf];
    ['opBills', 'adm', 'disc', 'opdDays'].forEach(key => {
      (store[key] || []).forEach(row => dates.push(row.date, row.ddate));
    });
    ((store.btReg && store.btReg.loads) || []).forEach(load => dates.push(load.to));
    return dates.map(iso).filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);
  }

  function defaultFilters(panel) {
    const end = latestDate();
    return {
      from: addDays(end, -29),
      to: end,
      branch: '',
      department: '',
      consultant: '',
      type: '',
      payer: '',
      grain: GRAINS[panel] || 'month'
    };
  }

  function optionList(values, selected, allLabel) {
    return `<option value="">${esc(allLabel)}</option>` + values.map(value =>
      `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`
    ).join('');
  }

  function branchOptions() {
    const store = runtime.store || {};
    const values = [];
    (store.opBills || []).forEach(row => values.push(row.loc));
    (store.adm || []).forEach(row => values.push(row.loc));
    (store.disc || []).forEach(row => values.push(row.loc));
    (store.opdDays || []).forEach(day => values.push(...Object.keys(day.locs || {})));
    allBillRows().forEach(row => values.push(row.loc));
    return uniqueLabels(values);
  }

  function departmentOptions() {
    const departments = (runtime.data && runtime.data.depts) || [];
    if (departments.length) return uniqueLabels(departments.map(row => row.name));
    const values = [];
    ((runtime.data && runtime.data.doctors) || []).forEach(row => values.push(row.dept));
    allBillRows().forEach(row => values.push(row.dept));
    (runtime.store && runtime.store.opdDays || []).forEach(day =>
      Object.keys(day.depts || {}).forEach(value => values.push(value))
    );
    return uniqueLabels(values);
  }

  function sourceConsultants() {
    const values = [];
    allBillRows().forEach(row => values.push(row.doc));
    (runtime.store && runtime.store.adm || []).forEach(row => values.push(row.cons));
    return uniqueLabels(values);
  }

  function filtersFor(panel) {
    const root = document.getElementById(PANELS[panel].root);
    const previous = FILTERS[panel] || defaultFilters(panel);
    if (!root) return previous;
    const next = Object.assign({}, previous);
    root.querySelectorAll('[data-filter]').forEach(control => {
      next[control.dataset.filter] = control.value;
    });
    return next;
  }

  function field(label, key, value, type) {
    return `<div class="mgmt-field"><label>${esc(label)}</label>
      <input type="${type || 'text'}" data-filter="${key}" aria-label="${esc(label)}" value="${esc(value)}"></div>`;
  }

  function selectField(label, key, value, values, allLabel) {
    return `<div class="mgmt-field"><label>${esc(label)}</label>
      <select data-filter="${key}" aria-label="${esc(label)}">${optionList(values, value, allLabel)}</select></div>`;
  }

  function controls(panel, filters, options) {
    const departments = options.departments || [];
    const branches = options.branches || [];
    const consultants = options.consultants || [];
    const payers = options.payers || [];
    const types = options.types || [];
    return `<div class="mgmt-controls">
      ${field('From', 'from', filters.from, 'date')}
      ${field('To', 'to', filters.to, 'date')}
      ${selectField('Branch', 'branch', filters.branch, branches, 'All branches')}
      ${departments.length ? selectField('Department', 'department', filters.department, departments, 'All departments') : ''}
      ${options.consultant !== false ? `<div class="mgmt-field"><label for="${panel}-consultant">Consultant</label>
        <input id="${panel}-consultant" type="search" data-filter="consultant" list="${panel}-consultants"
          value="${esc(filters.consultant)}" placeholder="All consultants" autocomplete="off">
        <datalist id="${panel}-consultants">${consultants.map(value => `<option value="${esc(value)}">`).join('')}</datalist></div>` : ''}
      ${types.length ? selectField('Type', 'type', filters.type, types, 'All types') : ''}
      ${options.payer !== false ? selectField('Payer type', 'payer', filters.payer, payers, 'All payer types') : ''}
      ${options.trend ? `<div class="mgmt-field"><label>Trend by</label>
        <select data-filter="grain" aria-label="Trend by">
          ${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([value, label]) =>
            `<option value="${value}"${filters.grain === value ? ' selected' : ''}>${label}</option>`).join('')}
        </select></div>` : ''}
      <div class="mgmt-actions"><button type="button" class="btn sm" data-action="apply">Apply filters</button>
        <button type="button" class="btn ghost sm" data-action="reset">Reset</button></div>
    </div>`;
  }

  const PAYER_TYPES = ['Cash', 'TPA', 'Insurance', 'Government schemes', 'PMJAY', 'Corporate', 'Other'];
  const REVENUE_TYPES = ['OPD / IPD / ER', 'IPD', 'OPD', 'ER', 'Pharmacy'];
  function payerType(name, companyType) {
    const label = `${text(companyType)} ${text(name)}`.toLowerCase();
    if (!text(name) && !text(companyType)) return 'Cash';
    if (/pmjay|pradhan mantri jan|ayushman/.test(label)) return 'PMJAY';
    if (/aarogya|arogyasri|government|govt|e\.?h\.?s|cghs|esi|scheme/.test(label)) return 'Government schemes';
    if (/\btpa\b|medi.?assist|health.?insurance.?tpa|third.?party/.test(label)) return 'TPA';
    if (/insurance|health plan|healthcare/.test(label)) return 'Insurance';
    if (/corporate|company|industry|employer/.test(label)) return 'Corporate';
    if (/cash|self.?pay|general|walk.?in/.test(label)) return 'Cash';
    return 'Other';
  }

  function normalizedFilters(filters) {
    return Object.assign({}, filters, {
      from: iso(filters.from),
      to: iso(filters.to),
      consultant: norm(filters.consultant),
      department: norm(filters.department)
    });
  }

  function inScope(row, filters, dimensions) {
    const f = normalizedFilters(filters);
    const date = iso(row[dimensions.date]);
    if (!date || (f.from && date < f.from) || (f.to && date > f.to)) return false;
    if (filters.branch && dimensions.branch && norm(row[dimensions.branch]) !== norm(filters.branch)) return false;
    if (f.consultant && dimensions.consultant && norm(row[dimensions.consultant]) !== f.consultant) return false;
    if (f.department && dimensions.department) {
      const department = text(row[dimensions.department]) ||
        (dimensions.consultant && docDepartment(row[dimensions.consultant]));
      if (norm(department) !== f.department) return false;
    }
    if (filters.payer && dimensions.payer &&
        payerType(row[dimensions.payer], dimensions.companyType && row[dimensions.companyType]) !== filters.payer) return false;
    return true;
  }

  function category(type) {
    const raw = text(type);
    const normalized = raw.replace(/^refund[-\s]*/i, '').replace(/[-\s](cancel|deleted)$/i, '');
    if (/^ER IP FINAL BILLS$/i.test(normalized)) return 'ER';
    if (/pharmacy/i.test(normalized)) return 'Pharmacy';
    if (/^IP .*?(final bill|general bill|package bill)$/i.test(normalized)) return 'IPD';
    if (/^(OP Bill|OP Corporate|Consultation|Corporate OP Consultation|Registration)$/i.test(normalized)) return 'OPD';
    return '';
  }

  function pharmacyService(type) {
    const value = norm(type);
    if (/\bcasual(?:ty|ity)\b|\bemergency\b/.test(value)) return 'casualty';
    if (/\bip\b|\binpatient\b/.test(value)) return 'ip';
    if (/\bop\b|\boutpatient\b/.test(value)) return 'op';
    return 'other';
  }

  function activeBillRow(row) {
    const status = text(row.st);
    return (!status || status === 'A') && !/[-\s](cancel|deleted)$/i.test(text(row.type));
  }

  function finalRevenueRows(filters) {
    return allBillRows().filter(row => {
      const billCategory = category(row.type);
      const matchesType = !filters.type ||
        (filters.type === 'OPD / IPD / ER'
          ? ['OPD', 'IPD', 'ER'].includes(billCategory)
          : billCategory === filters.type);
      return billCategory && activeBillRow(row) && matchesType && inScope(row, filters, {
        date: 'bdate', branch: 'loc', consultant: 'doc', department: 'dept',
        payer: 'cmp', companyType: 'ctype'
      });
    });
  }

  function renderBillingCategory(root, filters, config) {
    const store = runtime.store || {};
    const sourceCount = ((store.btReg && store.btReg.rows) || []).length;
    const categoryRows = allBillRows().filter(row =>
      category(row.type) === config.category && activeBillRow(row));
    const rows = categoryRows.filter(row => inScope(row, filters, { date: 'bdate', branch: 'loc' }));
    const available = sourceCount > 0;
    const totalPatients = uniquePatients(rows);
    const byType = groups(rows, row => row.type, row => row.net);
    const detailRows = byType.map(item => {
      const subset = rows.filter(row => row.type === item.label);
      const patients = uniquePatients(subset);
      return [
        item.label,
        integer(item.count),
        patients == null ? '—' : integer(patients),
        money(item.value),
        money(sum(subset, 'trcpt')),
        money(sum(subset, 'tout'))
      ];
    });
    const trend = trendRows(rows, filters.grain).map(item => ({
      label: filters.grain === 'month' ? item.label : item.label.slice(5),
      value: item.value
    }));
    const pharmacyCategories = [
      { key: 'op', label: 'OP Pharmacy' },
      { key: 'casualty', label: 'Casualty Pharmacy' },
      { key: 'ip', label: 'IP Pharmacy' }
    ];
    const pharmacySummary = config.category === 'Pharmacy' ? pharmacyCategories.map(item => {
      const sourceRows = categoryRows.filter(row => pharmacyService(row.type) === item.key);
      const subset = rows.filter(row => pharmacyService(row.type) === item.key);
      const patients = uniquePatients(subset);
      return [
        item.label,
        sourceRows.length ? integer(subset.length) : 'Not in register',
        sourceRows.length ? (patients == null ? '—' : integer(patients)) : '—',
        sourceRows.length ? money(sum(subset, 'net')) : '—',
        sourceRows.length ? money(sum(subset, 'trcpt')) : '—',
        sourceRows.length ? money(sum(subset, 'tout')) : '—'
      ];
    }) : [];
    if (config.category === 'Pharmacy' && categoryRows.some(row => pharmacyService(row.type) === 'other')) {
      const subset = rows.filter(row => pharmacyService(row.type) === 'other');
      const patients = uniquePatients(subset);
      pharmacySummary.push([
        'Other pharmacy',
        integer(subset.length),
        patients == null ? '—' : integer(patients),
        money(sum(subset, 'net')),
        money(sum(subset, 'trcpt')),
        money(sum(subset, 'tout'))
      ]);
    }
    const missingPharmacyCategories = config.category === 'Pharmacy'
      ? pharmacyCategories.filter(item => !categoryRows.some(row => pharmacyService(row.type) === item.key))
        .map(item => item.label)
      : [];
    const note = missingPharmacyCategories.length
      ? `${missingPharmacyCategories.join(' and ')} bill rows are not present in the loaded Bill Type register; load those bill types to report their amounts.`
      : config.note;
    root.innerHTML = `${sectionHeader(config.panel, config.title,
      'Billing amounts from the loaded Bill Type register, filtered by date range and branch.',
      available ? 'Loaded register' : 'Data integration required')}
      ${controls(config.panel, filters, {
        branches: branchOptions(), departments: [], consultant: false, payer: false
      })}
      <div class="mgmt-kpis">
        ${metric('Net billed', available ? money(sum(rows, 'net')) : 'Needs data integration',
          'Sum of net amounts recorded for this billing category.', available ? '' : 'missing')}
        ${metric('Collected', available ? money(sum(rows, 'trcpt')) : 'Needs data integration',
          'Total receipt amount recorded in the register.', available ? '' : 'missing')}
        ${metric('Outstanding', available ? money(sum(rows, 'tout')) : 'Needs data integration',
          'Total outstanding due amount recorded in the register.', available ? '' : 'missing')}
        ${metric('Bill records', available ? integer(rows.length) : 'Needs data integration',
          'Active matching bill rows after filters.', available ? '' : 'missing')}
        ${metric('Unique patients', totalPatients == null ? 'Needs patient IDs' : integer(totalPatients),
          'Distinct UMRs among matching bill rows.', totalPatients == null ? 'missing' : '')}
      </div>
      <div class="mgmt-grid">
        ${card('Billing trend', 'Net billed amounts by day or month.', chart(trend, money, 14), true,
          grainButtons(config.panel, filters.grain))}
        ${config.category === 'Pharmacy'
          ? card('Pharmacy category summary', 'OP, Casualty, and IP pharmacy amounts shown separately.',
            table(['Category', 'Bills', 'Patients', 'Net billed', 'Collected', 'Outstanding'], pharmacySummary),
            true)
          : ''}
        ${card('Bill type details', 'Counts and amounts by the bill type recorded in the register.',
          available
            ? table(['Bill type', 'Bills', 'Patients', 'Net billed', 'Collected', 'Outstanding'], detailRows)
            : integration('Load the Bill Type register to show date-filtered billing totals.'),
          true)}
      </div>
      <p class="mgmt-footnote">${esc(note)} Net billed and receipt totals preserve signed values from the source register. Refund rows are included only when their bill type maps to this category, and canceled/inactive rows are excluded.</p>`;
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + number(row[key]), 0);
  }

  function uniquePatients(rows) {
    const patients = rows.map(row => text(row.umr)).filter(value => value && value !== '-');
    return patients.length ? new Set(patients).size : null;
  }

  function groups(rows, keyFn, valueFn) {
    const map = new Map();
    rows.forEach(row => {
      const label = text(keyFn(row)) || 'Not recorded';
      let item = map.get(label);
      if (!item) {
        item = { label, value: 0, count: 0, patients: new Set(), rows: [] };
        map.set(label, item);
      }
      item.value += number(valueFn(row));
      item.count++;
      const umr = text(row.umr);
      if (umr && umr !== '-') item.patients.add(umr);
      item.rows.push(row);
    });
    return Array.from(map.values()).map(item => Object.assign(item, { patients: item.patients.size }))
      .sort((a, b) => b.value - a.value);
  }

  function metric(label, value, note, state) {
    return `<article class="mgmt-kpi ${state || ''}"><p class="mgmt-kpi-label">${esc(label)}</p>
      <strong class="mgmt-kpi-value">${esc(value)}</strong><p class="mgmt-kpi-note">${esc(note)}</p></article>`;
  }

  function integration(note) {
    return `<div class="mgmt-integration">${esc(note)}</div>`;
  }

  function chart(items, formatter, limit) {
    const visible = items.slice(0, limit || 8);
    if (!visible.length) return '<div class="mgmt-empty">No data is available for this selection.</div>';
    const max = Math.max(...visible.map(item => Math.abs(item.value)), 1);
    return `<div class="mgmt-chart">${visible.map(item => {
      const width = Math.max(2, Math.min(100, Math.abs(item.value) / max * 100));
      return `<div class="mgmt-bar-row"><span class="mgmt-bar-label" title="${esc(item.label)}">${esc(item.label)}</span>
        <span class="mgmt-bar-track"><span class="mgmt-bar-fill" style="width:${width}%"></span></span>
        <span class="mgmt-bar-value">${esc(formatter(item.value))}</span></div>`;
    }).join('')}</div>`;
  }

  function table(headers, rows, empty) {
    if (!rows.length) return `<div class="mgmt-empty">${esc(empty || 'No data is available for this selection.')}</div>`;
    return `<div class="mgmt-table-wrap"><table class="mgmt-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map((cell, index) => `<td>${index === 0 ? esc(cell) : esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function card(title, description, body, wide, extra) {
    return `<article class="mgmt-card${wide ? ' wide' : ''}"><h3>${esc(title)}</h3>
      ${extra || ''}${description ? `<p>${esc(description)}</p>` : ''}${body}</article>`;
  }

  function trendRows(rows, grain) {
    const grouped = groups(rows, row => {
      const date = iso(row.bdate);
      return grain === 'day' ? date : date.slice(0, 7);
    }, row => row.net);
    return grouped.sort((a, b) => a.label.localeCompare(b.label));
  }

  const REVENUE_SERIES = [
    { key: 'IPD', label: 'IPD', color: '#0F9488' },
    { key: 'OPD', label: 'OPD', color: '#38BDF8' },
    { key: 'ER', label: 'ER', color: '#F59E0B' },
    { key: 'Pharmacy', label: 'Pharmacy', color: '#8B5CF6' }
  ];

  function compactMoney(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1e7) return '₹' + (value / 1e7).toFixed(2) + ' Cr';
    if (absolute >= 1e5) return '₹' + (value / 1e5).toFixed(2) + ' L';
    if (absolute >= 1e3) return '₹' + (value / 1e3).toFixed(0) + ' K';
    return '₹' + Math.round(value).toLocaleString('en-IN');
  }

  function revenuePeriodKey(date, grain) {
    if (grain === 'month') return date.slice(0, 7);
    if (grain !== 'week') return date;
    const monday = new Date(date + 'T00:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return monday.toISOString().slice(0, 10);
  }

  function revenuePeriodLabel(key, grain) {
    if (grain === 'month') return key;
    const date = new Date(key + 'T00:00:00Z');
    const label = date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', timeZone: 'UTC'
    });
    return grain === 'week' ? 'Week of ' + label : label;
  }

  function stackedRevenueChart(rows, grain) {
    const buckets = new Map();
    rows.forEach(row => {
      const date = iso(row.bdate);
      const key = revenuePeriodKey(date, grain);
      const series = category(row.type);
      if (!key || !REVENUE_SERIES.some(item => item.key === series)) return;
      const bucket = buckets.get(key) || { label: key, IPD: 0, OPD: 0, ER: 0, Pharmacy: 0 };
      bucket[series] += number(row.net);
      buckets.set(key, bucket);
    });
    const points = Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
    if (!points.length) return '<div class="mgmt-empty">No revenue is available for this selection.</div>';

    const width = 1000, height = 340, left = 78, right = 18, top = 20, bottom = 54;
    const plotHeight = height - top - bottom, plotWidth = width - left - right;
    const positiveMax = Math.max(0, ...points.map(point =>
      REVENUE_SERIES.reduce((sum0, item) => sum0 + Math.max(0, point[item.key]), 0)));
    const negativeMax = Math.max(0, ...points.map(point =>
      REVENUE_SERIES.reduce((sum0, item) => sum0 + Math.abs(Math.min(0, point[item.key])), 0)));
    const range = Math.max(positiveMax + negativeMax, 1);
    const scale = plotHeight / range;
    const zeroY = top + positiveMax * scale;
    const slot = plotWidth / points.length;
    const barWidth = Math.max(3, Math.min(64, slot * 0.62));
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Stacked revenue by ${esc(grain)}">
      <title>Revenue by ${esc(grain)}</title>`;
    for (let index = 0; index <= 4; index++) {
      const value = positiveMax - range * index / 4;
      const y = zeroY - value * scale;
      svg += `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="#E2E8F0"/>
        <text x="${left - 9}" y="${y + 4}" text-anchor="end" fill="#64748B" font-size="12">${esc(compactMoney(value))}</text>`;
    }
    svg += `<line x1="${left}" x2="${width - right}" y1="${zeroY}" y2="${zeroY}" stroke="#94A3B8"/>`;
    points.forEach((point, index) => {
      const x = left + index * slot + (slot - barWidth) / 2;
      let positive = 0, negative = 0;
      REVENUE_SERIES.forEach(item => {
        const value = point[item.key];
        if (!value) return;
        const segmentHeight = Math.abs(value) * scale;
        const y = value > 0 ? zeroY - (positive + value) * scale : zeroY + negative * scale;
        if (value > 0) positive += value;
        else negative += Math.abs(value);
        const title = `${revenuePeriodLabel(point.label, grain)} · ${item.label}: ${money(value)}`;
        svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(1, segmentHeight)}" fill="${item.color}">
          <title>${esc(title)}</title></rect>`;
      });
      if (points.length <= 10 || index % Math.ceil(points.length / 10) === 0 || index === points.length - 1) {
        svg += `<text x="${x + barWidth / 2}" y="${height - bottom + 22}" text-anchor="middle" fill="#64748B" font-size="11">${esc(revenuePeriodLabel(point.label, grain))}</text>`;
      }
    });
    svg += '</svg>';
    const legend = REVENUE_SERIES.map(item =>
      `<span><i style="background:${item.color}"></i>${item.label}</span>`
    ).join('');
    return `<div class="mgmt-revenue-chart">${svg}</div><div class="mgmt-revenue-legend">${legend}</div>`;
  }

  function revenueBreakdown(rows, keyFn, total) {
    return groups(rows, row => text(keyFn(row)) || 'Not recorded', row => row.net).map(item => {
      const subset = rows.filter(row => (text(keyFn(row)) || 'Not recorded') === item.label);
      const patients = uniquePatients(subset);
      return [
        item.label,
        patients == null ? '—' : integer(patients),
        integer(subset.length),
        money(item.value),
        total ? (100 * item.value / total).toFixed(1) + '%' : '—',
        money(sum(subset, 'trcpt')),
        money(sum(subset, 'tout'))
      ];
    });
  }

  function grainButtons(panel, grain) {
    return `<span class="mgmt-grain" aria-label="Trend interval">
      <button type="button" data-grain="day" class="${grain === 'day' ? 'on' : ''}">Daily</button>
      <button type="button" data-grain="month" class="${grain === 'month' ? 'on' : ''}">Monthly</button></span>`;
  }

  function sectionHeader(panel, title, description, source) {
    return `<div class="mgmt-intro"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div>
      <span class="mgmt-source">${esc(source)}</span></div>`;
  }

  function renderRevenue(root, filters) {
    const store = runtime.store || {};
    const rows = finalRevenueRows(filters);
    const total = sum(rows, 'net');
    const ipd = rows.filter(row => category(row.type) === 'IPD');
    const opd = rows.filter(row => category(row.type) === 'OPD');
    const er = rows.filter(row => category(row.type) === 'ER');
    const pharmacy = rows.filter(row => category(row.type) === 'Pharmacy');
    const opdPharmacy = pharmacy.filter(row => pharmacyService(row.type) === 'op');
    const sourceRows = allBillRows();
    const hasIpPharmacy = sourceRows.some(row =>
      category(row.type) === 'Pharmacy' && activeBillRow(row) && pharmacyService(row.type) === 'ip');
    const hasCasualtyPharmacy = sourceRows.some(row =>
      category(row.type) === 'Pharmacy' && activeBillRow(row) && pharmacyService(row.type) === 'casualty');
    const missingPharmacy = [
      !hasCasualtyPharmacy ? 'Casualty' : '',
      !hasIpPharmacy ? 'IP' : ''
    ].filter(Boolean);
    const patients = uniquePatients(rows);
    const discharges = (store.disc || []).filter(row =>
      inScope(row, filters, { date: 'ddate', branch: 'loc' }));
    const alos = discharges.length
      ? sum(discharges, 'stay') / discharges.length
      : null;
    const departmentRows = revenueBreakdown(rows, row => row.dept, total).slice(0, 20);
    const payerRows = revenueBreakdown(rows, row => payerType(row.cmp, row.ctype), total);
    const sourceCount = ((store.btReg && store.btReg.rows) || []).length;
    const share = value => total ? (100 * value / total).toFixed(1) + '% of total' : 'No revenue in selection';
    root.innerHTML = `${sectionHeader('p-revenue', 'Revenue dashboard',
      'Revenue by billing category, department, payer, and trend interval.',
      sourceCount ? 'Loaded register' : 'Data integration required')}
      ${controls('p-revenue', filters, {
        branches: branchOptions(), departments: departmentOptions(), consultant: false,
        types: REVENUE_TYPES, payers: PAYER_TYPES, trend: true
      })}
      <div class="mgmt-kpis mgmt-revenue-kpis">
        ${sourceCount ? metric('Total hospital revenue', compactMoney(total), 'Net amount across matched bill-type rows; reconcile to the finance ledger.') : metric('Total hospital revenue', 'Needs data integration', 'Load the bill-type register to report date-filtered revenue.', 'missing')}
        ${sourceCount ? metric('IP revenue', compactMoney(sum(ipd, 'net')), share(sum(ipd, 'net'))) : metric('IP revenue', 'Needs data integration', 'Load IP bill-type records.', 'missing')}
        ${sourceCount ? metric('OPD billing revenue', compactMoney(sum(opd, 'net')), share(sum(opd, 'net'))) : metric('OPD billing revenue', 'Needs data integration', 'Load OP bill-type records.', 'missing')}
        ${sourceCount ? metric('ER revenue', compactMoney(sum(er, 'net')), share(sum(er, 'net'))) : metric('ER revenue', 'Needs data integration', 'Load ER bill-type records.', 'missing')}
        ${sourceCount ? metric('OP pharmacy revenue', compactMoney(sum(opdPharmacy, 'net')), share(sum(opdPharmacy, 'net'))) : metric('OP pharmacy revenue', 'Needs data integration', 'Load OP pharmacy bill types.', 'missing')}
        ${sourceCount ? metric('Total pharmacy revenue', compactMoney(sum(pharmacy, 'net')),
          missingPharmacy.length ? `Missing ${missingPharmacy.join(' and ')} pharmacy records.` : share(sum(pharmacy, 'net')),
          missingPharmacy.length ? 'partial' : '') : metric('Total pharmacy revenue', 'Needs data integration', 'Load OP, Casualty, and IP pharmacy bill types.', 'missing')}
        ${patients == null ? metric('ARPP', sourceCount ? 'Needs patient IDs' : 'Needs data integration', 'Average revenue per distinct patient.', 'missing')
          : metric('ARPP', patients ? money(total / patients) : '—', `${integer(patients)} unique patients in this selection.`)}
        ${alos == null ? metric('ALOS', 'Needs discharge data', 'Average length of stay for filtered discharges.', 'missing')
          : metric('ALOS', alos.toFixed(1) + ' days', `${integer(discharges.length)} discharges in the selected date range and branch.`)}
      </div>
      <div class="mgmt-grid">
        ${card('Revenue trend', 'Daily, weekly, or monthly net billings, stacked by category.',
          stackedRevenueChart(rows, filters.grain), true)}
        ${card('Department-wise revenue', 'Patients, bills, revenue share, receipts, and outstanding by department.',
          table(['Department', 'Patients', 'Bills', 'Revenue', 'Share', 'Collected', 'Outstanding'], departmentRows))}
        ${card('Payer-wise revenue', 'Patients, bills, revenue share, receipts, and outstanding by payer type.',
          table(['Payer', 'Patients', 'Bills', 'Revenue', 'Share', 'Collected', 'Outstanding'], payerRows))}
      </div>
      <p class="mgmt-footnote">Revenue includes recognized active bill types and preserves signed refund values; canceled/inactive bills are excluded. ARPP is net revenue divided by distinct UMRs. ALOS is calculated from discharge stay days for the selected date range and branch. Pharmacy figures are partial when Casualty or IP pharmacy bill types are absent from the register.</p>`;
  }

  function renderPayers(root, filters) {
    const rows = finalRevenueRows(filters);
    const byType = groups(rows, row => payerType(row.cmp, row.ctype), row => row.net)
      .sort((a, b) => PAYER_TYPES.indexOf(a.label) - PAYER_TYPES.indexOf(b.label));
    const byCompany = groups(rows, row => text(row.cmp) || payerType(row.cmp, row.ctype), row => row.net).slice(0, 15);
    const payerRows = byType.map(item => {
      const subset = rows.filter(row => payerType(row.cmp, row.ctype) === item.label);
      return [item.label, integer(uniquePatients(subset)), money(item.value), money(sum(subset, 'paid')), money(sum(subset, 'due'))];
    });
    const trend = trendRows(rows, filters.grain).map(item => ({
      label: filters.grain === 'month' ? item.label : item.label.slice(5),
      value: item.value
    }));
    const sourceCount = ((runtime.store && runtime.store.btReg && runtime.store.btReg.rows) || []).length;
    root.innerHTML = `${sectionHeader('p-payers', 'Payer dashboard',
      'Patient distribution, billed revenue, collections, and outstanding balances by payer type.',
      sourceCount ? 'Loaded register' : 'Data integration required')}
      ${controls('p-payers', filters, { branches: branchOptions(), departments: departmentOptions(), consultants: sourceConsultants(), types: REVENUE_TYPES, payers: PAYER_TYPES })}
      <div class="mgmt-kpis">
        ${metric('Billed revenue', sourceCount ? money(sum(rows, 'net')) : 'Needs data integration', 'Net amount from bill-type rows in the selected scope.', sourceCount ? '' : 'missing')}
        ${metric('Unique patients', uniquePatients(rows) == null ? 'Needs patient IDs' : integer(uniquePatients(rows)), 'Distinct UMRs represented in matched bill-type rows.', uniquePatients(rows) == null ? 'missing' : '')}
        ${metric('Collections', sourceCount ? money(sum(rows, 'paid')) : 'Needs data integration', 'Paid amount recorded in the bill-type register.', sourceCount ? '' : 'missing')}
        ${metric('Outstanding', sourceCount ? money(sum(rows, 'due')) : 'Needs data integration', 'Due amount recorded in the bill-type register.', sourceCount ? '' : 'missing')}
      </div>
      <div class="mgmt-grid">
        ${card('Revenue by payer type', 'Cash, TPA, insurance, government schemes, PMJAY, corporate, and other.', chart(byType, money, 7))}
        ${card('Payer revenue trend', 'Net registered billings for the selected payer filters.', chart(trend, money, 14), false, grainButtons('p-payers', filters.grain))}
        ${card('Payer billing and collection', 'Patients are distinct UMRs within each payer type.', table(['Payer type', 'Patients', 'Billed', 'Collected', 'Outstanding'], payerRows))}
        ${card('Top payer entities', 'Company names are shown as supplied by the loaded register.', chart(byCompany, money, 12), true)}
        ${sourceCount ? '' : integration('Load the bill-type register with company type, company name, UMR, net amount, paid amount, and due amount to enable payer reporting.')}
      </div>
      <p class="mgmt-footnote">Payer type mapping uses the source company name/type text and is intended for operational grouping; review category mappings before publishing official payer reports.</p>`;
  }

  function docDepartment(name) {
    const key = norm(name);
    const rows = (runtime.data && runtime.data.doctors) || [];
    const match = rows.find(row => norm(row.name) === key);
    return match ? text(match.dept) : '';
  }

  function opdConsultations(filters) {
    const result = new Map();
    const store = runtime.store || {};
    (store.opdDays || []).forEach(day => {
      if (!inScope(day, filters, { date: 'date' })) return;
      Object.entries(day.docs || {}).forEach(([name, entry]) => {
        const consultant = text(name);
        const department = text(entry.dept) || docDepartment(consultant);
        if (filters.consultant && norm(consultant) !== norm(filters.consultant)) return;
        if (filters.department && norm(department) !== norm(filters.department)) return;
        const branch = Object.keys(entry.locs || {}).find(value => norm(value) === norm(filters.branch));
        if (filters.branch && !branch) return;
        let visits = number(entry.v);
        if (filters.branch) {
          const locs = entry.locs || {};
          visits = number(locs[branch]);
        }
        if (!visits) return;
        result.set(consultant, (result.get(consultant) || 0) + visits);
      });
    });
    return result;
  }

  function renderConsultants(root, filters) {
    const rows = finalRevenueRows(filters);
    const rev = groups(rows, row => row.doc || 'Not assigned', row => row.net);
    const opd = opdConsultations(filters);
    const adm = (runtime.store && runtime.store.adm || []).filter(row => inScope(row, filters, {
      date: 'date', branch: 'loc', consultant: 'cons', department: 'dept',
      payer: 'payer'
    }));
    const admissionsByConsultant = groups(adm, row => row.cons || 'Not assigned', row => 1);
    const revenueByConsultant = new Map(rev.map(item => [norm(item.label), item]));
    const admissionsByName = new Map(admissionsByConsultant.map(item => [norm(item.label), item]));
    const opdByConsultant = new Map(Array.from(opd.entries()).map(([name, visits]) => [norm(name), visits]));
    const names = uniqueLabels([...rev.map(item => item.label), ...opd.keys(), ...admissionsByConsultant.map(item => item.label)]);
    const rowsByConsultant = names.map(name => {
      const revenue = revenueByConsultant.get(norm(name));
      const admission = admissionsByName.get(norm(name));
      const visitCount = opdByConsultant.get(norm(name));
      const sourceRows = revenue ? revenue.rows : [];
      return {
        revenueValue: revenue ? revenue.value : 0,
        cells: [
        name,
        integer(visitCount || 0),
        integer(admission ? admission.count : 0),
        integer(uniquePatients(sourceRows) || 0),
        money(revenue ? revenue.value : 0),
        text((sourceRows[0] && sourceRows[0].dept) || docDepartment(name) || '—')
        ]
      };
    }).sort((a, b) => b.revenueValue - a.revenueValue).slice(0, 25).map(item => item.cells);
    const revenueSum = sum(rows, 'net');
    const activeConsultants = new Set(rows.map(row => norm(row.doc)).filter(Boolean)).size;
    const periods = trendRows(rows, filters.grain).map(item => ({
      label: filters.grain === 'month' ? item.label : item.label.slice(5),
      value: item.value
    }));
    const sourceCount = ((runtime.store && runtime.store.btReg && runtime.store.btReg.rows) || []).length;
    root.innerHTML = `${sectionHeader('p-consultants', 'Consultant dashboard',
      'Consultations, admissions, bill-register revenue, and department performance by consultant.',
      sourceCount ? 'Loaded register' : 'Data integration required')}
      ${controls('p-consultants', filters, { branches: branchOptions(), departments: departmentOptions(), consultants: sourceConsultants(), types: REVENUE_TYPES, payers: PAYER_TYPES })}
      <div class="mgmt-kpis">
        ${metric('Consultants with billings', sourceCount ? integer(activeConsultants) : 'Needs data integration', 'Distinct consultants with matched registered bill rows.', sourceCount ? '' : 'missing')}
        ${metric('OPD consultations', integer(Array.from(opd.values()).reduce((a, b) => a + b, 0)), 'From date-wise OPD statistics; branch-filtered where consultant location counts are available.')}
        ${metric('IP admissions', integer(adm.length), 'Admission rows matching the selected scope.')}
        ${metric('Available registered revenue', sourceCount ? money(revenueSum) : 'Needs data integration', 'Net bill-register revenue; see the report table for the included records.', sourceCount ? '' : 'missing')}
        ${metric('Average revenue / consultant', activeConsultants ? money(revenueSum / activeConsultants) : '—', 'Available registered revenue divided by consultants with billing rows.')}
        ${metric('Revenue per unique patient', uniquePatients(rows) ? money(revenueSum / uniquePatients(rows)) : '—', 'Calculated from net billings and distinct UMRs in the selection.')}
      </div>
      <div class="mgmt-grid">
        ${card('Consultant performance', 'Top 25 by registered revenue; use the consultant filter to focus on an individual.', table(['Consultant', 'OPD visits', 'IP admissions', 'Patients', 'Net revenue', 'Department'], rowsByConsultant))}
        ${card('Consultant revenue trend', 'Net bill-register values by date or month.', chart(periods, money, 14), false, grainButtons('p-consultants', filters.grain))}
        ${card('Department-wise performance', 'Revenue grouped by department in the bill-type register.', chart(groups(rows, row => row.dept || 'Not recorded', row => row.net), money, 12))}
      </div>
      <p class="mgmt-footnote">OPD consultation totals come from daily OPD statistics. Revenue and patient counts come from bill-register rows; they may not match consultant-wise compensation or audited financial reports.</p>`;
  }

  function acquisition(rows, filters) {
    const result = { visits: 0, newReg: 0, oldReg: 0, branches: new Map(), days: [] };
    (rows || []).forEach(day => {
      if (!inScope(day, filters, { date: 'date' })) return;
      let visits = number(day.visits), newReg = number(day.newReg), oldReg = number(day.oldReg);
      if (filters.branch) {
        const locationKey = Object.keys(day.locs || {}).find(value => norm(value) === norm(filters.branch));
        const location = locationKey ? day.locs[locationKey] : null;
        visits = number(location && location.visits);
        newReg = number(location && location.newReg);
        oldReg = number(location && location.oldReg);
      }
      result.visits += visits;
      result.newReg += newReg;
      result.oldReg += oldReg;
      result.days.push({ label: day.date, value: newReg });
      if (!filters.branch) {
        Object.entries(day.locs || {}).forEach(([name, value]) => {
          const item = result.branches.get(name) || { label: name, value: 0, count: 0, patients: 0, rows: [] };
          item.value += number(value.newReg);
          result.branches.set(name, item);
        });
      } else {
        const item = result.branches.get(filters.branch) || { label: filters.branch, value: 0, count: 0, patients: 0, rows: [] };
        item.value += newReg;
        result.branches.set(filters.branch, item);
      }
    });
    return result;
  }

  function referrals(rows, filters) {
    const bySource = new Map();
    const byDoctor = new Map();
    rows.forEach(row => {
      if (!inScope(row, filters, { date: 'bdate', branch: 'loc', consultant: 'doc', department: 'dept' })) return;
      const refs = [
        [row.r1t, row.r1],
        [row.r2t, row.r2]
      ];
      refs.forEach(([kind, source]) => {
        const label = text(source);
        if (!label || /^[.\s\-_\/]+$/.test(label)) return;
        const sourceName = `${text(kind) ? text(kind) + ': ' : ''}${label}`;
        const entry = bySource.get(sourceName) || { label: sourceName, value: 0, count: 0, patients: new Set(), rows: [] };
        entry.value += number(row.net);
        entry.count++;
        if (text(row.umr)) entry.patients.add(text(row.umr));
        bySource.set(sourceName, entry);
        const doctor = text(row.doc) || 'Not assigned';
        const docEntry = byDoctor.get(doctor) || { label: doctor, value: 0, count: 0, patients: new Set(), rows: [] };
        docEntry.value++;
        if (text(row.umr)) docEntry.patients.add(text(row.umr));
        byDoctor.set(doctor, docEntry);
      });
    });
    const finish = map => Array.from(map.values()).map(item =>
      Object.assign(item, { patients: item.patients.size })
    ).sort((a, b) => b.value - a.value);
    return { sources: finish(bySource), doctors: finish(byDoctor) };
  }

  function renderMarketing(root, filters) {
    const store = runtime.store || {};
    const acquisitionData = acquisition(store.opdDays || [], filters);
    const newShare = acquisitionData.visits ? acquisitionData.newReg / acquisitionData.visits * 100 : null;
    const ref = referrals(allBillRows(), filters);
    const referralRevenue = ref.sources;
    const groupedDays = groups(acquisitionData.days, item =>
      filters.grain === 'month' ? item.label.slice(0, 7) : item.label, item => item.value)
      .sort((a, b) => a.label.localeCompare(b.label));
    const branches = Array.from(acquisitionData.branches.values()).sort((a, b) => b.value - a.value);
    const referralAvailable = referralRevenue.length > 0;
    root.innerHTML = `${sectionHeader('p-marketing', 'Marketing dashboard',
      'Patient acquisition, new versus returning registrations, referral activity, and source-linked revenue.',
      (store.opdDays || []).length ? 'Loaded OPD statistics' : 'Data integration required')}
      ${controls('p-marketing', filters, { branches: branchOptions(), departments: [], consultant: false, payers: false })}
      <div class="mgmt-kpis">
        ${metric('OPD visits', integer(acquisitionData.visits), 'Visits in the selected dates and branch.')}
        ${metric('New registrations', integer(acquisitionData.newReg), 'New registrations reported in daily OPD statistics.')}
        ${metric('Returning registrations', integer(acquisitionData.oldReg), 'Old registrations reported in daily OPD statistics.')}
        ${metric('New-registration share', newShare == null ? '\u2014' : newShare.toFixed(1) + '%', 'New registrations divided by reported visits.')}
      </div>
      <div class="mgmt-grid">
        ${card('Patient acquisition trend', 'New registrations by date or month.', chart(groupedDays, integer, 14), true, grainButtons('p-marketing', filters.grain))}
        ${card('Branch-wise acquisition', 'New registrations by branch.', chart(branches, integer, 12))}
        ${card('Referral source performance', 'Unique patients and net billings attributed to loaded referral fields.',
          referralAvailable ? table(['Referral source', 'Patients', 'Net revenue'], referralRevenue.slice(0, 12).map(item => [item.label, integer(item.patients), money(item.value)]))
            : integration('Referral source fields are not populated in the loaded bill-type register. Load referral type/source and patient identifiers to enable this report.'))}
        ${card('Doctor-wise referrals', 'Referral activity grouped by the consultant recorded on the bill.',
          ref.doctors.length ? table(['Consultant', 'Referral records', 'Patients'], ref.doctors.slice(0, 12).map(item => [item.label, integer(item.value), integer(item.patients)]))
            : integration('No consultant-linked referral records are available in this date range.'))}
        ${card('Campaign performance', 'Campaign-attributed patients, revenue, and return on spend.',
          integration('Requires campaign IDs, campaign spend, leads, and appointment/arrival attribution. No campaign figures are inferred from the current reports.'))}
        ${card('Patient conversion', 'Lead-to-appointment and appointment-to-visit trends.',
          integration('Requires lead, appointment, and visit event records with a shared patient or campaign key.'))}
      </div>
      <p class="mgmt-footnote">New and returning totals use the definitions supplied by the OPD statistics report. Referral counts and revenue are available only when the bill register carries referral source and UMR fields. A bill linked to both referral fields can appear under both sources, so source totals are not additive.</p>`;
  }

  function render(panel) {
    const config = PANELS[panel];
    if (!config) return;
    const root = document.getElementById(config.root);
    if (!root) return;
    const filters = Object.assign(defaultFilters(panel), FILTERS[panel] || {});
    filters.grain = GRAINS[panel] || filters.grain || 'month';
    FILTERS[panel] = filters;
    if (!runtime.store) {
      root.innerHTML = `${sectionHeader(panel, config.title, 'Management analytics from reports loaded into this dashboard.', 'Waiting for reports')}
        ${integration('Dashboard data has not finished loading. Refresh this tab after the report is available.')}`;
      return;
    }
    if (panel === 'p-revenue') renderRevenue(root, filters);
    if (panel === 'p-payers') renderPayers(root, filters);
    if (panel === 'p-consultants') renderConsultants(root, filters);
    if (panel === 'p-marketing') renderMarketing(root, filters);
    if (panel === 'p-ipbill') renderBillingCategory(root, filters, {
      panel, title: 'IP billing', category: 'IPD',
      note: 'Includes IP final, general, and package bill types; ER final bills are shown separately.'
    });
    if (panel === 'p-erbill') renderBillingCategory(root, filters, {
      panel, title: 'ER module billing', category: 'ER',
      note: 'Includes ER IP final bills recorded in the Bill Type register.'
    });
    if (panel === 'p-pharmbill') renderBillingCategory(root, filters, {
      panel, title: 'Pharmacy billing', category: 'Pharmacy',
      note: 'Includes pharmacy bill types found in the Bill Type register.'
    });
  }

  function applyFilters(panel) {
    const root = document.getElementById(PANELS[panel].root);
    const next = filtersFor(panel);
    if (root) {
      const grain = root.querySelector('[data-grain].on');
      if (grain) next.grain = grain.dataset.grain;
    }
    FILTERS[panel] = next;
    GRAINS[panel] = next.grain;
    render(panel);
  }

  Object.entries(PANELS).forEach(([panel, config]) => {
    const root = document.getElementById(config.root);
    if (!root) return;
    root.addEventListener('change', () => applyFilters(panel));
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-action]');
      if (action && action.dataset.action === 'reset') {
        GRAINS[panel] = panel === 'p-revenue' ? 'day' : 'month';
        FILTERS[panel] = defaultFilters(panel);
        render(panel);
        return;
      }
      const grain = event.target.closest('[data-grain]');
      if (grain) {
        const next = filtersFor(panel);
        next.grain = grain.dataset.grain;
        FILTERS[panel] = next;
        GRAINS[panel] = next.grain;
        render(panel);
        return;
      }
      if (action && action.dataset.action === 'apply') applyFilters(panel);
    });
  });

  const tablist = document.querySelector('nav.tabs[role="tablist"]');
  if (tablist) {
    const activeTab = tablist.querySelector('button[aria-selected="true"]');
    document.body.classList.toggle('management-tab-active',
      !!activeTab && GROUPS.includes(activeTab.getAttribute('aria-controls')));
    tablist.addEventListener('click', event => {
      const tab = event.target.closest('button[role="tab"]');
      if (tab) document.body.classList.toggle('management-tab-active', GROUPS.includes(tab.getAttribute('aria-controls')));
    }, true);
  }

  window.__PRESCO_ENHANCER_READY = payload => {
    runtime = payload || { data: null, store: null, getBillRows: null };
    GROUPS.forEach(render);
  };
  window.__PRESCO_RENDER_MANAGEMENT = render;
})();
