import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Guard } from "@/components/shell";

export const Route = createFileRoute("/capture")({ component: CaptureLayout });

function CaptureLayout() {
  return (
    <Guard>
      <Outlet />
    </Guard>
  );
}
