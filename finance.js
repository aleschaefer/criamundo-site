import { ASSET_TYPES as types, ASSET_SUBTYPES as subtypes, SUBTYPES_BY_TYPE, hasIncome, hasCurrentPrice } from './finance-types.mjs';
import { todayInSaoPaulo, formatTransactionDate } from './finance-date.mjs';
import { calculateYields } from './finance-yield.mjs';
import { assetAllocation } from './finance-allocation.mjs';
import { readB3AssetsPdf } from './finance-asset-import.js?v=5';
import { readRicoAveragePricesPdf } from './finance-average-price-import.js?v=4';
import { financeOverviewTotals } from './finance-overview.mjs?v=2';
import { fetchJsonWithTimeout } from './finance-http.mjs?v=1';
import { preferredSimilarAssets, similarSymbolKey, valuesForSimilarAssets } from './finance-similar-assets.mjs?v=1';

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
  const currentAssetTotal = asset => Math.round(Number(asset.quantity) * Number(asset.currentPrice) * 100) / 100;
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
  const undefinedAveragePriceAssetIds = new Set();
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
    section.querySelectorAll('[data-record-action], [data-finance-view], [data-filter-type], .finance-income-batch, .finance-current-price-batch, .finance-average-price-import, #finance-filter-clear, #finance-print-pdf, #finance-assets-delete, #finance-assets-select-all, .finance-asset-select').forEach(control => { control.disabled = busy || control.dataset.locked === 'true'; });
  }
  function view(name) {
    assetForm.hidden = name !== 'asset';
    transactionForm.hidden = name !== 'transaction';
    assetImportForm.hidden = name !== 'import-assets';
    $('#finance-assets-view').hidden = name !== 'assets';
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
        asset.owner === assetImportForm.elements.owner.value && ((asset.symbol === item.symbol && asset.name === item.name) ||
        (asset.name === item.name && asset.assetType === item.assetType && asset.subType === item.subType)));
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
    const ownerGroups = new Map();
    for (const asset of assets) {
      const key = `${asset.owner}\u0000${asset.assetType}\u0000${asset.subType}`;
      if (!groups.has(key)) groups.set(key, { owner: asset.owner, assetType: asset.assetType, subType: asset.subType, assets: [] });
      groups.get(key).assets.push(asset);
    }
    for (const owner of [...new Set(assets.map(asset => asset.owner))]) {
      const ownerDetails = document.createElement('details'); ownerDetails.className = 'finance-owner-group';
      const ownerSummary = document.createElement('summary');
      ownerSummary.textContent = `${owner} (${assets.filter(asset => asset.owner === owner).length} ativos)`;
      const ownerContent = document.createElement('div'); ownerContent.className = 'finance-owner-group-content';
      ownerDetails.append(ownerSummary, ownerContent); container.append(ownerDetails); ownerGroups.set(owner, ownerContent);
    }
    for (const group of groups.values()) {
      const details = document.createElement('details'); details.className = 'finance-asset-group';
      const summary = document.createElement('summary');
      const summaryLabel = document.createElement('span'); summaryLabel.textContent = `${types[group.assetType]} · ${subtypes[group.subType]} (${group.assets.length})`;
      summary.append(summaryLabel);
      if (group.assetType === 1 && [1, 2].includes(group.subType)) {
        const groupActions = document.createElement('span'); groupActions.className = 'finance-group-actions';
        const importPrices = document.createElement('button'); importPrices.type = 'button'; importPrices.className = 'button button-secondary finance-average-price-import'; importPrices.textContent = 'Importar preços médios';
        const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.pdf,application/pdf'; fileInput.hidden = true;
        importPrices.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (!busy) fileInput.click(); });
        fileInput.addEventListener('click', event => event.stopPropagation());
        fileInput.addEventListener('change', async event => {
          event.stopPropagation(); const file = fileInput.files?.[0]; if (!file || busy) return;
          busy = true; controls(); importPrices.textContent = 'Lendo PDF…';
          try {
            const recognized = await readRicoAveragePricesPdf(file);
            const bySymbol = new Map(recognized.filter(item => Number.isFinite(item.averagePrice)).map(item => [item.symbol, item.averagePrice]));
            const byAsset = valuesForSimilarAssets(group.assets, bySymbol);
            const updates = group.assets.filter(asset => byAsset.has(asset.id)).map(asset => ({ id: asset.id, revision: asset.revision, averagePrice: byAsset.get(asset.id) }));
            const undefinedFamilies = new Set(recognized.filter(item => item.undefined).map(item => similarSymbolKey(item.symbol)));
            group.assets.forEach(asset => {
              undefinedAveragePriceAssetIds.delete(asset.id);
              if (undefinedFamilies.has(similarSymbolKey(asset.symbol))) undefinedAveragePriceAssetIds.add(asset.id);
            });
            render();
            if (!updates.length) throw new Error(`Nenhum preço médio do PDF corresponde aos ativos de ${group.owner} · ${subtypes[group.subType]}.`);
            const undefinedCount = group.assets.filter(asset => undefinedAveragePriceAssetIds.has(asset.id)).length;
            const ignored = group.assets.length - updates.length;
            const question = `${updates.length} preço(s) médio(s) encontrado(s) para este agrupamento${ignored ? `; ${ignored} ativo(s) sem preço médio correspondente serão mantidos.` : '.'}${undefinedCount ? `\n${undefinedCount} ativo(s) com preço médio indefinido foram destacados em vermelho.` : ''}\n\nDeseja importar?`;
            if (!confirm(question)) { message('Importação de preços médios cancelada.'); return; }
            importPrices.textContent = `Salvando ${updates.length}…`;
            const { response, result } = await fetchJsonWithTimeout('/api/admin/finance', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ type: 'asset-average-price-batch', items: updates }) });
            if (!response.ok) throw new Error(result.error || 'Não foi possível salvar os preços médios.');
            data = result; render(); message(`${updates.length} preço(s) médio(s) importado(s) para ${group.owner} · ${subtypes[group.subType]}.`);
          } catch (error) { message(error.message || 'Não foi possível importar os preços médios.', true); }
          finally { fileInput.value = ''; busy = false; controls(); importPrices.textContent = 'Importar preços médios'; }
        });
        const fetchCurrentPrices = document.createElement('button'); fetchCurrentPrices.type = 'button'; fetchCurrentPrices.className = 'button button-secondary finance-current-price-batch'; fetchCurrentPrices.textContent = 'Importar preços atuais';
        fetchCurrentPrices.addEventListener('click', async event => {
          event.preventDefault(); event.stopPropagation();
          if (busy) return;
          busy = true; controls(); const pricesBySymbol = new Map(), failures = []; const category = group.subType === 1 ? 'stock' : 'fii'; const candidates = data.assets.filter(asset => asset.assetType === group.assetType && asset.subType === group.subType); const sources = preferredSimilarAssets(group.assets, candidates);
          try {
            let next = 0, completed = 0; fetchCurrentPrices.textContent = `Consultando preços 0/${sources.length}…`;
            const worker = async () => {
              while (next < sources.length) {
                const asset = sources[next++];
                try {
                  const { response, result } = await fetchJsonWithTimeout(`/api/admin/finance/current-price?symbol=${encodeURIComponent(asset.symbol)}&category=${category}`, { credentials: 'same-origin', cache: 'no-store' });
                  if (!response.ok) throw new Error(result.error || 'Consulta indisponível.');
                  pricesBySymbol.set(asset.symbol, Number(result.value));
                } catch { failures.push(asset.symbol || asset.name); }
                completed++; fetchCurrentPrices.textContent = `Consultando preços ${completed}/${sources.length}…`;
              }
            };
            await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker));
            const byAsset = valuesForSimilarAssets(group.assets, pricesBySymbol);
            const updates = group.assets.filter(asset => byAsset.has(asset.id)).map(asset => ({ id: asset.id, revision: asset.revision, currentPrice: byAsset.get(asset.id) }));
            if (updates.length) {
              fetchCurrentPrices.textContent = `Salvando ${updates.length}…`;
              const { response, result } = await fetchJsonWithTimeout('/api/admin/finance', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ type: 'asset-current-price-batch', items: updates }) });
              if (!response.ok) throw new Error(result.error || 'Não foi possível salvar os preços atuais.');
              data = result; render();
            }
            message(`${updates.length} preço(s) atual(is) atualizado(s)${failures.length ? `. Não encontrados: ${failures.join(', ')}.` : '.'}`, Boolean(failures.length));
          } catch (error) { message(error.message || 'Não foi possível atualizar os preços atuais.', true); }
          finally {
            busy = false;
            if (fetchCurrentPrices.isConnected) fetchCurrentPrices.textContent = 'Importar preços atuais';
            controls();
          }
        });
        const fetchAll = document.createElement('button'); fetchAll.type = 'button'; fetchAll.className = 'button button-secondary finance-income-batch'; fetchAll.textContent = 'Obter todos rendimentos';
        fetchAll.addEventListener('click', async event => {
          event.preventDefault(); event.stopPropagation();
          if (busy) return;
          busy = true; controls(); const incomesBySymbol = new Map(), failures = []; const category = group.subType === 1 ? 'stock' : 'fii'; const candidates = data.assets.filter(asset => asset.assetType === group.assetType && asset.subType === group.subType); const sources = preferredSimilarAssets(group.assets, candidates);
          try {
            let next = 0, completed = 0; fetchAll.textContent = `Consultando 0/${sources.length}…`;
            const worker = async () => {
              while (next < sources.length) {
                const asset = sources[next++];
                try {
                  const { response, result } = await fetchJsonWithTimeout(`/api/admin/finance/income?symbol=${encodeURIComponent(asset.symbol)}&category=${category}`, { credentials: 'same-origin', cache: 'no-store' });
                  if (!response.ok) throw new Error(result.error || 'Consulta indisponível.');
                  incomesBySymbol.set(asset.symbol, Number(result.value));
                } catch { failures.push(asset.symbol || asset.name); }
                completed++; fetchAll.textContent = `Consultando ${completed}/${sources.length}…`;
              }
            };
            await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker));
            const byAsset = valuesForSimilarAssets(group.assets, incomesBySymbol);
            const updates = group.assets.filter(asset => byAsset.has(asset.id)).map(asset => ({ id: asset.id, revision: asset.revision, currentIncome: byAsset.get(asset.id) }));
            if (updates.length) {
              fetchAll.textContent = `Salvando ${updates.length}…`;
              const { response, result } = await fetchJsonWithTimeout('/api/admin/finance', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ type: 'asset-income-batch', items: updates }) });
              if (!response.ok) throw new Error(result.error || 'Não foi possível salvar os rendimentos.');
              data = result; render();
            }
            message(`${updates.length} rendimento(s) atualizado(s)${failures.length ? `. Não encontrados: ${failures.join(', ')}.` : '.'}`, Boolean(failures.length));
          } catch (error) { message(error.message || 'Não foi possível atualizar os rendimentos.', true); }
          finally {
            busy = false;
            if (fetchAll.isConnected) fetchAll.textContent = 'Obter todos rendimentos';
            controls();
          }
        });
        groupActions.append(importPrices, fetchCurrentPrices, fetchAll, fileInput); summary.append(groupActions);
      }
      const wrap = document.createElement('div'); wrap.className = 'finance-table-wrap';
      const table = document.createElement('table');
      const caption = document.createElement('caption'); caption.className = 'sr-only'; caption.textContent = `Ativos de ${group.owner}, ${types[group.assetType]}, ${subtypes[group.subType]}`;
      const variable = group.assetType === 1;
      const fixed = group.assetType === 2;
      const headers = variable
        ? ['Sigla', 'Quantidade', 'Preço médio', 'Valor atual', 'Rendimento atual (R$)', 'DY atual (%)', 'DY médio (%)', 'Valor total', 'Ações']
        : fixed
          ? ['Sigla', 'Nome', 'Quantidade', 'Valor de compra', 'Valor atual', 'Data de entrada', 'Data de retirada', 'Valor total', 'Ações']
          : ['Sigla', 'Nome', 'Quantidade', 'Preço médio', 'Valor total', 'Ações'];
      const head = document.createElement('thead'); const headerRow = document.createElement('tr');
      for (const label of headers) { const th = document.createElement('th'); th.textContent = label; headerRow.append(th); }
      head.append(headerRow);
      const body = document.createElement('tbody');
      for (const asset of group.assets) {
        const values = variable
          ? [asset.symbol || '—', quantity(asset.quantity), money(asset.averagePrice), hasCurrentPrice(asset) ? money(asset.currentPrice) : '—', hasIncome(asset) ? incomeMoney(asset.currentIncome) : '—', hasIncome(asset) ? yieldPercent(asset.currentDy) : '—', hasIncome(asset) ? yieldPercent(asset.averageDy) : '—', money(currentAssetTotal(asset))]
          : fixed
            ? [asset.symbol || '—', asset.name, quantity(asset.quantity), money(asset.averagePrice), money(asset.currentPrice), formatTransactionDate(asset.entryDate), formatTransactionDate(asset.exitDate), money(currentAssetTotal(asset))]
            : [asset.symbol || '—', asset.name, quantity(asset.quantity), money(asset.averagePrice), money(asset.total)];
        row(body, values, 'asset', asset);
        if (undefinedAveragePriceAssetIds.has(asset.id)) {
          const averageCell = body.lastElementChild?.cells[2];
          if (averageCell) { averageCell.classList.add('finance-value-undefined'); averageCell.title = 'Preço médio indefinido no PDF importado'; }
        }
      }
      table.append(caption, head, body); wrap.append(table); details.append(summary, wrap); ownerGroups.get(group.owner).append(details);
    }
  }
  function renderAssetManagement(assets) {
    const container = $('#finance-assets-groups'); container.replaceChildren(); $('#finance-assets-empty').hidden = Boolean(assets.length);
    const groups = new Map();
    for (const asset of assets) {
      const key = `${asset.owner}\u0000${asset.assetType}\u0000${asset.subType}`;
      if (!groups.has(key)) groups.set(key, { owner: asset.owner, assetType: asset.assetType, subType: asset.subType, assets: [] });
      groups.get(key).assets.push(asset);
    }
    for (const group of groups.values()) {
      const details = document.createElement('details'); details.className = 'finance-asset-group'; details.open = true;
      const summary = document.createElement('summary'); summary.textContent = `${group.owner} · ${types[group.assetType]} · ${subtypes[group.subType]} (${group.assets.length})`;
      const wrap = document.createElement('div'); wrap.className = 'finance-table-wrap'; const table = document.createElement('table');
      const head = document.createElement('thead'); const header = document.createElement('tr');
      const managementHeaders = group.assetType === 2
        ? ['Selecionar', 'Sigla', 'Nome', 'Quantidade', 'Valor de compra', 'Data de entrada', 'Data de retirada', 'Valor total']
        : ['Selecionar', 'Sigla', 'Nome', 'Quantidade', 'Preço médio', 'Valor total'];
      for (const label of managementHeaders) { const th = document.createElement('th'); th.textContent = label; header.append(th); }
      head.append(header); const body = document.createElement('tbody');
      for (const asset of group.assets) {
        const tr = document.createElement('tr'); const selectCell = document.createElement('td'); const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.className = 'finance-asset-select'; checkbox.dataset.id = asset.id; checkbox.dataset.revision = asset.revision;
        checkbox.dataset.locked = String(asset.transactionCount > 0); checkbox.disabled = busy || asset.transactionCount > 0;
        checkbox.setAttribute('aria-label', asset.transactionCount ? `${asset.symbol}: possui transações e não pode ser excluído` : `Selecionar ${asset.symbol} para exclusão`);
        if (asset.transactionCount) checkbox.title = 'Exclua primeiro as transações vinculadas.';
        selectCell.append(checkbox); tr.append(selectCell);
        const managementValues = group.assetType === 2
          ? [asset.symbol || '—', asset.name, quantity(asset.quantity), money(asset.averagePrice), formatTransactionDate(asset.entryDate), formatTransactionDate(asset.exitDate), money(asset.total)]
          : [asset.symbol || '—', asset.name, quantity(asset.quantity), money(asset.averagePrice), money(asset.total)];
        for (const value of managementValues) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
        body.append(tr);
      }
      table.append(head, body); wrap.append(table); details.append(summary, wrap); container.append(details);
    }
    updateAssetSelectAllState();
  }
  function updateAssetSelectAllState() {
    const master = $('#finance-assets-select-all');
    const eligible = [...document.querySelectorAll('.finance-asset-select[data-locked="false"]')];
    const selected = eligible.filter(input => input.checked).length;
    master.checked = Boolean(eligible.length) && selected === eligible.length;
    master.indeterminate = selected > 0 && selected < eligible.length;
    master.dataset.locked = String(!eligible.length);
    master.disabled = busy || !eligible.length;
  }
  function inlineField(label, name, value, options = {}) {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    let input;
    if (options.choices) {
      input = document.createElement('select');
      for (const [choiceValue, choiceLabel] of options.choices) input.add(new Option(choiceLabel, choiceValue));
    } else {
      input = document.createElement('input'); input.type = options.type || 'text';
      for (const [key, item] of Object.entries(options.attributes || {})) input.setAttribute(key, item);
    }
    input.name = name; input.value = value ?? ''; wrapper.append(input); return wrapper;
  }
  function startInlineAssetEdit(record, sourceRow) {
    const td = document.createElement('td'); td.colSpan = sourceRow.children.length; const form = document.createElement('form'); form.className = 'finance-inline-edit';
    const typeChoices = Object.entries(types); const ownerChoices = [['Ale', 'Ale'], ['Ana', 'Ana']];
    const owner = inlineField('Proprietário', 'owner', record.owner, { choices: ownerChoices });
    const type = inlineField('Tipo', 'assetType', record.assetType, { choices: typeChoices });
    const subtype = inlineField('Subtipo', 'subType', record.subType, { choices: (SUBTYPES_BY_TYPE[record.assetType] || []).map(value => [value, subtypes[value]]) });
    const name = inlineField('Nome', 'name', record.name, { attributes: { maxlength: '30', required: '' } });
    const symbol = inlineField('Sigla', 'symbol', record.symbol, { attributes: { maxlength: '7', required: '' } });
    const amount = inlineField('Quantidade', 'quantity', record.quantity, { type: 'number', attributes: { min: '0', step: '1', required: '' } });
    const average = inlineField('Preço médio / Valor de compra', 'averagePrice', record.averagePrice, { type: 'number', attributes: { min: '0', step: '0.01', required: '' } });
    const current = inlineField('Valor atual', 'currentPrice', record.priceIsDefault ? '' : record.currentPrice, { type: 'number', attributes: { min: '0', step: '0.01' } });
    const income = inlineField('Rendimento atual', 'currentIncome', record.currentIncome, { type: 'number', attributes: { min: '0', step: '0.00001' } });
    const entryDate = inlineField('Data de entrada', 'entryDate', record.entryDate, { type: 'date' });
    const exitDate = inlineField('Data de retirada', 'exitDate', record.exitDate, { type: 'date' });
    const fetchIncome = document.createElement('button'); fetchIncome.type = 'button'; fetchIncome.className = 'button button-secondary finance-income-fetch'; fetchIncome.textContent = 'Obter rendimento';
    const incomeResult = document.createElement('small'); incomeResult.className = 'finance-income-result'; incomeResult.setAttribute('role', 'status'); incomeResult.setAttribute('aria-live', 'polite');
    income.append(fetchIncome, incomeResult);
    const fields = document.createElement('div'); fields.className = 'finance-inline-fields'; fields.append(owner, type, subtype, name, symbol, amount, average, current, income, entryDate, exitDate);
    const actions = document.createElement('div'); actions.className = 'finance-row-actions';
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'button button-primary'; save.textContent = 'Salvar';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button button-secondary'; cancel.textContent = 'Cancelar';
    actions.append(save, cancel); form.append(fields, actions); td.append(form); sourceRow.replaceChildren(td);
    const updateInlineFields = () => {
      const selectedType = Number(form.elements.assetType.value); const choices = SUBTYPES_BY_TYPE[selectedType] || [];
      const previous = Number(form.elements.subType.value); form.elements.subType.replaceChildren(...choices.map(value => new Option(subtypes[value], value)));
      form.elements.subType.value = choices.includes(previous) ? previous : choices[0];
      const classification = { assetType: selectedType, subType: Number(form.elements.subType.value) };
      current.hidden = !hasCurrentPrice(classification); income.hidden = !hasIncome(classification);
      entryDate.hidden = selectedType !== 2; exitDate.hidden = selectedType !== 2;
      fetchIncome.hidden = !(selectedType === 1 && [1, 2].includes(classification.subType));
    };
    type.querySelector('select').addEventListener('change', updateInlineFields); subtype.querySelector('select').addEventListener('change', updateInlineFields); updateInlineFields();
    if (record.transactionCount) { form.elements.quantity.readOnly = true; form.elements.averagePrice.readOnly = true; }
    fetchIncome.addEventListener('click', async () => {
      const ticker = form.elements.symbol.value.trim().toUpperCase();
      if (!ticker) { incomeResult.textContent = 'Informe a sigla do ativo.'; return; }
      const category = Number(form.elements.subType.value) === 1 ? 'stock' : 'fii';
      fetchIncome.disabled = true; incomeResult.textContent = 'Consultando Status Invest…';
      try {
        const { response, result } = await fetchJsonWithTimeout(`/api/admin/finance/income?symbol=${encodeURIComponent(ticker)}&category=${category}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error(result.error || 'Consulta indisponível.');
        form.elements.currentIncome.value = Number(result.value).toFixed(5);
        incomeResult.textContent = `${result.source}: ${money(result.value)} por cota. Clique em Salvar para confirmar.`;
      } catch (error) { incomeResult.textContent = error.message || 'Não foi possível obter o rendimento.'; }
      finally { fetchIncome.disabled = false; }
    });
    cancel.addEventListener('click', () => render());
    form.addEventListener('submit', async event => {
      event.preventDefault(); const f = form.elements;
      const ok = await request({ type: 'asset', operation: 'update', id: record.id, revision: record.revision, owner: f.owner.value, assetType: Number(f.assetType.value), subType: Number(f.subType.value), name: f.name.value, symbol: f.symbol.value, quantity: Number(f.quantity.value), averagePrice: Number(f.averagePrice.value), currentPrice: f.currentPrice.value === '' ? null : Number(f.currentPrice.value), currentIncome: f.currentIncome.value === '' ? null : Number(f.currentIncome.value), entryDate: f.entryDate.value || null, exitDate: f.exitDate.value || null });
      if (ok) message('Ativo atualizado com sucesso.');
    });
    form.elements.name.focus();
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
    assetForm.querySelectorAll('[data-fixed-date-field]').forEach(label => {
      label.hidden = !fixedIncome;
      label.querySelector('input').disabled = !fixedIncome || busy || !data;
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
    const overviewTotals = financeOverviewTotals(ownerAssets);
    $('#finance-total').textContent = money(overviewTotals.currentValue);
    $('#finance-total-breakdown').textContent = `(Ações: ${money(overviewTotals.currentByCategory.stocks)} - FIIs: ${money(overviewTotals.currentByCategory.fiis)} - Renda Fixa: ${money(overviewTotals.currentByCategory.fixed)} - Outros: ${money(overviewTotals.currentByCategory.others)})`;
    $('#finance-average-total').textContent = money(overviewTotals.averageValue);
    $('#finance-average-breakdown').textContent = `(Ações: ${money(overviewTotals.averageByCategory.stocks)} - FIIs: ${money(overviewTotals.averageByCategory.fiis)} - Renda Fixa: ${money(overviewTotals.averageByCategory.fixed)} - Outros: ${money(overviewTotals.averageByCategory.others)})`;
    $('#finance-income-total').textContent = money(overviewTotals.monthlyIncome);
    $('#finance-income-breakdown').textContent = `(Ações: ${money(overviewTotals.stockMonthlyIncome)} - FIIs: ${money(overviewTotals.fiiMonthlyIncome)})`;
    $('#finance-count').textContent = ownerAssets.length;
    $('#finance-count-breakdown').textContent = `(Ações: ${overviewTotals.countByCategory.stocks} - FIIs: ${overviewTotals.countByCategory.fiis} - Renda Fixa: ${overviewTotals.countByCategory.fixed})`;
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
    renderAssetManagement(data.assets);
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
  function editRecord(kind, record, sourceRow) {
    message('');
    if (kind === 'asset') { startInlineAssetEdit(record, sourceRow); return; }
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
    if (recordAction === 'edit') { editRecord(kind, record, button.closest('tr')); return; }
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
  $('#finance-print-pdf').addEventListener('click', () => {
    if (busy || !data) return;
    const previousType = selectedAssetType;
    const openGroups = [...$('#finance-asset-groups').querySelectorAll('details')].map(details => details.open);
    selectedAssetType = null;
    render();
    const printableGroups = [...$('#finance-asset-groups').querySelectorAll('details')];
    printableGroups.forEach(details => { details.open = true; });
    document.body.classList.add('finance-printing');
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true; document.body.classList.remove('finance-printing'); selectedAssetType = previousType; render();
      [...$('#finance-asset-groups').querySelectorAll('details')].forEach((details, index) => { details.open = openGroups[index] ?? true; });
    };
    window.addEventListener('afterprint', restore, { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => { window.print(); setTimeout(restore, 1000); }));
  });
  $('#finance-assets-delete').addEventListener('click', async () => {
    if (busy || !data) return;
    const items = [...document.querySelectorAll('.finance-asset-select:checked')].map(input => ({ id: input.dataset.id, revision: Number(input.dataset.revision) }));
    if (!items.length) { message('Selecione ao menos um ativo para excluir.', true); return; }
    if (!confirm(`Excluir ${items.length} ativo(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return;
    if (await request({ type: 'asset-delete-batch', items })) { view('assets'); message(`${items.length} ativo(s) excluído(s) com sucesso.`); }
  });
  $('#finance-assets-select-all').addEventListener('change', event => {
    document.querySelectorAll('.finance-asset-select[data-locked="false"]').forEach(input => { input.checked = event.target.checked; });
    updateAssetSelectAllState();
  });
  $('#finance-assets-groups').addEventListener('change', event => {
    if (event.target.matches('.finance-asset-select')) updateAssetSelectAllState();
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
    if (await request({ type: 'asset', operation: editingAsset ? 'update' : 'create', id: editingAsset?.id || assetRequestId, revision: editingAsset?.revision, owner: assetForm.elements.owner.value, assetType: Number(assetForm.elements.assetType.value), subType: Number(assetForm.elements.subType.value), name: assetForm.elements.name.value, symbol: assetForm.elements.symbol.value, quantity: Number(assetForm.elements.quantity.value), averagePrice: Number(assetForm.elements.averagePrice.value), currentPrice: assetForm.elements.currentPrice.value === '' ? null : Number(assetForm.elements.currentPrice.value), currentIncome: assetForm.elements.currentIncome.value === '' ? null : Number(assetForm.elements.currentIncome.value), entryDate: assetForm.elements.entryDate.value || null, exitDate: assetForm.elements.exitDate.value || null })) {
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
    undefinedAveragePriceAssetIds.clear();
    $('#finance-owner-filter').value = '';
    $('#finance-filter-status').textContent = 'Exibindo todos os tipos de ativos.';
    $('#finance-filter-clear').hidden = true;
    clearEdit('asset'); clearEdit('transaction');
    clearAssetImport();
    $('#finance-asset-groups').replaceChildren(); $('#finance-assets-groups').replaceChildren(); $('#finance-history').replaceChildren();
    transactionForm.elements.assetId.replaceChildren();
    $('#finance-total').textContent = '—'; $('#finance-average-total').textContent = '—'; $('#finance-income-total').textContent = '—'; $('#finance-count').textContent = '—';
    renderAllocation(); message(''); controls(); area(false); view('overview');
  });
  transactionForm.elements.transactionDate.value = todayInSaoPaulo();
  updateSubtypes();
  updateTransactionAssets();
  controls();
})();
