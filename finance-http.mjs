export async function fetchJsonWithTimeout(url, options = {}, timeout = 15000, fetcher = fetch) {
  const controller = new AbortController();
  let timer;
  const request = (async () => {
    const response = await fetcher(url, { ...options, signal: controller.signal });
    return { response, result: await response.json() };
  })();
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('A consulta excedeu o tempo limite.'));
    }, timeout);
  });
  try { return await Promise.race([request, limit]); }
  finally { clearTimeout(timer); }
}
