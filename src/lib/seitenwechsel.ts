import { bewegungReduziert } from "@/lib/bewegung";

// Weiche Ueberblendung bei einem Seitenwechsel ueber die View Transitions API
// des Browsers. Genutzt beim Sprachwechsel und beim Sprung ins Portal.
//
// Warum nicht <ViewTransition> aus React: Mit dem React-Canary von Next 16.2
// hat React beim Sprachwechsel keine View Transition gestartet, auch nicht mit
// experimental.viewTransition - geprueft am 10.09.2026. Dieser Weg haengt
// an keiner experimentellen Schnittstelle: Der Browser haelt das alte Bild
// fest, bis die neue Seite im DOM steht, und blendet dann ueber.
//
// "Steht im DOM" heisst: Nach einer DOM-Aenderung hat sich der Pfad
// geaendert. Next setzt die URL im selben Commit, der die neue Seite
// einhaengt. Laedt die neue Seite laenger als 2,5 Sekunden (langsames Netz),
// endet die Ueberblendung vorher, und die Seite wechselt hart - der Browser
// wuerde sonst nach 4 Sekunden selbst abbrechen.
//
// Browser ohne View Transitions und reduzierte Bewegung: direkter Wechsel.
export function mitUeberblendung(navigieren: () => void) {
  if (typeof document.startViewTransition !== "function" || bewegungReduziert()) {
    navigieren();
    return;
  }

  const vorher = location.pathname;
  document.startViewTransition(
    () =>
      new Promise<void>((fertig) => {
        const beobachter = new MutationObserver(() => {
          if (location.pathname !== vorher) ende();
        });
        const notbremse = window.setTimeout(ende, 2500);
        function ende() {
          beobachter.disconnect();
          window.clearTimeout(notbremse);
          fertig();
        }
        beobachter.observe(document.body, { childList: true, subtree: true });
        navigieren();
      }),
  );
}
