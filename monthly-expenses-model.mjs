const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max,label)=>{const text=String(value??'').trim();if(!text||text.length>max)throw new Error(`${label} deve ter entre 1 e ${max} caracteres.`);return text;};
const id=value=>{if(!uuid.test(String(value||'')))throw new Error('Identificador inválido.');return value;};
const period=body=>{const month=Number(body.month),year=Number(body.year);if(!Number.isInteger(month)||month<1||month>12)throw new Error('Selecione um mês válido.');if(!Number.isInteger(year)||year<1900||year>9999)throw new Error('Informe um ano válido.');return{month,year};};
const optionalDate=value=>{const date=String(value||'').trim();if(!date)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw new Error('Data de pagamento inválida.');return date;};

export function validateMonthlyExpenseAction(body){
  if(!body||!['group','expense','income','month','settlement','delete-all-expenses','delete-all-incomes'].includes(body.type))throw new Error('Operação inválida.');
  if(body.type==='delete-all-expenses'||body.type==='delete-all-incomes')return{type:body.type};
  const operation=body.operation||'create';
  if(['group','expense','income'].includes(body.type)&&operation==='delete'){const revision=Number(body.revision);if(!Number.isInteger(revision)||revision<0)throw new Error('Revisão inválida.');return{type:body.type,operation,id:id(body.id),revision};}
  const revision=operation==='update'?Number(body.revision):undefined;if(operation==='update'&&(!Number.isInteger(revision)||revision<0))throw new Error('Revisão inválida.');
  if(body.type==='group')return{type:'group',operation,id:id(body.id),name:clean(body.name,30,'Nome do grupo'),revision};
  if(body.type==='expense'){
    const value=Number(body.value);if(!['Ale','Ana'].includes(body.owner))throw new Error('Proprietário inválido.');if(!Number.isFinite(value)||value<0||value>99999999.99||Math.round(value*100)!==value*100)throw new Error('Valor inválido.');
    return{type:'expense',operation,id:id(body.id),owner:body.owner,name:clean(body.name,50,'Nome'),value,groupId:id(body.groupId),paymentDate:optionalDate(body.paymentDate),settled:body.settled===true,revision};
  }
  if(body.type==='income'){
    const value=Number(body.value);if(!['Ale','Ana'].includes(body.owner))throw new Error('Proprietário inválido.');if(!Number.isFinite(value)||value<0||value>99999999.99||Math.round(value*100)!==value*100)throw new Error('Valor inválido.');
    return{type:'income',operation,id:id(body.id),owner:body.owner,name:clean(body.name,50,'Nome'),value,...period(body),revision};
  }
  if(body.type==='settlement')return{type:'settlement',expenseId:id(body.expenseId),...period(body),settled:body.settled===true};
  const selected=[...new Set(Array.isArray(body.expenseIds)?body.expenseIds:[])].map(id);
  if(selected.length>1000)throw new Error('Quantidade de gastos excede o limite.');
  return{type:'month',...period(body),expenseIds:selected};
}
