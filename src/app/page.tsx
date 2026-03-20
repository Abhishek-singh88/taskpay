"use client";

import { useEffect, useMemo, useState } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { Task, TaskStatus, formatAddress } from "@/lib/taskpay-types";
import { WalletCard } from "@/components/WalletCard";
import { StatsGrid } from "@/components/StatsGrid";
import { CreateTaskForm } from "@/components/CreateTaskForm";
import { TaskBoard } from "@/components/TaskBoard";
import { ContractStrip } from "@/components/ContractStrip";
import { ToastStack } from "@/components/ToastStack";

type Toast = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "error" | "info";
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

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskStatus>("OPEN");
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

  const visibleTasks = useMemo(() => tasks.filter((t) => t.status === filter), [tasks, filter]);

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
    return new (StellarSdk as any).TransactionBuilder(accountObj, {
      fee: (StellarSdk as any).BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();
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
    if (!opts?.waitForSuccess) return hash;

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
      const { address } = await StellarWalletsKit.authModal();
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

  async function handleDisconnect() {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // ignore
    } finally {
      setAccount(null);
      pushToast("info", "Wallet Disconnected", "You can connect again anytime.");
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
        <header className="flex flex-col gap-6 rounded-3xl border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(15,23,42,0.85))] p-8 shadow-[0_25px_70px_rgba(2,8,23,0.6)]">
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
            <WalletCard
              account={account}
              contractId={CONTRACT_ID}
              network={NETWORK}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          </div>

          <StatsGrid stats={stats} />
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <CreateTaskForm
            title={form.title}
            description={form.description}
            reward={form.reward}
            tokenId={NATIVE_TOKEN_ID}
            isBusy={busyAction === "create"}
            createStep={createStep}
            onChange={setForm}
            onSubmit={createTask}
          />
          <TaskBoard
            tasks={visibleTasks}
            filter={filter}
            loading={loadingTasks}
            error={chainError}
            account={account}
            busyAction={busyAction}
            onFilterChange={setFilter}
            onAccept={acceptTask}
            onSubmit={submitTask}
            onApprove={approveTask}
            onCancel={cancelTask}
          />
        </div>

        <ContractStrip contractId={CONTRACT_ID} />
      </div>

      <ToastStack toasts={toasts} />
    </div>
  );
}
