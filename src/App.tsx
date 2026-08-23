import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Web3Provider } from '@/components/Web3Provider'
import { CreatorRoute } from '@/components/CreatorRoute'
import { Layout } from '@/components/Layout'
import { IndexPage } from '@/pages/IndexPage'
import { CreatePage } from '@/pages/CreatePage'
import { EditPage } from '@/pages/EditPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CollectionPage } from '@/pages/CollectionPage'

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
      { path: 'collection/:address', element: <CollectionPage /> },
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
