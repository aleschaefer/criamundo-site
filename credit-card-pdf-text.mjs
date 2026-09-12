function linesForItems(items) {
  const rows=[];
  for(const item of items || []){
    const y=Math.round(item.transform?.[5] || 0), x=item.transform?.[4] || 0;
    let row=rows.find(entry=>Math.abs(entry.y-y)<=2);
    if(!row){row={y,items:[]};rows.push(row);}
    row.items.push({x,text:item.str});
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n');
}

const startsTransaction=items=>(items || []).some(item=>/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*$/.test(item.str || ''));

export function textPortions(content,pageWidth) {
  const items=content.items || [], middle=Number(pageWidth)/2;
  if(!Number.isFinite(middle) || middle<=0)return [linesForItems(items)];
  const left=items.filter(item=>(item.transform?.[4] || 0)<middle);
  const right=items.filter(item=>(item.transform?.[4] || 0)>=middle);
  if(!startsTransaction(left) || !startsTransaction(right))return [linesForItems(items)];
  return [linesForItems(left),linesForItems(right)].filter(text=>text.trim());
}
