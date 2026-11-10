import { preferredSimilarAssets, valuesForSimilarAssets } from './finance-similar-assets.mjs';
import { fetchJsonWithTimeout } from './finance-http.mjs';

export async function importMarketData({ assetIds, assetType, subType, onData, onProgress, request = fetchJsonWithTimeout, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const ids = new Set(assetIds);
  let blocked = "";
  const stages = [
    ['Preços mínimos', 'minimum-price', 'minimumPrice', 'asset-minimum-price-batch'],
    ['Preços atuais', 'current-price', 'currentPrice', 'asset-current-price-batch'],
    ['Rendimentos', 'income', 'currentIncome', 'asset-income-batch']
  ].map(([label, endpoint, field, type]) => ({
    endpoint, field, type, pending: new Set(ids),
    step: { label, imported: 0, failed: ids.size, error: '', failures: [] }
  }));
  const runStage = async ({ endpoint, field, type, pending, step }, retry = false) => {
    if (blocked) { step.error = `Etapa não executada: ${blocked}`; return; }
    const label = `${retry ? 'Nova tentativa — ' : ''}${step.label}`;
    step.error = ''; step.failures = [];
    try {
      onProgress(`${label}: consultando…`);
      // Recarrega as revisões após cada etapa, inclusive quando a anterior falha.
      const fresh = await request('/api/admin/finance', { credentials: 'same-origin', cache: 'no-store' });
      if (!fresh.response.ok) throw new Error(fresh.result.error || 'Não foi possível atualizar os ativos.');
      onData(fresh.result);
      const candidates = fresh.result.assets.filter(asset => asset.assetType === assetType && asset.subType === subType);
      const assets = candidates.filter(asset => pending.has(asset.id));
      const sources = preferredSimilarAssets(assets, candidates), values = new Map();
      let next = 0, completed = 0;
      const worker = async () => {
        while (next < sources.length && !blocked) {
          const asset = sources[next++];
          try {
            const { response, result } = await request(`/api/admin/finance/${endpoint}?symbol=${encodeURIComponent(asset.symbol)}&category=${subType === 1 ? 'stock' : 'fii'}`, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) {
              const reason = result.error || `Consulta respondeu HTTP ${response.status}.`;
              if ([403, 429].includes(response.status) || /HTTP (403|429)\b/.test(reason)) blocked = reason;
              throw new Error(reason);
            }
            if (typeof result.value !== 'number' || !Number.isFinite(result.value) || result.value < 0 || (field !== 'currentIncome' && result.value === 0)) throw new Error('Indicador ausente ou inválido na resposta.');
            values.set(asset.symbol, result.value);
          } catch (error) { step.failures.push({ symbol: asset.symbol, reason: error.message || 'Consulta indisponível.' }); }
          onProgress(`${label}: ${++completed}/${sources.length}…`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(1, sources.length) }, worker));
      if (blocked) step.error = `Novas consultas interrompidas: ${blocked}`;
      const byAsset = valuesForSimilarAssets(assets, values);
      const updates = assets.filter(asset => byAsset.has(asset.id)).map(asset => ({ id: asset.id, revision: asset.revision, [field]: byAsset.get(asset.id) }));
      if (updates.length) {
        onProgress(`${label}: salvando…`);
        const { response, result } = await request('/api/admin/finance', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, items: updates }) });
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
        onData(result);
        updates.forEach(update => pending.delete(update.id));
      }
    } catch (error) { step.error = error.message; }
    step.failed = pending.size;
    step.imported = ids.size - pending.size;
  };
  const waitBetweenStages = async label => {
    onProgress(`${label}: aguardando 7 segundos…`);
    await pause(7000);
  };
  for (let index = 0; index < stages.length; index++) {
    if (index > 0 && !blocked) await waitBetweenStages(stages[index].step.label);
    await runStage(stages[index]);
  }
  const incomplete = stages.filter(stage => stage.pending.size > 0);
  if (incomplete.length && !blocked) {
    await waitBetweenStages('Nova tentativa dos registros pendentes');
    for (const stage of incomplete) await runStage(stage, true);
  }
  return stages.map(stage => stage.step);
}
