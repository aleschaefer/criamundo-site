import { todayInSaoPaulo } from './finance-date.mjs';

(()=>{
  const $=selector=>document.querySelector(selector),section=$('#monthly-expenses-section');
  const forms={expense:$('#monthly-expense-form'),group:$('#monthly-group-form'),month:$('#monthly-update-form')};
  const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
  let data=null,busy=false,expenseId=crypto.randomUUID(),groupId=crypto.randomUUID();
  function status(text,error=false){const node=$('#monthly-expenses-status');node.textContent=text;node.className=`save-status${error?' is-error':''}`;}
  function view(name){Object.entries(forms).forEach(([key,form])=>{form.hidden=key!==name;});document.querySelectorAll('[data-monthly-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.monthlyView===name)));}
  function controls(){section.querySelectorAll('button,input,select').forEach(control=>{control.disabled=busy;});}
  function selectedPeriod(){return{month:Number(forms.month.elements.month.value),year:Number(forms.month.elements.year.value)};}
  function updateTotal(){const total=[...$('#monthly-update-list').querySelectorAll('input:checked')].reduce((sum,input)=>sum+Number(data.expenses.find(item=>item.id===input.value)?.value||0),0);$('#monthly-selected-total').textContent=money(total);const checks=[...$('#monthly-update-list').querySelectorAll('input[type=checkbox]')];$('#monthly-select-all').checked=checks.length>0&&checks.every(input=>input.checked);$('#monthly-select-all').indeterminate=checks.some(input=>input.checked)&&!checks.every(input=>input.checked);}
  function render(){
    const groupSelect=forms.expense.elements.groupId,current=groupSelect.value;groupSelect.replaceChildren(new Option('Selecione um grupo',''),...data.groups.map(item=>new Option(item.name,item.id)));if(data.groups.some(item=>item.id===current))groupSelect.value=current;
    $('#monthly-groups-empty').hidden=Boolean(data.groups.length);const groups=$('#monthly-groups-list');groups.replaceChildren();data.groups.forEach(item=>{const tr=document.createElement('tr'),td=document.createElement('td');td.textContent=item.name;tr.append(td);groups.append(tr);});
    $('#monthly-expenses-empty').hidden=Boolean(data.expenses.length);const expenses=$('#monthly-expenses-list');expenses.replaceChildren();data.expenses.forEach(item=>{const tr=document.createElement('tr');[item.owner,item.name,item.groupName,money(item.value)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});expenses.append(tr);});
    const {month,year}=selectedPeriod(),included=new Set(data.entries.filter(item=>item.month===month&&item.year===year).map(item=>item.expenseId));
    $('#monthly-update-empty').hidden=Boolean(data.expenses.length);const list=$('#monthly-update-list');list.replaceChildren();data.expenses.forEach(item=>{const tr=document.createElement('tr'),check=document.createElement('input');check.type='checkbox';check.value=item.id;check.checked=included.has(item.id);check.setAttribute('aria-label',`Adicionar ${item.name}`);check.addEventListener('change',updateTotal);const checkCell=document.createElement('td');checkCell.append(check);tr.append(checkCell);[item.owner,item.name,item.groupName,money(item.value)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});list.append(tr);});updateTotal();controls();
  }
  async function request(action){if(busy)return false;busy=true;controls();status(action?'Salvando…':'Carregando…');try{const response=await fetch('/api/admin/monthly-expenses',{method:action?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(action?{body:JSON.stringify(action)}:{})}),result=await response.json();if(!response.ok)throw new Error(result.error);data=result;render();status(action?'Salvo com sucesso.':'Dados atualizados.');return true;}catch(error){status(error.message||'Não foi possível acessar Gastos Mensais.',true);return false;}finally{busy=false;controls();}}
  function area(show){section.hidden=!show;if(show){$('#finance-section').hidden=true;$('#credit-card-section').hidden=true;$('#admin-form').hidden=true;request();}$('#show-monthly-expenses').setAttribute('aria-pressed',String(show));if(show){$('#show-content').setAttribute('aria-pressed','false');$('#show-finance').setAttribute('aria-pressed','false');$('#show-credit-card').setAttribute('aria-pressed','false');}}
  $('#show-monthly-expenses').addEventListener('click',()=>area(true));
  ['#show-content','#show-finance','#show-credit-card'].forEach(selector=>$(selector).addEventListener('click',()=>area(false)));
  document.querySelectorAll('[data-monthly-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.monthlyView)));
  $('#monthly-expenses-refresh').addEventListener('click',()=>request());
  forms.group.addEventListener('submit',async event=>{event.preventDefault();if(await request({type:'group',id:groupId,name:forms.group.elements.name.value})){forms.group.reset();groupId=crypto.randomUUID();view('group');}});
  forms.expense.addEventListener('submit',async event=>{event.preventDefault();const f=forms.expense.elements;if(await request({type:'expense',id:expenseId,owner:f.owner.value,name:f.name.value,value:Number(f.value.value),groupId:f.groupId.value})){forms.expense.reset();expenseId=crypto.randomUUID();render();view('expense');}});
  forms.month.addEventListener('submit',async event=>{event.preventDefault();const {month,year}=selectedPeriod(),expenseIds=[...$('#monthly-update-list').querySelectorAll('input:checked')].map(input=>input.value);await request({type:'month',month,year,expenseIds});});
  forms.month.elements.month.addEventListener('change',()=>data&&render());forms.month.elements.year.addEventListener('change',()=>data&&render());
  $('#monthly-select-all').addEventListener('change',event=>{$('#monthly-update-list').querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=event.target.checked;});updateTotal();});
  $('#logout-admin').addEventListener('click',()=>{data=null;section.hidden=true;status('');});
  months.forEach((name,index)=>forms.month.elements.month.add(new Option(name,index+1)));const today=todayInSaoPaulo(new Date());forms.month.elements.month.value=Number(today.slice(5,7));forms.month.elements.year.value=today.slice(0,4);view('month');controls();
})();
