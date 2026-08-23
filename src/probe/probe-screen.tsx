/**
 * Diagnostics screen — throwaway. Reached at `?probe=1`, never linked from the app.
 *
 * Runs the device probes and shows raw values, with one button to copy the whole
 * report so results can leave the phone. Delete with the rest of `src/probe`.
 */

import { useCallback, useEffect, useState } from "react"
import { Check, ChevronDown, Copy, Loader2, TriangleAlert, X } from "lucide-react"
import { init, type NimiqProvider } from "@nimiq/mini-app-sdk"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import {
  clipboardProbe,
  deeplinkProbe,
  environmentProbe,
  viewportProbe,
  minimumAmountProbe,
  signatureProbe,
  walletProbe,
  type ProbeReport,
} from "@/probe/probes"

type State = ProbeReport & { running?: boolean }

const AMOUNTS = [1, 10]

export function ProbeScreen() {
  const [provider, setProvider] = useState<NimiqProvider | null>(null)
  const [reports, setReports] = useState<Record<string, State>>({})

  const set = useCallback((key: string, value: State) => {
    setReports((current) => ({ ...current, [key]: value }))
  }, [])

  const run = useCallback(
    async (key: string, probe: () => ProbeReport | Promise<ProbeReport>) => {
      set(key, { outcome: "info", headline: "Running…", detail: {}, running: true })
      try {
        set(key, await probe())
      } catch (error) {
        set(key, {
          outcome: "fail",
          headline: "Threw",
          detail: { error: error instanceof Error ? error.message : String(error) },
        })
      }
    },
    [set],
  )

  // Environment and deeplink need no provider, so they answer immediately.
  useEffect(() => {
    set("Environment", environmentProbe())
    set("Deeplink", deeplinkProbe())
    init({ timeout: 4000 })
      .then(setProvider)
      .catch(() => setProvider(null))
  }, [set])

  const copyAll = useCallback(async () => {
    const lines = [`Knock device probe — ${new Date().toISOString()}`, ""]
    for (const [name, report] of Object.entries(reports)) {
      lines.push(`## ${name} [${report.outcome}]`, report.headline)
      for (const [key, value] of Object.entries(report.detail)) {
        lines.push(`  ${key}: ${value}`)
      }
      lines.push("")
    }
    const ok = await copyText(lines.join("\n"))
    toast[ok ? "success" : "error"](ok ? "Report copied" : "Couldn't copy")
  }, [reports])

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur-xl pt-safe">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">Device probes</h1>
            <p className="text-muted-foreground text-[11px]">
              {provider ? "Provider connected" : "No provider — open in Nimiq Pay"}
            </p>
          </div>
          <Button variant="secondary" onClick={copyAll} className="h-9 rounded-xl">
            <Copy className="size-3.5" />
            Copy
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 pb-safe">
        <Card name="Environment" report={reports.Environment} />

        <Card
          name="Wallet"
          report={reports.Wallet}
          action={
            provider ? { label: "Run", onClick: () => run("Wallet", () => walletProbe(provider)) } : undefined
          }
        />

        <Card
          name="Signature semantics"
          report={reports["Signature semantics"]}
          note="Signs a fixed string twice. Expect two wallet prompts."
          action={
            provider
              ? {
                  label: "Run",
                  onClick: () => run("Signature semantics", () => signatureProbe(provider)),
                }
              : undefined
          }
        />

        <Card
          name="Clipboard"
          report={reports.Clipboard}
          note="Tests each copy mechanism separately. Paste afterwards to confirm."
          action={{ label: "Run", onClick: () => run("Clipboard", clipboardProbe) }}
        />

        <Card
          name="Viewport"
          report={reports.Viewport}
          note="Run this while the app is drawn at the wrong size — it says whether the WebView itself is short."
          action={{ label: "Run", onClick: () => set("Viewport", viewportProbe()) }}
        />

        <Card name="Deeplink" report={reports.Deeplink} note="Open the links below from Nimiq Pay and watch for probe=42." />

        <div className="bg-card rounded-2xl border p-3.5 shadow-sm">
          <p className="text-sm font-semibold">Minimum amount</p>
          <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">
            Sends to your own address, so only the network fee is spent. Each button
            opens a wallet confirmation.
          </p>
          <div className="mt-3 flex gap-2">
            {AMOUNTS.map((nim) => (
              <Button
                key={nim}
                variant="secondary"
                disabled={!provider}
                onClick={() => run(`Minimum ${nim} NIM`, () => minimumAmountProbe(provider!, nim))}
                className="h-10 flex-1 rounded-xl"
              >
                Send {nim} NIM
              </Button>
            ))}
          </div>
          {AMOUNTS.map((nim) => {
            const report = reports[`Minimum ${nim} NIM`]
            return report ? <Result key={nim} report={report} /> : null
          })}
        </div>
      </div>
    </div>
  )
}

function Card({
  name,
  report,
  note,
  action,
}: {
  name: string
  report?: State
  note?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="bg-card rounded-2xl border p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{name}</p>
        {action && (
          <Button
            variant="secondary"
            onClick={action.onClick}
            disabled={report?.running}
            className="h-8 rounded-lg px-3 text-xs"
          >
            {report?.running ? <Loader2 className="size-3.5 animate-spin" /> : action.label}
          </Button>
        )}
      </div>
      {note && <p className="text-muted-foreground mt-0.5 text-[12px] leading-snug">{note}</p>}
      {!action && !report && (
        <p className="text-muted-foreground mt-2 text-[12px]">
          Needs a provider — open this in Nimiq Pay.
        </p>
      )}
      {report && <Result report={report} />}
    </div>
  )
}

function Result({ report }: { report: State }) {
  const [open, setOpen] = useState(true)
  const Icon = report.outcome === "pass" ? Check : report.outcome === "fail" ? X : TriangleAlert

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-white",
            report.outcome === "pass" && "bg-success",
            report.outcome === "fail" && "bg-destructive",
            report.outcome === "info" && "bg-warning",
          )}
        >
          <Icon className="size-3" strokeWidth={3} />
        </span>
        <span className="flex-1 text-[13px] font-medium text-balance">{report.headline}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && Object.keys(report.detail).length > 0 && (
        <dl className="bg-muted mt-2.5 space-y-1.5 rounded-xl p-3">
          {Object.entries(report.detail).map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground text-[10px] font-semibold tracking-wide">
                {key}
              </dt>
              <dd className="font-mono text-[11px] leading-relaxed wrap-anywhere whitespace-pre-wrap">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
