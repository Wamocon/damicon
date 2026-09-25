"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Ob gerade ein Blatt der unteren Leiste offen ist - und was das fuer den Rest
// der Seite bedeutet.
//
// Die Blaetter auf dem Handy (untere-leiste.tsx) sind keine vollstaendigen
// Modale mehr: die Leiste darunter bleibt bedienbar, deshalb traegt ui/sheet.tsx
// dort kein aria-modal. Ohne Ersatz waere damit alles hinter der Blende fuer
// eine Vorlesehilfe wieder vorhanden, obwohl es abgedunkelt und mit dem Finger
// nicht erreichbar ist - man koennte sich durch eine Seite lesen, die man nicht
// bedienen kann.
//
// Den Ersatz liefert `inert` auf der Spalte aus Kopfzeile und Hauptbereich. Der
// Zustand dafuer liegt in der unteren Leiste, das betroffene Element im Layout
// daneben, also braucht es diesen Umweg. Die Seitenleiste steht bewusst
// ausserhalb: sie traegt unter md ein `hidden`, ist damit ohnehin aus dem
// Baum, und die Leiste selbst muss erreichbar bleiben.

interface BlattWert {
  offen: boolean;
  setOffen: (offen: boolean) => void;
}

const BlattKontext = createContext<BlattWert | null>(null);

export function BlattProvider({ children }: { children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  const wert = useMemo(() => ({ offen, setOffen }), [offen]);
  return <BlattKontext.Provider value={wert}>{children}</BlattKontext.Provider>;
}

export function useBlatt(): BlattWert {
  const wert = useContext(BlattKontext);
  if (!wert) throw new Error("useBlatt ausserhalb von BlattProvider benutzt");
  return wert;
}

/**
 * Die Spalte mit Kopfzeile und Hauptbereich - alles, was ein offenes Blatt
 * abdeckt. Die untere Leiste steht daneben und nicht darin, sonst wuerde sie
 * sich mit stilllegen.
 */
export function HauptSpalte({ children }: { children: ReactNode }) {
  const { offen } = useBlatt();

  return (
    <div
      className="flex min-w-0 flex-1 flex-col"
      inert={offen ? true : undefined}
    >
      {children}
    </div>
  );
}
