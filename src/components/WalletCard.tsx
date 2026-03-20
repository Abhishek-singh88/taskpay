import { formatAddress } from "@/lib/taskpay-types";

type WalletCardProps = {
  account: string | null;
  contractId: string;
  network: string;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function WalletCard({ account, contractId, network, onConnect, onDisconnect }: WalletCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(15,23,42,0.75))] p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-white/60">Wallet</div>
      <div className="text-lg font-semibold">{formatAddress(account)}</div>
      <div className="flex flex-wrap gap-2">
        {account ? (
          <button
            onClick={onDisconnect}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 shadow-[0_10px_24px_rgba(2,8,23,0.35)] transition hover:-translate-y-0.5 hover:bg-white/20 hover:cursor-pointer"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_rgba(16,185,129,0.35)] transition hover:-translate-y-0.5 hover:opacity-95 hover:cursor-pointer"
          >
            Connect Wallet
          </button>
        )}
      </div>
      <div className="text-xs text-white/50">
        Contract: <span className="font-mono">{formatAddress(contractId)}</span>
      </div>
      <div className="text-xs text-white/50">
        Network: <span className="font-mono">{network}</span>
      </div>
    </div>
  );
}
