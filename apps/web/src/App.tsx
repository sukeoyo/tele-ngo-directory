import { Route, Routes } from "react-router-dom";
import { Masthead } from "./components/Masthead.js";
import { DirectoryPage } from "./pages/DirectoryPage.js";
import { NgoPage } from "./pages/NgoPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { SignInPage } from "./pages/SignInPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";

export function App() {
  return (
    <>
      <Masthead />
      <Routes>
        <Route path="/" element={<DirectoryPage />} />
        <Route path="/ngo/:id" element={<NgoPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <footer className="footer">
        <div className="inner">
          <span>Tele-Upchaar NGO Directory</span>
          <span>Verified against PAN records. Contact details are shared only between verified organisations.</span>
        </div>
      </footer>
    </>
  );
}
