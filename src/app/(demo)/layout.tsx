import { DemoProviders } from "@/components/demo-providers";

// The demo shell: no server token, BetterAuth or auth provider, so /demo never
// reaches the backend, whatever session the browser holds (ADR-0003).
export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DemoProviders>{children}</DemoProviders>;
}
