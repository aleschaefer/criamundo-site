import { loadGoogleIdentity, authorizeGoogle } from './reminders-google-client.mjs?v=2';
import { todayInSaoPaulo, formatTransactionDate } from './finance-date.mjs';

(()=>{
  const $=selector=>document.querySelector(selector),section=$('#reminders-section');
  const views={calendar:$('#reminder-calendar-form'),category:$('#reminder-category-form'),reminder:$('#reminder-form'),reminders:$('#reminders-list-view'),categories:$('#reminder-categories-view'),alerts:$('#reminder-alerts-form')};
  let googleClientId="",googleReady=false,data=null,busy=false,categoryId=crypto.randomUUID(),reminderId=crypto.randomUUID(),editingCategory=null,editingReminder=null;
  const status=(text,error=false)=>{const node=$('#reminders-status');node.textContent=text;node.className=`save-status${error?' is-error':''}`;};
  function view(name){if(name==='calendar')prepareGoogle();Object.entries(views).forEach(([key,node])=>{node.hidden=key!==name;});document.querySelectorAll('[data-reminders-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.remindersView===name)));}
  const reminderDate=item=>item.resolutionDate?formatTransactionDate(item.resolutionDate):'Sem data definida';
  function syncDateRequired(){views.reminder.elements.resolutionDate.required=!views.reminder.elements.noDateDefined.checked;}
  views.reminder.elements.noDateDefined.addEventListener('change',syncDateRequired);
  function controls(){syncDateRequired();section.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=busy;});const noCategories=!data?.categories.length;views.reminder.elements.categoryId.disabled=busy||noCategories;views.reminder.querySelector('[type=submit]').disabled=busy||noCategories;views.alerts.querySelector('[type=submit]').disabled=busy||!data?.reminders.length;}
  function actionCell(kind,item){const td=document.createElement('td'),wrap=document.createElement('div');wrap.className='finance-row-actions';for(const action of ['edit','delete']){const button=document.createElement('button');button.type='button';button.className=`button ${action==='delete'?'button-danger':'button-secondary'}`;button.textContent=action==='edit'?'Editar':'Excluir';button.dataset.reminderAction=action;button.dataset.kind=kind;button.dataset.id=item.id;wrap.append(button);}td.append(wrap);return td;}
  const normalizeTitle=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function filterReminderTitles(){
    const query=normalizeTitle($('#reminder-title-search').value.trim());
    let visible=0;
    for(const row of $('#reminders-list').rows){
      row.hidden=!normalizeTitle(row.cells[0].textContent).includes(query);
      if(!row.hidden)visible++;
    }
    const empty=$('#reminders-empty');empty.hidden=visible>0;
    empty.textContent=data?.reminders.length?'Nenhum lembrete encontrado para este título.':'Nenhum lembrete cadastrado.';
  }
  $('#reminder-title-search').addEventListener('input',filterReminderTitles);
  function render(){
    const select=views.reminder.elements.categoryId,current=select.value;select.replaceChildren(new Option(data.categories.length?'Selecione uma categoria':'Inclua uma categoria primeiro',''));data.categories.forEach(item=>select.add(new Option(item.name,item.id)));select.value=data.categories.some(item=>item.id===current)?current:'';
    $('#reminder-categories-empty').hidden=Boolean(data.categories.length);const categories=$('#reminder-categories-list');categories.replaceChildren();data.categories.forEach(item=>{const tr=document.createElement('tr'),name=document.createElement('td');name.textContent=item.name;tr.append(name,actionCell('category',item));categories.append(tr);});
    $('#reminders-empty').hidden=Boolean(data.reminders.length);
    const reminders=$('#reminders-list');reminders.replaceChildren();
    data.reminders.forEach(item=>{
      const tr=document.createElement('tr'),title=document.createElement('td'),description=document.createElement('td');
      title.textContent=item.title;
      const characters=[...item.description];
      description.textContent=characters.length>7?characters.slice(0,7).join('')+'....':item.description;
      if(characters.length>7){description.title=item.description;description.tabIndex=0;description.setAttribute('aria-label',item.description);}
      tr.append(title,description);
      for(const [field,label,options] of [
        ['responsible','Responsável',['Ale','Ana','Ale/Ana'].map(value=>({id:value,name:value}))],
        ['categoryId','Categoria',data.categories],
        ['resolutionDate','Data de resolução',null],
        ['priority','Prioridade',null]
      ]){
        const td=document.createElement('td'),control=document.createElement(options?'select':'input');
        control.setAttribute('aria-label',`${label}: ${item.title}`);
        control.dataset.inlineReminder=item.id;control.dataset.field=field;
        if(options){options.forEach(option=>control.add(new Option(option.name,option.id)));control.value=item[field];}
        else if(field==='priority'){control.type='checkbox';control.checked=Boolean(item.priority);}
        else{control.type='date';control.value=item.resolutionDate||'';control.required=!item.noDateDefined;}
        td.append(control);
        if(field==='resolutionDate'&&item.noDateDefined){const note=document.createElement('small');note.textContent='Sem data definida (data opcional)';td.append(note);}
        tr.append(td);
      }
      tr.append(actionCell('reminder',item));reminders.append(tr);
    });
    filterReminderTitles();
    $('#reminder-alerts-empty').hidden=Boolean(data.reminders.length);
    $('#reminder-alerts-select-all-wrap').hidden=!data.reminders.length;
    const alerts=$('#reminder-alerts-list');alerts.replaceChildren();
    const isAgenda=item=>item.categoryName?.trim().toLocaleLowerCase('pt-BR')==='google agenda';
    for(const [label,items] of [
      ['Lembretes comuns',data.reminders.filter(item=>!isAgenda(item))],
      ['Lembretes de agenda',data.reminders.filter(isAgenda)]
    ]){
      const group=document.createElement('details'),summary=document.createElement('summary');
      group.className='group-shell';summary.textContent=`${label} (${items.length})`;group.append(summary);
      if(!items.length){const empty=document.createElement('p');empty.className='intro';empty.textContent='Nenhum lembrete neste grupo.';group.append(empty);}
      else{
        const wrap=document.createElement('div'),table=document.createElement('table'),body=document.createElement('tbody');
        wrap.className='finance-table-wrap';
        table.innerHTML='<thead><tr><th>Enviar</th><th>Título</th><th>Descrição</th><th>Responsável</th><th>Categoria</th><th>Data de resolução</th><th>Prioridade</th></tr></thead>';
        items.forEach(item=>{
          const tr=document.createElement('tr'),choice=document.createElement('input');
          choice.type='checkbox';choice.dataset.alertReminder=item.id;choice.setAttribute('aria-label',`Selecionar ${item.title}`);
          const checkCell=document.createElement('td');checkCell.append(choice);tr.append(checkCell);
          [item.title,item.description,item.responsible,item.categoryName,reminderDate(item),item.priority?'Sim':'Não'].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});
          body.append(tr);
        });
        table.append(body);wrap.append(table);group.append(wrap);
      }
      alerts.append(group);
    }
    $('#reminder-alerts-select-all').checked=false;controls();
  }
  async function request(action){if(busy)return false;busy=true;controls();status(action?'Salvando…':'Carregando…');try{const response=await fetch('/api/admin/reminders',{method:action?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(action?{body:JSON.stringify(action)}:{})}),result=await response.json();if(!response.ok)throw new Error(result.error);googleClientId=result.googleClientId||googleClientId;data=result;render();status(action?'Salvo com sucesso.':'Dados atualizados.');return true;}catch(error){status(error.message||'Não foi possível acessar Lembretes.',true);return false;}finally{busy=false;controls();}}
  function clearCategory(){editingCategory=null;categoryId=crypto.randomUUID();views.category.reset();$('#reminder-category-title').textContent='Incluir categoria';$('#reminder-category-cancel').hidden=true;views.category.querySelector('[type=submit]').textContent='Salvar categoria';}
  function clearReminder(){editingReminder=null;reminderId=crypto.randomUUID();views.reminder.reset();views.reminder.elements.resolutionDate.value=todayInSaoPaulo(new Date());$('#reminder-title').textContent='Incluir lembrete';$('#reminder-cancel').hidden=true;views.reminder.querySelector('[type=submit]').textContent='Salvar lembrete';render();}
  function area(show){section.hidden=!show;if(show){$('#finance-section').hidden=true;$('#credit-card-section').hidden=true;$('#monthly-expenses-section').hidden=true;$('#market-section').hidden=true;$('#admin-form').hidden=true;request();}$('#show-reminders').setAttribute('aria-pressed',String(show));if(show){for(const selector of ['#show-content','#show-finance','#show-credit-card','#show-monthly-expenses','#show-market'])$(selector).setAttribute('aria-pressed','false');}}
  $('#show-reminders').addEventListener('click',()=>area(true));
  for(const selector of ['#show-content','#show-finance','#show-credit-card','#show-monthly-expenses','#show-market'])$(selector).addEventListener('click',()=>area(false));
  document.querySelectorAll('[data-reminders-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.remindersView)));
  $('#reminders-refresh').addEventListener('click',()=>request());
  $('#reminder-category-cancel').addEventListener('click',()=>{clearCategory();view('categories');});
  $('#reminder-cancel').addEventListener('click',()=>{clearReminder();view('reminders');});
  views.category.addEventListener('submit',async event=>{event.preventDefault();const action={type:'category',operation:editingCategory?'update':'create',id:editingCategory?.id||categoryId,revision:editingCategory?.revision,name:views.category.elements.name.value};if(await request(action)){clearCategory();view('categories');}});
  views.reminder.addEventListener('submit',async event=>{event.preventDefault();const fields=views.reminder.elements,action={type:'reminder',operation:editingReminder?'update':'create',id:editingReminder?.id||reminderId,revision:editingReminder?.revision,title:fields.title.value,responsible:fields.responsible.value,description:fields.description.value,categoryId:fields.categoryId.value,resolutionDate:fields.resolutionDate.value,noDateDefined:fields.noDateDefined.checked,priority:fields.priority.checked};if(await request(action)){clearReminder();view('reminders');}});
  section.addEventListener('click',async event=>{const button=event.target.closest('[data-reminder-action]');if(!button||busy)return;const collection=button.dataset.kind==='category'?data.categories:data.reminders,record=collection.find(item=>item.id===button.dataset.id);if(!record)return;if(button.dataset.reminderAction==='delete'){if(!confirm(`Deseja excluir “${record.name||record.description}”?`))return;if(await request({type:button.dataset.kind,operation:'delete',id:record.id,revision:record.revision})){button.dataset.kind==='category'?clearCategory():clearReminder();view(button.dataset.kind==='category'?'categories':'reminders');}return;}if(button.dataset.kind==='category'){editingCategory={...record};views.category.elements.name.value=record.name;$('#reminder-category-title').textContent='Editar categoria';$('#reminder-category-cancel').hidden=false;views.category.querySelector('[type=submit]').textContent='Salvar alterações';view('category');}else{editingReminder={...record};views.reminder.elements.title.value=record.title;views.reminder.elements.responsible.value=record.responsible;views.reminder.elements.description.value=record.description;views.reminder.elements.categoryId.value=record.categoryId;views.reminder.elements.resolutionDate.value=record.resolutionDate||'';views.reminder.elements.noDateDefined.checked=Boolean(record.noDateDefined);views.reminder.elements.priority.checked=Boolean(record.priority);syncDateRequired();$('#reminder-title').textContent='Editar lembrete';$('#reminder-cancel').hidden=false;views.reminder.querySelector('[type=submit]').textContent='Salvar alterações';view('reminder');}Object.values(views).find(node=>!node.hidden)?.querySelector('input,select,textarea')?.focus();});
  $('#reminders-list').addEventListener('change',async event=>{
    const control=event.target.closest('[data-inline-reminder]');if(!control||busy)return;
    const record=data.reminders.find(item=>item.id===control.dataset.inlineReminder);if(!record)return;
    const field=control.dataset.field;
    const restore=()=>{if(field==='priority')control.checked=Boolean(record.priority);else control.value=record[field]||'';};
    if(!control.checkValidity()){control.reportValidity();restore();return;}
    const value=field==='priority'?control.checked:control.value;
    const action={...record,type:'reminder',operation:'update',noDateDefined:Boolean(record.noDateDefined),priority:Boolean(record.priority),[field]:value};
    if(!await request(action))restore();
  });
  $('#reminder-alerts-select-all').addEventListener('change',event=>{document.querySelectorAll('[data-alert-reminder]').forEach(input=>{input.checked=event.target.checked;});});
  views.alerts.addEventListener('submit',event=>{event.preventDefault();const selected=[...document.querySelectorAll('[data-alert-reminder]:checked')].map(input=>data.reminders.find(item=>item.id===input.dataset.alertReminder)).filter(Boolean);if(!selected.length){status('Selecione ao menos um lembrete para enviar.',true);return;}const lines=['*Lembretes*','',...selected.flatMap((item,index)=>[`${index+1}. *${item.title}*`,item.description,`Responsável: ${item.responsible}`,`Categoria: ${item.categoryName}`,`Data de resolução: ${reminderDate(item)}`,`Prioridade: ${item.priority?'Sim':'Não'}`,''])],url=`https://wa.me/?text=${encodeURIComponent(lines.join('\n').trim())}`;window.open(url,'_blank','noopener,noreferrer');status(`${selected.length} lembrete(s) preparado(s). No WhatsApp, selecione MERCADO 🛒 e ALERTAS 🔔 e confirme o envio.`);});
  async function prepareGoogle(){
    const message=$('#reminder-calendar-status');
    if(!googleClientId){message.textContent='A conexão Google ainda não foi configurada no site.';return;}
    try{await loadGoogleIdentity();googleReady=true;message.textContent='Ao importar, autorize a leitura da Agenda e das Tarefas na sua conta Google.';}
    catch(error){message.textContent=error.message;}
  }
  views.calendar.elements.date.value=todayInSaoPaulo(new Date());
  views.calendar.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const message=$('#reminder-calendar-status'),rows=$('#reminder-calendar-results');
    if(!googleClientId||!googleReady){await prepareGoogle();return;}
    const date=views.calendar.elements.date.value;
    busy=true;controls();rows.replaceChildren();message.textContent='Aguardando autorização do Google…';
    try{
      const accessToken=await authorizeGoogle(googleClientId);
      message.textContent='Importando eventos e tarefas…';
      const response=await fetch('/api/admin/reminders',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'google-import',date,accessToken})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível importar a agenda.');
      data=result;render();
      result.created.forEach(item=>{const row=document.createElement('tr');[item.title,item.description,item.responsible,formatTransactionDate(item.resolutionDate)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});rows.append(row);});
      message.textContent=`${result.created.length} lembrete(s) criado(s). ${result.existing} já importado(s).`;
    }catch(error){message.textContent=error.message;}
    finally{busy=false;controls();}
  });
  $('#logout-admin').addEventListener('click',()=>{data=null;section.hidden=true;status('');});
  views.reminder.elements.resolutionDate.value=todayInSaoPaulo(new Date());view('reminder');controls();
})();
