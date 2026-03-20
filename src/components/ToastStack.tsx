type Toast = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "error" | "info";
};

type ToastStackProps = {
  toasts: Toast[];
};

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="fixed bottom-6 right-6 flex w-72 flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-2xl border px-4 py-3 text-xs shadow-lg backdrop-blur ${
            toast.tone === "success"
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
              : toast.tone === "error"
              ? "border-red-400/40 bg-red-400/10 text-red-100"
              : "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
          }`}
        >
          <div className="text-sm font-semibold">{toast.title}</div>
          <div className="mt-1 text-xs text-white/70">{toast.message}</div>
        </div>
      ))}
    </div>
  );
}
