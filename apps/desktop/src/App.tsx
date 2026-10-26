import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { AppLayout } from "./app/layout";
import { MaterialsPage } from "./features/companies/materials-page";
import { CompaniesPage, CompanyDetailPage } from "./features/companies/page";
import { HomePage } from "./features/home/page";
import { ValuationPage } from "./features/valuation/page";
import "./App.css";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/:id" element={<CompanyDetailPage />} />
          <Route path="companies/:id/materials" element={<MaterialsPage />} />
          <Route path="valuation" element={<ValuationPage />} />
          <Route
            path="*"
            element={
              <section>
                <h1>页面不存在</h1>
                <Link to="/">返回工作台</Link>
              </section>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}
