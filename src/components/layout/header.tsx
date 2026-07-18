import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header
      className="w-full sticky top-0 z-50 border-b border-gray-100"
      style={{
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(12px)",
      }}
    >
      <nav className="mx-auto flex h-[60px] max-w-5xl items-center justify-between px-4">
        <a href="https://fenuasim.com" className="flex flex-shrink-0 items-center" style={{ height: 56 }}>
          <Image
            src="/logo.png"
            alt="FENUA SIM"
            width={100}
            height={100}
            style={{ transform: "scale(1.3)", objectFit: "contain" }}
            priority
          />
        </a>
        <span
          className="hidden text-sm font-semibold sm:block"
          style={{ color: "#4B5563" }}
        >
          ESTA — États-Unis
        </span>
        <Link
          href="/"
          className="flex-shrink-0 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          Ma demande ESTA
        </Link>
      </nav>
    </header>
  );
}
