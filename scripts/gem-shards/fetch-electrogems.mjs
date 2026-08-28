/** Fetch all 49 ElectroGem token metadata from Blockscout. */
const CONTRACT = '0xcff0d88Ed5311bAB09178b6ec19A464100880984'

function attr(metadata, trait) {
  const a = metadata?.attributes?.find((x) => x.trait_type === trait)
  return a?.value ?? null
}

export async function fetchElectroGems() {
  const gems = []
  for (let id = 1; id <= 49; id++) {
    const url = `https://blockexplorer.electroneum.com/api/v2/tokens/${CONTRACT}/instances/${id}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch ElectroGem #${id}: ${res.status}`)
    const data = await res.json()
    const meta = data.metadata ?? {}
    gems.push({
      tokenId: id,
      name: meta.name ?? `ElectroGem #${id}`,
      baseColour: attr(meta, 'Base Colour') ?? 'Blue',
      cut: attr(meta, 'Cut') ?? 'Facet Cut',
      auraScore: Number(attr(meta, 'Aura Score') ?? 5),
      carat: Number(attr(meta, 'Carat') ?? 5),
    })
    await new Promise((r) => setTimeout(r, 120))
  }
  return gems
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const gems = await fetchElectroGems()
  console.log(JSON.stringify(gems, null, 2))
}
