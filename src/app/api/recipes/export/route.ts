import { NextResponse } from 'next/server'
import { getActor } from '@/lib/actor'
import { can } from '@/lib/permissions'
import { loadRecipes } from '@/lib/recipe/server'
import { recipeToMarkdown } from '@/lib/recipe/markdown'
import { viewToDoc, markdownFilename } from '@/lib/recipe/export'
import { createZip } from '@/lib/zip'

/** All recipes as a zip of Obsidian Markdown files. */
export async function GET() {
  const { actor, supabase } = await getActor()
  if (!can(actor, 'recipe.export')) return NextResponse.json({ error: 'Nicht erlaubt' }, { status: actor ? 403 : 401 })
  const recipes = await loadRecipes(supabase)
  const used = new Set<string>()
  const files = recipes.map(r => {
    let name = markdownFilename(r)
    for (let i = 2; used.has(name); i++) name = markdownFilename(r).replace(/\.md$/, `-${i}.md`)
    used.add(name)
    return { name, data: recipeToMarkdown(viewToDoc(r)) }
  })
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(createZip(files)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="vitus-rezepte-${date}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
