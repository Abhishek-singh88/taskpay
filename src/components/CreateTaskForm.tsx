import { formatAddress } from "@/lib/taskpay-types";

type CreateTaskFormProps = {
  title: string;
  description: string;
  reward: string;
  tokenId: string;
  isBusy: boolean;
  createStep: "approve" | "create" | null;
  onChange: (next: { title: string; description: string; reward: string }) => void;
  onSubmit: () => void;
};

export function CreateTaskForm({
  title,
  description,
  reward,
  tokenId,
  isBusy,
  createStep,
  onChange,
  onSubmit,
}: CreateTaskFormProps) {
  return (
    <section className="rounded-3xl border border-emerald-300/15 bg-[linear-gradient(160deg,rgba(15,23,42,0.9),rgba(16,185,129,0.08))] p-6 shadow-[0_18px_50px_rgba(2,8,23,0.5)]">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create Task</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
          On-Chain
        </span>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <label className="text-xs uppercase tracking-[0.2em] text-white/50">Title</label>
        <input
          value={title}
          onChange={(e) => onChange({ title: e.target.value, description, reward })}
          placeholder="Design a landing page"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <label className="text-xs uppercase tracking-[0.2em] text-white/50">Description</label>
        <textarea
          value={description}
          onChange={(e) => onChange({ title, description: e.target.value, reward })}
          placeholder="Scope, deliverables, and any constraints"
          rows={5}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-[0.2em] text-white/50">Reward</label>
            <div className="mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
              <input
                value={reward}
                onChange={(e) => onChange({ title, description, reward: e.target.value })}
                className="w-20 bg-transparent text-sm text-white/90 focus:outline-none"
              />
              <span className="text-xs text-white/50">XLM</span>
            </div>
          </div>
          <div className="ml-auto flex flex-col items-end">
            <span className="text-xs text-white/50">Token</span>
            <span className="font-mono text-xs text-white/70">{formatAddress(tokenId)}</span>
          </div>
        </div>
        <button
          onClick={onSubmit}
          disabled={isBusy}
          className="mt-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-300 to-lime-200 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_12px_28px_rgba(16,185,129,0.35)] transition hover:-translate-y-0.5 hover:opacity-95 hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isBusy && createStep === "approve"
            ? "Approving Allowance..."
            : isBusy
            ? "Creating Task..."
            : "Lock Funds & Create"}
        </button>
      </div>
    </section>
  );
}
