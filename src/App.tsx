import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Web3Provider } from '@/components/Web3Provider'
import { CreatorRoute } from '@/components/CreatorRoute'
import { GalleryRoute } from '@/components/GalleryRoute'
import { Layout } from '@/components/Layout'
import { GalleryLayout } from '@/components/GalleryLayout'
import { IndexPage } from '@/pages/IndexPage'
import { CreatePage } from '@/pages/CreatePage'
import { EditPage } from '@/pages/EditPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CollectionPage } from '@/pages/CollectionPage'
import { GemShardRewardsPage } from '@/pages/GemShardRewardsPage'

const GalleryPage = lazy(() => import('@/pages/GalleryPage'))
const GalleryConfigPage = lazy(() => import('@/pages/GalleryConfigPage'))

function GalleryFallback() {
  return <div className="flex h-full items-center justify-center text-slate-400">Loading 3D Gallery…</div>
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <IndexPage /> },
      {
        path: 'create',
        element: (
          <CreatorRoute>
            <CreatePage />
          </CreatorRoute>
        ),
      },
      {
        path: 'draft/:collectionId/edit',
        element: (
          <CreatorRoute>
            <EditPage />
          </CreatorRoute>
        ),
      },
      {
        path: 'collection/:address/edit',
        element: <EditPage />,
      },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'rewards', element: <GemShardRewardsPage /> },
      { path: 'collection/:address', element: <CollectionPage /> },
    ],
  },
  {
    element: <GalleryLayout />,
    children: [
      {
        path: 'gallery',
        element: (
          <GalleryRoute mode="view">
            <Suspense fallback={<GalleryFallback />}>
              <GalleryPage />
            </Suspense>
          </GalleryRoute>
        ),
      },
      {
        path: 'gallery/config',
        element: (
          <GalleryRoute mode="edit">
            <Suspense fallback={<GalleryFallback />}>
              <GalleryConfigPage />
            </Suspense>
          </GalleryRoute>
        ),
      },
    ],
  },
])

export default function App() {
  return (
    <Web3Provider>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="bottom-right" />
    </Web3Provider>
  )
}
