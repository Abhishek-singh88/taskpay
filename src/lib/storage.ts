export type TaskStatus = "OPEN" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type Task = {
  id: string;
  title: string;
  description: string;
  reward: string;
  status: TaskStatus;
  creator: string;
  worker?: string;
  createdAt: number;
};

const STORAGE_KEY = "taskpay_tasks_v1";

export function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Task[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function createLocalTask(input: {
  title: string;
  description: string;
  reward: string;
  creator: string;
}): Task {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    reward: input.reward,
    status: "OPEN",
    creator: input.creator,
    createdAt: Date.now(),
  };
}

export function updateTask(tasks: Task[], id: string, updater: (t: Task) => Task): Task[] {
  return tasks.map((t) => (t.id === id ? updater(t) : t));
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt);
}
