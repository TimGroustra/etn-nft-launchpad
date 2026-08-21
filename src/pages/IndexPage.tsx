import { Link } from 'react-router-dom'
import { useCollections } from '@/hooks/useCollections'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { shortenAddress } from '@/lib/utils'

export function IndexPage() {
  const { data: collections = [], isLoading } = useCollections()

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-10">
        <h1 className="text-4xl font-bold">Launch editable NFT collections on Electroneum</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Upload artwork, configure CLUB burns, pay ETN to publish, and keep metadata fully editable after launch.
          Images and metadata are stored in Supabase — update the token URI anytime to point at your own storage.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild size="lg">
            <Link to="/create">Create Collection</Link>
          </Button>
          <Button variant="outline" asChild size="lg">
            <Link to="/dashboard">My Dashboard</Link>
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Featured Collections</h2>
        {isLoading ? (
          <p className="text-slate-400">Loading collections...</p>
        ) : collections.length === 0 ? (
          <p className="text-slate-400">No published collections yet. Be the first to launch!</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <Card key={collection.id}>
                <CardTitle>{collection.name}</CardTitle>
                <CardDescription className="mt-2">{collection.description || collection.symbol}</CardDescription>
                <p className="mt-3 text-xs text-slate-500">
                  {collection.contract_address
                    ? shortenAddress(collection.contract_address)
                    : 'Draft'}
                </p>
                {collection.contract_address && (
                  <Button className="mt-4" variant="outline" size="sm" asChild>
                    <Link to={`/collection/${collection.contract_address}`}>View</Link>
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
