import { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import NewSession from "./pages/NewSession";
import Dashboard from "./pages/Dashboard";
import PartSelection from "./pages/PartSelection"
import CountingPage from "./pages/CountingPage";
import MeasurementPage from "./pages/MeasurementPage";
import AddNewPart from "./pages/AddNewPart";
import PartDetails from "./pages/PartDetails";
import DeviceSettings from "./pages/DeviceSettings";
import HealthCheck from "./pages/HealthCheck";
import TechnicalSupport from "./pages/TechnicalSupport";
import { SessionProvider } from "./context/SessionContext";
import DefectDetectionPage from "./pages/DefectDetectionPage";

const Page = ({ title }) => <div style={{ padding: 32 }}><h1>{title}</h1></div>;

export default function App() { 
  // 1. On first load, read any saved login from localStorage
  const [loginData, setLoginData] = useState(() => {
    const saved = localStorage.getItem("scm_user");
    return saved ? JSON.parse(saved) : null;
  });

  // 2. Whenever loginData changes, save it (or clear it on logout)
  useEffect(() => {
    if (loginData) localStorage.setItem("scm_user", JSON.stringify(loginData));
    else localStorage.removeItem("scm_user");
  }, [loginData]);

  const handleLogout = () => setLoginData(null);  

  return (
    <SessionProvider>
    <HashRouter>
    {/* Single global toast container, standard color scheme
          (green = success, red = error, orange = warning, blue = info).
          Every page just calls toast.success/error/warn/info — no
          per-page <ToastContainer /> needed anymore. */}
      <ToastContainer position="top-right" autoClose={3000} theme="colored" />

      <Routes>
        <Route path="/login" element={<Login onLogin={setLoginData} />} />
        <Route
          element={
            loginData ? (
              <Layout loginData={loginData} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/health-check" element={<HealthCheck />} />
          <Route path="/device-settings" element={<DeviceSettings />} />
          <Route path="/add-part" element={<AddNewPart loginData={loginData} />} />
          <Route path="/mode-selection" element={<NewSession />}/>
          <Route path="/part-selection" element={<PartSelection />} />
          <Route path="/technical-support" element={<TechnicalSupport />} />
          <Route path="/measurement/:sessionId" element={<MeasurementPage />} />
          <Route path="/counting/:sessionId" element={<CountingPage />} />
          <Route path="/part-details" element={<PartDetails loginData={loginData} />} />
          <Route path="/defect-detection/:sessionId" element={<DefectDetectionPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
    </SessionProvider>
  );
}