'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'

type CheckinData = {
  created_at: string
  weight: number | null
  mood: number | null
  physical_satisfaction: number | null
  mental_satisfaction: number | null
}

interface CheckinChartProps {
  data: CheckinData[]
}

export default function CheckinChart({ data }: CheckinChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-[hsl(var(--card-bg))] border border-[hsl(var(--border))] rounded-2xl">
        <p className="text-[hsl(var(--text-muted))]">Noch keine Daten vorhanden.</p>
      </div>
    )
  }

  const chartData = data.map(item => ({
    ...item,
    date: new Date(item.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  })).reverse() // Reverse to show oldest first, assuming data comes ordered by created_at DESC

  return (
    <div className="space-y-8">
      {/* Weight Chart */}
      <div className="card-apple p-4 sm:p-6">
        <h3 className="text-lg font-bold mb-4">Gewichtsverlauf</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card-bg))', borderColor: 'hsl(var(--border))', borderRadius: '12px', color: 'hsl(var(--text))' }}
                itemStyle={{ color: 'hsl(var(--text))' }}
              />
              <Line type="monotone" dataKey="weight" name="Gewicht (kg)" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Satisfaction Chart */}
      <div className="card-apple p-4 sm:p-6">
        <h3 className="text-lg font-bold mb-4">Wohlbefinden & Zufriedenheit</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--text-muted))" fontSize={12} tickLine={false} axisLine={false} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card-bg))', borderColor: 'hsl(var(--border))', borderRadius: '12px', color: 'hsl(var(--text))' }}
                itemStyle={{ color: 'hsl(var(--text))' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Line type="monotone" dataKey="mood" name="Stimmung" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
              <Line type="monotone" dataKey="physical_satisfaction" name="Körperl. Zufriedenheit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
              <Line type="monotone" dataKey="mental_satisfaction" name="Geistige Zufriedenheit" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
