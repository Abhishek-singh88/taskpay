import { Task, TaskStatus, STATUS_LABEL, STATUS_TONE, formatAddress } from "@/lib/taskpay-types";

type TaskBoardProps = {
  tasks: Task[];
  filter: TaskStatus;
  loading: boolean;
  error: string | null;
  account: string | null;
  busyAction: string | null;
  onFilterChange: (status: TaskStatus) => void;
  onAccept: (id: number) => void;
  onSubmit: (id: number) => void;
  onApprove: (id: number) => void;
  onCancel: (id: number) => void;
};

export function TaskBoard({
  tasks,
  filter,
  loading,
  error,
  account,
  busyAction,
  onFilterChange,
  onAccept,
  onSubmit,
  onApprove,
  onCancel,
}: TaskBoardProps) {
  return (
    <section className="rounded-3xl border border-emerald-300/15 bg-[linear-gradient(160deg,rgba(15,23,42,0.9),rgba(16,185,129,0.06))] p-6 shadow-[0_18px_50px_rgba(2,8,23,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Task Board</h2>
        <div className="flex flex-wrap gap-2">
          {["OPEN", "IN_PROGRESS", "SUBMITTED", "COMPLETED"].map((s) => (
            <button
              key={s}
              onClick={() => onFilterChange(s as TaskStatus)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition hover:cursor-pointer ${
                filter === s
                  ? "bg-emerald-300 text-slate-900"
                  : "border border-emerald-200/20 bg-white/5 text-white/70"
              }`}
            >
              {STATUS_LABEL[s as TaskStatus]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            Loading tasks from chain...
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}
        {tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">
            No tasks yet. Create one to kick things off.
          </div>
        )}

        {tasks.map((task) => {
          const isCreator = account && task.creator === account;
          const isWorker = account && task.worker === account;
          return (
            <div
              key={task.id}
              className="rounded-2xl border border-emerald-300/15 bg-[linear-gradient(140deg,rgba(16,185,129,0.08),rgba(15,23,42,0.85))] p-5 shadow-[0_10px_28px_rgba(2,8,23,0.45)] transition hover:-translate-y-0.5 hover:border-emerald-300/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{task.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{task.description}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_TONE[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70">
                    Reward: <span className="font-semibold text-white">{task.reward} XLM</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-white/50">
                <div>
                  Creator: <span className="font-mono text-white/70">{formatAddress(task.creator)}</span>
                </div>
                <div>
                  Worker: <span className="font-mono text-white/70">{formatAddress(task.worker)}</span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {task.status === "OPEN" && !isCreator && (
                  <button
                    onClick={() => onAccept(task.id)}
                    disabled={busyAction === `accept-${task.id}`}
                    className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:cursor-pointer"
                  >
                    {busyAction === `accept-${task.id}` ? "Accepting..." : "Accept"}
                  </button>
                )}
                {task.status === "IN_PROGRESS" && isWorker && (
                  <button
                    onClick={() => onSubmit(task.id)}
                    disabled={busyAction === `submit-${task.id}`}
                    className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 hover:cursor-pointer"
                  >
                    {busyAction === `submit-${task.id}` ? "Submitting..." : "Submit Work"}
                  </button>
                )}
                {task.status === "SUBMITTED" && isCreator && (
                  <button
                    onClick={() => onApprove(task.id)}
                    disabled={busyAction === `approve-${task.id}`}
                    className="rounded-full border border-lime-400/40 bg-lime-400/10 px-4 py-2 text-xs font-semibold text-lime-200 hover:cursor-pointer"
                  >
                    {busyAction === `approve-${task.id}` ? "Paying..." : "Approve & Pay"}
                  </button>
                )}
                {(task.status === "OPEN" || task.status === "IN_PROGRESS") && isCreator && (
                  <button
                    onClick={() => onCancel(task.id)}
                    disabled={busyAction === `cancel-${task.id}`}
                    className="rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-xs font-semibold text-orange-200 hover:cursor-pointer"
                  >
                    {busyAction === `cancel-${task.id}` ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
