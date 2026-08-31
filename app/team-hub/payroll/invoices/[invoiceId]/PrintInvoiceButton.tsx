"use client";

export function PrintInvoiceButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[#341F60] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(40,21,79,0.16)] transition hover:bg-[#28154F] print:hidden"
    >
      Print / save PDF
    </button>
  );
}
