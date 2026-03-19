export type FreighterLike = {
  isConnected?: () => Promise<boolean>;
  connect?: () => Promise<void>;
  getPublicKey?: () => Promise<string>;
  publicKey?: () => Promise<string>;
};

export function getFreighter(): FreighterLike | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    freighterApi?: FreighterLike;
    freighter?: FreighterLike;
  };
  return w.freighterApi ?? w.freighter ?? null;
}

async function waitForFreighter(timeoutMs = 1500, intervalMs = 100): Promise<FreighterLike | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const api = getFreighter();
    if (api) return api;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function connectFreighter(): Promise<string> {
  let freighter = getFreighter();
  if (!freighter) {
    freighter = await waitForFreighter();
  }
  if (!freighter) {
    throw new Error("Freighter not detected. Make sure the extension is enabled for this site.");
  }

  if (freighter.isConnected) {
    const connected = await freighter.isConnected();
    if (!connected && freighter.connect) {
      await freighter.connect();
    }
  } else if (freighter.connect) {
    await freighter.connect();
  }

  if (freighter.getPublicKey) return freighter.getPublicKey();
  if (freighter.publicKey) return freighter.publicKey();

  throw new Error("Freighter API not compatible. Please update the extension.");
}
