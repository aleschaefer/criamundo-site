import { validTransactionDate } from './finance-date.mjs';
const clip=(text,max)=>[...String(text||'').trim()].slice(0,max).join('');
export async function readGoogleDay(date,token,fetcher=fetch){
  if(!validTransactionDate(date))throw new Error('Informe uma data válida.');
  if(typeof token!=='string'||!token||token.length>4096)throw new Error('Autorize o acesso à conta Google.');
  async function pages(base,params={}){
    const items=[];let pageToken;
    do{
      const url=new URL(base);Object.entries({...params,...(pageToken?{pageToken}:{})}).forEach(([k,v])=>url.searchParams.set(k,v));
      const response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`Google respondeu HTTP ${response.status}. Verifique as permissões de Agenda e Tarefas e tente novamente.`);
      const result=await response.json();items.push(...(result.items||[]));pageToken=result.nextPageToken;
    }while(pageToken);
    return items;
  }
  const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);const tomorrow=next.toISOString().slice(0,10);
  const calendars=await pages('https://www.googleapis.com/calendar/v3/users/me/calendarList');
  const account=calendars.find(c=>c.primary)?.id;
  if(!account)throw new Error('Agenda principal não encontrada.');
  const records=[];
  for(const calendar of calendars.filter(c=>c.primary||c.selected)){
    const events=await pages(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,{timeMin:`${date}T00:00:00-03:00`,timeMax:`${tomorrow}T00:00:00-03:00`,singleEvents:'true',showDeleted:'false',timeZone:'America/Sao_Paulo',maxResults:'2500'});
    for(const event of events.filter(e=>e.status!=='cancelled')){
      const time=event.start?.dateTime?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(event.start.dateTime)):'Dia inteiro';
      records.push({key:JSON.stringify([account,'event',calendar.id,event.id,date]),title:clip(event.summary||'Evento sem título',30),description:clip(`${time} · ${event.summary||'Evento sem título'}${event.location?' · '+event.location:''}${event.description?' · '+event.description:''}`,200)});
    }
  }
  const lists=await pages('https://tasks.googleapis.com/tasks/v1/users/@me/lists',{maxResults:'100'});
  for(const list of lists){
    const tasks=await pages(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks`,{dueMin:`${date}T00:00:00Z`,dueMax:`${tomorrow}T00:00:00Z`,showCompleted:'true',showHidden:'true',showDeleted:'false',maxResults:'100'});
    for(const task of tasks.filter(t=>!t.deleted&&t.due?.slice(0,10)===date))records.push({key:JSON.stringify([account,'task',list.id,task.id,date]),title:clip(task.title||'Tarefa sem título',30),description:clip(`Tarefa${task.status==='completed'?' concluída':''} · ${task.title||'Sem título'}${task.notes?' · '+task.notes:''}`,200)});
  }
  return records;
}
export async function importGoogleDay(db,date,token,fetcher=fetch){
  const records=await readGoogleDay(date,token,fetcher);
  if(!records.length)return {created:[],existing:0};
  await db.prepare("INSERT INTO reminder_categories(id,name) VALUES(?1,'Google Agenda') ON CONFLICT(name) DO NOTHING").bind(crypto.randomUUID()).run();
  const category=await db.prepare("SELECT id FROM reminder_categories WHERE name='Google Agenda'").first();
  const created=[];let existing=0;
  for(const record of records){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(record.key));
    const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const result=await db.prepare("INSERT INTO reminders(id,title,description,responsible,category_id,resolution_date) VALUES(?1,?2,?3,'Ale ou Ana',?4,?5) ON CONFLICT(id) DO NOTHING").bind(id,record.title,record.description,category.id,date).run();
    if(result.meta.changes)created.push({id,title:record.title,description:record.description,responsible:'Ale ou Ana',resolutionDate:date});else existing++;
  }
  return {created,existing};
}
