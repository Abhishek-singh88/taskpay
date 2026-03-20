import { formatAddress } from "@/lib/taskpay-types";

type ContractStripProps = {
  contractId: string;
};

export function ContractStrip({ contractId }: ContractStripProps) {
  return (
    <div className="rounded-3xl border border-emerald-300/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(15,23,42,0.85))] p-6 text-sm text-white/70 shadow-[0_18px_50px_rgba(2,8,23,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50">Contract</div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs">
          {formatAddress(contractId)}
        </div>
      </div>
    </div>
  );
}
