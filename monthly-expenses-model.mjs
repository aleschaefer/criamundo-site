const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean=(value,max,label)=>{const text=String(value??'').trim();if(!text||text.length>max)throw new Error(`${label} deve ter entre 1 e ${max} caracteres.`);return text;};
const id=value=>{if(!uuid.test(String(value||'')))throw new Error('Identificador inválido.');return value;};
const period=body=>{const month=Number(body.month),year=Number(body.year);if(!Number.isInteger(month)||month<1||month>12)throw new Error('Selecione um mês válido.');if(!Number.isInteger(year)||year<1900||year>9999)throw new Error('Informe um ano válido.');return{month,year};};

export function validateMonthlyExpenseAction(body){
  if(!body||!['group','expense','income','month'].includes(body.type))throw new Error('Operação inválida.');
  if(body.type==='group')return{type:'group',id:id(body.id),name:clean(body.name,30,'Nome do grupo')};
  if(body.type==='expense'){
    const value=Number(body.value);if(!['Ale','Ana'].includes(body.owner))throw new Error('Proprietário inválido.');if(!Number.isFinite(value)||value<0||value>99999999.99||Math.round(value*100)!==value*100)throw new Error('Valor inválido.');
    return{type:'expense',id:id(body.id),owner:body.owner,name:clean(body.name,50,'Nome'),value,groupId:id(body.groupId)};
  }
  if(body.type==='income'){
    const value=Number(body.value);if(!['Ale','Ana'].includes(body.owner))throw new Error('Proprietário inválido.');if(!Number.isFinite(value)||value<0||value>99999999.99||Math.round(value*100)!==value*100)throw new Error('Valor inválido.');
    return{type:'income',id:id(body.id),owner:body.owner,name:clean(body.name,50,'Nome'),value};
  }
  const selected=[...new Set(Array.isArray(body.expenseIds)?body.expenseIds:[])].map(id);
  if(selected.length>1000)throw new Error('Quantidade de gastos excede o limite.');
  return{type:'month',...period(body),expenseIds:selected};
}
