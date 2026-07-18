import Image from "next/image";

// lucide-react a retiré les icônes de marque (Instagram/Facebook/LinkedIn) de ses versions
// récentes ; on reprend les tracés SVG exacts du site principal plutôt qu'une dépendance externe.
function InstagramIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function LinkedinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

// Texte de non-affiliation provisoire en attendant la formulation exacte validée (cf. docs/etape-0-mvp-esta.md, section 9).
export function Footer() {
  return (
    <footer className="relative z-50 mt-auto w-full bg-gradient-to-b from-[#14162b] to-[#1a1a2e] pb-8 pt-16 text-white shadow-2xl">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-12 grid grid-cols-1 gap-12 md:grid-cols-3">
          <div>
            <div className="relative mb-4 h-12 w-32">
              <Image src="/logo.png" alt="FENUA SIM" fill className="object-contain" />
            </div>
            <p className="text-sm leading-relaxed text-gray-300">
              FenuaSIM Travel est un service d&apos;assistance indépendant, non affilié à un
              gouvernement. Les frais de service FenuaSIM sont distincts des frais officiels
              perçus par les autorités.
            </p>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-extrabold tracking-wider text-[var(--fenua-violet)] uppercase">
              Liens
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="transition-colors hover:text-fenua-orange hover:underline" href="https://fenuasim.com">
                  FenuaSIM — eSIM voyage
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-fenua-orange hover:underline" href="https://fenuasim.com/mentions-legales">
                  Mentions légales
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-fenua-orange hover:underline" href="https://fenuasim.com/cgu">
                  CGU
                </a>
              </li>
              <li>
                <a className="transition-colors hover:text-fenua-orange hover:underline" href="https://fenuasim.com/confidentialite">
                  Politique de confidentialité
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-extrabold tracking-wider text-[var(--fenua-violet)] uppercase">
              Contact
            </h3>
            <ul className="mb-4 space-y-2 text-sm">
              <li>
                Email :{" "}
                <a className="transition-colors hover:text-fenua-orange hover:underline" href="mailto:contact@fenuasim.com">
                  contact@fenuasim.com
                </a>
              </li>
              <li>Support 24/7</li>
            </ul>
            <div className="mt-2 flex gap-4">
              <a href="https://www.instagram.com/fenuasim/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="transition-colors hover:text-fenua-orange">
                <InstagramIcon />
              </a>
              <a href="https://www.facebook.com/profile.php?id=61574810369620" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="transition-colors hover:text-fenua-orange">
                <FacebookIcon />
              </a>
              <a href="#" aria-label="LinkedIn" className="transition-colors hover:text-fenua-orange">
                <LinkedinIcon />
              </a>
            </div>
          </div>
        </div>
        <div className="mb-8 border-t border-gray-700" />
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-sm text-gray-400">© {new Date().getFullYear()} FENUA SIM. Tous droits réservés.</div>
        </div>
      </div>
    </footer>
  );
}
