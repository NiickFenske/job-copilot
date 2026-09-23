export const metadata = { title: "Job Copilot" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0d1117", color: "#e6edf3" }}>
        {children}
      </body>
    </html>
  );
}