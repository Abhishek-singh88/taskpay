"use client";

import { useEffect, useMemo, useState } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";

type Toast = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "error" | "info";
};

type TaskStatus = "OPEN" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

type Task = {
  id: number;
  title: string;
  description: string;
  reward: string;
  status: TaskStatus;
  creator: string;
  worker?: string;
};

const CONTRACT_ID =
  process.env.NEXT_PUBLIC_TASKPAY_CONTRACT_ID ??
  "CBTVIOUWGM7VHQPXLLFKZNCUK2W7XRWFGWSYIMQO2EL4ZGYWZW3RVXGZ";
const NATIVE_TOKEN_ID =
  process.env.NEXT_PUBLIC_TASKPAY_NATIVE_TOKEN_ID ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const NETWORK = process.env.NEXT_PUBLIC_TASKPAY_NETWORK ?? "testnet";
const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const READONLY_ACCOUNT = process.env.NEXT_PUBLIC_READONLY_ACCOUNT ?? "";

const STROOPS_PER_XLM = 10_000_000n;

const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  OPEN: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
  IN_PROGRESS: "bg-cyan-400/15 text-cyan-200 border-cyan-400/30",
  SUBMITTED: "bg-amber-400/15 text-amber-200 border-amber-400/30",
  COMPLETED: "bg-lime-400/15 text-lime-200 border-lime-400/30",
  CANCELLED: "bg-orange-400/15 text-orange-200 border-orange-400/30",
};

