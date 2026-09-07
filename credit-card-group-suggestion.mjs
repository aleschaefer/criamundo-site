const stopWords = new Set(['parc','br','brasil','sao','paulo','florianopolis','florianopoli','rio','janeiro','loja','filial','pending']);

export function normalizedTransactionName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/\bparc\s*\d+\s*[\/-]\s*\d+\b/g,' ')
    .replace(/\b\d+\s*[\/-]\s*\d+\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ').trim();
}

function tokens(value){return normalizedTransactionName(value).split(/\s+/).filter(token=>token.length>=3&&!stopWords.has(token));}
function similarity(left,right){
  const a=normalizedTransactionName(left),b=normalizedTransactionName(right);
  if(!a||!b)return 0;
  if(a===b)return 1;
  const compactA=a.replace(/\s/g,''),compactB=b.replace(/\s/g,'');
  if(Math.min(compactA.length,compactB.length)>=4&&(compactA.includes(compactB)||compactB.includes(compactA)))return .95;
  const aTokens=new Set(tokens(a)),bTokens=new Set(tokens(b));
  const common=[...aTokens].filter(token=>bTokens.has(token));
  if(!common.length)return 0;
  const coverage=common.length/Math.min(aTokens.size,bTokens.size);
  const distinctive=common.some(token=>token.length>=4);
  return distinctive&&coverage>=.5?.7+coverage*.2:0;
}

export function suggestTransactionGroup({name,category,periodId,periods=[],transactions=[],groups=[]}){
  const direct=groups.find(group=>{const key=normalizedTransactionName(group.name).replace(/\s/g,'');return key.length>=4&&normalizedTransactionName(name).replace(/\s/g,'').includes(key);});
  if(direct)return direct.id;

  const ordered=[...periods].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const currentIndex=ordered.findIndex(period=>period.id===periodId);
  const previous=currentIndex>0?ordered[currentIndex-1]:null;
  let best=null,bestScore=0;
  if(previous){
    transactions.filter(item=>item.periodId===previous.id).forEach(item=>{const score=similarity(name,item.name);if(score>bestScore){best=item;bestScore=score;}});
  }
  if(best&&bestScore>=.7)return best.groupId;

  const exactKey=normalizedTransactionName(name).replace(/\s/g,'');
  const historical=transactions.find(item=>normalizedTransactionName(item.name).replace(/\s/g,'')===exactKey);
  if(historical)return historical.groupId;
  const categoryGroup=groups.find(group=>normalizedTransactionName(group.name)===normalizedTransactionName(category));
  if(categoryGroup)return categoryGroup.id;
  return groups.find(group=>['outro','outros'].includes(normalizedTransactionName(group.name)))?.id||'';
}
