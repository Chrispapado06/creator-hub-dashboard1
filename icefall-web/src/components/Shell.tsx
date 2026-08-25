import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useState } from "react";
import { LogOut, Menu, MessageCircle, Mountain, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, GuidePhoto, Wordmark } from "./ui";
import { AuthModal } from "./AuthModal";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/guides", label: "Guides" },
  { to: "/expeditions", label: "Expeditions" },
  { to: "/mountains", label: "Mountains" },
  { to: "/messages", label: "Messages" },
];

/**
 * The desktop chrome.
 *
 * A wide, top-navigation marketplace — not the phone frame. Same tokens, same
 * dark cinematic palette, different geometry: content sits in a centred column,
 * discovery is horizontal, and the primary action is always to browse and book.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-obsidian/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-8 px-6">
          <Link to="/" aria-label="ICEFALL home">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-tile px-3 py-2 text-[13.5px] transition-colors",
                    isActive ? "text-snow" : "text-mist hover:text-snow",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              List with ICEFALL
            </Button>
            <AccountControl />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <Footer />
      <AuthModal />
    </div>
  );
}

/** Signed out: a Sign in button. Signed in: an avatar menu — the Airbnb pill. */
function AccountControl() {
  const { signedIn, session, openAuth, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!signedIn) {
    return (
      <Button variant="secondary" size="sm" onClick={() => openAuth("in")}>
        Sign in
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-pill border border-hairline py-1 pl-3 pr-1 text-mist transition-colors hover:border-hairline-strong hover:text-snow"
      >
        <Menu size={15} strokeWidth={1.7} />
        <GuidePhoto name={session!.name} size={28} />
      </button>

      {open && (
        <>
          <button aria-label="Close menu" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-card border border-hairline bg-elevated shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="border-b border-hairline px-4 py-3">
              <p className="truncate text-[13px] text-snow">{session!.name}</p>
              <p className="truncate text-[11.5px] text-mist-dim">{session!.email}</p>
            </div>
            <MenuLink icon={MessageCircle} label="Messages" />
            <MenuLink icon={Mountain} label="Your trips" />
            <MenuLink icon={UserRound} label="Account" />
            <button
              onClick={() => {
                signOut();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 border-t border-hairline px-4 py-2.5 text-left text-[13px] text-mist transition-colors hover:bg-white/[0.03] hover:text-snow"
            >
              <LogOut size={15} strokeWidth={1.7} />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ icon: Icon, label }: { icon: typeof Menu; label: string }) {
  return (
    <button className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-mist transition-colors hover:bg-white/[0.03] hover:text-snow">
      <Icon size={15} strokeWidth={1.7} />
      {label}
    </button>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-hairline">
      <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[15rem] text-[12.5px] leading-relaxed text-mist-dim">
            Guided mountaineering, booked with people whose documents we have checked.
          </p>
        </div>
        <FooterCol
          title="Climb"
          links={["Find a guide", "Join an expedition", "Browse mountains", "ICEFALL Private"]}
        />
        <FooterCol title="Work with us" links={["Become a guide", "List your company", "Partner terms"]} />
        <FooterCol title="ICEFALL" links={["How booking works", "Our verification", "Cancellation", "Support"]} />
      </div>
      <div className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[11.5px] text-mist-dim">
          <span>© {new Date().getFullYear()} ICEFALL</span>
          <span>
            A guide's licence is theirs to prove. We check the documents; we do not vouch for the
            mountain.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <p className="section-label">{title}</p>
      <ul className="mt-3.5 space-y-2.5">
        {links.map((l) => (
          <li key={l}>
            <span className="cursor-pointer text-[12.5px] text-mist transition-colors hover:text-snow">
              {l}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Centred content column, the width every marketplace screen shares. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1180px] px-6", className)}>{children}</div>;
}
