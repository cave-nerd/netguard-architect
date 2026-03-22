import {
  Activity,
  BarChart3,
  Layers,
  ScrollText,
  Settings,
  Shield,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { AppView } from "../types";

interface SidebarProps {
  view: AppView;
  setView: (v: AppView) => void;
  theme: "light" | "dark" | "system";
  cycleTheme: () => void;
  pendingCount: number;
}

const NAV = [
  { id: "dashboard" as AppView, label: "Overview", icon: BarChart3 },
  { id: "capture" as AppView, label: "Scan & Ingest", icon: Activity },
  { id: "staging" as AppView, label: "Staging", icon: Layers },
  { id: "logs" as AppView, label: "Logs", icon: ScrollText },
  { id: "settings" as AppView, label: "Settings", icon: Settings },
];

function ThemeIcon({ theme }: { theme: string }) {
  if (theme === "dark") return <Moon size={16} />;
  if (theme === "light") return <Sun size={16} />;
  return <Monitor size={16} />;
}

export default function Sidebar({
  view,
  setView,
  theme,
  cycleTheme,
  pendingCount,
}: SidebarProps) {
  return (
    <aside className="flex flex-col w-56 shrink-0 bg-surface-800 border-r border-surface-600 h-screen select-none">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-surface-600">
        <Shield size={22} className="text-brand-400" />
        <span className="font-semibold text-sm text-white tracking-wide">
          NetGuard
          <span className="text-brand-400"> Architect</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                active
                  ? "bg-brand-600/20 text-brand-300 border border-brand-600/30"
                  : "text-gray-400 hover:text-gray-100 hover:bg-surface-700"
              }`}
            >
              <Icon size={16} />
              {label}
              {id === "staging" && pendingCount > 0 && (
                <span className="ml-auto bg-brand-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div className="p-3 border-t border-surface-600">
        <button
          onClick={cycleTheme}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-surface-700 transition-colors w-full"
        >
          <ThemeIcon theme={theme} />
          <span className="capitalize">{theme} theme</span>
        </button>
      </div>
    </aside>
  );
}
