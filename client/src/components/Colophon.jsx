export default function Colophon() {
  return (
    <div className="colophon-grid">
      <div className="colophon-cell">
        <span className="colophon-head">Colophon</span>
        © {new Date().getFullYear()} Khush
        <br />
        Design + code: Khush
      </div>
      <div className="colophon-cell">
        <span className="colophon-head">Type</span>
        Helvetica Neue
        <br />
        IBM Plex Mono
      </div>
      <div className="colophon-cell">
        <span className="colophon-head">Outil</span>
        React / Vite
        <br />
        Express / Prisma
      </div>
      <div className="colophon-cell">
        <span className="colophon-head">Hébergement</span>
        Vercel
        <br />
        Neon Postgres
      </div>
      <div className="colophon-cell">
        <span className="colophon-head">Clerk on duty</span>
        Augustus "Gus"
        <br />
        Filing dept., desk 01
      </div>
    </div>
  );
}
