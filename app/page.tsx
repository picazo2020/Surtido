"use client";
import dynamic from "next/dynamic";

// Forzamos a Next.js a ignorar el servidor para este componente específico
const PdfSorter = dynamic(() => import("./PdfSorterComponent"), {
  ssr: false,
});

export default function Home() {
  return <PdfSorter />;
}
