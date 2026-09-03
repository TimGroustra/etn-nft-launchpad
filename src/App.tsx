import { Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Web3Provider } from '@/components/Web3Provider'
import { CreatorRoute } from '@/components/CreatorRoute'
import { GalleryRoute } from '@/components/GalleryRoute'
import { Layout } from '@/components/Layout'
import { GalleryLayout } from '@/components/GalleryLayout'
import { RouteError } from '@/components/RouteError'
import { IndexPage } from '@/pages/IndexPage'
import { CreatePage } from '@/pages/CreatePage'
import { EditPage } from '@/pages/EditPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CollectionPage } from '@/pages/CollectionPage'
import { GemShardRewardsPage } from '@/pages/GemShardRewardsPage'
import { lazyWithRetry } from '@/lib/lazy-with-retry'

const GalleryPage = lazyWithRetry(() => import('@/pages/GalleryPage'))
const GalleryConfigHubPage = lazyWithRetry(() => import('@/pages/GalleryConfigHubPage'))
const GalleryConfigPage = lazyWithRetry(() => import('@/pages/GalleryConfigPage'))
const PersonalGalleryRoomsPage = lazyWithRetry(() => import('@/pages/PersonalGalleryRoomsPage'))
const PersonalGalleryConfigPage = lazyWithRetry(() => import('@/pages/PersonalGalleryConfigPage'))
const PersonalGalleryPage = lazyWithRetry(() => import('@/pages/PersonalGalleryPage'))

function GalleryFallback() {
  return <div className="flex h-full items-center justify-center text-slate-400">Loading 3D Gallery…</div>
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
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
    errorElement: <RouteError />,
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
              <GalleryConfigHubPage />
            </Suspense>
          </GalleryRoute>
        ),
      },
      {
        path: 'gallery/config/main',
        element: (
          <GalleryRoute mode="edit">
            <Suspense fallback={<GalleryFallback />}>
              <GalleryConfigPage />
            </Suspense>
          </GalleryRoute>
        ),
      },
      {
        path: 'gallery/config/rooms',
        element: (
          <GalleryRoute mode="edit">
            <Suspense fallback={<GalleryFallback />}>
              <PersonalGalleryRoomsPage />
            </Suspense>
          </GalleryRoute>
        ),
      },
      {
        path: 'gallery/config/room/:roomId',
        element: (
          <GalleryRoute mode="edit">
            <Suspense fallback={<GalleryFallback />}>
              <PersonalGalleryConfigPage />
            </Suspense>
          </GalleryRoute>
        ),
      },
      {
        path: 'gallery/room/:slug',
        element: (
          <Suspense fallback={<GalleryFallback />}>
            <PersonalGalleryPage />
          </Suspense>
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
