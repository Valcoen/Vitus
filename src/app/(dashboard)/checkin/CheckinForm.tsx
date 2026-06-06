'use client'

import { useState } from 'react'
import { submitCheckIn } from './actions'
import { useRouter } from 'next/navigation'

export default function CheckinForm({ defaultWeight }: { defaultWeight: number | undefined }) {
  const [mood, setMood] = useState(5)
  const [physical, setPhysical] = useState(5)
  const [mental, setMental] = useState(5)
  const [weight, setWeight] = useState<number | string>(defaultWeight || '')
  const [note, setNote] = useState('')
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsPending(true)
    
    const formData = new FormData()
    formData.append('weight', String(weight))
    formData.append('mood', String(mood))
    formData.append('physical_satisfaction', String(physical))
    formData.append('mental_satisfaction', String(mental))
    formData.append('note', note)

    const res = await submitCheckIn(formData)
    setIsPending(false)

    if (res?.error) {
      router.push('/checkin?error=' + encodeURIComponent(res.error))
    } else {
      // Clear form
      setMood(5)
      setPhysical(5)
      setMental(5)
      setWeight(defaultWeight || '')
      setNote('')
      router.push('/checkin?success=' + encodeURIComponent('Eintrag erfolgreich gespeichert!'))
    }
  }

  return (
    <div className="card-apple sticky top-24">
      <h2 className="text-xl font-bold mb-6">Neuer Eintrag</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 pl-1">Aktuelles Gewicht (kg)</label>
            <input 
              type="number" 
              value={weight} 
              onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')} 
              step="0.1" 
              className="input-apple bg-[hsl(var(--background))]" 
              required 
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold mb-2 pl-1 flex justify-between">
              <span>Stimmung</span>
              <span className="text-[hsl(var(--primary))] font-bold">{mood} / 10</span>
            </label>
            <input 
              type="range" 
              value={mood} 
              onChange={(e) => setMood(Number(e.target.value))} 
              min="1" 
              max="10" 
              className="w-full accent-[hsl(var(--primary))] h-2 rounded-lg appearance-none bg-[hsl(var(--background))]" 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 pl-1 flex justify-between">
              <span>Körperliche Zufriedenheit</span>
              <span className="text-[hsl(var(--primary))] font-bold">{physical} / 10</span>
            </label>
            <input 
              type="range" 
              value={physical} 
              onChange={(e) => setPhysical(Number(e.target.value))} 
              min="1" 
              max="10" 
              className="w-full accent-[hsl(var(--primary))] h-2 rounded-lg appearance-none bg-[hsl(var(--background))]" 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 pl-1 flex justify-between">
              <span>Geistige Zufriedenheit</span>
              <span className="text-[hsl(var(--primary))] font-bold">{mental} / 10</span>
            </label>
            <input 
              type="range" 
              value={mental} 
              onChange={(e) => setMental(Number(e.target.value))} 
              min="1" 
              max="10" 
              className="w-full accent-[hsl(var(--primary))] h-2 rounded-lg appearance-none bg-[hsl(var(--background))]" 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 pl-1">Notizen / Besonderheiten</label>
            <textarea 
              value={note} 
              onChange={(e) => setNote(e.target.value)} 
              rows={3} 
              placeholder="z.B. Starker Hunger am Abend, leicht erschöpft..." 
              className="input-apple bg-[hsl(var(--background))] resize-none"
            ></textarea>
          </div>
          
          <div className="pt-4 border-t border-[hsl(var(--border))]">
            <button type="submit" disabled={isPending} className="btn-primary w-full disabled:opacity-50">
              {isPending ? 'Speichert...' : 'Eintrag Speichern'}
            </button>
          </div>
      </form>
    </div>
  )
}
