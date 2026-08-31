export const ASSET_TYPES = Object.freeze({ 1: 'Renda Variável', 2: 'Renda Fixa', 3: 'Outro' });
export const ASSET_SUBTYPES = Object.freeze({ 1: 'Ações', 2: 'FII', 3: 'BDR', 4: 'CBD', 5: 'LCA', 6: 'LCI', 7: 'Outro' });
export const SUBTYPES_BY_TYPE = Object.freeze({ 1: [1, 2, 3], 2: [4, 5, 6, 7], 3: [7] });
export const hasIncome = asset => asset.assetType === 1 && [1, 2].includes(asset.subType);
export const hasCurrentPrice = asset => hasIncome(asset) || asset.assetType === 2;
