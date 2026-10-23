import { notFound } from "next/navigation";

export const revalidate = false;

export function GET() {
  notFound();
}
