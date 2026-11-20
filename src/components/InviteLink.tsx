'use client'

import { useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'

/** Invite link with share sheet (phones) or copy button. */
export default function InviteLink({ url, code, planName }: { url: string; code: string; planName: string }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: the link is selectable */ }
  }
  const share = () => navigator.share({ title: 'Vitus', text: `Komm in unseren gemeinsamen Essensplan „${planName}“:`, url }).catch(() => {})
  return (
    <div className="space-y-2">
      <p className="rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] px-3 py-3 font-mono text-sm break-all select-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        {canShare && <button type="button" onClick={share} className="btn-primary h-12 gap-2"><Share2 size={20} /> Link teilen</button>}
        <button type="button" onClick={copy} className="btn-secondary h-12 gap-2">
          {copied ? <><Check size={20} /> Kopiert</> : <><Copy size={20} /> Kopieren</>}
        </button>
      </div>
      <p className="text-sm text-[hsl(var(--text-muted))]">Oder Code eingeben lassen: <b className="font-mono text-[hsl(var(--text))]">{code}</b></p>
    </div>
  )
}
