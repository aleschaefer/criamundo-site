import { ASSET_TYPES as types, ASSET_SUBTYPES as subtypes, SUBTYPES_BY_TYPE, hasIncome, hasCurrentPrice } from './finance-types.mjs';
import { todayInSaoPaulo, formatTransactionDate } from './finance-date.mjs';
import { calculateYields } from './finance-yield.mjs';
import { assetAllocation } from './finance-allocation.mjs';
import { readB3AssetsPdf } from './finance-asset-import.js?v=1';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const section = $('#finance-section');
  const assetForm = $('#finance-asset');
  const transactionForm = $('#finance-transaction');
  const assetImportForm = $('#finance-asset-import');
  const status = $('#finance-status');
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const yieldPercent = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(value) + '%' : '—';
  const incomeMoney = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(value);
  const quantity = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
  let assetRequestId = crypto.randomUUID();
  let transactionRequestId = crypto.randomUUID();
  let selectedAssetType = null;
  let selectedOwner = '';
  let editingAsset = null;
  let editingTransaction = null;
  let data = null;
  let busy = false;
  let generation = 0;
  let importedAssets = [];
  function message(text, error = false) {
    status.textContent = text;
    status.className = `save-status${error ? ' is-error' : ''}`;
  }
  function controls() {
    [assetForm, transactionForm, assetImportForm].forEach(form => {
      for (const input of form.elements) input.disabled = busy || !data;
    });
    marketFields();
    assetForm.elements.subType.disabled = busy || !data || assetForm.elements.assetType.value === '3';
    transactionControls();
    $('#finance-refresh').disabled = busy;
    section.querySelectorAll('[data-record-action], [data-finance-view], [data-filter-type], #finance-filter-clear').forEach(button => { button.disabled = busy; });
  }
  function view(name) {
    assetForm.hidden = name !== 'asset';
    transactionForm.hidden = name !== 'transaction';
    assetImportForm.hidden = name !== 'import-assets';
    $('#finance-overview').hidden = name !== 'overview';
    document.querySelectorAll('[data-finance-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.financeView === name)));
  }
  function clearAssetImport() {
    importedAssets = [];
    assetImportForm.reset();
    $('#finance-asset-import-items').replaceChildren();
    $('#finance-asset-import-preview').hidden = true;
    $('#finance-asset-import-confirm').hidden = true;
    $('#finance-asset-import-progress').hidden = true;
    $('#finance-asset-import-empty').hidden = false;
    $('#finance-asset-import-empty').textContent = 'Selecione o extrato em PDF para iniciar.';
  }
  function importInput(type, value, field, attributes = {}) {
    const input = document.createElement('input'); input.type = type; input.value = value; input.dataset.field = field;
    Object.entries(attributes).forEach(([key, item]) => input.setAttribute(key, item));
    return input;
  }
  function renderAssetImport() {
    const body = $('#finance-asset-import-items'); body.replaceChildren();
    for (const [index, item] of importedAssets.entries()) {
      const tr = document.createElement('tr'); tr.dataset.index = index;
      const selected = importInput('checkbox', '', 'selected'); selected.checked = true;
      const existing = data?.assets.some(asset =>
        (asset.symbol === item.symbol && asset.name === item.name) ||
        (asset.name === item.name && asset.assetType === item.assetType && asset.subType === item.subType));
      const cells = [selected, String(item.page), assetImportForm.elements.owner.value, importInput('text', item.symbol, 'symbol', { maxlength: '7', required: '' }), importInput('text', item.name, 'name', { maxlength: '30', required: '' }), types[item.assetType], subtypes[item.subType], importInput('number', item.quantity, 'quantity', { min: '0', max: '2147483647', step: '1', required: '' }), importInput('number', item.currentPrice.toFixed(2), 'currentPrice', { min: '0', max: '999999.99', step: '0.01', required: '' }), importInput('number', item.total.toFixed(2), 'total', { min: '0', max: '99999999.99', step: '0.01', required: '' }), existing ? 'Atualizar' : 'Novo'];
      for (const value of cells) { const td = document.createElement('td'); value instanceof Node ? td.append(value) : td.textContent = value; tr.append(td); }
      body.append(tr);
    }
    $('#finance-asset-import-preview').hidden = !importedAssets.length;
    $('#finance-asset-import-confirm').hidden = !importedAssets.length;
    $('#finance-asset-import-empty').hidden = Boolean(importedAssets.length);
  }
  function row(target, values, kind, record) {
    const tr = document.createElement('tr');
    values.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
    const actions = document.createElement('td');
    const buttons = document.createElement('div'); buttons.className = 'finance-row-actions';
    ['edit', 'delete'].forEach(action => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `button ${action === 'delete' ? 'button-danger' : 'button-secondary'}`;
      button.textContent = action === 'edit' ? 'Editar' : 'Excluir';
      button.dataset.recordAction = action; button.dataset.kind = kind; button.dataset.id = record.id;
      button.setAttribute('aria-label', `${button.textContent} ${kind === 'asset' ? 'ativo' : 'transação de'} ${record.name}`);
      button.disabled = busy;
      buttons.append(button);
    });
    actions.append(buttons); tr.append(actions); target.append(tr);
  }
  function renderAssetGroups(assets) {
    const container = $('#finance-asset-groups'); container.replaceChildren();
    const groups = new Map();
    for (const asset of assets) {
      const key = `${asset.owner}\u0000${asset.assetType}\u0000${asset.subType}`;
      if (!groups.has(key)) groups.set(key, { owner: asset.owner, assetType: asset.assetType, subType: asset.subType, assets: [] });
      groups.get(key).assets.push(asset);
    }
    for (const group of groups.values()) {
      const details = document.createElement('details'); details.className = 'finance-asset-group'; details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = `${group.owner} · ${types[group.assetType]} · ${subtypes[group.subType]} (${group.assets.length})`;
      const wrap = document.createElement('div'); wrap.className = 'finance-table-wrap';
      const table = document.createElement('table');
      const caption = document.createElement('caption'); caption.className = 'sr-only'; caption.textContent = `Ativos de ${group.owner}, ${types[group.assetType]}, ${subtypes[group.subType]}`;
      const head = document.createElement('thead'); head.innerHTML = '<tr><th>Sigla</th><th>Nome</th><th>Quantidade</th><th>Preço médio</th><th>Valor atual</th><th>Rendimento atual (R$)</th><th>DY atual (%)</th><th>DY médio (%)</th><th>Valor total</th><th>Ações</th></tr>';
      const body = document.createElement('tbody');
      for (const asset of group.assets) row(body, [asset.symbol || '—', asset.name, quantity(asset.quantity), money(asset.averagePrice), hasCurrentPrice(asset) ? money(asset.currentPrice) : '—', hasIncome(asset) ? incomeMoney(asset.currentIncome) : '—', hasIncome(asset) ? yieldPercent(asset.currentDy) : '—', hasIncome(asset) ? yieldPercent(asset.averageDy) : '—', money(asset.total)], 'asset', asset);
      table.append(caption, head, body); wrap.append(table); details.append(summary, wrap); container.append(details);
    }
  }
  function updateSubtypes(selection = assetForm.elements.subType.value) {
    const type = Number(assetForm.elements.assetType.value);
    const choices = SUBTYPES_BY_TYPE[type] || [];
    assetForm.elements.subType.replaceChildren(...choices.map(value => new Option(subtypes[value], value)));
    if (choices.includes(Number(selection))) assetForm.elements.subType.value = selection;
    $('#finance-subtype-field').hidden = type === 3;
    assetForm.elements.subType.disabled = busy || !data || type === 3;
    marketFields();
  }
  function marketFields() {
    const type = assetForm.elements.assetType.value;
    const classification = { assetType: Number(type), subType: Number(assetForm.elements.subType.value) };
    const visible = hasIncome(classification);
    const currentVisible = hasCurrentPrice(classification);
    const fixedIncome = type === '2';
    $('#finance-average-price-label').textContent = fixedIncome ? 'Valor de Compra (R$)' : 'Preço médio (R$)';
    $('#finance-current-price-hint').textContent = fixedIncome ? 'Opcional. Em branco, acompanha o valor de compra.' : 'Opcional. Em branco, acompanha o preço médio.';
    $('#finance-asset-total-hint').textContent = fixedIncome ? 'Calculado automaticamente: quantidade × valor de compra.' : 'Calculado automaticamente: quantidade × preço médio.';
    assetForm.querySelector('[data-current-price-field]').hidden = !currentVisible;
    assetForm.elements.currentPrice.disabled = !currentVisible || busy || !data;
    assetForm.querySelectorAll('[data-market-field]').forEach(label => {
      label.hidden = !visible;
      label.querySelector('input').disabled = !visible || busy || !data;
    });
    assetForm.elements.currentPrice.placeholder = assetForm.elements.averagePrice.value
      ? money(Number(assetForm.elements.averagePrice.value)) : fixedIncome ? 'Usar valor de compra' : 'Usar preço médio';
    const fields = assetForm.elements;
    const average = fields.quantity.value !== '' && Number(fields.quantity.value) === 0
      ? 0 : fields.averagePrice.value === '' ? NaN : Number(fields.averagePrice.value);
    const current = fields.currentPrice.value === '' ? average : Number(fields.currentPrice.value);
    const income = fields.currentIncome.value === '' ? 0 : Number(fields.currentIncome.value);
    const yields = calculateYields(income, current, average);
    fields.currentDy.value = yieldPercent(yields.currentDy);
    fields.averageDy.value = yieldPercent(yields.averageDy);
  }
  function renderAllocation() {
    const allocation = assetAllocation((data?.assets || []).filter(asset => !selectedOwner || asset.owner === selectedOwner));
    const colors = ['#c89b5b', '#71b6aa', '#879dd8'];
    const hasValue = allocation.some(item => item.amount > 0);
    $('#finance-pie-content').hidden = !hasValue;
    $('#finance-pie-empty').hidden = hasValue;
    const legend = $('#finance-pie-legend');
    legend.replaceChildren();
    const segments = [];
    let start = 0;
    const descriptions = [];
    allocation.forEach((item, index) => {
      const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(item.percent) + '%';
      const description = `${types[item.type]}: ${money(item.amount)} (${percent})`;
      descriptions.push(description);
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'finance-legend-filter';
      button.dataset.filterType = item.type;
      button.setAttribute('aria-pressed', String(selectedAssetType === item.type));
      button.setAttribute('aria-controls', 'finance-asset-groups finance-history');
      button.setAttribute('aria-label', `${selectedAssetType === item.type ? 'Remover filtro' : 'Filtrar listas por'} ${types[item.type]}. ${money(item.amount)}, ${percent}`);
      button.disabled = busy || !data;
      const swatch = document.createElement('span');
      swatch.className = 'finance-pie-swatch'; swatch.style.backgroundColor = colors[index]; swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = types[item.type];
      const amount = document.createElement('strong'); amount.textContent = `${money(item.amount)} · ${percent}`;
      button.append(swatch, label, amount); li.append(button); legend.append(li);
      if (item.percent > 0) {
        segments.push(`${colors[index]} ${start}% ${start + item.percent}%`);
        start += item.percent;
      }
    });
    $('#finance-pie').style.background = hasValue ? `conic-gradient(${segments.join(',')})` : '';
    $('#finance-pie').setAttribute('aria-label', hasValue ? descriptions.join('; ') : 'Sem valores para exibir');
  }
  function render() {
    renderAllocation();
    const ownerAssets = data.assets.filter(asset => !selectedOwner || asset.owner === selectedOwner);
    const ownerTransactions = data.transactions.filter(item => !selectedOwner || item.owner === selectedOwner);
    $('#finance-total').textContent = money(ownerAssets.reduce((sum, asset) => sum + Math.round(asset.total * 100), 0) / 100);
    $('#finance-count').textContent = ownerAssets.length;
    const assets = selectedAssetType === null ? ownerAssets : ownerAssets.filter(asset => asset.assetType === selectedAssetType);
    const transactions = selectedAssetType === null ? ownerTransactions : ownerTransactions.filter(item => item.assetType === selectedAssetType);
    const ownerLabel = selectedOwner || 'Todos os proprietários';
    $('#finance-filter-status').textContent = selectedAssetType === null
      ? `Proprietário: ${ownerLabel}. Exibindo todos os tipos de ativos.`
      : `Proprietário: ${ownerLabel}. Filtro: ${types[selectedAssetType]} — ${assets.length} ativo(s) e ${transactions.length} transação(ões).`;
    $('#finance-filter-clear').hidden = selectedAssetType === null;
    $('#finance-empty').textContent = selectedAssetType === null ? 'Nenhum ativo cadastrado. Comece em “Incluir ativo”.' : `Nenhum ativo do tipo ${types[selectedAssetType]}.`;
    $('#finance-history-empty').textContent = selectedAssetType === null ? 'Nenhuma transação registrada.' : `Nenhuma transação do tipo ${types[selectedAssetType]}.`;
    $('#finance-empty').hidden = assets.length > 0;
    $('#finance-history-empty').hidden = transactions.length > 0;
    $('#finance-asset-groups').replaceChildren();
    $('#finance-history').replaceChildren();
    renderAssetGroups(assets);
    updateTransactionAssets();
    [...transactions].reverse().forEach(item => row($('#finance-history'), [item.owner, formatTransactionDate(item.transactionDate), new Date(item.createdAt).toLocaleString('pt-BR'), item.name, types[item.assetType], subtypes[item.subType], quantity(item.quantity), money(item.value)], 'transaction', item));
  }
  async function request(action) {
    if (busy) return false;
    const token = ++generation;
    busy = true; controls(); message(action ? 'Salvando…' : 'Carregando dados…');
    try {
      const response = await fetch('/api/admin/finance', {
        method: action ? 'POST' : 'GET', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        ...(action ? { body: JSON.stringify(action) } : {})
      });
      const result = await response.json();
      if (token !== generation) return false;
      if (!response.ok) throw new Error(result.error || 'Não foi possível acessar Finanças.');
      data = result; render(); message(action ? 'Salvo com sucesso.' : 'Dados atualizados.');
      return true;
    } catch (error) {
      if (token === generation) message(error.message || 'Não foi possível acessar Finanças.', true);
      return false;
    } finally { if (token === generation) { busy = false; controls(); } }
  }
  function area(finance) {
    section.hidden = !finance;
    $('#admin-form').hidden = finance;
    $('#show-content').setAttribute('aria-pressed', String(!finance));
    $('#show-finance').setAttribute('aria-pressed', String(finance));
    if (finance && !data) request();
  }
  function updateRecordFooter(kind, record) {
    const footer = $(`#finance-${kind}-updated`);
    footer.replaceChildren();
    if (!record) { footer.textContent = 'Ainda não salvo'; return; }
    if (!record.updatedAt || !Number.isFinite(Date.parse(record.updatedAt))) {
      footer.textContent = 'Não disponível para este registro antigo'; return;
    }
    const time = document.createElement('time'); time.dateTime = record.updatedAt;
    time.textContent = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(new Date(record.updatedAt));
    footer.append(time);
  }
  function clearEdit(kind) {
    updateRecordFooter(kind, null);
    if (kind === 'asset') {
      editingAsset = null; assetForm.reset(); assetRequestId = crypto.randomUUID();
      assetForm.elements.quantity.readOnly = false; assetForm.elements.averagePrice.readOnly = false;
      $('#finance-asset-title').textContent = 'Incluir ativo';
      $('#finance-asset-edit-note').hidden = true; $('#finance-asset-cancel').hidden = true;
      assetForm.querySelector('[type="submit"]').textContent = 'Salvar ativo'; updateSubtypes();
    } else {
      editingTransaction = null; transactionForm.reset(); transactionForm.elements.transactionDate.value = todayInSaoPaulo(); transactionRequestId = crypto.randomUUID();
      $('#finance-transaction-title').textContent = 'Incluir transações'; $('#finance-transaction-cancel').hidden = true;
      transactionForm.querySelector('[type="submit"]').textContent = 'Salvar transação'; updateTransactionAssets();
    }
  }
  function editRecord(kind, record) {
    message('');
    if (kind === 'asset') {
      clearEdit(kind); editingAsset = { ...record };
      const fields = assetForm.elements;
      fields.owner.value = record.owner; fields.name.value = record.name; fields.symbol.value = record.symbol || ''; fields.assetType.value = record.assetType; updateSubtypes(record.subType);
      fields.quantity.value = record.quantity; fields.averagePrice.value = record.averagePrice;
      fields.currentPrice.value = record.priceIsDefault ? '' : record.currentPrice;
      fields.currentIncome.value = record.currentIncome;
      fields.quantity.readOnly = record.transactionCount > 0; fields.averagePrice.readOnly = record.transactionCount > 0;
      $('#finance-asset-edit-note').hidden = !record.transactionCount;
      $('#finance-asset-title').textContent = 'Editar ativo'; $('#finance-asset-cancel').hidden = false;
      assetForm.querySelector('[type="submit"]').textContent = 'Salvar alterações';
      fields.total.value = money(record.total); marketFields(); view('asset'); fields.name.focus();
    } else {
      clearEdit(kind); editingTransaction = { ...record };
      const fields = transactionForm.elements;
      fields.owner.value = record.owner; fields.assetType.value = record.assetType; updateTransactionAssets(record.assetId); fields.quantity.value = record.quantity;
      fields.transactionDate.value = record.transactionDate || '';
      fields.unitPrice.value = (record.value / record.quantity).toFixed(2);
      $('#finance-transaction-title').textContent = 'Editar transação'; $('#finance-transaction-cancel').hidden = false;
      transactionForm.querySelector('[type="submit"]').textContent = 'Salvar alterações';
      total(transactionForm, 'unitPrice', 'value'); view('transaction'); fields.quantity.focus();
      if (Math.round(Number(fields.unitPrice.value) * 100) * record.quantity !== Math.round(record.value * 100)) {
        message('O valor unitário deste registro antigo foi arredondado para duas casas. Confira o novo total antes de salvar.');
      }
    }
    updateRecordFooter(kind, record);
  }
  section.addEventListener('click', async event => {
    const button = event.target.closest('[data-record-action]');
    if (!button || busy || !data) return;
    const { kind, id, recordAction } = button.dataset;
    const record = (kind === 'asset' ? data.assets : data.transactions).find(item => item.id === id);
    if (!record) return;
    if (recordAction === 'edit') { editRecord(kind, record); return; }
    if (kind === 'asset' && record.transactionCount > 0) {
      message('Este ativo possui transações. Exclua primeiro as transações vinculadas no histórico.', true); return;
    }
    const detail = kind === 'asset' ? `Excluir o ativo “${record.name}”?` : `Excluir a transação de ${money(record.value)} de “${record.name}”? O saldo do ativo será recalculado.`;
    if (!window.confirm(`${detail} Esta ação não pode ser desfeita.`)) return;
    if (await request({ type: kind, operation: 'delete', id, revision: record.revision })) {
      clearEdit('asset'); clearEdit('transaction'); view('overview'); message('Registro excluído com sucesso.');
    }
  });
  $('#finance-asset-cancel').addEventListener('click', () => { clearEdit('asset'); view('overview'); message(''); });
  $('#finance-transaction-cancel').addEventListener('click', () => { clearEdit('transaction'); view('overview'); message(''); });
  $('#finance-pie-legend').addEventListener('click', event => {
    const button = event.target.closest('[data-filter-type]');
    if (!button || busy || !data) return;
    const type = Number(button.dataset.filterType);
    selectedAssetType = selectedAssetType === type ? null : type;
    render();
    // Renderizar a legenda recria os botões; preserva o foco para uso por teclado.
    $(`[data-filter-type="${type}"]`).focus();
  });
  $('#finance-filter-clear').addEventListener('click', () => {
    if (busy || !data) return;
    const previousType = selectedAssetType;
    selectedAssetType = null; render();
    if (previousType !== null) $(`[data-filter-type="${previousType}"]`)?.focus();
  });
  $('#finance-owner-filter').addEventListener('change', event => {
    if (busy || !data) return;
    selectedOwner = event.target.value; render();
  });
  $('#show-finance').addEventListener('click', () => area(true));
  $('#show-content').addEventListener('click', () => area(false));
  $('#finance-refresh').addEventListener('click', () => request());
  document.querySelectorAll('[data-finance-view]').forEach(button => button.addEventListener('click', () => { const target = button.dataset.financeView; if (target === 'asset' || target === 'transaction') clearEdit(target); view(target); }));
  function total(form, price, output = 'total') {
    const value = Number(form.elements.quantity.value) * Math.round(Number(form.elements[price].value) * 100) / 100;
    form.elements[output].value = Number.isFinite(value) ? money(value) : 'Valor inválido';
  }
  function transactionControls() {
    const fields = transactionForm.elements;
    const type = Number(fields.assetType.value);
    const choices = data?.assets.filter(asset => asset.assetType === type) || [];
    fields.assetId.disabled = busy || !data || choices.length === 0;
    transactionForm.querySelector('[type="submit"]').disabled = busy || !data || !choices.some(asset => asset.id === fields.assetId.value);
  }
  function updateTransactionAssets(selection = transactionForm.elements.assetId.value) {
    const fields = transactionForm.elements;
    const type = Number(fields.assetType.value);
    const choices = data?.assets.filter(asset => asset.assetType === type) || [];
    const placeholder = !type ? 'Selecione primeiro o tipo' : choices.length ? 'Selecione um ativo' : 'Nenhum ativo deste tipo';
    fields.assetId.replaceChildren(new Option(placeholder, ''));
    choices.forEach(asset => fields.assetId.add(new Option(`${asset.name} · ${subtypes[asset.subType]}`, asset.id)));
    fields.assetId.value = choices.some(asset => asset.id === selection) ? selection : '';
    $('#finance-transaction-asset-hint').textContent = !type ? 'Selecione primeiro o tipo de ativo.'
      : choices.length ? `Exibindo apenas ativos do tipo ${types[type]}.`
      : `Nenhum ativo do tipo ${types[type]} cadastrado. Cadastre um ativo ou escolha outro tipo.`;
    transactionControls();
  }
  assetForm.addEventListener('input', () => { assetRequestId = crypto.randomUUID(); if (editingAsset?.transactionCount) assetForm.elements.total.value = money(editingAsset.total); else total(assetForm, 'averagePrice'); marketFields(); });
  assetForm.elements.assetType.addEventListener('change', () => updateSubtypes(''));
  assetForm.elements.subType.addEventListener('change', marketFields);
  transactionForm.addEventListener('input', () => { transactionRequestId = crypto.randomUUID(); transactionControls(); total(transactionForm, 'unitPrice', 'value'); });
  transactionForm.elements.assetType.addEventListener('change', () => { transactionRequestId = crypto.randomUUID(); updateTransactionAssets(''); });
  transactionForm.elements.assetId.addEventListener('change', transactionControls);
  assetForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || busy) return;
    if (await request({ type: 'asset', operation: editingAsset ? 'update' : 'create', id: editingAsset?.id || assetRequestId, revision: editingAsset?.revision, owner: assetForm.elements.owner.value, assetType: Number(assetForm.elements.assetType.value), subType: Number(assetForm.elements.subType.value), name: assetForm.elements.name.value, symbol: assetForm.elements.symbol.value, quantity: Number(assetForm.elements.quantity.value), averagePrice: Number(assetForm.elements.averagePrice.value), currentPrice: assetForm.elements.currentPrice.value === '' ? null : Number(assetForm.elements.currentPrice.value), currentIncome: assetForm.elements.currentIncome.value === '' ? null : Number(assetForm.elements.currentIncome.value) })) {
      clearEdit('asset'); view('overview');
    }
  });
  transactionForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || busy) return;
    const fields = transactionForm.elements;
    if (await request({ type: 'transaction', operation: editingTransaction ? 'update' : 'create', id: editingTransaction?.id || transactionRequestId, revision: editingTransaction?.revision, owner: fields.owner.value, assetId: fields.assetId.value, transactionDate: fields.transactionDate.value, quantity: Number(fields.quantity.value), unitPrice: Number(fields.unitPrice.value) })) {
      clearEdit('transaction'); view('overview');
    }
  });
  $('#finance-asset-import-read').addEventListener('click', async () => {
    if (busy || !data) return;
    if (!assetImportForm.elements.owner.value) { message('Selecione quem é o proprietário dos ativos antes de ler o PDF.', true); assetImportForm.elements.owner.focus(); return; }
    const file = assetImportForm.elements.statement.files[0];
    const progress = $('#finance-asset-import-progress'); const bar = progress.querySelector('progress'); const label = progress.querySelector('span');
    try {
      busy = true; controls(); progress.hidden = false; bar.value = 0; label.textContent = 'Preparando leitura…'; message('');
      importedAssets = await readB3AssetsPdf(file, (value, text) => { bar.value = value; label.textContent = text; });
      renderAssetImport();
      if (!importedAssets.length) throw new Error('Nenhum ativo reconhecido. Confira se o PDF contém o extrato de posição da B3.');
    } catch (error) { importedAssets = []; renderAssetImport(); message(error.message || 'Não foi possível ler o PDF.', true); }
    finally { busy = false; controls(); }
  });
  $('#finance-asset-import-clear').addEventListener('click', () => { if (!busy) { clearAssetImport(); message(''); } });
  assetImportForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !data) return;
    const items = [...$('#finance-asset-import-items').rows].filter(tr => tr.querySelector('[data-field="selected"]').checked).map(tr => {
      const original = importedAssets[Number(tr.dataset.index)];
      const value = field => tr.querySelector(`[data-field="${field}"]`).value;
      return { ...original, id: crypto.randomUUID(), owner: assetImportForm.elements.owner.value, symbol: value('symbol').trim().toUpperCase(), name: value('name').trim(), quantity: Number(value('quantity')), currentPrice: Number(value('currentPrice')), total: Number(value('total')) };
    });
    if (!items.length) { message('Selecione ao menos um ativo para importar.', true); return; }
    if (new Set(items.map(item => `${item.symbol}\u0000${item.name}`)).size !== items.length) { message('Há ativos repetidos na seleção. Mantenha apenas uma linha para cada combinação de sigla e nome.', true); return; }
    if (await request({ type: 'asset-import', items })) { clearAssetImport(); view('overview'); message(`${items.length} ativo(s) importado(s) com sucesso.`); }
  });
  $('#logout-admin').addEventListener('click', () => {
    generation++; busy = false; data = null; selectedAssetType = null; selectedOwner = '';
    $('#finance-owner-filter').value = '';
    $('#finance-filter-status').textContent = 'Exibindo todos os tipos de ativos.';
    $('#finance-filter-clear').hidden = true;
    clearEdit('asset'); clearEdit('transaction');
    clearAssetImport();
    $('#finance-asset-groups').replaceChildren(); $('#finance-history').replaceChildren();
    transactionForm.elements.assetId.replaceChildren();
    $('#finance-total').textContent = '—'; $('#finance-count').textContent = '—';
    renderAllocation(); message(''); controls(); area(false); view('overview');
  });
  transactionForm.elements.transactionDate.value = todayInSaoPaulo();
  updateSubtypes();
  updateTransactionAssets();
  controls();
})();
