import { Link } from 'react-router-dom'
import { ArrowLeft, Building2, Gem } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function GalleryConfigHubPage() {
  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-slate-950 p-3 text-white sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-10 w-fit px-0 text-sm hover:bg-transparent"
        >
          <Link to="/gallery">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Gallery
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-bold">Configure Gallery</h1>
          <p className="text-sm text-slate-400">
            Edit the main cooperative gallery or set up your personal room with a public view link.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-cyan-400" />
                Main Gallery
              </CardTitle>
              <CardDescription>
                Configure the shared 3D gallery at /gallery. Panel locks apply for cooperative curation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/gallery/config/main">Edit Main Gallery</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gem className="h-5 w-5 text-cyan-400" />
                My Gallery Room
              </CardTitle>
              <CardDescription>
                One private 10-panel room per wallet, with a public share link anyone can view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/gallery/config/rooms">Manage Room</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
