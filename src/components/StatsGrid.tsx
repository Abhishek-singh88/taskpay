type Stats = {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
};

type StatsGridProps = {
  stats: Stats;
};

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-emerald-300/15 bg-[linear-gradient(140deg,rgba(16,185,129,0.12),rgba(15,23,42,0.75))] p-4 shadow-[0_10px_30px_rgba(2,8,23,0.45)] transition hover:-translate-y-0.5 hover:border-emerald-300/35">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50">Total Tasks</div>
        <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
      </div>
      <div className="rounded-2xl border border-emerald-300/15 bg-[linear-gradient(140deg,rgba(14,165,233,0.12),rgba(15,23,42,0.75))] p-4 shadow-[0_10px_30px_rgba(2,8,23,0.45)] transition hover:-translate-y-0.5 hover:border-emerald-300/35">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50">Open</div>
        <div className="mt-2 text-2xl font-semibold">{stats.open}</div>
      </div>
      <div className="rounded-2xl border border-emerald-300/15 bg-[linear-gradient(140deg,rgba(59,130,246,0.12),rgba(15,23,42,0.75))] p-4 shadow-[0_10px_30px_rgba(2,8,23,0.45)] transition hover:-translate-y-0.5 hover:border-emerald-300/35">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50">In Progress</div>
        <div className="mt-2 text-2xl font-semibold">{stats.inProgress}</div>
      </div>
      <div className="rounded-2xl border border-emerald-300/15 bg-[linear-gradient(140deg,rgba(34,197,94,0.12),rgba(15,23,42,0.75))] p-4 shadow-[0_10px_30px_rgba(2,8,23,0.45)] transition hover:-translate-y-0.5 hover:border-emerald-300/35">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50">Completed</div>
        <div className="mt-2 text-2xl font-semibold">{stats.completed}</div>
      </div>
    </div>
  );
}
