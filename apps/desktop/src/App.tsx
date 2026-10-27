import { createHashRouter, Link, RouterProvider } from "react-router-dom";
import { AppLayout } from "./app/layout";
import { JudgmentsPage } from "./features/companies/judgments-page";
import { CompaniesPage, CompanyDetailPage } from "./features/companies/page";
import { HomePage } from "./features/home/page";
import { ValuationPage } from "./features/valuation/page";
import "./App.css";

const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "companies", element: <CompaniesPage /> },
      { path: "companies/:id", element: <CompanyDetailPage /> },
      {
        path: "companies/:id/materials",
        lazy: async () => ({
          Component: (await import("./features/companies/materials-page"))
            .MaterialsPage,
        }),
      },
      { path: "companies/:id/judgments", element: <JudgmentsPage /> },
      {
        path: "companies/:id/finance",
        lazy: async () => ({
          Component: (await import("./features/companies/finance-page"))
            .FinancePage,
        }),
      },
      {
        path: "dashboard",
        lazy: async () => ({
          Component: (await import("./features/companies/dashboard-page"))
            .DashboardPage,
        }),
      },
      { path: "valuation", element: <ValuationPage /> },
      {
        path: "*",
        element: (
          <section>
            <h1>页面不存在</h1>
            <Link to="/">返回工作台</Link>
          </section>
        ),
      },
    ],
  },
]);
export default function App() {
  return <RouterProvider router={router} />;
}
