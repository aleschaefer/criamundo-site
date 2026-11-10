import { preferredSimilarAssets, valuesForSimilarAssets } from './finance-similar-assets.mjs';
import { fetchJsonWithTimeout } from './finance-http.mjs';

export async function importMarketData({ assetIds, assetType, subType, onData, onProgress, request = fetchJsonWithTimeout }) {
  const ids = new Set(assetIds);
  const summary = [];
  for (const [label, endpoint, field, type] of [
    ['Preços mínimos', 'minimum-price', 'minimumPrice', 'asset-minimum-price-batch'],
    ['Preços atuais', 'current-price', 'currentPrice', 'asset-current-price-batch'],
    ['Rendimentos', 'income', 'currentIncome', 'asset-income-batch']
  ]) {
    const step = { label, imported: 0, failed: 0, error: '' }; summary.push(step);
    try {
      onProgress(`${label}: consultando…`);
      // Recarrega as revisões após cada etapa, inclusive quando a anterior falha.
      const fresh = await request('/api/admin/finance', { credentials: 'same-origin', cache: 'no-store' });
      if (!fresh.response.ok) throw new Error(fresh.result.error || 'Não foi possível atualizar os ativos.');
      onData(fresh.result);
      const candidates = fresh.result.assets.filter(asset => asset.assetType === assetType && asset.subType === subType);
      const assets = candidates.filter(asset => ids.has(asset.id));
      const sources = preferredSimilarAssets(assets, candidates), values = new Map();
      let next = 0, completed = 0;
      const worker = async () => {
        while (next < sources.length) {
          const asset = sources[next++];
          try {
            const { response, result } = await request(`/api/admin/finance/${endpoint}?symbol=${encodeURIComponent(asset.symbol)}&category=${subType === 1 ? 'stock' : 'fii'}`, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok || typeof result.value !== 'number' || !Number.isFinite(result.value) || result.value < 0 || (field !== 'currentIncome' && result.value === 0)) throw new Error('Consulta indisponível.');
            values.set(asset.symbol, result.value);
          } catch { /* Mantém o valor salvo para consultas sem resultado. */ }
          onProgress(`${label}: ${++completed}/${sources.length}…`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker));
      const byAsset = valuesForSimilarAssets(assets, values);
      const updates = assets.filter(asset => byAsset.has(asset.id)).map(asset => ({ id: asset.id, revision: asset.revision, [field]: byAsset.get(asset.id) }));
      step.failed = ids.size - updates.length;
      if (updates.length) {
        onProgress(`${label}: salvando…`);
        const { response, result } = await request('/api/admin/finance', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, items: updates }) });
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
        onData(result); step.imported = updates.length;
      }
    } catch (error) { step.error = error.message; step.failed = ids.size; }
  }
  return summary;
}
