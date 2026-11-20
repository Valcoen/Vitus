import { NextResponse } from 'next/server'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipe } from '@/lib/recipe/server'
import { recipeToMarkdown } from '@/lib/recipe/markdown'
import { viewToDoc, markdownFilename } from '@/lib/recipe/export'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { actor, supabase } = await getActor()
  if (!can(actor, 'recipe.export')) return NextResponse.json({ error: 'Nicht erlaubt' }, { status: actor ? 403 : 401 })
  const recipe = await loadRecipe(supabase, decodeURIComponent(id))
  if (!recipe) return NextResponse.json({ error: 'Rezept nicht gefunden' }, { status: 404 })
  const name = markdownFilename(recipe)
  return new NextResponse(recipeToMarkdown(viewToDoc(recipe)), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  })
}
