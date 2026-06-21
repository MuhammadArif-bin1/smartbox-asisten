import { redirect } from "next/navigation";

export default function DevicesRedirect() {
  redirect("/admin/dashboard/devices");
}
