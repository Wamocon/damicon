import { LkwLader } from "@/components/site/lkw-lader";

// VORUEBERGEHEND. Nur zum Ansehen der Ladeanimation, gehoert nicht in den
// Commit: Ordner src/app/[locale]/lkw-vorschau danach loeschen.
export default function LkwVorschau() {
  return (
    <main className="min-h-svh bg-background px-6 py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">Vorschau</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Ladebild &bdquo;Kuehl-LKW&ldquo;</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Voruebergehende Seite. Fahrbahn 0,9 s je Strichperiode, Rad 1,7 s je Umdrehung,
            Federung 1,05 s. Unter <code className="font-mono text-xs">prefers-reduced-motion: reduce</code>{" "}
            steht alles still.
          </p>
        </header>

        <section className="rounded-3xl border border-border bg-card p-8">
          <p className="mb-6 text-sm font-bold text-card-foreground">Helles Schema, Normalgroesse</p>
          <div className="flex justify-center">
            <LkwLader />
          </div>
        </section>

        <section className="dark rounded-3xl bg-background p-8 ring-1 ring-white/10">
          <p className="mb-6 text-sm font-bold text-foreground">Dunkles Schema</p>
          <div className="flex justify-center">
            <LkwLader />
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8">
          <p className="mb-6 text-sm font-bold text-card-foreground">Klein (160) und gross (460)</p>
          <div className="flex flex-wrap items-end justify-center gap-10">
            <LkwLader groesse={160} />
            <LkwLader groesse={460} />
          </div>
        </section>

        {/* Uebergeht den globalen Notausschalter aus globals.css. Der greift auf
            '*' und hat damit Spezifitaet 0; zwei Klassen hier schlagen ihn, obwohl
            beide !important tragen. Nur zum Ansehen - so etwas gehoert nicht in
            die Anwendung. */}
        <style
          dangerouslySetInnerHTML={{
            __html: [
              '.erzwingen [class*="lkw-strasse"]{animation:lkw-strasse .9s linear infinite!important}',
              '.erzwingen [class*="lkw-federung"]{animation:lkw-federung 1.05s ease-in-out infinite!important}',
              '.erzwingen [class*="lkw-rad"]{animation:lkw-rad 1.7s linear infinite!important}',
            ].join(""),
          }}
        />
        <section className="erzwingen rounded-3xl border-2 border-primary bg-card p-8">
          <p className="mb-2 text-sm font-bold text-card-foreground">
            Erzwungen, ohne Ruecksicht auf reduzierte Bewegung
          </p>
          <p className="mb-6 text-xs leading-5 text-muted-foreground">
            Wenn sich hier etwas bewegt und in den Bloecken darueber nicht, steht Ihr System
            auf reduzierter Bewegung. Dann ist die Animation nicht kaputt, sondern abgeschaltet.
          </p>
          <div className="flex justify-center">
            <LkwLader groesse={360} />
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8">
          <p className="mb-6 text-sm font-bold text-card-foreground">So sieht der Ladescreen aus</p>
          <div className="flex flex-col items-center justify-center gap-8 rounded-2xl bg-background py-16">
            <LkwLader />
            <p className="text-sm font-bold tracking-wide text-muted-foreground">Die Seite wird geladen</p>
          </div>
        </section>
      </div>
    </main>
  );
}
