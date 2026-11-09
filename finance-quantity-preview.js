// Prévia compartilhada de quantidades e preços médios.
const formatQuantity = value => new Intl.NumberFormat('pt-BR').format(value);

export function confirmQuantityImport(options) { return confirmImportPreview(options); }
export function confirmAveragePriceImport(options) { return confirmImportPreview({ ...options, priceMode: true }); }

function confirmImportPreview({ owner, subtype, assets, updates, filename, priceMode = false, undefinedIds = new Set() }) {
  const field = priceMode ? 'averagePrice' : 'quantity';
  const format = priceMode ? value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) : formatQuantity;
  const delta = item => Math.round((item[field] - item.asset[field]) * (priceMode ? 100 : 1)) / (priceMode ? 100 : 1);
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.className = 'finance-quantity-dialog';
    dialog.setAttribute('aria-labelledby', 'finance-quantity-preview-title');
    dialog.setAttribute('aria-describedby', 'finance-quantity-preview-description');
    const header = document.createElement('header');
    const title = document.createElement('h2'); title.id = 'finance-quantity-preview-title'; title.textContent = priceMode ? 'Conferir preços médios' : 'Conferir quantidades';
    const context = document.createElement('p'); context.className = 'finance-quantity-context'; context.textContent = `${owner} · ${subtype} · ${filename}`;
    const changed = updates.filter(item => assets.find(asset => asset.id === item.id)[field] !== item[field]).length;
    const description = document.createElement('p'); description.id = 'finance-quantity-preview-description';
    description.textContent = `${updates.length} ativo(s) encontrado(s): ${changed} com alteração e ${updates.length - changed} sem alteração. ${assets.length - updates.length} sem correspondência serão mantidos.`;
    header.append(title, context, description);
    const scroll = document.createElement('div'); scroll.className = 'finance-quantity-preview-scroll'; scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', priceMode ? 'Preços médios encontrados no PDF' : 'Quantidades encontradas no PDF');
    const table = document.createElement('table');
    const caption = document.createElement('caption'); caption.className = 'sr-only'; caption.textContent = priceMode ? 'Comparação dos preços médios cadastrados com o PDF' : 'Comparação das quantidades atuais com o PDF';
    const head = document.createElement('thead'); const headings = document.createElement('tr');
    for (const label of ['Sigla', ...(owner === 'Todos' ? ['Proprietário'] : []), priceMode ? 'Preço médio cadastrado' : 'Atual', 'No PDF', 'Diferença']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; headings.append(th);
    }
    head.append(headings);
    const body = document.createElement('tbody');
    const rows = updates.map(item => ({ ...item, asset: assets.find(asset => asset.id === item.id) }));
    if (priceMode) for (const asset of assets) {
      if (!updates.some(item => item.id === asset.id)) rows.push({ asset, missing: true });
    }
    rows.sort((a, b) => Number(!b.missing && delta(b) !== 0) - Number(!a.missing && delta(a) !== 0) || a.asset.symbol.localeCompare(b.asset.symbol, 'pt-BR'));
    for (const item of rows) {
      const difference = item.missing ? 0 : delta(item);
      const row = document.createElement('tr');
      if (difference !== 0) row.className = 'finance-quantity-changed';
      const symbol = document.createElement('th'); symbol.scope = 'row'; symbol.textContent = item.asset.symbol; row.append(symbol);
      const values = [format(item.asset[field]), item.missing ? (undefinedIds.has(item.asset.id) ? 'Indefinido' : 'Não encontrado') : format(item[field]), item.missing ? 'Mantido' : difference === 0 ? 'Sem alteração' : `${difference > 0 ? '+' : '−'}${format(Math.abs(difference))}`];
      if (owner === 'Todos') values.unshift(item.asset.owner);
      for (const value of values) {
        const td = document.createElement('td'); td.textContent = value; row.append(td);
      }
      body.append(row);
    }
    table.append(caption, head, body); scroll.append(table);
    const footer = document.createElement('footer');
    const note = document.createElement('p'); note.textContent = priceMode ? 'Os preços médios encontrados serão substituídos pelos valores do PDF. Preços indefinidos ou não encontrados serão mantidos. As quantidades não serão alteradas.' : 'Ao importar, as quantidades serão substituídas pelos valores do PDF. Os preços serão mantidos.';
    const actions = document.createElement('div'); actions.className = 'finance-quantity-preview-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button button-secondary'; cancel.textContent = 'Cancelar'; cancel.autofocus = true;
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'button'; confirm.textContent = 'Confirmar importação';
    const finish = confirmed => {
      dialog.remove();
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus();
      resolve(confirmed);
    };
    cancel.addEventListener('click', () => dialog.close('cancel'));
    confirm.addEventListener('click', () => dialog.close('confirm'));
    dialog.addEventListener('close', () => finish(dialog.returnValue === 'confirm'), { once: true });
    actions.append(cancel, confirm); footer.append(note, actions); dialog.append(header, scroll, footer);
    document.body.append(dialog); dialog.showModal();
  });
}
