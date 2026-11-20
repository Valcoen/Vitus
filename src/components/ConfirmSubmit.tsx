'use client'

/** Submit button that asks before running a destructive server action. */
export default function ConfirmSubmit({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="submit" className={className} onClick={e => { if (!window.confirm(message)) e.preventDefault() }}>
      {children}
    </button>
  )
}
