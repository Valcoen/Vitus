'use client'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

export default function Toaster() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const successMsg = searchParams.get('success')
    const errorMsg = searchParams.get('error')

    if (successMsg || errorMsg) {
       // Show toast
       setToast({
          message: successMsg || errorMsg || '',
          type: successMsg ? 'success' : 'error'
       })
       
       // Remove query param from URL without refreshing the page
       const newParams = new URLSearchParams(searchParams.toString())
       newParams.delete('success')
       newParams.delete('error')
       router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
    }
  }, [searchParams, pathname, router])

  useEffect(() => {
    if (toast) {
       const timer = setTimeout(() => setToast(null), 4000)
       return () => clearTimeout(timer)
    }
  }, [toast])

  if (!toast) return null

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-6 duration-300">
      <div className={`flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl shadow-xl shadow-black/10 text-white font-bold tracking-wide text-sm backdrop-blur-md ${toast.type === 'success' ? 'bg-green-500/90' : 'bg-red-500/90'}`}>
        <div className="flex items-center gap-2.5">
            {toast.type === 'success' ? <CheckCircle2 size={20} strokeWidth={2.5} /> : <XCircle size={20} strokeWidth={2.5} />}
            {toast.message}
        </div>
        <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 hover:scale-110 active:scale-95 transition-all p-1 -mr-2">
            <X size={16} strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
