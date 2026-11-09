const formatQuantity = value => new Intl.NumberFormat('pt-BR').format(value);

export function confirmQuantityImport({ owner, subtype, assets, updates, filename }) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.className = 'finance-quantity-dialog';
    dialog.setAttribute('aria-labelledby', 'finance-quantity-preview-title');
    dialog.setAttribute('aria-describedby', 'finance-quantity-preview-description');
    const header = document.createElement('header');
    const title = document.createElement('h2'); title.id = 'finance-quantity-preview-title'; title.textContent = 'Conferir quantidades';
    const context = document.createElement('p'); context.className = 'finance-quantity-context'; context.textContent = `${owner} · ${subtype} · ${filename}`;
    const changed = updates.filter(item => assets.find(asset => asset.id === item.id).quantity !== item.quantity).length;
    const description = document.createElement('p'); description.id = 'finance-quantity-preview-description';
    description.textContent = `${updates.length} ativo(s) encontrado(s): ${changed} com alteração e ${updates.length - changed} sem alteração. ${assets.length - updates.length} sem correspondência serão mantidos.`;
    header.append(title, context, description);
    const scroll = document.createElement('div'); scroll.className = 'finance-quantity-preview-scroll'; scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Quantidades encontradas no PDF');
    const table = document.createElement('table');
    const caption = document.createElement('caption'); caption.className = 'sr-only'; caption.textContent = 'Comparação das quantidades atuais com o PDF';
    const head = document.createElement('thead'); const headings = document.createElement('tr');
    for (const label of ['Sigla', 'Atual', 'No PDF', 'Diferença']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; headings.append(th);
    }
    head.append(headings);
    const body = document.createElement('tbody');
    const rows = updates.map(item => ({ ...item, asset: assets.find(asset => asset.id === item.id) }));
    rows.sort((a, b) => Number(b.quantity !== b.asset.quantity) - Number(a.quantity !== a.asset.quantity) || a.asset.symbol.localeCompare(b.asset.symbol, 'pt-BR'));
    for (const item of rows) {
      const difference = item.quantity - item.asset.quantity;
      const row = document.createElement('tr');
      if (difference !== 0) row.className = 'finance-quantity-changed';
      const symbol = document.createElement('th'); symbol.scope = 'row'; symbol.textContent = item.asset.symbol; row.append(symbol);
      for (const value of [formatQuantity(item.asset.quantity), formatQuantity(item.quantity), difference === 0 ? 'Sem alteração' : `${difference > 0 ? '+' : '−'}${formatQuantity(Math.abs(difference))}`]) {
        const td = document.createElement('td'); td.textContent = value; row.append(td);
      }
      body.append(row);
    }
    table.append(caption, head, body); scroll.append(table);
    const footer = document.createElement('footer');
    const note = document.createElement('p'); note.textContent = 'Ao importar, as quantidades serão substituídas pelos valores do PDF. Os preços serão mantidos.';
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
