let loading;
export function loadGoogleIdentity(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  if(!loading)loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{loading=null;script.remove();reject(new Error('Não foi possível carregar a conexão Google.'));};document.head.append(script);
  });
  return loading;
}
export function authorizeGoogle(clientId){
  return new Promise((resolve,reject)=>{
    google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly',
      callback:result=>result.access_token?resolve(result.access_token):reject(new Error('A autorização do Google não foi concluída.')),
      error_callback:()=>reject(new Error('A conexão Google foi cancelada ou o pop-up foi bloqueado.'))
    }).requestAccessToken();
  });
}
