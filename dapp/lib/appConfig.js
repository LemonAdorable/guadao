import appConfig from '../config.json';

export const getChainOptions = () => {
  if (!appConfig.chains) return [];
  return Object.entries(appConfig.chains).map(([id, entry]) => ({
    id: Number(id),
    label: entry.label || id,
    airdropAddress: entry.airdropAddress || '',
    escrowAddress: entry.escrowAddress || '',
    guaTokenAddress: entry.guaTokenAddress || '',
    proofsUrl: entry.proofsUrl || '',
    rpcUrl: entry.rpcUrl || '',
  }));
};

export const defaultChainId =
  appConfig.defaultChainId || getChainOptions()[0]?.id || undefined;