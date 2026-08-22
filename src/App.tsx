import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Web3Provider } from '@/components/Web3Provider'
import { Layout } from '@/components/Layout'
import { IndexPage } from '@/pages/IndexPage'
import { CreatePage } from '@/pages/CreatePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CollectionPage } from '@/pages/CollectionPage'
import { EditPage } from '@/pages/EditPage'

export default function App() {
  return (
    <Web3Provider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<IndexPage />} />
            <Route path="create" element={<CreatePage />} />
            <Route path="draft/:collectionId/edit" element={<CreatePage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="collection/:address" element={<CollectionPage />} />
            <Route path="collection/:address/edit" element={<EditPage />} />
          </Route>
        </Routes>
        <Toaster theme="dark" position="bottom-right" />
      </BrowserRouter>
    </Web3Provider>
  )
}