function formatAddress(addr?: string | null) {
  if (!addr) return "Not connected";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskStatus | "ALL">("ALL");
  const [account, setAccount] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<"approve" | "create" | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    reward: "1",
  });

  const horizonServer = useMemo(
    () => new (StellarSdk as any).Horizon.Server(HORIZON_URL),
    []
  );
  const rpcServer = useMemo(() => new (StellarSdk as any).rpc.Server(RPC_URL), []);

  const toStroops = (value: string): bigint => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
    return BigInt(Math.floor(parsed * Number(STROOPS_PER_XLM)));
  };

  const stroopsToXlm = (stroops: bigint): string =>
    (Number(stroops) / Number(STROOPS_PER_XLM)).toFixed(2);

  const stats = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter((t) => t.status === "OPEN").length;
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    return { total, open, inProgress, completed };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    if (filter === "ALL") return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  function pushToast(tone: Toast["tone"], title: string, message: string) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, tone, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }

  function parseTask(native: any): Task {
    const data = Array.isArray(native)
      ? {
          id: native[0],
          creator: native[1],
          worker: native[2],
          has_worker: native[3],
          title: native[4],
          description: native[5],
          reward: native[6],
          status: native[7],
        }
      : native;

    const rewardStroops = BigInt(data.reward ?? 0);
    const rawStatus = String(data.status ?? "OPEN");
    const statusMap: Record<string, TaskStatus> = {
      OPEN: "OPEN",
      INPRG: "IN_PROGRESS",
      SUBMIT: "SUBMITTED",
      DONE: "COMPLETED",
      CANCEL: "CANCELLED",
      IN_PROGRESS: "IN_PROGRESS",
      SUBMITTED: "SUBMITTED",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
    };
    const status = statusMap[rawStatus] ?? "OPEN";
    return {
      id: Number(data.id ?? 0),
      creator: data.creator ?? "",
      worker: data.has_worker ? data.worker : undefined,
      title: data.title ?? "",
      description: data.description ?? "",
      reward: stroopsToXlm(rewardStroops),
      status,
    };
  }

  async function buildContractTx(source: string, contractId: string, method: string, args: any[]) {
    const accountObj = await horizonServer.loadAccount(source);
    const contract = new (StellarSdk as any).Contract(contractId);
    const tx = new (StellarSdk as any).TransactionBuilder(accountObj, {
      fee: (StellarSdk as any).BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();
    return tx;
  }

  async function simulateAndSend(
    tx: any,
    signer: string,
    opts?: { waitForSuccess?: boolean; maxAttempts?: number }
  ) {
    const simulated = await rpcServer.simulateTransaction(tx);
    if (simulated?.error) {
      throw new Error(`Simulation failed: ${simulated.error}`);
    }
    const prepared = (StellarSdk as any).rpc.assembleTransaction(tx, simulated).build();
    const signed = await StellarWalletsKit.signTransaction(prepared.toXDR(), {
      address: signer,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    const signedXdr = signed?.signedTxXdr ?? signed;
    const signedTx = (StellarSdk as any).TransactionBuilder.fromXDR(
      signedXdr,
      NETWORK_PASSPHRASE
    );
    const sendResult = await rpcServer.sendTransaction(signedTx);
    const hash = sendResult?.hash ?? "";
    if (!hash) {
      const detail = sendResult?.errorResultXdr ? ` Error XDR: ${sendResult.errorResultXdr}` : "";
      throw new Error(`Transaction submission failed.${detail}`);
    }
    if (sendResult?.status && sendResult.status !== "PENDING") {
      const detail = sendResult?.errorResultXdr ? ` Error XDR: ${sendResult.errorResultXdr}` : "";
      throw new Error(`Transaction rejected: ${sendResult.status}.${detail}`);
    }
    if (!opts?.waitForSuccess) {
      return hash;
    }
    const maxAttempts = opts?.maxAttempts ?? 20;
    for (let attempts = 0; attempts < maxAttempts; attempts += 1) {
      try {
        const txResult = await rpcServer.getTransaction(hash);
        if (txResult?.status === "SUCCESS") return hash;
        if (txResult?.status === "FAILED") {
          throw new Error("Transaction failed on-chain.");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Bad union switch")) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return hash;
  }

  async function getAllowance(from: string, spender: string): Promise<bigint> {
    const tx = await buildContractTx(from, NATIVE_TOKEN_ID, "allowance", [
      new (StellarSdk as any).Address(from).toScVal(),
      new (StellarSdk as any).Address(spender).toScVal(),
    ]);
    const sim = await rpcServer.simulateTransaction(tx);
    const ret = sim?.result?.retval;
    const native = ret ? (StellarSdk as any).scValToNative(ret) : 0;
    return BigInt(native ?? 0);
  }

  async function scheduleRefresh(attempts = 12) {
    for (let i = 0; i < attempts; i += 1) {
      await new Promise((r) => setTimeout(r, 2500));
      await loadTasksOnChain();
    }
  }

  async function loadTasksOnChain() {
    const source = account ?? READONLY_ACCOUNT;
    if (!source) {
      setChainError("Set NEXT_PUBLIC_READONLY_ACCOUNT to load tasks without a wallet.");
      return;
    }
    setChainError(null);
    setLoadingTasks(true);
    try {
      const countTx = await buildContractTx(source, CONTRACT_ID, "get_task_count", []);
      const countSim = await rpcServer.simulateTransaction(countTx);
      const countVal = countSim?.result?.retval;
      const countNative = countVal ? (StellarSdk as any).scValToNative(countVal) : 0;
      const total = Number(countNative ?? 0);
      if (total === 0) {
        setTasks([]);
        return;
      }
      const requests = [];
      for (let i = 1; i <= total; i += 1) {
        const idVal = (StellarSdk as any).nativeToScVal(BigInt(i), { type: "u64" });
        requests.push(
          (async () => {
            const tx = await buildContractTx(source, CONTRACT_ID, "get_task", [idVal]);
            const sim = await rpcServer.simulateTransaction(tx);
            const ret = sim?.result?.retval;
            const native = ret ? (StellarSdk as any).scValToNative(ret) : null;
            return native ? parseTask(native) : null;
          })()
        );
      }
      const results = (await Promise.all(requests)).filter(Boolean) as Task[];
      const sorted = results.sort((a, b) => b.id - a.id);
      setTasks(sorted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setChainError(msg || "Failed to load tasks.");
    } finally {
      setLoadingTasks(false);
    }
  }

  useEffect(() => {
    try {
      StellarWalletsKit.init({
        network: Networks.TESTNET,
        modules: defaultModules(),
        appName: "TaskPay",
      });
      setWalletReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushToast("error", "Wallet Kit Error", msg || "Could not initialize wallets kit.");
    }
  }, []);

  useEffect(() => {
    void loadTasksOnChain();
  }, [account]);

  async function handleConnect() {
    if (!walletReady) {
      pushToast("error", "Wallet Kit", "Wallet kit is still loading.");
      return;
    }
    try {
      const { address } = await StellarWalletsKit.authModal({
        modalTitle: "Select Wallet",
      });
      if (!address) {
        throw new Error("wallet_not_found");
      }
      setAccount(address);
      pushToast("success", "Wallet Connected", formatAddress(address));
    } catch (err: any) {
      if (err?.message?.includes("wallet_not_found")) {
        pushToast("error", "Wallet Not Found", "Install Freighter or enable a supported wallet.");
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      pushToast("error", "Connection Failed", msg || "Wallet connection was rejected or cancelled.");
    }
  }

  async function withBusy(label: string, fn: () => Promise<void>) {
    setBusyAction(label);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushToast("error", "Transaction Error", msg || "Something went wrong.");
    } finally {
      setBusyAction(null);
    }
  }

  async function createTask() {
    if (!account) {
      pushToast("error", "Connect Wallet", "Connect your wallet to continue.");
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      pushToast("error", "Missing Info", "Add both a title and description.");
      return;
    }
    await withBusy("create", async () => {
      const rewardStroops = toStroops(form.reward.trim() || "1");
      if (rewardStroops <= 0n) {
        pushToast("error", "Invalid Reward", "Enter a positive XLM reward.");
        return;
      }

      const allowance = await getAllowance(account, CONTRACT_ID);
      if (allowance < rewardStroops) {
        setCreateStep("approve");
        const latest = await rpcServer.getLatestLedger();
        const expiration = Number(latest.sequence) + 20000;
        const approveAmount = rewardStroops * 100n;
        const approveTx = await buildContractTx(account, NATIVE_TOKEN_ID, "approve", [
          new (StellarSdk as any).Address(account).toScVal(),
          new (StellarSdk as any).Address(CONTRACT_ID).toScVal(),
          (StellarSdk as any).nativeToScVal(approveAmount, { type: "i128" }),
          (StellarSdk as any).nativeToScVal(expiration, { type: "u32" }),
        ]);
        await simulateAndSend(approveTx, account, { waitForSuccess: true, maxAttempts: 20 });
      }

      setCreateStep("create");
      const createTx = await buildContractTx(account, CONTRACT_ID, "create_task", [
        new (StellarSdk as any).Address(account).toScVal(),
        (StellarSdk as any).nativeToScVal(form.title.trim(), { type: "string" }),
        (StellarSdk as any).nativeToScVal(form.description.trim(), { type: "string" }),
        (StellarSdk as any).nativeToScVal(rewardStroops, { type: "i128" }),
      ]);
      const hash = await simulateAndSend(createTx, account);

      setCreateStep(null);
      setForm({ title: "", description: "", reward: "1" });
      pushToast("success", "Task Submitted", `Tx: ${hash.slice(0, 10)}...`);
      void scheduleRefresh();
    });
  }

  async function acceptTask(taskId: number) {
    if (!account) {
      pushToast("error", "Connect Wallet", "Connect your wallet to continue.");
      return;
    }
    await withBusy(`accept-${taskId}`, async () => {
      const tx = await buildContractTx(account, CONTRACT_ID, "accept_task", [
        new (StellarSdk as any).Address(account).toScVal(),
        (StellarSdk as any).nativeToScVal(BigInt(taskId), { type: "u64" }),
      ]);
      const hash = await simulateAndSend(tx, account);
      pushToast("info", "Task Accepted", "You are now the assigned worker.");
      pushToast("info", "Tx Submitted", `Tx: ${hash.slice(0, 10)}...`);
      void scheduleRefresh();
    });
  }

  async function submitTask(taskId: number) {
    await withBusy(`submit-${taskId}`, async () => {
      if (!account) {
        pushToast("error", "Connect Wallet", "Connect your wallet first.");
        return;
      }
      const tx = await buildContractTx(account, CONTRACT_ID, "submit_task", [
        new (StellarSdk as any).Address(account).toScVal(),
        (StellarSdk as any).nativeToScVal(BigInt(taskId), { type: "u64" }),
      ]);
      const hash = await simulateAndSend(tx, account);
      pushToast("info", "Task Submitted", "Waiting for creator approval.");
      pushToast("info", "Tx Submitted", `Tx: ${hash.slice(0, 10)}...`);
      void scheduleRefresh();
    });
  }

  async function approveTask(taskId: number) {
    await withBusy(`approve-${taskId}`, async () => {
      if (!account) {
        pushToast("error", "Connect Wallet", "Connect your wallet first.");
        return;
      }
      const tx = await buildContractTx(account, CONTRACT_ID, "approve_task", [
        new (StellarSdk as any).Address(account).toScVal(),
        (StellarSdk as any).nativeToScVal(BigInt(taskId), { type: "u64" }),
      ]);
      const hash = await simulateAndSend(tx, account);
      pushToast("success", "Payment Sent", "Reward released to worker.");
      pushToast("info", "Tx Submitted", `Tx: ${hash.slice(0, 10)}...`);
      void scheduleRefresh();
    });
  }

  async function cancelTask(taskId: number) {
    await withBusy(`cancel-${taskId}`, async () => {
      if (!account) {
        pushToast("error", "Connect Wallet", "Connect your wallet first.");
        return;
      }
      const tx = await buildContractTx(account, CONTRACT_ID, "cancel_task", [
        new (StellarSdk as any).Address(account).toScVal(),
        (StellarSdk as any).nativeToScVal(BigInt(taskId), { type: "u64" }),
      ]);
      const hash = await simulateAndSend(tx, account);
      pushToast("info", "Task Cancelled", "Funds returned to creator.");
      pushToast("info", "Tx Submitted", `Tx: ${hash.slice(0, 10)}...`);
      void scheduleRefresh();
    });
  }

  return (
    <div className="min-h-screen px-6 pb-16 pt-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-8 shadow-[0_20px_60px_rgba(2,8,23,0.55)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
                On-Chain Todo Payments
              </div>
              <h1 className="text-3xl font-semibold md:text-4xl">TaskPay on Stellar</h1>
              <p className="max-w-xl text-sm text-[var(--muted)] md:text-base">
                Create tasks, lock XLM rewards, and release payments with a single approval using
                your Soroban contract on testnet.
              </p>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/60">Wallet</div>
              <div className="text-lg font-semibold">{formatAddress(account)}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleConnect}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:opacity-90"
                >
                  Connect Wallet
                </button>
              </div>
              <div className="text-xs text-white/50">
                Contract: <span className="font-mono">{formatAddress(CONTRACT_ID)}</span>
              </div>
              <div className="text-xs text-white/50">
                Network: <span className="font-mono">{NETWORK}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[var(--panel-strong)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">Total Tasks</div>
              <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[var(--panel-strong)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">Open</div>
              <div className="mt-2 text-2xl font-semibold">{stats.open}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[var(--panel-strong)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">In Progress</div>
              <div className="mt-2 text-2xl font-semibold">{stats.inProgress}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[var(--panel-strong)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">Completed</div>
              <div className="mt-2 text-2xl font-semibold">{stats.completed}</div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <section className="rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Create Task</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                On-Chain
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-4">
              <label className="text-xs uppercase tracking-[0.2em] text-white/50">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Design a landing page"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <label className="text-xs uppercase tracking-[0.2em] text-white/50">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Scope, deliverables, and any constraints"
                rows={5}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <label className="text-xs uppercase tracking-[0.2em] text-white/50">Reward</label>
                  <div className="mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                    <input
                      value={form.reward}
                      onChange={(e) => setForm((f) => ({ ...f, reward: e.target.value }))}
                      className="w-20 bg-transparent text-sm text-white/90 focus:outline-none"
                    />
                    <span className="text-xs text-white/50">XLM</span>
                  </div>
                </div>
                <div className="ml-auto flex flex-col items-end">
                  <span className="text-xs text-white/50">Token</span>
                  <span className="font-mono text-xs text-white/70">{formatAddress(NATIVE_TOKEN_ID)}</span>
                </div>
              </div>
              <button
                onClick={createTask}
                disabled={busyAction === "create"}
                className="mt-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busyAction === "create" && createStep === "approve"
                  ? "Approving Allowance..."
                  : busyAction === "create"
                  ? "Creating Task..."
                  : "Lock Funds & Create"}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Task Board</h2>
              <div className="flex flex-wrap gap-2">
                {["ALL", "OPEN", "IN_PROGRESS", "SUBMITTED", "COMPLETED"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s as TaskStatus | "ALL")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      filter === s
                        ? "bg-white text-slate-900"
                        : "border border-white/10 bg-white/5 text-white/70"
                    }`}
                  >
                    {s === "ALL" ? "All" : STATUS_LABEL[s as TaskStatus]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {loadingTasks && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  Loading tasks from chain...
                </div>
              )}
              {chainError && (
                <div className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-100">
                  {chainError}
                </div>
              )}
              {visibleTasks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">
                  No tasks yet. Create one to kick things off.
                </div>
              )}

              {visibleTasks.map((task) => {
                const isCreator = account && task.creator === account;
                const isWorker = account && task.worker === account;
                return (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-white/10 bg-[var(--panel-strong)] p-5"
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
                          onClick={() => acceptTask(task.id)}
                          disabled={busyAction === `accept-${task.id}`}
                          className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200"
                        >
                          {busyAction === `accept-${task.id}` ? "Accepting..." : "Accept"}
                        </button>
                      )}
                      {task.status === "IN_PROGRESS" && isWorker && (
                        <button
                          onClick={() => submitTask(task.id)}
                          disabled={busyAction === `submit-${task.id}`}
                          className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200"
                        >
                          {busyAction === `submit-${task.id}` ? "Submitting..." : "Submit Work"}
                        </button>
                      )}
                      {task.status === "SUBMITTED" && isCreator && (
                        <button
                          onClick={() => approveTask(task.id)}
                          disabled={busyAction === `approve-${task.id}`}
                          className="rounded-full border border-lime-400/40 bg-lime-400/10 px-4 py-2 text-xs font-semibold text-lime-200"
                        >
                          {busyAction === `approve-${task.id}` ? "Paying..." : "Approve & Pay"}
                        </button>
                      )}
                      {(task.status === "OPEN" || task.status === "IN_PROGRESS") && isCreator && (
                        <button
                          onClick={() => cancelTask(task.id)}
                          disabled={busyAction === `cancel-${task.id}`}
                          className="rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-xs font-semibold text-orange-200"
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
        </div>

        <section className="rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-6 text-sm text-white/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/50">On-Chain Wiring</div>
              <p className="mt-2 max-w-2xl">
                This UI is wired to your deployed contract. Wallet signing and Soroban transactions
                are live on testnet.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs">
              {CONTRACT_ID}
            </div>
          </div>
        </section>
      </div>

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
    </div>
  );
}
