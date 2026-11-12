"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { ChatbotProvider } from "@/lib/ChatbotContext";

const AUTH_ROUTES = ["/login", "/signup"];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <ChatbotProvider>
      <Sidebar />
      {/* pt-14 on mobile for the top bar, md:pt-0 + md:ml-56 for desktop sidebar */}
      <div className="min-h-screen bg-[#f7f4ee] pt-14 md:pt-0 md:ml-56">
        {children}
      </div>
    </ChatbotProvider>
  );
}
