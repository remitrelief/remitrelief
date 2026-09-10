import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
const CampaignList = lazy(() => import("./pages/CampaignList"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const CreateCampaign = lazy(() => import("./pages/CreateCampaign"));
const MyCampaigns = lazy(() => import("./pages/MyCampaigns"));
const CampaignManagement = lazy(() => import("./pages/CampaignManagement"));
const DonorDashboard = lazy(() => import("./pages/DonorDashboard"));
const Ledger = lazy(() => import("./pages/Ledger"));
const VerifyPage = lazy(() => import("./pages/VerifyPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <WalletProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<p className="state-panel" role="status">Loading page…</p>}>
              <Routes>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/campaigns" replace />} />
                <Route path="campaigns" element={<CampaignList />} />
                <Route path="campaign/:id" element={<CampaignDetail />} />
                <Route path="campaigns/:id" element={<CampaignDetail />} />
                <Route path="ledger" element={<Ledger />} />
                <Route
                  path="create-campaign"
                  element={
                    <ProtectedRoute>
                      <CreateCampaign />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="create"
                  element={<Navigate to="/create-campaign" replace />}
                />
                <Route
                  path="dashboard/campaigns"
                  element={<ProtectedRoute><MyCampaigns /></ProtectedRoute>}
                />
                <Route
                  path="dashboard/campaigns/:id"
                  element={<ProtectedRoute><CampaignManagement /></ProtectedRoute>}
                />
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute>
                      <DonorDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="verify"
                  element={
                    <ProtectedRoute roles={["NGO", "ADMIN"]}>
                      <VerifyPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </WalletProvider>
  );
}
