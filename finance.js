import { calculateYields } from './finance-yield.mjs';
import { assetAllocation } from './finance-allocation.mjs';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const section = $('#finance-section');
  const assetForm = $('#finance-asset');
  const transactionForm = $('#finance-transaction');
  const status = $('#finance-status');
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const yieldPercent = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(value) + '%' : '—';
  const incomeMoney = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(value);
  const quantity = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
  const types = { 1: 'Ação', 2: 'FII', 3: 'Renda Fixa', 4: 'BDR', 5: 'Outro' };
  let assetRequestId = crypto.randomUUID();
  let transactionRequestId = crypto.randomUUID();
  let editingAsset = null;
  let editingTransaction = null;
  let data = null;
  let busy = false;
  let generation = 0;
  function message(text, error = false) {
    status.textContent = text;
    status.className = `save-status${error ? ' is-error' : ''}`;
  }
  function controls() {
    [assetForm, transactionForm].forEach(form => {
      for (const input of form.elements) input.disabled = busy || !data;
    });
    marketFields();
    transactionForm.querySelector('button').disabled = busy || !data?.assets.length;
    $('#finance-refresh').disabled = busy;
    section.querySelectorAll('[data-record-action], [data-finance-view]').forEach(button => { button.disabled = busy; });
  }
  function view(name) {
    assetForm.hidden = name !== 'asset';
    transactionForm.hidden = name !== 'transaction';
    $('#finance-overview').hidden = name !== 'overview';
    document.querySelectorAll('[data-finance-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.financeView === name)));
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
  function marketFields() {
    const visible = ['1', '2'].includes(assetForm.elements.assetType.value);
    assetForm.querySelectorAll('[data-market-field]').forEach(label => {
      label.hidden = !visible;
      label.querySelector('input').disabled = !visible || busy || !data;
    });
    assetForm.elements.currentPrice.placeholder = assetForm.elements.averagePrice.value
      ? money(Number(assetForm.elements.averagePrice.value)) : 'Usar preço médio';
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
    const allocation = assetAllocation(data?.assets || []);
    const colors = ['#c89b5b', '#71b6aa', '#879dd8', '#bf8cc9', '#d98772'];
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
      const swatch = document.createElement('span');
      swatch.className = 'finance-pie-swatch'; swatch.style.backgroundColor = colors[index]; swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = types[item.type];
      const amount = document.createElement('strong'); amount.textContent = `${money(item.amount)} · ${percent}`;
      li.append(swatch, label, amount); legend.append(li);
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
    $('#finance-total').textContent = money(data.total);
    $('#finance-count').textContent = data.assets.length;
    $('#finance-empty').textContent = 'Nenhum ativo cadastrado. Comece em “Incluir ativo”.';
    $('#finance-empty').hidden = data.assets.length > 0;
    $('#finance-history-empty').hidden = data.transactions.length > 0;
    $('#finance-assets').replaceChildren();
    $('#finance-history').replaceChildren();
    const selection = transactionForm.elements.assetId.value;
    transactionForm.elements.assetId.replaceChildren(new Option(data.assets.length ? 'Selecione um ativo' : 'Cadastre um ativo primeiro', ''));
    data.assets.forEach(asset => {
      row($('#finance-assets'), [asset.name, types[asset.assetType], quantity(asset.quantity), money(asset.averagePrice), [1, 2].includes(asset.assetType) ? money(asset.currentPrice) : '—', [1, 2].includes(asset.assetType) ? incomeMoney(asset.currentIncome) : '—', [1, 2].includes(asset.assetType) ? yieldPercent(asset.currentDy) : '—', [1, 2].includes(asset.assetType) ? yieldPercent(asset.averageDy) : '—', money(asset.total)], 'asset', asset);
      transactionForm.elements.assetId.add(new Option(`${asset.name} · ${types[asset.assetType]}`, asset.id));
    });
    transactionForm.elements.assetId.value = selection;
    updateType();
    [...data.transactions].reverse().forEach(item => row($('#finance-history'), [new Date(item.createdAt).toLocaleString('pt-BR'), item.name, types[item.assetType], quantity(item.quantity), money(item.value)], 'transaction', item));
  }
  async function request(action) {
    if (busy) return false;
    const token = ++generation;
    busy = true; controls(); message(action ? 'Salvando…' : 'Carregando dados…');
    try {
      const response = await fetch('/api/admin/finance', {
        method: action ? 'POST' : 'GET', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': getStoredAdminPassword() },
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
  function clearEdit(kind) {
    if (kind === 'asset') {
      editingAsset = null; assetForm.reset(); assetRequestId = crypto.randomUUID();
      assetForm.elements.quantity.readOnly = false; assetForm.elements.averagePrice.readOnly = false;
      $('#finance-asset-title').textContent = 'Incluir ativo';
      $('#finance-asset-edit-note').hidden = true; $('#finance-asset-cancel').hidden = true;
      assetForm.querySelector('[type="submit"]').textContent = 'Salvar ativo'; marketFields();
    } else {
      editingTransaction = null; transactionForm.reset(); transactionRequestId = crypto.randomUUID();
      $('#finance-transaction-title').textContent = 'Incluir transações'; $('#finance-transaction-cancel').hidden = true;
      transactionForm.querySelector('[type="submit"]').textContent = 'Salvar transação'; updateType();
    }
  }
  function editRecord(kind, record) {
    message('');
    if (kind === 'asset') {
      clearEdit(kind); editingAsset = { ...record };
      const fields = assetForm.elements;
      fields.name.value = record.name; fields.assetType.value = record.assetType;
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
      fields.assetId.value = record.assetId; fields.quantity.value = record.quantity;
      fields.unitPrice.value = (record.value / record.quantity).toFixed(2);
      $('#finance-transaction-title').textContent = 'Editar transação'; $('#finance-transaction-cancel').hidden = false;
      transactionForm.querySelector('[type="submit"]').textContent = 'Salvar alterações';
      updateType(); total(transactionForm, 'unitPrice', 'value'); view('transaction'); fields.quantity.focus();
      if (Math.round(Number(fields.unitPrice.value) * 100) * record.quantity !== Math.round(record.value * 100)) {
        message('O valor unitário deste registro antigo foi arredondado para duas casas. Confira o novo total antes de salvar.');
      }
    }
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
  $('#show-finance').addEventListener('click', () => area(true));
  $('#show-content').addEventListener('click', () => area(false));
  $('#finance-refresh').addEventListener('click', () => request());
  document.querySelectorAll('[data-finance-view]').forEach(button => button.addEventListener('click', () => { const target = button.dataset.financeView; if (target !== 'overview') clearEdit(target); view(target); }));
  function total(form, price, output = 'total') {
    const value = Number(form.elements.quantity.value) * Math.round(Number(form.elements[price].value) * 100) / 100;
    form.elements[output].value = Number.isFinite(value) ? money(value) : 'Valor inválido';
  }
  function updateType() {
    const asset = data?.assets.find(item => item.id === transactionForm.elements.assetId.value);
    transactionForm.elements.assetTypeLabel.value = asset ? types[asset.assetType] : '';
  }
  assetForm.addEventListener('input', () => { assetRequestId = crypto.randomUUID(); if (editingAsset?.transactionCount) assetForm.elements.total.value = money(editingAsset.total); else total(assetForm, 'averagePrice'); marketFields(); });
  assetForm.elements.assetType.addEventListener('change', marketFields);
  transactionForm.addEventListener('input', () => { transactionRequestId = crypto.randomUUID(); updateType(); total(transactionForm, 'unitPrice', 'value'); });
  transactionForm.elements.assetId.addEventListener('change', updateType);
  assetForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || busy) return;
    if (await request({ type: 'asset', operation: editingAsset ? 'update' : 'create', id: editingAsset?.id || assetRequestId, revision: editingAsset?.revision, assetType: Number(assetForm.elements.assetType.value), name: assetForm.elements.name.value, quantity: Number(assetForm.elements.quantity.value), averagePrice: Number(assetForm.elements.averagePrice.value), currentPrice: assetForm.elements.currentPrice.value === '' ? null : Number(assetForm.elements.currentPrice.value), currentIncome: assetForm.elements.currentIncome.value === '' ? null : Number(assetForm.elements.currentIncome.value) })) {
      clearEdit('asset'); view('overview');
    }
  });
  transactionForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!data || busy) return;
    const fields = transactionForm.elements;
    if (await request({ type: 'transaction', operation: editingTransaction ? 'update' : 'create', id: editingTransaction?.id || transactionRequestId, revision: editingTransaction?.revision, assetId: fields.assetId.value, quantity: Number(fields.quantity.value), unitPrice: Number(fields.unitPrice.value) })) {
      clearEdit('transaction'); view('overview');
    }
  });
  $('#logout-admin').addEventListener('click', () => {
    generation++; busy = false; data = null;
    clearEdit('asset'); clearEdit('transaction');
    $('#finance-assets').replaceChildren(); $('#finance-history').replaceChildren();
    transactionForm.elements.assetId.replaceChildren();
    $('#finance-total').textContent = '—'; $('#finance-count').textContent = '—';
    renderAllocation(); message(''); controls(); area(false); view('overview');
  });
  controls();
})();
