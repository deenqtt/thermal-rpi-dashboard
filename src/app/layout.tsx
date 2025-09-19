import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Thermal RPi Dashboard",
  description: "Real-time thermal monitoring dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SidebarProvider>
          <AppSidebar />
          <main className="flex-1 flex flex-col min-h-screen">
            {/* Header */}
            <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center px-4">
                <SidebarTrigger className="-ml-1" />
                <div className="flex-1 flex items-center justify-between ml-4">
                  <div>
                    <h1 className="text-lg font-semibold">
                      Thermal RPi Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Real-time thermal monitoring
                    </p>
                  </div>

                  {/* Status indicators */}
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-muted-foreground">
                        System Online
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 p-4 lg:p-8">{children}</div>
          </main>
        </SidebarProvider>
      </body>
    </html>
  );
}
