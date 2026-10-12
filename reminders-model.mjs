import { validTransactionDate } from './finance-date.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=value=>{if(!uuid.test(String(value||'')))throw new Error('Identificador inválido.');return value;};
const clean=(value,max,label)=>{const text=String(value??'').trim();if(!text||[...text].length>max)throw new Error(`${label} deve ter entre 1 e ${max} caracteres.`);return text;};

export function normalizeBrazilianWhatsApp(value){
  let digits=String(value??'').replace(/\D/g,'');
  if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
  if(!/^\d{10,11}$/.test(digits))throw new Error('Informe um telefone brasileiro válido com DDD.');
  const ddd=Number(digits.slice(0,2));
  if(ddd<11||ddd>99)throw new Error('Informe um DDD brasileiro válido.');
  return`55${digits}`;
}

export function validateReminderAction(body){
  if(!body||!['category','reminder'].includes(body.type))throw new Error('Operação inválida.');
  const operation=body.operation||'create';
  if(!['create','update','delete'].includes(operation))throw new Error('Operação inválida.');
  const result={type:body.type,operation,id:id(body.id)};
  if(operation==='update'||operation==='delete'){
    const revision=Number(body.revision);if(!Number.isInteger(revision)||revision<0)throw new Error('Revisão inválida.');result.revision=revision;
  }
  if(operation==='delete')return result;
  if(body.type==='category')return{...result,name:clean(body.name,40,'Categoria')};
  if(!validTransactionDate(body.resolutionDate))throw new Error('Informe uma data de resolução válida.');
  return{...result,description:clean(body.description,200,'Descrição'),categoryId:id(body.categoryId),resolutionDate:body.resolutionDate};
}
