import { validTransactionDate } from './finance-date.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=value=>{if(!uuid.test(String(value||'')))throw new Error('Identificador inválido.');return value;};
const clean=(value,max,label)=>{const text=String(value??'').trim();if(!text||[...text].length>max)throw new Error(`${label} deve ter entre 1 e ${max} caracteres.`);return text;};

export function validateMarketAction(body){
  if(!body||!['category','item','list'].includes(body.type))throw new Error('Operação inválida.');
  const operation=body.operation||'create';if(!['create','update','delete'].includes(operation))throw new Error('Operação inválida.');
  const result={type:body.type,operation,id:id(body.id)};
  if(operation==='update'||operation==='delete'){const revision=Number(body.revision);if(!Number.isInteger(revision)||revision<0)throw new Error('Revisão inválida.');result.revision=revision;}
  if(operation==='delete')return result;
  if(body.type==='category')return{...result,name:clean(body.name,40,'Categoria')};
  if(body.type==='item'){
    const quantity=Number(body.quantity),approximateValue=Number(body.approximateValue);
    if(!Number.isInteger(quantity)||quantity<1||quantity>9999)throw new Error('Quantidade deve ser um inteiro entre 1 e 9999.');
    if(!Number.isFinite(approximateValue)||approximateValue<0||approximateValue>99999999.99||Math.round(approximateValue*100)!==approximateValue*100)throw new Error('Valor aproximado inválido.');
    return{...result,name:clean(body.name,80,'Nome'),quantity,categoryId:id(body.categoryId),approximateValue};
  }
  if(!validTransactionDate(body.listDate))throw new Error('Informe uma data válida para a lista.');
  if(!Array.isArray(body.itemIds)||!body.itemIds.length||body.itemIds.length>1000)throw new Error('Selecione entre 1 e 1000 itens.');
  const itemIds=[...new Set(body.itemIds.map(id))];if(itemIds.length!==body.itemIds.length)throw new Error('A lista contém itens repetidos.');
  return{...result,listDate:body.listDate,itemIds};
}
