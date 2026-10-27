import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "工作台", end: true },
  { to: "/companies", label: "公司研究", end: false },
  { to: "/dashboard", label: "指标看板", end: false },
  { to: "/valuation", label: "估值工具", end: false },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">价投小角落</p>
        <p className="muted">桌面端 · 基础版本</p>
        <nav aria-label="桌面端导航">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">理性思考，长期成长。</p>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
