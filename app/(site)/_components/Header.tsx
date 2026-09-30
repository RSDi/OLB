"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import logo from "../_images/logo-wordmark.png";
import { ArrowIcon, FacebookIcon, InstagramIcon, PersonIcon } from "./icons";
import { FACEBOOK_URL, INSTAGRAM_URL, NAV, isFolder, type NavLink } from "./links";
import styles from "./site.module.css";
import { cx } from "./util";

// The Squarespace header: logo left, navigation with hover folders, social
// icons and a Contact Us button, plus a member Log In button beside it. Below
// 800px it becomes a burger that opens a full-screen menu where folders slide
// in as their own panel, and Log In shrinks to an icon in the top-right corner.
export function Header() {
  const pathname = usePathname();
  const login = useLogin();
  const [menuOpen, setMenuOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setFolder(null);
  };

  // While the menu is open, keep the page behind it still and let Escape close it.
  useEffect(() => {
    if (!menuOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setFolder(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const isActive = (link: NavLink) => !link.external && pathname === link.href;

  return (
    <header className={cx(styles.header, menuOpen && styles.headerOpen)}>
      <a href="#page" className={styles.skipLink}>
        Skip to Content
      </a>
      <div className={styles.headerBackground} />
      <div className={styles.headerInner}>
        <button
          type="button"
          className={styles.burger}
          aria-label={menuOpen ? "Close Menu" : "Open Menu"}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        >
          <span className={styles.burgerBox}>
            <span className={styles.burgerLine} />
            <span className={styles.burgerLine} />
          </span>
        </button>

        <Link href="/" className={styles.logoLink} onClick={closeMenu}>
          <Image
            src={logo}
            alt="Omaha Lightning Basketball"
            sizes="(max-width: 767px) 188px, 410px"
            loading="eager"
            fetchPriority="high"
            className={styles.logo}
          />
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map((item) =>
            isFolder(item) ? (
              <div key={item.label} className={styles.navItem}>
                <button type="button" className={styles.navLink}>
                  <span className={cx(item.children.some(isActive) && styles.active)}>{item.label}</span>
                </button>
                <div className={styles.dropdown}>
                  {item.children.map((child) => (
                    <div key={child.href} className={styles.dropdownItem}>
                      <NavAnchor link={child} className={cx(styles.navLink, isActive(child) && styles.active)} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div key={item.href} className={styles.navItem}>
                <NavAnchor link={item} className={cx(styles.navLink, isActive(item) && styles.active)} />
              </div>
            ),
          )}
        </nav>

        <div className={styles.headerActions}>
          <SocialLinks className={styles.headerSocial} />
          <Link href={login.href} className={cx(styles.button, styles.headerLogin)}>
            <PersonIcon />
            <span className={styles.headerLoginText}>{login.label}</span>
          </Link>
          <Link href="/contact" className={cx(styles.button, styles.headerCta)}>
            Contact Us
          </Link>
        </div>

        <Link href={login.href} className={styles.headerLoginIcon} aria-label={login.label} onClick={closeMenu}>
          <PersonIcon />
        </Link>
      </div>

      <div id="site-menu" className={styles.menu} inert={!menuOpen}>
        <nav className={styles.menuNav} aria-label="Menu">
          <div
            className={cx(styles.menuPanel, folder ? styles.menuPanelLeft : styles.menuPanelActive)}
            inert={folder !== null}
          >
            <div className={styles.menuList}>
              {NAV.map((item) => (
                <div key={item.label} className={styles.menuItem}>
                  {isFolder(item) ? (
                    <button type="button" className={styles.menuLink} onClick={() => setFolder(item.label)}>
                      {item.label}
                      <ArrowIcon className={styles.menuArrow} />
                    </button>
                  ) : (
                    <NavAnchor link={item} className={styles.menuLink} onClick={closeMenu} />
                  )}
                </div>
              ))}
            </div>
            <SocialLinks className={styles.menuSocial} />
            <div className={styles.menuCtaWrap}>
              <Link href={login.href} className={cx(styles.button, styles.menuLogin)} onClick={closeMenu}>
                {login.label}
              </Link>
              <Link href="/contact" className={cx(styles.button, styles.menuCta)} onClick={closeMenu}>
                Contact Us
              </Link>
            </div>
          </div>
          {NAV.filter(isFolder).map((item) => (
            <div
              key={item.label}
              className={cx(styles.menuPanel, folder === item.label && styles.menuPanelActive)}
              inert={folder !== item.label}
            >
              <div className={styles.menuList}>
                <div className={cx(styles.menuItem, styles.menuBackItem)}>
                  <button type="button" className={cx(styles.menuLink, styles.menuBack)} onClick={() => setFolder(null)}>
                    <ArrowIcon className={styles.menuArrow} />
                    Back
                  </button>
                </div>
                {item.children.map((child) => (
                  <div key={child.href} className={styles.menuItem}>
                    <NavAnchor link={child} className={styles.menuLink} onClick={closeMenu} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </header>
  );
}

// The button always says Login. Members who are already signed in go straight
// to /portal: Supabase keeps the session in a cookie the page can read, so no
// request is needed. The first paint always points at /login (the server can't
// know), and a stale cookie does no harm: /portal sends signed-out visitors to
// /login, and /login sends signed-in members to /portal.
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;
const subscribeNever = () => () => {};

function useLogin() {
  const signedIn = useSyncExternalStore(
    subscribeNever,
    () => SESSION_COOKIE.test(document.cookie),
    () => false,
  );
  return { href: signedIn ? "/portal" : "/login", label: "Login" };
}

function NavAnchor({ link, className, onClick }: { link: NavLink; className: string; onClick?: () => void }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className} onClick={onClick}>
      {link.label}
    </Link>
  );
}

function SocialLinks({ className }: { className: string }) {
  return (
    <div className={className}>
      <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
        <FacebookIcon />
      </a>
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
        <InstagramIcon />
      </a>
    </div>
  );
}
