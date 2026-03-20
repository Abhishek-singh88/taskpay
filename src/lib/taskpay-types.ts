export type TaskStatus = "OPEN" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type Task = {
  id: number;
  title: string;
  description: string;
  reward: string;
  status: TaskStatus;
  creator: string;
  worker?: string;
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<TaskStatus, string> = {
  OPEN: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
  IN_PROGRESS: "bg-cyan-400/15 text-cyan-200 border-cyan-400/30",
  SUBMITTED: "bg-amber-400/15 text-amber-200 border-amber-400/30",
  COMPLETED: "bg-lime-400/15 text-lime-200 border-lime-400/30",
  CANCELLED: "bg-orange-400/15 text-orange-200 border-orange-400/30",
};

export function formatAddress(addr?: string | null) {
  if (!addr) return "Not connected";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
